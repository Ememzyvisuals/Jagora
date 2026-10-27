"""Speech helpers that need no API: sentence splitting, what gets read aloud, and recording conversion."""

import subprocess

from jagora import speech


def test_sentences_and_speakable():
    s = speech.sentences("Ẹ káàárọ̀. Mo ti rí i. UNILAG requires English, Mathematics and Physics! Check https://unilag.edu.ng now.")
    assert s[0].startswith("Ẹ káàárọ̀. Mo ti rí i.")  # short pieces join
    assert all(len(x) <= 900 for x in speech.sentences("a, " * 800))
    assert "https" not in speech.speakable("See https://jamb.gov.ng/x for **details**")


async def test_browser_recording_to_wav16k():
    webm = subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-f", "lavfi",
                           "-i", "sine=frequency=300:duration=1", "-filter_complex", "[0][1]amix=inputs=2:duration=shortest",
                           "-c:a", "libopus", "-f", "webm", "pipe:1"], capture_output=True).stdout
    wav = await speech.to_wav16k(webm)
    assert wav[:4] == b"RIFF" and 0.5 < speech.wav_seconds(wav) <= 1.05
    assert speech.pcm_to_wav(b"\0\0" * 2400)[:4] == b"RIFF"


async def test_voice_streams_in_order_and_makes_the_next_sentence_early(monkeypatch, tmp_path):
    """Chunks pass on as STORM makes them, sentences stay in order, and sentence 2 is being made while 1 plays."""
    import asyncio
    import time

    import httpx

    started: dict[str, float] = {}

    async def stream(request: httpx.Request):
        text = __import__("json").loads(request.content)["text"]
        started[text] = time.monotonic()

        async def body():
            for _ in range(5):
                await asyncio.sleep(0.05)
                yield (text[:1].encode() * 2) * 4000  # 8000 bytes of a marker per piece
        return httpx.Response(200, headers={"X-Sample-Rate": "24000"}, content=body())

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(stream), **kw))
    monkeypatch.setattr(speech, "enabled", lambda: True)
    monkeypatch.setattr(speech, "TTS_CACHE", tmp_path)
    text = "Alpha sentence is here for you. Bravo sentence comes next right away. Charlie sentence is the last one."
    got, first = [], None
    t0 = time.monotonic()
    async for i, rate, pcm in speech.speak_stream(text, "en"):
        first = first or time.monotonic() - t0
        got.append((i, pcm[:1]))
        assert rate == 24000 and len(pcm) <= speech.CHUNK and len(pcm) % 2 == 0
    assert [g[0] for g in got] == sorted(g[0] for g in got)  # in order
    assert {g[1] for g in got if g[0] == 0} == {b"A"} and {g[1] for g in got if g[0] == 2} == {b"C"}
    assert first < 0.2  # sound starts before the sentence is finished
    assert started["Bravo sentence comes next right away."] - started["Alpha sentence is here for you."] < 0.1  # made ahead
    # said again: straight from the cache, no request
    started.clear()
    again = [i async for i, _, _ in speech.speak_stream(text, "en")]
    assert again and not started


async def test_hush_stops_jagora_mid_sentence(monkeypatch):
    """She talks over Jagora: the sentence being spoken stops and nothing queued is said."""
    import asyncio
    import json

    import jagora.server as server

    async def fake_stream(text, lang, ahead=2):
        for i in range(50):
            await asyncio.sleep(0.02)
            yield 0, 24000, b"\0\0" * 100

    monkeypatch.setattr(server.speech, "enabled", lambda: True)
    monkeypatch.setattr(server.speech, "speak_stream", fake_stream)

    class WS:
        def __init__(self):
            self.out = []

        async def send_text(self, t):
            self.out.append(json.loads(t))

    ws = WS()
    s = server.Session(ws, "u1")
    s.speak("t", "First long answer.")
    s.speak("t", "Second answer that must never be said.")
    await asyncio.sleep(0.2)
    before = sum(1 for m in ws.out if m["type"] == "pcm")
    await s.handle({"type": "hush", "task": "t"})
    await asyncio.sleep(0.3)
    after = sum(1 for m in ws.out if m["type"] == "pcm")
    assert 0 < before and after - before <= 1  # at most the piece already on its way
    assert ws.out[-1]["type"] == "speech_end"
    s._speaker.cancel()


def test_amina_hello_voice_is_a_small_mp3(monkeypatch, tmp_path):
    """The landing page's hello lines: Jagora's voice, made once, served as MP3; unknown lines are refused."""
    import math

    from fastapi.testclient import TestClient

    import jagora.server as server

    async def fake_speak(text, lang):
        pcm = b"".join(int(8000 * math.sin(i / 8)).to_bytes(2, "little", signed=True) for i in range(24000))
        yield speech.pcm_to_wav(pcm, 24000)

    monkeypatch.setattr(server.speech, "enabled", lambda: True)
    monkeypatch.setattr(server.speech, "speak", fake_speak)
    monkeypatch.setattr(server.speech, "TTS_CACHE", tmp_path)
    c = TestClient(server.app)
    r = c.get("/voice/hello/yo")
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg"
    assert r.content[:3] == b"ID3" or r.content[0] == 0xFF  # an MP3
    assert len(r.content) < 20_000  # about a second of voice in a few KB
    assert c.get("/voice/hello/anything-else").status_code == 404
    # the browser may keep the recording only when the page asked for the exact line it shows
    assert r.headers["cache-control"] == "no-store"
    same = c.get("/voice/hello/yo", params={"line": server.HELLO["yo"]})
    assert "immutable" in same.headers["cache-control"]
    assert c.get("/voice/hello/yo", params={"line": "an old line"}).headers["cache-control"] == "no-store"
