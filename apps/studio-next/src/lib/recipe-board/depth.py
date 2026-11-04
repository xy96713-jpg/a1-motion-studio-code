# Depth of a picture, per shot, ours against the reference on the same clock (film.mjs): the share of a frame that is
# textured but soft (a layer out of focus: a lens's falloff, a blurred ground, a page's far lines) and the lower third's
# share of what is drawn. The reference's photographs and pages carry a focus falloff; ours were sharp edge to edge and
# read as pictures pasted on a slide (hupo-auto2, 2026-10-25: textured-but-soft cells 0.08 against the reference's 0.13,
# 30 shots with none where the reference had a tenth or more; the user: 像PPT).
#   python3 depth.py <ours.mp4> <ref.mp4> <shots.json>   shots: [{ seg, id, at, end }]; prints one JSON line a shot
#   python3 depth.py --frames <a.png> ...                the soft share of each frame, as one JSON list
import sys, json, cv2, numpy as np

STEP = .5

def measure(g):
    g = g[:234].astype(np.float32)                 # above the subtitle band (935 of 1080, at 480 x 270)
    g[:33, :120] = np.median(g)                    # the reference's watermark corner out
    e = cv2.Canny(g.astype(np.uint8), 60, 160) > 0
    bottom = float(e[156:].sum() / (e.sum() + 1e-6))
    # (sharpness read after a light blur that takes out pixel grain, the same for both films: our texture's grain, new each
    # frame, read as sharp detail and a lens-blurred photograph measured flat edge to edge, meta S1 0 against 0.17)
    gs = cv2.GaussianBlur(g, (5, 5), 1.2)
    cells = [(c.std(), cv2.Laplacian(cs, cv2.CV_32F).var()) for y in range(0, 195, 39) for x in range(0, 480, 60) for c, cs in [(g[y:y + 39, x:x + 60], gs[y:y + 39, x:x + 60])]]
    soft = float(np.mean([sd > 10 and lap < 8 for sd, lap in cells]))   # (8 after the grain blur is the 25 it was before, on the reference's own cells)
    return soft, bottom

def sample(video, times):
    cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS) or 30; out = {}
    for t in times:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(t * fps))); ok, f = cap.read()
        if ok: out[t] = measure(cv2.cvtColor(cv2.resize(f, (480, 270)), cv2.COLOR_BGR2GRAY))
    return out

if __name__ == '__main__' and sys.argv[1] == '--frames':
    # the soft share of single frames (modules.mjs refLens: the reference's own depth at a shot's moments)
    print(json.dumps([measure(cv2.cvtColor(cv2.resize(cv2.imread(f), (480, 270)), cv2.COLOR_BGR2GRAY))[0] for f in sys.argv[2:]]))
elif __name__ == '__main__':
    ours, ref, shots = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
    times = sorted({round(s['at'] + .25 + k * STEP, 2) for s in shots for k in range(int((s['end'] - s['at'] - .25) / STEP) + 1) if s['at'] + .25 + k * STEP < s['end']})
    O, R = sample(ours, times), sample(ref, times)
    for s in shots:
        ts = [t for t in times if s['at'] <= t < s['end'] and t in O and t in R]
        if not ts: continue
        mean = lambda F, i: round(float(np.mean([F[t][i] for t in ts])), 3)
        print(json.dumps({ 'seg': s['seg'], 'id': s['id'], 'ours': { 'soft': mean(O, 0), 'bottom': mean(O, 1) }, 'ref': { 'soft': mean(R, 0), 'bottom': mean(R, 1) } }))
