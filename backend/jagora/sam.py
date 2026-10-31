"""SAM 3.1 (Meta's Segment Anything) on the photos people share.

When someone shares a photo of a letter or a bill, Muse Wonder reads it and gives the rough place of each key fact
(the amount, the due date, the account number). SAM 3.1 then:

- turns those rough boxes into precise outlines on her own photo (box prompts, every fact in one call), so she sees
  exactly where on the paper each number is, and can check it with her own eyes or show someone she trusts;
- looks for safety signs, one concept at a time and all at once: a QR code (fake letters and bills often push people
  to scan one and pay), an official stamp and a signature.

Everything here is best effort: if SAM is unavailable she still gets Wonder's reading.
The SAM 3.1 output format (boxes and masks as special tokens) is parsed with Meta's own meta-sam-parser.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
from dataclasses import dataclass

from jagora.config import settings

log = logging.getLogger("jagora.sam")

MAX_SIDE = 1600  # the photo is sent and marked at this size at most

# the safety signs SAM looks for: a short noun phrase each (SAM's concept prompts are noun phrases, one per request)
SIGNS = {"qr": "QR code", "stamp": "official stamp", "signature": "handwritten signature"}

SIGN_NAMES = {
    "qr": {"en": "QR code", "pcm": "QR code", "yo": "Kóòdù QR", "ha": "Lambar QR", "ig": "Koodu QR"},
    "stamp": {"en": "Official stamp", "pcm": "Official stamp", "yo": "Òǹtẹ̀ ìjọba", "ha": "Hatimi", "ig": "Stampụ"},
    "signature": {"en": "Signature", "pcm": "Signature", "yo": "Ìbuwọ́lù", "ha": "Sa hannu", "ig": "Mbinye aka"},
}

QR_FLAG = {
    "en": "There is a QR code on it. Do not scan it or pay through it until you are sure who sent this.",
    "pcm": "QR code dey for am. No scan am or pay through am until you sure who send am.",
    "yo": "Kóòdù QR wà lórí rẹ̀. Ẹ má ṣe ṣàyẹ̀wò rẹ̀ tàbí sanwó nípasẹ̀ rẹ̀ títí ẹ ó fi mọ ẹni tí ó fi ránṣẹ́.",
    "ha": "Akwai lambar QR a kai. Kada ku duba ta ko ku biya ta cikinta har sai kun tabbatar da wanda ya aiko.",
    "ig": "Enwere koodu QR n'ime ya. Ejila ya scan ma ọ bụ kwụọ ụgwọ site na ya ruo mgbe ị matara onye zitere ya.",
}


@dataclass
class Found:
    """One thing SAM found: its box on the photo and its outline (a 0/1 mask the size of the box), if any."""

    id: str
    box: tuple[int, int, int, int]  # left, top, right, bottom (right and bottom exclusive)
    mask: bytes | None = None
    mask_size: tuple[int, int] = (0, 0)  # width, height of the mask raster
    confidence: float | None = None


def photo_for_sam(data_url: str) -> tuple[bytes, int, int] | None:
    """Her photo (or the first page of her PDF) as a JPEG at most MAX_SIDE wide or tall, with its size."""
    from PIL import Image, ImageOps

    if not data_url.startswith("data:"):
        return None
    head, b64 = data_url.split(",", 1)
    mime = head[5:].split(";")[0]
    raw = base64.b64decode(b64)
    if mime == "application/pdf":
        import pymupdf

        doc = pymupdf.open(stream=raw, filetype="pdf")
        if not doc.page_count:
            return None
        raw = doc[0].get_pixmap(dpi=140).tobytes("png")
    elif not mime.startswith("image/"):
        return None
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:  # noqa: BLE001
        return None
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue(), img.width, img.height


def parse(text: str) -> list[Found]:
    """SAM 3.1's output text (boxes and masks as special tokens) into what it found."""
    from meta_sam_parser import CompletedOutcome, decode_mask_to_raster, image_segmentation_format

    parser = image_segmentation_format().create_parser()
    parser.push(text or "")
    result = parser.finish(CompletedOutcome()).result
    found: dict[str, Found] = {}
    for r in result.records:
        if r.kind == "box":
            found[r.object_id] = Found(r.object_id, (int(r.left), int(r.top), int(r.right), int(r.bottom)), confidence=r.confidence)
        elif r.kind == "mask" and r.object_id in found:
            try:
                found[r.object_id].mask = decode_mask_to_raster(r.mask)
                found[r.object_id].mask_size = (r.mask.width, r.mask.height)
            except Exception as e:  # noqa: BLE001
                log.info("a SAM mask could not be decoded: %s", e)
    return list(found.values())


def box_prompt(boxes: list[tuple[int, int, int, int]], w: int, h: int) -> str:
    """Up to 16 boxes as one SAM object prompt (ids 0, 1, 2 ... in order)."""
    from meta_sam_parser import FramePrompt, PromptBox, PromptObject, build_object_prompt

    objs = []
    for i, (l, t, r, b) in enumerate(boxes[:16]):
        l, t = max(0, min(w - 1, l)), max(0, min(h - 1, t))
        r, b = max(l + 1, min(w, r)), max(t + 1, min(h, b))
        objs.append(PromptObject(id=i, prompts=[FramePrompt(box=PromptBox(l, t, r, b))]))
    return build_object_prompt(size=(w, h), objects=objs)


class Sam:
    """SAM 3.1 over the Meta Model API (the Responses endpoint)."""

    def __init__(self, key: str | None = None, base: str | None = None, model: str | None = None) -> None:
        self.key = key or settings.meta_key
        self.base = (base or settings.meta_base_url).rstrip("/")
        self.model = model or settings.sam_model

    async def ask(self, prompt: str, jpeg: bytes) -> str:
        """One request: a concept (a short noun phrase) or box prompts, and the photo. Returns SAM's output text."""
        import httpx

        body = {
            "model": self.model,
            "input": [{"type": "message", "role": "user", "content": [
                {"type": "input_text", "text": prompt},
                {"type": "input_image", "image_url": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()},
            ]}],
            "metadata": {"include_confidence": "true", "mask_encoding": "one_bit"},
        }
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{self.base}/responses", headers={"Authorization": f"Bearer {self.key}"}, json=body)
            r.raise_for_status()
            return output_text(r.json())

    async def find(self, concept: str, jpeg: bytes, min_conf: float = 0.5) -> list[Found]:
        found = parse(await self.ask(concept, jpeg))
        return [f for f in found if f.confidence is None or f.confidence >= min_conf]

    async def outline(self, boxes: list[tuple[int, int, int, int]], jpeg: bytes, w: int, h: int) -> dict[int, Found]:
        """Precise outlines for rough boxes, all in one call. Keyed by the box's index."""
        found = parse(await self.ask(box_prompt(boxes, w, h), jpeg))
        out = {}
        for f in found:
            try:
                out[int(f.id)] = f
            except ValueError:
                pass
        return out


def output_text(resp: dict) -> str:
    """The text of a Responses API reply (output_text, or the output_text parts of its output)."""
    if isinstance(resp.get("output_text"), str):
        return resp["output_text"]
    parts = []
    for item in resp.get("output") or []:
        for c in item.get("content") or []:
            if c.get("type") == "output_text":
                parts.append(c.get("text") or "")
    return "".join(parts)


def rough_boxes(marks: list, w: int, h: int) -> list[tuple[int, tuple[int, int, int, int]]]:
    """Wonder's rough places for the facts (0 to 1000 on each side) as pixel boxes: (fact index, box)."""
    out = []
    for m in marks or []:
        try:
            i = int(m.get("fact"))
            x1, y1, x2, y2 = (float(v) for v in m.get("box"))
        except (TypeError, ValueError, AttributeError):
            continue
        x1, x2 = sorted((x1, x2))
        y1, y2 = sorted((y1, y2))
        box = (int(x1 / 1000 * w), int(y1 / 1000 * h), int(x2 / 1000 * w), int(y2 / 1000 * h))
        if box[2] - box[0] >= 4 and box[3] - box[1] >= 4:
            out.append((i, box))
    return out[:16]


def fit(rough: tuple[int, int, int, int], f: Found | None) -> tuple[int, int, int, int]:
    """SAM's box when it agrees with the rough one; the rough box when SAM wandered off (text is not an object)."""
    if not f:
        return rough
    rw, rh = rough[2] - rough[0], rough[3] - rough[1]
    l, t, r, b = f.box
    area, rough_area = max(0, r - l) * max(0, b - t), rw * rh
    if area < rough_area * 0.15 or area > rough_area * 4:
        return rough
    return f.box


def _mask_layer(f: Found, size: tuple[int, int]):
    """The outline mask placed on the whole photo (an 'L' image), or None."""
    from PIL import Image

    if not f.mask or not f.mask_size[0] or not f.mask_size[1]:
        return None
    mw, mh = f.mask_size
    m = Image.frombytes("L", (mw, mh), bytes(v * 255 for v in f.mask))
    l, t, r, b = f.box
    if (r - l, b - t) != (mw, mh) and r > l and b > t:
        m = m.resize((r - l, b - t))
    layer = Image.new("L", size, 0)
    layer.paste(m, (l, t))
    return layer


def draw(jpeg: bytes, facts: list[tuple[int, tuple[int, int, int, int], Found | None]], signs: list[tuple[str, Found]]) -> bytes:
    """Her photo with each fact outlined and numbered, a QR code outlined in red, a stamp and signature in green."""
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    img = Image.open(io.BytesIO(jpeg)).convert("RGB")
    W, H = img.size
    over = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    lw = max(3, round(min(W, H) / 260))
    pad = lw * 2
    try:
        font = ImageFont.load_default(size=max(14, round(min(W, H) / 38)))
    except TypeError:  # Pillow without sized default fonts
        font = ImageFont.load_default()

    def shape(f: Found | None, box, rgb):
        layer = _mask_layer(f, img.size) if f else None
        if layer is not None and f.box == box:
            # the outline itself: a soft fill on what SAM found and a line around it
            fill = Image.new("RGBA", img.size, rgb + (60,))
            over.paste(fill, (0, 0), layer)
            edge = layer.filter(ImageFilter.MaxFilter(lw * 2 + 1)).point(lambda v: 255 if v else 0)
            edge = Image.composite(edge, Image.new("L", img.size, 0), layer.point(lambda v: 0 if v else 255))
            over.paste(Image.new("RGBA", img.size, rgb + (255,)), (0, 0), edge)
        else:
            l, t, r, b = box
            d.rounded_rectangle((l - pad, t - pad, r + pad, b + pad), radius=pad * 2, fill=rgb + (45,), outline=rgb + (255,), width=lw)

    def badge(x, y, text, rgb):
        tw = d.textlength(text, font=font)
        r = max(font.size if hasattr(font, "size") else 14, tw) * 0.75
        x, y = max(r, min(W - r, x)), max(r, min(H - r, y))
        d.ellipse((x - r, y - r, x + r, y + r), fill=rgb + (255,), outline=(255, 255, 255, 255), width=max(2, lw // 2))
        d.text((x, y), text, fill=(255, 255, 255, 255), font=font, anchor="mm")

    blue, red, green = (29, 99, 237), (196, 54, 26), (26, 127, 69)
    for kind, f in signs:
        shape(f, f.box, red if kind == "qr" else green)
    for n, (_, rough, f) in enumerate(facts, 1):
        box = fit(rough, f)
        shape(f, box, blue)
        badge(box[0] - pad, box[1] - pad, str(n), blue)
    for kind, f in signs:
        if kind == "qr":
            badge(f.box[2] + pad, f.box[1] - pad, "!", red)

    out = Image.alpha_composite(img.convert("RGBA"), over).convert("RGB")
    out.thumbnail((1200, 1200))
    buf = io.BytesIO()
    out.save(buf, "WEBP", quality=82)
    return buf.getvalue()


async def look(sam: Sam, jpeg: bytes) -> dict[str, list[Found]]:
    """The safety signs, each its own concept request, all at once."""

    async def one(kind, concept):
        try:
            return kind, await sam.find(concept, jpeg)
        except Exception as e:  # noqa: BLE001
            log.info("SAM could not look for %s: %s", concept, e)
            return kind, None

    got = await asyncio.gather(*(one(k, c) for k, c in SIGNS.items()))
    return {k: v for k, v in got if v is not None}


async def cutout(sam: "Sam", jpeg: bytes, w: int, h: int) -> bytes | None:
    """The person on a photo as a soft mask (a grey PNG the size of the photo, white on the person), for the painting
    mode: the face is painted carefully and the background loosely. None when SAM finds no one."""
    import io as _io

    from PIL import Image, ImageChops, ImageFilter

    found = await sam.find("person", jpeg, min_conf=0.35)
    if not found:
        return None
    m = Image.new("L", (w, h), 0)
    for f in found[:4]:
        layer = _mask_layer(f, (w, h))
        if layer is None:
            layer = Image.new("L", (w, h), 0)
            l, t, r, b = f.box
            layer.paste(255, (l, t, r, b))
        m = ImageChops.lighter(m, layer)
    m = m.filter(ImageFilter.GaussianBlur(max(2, w // 200)))
    out = _io.BytesIO()
    m.save(out, "PNG")
    return out.getvalue()
