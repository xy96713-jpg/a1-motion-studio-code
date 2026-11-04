#!/usr/bin/env python3
# Is a material good enough for the frame it is wanted for (the user 2026-10-27: 接下来做什么 — the materials step found a
# picture, not a usable one: Suez's opening satellite image held the ship in a few pixels, the release's photo 900 px
# wide blown up three times with a pale frame round it; the stills review scored them 2 whatever the design did).
#   size     its pixels against a full frame (1280 x 720 at least to fill one)
#   border   a uniform strip round the picture (a page's margin, a letterbox): the box inside it
#   subject  how surely it shows what it is for (OpenCLIP zero-shot: the subject against the things a bad pick shows
#            instead — fields from above, a blur, a map, a page of text), on the 16:9 crop the frame takes
# usage: matquality.py <items.json> <out.json>   items: [{ id, file, subject }]  -> { id: { w, h, full, border, subject } }
import json, os, sys, warnings
warnings.filterwarnings('ignore')
os.environ['HF_HUB_OFFLINE'] = '1'
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FULL = (1280, 720)
NOT = ['an aerial photo of farmland and fields', 'a blurry grey texture', 'a map', 'a page of text', 'an empty sky', 'a city seen from above']

def border(im):
    a = np.asarray(im.convert('L').resize((320, max(1, round(320 * im.height / im.width)))), np.float32) / 255
    h, w = a.shape
    def run(lines):
        n = 0
        for ln in lines:
            if ln.std() < 0.035: n += 1   # a line of one tone: margin, letterbox or frame
            else: break
        return n
    top = run(a[i] for i in range(h // 4)); bottom = run(a[h - 1 - i] for i in range(h // 4))
    left = run(a[:, i] for i in range(w // 4)); right = run(a[:, w - 1 - i] for i in range(w // 4))
    k = im.width / w
    return [round(left * k), round(top * k), round(im.width - right * k), round(im.height - bottom * k)] if (top or bottom or left or right) else None

def frame_crop(im):
    w, h = im.size; r = 16 / 9
    if w / h > r: nw = h * r; return im.crop(((w - nw) / 2, 0, (w + nw) / 2, h))
    nh = w / r; return im.crop((0, (h - nh) / 2, w, (h + nh) / 2))

def main():
    items = json.load(open(sys.argv[1])); out = {}
    model = None
    for it in items:
        try: im = Image.open(it['file']).convert('RGB')
        except Exception as e: out[it['id']] = {'error': str(e)}; continue
        b = border(im); inner = im.crop(tuple(b)) if b else im
        r = {'w': inner.width, 'h': inner.height, 'full': inner.width >= FULL[0] and inner.height >= FULL[1], 'border': b}
        if it.get('subject'):
            try:
                if model is None:
                    import torch, open_clip
                    cache = os.environ.get('A1_OPENCLIP_CACHE') or os.path.join(HERE, '../../../../../.codex-artifacts/runtime/openclip')
                    model, _, pre = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k', cache_dir=cache); tok = open_clip.get_tokenizer('ViT-B-32'); model.eval()
                import torch
                texts = [it['subject']] + NOT
                with torch.no_grad():
                    f = model.encode_image(pre(frame_crop(inner)).unsqueeze(0)); t = model.encode_text(tok(texts))
                    f /= f.norm(dim=-1, keepdim=True); t /= t.norm(dim=-1, keepdim=True)
                    p = (40 * f @ t.T).softmax(dim=-1)[0].tolist()   # (a gentle temperature: at 100 a specific search phrase took every picture to 1)
                    cos0 = float(f @ t[0])
                r['subject'] = round(p[0], 3); r['instead'] = texts[1 + int(np.argmax(p[1:]))] if max(p[1:]) > p[0] else None
                # where in the picture the subject is: 16:9 windows at three scales scored the same way; the best is the
                # crop the frame should take (a ship in a few pixels of a wide satellite scene, framed whole, read as fields)
                W, H = inner.size; best = (cos0, [0, 0, W, H])   # (by the subject's raw likeness: the window nearest it)
                for frac in (0.5, 0.33, 0.22):
                    ww = W * frac; hh = ww * 9 / 16
                    if hh > H: hh = H; ww = hh * 16 / 9
                    step = ww / 2
                    for y0 in np.arange(0, max(1, H - hh + 1), max(1, hh / 2)):
                        for x0 in np.arange(0, max(1, W - ww + 1), max(1, step)):
                            if ww < 320: continue
                            c = inner.crop((x0, y0, x0 + ww, y0 + hh))
                            with torch.no_grad():
                                g = model.encode_image(pre(c).unsqueeze(0)); g /= g.norm(dim=-1, keepdim=True); cq = float(g @ t[0])
                            if cq > best[0] + 0.01: best = (cq, [round(x0), round(y0), round(x0 + ww), round(y0 + hh)])
                bx = best[1]; ox, oy = (b[0], b[1]) if b else (0, 0)
                r['box'] = [bx[0] + ox, bx[1] + oy, bx[2] + ox, bx[3] + oy]; r['boxLike'] = round(best[0], 3); r['like'] = round(cos0, 3); r['boxFull'] = (bx[2] - bx[0]) >= 1100   # (blown up at most ~1.75x to fill a frame)
            except Exception as e: r['subjectError'] = str(e)[:200]
        out[it['id']] = r
    json.dump(out, open(sys.argv[2], 'w'), indent=1)

if __name__ == '__main__': main()
