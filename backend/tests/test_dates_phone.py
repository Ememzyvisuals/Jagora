"""From the NRC sign-up test: the date of birth box showed 01-Jan-1020 and the phone got 234 twice."""
from types import SimpleNamespace

from jagora.agent import local_phone, to_iso
from jagora.browser import Browser

PAGE = """<!doctype html><title>Register</title>
<label for=a>Date Of Birth</label><input id=a placeholder="DD-MMM-YYYY">
<label for=b>Travel date</label><input id=b type=date>
<label for=c>Birthday</label><input id=c readonly placeholder="dd/mm/yyyy">
<script>
// a picker that only keeps a value it can read as a date (like the NRC one)
document.getElementById('a').addEventListener('change', e => {
  const m = /^(\\d{2})-([A-Z][a-z]{2})-(\\d{4})$/.exec(e.target.value);
  if (!m) e.target.value = '01-Jan-1020';
});
</script>"""


def test_her_dates_read_any_usual_way():
    assert to_iso("1995-05-12") == "1995-05-12"
    assert to_iso("12/05/1995") == "1995-05-12"
    assert to_iso("12 May 1995") == "1995-05-12"
    assert to_iso("12-may-1995") == "1995-05-12"
    assert to_iso("1995") == ""
    assert to_iso("12051995") == "1995-05-12"  # typed with no slashes, as she did on the NRC form
    assert to_iso("19950512") == "1995-05-12"


def test_phone_without_the_234_the_page_shows():
    box = SimpleNamespace(label="Phone Number", placeholder="+234", value="")
    assert local_phone("08031234567", box) == "8031234567"
    assert local_phone("+2348031234567", box) == "8031234567"
    plain = SimpleNamespace(label="Phone Number", placeholder="", value="")
    assert local_phone("08031234567", plain) == "08031234567"


async def test_date_pickers_get_the_right_year():
    async with Browser() as b:
        await b.page.set_content(PAGE)
        snap = await b.snapshot()
        ids = {e.label: e.id for e in snap.elements}
        got = await b.set_date(ids["Date Of Birth"], "1995-05-12")
        assert "1995" in got and "1020" not in got
        assert await b.set_date(ids["Travel date"], "2026-10-30") == "2026-10-30"
        got = await b.set_date(ids["Birthday"], "1995-05-12")
        assert "1995" in got
