# The reference taken apart finely, by measurement (user, 2026-10-21: 拆的不够细，很多没对标上动效、设计): over a span of
# a film, every cut, and between cuts (a sub-shot) what the camera does, how the frame looks and where its type sits.
# The same measures are taken on our render of the span, so the two can be set side by side item by item (breakdown.mjs).
#   python breakdown.py <video> <at> <dur> <out.json> [--ocr <ocr.swift>] [--frames <dir>]
# Per sub-shot:
#   camera  zoom (scale at the end over the start), pan (x, y in frame widths over the sub-shot), moving (share of the
#           time the picture moves), ease (share of the move done in its first half: > .6 eases out, < .4 eases in),
#           speed (frame widths a second, p90); measured on features (ORB, a similarity transform), a cut is no move
#   look    lum (L* mean), contrast (L* std), sat (chroma mean), warm (b* mean), vignette (L* centre minus corners),
#           grain (noise in the flat parts), sharp (Laplacian variance at 480 px), base dark / light
#   text    what is set on screen above the subtitle band (OCR of the frame at 70 %): text, height (px of 1080), centre
#   events  moments something appears or changes inside the sub-shot (a local burst of change that is not a cut)
import json, os, subprocess, sys, tempfile, warnings
warnings.filterwarnings('ignore')
import cv2, numpy as np

SUB = .86   # the subtitle band starts here (fraction of the height): never measured

def read(path, at, dur, w=480):
    # streamed: the frame difference at the full rate (cuts, events), the pictures kept at 10 a second (camera, look)
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 30
    if at > 0: cap.set(cv2.CAP_PROP_POS_MSEC, at * 1000)
    k = max(1, int(round(fps / 10))); kept, d, prev, n = [], [], None, 0
    while n < int(round(dur * fps)):
        ok, f = cap.read()
        if not ok: break
        g = cv2.cvtColor(cv2.resize(f, (320, 180), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)[: int(180 * SUB)]
        if prev is not None: d.append(float(np.mean(np.abs(g - prev))))
        prev = g
        if n % k == 0: kept.append((n / fps, cv2.resize(f, (w, int(f.shape[0] * w / f.shape[1])), interpolation=cv2.INTER_AREA)))
        n += 1
    return kept, np.array(d), fps, n

def cuts_of(d, fps):
    if not len(d): return []
    med = np.median(d) + 1e-3; raw = [(i + 1) / fps for i, x in enumerate(d) if x > max(18, 6 * med)]
    cuts = []
    for c in raw:
        if not cuts or c - cuts[-1][-1] > .3: cuts.append([c])
        else: cuts[-1].append(c)
    return [round(c[0], 2) for c in cuts]

orb = cv2.ORB_create(800)
def matches(a, b, static=None):
    ka, da = orb.detectAndCompute(a, None); kb, db = orb.detectAndCompute(b, None)
    if da is None or db is None or len(ka) < 12 or len(kb) < 12: return None
    m = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(da, db)
    if len(m) < 12: return None
    A = np.float32([ka[x.queryIdx].pt for x in m]); B = np.float32([kb[x.trainIdx].pt for x in m])
    # what stands still on the screen the whole sub-shot (a platform's watermark, a name card laid over a photo) is not
    # the camera: its points are left out while enough others remain (ours read ×0.987 on a ×1.07 push under a torn
    # name card, who-S10; the reference ×1.0 under its watermark)
    if static is not None and len(static):
        keep = np.min(np.linalg.norm(A[:, None, :] - static[None, :, :], axis=2), axis=1) > 6
        if keep.sum() >= 12: A, B = A[keep], B[keep]
    return A, B

def step(a, b, static=None):
    p = matches(a, b, static)
    if p is None: return None
    A, B = p
    M, inl = cv2.estimateAffinePartial2D(A, B, method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if M is None or inl is None or inl.sum() < 10: return None
    s = float(np.hypot(M[0, 0], M[1, 0])); h, w = a.shape[:2]
    # the translation of the frame's centre (a zoom about the centre is not a pan)
    cx, cy = w / 2, h / 2; tx = M[0, 0] * cx - M[1, 0] * cy + M[0, 2] - cx; ty = M[1, 0] * cx + M[0, 0] * cy + M[1, 2] - cy
    return s, tx / w, ty / w

def still_points(g):
    p = matches(g[0], g[-1])
    if p is None: return np.zeros((0, 2), np.float32)
    A, B = p; still = np.linalg.norm(A - B, axis=1) < .8
    # only a few things laid over a moving picture: when most of it stands still, the camera does (a presenter's room
    # left out read the presenter's nods as a camera moving 82 % of the time, who R11)
    return A[still] if still.mean() < STILL_SHARE else np.zeros((0, 2), np.float32)

STILL_SHARE = .4   # of the matches end to end: above it the picture stands still and nothing is left out
LONG = 10   # frames (1 s at 10 a second) between the pictures the camera's travel is read from

def camera(fr):
    g = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)[: int(f.shape[0] * SUB)] for f in fr]   # 10 a second
    zs, xs, ys, mv, res = [], [], [], [], []
    st = still_points(g) if len(g) > 2 else None
    for a, b in zip(g, g[1:]):
        r = step(a, b, st)
        # what moves in the picture besides the camera (user, 2026-10-22: 包装成熟；元素动画对标): the next frame set
        # against this one carried by the camera's move; words typing in, a card popping, a bar sweeping are left
        res.append(residual(a, b, r))
        if r is None: zs.append(0); xs.append(0); ys.append(0); mv.append(np.nan); continue
        s, tx, ty = r; zs.append(np.log(s)); xs.append(tx); ys.append(ty)
        mv.append(np.hypot(tx, ty) * 10 + abs(np.log(s)) * 10)   # frame widths (or log scale) a second
    # how fast it travels, read three tenths of a second apart for the same reason (a slow push read as standing still
    # 84 % of the time, who-S10): each frame takes the speed of the span it starts
    if len(g) > 3:
        m3 = []
        for i in range(len(g) - 3):
            r = step(g[i], g[i + 3], st)
            m3.append(np.nan if r is None else (np.hypot(r[1], r[2]) + abs(np.log(r[0]))) * 10 / 3)
        m3 += [m3[-1]] * 3 if m3 else []
        mv = [b if not np.isnan(b) else a for a, b in zip(mv, m3)]
    mv = np.array(mv, dtype=float); ok = ~np.isnan(mv)
    if not len(zs): return dict(zoom=1, pan=[0, 0], moving=0, ease=None, speed=0, anim=anim(res))
    z = float(np.exp(np.sum(zs))); px = -float(np.sum(xs)); py = -float(np.sum(ys))   # the camera moves against the picture
    # the travel read a second apart: a slow push changes a frame by less than the matches' error from one tenth of a
    # second to the next and the product of the small steps came out near 1 (a ×1.06 push read ×1.009 under a still
    # card, ×1.045 a second apart and ×1.059 end to end); a second that cannot be matched is read step by step
    if len(g) > LONG:
        idx = sorted(set(list(range(0, len(g) - 1, LONG)) + [len(g) - 1])); lz, lx, ly = 0.0, 0.0, 0.0
        for a, b in zip(idx, idx[1:]):
            r = step(g[a], g[b], st)
            if r is None: lz += float(np.sum(zs[a:b])); lx += float(np.sum(xs[a:b])); ly += float(np.sum(ys[a:b])); continue
            lz += np.log(r[0]); lx += r[1]; ly += r[2]
        z, px, py = float(np.exp(lz)), -lx, -ly
    path = np.cumsum(np.nan_to_num(mv)); tot = path[-1] if len(path) else 0
    ease = float(path[len(path) // 2] / tot) if tot > 1e-3 and len(path) > 3 else None
    return dict(zoom=round(z, 3), pan=[round(px, 3), round(py, 3)], moving=round(float(np.mean(mv[ok] > .02)) if ok.any() else 0, 2),
                ease=None if ease is None else round(ease, 2), speed=round(float(np.percentile(mv[ok], 90)) if ok.any() else 0, 3), anim=anim(res))

def residual(a, b, r):
    # mean change (0-255) between b and a carried by the similarity transform of the camera, on the parts both cover
    h, w = a.shape[:2]
    if r is None: return float(np.mean(cv2.absdiff(a, b)))
    s, tx, ty = r; cx, cy = w / 2, h / 2
    M = np.float32([[s, 0, cx - s * cx + tx * w], [0, s, cy - s * cy + ty * w]])
    wa = cv2.warpAffine(a, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=-1)
    m = cv2.warpAffine(np.ones_like(a), M, (w, h), flags=cv2.INTER_NEAREST) > 0
    d = cv2.absdiff(cv2.GaussianBlur(wa, (0, 0), 1.5), cv2.GaussianBlur(b, (0, 0), 1.5)).astype(np.float32); d[~m] = 0
    # where the change gathers, not its mean over the frame: a name tag or a role line landing is a few per cent of the
    # frame and read as nothing (who R09: ours built in three beats, measured as 0.2 s); the busiest 5 % of a 24 x 13 grid
    g = cv2.resize(d, (24, 13), interpolation=cv2.INTER_AREA).ravel()
    return float(np.mean(np.sort(g)[-max(1, len(g) // 20):]))

def anim(res):
    # the pace of what moves besides the camera, 10 a second: onset (s after the sub-shot's start when it first moves),
    # build (s until 90 % of all its movement is done), pulses (separate beats of it), level (mean change)
    if len(res) < 3: return dict(onset=None, build=None, pulses=0, level=0)
    x = np.array(res, dtype=float); base = np.median(x); act = np.clip(x - base * .5 - 4.0, 0, None)
    tot = act.sum(); lvl = round(float(x.mean()), 2)
    if tot < 20: return dict(onset=None, build=None, pulses=0, level=lvl)
    # (onset by an absolute amount of change: relative to the largest, a chart whose later beats are bigger read as
    # starting late, open-S6)
    on = np.nonzero(act > 8.0)[0]; cum = np.cumsum(act) / tot
    hi = act > max(8.0, act.max() * .35); pulses = int(np.sum(hi[1:] & ~hi[:-1]) + (1 if hi[0] else 0))
    return dict(onset=round(float(on[0]) / 10, 2) if len(on) else None, build=round(float(np.argmax(cum >= .9) + 1) / 10, 2), pulses=pulses, level=lvl)

def look(f):
    lab = cv2.cvtColor(f, cv2.COLOR_BGR2LAB).astype(np.float32); h, w = f.shape[:2]; H = int(h * SUB)
    L = lab[:H, :, 0] * 100 / 255; a = lab[:H, :, 1] - 128; b = lab[:H, :, 2] - 128
    cy, cx = slice(int(H * .3), int(H * .7)), slice(int(w * .3), int(w * .7))
    corners = np.concatenate([L[:H // 6, :w // 6].ravel(), L[:H // 6, -w // 6:].ravel(), L[-H // 6:, :w // 6].ravel(), L[-H // 6:, -w // 6:].ravel()])
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32)[:H]
    hp = g - cv2.GaussianBlur(g, (0, 0), 1.2); grad = cv2.Laplacian(cv2.GaussianBlur(g, (0, 0), 3), cv2.CV_32F)
    flat = np.abs(grad) < np.percentile(np.abs(grad), 30)
    return dict(lum=round(float(L.mean()), 1), contrast=round(float(L.std()), 1), sat=round(float(np.hypot(a, b).mean()), 1), warm=round(float(b.mean()), 1),
                vignette=round(float(L[cy, cx].mean() - corners.mean()), 1), grain=round(float(hp[flat].std()), 2),
                sharp=round(float(cv2.Laplacian(g, cv2.CV_32F).var()), 0), base='dark' if L.mean() < 45 else 'light')

def text(f, ocr, tmp):
    if not ocr: return []
    p = os.path.join(tmp, 'f.png'); cv2.imwrite(p, f)
    try: lines = json.loads(subprocess.run(['swift', ocr, p], capture_output=True, text=True, timeout=180).stdout or '[]')
    except Exception: return []
    out = []
    for l in lines:
        x, y, w, h = l['box']
        if y + h > SUB or l.get('confidence', 1) < .3 or not l['text'].strip(): continue
        if x < .2 and y < .08: continue   # the reference's platform watermark in the top left corner
        out.append(dict(text=l['text'], h=round(h * 1080), cx=round(x + w / 2, 2), cy=round(y + h / 2, 2), w=round(w, 2)))
    return sorted(out, key=lambda t: -t['h'])

def events(d, a, b, fps):
    # what appears, read against the picture's own steady change: the frame differences less their running median (0.6 s),
    # so an arrival under a camera that keeps moving still stands out (a chart's companies landing as the column rose read
    # as nothing appearing, open-S6; a camera at rest gives the same as before)
    seg = np.array(d[a:b], dtype=float)
    if len(seg) < 6: return []
    w = max(3, int(round(fps * .6)) | 1); pad = np.pad(seg, (w // 2, w // 2), mode='edge')
    local = np.array([np.median(pad[i:i + w]) for i in range(len(seg))]); e = seg - local
    base = np.median(np.abs(e)) + .3; out = []
    for i, x in enumerate(e):
        t = (a + i + 1) / fps
        if x > 3 * base and x > 1.5 and (not out or t - out[-1] > .4): out.append(round(t, 2))
    return out

def main():
    video, at, dur, outp = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
    ocr = sys.argv[sys.argv.index('--ocr') + 1] if '--ocr' in sys.argv else None
    fdir = sys.argv[sys.argv.index('--frames') + 1] if '--frames' in sys.argv else None
    kept, d, fps, n = read(video, at, dur)
    if len(kept) < 2: json.dump({'error': 'no frames'}, open(outp, 'w')); return
    cuts = cuts_of(d, fps)
    # --cuts: cuts known beforehand (ours: the plan's shot boundaries; a cut between two framings of one page is too
    # small a change to be seen, and two shots measured as one built for 2.1 s: open-S3)
    if '--cuts' in sys.argv:
        for c in [float(x) for x in sys.argv[sys.argv.index('--cuts') + 1].split(',') if x]:
            if 0 < c < n / fps and all(abs(c - k) > .2 for k in cuts): cuts.append(round(c, 2))
        cuts.sort()
    edges = [0.0] + cuts + [n / fps]
    subs, tmp = [], tempfile.mkdtemp()
    for i, (s, e) in enumerate(zip(edges, edges[1:])):
        if e - s < .2: continue
        # the pictures inside the sub-shot, a few frames clear of its cuts (a cut's frames are neither shot)
        part = [f for t, f in kept if s + .05 <= t < e - .05] or [min(kept, key=lambda x: abs(x[0] - s))[1]]
        tm = s + (e - s) * .7
        cap = cv2.VideoCapture(video); cap.set(cv2.CAP_PROP_POS_MSEC, (at + tm) * 1000); ok, big = cap.read()
        if not ok: big = part[int(len(part) * .7)]
        big = cv2.resize(big, (1920, int(big.shape[0] * 1920 / big.shape[1])))
        if fdir:
            os.makedirs(fdir, exist_ok=True)
            for j, q in enumerate((.15, .5, .85)):
                cap.set(cv2.CAP_PROP_POS_MSEC, (at + s + (e - s) * q) * 1000); ok, f = cap.read()
                if ok: cv2.imwrite(os.path.join(fdir, f'{len(subs):02d}-{j}.jpg'), cv2.resize(f, (640, 360)))
        subs.append(dict(at=round(s, 2), end=round(e, 2), camera=camera(part), look=look(big), text=text(big, ocr, tmp), events=[x for x in events(d, int(s * fps), min(int(e * fps), len(d)), fps) if s + .3 < x < e - .2]))
    # --spans a-b,...: the camera over other spans (ours over each sub-shot of the reference: a reference cut inside one shot
    # of ours left its move prorated over our whole shot, recap-S6 pushing ×1.10 in the reference's 0.5 s measured ×1.01)
    spans = []
    if '--spans' in sys.argv:
        for x in [x for x in sys.argv[sys.argv.index('--spans') + 1].split(',') if x]:
            s, e = [float(v) for v in x.split(':')]
            part = [f for t, f in kept if s <= t < e]
            if len(part) >= 3: spans.append(dict(at=round(s, 3), end=round(e, 3), camera=camera(part)))
    # a measure that has nothing to measure (a black frame's grain) is null, never NaN (not JSON)
    clean = lambda v: None if isinstance(v, float) and v != v else [clean(x) for x in v] if isinstance(v, list) else {k: clean(x) for k, x in v.items()} if isinstance(v, dict) else v
    json.dump(clean(dict(fps=round(fps, 2), at=at, dur=dur, cuts=cuts, subs=subs, spans=spans)), open(outp, 'w'), ensure_ascii=False, indent=1)

main()
