# How full a beat's frames are against the reference's at the same moments: for each pair of strips (the reference's
# five cells of 640x360, ours the same five on its first row), each cell's share of picture above the subtitle band
# (an edge, or off the cell's ground colour: balance.py's ink) and its share of the film's red.
# The blind reviews of paperclip-138-full round four: 10 of the 10 beats under 4 were called empty (画面空、没铺满)
# while every check passed; the line had no measure of fullness against the reference.
# flat: the share of the cell that is one even tone (no grain, no picture: a slide's ground), the reviews' 像幻灯片.
# usage: fill.py <ref.jpg> <ours.png> [<ref> <ours>]...  -> one JSON row per pair: { ref, ours, refFill, ourFill, refRed, ourRed, flat, refFlat, cells }
import sys, json
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage

def cells(f):
    im = Image.open(f).convert('RGB')
    w = im.width // 5
    return [im.crop((k * w, 0, (k + 1) * w, int(w * 9 / 16))) for k in range(5)]

def measure(cell):
    c = cell.resize((480, 270)).filter(ImageFilter.GaussianBlur(1.6))   # grain and dot screen are texture, not picture
    e = np.asarray(c.convert('L').filter(ImageFilter.FIND_EDGES), dtype=float)
    a = np.asarray(c, dtype=float); band = int(270 * 860 / 1080); a, e = a[:band], e[:band]
    ground = np.median(a.reshape(-1, 3), axis=0)
    ink = (e > 22) | (np.abs(a - ground).max(axis=2) > 40)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    red = (r > 150) & (r - g > 70) & (r - b > 60)
    L = a.mean(axis=2); mu = ndimage.uniform_filter(L, 9); sd = np.sqrt(np.maximum(ndimage.uniform_filter(L * L, 9) - mu * mu, 0))
    return float(ink.mean()), float(red.mean()), float((sd < 3).mean())

args = sys.argv[1:]
for ref, ours in zip(args[0::2], args[1::2]):
    R = [measure(c) for c in cells(ref)]; O = [measure(c) for c in cells(ours)]
    m = lambda xs, i: round(sum(x[i] for x in xs) / len(xs), 4)
    print(json.dumps({ 'ref': ref, 'ours': ours, 'refFill': m(R, 0), 'ourFill': m(O, 0), 'refRed': m(R, 1), 'ourRed': m(O, 1), 'flat': m(O, 2), 'refFlat': m(R, 2), 'cells': [[round(o[0], 3), round(r[0], 3)] for o, r in zip(O, R)] }))
