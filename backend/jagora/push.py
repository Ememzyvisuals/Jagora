"""Notifications on her phone when Jagora is closed (Web Push).

Reminders, the results of scheduled tasks and changes on pages she asked Jagora to watch reach her lock screen, even
with the app closed. The server's VAPID key pair is made once and kept in the database (or given as VAPID_PRIVATE in
.env). A subscription that the phone's push service says is gone is removed. Sending runs in a thread so the server
never waits on a slow push service. No private data goes in a notification: only the title and a short line.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time

from jagora.config import settings

log = logging.getLogger("jagora.push")


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class Push:
    def __init__(self, db) -> None:
        self.db = db
        self.private = ""
        self.public = ""

    async def start(self) -> "Push":
        try:
            from cryptography.hazmat.primitives import serialization
            from py_vapid import Vapid01
        except ImportError:
            log.warning("push disabled: pywebpush is not installed")
            return self
        raw = settings.vapid_private
        if not raw:
            row = await self.db.one("select v from kv where k='vapid_private'")
            raw = row["v"] if row else ""
        if not raw:
            v = Vapid01()
            v.generate_keys()
            raw = _b64(v.private_key.private_numbers().private_value.to_bytes(32, "big"))
            await self.db.exec("insert into kv (k, v) values ('vapid_private', ?) on conflict(k) do update set v=excluded.v", (raw,))
        v = Vapid01.from_raw(raw.encode())
        self.private = raw
        self.public = _b64(v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
        return self

    @property
    def ready(self) -> bool:
        return bool(self.public)

    async def subscribe(self, user_id: str, sub: dict) -> bool:
        ep = str(sub.get("endpoint", ""))
        keys = sub.get("keys") or {}
        if not ep.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
            return False
        await self.db.exec("insert into push_subs (endpoint, user_id, keys, t) values (?,?,?,?) "
                           "on conflict(endpoint) do update set user_id=excluded.user_id, keys=excluded.keys, t=excluded.t",
                           (ep[:600], user_id, json.dumps({"p256dh": keys["p256dh"], "auth": keys["auth"]}), time.time()))
        return True

    async def unsubscribe(self, endpoint: str) -> None:
        await self.db.exec("delete from push_subs where endpoint=?", (endpoint,))

    async def send(self, user_id: str, title: str, body: str, url: str = "/app", tag: str = "") -> int:
        """To every phone and computer she turned notifications on for. Returns how many took it."""
        if not self.ready:
            return 0
        subs = await self.db.exec("select endpoint, keys from push_subs where user_id=?", (user_id,))
        if not subs:
            return 0
        from pywebpush import WebPushException, webpush

        data = json.dumps({"title": title[:80], "body": body[:240], "url": url, "tag": tag or url})
        claims = {"sub": f"mailto:{settings.push_contact}"}
        sent = 0
        for s in subs:
            info = {"endpoint": s["endpoint"], "keys": json.loads(s["keys"])}
            try:
                await asyncio.to_thread(webpush, info, data, vapid_private_key=self.private, vapid_claims=dict(claims), ttl=3600, timeout=10)
                sent += 1
            except WebPushException as e:
                code = getattr(e.response, "status_code", 0)
                if code in (404, 410):
                    await self.unsubscribe(s["endpoint"])
                else:
                    log.info("push failed %s: %s", code, str(e)[:160])
            except Exception as e:  # noqa: BLE001
                log.info("push error: %s", e)
        return sent
