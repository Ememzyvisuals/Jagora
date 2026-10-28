"""What Jagora took from the other browser agents (studied from their code, 28 Oct 2026): the model hears what each
action changed (Agent-E), pages are waited on until they react (Stagehand, Playwright MCP, Notte), a page that does
not respond is noticed (Notte, OpenHands), whole forms in one step with errors read back (Playwright MCP), elements
checked just before acting (Notte), site pop-ups and file pickers reported (Playwright MCP), a smaller page picture
(Playwright MCP, BrowserGym), and remembered routes replayed without a model call (Stagehand)."""

import os
import re
import time

os.environ.setdefault("JAGORA_NO_INGEST", "1")

import pytest  # noqa: E402

from jagora.agent import Agent, _goal_key, _path_key  # noqa: E402
from jagora.browser import ActionError, Browser, Element, Snapshot  # noqa: E402
from tests.test_agent import FakeIO, Scripted  # noqa: E402

PAGE = """<!doctype html><meta charset=utf-8>
<button id=more onclick="document.getElementById('box').innerHTML='<p>Payment summary: N5,000</p>'">Show fees</button>
<div id=box></div>
<button id=late onclick="setTimeout(()=>{document.getElementById('box2').textContent='Results are ready'},700)">Check results</button>
<div id=box2></div>
<button id=dead>Does nothing</button>
<button id=ask onclick="document.title = confirm('Submit your form now?') ? 'said yes' : 'said no'">Submit</button>
<button id=pick onclick="document.getElementById('f').click()">Add your photo</button><input id=f type=file style=display:none>
<a href="/a">Read more</a><a href="/a">Read more</a><a href="/b">Contact</a>
<form><label for=e>Email address</label><input id=e type=email required>
<label for=r>Reference number</label><input id=r pattern="[0-9]{10}" title="10 digits">
<label for=s>State</label><select id=s><option>Choose</option><option>Lagos</option><option>Oyo</option></select>
<label><input type=checkbox id=c> I live in Nigeria</label></form>"""


@pytest.fixture
async def browser(tmp_path):
    f = tmp_path / "p.html"
    f.write_text(PAGE)
    b = await Browser({"mobile": True, "w": 390, "h": 844}).start()
    await b.goto(f.as_uri())
    yield b
    await b.close()


def num(snap, label):
    return next(e.id for e in snap.elements if label in (e.label or ""))


async def test_the_model_hears_what_a_click_changed(browser):
    b = browser
    snap = await b.snapshot()
    agent = Agent(Scripted(lambda t, p: []), b, FakeIO(), lang="en")
    await b.changes()
    note = await agent._what_changed("click", b.page.url, "") if await b.click(num(snap, "Show fees")) == "" else ""
    assert 'new on the page: "Payment summary: N5,000"' in note
    await b.changes()
    snap = await b.snapshot()
    await b.click(num(snap, "Does nothing"))
    assert "nothing visible changed" in await agent._what_changed("click", b.page.url, "")


async def test_waits_until_the_page_reacts_not_a_fixed_time(browser):
    b = browser
    snap = await b.snapshot()
    await b.page.click("#late")
    t0 = time.monotonic()
    waited = await b.quiet(cap=4, calm_ms=900)  # the page changes 0.7 s later: the wait sees it and ends after
    assert await b.page.text_content("#box2") == "Results are ready"
    assert waited < 3 and time.monotonic() - t0 < 3
    t0 = time.monotonic()
    await b.quiet()  # a page already at rest: back almost at once
    assert time.monotonic() - t0 < 1.2


async def test_never_acts_on_an_element_the_page_changed(browser):
    b = browser
    snap = await b.snapshot()
    n = num(snap, "Does nothing")
    await b.page.evaluate("document.getElementById('dead').textContent = 'Delete my account'")
    with pytest.raises(ActionError, match="changed since you looked"):
        await b.click(n)


async def test_site_popups_and_file_pickers_are_reported(browser):
    b = browser
    snap = await b.snapshot()
    await b.click(num(snap, "Submit"))
    assert await b.page.title() == "said no"  # no yes from her: the site's "Are you sure?" is answered Cancel
    b.allow_confirm()
    snap = await b.snapshot()
    await b.click(num(snap, "Submit"))
    assert await b.page.title() == "said yes"  # right after her yes, it is part of that yes
    snap = await b.snapshot()
    await b.click(num(snap, "Add your photo"))
    kinds = {n.kind: n.reason for n in b.drain_notices()}
    assert "Submit your form now?" in kinds["dialog"] and "file picker" in kinds["filepicker"]


async def test_a_whole_form_in_one_step_with_errors_read_back(browser):
    b = browser
    snap0 = await b.snapshot()
    e, r, s, c = num(snap0, "Email"), num(snap0, "Reference"), num(snap0, "State"), num(snap0, "Nigeria")

    def plan(t, page):
        if t == 0:
            return [("fill_form", {"fields": [{"element": e, "source": "spoken", "text": "not an email"},
                                              {"element": r, "source": "spoken", "text": "12345"},
                                              {"element": s, "option": "Oyo"}, {"element": c, "checked": True}]})]
        return [("finish", {"summary": "filled", "success": False})]

    io = FakeIO()
    agent = Agent(Scripted(plan), b, io, lang="en", mode="do", profile={})
    await agent.run("Fill the form for me")
    assert await b.page.input_value("#s") == "Oyo" and await b.page.is_checked("#c")
    filled = next(h for h in agent.history if h.startswith("fill_form"))
    # Jagora's own check stops the bad email before typing; the page's own rule catches the short reference number
    assert "filled 3 of 4 fields" in filled and '"Email address": not typed' in filled
    assert "THE PAGE SHOWS ERRORS" in filled and "Reference number" in filled.split("THE PAGE SHOWS ERRORS")[1]


def test_the_page_picture_is_smaller():
    els = [Element(id=1, kind="link", tag="a", label="Read more", href="https://site.ng/a"),
           Element(id=2, kind="link", tag="a", label="Read more", href="https://site.ng/a"),
           Element(id=3, kind="link", tag="a", label="Contact", href="https://site.ng/contact")]
    text = Snapshot("https://site.ng/news", "News", [], [], "", {"y": 0, "max": 0}, els).describe()
    assert text.count('"Read more"') == 1 and "(also [2]: the same)" in text
    assert "-> /contact" in text and "site.ng/contact" not in text  # same-site links: the path only


def test_stuck_is_noticed_from_the_page_itself():
    agent = Agent(Scripted(lambda t, p: []), None, FakeIO(), lang="en")
    snap = Snapshot("https://site.ng/", "x", [], [], "same", {"y": 0, "max": 0}, [])
    notes = []
    for _ in range(6):
        agent._acted = True  # it acted, and the page stayed exactly the same
        notes.append(agent._stuck_check(snap))
    assert notes[3].startswith("(STUCK") and "give up" in notes


async def test_a_remembered_route_is_replayed_without_a_model_call(tmp_path):
    (tmp_path / "start.html").write_text("<a href='step2.html'>Check my result</a>")
    (tmp_path / "step2.html").write_text("<p>Your result is ready</p>")

    class Mem:
        def __init__(self):
            self.saved = None

        async def replay_get(self, key):
            return [{"site": "", "path": _path_key((tmp_path / "start.html").as_uri()), "label": "Check my result", "kind": "link"}]

        async def replay_put(self, key, steps):
            self.saved = steps

    b = await Browser().start()
    try:
        await b.goto((tmp_path / "start.html").as_uri())
        seen = []

        def plan(t, page):
            seen.append(page)
            return [("finish", {"summary": "Your result is ready", "success": True})]

        model = Scripted(plan)
        agent = Agent(model, b, FakeIO(), lang="en", memory=Mem())
        await agent.run("check my result")
        assert b.page.url.endswith("step2.html")  # the link was pressed by the remembered route
        assert "Your result is ready" in seen[0]  # the model's first look was already the next page
        assert any("remembered step" in h for h in agent.history)
    finally:
        await b.close()


def test_keys_fold_what_changes_between_runs():
    assert _path_key("https://jamb.gov.ng/results/2026/12345?x=1") == "/results/#/#"
    assert _goal_key("Check my JAMB result, reg 12345678!") == _goal_key("check my jamb result reg 87654321")
    assert re.fullmatch(r"[a-z ]+", _goal_key("Send to me@x.com now"))
