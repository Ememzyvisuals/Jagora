"""Interrupting Jagora: the rest of what she was saying is kept; "continue" (or a false alarm) picks up from the
sentence she was hearing, and words said while Jagora works get an instant "okay"."""
import asyncio
import json
import os

os.environ.setdefault("JAGORA_TEST", "1")

import jagora.server as server  # noqa: E402

TEXT = "First sentence here. Second sentence here. Third sentence here. Fourth sentence here."


class WS:
    def __init__(self):
        self.out = []

    async def send_text(self, t):
        self.out.append(json.loads(t))

    async def send_bytes(self, b):
        pass


def _setup(monkeypatch):
    spoken = []

    async def fake_stream(text, lang, ahead=2):
        for i, sent in enumerate(server.speech.sentences(text)):
            spoken.append(sent)
            await asyncio.sleep(0.05)
            yield i, 24000, b"\\1\\0" * 4800

    monkeypatch.setattr(server.speech, "enabled", lambda: True)
    monkeypatch.setattr(server.speech, "speak_stream", fake_stream)
    return spoken


async def test_continue_picks_up_from_the_sentence_she_was_hearing(monkeypatch):
    spoken = _setup(monkeypatch)
    s = server.Session(WS(), "u1")
    s.speak("t", TEXT)
    await asyncio.sleep(0.08)
    await s.handle({"type": "hush", "task": "t", "heard": 1})  # she cut in during the second sentence
    spoken.clear()
    await s.on_words("t", "continue", None, None)
    await asyncio.sleep(0.4)
    assert spoken == ["Second sentence here.", "Third sentence here.", "Fourth sentence here."]
    s._speaker.cancel()


async def test_a_noise_that_cut_her_off_does_not_stop_the_reading(monkeypatch):
    spoken = _setup(monkeypatch)
    s = server.Session(WS(), "u1")

    async def heard_nothing(audio, lang):
        return ""

    monkeypatch.setattr(server.speech, "transcribe", heard_nothing)
    s.speak("t", TEXT)
    await asyncio.sleep(0.08)
    await s.handle({"type": "hush", "task": "t", "heard": 2})
    spoken.clear()
    await s.on_audio("t", {"id": "m1", "data": ""})
    await asyncio.sleep(0.3)
    assert spoken[:1] == ["Third sentence here."]
    assert not any(m.get("type") == "msg" and "catch" in json.dumps(m) for m in s.ws.out)  # no "I didn't catch that"
    s._speaker.cancel()


async def test_words_while_jagora_works_get_an_instant_okay(monkeypatch):
    spoken = _setup(monkeypatch)
    s = server.Session(WS(), "u1")
    r = server.Run("t")
    r.job = asyncio.create_task(asyncio.sleep(5))  # a task in progress
    s.runs["t"] = r
    await s.on_words("t", "use my second email instead", None, None)
    await asyncio.sleep(0.15)
    assert spoken and spoken[0] == "Okay."
    assert r.steer.get_nowait() == "use my second email instead"
    r.job.cancel()
    s._speaker.cancel()
