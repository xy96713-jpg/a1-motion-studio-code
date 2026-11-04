# our beats -> the original's seconds, by the burned-in subtitles (OCR every 0.5 s); monotonic DP over bigram overlap
import json, glob, os, re, sys
P, SUB, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
norm = lambda s: re.sub(r'[^一-鿿0-9A-Za-z]', '', s or '')
bg = lambda s: {s[i:i+2] for i in range(len(s) - 1)}
shots = sorted(glob.glob(P + '/shots/B*.json'), key=lambda f: int(os.path.basename(f)[1:3]))
beats = [(os.path.basename(f)[:3], norm(json.load(open(f)).get('subtitle', ''))) for f in shots]
fr = [json.loads(l) for l in open(SUB)]; fr.sort(key=lambda x: x['file'])
T = [(int(x['file'][1:5]) - 1) / 2 for x in fr]; FB = [bg(norm(x['text'])) for x in fr]; BB = [bg(t) for _, t in beats]
def sc(f, b):
    if not FB[f] or not BB[b]: return 0
    return len(FB[f] & BB[b]) / max(4, min(len(FB[f]), len(BB[b])))
n, m = len(fr), len(beats)
NEG = -1e9; dp = [[NEG] * (m + 1) for _ in range(n + 1)]; bk = [[None] * (m + 1) for _ in range(n + 1)]
dp[0][0] = 0
for f in range(n):
    for b in range(m + 1):
        if dp[f][b] == NEG: continue
        # frame f unassigned, staying at beat pointer b (b = beats done so far; current beat b-1)
        if dp[f][b] > dp[f + 1][b]: dp[f + 1][b], bk[f + 1][b] = dp[f][b], (b, None)
        # assign to current beat b-1
        if b >= 1:
            v = dp[f][b] + sc(f, b - 1) - 0.25
            if v > dp[f + 1][b]: dp[f + 1][b], bk[f + 1][b] = v, (b, b - 1)
        # start next beat b
        if b < m:
            v = dp[f][b] + sc(f, b) - 0.25
            if v > dp[f + 1][b + 1]: dp[f + 1][b + 1], bk[f + 1][b + 1] = v, (b, b)
b = max(range(m + 1), key=lambda k: dp[n][k]); span = {}
for f in range(n, 0, -1):
    pb, a = bk[f][b]
    if a is not None and sc(f - 1, a) > 0.2: span.setdefault(beats[a][0], []).append(T[f - 1])
    b = pb
res = {k: [min(v), max(v) + 0.5] for k, v in span.items()}
json.dump(res, open(OUT, 'w'), indent=0)
for k, _ in beats: print(k, res.get(k, 'NOT FOUND'))
