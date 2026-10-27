"""Boiling (Alit Design) with Yorùbá, Igbo and Hausa-ready letters, for Jagora's subheadings and wordmark.

The font ships only basic Latin, with no accents at all. This script draws the marks in the font's own heavy style:
  - acute and grave: a slanted wedge with the stem weight of the font
  - dot below: the font's own full stop, slightly smaller
and builds every letter Yorùbá and Igbo need from them (à á è é ì í ò ó ù ú ẹ ọ ị ụ ṣ ǹ ń ḿ and capitals), plus
zero-width combining marks and ligatures so ẹ́, ọ̀ and the rest come out as one finished letter.
Licence note: the "Black Demo" file is for personal use only; a commercial licence is needed before public launch.

  python3 scripts/build-boiling.py Boiling-BlackDemo.ttf public/fonts/boiling.woff2
"""
import sys
import unicodedata
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.otlLib.builder import buildLigatureSubstSubtable
from fontTools.ttLib.tables import otTables as ot
from fontTools import subset

src, out = sys.argv[1], sys.argv[2]
f = TTFont(src)
gs = f.getGlyphSet()
cmap = f.getBestCmap()
glyf, hmtx = f["glyf"], f["hmtx"]
g = lambda ch: cmap[ord(ch)]


def contours(name):
    rp = DecomposingRecordingPen(gs)
    gs[name].draw(rp)
    res, cur = [], []
    for op in rp.value:
        cur.append(op)
        if op[0] in ("closePath", "endPath"):
            rec = RecordingPen()
            rec.value = cur
            bp = BoundsPen(gs)
            rec.replay(bp)
            res.append((cur, bp.bounds))
            cur = []
    return res


def bounds(name):
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    return bp.bounds


def poly(points):
    ops = [("moveTo", (points[0],))] + [("lineTo", (p,)) for p in points[1:]] + [("closePath", ())]
    return ops


def shift(ops, dx, dy, s=1.0, cx=0, cy=0):
    rec = RecordingPen()
    rec.value = ops
    out_ = RecordingPen()
    rec.replay(TransformPen(out_, (s, 0, 0, s, dx + cx - cx * s, dy + cy - cy * s)))
    return out_.value


# ---- the marks, drawn in the font's weight ----
stem = bounds(g("l"))[2] - bounds(g("l"))[0]  # ~286: the font is very heavy
t = stem * 0.6  # mark thickness
H = 150  # height of a tone mark
W = 150  # horizontal run of a tone mark


def acute(cx, y0):
    # a wedge rising to the right
    return poly([(cx - W / 2, y0), (cx - W / 2 + t, y0), (cx + W / 2 + t * 0.2, y0 + H), (cx + W / 2 - t * 0.8, y0 + H)])


def grave(cx, y0):
    return poly([(cx + W / 2, y0), (cx + W / 2 - t, y0), (cx - W / 2 - t * 0.2, y0 + H), (cx - W / 2 + t * 0.8, y0 + H)])


dot_ops, dot_b = contours(g("."))[0]
DOT = 0.78
dot_w, dot_h = (dot_b[2] - dot_b[0]) * DOT, (dot_b[3] - dot_b[1]) * DOT


def dot_below(cx):
    ox = (dot_b[0] + dot_b[2]) / 2
    return shift(dot_ops, cx - ox, -dot_h - 70 - dot_b[1] * DOT, DOT, ox, dot_b[1])


GAP = 70
new = {}  # name -> (ops list, advance)


def base_ops(name, drop_dot=False):
    cs = contours(name)
    if drop_dot:  # i without its dot: drop the topmost small contour
        top = max(cs, key=lambda c: c[1][1])
        cs = [c for c in cs if c is not top]
    return [op for c, _ in cs for op in c], cs


def build(name, base, marks, cp=None, drop_dot=False):
    ops, cs = base_ops(g(base), drop_dot)
    bb = [min(c[1][0] for c in cs), min(c[1][1] for c in cs), max(c[1][2] for c in cs), max(c[1][3] for c in cs)]
    adv = hmtx[g(base)][0]
    cx = (bb[0] + bb[2]) / 2
    for m in marks:
        if m == "acute":
            ops += acute(cx, bb[3] + GAP)
        elif m == "grave":
            ops += grave(cx, bb[3] + GAP)
        elif m == "dot":
            ops += dot_below(cx)
    new[name] = (ops, adv)
    if cp:
        cmap_add[cp] = name


cmap_add = {}
for v in "aeiouAEIOU":
    di = v == "i"
    for mark, comb in (("grave", "̀"), ("acute", "́")):
        ch = unicodedata.normalize("NFC", v + comb)
        if ord(ch) not in cmap:
            build(f"uni{ord(ch):04X}", v, [mark], ord(ch), drop_dot=di)
for v in "eoiuEOIU":
    ch = unicodedata.normalize("NFC", v + "̣")
    if ord(ch) not in cmap:
        build(f"uni{ord(ch):04X}", v, ["dot"], ord(ch))
for base, marks, cp in (("s", ["dot"], 0x1E63), ("S", ["dot"], 0x1E62), ("n", ["grave"], 0x01F9), ("n", ["acute"], 0x0144), ("m", ["acute"], 0x1E3F), ("N", ["grave"], 0x01F8), ("N", ["acute"], 0x0143)):
    if cp not in cmap:
        build(f"uni{cp:04X}", base, marks, cp)

# toned dotted vowels (reached by ligature) and zero-width combining marks
ligs = {}
for v in "eoiuEOIU":
    dotted = unicodedata.normalize("NFC", v + "̣")
    for mark, comb in (("grave", 0x300), ("acute", 0x301)):
        name = f"uni{ord(dotted):04X}_{comb:04X}"
        build(name, v, [mark, "dot"], drop_dot=(v == "i"))
        ligs[(f"uni{ord(dotted):04X}", f"uni{comb:04X}")] = name
for base in "mn":
    for mark, comb in (("grave", 0x300), ("acute", 0x301)):
        name = f"{g(base)}_{comb:04X}"
        build(name, base, [mark])
        ligs[(g(base), f"uni{comb:04X}")] = name
ox = hmtx[g("o")][0] / 2
for cp, fn in ((0x300, grave), (0x301, acute)):
    new[f"uni{cp:04X}"] = (fn(-ox, 500 + GAP), 0)
    cmap_add[cp] = f"uni{cp:04X}"
new["uni0323"] = (dot_below(-ox), 0)
cmap_add[0x0323] = "uni0323"

# ---- write the glyphs ----
order = f.getGlyphOrder()
for name, (ops, adv) in new.items():
    pen = TTGlyphPen(None)
    rec = RecordingPen()
    rec.value = ops
    rec.replay(pen)
    gl = pen.glyph()
    glyf[name] = gl
    gl.recalcBounds(glyf)
    hmtx[name] = (int(round(adv)), getattr(gl, "xMin", 0))
    if name not in order:
        order.append(name)
f.setGlyphOrder(order)
f["maxp"].numGlyphs = len(order)
for tb in f["cmap"].tables:
    if tb.isUnicode():
        tb.cmap.update(cmap_add)
# resolve ligature keys that pointed at names built here

# ccmp
gsub = f["GSUB"].table
lk = ot.Lookup()
lk.LookupType, lk.LookupFlag = 4, 0
lk.SubTable = [buildLigatureSubstSubtable(ligs)]
lk.SubTableCount = 1
gsub.LookupList.Lookup.append(lk)
idx = len(gsub.LookupList.Lookup) - 1
gsub.LookupList.LookupCount = idx + 1
if not gsub.ScriptList.ScriptRecord:
    for tag in ("DFLT", "latn"):
        sr = ot.ScriptRecord()
        sr.ScriptTag = tag
        sr.Script = ot.Script()
        ls = ot.LangSys()
        ls.LookupOrder, ls.ReqFeatureIndex, ls.FeatureIndex, ls.FeatureCount = None, 0xFFFF, [], 0
        sr.Script.DefaultLangSys, sr.Script.LangSysRecord, sr.Script.LangSysCount = ls, [], 0
        gsub.ScriptList.ScriptRecord.append(sr)
    gsub.ScriptList.ScriptCount = len(gsub.ScriptList.ScriptRecord)
existing = [r for r in gsub.FeatureList.FeatureRecord if r.FeatureTag == "ccmp"]
if existing:
    for r in existing:
        r.Feature.LookupListIndex.insert(0, idx)
        r.Feature.LookupCount = len(r.Feature.LookupListIndex)
else:
    fr = ot.FeatureRecord()
    fr.FeatureTag = "ccmp"
    fr.Feature = ot.Feature()
    fr.Feature.FeatureParams = None
    fr.Feature.LookupListIndex = [idx]
    fr.Feature.LookupCount = 1
    recs = gsub.FeatureList.FeatureRecord + [fr]
    new_i = len(recs) - 1
    order_i = sorted(range(len(recs)), key=lambda i: recs[i].FeatureTag)
    remap = {o: n for n, o in enumerate(order_i)}
    gsub.FeatureList.FeatureRecord = [recs[i] for i in order_i]
    gsub.FeatureList.FeatureCount = len(recs)
    for sr in gsub.ScriptList.ScriptRecord:
        for ls in [sr.Script.DefaultLangSys] + [l.LangSys for l in sr.Script.LangSysRecord]:
            if ls:
                ls.FeatureIndex = sorted([remap[i] for i in ls.FeatureIndex] + [remap[new_i]])
                ls.FeatureCount = len(ls.FeatureIndex)
if "GDEF" in f and f["GDEF"].table.GlyphClassDef:
    cd = f["GDEF"].table.GlyphClassDef.classDefs
    for n in new:
        cd[n] = 3 if n in ("uni0300", "uni0301", "uni0323") else 1
if "DSIG" in f:
    del f["DSIG"]
for rec in f["name"].names:
    if rec.nameID in (1, 4, 16):
        rec.string = "Jagora Boiling"
tmp = out + ".ttf"
f.save(tmp)
ft = TTFont(tmp)
opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
ss = subset.Subsetter(opts)
ss.populate(unicodes=set(cmap) | set(cmap_add), glyphs=list(new))
ss.subset(ft)
ft.flavor = "woff2"
ft.save(out)
import os

os.remove(tmp)
print(out, len(new), "glyphs added,", len(ligs), "ligatures,", os.path.getsize(out) // 1024, "KB")
