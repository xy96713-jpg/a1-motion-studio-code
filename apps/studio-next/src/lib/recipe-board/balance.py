# Where a frame's picture sits: the ink (edges) of its upper and lower halves above the subtitle band (y 860 of 1080).
# The blind reviews kept saying "下半部大片空着" (paperclip-138-full B39 B40 B42 B34 2026-10-23): the line measures it.
# A pixel is picture when it is on an edge or stands off the frame's ground (its median colour) by more than 40 in some
# channel: a large solid block counts by its area, not only its outline (a red bar 1300 x 110 low in the frame counted
# for less than a title's strokes, B39 2026-10-23); faint background lettering (alpha 0.08) stays ground.
# usage: balance.py <png>...  -> one JSON row per file: { file, top, bottom, share } (share: the lower half's part)
import sys, json
from PIL import Image, ImageFilter
import numpy as np
for f in sys.argv[1:]:
    rgb = Image.open(f).convert('RGB').resize((480, 270)).filter(ImageFilter.GaussianBlur(1.6))   # the grain and dot screen blurred away: they are texture, not picture
    e = np.asarray(rgb.convert('L').filter(ImageFilter.FIND_EDGES), dtype=float)
    c = np.asarray(rgb, dtype=float); ground = np.median(c.reshape(-1, 3), axis=0)
    ink = (e > 22) | (np.abs(c - ground).max(axis=2) > 40)
    band = int(270 * 860 / 1080); mid = band // 2
    top, bottom = float(ink[:mid].mean()), float(ink[mid:band].mean())
    print(json.dumps({ 'file': f, 'top': round(top, 4), 'bottom': round(bottom, 4), 'share': round(bottom / (top + bottom), 3) if top + bottom > 0 else 0.5 }))
