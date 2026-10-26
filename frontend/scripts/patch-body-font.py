"""Piazzolla (SIL OFL 1.1, Huerta Tipográfica) for Jagora's body text.

Piazzolla already places tone marks over ẹ ọ ị ụ with its own mark positioning; it only lacks the precomposed ǹ and
ḿ, which are added here as composites of n/m and the font's own combining grave/acute. Weights are limited to
300..800, and only Latin plus the Nigerian letters are kept, so the file stays small.

  python3 scripts/patch-body-font.py Piazzolla-VariableFont_opsz,wght.ttf public/fonts/jagora-body.woff2
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

src, out = sys.argv[1], sys.argv[2]
f = instantiateVariableFont(TTFont(src), {"wght": (300, 800)})
f.ensureDecompiled()
cmap = f.getBestCmap()
glyf, hmtx = f["glyf"], f["hmtx"]
order = f.getGlyphOrder()
added = []
for base, mark, cp in (("n", 0x300, 0x01F9), ("m", 0x301, 0x1E3F)):
    if cp in cmap:
        continue
    b, m = cmap[ord(base)], cmap[mark]
    # place the mark the way the font places it over o in ò/ó: same offset from the letter's centre
    ref = cmap[0xF2 if mark == 0x300 else 0xF3]
    rg = glyf[ref]
    dx = 0
    if rg.isComposite() and len(rg.components) > 1:
        dx = rg.components[1].x - hmtx[cmap[ord("o")]][0] / 2
    gl = Glyph()
    gl.numberOfContours = -1
    c1, c2 = GlyphComponent(), GlyphComponent()
    c1.glyphName, c1.x, c1.y, c1.flags = b, 0, 0, 0x204
    c2.glyphName, c2.x, c2.y, c2.flags = m, int(round(hmtx[b][0] / 2 + dx)), 0, 0x4
    gl.components = [c1, c2]
    name = f"uni{cp:04X}"
    glyf[name] = gl
    hmtx[name] = hmtx[b]
    if name not in order:
        order.append(name)
    added.append((cp, name))
f.setGlyphOrder(order)
f["maxp"].numGlyphs = len(order)
for cp, name in added:
    for t in f["cmap"].tables:
        if t.isUnicode():
            t.cmap[cp] = name
if "gvar" in f:
    for name in order:
        f["gvar"].variations.setdefault(name, [])
if "HVAR" in f:
    del f["HVAR"]
for rec in f["name"].names:
    if rec.nameID in (1, 16):
        rec.string = "Jagora Body"
tmp = out + ".ttf"
f.save(tmp)

opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
ft = TTFont(tmp)
ss = subset.Subsetter(opts)
uni = set(range(0x20, 0x7F)) | set(range(0xA0, 0x250)) | set(range(0x1E00, 0x1F00)) | set(range(0x300, 0x370)) | set(range(0x2000, 0x2070)) | {0x20A6, 0x20AC, 0x2122}
ss.populate(unicodes=uni)
ss.subset(ft)
ft.flavor = "woff2"
ft.save(out)
import os
os.remove(tmp)
print(out, os.path.getsize(out) // 1024, "KB", "added", [hex(c) for c, _ in added])
