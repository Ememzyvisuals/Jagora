"""Everything a person does with a mouse and keyboard: hover menus, double and right clicks, drag and drop, key
combinations, clicking by sight on a canvas, uploading her file, date boxes, and pointing at what she means."""

import os

os.environ.setdefault("JAGORA_NO_INGEST", "1")

from jagora.agent import Agent  # noqa: E402
from jagora.browser import Browser  # noqa: E402
from jagora.llm import Model, Reply, ToolCall, Usage  # noqa: E402

HTML = """<!doctype html><meta charset=utf-8><style>
#menu{display:none} #nav:hover #menu{display:block} #zone{width:200px;height:80px;border:2px dashed #888}
#card{width:80px;height:30px;background:#9cf} canvas{border:1px solid #000}</style>
<div id=nav><span>Services</span><div id=menu><a href=# onclick="document.title='opened menu';return false">Exam results</a></div></div>
<p id=dbl ondblclick="this.textContent='edited'">double me</p>
<p id=ctx oncontextmenu="event.preventDefault();this.textContent='menu shown'">right me</p>
<div id=card draggable=true ondragstart="event.dataTransfer.setData('t','x')">card</div>
<div id=zone ondragover="event.preventDefault()" ondrop="event.preventDefault();this.textContent='dropped'">drop here</div>
<input id=k value="abc"><canvas id=cv width=200 height=100></canvas><p id=hit>no hit</p>
<label for=f>Passport photo</label><input id=f type=file onchange="document.getElementById('fn').textContent=this.files[0].name"><p id=fn></p>
<button id=up onclick="document.getElementById('hid').click()">Upload certificate</button><input id=hid type=file style=display:none onchange="document.getElementById('fn2').textContent=this.files[0].name"><p id=fn2></p>
<label for=d>Date of birth</label><input id=d type=date>
<label for=d2>Exam date</label><input id=d2 placeholder="DD/MM/YYYY">
<script>document.getElementById('cv').onclick=e=>{const r=e.target.getBoundingClientRect();document.getElementById('hit').textContent=(e.clientX-r.left>100?'right':'left')+' half'}</script>"""


def page_url(tmp_path):
    f = tmp_path / "hands.html"
    f.write_text(HTML)
    return f.as_uri()


def num(b_snap, label):
    return next(e.id for e in b_snap.elements if label in (e.label or ""))


async def test_mouse_and_keyboard_like_a_person(tmp_path):
    photo = tmp_path / "passport.jpg"
    photo.write_bytes(b"\xff\xd8\xff\xe0fakejpeg")
    async with Browser() as b:
        await b.goto(page_url(tmp_path))
        p = b.page
        snap = await b.snapshot(marks=False)
        # hover opens the menu, then its link can be used
        await p.evaluate("document.getElementById('nav').setAttribute('data-jg','900')")
        await b.hover(900)
        assert await p.locator("#menu").is_visible()
        await p.evaluate("document.getElementById('dbl').setAttribute('data-jg','901');document.getElementById('ctx').setAttribute('data-jg','902');"
                         "document.getElementById('card').setAttribute('data-jg','903');document.getElementById('zone').setAttribute('data-jg','904')")
        await b.double_click(901)
        assert await p.locator("#dbl").inner_text() == "edited"
        await b.right_click(902)
        assert await p.locator("#ctx").inner_text() == "menu shown"
        await b.drag(903, 904)
        assert await p.locator("#zone").inner_text() == "dropped"
        # keys
        await p.locator("#k").click()
        await b.keys("Control+A")
        await b.keys("Backspace")
        assert await p.locator("#k").input_value() == ""
        # click by sight on a canvas (screenshot pixels)
        box = await p.locator("#cv").bounding_box()
        await b.click_at((box["x"] + 160) * b.dsf, (box["y"] + 50) * b.dsf)
        assert await p.locator("#hit").inner_text() == "right half"
        # her file into a file box, and through a styled upload button
        snap = await b.snapshot(marks=False)
        await b.upload(num(snap, "Passport photo"), [str(photo)])
        assert await p.locator("#fn").inner_text() == "passport.jpg"
        await b.upload(num(snap, "Upload certificate"), [str(photo)])
        assert await p.locator("#fn2").inner_text() == "passport.jpg"
        # dates
        assert await b.set_date(num(snap, "Date of birth"), "1999-03-12") == "1999-03-12"
        assert await p.locator("#d").input_value() == "1999-03-12"
        assert await b.set_date(num(snap, "Exam date"), "2027-05-02") == "02/05/2027"
        # what is at a spot she tapped
        r = await p.locator("#up").bounding_box()
        what = await b.element_at(r["x"] + 5, r["y"] + 5)
        assert what["tag"] == "button" and "Upload certificate" in what["text"]


class PointIO:
    def __init__(self, spot):
        self.spot, self.said, self.confirms = spot, [], []

    async def say(self, t): self.said.append(t)
    async def ask(self, q, c): return "yes"
    async def confirm(self, q, d): self.confirms.append(q); return True
    async def point(self, r, t): return "done"
    async def handoff(self, r, t): return "done"
    async def event(self, k, d): pass
    async def ask_point(self, q): return self.spot


class Pointing(Model):
    def __init__(self):
        self.turn, self.usage, self.seen = 0, Usage(), []

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        page = messages[1]["content"][0]["text"]
        self.seen.append(page)
        if self.turn == 0:
            calls = [("ask_point", {"question": "Tap the button you mean"})]
        elif self.turn == 1:
            n = int(page.split("she tapped element [")[1].split("]")[0])
            calls = [("upload_file", {"element": n, "files": ["passport.jpg"]})]
        else:
            calls = [("finish", {"summary": "Uploaded.", "success": True})]
        self.turn += 1
        r = Reply("", [ToolCall(str(i), n, a) for i, (n, a) in enumerate(calls)], "tool_calls", 0, 0)
        self.usage.add(r, kind)
        return r


async def test_she_points_and_jagora_uploads_her_photo(tmp_path):
    photo = tmp_path / "passport.jpg"
    photo.write_bytes(b"\xff\xd8\xff\xe0fakejpeg")
    async with Browser() as b:
        await b.goto(page_url(tmp_path))
        r = await b.page.locator("#up").bounding_box()
        io = PointIO({"x": r["x"] + 10, "y": r["y"] + 8})
        model = Pointing()
        agent = Agent(model, b, io, files={"passport.jpg": str(photo)})
        res = await agent.run("upload my certificate")
        assert res.success, agent.history
        assert "Files she gave you in the chat (for upload_file): passport.jpg" in model.seen[0]
        assert await b.page.locator("#fn2").inner_text() == "passport.jpg"
        assert io.confirms and "passport.jpg" in io.confirms[0]  # she agreed before her file left the chat
