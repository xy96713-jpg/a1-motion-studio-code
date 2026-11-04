#!/usr/bin/env python3
"""Reject generated design images that contain accidental text/logos or are too weak."""
import argparse, json, os, subprocess, sys
from PIL import Image, ImageStat

def ocr(paths):
    r = subprocess.run(['swift', os.path.join(os.path.dirname(__file__), 'ocr-image.swift')] + paths, capture_output=True, text=True, timeout=180)
    try: return json.loads(r.stdout)
    except Exception: return []

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', required=True)
    ap.add_argument('--json-out', default='')
    a = ap.parse_args()
    files = sorted(os.path.join(a.dir, f) for f in os.listdir(a.dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')))
    rows = ocr(files) if files else []
    by = {r['path']: r for r in rows}
    errors = []
    for f in files:
        im = Image.open(f).convert('RGB'); w, h = im.size
        st = ImageStat.Stat(im.convert('L'))
        obs = by.get(f, {}).get('observations', [])
        texts = [o.get('text', '') for o in obs if float(o.get('confidence', 0)) >= 0.45 and len(o.get('text', '').strip()) >= 2]
        if w < 1280 or h < 720: errors.append(f + ': resolution too small ' + f'{w}x{h}')
        if st.stddev[0] < 6: errors.append(f + ': nearly blank (stddev %.1f)' % st.stddev[0])
        if texts: errors.append(f + ': accidental text/logo ' + ' | '.join(texts[:3]))
    out = {'contract': 'A1DesignImageQA/v1', 'dir': a.dir, 'images': files, 'errors': errors, 'ok': len(errors) == 0}
    if a.json_out: open(a.json_out, 'w').write(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0 if out['ok'] else 1
if __name__ == '__main__': sys.exit(main())
