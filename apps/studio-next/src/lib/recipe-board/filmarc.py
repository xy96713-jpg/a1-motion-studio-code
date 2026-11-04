#!/usr/bin/env python3
# The whole film's rise and fall, measured (the user 2026-10-27: 我再说整片的美学设计 — a film of beats each fine on its
# own read flat as a whole: seven tenths the same dark chart from above, one tone from the grounding to the release).
# One frame a second, each read as a look: a 16x9 grey thumbnail, its mean lightness, its share of strong colour, its
# detail. A run is a stretch whose looks all stay near its first; the film's measures:
#   longest   the longest run in seconds (a stretch that does not change its look)
#   flat      the share of the film in runs of 20 s or more
#   changes   new looks a minute
#   range     the spread of the film's lightness (p90 - p10 of the frames' mean)
#   peaks     the frames that stand out of the film (lightness or detail far from its median): its hero moments
# usage: filmarc.py <video> [--from s] [--to s] [--json]   prints one JSON line
import json, subprocess, sys
import numpy as np

RUN_T = 0.085   # a look leaves its run when its thumbnail differs from the run's first by this much (mean |dL|, 0-1)

def frames(path, t0=None, t1=None):
    args = ['ffmpeg', '-loglevel', 'error']
    if t0: args += ['-ss', str(t0)]
    args += ['-i', path]
    if t1: args += ['-t', str(t1 - (t0 or 0))]
    args += ['-vf', 'fps=1,scale=64:36:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(args, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.uint8).reshape(-1, 36, 64, 3).astype(np.float32) / 255.0
    if not len(a): raise SystemExit(json.dumps({'error': 'no frames'}))
    return a

def measure(a):
    L = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    thumbs = L.reshape(len(L), 9, 4, 16, 4).mean(axis=(2, 4))   # 16x9
    mean = L.mean(axis=(1, 2))
    mx, mn = a.max(axis=3), a.min(axis=3)
    chroma = ((mx - mn) > 0.25).mean(axis=(1, 2))
    detail = np.abs(np.diff(L, axis=2)).mean(axis=(1, 2)) + np.abs(np.diff(L, axis=1)).mean(axis=(1, 2))
    runs, start = [], 0
    for i in range(1, len(L)):
        if np.abs(thumbs[i] - thumbs[start]).mean() > RUN_T: runs.append((start, i)); start = i
    runs.append((start, len(L)))
    lens = [b - a_ for a_, b in runs]
    n = len(L)
    medL, medD = float(np.median(mean)), float(np.median(detail))
    peaks = [i for i in range(n) if abs(mean[i] - medL) > 0.12 or detail[i] > medD * 2.2 or chroma[i] > 0.08]
    # group peaks within 3 s into moments
    moments = []
    for i in peaks:
        if moments and i - moments[-1][-1] <= 3: moments[-1].append(i)
        else: moments.append([i])
    return {
        'seconds': n,
        'longest': int(max(lens)),
        'longestAt': int(runs[int(np.argmax(lens))][0]),
        'flat': round(sum(l for l in lens if l >= 20) / n, 3),
        'changes': round((len(runs) - 1) / (n / 60), 2),
        'range': round(float(np.percentile(mean, 90) - np.percentile(mean, 10)), 3),
        'peaks': len(moments),
        'peaksPerMin': round(len(moments) / (n / 60), 2),
        'moments': [[m[0], m[-1]] for m in moments][:40],
        'curve': [round(float(x), 3) for x in mean],
    }

if __name__ == '__main__':
    p = sys.argv[1]; t0 = t1 = None
    if '--from' in sys.argv: t0 = float(sys.argv[sys.argv.index('--from') + 1])
    if '--to' in sys.argv: t1 = float(sys.argv[sys.argv.index('--to') + 1])
    r = measure(frames(p, t0, t1))
    if '--json' not in sys.argv: r.pop('curve'); r.pop('moments')
    print(json.dumps(r, ensure_ascii=False))
