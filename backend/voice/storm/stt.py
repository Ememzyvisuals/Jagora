"""STORM ASR as a LiveKit streaming STT, over the ASR box's WebSocket.

    ws://<host>:8000/ws/transcribe?language=<hint>&api_key=<key>
    client -> binary PCM16LE mono 16 kHz frames, then {"event": "end"}
    server -> {"event": "partial"|"final"|"heartbeat"|"error", ...}

Whisper invents words on silence, so silence never leaves this process:

1. Every frame goes through Silero VAD first. Nothing is sent while nobody
   is talking.
2. A socket only opens once the utterance is confirmed real: at least
   MIN_SPEECH_S of speech above a loudness floor. Coughs, clicks and short
   noises are dropped without contacting the server.
3. Up to PREROLL_S of audio before the speech onset is sent, so the first
   syllable is not clipped.
4. Pauses inside an utterance are trimmed to MAX_GAP_S; trailing silence is
   never sent. When VAD declares the end of speech we send {"event": "end"}
   at once instead of waiting for the server's 2.5 s auto-finalise.
5. Transcripts that are only a known Whisper filler phrase are discarded.

Each utterance gets its own socket (the server finalises per connection).
Finals are emitted in speaking order even if transcription overlaps.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import re
import time
import uuid
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import urlencode

import aiohttp
import numpy as np
from livekit import rtc
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    stt,
    utils,
    vad as agents_vad,
)
from livekit.agents.types import NOT_GIVEN, NotGivenOr

logger = logging.getLogger("storm.stt")

SAMPLE_RATE = 16000
MIN_SPEECH_S = 0.30  # confirmed speech before a socket is opened
MIN_RMS = 0.006  # loudness floor (float RMS, -44 dBFS) for an utterance to count
PREROLL_S = 0.25  # audio kept from before speech onset
MAX_GAP_S = 0.30  # longest pause inside an utterance that is sent as-is
MAX_UTTERANCE_S = 25.0  # cut very long turns so they still get transcribed
FINAL_TIMEOUT_S = 20.0

_FILLERS = re.compile(
    r"^\W*(thanks? (you )?for watching|thank you for watching|please subscribe|"
    r"like and subscribe|subtitles? (by|from)|amara\.org|transcribed by|"
    r"\[?(music|applause|silence|blank_audio|no speech)\]?)\W*$",
    re.IGNORECASE,
)


def is_filler(text: str) -> bool:
    t = text.strip()
    if not t or not re.search(r"\w", t):
        return True
    if _FILLERS.match(t):
        return True
    # one token repeated over and over ("you you you you") is a decoder loop
    words = t.lower().split()
    return len(words) >= 4 and len(set(words)) == 1


def _samples(frame: rtc.AudioFrame) -> np.ndarray:
    return np.frombuffer(frame.data, dtype=np.int16).astype(np.float64)


def frame_seconds(frame: rtc.AudioFrame) -> float:
    return frame.samples_per_channel / frame.sample_rate


@dataclass
class StormSTTOptions:
    url: str  # ws://host:8000/ws/transcribe
    api_key: str


class StormSTT(stt.STT):
    def __init__(
        self,
        *,
        url: str,
        api_key: str,
        vad: agents_vad.VAD,
        language: Callable[[], str] = lambda: "en",
        http_session: aiohttp.ClientSession | None = None,
    ) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=True, interim_results=True, offline_recognize=True)
        )
        self._opts = StormSTTOptions(url=url, api_key=api_key)
        self._vad = vad
        self._language = language
        self._session = http_session

    @property
    def model(self) -> str:
        return "storm-asr"

    @property
    def provider(self) -> str:
        return "plotweaver"

    def _http(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    def _speech_threshold(self) -> float:
        """Below this probability a frame inside an utterance counts as a pause."""
        opts = getattr(self._vad, "_opts", None)
        return float(getattr(opts, "deactivation_threshold", None) or 0.35)

    async def aclose(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()

    def _ws_url(self, hint: str) -> str:
        return f"{self._opts.url}?{urlencode({'language': hint, 'api_key': self._opts.api_key})}"

    async def transcribe_pcm(self, pcm: bytes, hint: str, on_partial: Callable[[str], None] | None = None) -> str:
        """Send one utterance (already speech-only PCM16 16 kHz) and return the final text."""
        session = self._http()
        try:
            ws = await session.ws_connect(self._ws_url(hint), heartbeat=None, max_msg_size=0)
        except aiohttp.ClientError as e:
            raise APIConnectionError(f"STORM ASR unreachable: {e}") from e
        try:
            step = SAMPLE_RATE * 2 // 10  # 100 ms per frame
            for i in range(0, len(pcm), step):
                await ws.send_bytes(pcm[i : i + step])
            await ws.send_str(json.dumps({"event": "end"}))
            return await _await_final(ws, on_partial)
        finally:
            await ws.close()

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        frame = utils.merge_frames(buffer)
        if frame.sample_rate != SAMPLE_RATE or frame.num_channels != 1:
            frame = frame.remix_and_resample(SAMPLE_RATE, 1)
        hint = language if isinstance(language, str) else self._language()
        text = await self.transcribe_pcm(bytes(frame.data), hint)
        text = "" if is_filler(text) else text.strip()
        return stt.SpeechEvent(
            type=stt.SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[stt.SpeechData(language=hint, text=text)],
        )

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> StormRecognizeStream:
        return StormRecognizeStream(stt=self, conn_options=conn_options)


async def _await_final(ws: aiohttp.ClientWebSocketResponse, on_partial: Callable[[str], None] | None) -> str:
    deadline = time.monotonic() + FINAL_TIMEOUT_S
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise APIConnectionError("STORM ASR gave no final transcript in time")
        msg = await ws.receive(timeout=remaining)
        if msg.type == aiohttp.WSMsgType.TEXT:
            try:
                data = json.loads(msg.data)
            except ValueError:
                continue
            event = data.get("event")
            text = data.get("text") or data.get("transcript") or ""
            if event == "partial" and on_partial and text:
                on_partial(text)
            elif event == "final":
                return str(text)
            elif event == "error":
                raise APIStatusError(f"STORM ASR error: {data.get('detail')}", status_code=502, retryable=False)
        elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.CLOSED):
            code = ws.close_code
            if code == 4401:
                raise APIStatusError("STORM ASR rejected the API key", status_code=401, retryable=False)
            raise APIConnectionError(f"STORM ASR closed the connection ({code})")
        elif msg.type == aiohttp.WSMsgType.ERROR:
            raise APIConnectionError(f"STORM ASR socket error: {ws.exception()}")


class _Utterance:
    """One stretch of speech, from VAD start to VAD end.

    Audio is held locally until the utterance is confirmed (long and loud
    enough), then streamed. Pauses are held back and only sent, trimmed, if
    speech resumes; trailing silence is dropped.
    """

    def __init__(self, stt_: StormSTT, hint: str, on_partial: Callable[[str], None]) -> None:
        self._stt = stt_
        self.hint = hint
        self.id = uuid.uuid4().hex[:8]
        self._on_partial = on_partial
        self._pending: list[bytes] = []  # confirmed-or-not speech waiting to be sent
        self._gap: deque[rtc.AudioFrame] = deque()  # silence inside the utterance
        self.speech_s = 0.0
        self.sent_s = 0.0
        self._sum_sq = 0.0
        self._samples = 0
        self.confirmed = False
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._open_task: asyncio.Task | None = None
        self._send_lock = asyncio.Lock()

    @property
    def rms(self) -> float:
        return math.sqrt(self._sum_sq / self._samples) / 32768.0 if self._samples else 0.0

    def _account(self, frame: rtc.AudioFrame) -> None:
        x = _samples(frame)
        self._sum_sq += float(np.dot(x, x))
        self._samples += len(x)

    def start(self, onset: rtc.AudioFrame) -> None:
        # The onset buffer is the VAD's pre-roll (PREROLL_S, set when the VAD
        # is loaded) plus the speech that triggered it.
        self._account(onset)
        self.speech_s += max(0.0, frame_seconds(onset) - PREROLL_S)
        self._pending.append(bytes(onset.data))
        self._maybe_confirm()

    def speech(self, frame: rtc.AudioFrame) -> None:
        if self._gap:
            # Speech resumed: keep at most MAX_GAP_S of the pause, then the speech.
            gap = list(self._gap)
            self._gap.clear()
            keep, kept = [], 0.0
            for f in reversed(gap):
                if kept >= MAX_GAP_S:
                    break
                keep.append(f)
                kept += frame_seconds(f)
            for f in reversed(keep):
                self._pending.append(bytes(f.data))
        self._account(frame)
        self.speech_s += frame_seconds(frame)
        self._pending.append(bytes(frame.data))
        self._maybe_confirm()
        if self.confirmed:
            self._schedule_send()

    def silence(self, frame: rtc.AudioFrame) -> None:
        self._gap.append(frame)

    def _maybe_confirm(self) -> None:
        if not self.confirmed and self.speech_s >= MIN_SPEECH_S and self.rms >= MIN_RMS:
            self.confirmed = True
            self._open_task = asyncio.create_task(self._open())
            self._schedule_send()

    async def _open(self) -> None:
        session = self._stt._http()
        try:
            self._ws = await session.ws_connect(self._stt._ws_url(self.hint), heartbeat=None, max_msg_size=0)
        except aiohttp.ClientError as e:
            raise APIConnectionError(f"STORM ASR unreachable: {e}") from e

    def _schedule_send(self) -> None:
        task = asyncio.create_task(self._flush())
        # Failures surface through finish(); don't log them twice.
        task.add_done_callback(lambda t: t.cancelled() or t.exception())

    async def _flush(self) -> None:
        async with self._send_lock:
            if self._open_task is None:
                return
            await self._open_task
            assert self._ws is not None
            while self._pending:
                chunk = self._pending.pop(0)
                if self._ws.closed:
                    return
                await self._ws.send_bytes(chunk)
                self.sent_s += len(chunk) / 2 / SAMPLE_RATE

    async def finish(self) -> str:
        """End of speech: drop trailing silence, ask for the final transcript."""
        self._gap.clear()
        if not self.confirmed:
            return ""  # too short or too quiet: never sent anywhere
        try:
            await self._flush()
            assert self._ws is not None
            await self._ws.send_str(json.dumps({"event": "end"}))
            return await _await_final(self._ws, self._on_partial)
        finally:
            await self.abort()

    async def abort(self) -> None:
        if self._open_task and not self._open_task.done():
            self._open_task.cancel()
        if self._ws is not None and not self._ws.closed:
            await self._ws.close()


class StormRecognizeStream(stt.RecognizeStream):
    def __init__(self, *, stt: StormSTT, conn_options: APIConnectOptions) -> None:
        super().__init__(stt=stt, conn_options=conn_options, sample_rate=SAMPLE_RATE)
        self._storm = stt

    async def _run(self) -> None:
        vad_stream = self._storm._vad.stream()
        finals: asyncio.Queue[tuple[_Utterance, asyncio.Task[str]] | None] = asyncio.Queue()

        def partial(text: str) -> None:
            if text.strip() and not is_filler(text):
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
                        alternatives=[stt.SpeechData(language=self._storm._language(), text=text.strip())],
                    )
                )

        async def forward_input() -> None:
            async for item in self._input_ch:
                if isinstance(item, self._FlushSentinel):
                    vad_stream.flush()
                else:
                    vad_stream.push_frame(item)
            vad_stream.end_input()

        async def follow_vad() -> None:
            current: _Utterance | None = None
            try:
                async for ev in vad_stream:
                    if ev.type == agents_vad.VADEventType.START_OF_SPEECH:
                        logger.debug("speech started")
                        current = _Utterance(self._storm, self._storm._language(), partial)
                        if ev.frames:
                            current.start(ev.frames[0])
                        self._event_ch.send_nowait(stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH))
                    elif ev.type == agents_vad.VADEventType.INFERENCE_DONE and current is not None:
                        if not ev.frames:
                            continue
                        frame = ev.frames[0]
                        if ev.probability >= self._storm._speech_threshold():
                            current.speech(frame)
                        else:
                            current.silence(frame)
                        if current.speech_s >= MAX_UTTERANCE_S:
                            # A very long turn: transcribe what we have, start fresh.
                            finals.put_nowait((current, asyncio.create_task(current.finish())))
                            current = _Utterance(self._storm, self._storm._language(), partial)
                    elif ev.type == agents_vad.VADEventType.END_OF_SPEECH and current is not None:
                        utterance, current = current, None
                        logger.debug(
                            "speech ended: %.2fs speech, rms %.4f, %s",
                            utterance.speech_s, utterance.rms, "sending" if utterance.confirmed else "dropped",
                        )
                        self._event_ch.send_nowait(
                            stt.SpeechEvent(
                                type=stt.SpeechEventType.END_OF_SPEECH,
                                speech_end_time=time.time() - ev.silence_duration,
                            )
                        )
                        finals.put_nowait((utterance, asyncio.create_task(utterance.finish())))
            finally:
                if current is not None:
                    await current.abort()
                finals.put_nowait(None)

        async def emit_finals() -> None:
            # In speaking order, even when a later utterance finishes first.
            while (item := await finals.get()) is not None:
                utterance, task = item
                try:
                    text = (await task).strip()
                except Exception as e:  # noqa: BLE001
                    logger.warning("STORM ASR failed for utterance %s: %s", utterance.id, e)
                    continue
                if is_filler(text):
                    if utterance.confirmed:
                        logger.info("dropped filler transcript %r", text)
                    continue
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                        request_id=utterance.id,
                        alternatives=[stt.SpeechData(language=utterance.hint, text=text)],
                    )
                )
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.RECOGNITION_USAGE,
                        request_id=utterance.id,
                        recognition_usage=stt.RecognitionUsage(audio_duration=utterance.sent_s),
                    )
                )

        tasks = [
            asyncio.create_task(forward_input(), name="storm_stt_forward"),
            asyncio.create_task(follow_vad(), name="storm_stt_vad"),
            asyncio.create_task(emit_finals(), name="storm_stt_finals"),
        ]
        try:
            await asyncio.gather(*tasks)
        finally:
            await utils.aio.cancel_and_wait(*tasks)
            await vad_stream.aclose()
