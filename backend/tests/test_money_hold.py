"""Money must never get lost: a payment record is saved the moment it appears, updated in place as it moves on, and
the session (the booking page, the task) is held for her while she is away paying in her bank app."""
import asyncio
import dataclasses
import json

import pytest

from jagora import server
from jagora.db import DB


class WS:
    def __init__(self):
        self.out = []

    async def send_text(self, t):
        self.out.append(json.loads(t))

    async def send_bytes(self, b):
        pass


@pytest.fixture()
async def db(tmp_path, monkeypatch):
    from jagora import db as dbmod

    monkeypatch.setattr(dbmod, "settings", dataclasses.replace(dbmod.settings, sqlite_path=str(tmp_path / "m.db"), turso_url=""))
    d = DB()
    await d.start()
    monkeypatch.setattr(server, "db", d)
    yield d
    await d.close()


async def test_payment_record_saved_updated_and_remembered(db):
    s = server.Session(WS(), "u1")
    await s.keep_payment("chat1", {"what": "Train Lagos to Ibadan, seat 14", "amount": "N6,000", "pay_to": "NRC LITS",
                                   "account": "1234567890", "bank": "Wema", "status": "waiting"})
    first = [m for m in s.ws.out if m["type"] == "msg"][-1]["msg"]
    assert first["kind"] == "payment" and first["status"] == "waiting" and first["account"] == "1234567890"
    assert s.held() == server.HOLD_MONEY  # she may go to her bank app now: the session is kept for an hour
    # a later run (she came back and said she paid) updates the SAME record, it does not start a new one
    await s.keep_payment("chat1", {"what": "Train Lagos to Ibadan, seat 14", "status": "paid_by_her"})
    upd = s.ws.out[-1]
    assert upd["type"] == "update" and upd["id"] == first["id"] and upd["patch"]["status"] == "paid_by_her"
    assert upd["patch"]["amount"] == "N6,000"  # what was copied before is kept
    note = await server.DbMemory("u1", "chat1", "en").chat_note()
    assert "Open payments in this chat" in note and "N6,000" in note and "1234567890" in note
    await s.keep_payment("chat1", {"what": "Train Lagos to Ibadan, seat 14", "status": "confirmed", "reference": "LITS-778"})
    assert s.held() == server.RECONNECT_GRACE and "Open payments" not in await server.DbMemory("u1", "chat1", "en").chat_note()
    rows = await db.exec("select status, data from payments where user_id='u1'")
    assert len(rows) == 1 and rows[0]["status"] == "confirmed" and json.loads(rows[0]["data"])["reference"] == "LITS-778"


async def test_session_held_while_she_pays_then_closed(db, monkeypatch):
    monkeypatch.setattr(server, "HOLD_MONEY", 600)
    monkeypatch.setattr(server, "RECONNECT_GRACE", 0.5)
    monkeypatch.setattr(server, "HOLD_CHECK", 0.05)
    closed = []
    s = server.Session(WS(), "u2")
    server.SESSIONS["u2"] = s

    async def close():
        closed.append(True)
    monkeypatch.setattr(s, "close", close)
    s.money["chat1"] = True
    ws = s.ws
    job = asyncio.create_task(s.close_later(ws, 0.05))
    await asyncio.sleep(0.3)
    assert not closed and server.SESSIONS.get("u2") is s  # still held: she is paying
    s.money["chat1"] = False
    await asyncio.wait_for(job, 15)
    assert closed and "u2" not in server.SESSIONS


async def test_she_comes_back_and_the_session_carries_on(db, monkeypatch):
    closed = []
    s = server.Session(WS(), "u3")
    server.SESSIONS["u3"] = s

    async def close():
        closed.append(True)
    monkeypatch.setattr(s, "close", close)
    s.money["chat1"] = True
    monkeypatch.setattr(server, "HOLD_CHECK", 0.05)
    job = asyncio.create_task(s.close_later(s.ws, 0.05))
    await asyncio.sleep(0.2)
    await s.attach(WS())  # back from the bank app
    await asyncio.wait_for(job, 15)
    assert not closed and server.SESSIONS.get("u3") is s
    server.SESSIONS.pop("u3", None)
