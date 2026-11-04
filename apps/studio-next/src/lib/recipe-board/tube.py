# The `tube` medium: the whole finished frame shown on an old CRT, built the way the libretro CRT shaders
# (crt-lottes, crt-geom, crt-royale) do it, in linear light:
#   1. signal bandwidth: a little horizontal softness (the beam cannot switch instantly)
#   2. scanlines: the frame is drawn as N lines; each line is a gaussian beam whose width grows with
#      brightness, so bright lines fill the gap and dark lines leave black between them (fixed black
#      stripes are what makes fake CRT look fake)
#   3. phosphor mask: aperture grille (Trinitron / PVM stripes) or slot mask (arcade and TV), with the
#      lost brightness given back
#   4. halation and bloom: light scattered inside the glass, a wide glow around bright parts
#   5. convergence: red and blue beams a little off, more toward the edges
#   6. curvature: barrel-curved glass, rounded corners, edges falling off, a dark bezel around it
#   7. analogue noise smeared along the line, a slow hum band, a sync wobble; black is never black
# Lab: style-lab/c1-v2/crt.py (out/crt/sheet.jpg compares the presets on the opening six shots).
#
#   python tube.py still <in.png> <out.png> [--preset arcade] [--frame n]
#   python tube.py stream <w> <h> [--preset arcade] [--spans 0:132,200:270]
#       raw rgb24 frames on stdin -> raw rgb24 on stdout; frames outside the spans pass through
import sys
import numpy as np
import cv2

PRESETS = {
    # arcade cabinet: ~270-line picture, slot mask, curved glass, heavy glow
    'arcade': dict(lines=270, beam=(0.20, 0.40), mask='slot', mask_k=0.5, glow=0.22, halo=0.10,
                   conv=1.2, curve=0.04, corner=0.028, falloff=0.08, noise=0.012, hum=0.035, black=0.012, bezel=True),
    # broadcast monitor (Sony PVM): sharp, aperture grille, nearly flat
    'pvm': dict(lines=360, beam=(0.22, 0.40), mask='grille', mask_k=0.40, glow=0.12, halo=0.05,
                conv=0.6, curve=0.025, corner=0.025, falloff=0.04, noise=0.010, hum=0.0, black=0.008, bezel=False),
    # the feel at a lower cost to small text
    'soft': dict(lines=360, beam=(0.26, 0.48), mask='grille', mask_k=0.25, glow=0.14, halo=0.06,
                 conv=0.5, curve=0.035, corner=0.03, falloff=0.06, noise=0.012, hum=0.02, black=0.010, bezel=False),
}


class Tube:
    def __init__(self, w, h, p):
        self.w, self.h, self.p = w, h, p
        f32 = np.float32
        # a whole number of pixels per line, so the rows of one phase are a plain stride
        pitch = max(2, round(h / p['lines']))
        n = -(-h // pitch)
        self.n, self.pitch = n, pitch
        # beam profile as lookup tables: for each tap and phase, the light a line of value q (0-255,
        # display gamma) puts on that row; a brighter beam is wider
        q = np.arange(256, dtype=np.float64) / 255
        L = q ** 2.2
        wmin, wmax = p['beam']
        width = wmin + (wmax - wmin) * np.sqrt(L)
        self.taps = []
        for ph in range(pitch):
            y = (ph + 0.5) / pitch - 0.5
            for dk in (-1, 0, 1, 2):
                d = y - dk
                lut = (L * np.exp(-0.5 * (d / width) ** 2) / (width * 2.5066)).astype(f32)
                if lut.max() > 1e-4:
                    self.taps.append((ph, dk, lut.reshape(1, 256)))
        # phosphor mask, normalised so it does not darken the picture
        xx, yy = np.arange(w)[None, :], np.arange(h)[:, None]
        m = np.ones((h, w, 3), f32)
        lo = 1 - p['mask_k']
        for c in range(3):
            m[..., c] = np.where(xx % 3 == c, 1.0, lo)
        if p['mask'] == 'slot':
            gap = ((yy + ((xx // 3) % 2) * 2) % 4) == 0
            m *= np.where(gap, lo + (1 - lo) * 0.35, 1.0)[..., None]
        self.mask = m / m.mean()
        # convergence maps: red right, blue left, more at the edges
        cx = np.abs((np.arange(w, dtype=f32) / w - 0.5) * 2)
        self.my = np.repeat(np.arange(h, dtype=f32)[:, None], w, 1)
        self.conv = []
        if p['conv']:
            for c, s in ((0, 1), (2, -1)):
                off = s * p['conv'] * (0.5 + 0.5 * cx)
                self.conv.append((c, np.repeat((np.arange(w, dtype=f32) - off)[None], h, 0)))
        # sync wobble: per-line horizontal shift, row index map for the line image
        self.lx = np.repeat(np.arange(w, dtype=f32)[None], n, 0)
        self.ly = np.repeat(np.arange(n, dtype=f32)[:, None], w, 1)
        # a bank of line-smeared noise fields, picked per frame
        rng = np.random.default_rng(5)
        self.noise = []
        for _ in range(8 if p['noise'] else 0):
            nz = cv2.GaussianBlur(rng.normal(0, 1, (h, w)).astype(f32), (0, 0), sigmaX=2.5, sigmaY=0.01)
            self.noise.append((nz / (nz.std() + 1e-6))[..., None])
        # curved glass: warp maps, rounded corners, edge falloff
        self.warp = None
        if p['curve']:
            u = (np.arange(w, dtype=f32) / w - 0.5) * 2
            v = (np.arange(h, dtype=f32) / h - 0.5) * 2
            U, V = np.meshgrid(u, v)
            k = p['curve']
            su = U * (1 + k * V ** 2 * 1.6) / (1 + k * 0.9) * (1 + k)
            sv = V * (1 + k * U ** 2 * 1.6) / (1 + k * 0.9) * (1 + k)
            self.warp = (((su / 2 + 0.5) * w).astype(f32), ((sv / 2 + 0.5) * h).astype(f32))
            ax, ay = np.abs(su), np.abs(sv)
            cr = p['corner'] * 6
            dx = np.maximum(ax - (1 - cr * h / w), 0) / (cr * h / w)
            dy = np.maximum(ay - (1 - cr), 0) / cr
            self.inside = ((dx ** 2 + dy ** 2 <= 1) & (ax <= 1) & (ay <= 1))
            r2 = (U ** 2 + V ** 2).clip(0, 2)
            # the cards carry their own corner darkening (the reference's 15-25 L*): the glass adds only a thin
            # dark rim and a slight falloff, or the corners go far darker than the reference
            self.shade = (self.inside * np.clip((1 - np.maximum(ax, ay)) * 40, 0, 1) * (1 - p['falloff'] * r2 / 2)).astype(f32)[..., None]
        hum = np.arange(h, dtype=f32) / h
        self.hum_y = hum

    def frame(self, img, i=0):
        p, h, w, n, P = self.p, self.h, self.w, self.n, self.pitch
        rng = np.random.default_rng(i * 7919 + 11)
        # bandwidth blur and the line picture, both in display gamma (8 bit, fast)
        img = cv2.GaussianBlur(np.ascontiguousarray(img), (0, 0), sigmaX=1.1, sigmaY=0.01)
        lines = cv2.resize(img, (w, n), interpolation=cv2.INTER_AREA)
        if p['noise']:
            shift = rng.normal(0, 0.25, n).astype(np.float32)[:, None]
            lines = cv2.remap(lines, self.lx + shift, self.ly, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        pad = np.concatenate([lines[:1], lines, lines[-1:], lines[-1:]])  # index k+1 is line k
        out = np.zeros((n * P, w, 3), np.float32)
        for ph, dk, lut in self.taps:
            src = pad[1 + dk: 1 + dk + n]
            out[ph::P] += cv2.LUT(src, lut)
        lin = cv2.multiply(out[:h], self.mask)
        # halation (wide, computed small) and bloom (near)
        small = cv2.resize(lin, (w // 4, h // 4), interpolation=cv2.INTER_AREA)
        halo = cv2.resize(cv2.GaussianBlur(small, (0, 0), 10), (w, h), interpolation=cv2.INTER_LINEAR)
        half = cv2.resize(lin, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
        glow = cv2.resize(cv2.GaussianBlur(half, (0, 0), 3.5), (w, h), interpolation=cv2.INTER_LINEAR)
        # a mostly light frame (a page) would wash out under full glow: glow eases off as the frame gets lighter
        k = float(np.clip(1.25 - small.mean() * 1.6, 0.35, 1.0))
        lin = lin + halo * (p['halo'] * k) + glow * (p['glow'] * k)
        for c, mx in self.conv:
            lin[..., c] = cv2.remap(lin[..., c], mx, self.my, cv2.INTER_LINEAR)
        lin += p['black']
        if self.noise:
            nz = self.noise[i % len(self.noise)]
            nz = np.roll(nz, int(rng.integers(0, h)), axis=0)
            lin = lin * (1 + p['noise'] * 2.5 * nz) + p['noise'] * 0.5 * nz
        if p['hum']:
            lin *= (1 + p['hum'] * np.sin((self.hum_y + i * 0.013) * 2 * np.pi))[:, None, None]
        img = cv2.pow(np.clip(lin, 0, 1), 1 / 2.3)
        if self.warp:
            img = cv2.remap(img, *self.warp, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0) * self.shade
            if p['bezel']:
                bez = 0.035 + cv2.GaussianBlur(cv2.resize(img, (w // 4, h // 4)), (0, 0), 6) * 0.35
                bez = cv2.resize(bez, (w, h))
                img = np.where(self.inside[..., None], img, bez)
        return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def opt(a, name, default):
    return a[a.index(name) + 1] if name in a else default


if __name__ == '__main__':
    a = sys.argv[1:]
    p = PRESETS[opt(a, '--preset', 'arcade')]
    if a[0] == 'still':
        src = cv2.cvtColor(cv2.imread(a[1]), cv2.COLOR_BGR2RGB)
        res = Tube(src.shape[1], src.shape[0], p).frame(src, int(opt(a, '--frame', 0)))
        cv2.imwrite(a[2], cv2.cvtColor(res, cv2.COLOR_RGB2BGR))
    else:
        w, h = int(a[1]), int(a[2])
        t = Tube(w, h, p)
        spans = [tuple(int(x) for x in s.split(':')) for s in opt(a, '--spans', '0:999999999').split(',')]
        size = w * h * 3
        i = 0
        inp, outp = sys.stdin.buffer, sys.stdout.buffer
        while True:
            buf = inp.read(size)
            if len(buf) < size:
                break
            if any(f <= i < e for f, e in spans):
                outp.write(t.frame(np.frombuffer(buf, np.uint8).reshape(h, w, 3), i).tobytes())
            else:
                outp.write(buf)
            i += 1
        outp.flush()
