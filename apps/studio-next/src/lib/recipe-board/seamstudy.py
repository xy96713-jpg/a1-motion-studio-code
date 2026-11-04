# Seam study: at every cut of a film, what happens around it.
#   python3 seamstudy.py <video> <out.json> [start end]
# Per cut (found by frame difference at 12 fps): the content (edge density) just before and after, the motion
# (mean frame difference, camera and elements together) in the 0.5 s before and after, and how much of the picture
# carries across (similarity of the frames either side, after aligning their brightness).
import sys, json, cv2, numpy as np

v, out = sys.argv[1], sys.argv[2]
a0 = float(sys.argv[3]) if len(sys.argv) > 3 else 0
a1 = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9
cap = cv2.VideoCapture(v); fps = cap.get(cv2.CAP_PROP_FPS) or 30
step = max(1, round(fps / 12)); rate = fps / step
cap.set(cv2.CAP_PROP_POS_MSEC, a0 * 1000)
fr, ts, i = [], [], 0
while True:
    ok, f = cap.read()
    if not ok: break
    t = a0 + i / fps; i += 1
    if t > a1: break
    if (i - 1) % step: continue
    g = cv2.cvtColor(cv2.resize(f, (320, 180)), cv2.COLOR_BGR2GRAY)
    g = g[:150]   # the subtitle band out (the reference burns its subtitles in)
    fr.append(g); ts.append(t)
fr = np.array(fr, dtype=np.float32)
d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
edges = np.array([cv2.Canny(f.astype(np.uint8), 60, 160).mean() / 255 for f in fr])
med = np.median(d)
cuts = [k + 1 for k in range(1, len(d) - 1) if d[k] > max(18, 6 * med) and d[k] > 2.5 * max(d[k - 1], d[k + 1])]
res = []
for c in cuts:
    if c < 7 or c > len(fr) - 7: continue
    before, after = d[c - 7:c - 1].mean(), d[c + 1:c + 7].mean()
    eb, ea = edges[c - 2], edges[c + 1]
    x, y = fr[c - 1], fr[c]
    x = (x - x.mean()) / (x.std() + 1e-3); y = (y - y.mean()) / (y.std() + 1e-3)
    carry = float((x * y).mean())
    res.append(dict(t=round(ts[c], 2), motion_out=round(float(before), 2), motion_in=round(float(after), 2), edges_out=round(float(eb), 3), edges_in=round(float(ea), 3), carry=round(carry, 2)))
med_e = float(np.median(edges))
summary = dict(cuts=len(res), seconds=round(ts[-1] - ts[0], 1), per_minute=round(len(res) / max(1e-6, (ts[-1] - ts[0]) / 60), 1),
    still_both=round(np.mean([r['motion_out'] < 1.2 and r['motion_in'] < 1.2 for r in res]), 2) if res else None,
    still_in=round(np.mean([r['motion_in'] < 1.2 for r in res]), 2) if res else None,
    empty_side=round(np.mean([min(r['edges_out'], r['edges_in']) < .4 * med_e for r in res]), 2) if res else None,
    carry=round(np.mean([r['carry'] > .35 for r in res]), 2) if res else None,
    motion_around=round(float(np.mean([(r['motion_out'] + r['motion_in']) / 2 for r in res])), 2) if res else None, median_edges=round(med_e, 3))
json.dump(dict(summary=summary, cuts=res), open(out, 'w'), indent=1)
print(json.dumps(summary))
