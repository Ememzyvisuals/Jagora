import asyncio

import pytest

from jagora import auth


def _set(monkeypatch, name, value):
    old = getattr(auth.settings, name)
    object.__setattr__(auth.settings, name, value)
    monkeypatch.undo  # noqa: B018
    return old


class FakeDB:
    async def one(self, *a):
        return None

    async def exec(self, *a):
        return None


def test_closed_signup_needs_a_code(monkeypatch):
    old = _set(monkeypatch, "signups_open", False)
    try:
        with pytest.raises(auth.AuthError) as e:
            asyncio.run(auth.signup(FakeDB(), "new@example.com", "longpassword"))
    finally:
        object.__setattr__(auth.settings, "signups_open", old)
    assert "paused" in str(e.value.args) or "paused" in getattr(e.value, "message", "")


def test_closed_signup_with_code_works(monkeypatch):
    a, b = _set(monkeypatch, "signups_open", False), _set(monkeypatch, "access_codes", ("JAGORA-ABC123",))
    try:
        out = asyncio.run(auth.signup(FakeDB(), "judge@example.com", "longpassword", "jagora-abc123"))
    finally:
        object.__setattr__(auth.settings, "signups_open", a)
        object.__setattr__(auth.settings, "access_codes", b)
    assert out["user"]["plan"] == "code"
