# A house face drawn narrower, the same glyphs scaled across (x only, advances too): the EVA-like tall display of a
# lettered project (the user 2026-10-26: 尽量用那 6 款字 … 细一点高一点 像 eva 的感觉). TrueType and PostScript (CFF) outlines.
#   python tallface.py <src.ttf> <out.ttf> <scale>
import sys
from fontTools.ttLib import TTFont
src, dst, sx = sys.argv[1], sys.argv[2], float(sys.argv[3])
f = TTFont(src)
hm = f['hmtx']
if 'glyf' in f:
    g = f['glyf']
    for n in f.getGlyphOrder():
        gl = g[n]
        if gl.isComposite():
            for c in gl.components: c.x = round(c.x * sx)
        elif gl.numberOfContours > 0:
            gl.coordinates.scale((sx, 1)); gl.coordinates.toInt()
        w, l = hm[n]; hm[n] = (round(w * sx), round(l * sx))
        if gl.numberOfContours: gl.recalcBounds(g)
else:
    # PostScript outlines (f.k 機械彫刻, スミカク: every house face may be drawn narrow, the user 2026-10-26: 可以变形 变高 窄):
    # each charstring redrawn through a pen scaled across
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.pens.transformPen import TransformPen
    cff = f['CFF '].cff; top = cff[cff.fontNames[0]]; cs = top.CharStrings
    for n in f.getGlyphOrder():
        w, l = hm[n]; nw = round(w * sx)
        c = cs[n]; pen = T2CharStringPen(nw, None); c.draw(TransformPen(pen, (sx, 0, 0, 1, 0, 0)))
        new = pen.getCharString(private=c.private, globalSubrs=c.globalSubrs); cs[n] = new
        hm[n] = (nw, round(l * sx))
    if hasattr(top, 'FontBBox'): top.FontBBox = [round(top.FontBBox[0] * sx), top.FontBBox[1], round(top.FontBBox[2] * sx), top.FontBBox[3]]
if 'hdmx' in f: del f['hdmx']
if 'LTSH' in f: del f['LTSH']
f['head'].xMin = round(f['head'].xMin * sx); f['head'].xMax = round(f['head'].xMax * sx)
for r in f['name'].names:
    if r.nameID in (1, 3, 4, 6, 16):
        try: r.string = (r.toUnicode() + ' Tall').replace(' ', '' if r.nameID == 6 else ' ')
        except Exception: pass
f.save(dst)
