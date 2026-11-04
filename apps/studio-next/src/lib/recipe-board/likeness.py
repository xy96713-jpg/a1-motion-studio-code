# What a frame shows, set against the reference's frame at the same moment (user, 2026-10-22: 为什么素材对不上；你找那么
# 差的视频素材哪里来的). The breakdown's measures are of form (camera, light, colour, type): a trading room's LED ticker
# stood in for the reference's TV board of share prices and a K-line chart and passed them all (open-S2, S17). Here the
# two frames are compared by what is in them: OpenCLIP image embeddings (ViT-B-32, laion2b; the archive's registered
# model, weights under .codex-artifacts/runtime/openclip). Plain image likeness was too loose to judge by (our presenter
# against the reference's: .62; the office against the K-line chart: .54), so each frame is named from a fixed list of
# kinds of picture (zero-shot) and the kinds' groups are compared (breakdown.mjs showsErrors).
#   python likeness.py <pairs.json> <out.json>
#   pairs: [{ id, a: { video, t } | { image }, b: { video, t } | { image } }]
#   -> { id: { a: [kind, group, p], b: [kind, group, p], cos } }
#   python likeness.py --embed <items.json> <out.json>   (items: [{ id, image | video, t }] -> { id: vector })
import json, os, sys, warnings
warnings.filterwarnings('ignore')
os.environ['HF_HUB_OFFLINE'] = '1'
import cv2, numpy as np, torch, open_clip
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.environ.get('A1_OPENCLIP_CACHE') or os.path.join(HERE, '../../../../../.codex-artifacts/runtime/openclip')
SUB = .86   # the subtitle band is left out (the reference burns its subtitles in; ours has none)

# kinds of picture, by group: a frame named in one group with confidence is not the other group's picture
KINDS = [('person', 'a man talking to camera at a desk with a microphone'), ('person', 'a portrait photo of a person'),
         ('person', 'a person giving a speech on stage'), ('person', 'a politician speaking in an office'),
         ('data', 'a table of stock prices on a TV finance channel'), ('data', 'a candlestick stock chart'),
         ('data', 'a line chart of a share price'), ('data', 'an infographic with company names and numbers'),
         ('page', 'a news article web page with text'), ('page', 'a close-up of text on a web page'), ('page', 'a wikipedia page'),
         ('mark', 'a company logo'), ('mark', 'app icons'), ('type', 'large title lettering'),
         ('place', 'an office room with an LED stock ticker'), ('place', 'a city street'), ('place', 'a building exterior'),
         ('thing', 'a computer chip'), ('thing', 'a rocket on a launch pad'), ('thing', 'a laptop on a desk')]

def frame(x):
    if 'image' in x: f = cv2.imread(x['image'])
    else:
        cap = cv2.VideoCapture(x['video']); cap.set(cv2.CAP_PROP_POS_MSEC, x['t'] * 1000); ok, f = cap.read()
        if not ok: return None
    f = f[: int(f.shape[0] * SUB)]
    return Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))

def embed(items, outp, model, pre, dev):
    # --embed: one vector a picture (the technique library looks sub-shots up by them): [{ id, image | video, t }] -> { id: [512] }
    out = {}
    for x in items:
        f = frame(x)
        if f is None: out[x['id']] = None; continue
        with torch.inference_mode():
            e = model.encode_image(pre(f)[None].to(dev)); e = e / e.norm(dim=-1, keepdim=True)
        out[x['id']] = [round(float(v), 4) for v in e[0].cpu().numpy()]
    json.dump(out, open(outp, 'w'))

# a real person's picture must be a photograph (house rule: real people are never generated): a talent clip of Ilya
# Sutskever was an AI illustration and passed as his portrait. -> { id: p_drawn }
DRAWN = ['a photograph of a real person', 'a candid photo of a person', 'a digital illustration of a person', 'a cartoon or anime drawing of a person', 'a 3D render of a person', 'a painting of a person']
def drawn(items, outp, model, pre, dev, tok):
    out = {}
    with torch.inference_mode():
        T = model.encode_text(tok(DRAWN).to(dev)); T = T / T.norm(dim=-1, keepdim=True)
        for x in items:
            f = frame(x)
            if f is None: out[x['id']] = None; continue
            e = model.encode_image(pre(f).unsqueeze(0).to(dev)); e = e / e.norm(dim=-1, keepdim=True)
            pr = (100 * e @ T.T).softmax(-1)[0].cpu().numpy()
            out[x['id']] = round(float(pr[2:].sum()), 3)
    json.dump(out, open(outp, 'w'))

# a made model looked at before a chapter uses it (chapter.mjs modelCheck; the user 2026-10-28: 规范 高效的流程 — the Suez
# sandbank came out as a carved stone block and was found only by the taste reviewers, rounds later): each view of it
# (blender/model_sheet.py) named between what it was asked to be and the shapeless things a failed model reads as.
#   python likeness.py --model <items.json> <out.json>   items: [{ id, what, images: [...] }] -> { id: { p: [...], top: [...] } }
BLOBS = ['a grey rock', 'a stone block', 'a lump of clay', 'a pile of rubble', 'a shapeless blob', 'an abstract sculpture', 'a crumpled piece of paper']
def model_views(items, outp, model, pre, dev, tok):
    out = {}
    with torch.inference_mode():
        for x in items:
            what = x['what'].split(',')[0].split(':')[0].strip()[:160]
            labels = [what] + [b for b in BLOBS if not any(w in what.lower() for w in b.split()[-1:])]
            T = model.encode_text(tok(labels).to(dev)); T = T / T.norm(dim=-1, keepdim=True); p, top = [], []
            for im in x['images']:
                f = Image.open(im).convert('RGB') if os.path.exists(im) else None   # (the whole view: no subtitle band to leave out)
                if f is None: continue
                e = model.encode_image(pre(f).unsqueeze(0).to(dev)); e = e / e.norm(dim=-1, keepdim=True)
                pr = (100 * e @ T.T).softmax(-1)[0].cpu().numpy(); p.append(round(float(pr[0]), 3)); top.append(bool(pr[0] >= pr.max()))
            out[x['id']] = {'what': what, 'p': p, 'top': top}
    json.dump(out, open(outp, 'w'))

def main():
    if sys.argv[1] == '--model':
        dev = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
        model, _, pre = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k', cache_dir=CACHE)
        return model_views(json.load(open(sys.argv[2])), sys.argv[3], model.eval().to(dev), pre, dev, open_clip.get_tokenizer('ViT-B-32'))
    if sys.argv[1] == '--drawn':
        dev = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
        model, _, pre = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k', cache_dir=CACHE)
        return drawn(json.load(open(sys.argv[2])), sys.argv[3], model.eval().to(dev), pre, dev, open_clip.get_tokenizer('ViT-B-32'))
    if sys.argv[1] == '--embed':
        dev = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
        model, _, pre = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k', cache_dir=CACHE)
        return embed(json.load(open(sys.argv[2])), sys.argv[3], model.eval().to(dev), pre, dev)
    pairs, outp = json.load(open(sys.argv[1])), sys.argv[2]
    dev = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    model, _, pre = open_clip.create_model_and_transforms('ViT-B-32', pretrained='laion2b_s34b_b79k', cache_dir=CACHE)
    model = model.eval().to(dev); tok = open_clip.get_tokenizer('ViT-B-32'); out = {}
    with torch.inference_mode():
        T = model.encode_text(tok([k for _, k in KINDS]).to(dev)); T = T / T.norm(dim=-1, keepdim=True)
    for p in pairs:
        a, b = frame(p['a']), frame(p['b'])
        if a is None or b is None: out[p['id']] = None; continue
        with torch.inference_mode():
            e = model.encode_image(torch.stack([pre(a), pre(b)]).to(dev)); e = e / e.norm(dim=-1, keepdim=True)
            pr = (100 * e @ T.T).softmax(-1).cpu().numpy()
        name = lambda q: [KINDS[int(q.argmax())][1], KINDS[int(q.argmax())][0], round(float(q.max()), 2)]
        out[p['id']] = dict(a=name(pr[0]), b=name(pr[1]), cos=round(float(e[0] @ e[1]), 3))
    json.dump(out, open(outp, 'w'), indent=1)

main()
