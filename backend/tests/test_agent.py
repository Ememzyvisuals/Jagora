"""The agent loop end to end on the practice portal, with a scripted stand-in for Muse Spark.

This checks everything except the model's judgement: the tools, the safety gate, the read-backs and the browser."""

from pathlib import Path

import pytest

from jagora.agent import Agent
from jagora.browser import Browser
from jagora.llm import Model, Reply, ToolCall, Usage

PORTAL = (Path(__file__).resolve().parent.parent / "portals" / "skills-fair" / "index.html").as_uri()
PROFILE = {"full_name": "Bísí Adébáyọ̀", "phone": "07011111111", "email": "bisi@gmail.com", "date_of_birth": "1999-03-12",
           "gender": "female", "state": "Lagos"}


class FakeIO:
    def __init__(self, yes=True):
        self.yes, self.said, self.confirms, self.handoffs = yes, [], [], []

    async def say(self, text): self.said.append(text)
    async def ask(self, q, choices): return choices[0] if choices else "yes"
    async def confirm(self, q, detail): self.confirms.append(q); return self.yes
    async def point(self, rect, text): return "done"
    async def handoff(self, rect, text): self.handoffs.append(text); return "done"
    async def event(self, kind, data): pass


class Scripted(Model):
    """Plays the part of the model: picks elements by their labels on whatever page it is shown."""

    def __init__(self, plan):
        self.plan, self.turn, self.usage = plan, 0, Usage()

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        page = messages[1]["content"][0]["text"]
        calls = self.plan(self.turn, page)
        self.turn += 1
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 1000, 50)
        self.usage.add(r, kind)
        return r


def num(page: str, label: str) -> int:
    line = next(l for l in page.splitlines() if f'"{label}"' in l and l.startswith("["))
    return int(line[1:line.index("]")])


def register_plan(turn, page):
    if turn == 0:
        return [("tell_user", {"message": "Mo ń ṣí fọ́ọ̀mù náà."}), ("click", {"element": num(page, "Close notice")})]
    if turn == 1:
        return [
            ("type_text", {"element": num(page, "Full name"), "source": "profile", "profile_field": "full_name"}),
            ("type_text", {"element": num(page, "Phone number"), "source": "spoken",
                           "text": "òdo méje òdo ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan ọ̀kan"}),
            ("type_text", {"element": num(page, "Email address"), "source": "profile", "profile_field": "email"}),
            ("type_text", {"element": num(page, "Date of birth"), "source": "profile", "profile_field": "date_of_birth"}),
            ("set_checkbox", {"element": num(page, "Female"), "checked": True}),
            ("choose", {"element": num(page, "State of residence"), "option": "lagos"}),
            ("choose", {"element": num(page, "Skill you want to learn"), "option": "phone repair"}),
            ("set_checkbox", {"element": num(page, "I agree to be contacted about my registration"), "checked": True,
                              "ask": "Ṣé ẹ gbà kí wọ́n kàn sí yín?"}),
            ("click", {"element": num(page, "Submit registration"), "ask": "Ṣé kí n fi fọ́ọ̀mù náà ránṣẹ́?"}),
        ]
    ref = next(w for w in page.split() if w.startswith("NSF-26-"))
    return [("finish", {"summary": f"Ẹ ti forúkọsílẹ̀. Nọ́mbà yín ni {ref}.", "success": True})]


async def test_registers_on_the_portal_with_every_safety_stop():
    io = FakeIO()
    async with Browser() as b:
        agent = Agent(Scripted(register_plan), b, io, lang="yo", mode="do", profile=PROFILE)
        result = await agent.run("Forúkọsílẹ̀ fún Skills Fair", PORTAL)
        page = await b.snapshot(marks=False)
    assert result.success, agent.history
    assert "You are registered" in page.text and "07011111111" in page.text and "Phone and computer repair" in page.text
    # three stops, in order: the spoken phone number read back, agreeing to be contacted, and submitting
    assert io.confirms[0] == "Mo kọ 0701 111 1111. Ṣé ó tọ́?"
    assert io.confirms[1:] == ["Ṣé ẹ gbà kí wọ́n kàn sí yín?", "Ṣé kí n fi fọ́ọ̀mù náà ránṣẹ́?"]
    assert "NSF-26-" in io.said[-1]


async def test_when_she_says_no_nothing_is_submitted():
    io = FakeIO(yes=False)
    async with Browser() as b:
        agent = Agent(Scripted(lambda t, p: register_plan(t, p) if t < 2 else [("finish", {"summary": "ok", "success": False})]),
                      b, io, lang="yo", mode="do", profile=PROFILE)
        await agent.run("register", PORTAL)
        page = await b.snapshot(marks=False)
    assert "You are registered" not in page.text
    assert any("the user said that is not right" in h for h in agent.history)  # the read-back "no" stopped the phone number


async def test_jagora_never_types_a_password():
    html = "data:text/html," + "<label for=p>Password</label><input id=p type=password><button>Log in</button>"
    io = FakeIO()

    def plan(turn, page):
        if turn == 0:
            return [("type_text", {"element": num(page, "Password"), "source": "spoken", "text": "secret123"})]
        if turn == 1:
            return [("hand_over", {"element": num(page, "Password"), "message": "Ẹ tẹ ọ̀rọ̀ aṣínà yín síbí."})]
        return [("finish", {"summary": "ok", "success": True})]

    async with Browser() as b:
        agent = Agent(Scripted(plan), b, io, lang="yo", profile={})
        await agent.run("log in", html)
        value = await b.page.locator("#p").input_value()
    assert value == ""
    assert "is private" in agent.history[0] and io.handoffs == ["Ẹ tẹ ọ̀rọ̀ aṣínà yín síbí."]


async def test_guide_mode_never_acts():
    io = FakeIO()

    def plan(turn, page):
        if turn == 0:
            return [("click", {"element": num(page, "Close notice")})]
        return [("finish", {"summary": "ok", "success": True})]

    async with Browser() as b:
        agent = Agent(Scripted(plan), b, io, lang="en", mode="guide")
        await agent.run("show me", PORTAL)
        still_there = await b.page.locator("#notice").count()
    assert still_there == 1
    assert "unknown tool click" in agent.history[0] or "Guide me" in agent.history[0]
