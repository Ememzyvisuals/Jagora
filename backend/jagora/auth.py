"""Accounts: email and password, credits, judge access codes, and the ALTCHA proof-of-work bot check.

- Passwords are hashed with scrypt (salted); never stored or logged in clear.
- Sessions are signed tokens (HMAC-SHA256 with SESSION_SECRET), 30 days.
- Every account gets free credits, topped up once a day. An access code gives a bigger allowance.
- ALTCHA (open source, no third-party service): the browser solves a small SHA-256 puzzle before sign-up/sign-in.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
import uuid

from jagora.config import settings
from jagora.db import DB

TOKEN_DAYS = 30
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AuthError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


# ---- passwords ----------------------------------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(h).decode()


def check_password(password: str, stored: str) -> bool:
    try:
        _, s, h = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(s), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(got, base64.b64decode(h))
    except Exception:  # noqa: BLE001
        return False


# ---- session tokens -----------------------------------------------------------------------------------------------

def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(user_id: str) -> str:
    body = _b64(json.dumps({"u": user_id, "exp": int(time.time()) + TOKEN_DAYS * 86400}).encode())
    sig = _b64(hmac.new(settings.session_secret.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str) -> str | None:
    try:
        body, sig = token.split(".")
        want = _b64(hmac.new(settings.session_secret.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, want):
            return None
        data = json.loads(_unb64(body))
        return data["u"] if data.get("exp", 0) > time.time() else None
    except Exception:  # noqa: BLE001
        return None


# ---- ALTCHA ---------------------------------------------------------------------------------------------------------

ALTCHA_MAX = 60_000  # about half a second of work on a mid-range phone
_used: dict[str, float] = {}


def altcha_challenge() -> dict:
    expires = int(time.time()) + 600
    salt = f"{secrets.token_hex(12)}?expires={expires}"
    number = secrets.randbelow(ALTCHA_MAX)
    challenge = hashlib.sha256(f"{salt}{number}".encode()).hexdigest()
    sig = hmac.new(settings.altcha_key.encode(), challenge.encode(), hashlib.sha256).hexdigest()
    return {"algorithm": "SHA-256", "challenge": challenge, "maxnumber": ALTCHA_MAX, "salt": salt, "signature": sig}


def altcha_verify(payload: str) -> bool:
    try:
        p = json.loads(base64.b64decode(payload))
        salt, challenge, number = p["salt"], p["challenge"], int(p["number"])
        m = re.search(r"expires=(\d+)", salt)
        if not m or int(m.group(1)) < time.time():
            return False
        if hashlib.sha256(f"{salt}{number}".encode()).hexdigest() != challenge:
            return False
        want = hmac.new(settings.altcha_key.encode(), challenge.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(want, p["signature"]):
            return False
        now = time.time()
        for k in [k for k, exp in _used.items() if exp < now]:
            _used.pop(k, None)
        if challenge in _used:  # each solved puzzle works once
            return False
        _used[challenge] = int(m.group(1))
        return True
    except Exception:  # noqa: BLE001
        return False


# ---- accounts -------------------------------------------------------------------------------------------------------

ADMIN_CREDITS = 1_000_000


def _code_ok(code: str) -> bool:
    return bool(code_label(code))


def code_label(code: str) -> str:
    """'admin', 'Code 1'..'Code 5', or '' for no or a wrong code. The admin page shows the label, never the code."""
    c = (code or "").strip().upper()
    if not c:
        return ""
    if settings.admin_code and hmac.compare_digest(c, settings.admin_code):
        return "admin"
    for i, x in enumerate(settings.access_codes, 1):
        if hmac.compare_digest(c, x):
            return f"Code {i}"
    return ""


def is_admin_code(code: str) -> bool:
    return code_label(code) == "admin"


async def signup(db: DB, email: str, password: str, code: str = "", name: str = "") -> dict:
    email = (email or "").strip().lower()
    if not EMAIL.match(email):
        raise AuthError("email", "That email address does not look right.")
    if len(password or "") < 8:
        raise AuthError("password", "Use at least 8 characters for your password.")
    if code and not _code_ok(code):
        raise AuthError("code", "That access code is not valid.")
    if await db.one("select id from users where email=?", (email,)):
        raise AuthError("exists", "An account with this email already exists. Sign in instead.", 409)
    uid = uuid.uuid4().hex
    label = code_label(code)
    plan = "admin" if label == "admin" else "code" if label else "free"
    credits = ADMIN_CREDITS if plan == "admin" else settings.credits_code if label else settings.credits_free
    await db.exec("insert into users (id, email, pass, created, credits, plan, last_topup, name, code) values (?,?,?,?,?,?,?,?,?)",
                  (uid, email, hash_password(password), time.time(), credits, plan, time.time(), (name or "")[:80], label))
    return {"token": make_token(uid), "user": {"id": uid, "email": email, "credits": credits, "plan": plan}}


async def signin(db: DB, email: str, password: str, code: str = "") -> dict:
    email = (email or "").strip().lower()
    row = await db.one("select * from users where email=?", (email,))
    if not row or not check_password(password or "", row["pass"]):
        raise AuthError("login", "The email or password is not right.", 401)
    label = code_label(code)
    if label == "admin" and row["plan"] != "admin":
        await db.exec("update users set plan='admin', credits=?, code='admin' where id=?", (ADMIN_CREDITS, row["id"]))
    elif label and row["plan"] == "free":
        await db.exec("update users set plan='code', credits=max(credits, ?), code=? where id=?", (settings.credits_code, label, row["id"]))
    user = await account(db, row["id"])
    return {"token": make_token(row["id"]), "user": user}


async def account(db: DB, user_id: str) -> dict | None:
    """The account, with the daily top-up applied."""
    row = await db.one("select id, email, credits, plan, last_topup, name from users where id=?", (user_id,))
    if not row:
        return None
    floor = ADMIN_CREDITS if row["plan"] == "admin" else settings.credits_code if row["plan"] == "code" else settings.credits_free
    if time.time() - float(row["last_topup"] or 0) > 86400 and row["credits"] < floor:
        await db.exec("update users set credits=?, last_topup=? where id=?", (floor, time.time(), user_id))
        row["credits"] = floor
    return {"id": row["id"], "email": row["email"], "credits": row["credits"], "plan": row["plan"], "name": row["name"]}


async def spend_credit(db: DB, user_id: str, n: int = 1) -> int | None:
    """Take n credits; returns what is left, or None when there are not enough."""
    row = await db.one("select credits, plan from users where id=?", (user_id,))
    if row and row["plan"] == "admin":
        return row["credits"]  # the owner tests without limits
    if not row or row["credits"] < n:
        return None
    await db.exec("update users set credits = credits - ? where id=? and credits >= ?", (n, user_id, n))
    return row["credits"] - n
