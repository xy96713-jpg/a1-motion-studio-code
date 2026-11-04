#!/usr/bin/env python3
# The film's design board (filmdesign.mjs): the arc as designed, beat by beat along the film's time (act, scale, value,
# medium, the red's strength, the hero moments), over the lightness of the film as measured (filmarc.py), and the hero
# moments' frames under it. One picture to approve the whole film by.
# usage: filmboard.py <board.json> <out.png>
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, '..', '..', '..', '..', '..', 'work', 'recipe-board-v1', 'fonts', 'house', 'kokka-mincho.ttf')
def font(px):
    try: return ImageFont.truetype(FONT, px)
    except Exception: return ImageFont.load_default()

spec = json.load(open(sys.argv[1])); out = sys.argv[2]
D, M, beats, heroes = spec.get('design') or {}, spec.get('measured') or {}, spec['beats'], spec['heroes']
rows = {r['beat']: r for r in D.get('beats', [])}
script = {c['beat']: c for c in spec.get('script') or []}
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
W, X0, X1 = 2400, 220, 2360
total = max((b['at'] or 0) + (b['dur'] or 0) for b in beats) or 1
tx = lambda t: X0 + (X1 - X0) * t / total
BG, INK, DIM, RED = (24, 26, 29), (214, 218, 223), (120, 126, 132), (200, 80, 30)
lanes = [('幕', 'act'), ('景別', 'scale'), ('明暗', 'value'), ('色調', 'palette'), ('媒介', 'medium'), ('紅', 'red')]
ACT = {'open': '起', 'build': '鋪', 'press': '壓', 'peak': '爆', 'turn': '轉', 'release': '解', 'close': '收'}
SC = {'world': '全球', 'region': '區域', 'place': '地方', 'object': '物件', 'detail': '細節'}
VAL = {'dark': (40, 43, 47), 'mid': (110, 114, 119), 'light': (200, 203, 206)}
MED = {'diagram': '圖解', 'footage': '實拍', 'type': '大字', 'evidence': '證據'}
LH, top = 70, 150
thumbs = [h for h in heroes if h.get('frame')]
TH = 300 if thumbs else 0
H = top + LH * len(lanes) + 260 + (TH + 90 if thumbs else 0)
im = Image.new('RGB', (W, H), BG); g = ImageDraw.Draw(im)
g.text((40, 40), '整片設計板', font=font(56), fill=INK)
g.text((420, 58), (D.get('arc') or '')[:90], font=font(26), fill=DIM)
for k, (name, key) in enumerate(lanes):
    y = top + k * LH; g.text((40, y + 18), name, font=font(30), fill=DIM)
    for b in beats:
        r = rows.get(b['beat']); x0, x1 = tx(b['at'] or 0) + 2, tx((b['at'] or 0) + (b['dur'] or 0)) - 2
        if not r: g.rectangle([x0, y + 8, x1, y + LH - 8], outline=DIM); continue
        v = r.get(key)
        if key == 'value': g.rectangle([x0, y + 8, x1, y + LH - 8], fill=VAL.get(v, (60, 60, 60)))
        elif key == 'palette':
            c = script.get(b['beat'])
            if c:
                g.rectangle([x0, y + 8, x1, y + LH - 8], fill=hexrgb(c['ground'])); g.rectangle([x0 + 10, y + 22, x0 + 40, y + LH - 22], fill=hexrgb(c['ink']))
                if (r.get('red') or 0) > 0: g.rectangle([x0 + 48, y + 22, x0 + 78, y + LH - 22], fill=hexrgb(c['accent']))
        elif key == 'red': g.rectangle([x0, y + LH - 8 - (v or 0) * 16, x1, y + LH - 8], fill=RED)
        else:
            g.rectangle([x0, y + 8, x1, y + LH - 8], fill=(46, 50, 55) if key != 'act' or v != 'peak' else (96, 40, 20))
            lab = {'act': ACT, 'scale': SC, 'medium': MED}[key].get(v, v or '')
            if x1 - x0 > 40: g.text((x0 + 8, y + 18), lab, font=font(28), fill=INK)
        if key == 'act' and r.get('hero'): g.ellipse([x0 + (x1 - x0) / 2 - 9, y - 14, x0 + (x1 - x0) / 2 + 9, y + 4], fill=RED)
# the film as measured: its lightness, second by second
y0 = top + LH * len(lanes) + 30
g.text((40, y0 + 10), '實測明暗', font=font(30), fill=DIM)
curve = M.get('curve') or []
if curve:
    n = len(curve); hi, lo = max(curve + [0.4]), 0
    pts = [(X0 + (X1 - X0) * i / max(1, n - 1), y0 + 200 - 190 * (c - lo) / (hi - lo or 1)) for i, c in enumerate(curve)]
    g.rectangle([X0, y0, X1, y0 + 200], outline=(50, 54, 58)); g.line(pts, fill=INK, width=3)
    g.text((X0, y0 + 208), f"最長不變 {M.get('longest')} s · 每分鐘換 {M.get('changes')} 次 · 明暗幅度 {M.get('range')} · 長段佔 {round((M.get('flat') or 0) * 100)}%", font=font(24), fill=DIM)
# the hero frames
if thumbs:
    yt = y0 + 260; g.text((40, yt), '重頭畫面', font=font(30), fill=DIM)
    w = min(520, (X1 - X0) // len(thumbs) - 20)
    for k, h in enumerate(thumbs):
        try: t = Image.open(h['frame']).convert('RGB'); t = t.resize((w, int(w * t.height / t.width)))
        except Exception: continue
        x = X0 + k * (w + 20); im.paste(t, (x, yt)); g.text((x, yt + t.height + 8), f"{h['beat']} · {(h.get('how') or '')[:22]}", font=font(22), fill=INK)
im.save(out)
