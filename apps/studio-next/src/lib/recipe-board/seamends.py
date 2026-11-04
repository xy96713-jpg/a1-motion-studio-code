# The two ends of each piece of a reel: how full the picture is in its first and last SEAM_WIN seconds against the
# piece's own median (the share of a 192x108 grey frame carrying detail off a 9 px box blur), and whether it moves there.
#   python3 seamends.py <piece.mp4> ...  -> one JSON line per piece {file, med, head, tail (the least fill there), headMove, tailMove,
#   headCam, tailCam (the camera's [pan x, pan y, zoom] in px a 1/30 s at 1920 wide over its first and last CAM_WIN s: a
#   similarity fit on tracked corners), carryIn (how much of the last piece's last frame this one's first frame keeps:
#   {iou: edges in the same place, corr: the blurred pictures alike})}
import sys, json, subprocess
import numpy as np, cv2
FPS, W, H, WIN = 15, 192, 108, 0.6
def frames(v):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', v, '-vf', f'fps={FPS},scale={W}:{H}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
def fill(f):
    k = np.ones(9) / 9
    b = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, f); b = np.apply_along_axis(lambda c: np.convolve(c, k, 'same'), 0, b)
    return float(np.mean(np.abs(f - b) > 10))
CW, CH, CAM_WIN = 480, 270, 0.25
def grab(v, pre, dur):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', *pre, '-i', v, '-t', str(dur), '-vf', f'fps=30,scale={CW}:{CH}', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, CH, CW)
def cam(a, b):
    p = cv2.goodFeaturesToTrack(a, 200, 0.01, 8)
    if p is None or len(p) < 12: return None
    q, st, _ = cv2.calcOpticalFlowPyrLK(a, b, p, None, winSize=(21, 21), maxLevel=3); ok = st.ravel() == 1
    if ok.sum() < 12: return None
    M, inl = cv2.estimateAffinePartial2D(p[ok], q[ok], ransacReprojThreshold=2)
    if M is None or inl.mean() < .5: return None
    s = float(np.hypot(M[0, 0], M[1, 0])); cx, cy = CW / 2, CH / 2
    k = 1920 / CW   # the centre's move and the zoom as the frame edge's move
    return [(M[0, 0] * cx - M[1, 0] * cy + M[0, 2] - cx) * k, (M[1, 0] * cx + M[0, 0] * cy + M[1, 2] - cy) * k, (s - 1) * 1920 / 2]
def camOf(F):
    v = [x for x in (cam(F[i], F[i + 1]) for i in range(len(F) - 1)) if x]
    return [round(float(np.mean([x[j] for x in v])), 2) for j in range(3)] if v else None
def edges(f): return cv2.dilate(cv2.Canny(cv2.GaussianBlur(f, (5, 5), 0), 40, 120), np.ones((5, 5), np.uint8)) > 0
def carry(a, b):
    ea, eb = edges(a), edges(b); u = (ea | eb).sum()
    ba, bb = cv2.GaussianBlur(a, (15, 15), 0).ravel().astype(np.float32), cv2.GaussianBlur(b, (15, 15), 0).ravel().astype(np.float32)
    corr = float(np.corrcoef(ba, bb)[0, 1]) if ba.std() > 1 and bb.std() > 1 else 0.0
    return {'iou': round(float((ea & eb).sum() / u) if u else 0.0, 3), 'corr': round(corr, 3)}
last = None
for v in sys.argv[1:]:
    F = frames(v); n = max(2, int(WIN * FPS))
    if len(F) < 2 * n + 1: print(json.dumps({'file': v, 'med': 0})); last = None; continue
    C = np.array([fill(f) for f in F]); D = np.abs(np.diff(F, axis=0)).mean(axis=(1, 2)); med = float(np.median(C))
    h, t = grab(v, [], CAM_WIN), grab(v, ['-sseof', str(-CAM_WIN - 0.05)], CAM_WIN + 0.05)
    o = {'file': v, 'med': round(med, 4), 'head': round(float(C[:n].min()), 4), 'tail': round(float(C[-n:].min()), 4),
         'headMove': round(float(D[:n].mean()), 2), 'tailMove': round(float(D[-n:].mean()), 2),
         'headCam': camOf(h) if len(h) > 2 else None, 'tailCam': camOf(t) if len(t) > 2 else None}
    if last is not None and len(h): o['carryIn'] = carry(last, h[0])
    last = t[-1] if len(t) else None
    print(json.dumps(o))
