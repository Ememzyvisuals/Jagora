"""The browser Jagora works in: a real Chromium page, read as numbered elements and acted on by number."""

from __future__ import annotations

import asyncio
import base64
import difflib
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.async_api import Browser as PWBrowser, BrowserContext, Page, async_playwright

from jagora.config import settings

log = logging.getLogger("jagora.browser")
SNAPSHOT_JS = (Path(__file__).parent / "snapshot.js").read_text()


@dataclass
class Element:
    id: int
    kind: str  # text box, dropdown, checkbox, radio, button, link, file picker
    tag: str
    type: str = ""
    label: str = ""
    group: str = ""
    name: str = ""
    autocomplete: str = ""
    placeholder: str = ""
    required: bool = False
    disabled: bool = False
    href: str = ""
    value: str | None = None
    checked: bool | None = None
    options: list[str] = field(default_factory=list)
    rect: dict = field(default_factory=dict)

    def describe(self) -> str:
        """One line the model reads, e.g. [7] text box "Phone number" (required, type tel) value: \"\"."""
        bits = []
        if self.required:
            bits.append("required")
        if self.disabled:
            bits.append("disabled")
        if self.type and self.kind == "text box" and self.type not in ("text", ""):
            bits.append(f"type {self.type}")
        if self.placeholder and self.placeholder != self.label:
            bits.append(f'hint "{self.placeholder}"')
        what = f'[{self.id}] {self.kind} "{self.label}"'
        if self.group:
            what += f' in "{self.group}"'
        if bits:
            what += f" ({', '.join(bits)})"
        if self.kind in ("text box", "dropdown"):
            what += f' value: "{self.value or ""}"'
        if self.kind in ("checkbox", "radio"):
            what += " checked" if self.checked else " not checked"
        if self.options:
            what += " options: " + " | ".join(self.options[:30])
        if self.kind == "link" and self.href:
            what += f" -> {urlparse(self.href).netloc}{urlparse(self.href).path}"
        return what


@dataclass
class Snapshot:
    url: str
    title: str
    headings: list[str]
    errors: list[str]
    text: str
    scroll: dict
    elements: list[Element]
    screenshot: bytes = b""  # JPEG with numbered marks, for the model

    def element(self, eid: int) -> Element | None:
        return next((e for e in self.elements if e.id == eid), None)

    def screenshot_b64(self) -> str:
        return base64.b64encode(self.screenshot).decode()

    def describe(self, max_elements: int = 80) -> str:
        lines = [f"Page: {self.title}", f"Address: {self.url}"]
        if self.headings:
            lines.append("Headings: " + " / ".join(self.headings))
        if self.errors:
            lines.append("Error messages showing: " + " / ".join(self.errors))
        more = self.scroll.get("max", 0) - self.scroll.get("y", 0)
        lines.append(f"Scroll: {'more page below' if more > 40 else 'at the bottom'}" + (", not at the top" if self.scroll.get("y", 0) > 40 else ""))
        lines.append("Things on screen you can use:")
        lines += [e.describe() for e in self.elements[:max_elements]]
        if len(self.elements) > max_elements:
            lines.append(f"... and {len(self.elements) - max_elements} more further down")
        lines.append("Visible text: " + self.text)
        return "\n".join(lines)


class ActionError(Exception):
    pass


class Browser:
    """One browser tab per user session."""

    def __init__(self) -> None:
        self._pw = None
        self._browser: PWBrowser | None = None
        self._ctx: BrowserContext | None = None
        self.page: Page | None = None

    async def start(self) -> "Browser":
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(headless=settings.headless)
        self._ctx = await self._browser.new_context(
            viewport={"width": settings.viewport_width, "height": settings.viewport_height},
            locale="en-NG", timezone_id="Africa/Lagos", accept_downloads=False)
        self.page = await self._ctx.new_page()
        self.page.on("dialog", lambda d: asyncio.ensure_future(d.dismiss()))  # alert/confirm pop-ups never block the agent
        return self

    async def close(self) -> None:
        for closer in (self._ctx and self._ctx.close, self._browser and self._browser.close, self._pw and self._pw.stop):
            if closer:
                try:
                    await closer()
                except Exception:  # noqa: BLE001
                    pass

    async def __aenter__(self) -> "Browser":
        return await self.start()

    async def __aexit__(self, *exc) -> None:
        await self.close()

    # ---- reading the page -------------------------------------------------------------------------------------

    async def snapshot(self, marks: bool = True) -> Snapshot:
        page = self._need_page()
        await self._settle()
        data: dict[str, Any] = await page.evaluate(SNAPSHOT_JS, {"marks": marks})
        shot = b""
        if marks:
            shot = await page.screenshot(type="jpeg", quality=62)
            await page.evaluate("document.getElementById('__jg_overlay')?.remove()")
        els = [Element(**{k: v for k, v in e.items() if k in Element.__dataclass_fields__}) for e in data["elements"]]
        return Snapshot(url=data["url"], title=data["title"], headings=data["headings"], errors=data["errors"],
                        text=data["text"], scroll=data["scroll"], elements=els, screenshot=shot)

    async def screenshot(self, quality: int = 70) -> bytes:
        return await self._need_page().screenshot(type="jpeg", quality=quality)

    # ---- acting -----------------------------------------------------------------------------------------------

    async def goto(self, url: str) -> None:
        if not urlparse(url).scheme:
            url = "https://" + url
        await self._need_page().goto(url, wait_until="domcontentloaded", timeout=30000)

    async def back(self) -> None:
        await self._need_page().go_back(wait_until="domcontentloaded", timeout=20000)

    async def click(self, eid: int) -> None:
        loc = await self._locate(eid)
        try:
            await loc.click(timeout=5000)
        except Exception:  # noqa: BLE001
            # styled checkboxes and radios are often hidden under their label
            await loc.check(timeout=5000, force=True)

    async def fill(self, eid: int, text: str) -> None:
        loc = await self._locate(eid)
        kind = await loc.evaluate("e => (e.getAttribute('type')||'').toLowerCase()")
        if kind == "date":
            await loc.fill(text, timeout=5000)  # expects YYYY-MM-DD
            return
        await loc.click(timeout=5000)
        await loc.fill("", timeout=5000)
        await loc.press_sequentially(text, delay=35)  # typed like a person, so the site's own checks run

    async def choose(self, eid: int, option: str) -> str:
        loc = await self._locate(eid)
        options: list[str] = await loc.evaluate("e => [...e.options].map(o => o.text.trim())")
        pick = best_option(option, options)
        if pick is None:
            raise ActionError(f'"{option}" is not one of the choices: {", ".join(options[:20])}')
        await loc.select_option(label=pick, timeout=5000)
        return pick

    async def set_checked(self, eid: int, checked: bool) -> None:
        loc = await self._locate(eid)
        await loc.set_checked(checked, timeout=5000, force=True)

    async def press_enter(self, eid: int) -> None:
        await (await self._locate(eid)).press("Enter")

    async def scroll(self, direction: str) -> None:
        dy = {"down": 0.8, "up": -0.8}.get(direction, 0.8) * settings.viewport_height
        await self._need_page().mouse.wheel(0, dy)
        await asyncio.sleep(0.25)

    async def rect(self, eid: int) -> dict | None:
        loc = self._need_page().locator(f'[data-jg="{eid}"]').first
        if await loc.count() == 0:
            return None
        box = await loc.bounding_box()
        return {k: round(v) for k, v in box.items()} if box else None

    # ---- helpers ----------------------------------------------------------------------------------------------

    def _need_page(self) -> Page:
        if not self.page:
            raise RuntimeError("browser not started")
        return self.page

    async def _locate(self, eid: int):
        loc = self._need_page().locator(f'[data-jg="{eid}"]').first
        if await loc.count() == 0:
            raise ActionError(f"element {eid} is no longer on the page; read the page again")
        return loc

    async def _settle(self) -> None:
        page = self._need_page()
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=8000)
            await page.wait_for_load_state("networkidle", timeout=2500)
        except Exception:  # noqa: BLE001
            pass  # busy pages never go idle; read them as they are


def best_option(said: str, options: list[str]) -> str | None:
    """The dropdown choice the user meant: exact, then contained, then closest spelling ("lagos" -> "Lagos",
    "abuja" -> "FCT Abuja", "phone repair" -> "Phone and computer repair")."""
    s = said.strip().lower()
    real = [o for o in options if o.strip() and not o.lower().startswith(("select", "choose", "--"))]
    for o in real:
        if o.lower() == s:
            return o
    contains = [o for o in real if s in o.lower() or o.lower() in s]
    if len(contains) == 1:
        return contains[0]
    words = set(s.split())
    scored = sorted(real, key=lambda o: (-len(words & set(o.lower().split())), -difflib.SequenceMatcher(None, s, o.lower()).ratio()))
    if scored and (words & set(scored[0].lower().split()) or difflib.SequenceMatcher(None, s, scored[0].lower()).ratio() > 0.72):
        return scored[0]
    return None
