"""Settings, read once from the environment (and backend/.env when present)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # dotenv is optional in tests
    pass


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass(frozen=True)
class Settings:
    meta_key: str = field(default_factory=lambda: env("META_API_KEY"))
    meta_base_url: str = field(default_factory=lambda: env("META_BASE_URL", "https://api.meta.ai/v1"))
    meta_model: str = field(default_factory=lambda: env("META_MODEL", "muse-spark-1.3"))
    effort_agent: str = field(default_factory=lambda: env("META_EFFORT_AGENT", "low"))
    effort_fast: str = field(default_factory=lambda: env("META_EFFORT_FAST", "minimal"))
    portal_base_url: str = field(default_factory=lambda: env("PORTAL_BASE_URL", "http://127.0.0.1:8000/practice"))
    headless: bool = field(default_factory=lambda: env("HEADLESS", "true").lower() != "false")
    viewport_width: int = field(default_factory=lambda: int(env("VIEWPORT_WIDTH", "1280")))
    viewport_height: int = field(default_factory=lambda: int(env("VIEWPORT_HEIGHT", "860")))


settings = Settings()

PORTALS_DIR = Path(__file__).resolve().parent.parent / "portals"
