"""NRC's station and coach lists are drop-downs the page builds itself: picking one took Jagora three steps (open,
read, click). choose does it in one."""
from jagora.browser import Browser

PAGE = """<!doctype html><title>Book</title><label id=l>From</label>
<div id=box role=combobox aria-labelledby=l tabindex=0 style="border:1px solid #999;width:240px;height:30px">Select station</div>
<ul id=menu role=listbox style="display:none">
  <li role=option>Mobolaji Johnson Station Ebute Metta</li><li role=option>Babatunde Raji Fashola Station Agege</li>
  <li role=option>Obafemi Awolowo Station Moniya</li></ul>
<script>
const box = document.getElementById('box'), menu = document.getElementById('menu');
box.addEventListener('click', () => menu.style.display = 'block');
menu.addEventListener('click', (e) => { box.textContent = e.target.textContent; menu.style.display = 'none'; });
</script>"""


async def test_home_made_dropdown_in_one_step():
    async with Browser() as b:
        await b.page.set_content(PAGE)
        snap = await b.snapshot()
        box = next(e for e in snap.elements if e.kind == "dropdown")
        picked = await b.choose(box.id, "Agege")
        assert picked == "Babatunde Raji Fashola Station Agege"
        assert "Agege" in await b.page.inner_text("#box")
