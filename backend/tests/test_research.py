"""Research tools on a local copy of a school site: find the brochure link, open the PDF, find the line, highlight it as
evidence, download it. Plus the web guard's verdicts. (No internet needed.)"""

import functools
import http.server
import threading
from pathlib import Path

import pytest

from jagora.browser import Browser
from jagora.guard import Guard, parse_list, registrable
from jagora.research import check_official

ADMISSIONS = """<!doctype html><title>Admissions | Sample University</title>
<h1>Undergraduate admissions</h1>
<p>Candidates must meet the requirements in the official brochure.</p>
<p><a href="/files/brochure-2026.pdf">Download the 2026/2027 admission brochure (PDF)</a></p>
<p><a href="/news.html">Latest news</a></p>
<div class=foot>Last updated: 14 March 2026</div>
<table><tr><th>Course</th><th>Cut-off</th></tr><tr><td>Computer Science</td><td>270</td></tr></table>"""


def make_pdf(path: Path):
    import fitz

    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text((72, 90), "SAMPLE UNIVERSITY ADMISSION BROCHURE 2026/2027", fontsize=14)
    p1.insert_text((72, 130), "Faculty of Science", fontsize=12)
    p2 = doc.new_page()
    p2.insert_text((72, 90), "Computer Science", fontsize=13)
    p2.insert_text((72, 120), "UTME subjects: English Language, Mathematics, Physics and one of", fontsize=11)
    p2.insert_text((72, 136), "Chemistry, Biology, Economics or Geography.", fontsize=11)
    p2.insert_text((72, 170), "O'Level: five credits including English, Mathematics and Physics.", fontsize=11)
    doc.save(path)


@pytest.fixture(scope="module")
def site(tmp_path_factory):
    root = tmp_path_factory.mktemp("site")
    (root / "admissions.html").write_text(ADMISSIONS)
    (root / "files").mkdir()
    make_pdf(root / "files" / "brochure-2026.pdf")

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


async def test_find_brochure_open_pdf_and_highlight_evidence(site):
    async with Browser() as b:
        await b.goto(site + "/admissions.html")
        links = await b.links("brochure")
        assert links and links[0]["pdf"]
        hits = await b.find_text("cut-off")
        assert hits
        ev = await b.highlight("Computer Science")
        assert ev and ev["image"][:2] == b"\xff\xd8"  # a JPEG of the highlighted part
        assert "2026" in await b.page_date()

        await b.goto(links[0]["url"])
        assert b.pdf and b.pdf.pages == 2
        found = await b.find_text("UTME subjects")
        assert found[0]["page"] == 2 and "mathematics" in found[0]["snippet"]
        ev = await b.highlight("English Language, Mathematics, Physics", near=2)
        assert ev["page"] == 2 and ev["image"][:2] == b"\xff\xd8"
        snap = await b.snapshot(marks=False)
        assert snap.pdf["page"] == 2 and "Physics" in snap.text

        data, ctype, name = await b.fetch(links[0]["url"])
        assert data.startswith(b"%PDF") and name == "brochure-2026.pdf"


async def test_pages_and_tabs(site):
    async with Browser() as b:
        await b.goto(site + "/admissions.html")
        await b.new_tab(site + "/files/brochure-2026.pdf")
        assert len(b.pages) == 2 and b.pdf
        await b.switch_tab(0)
        assert b.pdf is None
        snap = await b.snapshot(marks=False)
        assert len(snap.tabs) == 2


def test_guard_verdicts():
    g = Guard()
    assert g.check("https://portal.jamb.gov.ng/efacility").official
    assert g.check("https://www.unilag.edu.ng/admissions").owner == "University of Lagos"
    assert g.check("https://jambportal-ng.com/pay").category == "lookalike"
    assert g.check("https://gtbank-verify.xyz/login").category == "lookalike"
    assert g.check("https://unilagg.com").category == "lookalike"  # one letter off
    assert g.check("https://www.pornhub.com").category == "adult"
    assert g.check("https://www.sportybet.com").category == "gambling"
    assert g.check("https://punchng.com/jamb-2027").category == "ok"
    assert g.check("https://xn--jmb-0na.gov.ng").category == "lookalike"
    assert g.is_ad("https://securepubads.g.doubleclick.net/x")
    assert g.check("https://futminna.edu.ng").official  # any registered school address
    assert registrable("https://a.b.portal.jamb.gov.ng/x") == "jamb.gov.ng"


def test_blocklist_parsing():
    assert parse_list("0.0.0.0 bad.example\n# c\n127.0.0.1 ads.example.com\nphish.example.org\n0.0.0.0 0.0.0.0") == {
        "bad.example", "ads.example.com", "phish.example.org"}


def test_check_official_reasons():
    assert check_official("jamb.gov.ng")["verdict"] == "official"
    r = check_official("jamb-registration-2027.com")
    assert r["verdict"] == "fake or dangerous"
    assert check_official("myschoolgist.com")["verdict"] == "not confirmed"


async def test_guard_blocks_adult_pages_and_closes_overlays():
    page = """data:text/html,<p>Real content here</p>
      <div style="position:fixed;inset:0;z-index:999;background:rgba(0,0,0,.6)">
        <div>Advertisement: Congratulations you won! <button aria-label="close">×</button></div></div>"""
    async with Browser() as b:
        await b.goto(page)
        snap = await b.snapshot(marks=False)
        kinds = {n.kind for n in b.drain_notices()}
        assert "ad" in kinds
        assert "Congratulations" not in snap.text and "Real content" in snap.text
