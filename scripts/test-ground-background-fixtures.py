"""Offline pixel fixtures, not design/render substitutes; exercise the real ground CLI."""
import json
import pathlib
import subprocess
import sys
from PIL import Image, ImageDraw

root, dest = map(pathlib.Path, sys.argv[1:3])
dest.mkdir(parents=True, exist_ok=True)
files = {}
for name, base, texture in [
    ('neutral-content', (28, 28, 28), False),
    ('tinted-content', (42, 29, 30), False),
    ('neutral-grain', (28, 28, 28), True),
    ('tinted-grain', (42, 29, 30), True),
    ('neutral-gradient', (28, 28, 28), False),
]:
    im = Image.new('RGB', (960, 540), base)
    if texture or name.endswith('gradient'):
        im.putdata([tuple(max(0, min(255, c + ((x * 17 + y * 13) % 7 - 3 if texture else round(4 * x / 959) - 2))) for c in base)
                    for y in range(540) for x in range(960)])
    draw = ImageDraw.Draw(im)
    for x in range(60, 451, 40):
        for y in range(85, 225, 35):
            draw.rectangle((x, y, x + 34, y + 29), fill=(242, 213, 60))
    draw.rectangle((555, 100, 730, 180), fill=(232, 230, 217))
    files[name] = dest / (name + '.png')
    im.save(files[name])
# Inconsistent large regions must not be collapsed into a fictional neutral average.
im = Image.new('RGB', (960, 540))
draw = ImageDraw.Draw(im)
for box, color in [((0, 0, 479, 269), '#802020'), ((480, 0, 959, 269), '#208020'),
                   ((0, 270, 479, 539), '#202080'), ((480, 270, 959, 539), '#808020')]:
    draw.rectangle(box, fill=color)
files['ambiguous'] = dest / 'ambiguous.png'
im.save(files['ambiguous'])
# High-frequency opposing hues must not average into a fictional neutral surface.
import random
rng = random.Random(31)
im = Image.new('RGB', (960, 540))
im.putdata([rng.choice([(50, 6, 28), (6, 50, 28)]) for _ in range(960 * 540)])
files['nonflat-texture'] = dest / 'nonflat-texture.png'
im.save(files['nonflat-texture'])
files['real-B03'] = root / 'work/banana-full-stills-production-20261030/G2/runtime/work/recipe-board-v1/projects/banana-static-b03/out/chapters/STILLS/key-1-B03.png'
result = subprocess.run([sys.executable, str(root / 'apps/studio-next/src/lib/recipe-board/ground.py'), *map(str, files.values())], capture_output=True, text=True, check=True)
rows = [json.loads(line) for line in result.stdout.splitlines()]
print(json.dumps(dict(zip(files, rows))))
