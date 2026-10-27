"""Meta's Muse family beyond the agent: Muse Wonder reads what she shares, Muse Image draws picture guides, and the
safety checks can run on open weights. Scripted stand-ins for the API; the plumbing is real."""

import base64
import io as _io
import json

from PIL import Image

from jagora import muse
from jagora.agent import Agent
from jagora.llm import Model, Reply, ToolCall, Usage

BILL = {"kind": "bill", "from": "Ikeja Electric", "summary": "Your electricity bill is N18,450, due 7 November.",
        "facts": [{"label": "Meter", "value": "4512 3398 2210"}, {"label": "Amount", "value": "N18,450"}],
        "deadlines": [{"what": "Pay the bill", "date": "2026-11-07"}], "asks_her_to": ["Pay by 7 November"],
        "red_flags": [], "risk": "low", "next_steps": ["Pay on the official Ikeja Electric site"]}


def photo() -> str:
    b = _io.BytesIO()
    Image.new("RGB", (40, 30), "white").save(b, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


class Wonder(Model):
    def __init__(self, fail=False):
        self.usage, self.fail, self.got = Usage(), fail, None

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        if self.fail:
            raise RuntimeError("wonder unavailable")
        self.got = messages
        return Reply(json.dumps(BILL), [], "stop", 10, 10)


class Agentish(Model):
    """The agent's model: plans picture panels when asked, otherwise follows a short plan."""

    def __init__(self, plan):
        self.plan, self.turn, self.usage, self.seen = plan, 0, Usage(), []

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        if kind == "panels":
            return Reply(json.dumps({"title": "Pay your light bill", "panels": [
                {"scene": "Bisi holds her bill", "caption": "Your bill is N18,450"},
                {"scene": "Bisi pays on her phone", "caption": "Pay on the Ikeja Electric site"},
                {"scene": "Bisi smiles with the lights on", "caption": "Before 7 November"}]}), [], "stop", 1, 1)
        if kind != "agent":
            return Reply("{}", [], "stop", 1, 1)
        self.seen.append(messages[1]["content"][0]["text"])
        calls = self.plan(self.turn)
        self.turn += 1
        return Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 1, 1)


class IO:
    def __init__(self):
        self.events, self.said = [], []

    async def say(self, t): self.said.append(t)
    async def ask(self, q, c): return "yes"
    async def confirm(self, q, d): return True
    async def point(self, r, t): return "done"
    async def handoff(self, r, t): return "done"
    async def event(self, kind, data): self.events.append((kind, data))


class FakeImages:
    def __init__(self):
        self.calls = []

    async def generate(self, prompt):
        self.calls.append(("generate", prompt))
        return b"RIFF-first"

    async def edit(self, prompt, reference):
        self.calls.append(("edit", reference))
        return b"RIFF-next"


async def test_wonder_reads_her_photo_and_jagora_acts_on_it():
    io, wonder = IO(), Wonder()
    model = Agentish(lambda t: [("finish", {"summary": "Pay N18,450 by 7 November.", "success": True})])
    agent = Agent(model, None, io, lang="en", attachment={"kind": "image", "name": "bill.jpg", "data": photo()}, wonder=wonder)
    res = await agent.run("What is this letter?")
    assert res.success
    reading = next(d for k, d in io.events if k == "reading")
    assert reading["read_by"] == "Muse Wonder" and reading["from"] == "Ikeja Electric"
    assert any(p.get("type") == "image_url" for p in wonder.got[0]["content"])  # Wonder saw the photo
    assert "4512 3398 2210" in model.seen[0]  # and the agent works from the reading


async def test_when_wonder_is_down_muse_spark_reads_it():
    io = IO()
    spark = Wonder()
    d = await muse.read_attachment({"data": photo()}, "yo", "today", wonder=Wonder(fail=True), fallback=spark)
    assert d and d["read_by"] == "Muse Spark"


async def test_pdf_pages_become_pictures_for_wonder():
    import pymupdf

    doc = pymupdf.open()
    for i in range(3):
        doc.new_page().insert_text((72, 72), f"Admission letter page {i + 1}")
    parts = muse.media_parts({"data": "data:application/pdf;base64," + base64.b64encode(doc.tobytes()).decode()})
    assert len(parts) == 3 and all(p["image_url"]["url"].startswith("data:image/png") for p in parts)


async def test_picture_guide_keeps_the_same_woman_in_every_picture(tmp_path, monkeypatch):
    monkeypatch.setattr("jagora.agent.FILES_DIR", tmp_path)
    io, imgs = IO(), FakeImages()
    model = Agentish(lambda t: [("picture_guide", {"text": "Pay N18,450 on the Ikeja Electric site before 7 November."})] if t == 0
                     else [("finish", {"summary": "Done.", "success": True})])
    agent = Agent(model, None, io, lang="en", images=imgs)
    await agent.run("Show me in pictures how to pay my bill")
    pics = next(d for k, d in io.events if k == "pictures")
    assert [p["caption"] for p in pics["panels"]] == ["Your bill is N18,450", "Pay on the Ikeja Electric site", "Before 7 November"]
    assert imgs.calls[0][0] == "generate" and "Bisi" in imgs.calls[0][1] and "No words" in imgs.calls[0][1]
    assert all(c == ("edit", b"RIFF-first") for c in imgs.calls[1:])  # drawn from the first picture
    for p in pics["panels"]:
        assert (tmp_path / p["url"].split("/files/")[1]).exists()


async def test_safety_checks_run_on_open_weights_when_set():
    judged = []

    class Open(Model):
        usage = Usage()

        async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
            judged.append(kind)
            return Reply('{"fits": false, "why": "not what she asked"}', [], "stop", 1, 1)

    agent = Agent(Agentish(lambda t: []), None, IO(), side_model=Open())
    agent._goal = "What is my balance?"
    ok, why = await agent._fits_request("Send money", "sends money")
    assert not ok and judged == ["intent"]
