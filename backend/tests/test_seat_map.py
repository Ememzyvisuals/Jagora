"""From the NRC test: the seat map's seats were plain boxes made clickable by the page's script, so Jagora had no
number for them, guessed free and taken from colours, and kept asking her to tap. Now each seat has a number and the
page's own state; "Find My Train" is not treated as a commitment."""
from jagora.agent import Agent
from jagora.browser import Browser
from jagora.safety import Verdict, check_click

SEATS = "".join(
    f'<div class="seat {"booked" if i in (3, 4, 15) else "available"}" style="cursor:{"not-allowed" if i in (3, 4, 15) else "pointer"};'
    f'width:30px;height:30px;display:inline-block;margin:2px;border:2px solid {"red" if i in (3, 4, 15) else "#999"}"'
    f' onclick="this.classList.add(\'selected\');document.getElementById(\'picked\').textContent=\'Seat {i} selected\'">{i}</div>'
    for i in range(1, 21))
PAGE = f"""<!doctype html><title>Seats</title><h1>Coach C09</h1><p id=picked></p><div style="width:200px">{SEATS}</div>
<form onsubmit="return false"><button type=submit>Find My Train</button><button type=submit>Make Payment</button></form>"""


class IO:
    async def say(self, t): pass
    async def event(self, k, d): pass
    async def ask_point(self, q): raise AssertionError("she must not be asked to tap a seat")


async def test_seats_get_numbers_and_their_state():
    async with Browser() as b:
        await b.page.set_content(PAGE)
        snap = await b.snapshot()
        seats = {e.label: e for e in snap.elements if e.label.isdigit()}
        assert len(seats) == 20
        assert "booked" in seats["15"].state and seats["15"].disabled
        assert "available" in seats["7"].state and not seats["7"].disabled
        text = snap.describe()
        assert "Small boxes" in text and '"15" (disabled, booked' in text
        await b.click(seats["7"].id)
        assert "Seat 7 selected" in await b.page.inner_text("#picked")
        find = next(e for e in snap.elements if e.label == "Find My Train")
        pay = next(e for e in snap.elements if e.label == "Make Payment")
        assert check_click(find, b.page.url, "").verdict == Verdict.ALLOW
        assert check_click(pay, b.page.url, "").verdict == Verdict.CONFIRM


async def test_asking_her_to_tap_a_seat_is_refused():
    async with Browser() as b:
        await b.page.set_content(PAGE)
        snap = await b.snapshot()
        a = Agent(None, b, IO())
        out, _, _ = await a._act("ask_point", {"question": "Tap seat 7 on the seat map"}, snap)
        assert out.startswith('not asked: "7" is [') and "click" in out


def test_her_yes_to_pressing_it_is_not_asked_again():
    a = Agent(None, None, None)
    a._asked.append(("The page shows Ebute Metta to Moniya. Should I press Find My Train to see the trains?", "Yes, find trains for 30 Oct"))
    assert a._she_just_said_yes_to("Find My Train")
    a._asked.append(("Should I press Book Now?", "No, wait"))
    assert not a._she_just_said_yes_to("Book Now")
