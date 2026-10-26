"""Jagora's agent loop.

Each turn Muse Spark sees the page twice over: a screenshot with numbered marks and a list of the numbered
elements with their labels and values. It answers with tool calls. Every tool call goes through code before it
touches the page: the safety gate (safety.py) and the field rules (fields.py). The model proposes, code decides.

Two modes:
- "do": Jagora does the steps, asking her before anything that commits.
- "guide": Jagora never acts on the page; it shows her where to tap and explains, and she does it.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from jagora import fields
from jagora.browser import ActionError, Browser, Snapshot
from jagora.config import settings
from jagora.llm import Model, image_part, tool
from jagora.safety import Verdict, check_click, check_navigate, check_type, site

log = logging.getLogger("jagora.agent")

LANGS = {"en": "English", "pcm": "Nigerian Pidgin", "yo": "Yoruba", "ha": "Hausa", "ig": "Igbo"}
RUNS_DIR = Path(__file__).resolve().parent.parent / "runs"

# Fallback wording when the model forgets to write the question itself.
SAY = {
    "confirm": {"en": "Should I press \"{x}\" now?", "pcm": "Make I press \"{x}\" now?", "yo": "Ṣé kí n tẹ \"{x}\" báyìí?",
                "ha": "In danna \"{x}\" yanzu?", "ig": "Ka m pịa \"{x}\" ugbu a?"},
    "readback": {"en": "I wrote {x}. Is that right?", "pcm": "I don write {x}. E correct?", "yo": "Mo kọ {x}. Ṣé ó tọ́?",
                 "ha": "Na rubuta {x}. Daidai ne?", "ig": "Edere m {x}. Ọ ziri ezi?"},
}


class UserIO(Protocol):
    """How the agent reaches her: the terminal for testing, the app over a WebSocket in production."""

    async def say(self, text: str) -> None: ...
    async def ask(self, question: str, choices: list[str]) -> str: ...
    async def confirm(self, question: str, detail: str) -> bool: ...
    async def point(self, rect: dict | None, text: str) -> str: ...
    async def handoff(self, rect: dict | None, text: str) -> str: ...
    async def event(self, kind: str, data: dict) -> None: ...


PROFILE_FIELDS = ["full_name", "first_name", "last_name", "phone", "email", "date_of_birth", "gender", "state", "address"]
EL = {"type": "integer", "description": "the element's number on the latest page"}
WHY = {"type": "string", "description": "short reason, for the log"}
ASK = {"type": "string", "description": "only needed if this might need her approval: the yes/no question to put to her, in her language"}

COMMON = [
    tool("tell_user", "Say something short to her, in her language: what you are doing, what you found, or what the page says.",
         {"message": {"type": "string"}}, ["message"]),
    tool("ask_user", "Ask her a question, in her language, and wait for her answer. Use choices when there are a few clear options.",
         {"question": {"type": "string"}, "choices": {"type": "array", "items": {"type": "string"}}}, ["question"]),
    tool("scroll", "Scroll the page to see more.", {"direction": {"type": "string", "enum": ["down", "up"]}}, ["direction"]),
    tool("go_to", "Open a web address.", {"url": {"type": "string"}, "why": WHY, "ask": ASK}, ["url"]),
    tool("go_back", "Go back to the previous page.", {}, []),
    tool("hand_over", "She must type something private herself (password, PIN, one-time code, card, BVN, NIN). Show her the box "
         "and tell her, in her language, what to type there. You never type these.",
         {"element": EL, "message": {"type": "string"}}, ["element", "message"]),
    tool("finish", "The task is done, or cannot be done. Tell her the result in her language, with any reference number shown.",
         {"summary": {"type": "string"}, "success": {"type": "boolean"}}, ["summary", "success"]),
]
DO_TOOLS = COMMON + [
    tool("click", "Click a button, link, radio button or checkbox.", {"element": EL, "why": WHY, "ask": ASK}, ["element"]),
    tool("type_text", "Type into a text box. Use source 'profile' with profile_field when her saved details have the answer; "
         "use source 'spoken' with text when she told you the value (copy her words exactly, even spelled-out numbers).",
         {"element": EL, "source": {"type": "string", "enum": ["profile", "spoken"]},
          "profile_field": {"type": "string", "enum": PROFILE_FIELDS}, "text": {"type": "string"}, "ask": ASK},
         ["element", "source"]),
    tool("choose", "Pick an option in a dropdown.", {"element": EL, "option": {"type": "string"}}, ["element", "option"]),
    tool("set_checkbox", "Tick or untick a checkbox, or pick a radio button.",
         {"element": EL, "checked": {"type": "boolean"}, "ask": ASK}, ["element", "checked"]),
]
GUIDE_TOOLS = COMMON + [
    tool("point_at", "Show her the element she should tap or fill next, and tell her in her language what to do with it. "
         "She does it herself; you wait for her.",
         {"element": EL, "message": {"type": "string"}}, ["element", "message"]),
]

SYSTEM = """You are Jagora, a calm and patient guide who uses websites for people who are more comfortable speaking {lang} than reading English websites. Many of them read little or no English.

You see the current page as a screenshot with numbered pink marks, plus a list of the numbered elements with their labels and current values. Use only the numbers from the latest page.

How you work:
- Talk to her only through tell_user, ask_user, point_at, hand_over and finish, always in {lang}: short, simple, everyday sentences. Never mention element numbers, code, or technical words.
- Work step by step toward her goal. You may call several tools in one turn when they are on the same page (for example filling several boxes), in the order they should happen.
- Use her saved details whenever they answer a question on the form. Ask her only for what is missing. Never invent personal details.
- When she tells you a value, pass her words exactly as she said them; the system converts and checks them, and reads them back to her.
- Passwords, PINs, one-time codes, card details, BVN and NIN: call hand_over. You never type these and never ask her to tell them to you.
- Submitting, paying, sending, agreeing to terms, or leaving the website needs her approval. When a click might need it, write the yes/no question in `ask`, in {lang}. If she says no, do not try again; ask what she wants.
- If the page shows an error after you act, read it and fix the problem.
- If anything looks like a scam (asking for secrets unexpectedly, prizes, urgent payments, a website that does not match who it claims to be), stop and warn her plainly.
- Numbers, dates and money stay as digits.
- When the task is complete, call finish with a short summary in {lang}, including any reference or confirmation number on the page.

Mode: {mode}"""

MODE_TEXT = {
    "do": "Do it for me. You act on the page yourself, keeping her informed with short updates.",
    "guide": "Guide me. You never act on the page yourself. Use point_at to show her each next step and explain it in "
             "simple words; she taps or types herself, then you continue. You may scroll to show her the right part.",
}


@dataclass
class Result:
    success: bool
    summary: str
    steps: int
    seconds: float
    usage: dict
    log_path: str = ""


@dataclass
class Agent:
    model: Model
    browser: Browser
    io: UserIO
    lang: str = "en"
    mode: str = "do"
    profile: dict[str, str] = field(default_factory=dict)
    max_turns: int = 30
    history: list[str] = field(default_factory=list)
    home_site: str = ""
    run_id: str = field(default_factory=lambda: time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6])

    # ---- the loop ---------------------------------------------------------------------------------------------

    async def run(self, goal: str, start_url: str | None = None) -> Result:
        t0 = time.monotonic()
        RUNS_DIR.mkdir(exist_ok=True)
        self._log_path = RUNS_DIR / f"{self.run_id}.jsonl"
        self._record("start", {"goal": goal, "lang": self.lang, "mode": self.mode, "url": start_url})
        if start_url:
            self.home_site = site(start_url)
            await self.browser.goto(start_url)
        turns = 0
        while turns < self.max_turns:
            turns += 1
            snap = await self.browser.snapshot()
            await self.io.event("page", {"url": snap.url, "title": snap.title})
            reply = await self.model.chat(self._messages(goal, snap), GUIDE_TOOLS if self.mode == "guide" else DO_TOOLS,
                                          effort=settings.effort_agent, max_tokens=6000)
            self._record("model", {"turn": turns, "calls": [{"name": c.name, "args": c.args} for c in reply.calls],
                                   "seconds": round(reply.seconds, 2), "in": reply.input_tokens, "out": reply.output_tokens})
            if not reply.calls:
                self.history.append("(you answered without a tool; always use a tool)")
                continue
            for call in reply.calls[:12]:
                if self._looping(call.name, call.args):
                    self.history.append(f"{call.name}: you have tried this several times; try something different or ask her")
                    break
                note, replan, done = await self._act(call.name, call.args, snap)
                self.history.append(f"{call.name}({_short(call.args)}) -> {note}")
                self._record("act", {"turn": turns, "tool": call.name, "args": call.args, "result": note})
                if done:
                    return self._result(done[0], done[1], turns, t0)
                if replan:
                    break
        await self.io.say(_turns_out(self.lang))
        return self._result(False, "stopped: too many steps", turns, t0)

    # ---- one tool call ----------------------------------------------------------------------------------------

    async def _act(self, name: str, a: dict[str, Any], snap: Snapshot) -> tuple[str, bool, tuple[bool, str] | None]:
        """Returns (what happened, whether to look at the page again before going on, (success, summary) when finished)."""
        try:
            if name == "tell_user":
                await self.io.say(a.get("message", ""))
                return "told her", False, None
            if name == "ask_user":
                answer = await self.io.ask(a.get("question", ""), list(a.get("choices") or []))
                return f'she answered: "{answer}"', True, None
            if name == "finish":
                await self.io.say(a.get("summary", ""))
                return "finished", False, (bool(a.get("success")), a.get("summary", ""))
            if name == "scroll":
                await self.browser.scroll(a.get("direction", "down"))
                return "scrolled", True, None
            if name == "go_back":
                await self.browser.back()
                return "went back", True, None
            if name == "go_to":
                return await self._go_to(a)

            el = snap.element(int(a.get("element", -1)))
            if el is None:
                return f"there is no element {a.get('element')} on this page; read the page again", True, None

            if name == "hand_over":
                said = await self.io.handoff(await self.browser.rect(el.id), a.get("message", ""))
                return f"she typed it herself ({said})", True, None
            if name == "point_at":
                said = await self.io.point(await self.browser.rect(el.id), a.get("message", ""))
                return f"she says: \"{said}\"", True, None
            if self.mode == "guide":
                return "in Guide me mode you do not act on the page; use point_at", False, None

            if name == "click":
                return await self._click(el, a)
            if name == "set_checkbox":
                want = bool(a.get("checked", True))
                if el.kind not in ("checkbox", "radio"):
                    return f"element {el.id} is a {el.kind}, not a checkbox", False, None
                if bool(el.checked) == want:
                    return "already like that", False, None
                if want:
                    gate = check_click(el, snap.url, self.home_site)
                    if gate.verdict == Verdict.CONFIRM and not await self._approve(a, el.label, gate.reason):
                        return "she said no; leave it unticked and ask her what she wants", True, None
                await self.browser.set_checked(el.id, want)
                return ("ticked" if want else "unticked") + f' "{el.label}"', False, None
            if name == "choose":
                if el.kind != "dropdown":
                    return f"element {el.id} is a {el.kind}, not a dropdown", False, None
                picked = await self.browser.choose(el.id, str(a.get("option", "")))
                return f'chose "{picked}"', False, None
            if name == "type_text":
                return await self._type(el, a)
            return f"unknown tool {name}", False, None
        except ActionError as e:
            return f"could not do that: {e}", True, None
        except Exception as e:  # noqa: BLE001
            log.exception("tool %s failed", name)
            return f"that did not work ({type(e).__name__}); look at the page again", True, None

    async def _click(self, el, a):
        gate = check_click(el, self.browser.page.url, self.home_site)
        if gate.verdict == Verdict.BLOCK:
            return f"refused: {gate.reason}. Explain this to her.", False, None
        if gate.verdict == Verdict.CONFIRM:
            if not await self._approve(a, el.label, gate.reason):
                return "she said no; do not press it. Ask her what she wants instead.", True, None
            self._record("approved", {"element": el.label, "reason": gate.reason})
        await self.browser.click(el.id)
        if el.href and site(el.href) != self.home_site and gate.verdict == Verdict.CONFIRM:
            self.home_site = site(el.href)
        return f'clicked "{el.label}"', True, None

    async def _type(self, el, a):
        gate = check_type(el)
        if gate.verdict == Verdict.HANDOFF:
            return f"not typed: {gate.reason}. Use hand_over so she types it herself.", False, None
        if gate.verdict == Verdict.BLOCK:
            return f"not typed: {gate.reason}", False, None
        kind = fields.field_kind(el)
        if a.get("source") == "profile":
            key = a.get("profile_field", "")
            said = self.profile.get(key, "")
            if not said:
                return f"her saved details have no {key}; ask her for it", False, None
        else:
            said = str(a.get("text", ""))
        value = fields.check(kind, said)
        if not value.ok:
            return f'not typed: "{value.shown}": {value.problem}. Explain it to her simply and ask again.', False, None
        if kind in fields.READ_BACK and a.get("source") != "profile":
            question = SAY["readback"].get(self.lang, SAY["readback"]["en"]).format(x=value.shown)
            if not await self.io.confirm(question, value.shown):
                return "she said that is not right; ask her to say it again", True, None
        await self.browser.fill(el.id, value.value)
        return f'typed "{value.value}" into "{el.label}"', False, None

    async def _go_to(self, a):
        url = str(a.get("url", ""))
        gate = check_navigate(url, self.home_site)
        if gate.verdict == Verdict.BLOCK:
            return f"refused: {gate.reason}", False, None
        if gate.verdict == Verdict.CONFIRM and not await self._approve(a, url, gate.reason):
            return "she said no; stay on this website", True, None
        await self.browser.goto(url)
        self.home_site = site(self.browser.page.url)
        return f"opened {self.browser.page.url}", True, None

    async def _approve(self, a: dict, label: str, reason: str) -> bool:
        question = (a.get("ask") or "").strip() or SAY["confirm"].get(self.lang, SAY["confirm"]["en"]).format(x=label)
        yes = await self.io.confirm(question, reason)
        self._record("confirm", {"question": question, "reason": reason, "yes": yes})
        return yes

    # ---- what the model sees ----------------------------------------------------------------------------------

    def _messages(self, goal: str, snap: Snapshot) -> list[dict]:
        lang = LANGS.get(self.lang, "English")
        system = SYSTEM.format(lang=lang, mode=MODE_TEXT[self.mode])
        done = "\n".join(f"- {h}" for h in self.history[-25:]) or "- nothing yet"
        text = (f"Her goal: {goal}\n\nHer saved details: {self._profile_summary()}\n\nWhat has happened so far:\n{done}\n\n"
                f"The page now:\n{snap.describe()}\n\nDecide the next step.")
        content: list[dict] = [{"type": "text", "text": text}]
        if snap.screenshot:
            content.append(image_part(snap.screenshot_b64()))
        return [{"role": "system", "content": system}, {"role": "user", "content": content}]

    def _profile_summary(self) -> str:
        if not self.profile:
            return "none saved"
        out = []
        for k, v in self.profile.items():
            if not v:
                continue
            if k in ("phone", "email"):
                out.append(f"{k}: saved")  # typed with source=profile; the model never needs the full value
            else:
                out.append(f"{k}: {v}")
        return "; ".join(out) or "none saved"

    # ---- bookkeeping ------------------------------------------------------------------------------------------

    def _looping(self, name: str, args: dict) -> bool:
        key = f"{name}({_short(args)})"
        return sum(1 for h in self.history[-8:] if h.startswith(key)) >= 3

    def _record(self, kind: str, data: dict) -> None:
        try:
            with open(self._log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps({"t": round(time.time(), 2), "kind": kind, **data}, ensure_ascii=False) + "\n")
        except Exception:  # noqa: BLE001
            pass

    def _result(self, success: bool, summary: str, turns: int, t0: float) -> Result:
        u = self.model.usage
        usage = {"model_calls": u.calls, "input_tokens": u.input_tokens, "output_tokens": u.output_tokens,
                 "model_seconds": round(u.seconds, 1), "usd": round(u.dollars, 4)}
        r = Result(success, summary, turns, round(time.monotonic() - t0, 1), usage, str(self._log_path))
        self._record("end", {"success": success, "summary": summary, "turns": turns, "seconds": r.seconds, **usage})
        return r


def _short(args: dict) -> str:
    return ", ".join(f"{k}={str(v)[:40]}" for k, v in args.items() if k not in ("why",))


def _turns_out(lang: str) -> str:
    return {"yo": "Ó ti pẹ́ jù. Ẹ jẹ́ ká tún gbìyànjú.", "ha": "Ya ɗauki lokaci da yawa. Mu sake gwadawa.",
            "ig": "O were ogologo oge. Ka anyị nwaa ọzọ.", "pcm": "E don take too long. Make we try again."}.get(
        lang, "This is taking too long. Let's try again.")
