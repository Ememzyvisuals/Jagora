"""Add Nigerian letters to Geist Pixel (SIL OFL 1.1), saved as "Jagora Pixel".

Geist Pixel has no dot-below letters, no ₦ and no Hausa hooks. Every letter is built on a 38-unit grid, so the
missing ones can be made from the font's own pieces:
  - dot below (ẹ ọ ṣ ị ụ, and capitals): the tittle of "i", centred under the letter, one cell below the baseline
  - tone marks on dotted vowels (ẹ̀ ẹ́ ọ̀ ọ́ ...): the font's own è é ò ó ..., plus the dot below, reached through a
    ccmp ligature so "ẹ" + U+0300 renders as one glyph
  - ǹ m̀ ḿ (syllabic nasals): the grave/acute taken from è/é and centred on the letter
  - ṅ: the tittle above n
  - ₦: N with two bars made from the hyphen
  - ɓ ɗ ƙ: two extra cells as a hook at the top of the stem
Run: python3 scripts/patch-pixel-font.py   (needs fontTools and brotli)
"""
import os
import unicodedata
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.otlLib.builder import buildLigatureSubstSubtable
from fontTools.ttLib.tables import otTables as ot

SRC = "node_modules/geist/dist/fonts/geist-pixel"
OUT = "public/fonts"
CELL = 38
VARIANTS = ["Square", "Grid", "Circle", "Triangle", "Line"]


def contours(gs, name):
    rec = DecomposingRecordingPen(gs)
    gs[name].draw(rec)
    out, cur = [], []
    for op, args in rec.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"):
            out.append(cur)
            cur = []
    return out


def bounds_of(gs, items):
    b = BoundsPen(gs)
    for c in items:
        for op, args in c:
            getattr(b, op)(*args)
    return b.bounds


def snap(v):
    return round(v / CELL) * CELL


def patch(variant):
    f = TTFont(f"{SRC}/GeistPixel-{variant}.woff2")
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    gname = lambda ch: cmap[ord(ch)]
    order = f.getGlyphOrder()
    glyf, hmtx = f["glyf"], f["hmtx"]
    new = {}  # name -> (pieces [(contours, dx, dy)], width, codepoint|None)

    def gbounds(name):
        b = BoundsPen(gs)
        gs[name].draw(b)
        return b.bounds

    xh = gbounds("x")[3]
    # tittle: the contours of "i" above the x-height
    tittle = [c for c in contours(gs, "i") if bounds_of(gs, [c])[1] >= xh]
    tb = bounds_of(gs, tittle)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]

    def dot_below(base):
        b = gbounds(base)
        cx = (b[0] + b[2]) / 2
        dx = snap(cx - tw / 2) - tb[0]
        dy = -CELL - th - tb[1]
        return (tittle, dx, dy)

    def dot_above(base):
        b = gbounds(base)
        cx = (b[0] + b[2]) / 2
        return (tittle, snap(cx - tw / 2) - tb[0], 0)

    def accent_from(pre, plain):
        """contours of the mark in a precomposed glyph (those above the plain letter), with its x-centre"""
        top = gbounds(plain)[3]
        acc = [c for c in contours(gs, pre) if bounds_of(gs, [c])[1] >= top]
        ab = bounds_of(gs, acc)
        return acc, (ab[0] + ab[2]) / 2 - (gbounds(plain)[0] + gbounds(plain)[2]) / 2

    def accent_on(pre, plain, base):
        acc, off = accent_from(pre, plain)
        ab = bounds_of(gs, acc)
        b = gbounds(base)
        target = (b[0] + b[2]) / 2 + off
        dx = snap(target - (ab[2] - ab[0]) / 2) - ab[0]
        # lowercase marks sit relative to x-height; keep their height when moving onto n or m
        return (acc, dx, 0)

    def add(name, cp, base, extra, width=None):
        pieces = [(contours(gs, base), 0, 0)] + extra
        new[name] = (pieces, width if width is not None else hmtx[base][0], cp)

    # dotted letters
    for ch in "eosiuEOSIU":
        dotted = unicodedata.normalize("NFC", ch + "̣")
        add(f"uni{ord(dotted):04X}", ord(dotted), gname(ch), [dot_below(gname(ch))])
    # ṅ Ṅ
    add("uni1E45", 0x1E45, "n", [dot_above("n")])
    # toned dotted vowels: precomposed toned vowel + dot below
    ligs = {}
    for v in "eoiuEOIU":
        dotted = unicodedata.normalize("NFC", v + "̣")
        for mark, comb in (("̀", "gravecomb"), ("́", "acutecomb"), ("̄", "uni0304")):
            pre = unicodedata.normalize("NFC", v + mark)
            if len(pre) != 1 or ord(pre) not in cmap:
                continue
            name = f"uni{ord(dotted):04X}_{comb}"
            add(name, None, cmap[ord(pre)], [dot_below(gname(v))])
            ligs[(f"uni{ord(dotted):04X}", comb)] = name
    # syllabic nasals: ǹ (precomposed exists in Unicode), m̀ ḿ via ligature
    gacc = accent_on("egrave", "e", "n")
    add("uni01F9", 0x01F9, "n", [gacc])
    for mark, comb, pre in (("̀", "gravecomb", "egrave"), ("́", "acutecomb", "eacute")):
        name = f"m_{comb}"
        add(name, None, "m", [accent_on(pre, "e", "m")])
        ligs[("m", comb)] = name
    if 0x1E3F not in cmap:  # ḿ precomposed
        add("uni1E3F", 0x1E3F, "m", [accent_on("eacute", "e", "m")])
    # ₦: N with two hyphen bars
    hy = contours(gs, "hyphen")
    hb = bounds_of(gs, hy)
    nb = gbounds("N")
    bars = []
    for y in (snap(nb[3] * 0.36), snap(nb[3] * 0.6)):
        dy = y - hb[1]
        bars.append((hy, snap(nb[0] - CELL) - hb[0], dy))
        bars.append((hy, snap(nb[2] + CELL - (hb[2] - hb[0])) - hb[0], dy))
    add("uni20A6", 0x20A6, "N", bars)
    # Hausa hooks: two cells at the top of the stem, to the right
    cell = [c for c in contours(gs, "period")]
    pb = bounds_of(gs, cell)
    scale = CELL / (pb[2] - pb[0]) if len(cell) == 1 else 1
    if len(cell) > 1:  # grid-like variants: one cell is one contour; take the top-left one
        cell = [min(cell, key=lambda c: (bounds_of(gs, [c])[0], -bounds_of(gs, [c])[3]))]
        pb = bounds_of(gs, cell)
    def cells_at(xs, y):
        out = []
        for x in xs:
            out.append(("scaled", cell, scale, x - pb[0] * scale, y - pb[1] * scale))
        return out
    for ch, cp, side in (("b", 0x0253, "left"), ("d", 0x0257, "right"), ("k", 0x0199, "left"), ("B", 0x0181, "left"), ("D", 0x018A, "left"), ("K", 0x0198, "left")):
        if ch not in cmap and ord(ch) not in cmap:
            continue
        b = gbounds(gname(ch))
        top = b[3] - CELL
        if side == "left":
            xs = [b[0] - 2 * CELL, b[0] - CELL] if ch.isupper() else [b[0] + 2 * CELL, b[0] + 3 * CELL]
            if ch.isupper():
                # capitals hook to the left: shift the letter right by two cells
                extra = cells_at([b[0], b[0] + CELL], top)
                new[f"uni{cp:04X}"] = ([(contours(gs, gname(ch)), 2 * CELL, 0)] + extra, hmtx[gname(ch)][0] + 2 * CELL, cp)
                continue
            extra = cells_at(xs, top)
            add(f"uni{cp:04X}", cp, gname(ch), extra)
        else:
            extra = cells_at([b[2], b[2] + CELL], top)
            add(f"uni{cp:04X}", cp, gname(ch), extra, hmtx[gname(ch)][0] + 2 * CELL)

    # draw the new glyphs
    for name, (pieces, width, cp) in new.items():
        pen = TTGlyphPen(None)
        for piece in pieces:
            if piece[0] == "scaled":
                _, cs, sc, dx, dy = piece
                tp = TransformPen(pen, (sc, 0, 0, sc, dx, dy))
            else:
                cs, dx, dy = piece
                tp = TransformPen(pen, (1, 0, 0, 1, dx, dy))
            for c in cs:
                for op, args in c:
                    getattr(tp, op)(*args)
        glyf[name] = pen.glyph()
        glyf[name].recalcBounds(glyf)
        hmtx[name] = (width, glyf[name].xMin if hasattr(glyf[name], "xMin") else 0)
        if name not in order:
            order.append(name)
        if cp:
            for t in f["cmap"].tables:
                if t.isUnicode():
                    t.cmap[cp] = name
    f.setGlyphOrder(order)
    if "GDEF" in f and f["GDEF"].table.GlyphClassDef:
        for name in new:
            f["GDEF"].table.GlyphClassDef.classDefs[name] = 1 if "_" not in name else 2
    # ccmp ligatures: dotted vowel + combining tone mark -> one glyph
    gsub = f["GSUB"].table
    lk = ot.Lookup()
    lk.LookupType = 4
    lk.LookupFlag = 0
    sub = buildLigatureSubstSubtable({tuple(k): v for k, v in ligs.items()})
    # also e + U+0323 -> ẹ etc. for decomposed text
    for ch in "eosiuEOSIU":
        dotted = unicodedata.normalize("NFC", ch + "̣")
        sub.ligatures.setdefault(gname(ch), [])
        lig = ot.Ligature()
        lig.LigGlyph = f"uni{ord(dotted):04X}"
        lig.Component = ["uni0323"] if "uni0323" in order else []
        if lig.Component:
            sub.ligatures[gname(ch)].append(lig)
    lk.SubTable = [sub]
    lk.SubTableCount = 1
    gsub.LookupList.Lookup.append(lk)
    idx = len(gsub.LookupList.Lookup) - 1
    gsub.LookupList.LookupCount = idx + 1
    for rec in gsub.FeatureList.FeatureRecord:
        if rec.FeatureTag == "ccmp":
            rec.Feature.LookupListIndex.insert(0, idx)
            rec.Feature.LookupCount = len(rec.Feature.LookupListIndex)
    # rename
    for rec in f["name"].names:
        if rec.nameID in (1, 3, 4, 16, 6):
            s = rec.toUnicode()
            rec.string = s.replace("Geist Pixel", "Jagora Pixel").replace("GeistPixel", "JagoraPixel")
    f["maxp"].numGlyphs = len(order)
    os.makedirs(OUT, exist_ok=True)
    f.flavor = "woff2"
    out = f"{OUT}/jagora-pixel-{variant.lower()}.woff2"
    f.save(out)
    return out, len(new)


if __name__ == "__main__":
    for v in VARIANTS:
        print(*patch(v))
