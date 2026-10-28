"""The form card: several boxes she fills in the chat at once, each value goes into its own box on the page; her plain
details can be saved to her details, private ones never reach the model."""
from jagora.agent import Agent
from jagora.browser import Browser

PAGE = """<!doctype html><title>Book a train</title><h1>Passenger details</h1>
<label for=n>Full name</label><input id=n>
<label for=p>Phone number</label><input id=p>
<label for=e>Email</label><input id=e type=email>
<label for=i>NIN</label><input id=i>"""


class IO:
    def __init__(self, values, save=True):
        self.values, self.save, self.cards = values, save, []

    async def say(self, t): pass
    async def ask(self, q, c): return ""
    async def confirm(self, q, d): return True
    async def point(self, r, t): return ""
    async def handoff(self, r, t): return ""
    async def event(self, k, d): pass

    async def ask_form(self, rect, title, fields):
        self.cards.append((title, fields))
        return {"values": self.values, "save": self.save}


async def test_one_card_fills_every_box_and_saves_her_details():
    async with Browser() as b:
        await b.page.set_content(PAGE)
        snap = await b.snapshot()
        num = {e.label: e.id for e in snap.elements}
        io = IO({"0": "Bisi Adeyemi", "1": "08031234567", "2": "bisi@example.com", "3": "12345678901"})
        agent = Agent(None, b, io, profile={})
        agent._may_share = lambda *a: _yes()
        out, changed, _ = await agent._ask_form(snap, {"title": "Passenger details", "fields": [
            {"element": num["Full name"], "label": "Full name", "field": "name", "profile_field": "full_name"},
            {"element": num["Phone number"], "label": "Phone number", "field": "phone", "profile_field": "phone"},
            {"element": num["Email"], "label": "Email", "field": "email", "profile_field": "email"},
            {"element": num["NIN"], "label": "NIN", "field": "nin", "digits": 11}]})
        assert len(io.cards) == 1 and [f["field"] for f in io.cards[0][1]] == ["name", "phone", "email", "nin"]
        assert io.cards[0][1][0]["profile_field"] == "full_name" and "profile_field" not in io.cards[0][1][3]
        got = [await b.page.input_value(s) for s in ("#n", "#p", "#e", "#i")]
        assert got == ["Bisi Adeyemi", "08031234567", "bisi@example.com", "12345678901"]
        assert agent.profile == {"full_name": "Bisi Adeyemi", "phone": "08031234567", "email": "bisi@example.com"}
        assert "12345678901" not in out and "Bisi" not in out  # the model only hears that the boxes were filled
        assert "saved to her details" in out and changed


async def test_skipped_card_fills_nothing():
    async with Browser() as b:
        await b.page.set_content(PAGE)
        snap = await b.snapshot()
        io = IO({}, save=False)
        agent = Agent(None, b, io, profile={})
        agent._may_share = lambda *a: _yes()
        out, _, _ = await agent._ask_form(snap, {"title": "x", "fields": [{"element": snap.elements[0].id, "label": "Full name", "field": "name"}]})
        assert "skipped" in out and await b.page.input_value("#n") == ""


async def _yes():
    return True
