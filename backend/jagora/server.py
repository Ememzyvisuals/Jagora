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
from jagora import lite, video, voicefx
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
             asyncio.create_task(_job_loop()), asyncio.create_task(_fresh_hellos())]
    yield
    for t in tasks:
        t.cancel()
    for s in list(SESSIONS.values()):
        try:
            await asyncio.wait_for(s.close(), 8)  # a stuck browser never holds up a restart
        except Exception:  # noqa: BLE001
            pass
    await db.close()


app = FastAPI(title="Jagora", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.allowed_origins), allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Authorization", "Content-Type"])
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


@app.post("/client-error")
async def client_error(request: Request):
    """A crash in the app on someone's phone, so it shows up in these logs with its real message and where it
    happened. Only the error itself is kept (no chat, no page content), and it is cut short."""
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return {"ok": False}
    if not isinstance(body, dict):
        return {"ok": False}
    cut = lambda k, n: str(body.get(k, ""))[:n].replace("\n", " | ")  # noqa: E731
    log.warning("app crash: %s | where: %s | page: %s | build: %s | device: %s",
                cut("message", 300), cut("stack", 1200), cut("page", 80), cut("build", 40), cut("ua", 160))
    return {"ok": True}


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


# ---- her settings follow her account: saved details, language and mode, sealed like her saved logins ----------------
SETTING_KEYS = {"lang", "mode", "profile", "avatar"}


@app.get("/me/settings")
async def get_settings(request: Request):
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    row = await db.one("select settings from users where id=?", (uid,))
    raw = (row or {}).get("settings") or ""
    if not raw:
        return {"settings": None}
    from jagora.vault import unseal

    try:
        nonce, ct = raw.split(":", 1)
        return {"settings": json.loads(unseal(uid, "settings", "settings", nonce, ct))}
    except Exception:  # noqa: BLE001
        return {"settings": None}


@app.put("/me/settings")
async def put_settings(request: Request):
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(400)
    clean: dict = {k: v for k, v in body.items() if k in SETTING_KEYS}
    if isinstance(clean.get("profile"), dict):
        clean["profile"] = {str(k)[:40]: str(v)[:300] for k, v in clean["profile"].items() if isinstance(v, (str, int, float))}
    for k in ("lang", "mode", "avatar"):
        if k in clean and (not isinstance(clean[k], str) or len(clean[k]) > 16):
            clean.pop(k)
    text = json.dumps({**clean, "updated": time.time()}, ensure_ascii=False)
    if len(text) > 8000:
        raise HTTPException(413)
    from jagora.vault import seal

    nonce, ct = seal(uid, "settings", "settings", text)
    await db.exec("update users set settings=? where id=?", (f"{nonce}:{ct}", uid))
    return {"ok": True}


# Amina's hello in each language, for the landing page (a fixed set of lines, so nobody can use this to make speech)
HELLO = {  # exactly the lines shown in the languages section of the landing page
    "yo": "Ẹ n lẹ́, kí ni kí n bá yín ṣe?",
    "ha": "Sannu, me kake so in yi maka?",
    "ig": "Ndeewo, gịnị ka m ga-emere gị?",
    "pcm": "How you dey, wetin I fit do for you?",
    "en": "Good day, what can I do for you?",
}


HELLO_VERSION = 4  # raise this to throw away every hello recording and make them all again


def _hello_file(lang: str) -> Path:
    import hashlib

    tag = hashlib.sha256(HELLO[lang].encode()).hexdigest()[:10]  # a new line makes a new file
    return speech.TTS_CACHE / f"hello-v{HELLO_VERSION}-{settings.voice}-{lang}-{tag}.mp3"


async def _make_hello(lang: str) -> Path | None:
    """Record one hello line fresh from STORM (never from stored pieces) and save it as MP3."""
    out = _hello_file(lang)
    if out.exists():
        return out
    clips = [w async for w in speech.speak(HELLO[lang], lang, fresh=True)]
    if not clips:
        return None
    import io
    import wave

    frames, rate = b"", 24000
    for c in clips:
        with wave.open(io.BytesIO(c)) as w:
            rate = w.getframerate()
            fx = voicefx.Stretcher(rate)
            raw = w.readframes(w.getnframes())
            frames += voicefx.louder(fx.feed(raw) + fx.flush()) + b"\0\0" * int(rate * 0.12)
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0",
        "-codec:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", "pipe:1", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
    mp3, _ = await proc.communicate(frames)
    if not mp3:
        return None
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(mp3)
    return out


async def _fresh_hellos() -> None:
    """On start: wipe every old hello recording, then record the five current lines again."""
    if not speech.enabled():
        return
    keep = {_hello_file(lang).name for lang in HELLO}
    gone = 0
    for f in speech.TTS_CACHE.glob("hello-*.mp3"):
        if f.name not in keep:
            f.unlink(missing_ok=True)
            gone += 1
    made = [lang for lang in HELLO if await _make_hello(lang)]
    log.info("hello voice: %d old recordings removed, ready: %s", gone, ", ".join(made))


@app.get("/voice/hello/{lang}")
async def voice_hello(lang: str, line: str = ""):
    """Jagora's own STORM voice saying hello, as a small MP3, made once and then served from disk."""
    if lang not in HELLO or not speech.enabled():
        raise HTTPException(404, "no such line")
    out = await _make_hello(lang)
    if not out:
        raise HTTPException(503, "voice not available")
    # the page sends the line it shows; only an exact match may be kept by the browser
    keep = "public, max-age=604800, immutable" if line == HELLO[lang] else "no-store"
    return FileResponse(out, media_type="audio/mpeg", headers={"Cache-Control": keep})


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
    """Her chats on any device: newest first."""
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


# "carry on" in her languages: Jagora picks up what an interruption cut off
CONTINUE = re.compile(r"\b(continue|go on|carry on|keep (going|reading)|resume|finish (it|reading)|continue am|dey go|oya|"
                      r"tẹ̀?síwájú|tesiwaju|máa bá a lọ|maa ba a lo|ci gaba|ci-gaba|ka ci gaba|gaa n'ihu|gaa n.ihu|nọgide)\b", re.I)
OKAY = {"en": "Okay.", "pcm": "Okay.", "yo": "Ó dáa.", "ha": "To.", "ig": "Ọ dị mma."}

SEND_WAIT = 6.0  # seconds a message may wait on her connection before the connection counts as gone
RECONNECT_GRACE = 60.0  # seconds a dropped session (and its task) waits for her app to come back
KEEP_FOR_LATER = {"task", "msg", "update", "status", "url", "notify", "account", "speech_end"}


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
        self.screen = ""  # what the app shows right now, sent with every message (the agent reads it each step)
        self._speaking: tuple[str, str, str] | None = None  # (task, text, lang) being spoken now
        self._unsaid: tuple[str, str, float] | None = None  # what an interruption cut off: (task, text, when)
        self._said: list[tuple[float, str]] = []  # what Jagora said lately, to tell her voice from an echo of Jagora's
        self.lite = False  # data saver (lite.py): smaller voice and live view on slow or costly networks
        self.viewing = True  # False while the app is in the background: no live-view frames are sent then
        self._held_frame = ""
        self.sent = {"frame": 0, "pcm": 0, "other": 0}  # bytes sent to her phone, for the admin page
        self.doing = ""  # the request being worked on now
        self._send_lock = asyncio.Lock()
        self._speech_q: asyncio.Queue = asyncio.Queue()
        self._gen = 0  # speech generation: a hush makes everything older silent
        self._speaker = asyncio.create_task(self._speak_loop())
        self._last_frame = 0.0
        # live view as video (video.py) when her app can decode it; photos otherwise
        self.video = False
        self._video_kick = asyncio.Event()
        self._video_key = True
        self._video_task: asyncio.Task | None = None
        self._latest_jpeg = b""
        self._frame_busy = False
        self._dead_ws: WebSocket | None = None  # a connection that stopped taking messages
        self._missed: list[dict] = []  # chat messages that could not be sent, delivered when she reconnects

    def _cast_mode(self) -> str:
        if self.video:
            if self.lite:
                return "vlite"
            # phones: Chrome only signals a change and full_frame() takes the sharper picture; computers: the
            # screencast frame is already full size, so it is used as is
            return "signal" if (self.browser and self.browser.mobile) or self.device.get("mobile") else "vfull"
        return "lite" if self.lite else "full"

    async def send_bytes(self, data: bytes, kind: str = "frame") -> None:
        """Binary messages: the live view (1 = JPEG photo, 2 = video keyframe, 3 = video frame), no base64. A picture
        is never worth waiting for: if the line is busy or gone, this one is skipped (the next one replaces it)."""
        ws = self.ws
        if ws is self._dead_ws or self._send_lock.locked():
            return
        async with self._send_lock:
            try:
                await asyncio.wait_for(ws.send_bytes(data), SEND_WAIT)
                self.sent[kind] += len(data)
            except Exception:  # noqa: BLE001
                self._dead_ws = ws

    async def send(self, msg: dict) -> None:
        """One message to her app. A phone connection can die without saying so (lift, weak signal, screen off): then
        a send could wait forever and hold up everything after it. So a send waits a few seconds at most; after
        that this connection counts as gone, and what she must not miss (the chat, steps, status) is kept and sent
        when her app reconnects (attach)."""
        ws = self.ws
        if ws is not self._dead_ws:
            async with self._send_lock:
                if ws is self.ws and ws is not self._dead_ws:
                    try:
                        text = json.dumps(msg, ensure_ascii=False)
                        await asyncio.wait_for(ws.send_text(text), SEND_WAIT)
                        k = msg.get("type")
                        self.sent[k if k in ("frame", "pcm") else "other"] += len(text)
                        return
                    except Exception:  # noqa: BLE001
                        self._dead_ws = ws
        if msg.get("type") in KEEP_FOR_LATER and len(self._missed) < 300:
            self._missed.append(msg)

    async def attach(self, ws: WebSocket) -> None:
        """Her app came back (new connection, same person): the same session carries on, with its tasks, browser
        and voice, and she gets what she missed."""
        self.ws = ws
        self._dead_ws = None
        missed, self._missed = self._missed, []
        for m in missed:
            await self.send(m)
        if self.browser:
            await self.send({"type": "viewport", "w": self.browser.viewport["width"], "h": self.browser.viewport["height"],
                             "mobile": self.browser.mobile})
            self._video_key = True
            self._video_kick.set()
        for task, r in self.runs.items():
            if r.busy:
                await self.send({"type": "status", "task": task, "status": "working"})

    async def close_later(self, ws: WebSocket, grace: float = RECONNECT_GRACE) -> None:
        """The connection dropped: wait a little for her app to come back before stopping her task."""
        await asyncio.sleep(grace)
        if self.ws is ws and SESSIONS.get(self.user_id) is self:
            SESSIONS.pop(self.user_id, None)
            await self.close()

    async def close(self) -> None:
        for r in self.runs.values():
            if r.busy:
                r.job.cancel()
        self._speaker.cancel()
        self.video = False
        if self._video_task:
            self._video_task.cancel()
        if self.browser:
            b, self.browser = self.browser, None
            try:
                await asyncio.wait_for(b.close(), 8)  # a stuck browser must never hold anything up
            except Exception:  # noqa: BLE001
                b.kill()

    async def get_browser(self) -> Browser:
        if self.browser is None:
            self.browser = await Browser(self.device).start()
            self.browser.cast = self._cast_mode()
            self.browser.translate_to = self.lang if self.translate and self.lang != "en" else ""
            await self.browser.start_screencast(self._frame)
            await self.send({"type": "viewport", "w": self.browser.viewport["width"], "h": self.browser.viewport["height"],
                             "mobile": self.browser.mobile})
        return self.browser

    def _frame(self, jpeg: str) -> None:
        """Chrome's screencast: the page changed. Video: wake the encoder (it takes a sharp frame itself). Photos:
        send this one, unless the last is still on its way (then only the newest is sent later: no backlog)."""
        if self.video:
            if self._cast_mode() != "signal":
                self._latest_jpeg = base64.b64decode(jpeg)
            self._video_kick.set()
            return
        if not self.viewing:
            self._held_frame = jpeg  # sent when she comes back
            return
        self._latest_jpeg = base64.b64decode(jpeg)
        now = time.monotonic()
        if self._frame_busy or now - self._last_frame < lite.FRAME_GAP["lite" if self.lite else "full"] or not self.active_task:
            if not self._frame_busy:
                asyncio.get_running_loop().call_later(lite.FRAME_GAP["full"], self._resend_latest)
            return
        self._last_frame = now
        asyncio.ensure_future(self._send_photo(self._latest_jpeg))

    def _resend_latest(self) -> None:
        # the newest picture after a burst, so the view always ends on the page as it is now
        if not self.video and self.viewing and self._latest_jpeg and not self._frame_busy and time.monotonic() - self._last_frame >= lite.FRAME_GAP["lite" if self.lite else "full"]:
            self._last_frame = time.monotonic()
            asyncio.ensure_future(self._send_photo(self._latest_jpeg))

    async def _send_photo(self, jpeg: bytes) -> None:
        self._frame_busy = True
        try:
            await self.send_bytes(b"\x01" + jpeg)
        finally:
            self._frame_busy = False

    async def set_video(self, on: bool) -> None:
        if on == self.video:
            if on:
                self._video_key = True
                self._video_kick.set()
            return
        self.video = on
        if self.browser:
            await self.browser.set_cast(self._cast_mode())
        if on and not self._video_task:
            self._video_key = True
            self._video_task = asyncio.create_task(self._video_loop())
        self._video_kick.set()

    async def _video_loop(self) -> None:
        """While her app takes video: each time the page changes, take one sharp frame and send it as H.264."""
        enc: video.Encoder | None = None
        last = 0.0
        try:
            while self.video:
                await self._video_kick.wait()
                self._video_kick.clear()
                b = self.browser
                if not self.video or not self.viewing or not b or not b.page or not self.active_task:
                    continue
                wait = last + lite.VIDEO_GAP["lite" if self.lite else "full"] - time.monotonic()
                if wait > 0:
                    await asyncio.sleep(wait)
                    self._video_kick.clear()  # this frame covers changes made while waiting
                last = time.monotonic()
                jpeg = await b.full_frame() if self._cast_mode() == "signal" else self._latest_jpeg
                if not jpeg:
                    continue
                w, h = video.jpeg_size(jpeg)
                if enc is None or (enc.w, enc.h) != (w - w % 2, h - h % 2) or enc.lite != self.lite:
                    if enc:
                        enc.close()
                    enc = video.Encoder(w, h, lite=self.lite)
                    self._video_key = True
                key, self._video_key = self._video_key, False
                try:
                    out = await asyncio.to_thread(enc.encode, jpeg, int(last * 1000), key)
                except Exception as e:  # noqa: BLE001
                    log.warning("video encode failed: %s", e)
                    enc = None
                    continue
                for data, is_key in out:
                    await self.send_bytes((b"\x02" if is_key else b"\x03") + data)
                # the page stopped moving: sharpen the still picture with a few more passes, unless it changes again
                for _ in range(video.SHARPEN):
                    try:
                        await asyncio.wait_for(self._video_kick.wait(), 0.15)
                        break  # it moved again: carry on as usual
                    except asyncio.TimeoutError:
                        pass
                    if not self.video or not self.viewing:
                        break
                    last = time.monotonic()
                    try:
                        more = await asyncio.to_thread(enc.encode, jpeg, int(last * 1000), False)
                    except Exception:  # noqa: BLE001
                        break
                    for data, is_key in more:
                        await self.send_bytes((b"\x02" if is_key else b"\x03") + data)
        finally:
            if enc:
                enc.close()
            self._video_task = None

    # ---- speech: queued so sentences never overlap ----------------------------------------------------------------

    async def _speak_loop(self) -> None:
        """Her phone plays the PCM as it arrives. `hush` (she starts talking, or taps) bumps the generation, so the
        sentence being spoken stops at once and nothing queued is said."""
        while True:
            task, text, lang, gen = await self._speech_q.get()
            if gen != self._gen:
                continue
            self._speaking = (task, text, lang)
            try:
                await self.send({"type": "orb", "state": "speaking"})
                utt = mid()
                fx: voicefx.Stretcher | None = None
                at, last_rate = -1, 24000
                level = voicefx.Leveler()

                async def out(i: int, rate: int, pcm: bytes) -> None:
                    pcm = level(pcm)
                    if not pcm:
                        return
                    if self.lite:
                        block, r2 = lite.voice_chunk(pcm, rate)
                        await self.send({"type": "pcm", "task": task, "utt": utt, "n": i, "rate": r2, "codec": "adpcm", "data": base64.b64encode(block).decode()})
                    else:
                        await self.send({"type": "pcm", "task": task, "utt": utt, "n": i, "rate": rate, "data": base64.b64encode(pcm).decode()})

                async for i, rate, pcm in speech.speak_stream(text, lang):
                    if gen != self._gen:
                        break
                    if i != at:  # a new sentence: finish the last one, start fresh
                        if fx:
                            await out(at, last_rate, fx.flush())
                        fx, at, last_rate = voicefx.Stretcher(rate), i, rate
                    await out(i, rate, fx.feed(pcm))
                if fx and gen == self._gen:
                    await out(at, last_rate, fx.flush())
            except Exception as e:  # noqa: BLE001
                log.warning("speech failed: %s", e)
            if gen == self._gen:
                self._speaking = None
            if self._speech_q.empty() and gen == self._gen:
                await self.send({"type": "speech_end", "task": task})

    def hush(self, heard: int | None = None) -> None:
        """Stop talking. What was not said yet is kept for a minute (from the sentence she was hearing when she cut
        in), so "continue" picks up there, the way LiveKit resumes after an interruption."""
        rest: list[str] = []
        task = ""
        if self._speaking:
            task, text, _ = self._speaking
            parts = speech.sentences(speech.speakable(text))
            rest += parts[max(0, int(heard or 0)):]
        while not self._speech_q.empty():
            t, text, _, _ = self._speech_q.get_nowait()
            task = task or t
            rest.append(text)
        self._speaking = None
        if rest:
            self._unsaid = (task, " ".join(rest), time.time())
        self._gen += 1

    def resume(self, task: str) -> bool:
        """Carry on with what was interrupted, if it was recent."""
        if not self._unsaid or time.time() - self._unsaid[2] > 90:
            return False
        t, text, _ = self._unsaid
        self._unsaid = None
        self.speak(t or task, text)
        return True

    def speak(self, task: str, text: str) -> None:
        if speech.enabled() and text.strip():
            self._said.append((time.time(), text))
            del self._said[:-6]
            self._speech_q.put_nowait((task, text, self.lang, self._gen))

    def echo(self, heard: str) -> bool:
        """Is this 'what she said' really Jagora's own voice, picked up by the phone's microphone from its speaker?
        True when 4+ words and nearly all of them are a run of what Jagora said in the last minute."""
        import difflib

        words = re.findall(r"\w+", heard.lower())
        if len(words) < 4:
            return False
        for at, said in self._said:
            if time.time() - at > 60:
                continue
            sw = re.findall(r"\w+", said.lower())
            m = difflib.SequenceMatcher(None, words, sw, autojunk=False)
            if sum(b.size for b in m.get_matching_blocks()) >= 0.8 * len(words):
                return True
        return False

    # ---- input from the app --------------------------------------------------------------------------------------

    async def handle(self, ev: dict) -> None:
        kind = ev.get("type")
        if isinstance(ev.get("screen"), str):
            self.screen = ev["screen"][:2000]
        task = str(ev.get("task") or "")
        if task:
            self.active_task = task
        if kind == "net":
            await self.set_lite(bool(ev.get("lite")))
            return
        if kind == "view":
            self.viewing = bool(ev.get("on"))
            if self.viewing and self.video:
                self._video_key = True  # she came back: start again from a keyframe
                self._video_kick.set()
            elif self.viewing and self._held_frame and self.active_task:
                await self.send_bytes(b"\x01" + base64.b64decode(self._held_frame))
                self._held_frame = ""
            return
        if kind == "video":  # her app can (or no longer can) play the live view as video; "key": it needs a keyframe
            await self.set_video(bool(ev.get("on")))
            return
        if kind == "start":
            if "lite" in ev:
                await self.set_lite(bool(ev.get("lite")))
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
            self.hush(ev.get("heard") if isinstance(ev.get("heard"), int) else None)
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

    async def set_lite(self, on: bool) -> None:
        self.lite = on
        if self.browser:
            await self.browser.set_cast(self._cast_mode())
        self._video_key = True

    def data_used(self) -> str:
        """How much data this session cost her phone, for the admin page."""
        mins = max(1 / 60, (time.time() - self.since) / 60)
        total = sum(self.sent.values()) / 1024
        return (f"{round(total)} KB in {round(mins, 1)} min ({round(total / mins)} KB/min; live view {round(self.sent['frame'] / 1024)} KB, "
                f"voice {round(self.sent['pcm'] / 1024)} KB){', data saver' if self.lite else ''}")

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
        if not self.browser:
            return
        b = self.browser
        if ev.get("action") == "scroll":
            # scrolling only changes what she looks at: allowed any time, even while Jagora reads or works (it reads
            # the page again before its next action)
            try:
                await b.wheel(float(ev.get("dy", 0)))
            except Exception as e:  # noqa: BLE001
                log.info("scroll failed: %s", e)
            return
        r = self.runs.get(task)
        if r and r.busy and r.free.is_set() and not r.waiting:
            await self.send({"type": "hint", "task": task, "text": "Tap Take over first, so Jagora waits for you."})
            return
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
            elif act == "forward":
                await b.forward()
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
        if (not text or self.echo(text)) and self._unsaid and time.time() - self._unsaid[2] < 6:
            # she cut in, but it was only a noise (or Jagora's own voice): carry on reading
            if msg_id:
                await self.send({"type": "drop", "task": task, "id": msg_id})
            self.resume(task)
            return
        if not text:
            note = {"en": "I didn't catch that. Please say it again.", "pcm": "I no hear am well. Abeg talk am again.",
                    "yo": "Mi ò gbọ́ ọ dáadáa. Ẹ jọ̀ọ́ ẹ tún sọ ọ́.", "ha": "Ban ji ba sosai. Don Allah ka sake fada.",
                    "ig": "Anụghị m nke ọma. Biko kwuo ya ọzọ."}.get(lang, "I didn't catch that.")
            if msg_id:
                await self.send({"type": "update", "task": task, "id": msg_id, "patch": {"text": "", "heard": False}})
            await self.agent_says(task, note)
            await self.send({"type": "orb", "state": "idle"})
            return
        if self.echo(text):
            # her phone's microphone heard Jagora's own voice: not her words, so nothing is answered
            log.info("dropped echo of Jagora's own words")
            if msg_id:
                await self.send({"type": "drop", "task": task, "id": msg_id})
            await self.send({"type": "orb", "state": "idle"})
            return
        if msg_id:
            await self.send({"type": "update", "task": task, "id": msg_id, "patch": {"text": text}})
        else:
            await self.send({"type": "msg", "task": task, "msg": {"id": mid(), "kind": "user", "text": text, "voice": True}})
        await self.on_words(task, text, None, ev.get("history"))

    async def on_words(self, task: str, text: str, attachment: dict | None, history: list | None) -> None:
        """Whatever she said or typed: an answer to a waiting question, words for the running agent, or a new request."""
        if text and CONTINUE.search(text) and len(text.split()) <= 5 and self.resume(task):
            return  # "continue": she wants the rest of what Jagora was saying
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
            # she spoke while it works: a quick spoken "okay" now, and Jagora acts on it before its next step
            self.speak(task, OKAY.get(self.lang, "Okay."))
            await r.steer.put(text)
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
                          steering=r.steer, user_id=self.user_id, on_watch=io.watch, screen=lambda: self.screen,
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

    async def _ring(self, rect: dict | None, tone: str = "point") -> None:
        """The ring around what Jagora means, drawn inside the page (so it moves with it and is in the live picture)."""
        b = self.s.browser
        if b is not None:
            await b.ring(rect, tone)

    async def point(self, rect: dict | None, text: str) -> str:
        if rect:
            await self._ring(rect, "point")
        self.s.speak(self.task, text)
        m = {"id": mid(), "kind": "handoff", "text": text, "status": "waiting"}
        v = await self._wait("handoff", m)
        await self.s.send({"type": "update", "task": self.task, "id": m["id"], "patch": {"status": "done"}})
        await self._ring(None)
        return v or "done"

    async def handoff(self, rect: dict | None, text: str) -> str:
        if rect:
            await self._ring(rect, "stop")
        return await self.point(None, text)

    async def ask_point(self, question: str) -> dict:
        """She taps the thing she means on the live page; returns the spot in page pixels (or her words)."""
        self.s.speak(self.task, question)
        m = {"id": mid(), "kind": "pointask", "question": question, "status": "waiting"}
        v = await self._wait("point", m)
        await self.s.send({"type": "update", "task": self.task, "id": m["id"], "patch": {"status": "done"}})
        if isinstance(v, dict) and "x" in v:
            await self._ring({"x": v["x"] - 18, "y": v["y"] - 18, "w": 36, "h": 36}, "point")
            return {"x": float(v["x"]), "y": float(v["y"])}
        return {"text": str(v)}

    async def ask_private(self, rect: dict | None, label: str, field: str, digits: int | None) -> dict:
        if rect:
            await self._ring(rect, "stop")
        self.s.speak(self.task, label)
        m = {"id": mid(), "kind": "secret", "label": label, "field": field, "status": "waiting", **({"digits": digits} if digits else {})}
        value = await self._wait("secret", m)
        await self._ring(None)
        return value

    async def close_step(self) -> None:
        if self.r.step_id:
            await self.s.send({"type": "update", "task": self.task, "id": self.r.step_id, "patch": {"status": "done"}})
            self.r.step_id = ""

    async def event(self, kind: str, data: dict) -> None:
        s, t = self.s, self.task
        if kind == "app":  # change something in the app on her screen (lib/appctl.ts does it)
            await s.send({"type": "app", "task": t, "action": data.get("action", ""), "value": data.get("value", "")})
        elif kind == "page":
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
            await s.send({"type": "orb", "state": "working"})  # the orb shows Jagora at work on the page
            await self._ring(None)
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
            await self._ring(data.get("box"), "point")

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
    s = SESSIONS.get(uid)
    if s:
        await s.attach(ws)  # her app reconnected: the same session (and any task) carries on
    else:
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
        if s.ws is ws:  # not taken over by a newer connection
            if not uid.startswith("guest-"):
                await db.exec("update users set last_seen=? where id=?", (time.time(), uid))
                await db.log(uid, "leave", f"{round(time.time() - s.since)}s, {s.data_used()}")
            # guests have no way back to the same session; people with an account get a minute to reconnect
            asyncio.create_task(s.close_later(ws, 0 if uid.startswith("guest-") else RECONNECT_GRACE))


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
