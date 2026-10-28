"""Highlights land on the right words and stay there: forgiving quote matching (curly quotes, dashes, long
paragraphs) and the ring drawn inside the page, following its element as the page scrolls."""
import os

os.environ.setdefault("JAGORA_TEST", "1")

from jagora.browser import Browser  # noqa: E402

TERMS = ("<html><body style='margin:20px;font:16px sans-serif'><h1>Terms of Use</h1>"
         + "<p>" + "We may update these terms from time to time. " * 40
         + "You agree that we won’t be liable for any loss — direct or indirect — arising from your use of the service, "
         + "and that disputes go to arbitration in London. " + "Please read carefully. " * 60 + "</p>"
         + "<div style='height:1500px'></div><label><input type=checkbox id=agree> I agree</label><div style='height:800px'></div></body></html>")


async def test_quote_with_straight_quotes_and_dashes_is_found_in_a_long_paragraph(tmp_path):
    f = tmp_path / "terms.html"
    f.write_text(TERMS)
    async with Browser() as b:
        await b.goto(f.as_uri())
        got = await b.highlight("You agree that we won't be liable for any loss - direct or indirect - arising from your use of the service")
        assert got is not None
        marked = await b.page.evaluate("() => [...document.querySelectorAll('mark.__jg')].map(m => m.textContent).join('')")
        assert "liable for any loss" in marked and "update these terms" not in marked  # just the clause, not the paragraph


async def test_ring_follows_its_element_when_the_page_scrolls(tmp_path):
    f = tmp_path / "terms.html"
    f.write_text(TERMS)
    async with Browser() as b:
        await b.goto(f.as_uri())
        await b.page.evaluate("() => document.getElementById('agree').scrollIntoView({block: 'center'})")
        r = await b.page.evaluate("() => { const r = document.getElementById('agree').getBoundingClientRect(); return {x: r.left, y: r.top, w: r.width, h: r.height}; }")
        await b.ring(r, "stop")
        await b.page.mouse.wheel(0, 300)
        await b.page.wait_for_timeout(300)
        box = await b.page.evaluate("""() => { const a = document.getElementById('agree').getBoundingClientRect(),
            g = document.getElementById('__jg_ring').getBoundingClientRect(); return {dy: (g.top + 4) - a.top, dx: (g.left + 4) - a.left}; }""")
        assert abs(box["dy"]) < 2 and abs(box["dx"]) < 2  # still exactly around the checkbox after scrolling
        await b.ring(None)
        assert await b.page.evaluate("() => !document.getElementById('__jg_ring')")
