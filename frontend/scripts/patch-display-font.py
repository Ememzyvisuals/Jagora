"""Make a display font safe for Yorùbá, Igbo and Hausa headings, and save it as a small woff2.

Many display fonts ship ẹ ọ ò ó but not ṣ, ǹ, ḿ, the combining tone marks, or the toned dotted vowels (ẹ̀ ọ́ ...),
so a browser would borrow those letters from another font and the line looks broken. This script builds the missing
letters from the font's own drawings:
  - the dot under ọ/Ọ, and the grave and acute from ò/ó, are cut out of those letters
  - ṣ Ṣ = s/S + that dot; ǹ ḿ = n/m + the mark
  - U+0300 / U+0301 get zero-width mark glyphs, and a ccmp ligature turns ẹ + ̀ (and every other dotted vowel + tone)
    into one finished letter, so tones always sit right
Works for CFF (.otf, converted to TrueType outlines) and variable fonts (an instance is taken first).

  python3 scripts/patch-display-font.py IN OUT.woff2 "Family Name" [AXIS=value ...]
"""
import sys
import unicodedata
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.recordingPen import DecomposingRecordingPen, RecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.otlLib.builder import buildLigatureSubstSubtable
from fontTools.ttLib.tables import otTables as ot
from fontTools import subset

src, out, family = sys.argv[1], sys.argv[2], sys.argv[3]
axes = dict(a.split("=") for a in sys.argv[4:])
f = TTFont(src)
if "fvar" in f:
    from fontTools.varLib.instancer import instantiateVariableFont
    loc = {a.axisTag: float(axes.get(a.axisTag, a.defaultValue)) for a in f["fvar"].axes}
    f = instantiateVariableFont(f, loc)

gs = f.getGlyphSet()
cmap = f.getBestCmap()
g = lambda ch: cmap[ord(ch)]


def contours(name):
    """the glyph's outline, decomposed, split into closed contours: [(ops, (xmin, ymin, xmax, ymax))]"""
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
            if bp.bounds:
                res.append((cur, bp.bounds))
            cur = []
    return res


def piece(name, keep):
    """contours of a glyph that pass keep(bounds)"""
    return [c for c in contours(name) if keep(c[1])]


def width(name):
    return f["hmtx"][name][0]


# ---- outlines to TrueType, so new glyphs can be added the same way for every font ----
is_cff = "CFF " in f
new_glyphs = {}  # name -> (list of (ops, dx, dy), advance)


def draw_into(pen, parts):
    for ops, dx, dy in parts:
        tp = TransformPen(pen, (1, 0, 0, 1, dx, dy))
        rec = RecordingPen()
        rec.value = ops
        rec.replay(tp)


# ---- cut the parts out of the font's own letters ----
o, O = g("o"), g("O")
xh = f["OS/2"].sxHeight or 500
dot_lo = piece(g("ọ"), lambda b: b[3] < 10)
dot_up = piece(g("Ọ"), lambda b: b[3] < 10)
grave = piece(g("ò"), lambda b: b[1] > xh * 0.9)
acute = piece(g("ó"), lambda b: b[1] > xh * 0.9)


def centre(parts):
    xs = [b[0] for _, b in parts] + [b[2] for _, b in parts]
    return (min(xs) + max(xs)) / 2


cx_dot_lo, cx_dot_up = centre(dot_lo) - width(g("ọ")) / 2, centre(dot_up) - width(g("Ọ")) / 2
cx_gr, cx_ac = centre(grave) - width(g("ò")) / 2, centre(acute) - width(g("ó")) / 2


def base_parts(name):
    return [(ops, 0, 0) for ops, _ in contours(name)]


def with_mark(base, mark, mark_cx, extra_dy=0):
    w = width(base)
    dx = w / 2 + mark_cx - centre(mark)
    return base_parts(base) + [(ops, dx, extra_dy) for ops, _ in mark], w


add_cmap = {}
if ord("ṣ") not in cmap:
    new_glyphs["uni1E63"] = with_mark(g("s"), dot_lo, cx_dot_lo)
    add_cmap[0x1E63] = "uni1E63"
if ord("Ṣ") not in cmap:
    new_glyphs["uni1E62"] = with_mark(g("S"), dot_up, cx_dot_up)
    add_cmap[0x1E62] = "uni1E62"
if 0x01F9 not in cmap:
    new_glyphs["uni01F9"] = with_mark(g("n"), grave, cx_gr)
    add_cmap[0x01F9] = "uni01F9"
if 0x1E3F not in cmap:
    new_glyphs["uni1E3F"] = with_mark(g("m"), acute, cx_ac)
    add_cmap[0x1E3F] = "uni1E3F"
# zero-width combining marks, drawn to sit over a lowercase letter that comes before them
ow = width(o)
for cp, mark, mcx in ((0x0300, grave, cx_gr), (0x0301, acute, cx_ac)):
    if cp not in cmap:
        name = f"uni{cp:04X}"
        new_glyphs[name] = ([(ops, -ow / 2 + mcx - centre(mark), 0) for ops, _ in mark], 0)
        add_cmap[cp] = name

# toned dotted vowels: the toned vowel (è é, È É ...) + the dot cut from the dotted vowel
ligs = {}
for v in "eoiuEOIU":
    dotted = unicodedata.normalize("NFC", v + "̣")
    if ord(dotted) not in cmap:
        continue
    upper = v.isupper()
    dparts = piece(g(dotted), lambda b: b[3] < 10)
    if not dparts:
        continue
    dcx = centre(dparts) - width(g(dotted)) / 2
    for mark in ("̀", "́"):
        pre = unicodedata.normalize("NFC", v + mark)
        if len(pre) != 1 or ord(pre) not in cmap:
            continue
        name = f"{g(dotted)}_{ord(mark):04X}"
        new_glyphs[name] = with_mark(g(pre), dparts, dcx)
        ligs[(g(dotted), cmap.get(ord(mark)) or add_cmap.get(ord(mark)))] = name
# m and n with a combining tone (written as two characters)
for base in "mn":
    for mark, parts, mcx in (("̀", grave, cx_gr), ("́", acute, cx_ac)):
        name = f"{g(base)}_{ord(mark):04X}"
        new_glyphs[name] = with_mark(g(base), parts, mcx)
        ligs[(g(base), cmap.get(ord(mark)) or add_cmap.get(ord(mark)))] = name

# ---- rebuild as TrueType with the new glyphs ----
order = f.getGlyphOrder() + [n for n in new_glyphs if n not in f.getGlyphOrder()]
glyf = newTable("glyf")
glyf.glyphs, glyf.glyphOrder = {}, order
hmtx = f["hmtx"]


def tt_glyph(draw):
    pen = TTGlyphPen(None)
    draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True) if is_cff else pen)
    return pen.glyph()


for name in f.getGlyphOrder():
    if is_cff:
        glyf.glyphs[name] = tt_glyph(lambda p, n=name: gs[n].draw(p))
    else:
        glyf.glyphs[name] = f["glyf"][name]
for name, (parts, adv) in new_glyphs.items():
    gl = tt_glyph(lambda p, parts=parts: draw_into(p, parts))
    glyf.glyphs[name] = gl
    gl.recalcBounds(glyf)
    # left side bearing must match the outline's left edge, or renderers shift the letter
    hmtx[name] = (int(round(adv)), getattr(gl, "xMin", 0))
if is_cff:
    del f["CFF "]
    f["loca"] = newTable("loca")
    f["head"].glyphDataFormat = 0
    f["head"].indexToLocFormat = 0
    maxp = f["maxp"]
    maxp.tableVersion = 0x00010000
    for k in ("maxZones", "maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs", "maxStackElements", "maxSizeOfInstructions", "maxComponentElements", "maxPoints", "maxContours", "maxCompositePoints", "maxCompositeContours", "maxComponentDepth"):
        setattr(maxp, k, 0)
    maxp.maxZones = 1
    f.sfntVersion = "\0\1\0\0"
    f["post"].formatType = 2.0
    f["post"].extraNames = []
    f["post"].mapping = {}
    f["post"].glyphOrder = order
f["glyf"] = glyf
f.setGlyphOrder(order)
f["maxp"].numGlyphs = len(order)
for t in f["cmap"].tables:
    if t.isUnicode():
        t.cmap.update(add_cmap)
if "GDEF" in f and f["GDEF"].table.GlyphClassDef:
    cd = f["GDEF"].table.GlyphClassDef.classDefs
    for n in new_glyphs:
        cd[n] = 3 if n in ("uni0300", "uni0301") else 1

# ccmp ligatures
gsub = f["GSUB"].table
lk = ot.Lookup()
lk.LookupType, lk.LookupFlag = 4, 0
lk.SubTable = [buildLigatureSubstSubtable({k: v for k, v in ligs.items() if k[1]})]
lk.SubTableCount = 1
gsub.LookupList.Lookup.append(lk)
idx = len(gsub.LookupList.Lookup) - 1
gsub.LookupList.LookupCount = idx + 1
# a font with an empty GSUB has no scripts: add DFLT and latn so our feature is reachable
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
    # run ours first inside the font's own ccmp
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
    # the feature list must stay sorted by tag; renumber every language system after sorting
    order_i = sorted(range(len(recs)), key=lambda i: recs[i].FeatureTag)
    remap = {old: new for new, old in enumerate(order_i)}
    gsub.FeatureList.FeatureRecord = [recs[i] for i in order_i]
    gsub.FeatureList.FeatureCount = len(recs)
    for sr in gsub.ScriptList.ScriptRecord:
        for ls in [sr.Script.DefaultLangSys] + [l.LangSys for l in sr.Script.LangSysRecord]:
            if ls:
                ls.FeatureIndex = sorted([remap[i] for i in ls.FeatureIndex] + [remap[new_i]])
                ls.FeatureCount = len(ls.FeatureIndex)

for rec in f["name"].names:
    if rec.nameID in (1, 4, 16):
        rec.string = family
f.recalcBBoxes = True
tmp = out + ".ttf"
f.save(tmp)

# keep Latin, the Nigerian letters and the new glyphs; drop the rest
opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = ["ccmp", "kern", "liga", "mark", "mkmk", "locl"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
ft = TTFont(tmp)
ss = subset.Subsetter(opts)
uni = set(range(0x20, 0x7F)) | set(range(0xA0, 0x180)) | set(range(0x1E00, 0x1F00)) | {0x0300, 0x0301, 0x0304, 0x0323, 0x01F9, 0x2019, 0x2018, 0x201C, 0x201D, 0x2026, 0x20A6, 0x253, 0x257, 0x199, 0x181, 0x18A, 0x198}
ss.populate(unicodes=uni, glyphs=list(new_glyphs))
ss.subset(ft)
ft.flavor = "woff2"
ft.save(out)
import os
os.remove(tmp)
print(out, "new glyphs", len(new_glyphs), "ligatures", len(ligs), os.path.getsize(out) // 1024, "KB")
