# How a stretch of footage moves of itself: its zoom and travel between two moments, from the features both frames share
# (optical flow, then a similarity fit). Read on a candidate segment and on the reference at the shot's moment, so the
# material loop prefers footage that moves as the reference does (motion parity audit 2026-10-26: of the pushes out of
# tolerance most were b-roll whose own move ran against the reference's — the reference tracks in, the clip pulls out).
#   python clipmotion.py '[{"file": ..., "t0": s, "t1": s}, ...]'  ->  [{"zoom": z, "dx": fw, "dy": fw} | null, ...]
# zoom > 1: things grow (a push in); dx, dy: how far the picture travels, in frame widths (the camera goes the other way)
import json, subprocess, sys

import cv2
import numpy as np


def frame(file, t, w=480):
    p = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', str(max(0, t)), '-i', file, '-frames:v', '1', '-vf', f'scale={w}:-2', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True)
    if p.returncode or not p.stdout:
        return None
    return cv2.imdecode(np.frombuffer(p.stdout, np.uint8), cv2.IMREAD_GRAYSCALE)


def motion(file, t0, t1):
    a, b = frame(file, t0), frame(file, t1)
    if a is None or b is None or a.shape != b.shape:
        return None
    # (features off the top eighth and the bottom fifth: a burned-in mark or subtitle stands still and held the fit at
    # ×1.00 over a push of ×1.17, the reference 5:48)
    h = a.shape[0]; mask = np.zeros_like(a); mask[int(h * .125):int(h * .8), :] = 255
    pts = cv2.goodFeaturesToTrack(a, 400, .01, 8, mask=mask)
    if pts is None or len(pts) < 12:
        return None
    nxt, st, _ = cv2.calcOpticalFlowPyrLK(a, b, pts, None, winSize=(21, 21), maxLevel=3)
    ok = st.reshape(-1) == 1
    if ok.sum() < 12:
        return None
    m, inl = cv2.estimateAffinePartial2D(pts[ok], nxt[ok], method=cv2.RANSAC, ransacReprojThreshold=3)
    if m is None or inl is None or inl.sum() < 30:
        return None
    s = float(np.hypot(m[0, 0], m[1, 0])); w = a.shape[1]
    return {'zoom': round(s, 4), 'dx': round(float(m[0, 2]) / w, 4), 'dy': round(float(m[1, 2]) / w, 4), 'inliers': int(inl.sum())}


if __name__ == '__main__':
    print(json.dumps([motion(x['file'], x['t0'], x['t1']) for x in json.loads(sys.argv[1])]))
