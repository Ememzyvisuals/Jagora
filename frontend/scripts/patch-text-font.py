"""Outfit (SIL OFL 1.1) with the Yorùbá and Igbo letters it lacks, saved as "Jagora Text" for body text.

Outfit has no dot below at all (no ẹ ọ ị ụ ṣ, no combining U+0323) and no ṅ ǹ ḿ. Everything added is a composite of the
font's own glyphs, so it follows every weight of the variable font:
  - the combining dot below: Outfit's dot above (U+0307), moved under the baseline
  - ẹ ọ ị ụ ṣ (and capitals): the letter + that dot, centred under it
  - ẹ̀ ẹ́ ẹ̄ ọ̀ ọ́ ... ị̀ ụ́ ...: the toned vowel Outfit already has (è é ē ...) + the dot, reached by a ccmp ligature
    when the text is a dotted vowel followed by a combining tone mark
  - ṅ ǹ ḿ: n/m + Outfit's own combining dot / grave / acute, centred over the letter
The Hausa hooked letters (ɓ ɗ ƙ ƴ) and the naira sign are not drawn here; Inter, next in the font list, fills them.
Input: the upstream variable TTF (google/fonts ofl/outfit). Run from frontend/:
  python3 scripts/patch-text-font.py /path/to/Outfit[wght].ttf
"""
import sys
import unicodedata

from fontTools.otlLib.builder import buildLigatureSubstSubtable
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables as ot
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent

f = TTFont(sys.argv[1])
f.ensureDecompiled()
cmap = f.getBestCmap()
glyf, hmtx = f["glyf"], f["hmtx"]
order = f.getGlyphOrder()
g = lambda ch: cmap[ord(ch)]
adv = lambda name: hmtx[name][0]


def bounds(name):
    gl = glyf[name]
    gl.recalcBounds(glyf)
    return gl.xMin, gl.yMin, gl.xMax, gl.yMax


def composite(name, parts, width, cp=None):
    gl = Glyph()
    gl.numberOfContours = -1
    gl.components = []
    for base, x, y in parts:
        c = GlyphComponent()
        c.glyphName, c.x, c.y, c.flags = base, int(round(x)), int(round(y)), 0x4
        gl.components.append(c)
    gl.components[0].flags |= 0x200  # USE_MY_METRICS
    glyf[name] = gl
    hmtx[name] = (width, 0)
    if name not in order:
        order.append(name)
    if cp:
        for t in f["cmap"].tables:
            if t.isUnicode():
                t.cmap[cp] = name


DOT = cmap[0x307]  # Outfit's combining dot above
dx0, dy0, dx1, dy1 = bounds(DOT)
dot_w = dx1 - dx0
DROP = -(dy1) - 70  # the same dot, its top 70 units under the baseline


def dot_below(base):
    """offset that centres the dot under `base`"""
    bx0, _, bx1, _ = bounds(base)
    return (bx0 + bx1) / 2 - (dx0 + dx1) / 2, DROP


# the combining dot below itself (zero width, sits under the letter before it, as Outfit's other marks do)
composite("uni0323", [(DOT, 0, DROP)], 0, 0x323)

# dotted letters
for ch in "eoiuEOIUsS":
    pre = unicodedata.normalize("NFC", ch + "̣")
    if ord(pre) in cmap:
        continue
    x, y = dot_below(g(ch))
    composite(f"uni{ord(pre):04X}", [(g(ch), 0, 0), (DOT, x, y)], adv(g(ch)), ord(pre))
cmap = f.getBestCmap()

# toned dotted vowels: the toned vowel + the dot, by ligature
ligs = {}
for v in "eoiuEOIU":
    dotted = g(unicodedata.normalize("NFC", v + "̣"))
    for mark in ("̀", "́", "̄"):
        toned = unicodedata.normalize("NFC", v + mark)
        comb = cmap.get(ord(mark))
        if len(toned) != 1 or ord(toned) not in cmap or not comb:
            continue
        x, y = dot_below(g(v))
        name = f"{dotted}_{ord(mark):04X}"
        composite(name, [(g(toned), 0, 0), (DOT, x, y)], adv(g(toned)))
        ligs[(dotted, comb)] = name

# marks above n and m, centred as on the letter
for base, cp, mark in (("n", 0x01F9, 0x300), ("m", 0x1E3F, 0x301), ("n", 0x1E45, 0x307)):
    if cp in cmap:
        continue
    comb = cmap[mark]
    cx0, _, cx1, _ = bounds(comb)
    bx0, _, bx1, _ = bounds(g(base))
    composite(f"uni{cp:04X}", [(g(base), 0, 0), (comb, (bx0 + bx1) / 2 - (cx0 + cx1) / 2, 0)], adv(g(base)), cp)

f.setGlyphOrder(order)
f["maxp"].numGlyphs = len(order)
if "gvar" in f:
    for name in order:
        f["gvar"].variations.setdefault(name, [])
if "HVAR" in f:
    del f["HVAR"]
if "GDEF" in f and f["GDEF"].table.GlyphClassDef:
    cd = f["GDEF"].table.GlyphClassDef.classDefs
    for name in order:
        if name not in cd:
            cd[name] = 3 if name == "uni0323" else 1

gsub = f["GSUB"].table
lk = ot.Lookup()
lk.LookupType, lk.LookupFlag = 4, 0
lk.SubTable = [buildLigatureSubstSubtable(ligs)]
lk.SubTableCount = 1
gsub.LookupList.Lookup.append(lk)
idx = len(gsub.LookupList.Lookup) - 1
gsub.LookupList.LookupCount = idx + 1
found = False
for rec in gsub.FeatureList.FeatureRecord:
    if rec.FeatureTag == "ccmp":
        rec.Feature.LookupListIndex.insert(0, idx)
        rec.Feature.LookupCount = len(rec.Feature.LookupListIndex)
        found = True
if not found:
    fr = ot.FeatureRecord()
    fr.FeatureTag = "ccmp"
    fr.Feature = ot.Feature()
    fr.Feature.FeatureParams = None
    fr.Feature.LookupListIndex = [idx]
    fr.Feature.LookupCount = 1
    gsub.FeatureList.FeatureRecord.append(fr)
    gsub.FeatureList.FeatureCount = len(gsub.FeatureList.FeatureRecord)
    fi = len(gsub.FeatureList.FeatureRecord) - 1
    for sr in gsub.ScriptList.ScriptRecord:
        for ls in [sr.Script.DefaultLangSys] + [l.LangSys for l in sr.Script.LangSysRecord]:
            if ls:
                ls.FeatureIndex.append(fi)
                ls.FeatureCount = len(ls.FeatureIndex)

for rec in f["name"].names:
    if rec.nameID in (1, 3, 4, 6, 16):
        rec.string = rec.toUnicode().replace("Outfit", "Jagora Text")
f.flavor = "woff2"
f.save("public/fonts/jagora-text.woff2")
print("ligatures", len(ligs), "glyphs", len(order))
