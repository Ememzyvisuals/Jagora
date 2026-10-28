"""A phone connection drops in the middle of a task (lift, weak signal, screen off) and the app reconnects: the task
carries on in the same session, and what was said while she was away reaches her. And a connection that silently
stops taking messages never freezes Jagora."""

import asyncio
import json

from jagora.llm import Model, Reply, ToolCall, Usage
from tests.test_research import site  # noqa: F401
from tests.test_server import client, recv, solve  # noqa: F401


class Slow(Model):
    def __init__(self, base):
        self.base, self.turn, self.usage = base, 0, Usage()

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        await asyncio.sleep(0.8)
        plan = [
            [("tell_user", {"message": "Opening the admissions page."}), ("go_to", {"url": self.base + "/admissions.html"})],
            [("tell_user", {"message": "Still working on it."})],
            [("finish", {"summary": "Done while you were away.", "success": True})],
        ]
        calls = plan[min(self.turn, len(plan) - 1)]
        self.turn += 1
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 1, 1)
        self.usage.add(r, kind)
        return r


def _token(c):
    return c.post("/auth/signup", json={"email": "r@b.co", "password": "longenough", "code": "judge-1",
                                        "altcha": solve(c.get("/altcha").json())}).json()["token"]


def test_task_survives_a_dropped_connection(client, site):  # noqa: F811
    c, server = client
    token = _token(c)
    server._model = lambda: Slow(site)
    with c.websocket_connect(f"/ws?token={token}") as ws:
        ws.send_text(json.dumps({"type": "start", "task": "t1", "goal": "open the admissions page", "lang": "en", "mode": "do", "profile": {}}))
        while recv(ws)["type"] != "status":
            pass
    # the phone lost the connection mid-task; it comes back a moment later
    got = []
    with c.websocket_connect(f"/ws?token={token}") as ws:
        while True:
            ev = recv(ws)
            got.append(ev)
            if ev["type"] == "status" and ev["status"] in ("done", "stopped", "failed"):
                break
    assert got[-1]["status"] == "done"
    assert any(e["type"] == "msg" and "Done while you were away" in e["msg"].get("text", "") for e in got)


def test_a_silent_connection_never_freezes_jagora():
    from jagora.server import SEND_WAIT, Session

    class Stuck:
        async def send_text(self, t):
            await asyncio.sleep(3600)  # a phone that stopped answering without closing

        async def send_bytes(self, b):
            await asyncio.sleep(3600)

    class Fine:
        def __init__(self):
            self.got = []

        async def send_text(self, t):
            self.got.append(json.loads(t))

        async def send_bytes(self, b):
            pass

    async def go():
        s = Session(Stuck(), "u1")
        loop = asyncio.get_running_loop()
        t0 = loop.time()
        await s.send({"type": "msg", "task": "t", "msg": {"id": "1", "kind": "agent", "text": "first"}})
        await s.send({"type": "msg", "task": "t", "msg": {"id": "2", "kind": "agent", "text": "second"}})
        await s.send_bytes(b"\x01jpeg")
        assert loop.time() - t0 < SEND_WAIT + 1  # gave up once, then skipped at once
        fine = Fine()
        await s.attach(fine)
        assert [m["msg"]["text"] for m in fine.got if m["type"] == "msg"] == ["first", "second"]
        s._speaker.cancel()

    asyncio.run(go())


def test_voice_waits_for_a_new_page_to_reach_her_screen():
    from jagora.server import Session

    class Phone:
        async def send_text(self, t):
            pass

        async def send_bytes(self, b):
            pass

    async def go():
        s = Session(Phone(), "u2")
        assert s._page_ready.is_set()
        # a new address: speech waits ...
        s._last_url = "https://a.example/"
        s._page_ready.clear()
        assert not s._page_ready.is_set()
        # ... until the first picture of the page has gone out
        await s.send_bytes(b"\x01jpeg")
        assert s._page_ready.is_set()
        s._speaker.cancel()

    asyncio.run(go())
