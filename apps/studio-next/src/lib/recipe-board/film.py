# The film's finish: a whole cut graded and textured as the creators the user follows do it (Gawx Art, measured
# 2026-10-27 on his four long films and 36 shorter ones: style-lab/RESEARCH-film-finish-20261027.md). Frame by frame,
# rgb24 in, rgb24 out (medium.mjs / finish.mjs pipe ffmpeg through it):
#   tone     blacks lifted a little, never crushed (1st percentile ~0.03), the lights rolled off before white (99th
#            percentile ~0.6-0.8): a soft shoulder, not a clip
#   colour   lights warm (Lab b* +3..+15), shadows neutral; saturation kept
#   halation red-orange glow round the lights that clip (the red layer of colour film lies deepest)
#   bloom    a little general glow from the lights
#   vignette corners about 0.55-0.6 of the centre
#   grain    on luminance only, strongest in the mid-tones, none on black or white; a new field each frame
#   weave    the frame drifts a fraction of a pixel, slowly (gate weave); exposure breathes by under 1 %
#   python3 film.py stream <w> <h> [--preset gawx|soft] [--fps 30]   (stdin -> stdout)
#   python3 film.py still <in.png> <out.png> [--preset ...]
import sys, argparse
import numpy as np
import cv2

PRESETS = {
    # the measured look (four long films: p1 .02-.05, p99 .50-.81, lights b* +3..+15, vignette .53-.56)
    'gawx': dict(black=0.03, shoulder=0.62, white=0.84, warm=0.035, cool=0.006, sat=1.06, halation=0.22, hal_th=0.8, hal_r=0.006, bloom=0.05, vignette=0.42, grain=0.024, grain_px=1.2, weave=0.45, flicker=0.006),
    # the same, kept gentler (a light chapter, a page read close)
    'soft': dict(black=0.022, shoulder=0.7, white=0.9, warm=0.022, cool=0.004, sat=1.03, halation=0.12, hal_th=0.85, hal_r=0.005, bloom=0.03, vignette=0.28, grain=0.022, grain_px=1.1, weave=0.3, flicker=0.004),
}

def tone(x, p):
    # lift the blacks, then a soft shoulder above `shoulder` that never reaches 1 (approaches `white`)
    b, s, w = p['black'], p['shoulder'], p['white']
    y = b + (1 - b) * x
    over = np.maximum(y - s, 0)
    room = w - s
    return np.where(y > s, s + room * (1 - np.exp(-over / room)), y)

def frame(img, i, p, rng, W, H, vig, weave):
    x = img.astype(np.float32) / 255.0
    # gate weave: a slow sub-pixel drift (two sines, seeded), exposure breath
    if p['weave'] > 0:
        dx, dy = weave[i % len(weave)]
        M = np.float32([[1, 0, dx], [0, 1, dy]])
        x = cv2.warpAffine(x, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    Y = 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]
    # halation and bloom from the lights, worked at a quarter size
    small = cv2.resize(x, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    Ys = 0.2126 * small[..., 0] + 0.7152 * small[..., 1] + 0.0722 * small[..., 2]
    lights = np.clip((Ys - p['hal_th']) / (1 - p['hal_th']), 0, 1)
    r = max(1.0, p['hal_r'] * W / 4)
    halo = cv2.resize(cv2.GaussianBlur(lights, (0, 0), r), (W, H), interpolation=cv2.INTER_LINEAR)
    glow = cv2.resize(cv2.GaussianBlur(np.clip((Ys - 0.65) / 0.35, 0, 1), (0, 0), r * 3), (W, H), interpolation=cv2.INTER_LINEAR)
    x[..., 0] += p['halation'] * halo + p['bloom'] * glow
    x[..., 1] += p['halation'] * 0.28 * halo + p['bloom'] * glow
    x[..., 2] += p['bloom'] * 0.9 * glow
    # saturation round the luminance
    Y = 0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]
    x = Y[..., None] + (x - Y[..., None]) * p['sat']
    # tone, per channel (the shoulder desaturates the lights a little, as film does)
    x = tone(np.clip(x, 0, 1.5), p)
    # split: the lights warm, the shadows a touch cool
    Y = np.clip(0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2], 0, 1)
    hi, lo = Y ** 2, (1 - Y) ** 3
    x[..., 0] += p['warm'] * hi; x[..., 1] += p['warm'] * 0.35 * hi; x[..., 2] -= p['warm'] * 0.9 * hi
    x[..., 2] += p['cool'] * lo
    # vignette, and the exposure breath
    x *= vig[..., None] * (1 + p['flicker'] * np.sin(i * 0.37) * np.sin(i * 0.11))
    # grain: luminance, a fresh field each frame, softened to its size, strongest in the mid-tones
    g = rng.standard_normal((H, W)).astype(np.float32)
    gp = max(0.6, p['grain_px'] * W / 1920)   # the grain's size is the film's, not the pixel's: smaller on a half-size cut
    g = cv2.GaussianBlur(g, (0, 0), gp) * (gp * 1.6)
    Y = np.clip(0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2], 0, 1)
    x += (p['grain'] * 4 * Y * (1 - Y) * g)[..., None]
    return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)

def setup(W, H, p, n=4096):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    rr = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / np.sqrt(2)
    vig = 1 - p['vignette'] * np.clip(rr, 0, 1) ** 2.2
    t = np.arange(n)
    s = p['weave'] * W / 1920
    weave = np.stack([s * (np.sin(t * 0.21) * 0.6 + np.sin(t * 0.053 + 1.3) * 0.4), s * 0.6 * (np.sin(t * 0.17 + 0.7) * 0.6 + np.sin(t * 0.041) * 0.4)], -1)
    return vig, weave

def main():
    a = argparse.ArgumentParser()
    a.add_argument('mode'); a.add_argument('args', nargs='*')
    a.add_argument('--preset', default='gawx'); a.add_argument('--seed', type=int, default=7)
    o = a.parse_args()
    p = PRESETS[o.preset]; rng = np.random.default_rng(o.seed)
    if o.mode == 'still':
        src, out = o.args
        img = cv2.cvtColor(cv2.imread(src, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB); H, W = img.shape[:2]
        vig, weave = setup(W, H, p)
        cv2.imwrite(out, cv2.cvtColor(frame(img, 0, p, rng, W, H, vig, weave), cv2.COLOR_RGB2BGR))
        return
    W, H = int(o.args[0]), int(o.args[1]); n = W * H * 3
    vig, weave = setup(W, H, p)
    i = 0; inp, outp = sys.stdin.buffer, sys.stdout.buffer
    while True:
        buf = inp.read(n)
        if len(buf) < n: break
        img = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        outp.write(frame(img, i, p, rng, W, H, vig, weave).tobytes()); i += 1
    outp.flush()

if __name__ == '__main__':
    main()
