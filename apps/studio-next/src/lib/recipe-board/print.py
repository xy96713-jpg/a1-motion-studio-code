# The print medium: a finished frame printed in one or two inks on paper (style-lab/calc4: the user picked
# the risograph versions of a catalogue master and of a real photo over every "cinematic" image). The craft
# is in code, the same on every frame, so a film reads as one printed object whatever its sources were.
#   riso       black ink (a halftone of the darks) + red ink (what is red in the frame) on cream, red off register
#   riso-light the same, a finer screen, lighter ink and the mid-tones lifted (the user: the full riso was too much)
#   riso-blue  Klein blue ink + red ink on paper
#   dither     1-bit ordered dither, blue ink on paper (old Mac / zine)
#   gameboy    four greens, ordered dither (Game Boy)
# The screens are fixed (a print does not crawl); the ink texture changes every few frames (stop-motion boil).
#
#   python print.py still <in.png> <out.png> [--preset riso] [--frame 0]
#   python print.py stream <w> <h> [--preset riso] [--spans a:b,...]  < rgb24 frames > rgb24 frames
import sys
import numpy as np
import cv2

PRESETS = {
    'riso': {'kind': 'riso', 'paper': (238, 230, 214), 'ink': (36, 34, 40), 'accent': (226, 62, 50), 'cell': 3.2, 'acell': 3.6, 'shift': (2, 3)},
    'riso-light': {'kind': 'riso', 'paper': (240, 234, 220), 'ink': (54, 52, 58), 'accent': (222, 70, 56), 'cell': 2.4, 'acell': 2.8, 'shift': (1, 1), 'lift': 1.3, 'grain': 1.6, 'tex': 0.1},
    'riso-blue': {'kind': 'riso', 'paper': (240, 237, 228), 'ink': (24, 52, 196), 'accent': (226, 62, 50), 'cell': 3.2, 'acell': 3.6, 'shift': (2, -3)},
    'dither': {'kind': 'dither', 'paper': (244, 241, 232), 'tones': [(20, 46, 196), (244, 241, 232)], 'pixel': 2},
    'gameboy': {'kind': 'dither', 'paper': (155, 188, 15), 'tones': [(15, 56, 15), (48, 98, 48), (139, 172, 15), (155, 188, 15)], 'pixel': 3},
}
DARK = 0.42   # a span this dark on average is not printed (stream mode)
BAYER8 = np.array([[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26], [12, 44, 4, 36, 14, 46, 6, 38],
                   [60, 28, 52, 20, 62, 30, 54, 22], [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
                   [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]], np.float32) / 64 + 1 / 128


class Print:
    def __init__(self, w, h, p, seed=3):
        self.w, self.h, self.p = w, h, p
        rng = np.random.default_rng(seed)
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)

        def screen(cell, ang):
            a = np.deg2rad(ang)
            u = (xx * np.cos(a) + yy * np.sin(a)) / cell
            v = (-xx * np.sin(a) + yy * np.cos(a)) / cell
            return np.hypot(u - np.round(u), v - np.round(v)) / 0.7071
        if p['kind'] == 'riso':
            self.dk = screen(p['cell'], 45)
            self.da = screen(p['acell'], 15)
        else:
            px = p['pixel']
            hy, hx = h // px + 1, w // px + 1
            self.th = np.tile(BAYER8, (hy // 8 + 1, hx // 8 + 1))[:hy, :hx]
        # ink texture: a few fixed fields, cycled (the print boils a little, like stop motion)
        self.tex = [1 - p.get('tex', 0.2) * cv2.GaussianBlur(rng.random((h, w)).astype(np.float32), (0, 0), 1.2) for _ in range(3)]
        self.grain = [rng.normal(0, p.get('grain', 3), (h, w, 1)).astype(np.float32) for _ in range(3)]
        self.paper = np.array(p['paper'], np.float32)

    def frame(self, rgb, i=0):
        p, h, w = self.p, self.h, self.w
        f = rgb.astype(np.float32)
        lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255
        k = (i // 3) % 3
        if p['kind'] == 'riso':
            # black plate: the darks, a little contrast; red plate: only what is really red (a beige is not)
            lum = np.clip((lum - 0.06) / 0.86, 0, 1) ** (1 / p.get('lift', 1.0))
            r, g, b = f[..., 0], f[..., 1], f[..., 2]
            red = np.clip((r - np.maximum(g, b)) / 120, 0, 1) * np.clip(r / 200, 0, 1)
            red = np.clip((red - 0.22) / 0.5, 0, 1)
            red = np.maximum(red, cv2.dilate(red, np.ones((3, 3), np.uint8)) * 0.9)
            # where the red ink goes the black stays off (a red printed over black is mud)
            kp = (self.dk < np.sqrt((1 - lum) * (1 - 0.85 * red)) * 1.02).astype(np.float32)
            ap = (self.da < np.sqrt(red) * 1.02).astype(np.float32)
            kp = cv2.GaussianBlur(kp, (0, 0), 0.6) * self.tex[k]
            ap = np.roll(cv2.GaussianBlur(ap, (0, 0), 0.7) * self.tex[(k + 1) % 3], p['shift'], (0, 1))
            out = np.ones((h, w, 3), np.float32) * self.paper
            out = out * (1 - ap[..., None] * (1 - np.array(p['accent'], np.float32) / self.paper))
            out = out * (1 - kp[..., None] * (1 - np.array(p['ink'], np.float32) / self.paper) * 0.96)
        else:
            px, tones = p['pixel'], np.array(p['tones'], np.float32)
            small = cv2.resize(lum, (w // px + 1, h // px + 1), interpolation=cv2.INTER_AREA)
            small = np.clip((small - 0.05) / 0.9, 0, 1)
            n = len(tones) - 1
            q = np.clip(np.floor(small * n + self.th), 0, n).astype(np.int32)
            out = tones[q]
            out = cv2.resize(out, (w + px, h + px), interpolation=cv2.INTER_NEAREST)[:h, :w]
            out = out * (0.94 + 0.06 * self.tex[k][..., None])
        out = out + self.grain[k]
        return np.clip(out, 0, 255).astype(np.uint8)


def opt(a, name, default):
    return a[a.index(name) + 1] if name in a else default


if __name__ == '__main__':
    a = sys.argv[1:]
    p = PRESETS[opt(a, '--preset', 'riso')]
    if a[0] == 'still':
        src = cv2.cvtColor(cv2.imread(a[1]), cv2.COLOR_BGR2RGB)
        res = Print(src.shape[1], src.shape[0], p).frame(src, int(opt(a, '--frame', 0)))
        cv2.imwrite(a[2], cv2.cvtColor(res, cv2.COLOR_RGB2BGR))
    else:
        w, h = int(a[1]), int(a[2])
        t = Print(w, h, p)
        spans = [tuple(int(x) for x in s.split(':')) for s in opt(a, '--spans', '0:999999999').split(',')]
        size = w * h * 3
        i = 0
        inp, outp = sys.stdin.buffer, sys.stdout.buffer
        # a span whose first frame is dark stays as it is: ink on a dark ground prints as a flat grey (hupo B27)
        dark = {}
        while True:
            buf = inp.read(size)
            if len(buf) < size:
                break
            span = next(((f, e) for f, e in spans if f <= i < e), None)
            if span is not None and span not in dark:
                dark[span] = np.frombuffer(buf, np.uint8).mean() / 255 < DARK
            if span is not None and not dark[span]:
                outp.write(t.frame(np.frombuffer(buf, np.uint8).reshape(h, w, 3), i).tobytes())
            else:
                outp.write(buf)
            i += 1
        outp.flush()
