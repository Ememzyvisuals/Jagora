"""STORM TTS v1 as a LiveKit TTS, over the persistent WebSocket.

    ws://<host>:8000/generate/stream/ws?api_key=<key>
    client -> {"name": "John", "text": "...", "fast": true}   (one per sentence)
    server -> binary PCM16LE mono 24 kHz chunks, then {"event": "done"} or {"event": "error"}

The connection is reused across sentences and turns, and a spare is kept warm,
so a reply never waits for a handshake. The protocol has no cancel message:
when the shopper interrupts, LiveKit cancels the synthesis task, the socket
in use is closed (that stops the audio immediately) and the next sentence
takes a fresh one.

Text is normalised before synthesis (prices, numbers, units into words in the
sentence's language) with the same rules as the PlotWeaver developer API.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlencode

import aiohttp
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
    tts,
    utils,
)

from normalization import has_rules, normalize
from storm import lang as langs
from storm.spoken import speakable

logger = logging.getLogger("storm.tts")

# Voices known by a friendly name but requested by their catalogue ID.
# Numbers are read in this language whatever the sentence is in.
NUMBERS_IN = "en"

SPEAKER_IDS = {"john": "slr70_ngm_09334"}  # as in the PlotWeaver developer API


def resolve_speaker(speaker: str) -> str:
    """'John' -> his catalogue ID; anything else is used as given."""
    return SPEAKER_IDS.get(speaker.strip().lower(), speaker.strip())


def speaker_field(speaker: str) -> dict:
    """STORM takes a display name ("John"), a raw catalogue ID ("slr70_ngm_09334") or "lang:ig" (that language's
    own main voice, the same one every time)."""
    if speaker.startswith("lang:"):
        return {"lang": speaker[5:]}
    if re.fullmatch(r"[a-z0-9]+(?:_[a-z0-9]+)+", speaker):
        return {"speaker_id": speaker}
    return {"name": speaker}


SAMPLE_RATE = 24000
NUM_CHANNELS = 1
FIRST_AUDIO_TIMEOUT_S = 12.0  # time allowed before the first chunk arrives
CHUNK_TIMEOUT_S = 8.0  # longest gap between chunks once audio is flowing
# the speech model stops after about ten seconds of audio for one request, so a long reply was cut off mid-sentence:
# each request carries one short part (a sentence, or a clause of a long one) and the parts play one after another
MAX_PART = int(__import__("os").environ.get("TTS_MAX_PART", "120"))


def unformatted(text: str) -> str:
    """Chat formatting is for the eyes: no stars, list dashes or headings reach the voice. Lines become sentences."""
    t = re.sub(r"\*\*|__|`|^#{1,6}\s*", "", text, flags=re.M)
    t = re.sub(r"(^|\s)\*([^*\n]+)\*", r"\1\2", t)
    t = re.sub(r"^\s*(?:[-*+•]|\d+[.)])\s+", "", t, flags=re.M)
    t = re.sub(r"\s*[—–]\s*", ", ", t)
    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    return " ".join(ln if re.search(r"[.!?:;,]$", ln) else ln + "." for ln in lines)


def parts(text: str, size: int = MAX_PART) -> list[str]:
    """Sentences, joined while they stay short; a long sentence is split at its commas, then at spaces."""
    out: list[str] = []
    for sent in re.split(r"(?<=[.!?])\s+", text.strip()):
        pieces = [sent]
        if len(sent) > size:
            pieces, cur = [], ""
            for bit in re.split(r"(?<=[,;:])\s+", sent):
                while len(bit) > size:  # no comma to break at: break at the last space that fits
                    cut = bit.rfind(" ", 0, size)
                    cut = cut if cut > 40 else size
                    pieces.append(bit[:cut].strip())
                    bit = bit[cut:].strip()
                if cur and len(cur) + len(bit) + 1 > size:
                    pieces.append(cur)
                    cur = bit
                else:
                    cur = f"{cur} {bit}".strip()
            if cur:
                pieces.append(cur)
        for p in pieces:
            if out and len(out[-1]) + len(p) + 1 <= size:
                out[-1] = f"{out[-1]} {p}"
            elif p:
                out.append(p)
    return [p for p in out if any(ch.isalnum() for ch in p)]


@dataclass
class StormTTSOptions:
    url: str
    api_key: str
    speaker: str
    fast: bool


def _hard_close(ws: aiohttp.ClientWebSocketResponse) -> None:
    """Close a socket without waiting for the server, which may be busy streaming."""

    async def close() -> None:
        try:
            await asyncio.wait_for(ws.close(), 0.3)
        except BaseException:  # noqa: BLE001
            pass
        finally:
            response = getattr(ws, "_response", None)
            if response is not None:
                response.close()  # drops the TCP connection

    asyncio.ensure_future(close())


class StormTTS(tts.TTS):
    def __init__(
        self,
        *,
        url: str,
        api_key: str,
        speaker: str = "John",
        fast: bool = True,
        language: Callable[[str], str] | None = None,
        http_session: aiohttp.ClientSession | None = None,
    ) -> None:
        """
        Args:
            url: ws://host:8000/generate/stream/ws
            speaker: STORM v1 speaker name. John speaks every supported language.
            fast: skip the server's best-of-3 retry (lower latency for conversation).
            language: maps a sentence to its language code for normalisation;
                defaults to detecting it from the text.
        """
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
        )
        self._opts = StormTTSOptions(url=url, api_key=api_key, speaker=resolve_speaker(speaker), fast=fast)
        self._language = language or (lambda text: langs.detect(text))
        self._session = http_session
        self._pool = utils.ConnectionPool[aiohttp.ClientWebSocketResponse](
            connect_cb=self._connect,
            close_cb=self._close,
            max_session_duration=45,  # the speech server drops idle sockets: never hand out an old one
            mark_refreshed_on_get=True,
        )

    @property
    def model(self) -> str:
        return "storm-v1"

    @property
    def provider(self) -> str:
        return "plotweaver"

    def _http(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def _connect(self, timeout: float) -> aiohttp.ClientWebSocketResponse:
        url = f"{self._opts.url}?{urlencode({'api_key': self._opts.api_key})}"
        try:
            return await asyncio.wait_for(
                self._http().ws_connect(url, heartbeat=20.0, max_msg_size=0), timeout
            )
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            raise APIConnectionError(f"STORM TTS unreachable: {e}") from e

    async def _close(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        await ws.close()

    def prewarm(self) -> None:
        self._pool.prewarm()

    def prepare_text(self, text: str) -> str:
        # Specs into words, then numbers into English words in every language
        # ("145,009" -> "one hundred and forty-five thousand and nine"): that is
        # how Nigerians say prices, and the voice says English numbers best.
        clean = speakable(unformatted(text.strip()))
        return normalize(clean, NUMBERS_IN) if has_rules(NUMBERS_IN) else clean

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> StormChunkedStream:
        return StormChunkedStream(tts=self, input_text=text, conn_options=conn_options)

    async def aclose(self) -> None:
        await self._pool.aclose()
        if self._session is not None and not self._session.closed:
            await self._session.close()


class StormChunkedStream(tts.ChunkedStream):
    def __init__(self, *, tts: StormTTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._storm = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        request_id = utils.shortuuid()
        output_emitter.initialize(
            request_id=request_id,
            sample_rate=SAMPLE_RATE,
            num_channels=NUM_CHANNELS,
            mime_type="audio/pcm",
        )
        text = self._storm.prepare_text(self.input_text)
        if not any(ch.isalnum() for ch in text):
            output_emitter.flush()
            return

        opts = self._storm._opts
        self._got_audio = False
        for part in parts(text):
            payload = {**speaker_field(opts.speaker), "text": part, "fast": opts.fast}
            # Leaving this block by exception (including cancellation on interrupt)
            # removes the socket from the pool and closes it.
            heard_before = self._got_audio
            for attempt in range(3):
                try:
                    async with self._storm._pool.connection(timeout=self._conn_options.timeout) as ws:
                        if ws.closed:
                            # the speech server closed this idle socket while it sat in the pool: take a fresh one
                            raise ConnectionResetError("pooled socket already closed")
                        try:
                            self._part_audio = False
                            await self._speak(ws, payload, output_emitter, request_id)
                        except BaseException:
                            # Interrupted or failed mid-utterance: drop the connection now
                            # so the server stops streaming; the pool replaces it on the
                            # next sentence.
                            _hard_close(ws)
                            raise
                    break
                except (ConnectionResetError, APIConnectionError, APITimeoutError, aiohttp.ClientConnectionError) as e:
                    # a dead socket from the pool ("Cannot write to closing transport"): nothing of this part was said
                    # yet, so it is sent again on a new connection instead of being lost
                    if getattr(self, "_part_audio", False) or attempt == 2:
                        if heard_before or self._got_audio:
                            logger.warning("STORM TTS lost a part (%s): going on with the rest", e)
                            break
                        raise
                    logger.warning("STORM TTS socket was dead (%s); retrying on a fresh connection", e)
        output_emitter.flush()

    async def _speak(
        self,
        ws: aiohttp.ClientWebSocketResponse,
        payload: dict,
        output_emitter: tts.AudioEmitter,
        request_id: str,
    ) -> None:
        await ws.send_str(json.dumps(payload, ensure_ascii=False))
        got_audio = False
        carry = b""
        while True:
            try:
                msg = await ws.receive(timeout=CHUNK_TIMEOUT_S if got_audio else FIRST_AUDIO_TIMEOUT_S)
            except asyncio.TimeoutError as e:
                raise APITimeoutError("STORM TTS stalled") from e
            if msg.type == aiohttp.WSMsgType.BINARY:
                data = carry + msg.data
                if len(data) % 2:  # keep 16-bit samples whole across chunks
                    carry, data = data[-1:], data[:-1]
                else:
                    carry = b""
                if data:
                    got_audio = True
                    self._got_audio = True
                    self._part_audio = True
                    output_emitter.push(data)
            elif msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    event = json.loads(msg.data)
                except ValueError:
                    continue
                if event.get("event") == "done":
                    break
                if event.get("event") == "error":
                    raise APIStatusError(
                        f"STORM TTS error: {event.get('detail')}", status_code=502, request_id=request_id
                    )
            elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.CLOSED):
                if ws.close_code == 4401:
                    raise APIStatusError("STORM TTS rejected the API key", status_code=401, retryable=False)
                raise APIConnectionError(f"STORM TTS closed the connection ({ws.close_code})")
            elif msg.type == aiohttp.WSMsgType.ERROR:
                raise APIConnectionError(f"STORM TTS socket error: {ws.exception()}")
