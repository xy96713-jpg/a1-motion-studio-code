#!/usr/bin/env node
// Contrast audit for material titles: node scripts/audit-contrast.mjs --png a.png --box x,y,w,h --label "47%" [--large]
import { spawnSync } from 'node:child_process';
import { contrastRatio, contrastErrors, MIN } from '../apps/studio-next/src/lib/recipe-board/contrast.mjs';

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const png = get('png'), label = get('label', 'type'), large = args.includes('--large');
const box = (get('box') || '').split(',').map(Number);
if (!png || box.length !== 4) { console.error('usage: --png <file> --box x,y,w,h [--label s] [--large]'); process.exit(2); }
const py = String.raw`
from PIL import Image
import numpy as np, sys, json
im = np.asarray(Image.open(sys.argv[1]).convert('L'))
x, y, w, h = map(int, sys.argv[2].split(','))
c = im[max(0,y):y+h, max(0,x):x+w]
if c.size < 100:
    print(json.dumps(None))
else:
    p5, p95 = np.percentile(c, [5, 95])
    print(json.dumps([float(p5), float(p95)]))
`;
const r = spawnSync('python3', ['-c', py, png, box.join(',')], { encoding: 'utf8' });
let v = null; try { v = JSON.parse(r.stdout); } catch {}
if (!v) { console.error('could not read ' + png); process.exit(3); }
const ratio = contrastRatio([v[0], v[0], v[0]], [v[1], v[1], v[1]]);
const e = contrastErrors([{ label, ratio, large }]);
console.log(JSON.stringify({ png, label, p5: v[0], p95: v[1], ratio: Math.round(ratio * 100) / 100, need: large ? MIN.large : MIN.body, pass: !e.length }, null, 1));
process.exit(e.length ? 1 : 0);
