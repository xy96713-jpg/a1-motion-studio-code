# Compare a rendered shot with the reference film over the same span, by measurement, before anyone looks at it
# (the user, 2026-10-21: every fault found by eye today was measurable: a cut the reference does not have, a camera that
# brakes between lines, a frame rate and blur that read as jerky, glyphs stretched while a bar sweeps).
#   python refcheck.py <ours.mp4> <reference.mp4> <at> <dur> <out.json> [x0,y0,x1,y1]   (region: measure only there, e.g. the
#   side of a presenter shot where the card and tags live; the presenter is the author's footage, not ours to match)
# Measures on both: cuts (frame-difference spikes), the camera's motion per second (phase correlation), its jerk
# (change of speed between frames), held frames, frame rate, and the change curve over time (when things happen).
import json, sys
import cv2, numpy as np

def frames(path, at, dur, w=320):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    if at > 0: cap.set(cv2.CAP_PROP_POS_MSEC, at * 1000)
    out = []
    while len(out) < int(dur * fps):
        ok, f = cap.read()
        if not ok: break
        h = int(f.shape[0] * w / f.shape[1]); out.append(cv2.cvtColor(cv2.resize(f, (w, h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32))
    return out, fps

def measure(fr, fps, region=None, mask_bottom=.16):
    # the subtitle band changes with every line of speech: it is left out of every measure
    h, w = fr[0].shape
    if region: x0, y0, x1, y1 = region; fr = [f[int(y0 * h):int(min(y1, 1 - mask_bottom) * h), int(x0 * w):int(x1 * w)] for f in fr]; h = fr[0].shape[0]
    keep = slice(0, h if region else int(h * (1 - mask_bottom)))
    diff, motion = [], []
    win = cv2.createHanningWindow(fr[0][keep].shape[::-1], cv2.CV_32F)
    for a, b in zip(fr, fr[1:]):
        A, Bf = a[keep], b[keep]
        diff.append(float(np.mean(np.abs(A - Bf))))
        (dx, dy), resp = cv2.phaseCorrelate(A, Bf, win)
        motion.append((dx, dy) if resp > .7 else (np.nan, np.nan))   # a weak match is content changing (typing, a pop), not the camera
    diff = np.array(diff); motion = np.array(motion) * fps            # px (at 320 wide) per second
    speed = np.hypot(motion[:, 0], motion[:, 1])
    med = np.median(diff) + 1e-3
    near_cut = np.convolve((diff > max(18, 6 * med)).astype(float), np.ones(5), 'same') > 0   # a cut is not a camera move
    speed = np.where(near_cut, np.nan, speed)
    jerk = np.abs(np.diff(speed)) * fps; jerk = jerk[~np.isnan(jerk)]; speed = speed[~np.isnan(speed)]
    raw = [(i + 1) / fps for i, d in enumerate(diff) if d > max(18, 6 * med)]
    cuts = []   # a burst of changed frames (a glitch, a flash) is one cut
    for c in raw:
        if not cuts or c - cuts[-1][-1] > .3: cuts.append([c])
        else: cuts[-1].append(c)
    cuts = [round(g[0], 2) for g in cuts]
    held = float(np.mean(diff < .15))
    # change over time, in 0.25 s bins, normalised: when things happen
    bins = max(1, int(len(diff) / (fps / 4)))
    curve = [float(x) for x in np.array_split(diff, bins)] if False else [float(np.mean(c)) for c in np.array_split(diff, bins)]
    return dict(fps=round(fps, 2), cuts=cuts, held=round(held, 3), speed_p90=round(float(np.percentile(speed, 90)), 1),
                jerk_p99=round(float(np.percentile(jerk, 99)) if len(jerk) else 0, 1), curve=curve, moving=round(float(np.mean(speed > 2)), 3))

ours, ref, at, dur, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
region = [float(v) for v in sys.argv[6].split(',')] if len(sys.argv) > 6 else None
fo, po = frames(ours, 0, dur); fr, pr = frames(ref, at, dur)
mo, mr = measure(fo, po, region), measure(fr, pr, region)
issues = []
# cuts the reference does not have (or misses one it has), 0.3 s tolerance
extra = [c for c in mo['cuts'] if not any(abs(c - r) < .3 for r in mr['cuts'])]
missing = [r for r in mr['cuts'] if not any(abs(c - r) < .3 for c in mo['cuts'])]
if extra: issues.append({ 'kind': 'cut', 'say': f'cut at {extra} s where the reference keeps one move' })
if missing: issues.append({ 'kind': 'cut', 'say': f'the reference cuts at {missing} s, this shot does not' })
if mo['fps'] < mr['fps'] - 1: issues.append({ 'kind': 'fps', 'say': f"{mo['fps']} fps against the reference's {mr['fps']}" })
# jerk: speed changing much more abruptly than the reference's camera (scaled by how fast each moves)
scale = max(mr['speed_p90'], 1)
if mo['jerk_p99'] / max(mo['speed_p90'], 1) > 4 * mr['jerk_p99'] / scale and mo['speed_p90'] > 3:
    issues.append({ 'kind': 'jerk', 'say': f"the move changes speed abruptly (jerk {mo['jerk_p99']} vs {mr['jerk_p99']})" })
# a camera that stands still where the reference keeps moving
if mr['moving'] - mo['moving'] > .25: issues.append({ 'kind': 'still', 'say': f"moving {mo['moving']*100:.0f}% of the time, the reference {mr['moving']*100:.0f}%" })
if mo['held'] - mr['held'] > .3: issues.append({ 'kind': 'held', 'say': f"frames held {mo['held']*100:.0f}% of the time, the reference {mr['held']*100:.0f}%" })
# rhythm: correlation of the change curves (does change happen at the same moments)
n = min(len(mo['curve']), len(mr['curve']))
rho = float(np.corrcoef(mo['curve'][:n], mr['curve'][:n])[0, 1]) if n > 3 and np.std(mo['curve'][:n]) > 0 and np.std(mr['curve'][:n]) > 0 else 0.0
if rho < .2: issues.append({ 'kind': 'rhythm', 'say': f'changes happen at other moments than the reference (r = {rho:.2f})' })
json.dump({ 'ours': mo, 'reference': mr, 'rhythm': round(rho, 2), 'issues': issues }, open(out, 'w'), indent=1)
print(json.dumps({ 'rhythm': round(rho, 2), 'issues': issues }, ensure_ascii=False))
