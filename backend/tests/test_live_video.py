"""The live page as video: a session with video on sends H.264 (a keyframe first, then frames) that decodes at
full sharpness; with video off it sends sharp JPEG photos, both as binary messages."""
import asyncio
import io
import os

os.environ.setdefault("JAGORA_TEST", "1")

import av  # noqa: E402
from PIL import Image  # noqa: E402

import jagora.server as server  # noqa: E402

PAGE = "<html><body style='font:18px sans-serif;margin:16px'>" + "<p>JAMB has released the 2026 UTME results. Check by SMS.</p>" * 120 + "</body></html>"


class WS:
    def __init__(self):
        self.text, self.bin = [], []

    async def send_text(self, t):
        self.text.append(t)

    async def send_bytes(self, b):
        self.bin.append(b)


async def _session(tmp_path, mobile=True):
    f = tmp_path / "p.html"
    f.write_text(PAGE)
    ws = WS()
    s = server.Session(ws, "u1")
    s.device = {"mobile": True, "w": 390, "h": 844} if mobile else {"mobile": False, "w": 1280, "h": 800}
    s.active_task = "t"
    b = await s.get_browser()
    await b.goto(f.as_uri())
    return s, ws, b


async def test_video_keyframe_then_frames_at_full_sharpness(tmp_path):
    s, ws, b = await _session(tmp_path)
    try:
        await s.set_video(True)
        await asyncio.sleep(0.2)
        before = len(ws.bin)
        for _ in range(6):
            await b.page.mouse.wheel(0, 200)
            await asyncio.sleep(0.15)
        await asyncio.sleep(0.6)
        vids = [m for m in ws.bin if m[0] in (2, 3)]
        after = ws.bin[before:]
        assert vids and vids[0][0] == 2 and any(m[0] == 3 for m in vids)  # a keyframe first, then frames
        dec = av.CodecContext.create("h264", "r")
        frames = [fr for m in vids for pkt in dec.parse(m[1:]) for fr in dec.decode(pkt)]
        assert frames and frames[-1].width >= 580  # 1.5 picture pixels per page pixel of her 390-wide phone
        assert sum(len(m) for m in vids) < 400_000  # a few seconds of scrolling stays small
        assert not any(m[0] == 1 for m in after)  # no photos while video is on
    finally:
        await s.close()


async def test_photos_when_video_is_off(tmp_path):
    s, ws, b = await _session(tmp_path, mobile=False)
    try:
        for _ in range(4):
            await b.page.mouse.wheel(0, 200)
            await asyncio.sleep(0.2)
        await asyncio.sleep(0.4)
        photos = [m for m in ws.bin if m[0] == 1]
        assert photos
        assert Image.open(io.BytesIO(photos[-1][1:])).size[0] >= 1024  # the desktop page at its own width
    finally:
        await s.close()
