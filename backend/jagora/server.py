"""Jagora's server: accounts, the agent over a WebSocket, voice, files, and page watching.

    uvicorn jagora.server:app --host 0.0.0.0 --port 8000

WebSocket protocol (JSON), matching frontend/src/lib/engine/remote.ts:
  app -> server  {type:"start", task, goal, lang, mode, profile, attachment?, history?}
                 {type:"answer", task, id, value}      {type:"secret", task, id, value}
                 {type:"audio", task, id?, data, lang?} her voice note or live turn (base64 webm/opus)
                 {type:"stop", task}
  server -> app  {type:"task"|"msg"|"update"|"status"|"frame"|"pointer"|"highlight"|"orb"|"speech"|"url"|"account"|"error"}
Everything Jagora says is sent as text (a chat message) and, when speech is set up, as audio after it.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from jagora import auth, speech
from jagora.agent import Agent
from jagora.browser import Browser
from jagora.config import FILES_DIR, INGESTED, PORTALS_DIR, settings
from jagora.db import DB
from jagora.guard import guard

log = logging.getLogger("jagora.server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

YES = re.compile(r"^\s*(yes|yeah|yep|ok(ay)?|sure|go ahead|do it|correct|right|bẹ́ẹ̀ ?ni|bee ?ni|ó dáa|o daa|eh|ee|e ?h?n|"
                 r"i ?ya|toh|haka ne|eeh|ọ́ dị mma|o di mma|ee|make you do am|na so|oya)\b", re.I)
NO = re.compile(r"^\s*(no|nope|don'?t|do not|stop|cancel|wait|rárá|rara|bẹ́ẹ̀ kọ́|a'a|aa|mba|ewo|no o|abeg no)\b", re.I)

db = DB()
SESSIONS: dict[str, "Session"] = {}  # user id -> live session (one per signed-in user)


def _model():
    from jagora.llm import MuseSpark

    return MuseSpark()


# ---- app ------------------------------------------------------------------------------------------------------------

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    if INGESTED:
        log.info("secrets.txt merged into .env: %s", ", ".join(INGESTED))  # names only
    await db.start()
    guard.load_cached()
    tasks = [asyncio.create_task(_lists_daily()), asyncio.create_task(_watch_loop()), asyncio.create_task(_reminder_loop())]
    yield
    for t in tasks:
        t.cancel()
    for s in list(SESSIONS.values()):
        await s.close()
    await db.close()


app = FastAPI(title="Jagora", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins), allow_credentials=False,
                   allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])
if PORTALS_DIR.exists():
    app.mount("/practice", StaticFiles(directory=str(PORTALS_DIR), html=True), name="practice")


async def _lists_daily():
    while True:
        try:
            await guard.refresh()
        except Exception as e:  # noqa: BLE001
            log.warning("blocklist refresh failed: %s", e)
        await asyncio.sleep(86400)


def _user_from(request: Request) -> str | None:
    h = request.headers.get("authorization", "")
    return auth.read_token(h[7:]) if h.lower().startswith("bearer ") else None


@app.get("/health")
async def health():
    return {"ok": True, "speech": speech.enabled(), "model": bool(settings.meta_key), "sessions": len(SESSIONS)}


@app.get("/altcha")
async def altcha():
    return auth.altcha_challenge()


@app.post("/auth/{action}")
async def auth_route(action: str, request: Request):
    body = await request.json()
    if not auth.altcha_verify(str(body.get("altcha", ""))):
        return JSONResponse({"error": "bot", "message": "Please wait a moment and try again."}, status_code=400)
    try:
        if action == "signup":
            out = await auth.signup(db, body.get("email", ""), body.get("password", ""), body.get("code", ""), body.get("name", ""))
        elif action == "signin":
            out = await auth.signin(db, body.get("email", ""), body.get("password", ""), body.get("code", ""))
        else:
            raise HTTPException(404)
    except auth.AuthError as e:
        return JSONResponse({"error": e.code, "message": e.message}, status_code=e.status)
    return out


@app.get("/me")
async def me(request: Request):
    uid = _user_from(request)
    acc = uid and await auth.account(db, uid)
    if not acc:
        raise HTTPException(401)
    return acc


@app.get("/chats")
async def chats(request: Request):
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    return await db.exec("select chat_id, title, updated from chats where user_id=? order by updated desc limit 50", (uid,))


@app.get("/chats/{chat_id}")
async def chat(chat_id: str, request: Request):
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    return await db.history(uid, chat_id, 200)


@app.get("/files/{token}/{name}")
async def files(token: str, name: str):
    if not re.fullmatch(r"[\w-]{10,40}", token) or "/" in name or ".." in name:
        raise HTTPException(404)
    f = FILES_DIR / token / name
    if not f.exists():
        raise HTTPException(404)
    return FileResponse(f, filename=name)


@app.post("/livekit/token")
async def livekit_token(request: Request):
    """A LiveKit room token for live voice (room per user)."""
    uid = _user_from(request)
    if not uid or not settings.livekit_key:
        raise HTTPException(401)
    now = int(time.time())
    claims = {"iss": settings.livekit_key, "sub": uid, "nbf": now, "exp": now + 3600, "name": "Jagora user",
              "video": {"room": f"jagora-{uid[:12]}", "roomJoin": True, "canPublish": True, "canSubscribe": True}}
    return {"url": settings.livekit_url, "token": _jwt(claims, settings.livekit_secret)}


def _jwt(claims: dict, secret: str) -> str:
    def b(x: bytes) -> str:
        return base64.urlsafe_b64encode(x).rstrip(b"=").decode()

    head = b(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b(json.dumps(claims).encode())
    sig = b(hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


# ---- the live session -----------------------------------------------------------------------------------------------

def mid() -> str:
    return uuid.uuid4().hex[:10]


class Run:
    def __init__(self, task_id: str) -> None:
        self.task_id = task_id
        self.job: asyncio.Task | None = None
        self.waiting: dict[str, tuple[str, asyncio.Future]] = {}  # msg id -> (kind, future)
        self.steer: asyncio.Queue = asyncio.Queue()
        self.step_id = ""
        self.plan_id = ""
        self.titled = False
        self.free = asyncio.Event()  # cleared while she has taken over the page
        self.free.set()

    @property
    def busy(self) -> bool:
        return bool(self.job and not self.job.done())


class Session:
    def __init__(self, ws: WebSocket, user_id: str) -> None:
        self.ws, self.user_id = ws, user_id
        self.lang, self.mode, self.profile = "en", "do", {}
        self.device: dict = {}
        self.runs: dict[str, Run] = {}
        self.browser: Browser | None = None
        self.active_task = ""
        self._send_lock = asyncio.Lock()
        self._speech_q: asyncio.Queue = asyncio.Queue()
        self._speaker = asyncio.create_task(self._speak_loop())
        self._last_frame = 0.0

    async def send(self, msg: dict) -> None:
        async with self._send_lock:
            try:
                await self.ws.send_text(json.dumps(msg, ensure_ascii=False))
            except Exception:  # noqa: BLE001
                pass

    async def close(self) -> None:
        for r in self.runs.values():
            if r.busy:
                r.job.cancel()
        self._speaker.cancel()
        if self.browser:
            await self.browser.close()
            self.browser = None

    async def get_browser(self) -> Browser:
        if self.browser is None:
            self.browser = await Browser(self.device).start()
            await self.browser.start_screencast(self._frame)
            await self.send({"type": "viewport", "w": self.browser.viewport["width"], "h": self.browser.viewport["height"],
                             "mobile": self.browser.mobile})
        return self.browser

    def _frame(self, jpeg: str) -> None:
        now = time.monotonic()
        if now - self._last_frame < 0.2 or not self.active_task:
            return
        self._last_frame = now
        asyncio.ensure_future(self.send({"type": "frame", "task": self.active_task, "jpeg": jpeg}))

    # ---- speech: queued so sentences never overlap ----------------------------------------------------------------

    async def _speak_loop(self) -> None:
        while True:
            task, text, lang = await self._speech_q.get()
            try:
                await self.send({"type": "orb", "state": "speaking"})
                async for wav in speech.speak(text, lang):
                    await self.send({"type": "speech", "task": task, "audio": base64.b64encode(wav).decode()})
            except Exception as e:  # noqa: BLE001
                log.warning("speech failed: %s", e)
            if self._speech_q.empty():
                await self.send({"type": "speech_end", "task": task})

    def speak(self, task: str, text: str) -> None:
        if speech.enabled() and text.strip():
            self._speech_q.put_nowait((task, text, self.lang))

    # ---- input from the app --------------------------------------------------------------------------------------

    async def handle(self, ev: dict) -> None:
        kind = ev.get("type")
        task = str(ev.get("task") or "")
        if task:
            self.active_task = task
        if kind == "start":
            self.lang = ev.get("lang") or self.lang
            self.mode = ev.get("mode") or self.mode
            self.profile = {k: v for k, v in (ev.get("profile") or {}).items() if isinstance(v, str)}
            if isinstance(ev.get("device"), dict) and self.browser is None:
                self.device = ev["device"]
            await self.on_words(task, str(ev.get("goal") or ""), ev.get("attachment"), ev.get("history"))
        elif kind in ("answer", "secret"):
            self._resolve(task, str(ev.get("id")), str(ev.get("value") or ""))
        elif kind == "audio":
            await self.on_audio(task, ev)
        elif kind == "input":
            await self.on_input(task, ev)
        elif kind == "takeover":
            await self.on_takeover(task, bool(ev.get("on")))
        elif kind == "stop":
            r = self.runs.get(task)
            if r and r.busy:
                r.job.cancel()
            await self.send({"type": "status", "task": task, "status": "stopped"})
            await self.send({"type": "orb", "state": "idle"})

    # ---- her hands on the live page ----------------------------------------------------------------------------------

    async def on_takeover(self, task: str, on: bool) -> None:
        r = self.runs.setdefault(task, Run(task))
        if on:
            r.free.clear()
            await self.send({"type": "takeover", "task": task, "on": True})
        else:
            r.free.set()
            if r.busy:
                await r.steer.put("(she used the page herself and handed it back; look at the page again before acting)")
            await self.send({"type": "takeover", "task": task, "on": False})

    async def on_input(self, task: str, ev: dict) -> None:
        """A tap, typing, a key or scrolling on the live picture. Allowed when Jagora is not acting: she took over,
        Jagora is waiting for her, or nothing is running. What she types goes to the page only; it is not logged."""
        r = self.runs.get(task)
        if r and r.busy and r.free.is_set() and not r.waiting:
            await self.send({"type": "hint", "task": task, "text": "Tap Take over first, so Jagora waits for you."})
            return
        if not self.browser:
            return
        b = self.browser
        try:
            act = ev.get("action")
            if act == "tap":
                await b.tap(float(ev.get("x", 0)), float(ev.get("y", 0)))
            elif act == "type":
                await b.type_raw(str(ev.get("text", ""))[:500])
            elif act == "key":
                await b.key(str(ev.get("key", "")))
            elif act == "scroll":
                await b.wheel(float(ev.get("dy", 0)))
            elif act == "back":
                await b.back()
        except Exception as e:  # noqa: BLE001
            log.info("input failed: %s", e)
        try:
            await self.send({"type": "url", "task": task, "url": b.pdf.url if b.pdf else b.page.url})
        except Exception:  # noqa: BLE001
            pass

    async def on_audio(self, task: str, ev: dict) -> None:
        lang = ev.get("lang") or self.lang
        msg_id = ev.get("id")
        try:
            audio = base64.b64decode(ev.get("data") or "")
            text = await speech.transcribe(audio, lang)
        except Exception as e:  # noqa: BLE001
            log.warning("transcription failed: %s", e)
            text = ""
        if not text:
            note = {"en": "I didn't catch that. Please say it again.", "pcm": "I no hear am well. Abeg talk am again.",
                    "yo": "Mi ò gbọ́ ọ dáadáa. Ẹ jọ̀ọ́ ẹ tún sọ ọ́.", "ha": "Ban ji ba sosai. Don Allah ka sake fada.",
                    "ig": "Anụghị m nke ọma. Biko kwuo ya ọzọ."}.get(lang, "I didn't catch that.")
            if msg_id:
                await self.send({"type": "update", "task": task, "id": msg_id, "patch": {"text": "", "heard": False}})
            await self.agent_says(task, note)
            await self.send({"type": "orb", "state": "idle"})
            return
        if msg_id:
            await self.send({"type": "update", "task": task, "id": msg_id, "patch": {"text": text}})
        else:
            await self.send({"type": "msg", "task": task, "msg": {"id": mid(), "kind": "user", "text": text, "voice": True}})
        await self.on_words(task, text, None, ev.get("history"))

    async def on_words(self, task: str, text: str, attachment: dict | None, history: list | None) -> None:
        """Whatever she said or typed: an answer to a waiting question, words for the running agent, or a new request."""
        r = self.runs.get(task)
        if r and r.waiting and text:
            # answer the most recent open question with her words
            mid_, (kind, fut) = list(r.waiting.items())[-1]
            if kind == "confirm":
                if YES.search(text) or NO.search(text):
                    self._resolve(task, mid_, "yes" if YES.search(text) and not NO.search(text) else "no")
                    return
            elif kind in ("choice", "handoff"):
                self._resolve(task, mid_, text)
                return
        if r and r.busy:
            await r.steer.put(text)  # she spoke while it works: heard before its next step
            return
        await db.remember(self.user_id, task, "user", text or (attachment or {}).get("name", ""), title=text[:60])
        r = self.runs.setdefault(task, Run(task))
        r.job = asyncio.create_task(self._run(r, text, attachment, history))

    def _resolve(self, task: str, msg_id: str, value: str) -> None:
        r = self.runs.get(task)
        if not r or msg_id not in r.waiting:
            return
        kind, fut = r.waiting.pop(msg_id)
        if not fut.done():
            fut.set_result(value)

    # ---- a run ---------------------------------------------------------------------------------------------------

    async def _run(self, r: Run, goal: str, attachment: dict | None, history: list | None) -> None:
        task = r.task_id
        await self.send({"type": "status", "task": task, "status": "working"})
        await self.send({"type": "orb", "state": "thinking"})
        if settings.require_account:
            if await db.spent_today() >= settings.daily_budget_usd:
                await self.agent_says(task, "Jagora is very busy today. Please try again tomorrow.")
                await self.send({"type": "status", "task": task, "status": "stopped"})
                return
            left = await auth.spend_credit(db, self.user_id, 1)
            if left is None:
                await self.agent_says(task, "You have used today's free requests. They come back tomorrow.")
                await self.send({"type": "status", "task": task, "status": "stopped"})
                return
            await self.send({"type": "account", "credits": left})
        convo = [h for h in (history or []) if isinstance(h, dict) and h.get("text")]
        if not convo:
            convo = await db.history(self.user_id, task, 30)
            convo = convo[:-1]  # the last one is this request
        io = WsIO(self, r)
        try:
            agent = Agent(_model(), self.browser, io, lang=self.lang, mode=self.mode, profile=self.profile,
                          conversation=convo[-14:], attachment=attachment, browser_factory=self.get_browser,
                          steering=r.steer, user_id=self.user_id, on_watch=io.watch,
                          memory=DbMemory(self.user_id, task, self.lang), pause_gate=r.free.wait)
            result = await agent.run(goal)
            await db.add_spend(agent.model.usage.dollars)
            await self.send({"type": "status", "task": task, "status": "done" if result.success else "stopped"})
        except asyncio.CancelledError:
            await self.send({"type": "status", "task": task, "status": "stopped"})
        except Exception as e:  # noqa: BLE001
            log.exception("run failed")
            await self.agent_says(task, "Something went wrong on my side. Please try again." if "META" not in str(e)
                                  else "Jagora's brain is not connected yet.")
            await self.send({"type": "status", "task": task, "status": "stopped"})
        finally:
            await io.close_step()
            await self.send({"type": "highlight", "task": task, "box": None})
            if self._speech_q.empty():
                await self.send({"type": "orb", "state": "idle"})

    async def agent_says(self, task: str, text: str) -> None:
        await self.send({"type": "msg", "task": task, "msg": {"id": mid(), "kind": "agent", "text": text}})
        await db.remember(self.user_id, task, "agent", text)
        self.speak(task, text)


class WsIO:
    """The agent's way to her, through the app."""

    def __init__(self, s: Session, r: Run) -> None:
        self.s, self.r, self.task = s, r, r.task_id

    async def _wait(self, kind: str, msg: dict) -> str:
        fut = asyncio.get_running_loop().create_future()
        self.r.waiting[msg["id"]] = (kind, fut)
        await self.close_step()
        await self.s.send({"type": "msg", "task": self.task, "msg": msg})
        await self.s.send({"type": "status", "task": self.task, "status": "waiting"})
        try:
            return await fut
        finally:
            self.r.waiting.pop(msg["id"], None)
            await self.s.send({"type": "status", "task": self.task, "status": "working"})
            await self.s.send({"type": "orb", "state": "thinking"})

    async def say(self, text: str) -> None:
        if text.strip():
            await self.close_step()
            await self.s.agent_says(self.task, text)

    async def ask(self, question: str, choices: list[str]) -> str:
        self.s.speak(self.task, question)
        await db.remember(self.s.user_id, self.task, "agent", question)
        answer = await self._wait("choice", {"id": mid(), "kind": "choice", "question": question, "choices": choices[:6]})
        await db.remember(self.s.user_id, self.task, "user", answer)
        return answer

    async def confirm(self, question: str, detail: str) -> bool:
        self.s.speak(self.task, question)
        m = {"id": mid(), "kind": "confirm", "question": question, "detail": detail, "status": "waiting"}
        v = await self._wait("confirm", m)
        yes = v.strip().lower() == "yes"
        await self.s.send({"type": "update", "task": self.task, "id": m["id"], "patch": {"status": "yes" if yes else "no"}})
        return yes

    async def point(self, rect: dict | None, text: str) -> str:
        if rect:
            await self.s.send({"type": "highlight", "task": self.task, "box": _box(rect), "tone": "point"})
        self.s.speak(self.task, text)
        m = {"id": mid(), "kind": "handoff", "text": text, "status": "waiting"}
        v = await self._wait("handoff", m)
        await self.s.send({"type": "update", "task": self.task, "id": m["id"], "patch": {"status": "done"}})
        await self.s.send({"type": "highlight", "task": self.task, "box": None})
        return v or "done"

    async def handoff(self, rect: dict | None, text: str) -> str:
        if rect:
            await self.s.send({"type": "highlight", "task": self.task, "box": _box(rect), "tone": "stop"})
        return await self.point(None, text)

    async def ask_private(self, rect: dict | None, label: str, field: str, digits: int | None) -> str:
        if rect:
            await self.s.send({"type": "highlight", "task": self.task, "box": _box(rect), "tone": "stop"})
        self.s.speak(self.task, label)
        m = {"id": mid(), "kind": "secret", "label": label, "field": field, "status": "waiting", **({"digits": digits} if digits else {})}
        value = await self._wait("secret", m)
        await self.s.send({"type": "highlight", "task": self.task, "box": None})
        return value

    async def close_step(self) -> None:
        if self.r.step_id:
            await self.s.send({"type": "update", "task": self.task, "id": self.r.step_id, "patch": {"status": "done"}})
            self.r.step_id = ""

    async def event(self, kind: str, data: dict) -> None:
        s, t = self.s, self.task
        if kind == "page":
            await s.send({"type": "url", "task": t, "url": data.get("url", "")})
        elif kind == "plan":
            if self.r.plan_id:
                await s.send({"type": "update", "task": t, "id": self.r.plan_id, "patch": {"steps": data["steps"]}})
            else:
                self.r.plan_id = mid()
                await s.send({"type": "msg", "task": t, "msg": {"id": self.r.plan_id, "kind": "plan", "steps": data["steps"]}})
        elif kind == "reminder":
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "reminder", **data}})
        elif kind == "moment":
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "moment", **data}})
        elif kind == "step":
            await s.send({"type": "highlight", "task": t, "box": None})
            await self.close_step()
            self.r.step_id = mid()
            await s.send({"type": "msg", "task": t, "msg": {"id": self.r.step_id, "kind": "step", "text": data["text"], "status": "doing"}})
            await s.send({"type": "orb", "state": "thinking"})
        elif kind == "guard":
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "step", "text": data["text"][:1].upper() + data["text"][1:],
                                                             "status": "done", "guard": True}})
        elif kind == "evidence":
            await self.close_step()
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "evidence", **data}})
            await db.remember(s.user_id, t, "agent", f"[evidence from {data.get('site')}] {data.get('claim')}: \"{data.get('quote', '')[:200]}\"")
        elif kind == "doc":
            await self.close_step()
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "doc", "doc": data}})
            await db.remember(s.user_id, t, "agent", f"[document] {data.get('title')}")
        elif kind == "file":
            await self.close_step()
            url = data["url"] if data["url"].startswith("http") else settings.public_url.rstrip("/") + data["url"]
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "file", **data, "url": url}})
            await db.remember(s.user_id, t, "agent", f"[file] {data.get('name')}")
        elif kind == "verdict":
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "verdict", **data}})
        elif kind == "pointer":
            await s.send({"type": "pointer", "task": t, "x": data["x"], "y": data["y"], "visible": True, "clicking": data.get("clicking", False)})
        elif kind == "highlight":
            await s.send({"type": "highlight", "task": t, "box": data.get("box"), "tone": "point"})

    async def watch(self, url: str, what: str, every_hours: int) -> None:
        wid = uuid.uuid4().hex[:12]
        await db.exec("insert into watches (id, user_id, url, what, last_hash, every_min, next_at, lang) values (?,?,?,?,?,?,?,?)",
                      (wid, self.s.user_id, url, what, None, max(60, every_hours * 60), time.time(), self.s.lang))


class DbMemory:
    """Her reminders and saved moments, for the agent."""

    def __init__(self, user_id: str, chat_id: str, lang: str) -> None:
        self.u, self.c, self.lang = user_id, chat_id, lang

    async def add_reminder(self, at: float, text: str, repeat: str) -> str:
        rid = uuid.uuid4().hex[:8]
        await db.add_reminder(rid, self.u, self.c, at, text, repeat, self.lang)
        return rid

    async def reminders(self) -> list[dict]:
        return await db.reminders(self.u)

    async def cancel_reminder(self, rid: str) -> bool:
        return await db.cancel_reminder(self.u, rid)

    async def save_moment(self, title: str, tags: list[str], note: str, url: str) -> str:
        m = uuid.uuid4().hex[:8]
        await db.save_moment(m, self.u, title, tags, note, url, self.c)
        return m

    async def find_moments(self, query: str) -> list[dict]:
        return await db.find_moments(self.u, query)


def _box(rect: dict) -> dict:
    return {"x": rect.get("x", 0), "y": rect.get("y", 0), "w": rect.get("width", rect.get("w", 0)), "h": rect.get("height", rect.get("h", 0))}


# ---- the WebSocket ---------------------------------------------------------------------------------------------------

@app.websocket("/ws")
async def ws_route(ws: WebSocket):
    origin = ws.headers.get("origin", "")
    if settings.allowed_origins and origin and origin not in settings.allowed_origins:
        await ws.close(code=4403)
        return
    token = ws.query_params.get("token", "")
    uid = auth.read_token(token) if token else None
    if settings.require_account and not uid:
        await ws.accept()
        await ws.send_text(json.dumps({"type": "error", "error": "signin", "message": "Please sign in to use Jagora."}))
        await ws.close(code=4401)
        return
    uid = uid or "guest-" + secrets.token_hex(6)
    if len(SESSIONS) >= settings.max_sessions and uid not in SESSIONS:
        await ws.accept()
        await ws.send_text(json.dumps({"type": "error", "error": "busy", "message": "Jagora is busy right now. Try again in a minute."}))
        await ws.close(code=4429)
        return
    await ws.accept()
    old = SESSIONS.pop(uid, None)
    if old:
        await old.close()
    s = Session(ws, uid)
    SESSIONS[uid] = s
    acc = await auth.account(db, uid) if not uid.startswith("guest-") else None
    if acc:
        await s.send({"type": "account", "credits": acc["credits"]})
        # reminders that came due while she was away
        for n in await db.exec("select * from notices where user_id=? and delivered=0 order by t", (uid,)):
            await s.send({"type": "notify", "task": n["chat_id"], "title": n["title"], "text": n["text"], "kind": "reminder"})
            await db.exec("update notices set delivered=1 where id=?", (n["id"],))
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > 12_000_000:
                continue
            try:
                ev = json.loads(raw)
            except ValueError:
                continue
            asyncio.create_task(s.handle(ev))
    except WebSocketDisconnect:
        pass
    finally:
        if SESSIONS.get(uid) is s:
            SESSIONS.pop(uid, None)
        await s.close()


# ---- watching pages for her ------------------------------------------------------------------------------------------

async def _watch_loop():
    import httpx

    while True:
        await asyncio.sleep(300)
        try:
            due = await db.exec("select * from watches where next_at <= ? limit 20", (time.time(),))
        except Exception:  # noqa: BLE001
            continue
        async with httpx.AsyncClient(timeout=30, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 Jagora"}) as c:
            for w in due:
                try:
                    r = await c.get(w["url"])
                    text = re.sub(r"<[^>]+>", " ", r.text)
                    text = re.sub(r"\s+", " ", text)
                    words = [x for x in re.findall(r"\w+", w["what"].lower()) if len(x) > 3]
                    parts = [s for s in re.split(r"(?<=[.!?])\s", text) if any(x in s.lower() for x in words)] or [text[:20000]]
                    h = hashlib.sha256(" ".join(parts).encode()).hexdigest()
                    if w["last_hash"] and h != w["last_hash"]:
                        note = f"The page you asked me to watch has changed ({w['what']}): {w['url']}"
                        chat_id = f"watch-{w['id']}"
                        await db.remember(w["user_id"], chat_id, "agent", note, title=w["what"][:60])
                        s = SESSIONS.get(w["user_id"])
                        if s:
                            await s.send({"type": "notify", "task": chat_id, "title": w["what"][:60], "text": note, "url": w["url"]})
                    await db.exec("update watches set last_hash=?, next_at=? where id=?", (h, time.time() + w["every_min"] * 60, w["id"]))
                except Exception as e:  # noqa: BLE001
                    log.warning("watch %s failed: %s", w.get("id"), e)
                    await db.exec("update watches set next_at=? where id=?", (time.time() + 3600, w["id"]))


# ---- reminders ---------------------------------------------------------------------------------------------------------

REPEAT = {"daily": 86400, "weekly": 7 * 86400}


async def _reminder_loop():
    while True:
        await asyncio.sleep(20)
        await fire_reminders()


async def fire_reminders() -> None:
    try:
        due = await db.exec("select * from reminders where done=0 and at <= ? limit 50", (time.time(),))
    except Exception:  # noqa: BLE001
        return
    if True:
        for r in due:
            try:
                head = {"en": "Reminder", "pcm": "Reminder", "yo": "Ìrántí", "ha": "Tunatarwa", "ig": "Ncheta"}.get(r["lang"], "Reminder")
                text = f"{head}: {r['text']}"
                await db.remember(r["user_id"], r["chat_id"], "agent", text)
                s = SESSIONS.get(r["user_id"])
                if s:
                    await s.send({"type": "notify", "task": r["chat_id"], "title": head, "text": text, "kind": "reminder"})
                    s.speak(r["chat_id"], text)
                else:
                    await db.exec("insert into notices (id, user_id, t, chat_id, title, text, delivered) values (?,?,?,?,?,?,0)",
                                  (uuid.uuid4().hex[:12], r["user_id"], time.time(), r["chat_id"], head, text))
                if r["repeat"] in REPEAT:
                    await db.exec("update reminders set at=? where id=?", (r["at"] + REPEAT[r["repeat"]], r["id"]))
                elif r["repeat"] == "monthly":
                    import datetime as _dt

                    d = _dt.datetime.fromtimestamp(r["at"], _dt.timezone(_dt.timedelta(hours=1)))
                    m = d.month % 12 + 1
                    y = d.year + (d.month == 12)
                    nxt = d.replace(year=y, month=m, day=min(d.day, 28))
                    await db.exec("update reminders set at=? where id=?", (nxt.timestamp(), r["id"]))
                else:
                    await db.exec("update reminders set done=1 where id=?", (r["id"],))
            except Exception as e:  # noqa: BLE001
                log.warning("reminder %s failed: %s", r.get("id"), e)
