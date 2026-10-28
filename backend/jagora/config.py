"""Settings, read once from the environment and backend/.env.

Secrets arrive on the server as a plain `secrets.txt` (KEY=value lines) copied next to this backend. On start it is
merged into `.env` (existing keys are kept unless the file gives a new value), `.env` is locked to the owner, and
`secrets.txt` is deleted. Keys the server can make itself (session secret, ALTCHA key, access codes) are generated
once and kept in `.env`.
"""

from __future__ import annotations

import os
import secrets as _secrets
import stat
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = Path(os.environ.get("JAGORA_ENV_FILE", ROOT / ".env"))
SECRETS_FILE = Path(os.environ.get("JAGORA_SECRETS_FILE", ROOT / "secrets.txt"))


def _parse(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip().strip('"').strip("'")
        if k:
            out[k] = v
    return out


def _write_env(values: dict[str, str]) -> None:
    ENV_FILE.write_text("".join(f"{k}={v}\n" for k, v in values.items()), encoding="utf-8")
    try:
        os.chmod(ENV_FILE, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        pass


def ingest_secrets() -> list[str]:
    """Merge secrets.txt into .env, make the server's own secrets, delete secrets.txt. Returns the keys changed
    (names only, never values)."""
    current = _parse(ENV_FILE.read_text(encoding="utf-8")) if ENV_FILE.exists() else {}
    changed: list[str] = []
    if SECRETS_FILE.exists():
        for k, v in _parse(SECRETS_FILE.read_text(encoding="utf-8")).items():
            if v and current.get(k) != v:  # an empty line in secrets.txt never wipes a saved key
                current[k] = v
                changed.append(k)
    made = {
        "SESSION_SECRET": lambda: _secrets.token_urlsafe(48),
        "ALTCHA_HMAC_KEY": lambda: _secrets.token_urlsafe(32),
        "VAULT_KEY": lambda: _secrets.token_urlsafe(32),
        "ACCESS_CODES": lambda: ",".join(f"JAGORA-{_secrets.token_hex(3).upper()}" for _ in range(5)),
        "ADMIN_CODE": lambda: f"JAGORA-ADMIN-{_secrets.token_hex(4).upper()}",
    }
    for k, make in made.items():
        if not current.get(k) and not os.environ.get(k):
            current[k] = make()
            changed.append(k)
    if changed:
        _write_env(current)
    if SECRETS_FILE.exists():
        try:
            SECRETS_FILE.unlink()
        except OSError:
            pass
    return changed


INGESTED: list[str] = []
if os.environ.get("JAGORA_NO_INGEST") != "1":
    try:
        INGESTED = ingest_secrets()
    except OSError:
        INGESTED = []

try:
    from dotenv import load_dotenv

    load_dotenv(ENV_FILE)
except ImportError:  # dotenv is optional in tests
    pass


def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def env_int(name: str, default: int) -> int:
    try:
        return int(env(name, str(default)))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # Meta Model API: Muse Spark
    meta_key: str = field(default_factory=lambda: env("META_API_KEY"))
    meta_base_url: str = field(default_factory=lambda: env("META_BASE_URL", "https://api.meta.ai/v1"))
    meta_model: str = field(default_factory=lambda: env("META_MODEL", "muse-spark-1.3"))
    wonder_model: str = field(default_factory=lambda: env("META_WONDER_MODEL", "muse-wonder-1.0"))  # reads photos, PDFs, videos
    image_model: str = field(default_factory=lambda: env("META_IMAGE_MODEL", "muse-image-1.0"))  # picture guides
    sam_model: str = field(default_factory=lambda: env("META_SAM_MODEL", "sam-3.1"))  # outlines facts and safety signs on photos
    # open weights (Muse Glimmer / Muse Spark Open) on any OpenAI-compatible server; runs the safety checks when set
    open_base_url: str = field(default_factory=lambda: env("OPEN_BASE_URL"))
    open_model: str = field(default_factory=lambda: env("OPEN_MODEL"))
    open_key: str = field(default_factory=lambda: env("OPEN_KEY"))
    effort_agent: str = field(default_factory=lambda: env("META_EFFORT_AGENT", "low"))
    effort_fast: str = field(default_factory=lambda: env("META_EFFORT_FAST", "minimal"))
    # PlotWeaver STORM: speech to text and text to speech
    plotweaver_key: str = field(default_factory=lambda: env("PLOTWEAVER_API_KEY"))
    plotweaver_base: str = field(default_factory=lambda: env("PLOTWEAVER_BASE_URL", "https://api.plotweaver.app/v1"))
    # Serper (Google results for Nigeria, made for agents): one or more keys, comma separated; when one account's
    # searches run out, the next is used
    serper_keys: tuple[str, ...] = field(default_factory=lambda: tuple(
        k.strip() for k in (env("SERPER_API_KEYS") or env("SERPER_API_KEY")).split(",") if k.strip()))
    # LiveKit (live voice rooms)
    livekit_url: str = field(default_factory=lambda: env("LIVEKIT_URL"))
    livekit_key: str = field(default_factory=lambda: env("LIVEKIT_API_KEY"))
    livekit_secret: str = field(default_factory=lambda: env("LIVEKIT_API_SECRET"))
    # Jagora's voice worker on LiveKit (voice/agent.py): its dispatch name and the secret of its link to this server
    voice_agent_name: str = field(default_factory=lambda: env("VOICE_AGENT_NAME", "jagora-voice"))
    voice_link_secret: str = field(default_factory=lambda: env("VOICE_LINK_SECRET"))
    # Turso (accounts, credits, chat memory); a local SQLite file when not set
    turso_url: str = field(default_factory=lambda: env("TURSO_DATABASE_URL"))
    turso_token: str = field(default_factory=lambda: env("TURSO_AUTH_TOKEN"))
    sqlite_path: str = field(default_factory=lambda: env("SQLITE_PATH", str(ROOT / "data" / "jagora.db")))
    # accounts
    session_secret: str = field(default_factory=lambda: env("SESSION_SECRET", "dev-only-secret"))
    altcha_key: str = field(default_factory=lambda: env("ALTCHA_HMAC_KEY", "dev-only-altcha"))
    vault_key: str = field(default_factory=lambda: env("VAULT_KEY"))
    access_codes: tuple[str, ...] = field(default_factory=lambda: tuple(c.strip().upper() for c in env("ACCESS_CODES").split(",") if c.strip()))
    admin_code: str = field(default_factory=lambda: env("ADMIN_CODE").strip().upper())
    vapid_private: str = field(default_factory=lambda: env("VAPID_PRIVATE"))  # optional; otherwise made once and kept in the database
    push_contact: str = field(default_factory=lambda: env("PUSH_CONTACT", "info@plotweaver.app"))
    alert_webhook: str = field(default_factory=lambda: env("ALERT_WEBHOOK"))  # optional: Discord, Slack or any JSON webhook
    require_account: bool = field(default_factory=lambda: env("REQUIRE_ACCOUNT", "true").lower() != "false")
    credits_free: int = field(default_factory=lambda: env_int("CREDITS_FREE", 30))
    credits_code: int = field(default_factory=lambda: env_int("CREDITS_CODE", 400))
    daily_budget_usd: float = field(default_factory=lambda: float(env("DAILY_BUDGET_USD", "25") or 25))
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(o.strip() for o in env(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",") if o.strip()))
    public_url: str = field(default_factory=lambda: env("PUBLIC_URL", "http://127.0.0.1:8000"))
    # browser
    portal_base_url: str = field(default_factory=lambda: env("PORTAL_BASE_URL", "http://127.0.0.1:8000/practice"))
    headless: bool = field(default_factory=lambda: env("HEADLESS", "true").lower() != "false")
    viewport_width: int = field(default_factory=lambda: env_int("VIEWPORT_WIDTH", 1280))
    viewport_height: int = field(default_factory=lambda: env_int("VIEWPORT_HEIGHT", 860))
    max_sessions: int = field(default_factory=lambda: env_int("MAX_SESSIONS", 6))


settings = Settings()

PORTALS_DIR = ROOT / "portals"
DATA_DIR = ROOT / "data"
FILES_DIR = DATA_DIR / "files"


if __name__ == "__main__":  # python3 -m jagora.config : merge secrets.txt into .env and print the key names
    print("updated:", ", ".join(INGESTED) or "nothing new")
    print("in .env:", ", ".join(sorted(_parse(ENV_FILE.read_text()).keys())) if ENV_FILE.exists() else "no .env")
