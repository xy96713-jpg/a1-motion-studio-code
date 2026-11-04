# The measured profile of a reference film, second by second: how much moves, how much type is on screen and how big,
# where it sits, the colours, how full the frame is, hard cuts, narration speed. Content-free numbers, so a film on
# another article can be held to the same standard (refprofile.mjs).
#   python3 -I refprofile.py <video> <frames dir (1 fps)> <ocr-boxes.jsonl> <subtitles.json> <out.json>
import json, subprocess, sys
import numpy as np
from PIL import Image

video, frames, ocrf, subsf, out = sys.argv[1:6]
W, H, FPS = 160, 90, 8          # motion is read on a small grey copy at 8 frames a second
SUB_BAND = 0.88                 # burned-in subtitles of the reference sit below this; they are not the design's type

def grey_stream():
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', video, '-vf', f'fps={FPS},scale={W}:{H},format=gray', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    while True:
        b = p.stdout.read(W * H)
        if len(b) < W * H: break
        yield np.frombuffer(b, np.uint8).astype(np.float32)[: int(H * SUB_BAND) * W].reshape(-1, W)

def shift(a, b):
    # global camera move between two frames (phase correlation), in pixels of the small copy
    F = np.fft.fft2(a - a.mean()) * np.conj(np.fft.fft2(b - b.mean())); F /= np.abs(F) + 1e-6
    r = np.abs(np.fft.ifft2(F)); y, x = np.unravel_index(r.argmax(), r.shape)
    if y > a.shape[0] // 2: y -= a.shape[0]
    if x > a.shape[1] // 2: x -= a.shape[1]
    return float(np.hypot(x, y))

motion, cam, prev = [], [], None
for g in grey_stream():
    if prev is not None:
        motion.append(float(np.abs(g - prev).mean())); cam.append(shift(prev, g))
    prev = g
secs = len(motion) // FPS
mot = [float(np.mean(motion[s * FPS:(s + 1) * FPS])) for s in range(secs)]
# a frame-to-frame change counts as moving when it is above the film's own noise floor (its stillest tenth: grain,
# scan lines, resampling) by MOVE_ABOVE: one fixed level read the grain of a still chapter as almost moving and the
# reference's as moving (B39: 12 % of frames against 38 %)
MOVE_ABOVE = 0.35
MOVE = float(np.percentile(motion, 10)) + MOVE_ABOVE if motion else 0.6
moving = [float(np.mean([m > MOVE for m in motion[s * FPS:(s + 1) * FPS]])) for s in range(secs)]
camv = [float(np.mean(cam[s * FPS:(s + 1) * FPS])) * 1920 / W * FPS for s in range(secs)]   # px a second at 1080p
cuts = [i / FPS for i, m in enumerate(motion) if m > 40]
# the rhythm: runs of moving and of holding (at least a quarter second), and whether things start to move on a line
mv = [m > MOVE for m in motion]; runs, cur, n = [], mv[0], 0
for x in mv:
    if x == cur: n += 1
    else: runs.append((cur, n / FPS)); cur, n = x, 1
runs.append((cur, n / FPS))
holds = [d for c, d in runs if not c and d >= 0.25]; moves = [d for c, d in runs if c and d >= 0.25]
onsets = np.array([i / FPS for i in range(1, len(mv)) if mv[i] and not mv[i - 1]])

ocr = {}
for l in open(ocrf):
    r = json.loads(l); ocr[r['file']] = [x for x in r['lines'] if x['box'][1] + x['box'][3] < SUB_BAND]
subs = json.load(open(subsf))['lines']
starts = [l['from'] for l in subs if l['text'].strip()]
near = lambda x, w: bool(len(onsets)) and float(np.min(np.abs(onsets - x))) <= w
rng = np.random.default_rng(1); base = rng.uniform(0, len(motion) / FPS, 2000)

rows = []
for i, f in enumerate(sorted(ocr)):
    t = i + 0.5
    im = np.asarray(Image.open(f'{frames}/{f}').convert('RGB').resize((192, 108)), np.float32)[: int(108 * SUB_BAND)]
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx, mn = im.max(-1), im.min(-1); sat = (mx - mn) / (mx + 1e-6); lum = 0.299 * r + 0.587 * g + 0.114 * b
    red = (r > 120) & (r > g * 1.6) & (r > b * 1.6)
    gy, gx = np.gradient(lum); edges = np.hypot(gx, gy) > 12
    fill = float(np.mean([edges[y:y + 9, x:x + 12].mean() > 0.04 for y in range(0, edges.shape[0] - 8, 9) for x in range(0, 192, 12)]))
    L = ocr[f]; hs = [x['box'][3] * 1080 for x in L]
    chars = sum(len(x['text'].replace(' ', '')) for x in L)
    area = sum(x['box'][2] * x['box'][3] for x in L) / SUB_BAND
    zone = lambda x: 'left' if x < 1 / 3 else 'right' if x > 2 / 3 else 'centre'
    narr = ''.join(s['text'] for s in subs if s['from'] < t + 0.5 and s['to'] > t - 0.5)
    s = int(t)
    rows.append({'t': t, 'lines': len(L), 'chars': chars, 'textArea': round(area, 4), 'lineH': [round(h) for h in sorted(hs, reverse=True)[:4]],
                 'zones': sorted({zone(x['box'][0] + x['box'][2] / 2) for x in L}), 'lum': round(float(lum.mean()), 1), 'sat': round(float(sat.mean()), 3),
                 'red': round(float(red.mean()), 4), 'fill': round(fill, 3), 'motion': round(mot[s], 2) if s < secs else None,
                 'moving': round(moving[s], 2) if s < secs else None, 'camera': round(camv[s]) if s < secs else None, 'narration': len(narr)})

def pct(v, q): v = [x for x in v if x is not None]; return round(float(np.percentile(v, q)), 3) if v else None
# a profile is read by JavaScript: no NaN in it
col = lambda k: [r[k] for r in rows]
allH = [h for r in rows for h in r['lineH']]
summary = {
  'seconds': len(rows), 'hardCuts': len(cuts), 'secondsPerCut': round(len(rows) / max(1, len(cuts)), 1),
  'holdSeconds': {q: pct(holds, q) for q in (25, 50, 75, 90)}, 'moveSeconds': {q: pct(moves, q) for q in (25, 50, 75, 90)},
  'movingFrames': round(float(np.mean(mv)), 3), 'noiseFloor': round(MOVE - MOVE_ABOVE, 3),
  'onsetOnLine': {'within0_5s': round(float(np.mean([near(x, 0.5) for x in starts])), 3), 'chance': round(float(np.mean([near(x, 0.5) for x in base])), 3)} if starts else None,
  'stillSeconds': sum(1 for r in rows if (r['moving'] or 0) < 0.25), 'movingShare': pct(col('moving'), 50),
  'motion': {q: pct(col('motion'), q) for q in (10, 50, 90)}, 'cameraPxPerSec': {q: pct(col('camera'), q) for q in (10, 50, 90)},
  'linesOnScreen': {q: pct(col('lines'), q) for q in (10, 50, 90)}, 'charsOnScreen': {q: pct(col('chars'), q) for q in (10, 50, 90)},
  'framesWithoutType': round(sum(1 for r in rows if not r['lines']) / len(rows), 3),
  'lineHeightPx': {q: pct(allH, q) for q in (10, 50, 90, 99)}, 'textArea': {q: pct(col('textArea'), q) for q in (50, 90)},
  'fill': {q: pct(col('fill'), q) for q in (10, 50, 90)}, 'lum': {q: pct(col('lum'), q) for q in (10, 50, 90)},
  'sat': {q: pct(col('sat'), q) for q in (50, 90)}, 'redShare': {q: pct(col('red'), q) for q in (50, 90)},
  'framesWithRed': round(sum(1 for r in rows if r['red'] > 0.002) / len(rows), 3),
  'zones': {z: round(sum(1 for r in rows if z in r['zones']) / len(rows), 3) for z in ('left', 'centre', 'right')},
}
json.dump({'contract': 'A1ReferenceProfile/v1', 'video': video, 'summary': summary, 'cuts': cuts, 'seconds': rows}, open(out, 'w'), ensure_ascii=False, indent=1, allow_nan=False)
print(json.dumps(summary, ensure_ascii=False, indent=1))
