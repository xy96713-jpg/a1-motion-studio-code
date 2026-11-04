# tighten a generated transparent sprite: the soft glow the model leaves around it goes, the sprite is trimmed
# python prep.py in.png out.png [lo hi]
import cv2, numpy as np, sys
im = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
lo, hi = (float(sys.argv[3]), float(sys.argv[4])) if len(sys.argv) > 4 else (200, 245)
a = np.clip((im[..., 3].astype(np.float32) - lo) / (hi - lo), 0, 1)
im[..., 3] = (a * 255).astype(np.uint8)
ys, xs = np.where(a > .05); im = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
cv2.imwrite(sys.argv[2], im); print(sys.argv[2].split('/')[-1], im.shape)
