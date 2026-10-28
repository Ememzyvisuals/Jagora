"""The server end to end: sign up (with the ALTCHA puzzle), then a research run over the WebSocket with a scripted
model: open the school site, find the brochure, open the PDF, show evidence, write a document, download the file."""

import base64
import hashlib
import json
import os

import pytest

os.environ.update({"JAGORA_NO_INGEST": "1", "REQUIRE_ACCOUNT": "true", "ACCESS_CODES": "JUDGE-1,JUDGE-2", "ADMIN_CODE": "JAGORA-ADMIN-TEST", "ALLOWED_ORIGINS": ""})

from fastapi.testclient import TestClient  # noqa: E402

from jagora.llm import Model, Reply, ToolCall, Usage  # noqa: E402
from tests.test_research import site  # noqa: E402,F401  (the local school site fixture)




def recv(ws):
    """The next JSON message; live-view pictures (binary) are skipped."""
    while True:
        m = ws.receive()
        if m.get("text") is not None:
            return json.loads(m["text"])

def solve(ch: dict) -> str:
    for n in range(ch["maxnumber"] + 1):
        if hashlib.sha256(f"{ch['salt']}{n}".encode()).hexdigest() == ch["challenge"]:
            return base64.b64encode(json.dumps({**ch, "number": n}).encode()).decode()
    raise AssertionError("no solution")


class Research(Model):
    def __init__(self, base):
        self.base, self.turn, self.usage = base, 0, Usage()

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        b = self.base
        plan = [
            [("tell_user", {"message": "I'll check the official brochure."}),
             ("go_to", {"url": b + "/admissions.html", "step": "Opening the admissions page"})],
            [("list_links", {"match": "brochure"})],
            [("go_to", {"url": b + "/files/brochure-2026.pdf"})],
            [("find_text", {"query": "UTME subjects"})],
            [("show_evidence", {"quote": "English Language, Mathematics, Physics", "claim": "Your UTME subjects", "near_page": 2})],
            [("write_document", {"title": "Computer Science requirements", "summary": ["English, Maths, Physics"],
                                 "blocks": [{"t": "p", "text": "From the brochure."}], "sources": [{"title": "Brochure", "url": b}]}),
             ("download", {"name": "Admission brochure"})],
            [("finish", {"summary": "Done. Your subjects are English, Mathematics, Physics and one more.", "success": True})],
        ]
        calls = plan[min(self.turn, len(plan) - 1)]
        self.turn += 1
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 100, 10)
        self.usage.add(r, kind)
        return r


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "t.db"))
    import importlib

    import jagora.config as cfg

    importlib.reload(cfg)
    import jagora.auth, jagora.db, jagora.server  # noqa: E401

    for m in (jagora.db, jagora.auth, jagora.server):
        importlib.reload(m)
    with TestClient(jagora.server.app) as c:
        yield c, jagora.server


def test_signup_and_research_run(client, site):  # noqa: F811
    c, server = client
    assert c.post("/auth/signup", json={"email": "a@b.co", "password": "longenough", "altcha": "x"}).status_code == 400
    out = c.post("/auth/signup", json={"email": "a@b.co", "password": "longenough", "code": "judge-1",
                                       "altcha": solve(c.get("/altcha").json())}).json()
    token = out["token"]
    assert out["user"]["plan"] == "code"
    assert c.post("/auth/signin", json={"email": "a@b.co", "password": "wrong", "altcha": solve(c.get("/altcha").json())}).status_code == 401
    assert c.get("/me", headers={"Authorization": f"Bearer {token}"}).json()["email"] == "a@b.co"

    server._model = lambda: Research(site)
    got = []
    with c.websocket_connect(f"/ws?token={token}") as ws:
        ws.send_text(json.dumps({"type": "start", "task": "t1", "goal": "UNILAG computer science subjects", "lang": "en", "mode": "do", "profile": {}}))
        while True:
            ev = recv(ws)
            got.append(ev)
            if ev["type"] == "status" and ev["status"] in ("done", "stopped"):
                break
    kinds = [e["msg"]["kind"] for e in got if e["type"] == "msg"]
    assert "step" in kinds and "evidence" in kinds and "doc" in kinds and "file" in kinds
    ev = next(e["msg"] for e in got if e["type"] == "msg" and e["msg"]["kind"] == "evidence")
    assert ev["page"] == 2 and ev["image"] and ev["claim"] == "Your UTME subjects"
    f = next(e["msg"] for e in got if e["type"] == "msg" and e["msg"]["kind"] == "file")
    assert f["name"] == "Admission brochure.pdf"
    path = f["url"].split("/files/", 1)[1]
    assert c.get(f"/files/{path}").content.startswith(b"%PDF")
    assert got[-1]["status"] == "done"
    assert any(e["type"] == "msg" and e["msg"]["kind"] == "agent" and "Done." in e["msg"]["text"] for e in got)
    # chat memory kept on the server
    hist = c.get("/chats/t1", headers={"Authorization": f"Bearer {token}"}).json()
    assert hist[0]["role"] == "user" and any("evidence" in h["text"] for h in hist)


class Organiser(Model):
    """A phone user: reads a page, its tables and files, plans, sets a reminder a second from now, saves a moment."""

    def __init__(self, base):
        self.base, self.turn, self.usage = base, 0, Usage()

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        import datetime as dt

        soon = (dt.datetime.now(dt.timezone(dt.timedelta(hours=1))) + dt.timedelta(seconds=1)).isoformat()
        plan = [
            [("update_plan", {"steps": [{"text": "Open the admissions page", "status": "doing"}, {"text": "Set a reminder", "status": "todo"}]}),
             ("go_to", {"url": self.base + "/admissions.html"})],
            [("read_page", {}), ("page_tables", {}), ("find_media", {})],
            [("update_plan", {"steps": [{"text": "Open the admissions page", "status": "done"}, {"text": "Set a reminder", "status": "doing"}]}),
             ("set_reminder", {"when": soon, "text": "Check the UNILAG cut-off"}),
             ("save_moment", {"title": "UNILAG cut-off 270", "tags": ["unilag", "#jamb"], "note": "Computer Science"})],
            [("find_moments", {"query": "#unilag"}), ("list_reminders", {})],
            [("finish", {"summary": "All set.", "success": True})],
        ]
        calls = plan[min(self.turn, len(plan) - 1)]
        self.turn += 1
        self.last = messages[1]["content"][0]["text"]
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 100, 10)
        self.usage.add(r, kind)
        return r


def test_phone_view_plan_reminders_moments_and_take_over(client, site):  # noqa: F811
    import asyncio
    import time as _t

    c, server = client
    token = c.post("/auth/signup", json={"email": "p@b.co", "password": "longenough", "altcha": solve(c.get("/altcha").json())}).json()["token"]
    model = Organiser(site)
    server._model = lambda: model
    got = []
    with c.websocket_connect(f"/ws?token={token}") as ws:
        ws.send_text(json.dumps({"type": "start", "task": "t2", "goal": "plan it", "lang": "en", "mode": "do", "profile": {},
                                 "device": {"mobile": True, "w": 390, "h": 844}}))
        while True:
            ev = recv(ws)
            got.append(ev)
            if ev["type"] == "status" and ev["status"] in ("done", "stopped"):
                break
        vp = next(e for e in got if e["type"] == "viewport")
        assert vp["mobile"] and vp["w"] == 412
        msgs = [e["msg"] for e in got if e["type"] == "msg"]
        assert any(m["kind"] == "plan" for m in msgs) and any(e["type"] == "update" and "steps" in e["patch"] for e in got)
        assert any(m["kind"] == "reminder" for m in msgs) and any(m["kind"] == "moment" for m in msgs)
        # the agent read the page, its table and its files, and found what it saved
        assert "Undergraduate admissions" in model.last and "Computer Science | 270" in model.last
        assert "brochure-2026.pdf" in model.last and "UNILAG cut-off 270" in model.last and "#unilag #jamb" in model.last
        # take over: tap on the live page while nothing runs
        ws.send_text(json.dumps({"type": "input", "task": "t2", "action": "tap", "x": 100, "y": 100}))
        ev = recv(ws)
        while ev["type"] != "url":
            ev = recv(ws)
        assert "admissions" in ev["url"]
        _t.sleep(1.2)
        c.portal.call(server.fire_reminders)
        ev = recv(ws)
        while ev["type"] != "notify":
            ev = recv(ws)
        assert "Check the UNILAG cut-off" in ev["text"]


def test_admin_sees_who_used_it_and_tests_without_limits(client, site):  # noqa: F811
    c, server = client
    # the monitoring page opens only with the admin code
    assert c.post("/admin/login", json={"code": "nope"}).status_code == 401
    assert c.get("/admin/overview").status_code == 401
    admin = c.post("/admin/login", json={"code": "jagora-admin-test"}).json()["token"]
    H = {"Authorization": f"Bearer {admin}"}
    # a judge signs up with the second code and runs a task
    judge = c.post("/auth/signup", json={"email": "judge@meta.com", "password": "longenough", "code": "JUDGE-2", "name": "Judge",
                                         "altcha": solve(c.get("/altcha").json())}).json()
    assert judge["user"]["plan"] == "code"
    server._model = lambda: Research(site)
    with c.websocket_connect(f"/ws?token={judge['token']}") as ws:
        ws.send_text(json.dumps({"type": "start", "task": "j1", "goal": "UNILAG computer science subjects", "lang": "en", "mode": "do", "profile": {}}))
        while True:
            ev = recv(ws)
            if ev["type"] == "status" and ev["status"] in ("done", "stopped"):
                break
        live = c.get("/admin/overview", headers=H).json()["live"]
        assert any(x["email"] == "judge@meta.com" and x["code"] == "Code 2" for x in live)
    o = c.get("/admin/overview", headers=H).json()
    u = next(x for x in o["users"] if x["email"] == "judge@meta.com")
    assert u["code"] == "Code 2" and u["tasks"] == 1 and u["done"] == 1 and u["last_seen"] > 0
    kinds = [e["kind"] for e in o["events"] if e["user_id"] == u["id"]]
    assert {"signup", "open", "task", "done", "leave"} <= set(kinds)
    assert o["today"]["tasks"] >= 1
    assert "JUDGE" not in json.dumps(o) and "JAGORA-ADMIN" not in json.dumps(o)  # labels only, never the codes
    chats = c.get(f"/admin/user/{u['id']}", headers=H).json()["chats"]
    msgs = c.get(f"/admin/chat/{u['id']}/{chats[0]['chat_id']}", headers=H).json()["messages"]
    assert msgs[0]["text"] == "UNILAG computer science subjects"
    # the admin token is not an account
    with c.websocket_connect(f"/ws?token={admin}") as ws:
        assert recv(ws)["error"] == "signin"
    # the owner's own account: unlimited, never counts down
    me = c.post("/auth/signup", json={"email": "owner@plotweaver.app", "password": "longenough", "code": "JAGORA-ADMIN-TEST",
                                      "altcha": solve(c.get("/altcha").json())}).json()
    assert me["user"]["plan"] == "admin"
    import asyncio

    left = [asyncio.run(server.auth.spend_credit(server.db, me["user"]["id"])) for _ in range(3)]
    assert left[0] == left[2] >= 1_000_000


def test_phone_notifications_when_jagora_is_closed(client, monkeypatch):
    """She turns notifications on; a reminder that comes due while the app is closed reaches her phone."""
    import asyncio
    import time

    c, server = client
    key = c.get("/push/key").json()["key"]
    assert len(key) == 87  # the server's public key, made once and kept
    tok = c.post("/auth/signup", json={"email": "n@b.co", "password": "longenough", "altcha": solve(c.get("/altcha").json())}).json()["token"]
    sub = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc", "keys": {"p256dh": "BPk" + "a" * 84, "auth": "x" * 22}}
    assert c.post("/push/subscribe", json={"subscription": sub}).status_code == 401
    assert c.post("/push/subscribe", json={"subscription": sub}, headers={"Authorization": f"Bearer {tok}"}).json()["ok"]
    sent = []

    def fake_webpush(info, data, **kw):
        sent.append((info["endpoint"], json.loads(data), kw["vapid_claims"]["sub"]))

    import pywebpush

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    uid = server.auth.read_token(tok)
    asyncio.run(server.db.add_reminder("r1", uid, "c1", time.time() - 1, "Pay NEPA bill", "none", "en"))
    asyncio.run(server.fire_reminders())
    assert sent and sent[0][0] == sub["endpoint"] and sent[0][1]["body"] == "Pay NEPA bill" and sent[0][1]["url"] == "/app?chat=c1"
    assert sent[0][2].startswith("mailto:")


def test_her_chats_and_details_follow_her_to_any_device(client):  # noqa: F811
    """Signed in on a new phone: the same chats and the same saved details, which are sealed on the server."""
    import asyncio

    c, server = client
    a = c.post("/auth/signup", json={"email": "d@b.co", "password": "longenough", "altcha": solve(c.get("/altcha").json())}).json()
    phone_one = {"Authorization": f"Bearer {a['token']}"}
    details = {"lang": "yo", "mode": "do", "profile": {"full_name": "Bísí Adébáyọ̀", "phone": "07011111111"}}
    assert c.put("/me/settings", json=details, headers=phone_one).json() == {"ok": True}
    asyncio.run(server.db.remember(a["user"]["id"], "chat-1", "user", "Check my JAMB result", "JAMB result"))

    b = c.post("/auth/signin", json={"email": "d@b.co", "password": "longenough", "altcha": solve(c.get("/altcha").json())}).json()
    phone_two = {"Authorization": f"Bearer {b['token']}"}
    got = c.get("/me/settings", headers=phone_two).json()["settings"]
    assert got["profile"] == details["profile"] and got["lang"] == "yo"
    assert [x["chat_id"] for x in c.get("/chats", headers=phone_two).json()] == ["chat-1"]
    assert c.get("/chats/chat-1", headers=phone_two).json()[0]["text"] == "Check my JAMB result"

    raw = asyncio.run(server.db.one("select settings from users where id=?", (a["user"]["id"],)))["settings"]
    assert "07011111111" not in raw and "Bísí" not in raw  # sealed, never stored in clear
    assert c.get("/me/settings").status_code == 401
