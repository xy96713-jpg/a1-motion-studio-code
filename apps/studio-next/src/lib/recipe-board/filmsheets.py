# The film review's overview sheets (prompts/film-review.md): one frame a second, 10x6 cells a sheet, a timecode in each.
#   python3 filmsheets.py <video> <out dir> <frames a second of the video>
# Frames are pulled one by one and laid out here: ffmpeg's fps+tile made the first sheet of a 361 s film begin at 28 s
# (2026-10-22: the reviewer saw no B01-B04 and pairs with the reference were 28 s apart).
import sys, os, subprocess, shutil, glob
from PIL import Image, ImageDraw
v, out, rate = sys.argv[1], sys.argv[2], float(sys.argv[3])
tmp = out + '/_f'; shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', v, '-vf', f"select='not(mod(n\\,{int(rate)}))',scale=320:-2", '-vsync', 'vfr', f'{tmp}/%05d.png'], check=True)
fs = sorted(glob.glob(tmp + '/*.png'))
for k in range(0, len(fs), 60):
    cells = fs[k:k + 60]; w, h = Image.open(cells[0]).size; sheet = Image.new('RGB', (w * 10, h * 6))
    for i, f in enumerate(cells):
        im = Image.open(f).convert('RGB'); d = ImageDraw.Draw(im); s = k + i; d.rectangle([0, 0, 64, 16], fill=(0, 0, 0)); d.text((3, 2), f'{s // 60}:{s % 60:02d}', fill=(255, 220, 0))
        sheet.paste(im, ((i % 10) * w, (i // 10) * h))
    sheet.save(f'{out}/sheet-{k // 60 + 1:02d}.jpg', quality=80)
shutil.rmtree(tmp)
print(len(fs), 'seconds')
