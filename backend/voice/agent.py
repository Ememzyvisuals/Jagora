"""Jagora's voice on LiveKit, built the way Kivo's voice agent is (same STORM pieces, same turn taking).

Her phone joins a LiveKit room and publishes its microphone. This worker joins the same room as Jagora:

- STORM ASR, streamed (storm/stt.py, from Kivo): Silero VAD in front, only her speech is sent, the turn ends the
  moment she stops, partial words arrive while she talks.
- STORM TTS over its persistent WebSocket (storm/tts.py, from Kivo), whole passages at a time, so it reads naturally.
- LiveKit's turn handling: talking over Jagora interrupts it (VAD), a cough that only sounded like an interruption is
  ignored and Jagora carries on.

The thinking stays in Jagora's server: every finished turn is passed to it over the voice link, and everything Jagora
says comes back over the same link to be spoken here. So the browsing agent, its safety checks and the chat are
unchanged; only the voice moved to LiveKit.

    python agent.py start
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from urllib.parse import urlencode

import aiohttp
from dotenv import load_dotenv
from livekit.agents import Agent, AgentServer, AgentSession, JobContext, JobProcess, StopResponse, cli
from livekit.agents import tokenize
from livekit.agents import tts as agents_tts
from livekit.plugins import silero

from storm import StormSTT, StormTTS
from storm.stt import PREROLL_S
from storm.tts import resolve_speaker

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("jagora-voice")


def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


AGENT_NAME = env("VOICE_AGENT_NAME", "jagora-voice")
LINK_URL = env("JAGORA_VOICE_LINK", "ws://jagora-agent:8000/voice-link")
LINK_KEY = env("VOICE_LINK_SECRET")
ASR_URL, ASR_KEY = env("STORM_ASR_WS_URL"), env("STORM_ASR_API_KEY")
TTS_URL, TTS_KEY = env("STORM_TTS_WS_URL"), env("STORM_TTS_API_KEY")
TTS_MIN_CHARS = int(env("TTS_MIN_CHARS", "220"))
# turn timing, interruptions, the ASR gate and the VADs are Kivo's (kivo-demo/agent/agent.py), which work reliably
# a little longer than Kivo's 0.3/2.0: people pause mid-sentence (Jagora's server also joins pieces into one message)
ENDPOINT_MIN_DELAY_S = float(env("VOICE_ENDPOINT_MIN_DELAY", "0.6"))
ENDPOINT_MAX_DELAY_S = float(env("VOICE_ENDPOINT_MAX_DELAY", "3.0"))
STALL_S = float(env("STALL_SECONDS", "15"))
SORRY = {
    "en": "Sorry, I missed that. Could you say it again?",
    "yo": "Ẹ má bínú, ẹ jọ̀ọ́ ẹ tún un sọ.",
    "ha": "Yi haƙuri, don Allah ka sake faɗa.",
    "ig": "Ndo, biko kwughachi ya ọzọ.",
    "pcm": "Sorry, abeg talk am again.",
}
# Jagora's voice in each language: ONE fixed voice per language, chosen by the language picked in the app, never by
# what a sentence looks like. The same table is in jagora/speech.py, so both ways of speaking sound the same.
VOICES = {"en": "John", "ha": "John", "yo": "Morenike", "ig": "Adaeze", "pcm": "Yemi"}


class Voice:
    """What this call needs to know: her language (the ASR hint and Jagora's voice)."""

    def __init__(self) -> None:
        self.lang = "en"
        self.speaker = VOICES["en"]


class Link:
    """The line to Jagora's server for this person."""

    def __init__(self, uid: str) -> None:
        self.uid = uid
        self.ws: aiohttp.ClientWebSocketResponse | None = None
        self.http = aiohttp.ClientSession()

    async def open(self) -> None:
        url = f"{LINK_URL}?{urlencode({'uid': self.uid, 'key': LINK_KEY})}"
        if self.ws is not None and not self.ws.closed:
            await self.ws.close()
        # a long heartbeat: a server busy for a few seconds (a big page, a PDF) must not count as gone
        self.ws = await self.http.ws_connect(url, heartbeat=60.0)

    async def send(self, msg: dict) -> None:
        if self.ws is not None and not self.ws.closed:
            try:
                await self.ws.send_str(json.dumps(msg, ensure_ascii=False))
            except Exception as e:  # noqa: BLE001
                log.info("voice link send failed: %s", e)

    async def close(self) -> None:
        if self.ws is not None:
            await self.ws.close()
        await self.http.close()


class Bridge(Agent):
    """No thinking here: her finished turn goes to Jagora's server, which answers through the link."""

    def __init__(self, link: Link) -> None:
        super().__init__(instructions="")
        self.link = link

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        text = (new_message.text_content or "").strip()
        if text:
            log.info("HEARD: %s", text[:300])
            await self.link.send({"type": "words", "text": text})
        raise StopResponse()  # Jagora's server answers, not a model here


def build_session(voice: Voice, vad, stt_vad) -> AgentSession:
    stt = StormSTT(url=ASR_URL, api_key=ASR_KEY, vad=stt_vad, language=lambda: voice.lang)
    tts = StormTTS(url=TTS_URL, api_key=TTS_KEY, speaker=voice.speaker, fast=True, language=lambda text: voice.lang)
    tts.prewarm()
    voice.tts = tts  # type: ignore[attr-defined]
    spoken = agents_tts.StreamAdapter(
        tts=tts,
        sentence_tokenizer=tokenize.blingfire.SentenceTokenizer(retain_format=True, min_token_len=TTS_MIN_CHARS, max_token_len=900),
    )
    return AgentSession(
        stt=stt,
        tts=spoken,
        vad=vad,
        turn_handling={
            "turn_detection": "stt",
            "endpointing": {"min_delay": ENDPOINT_MIN_DELAY_S, "max_delay": ENDPOINT_MAX_DELAY_S},
            # talking over Jagora for 0.8 s cuts it off (0.5 s let room noise cut her); if it was only noise it carries on
            "interruption": {"mode": "vad", "min_duration": 0.8, "resume_false_interruption": True,
                             "false_interruption_timeout": 1.2},
        },
    )


def load_vads():
    vad = silero.VAD.load(min_silence_duration=0.45)
    stt_vad = silero.VAD.load(min_speech_duration=0.1, min_silence_duration=0.45, prefix_padding_duration=PREROLL_S,
                              activation_threshold=0.55)
    return vad, stt_vad


def prewarm(proc: JobProcess) -> None:
    proc.userdata["vad"], proc.userdata["stt_vad"] = load_vads()


server = AgentServer(num_idle_processes=int(env("WORKER_IDLE_PROCESSES", "1")))
server.setup_fnc = prewarm


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    try:
        meta = json.loads(ctx.job.metadata or "{}")
    except (TypeError, ValueError):
        meta = {}
    uid = str(meta.get("uid") or "")
    await ctx.connect()
    voice = Voice()
    voice.lang = str(meta.get("lang") or "en")
    voice.speaker = VOICES.get(voice.lang, "John")
    link = Link(uid)
    await link.open()
    session = build_session(voice, ctx.proc.userdata["vad"], ctx.proc.userdata["stt_vad"])
    log.info("voice for %s in %s", uid[:8], ctx.room.name)

    def set_lang(lang: str) -> None:
        voice.lang = lang if lang in VOICES else "en"
        voice.speaker = VOICES.get(voice.lang, "John")
        voice.tts._opts.speaker = resolve_speaker(voice.speaker)  # type: ignore[attr-defined]

    set_lang(voice.lang)

    @session.on("user_input_transcribed")
    def on_words(ev) -> None:
        if not ev.is_final and ev.transcript.strip():
            asyncio.ensure_future(link.send({"type": "partial", "text": ev.transcript.strip()}))

    @session.on("agent_state_changed")
    def on_agent(ev) -> None:
        asyncio.ensure_future(link.send({"type": "state", "agent": str(ev.new_state)}))

    @session.on("user_state_changed")
    def on_user(ev) -> None:
        asyncio.ensure_future(link.send({"type": "user", "state": str(ev.new_state)}))

    @session.on("close")
    def on_close(ev) -> None:
        log.info("voice closed: %s", getattr(ev, "reason", ""))
        ctx.shutdown(reason="session closed")

    async def from_jagora() -> None:
        """Jagora's server: what to say, when to be quiet, her language. If the line drops (the server restarted or
        was busy for a moment), it is opened again, so the call goes on and her words still reach Jagora; only
        Jagora's "bye" (her session closed) ends the call."""
        tries = 0
        while True:
            bye = await read_link()
            if bye:
                break
            tries += 1
            if tries > 20:
                log.warning("voice link lost for good")
                break
            log.warning("voice link dropped; opening it again (%d)", tries)
            await asyncio.sleep(min(5.0, 0.5 * tries))
            try:
                await link.open()
                await link.send({"type": "ready"})
                tries = 0
            except Exception as e:  # noqa: BLE001
                log.warning("voice link not back yet: %s", e)
        ctx.shutdown(reason="Jagora closed the voice link")

    async def read_link() -> bool:
        """Messages from Jagora's server until the line ends. True when Jagora said bye."""
        if link.ws is None or link.ws.closed:
            return False
        async for msg in link.ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                continue
            try:
                d = json.loads(msg.data)
            except ValueError:
                continue
            kind = d.get("type")
            if kind == "lang":
                set_lang(str(d.get("lang") or "en"))
            elif kind == "say":
                # the voice stays the one for her app language (set by "lang"); a message never switches it
                text = str(d.get("text") or "").strip()
                if text:
                    log.info("SAY (%d chars, %s): %s", len(text), voice.speaker, text[:120])
                    try:
                        session.say(text, allow_interruptions=True, add_to_chat_ctx=False)
                    except Exception as e:  # noqa: BLE001
                        log.warning("say failed: %s", e)
            elif kind == "hush":
                try:
                    await session.interrupt(force=True)
                except Exception:  # noqa: BLE001
                    pass
            elif kind == "bye":
                return True
        return False

    reader = asyncio.create_task(from_jagora())

    async def on_shutdown() -> None:
        reader.cancel()
        await link.close()

    ctx.add_shutdown_callback(on_shutdown)
    @session.on("error")
    def on_error(ev) -> None:
        # as Kivo: never go quiet on her; say sorry in her language and keep listening
        log.warning("voice error: %s", getattr(ev, "error", ev))
        try:
            session.say(SORRY.get(voice.lang, SORRY["en"]), add_to_chat_ctx=False)
        except RuntimeError:
            pass

    # as Kivo: if she spoke and nothing has been said back for a while, tell Jagora's server (it says it is still
    # working, or answers again), so the call never sits silent
    stall = {"since": None}

    @session.on("user_input_transcribed")
    def stall_heard(ev) -> None:
        if ev.is_final and (ev.transcript or "").strip() and stall["since"] is None:
            stall["since"] = time.monotonic()

    @session.on("agent_state_changed")
    def stall_state(ev) -> None:
        if ev.new_state == "speaking":
            stall["since"] = None

    async def watch_stalls() -> None:
        while True:
            await asyncio.sleep(1.0)
            if stall["since"] is not None and time.monotonic() - stall["since"] >= STALL_S:
                log.warning("STALL: nothing said %.0fs after she spoke", time.monotonic() - stall["since"])
                stall["since"] = None
                await link.send({"type": "stall"})

    watcher = asyncio.create_task(watch_stalls())
    async def stop_watcher() -> None:
        watcher.cancel()

    ctx.add_shutdown_callback(stop_watcher)
    # no extra noise filter (as Kivo): the phone's own echo cancelling and noise suppression, plus the ASR gate
    await session.start(agent=Bridge(link), room=ctx.room)
    await link.send({"type": "ready"})


if __name__ == "__main__":
    cli.run_app(server)
