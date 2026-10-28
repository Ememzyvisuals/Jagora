"""Jagora drives the app on her screen too: it sees what the app shows and can change it ('close this',
'show me the browser'), like a shop agent that drives its own page."""
import os

os.environ.setdefault("JAGORA_TEST", "1")

from jagora.agent import Agent  # noqa: E402
from jagora.llm import Model, Reply, ToolCall, Usage  # noqa: E402


class IO:
    def __init__(self):
        self.events = []

    async def say(self, t): pass
    async def ask(self, q, c): return ""
    async def confirm(self, q, d): return True
    async def point(self, r, t): return "done"
    async def handoff(self, r, t): return "done"
    async def event(self, k, d): self.events.append((k, d))


class ShowMe(Model):
    def __init__(self):
        self.turn, self.usage, self.seen, self.tools = 0, Usage(), [], []

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        self.seen.append(messages[1]["content"][0]["text"])
        self.tools.append({t["function"]["name"] for t in tools or []})
        calls = [("app_control", {"action": "show_page"})] if self.turn == 0 else [("finish", {"summary": "Here it is.", "success": True})]
        self.turn += 1
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 0, 0)
        self.usage.add(r, kind)
        return r


async def test_jagora_sees_her_screen_and_changes_it():
    io, model = IO(), ShowMe()
    screen = "Device: phone. Screen: home.\nOpen chat: \"JAMB result\" (done). Live page: JAMB (https://efacility.jamb.gov.ng), hidden."
    agent = Agent(model, None, io, screen=lambda: screen)
    res = await agent.run("show me the browser")
    assert res.success
    assert "On the user's screen in the Jagora app now" in model.seen[0] and "JAMB result" in model.seen[0]
    assert "app_control" in model.tools[0]
    assert ("app", {"action": "show_page", "value": ""}) in io.events


async def test_no_app_no_app_control():
    """A scheduled run has no screen to change: the tool is not offered."""
    model = ShowMe()
    agent = Agent(model, None, IO())
    await agent.run("check my result at midnight")
    assert "app_control" not in model.tools[0]
