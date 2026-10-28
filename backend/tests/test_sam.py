"""SAM 3.1 on her photo: Wonder's rough places for the facts become precise outlines, and SAM looks for safety signs
(a QR code turns into a warning). A stand-in for the API speaks SAM's real wire format; the parsing (Meta's own
meta-sam-parser), the marking and the plumbing are real."""

import base64
import io as _io
import json

from meta_sam_parser._mask_codec import _encode_raster  # test only: to write masks the way SAM sends them
from PIL import Image, ImageDraw

from jagora import sam
from jagora.agent import Agent
from tests.test_muse import IO, Agentish

W, H = 800, 600
READING = {"kind": "bill", "from": "Ikeja Electric", "summary": "Your electricity bill is N18,450, due 7 November.",
           "facts": [{"label": "Meter", "value": "4512 3398 2210"}, {"label": "Amount", "value": "N18,450"}],
           "deadlines": [{"what": "Pay the bill", "date": "2026-11-07"}], "asks_her_to": ["Pay by 7 November"],
           "red_flags": [], "risk": "low", "next_steps": ["Pay on the official Ikeja Electric site"],
           # Wonder's rough places, 0 to 1000 of the picture's width and height
           "marks": [{"fact": 0, "box": [100, 100, 400, 160]}, {"fact": 1, "box": [100, 300, 350, 360]}, {"fact": 7, "box": [1, 1, 9, 9]}]}


def letter() -> str:
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle((600, 420, 720, 540), fill="black")  # something QR-like
    b = _io.BytesIO()
    img.save(b, "JPEG")
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


def record(i, l, t, r, b, c=None):
    """One SAM record: a box (inclusive corners on the wire) and its outline, a filled rectangle as a one_bit mask."""
    mw, mh = r - l, b - t
    mask = _encode_raster([1] * (mw * mh), mw, mh)
    conf = f";c={c}" if c is not None else ""
    return f"{i}<|box;x1={l};y1={t};x2={r - 1};y2={b - 1};w={W};h={H}{conf}|><|mask;x=0;y=0;data={mh},{mw},{mask}|>"


class FakeSam(sam.Sam):
    def __init__(self, qr=True, down=False):
        self.prompts, self.qr, self.down = [], qr, down

    async def ask(self, prompt, jpeg):
        self.prompts.append(prompt)
        if self.down:
            raise RuntimeError("sam unavailable")
        if prompt.startswith("<0f>"):  # box prompts: a tight outline inside each rough box
            out = []
            for part in prompt[4:].split(","):
                i = part.split("<")[0]
                f = dict(kv.split("=") for kv in part.split(";")[1:5] if "=" in kv)
                l, t = int(part.split("x1=")[1].split(";")[0]), int(part.split("y1=")[1].split(";")[0])
                r, b = int(part.split("x2=")[1].split(";")[0]), int(part.split("y2=")[1].split(";")[0])
                out.append(record(i, l + 4, t + 4, r - 4, b - 4))
            return "<0f>" + ",".join(out)
        if prompt == "QR code" and self.qr:
            return "<0f>" + record(0, 600, 420, 720, 540, c=0.93)
        if prompt == "handwritten signature":
            return "<0f>" + record(0, 50, 500, 200, 540, c=0.31)  # too unsure: not counted
        return ""  # nothing found


class Wonder:
    def __init__(self, reading=READING):
        from jagora.llm import Usage

        self.usage, self.reading = Usage(), reading

    async def chat(self, messages, tools=None, effort="low", max_tokens=4000, kind="agent"):
        from jagora.llm import Reply

        return Reply(json.dumps(self.reading), [], "stop", 10, 10)


def test_parser_reads_sams_wire_format():
    found = sam.parse("<0f>" + record(3, 10, 20, 50, 40, c=0.8) + "," + record(4, 60, 20, 90, 40))
    assert [f.id for f in found] == ["3", "4"]
    assert found[0].box == (10, 20, 50, 40) and found[0].confidence == 0.8
    assert found[0].mask_size == (40, 20) and set(found[0].mask) == {1}
    assert sam.parse("") == []  # nothing found is a normal answer


def test_rough_boxes_and_fit():
    boxes = sam.rough_boxes(READING["marks"], W, H)
    assert boxes[0] == (0, (80, 60, 320, 96))
    rough = (100, 100, 200, 140)
    assert sam.fit(rough, sam.Found("0", (104, 104, 196, 136))) == (104, 104, 196, 136)
    assert sam.fit(rough, sam.Found("0", (0, 0, 800, 600))) == rough  # SAM took the whole page: keep Wonder's box
    assert sam.fit(rough, None) == rough


async def test_sam_outlines_the_facts_and_warns_about_a_qr_code(tmp_path, monkeypatch):
    monkeypatch.setattr("jagora.agent.FILES_DIR", tmp_path)
    io, fake = IO(), FakeSam()
    model = Agentish(lambda t: [("finish", {"summary": "Pay N18,450 by 7 November.", "success": True})])
    agent = Agent(model, None, io, lang="en", attachment={"kind": "image", "name": "bill.jpg", "data": letter()},
                  wonder=Wonder(), sam=fake)
    await agent.run("What is this letter?")
    reading = next(d for k, d in io.events if k == "reading")
    # the two facts Wonder placed are outlined in ONE box-prompt call; the made-up fact 7 is dropped
    box_calls = [p for p in fake.prompts if p.startswith("<0f>")]
    assert len(box_calls) == 1 and box_calls[0].count("<|box") == 2
    assert reading["marked"] == [0, 1] and reading["outlined_by"] == "SAM 3.1"
    # every safety sign is its own concept request
    assert {"QR code", "official stamp", "handwritten signature"} <= set(fake.prompts)
    signs = {s["kind"]: s["found"] for s in reading["signs"]}
    assert signs == {"qr": True, "stamp": False, "signature": False}
    assert "QR code" in reading["red_flags"][0] and reading["risk"] == "medium"
    # the marked photo is saved and served as a file
    f = tmp_path / reading["image"].split("/")[2] / "marked.webp"
    img = Image.open(f)
    assert img.format == "WEBP" and img.size == (W, H)
    assert "marks" not in reading
    # the agent knows what SAM saw, so Jagora can say it
    assert "QR code" in model.seen[0]


async def test_reading_still_arrives_when_sam_is_down(tmp_path, monkeypatch):
    monkeypatch.setattr("jagora.agent.FILES_DIR", tmp_path)
    io = IO()
    model = Agentish(lambda t: [("finish", {"summary": "ok", "success": True})])
    agent = Agent(model, None, io, lang="en", attachment={"kind": "image", "name": "bill.jpg", "data": letter()},
                  wonder=Wonder(), sam=FakeSam(down=True))
    await agent.run("What is this letter?")
    reading = next(d for k, d in io.events if k == "reading")
    assert reading["from"] == "Ikeja Electric" and reading["red_flags"] == []
    # the rough boxes are still drawn on her photo, from Wonder alone
    assert reading.get("image") and reading["marked"] == [0, 1]


def test_a_pdf_first_page_can_be_marked():
    import pymupdf

    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), "Ikeja Electric bill")
    url = "data:application/pdf;base64," + base64.b64encode(doc.tobytes()).decode()
    jpeg, w, h = sam.photo_for_sam(url)
    assert jpeg[:2] == b"\xff\xd8" and w > 0 and h > 0
    assert sam.photo_for_sam("data:video/mp4;base64,AAAA") is None
