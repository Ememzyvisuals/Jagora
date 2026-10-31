"""Jagora open on her phone and her computer at once: the device she is using gets the chat and the picture, and a
line that stopped taking messages is closed so her app reconnects instead of sitting there blank."""
import asyncio

from jagora import server
from jagora.server import Session, _in_use


class FakeWs:
    def __init__(self, ok: bool = True):
        self.ok, self.got, self.closed = ok, [], None

    async def send_text(self, t):
        if not self.ok:
            raise TimeoutError()
        self.got.append(t)

    async def send_bytes(self, b):
        await self.send_text(b)

    async def close(self, code=1000):
        self.closed = code


def test_what_counts_as_using_the_device():
    assert _in_use({"type": "focus", "task": "a"})
    assert _in_use({"type": "start", "goal": "x"})
    assert _in_use({"type": "view", "on": True})
    assert not _in_use({"type": "view", "on": False})  # a phone going to sleep does not take the picture
    assert not _in_use({"type": "clientlog"})
    assert not _in_use({"type": "net", "lite": True})


def test_a_dead_line_is_closed_and_the_device_in_use_gets_the_messages():
    async def go():
        laptop, phone = FakeWs(), FakeWs(ok=False)
        s = Session(laptop, "u-two-devices")
        await s.attach(phone)  # the phone reconnected and took the line
        await s.send({"type": "msg", "task": "t", "msg": {"id": "1", "kind": "agent", "text": "hello"}})
        await asyncio.sleep(0)
        assert phone.closed == 4000  # its line died: closed, so it reconnects when she opens it again
        await s.attach(laptop)  # she uses the laptop: it takes the line back and gets what it missed
        assert any("hello" in t for t in laptop.got)
        s._speaker.cancel()

    asyncio.run(go())
