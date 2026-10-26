"""Jagora Pixel Sans: Bricolage Grotesque's letter shapes, rebuilt from pixels.

Takes Jagora Sans (patched Bricolage), fixes it at one weight, then redraws every glyph (letters, Yorùbá ligatures,
tone marks) on a square grid: a cell is inked when the original letter covers at least half of it. Spacing, cmap,
ligatures (ccmp) and mark positioning are kept, so ẹ̀ ọ́ ṣ ₦ still work.
Run: python3 scripts/pixelate-font.py public/fonts/jagora-sans.woff2 [weight] [style]
  style: solid (merged squares) or dot (round pixels with gaps)
"""
import sys
from PIL import Image, ImageDraw
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

src = sys.argv[1]
weight = float(sys.argv[2]) if len(sys.argv) > 2 else 700
style = sys.argv[3] if len(sys.argv) > 3 else "solid"
CELL = 42  # units per pixel; x-height comes out around 12 cells
SS = 6  # supersampling per cell

f = TTFont(src)
f = instancer.instantiateVariableFont(f, {"wght": weight, "wdth": 100, "opsz": 48})
gs = f.getGlyphSet()
glyf, hmtx = f["glyf"], f["hmtx"]
ymin_all = -360
ymax_all = 1100


def flatten(rec):
    """recording -> list of polygons (lists of points), curves sampled"""
    polys, cur, last = [], [], None
    for op, args in rec:
        if op == "moveTo":
            cur = [args[0]]
            last = args[0]
        elif op == "lineTo":
            cur.append(args[0])
            last = args[0]
        elif op == "qCurveTo":
            pts = list(args)
            # implied on-curve points between consecutive off-curve points
            start = last
            offs, end = pts[:-1], pts[-1]
            if end is None:  # closed contour of only off-curve points
                end = ((offs[0][0] + offs[-1][0]) / 2, (offs[0][1] + offs[-1][1]) / 2)
            segs = []
            for i, c in enumerate(offs):
                nxt = end if i == len(offs) - 1 else ((c[0] + offs[i + 1][0]) / 2, (c[1] + offs[i + 1][1]) / 2)
                segs.append((c, nxt))
            for c, e in segs:
                for k in range(1, 9):
                    t = k / 8
                    x = (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * c[0] + t * t * e[0]
                    y = (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * c[1] + t * t * e[1]
                    cur.append((x, y))
                start = e
            last = end
        elif op == "curveTo":
            c1, c2, e = args
            s = last
            for k in range(1, 11):
                t = k / 10
                x = (1 - t) ** 3 * s[0] + 3 * (1 - t) ** 2 * t * c1[0] + 3 * (1 - t) * t * t * c2[0] + t ** 3 * e[0]
                y = (1 - t) ** 3 * s[1] + 3 * (1 - t) ** 2 * t * c1[1] + 3 * (1 - t) * t * t * c2[1] + t ** 3 * e[1]
                cur.append((x, y))
            last = e
        elif op in ("closePath", "endPath"):
            if len(cur) > 2:
                polys.append(cur)
            cur = []
    return polys


def cells_for(name):
    rec = DecomposingRecordingPen(gs)
    gs[name].draw(rec)
    polys = flatten(rec.value)
    if not polys:
        return [], 0
    xs = [p[0] for poly in polys for p in poly]
    x0 = (min(xs) // CELL) * CELL - CELL
    x1 = (max(xs) // CELL + 2) * CELL
    W = int((x1 - x0) / CELL) * SS
    H = int((ymax_all - ymin_all) / CELL) * SS
    img = Image.new("1", (W, H), 0)
    sc = SS / CELL
    for poly in polys:  # even-odd fill: each contour toggles
        m = Image.new("1", (W, H), 0)
        ImageDraw.Draw(m).polygon([((x - x0) * sc, (ymax_all - y) * sc) for x, y in poly], fill=1)
        img = Image.frombytes("1", (W, H), bytes(a ^ b for a, b in zip(img.tobytes(), m.tobytes()))) if False else _xor(img, m)
    small = img.convert("L").resize((W // SS, H // SS), Image.BOX)
    px = small.load()
    out = []
    for j in range(H // SS):
        for i in range(W // SS):
            if px[i, j] >= 128:
                out.append((x0 + i * CELL, ymax_all - (j + 1) * CELL))
    return out, x0


def _xor(a, b):
    from PIL import ImageChops
    return ImageChops.logical_xor(a, b)


def draw_cells(cells):
    pen = TTGlyphPen(None)
    if style == "dot":
        # rounded square pixels, close together
        size, rad = CELL * 0.9, CELL * 0.2
        for x, y in cells:
            x0, y0 = x + (CELL - size) / 2, y + (CELL - size) / 2
            x1, y1 = x0 + size, y0 + size
            pen.moveTo((x0 + rad, y0))
            pen.lineTo((x1 - rad, y0))
            pen.qCurveTo((x1, y0), (x1, y0 + rad))
            pen.lineTo((x1, y1 - rad))
            pen.qCurveTo((x1, y1), (x1 - rad, y1))
            pen.lineTo((x0 + rad, y1))
            pen.qCurveTo((x0, y1), (x0, y1 - rad))
            pen.lineTo((x0, y0 + rad))
            pen.qCurveTo((x0, y0), (x0 + rad, y0))
            pen.closePath()
    else:
        # merge horizontal runs into one rectangle each
        rows = {}
        for x, y in cells:
            rows.setdefault(y, []).append(x)
        for y, xs in rows.items():
            xs.sort()
            start = prev = xs[0]
            for x in xs[1:] + [None]:
                if x is not None and x == prev + CELL:
                    prev = x
                    continue
                pen.moveTo((start, y))
                pen.lineTo((start, y + CELL))
                pen.lineTo((prev + CELL, y + CELL))
                pen.lineTo((prev + CELL, y))
                pen.closePath()
                if x is not None:
                    start = prev = x
    return pen.glyph()


new = {}
for name in f.getGlyphOrder():
    cells, _ = cells_for(name)
    new[name] = draw_cells(cells) if cells else TTGlyphPen(None).glyph()
for name, g in new.items():
    glyf[name] = g
    g.recalcBounds(glyf)
    adv = hmtx[name][0]
    adv = int(round(adv / CELL) * CELL) if adv else 0
    hmtx[name] = (adv, getattr(g, "xMin", 0) if g.numberOfContours else 0)
for t in ("gvar", "HVAR", "MVAR", "STAT", "avar", "fvar", "cvar"):
    if t in f:
        del f[t]
for rec in f["name"].names:
    if rec.nameID in (1, 3, 4, 6, 16):
        rec.string = rec.toUnicode().replace("Jagora Sans", "Jagora Pixel Sans").replace("JagoraSans", "JagoraPixelSans")
f.flavor = "woff2"
out = f"public/fonts/jagora-pixel-sans-{style}.woff2"
f.save(out)
print(out)
