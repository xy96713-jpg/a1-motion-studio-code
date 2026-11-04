#!/usr/bin/env python3
"""Real-font glyph outlines for 3D titles: python3 glyph_paths.py <font.otf> <text>  -> JSON on stdout.

Each glyph is an SVG path in font units (y up), with its advance width, so the browser can extrude
exactly the font's letterforms (no generated lettering, no typos).
"""
import json
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont


def main(font_path, text):
    font = TTFont(font_path)
    cmap = font.getBestCmap()
    glyph_set = font.getGlyphSet()
    hmtx = font['hmtx']
    out = []
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            raise SystemExit(f'glyph missing for {ch!r} in {font_path}')
        pen = SVGPathPen(glyph_set)
        glyph_set[name].draw(pen)
        out.append({'char': ch, 'd': pen.getCommands(), 'advance': hmtx[name][0]})
    json.dump({'unitsPerEm': font['head'].unitsPerEm, 'glyphs': out}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
