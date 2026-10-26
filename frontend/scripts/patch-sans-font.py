"""Bricolage Grotesque (SIL OFL 1.1) with Yorùbá and Igbo letters fixed, saved as "Jagora Sans".

Bricolage has ẹ ọ ị ụ but places a following tone mark wrongly, and has no ṣ ṅ ǹ. The fixes are composites of the
font's own glyphs, so they follow every weight and width of the variable font:
  - ṣ Ṣ ṅ ǹ ḿ: base letter + the font's dot / grave / acute, placed the way the font places them on o
  - ẹ̀ ẹ́ ẹ̄ ọ̀ ọ́ ... (and capitals, ị ụ): the toned vowel + the dot from ẹ/ọ, reached by a ccmp ligature
Input: the upstream variable TTF (google/fonts ofl/bricolagegrotesque). Run:
  python3 scripts/patch-sans-font.py /path/to/BricolageGrotesque[opsz,wdth,wght].ttf
"""
import sys
import unicodedata
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.otlLib.builder import buildLigatureSubstSubtable
from fontTools.ttLib.tables import otTables as ot

src = sys.argv[1]
f = TTFont(src)
cmap = f.getBestCmap()
glyf, hmtx = f["glyf"], f["hmtx"]
order = f.getGlyphOrder()
g = lambda ch: cmap[ord(ch)]
adv = lambda name: hmtx[name][0]


def composite(name, parts, width, cp=None):
    gl = Glyph()
    gl.numberOfContours = -1
    gl.components = []
    for base, x, y in parts:
        c = GlyphComponent()
        c.glyphName, c.x, c.y, c.flags = base, int(round(x)), int(round(y)), 0x4  # ROUND_XY_TO_GRID
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


def dot_of(dotted):
    """the dot component of a dotted vowel composite and its offset relative to the vowel's centre"""
    gl = glyf[g(dotted)]
    base, dot = gl.components[0], gl.components[1]
    return dot.glyphName, dot.x - adv(base.glyphName) / 2, dot.y


ligs = {}
# toned dotted vowels
for v in "eoiuEOIU":
    dotted = unicodedata.normalize("NFC", v + "̣")
    if ord(dotted) not in cmap or not glyf[g(dotted)].isComposite():
        continue
    dot, dx, dy = dot_of(dotted)
    for mark in ("̀", "́", "̄"):
        pre = unicodedata.normalize("NFC", v + mark)
        if len(pre) != 1 or ord(pre) not in cmap:
            continue
        name = f"{g(dotted)}_{ord(mark):04X}"
        composite(name, [(g(pre), 0, 0), (dot, adv(g(pre)) / 2 + dx, dy)], adv(g(pre)))
        comb = cmap.get(ord(mark))
        if comb:
            ligs[(g(dotted), comb)] = name

# ṣ Ṣ from s/S with the dot used under o/O
for base, ref, cp in (("s", "ọ", 0x1E63), ("S", "Ọ", 0x1E62)):
    dot, dx, dy = dot_of(ref)
    composite(f"uni{cp:04X}", [(g(base), 0, 0), (dot, adv(g(base)) / 2 + dx, dy)], adv(g(base)), cp)

# marks above n and m, placed as on o (ò ó) or with the dot as on ż
def mark_from(pre, plain):
    """the accent's outline is baked into precomposed glyphs; use the combining mark glyph at the o-centred spot"""
    return None

for base, cp, mark in (("n", 0x01F9, "̀"), ("m", 0x1E3F, "́"), ("n", 0x1E45, "̇")):
    if cp in cmap:
        continue
    comb = cmap.get(ord(mark))
    if not comb:
        continue
    # the combining glyphs are drawn to sit over a lowercase letter when placed at the letter's centre
    cb = glyf[comb]
    cb.recalcBounds(glyf)
    cx = (cb.xMin + cb.xMax) / 2 if hasattr(cb, "xMin") else 0
    composite(f"uni{cp:04X}", [(g(base), 0, 0), (comb, adv(g(base)) / 2 - cx, 0)], adv(g(base)), cp)

# m + combining grave/acute as ligatures
for mark in ("̀", "́"):
    comb = cmap.get(ord(mark))
    if not comb:
        continue
    cb = glyf[comb]
    cb.recalcBounds(glyf)
    cx = (cb.xMin + cb.xMax) / 2
    name = f"m_{ord(mark):04X}"
    composite(name, [(g("m"), 0, 0), (comb, adv(g("m")) / 2 - cx, 0)], adv(g("m")))
    ligs[(g("m"), comb)] = name

f.setGlyphOrder(order)
f["maxp"].numGlyphs = len(order)
if "GDEF" in f and f["GDEF"].table.GlyphClassDef:
    for name in order:
        if name not in f["GDEF"].table.GlyphClassDef.classDefs and (name.startswith("uni") or name.startswith("m_")):
            f["GDEF"].table.GlyphClassDef.classDefs[name] = 1

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
        rec.string = rec.toUnicode().replace("Bricolage Grotesque", "Jagora Sans").replace("BricolageGrotesque", "JagoraSans")
f.flavor = "woff2"
f.save("public/fonts/jagora-sans.woff2")
print("ligatures", len(ligs), "glyphs", len(order))
