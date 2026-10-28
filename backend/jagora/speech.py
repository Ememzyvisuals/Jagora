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
import json
import os
import wave
from collections.abc import AsyncIterator

from jagora.config import DATA_DIR, settings

log = logging.getLogger("jagora.speech")
TTS_CACHE = DATA_DIR / "tts"
LANG = {"en": "en", "pcm": "pcm", "yo": "yo", "ha": "ha", "ig": "ig"}


class SpeechError(Exception):
    pass


# STORM's own boxes (the same ones Jagora's LiveKit voice uses), preferred over the developer API when set
STORM_TTS_WS = os.environ.get("STORM_TTS_WS_URL", "").strip()
STORM_TTS_KEY = os.environ.get("STORM_TTS_API_KEY", "").strip()
STORM_ASR_WS = os.environ.get("STORM_ASR_WS_URL", "").strip()
STORM_ASR_KEY = os.environ.get("STORM_ASR_API_KEY", "").strip()
# one fixed voice per language, the same table as voice/agent.py (John by his catalogue ID)
STORM_VOICES = {"en": {"speaker_id": "slr70_ngm_09334"}, "ha": {"speaker_id": "slr70_ngm_09334"},
                "yo": {"name": "Morenike"}, "ig": {"name": "Adaeze"}, "pcm": {"name": "Yemi"}}


def storm_asr_http() -> str:
    """ws://host:8000/ws/transcribe -> http://host:8000/transcribe"""
    if not STORM_ASR_WS:
        return ""
    base = STORM_ASR_WS.split("/ws/")[0]
    return base.replace("wss://", "https://").replace("ws://", "http://") + "/transcribe"


def enabled() -> bool:
    return bool(settings.plotweaver_key or (STORM_TTS_WS and STORM_TTS_KEY))


async def _storm_ws(text: str, lang: str, q: asyncio.Queue) -> int:
    """One passage through STORM's TTS WebSocket in her language's fixed voice; PCM chunks onto q. Returns bytes."""
    import websockets

    sep = "&" if "?" in STORM_TTS_WS else "?"
    n = 0
    async with websockets.connect(f"{STORM_TTS_WS}{sep}api_key={STORM_TTS_KEY}", max_size=None, open_timeout=10) as ws:
        await ws.send(json.dumps({**STORM_VOICES.get(lang, STORM_VOICES["en"]), "text": text[:1000], "fast": True},
                                 ensure_ascii=False))
        carry = b""
        while True:
            msg = await asyncio.wait_for(ws.recv(), 20)
            if isinstance(msg, bytes):
                data = carry + msg
                carry, data = (data[-1:], data[:-1]) if len(data) % 2 else (b"", data)
                if data:
                    n += len(data)
                    await q.put((24000, data))
                continue
            ev = json.loads(msg)
            if ev.get("event") == "done":
                return n
            if ev.get("event") == "error":
                raise SpeechError(str(ev.get("detail"))[:200])


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
    url, key = (storm_asr_http(), STORM_ASR_KEY) if STORM_ASR_WS and STORM_ASR_KEY else \
        (f"{settings.plotweaver_base}/transcriptions", settings.plotweaver_key)
    async with httpx.AsyncClient(timeout=90) as c:
        for attempt in range(2):
            r = await c.post(url, headers={"X-API-Key": key},
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


def chunks(text: str, limit: int = 900) -> list[str]:
    """What is sent to the voice in one go: the whole message when it fits (one natural flow, the way a person reads
    it out), else as few pieces as possible, each made of whole sentences and under the API's 1000 character limit."""
    out: list[str] = []
    for s in sentences(text):
        if out and len(out[-1]) + 1 + len(s) <= limit:
            out[-1] += " " + s
        else:
            out.append(s)
    return out


def pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


# Jagora's voice in each language (PlotWeaver STORM built-in voices), chosen by the language picked in the app
VOICES = {"en": "john", "yo": "morenike", "ha": "john", "ig": "adaeze", "pcm": "yemi"}


def voice_for(lang: str) -> str:
    return VOICES.get(lang, "john")


def speakable(text: str, lang: str = "en") -> str:
    """What is read aloud: links, markdown marks and long reference codes are left to the screen; money, times,
    dates and signs are written the way a person says them (N3,600 is "three thousand six hundred naira")."""
    t = re.sub(r"\[([^\]]+)\]\((?:https?://|www\.)[^)\s]+\)", r"\1", text)  # [link text](address): say the text
    t = re.sub(r"\b(?:https?://)?(?:www\.)", "", t)  # the address is said by its name below
    t = re.sub(r"https?://", "", t)
    # a website is said by its name ("unilag.edu.ng" -> "the Unilag website"), never letter by letter or dot by dot
    t = re.sub(r"\b([a-z0-9-]+)(?:\.[a-z0-9-]+)*\.(?:com|ng|org|net|gov|edu|io|co|info|uk)\b(?:/\S*)?",
               lambda m: f"the {SAID_AS.get(m.group(1).upper(), m.group(1).capitalize())} website", t, flags=re.I)
    t = re.sub(r"\b(\d{4})/(\d{4})\b", r"\1 to \2", t)  # 2025/2026 session -> 2025 to 2026
    t = re.sub(r"(?m)^\s*(?:[-*+]|\d+[.)])\s+", "", t)  # list markers
    t = re.sub(r"[*_`#>|]", "", t)
    t = re.sub(r"([^\s.!?:;,])[ \t]*\n+", r"\1. ", t)  # a line (a list item, a heading) ends a sentence
    t = said_like_people(t, lang)
    return say_names(re.sub(r"\s+", " ", t).strip())


# ---- money, times, dates and signs, the way people say them --------------------------------------------------------
# The model writes for the screen ("N3,600", "14:01", "30 Oct", "L13 - Standard (Adult)"); the voice must hear words.
# Rules, not the model: the same text is always said the same way.
NAIRA = {"en": "naira", "pcm": "naira", "yo": "náírà", "ha": "naira", "ig": "naira"}
KOBO = {"en": "kobo", "pcm": "kobo", "yo": "kọ́bọ̀", "ha": "kobo", "ig": "kobo"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MON = {m[:3].lower(): m for m in MONTHS} | {"sept": "September"}
ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def words(n: int) -> str:
    """A whole number in English words (Nigerian English: 3,600 is "three thousand six hundred")."""
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return ONES[n // 100] + " hundred" + (" and " + words(n % 100) if n % 100 else "")
    for size, name in ((10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")):
        if n >= size:
            rest = n % size
            return words(n // size) + " " + name + ((" and " if rest < 100 else " ") + words(rest) if rest else "")
    return str(n)


def _num(s: str, lang: str) -> str:
    """A number as the voice should read it: words in English and Pidgin; digits without commas otherwise (the
    Yorùbá, Hausa and Igbo voices read plain digits in their own language)."""
    s = s.replace(",", "")
    try:
        whole, _, frac = s.partition(".")
        n = int(whole)
    except ValueError:
        return s
    if lang not in ("en", "pcm") or n >= 10 ** 12:
        return s
    return words(n) + (" point " + " ".join(ONES[int(c)] for c in frac) if frac and int(frac) else "")


def _money(m: re.Match, lang: str) -> str:
    amount, scale = m.group("amt"), (m.group("scale") or "").lower()
    mult = {"k": 1000, "m": 10 ** 6, "million": 10 ** 6, "b": 10 ** 9, "bn": 10 ** 9, "billion": 10 ** 9}.get(scale, 1)
    try:
        value = float(amount.replace(",", "")) * mult
    except ValueError:
        return m.group(0)
    whole = int(value)
    kobo = round((value - whole) * 100)
    out = f"{_num(str(whole), lang)} {NAIRA.get(lang, 'naira')}"
    if kobo:
        out += f" {_num(str(kobo), lang)} {KOBO.get(lang, 'kobo')}"
    return out


def _clock(m: re.Match, lang: str, text: str = "") -> str:
    h, mm = int(m.group(1)), int(m.group(2))
    ampm = (m.group(3) or "").lower().replace(".", "")
    if ampm == "pm" and h < 12:
        h += 12
    if ampm == "am" and h == 12:
        h = 0
    part = "in the morning" if h < 12 else "in the afternoon" if h < 16 else "in the evening" if h < 21 else "at night"
    h12 = h % 12 or 12
    # "Morning 08:06": the part of the day is said already, so it is not said twice
    before = text[max(0, m.start() - 24):m.start()].lower() if text and m.string is text else ""
    if re.search(r"morning|afternoon|evening|night|aarọ̀|ọ̀sán|alẹ́|safe|rana|yamma|dare|ụtụtụ|ehihie|anyasị", before):
        part = ""
    if lang not in ("en", "pcm"):
        part = ""  # the voice says numbers in English in every language; the time of day is left to the words around
    if mm == 0:
        said = f"{words(h12)} o'clock"
    elif mm < 10:
        said = f"{words(h12)} oh {ONES[mm]}"
    else:
        said = f"{words(h12)} {words(mm)}"
    return f"{said} {part}".strip()


def _date(day: str, month: str, year: str = "") -> str:
    return f"{int(day)} {month}" + (f" {year}" if year else "")


def said_like_people(t: str, lang: str = "en") -> str:
    # money: N3,600 / ₦3,600 / NGN 3600 / N1.5m / 3,600 naira
    t = re.sub(r"(?:₦|\bNGN\s?|\bN(?=\d))\s?(?P<amt>\d[\d,]*(?:\.\d+)?)(?:\s?(?P<scale>k|m|bn|b|million|billion)\b)?",
               lambda m: _money(m, lang), t, flags=re.I)
    t = re.sub(r"\b(?P<amt>\d[\d,]*(?:\.\d+)?)(?:\s?(?P<scale>k|m|bn|million|billion))?\s?(?:naira|NGN)\b",
               lambda m: _money(m, lang), t, flags=re.I)
    # dates: 2026-10-30, 30/10/2026, 30 Oct 2026, Oct 30
    t = re.sub(r"\b(\d{4})-(\d{2})-(\d{2})\b",
               lambda m: _date(m.group(3), MONTHS[int(m.group(2)) - 1], m.group(1)) if 1 <= int(m.group(2)) <= 12 else m.group(0), t)
    t = re.sub(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b",
               lambda m: _date(m.group(1), MONTHS[int(m.group(2)) - 1], m.group(3)) if 1 <= int(m.group(2)) <= 12 else m.group(0), t)
    t = re.sub(r"\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?(?=[\s,.;:!?-]|$)",
               lambda m: f"{int(m.group(1))} {MON[m.group(2).lower()]}", t, flags=re.I)
    t = re.sub(r"\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.?\s+(\d{1,2})\b",
               lambda m: f"{int(m.group(2))} {MON[m.group(1).lower()]}", t, flags=re.I)
    # times: 14:01, 08:06, 4:21pm, 8.30 am, 4pm
    t = re.sub(r"\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s?(am|pm|a\.m\.|p\.m\.))?(?![\d:])", lambda m: _clock(m, lang, t), t, flags=re.I)
    t = re.sub(r"\b(1[0-2]|[1-9])\s?(am|pm|a\.m\.|p\.m\.)(?=\W|$)",
               lambda m: _clock(re.match(r"(\d+):(\d+) ?(\S*)", f"{m.group(1)}:00 {m.group(2)}"), lang, t), t, flags=re.I)
    # signs and short forms
    if lang in ("en", "pcm"):
        t = re.sub(r"(\d+(?:\.\d+)?)\s?%", lambda m: f"{_num(m.group(1), lang)} percent", t)
        t = re.sub(r"\be\.g\.", "for example", t, flags=re.I)
        t = re.sub(r"\bi\.e\.", "that is", t, flags=re.I)
        t = re.sub(r"\bvs\.?\b", "versus", t, flags=re.I)
        t = re.sub(r"\bNo\.\s?(?=\d)", "number ", t)
        t = re.sub(r"\b(\d+)\s?(?:mins?)\b", r"\1 minutes", t)
        t = re.sub(r"\b(\d+)\s?(?:hrs?)\b", r"\1 hours", t)
        t = re.sub(r"\b(\d+)\s?km\b", r"\1 kilometres", t)
        t = re.sub(r"\s&\s", " and ", t)
    t = re.sub(r"\s[-–—]\s|[–—]", ", ", t)  # "L13 - Standard": a pause, not "minus" or "dash"
    t = re.sub(r"[()\[\]]", ", ", t)  # brackets are a pause
    t = re.sub(r"(?<=[A-Za-z])/(?=[A-Za-z])", " or ", t)  # yes/no
    # booking references and codes (LITS-123, AB12CD9): one character at a time, as people read them out
    t = re.sub(r"\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]{2,}(?:-[A-Z0-9]+)+\b|\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,}\b",
               lambda m: " ".join(ch for ch in m.group(0) if ch != "-"), t)
    t = re.sub(r"\b([A-Z])(\d+)\b", r"\1 \2", t)  # train L13 -> "L 13"
    t = re.sub(r"\s+,", ",", t)
    t = re.sub(r",(\s*,)+", ",", t)
    t = re.sub(r",\s*([.!?])", r"\1", t)
    return t


# How names and abbreviations are said aloud in Nigeria. The voice spells out words in CAPITALS letter by letter
# ("COMPUTER SCIENCE" came out as C-O-M-P-U...), so capitals are only kept for real initials, and these are written the
# way people say them.
SAID_AS = {
    "JAMB": "Jamb", "UNILAG": "Unilag", "UNIBEN": "Uniben", "UNIZIK": "Unizik", "UNIABUJA": "Uniabuja", "UNIPORT": "Uniport",
    "UNICAL": "Unical", "UNIJOS": "Unijos", "UNIOSUN": "Uniosun", "UNILORIN": "Unilorin", "UNIUYO": "Uniuyo", "LASU": "Lasu",
    "FUTA": "Futa", "FUTO": "Futo", "FUTMINNA": "Fut Minna", "WAEC": "Waec", "NECO": "Neco", "NABTEB": "Nabteb",
    "NYSC": "N Y S C", "NIN": "N I N", "BVN": "B V N", "UTME": "U T M E", "OAU": "O A U", "ABU": "A B U", "UNN": "U N N",
    "UI": "U I", "LAUTECH": "Lautech", "NIMC": "Nimc", "INEC": "Inec", "NAFDAC": "Nafdac", "NEPA": "Nepa", "PHCN": "P H C N",
    "FRSC": "F R S C", "EFCC": "E F C C", "CBN": "C B N", "NCC": "N C C", "NUC": "N U C", "ASUU": "Asuu", "IBASS": "I Bass",
    "CAPS": "Caps", "OTP": "O T P", "PIN": "pin", "ATM": "A T M", "USSD": "U S S D", "GSM": "G S M", "MTN": "M T N",
    "GTB": "G T B", "FCT": "F C T", "NIRSAL": "Nirsal", "TETFUND": "Tetfund", "POS": "P O S",
}


def say_names(text: str) -> str:
    def word(m: re.Match) -> str:
        w = m.group(0)
        if w in SAID_AS:
            return SAID_AS[w]
        if w in ("OF", "AND", "THE", "IN", "FOR", "TO", "AT", "ON", "BY", "OR", "IS", "ARE", "WITH", "FROM", "YOUR", "YOU", "ALL",
                 "NEW", "NOT", "NO", "YES", "NOW", "FREE", "HOW", "WHAT", "WHO", "ONE", "TWO", "OUR"):
            return w.lower()  # small words inside a title written in capitals
        if len(w) >= 5:
            return w.capitalize()  # a word in capitals (COMPUTER, SCIENCE, LAGOS) is said as a word
        return w  # short initials (UK, IT, CBT) stay as letters
    return re.sub(r"\b[A-Z][A-Z]{1,}\b", word, text)


CHUNK = 24000 * 2 // 5  # 0.2 s of 24 kHz 16-bit audio


async def speak_stream(text: str, lang: str, ahead: int = 2) -> AsyncIterator[tuple[int, int, bytes]]:
    """Jagora's voice as it is made: (sentence number, sample rate, PCM chunk). The first sound leaves within a few
    hundred milliseconds because chunks are passed on as STORM streams them, and the next sentences are already being
    made while this one plays (up to `ahead` at once). Finished sentences are cached by their text."""
    if not enabled():
        return
    import httpx

    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    parts = chunks(speakable(text, lang))
    if not parts:
        return
    queues: list[asyncio.Queue] = [asyncio.Queue() for _ in parts]
    gate = asyncio.Semaphore(max(1, ahead))
    client = httpx.AsyncClient(timeout=120)

    async def make(i: int, s: str) -> None:
        q = queues[i]
        who = json.dumps(STORM_VOICES.get(lang)) if STORM_TTS_WS and STORM_TTS_KEY else voice_for(lang)
        key = hashlib.sha256(f"{who}|{lang}|{s}".encode()).hexdigest()[:32]
        cached = TTS_CACHE / f"{key}.wav"
        try:
            if cached.exists():
                with wave.open(io.BytesIO(cached.read_bytes())) as w:
                    rate, pcm = w.getframerate(), w.readframes(w.getnframes())
                for k in range(0, len(pcm), CHUNK * 4):
                    await q.put((rate, pcm[k:k + CHUNK * 4]))
                return
            async with gate:
                if STORM_TTS_WS and STORM_TTS_KEY:
                    # STORM's own box, same voice as the LiveKit voice: the audio is also kept for next time
                    tee: asyncio.Queue = asyncio.Queue()
                    got = bytearray()

                    async def pump() -> None:
                        while (item := await tee.get()) is not None:
                            got.extend(item[1])
                            await q.put(item)

                    pumper = asyncio.create_task(pump())
                    try:
                        await _storm_ws(s, lang, tee)
                    finally:
                        await tee.put(None)
                        await pumper
                    if len(got) > 200:
                        with contextlib.suppress(OSError):
                            cached.write_bytes(pcm_to_wav(bytes(got), 24000))
                    return
                body = {"text": s, "language": LANG.get(lang, "en"), "voice_id": voice_for(lang), "model": "storm-v1"}
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


async def speak(text: str, lang: str, fresh: bool = False, voice: str = "") -> AsyncIterator[bytes]:
    """WAV clips, one per sentence. `fresh`: ask STORM again instead of using stored clips. `voice`: a fixed voice
    (Amina, the mascot, always speaks in her own), else Jagora's voice for the language."""
    voice = voice or voice_for(lang)
    if not enabled():
        return
    import httpx

    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient(timeout=120) as c:
        for s in sentences(speakable(text, lang)):
            key = hashlib.sha256(f"{voice}|{lang}|{s}".encode()).hexdigest()[:32]
            cached = TTS_CACHE / f"{key}.wav"
            if cached.exists() and not fresh:
                yield cached.read_bytes()
                continue
            body = {"text": s, "language": LANG.get(lang, "en"), "voice_id": voice, "model": "storm-v1"}
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
