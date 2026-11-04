# Whether two picture files show the same photograph, whatever their crop and size (a Commons original and its smaller,
# tighter copy): one is searched inside the other at several scales by normalised cross-correlation of their greys.
#   python3 samepic.py <a> <b>  -> prints the best correlation (0-1)
import sys
import numpy as np
from PIL import Image

def grey(f, w):
    im = Image.open(f).convert('L'); h = max(8, round(im.height * w / im.width))
    return np.asarray(im.resize((w, h), Image.BILINEAR), dtype=np.float32)

def best(big_f, small_f):
    s = grey(small_f, 72); s = (s - s.mean()) / (s.std() + 1e-6); sh, sw = s.shape
    top = 0.0
    for k in np.arange(0.35, 1.001, 0.05):
        bw = int(round(sw / k)); b = grey(big_f, bw)
        if b.shape[0] < sh or b.shape[1] < sw: continue
        for y in range(0, b.shape[0] - sh + 1, 2):
            for x in range(0, b.shape[1] - sw + 1, 2):
                p = b[y:y + sh, x:x + sw]; p = (p - p.mean()) / (p.std() + 1e-6)
                top = max(top, float((p * s).mean()))
    return top

a, b = sys.argv[1], sys.argv[2]
print(round(max(best(a, b), best(b, a)), 3))
