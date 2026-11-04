# The ground of a frame (chapter.mjs flatGroundErrors): how much of it is one bare flat colour. Per image: the share of
# the frame within a few levels of its most common colour and flat around (no detail within 2 px at 192 x 108), and that
# colour's lightness. A ground drawn as a plate, paper, a lit surface, a gradient or a scene carries detail and light
# across it; a bare fill reads as an empty black screen (the user 2026-10-27 on the banana white model: 背景也不该全黑).
import sys, json, math
from PIL import Image, ImageFilter
for f in sys.argv[1:]:
    try:
        source = Image.open(f).convert('RGB')
        im = source.resize((192, 108), Image.BILINEAR)
    except Exception:
        print(json.dumps({'file': f, 'error': True})); continue
    px = list(im.getdata())
    q = {}
    for r, g, b in px: k = (r >> 3, g >> 3, b >> 3); q[k] = q.get(k, 0) + 1
    dom = max(q, key=q.get); dr, dg, db = [(v << 3) + 4 for v in dom]
    edge = list(im.convert('L').filter(ImageFilter.FIND_EDGES).getdata())
    flat = sum(1 for (r, g, b), e in zip(px, edge) if abs(r - dr) <= 6 and abs(g - dg) <= 6 and abs(b - db) <= 6 and e < 6) / len(px)
    lum = round((0.2126 * dr + 0.7152 * dg + 0.0722 * db), 1)
    # its colour structure (profile.mjs colourErrors; style-lab RESEARCH-colour-type-20261027): the neutral share (C* < 10),
    # the strong colour (C* >= 40), the hue families (30 degrees) covering 2 % or more, the biggest family's share
    neu = strong = 0; fam = [0] * 12
    for r, g, b in px:
        c = [v / 255 for v in (r, g, b)]; c = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
        X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047; Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883
        fl = [t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116 for t in (X, Y, Z)]
        A = 500 * (fl[0] - fl[1]); B = 200 * (fl[1] - fl[2]); C = (A * A + B * B) ** 0.5
        if C < 10: neu += 1
        if C >= 40: strong += 1
        # (a dark colour carries less chroma: deep teal, indigo night, deep amber count from C* 10 below L* 35 —
        # palette-arc.py's reading; at 18 the Suez teal and indigo grounds read as grey, 2026-10-28)
        if C >= 18 or (C >= 10 and 116 * fl[1] - 16 < 35):
            fam[int(((math.degrees(math.atan2(B, A)) + 360) % 360) // 30)] += 1
    N = len(px); famShare = [v / N for v in fam]
    colour = {'neutral': round(neu / N, 3), 'strong': round(strong / N, 4), 'families': sum(1 for v in famShare if v >= 0.02), 'family': round(max(famShare), 3)}
    # and the whole frame's mean luma, 0-1 (profile.mjs lowKeyErrors: a low-key film keeps most of it dark)
    mean = round(sum(0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px) / len(px) / 255, 3)
    lums = sorted((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 for r, g, b in px); hi = round(lums[int(len(lums) * 0.99)], 3)   # the lights: the 99th percentile
    # Estimate the ground from spatial consensus, not the mean of content-bearing side strips.
    # Tile medians tolerate grain and localized ink; agreement on >=3 sides avoids choosing
    # a single foreground panel. Never select by neutrality or by the requested script colour:
    # a consistently tinted surface must still reach the unchanged groundTintErrors hard gate.
    from statistics import median
    W0, H0 = im.size
    # Point samples retain chromatic texture that bilinear reduction would average away.
    groundpx = list(source.resize(im.size, Image.Resampling.NEAREST).getdata())
    tiles = []
    for ty in range(10):
        for tx in range(10):
            if tx not in (0, 9) and ty not in (0, 9): continue
            samples = [groundpx[y * W0 + x] for y in range(ty * H0 // 10, (ty + 1) * H0 // 10)
                       for x in range(tx * W0 // 10, (tx + 1) * W0 // 10)]
            rgb = tuple(median(p[c] for p in samples) for c in range(3))
            if sum(max(abs(p[c] - rgb[c]) for c in range(3)) <= 6 for p in samples) < 0.75 * len(samples):
                continue  # unresolved texture is not evidence of a single ground colour
            sides = {s for s, hit in [('left', tx == 0), ('right', tx == 9), ('top', ty == 0), ('bottom', ty == 9)] if hit}
            tiles.append((rgb, sides))
    groups = [[t for t in tiles if max(abs(t[0][c] - seed[0][c]) for c in range(3)) <= 6] for seed in tiles]
    group = max(groups, key=len, default=[])
    support = len(group) / 36  # include rejected tiles in the evidence denominator
    sides = sum(sum(s in t[1] for t in group) >= 5 for s in ('left', 'right', 'top', 'bottom'))
    reliable = support >= 0.6 and sides >= 3
    rimc = '#%02x%02x%02x' % tuple(round(median(t[0][c] for t in group)) for c in range(3)) if reliable else None
    estimate = {'status': 'measured' if reliable else 'unknown', 'method': 'perimeter-tile-consensus',
                'support': round(support, 3), 'sides': sides}
    if not reliable: estimate['reason'] = 'no consistent ground across at least three frame sides'
    print(json.dumps({'file': f, 'flat': round(flat, 3), 'lum': lum, 'mean': mean, 'hi': hi, 'color': '#%02x%02x%02x' % (dr, dg, db), 'rim': rimc, 'rimEstimate': estimate, **colour}))
