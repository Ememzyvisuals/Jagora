"""Her voice in, Jagora's voice out: PlotWeaver STORM.

- Speech to text: voice notes and live turns arrive as short recordings (webm/opus from the browser). They are
  converted to 16 kHz mono WAV with leading and trailing silence trimmed (cheaper, and better for the model), then
  sent to POST /v1/transcriptions.
- Text to speech: POST /v1/speech/stream (storm-v1, raw PCM 24 kHz), one sentence per request so speech starts fast
  and a stop costs at most one sentence. Each sentence is wrapped as WAV for the app, and cached by its text so
  fixed phrases cost nothing the second time.
Everything Jagora says is also sent as text, so the chat always has the words.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import io
import logging
import re
import wave
from collections.abc import AsyncIterator

from jagora.config import DATA_DIR, settings

log = logging.getLogger("jagora.speech")
TTS_CACHE = DATA_DIR / "tts"
LANG = {"en": "en", "pcm": "pcm", "yo": "yo", "ha": "ha", "ig": "ig"}


class SpeechError(Exception):
    pass


def enabled() -> bool:
    return bool(settings.plotweaver_key)


async def to_wav16k(audio: bytes) -> bytes:
    """Any browser recording to 16 kHz mono WAV, silence trimmed at both ends."""
    trim = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,"
            "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse")
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-af", trim, "-ac", "1", "-ar", "16000",
        "-f", "s16le", "pipe:1", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate(audio)
    if proc.returncode != 0:
        raise SpeechError(f"could not read the recording: {err.decode()[:200]}")
    return pcm_to_wav(out, 16000)  # a proper header (ffmpeg cannot size one when writing to a pipe)


def wav_seconds(wav: bytes) -> float:
    with wave.open(io.BytesIO(wav)) as w:
        return w.getnframes() / float(w.getframerate() or 1)


async def transcribe(audio: bytes, lang: str) -> str:
    if not enabled():
        raise SpeechError("speech is not set up on the server")
    import httpx

    wav = await to_wav16k(audio)
    if wav_seconds(wav) < 0.3:
        return ""
    async with httpx.AsyncClient(timeout=90) as c:
        for attempt in range(2):
            r = await c.post(f"{settings.plotweaver_base}/transcriptions", headers={"X-API-Key": settings.plotweaver_key},
                             data={"language": LANG.get(lang, "en")}, files={"file": ("voice.wav", wav, "audio/wav")})
            if r.status_code in (502, 503) and attempt == 0:
                await asyncio.sleep(1.2)
                continue
            if r.status_code != 200:
                raise SpeechError(f"transcription failed ({r.status_code})")
            return (r.json().get("text") or "").strip()
    return ""


# ---- text to speech ---------------------------------------------------------------------------------------------

_SENT = re.compile(r"(?<=[.!?。])\s+|\n+")


def sentences(text: str) -> list[str]:
    """Split into sentences for one-sentence-per-request TTS; very short pieces join their neighbour."""
    parts = [p.strip() for p in _SENT.split(text or "") if p and p.strip()]
    out: list[str] = []
    for p in parts:
        if out and (len(p) < 18 or len(out[-1]) < 18) and len(out[-1]) + len(p) < 220:
            out[-1] += " " + p
        else:
            out.append(p)
    # keep each request under the API's 1000 character limit
    final: list[str] = []
    for s in out:
        while len(s) > 900:
            cut = s.rfind(",", 0, 900)
            cut = cut if cut > 200 else 900
            final.append(s[:cut + 1].strip())
            s = s[cut + 1:].strip()
        if s:
            final.append(s)
    return final


def pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def speakable(text: str) -> str:
    """What is read aloud: links, markdown marks and long reference codes are left to the screen."""
    t = re.sub(r"https?://\S+", "", text)
    t = re.sub(r"[*_`#>|]", "", t)
    return re.sub(r"\s+", " ", t).strip()


CHUNK = 24000 * 2 // 5  # 0.2 s of 24 kHz 16-bit audio


async def speak_stream(text: str, lang: str, ahead: int = 2) -> AsyncIterator[tuple[int, int, bytes]]:
    """Jagora's voice as it is made: (sentence number, sample rate, PCM chunk). The first sound leaves within a few
    hundred milliseconds because chunks are passed on as STORM streams them, and the next sentences are already being
    made while this one plays (up to `ahead` at once). Finished sentences are cached by their text."""
    if not enabled():
        return
    import httpx

    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    parts = sentences(speakable(text))
    if not parts:
        return
    queues: list[asyncio.Queue] = [asyncio.Queue() for _ in parts]
    gate = asyncio.Semaphore(max(1, ahead))
    client = httpx.AsyncClient(timeout=120)

    async def make(i: int, s: str) -> None:
        q = queues[i]
        key = hashlib.sha256(f"{settings.voice}|{lang}|{s}".encode()).hexdigest()[:32]
        cached = TTS_CACHE / f"{key}.wav"
        try:
            if cached.exists():
                with wave.open(io.BytesIO(cached.read_bytes())) as w:
                    rate, pcm = w.getframerate(), w.readframes(w.getnframes())
                for k in range(0, len(pcm), CHUNK * 4):
                    await q.put((rate, pcm[k:k + CHUNK * 4]))
                return
            async with gate:
                body = {"text": s, "language": LANG.get(lang, "en"), "voice_id": settings.voice, "model": "storm-v1"}
                got = bytearray()
                async with client.stream("POST", f"{settings.plotweaver_base}/speech/stream", json=body,
                                         headers={"X-API-Key": settings.plotweaver_key}) as r:
                    if r.status_code != 200:
                        log.warning("tts failed %s", r.status_code)
                        return
                    rate = int(r.headers.get("X-Sample-Rate", "24000"))
                    buf = b""
                    async for chunk in r.aiter_bytes():
                        buf += chunk
                        while len(buf) >= CHUNK:
                            cut = CHUNK - (CHUNK % 2)
                            await q.put((rate, buf[:cut]))
                            got += buf[:cut]
                            buf = buf[cut:]
                    if len(buf) > 1:
                        buf = buf[: len(buf) - (len(buf) % 2)]
                        await q.put((rate, buf))
                        got += buf
                if len(got) > 200:
                    with contextlib.suppress(OSError):
                        cached.write_bytes(pcm_to_wav(bytes(got), rate))
        except Exception as e:  # noqa: BLE001
            log.warning("tts error: %s", e)
        finally:
            await q.put(None)

    jobs = [asyncio.create_task(make(i, s)) for i, s in enumerate(parts)]
    try:
        for i, q in enumerate(queues):
            while (item := await q.get()) is not None:
                yield i, item[0], item[1]
    finally:
        for j in jobs:
            j.cancel()
        await client.aclose()


async def speak(text: str, lang: str, fresh: bool = False) -> AsyncIterator[bytes]:
    """WAV clips, one per sentence. `fresh`: ask STORM again instead of using stored clips."""
    if not enabled():
        return
    import httpx

    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=120) as c:
        for s in sentences(speakable(text)):
            key = hashlib.sha256(f"{settings.voice}|{lang}|{s}".encode()).hexdigest()[:32]
            cached = TTS_CACHE / f"{key}.wav"
            if cached.exists() and not fresh:
                yield cached.read_bytes()
                continue
            body = {"text": s, "language": LANG.get(lang, "en"), "voice_id": settings.voice, "model": "storm-v1"}
            try:
                async with c.stream("POST", f"{settings.plotweaver_base}/speech/stream", json=body,
                                    headers={"X-API-Key": settings.plotweaver_key}) as r:
                    if r.status_code != 200:
                        log.warning("tts failed %s", r.status_code)
                        continue
                    rate = int(r.headers.get("X-Sample-Rate", "24000"))
                    pcm = b"".join([chunk async for chunk in r.aiter_bytes()])
            except Exception as e:  # noqa: BLE001
                log.warning("tts error: %s", e)
                continue
            if len(pcm) < 200:
                continue
            wav = pcm_to_wav(pcm, rate)
            try:
                cached.write_bytes(wav)
            except OSError:
                pass
            yield wav
