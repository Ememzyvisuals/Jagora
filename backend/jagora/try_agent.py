"""Watch Jagora work from a terminal, with the real Muse Spark.

    python -m jagora.try_agent --lang yo --goal "Forúkọ mi sílẹ̀ fún Skills Fair"
    python -m jagora.try_agent --mode guide --goal "Show me how to register"

She is you: answer questions and yes/no prompts in the terminal. Screenshots of every page go to runs/<id>/.
"""

from __future__ import annotations

import argparse
import asyncio
import functools
import http.server
import json
import threading
from pathlib import Path

from jagora.agent import RUNS_DIR, Agent
from jagora.browser import Browser
from jagora.config import PORTALS_DIR
from jagora.llm import MuseSpark

DEMO_PROFILE = {"full_name": "Bísí Adébáyọ̀", "phone": "07011111111", "email": "bisi.adebayo@example.com",
                "date_of_birth": "1999-03-12", "gender": "female", "state": "Lagos"}


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args) -> None:  # noqa: D401
        pass


def serve_portals(port: int) -> str:
    handler = functools.partial(_Quiet, directory=str(PORTALS_DIR))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}"


class TerminalIO:
    def __init__(self, browser: Browser, shots: Path) -> None:
        self.browser, self.shots, self.n = browser, shots, 0

    async def _input(self, prompt: str) -> str:
        return (await asyncio.to_thread(input, prompt)).strip()

    async def say(self, text: str) -> None:
        print(f"\n  JAGORA: {text}")

    async def ask(self, question: str, choices: list[str]) -> str:
        print(f"\n  JAGORA ASKS: {question}")
        if choices:
            print("  " + "  ".join(f"[{i + 1}] {c}" for i, c in enumerate(choices)))
        a = await self._input("  you> ")
        return choices[int(a) - 1] if a.isdigit() and choices and 0 < int(a) <= len(choices) else a

    async def confirm(self, question: str, detail: str) -> bool:
        print(f"\n  JAGORA (needs your yes): {question}\n  (why: {detail})")
        return (await self._input("  yes/no> ")).lower() in ("y", "yes", "bee ni", "bẹ́ẹ̀ ni", "eh", "ee", "ok", "1")

    async def point(self, rect: dict | None, text: str) -> str:
        print(f"\n  JAGORA POINTS at {rect}: {text}")
        return await self._input("  do it in the browser, or type what you want> ") or "done"

    async def handoff(self, rect: dict | None, text: str) -> str:
        print(f"\n  JAGORA HANDS OVER at {rect}: {text}")
        await self._input("  (type it yourself in the browser, then press Enter)> ")
        return "done"

    async def event(self, kind: str, data: dict) -> None:
        if kind == "page":
            self.n += 1
            print(f"\n--- page {self.n}: {data.get('title')}  ({data.get('url')})")
            try:
                (self.shots / f"{self.n:02d}.jpg").write_bytes(await self.browser.screenshot())
            except Exception:  # noqa: BLE001
                pass


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--goal", default="Register me for the Naija Skills Fair. I want to learn phone repair.")
    ap.add_argument("--lang", default="en", choices=["en", "pcm", "yo", "ha", "ig"])
    ap.add_argument("--mode", default="do", choices=["do", "guide"])
    ap.add_argument("--url", default="", help="start page; default is the Skills Fair practice portal")
    ap.add_argument("--profile", default="", help="JSON file with her saved details; default is a demo profile")
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()

    profile = json.loads(Path(args.profile).read_text()) if args.profile else DEMO_PROFILE
    url = args.url or serve_portals(args.port) + "/skills-fair/"
    async with Browser() as browser:
        agent = Agent(MuseSpark(), browser, None, lang=args.lang, mode=args.mode, profile=profile)  # type: ignore[arg-type]
        shots = RUNS_DIR / agent.run_id
        shots.mkdir(parents=True, exist_ok=True)
        agent.io = TerminalIO(browser, shots)
        print(f"Goal: {args.goal}\nLanguage: {args.lang}   Mode: {args.mode}   Screenshots: {shots}")
        result = await agent.run(args.goal, url)
        (shots / "final.jpg").write_bytes(await browser.screenshot())
    print("\n=== RESULT ===")
    print(f"success: {result.success}\nsummary: {result.summary}\nturns: {result.steps}   time: {result.seconds}s")
    print("usage:", result.usage)
    print("log:", result.log_path)


if __name__ == "__main__":
    asyncio.run(main())
