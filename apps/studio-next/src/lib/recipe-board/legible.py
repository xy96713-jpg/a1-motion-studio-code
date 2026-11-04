# Can a word set in a house face be read as itself? Each (face, word) is drawn large on the film's dark ground; the
# words are read back by Vision (ocrlegible.swift) and a word whose characters come back under LEGIBLE_MIN is not
# legible in that face. スミカク drew 心 as |C and read 核心序列 as 核心原刵 (paperclip-138-full B10, the user: 不像中国字).
# usage: legible.py <out dir> <json [[font file, word], ...]>  -> writes <out dir>/<i>.png, one per pair
import sys, json, os
from PIL import Image, ImageDraw, ImageFont
out, pairs = sys.argv[1], json.loads(open(sys.argv[2], encoding='utf-8').read())
os.makedirs(out, exist_ok=True)
fonts = {}
for i, (f, w) in enumerate(pairs):
    F = fonts.get(f) or fonts.setdefault(f, ImageFont.truetype(f, 120))
    W = int(F.getlength(w)) + 80
    im = Image.new('RGB', (max(W, 200), 200), (25, 25, 25)); ImageDraw.Draw(im).text((40, 30), w, font=F, fill=(235, 232, 223)); im.save(os.path.join(out, f'{i}.png'))
