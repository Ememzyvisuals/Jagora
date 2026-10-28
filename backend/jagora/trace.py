"""The session recorder: everything that happens in her session, one line per event, so a problem can be found by
reading what really happened instead of guessing.

What is written (per person, in data/traces/<user>.jsonl, the newest ~4 MB kept):
- her app: what she typed or said (as heard), taps on yes/no and choices, Live on/off, mic muted, the orb, the live
  picture failing, the player opening (the app sends these as "clientlog")
- the voice on LiveKit: partial and final words, when it speaks and listens, scraps ignored
- the agent: each model step (what it chose, how long it took), every action and its result, search results,
  questions, the end of the run with time and cost
- every message to her app (not the audio or pictures themselves, only that they were sent), and errors

Never written: passwords, PINs, OTPs, card or account numbers, BVN/NIN, or anything she typed into a private box.
`download(uid)` turns it into one readable text file."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from jagora.config import DATA_DIR

DIR = DATA_DIR / "traces"
KEEP = 4_000_000  # bytes per person; older lines are dropped
SECRET_KEYS = re.compile(r"pass|pin\b|otp|code|cvv|card|bvn|nin\b|account|secret|token|key\b|data$", re.I)
LONG_DIGITS = re.compile(r"\b\d{6,}\b")
SKIP_SEND = {"pcm", "frame", "pointer", "highlight"}  # too frequent or too big: counted, not written


def _clean(v, key: str = ""):
    if key and SECRET_KEYS.search(key):
        return "[hidden]" if v else v
    if isinstance(v, str):
        v = LONG_DIGITS.sub("[number]", v)
        return v if len(v) <= 1500 else v[:1500] + f"... ({len(v)} chars)"
    if isinstance(v, dict):
        return {k: _clean(x, str(k)) for k, x in v.items()}
    if isinstance(v, list):
        return [_clean(x) for x in v[:40]]
    return v


def _path(uid: str) -> Path:
    safe = re.sub(r"[^\w-]", "", uid)[:64] or "unknown"
    return DIR / f"{safe}.jsonl"


def write(uid: str, what: str, /, **data) -> None:
    """One event. Never raises: the recorder must not break the session."""
    if not uid:
        return
    try:
        DIR.mkdir(parents=True, exist_ok=True)
        p = _path(uid)
        line = json.dumps({"_t": round(time.time(), 3), "_what": what, **_clean(data)}, ensure_ascii=False, default=str)
        with open(p, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        if p.stat().st_size > KEEP * 1.25:
            tail = p.read_bytes()[-KEEP:]
            p.write_bytes(tail[tail.find(b"\n") + 1:])
    except Exception:  # noqa: BLE001
        pass


def sent(uid: str, msg: dict, /) -> None:
    """A message to her app."""
    kind = msg.get("type")
    if kind in SKIP_SEND:
        return
    write(uid, "to_app", **msg)


def clear(uid: str) -> None:
    try:
        _path(uid).unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        pass


def download(uid: str, minutes: float = 0) -> str:
    """The session as readable text: time, what, details. `minutes`: only the last few minutes (0 = all kept)."""
    p = _path(uid)
    if not p.exists():
        return "No session log yet. Use Jagora for a while, then download again.\n"
    since = time.time() - minutes * 60 if minutes else 0
    out = ["Jagora session log", f"Downloaded {time.strftime('%Y-%m-%d %H:%M:%S')} (server time, UTC)",
           "Each line: time | what happened | details", ""]
    t_prev = 0.0
    for raw in p.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            e = json.loads(raw)
        except ValueError:
            continue
        t = e.pop("_t", 0)
        if t < since:
            continue
        kind = e.pop("_what", "")
        gap = f" (+{t - t_prev:.1f}s)" if t_prev and t - t_prev >= 2 else ""
        t_prev = t
        stamp = time.strftime("%H:%M:%S", time.gmtime(t)) + f".{int((t % 1) * 10)}"
        detail = json.dumps(e, ensure_ascii=False, default=str)
        out.append(f"{stamp}{gap} | {kind} | {detail}")
    return "\n".join(out) + "\n"
