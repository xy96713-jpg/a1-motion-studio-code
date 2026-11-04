# Display plates for the film's high points (display.mjs; lab: style-lab/c1-v2): a generated photograph of
# a real display (an old CRT monitor, a trading-floor ticker board) whose screen was drawn as flat chroma
# green; the real material is warped into that screen in perspective, or the line's words are lit on an LED
# dot matrix (words set by code, never by the image model); then the screen's light spills onto the
# housing and a little film grain goes over the whole.
#
#   python display.py key <plate.png> <material> <out.png> [--led] [--crop x y w h]
#   python display.py led <font.ttf> <out.png> '<json: {"small": [[text, "amber"|"red"], ...], "big": [text, "red"]}>'
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter


def coeffs(dst, src):
    A, B = [], []
    for (X, Y), (u, v) in zip(dst, src):
        A += [[X, Y, 1, 0, 0, 0, -u * X, -u * Y], [0, 0, 0, X, Y, 1, -v * X, -v * Y]]
        B += [u, v]
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def key(plate_path, mat_path, out_path, led=False, crop=None, invert=False):
    plate = Image.open(plate_path).convert('RGB').resize((1920, 1080), Image.LANCZOS)
    mat = Image.open(mat_path).convert('RGB')
    if crop:
        x, y, w, h = crop
        W, H = mat.size
        mat = mat.crop((int(x * W), int(y * H), int((x + w) * W), int((y + h) * H)))
    if invert and np.asarray(mat.convert('L')).mean() > 140:
        # light page -> phosphor text on a dark screen, warm white like an old monochrome monitor
        m0 = 255 - np.asarray(mat).astype(float)
        lum = m0.mean(-1, keepdims=True)
        m0 = lum * np.array([1.0, 0.93, 0.78]) * 1.05 + (m0 - lum) * 0.6
        mat = Image.fromarray(m0.clip(0, 255).astype('uint8'))
    a = np.asarray(plate).astype(int)
    g = (a[..., 1] > 150) & (a[..., 0] < 120) & (a[..., 2] < 120)
    ys, xs = np.nonzero(g)
    if len(xs) < 1000:
        raise SystemExit('no chroma screen found in the plate')
    s, d = xs + ys, xs - ys
    quad = [(xs[s.argmin()], ys[s.argmin()]), (xs[d.argmax()], ys[d.argmax()]), (xs[s.argmax()], ys[s.argmax()]), (xs[d.argmin()], ys[d.argmin()])]
    mw, mh = mat.size
    pad = 6
    src = [(0, 0), (mw, 0), (mw, mh), (0, mh)]
    dst = [(quad[0][0] - pad, quad[0][1] - pad), (quad[1][0] + pad, quad[1][1] - pad), (quad[2][0] + pad, quad[2][1] + pad), (quad[3][0] - pad, quad[3][1] + pad)]
    m = np.asarray(mat).astype(float)
    if not led:
        # a CRT: faint scanlines and a soft glow in the glass
        lines = (np.arange(mh) % 4 < 2).astype(float)[:, None, None] * 0.12
        m = m * (1 - lines)
        bloom = np.asarray(Image.fromarray(m.clip(0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(6))).astype(float)
        m = (m * 0.85 + bloom * 0.25).clip(0, 255)
    screen = Image.fromarray(m.astype('uint8')).transform((1920, 1080), Image.PERSPECTIVE, coeffs(dst, src), Image.BICUBIC)
    mask = Image.fromarray((g * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))
    cx, cy = np.mean([p[0] for p in quad]), np.mean([p[1] for p in quad])
    yy, xx = np.mgrid[0:1080, 0:1920]
    sw, sh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    r = np.hypot((xx - cx) / sw * 2, (yy - cy) / sh * 2)
    fall = (1 - 0.35 * np.clip(r - 0.55, 0, 1) ** 1.2)[..., None]
    glare = (np.exp(-(((xx - (cx - sw * 0.25)) / 260) ** 2 + ((yy - (cy - sh * 0.3)) / 120) ** 2)) * 38)[..., None]
    sc = (np.asarray(screen).astype(float) * fall + glare * (0.3 if led else 1)).clip(0, 255)
    out = np.asarray(plate).astype(float)
    k = (np.asarray(mask).astype(float) / 255)[..., None]
    out = out * (1 - k) + sc * k
    fr = (out[..., 1] > out[..., 0] + 25) & (out[..., 1] > out[..., 2] + 25)
    out[fr, 1] = (out[fr, 0] + out[fr, 2]) / 2
    # the screen's light spills onto the housing and the wall, then grain
    im = Image.fromarray(out.clip(0, 255).astype('uint8'))
    bright = Image.fromarray(np.where(out.max(-1, keepdims=True) > 150, out, 0).clip(0, 255).astype('uint8'))
    spill = np.asarray(bright.filter(ImageFilter.GaussianBlur(45))).astype(float)
    near = np.asarray(bright.filter(ImageFilter.GaussianBlur(12))).astype(float)
    out = out + spill * 0.55 + near * 0.35
    out += np.random.default_rng(3).normal(0, 6, out.shape)
    Image.fromarray(out.clip(0, 255).astype('uint8')).save(out_path)
    print(json.dumps({'quad': [[int(x), int(y)] for x, y in quad]}))


COLORS = {'amber': (255, 168, 40), 'red': (255, 46, 30), 'green': (90, 255, 120)}


def led(font, out_path, spec):
    # 300 x 50 cells, 8 px a cell: small lines stacked on the left, the big figure filling the rest
    CW, CH, P = 300, 50, 8
    canvas = Image.new('RGB', (CW, CH), (0, 0, 0))
    d = ImageDraw.Draw(canvas)
    # small labels at 16 cells: at 12 a Chinese glyph's strokes run together on the dots
    smalls = spec.get('small', [])[:2]
    # a single label is drawn at 24 cells (two stacked at 16 ran their strokes together)
    SMALL = 24 if len(smalls) == 1 else 16
    small = ImageFont.truetype(font, SMALL)
    # the figure comes first: when the labels leave it no room at a readable size, the labels go
    big_text = spec.get('big', ['', 'red'])[0]
    probe = ImageDraw.Draw(Image.new('RGB', (1, 1)))
    label_w = max([probe.textlength(t, font=small) for t, _ in smalls] or [0])
    if smalls and probe.textlength(big_text, font=ImageFont.truetype(font, 28)) > CW - 6 - (6 + label_w + 10) - 6:
        smalls = []
    left = 6
    sw = 0
    step = SMALL + 6
    y0 = (CH - step * len(smalls)) // 2 + 3 if smalls else 0
    for i, (text, color) in enumerate(smalls):
        d.text((left, y0 + i * step), text, font=small, fill=COLORS.get(color, COLORS['amber']))
        sw = max(sw, d.textlength(text, font=small))
    text, color = spec.get('big', ['', 'red'])
    x = int(left + sw + (10 if smalls else 0))
    size = 38
    while size > 14:
        f = ImageFont.truetype(font, size)
        if d.textlength(text, font=f) <= CW - x - 6:
            break
        size -= 2
    f = ImageFont.truetype(font, size)
    d.text((x, (CH - size) // 2 - 1), text, font=f, fill=COLORS.get(color, COLORS['red']))
    cells = np.asarray(canvas).astype(float) / 255
    cells = (cells > 0.35) * cells
    rng = np.random.default_rng(7)
    spread = 0.88 + 0.24 * rng.random((CH, CW, 1))
    yy, xx = np.mgrid[0:P, 0:P]
    dot = np.clip(1 - (np.hypot(xx - (P - 1) / 2, yy - (P - 1) / 2) / (P * 0.36)) ** 3, 0, 1)
    lit = np.maximum(cells * spread, np.array([0.05, 0.035, 0.03]))
    img = np.repeat(np.repeat(lit, P, 0), P, 1) * np.tile(dot, (CH, CW))[..., None]
    im = Image.fromarray((img.clip(0, 1) * 255).astype('uint8'))
    glow = np.asarray(im.filter(ImageFilter.GaussianBlur(10))).astype(float)
    wide = np.asarray(im.filter(ImageFilter.GaussianBlur(28))).astype(float)
    out = np.asarray(im).astype(float) + glow * 0.9 + wide * 0.5
    out += rng.normal(0, 5, out.shape)
    Image.fromarray(out.clip(0, 255).astype('uint8')).save(out_path)


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'key':
        crop = [float(v) for v in a[a.index('--crop') + 1:a.index('--crop') + 5]] if '--crop' in a else None
        key(a[1], a[2], a[3], led='--led' in a, crop=crop, invert='--invert' in a)
    elif a[0] == 'led':
        led(a[1], a[2], json.loads(a[3]))
