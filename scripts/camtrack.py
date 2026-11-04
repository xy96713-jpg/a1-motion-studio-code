# Per-frame global camera motion of a video span: LK optical flow on corners -> partial affine
# (translation, scale, rotation) between consecutive frames. Prints per-segment statistics.
# Used to hold camera moves to work/recipe-board-v1/CAMERA.md. Needs opencv-python and numpy.
# usage: python3 scripts/camtrack.py video.mp4 out.json name:start:end [name:start:end ...]
import sys, json, subprocess
import numpy as np
import cv2

video, out = sys.argv[1], sys.argv[2]
W = 960
res = {}
for spec in sys.argv[3:]:
    name, a, b = spec.split(':'); a, b = float(a), float(b)
    cmd = ['ffmpeg', '-loglevel', 'error', '-ss', str(a), '-t', str(b - a), '-i', video, '-vf', f'scale={W}:-2,format=gray', '-f', 'rawvideo', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    H = int(round(W * 9 / 16)); H += H % 2
    n = len(raw) // (W * H)
    frames = np.frombuffer(raw[: n * W * H], np.uint8).reshape(n, H, W)
    rows = []
    for i in range(1, n):
        p0 = cv2.goodFeaturesToTrack(frames[i - 1], 400, 0.01, 8)
        if p0 is None or len(p0) < 12: rows.append(None); continue
        p1, st, _ = cv2.calcOpticalFlowPyrLK(frames[i - 1], frames[i], p0, None, winSize=(21, 21), maxLevel=3)
        good0, good1 = p0[st == 1], p1[st == 1]
        if len(good0) < 12: rows.append(None); continue
        M, inl = cv2.estimateAffinePartial2D(good0, good1, method=cv2.RANSAC, ransacReprojThreshold=1.5)
        if M is None: rows.append(None); continue
        s = float(np.hypot(M[0, 0], M[1, 0])); r = float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))
        # translation of the frame centre, in 1920-wide pixels
        c = np.array([W / 2, H / 2]); c2 = M[:, :2] @ c + M[:, 2]
        dx, dy = (c2 - c) * (1920 / W)
        rows.append({'dx': float(dx), 'dy': float(dy), 'scale': s, 'rot': r, 'inliers': int(inl.sum())})
    ok = [r for r in rows if r]
    if not ok: res[name] = {'frames': n, 'tracked': 0}; continue
    dx = np.array([r['dx'] for r in ok]); dy = np.array([r['dy'] for r in ok])
    sc = np.array([r['scale'] for r in ok]); rot = np.array([r['rot'] for r in ok])
    v = np.hypot(dx, dy)
    # jitter: frame-to-frame change of velocity (a smooth move has ~0)
    jit = np.hypot(np.diff(dx), np.diff(dy)) if len(dx) > 2 else np.array([0])
    res[name] = {
        'span': [a, b], 'frames': n, 'tracked': len(ok),
        'speed_px_per_frame': {'median': round(float(np.median(v)), 3), 'p90': round(float(np.percentile(v, 90)), 3), 'max': round(float(v.max()), 2)},
        'jitter_px': {'median': round(float(np.median(jit)), 3), 'p90': round(float(np.percentile(jit, 90)), 3)},
        'zoom_per_second_pct': round(float((np.prod(sc) ** (30 / len(sc)) - 1) * 100), 3),
        'rot_deg_per_frame_p90': round(float(np.percentile(np.abs(rot), 90)), 4),
        'net_px': [round(float(dx.sum()), 1), round(float(dy.sum()), 1)],
        'still_frames_pct': round(float((v < 0.15).mean() * 100), 1),
    }
    res[name]['series'] = [None if r is None else [round(r['dx'], 2), round(r['dy'], 2), round((r['scale'] - 1) * 1000, 2)] for r in rows]
json.dump(res, open(out, 'w'), indent=1)
for k, v in res.items():
    print(k, {kk: vv for kk, vv in v.items() if kk != 'series'})
