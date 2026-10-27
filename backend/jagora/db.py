"""Storage: Turso (libSQL over HTTP) in production, a local SQLite file otherwise. Same SQL for both.

Holds accounts, credits, the spend ledger and chat memory (the words of each conversation, so a chat can be
continued later and from another device). Private values (NIN, BVN, OTP, passwords typed into websites) are
never stored anywhere.
"""

from __future__ import annotations

import asyncio
import sqlite3
import time
from pathlib import Path
from typing import Any

from jagora.config import settings

SCHEMA = [
    """create table if not exists users (
         id text primary key, email text unique not null, pass text not null, created real not null,
         credits integer not null, plan text not null default 'free', last_topup real not null default 0,
         name text not null default '')""",
    """create table if not exists messages (
         user_id text not null, chat_id text not null, t real not null, role text not null, text text not null)""",
    "create index if not exists messages_chat on messages(user_id, chat_id, t)",
    """create table if not exists chats (
         user_id text not null, chat_id text not null, title text not null, updated real not null,
         primary key (user_id, chat_id))""",
    """create table if not exists spend (day text not null, usd real not null, primary key(day))""",
    """create table if not exists watches (
         id text primary key, user_id text not null, url text not null, what text not null, last_hash text,
         every_min integer not null, next_at real not null, lang text not null default 'en')""",
    """create table if not exists reminders (
         id text primary key, user_id text not null, chat_id text not null, at real not null, text text not null,
         repeat text not null default 'none', done integer not null default 0, lang text not null default 'en')""",
    "create index if not exists reminders_due on reminders(done, at)",
    """create table if not exists notices (
         id text primary key, user_id text not null, t real not null, chat_id text not null, title text not null,
         text text not null, delivered integer not null default 0)""",
    """create table if not exists moments (
         id text primary key, user_id text not null, t real not null, title text not null, tags text not null,
         note text not null, url text not null default '', chat_id text not null default '')""",
]


def _arg(v: Any) -> dict:
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": str(int(v))}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": v}
    return {"type": "text", "value": str(v)}


def _val(v: dict) -> Any:
    t = v.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(v["value"])
    if t == "float":
        return float(v["value"])
    return v.get("value")


class DB:
    def __init__(self) -> None:
        self.remote = bool(settings.turso_url)
        self._lock = asyncio.Lock()
        self._conn: sqlite3.Connection | None = None
        self._http = None
        if self.remote:
            base = settings.turso_url.replace("libsql://", "https://").rstrip("/")
            self._endpoint = base + "/v2/pipeline"

    async def start(self) -> "DB":
        if self.remote:
            import httpx

            self._http = httpx.AsyncClient(timeout=15, headers={"Authorization": f"Bearer {settings.turso_token}"})
        else:
            Path(settings.sqlite_path).parent.mkdir(parents=True, exist_ok=True)
            self._conn = sqlite3.connect(settings.sqlite_path, check_same_thread=False)
        for s in SCHEMA:
            await self.exec(s)
        return self

    async def close(self) -> None:
        if self._http:
            await self._http.aclose()
        if self._conn:
            self._conn.close()

    async def exec(self, sql: str, args: tuple | list = ()) -> list[dict]:
        """Run one statement; returns rows as dicts."""
        if self.remote:
            body = {"requests": [{"type": "execute", "stmt": {"sql": sql, "args": [_arg(a) for a in args]}}, {"type": "close"}]}
            r = await self._http.post(self._endpoint, json=body)
            r.raise_for_status()
            res = r.json()["results"][0]
            if res.get("type") == "error":
                raise RuntimeError(res.get("error", {}).get("message", "database error"))
            result = res["response"]["result"]
            cols = [c["name"] for c in result.get("cols", [])]
            return [dict(zip(cols, (_val(v) for v in row))) for row in result.get("rows", [])]
        async with self._lock:
            cur = self._conn.execute(sql, tuple(args))
            self._conn.commit()
            if cur.description is None:
                return []
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]

    async def one(self, sql: str, args: tuple | list = ()) -> dict | None:
        rows = await self.exec(sql, args)
        return rows[0] if rows else None

    # ---- chat memory --------------------------------------------------------------------------------------------

    async def remember(self, user_id: str, chat_id: str, role: str, text: str, title: str = "") -> None:
        if not user_id or not text:
            return
        now = time.time()
        await self.exec("insert into messages (user_id, chat_id, t, role, text) values (?,?,?,?,?)", (user_id, chat_id, now, role, text[:4000]))
        await self.exec("insert into chats (user_id, chat_id, title, updated) values (?,?,?,?) "
                        "on conflict(user_id, chat_id) do update set updated=excluded.updated", (user_id, chat_id, title or text[:60], now))

    async def history(self, user_id: str, chat_id: str, limit: int = 30) -> list[dict]:
        rows = await self.exec("select role, text from messages where user_id=? and chat_id=? order by t desc limit ?", (user_id, chat_id, limit))
        return list(reversed(rows))

    # ---- spend --------------------------------------------------------------------------------------------------

    async def add_spend(self, usd: float) -> float:
        day = time.strftime("%Y-%m-%d", time.gmtime())
        await self.exec("insert into spend (day, usd) values (?, ?) on conflict(day) do update set usd = usd + excluded.usd", (day, usd))
        row = await self.one("select usd from spend where day=?", (day,))
        return float(row["usd"]) if row else usd

    async def spent_today(self) -> float:
        row = await self.one("select usd from spend where day=?", (time.strftime("%Y-%m-%d", time.gmtime()),))
        return float(row["usd"]) if row else 0.0

    # ---- reminders and moments ------------------------------------------------------------------------------------

    async def add_reminder(self, rid: str, user_id: str, chat_id: str, at: float, text: str, repeat: str, lang: str) -> None:
        await self.exec("insert into reminders (id, user_id, chat_id, at, text, repeat, done, lang) values (?,?,?,?,?,?,0,?)",
                        (rid, user_id, chat_id, at, text[:500], repeat, lang))

    async def reminders(self, user_id: str) -> list[dict]:
        return await self.exec("select id, at, text, repeat from reminders where user_id=? and done=0 order by at", (user_id,))

    async def cancel_reminder(self, user_id: str, rid: str) -> bool:
        row = await self.one("select id from reminders where user_id=? and id=? and done=0", (user_id, rid))
        if row:
            await self.exec("update reminders set done=1 where id=?", (rid,))
        return bool(row)

    async def save_moment(self, mid: str, user_id: str, title: str, tags: list[str], note: str, url: str, chat_id: str) -> None:
        await self.exec("insert into moments (id, user_id, t, title, tags, note, url, chat_id) values (?,?,?,?,?,?,?,?)",
                        (mid, user_id, time.time(), title[:200], " ".join(f"#{t.strip('#').lower()}" for t in tags if t.strip('#')),
                         note[:4000], url[:1000], chat_id))

    async def find_moments(self, user_id: str, query: str = "", limit: int = 12) -> list[dict]:
        rows = await self.exec("select id, t, title, tags, note, url from moments where user_id=? order by t desc limit 300", (user_id,))
        words = [w.strip("#").lower() for w in query.split() if w.strip("#")]
        if words:
            rows = [r for r in rows if all(w in f"{r['title']} {r['tags']} {r['note']} {r['url']}".lower() for w in words)]
        return rows[:limit]
