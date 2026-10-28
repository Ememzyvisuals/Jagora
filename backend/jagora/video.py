"""The live page as video: Chrome's screencast frames, encoded as H.264 on the server and played by the phone's own
video decoder (WebCodecs), so the page looks sharp, moves smoothly and uses far less data than a stream of photos.

The settings follow the low-latency recipes of Neko and Kernel's live views: x264 `zerolatency` (no frames held
back), `veryfast`, no B-frames, constrained baseline (every phone can decode it), Annex B byte stream with the
SPS/PPS headers repeated on every keyframe (so a viewer can join at any keyframe), and a cap on the bitrate so a
burst of scrolling never floods a slow connection. Each encoded frame (access unit) is sent as one WebSocket
message; the app feeds it straight to VideoDecoder.

Frames only come when the page changes, so a still page costs nothing. A keyframe is forced when someone starts
watching or the app's decoder asks for one.
"""

from __future__ import annotations

import io
import logging
from fractions import Fraction

import av
import numpy as np
from PIL import Image

log = logging.getLogger("jagora.video")

# bitrate caps, in kbit/s: full quality and data saver
KBPS = {"full": 1400, "lite": 300}
CRF = {"full": 24, "lite": 30}


class Encoder:
    def __init__(self, width: int, height: int, lite: bool = False) -> None:
        self.w, self.h = width - width % 2, height - height % 2
        self.lite = lite
        tier = "lite" if lite else "full"
        c = av.CodecContext.create("libx264", "w")
        c.width, c.height = self.w, self.h
        c.pix_fmt = "yuv420p"
        c.time_base = Fraction(1, 1000)
        kbps = KBPS[tier]
        c.options = {
            "preset": "veryfast",
            "tune": "zerolatency",
            "profile": "baseline",
            "crf": str(CRF[tier]),
            "maxrate": f"{kbps}k",
            "bufsize": f"{kbps}k",  # one second of buffer: bursts stay short
            "x264-params": "keyint=120:min-keyint=30:scenecut=0:bframes=0:repeat-headers=1:aud=1:annexb=1:sliced-threads=0",
            "threads": "2",
        }
        self.ctx = c
        self.t0: int | None = None
        self.last_pts = -1

    def encode(self, jpeg: bytes, t_ms: int, key: bool = False) -> list[tuple[bytes, bool]]:
        """One screencast JPEG in; the encoded frame(s) out, as (Annex B bytes, is keyframe)."""
        img = Image.open(io.BytesIO(jpeg)).convert("RGB")
        if img.size != (self.w, self.h):
            img = img.resize((self.w, self.h), Image.BILINEAR)
        frame = av.VideoFrame.from_ndarray(np.asarray(img), format="rgb24").reformat(format="yuv420p")
        if self.t0 is None:
            self.t0 = t_ms
        pts = max(self.last_pts + 1, t_ms - self.t0)
        self.last_pts = pts
        frame.pts = pts
        frame.time_base = self.ctx.time_base
        if key:
            frame.pict_type = av.video.frame.PictureType.I
        return [(bytes(p), bool(p.is_keyframe)) for p in self.ctx.encode(frame)]

    def close(self) -> None:
        try:
            self.ctx.encode(None)
        except Exception:  # noqa: BLE001
            pass


def jpeg_size(jpeg: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(jpeg)).size
