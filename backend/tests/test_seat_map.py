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


# the NRC map from the 30 Oct test: every seat box looks the same; only the seat drawing inside is red (taken) or grey
ICON = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 4h14v14H5z" fill="none" stroke="{c}" stroke-width="2"/></svg>'
SEATS2 = "".join(
    f'<div style="cursor:pointer;width:34px;height:40px;display:inline-block;margin:2px" onclick="this.dataset.s=1">{ICON.format(c="#e5484d" if i in (10, 20, 46) else "#9aa0a6")}<span>{i}</span></div>'
    for i in range(40, 50)) + "".join(
    f'<div style="cursor:pointer;width:34px;height:40px;display:inline-block;margin:2px">{ICON.format(c="#e5484d" if i in (10, 20) else "#9aa0a6")}<span>{i}</span></div>'
    for i in (10, 20, 21, 22))


async def test_seats_drawn_as_pictures_get_their_colour():
    async with Browser() as b:
        await b.page.set_content(f"<!doctype html><div style='width:300px'>{SEATS2}</div>")
        snap = await b.snapshot()
        seats = {e.label: e for e in snap.elements if e.label.isdigit()}
        assert "red lines" in seats["46"].state and "red lines" not in seats["41"].state
        text = snap.describe()
        grouped = text.split("Numbered boxes grouped by look")[1].split("\n")[0]
        red = " ".join(g.split("]")[1] for g in grouped.split("|") if "red" in g.split("]")[0])
        assert "46" in red and "10" in red and "20" in red and "41" not in red


async def test_a_seat_pressed_three_times_is_called_taken():
    async with Browser() as b:
        await b.page.set_content(f"<!doctype html><div style='width:300px'>{SEATS2}</div>")
        a = Agent(None, b, IO())
        for _ in range(2):
            snap = await b.snapshot()
            out, ok, _ = await a._act("click", {"element": next(e.id for e in snap.elements if e.label == "46")}, snap)
            assert out.startswith('clicked "46"')
        snap = await b.snapshot()
        out, ok, _ = await a._act("click", {"element": next(e.id for e in snap.elements if e.label == "46")}, snap)
        assert out.startswith('not pressed again: "46"') and "taken" in out


# colour only on screen (a pseudo-element outline the page script cannot be asked about): read it from the screenshot
SEATS3 = "<style>.s{cursor:pointer;width:40px;height:44px;display:inline-block;margin:3px;position:relative;text-align:center;line-height:44px}" \
         ".s:before{content:'';position:absolute;inset:2px;border:4px solid #9aa0a6;border-radius:6px}.t:before{border-color:#e5484d}" \
         ".k:before{border-color:#2e9e44}</style>" + "".join(
    f'<div class="s{" t" if i in (45, 46, 47) else " k" if i == 41 else ""}">{i}</div>' for i in range(40, 52))


async def test_seat_colours_read_from_the_screen():
    async with Browser() as b:
        await b.page.set_content(f"<!doctype html><div style='width:400px'>{SEATS3}</div>")
        snap = await b.snapshot()
        seats = {e.label: e for e in snap.elements if e.label.isdigit()}
        assert "red on screen" in seats["46"].state, seats["46"].state
        assert "green on screen" in seats["41"].state
        assert "grey on screen" in seats["43"].state
        await b.page.evaluate("document.body.insertAdjacentHTML('afterbegin', '<p>Selected Available Not Available</p>')")
        text = (await b.snapshot()).describe()
        grouped = text.split("Numbered boxes grouped by look")[1].split("\n")[0]
        assert [g for g in grouped.split("|") if "LIKELY TAKEN" in g and "46" in g]
        assert [g for g in grouped.split("|") if "LIKELY SELECTED NOW" in g and "41" in g]


# NRC from Emmanuel's photo: free seats have a thin dark-grey outline, taken ones a thin LIGHT red one, his pick turns green
SEATS4 = "<style>.s{cursor:pointer;width:34px;height:38px;display:inline-block;margin:3px;position:relative;text-align:center;line-height:38px;font-size:10px}" \
         ".s:before{content:'';position:absolute;inset:3px;border:2px solid #6b6f76;border-radius:5px}.t:before{border-color:#e8a0a0}" \
         ".k:before{border-color:#43a047}</style><p>Selected Available Not Available</p>" + "".join(
    f'<div class="s{" t" if i in (1, 3, 4, 46) else " k" if i == 41 else ""}">{i}</div>' for i in range(1, 50))


async def test_light_red_outline_reads_as_taken():
    async with Browser() as b:
        await b.page.set_content(f"<!doctype html><div style='width:240px'>{SEATS4}</div>")
        snap = await b.snapshot()
        seats = {e.label: e for e in snap.elements if e.label.isdigit()}
        assert "red on screen" in seats["46"].state, seats["46"].state
        assert "grey on screen" in seats["2"].state, seats["2"].state
        grouped = snap.describe().split("Numbered boxes grouped by look")[1].split("\n")[0]
        taken = " ".join(g for g in grouped.split("|") if "LIKELY TAKEN" in g)
        assert "46" in taken and "4" in taken and "2," not in taken
