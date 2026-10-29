"""A route that reached the payment page is kept for the site, across her messages, without her own choices (the
seat, the date, the train time): those places become "ask her". Loops and presses that changed nothing are left out."""
from types import SimpleNamespace

from jagora.agent import Agent


class Mem:
    def __init__(self):
        self.saved = []

    async def skills_put(self, site, goal, steps):
        self.saved.append((site, goal, steps))


def el(label, state=""):
    return SimpleNamespace(label=label, state=state, kind="button")


def snap_with(*els, url="https://nrc.gsds.ng/bookTrain"):
    return SimpleNamespace(url=url, element=lambda i: els[i])


async def test_route_without_her_choices_saved_at_payment():
    carry = {}
    mem = Mem()
    # first message: open the site, pick stations, a date, find trains
    a1 = Agent(None, None, None, memory=mem, route_carry=carry)
    a1._goal = "book a train from Agege to Moniya"
    s = snap_with(el("From"), el("Choose Friday, October 30th, 2026"), el("Find My Train"), url="https://nrc.gsds.ng/")
    a1._learn("go_to", {"url": "https://nrc.gsds.ng/"}, None, "opened https://nrc.gsds.ng/")
    a1._learn("choose", {"element": 0, "option": "Agege"}, s, 'chose "Agege"')
    a1._learn("click", {"element": 1}, s, 'clicked "Choose Friday, October 30th, 2026"')
    a1._learn("click", {"element": 2}, s, 'clicked "Find My Train" | the page moved')
    # second message: seat (pressed many times, nothing changed), then Continue
    a2 = Agent(None, None, None, memory=mem, route_carry=carry)
    a2._goal = "book seat 63"
    s2 = snap_with(el("63", "available, grey fill"), el("Continue"))
    for _ in range(4):
        a2._learn("click", {"element": 0}, s2, '"63" looks exactly as before: the press did not take')
    a2._learn("click", {"element": 0}, s2, 'clicked "63"; "63" now: selected')
    a2._learn("click", {"element": 1}, s2, 'clicked "Continue" | the page moved')
    a2.browser = SimpleNamespace(page=SimpleNamespace(url="https://checkout.flutterwave.com/pay/abc"))
    await a2._milestone("click", "moved")
    site, goal, steps = mem.saved[-1]
    assert site == "gsds.ng" and "book a train from Agege to Moniya" in goal and "worked end to end" in goal
    text = " | ".join(steps)
    assert "63" not in text and "October" not in text  # her choices are never replayed
    assert steps.count("HER CHOICE here (a seat, date, time or option): ask her, then press what she picks") == 2
    assert 'press "Find My Train"' in text and 'press "Continue"' in text and 'choose in "From"' in text
