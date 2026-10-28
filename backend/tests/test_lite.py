"""Data saver (lite.py): Jagora's voice and live view on slow, costly networks."""

import array
import asyncio
import base64
import json
import math

from jagora import lite


def _speechlike(seconds=0.2, sr=24000):
    x = [int(8000 * sum(math.sin(2 * math.pi * (180 + 60 * math.sin(i / 2000)) * k * i / sr) / k for k in (1, 2, 3, 5)))
         for i in range(int(sr * seconds))]
    return array.array("h", [max(-32768, min(32767, v)) for v in x]).tobytes()


def test_voice_is_six_times_smaller_and_still_clear():
    pcm = _speechlike()
    block, rate = lite.voice_chunk(pcm, 24000)
    assert rate == 16000
    assert len(pcm) / len(block) > 5.5
    ref = lite.resample(pcm, 24000)
    dec = lite.decode(block)[: len(ref)]
    err = sum((a - b) ** 2 for a, b in zip(ref, dec)) / len(ref)
    sig = sum(a * a for a in ref) / len(ref)
    assert 10 * math.log10(sig / err) > 20  # clear speech


def test_each_chunk_stands_alone():
    """A lost chunk never garbles the next: every block starts from its own sample and step."""
    pcm = _speechlike()
    whole, _ = lite.voice_chunk(pcm, 24000)
    second, _ = lite.voice_chunk(pcm[len(pcm) // 2:], 24000)  # as if the first half never arrived
    first_sample = lite.resample(pcm[len(pcm) // 2:], 24000)[0]
    assert lite.decode(second)[0] == first_sample  # it starts exactly, from its own header
    assert len(lite.decode(whole)) > 3000


def test_data_saver_sends_compressed_voice_and_fewer_frames(monkeypatch):
    import jagora.server as server

    async def fake_stream(text, lang, ahead=2):
        for _ in range(3):
            yield 0, 24000, _speechlike()

    monkeypatch.setattr(server.speech, "enabled", lambda: True)
    monkeypatch.setattr(server.speech, "speak_stream", fake_stream)

    class WS:
        def __init__(self):
            self.out, self.bin = [], []

        async def send_text(self, t):
            self.out.append(json.loads(t))

        async def send_bytes(self, b):
            self.bin.append(b)

    async def run():
        ws = WS()
        s = server.Session(ws, "u1")
        await s.handle({"type": "net", "lite": True})
        s.speak("t", "Hello.")
        await asyncio.sleep(0.3)
        pcm = [m for m in ws.out if m["type"] == "pcm"]
        assert pcm and all(m.get("codec") == "adpcm" and m["rate"] == 16000 for m in pcm)
        assert all(len(base64.b64decode(m["data"])) < 2000 for m in pcm)  # 0.2 s of voice in under 2 KB
        # the live view: none while the app is in the background, the latest one on return
        s.active_task = "t"
        await s.handle({"type": "view", "on": False})
        s._frame("AAAA")
        await asyncio.sleep(0.05)
        assert not ws.bin
        await s.handle({"type": "view", "on": True})
        assert ws.bin[-1] == b"\x01" + base64.b64decode("AAAA")  # the held picture, as a binary photo
        assert sum(s.sent.values()) > 0  # data counted for the admin page
        s._speaker.cancel()

    asyncio.run(run())
