"""Her saved logins and private values, so Jagora can sign in for her later (for example at midnight, when a portal
is less busy) without anyone seeing them.

- Encrypted with AES-256-GCM. The key (VAULT_KEY) lives only in the server's .env; the database holds ciphertext.
- Each value is bound to one site. It is typed only into a page on that exact site, never anywhere else, so a
  lookalike page or a page that asks for it by trickery gets nothing.
- The model never sees a value: it sees a name ("JAMB password") and the site, and asks code to type it.
- Values are never logged, spoken, sent to the app, or put in chat memory.
"""

from __future__ import annotations

import base64
import hashlib
import os
import time
import uuid

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from jagora.config import settings
from jagora.db import DB
from jagora.guard import guard, registrable

def _key() -> bytes:
    raw = settings.vault_key or settings.session_secret
    return hashlib.sha256(("jagora-vault|" + raw).encode()).digest()


def seal(user_id: str, site: str, name: str, value: str) -> tuple[str, str]:
    nonce = os.urandom(12)
    aad = f"{user_id}|{site}|{name}".encode()
    ct = AESGCM(_key()).encrypt(nonce, value.encode(), aad)
    return base64.b64encode(nonce).decode(), base64.b64encode(ct).decode()


def unseal(user_id: str, site: str, name: str, nonce: str, ct: str) -> str:
    aad = f"{user_id}|{site}|{name}".encode()
    return AESGCM(_key()).decrypt(base64.b64decode(nonce), base64.b64decode(ct), aad).decode()


class Vault:
    """One user's vault, for the agent."""

    def __init__(self, db: DB, user_id: str) -> None:
        self.db, self.user_id = db, user_id

    async def names(self) -> list[dict]:
        if not self.user_id:
            return []
        return await self.db.exec("select name, site, field from vault where user_id=? order by site, name", (self.user_id,))

    async def save(self, name: str, url: str, field: str, value: str) -> str:
        site = registrable(url)
        if not site or not value:
            return ""
        name = name.strip()[:60] or field
        nonce, ct = seal(self.user_id, site, name, value)
        await self.db.exec("delete from vault where user_id=? and site=? and name=?", (self.user_id, site, name))
        await self.db.exec("insert into vault (id, user_id, name, site, field, nonce, ct, created) values (?,?,?,?,?,?,?,?)",
                           (uuid.uuid4().hex[:12], self.user_id, name, site, field, nonce, ct, time.time()))
        return site

    async def take(self, name: str, page_url: str) -> tuple[str | None, str]:
        """The value for the page she is on, or (None, why not)."""
        site = registrable(page_url)
        v = guard.check(page_url)
        if v.blocked:
            return None, f"this page is not safe ({v.reason}); never type saved details here"
        row = await self.db.one("select * from vault where user_id=? and name=? and site=?", (self.user_id, name, site))
        if not row:
            other = await self.db.one("select site from vault where user_id=? and name=?", (self.user_id, name))
            if other:
                return None, f'"{name}" is saved for {other["site"]} only, and this page is {site}. It is never typed on another site.'
            return None, f'nothing is saved as "{name}"'
        await self.db.exec("update vault set used=? where id=?", (time.time(), row["id"]))
        return unseal(self.user_id, site, name, row["nonce"], row["ct"]), ""

    async def forget(self, name: str, site: str = "") -> int:
        rows = await self.db.exec("select id from vault where user_id=? and name=?" + (" and site=?" if site else ""),
                                  (self.user_id, name, site) if site else (self.user_id, name))
        for r in rows:
            await self.db.exec("delete from vault where id=?", (r["id"],))
        return len(rows)
