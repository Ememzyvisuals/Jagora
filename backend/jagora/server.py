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
import os
import re
import secrets
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from jagora import auth, speech
from jagora import lite, trace, video, voicefx
from jagora.agent import Agent
from jagora.browser import Browser
from jagora.config import DATA_DIR, FILES_DIR, INGESTED, PORTALS_DIR, settings
from jagora.db import DB
from jagora.guard import guard, registrable
from jagora.push import Push
from jagora.vault import Vault

log = logging.getLogger("jagora.server")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # every database call was a log line

YES = re.compile(r"^\s*(yes|yeah|yep|ok(ay)?|sure|go ahead|do it|correct|right|bẹ́ẹ̀ ?ni|bee ?ni|ó dáa|o daa|eh|ee|e ?h?n|"
                 r"i ?ya|toh|haka ne|eeh|ọ́ dị mma|o di mma|ee|make you do am|na so|oya)\b", re.I)
# "I have paid" answers "have you paid?" with a yes (in every language she speaks)
PAID = re.compile(r"\b(i ?(have|'ve)? ?(just )?(paid|sent( it| the money)?|transferred)|i don (pay|send)|mo ti (sanwó|sanwo|fi ránṣẹ́|fi ranse)|"
                  r"na biya|na tura|akwụọla m|akwuola m|ezigala m)\b", re.I)
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

    from jagora.sam import Sam

    out: dict = {"images": muse.Images(), "sam": Sam()}
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

LOOP_BEAT = {"t": time.monotonic()}
STALL_DUMP_S, STALL_EXIT_S = 15.0, 75.0


async def _heartbeat() -> None:
    while True:
        LOOP_BEAT["t"] = time.monotonic()
        await asyncio.sleep(1.0)


def _stall_watchdog() -> None:
    """A thread outside the event loop. If the loop stops turning (something in it blocks: then sign-in, the log
    download and every session freeze), the stack of every thread is written to the log once, so the exact line is
    known, and after a longer freeze the process exits so Docker restarts it at once instead of hanging for an hour."""
    import faulthandler
    import sys
    import threading

    if "pytest" in sys.modules or os.environ.get("JAGORA_WATCHDOG", "1") == "0":
        return  # tests run the app without a server to ask

    nonlocal_state = {"n": 0, "fails": 0}

    def run() -> None:
        dumped = False
        while True:
            time.sleep(2.0)
            stuck = time.monotonic() - LOOP_BEAT["t"]
            if stuck > STALL_DUMP_S and not dumped:
                dumped = True
                print(f"EVENT LOOP STALLED for {stuck:.0f}s; where every thread is:", file=sys.stderr, flush=True)
                faulthandler.dump_traceback(file=sys.stderr, all_threads=True)
            elif stuck < 3:
                dumped = False
            if stuck > STALL_EXIT_S:
                print(f"EVENT LOOP STALLED for {stuck:.0f}s: restarting the backend", file=sys.stderr, flush=True)
                os._exit(3)
            # the loop may turn while requests still hang (a deadlock further in): ask the server itself every 20 s
            nonlocal_state["n"] += 1
            if nonlocal_state["n"] % 10 == 0:
                try:
                    import urllib.request
                    urllib.request.urlopen(f"http://127.0.0.1:{os.environ.get('PORT', '8000')}/health", timeout=8).read()
                    nonlocal_state["fails"] = 0
                except Exception as e:  # noqa: BLE001
                    nonlocal_state["fails"] += 1
                    print(f"health check failed ({nonlocal_state['fails']}): {e}", file=sys.stderr, flush=True)
                    if nonlocal_state["fails"] == 2:
                        faulthandler.dump_traceback(file=sys.stderr, all_threads=True)
                    if nonlocal_state["fails"] >= 4:
                        print("the backend stopped answering: restarting it", file=sys.stderr, flush=True)
                        os._exit(3)

    threading.Thread(target=run, name="stall-watchdog", daemon=True).start()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_heartbeat())
    _stall_watchdog()
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
    return speech.TTS_CACHE / f"hello-v{HELLO_VERSION}-amina-{lang}-{tag}.mp3"


async def _make_hello(lang: str) -> Path | None:
    """Record one hello line fresh from STORM (never from stored pieces) and save it as MP3."""
    out = _hello_file(lang)
    if out.exists():
        return out
    clips = [w async for w in speech.speak(HELLO[lang], lang, fresh=True, voice="amina")]  # Amina speaks in her own voice
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


@app.get("/payments")
async def payments(request: Request):
    """Her payment records on any device (the evidence of what she paid, kept even if a session closed)."""
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    rows = await db.exec("select chat_id, data from payments where user_id=? order by updated desc limit 50", (uid,))
    return [{"chat_id": r["chat_id"], **json.loads(r["data"])} for r in rows]


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


@app.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, request: Request):
    """She deleted a chat: it goes from every device, with its messages."""
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    await db.exec("delete from messages where user_id=? and chat_id=?", (uid, chat_id))
    await db.exec("delete from chats where user_id=? and chat_id=?", (uid, chat_id))
    await db.exec("delete from chat_notes where user_id=? and chat_id=?", (uid, chat_id))  # its memory goes with it
    return {"ok": True}


@app.post("/chats/delete-all")
async def delete_all_chats(request: Request):
    """She typed DELETE to start afresh: every chat, its messages, its memory and her session log go, on every
    device. What Jagora remembers about her (her facts) stays unless she asks for that too."""
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    if str(body.get("confirm") or "") != "DELETE":
        raise HTTPException(400, "type DELETE to confirm")
    for table in ("messages", "chats", "chat_notes"):
        await db.exec(f"delete from {table} where user_id=?", (uid,))
    trace.clear(uid)
    return {"ok": True}


@app.get("/files/{token}/{name}")
async def files(token: str, name: str):
    if not re.fullmatch(r"[\w-]{10,40}", token) or "/" in name or ".." in name:
        raise HTTPException(404)
    f = FILES_DIR / token / name
    if not f.exists():
        raise HTTPException(404)
    return FileResponse(f, filename=name)


@app.get("/trace")
async def trace_download(request: Request, token: str = "", minutes: float = 0):
    """Her session log as one text file (Profile > Download session log). Signed in only, her own log only."""
    uid = _user_from(request) or (auth.read_token(token) if token else None)
    if not uid:
        raise HTTPException(401)
    name = f"jagora-log-{time.strftime('%Y%m%d-%H%M')}.txt"
    return PlainTextResponse(trace.download(uid, minutes), headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.post("/trace/clear")
async def trace_clear(request: Request):
    """Start a fresh log (before a test)."""
    uid = _user_from(request)
    if not uid:
        raise HTTPException(401)
    trace.clear(uid)
    return {"ok": True}


@app.post("/livekit/token")
async def livekit_token(request: Request):
    """A LiveKit room token for live voice (room per user)."""
    uid = _user_from(request)
    if not uid or not settings.livekit_key:
        raise HTTPException(401)
    now = int(time.time())
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    lang = str(body.get("lang") or "en")[:4]
    room = f"jagora-{uid[:12]}-{secrets.token_hex(3)}"  # a fresh room each time, so the voice joins it at once
    claims = {"iss": settings.livekit_key, "sub": uid, "nbf": now, "exp": now + 3600, "name": "Jagora user",
              "video": {"room": room, "roomJoin": True, "canPublish": True, "canSubscribe": True},
              # Jagora's voice (voice/agent.py) is sent into the room as she joins, the way Kivo's agent is
              "roomConfig": {"agents": [{"agentName": settings.voice_agent_name,
                                         "metadata": json.dumps({"uid": uid, "lang": lang})}]}}
    return {"url": settings.livekit_url, "token": _jwt(claims, settings.livekit_secret), "voice": bool(settings.voice_link_secret)}


@app.websocket("/voice-link")
async def voice_link(ws: WebSocket):
    """Jagora's voice worker on LiveKit, for one person: her finished turns come in, what Jagora says goes out."""
    key, uid = ws.query_params.get("key", ""), ws.query_params.get("uid", "")
    if not settings.voice_link_secret or not hmac.compare_digest(key, settings.voice_link_secret):
        await ws.close(code=4403)
        return
    await ws.accept()
    s = SESSIONS.get(uid)
    for _ in range(60):  # her app may still be connecting (or reconnecting on a weak line): wait up to 30 s for her session
        if s is not None:
            break
        await asyncio.sleep(0.5)
        s = SESSIONS.get(uid)
    if s is None:
        trace.write(uid, "voice_link_refused", note="no session for her when the voice joined")
        await ws.close(code=4404)
        return
    s.attach_voice(ws)
    try:
        while True:
            try:
                ev = json.loads(await ws.receive_text())
            except ValueError:
                continue
            asyncio.create_task(s.on_voice(ev))
    except WebSocketDisconnect:
        pass
    finally:
        s.detach_voice(ws)


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
        self.agent: Agent | None = None  # the agent at work, so a language change reaches it mid-task

    @property
    def busy(self) -> bool:
        return bool(self.job and not self.job.done())


# "carry on" in her languages: Jagora picks up what an interruption cut off
CONTINUE = re.compile(r"\b(continue|go on|carry on|keep (going|reading)|resume|finish (it|reading)|continue am|dey go|oya|"
                      r"tẹ̀?síwájú|tesiwaju|máa bá a lọ|maa ba a lo|ci gaba|ci-gaba|ka ci gaba|gaa n'ihu|gaa n.ihu|nọgide)\b", re.I)
# she tells Jagora to stop talking or stop the task (short sayings only, so "stop the payment" in a longer request is not one)
STOP_RE = re.compile(r"^\W*(please |abeg |oya |jagora,? )?(stop( it| now| talking| reading| am| that)?|shut up|keep quiet|be quiet|quiet|"
                     r"enough|that'?s enough|silence|no talk again|dake( je)?|pa enu mo|duro|yi shiru|ka yi shiru|tsaya|ya isa|"
                     r"mechie onu|kwusi)\b", re.I)


def is_stop(text: str) -> bool:
    """A short "stop" in any of her languages (tone marks and dots ignored, so dákẹ́ and dake both count)."""
    import unicodedata

    plain = "".join(c for c in unicodedata.normalize("NFD", text or "") if not unicodedata.combining(c))
    return len(plain.split()) <= 6 and bool(STOP_RE.search(plain))


# her voice message ends when no new words come for this long (people pause mid-thought, more so in Yorùbá, Hausa
# and Igbo, where the speech recogniser also needs the whole sentence)
TURN_GAP = float(os.environ.get("VOICE_TURN_GAP", "1.6"))

# "are you there?" / "I'm not hearing you": a short answer at once, and the work goes on (it is not a new request)
CHECKIN = re.compile(r"\b(are you (there|still there|hearing me|with me)|(i'?m|i am) not hearing|i no dey hear|you dey there|"
                     r"hello\??$|can you hear me|where are you|you still dey|ṣé o wà|se o wa|kana nan|ị nọ ebe a)\b", re.I)
HERE = {"en": "I'm here, still working on it.", "pcm": "I dey here, I still dey do am.",
        "yo": "Mo wà níbí, mo ṣì ń ṣe é.", "ha": "Ina nan, ina kan aikin.", "ig": "Anọ m ebe a, a ka m na-arụ ya."}
REPEAT_ASK = re.compile(r"\b(repeat( (that|it|yourself))?|say (that|it) again|come again|what did you say|tun so|tún sọ|sake fad|kwughachi|talk am again)\b", re.I)
AGAIN = {"en": "Sorry, I didn't catch that. Please say it again.", "pcm": "Sorry, I no catch am. Abeg talk am again.",
         "yo": "Ẹ má bínú, mi ò gbọ́ ọ dáadáa. Ẹ jọ̀ọ́ ẹ tún sọ ọ́.", "ha": "Yi haƙuri, ban ji ba. Don Allah ka sake faɗa.",
         "ig": "Ndo, anụghị m ya. Biko kwughachi ya."}
AGAIN_YES = {
    "en": "Sorry, I did not catch a yes or no. Should I go ahead? You can also tap Yes or No.",
    "pcm": "Sorry, I no hear yes or no. Make I continue? You fit also tap Yes or No.",
    "yo": "Ẹ má bínú, mi ò gbọ́ bẹ́ẹ̀ ni tàbí bẹ́ẹ̀ kọ́. Ṣé kí n tẹ̀síwájú? Ẹ tún lè tẹ Bẹ́ẹ̀ ni tàbí Bẹ́ẹ̀ kọ́.",
    "ha": "Yi haƙuri, ban ji e ko a'a ba. In ci gaba? Kana iya taɓa E ko A'a.",
    "ig": "Ndo, anụghị m ee ma ọ bụ mba. Ka m gaa n'ihu? Ị nwekwara ike ịpị Ee ma ọ bụ Mba.",
}
LIST_DONE = {
    "en": "That was the last one. You have watched all {n}. Which one did you like best?",
    "pcm": "Na the last one be that. You don watch all {n}. Which one you like pass?",
    "yo": "Èyí ni èyí tó kẹ́yìn. Ẹ ti wo gbogbo {n}. Èwo ló wù yín jù?",
    "ha": "Wannan ne na ƙarshe. Ka kalli duka {n}. Wanne ka fi so?",
    "ig": "Nke ahụ bụ nke ikpeazụ. Ị kirila ha niile {n}. Kedu nke kacha masị gị?",
}
WELL_DONE = {
    "en": "Well done, you finished \"{x}\". That is {d} of {n} lessons, {m} minutes so far. Shall I give you a short practice sheet on it before the next one?",
    "pcm": "Well done, you don finish \"{x}\". Na {d} of {n} lessons, {m} minutes so far. Make I give you small practice on am before the next one?",
    "yo": "Ẹ kú iṣẹ́, ẹ ti parí \"{x}\". Ẹ̀kọ́ {d} nínú {n} ni, ìṣẹ́jú {m} títí di báyìí. Ṣé kí n fún yín ní ìdánrawò kékeré lórí rẹ̀ kí ẹ tó lọ sí èyí tó kàn?",
    "ha": "Madalla, ka gama \"{x}\". Darasi {d} cikin {n}, minti {m} zuwa yanzu. In ba ka ɗan aikin gwaji a kai kafin na gaba?",
    "ig": "Ọ dị mma, ị gụchala \"{x}\". Nke a bụ ihe ọmụmụ {d} n'ime {n}, nkeji {m} ruo ugbu a. Ka m nye gị obere omume na ya tupu nke ọzọ?",
}
HERE_IDLE = {"en": "I'm here. What would you like me to do?", "pcm": "I dey here. Wetin you want make I do?",
             "yo": "Mo wà níbí. Kí ni kí n ṣe fún ọ?", "ha": "Ina nan. Me kake so in yi?", "ig": "Anọ m ebe a. Gịnị ka ị chọrọ ka m mee?"}


# What the speech recogniser often makes of Nigerian names, put right before Jagora reads it
_EXAMS = re.compile(r"\b(exam|result|registration|register|score|cut ?off|utme|admission|subject|brochure|wrote|write|form|candidate|school|universit)", re.I)
HEARD_FIXES = [
    (re.compile(r"\b(uni[ -]?lag|uni[ -]?learning|uni[ -]?lack|unila[cgk]|you ?ni ?lag|university of lag)\b", re.I), "UNILAG"),
    (re.compile(r"\b(uni[ -]?ben|uni[ -]?bend)\b", re.I), "UNIBEN"),
    (re.compile(r"\b(lasu|la su|last you)\b(?= (cut|admission|school|course|form|portal))", re.I), "LASU"),
    (re.compile(r"\b(u ?t ?m ?e|you tme|utm e)\b", re.I), "UTME"),
    (re.compile(r"\b(o ?a ?u|oh a you)\b(?= (cut|admission|school|course|ile))", re.I), "OAU"),
    (re.compile(r"\b(neco|neko|necko)\b", re.I), "NECO"),
    # train stations as the voice hears them (from real Pidgin sessions): Agege, Moniya, Ebute Metta, Ibadan
    (re.compile(r"\b(akike|agige|agigi|adigoo?|magege|agegede|agile)\b(?= .{0,40}\b(to|go|moniya|ibadan|train|station)\b|$)", re.I), "Agege"),
    (re.compile(r"\b(munea|monia|monya|nnya|ermonio|armonia|mo ?ni ?ya)\b", re.I), "Moniya"),
    (re.compile(r"\b(ebute ?mi?t+a|ebutemita|ebute meta|ebute mita)\b", re.I), "Ebute Metta"),
    (re.compile(r"\b(eyibadon|ibadon|eyibadan)\b", re.I), "Ibadan"),
    (re.compile(r"\b(waec|wayek|wake|way ec|w a e c)\b(?= (result|exam|certificate|scratch|card|gce|subject))", re.I), "WAEC"),
    # how the Yorùbá voice hears English words people say inside Yorùbá (from real sessions)
    (re.compile(r"\b(k[ọo]p[ùu]t[àa]|k[ọo]mp[ùu]t[àa]|k[ọo]ta) ?s[áa]y[ẹe]n[sś]?\b", re.I), "Computer Science"),
    (re.compile(r"\b(j[àa]gb[ọo]|j[àa]g[ọo]r[àa]|jagoro|jagura)[\u0300\u0301]?(?!\w)", re.I), "Jagora"),
    (re.compile(r"\b(j[áa]m[ùu]b[ùu]|j[ẹe]mb[ùu]?|jamu)\b", re.I), "JAMB"),
    (re.compile(r"\b(y[ùu]n[ìi]l[áa][àa]g[ìi]?|unil[ẹe]gi)\b", re.I), "UNILAG"),
    (re.compile(r"\b(s[ọo]b[ọo]j[ẹe]k[ìi]|s[ọo]bj[ẹe]k[ìi])\b", re.I), "subject"),
]


def _toneless(rx: str) -> re.Pattern:
    """A pattern that matches whatever tone marks the Yorùbá voice puts on the letters (kọ̀ǹpútà = kompuuta).
    Each letter or [class] becomes (?:it + any marks), so a ? or * after it still applies to the whole letter."""
    out, i = "", 0
    marks = "[\u0300-\u036f]*"
    while i < len(rx):
        c = rx[i]
        if c == "\\":
            out += rx[i:i + 2]
            i += 2
        elif c == "[":
            j = rx.index("]", i)
            out += f"(?:{rx[i:j + 1]}{marks})"
            i = j + 1
        elif c.isalpha():
            out += f"(?:{c}{marks})"
            i += 1
        else:
            out += c
            i += 1
    return re.compile(out, re.I)


YO_FIXES = [
    (_toneless(r"\b(k[oọ]n?m?p[uú]t[aà]|k[oọ]ta) ?s[aá]y[eẹ]n?s?[iì]?(?!\w)"), "Computer Science"),
    (_toneless(r"\b(j[aà]gb[oọ]|j[aà]g[oọ]r[aà]|jagoro|jagura)(?!\w)"), "Jagora"),
    (_toneless(r"\b(j[aá]m[uù]b[uù]|j[eẹ]mb[uù]?|jamu)(?!\w)"), "JAMB"),
    (_toneless(r"\b(d?y?[uù]n[iì]l[aá]a?(g[iìoọ]?|r[uù]|go)|unil[eẹ]gi)(?!\w)"), "UNILAG"),
    (_toneless(r"\b(s[oọ]b[oọ]?j[eẹ]k[iì])(?!\w)"), "subject"),
    # English words the Yorùbá recogniser spells by sound: "dán lóòdì" is download, "brókè" brochure, "ọ̀físà" official
    (_toneless(r"\b(d[aà]n? ?l[oó]o?d[iìuù])(?!\w)"), "download"),
    (_toneless(r"\b(b[uù]?r[oọ]k[eẹaà]r?|b[uù]?r[oọ][sṣ][oọuù]r?)(?!\w)"), "brochure"),
    (_toneless(r"\b([oọ]f[iì][sṣ][aàiì]l?)(?!\w)"), "official"),
    (_toneless(r"\br[oọ]k[eẹ](?= [oọ]h[uú]n)"), "brochure"),  # "rókè ọ̀hún": that brochure, its b lost
    (_toneless(r"\b(k[oọ][oọ][sṣ][iì])(?!\w)"), "courses"),
    (_toneless(r"\b(k[aá]t ?[oó]f[uù]?|k[oọ]t[aà] ?f[uù])(?!\w)"), "cut-off"),
]


def fix_heard(text: str) -> str:
    import unicodedata

    t = unicodedata.normalize("NFD", text)
    if re.search(r"[\u0300-\u036f]", t):  # Yorùbá words (tone marks): English said in them is spelled by sound
        for rx, said in YO_FIXES:
            t = rx.sub(said, t)
    t = unicodedata.normalize("NFC", t)
    for rx, name in HEARD_FIXES:
        t = rx.sub(name, t)
    if _EXAMS.search(t):
        t = re.sub(r"\b(jam|jamb|jab|jam b|jumb)\b", "JAMB", t, flags=re.I)
    return t


def _plain(t: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFD", t.lower())
    return re.sub(r"\W+", " ", "".join(c for c in t if unicodedata.category(c) != "Mn")).strip()


def _similar(a: str, b: str) -> bool:
    """The same piece heard twice, tone marks and spelling aside ("Mbẹ mọ" / "Mpẹ́mọ̀, sọ ló")."""
    import difflib

    x, y = _plain(a), _plain(b)
    if not x or not y:
        return False
    if x.startswith(y[: max(3, len(y) // 2)]) or y.startswith(x[: max(3, len(x) // 2)]):
        return True
    return difflib.SequenceMatcher(None, x, y).ratio() >= 0.6


def _contained(late: str, said: str) -> bool:
    """Are these (late) words already part of what was said? Same words, nearly the same order."""
    import difflib

    a, b = re.sub(r"\W+", " ", late.lower()).strip(), re.sub(r"\W+", " ", said.lower()).strip()
    if not a:
        return True
    return a in b or difflib.SequenceMatcher(None, a, b[-len(a) - 20:]).ratio() > 0.75


def _sounds_like(heard: str, said: str) -> float:
    """How much of what was heard is runs of what Jagora said (tone marks and spelling aside): 0 to 1."""
    import difflib

    x, y = _plain(heard), _plain(said)
    if not x or not y:
        return 0.0
    m = difflib.SequenceMatcher(None, x, y, autojunk=False)
    return sum(b.size for b in m.get_matching_blocks() if b.size >= 4) / len(x)


def _heard_before(text: str, earlier: str) -> bool:
    """The voice sending again a sentence she said a while ago (it happens: an old sentence comes back as the end of a new
    one). Most of these letters, in order, are in what she said before."""
    import difflib

    x, y = _plain(text), _plain(earlier)
    if len(x.split()) < 5 or not y:
        return False
    return sum(b.size for b in difflib.SequenceMatcher(None, x, y).get_matching_blocks()) / len(x) >= 0.8


def is_noise(text: str) -> bool:
    """A scrap the microphone caught (one word, a cough read as a word): not something to act on mid-task."""
    words = re.findall(r"\w+", text)
    return len(words) < 2 or len("".join(words)) < 5

SEND_WAIT = 6.0  # seconds a message may wait on her connection before the connection counts as gone
RECONNECT_GRACE = 60.0
HOLD_TASK = 20 * 60.0  # a task still running or waiting for her: kept this long while her app is away
HOLD_MONEY = 60 * 60.0  # a payment in progress (she went to her bank app): kept this long
HOLD_CHECK = 10.0  # seconds between checks while a session is held
VOICE_START_WAIT = 7.0  # seconds for Jagora's LiveKit voice to start a reply before the app says it instead
PAGE_WAIT = 1.5  # seconds Jagora's voice waits for a new page to reach her screen  # seconds a dropped session (and its task) waits for her app to come back
KEEP_FOR_LATER = {"task", "msg", "update", "status", "url", "notify", "account", "speech_end"}


# What her app shows as text must be text. The model sometimes gives an object where a sentence belongs (a choice as
# {"title": ..., "description": ...}); shown as is, that crashes her app. Turned into plain words here, at the one door.
TEXT_FIELDS = {"text", "question", "detail", "name", "title", "label", "what", "note", "amount", "pay_to", "reference",
               "message", "summary", "subtitle", "caption", "quote", "shown"}
TEXT_LISTS = {"choices", "reasons"}


def as_words(v) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float, bool)):
        return str(v)
    if isinstance(v, dict):
        head = next((str(v[k]) for k in ("title", "name", "label", "text", "question") if v.get(k)), "")
        more = next((str(v[k]) for k in ("description", "detail", "subtitle") if v.get(k)), "")
        return (head + (f": {more}" if more and head else more)) or json.dumps(v, ensure_ascii=False)[:200]
    if isinstance(v, list):
        return ", ".join(as_words(x) for x in v)
    return str(v)


def shown_safe(msg: dict) -> dict:
    def fix(d: dict) -> dict:
        out = {}
        for k, v in d.items():
            if k in TEXT_FIELDS and not isinstance(v, str) and v is not None and not (k == "shown" and isinstance(v, list)):
                v = as_words(v)
            elif k in TEXT_LISTS and isinstance(v, list):
                v = [as_words(x) for x in v]
            elif k in ("queue", "steps", "fields", "lines", "picks") and isinstance(v, list):
                v = [fix(x) if isinstance(x, dict) else x for x in v]
            out[k] = v
        return out
    msg = dict(msg)
    for key in ("msg", "patch"):
        if isinstance(msg.get(key), dict):
            msg[key] = fix(msg[key])
    return msg


class Session:
    def __init__(self, ws: WebSocket, user_id: str) -> None:
        self.ws, self.user_id = ws, user_id
        self.lang, self.mode, self.profile = "en", "do", {}
        self.device: dict = {}
        self.files: dict[str, str] = {}  # files she gave in the chat, kept for this session only
        self.translate = False
        self.runs: dict[str, Run] = {}
        self.routes: dict[str, dict] = {}  # chat -> the steps that moved her task on, across her messages
        self.money: dict[str, bool] = {}  # chat -> a payment is in progress there (the session is held for her)
        self._yes_no_again: set[str] = set()  # yes/no questions already asked a second time
        self._she_spoke_at = 0.0  # when she last started talking (her LiveKit voice)
        self._voice_line: tuple | None = None  # (task, text, when) the line Jagora's voice is saying now
        self._voice_began = 0.0  # when the voice last started speaking
        self._last_photo_bytes = 0  # size of the last page photo sent (paces the next one)
        self._resume_times: list[float] = []  # when cut lines were carried on (two in a row at most)
        self._resumed: set[str] = set()  # lines that are the rest of a cut line
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
        # a new page has reached her screen: Jagora does not talk about a page she cannot see yet
        self._page_ready = asyncio.Event()
        self._page_ready.set()
        self._last_url = ""
        self._missed: list[dict] = []
        self._stats_task: asyncio.Task | None = None
        self._voice_spoke = asyncio.Event()  # Jagora's voice on LiveKit started speaking
        # what the live picture did, summed up every few seconds in the session log
        self.stream = {"video_frames": 0, "keyframes": 0, "photos": 0, "bytes": 0, "dropped_busy_line": 0,
                       "skipped_not_viewing": 0, "skipped_no_task": 0, "skipped_no_picture": 0, "encode_failed": 0}
        self.voice_ws: WebSocket | None = None  # Jagora's voice worker on LiveKit, while she talks through it
        self._hearing: str = ""  # the chat bubble showing what the voice hears as she speaks  # chat messages that could not be sent, delivered when she reconnects

    def _cast_mode(self) -> str:
        if self.video:
            if self.lite:
                return "vlite"
            # phones: Chrome only signals a change and full_frame() takes the sharper picture; computers: the
            # screencast frame is already full size, so it is used as is
            return "signal" if (self.browser and self.browser.mobile) or self.device.get("mobile") else "vfull"
        return "lite" if self.lite else "full"

    async def _stream_stats(self) -> None:
        """Every 5 s while the browser is open: what the live picture did (sent, skipped and why), into the log."""
        try:
            while self.browser is not None:
                await asyncio.sleep(5)
                b = self.browser
                seen = b.frames_seen if b else 0
                if b:
                    b.frames_seen = 0
                if seen or any(self.stream.values()):
                    trace.write(self.user_id, "stream", chrome_frames=seen, mode=self._cast_mode(), viewing=self.viewing,
                                video=self.video, task=self.active_task, page=(b.page.url if b and b.page else ""),
                                line_dead=self.ws is self._dead_ws, **self.stream)
                    for k in self.stream:
                        self.stream[k] = 0
        finally:
            self._stats_task = None

    async def send_bytes(self, data: bytes, kind: str = "frame") -> None:
        """Binary messages: the live view (1 = JPEG photo, 2 = video keyframe, 3 = video frame), no base64. A picture
        is never worth waiting for: if the line is busy or gone, this one is skipped (the next one replaces it)."""
        ws = self.ws
        if ws is self._dead_ws or self._send_lock.locked():
            self.stream["dropped_busy_line"] += 1
            if data[:1] in (b"\x02", b"\x03"):
                # a video frame lost: the next frames would smear without it, so the next one is a fresh keyframe
                self._video_key = True
                self._video_kick.set()
            return
        async with self._send_lock:
            try:
                await asyncio.wait_for(ws.send_bytes(data), SEND_WAIT)
                self.sent[kind] += len(data)
                self.stream["bytes"] += len(data)
                k = data[:1]
                self.stream["photos" if k == b"\x01" else "keyframes" if k == b"\x02" else "video_frames"] += 1
                if not self._page_ready.is_set():
                    trace.write(self.user_id, "stream_first_picture_sent", kind={b"\x01": "photo", b"\x02": "keyframe"}.get(k, "video"),
                                bytes=len(data))
                self._page_ready.set()
            except Exception as e:  # noqa: BLE001
                trace.write(self.user_id, "stream_line_dead", error=f"{type(e).__name__}: {str(e)[:200]}")
                self._dead_ws = ws

    async def send(self, msg: dict) -> None:
        """One message to her app. A phone connection can die without saying so (lift, weak signal, screen off): then
        a send could wait forever and hold up everything after it. So a send waits a few seconds at most; after
        that this connection counts as gone, and what she must not miss (the chat, steps, status) is kept and sent
        when her app reconnects (attach)."""
        if msg.get("type") in ("msg", "update"):
            msg = shown_safe(msg)
        trace.sent(self.user_id, msg)
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

    async def keep_payment(self, task: str, data: dict) -> None:
        """Her payment record: saved on the server at once (so it survives anything), and shown or updated in the chat."""
        now = time.time()
        open_ = await db.one("select id, data from payments where user_id=? and chat_id=? and status in ('waiting','paid_by_her') "
                             "order by updated desc limit 1", (self.user_id, task))
        rec = {k: v for k, v in data.items() if v}
        new = True
        if open_:
            old = json.loads(open_["data"])
            same = (not rec.get("reference") or not old.get("reference") or rec.get("reference") == old.get("reference"))
            if same:  # the same payment moving on (even from a later run in this chat)
                rec = {**old, **rec, "id": open_["id"]}
                new = False
        rec.setdefault("id", "pay-" + secrets.token_hex(5))
        rec["updated"] = now
        rec.setdefault("since", now)
        status = rec.get("status") or "waiting"
        await db.exec("insert into payments (id, user_id, chat_id, t, updated, status, data) values (?,?,?,?,?,?,?) "
                      "on conflict(id) do update set updated=excluded.updated, status=excluded.status, data=excluded.data",
                      (rec["id"], self.user_id, task, rec["since"], now, status, json.dumps(rec, ensure_ascii=False)))
        trace.write(self.user_id, "payment", task=task, status=status, what=rec.get("what", ""), amount=rec.get("amount", ""))
        card = {"kind": "payment", **{k: rec.get(k, "") for k in ("what", "amount", "pay_to", "account", "bank", "reference",
                                                                   "status", "note", "site")}, "since": rec["since"], "updated": now}
        if new:
            await self.send({"type": "msg", "task": task, "msg": {"id": rec["id"], **card}})
        else:
            await self.send({"type": "update", "task": task, "id": rec["id"], "patch": card})
        self.money[task] = status in ("waiting", "paid_by_her")

    def held(self) -> float:
        """How long this session is kept for her while her app is away: long while money is moving (she went to pay in
        her bank app) or a task is waiting for her, a minute otherwise."""
        if any(self.money.values()):
            return HOLD_MONEY
        if any(r.busy for r in self.runs.values()):
            return HOLD_TASK
        return RECONNECT_GRACE

    async def close_later(self, ws: WebSocket, grace: float = RECONNECT_GRACE) -> None:
        """The connection dropped: wait for her app to come back before stopping her task. Paying in her bank app or
        checking her NIN somewhere else can take many minutes: the page, the task and her place are kept for her."""
        away = time.time()
        told = False
        await asyncio.sleep(grace)
        while self.ws is ws and SESSIONS.get(self.user_id) is self and grace and time.time() - away < self.held():
            if not told:
                told = True
                trace.write(self.user_id, "session_held", money=any(self.money.values()), minutes=round(self.held() / 60))
                if any(self.money.values()):
                    with contextlib.suppress(Exception):
                        await push.send(self.user_id, "Jagora is keeping your payment",
                                        "Your booking page is kept open for you. Come back to Jagora when you have paid.",
                                        f"/app?chat={next(t for t, on in self.money.items() if on)}", tag="money")
            await asyncio.sleep(HOLD_CHECK)
        if self.ws is ws and SESSIONS.get(self.user_id) is self:
            SESSIONS.pop(self.user_id, None)
            await self.close()

    async def close(self) -> None:
        await self._to_voice({"type": "bye"})  # the voice worker leaves too, instead of talking into a closed session
        for r in self.runs.values():
            if r.busy:
                r.job.cancel()
        self._speaker.cancel()
        self.video = False
        if self._video_task:
            self._video_task.cancel()
        if self.browser:
            b, self.browser = self.browser, None
            await keep_signins(self.user_id, b)
            try:
                await asyncio.wait_for(b.close(), 8)  # a stuck browser must never hold anything up
            except Exception:  # noqa: BLE001
                b.kill()

    async def get_browser(self) -> Browser:
        if self.browser is None:
            b = Browser(self.device)
            try:
                # Chrome normally starts in about 2 s; one that never does must not leave her task waiting for ever
                self.browser = await asyncio.wait_for(b.start(load_signins(self.user_id)), 45)
            except asyncio.TimeoutError:
                trace.write(self.user_id, "browser_start_timed_out")
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(b.close(), 8)
                raise RuntimeError("the browser did not start; try again in a moment") from None
            uid = self.user_id
            self.browser.on_log = lambda what, **d: trace.write(uid, "browser_" + what, **d)
            trace.write(uid, "browser_started", viewport=self.browser.viewport, mobile=self.browser.mobile,
                        device=self.device, cast=self._cast_mode())
            if not self._stats_task:
                self._stats_task = asyncio.create_task(self._stream_stats())
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
            self.stream["skipped_not_viewing"] += 1
            return
        if not self.active_task:
            self.stream["skipped_no_task"] += 1
        self._latest_jpeg = base64.b64decode(jpeg)
        now = time.monotonic()
        if self._frame_busy or now - self._last_frame < self._photo_gap() or not self.active_task:
            if not self._frame_busy:
                asyncio.get_running_loop().call_later(lite.FRAME_GAP["full"], self._resend_latest)
            return
        self._last_frame = now
        asyncio.ensure_future(self._send_photo(self._latest_jpeg))

    def _resend_latest(self) -> None:
        # the newest picture after a burst, so the view always ends on the page as it is now
        if not self.video and self.viewing and self._latest_jpeg and not self._frame_busy and time.monotonic() - self._last_frame >= self._photo_gap():
            self._last_frame = time.monotonic()
            asyncio.ensure_future(self._send_photo(self._latest_jpeg))

    def _photo_gap(self) -> float:
        """Seconds before the next photo of the page: never faster than the frame cap, and slow enough that the
        pictures stay within a byte budget. Without it a computer screen sent ~1 MB a second of photos, her line
        filled up, and the chat steps and replies arrived long after Jagora had said them."""
        mode = "lite" if self.lite else "full"
        return max(lite.FRAME_GAP[mode], self._last_photo_bytes / lite.PHOTO_BUDGET[mode])

    async def _send_photo(self, jpeg: bytes) -> None:
        self._last_photo_bytes = len(jpeg)
        self._frame_busy = True
        try:
            await self.send_bytes(b"\x01" + jpeg)
        finally:
            self._frame_busy = False

    async def set_video(self, on: bool) -> None:
        if on != self.video:
            trace.write(self.user_id, "stream_video", on=on, note="" if on else "photos instead of video")
        if on == self.video:
            if on:
                self._video_key = True
                self._video_kick.set()
            return
        self.video = on
        if self.browser:
            await self.browser.set_cast(self._cast_mode())
        if not on and self.browser and self.browser.page and self.viewing:
            # back to photos (her app could not show the video): send the page as it is now, without waiting for it
            # to change
            try:
                jpeg = await self.browser.full_frame()
            except Exception:  # noqa: BLE001
                jpeg = None
            if jpeg:
                await self._send_photo(jpeg)
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
                    self.stream["skipped_not_viewing" if not self.viewing else "skipped_no_task"] += 1
                    continue
                wait = last + lite.VIDEO_GAP["lite" if self.lite else "full"] - time.monotonic()
                if wait > 0:
                    await asyncio.sleep(wait)
                    self._video_kick.clear()  # this frame covers changes made while waiting
                last = time.monotonic()
                jpeg = await b.full_frame() if self._cast_mode() == "signal" else self._latest_jpeg
                if not jpeg and self._cast_mode() != "signal":
                    # no screencast picture yet (a still page sends none): take one directly
                    try:
                        jpeg = await b.full_frame()
                    except Exception:  # noqa: BLE001
                        jpeg = None
                if not jpeg:
                    self.stream["skipped_no_picture"] += 1
                    # the page was busy (loading, or Jagora reading it for itself): try again shortly. A still page
                    # sends no more change signals, so without this her screen could stay on "Opening the page"
                    asyncio.get_running_loop().call_later(0.4, self._video_kick.set)
                    continue
                w, h = video.jpeg_size(jpeg)
                if enc is None or (enc.w, enc.h) != (w - w % 2, h - h % 2) or enc.lite != self.lite:
                    if enc:
                        enc.close()
                    enc = video.Encoder(w, h, lite=self.lite)
                    self._video_key = True
                    trace.write(self.user_id, "stream_encoder", width=w, height=h, lite=self.lite)
                key, self._video_key = self._video_key, False
                try:
                    out = await asyncio.to_thread(enc.encode, jpeg, int(last * 1000), key)
                except Exception as e:  # noqa: BLE001
                    log.warning("video encode failed: %s", e)
                    self.stream["encode_failed"] += 1
                    trace.write(self.user_id, "stream_encode_failed", error=str(e)[:200])
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
            # a page is opening: wait a moment (1.5 s at most) so she can see it as Jagora talks about it. Never longer:
            # a page that does not show must never hold back what Jagora says (it used to wait 6 s for every line,
            # and her next words then dropped the reply before it was said)
            if not self._page_ready.is_set() and self.viewing:
                try:
                    await asyncio.wait_for(self._page_ready.wait(), PAGE_WAIT)
                except asyncio.TimeoutError:
                    trace.write(self.user_id, "speech_did_not_wait_for_page", note="no picture reached her screen in time")
                    self._page_ready.set()  # the next lines do not wait again
                if gen != self._gen:
                    continue
            if self.voice_ws is not None:
                was_speaking = self.voice_speaking
                self._voice_spoke.clear()
                if await self._to_voice({"type": "say", "text": speech.speakable(text, lang), "lang": lang}):
                    self._voice_line = (task, text, time.time())
                    trace.write(self.user_id, "say_sent_to_voice", chars=len(text))
                    if was_speaking:
                        continue  # it queues after what it is saying now
                    # Jagora's voice on LiveKit says it. If it has not started within a few seconds (it failed on
                    # this text, or the voice is stuck), the reply is spoken the other way, so she always hears it
                    sent_at = time.time()
                    try:
                        await asyncio.wait_for(self._voice_spoke.wait(), VOICE_START_WAIT)
                        continue
                    except asyncio.TimeoutError:
                        if gen != self._gen or self._she_spoke_at > sent_at:
                            # she started talking meanwhile (that is why the voice held it back): this reply is out
                            # of date, so it stays written in the chat and is not read out late over her
                            trace.write(self.user_id, "late_reply_not_spoken", text=text[:120])
                            continue
                        if text in self._resumed:
                            # the rest of a cut line, and the voice is gone (she ended Live): it stays in the chat
                            trace.write(self.user_id, "resume_not_spoken", text=text[:120])
                            continue
                        trace.write(self.user_id, "voice_did_not_speak", note="spoken through the app instead", text=text[:200])
                        await self._to_voice({"type": "hush"})
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

                t_voice, first = time.monotonic(), True
                async for i, rate, pcm in speech.speak_stream(text, lang):
                    if gen != self._gen:
                        break
                    if first:
                        first = False
                        log.info("timing voice: first sound after %.1fs (%d characters)", time.monotonic() - t_voice, len(text))
                    if i != at:  # a new sentence: finish the last one, start fresh
                        if fx:
                            await out(at, last_rate, fx.flush())
                        fx, at, last_rate = voicefx.Stretcher(rate), i, rate
                    await out(i, rate, fx.feed(pcm))
                if fx and gen == self._gen:
                    await out(at, last_rate, fx.flush())
                trace.write(self.user_id, "spoken_through_app", chars=len(text), sound=not first,
                            first_sound_s=None if first else round(time.monotonic() - t_voice, 1), cut_short=gen != self._gen)
            except Exception as e:  # noqa: BLE001
                log.warning("speech failed: %s", e)
                trace.write(self.user_id, "speech_failed", error=f"{type(e).__name__}: {str(e)[:200]}")
            if gen == self._gen:
                self._speaking = None
            if self._speech_q.empty() and gen == self._gen:
                await self.send({"type": "speech_end", "task": task})

    async def silence(self, task: str) -> None:
        """She said stop: Jagora goes quiet on her phone at once and the task stops."""
        self.hush()
        self._unsaid = None
        self._reset_turn()
        r = self.runs.get(task)
        if r and r.busy and r.job:
            r.job.cancel()
        await self.send({"type": "silence", "task": task})
        await self.send({"type": "status", "task": task, "status": "stopped"})
        await self.send({"type": "orb", "state": "idle"})

    def hush(self, heard: int | None = None) -> None:
        """Stop talking. What was not said yet is kept for a minute (from the sentence she was hearing when she cut
        in), so "continue" picks up there, the way LiveKit resumes after an interruption."""
        rest: list[str] = []
        task = ""
        if self._speaking:
            task, text, _ = self._speaking
            parts = speech.chunks(speech.speakable(text, self.lang))
            rest += parts[max(0, min(int(heard or 0), len(parts) - 1)):]  # from the start of the piece she was hearing
        while not self._speech_q.empty():
            t, text, _, _ = self._speech_q.get_nowait()
            task = task or t
            rest.append(text)
        self._speaking = None
        if rest:
            self._unsaid = (task, " ".join(rest), time.time())
        self._gen += 1
        if self.voice_ws is not None:
            asyncio.ensure_future(self._to_voice({"type": "hush"}))

    @staticmethod
    def _still_to_say(text: str, seconds: float) -> str:
        """The part of a line not yet heard after `seconds` of speaking, from the start of the sentence it was in.
        Jagora's voice says about 10 characters a second (measured on its Yorùbá and English replies)."""
        plain = re.sub(r"\*\*|__|`", "", text)
        at = int(max(0.0, seconds - 0.4) * 10)
        if at >= len(plain) - 15:
            return ""  # all of it, or nearly, was said
        starts = [0] + [m.end() for m in re.finditer(r"[.!?]\s+|\n+", plain) if m.end() <= at]
        return plain[max(starts):].strip()

    def resume(self, task: str) -> bool:
        """Carry on with what was interrupted, if it was recent."""
        if not self._unsaid or time.time() - self._unsaid[2] > 90:
            return False
        t, text, _ = self._unsaid
        self._unsaid = None
        self._resumed.add(text)
        self.speak(t or task, text)
        return True

    def speak(self, task: str, text: str) -> None:
        trace.write(self.user_id, "speak", task=task, text=text, lang=self.lang, through="livekit" if self.voice_ws else "app")
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
        if PAID.search(heard) and len(words) <= 8:
            return False  # "I have sent the money": hers, even though Jagora said those words just before (it asked her to)
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
        if kind == "clientlog":
            # her app's side of the story (Live on/off, mic, orb, the live picture, the player)
            trace.write(self.user_id, "app_" + str(ev.get("event") or "event")[:40],
                        **{k: v for k, v in ev.items() if k not in ("type", "event")})
            return
        if kind not in ("input",) or (ev.get("input") or {}).get("action") != "scroll":
            trace.write(self.user_id, "from_app", **{k: ("[hidden]" if kind == "secret" and k in ("value", "values") else v)
                                                     for k, v in ev.items() if k not in ("screen", "history", "profile")})
        if isinstance(ev.get("screen"), str):
            self.screen = ev["screen"][:2000]
        task = str(ev.get("task") or "")
        if task:
            self.active_task = task
        if isinstance(ev.get("device"), dict) and ev["device"].get("w") and self.browser is None:
            self.device = ev["device"]  # her screen, so a page opened later (also by voice) fits it
        if kind in ("start", "focus", "answer", "audio", "video") and not self.viewing:
            # she is using the app, so she is looking (a phone that slept had said "not looking" and never took it back)
            self.viewing = True
            trace.write(self.user_id, "viewing_again", because=kind)
            self._video_key = True
            self._video_kick.set()
        if kind == "net":
            await self.set_lite(bool(ev.get("lite")))
            return
        if kind == "focus":
            # the chat she has open, and the language she chose in the app: the LiveKit voice listens in that
            # language (its ASR is told which one, so Yorùbá is heard as Yorùbá) and speaks it
            lang = str(ev.get("lang") or "")
            if lang in ("en", "yo", "ha", "ig", "pcm") and lang != self.lang:
                self.lang = lang
                # the language is hers, not the chat's: a task already running answers in the new one from its next step
                for run in self.runs.values():
                    if run.busy and run.agent is not None:
                        run.agent.lang = lang
            await self._to_voice({"type": "lang", "lang": self.lang})
            if ev.get("opening") and task:
                asyncio.create_task(self._welcome_back(task))
            return
        if kind == "media_done" and ev.get("list_end"):
            # the last video of a list ended (she watched them all, like episodes): which one did she like?
            names = [str(x)[:80] for x in (ev.get("names") or [])][:8]
            r = self.runs.get(task)
            if not (r and r.busy):
                line = LIST_DONE.get(self.lang, LIST_DONE["en"]).format(n=len(names) or "all")
                await self.agent_says(task, line)
                trace.write(self.user_id, "list_done", names=names)
            return
        if kind == "media_done":
            # she finished a lesson (or a video): well done, and practice on it if she wants
            name = str(ev.get("name") or "")[:90]
            done, total = int(ev.get("done") or 0), int(ev.get("total") or 0)
            line = WELL_DONE.get(self.lang, WELL_DONE["en"]).format(x=name, d=done, n=total or done, m=int(ev.get("minutes") or 0))
            await self.agent_says(task, line)
            trace.write(self.user_id, "lesson_done", name=name, course=ev.get("course"), done=done, total=total)
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
            vals = ev.get("values")
            self._resolve(task, str(ev.get("id")), {"value": str(ev.get("value") or ""), "save": bool(ev.get("save")),
                                                    **({"values": {str(k): str(v or "")[:300] for k, v in vals.items()}}
                                                       if isinstance(vals, dict) else {})})
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
            await self.silence(task)

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

    # ---- her live voice: streamed to the recogniser while she speaks ----------------------------------------------

    # ---- her voice through LiveKit (voice/agent.py) --------------------------------------------------------------

    def attach_voice(self, ws: WebSocket) -> None:
        self.voice_ws = ws
        self._reset_turn()  # a new call: her words start a new bubble in the chat she has open now
        log.info("voice on LiveKit for %s", self.user_id[:8])
        asyncio.create_task(self._to_voice({"type": "lang", "lang": self.lang}))
        asyncio.create_task(self.send({"type": "voice", "on": True}))

    def detach_voice(self, ws: WebSocket) -> None:
        if self.voice_ws is ws:
            self.voice_ws = None
            self._hearing = ""
            asyncio.create_task(self.send({"type": "voice", "on": False}))

    async def _to_voice(self, msg: dict) -> bool:
        ws = self.voice_ws
        if ws is None:
            return False
        try:
            await asyncio.wait_for(ws.send_text(json.dumps(msg, ensure_ascii=False)), SEND_WAIT)
            return True
        except Exception:  # noqa: BLE001
            self.voice_ws = None
            return False

    async def on_voice(self, ev: dict) -> None:
        """Her voice on LiveKit. What she says is gathered into ONE message: pieces the voice sends at each pause are
        joined, and Jagora answers only when she has really finished (no new words for TURN_GAP seconds), so a
        thought said with pauses gets one answer, not one per piece."""
        kind = ev.get("type")
        trace.write(self.user_id, "voice_" + str(kind), **{k: v for k, v in ev.items() if k != "type"})
        task = self.active_task
        if kind == "partial":
            text = str(ev.get("text") or "").strip()
            if not text or not task:
                return
            if (self._speaking or self.voice_speaking) and is_stop(text):
                await self.silence(task)  # "stop" while Jagora talks: quiet at once
                return
            self._wait_more()  # she is still talking
            self._partial = self._merge_piece(text)
            await self._show_turn(task)
            # if the voice never says she stopped (it happens in Yorùbá: pieces keep coming, then nothing), what she
            # said is still answered a few seconds after the last piece, instead of waiting for ever
            self._flush_later(task, TURN_GAP + 2.5)
        elif kind == "words":
            text = str(ev.get("text") or "").strip()
            if not task or not text:
                return
            if self._flushed and time.time() - self._flushed[1] < 20 and _contained(text, self._flushed[0]):
                # the voice's late turn end for words already answered from what was showing: not a new message
                trace.write(self.user_id, "voice_words_already_answered", text=text)
                self._flushed = None
                return
            if is_stop(text):
                self._reset_turn()
                await self.silence(task)
                return
            if time.time() - self._asked_again > 60 and any(time.time() - t < 300 and _heard_before(text, said)
                                                             for t, said in self._sent_turns):
                # an old sentence of hers sent again by the voice (she did not say it again: it is already answered)
                trace.write(self.user_id, "voice_words_old_again", text=text[:160])
                if self._turn or self._pieces or self._partial:
                    self._flush_later(task, TURN_GAP)
                return
            self._wait_more()
            # earlier pieces of this sentence the final words do not cover are kept in front of them (the voice in
            # Yorùbá sends pieces of a long sentence one by one, and sometimes ends only the last one)
            self._turn.extend(p for p in self._pieces if not _similar(p, text) and not _contained(p, text))
            self._turn.append(text)
            self._pieces = []
            self._partial = ""
            await self._show_turn(task)
            self._flush_later(task, TURN_GAP)
        elif kind == "state":
            state = str(ev.get("agent") or "")
            self.voice_speaking = state == "speaking"
            if state == "speaking":
                self._voice_began = time.time()
                self._voice_spoke.set()
                self._page_ready.set()
                await self.send({"type": "orb", "state": "speaking"})
            elif state == "listening":
                if self._voice_line and time.time() - self._she_spoke_at < 2.5 and self._voice_line[2] < self._she_spoke_at:
                    # cut off by a sound she made (or the room): kept, so it carries on if that was not really her
                    rest = self._still_to_say(self._voice_line[1], time.time() - max(self._voice_began, self._voice_line[2]))
                    tries = sum(1 for t in self._resume_times if time.time() - t < 90)
                    # what was cut is carried on from the sentence it stopped in (never from the start again), and a
                    # line cut again and again (a TV in the room) is left in the chat after two tries
                    self._unsaid = (self._voice_line[0], rest, time.time()) if rest and tries < 2 else None
                    if self._unsaid:
                        self._resume_times.append(time.time())
                    trace.write(self.user_id, "voice_cut_off", text=self._voice_line[1][:120], rest=rest[:80], tries=tries)
                self._voice_line = None
                await self.send({"type": "orb", "state": "listening"})
                await self.send({"type": "speech_end", "task": task})
        elif kind == "stall":
            # the voice noticed a quiet moment after her words: Jagora's server is gathering her message or working on
            # it, so nothing is said (an "I'm here" here talked over her and over real answers)
            pass
        elif kind == "user" and ev.get("state") == "speaking":
            self._she_spoke_at = time.time()
            self._wait_more()  # she started again: her next words join this message
            await self.send({"type": "orb", "state": "listening"})
            await self.send({"type": "sound", "do": "duck"})  # anything playing on her screen goes quiet at once
        elif kind == "user" and ev.get("state") in ("listening", "away") and not (self._partial or self._turn):
            await self.send({"type": "sound", "do": "unduck"})  # it was not words: back to normal
        elif kind == "user" and ev.get("state") in ("listening", "away") and task and (self._partial or self._turn):
            # she stopped. If the voice never ends her turn (sometimes it waits for more words), what is showing is
            # answered after a longer moment
            self._flush_later(task, TURN_GAP if not self._partial else TURN_GAP + 1.4)

    voice_speaking = False
    _hearing_task = ""
    _partial = ""  # words showing now, not yet ended by the voice
    _pieces: list = []  # the pieces those words came in (a new piece is added, a corrected one replaces its older form)

    def _merge_piece(self, text: str) -> str:
        """The voice's words so far, from pieces that may each be a correction of an earlier one or a new part of a
        long sentence. Only replacing the shown words with the newest piece lost everything she said before it."""
        pieces = list(self._pieces)
        for i, p in enumerate(pieces):
            if _similar(p, text) or _contained(p, text) or _contained(text, p):
                pieces[i] = text if len(text) >= len(p) * 0.6 else p
                break
        else:
            pieces.append(text)
        self._pieces = pieces[-12:]
        return " ".join(self._pieces)
    _sent_turns: list = []  # (when, what) she said lately, so an old sentence the voice sends again is not taken as new
    _asked_again = 0.0  # when she was last asked to say it again (never twice in a row)
    _flushed: tuple[str, float] | None = None  # a message taken from the words showing, before the voice ended it
    _flush: asyncio.Task | None = None

    @property
    def _turn(self) -> list[str]:
        if not hasattr(self, "_turn_parts"):
            self._turn_parts: list[str] = []
        return self._turn_parts

    def _wait_more(self) -> None:
        if self._flush:
            self._flush.cancel()
            self._flush = None

    def _reset_turn(self) -> None:
        self._wait_more()
        self._turn.clear()
        self._partial = ""
        self._pieces = []
        self._hearing = ""

    async def _show_turn(self, task: str) -> None:
        """One chat bubble for the whole message as it grows."""
        text = " ".join(self._turn + ([self._partial] if self._partial else []))
        if not self._hearing or self._hearing_task != task:
            self._hearing, self._hearing_task = mid(), task
            await self.send({"type": "msg", "task": task, "msg": {"id": self._hearing, "kind": "user", "text": text, "voice": True, "lang": self.lang}})
        else:
            await self.send({"type": "update", "task": task, "id": self._hearing, "patch": {"text": text}})

    def _flush_later(self, task: str, wait: float) -> None:
        self._wait_more()
        self._flush = asyncio.create_task(self._flush_turn(task, wait))

    async def _gate(self, task: str, text: str) -> str:
        """Before anything happens: was this really her, talking to Jagora? A quick check (the fast model, a second
        or so) with what is on her screen and the last lines of the chat: ACT (a request or answer for Jagora),
        IGNORE (silence the recogniser filled with made-up words, a film or TV, her talking to someone else, words
        Jagora already answered), or UNCLEAR (for Jagora, but the words make no sense)."""
        if is_stop(text) or CHECKIN.search(text) or (YES.search(text) or NO.search(text)) and len(text.split()) <= 4:
            return "act"
        if time.time() - self._asked_again < 60:
            return "act"  # Jagora asked her to say it again: this is her saying it again
        r = self.runs.get(task)
        if r and r.waiting and len(text.split()) <= 6:
            return "act"  # a short answer to Jagora's question (a long one is checked: the room can answer it too)
        try:
            convo = await db.history(self.user_id, task, 6)
        except Exception:  # noqa: BLE001
            convo = []
        lines = "\n".join(f"{'Her' if m.get('role') == 'user' else 'Jagora'}: {str(m.get('text', ''))[:200]}" for m in convo)
        prompt = (f"Jagora is a voice assistant. Her microphone is open in a room in Nigeria. This was just heard "
                  f"(speech recognition, language {self.lang}): \"{text}\"\n\nThe chat so far:\n{lines or '(nothing yet)'}\n\n"
                  f"Her screen now:\n{(self.screen or '')[:900]}\n\nJagora is {'working on a task' if r and r.busy else 'not busy'}.\n\n"
                  "Speech recognition for Yorùbá, Hausa and Igbo spells English words by their sound and mishears some words "
                  "(\"dán lóòdì\" is download, \"brókè\" is brochure): judge by what she most likely said. A request "
                  "after Jagora has just answered (download it, more about it, another one) is for Jagora.\n\n"
                  "Is this her talking to Jagora? Reply with one word:\n"
                  "ACT - a request, question or answer for Jagora (even short, even repeated on purpose, or asking Jagora "
                  "to repeat or say more)\n"
                  "IGNORE - not for Jagora: words a speech recogniser makes up from silence or noise, a film or TV or song "
                  "playing, her talking to someone else, or an exact echo of words she said a moment ago\n"
                  "UNCLEAR - meant for Jagora but the words make no sense")
        try:
            m = _model()
            # the model thinks before it answers: it needs room for that (with 10 tokens it never answered, and every
            # message waited for the time-out)
            rep = await asyncio.wait_for(m.chat([{"role": "user", "content": prompt}], None, effort=settings.effort_fast,
                                                max_tokens=400, kind="gate"), 6)
            word = (rep.text or "").strip().upper()
        except Exception as e:  # noqa: BLE001
            trace.write(self.user_id, "voice_gate_failed", error=f"{type(e).__name__}: {str(e)[:160]}")
            return "act"  # when unsure, do not lose her request
        verdict = "ignore" if word.startswith("IGNORE") else "unclear" if word.startswith("UNCLEAR") else "act"
        if verdict == "ignore" and len(text.split()) >= 5 and "Playing on her screen now" not in (self.screen or "") \
                and not self.echo(text) and not (self._unsaid and time.time() - self._unsaid[2] < 20):
            # nothing is playing that Jagora knows of and these are many real words: most likely her, badly heard.
            # Silence is the worst answer: in a chat already going, Jagora works it out from the chat (and asks if it
            # still cannot); in a new one it asks her to say it again
            trace.write(self.user_id, "voice_gate_overruled", text=text[:160])
            verdict = "act" if convo else "unclear"
        trace.write(self.user_id, "voice_gate", text=text, verdict=verdict)
        return verdict

    async def _flush_turn(self, task: str, wait: float) -> None:
        try:
            await asyncio.sleep(wait)
        except asyncio.CancelledError:
            return
        self._flush = None
        text = fix_heard(" ".join(self._turn + ([self._partial] if self._partial else [])).strip())
        from_partial = bool(self._partial)
        msg_id = self._hearing if self._hearing and self._hearing_task == task else None
        self._turn.clear()
        self._partial = ""
        self._pieces = []
        self._hearing = ""
        if not text:
            return
        trace.write(self.user_id, "voice_message", text=text, from_partial=from_partial)
        self._sent_turns = [x for x in self._sent_turns if time.time() - x[0] < 300][-8:] + [(time.time(), text)]
        self._flushed = (text, time.time()) if from_partial else None
        if is_noise(text):
            # a scrap the room made (a word from the TV, a cough heard as a word): not her, so nothing happens
            log.info("voice: ignored a scrap: %r", text[:40])
            if msg_id:
                await self.send({"type": "drop", "task": task, "id": msg_id})
            await self.send({"type": "sound", "do": "unduck"})
            if self._unsaid and time.time() - self._unsaid[2] < 30:
                trace.write(self.user_id, "voice_resumed", text=self._unsaid[1][:120])
                self.resume(task)
            await self.settle(task)
            return
        # Jagora was talking when this was "heard" (its voice was cut by it) and the words sound like Jagora's own: the
        # phone's microphone picked up its speaker. Not her: dropped, and Jagora says the rest of what it was saying
        if self._unsaid and time.time() - self._unsaid[2] < 20:
            mine = max([_sounds_like(text, self._unsaid[1])] + [_sounds_like(text, said) for at, said in self._said
                                                                 if time.time() - at < 90] or [0.0])
            if mine >= 0.35:
                trace.write(self.user_id, "voice_echo_dropped", text=text[:160], like=round(mine, 2))
                if msg_id:
                    await self.send({"type": "drop", "task": task, "id": msg_id})
                await self.send({"type": "sound", "do": "unduck"})
                trace.write(self.user_id, "voice_resumed", text=self._unsaid[1][:120])
                self.resume(task)
                await self.settle(task)
                return
        # she has said more: anything Jagora had not said yet is out of date, so it is dropped and the answer covers
        # everything she said. Whatever plays on her screen pauses while Jagora deals with it, and plays on after,
        # unless what she said was about it (Jagora then pauses, closes or changes it itself)
        verdict = await self._gate(task, text)
        if verdict == "ignore" or (verdict == "unclear" and time.time() - self._asked_again < 90):
            # not her talking to Jagora (or she was already asked to say it again): nothing happens, nothing repeats,
            # and what Jagora was saying when that sound cut it off is said to the end
            if msg_id:
                await self.send({"type": "drop", "task": task, "id": msg_id})
            await self.send({"type": "sound", "do": "unduck"})
            if self._unsaid and time.time() - self._unsaid[2] < 30:
                trace.write(self.user_id, "voice_resumed", text=self._unsaid[1][:120])
                self.resume(task)
            await self.settle(task)
            return
        if verdict == "unclear":
            self._asked_again = time.time()
            if msg_id:
                await self.send({"type": "update", "task": task, "id": msg_id, "patch": {"text": text}})
            await self.agent_says(task, AGAIN.get(self.lang, AGAIN["en"]))
            await self.send({"type": "sound", "do": "unduck"})
            await self.settle(task)
            return
        self.hush()
        await self.send({"type": "sound", "do": "hold"})
        await self.heard(task, msg_id, text, self.lang, None)
        r = self.runs.get(task)
        if r and r.job and not r.job.done():
            r.job.add_done_callback(lambda _: asyncio.ensure_future(self.send({"type": "sound", "do": "release"})))
        else:
            await self.send({"type": "sound", "do": "release"})

    async def on_binary(self, data: bytes) -> None:
        """Binary messages from her app: none are used now (her live voice goes through LiveKit)."""
        return

    async def on_audio(self, task: str, ev: dict) -> None:
        lang = ev.get("lang") or self.lang
        msg_id = ev.get("id")
        try:
            audio = base64.b64decode(ev.get("data") or "")
            t_asr = time.monotonic()
            text = fix_heard(await speech.transcribe(audio, lang))
            trace.write(self.user_id, "voice_note_transcribed", seconds=round(time.monotonic() - t_asr, 2),
                        kb=len(audio) // 1024, lang=lang, via="storm box" if speech.STORM_ASR_WS else "developer api")
        except Exception as e:  # noqa: BLE001
            log.warning("transcription failed: %s", e)
            text = ""
        await self.heard(task, msg_id, text, lang, ev.get("history"))

    async def _welcome_back(self, task: str) -> None:
        """Live starts inside a chat that already has a story: Jagora opens with one short line that picks it up
        ("Shall we go on with your Python course, lesson 4?", "Which film today?"), from this chat's own memory."""
        r = self.runs.get(task)
        if r and r.busy:
            return
        row = await db.one("select note from chat_notes where user_id=? and chat_id=?", (self.user_id, task))
        if not row:
            return
        names = {"en": "English", "pcm": "Nigerian Pidgin", "yo": "Yoruba", "ha": "Hausa", "ig": "Igbo"}
        prompt = (f"You are Jagora, a warm voice assistant. She just opened a live voice call inside this chat. The chat's "
                  f"memory:\n{row['note']}\n\nHer screen:\n{(self.screen or '')[:700]}\n\nWrite ONE short spoken line in "
                  f"{names.get(self.lang, 'English')} (proper spelling and tone marks) that picks up where this chat stopped "
                  "and offers the natural next step as a question, e.g. go on with the next lesson, another film, the next "
                  "thing on her list. No greeting words like hello, no title or name for her. Only the line.")
        try:
            rep = await asyncio.wait_for(_model().chat([{"role": "user", "content": prompt}], None, effort=settings.effort_fast,
                                                       max_tokens=500, kind="welcome"), 8)
            line = (rep.text or "").strip().strip('"')[:300]
        except Exception:  # noqa: BLE001
            return
        if line and not (self.runs.get(task) and self.runs[task].busy):
            trace.write(self.user_id, "welcome_back", task=task, line=line)
            await self.agent_says(task, line)

    async def settle(self, task: str) -> None:
        """Nothing new was started for her words: her app must not stay on "working" (the client marks a chat
        working as soon as she sends something)."""
        r = self.runs.get(task)
        if not (r and r.busy):
            await self.send({"type": "status", "task": task, "status": "done"})
            if self._speech_q.empty() and not self._speaking:
                await self.send({"type": "orb", "state": "idle"})

    async def heard(self, task: str, msg_id, text: str, lang: str, history) -> None:
        """Her words, however they came (live stream or a voice note): answered, or dropped if only a noise or echo."""
        trace.write(self.user_id, "heard", task=task, text=text, lang=lang, echo=bool(text) and self.echo(text))
        if (not text or self.echo(text)) and self._unsaid and time.time() - self._unsaid[2] < 6:
            # she cut in, but it was only a noise (or Jagora's own voice): carry on reading
            if msg_id:
                await self.send({"type": "drop", "task": task, "id": msg_id})
            self.resume(task)
            await self.settle(task)
            return
        if not text:
            note = {"en": "I didn't catch that. Please say it again.", "pcm": "I no hear am well. Abeg talk am again.",
                    "yo": "Mi ò gbọ́ ọ dáadáa. Ẹ jọ̀ọ́ ẹ tún sọ ọ́.", "ha": "Ban ji ba sosai. Don Allah ka sake fada.",
                    "ig": "Anụghị m nke ọma. Biko kwuo ya ọzọ."}.get(lang, "I didn't catch that.")
            if msg_id:
                await self.send({"type": "update", "task": task, "id": msg_id, "patch": {"text": "", "heard": False}})
            await self.agent_says(task, note)
            await self.settle(task)
            return
        if self.echo(text):
            # her phone's microphone heard Jagora's own voice: not her words, so nothing is answered
            log.info("dropped echo of Jagora's own words")
            if msg_id:
                await self.send({"type": "drop", "task": task, "id": msg_id})
            await self.settle(task)
            return
        if msg_id:
            await self.send({"type": "update", "task": task, "id": msg_id, "patch": {"text": text}})
        else:
            await self.send({"type": "msg", "task": task, "msg": {"id": mid(), "kind": "user", "text": text, "voice": True, "lang": self.lang}})
        await self.on_words(task, text, None, history)

    async def on_words(self, task: str, text: str, attachment: dict | None, history: list | None) -> None:
        """Whatever she said or typed: an answer to a waiting question, words for the running agent, or a new request."""
        if text and CONTINUE.search(text) and len(text.split()) <= 5 and self.resume(task):
            await self.settle(task)
            return  # "continue": she wants the rest of what Jagora was saying
        r = self.runs.get(task)
        open_q = list(r.waiting.values())[-1][0] if r and r.waiting else ""
        if text and is_stop(text) and open_q != "confirm":
            # "stop" / "shut up" / "dákẹ́": silence at once and stop the task, no "Okay" on top
            await self.silence(task)
            return
        if r and r.waiting and text:
            # answer the most recent open question with her words
            mid_, (kind, fut) = list(r.waiting.items())[-1]
            if kind == "confirm":
                if PAID.search(text) and not NO.search(text):
                    self._resolve(task, mid_, "yes")
                    return
                if YES.search(text) or NO.search(text):
                    self._resolve(task, mid_, "yes" if YES.search(text) and not NO.search(text) else "no")
                    return
                if not is_noise(text) and mid_ not in self._yes_no_again and len(text.split()) < 12:
                    # words that are neither yes nor no (often the room, the TV, or a misheard word): asked once more
                    # instead of being taken as a no, which would stop her task for nothing
                    self._yes_no_again.add(mid_)
                    await self.agent_says(task, AGAIN_YES.get(self.lang, AGAIN_YES["en"]))
                    return
                if not is_noise(text):
                    # she said something else instead of yes or no: that is not a yes. The question closes and
                    # Jagora goes by what she said (it never sits waiting on a question she has moved past)
                    await self.send({"type": "update", "task": task, "id": mid_, "patch": {"status": "no"}})
                    await r.steer.put(text)
                    self._resolve(task, mid_, "no")
                    return
            elif kind in ("choice", "handoff", "point"):
                self._resolve(task, mid_, text)
                return
        if text and REPEAT_ASK.search(text) and len(text.split()) <= 8 and self._said:
            # "say that again": the last thing Jagora said, again, at once
            self.speak(task, self._said[-1][1])
            await self.settle(task)
            return
        if text and CHECKIN.search(text) and len(text.split()) <= 9:
            # "are you there?": answer at once; it is not a new request and does not interrupt the work
            self.speak(task, (HERE if r and r.busy else HERE_IDLE).get(self.lang, HERE["en"]))
            await self.settle(task)
            return
        if r and r.busy:
            # she spoke while it works: Jagora takes it into account at its next step and carries on from where it
            # is (no spoken "okay": the chat already shows her words). Scraps of noise are not acted on.
            if text and not is_noise(text):
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
            carry = self.routes.setdefault(task, {"goal": goal, "steps": []})
            carry["steps"] = carry["steps"][-120:]
            agent = Agent(model, self.browser, io, **_muse_extras(model), route_carry=carry, lang=self.lang, mode=self.mode, profile=self.profile,
                          conversation=convo[-14:], attachment=attachment, browser_factory=self.get_browser,
                          steering=r.steer, user_id=self.user_id, on_watch=io.watch, screen=lambda: self.screen,
                          memory=DbMemory(self.user_id, task, self.lang, self.mode, self.profile), pause_gate=r.free.wait,
                          vault=Vault(db, self.user_id) if not self.user_id.startswith("guest-") else None, files=self.files)
            r.agent = agent
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
            trace.write(self.user_id, "error", where="run", error=f"{type(e).__name__}: {e}")
            await db.log(self.user_id, "error", f"{goal[:200]} | {type(e).__name__}: {str(e)[:200]}")
            await self.agent_says(task, "Something went wrong on my side. Please try again." if "META" not in str(e)
                                  else "Jagora's brain is not connected yet.")
            await self.send({"type": "status", "task": task, "status": "stopped"})
        finally:
            self.doing = ""
            asyncio.create_task(update_chat_note(self.user_id, task, self.lang))
            if self.browser:
                asyncio.create_task(keep_signins(self.user_id, self.browser))
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
        m = {"id": mid(), "kind": "choice", "question": question, "choices": choices[:6]}
        answer = await self._wait("choice", m)
        # the question is closed in her app (its buttons stop working and it no longer waits for her)
        await self.s.send({"type": "update", "task": self.task, "id": m["id"], "patch": {"picked": str(answer)[:200]}})
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

    async def ask_form(self, rect: dict | None, title: str, fields: list) -> dict:
        """Several boxes in one card in the chat; the answer is {"values": {key: value}, "save": bool}."""
        if rect:
            await self._ring(rect, "stop")
        self.s.speak(self.task, title)
        m = {"id": mid(), "kind": "form", "title": title, "fields": fields, "status": "waiting"}
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
            url = data.get("url", "")
            if url != s._last_url:  # a new page: speech waits until its first picture has gone out
                s._last_url = url
                s._page_ready.clear()
                s._video_kick.set()  # and a picture of it goes out now, not only when Chrome next repaints
            await s.send({"type": "url", "task": t, "url": url})
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
        elif kind == "picks":
            await self.close_step()
            await s.send({"type": "msg", "task": t, "msg": {"id": mid(), "kind": "picks", **data}})
        elif kind == "payment":
            await self.close_step()
            await s.keep_payment(t, data)
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
            if str(data.get("image", "")).startswith("/"):
                data = {**data, "image": settings.public_url.rstrip("/") + data["image"]}
            data = {k: v for k, v in data.items() if k != "seen_on_photo"}
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
        elif kind in ("pointer", "highlight"):
            pass  # nothing is drawn over her page: no cursor, no boxes (the only mark is the yellow one, in the page)

    async def watch(self, url: str, what: str, every_hours: int) -> None:
        wid = uuid.uuid4().hex[:12]
        await db.exec("insert into watches (id, user_id, url, what, last_hash, every_min, next_at, lang) values (?,?,?,?,?,?,?,?)",
                      (wid, self.s.user_id, url, what, None, max(60, every_hours * 60), time.time(), self.s.lang))


_STOP = set("a an the is are was were be to of in on at for and or i me my we you your it this that what which when where how "
             "who do does did can could should would will please tell find check show give get want need know about from with "
             "abeg wetin dey na una e o oh ehn so now".split())


def _qwords(q: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (q or "").lower()) if w not in _STOP and len(w) > 1}


async def update_chat_note(user_id: str, chat_id: str, lang: str) -> None:
    """After each task: the chat's own memory, rewritten short by the fast model from its old note and the latest
    lines: what this chat is about, what was found or done, her choices here (which course, which film, which font),
    and what comes next. Every chat keeps its own; nothing from one chat spills into another."""
    try:
        row = await db.one("select note from chat_notes where user_id=? and chat_id=?", (user_id, chat_id))
        old = row["note"] if row else ""
        convo = await db.history(user_id, chat_id, 16)
        if not convo:
            return
        lines = "\n".join(f"{'Her' if m.get('role') == 'user' else 'Jagora'}: {str(m.get('text', ''))[:300]}" for m in convo)
        prompt = (f"The memory of one chat with Jagora (a voice web assistant), so far:\n{old or '(none yet)'}\n\n"
                  f"The latest lines of the chat:\n{lines}\n\nWrite the chat's memory again, in English, at most 6 short "
                  "lines: what this chat is about; what was found or done (with names: the course, the film, the site); "
                  "her choices and preferences here; where she stopped and what comes next. Facts only, nothing made up.")
        rep = await asyncio.wait_for(_model().chat([{"role": "user", "content": prompt}], None, effort=settings.effort_fast,
                                                   max_tokens=400, kind="note"), 20)
        note = (rep.text or "").strip()[:900]
        if note:
            await db.exec("insert into chat_notes (user_id, chat_id, note, t) values (?,?,?,?) on conflict(user_id, chat_id) "
                          "do update set note=excluded.note, t=excluded.t", (user_id, chat_id, note, time.time()))
            trace.write(user_id, "chat_memory", chat=chat_id, note=note)
    except Exception as e:  # noqa: BLE001
        log.info("chat note not updated: %s", e)


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

    async def replay_get(self, goal_key: str) -> list[dict]:
        """Navigation steps that worked for this task before, for this person only (only clicks on links and buttons
        that need no one's yes, by their words). Served only once the same route has worked twice."""
        if not goal_key:
            return []
        goal_key = f"{self.u}|{goal_key}"
        rows = await db.exec("select steps, uses from replays where goal_key=?", (goal_key,))
        return json.loads(rows[0]["steps"]) if rows and rows[0]["uses"] >= 2 else []

    async def replay_put(self, goal_key: str, steps: list[dict]) -> None:
        if not goal_key or not steps:
            return
        goal_key = f"{self.u}|{goal_key}"
        data = json.dumps(steps, ensure_ascii=False)
        rows = await db.exec("select steps from replays where goal_key=?", (goal_key,))
        if rows and rows[0]["steps"] != data:  # a different route this time: start counting again
            await db.exec("update replays set steps=?, t=?, uses=1 where goal_key=?", (data, time.time(), goal_key))
        else:
            await db.exec("insert into replays (goal_key, steps, t, uses) values (?,?,?,1) on conflict(goal_key) "
                          "do update set t=excluded.t, uses=replays.uses+1", (goal_key, data, time.time()))

    async def remember_fact(self, fact: str) -> None:
        await db.exec("insert into facts (id, user_id, t, fact) values (?,?,?,?)", (uuid.uuid4().hex[:10], self.u, time.time(), fact))

    async def known_get(self, question: str) -> dict | None:
        """A question she asked before (the same, or nearly) that was answered from a page: the page and the answer,
        so the same route is taken again and the answer stays consistent."""
        words = _qwords(question)
        if len(words) < 2:
            return None
        rows = await db.exec("select question, url, answer, t from known where user_id=? order by t desc limit 60", (self.u,))
        best, score = None, 0.0
        for r in rows:
            w = _qwords(r["question"])
            sc = len(words & w) / max(1, min(len(words), len(w)))
            if sc > score:
                best, score = r, sc
        return dict(best) if best and score >= 0.6 else None

    async def known_put(self, question: str, url: str, answer: str) -> None:
        if not url.startswith("http") or len(_qwords(question)) < 2:
            return
        key = " ".join(sorted(_qwords(question)))[:200]
        await db.exec("insert into known (user_id, qkey, question, url, answer, t) values (?,?,?,?,?,?) on conflict(user_id, qkey) "
                      "do update set url=excluded.url, answer=excluded.answer, question=excluded.question, t=excluded.t",
                      (self.u, key, question[:300], url[:500], answer[:900], time.time()))

    async def chat_note(self) -> str:
        """What this chat is about so far (its own memory: each chat remembers its own thread), with any payment in
        it that is not finished, so a new run (or a new session after everything closed) checks it first."""
        row = await db.one("select note from chat_notes where user_id=? and chat_id=?", (self.u, self.c))
        note = row["note"] if row else ""
        pays = await db.exec("select data, status from payments where user_id=? and chat_id=? and status in ('waiting','paid_by_her') "
                             "order by updated desc limit 3", (self.u, self.c))
        if pays:
            lines = []
            for p in pays:
                d = json.loads(p["data"])
                lines.append(f'- {p["status"]}: {d.get("what", "")}, {d.get("amount", "")}, to {d.get("pay_to", "")} '
                             f'{d.get("account", "")} {d.get("bank", "")}, reference {d.get("reference", "none")}, on {d.get("site", "")}')
            note = (note + "\n" if note else "") + "Open payments in this chat (check them first):\n" + "\n".join(lines)
        return note

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
    # which of her chats are really running: anything else her app still shows as working has stopped
    await s.send({"type": "runs", "busy": [t for t, r in s.runs.items() if r.busy]})
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
            m = await ws.receive()
            if m.get("type") == "websocket.disconnect":
                raise WebSocketDisconnect(m.get("code") or 1000)
            if m.get("bytes") is not None:
                await s.on_binary(m["bytes"])  # her live voice: in order, at once
                continue
            raw = m.get("text") or ""
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

    async def ask_form(self, rect, title: str, fields: list) -> dict:
        self.needs = title
        return {"values": {}, "save": False}

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


# ---- her sign-ins, kept between sessions -------------------------------------------------------------------------
# Once she signs into Google or a booking site in Jagora's browser, she stays signed in next time, like her own
# browser. Kept per person, encrypted (the vault's key), never for guests, and removed when she deletes all chats.
SIGNINS_DIR = DATA_DIR / "signins"


def _signins_path(uid: str) -> Path:
    return SIGNINS_DIR / (re.sub(r"[^\w-]", "", uid)[:64] + ".bin")


def load_signins(uid: str) -> dict | None:
    if not uid or uid.startswith("guest-"):
        return None
    try:
        from jagora.vault import unseal
        nonce, ct = _signins_path(uid).read_text().split("\n", 1)
        return json.loads(unseal(uid, "browser", "signins", nonce, ct))
    except Exception:  # noqa: BLE001  (none yet, or unreadable: start signed out)
        return None


async def keep_signins(uid: str, b: Browser) -> None:
    if not uid or uid.startswith("guest-"):
        return
    state = await b.signins()
    if not state:
        return
    try:
        from jagora.vault import seal
        SIGNINS_DIR.mkdir(parents=True, exist_ok=True)
        nonce, ct = seal(uid, "browser", "signins", json.dumps(state))
        p = _signins_path(uid)
        p.write_text(nonce + "\n" + ct)
        p.chmod(0o600)
    except Exception as e:  # noqa: BLE001
        log.warning("could not keep sign-ins: %s", e)


def forget_signins(uid: str) -> None:
    try:
        _signins_path(uid).unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        pass


async def _job_loop():
    while True:
        await asyncio.sleep(30)
        await fire_jobs()
