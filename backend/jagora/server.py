"""Jagora's server: accounts, the agent over a WebSocket, voice, files, and page watching.

    uvicorn jagora.server:app --host 0.0.0.0 --port 8000

WebSocket protocol (JSON), matching frontend/src/lib/engine/remote.ts:
  app -> server  {type:"start", task, goal, lang, mode, profile, attachment?, history?}
                 {type:"answer", task, id, value}      {type:"secret", task, id, value}
                 {type:"audio", task, id?, data, lang?} her voice note or live turn (base64 webm/opus)
                 {type:"stop", task}
  server -> app  {type:"task"|"msg"|"update"|"status"|"frame"|"pointer"|"highlight"|"orb"|"pcm"|"speech_end"|"url"|"account"|"error"}
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
from jagora.guard import guard, registrable
from jagora.push import Push
from jagora.vault import Vault

log = logging.getLogger("jagora.server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # every database call was a log line

YES = re.compile(r"^\s*(yes|yeah|yep|ok(ay)?|sure|go ahead|do it|correct|right|bẹ́ẹ̀ ?ni|bee ?ni|ó dáa|o daa|eh|ee|e ?h?n|"
                 r"i ?ya|toh|haka ne|eeh|ọ́ dị mma|o di mma|ee|make you do am|na so|oya)\b", re.I)
NO = re.compile(r"^\s*(no|nope|don'?t|do not|stop|cancel|wait|rárá|rara|bẹ́ẹ̀ kọ́|a'a|aa|mba|ewo|no o|abeg no)\b", re.I)

db = DB()
push = Push(db)
SESSIONS: dict[str, "Session"] = {}  # user id -> live session (one per signed-in user)


def _muse_extras(model) -> dict:
    """Muse Wonder for her photos and PDFs, Muse Image for picture guides, open weights for the safety checks."""
    from jagora.llm import MuseSpark

    if not isinstance(model, MuseSpark):
        return {}
    from jagora import muse

    out: dict = {"images": muse.Images()}
    try:
        out["wonder"] = MuseSpark(settings.wonder_model)
    except Exception:  # noqa: BLE001
        pass
    side = muse.open_model()
    if side:
        out["side_model"] = side
    return out


def _model():
    import os

    if os.environ.get("JAGORA_DEV_MODEL") == "1" and not settings.meta_key:
        from jagora.dev_model import DevModel

        return DevModel()
    from jagora.llm import MuseSpark

    return MuseSpark()


# ---- app ------------------------------------------------------------------------------------------------------------

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    if INGESTED:
        log.info("secrets.txt merged into .env: %s", ", ".join(INGESTED))  # names only
    await db.start()
    try:
        await push.start()
    except Exception as e:  # noqa: BLE001
        log.warning("push not started: %s", e)
    guard.load_cached()
    tasks = [asyncio.create_task(_lists_daily()), asyncio.create_task(_watch_loop()), asyncio.create_task(_reminder_loop()),
             asyncio.create_task(_job_loop())]
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
    u = out.get("user", {})
    await db.log(u.get("id", ""), action, u.get("email", ""))
    if action == "signup":
        await alert(None, "signup", f"{u.get('email', '')} ({u.get('plan', '')})", user=u)
    return out


@app.get("/me")
async def me(request: Request):
    uid = _user_from(request)
    acc = uid and await auth.account(db, uid)
    if not acc:
        raise HTTPException(401)
    return acc


@app.get("/push/key")
async def push_key():
    return {"key": push.public}


@app.post("/push/subscribe")
async def push_subscribe(request: Request):
    uid = _user_from(request)
    if not uid or uid.startswith("~"):
        raise HTTPException(401)
    body = await request.json()
    if not await push.subscribe(uid, body.get("subscription") or {}):
        raise HTTPException(400, "bad subscription")
    await db.log(uid, "push", "notifications on")
    return {"ok": True}


@app.post("/push/unsubscribe")
async def push_unsubscribe(request: Request):
    if not _user_from(request):
        raise HTTPException(401)
    await push.unsubscribe(str((await request.json()).get("endpoint", "")))
    return {"ok": True}


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
        self.files: dict[str, str] = {}  # files she gave in the chat, kept for this session only
        self.translate = False
        self.runs: dict[str, Run] = {}
        self.browser: Browser | None = None
        self.active_task = ""
        self.since = time.time()
        self.who: dict = {}  # email, name, plan, code label: for the admin page
        self.doing = ""  # the request being worked on now
        self._send_lock = asyncio.Lock()
        self._speech_q: asyncio.Queue = asyncio.Queue()
        self._gen = 0  # speech generation: a hush makes everything older silent
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
            self.browser.translate_to = self.lang if self.translate and self.lang != "en" else ""
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
        """Her phone plays the PCM as it arrives. `hush` (she starts talking, or taps) bumps the generation, so the
        sentence being spoken stops at once and nothing queued is said."""
        while True:
            task, text, lang, gen = await self._speech_q.get()
            if gen != self._gen:
                continue
            try:
                await self.send({"type": "orb", "state": "speaking"})
                utt = mid()
                async for i, rate, pcm in speech.speak_stream(text, lang):
                    if gen != self._gen:
                        break
                    await self.send({"type": "pcm", "task": task, "utt": utt, "n": i, "rate": rate, "data": base64.b64encode(pcm).decode()})
            except Exception as e:  # noqa: BLE001
                log.warning("speech failed: %s", e)
            if self._speech_q.empty() and gen == self._gen:
                await self.send({"type": "speech_end", "task": task})

    def hush(self) -> None:
        self._gen += 1
        while not self._speech_q.empty():
            self._speech_q.get_nowait()

    def speak(self, task: str, text: str) -> None:
        if speech.enabled() and text.strip():
            self._speech_q.put_nowait((task, text, self.lang, self._gen))

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
            if "translate" in ev:
                self.translate = bool(ev.get("translate"))
                if self.browser:
                    await self.browser.set_translate(self.lang if self.translate else "")
            self.keep_file(ev.get("attachment"))
            await self.on_words(task, str(ev.get("goal") or ""), ev.get("attachment"), ev.get("history"))
        elif kind == "answer":
            v = ev.get("value")
            self._resolve(task, str(ev.get("id")), v if isinstance(v, dict) else str(v or ""))
        elif kind == "secret":
            # straight to the waiting box; never logged. "save" asks to keep it, encrypted, for this one site
            self._resolve(task, str(ev.get("id")), {"value": str(ev.get("value") or ""), "save": bool(ev.get("save"))})
        elif kind == "translate":
            self.translate = bool(ev.get("on"))
            if self.browser:
                await self.browser.set_translate(self.lang if self.translate else "")
        elif kind == "audio":
            self.hush()  # she is talking: Jagora stops
            await self.on_audio(task, ev)
        elif kind == "pictures":
            asyncio.create_task(self.pictures_for(task, str(ev.get("text") or "")[:2500]))
        elif kind == "hush":
            self.hush()
            await self.send({"type": "speech_end", "task": task})
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

    def keep_file(self, att: dict | None) -> None:
        """A photo or document she attached: kept on the server for this session, so Jagora can upload it to a form."""
        if not att or not str(att.get("data", "")).startswith("data:"):
            return
        try:
            head, b64 = att["data"].split(",", 1)
            raw = base64.b64decode(b64)
            if len(raw) > 15 * 1024 * 1024:
                return
            name = re.sub(r"[^\w.\- ]+", "", str(att.get("name") or "file")).strip()[:80] or "file"
            if "." not in name:
                name += {"image/png": ".png", "image/jpeg": ".jpg", "application/pdf": ".pdf"}.get(head[5:].split(";")[0], "")
            folder = FILES_DIR / "uploads" / self.user_id[:24]
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / name
            path.write_bytes(raw)
            self.files[name] = str(path)
        except Exception as e:  # noqa: BLE001
            log.info("attachment not kept: %s", e)

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
            elif kind in ("choice", "handoff", "point"):
                self._resolve(task, mid_, text)
                return
        if r and r.busy:
            await r.steer.put(text)  # she spoke while it works: heard before its next step
            return
        await db.remember(self.user_id, task, "user", text or (attachment or {}).get("name", ""), title=text[:60])
        r = self.runs.setdefault(task, Run(task))
        r.job = asyncio.create_task(self._run(r, text, attachment, history))

    def _resolve(self, task: str, msg_id: str, value) -> None:
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
        admin = self.who.get("plan") == "admin"
        started = time.time()
        self.doing = goal or (attachment or {}).get("name", "")
        await db.log(self.user_id, "task", self.doing)
        await alert(self, "task", self.doing)
        if settings.require_account and not admin:
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
            model = _model()
            agent = Agent(model, self.browser, io, **_muse_extras(model), lang=self.lang, mode=self.mode, profile=self.profile,
                          conversation=convo[-14:], attachment=attachment, browser_factory=self.get_browser,
                          steering=r.steer, user_id=self.user_id, on_watch=io.watch,
                          memory=DbMemory(self.user_id, task, self.lang, self.mode, self.profile), pause_gate=r.free.wait,
                          vault=Vault(db, self.user_id) if not self.user_id.startswith("guest-") else None, files=self.files)
            result = await agent.run(goal)
            await db.add_spend(agent.model.usage.dollars)
            await db.log(self.user_id, "done" if result.success else "stopped",
                         json.dumps({"goal": goal[:200], "secs": round(time.time() - started), "steps": result.steps,
                                     "usd": round(agent.model.usage.dollars, 4), "summary": (result.summary or "")[:300]}))
            await self.send({"type": "status", "task": task, "status": "done" if result.success else "stopped"})
        except asyncio.CancelledError:
            await self.send({"type": "status", "task": task, "status": "stopped"})
        except Exception as e:  # noqa: BLE001
            log.exception("run failed")
            await db.log(self.user_id, "error", f"{goal[:200]} | {type(e).__name__}: {str(e)[:200]}")
            await self.agent_says(task, "Something went wrong on my side. Please try again." if "META" not in str(e)
                                  else "Jagora's brain is not connected yet.")
            await self.send({"type": "status", "task": task, "status": "stopped"})
        finally:
            self.doing = ""
            await io.close_step()
            await self.send({"type": "highlight", "task": task, "box": None})
            if self._speech_q.empty():
                await self.send({"type": "orb", "state": "idle"})

    async def pictures_for(self, task: str, text: str) -> None:
        """'Show me in pictures' on one of Jagora's answers: Muse Image draws it."""
        model = _model()
        extras = _muse_extras(model)
        if not text or not extras.get("images"):
            return
        r = Run(task)
        io = WsIO(self, r)
        a = Agent(model, None, io, lang=self.lang, **extras)
        await self.send({"type": "orb", "state": "thinking"})
        try:
            result, _, _ = await a._picture_guide({"text": text})
            if result.startswith(("the pictures could not", "could not plan")):
                await self.agent_says(task, {"yo": "Mi ò lè yà á báyìí. Ẹ jọ̀ọ́ ẹ gbìyànjú lẹ́ẹ̀kan sí i.", "ha": "Ban iya zana shi yanzu ba. Sake gwadawa.",
                                             "ig": "Enweghị m ike ise ya ugbu a. Biko nwaa ọzọ.", "pcm": "I no fit draw am now. Try again."}
                                      .get(self.lang, "I couldn't draw it right now. Please try again."))
        finally:
            await io.close_step()
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

    async def ask_point(self, question: str) -> dict:
        """She taps the thing she means on the live page; returns the spot in page pixels (or her words)."""
        self.s.speak(self.task, question)
        m = {"id": mid(), "kind": "pointask", "question": question, "status": "waiting"}
        v = await self._wait("point", m)
        await self.s.send({"type": "update", "task": self.task, "id": m["id"], "patch": {"status": "done"}})
        if isinstance(v, dict) and "x" in v:
            await self.s.send({"type": "highlight", "task": self.task, "box": {"x": v["x"] - 18, "y": v["y"] - 18, "w": 36, "h": 36}, "tone": "point"})
            return {"x": float(v["x"]), "y": float(v["y"])}
        return {"text": str(v)}

    async def ask_private(self, rect: dict | None, label: str, field: str, digits: int | None) -> dict:
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
        elif kind == "terms":
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "terms", **data}})
            await db.remember(s.user_id, t, "agent", f"[terms of {data.get('site')}] {data.get('verdict')}: {data.get('summary')}")
            if data.get("verdict") != "ok":
                s.speak(t, data.get("summary", ""))
        elif kind == "media":
            await self.close_step()
            url = data["url"] if data["url"].startswith("http") else settings.public_url.rstrip("/") + data["url"]
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "media", **data, "url": url}})
        elif kind == "scheduled":
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "scheduled", **data}})
        elif kind == "moment":
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "moment", **data}})
        elif kind == "step":
            await s.send({"type": "highlight", "task": t, "box": None})
            await self.close_step()
            self.r.step_id = mid()
            await s.send({"type": "msg", "task": t, "msg": {"id": self.r.step_id, "kind": "step", "text": data["text"], "status": "doing"}})
            await s.send({"type": "orb", "state": "thinking"})
        elif kind == "record":
            await self.close_step()
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "record", "steps": data.get("steps", [])[-120:],
                                                             "sites": data.get("sites", []), "success": bool(data.get("success"))}})
        elif kind == "scope":
            sites = ", ".join(data.get("sites", []))
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "step", "status": "done", "guard": True,
                                                             "text": f"This task can fill in forms on: {sites}. Other sites are read-only."}})
        elif kind == "guard":
            if data.get("kind") in ("blocked", "injection", "refused", "leak"):
                await db.log(s.user_id, data["kind"], f"{data.get('site', '')}: {data.get('text', '')}"[:300])
            if data.get("kind") in ("blocked", "refused"):
                return  # Jagora says it in words already
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
        elif kind == "reading":
            await self.close_step()
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "reading", **data}})
            await db.remember(s.user_id, t, "agent", f"[read {data.get('kind')} with {data.get('read_by')}] {data.get('summary', '')}")
        elif kind == "pictures":
            await self.close_step()
            base = settings.public_url.rstrip("/")
            panels = [{**p, "url": p["url"] if p["url"].startswith("http") else base + p["url"]} for p in data["panels"]]
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "pictures", "title": data.get("title", ""), "panels": panels}})
            await db.remember(s.user_id, t, "agent", f"[picture guide] {data.get('title', '')}: " + " | ".join(p["caption"] for p in panels))
            for p in panels:
                s.speak(t, p["caption"])
        elif kind == "pointer":
            await s.send({"type": "pointer", "task": t, "x": data["x"], "y": data["y"], "visible": True, "clicking": data.get("clicking", False)})
        elif kind == "highlight":
            await s.send({"type": "highlight", "task": t, "box": data.get("box"), "tone": "point"})

    async def watch(self, url: str, what: str, every_hours: int) -> None:
        wid = uuid.uuid4().hex[:12]
        await db.exec("insert into watches (id, user_id, url, what, last_hash, every_min, next_at, lang) values (?,?,?,?,?,?,?,?)",
                      (wid, self.s.user_id, url, what, None, max(60, every_hours * 60), time.time(), self.s.lang))


class DbMemory:
    """Her reminders, saved moments and scheduled tasks, for the agent."""

    def __init__(self, user_id: str, chat_id: str, lang: str, mode: str = "do", profile: dict | None = None) -> None:
        self.u, self.c, self.lang, self.mode, self.profile = user_id, chat_id, lang, mode, profile or {}

    async def schedule(self, at: float, goal: str, allow: list[str], repeat: str, retry_min: int = 0) -> str:
        jid = uuid.uuid4().hex[:8]
        await db.exec("insert into jobs (id, user_id, chat_id, at, goal, allow, repeat, lang, mode, profile, status, retry_min) "
                      "values (?,?,?,?,?,?,?,?,?,?,'waiting',?)",
                      (jid, self.u, self.c, at, goal, ",".join(allow), repeat, self.lang, self.mode, json.dumps(self.profile),
                       max(0, min(240, retry_min))))
        return jid

    async def terms_get(self, site: str) -> dict | None:
        row = await db.one("select t, data from terms where site=?", (site,))
        if not row or time.time() - row["t"] > 30 * 86400:
            return None
        d = json.loads(row["data"])
        return d if d.get("lang") == self.lang else None  # reviewed in another language: read again in hers

    async def terms_put(self, rv: dict) -> None:
        await db.exec("insert into terms (site, t, data) values (?,?,?) on conflict(site) do update set t=excluded.t, data=excluded.data",
                      (rv["site"], time.time(), json.dumps(rv, ensure_ascii=False)))

    async def skills_get(self, site: str) -> list[dict]:
        """How this site was done before (shared by everyone: only steps and page words, never anyone's values)."""
        rows = await db.exec("select goal, steps, uses from skills where site=? order by uses desc, t desc limit 3", (site,))
        return [{"goal": r["goal"], "steps": json.loads(r["steps"]), "uses": r["uses"]} for r in rows]

    async def skills_put(self, site: str, goal: str, steps: list[str]) -> None:
        key = re.sub(r"[^a-z0-9]+", " ", goal.lower()).strip()[:60]
        await db.exec("insert into skills (site, goal_key, goal, steps, t, uses) values (?,?,?,?,?,1) on conflict(site, goal_key) "
                      "do update set steps=excluded.steps, t=excluded.t, uses=skills.uses+1", (site, key, goal, json.dumps(steps, ensure_ascii=False), time.time()))

    async def remember_fact(self, fact: str) -> None:
        await db.exec("insert into facts (id, user_id, t, fact) values (?,?,?,?)", (uuid.uuid4().hex[:10], self.u, time.time(), fact))

    async def facts(self) -> list[str]:
        return [r["fact"] for r in await db.exec("select fact from facts where user_id=? order by t desc limit 25", (self.u,))]

    async def jobs(self) -> list[dict]:
        return await db.exec("select id, at, goal, repeat from jobs where user_id=? and status='waiting' order by at", (self.u,))

    async def cancel_job(self, jid: str) -> bool:
        row = await db.one("select id from jobs where user_id=? and id=? and status='waiting'", (self.u, jid))
        if row:
            await db.exec("update jobs set status='cancelled' where id=?", (jid,))
        return bool(row)

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


# ---- the owner's monitoring page ---------------------------------------------------------------------------------------
# Who is on Jagora right now, what each person asked, whether it worked, and which access code they came with, so
# the owner knows when the judges are testing. Opened with the ADMIN_CODE; never shows passwords, vault values or codes.

ADMIN = "~admin"


async def alert(s: "Session | None", kind: str, text: str, user: dict | None = None) -> None:
    """Optional ping to the owner (ALERT_WEBHOOK: Discord, Slack or any JSON webhook) when someone signs up or
    starts a task. The owner's own use is not announced."""
    who = (s.who if s else user) or {}
    if not settings.alert_webhook or who.get("plan") == "admin":
        return
    label = who.get("code") or ("code" if who.get("plan") == "code" else "free")
    line = f"Jagora: {who.get('name') or who.get('email', 'someone')} [{label}] " + ("signed up" if kind == "signup" else f"asked: {text[:300]}")

    async def send():
        import httpx

        with contextlib.suppress(Exception):
            async with httpx.AsyncClient(timeout=8) as c:
                await c.post(settings.alert_webhook, json={"content": line, "text": line})

    asyncio.create_task(send())


def _admin(request: Request) -> None:
    if _user_from(request) != ADMIN:
        raise HTTPException(401, "admin only")


_admin_fails: dict[str, list[float]] = {}


@app.post("/admin/login")
async def admin_login(request: Request):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "").split(",")[0].strip()
    now = time.time()
    fails = [t for t in _admin_fails.get(ip, []) if now - t < 900]
    if len(fails) >= 5:
        return JSONResponse({"error": "wait", "message": "Too many tries. Wait 15 minutes."}, status_code=429)
    body = await request.json()
    if not auth.is_admin_code(str(body.get("code", ""))):
        _admin_fails[ip] = fails + [now]
        await asyncio.sleep(1)
        return JSONResponse({"error": "code", "message": "That is not the admin code."}, status_code=401)
    _admin_fails.pop(ip, None)
    return {"token": auth.make_token(ADMIN)}


@app.get("/admin/overview")
async def admin_overview(request: Request):
    _admin(request)
    day = time.time() - 86400
    users = await db.exec("select id, email, name, plan, code, created, last_seen, credits from users order by created desc limit 500")
    counts = {r["user_id"]: r for r in await db.exec(
        "select user_id, sum(case when kind='task' then 1 else 0 end) as tasks, "
        "sum(case when kind='done' then 1 else 0 end) as done, sum(case when kind in ('blocked','refused') and t > ? then 1 else 0 end) as flags, "
        "max(t) as last from events group by user_id", (time.time() - 86400,))}
    names = {u["id"]: u for u in users}
    for u in users:
        c = counts.get(u["id"]) or {}
        u["tasks"], u["done"], u["last_event"] = int(c.get("tasks") or 0), int(c.get("done") or 0), c.get("last") or 0
        u["flags"] = int(c.get("flags") or 0)  # blocked sites and refused requests in the last day
        u["online"] = u["id"] in SESSIONS
    events = await db.exec("select t, user_id, kind, detail from events order by t desc limit 200")
    for e in events:
        u = names.get(e["user_id"]) or {}
        e["who"] = u.get("name") or u.get("email") or ("guest" if e["user_id"].startswith("guest-") else e["user_id"][:8])
        e["code"] = u.get("code", "")
    live = [{"user_id": uid, "who": s.who.get("name") or s.who.get("email") or "guest", "email": s.who.get("email", ""),
             "code": s.who.get("code", ""), "plan": s.who.get("plan", ""), "since": s.since, "doing": s.doing,
             "device": "phone" if (s.device or {}).get("mobile") else "computer"} for uid, s in SESSIONS.items()]
    today = await db.one("select sum(case when kind='task' then 1 else 0 end) as tasks, "
                         "sum(case when kind='done' then 1 else 0 end) as done, count(distinct user_id) as people "
                         "from events where t > ?", (day,)) or {}
    return {
        "now": time.time(),
        "live": live,
        "today": {"tasks": int(today.get("tasks") or 0), "done": int(today.get("done") or 0),
                  "people": int(today.get("people") or 0), "usd": round(await db.spent_today(), 4)},
        "users": users,
        "events": events,
        "codes": ["admin"] + [f"Code {i}" for i in range(1, len(settings.access_codes) + 1)],
        "model": bool(settings.meta_key), "speech": speech.enabled(),
    }


@app.get("/admin/user/{user_id}")
async def admin_user(user_id: str, request: Request):
    _admin(request)
    chats = await db.exec("select chat_id, title, updated from chats where user_id=? order by updated desc limit 50", (user_id,))
    return {"chats": chats}


@app.get("/admin/chat/{user_id}/{chat_id}")
async def admin_chat(user_id: str, chat_id: str, request: Request):
    _admin(request)
    rows = await db.exec("select t, role, text from messages where user_id=? and chat_id=? order by t limit 400", (user_id, chat_id))
    return {"messages": rows}


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
    if uid and uid.startswith("~"):
        uid = None  # the admin page's token is not an account
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
        row = await db.one("select plan, code from users where id=?", (uid,)) or {}
        s.who = {"email": acc["email"], "name": acc.get("name", ""), "plan": row.get("plan", ""), "code": row.get("code", "")}
        await db.exec("update users set last_seen=? where id=?", (time.time(), uid))
        await db.log(uid, "open", ws.headers.get("user-agent", "")[:160])
        await s.send({"type": "account", "credits": acc["credits"]})
        # reminders that came due while she was away
        for n in await db.exec("select * from notices where user_id=? and delivered=0 order by t", (uid,)):
            await deliver(s, n["chat_id"], n["title"], n["text"], json.loads(n["payload"]) if n.get("payload") else [])
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
        if not uid.startswith("guest-"):
            await db.exec("update users set last_seen=? where id=?", (time.time(), uid))
            await db.log(uid, "leave", f"{round(time.time() - s.since)}s")
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
                        else:
                            await push.send(w["user_id"], w["what"][:60], "The page you asked me to watch has changed.", f"/app?chat={chat_id}", tag=chat_id)
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
                    await push.send(r["user_id"], head, r["text"], f"/app?chat={r['chat_id']}", tag=f"r-{r['id']}")
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


# ---- scheduled tasks: the agent works on its own at the time she chose -------------------------------------------------

async def deliver(s: "Session", chat_id: str, title: str, text: str, msgs: list[dict]) -> None:
    """Into her app: the chat (made if she has no such chat on this device), then the messages."""
    await s.send({"type": "notify", "task": chat_id, "title": title, "text": text, "kind": "job" if msgs else "reminder"})
    for m in msgs:
        await s.send({"type": "msg", "task": chat_id, "msg": m})


class JobIO:
    """The agent's way out during a scheduled run: messages are collected for her; nobody can answer questions, so
    anything that needs her stops the run with a clear note. Submitting is allowed only on the sites she approved
    when she scheduled it; payments always wait for her."""

    def __init__(self, job: dict) -> None:
        self.job, self.msgs = job, []
        self.allow = {x for x in (job.get("allow") or "").split(",") if x}
        self.browser: Browser | None = None
        self.needs = ""

    def _add(self, m: dict) -> None:
        self.msgs.append({"id": mid(), **m})

    async def say(self, text: str) -> None:
        if text.strip():
            self._add({"kind": "agent", "text": text})

    async def ask(self, question: str, choices: list[str]) -> str:
        self.needs = question
        raise asyncio.CancelledError("needs her")

    async def confirm(self, question: str, detail: str) -> bool:
        here = ""
        if self.browser and self.browser.page:
            here = registrable(self.browser.pdf.url if self.browser.pdf else self.browser.page.url)
        money = re.search(r"pay|payment|transfer|buy|purchase|checkout|card", f"{question} {detail}", re.I)
        if here in self.allow and not money:
            self._add({"kind": "step", "text": f"Approved earlier: {question}", "status": "done"})
            return True
        self.needs = question
        return False

    async def point(self, rect, text: str) -> str:
        self.needs = text
        raise asyncio.CancelledError("needs her")

    async def handoff(self, rect, text: str) -> str:
        self.needs = text
        raise asyncio.CancelledError("needs her")

    async def ask_private(self, rect, label: str, field: str, digits) -> dict:
        self.needs = label
        return {"value": "", "save": False}

    async def event(self, kind: str, data: dict) -> None:
        if kind in ("evidence", "verdict", "reminder", "moment", "scheduled", "terms"):
            self._add({"kind": kind, **data})
        elif kind == "record":
            self._add({"kind": "record", "steps": data.get("steps", [])[-120:], "sites": data.get("sites", []), "success": bool(data.get("success"))})
        elif kind == "doc":
            self._add({"kind": "doc", "doc": data})
        elif kind in ("file", "media"):
            url = data["url"] if data["url"].startswith("http") else settings.public_url.rstrip("/") + data["url"]
            self._add({"kind": "file", **data, "url": url})
        elif kind == "step":
            self._add({"kind": "step", "text": data["text"], "status": "done"})
        elif kind == "plan":
            self.msgs = [m for m in self.msgs if m["kind"] != "plan"]
            self._add({"kind": "plan", "steps": data["steps"]})


async def run_job(job: dict, last_try: bool = True) -> bool:
    io = JobIO(job)
    browser = await Browser({"mobile": False}).start()
    io.browser = browser
    title = {"en": "Scheduled task", "pcm": "Scheduled work", "yo": "Iṣẹ́ àkókò", "ha": "Aiki na lokaci", "ig": "Ọrụ oge"}.get(job["lang"], "Scheduled task")
    summary, ok = "", False
    try:
        agent = Agent(_model(), browser, io, lang=job["lang"], mode="do", profile=json.loads(job.get("profile") or "{}"),
                      conversation=(await db.history(job["user_id"], job["chat_id"], 20)), user_id=job["user_id"],
                      memory=DbMemory(job["user_id"], job["chat_id"], job["lang"]), vault=Vault(db, job["user_id"]),
                      unattended=True, max_turns=60)
        result = await asyncio.wait_for(agent.run(job["goal"]), timeout=20 * 60)
        summary, ok = result.summary, result.success
        await db.add_spend(agent.model.usage.dollars)
    except (asyncio.CancelledError, asyncio.TimeoutError):
        pass
    except Exception as e:  # noqa: BLE001
        log.exception("job %s failed", job["id"])
        summary = f"The scheduled task could not run ({type(e).__name__})."
    finally:
        await browser.close()
    if not ok and not io.needs and not last_try:
        # the site was down or busy: try again later, quietly
        await db.exec("update jobs set last=? where id=?", ((summary or "not done yet")[:500], job["id"]))
        return False
    if io.needs and not ok:
        need = {"en": "I need you for this step:", "pcm": "I need you for this one:", "yo": "Mo nílò yín fún èyí:",
                "ha": "Ina bukatar ka don wannan:", "ig": "Achọrọ m gị maka nke a:"}.get(job["lang"], "I need you for this step:")
        io._add({"kind": "agent", "text": f"{need} {io.needs}"})
    text = summary or (io.msgs[-1].get("text", "") if io.msgs else "")
    await db.remember(job["user_id"], job["chat_id"], "agent", f"[scheduled task] {text}")
    await db.exec("update jobs set last=? where id=?", (text[:500], job["id"]))
    s = SESSIONS.get(job["user_id"])
    if s:
        await deliver(s, job["chat_id"], title, text, io.msgs)
        s.speak(job["chat_id"], text)
    else:
        await db.exec("insert into notices (id, user_id, t, chat_id, title, text, delivered, payload) values (?,?,?,?,?,?,0,?)",
                      (uuid.uuid4().hex[:12], job["user_id"], time.time(), job["chat_id"], title, text, json.dumps(io.msgs, ensure_ascii=False)))
        await push.send(job["user_id"], title, text, f"/app?chat={job['chat_id']}", tag=f"j-{job['id']}")
    return ok or bool(io.needs)


async def fire_jobs() -> None:
    try:
        due = await db.exec("select * from jobs where status='waiting' and at <= ? limit 3", (time.time(),))
    except Exception:  # noqa: BLE001
        return
    for j in due:
        await db.exec("update jobs set status='running', tries=tries+1 where id=?", (j["id"],))
        tries = (j.get("tries") or 0) + 1
        retry = int(j.get("retry_min") or 0)
        last_try = not retry or tries >= 24
        finished = False
        try:
            finished = await run_job(j, last_try=last_try)
        except Exception:  # noqa: BLE001
            log.exception("job %s crashed", j["id"])
        if not finished and not last_try:
            await db.exec("update jobs set status='waiting', at=? where id=?", (time.time() + retry * 60, j["id"]))
        elif j["repeat"] in REPEAT:
            await db.exec("update jobs set status='waiting', tries=0, at=? where id=?", (j["at"] + REPEAT[j["repeat"]], j["id"]))
        else:
            await db.exec("update jobs set status='done' where id=?", (j["id"],))


async def _job_loop():
    while True:
        await asyncio.sleep(30)
        await fire_jobs()
