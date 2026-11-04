// Labels: the plate under a word (a tag, a chip, an answer's board) is a generated, text-free paper prop, never a flat
// code rectangle (user 2026-10-23, of hupo-auto2 r1-S8's flat blocks: 这种设计的挺丑 排版有错误也 为什么不能生图来做什么的).
// The props are the `label` family of routing/props.json (generated once by imagegen, cached by prompt, shared with the
// chapters' images.prop_label_<name>), drawn in white so any film can use them: a plate is the film's colour multiplied
// by the paper's texture and cut to the paper's own edge (its alpha), so the outline, the creases, the torn ends are the
// picture's and the colour is the style's. Neighbouring plates take different members (plateCss(i)).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { cachedArt, generateArt } from './imagegen.mjs';

export const LABEL_FAMILY = 'label';
export function labelMembers(cfg) {
  const lib = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'props.json'), 'utf8')).families || [];
  const f = lib.find((x) => x.family === LABEL_FAMILY);
  return f ? Object.entries(f.members).map(([name, m]) => ({ name, prompt: typeof m === 'string' ? m : m.prompt, transparent: typeof m === 'object' && !!m.transparent, mask: typeof m === 'object' && !!m.mask })) : [];
}
// the art request of a member, as chapter.mjs prepareAssets makes it (the same key: one picture for both lines)
const request = (m) => ({ prompt: m.prompt, transparent: m.transparent });
// a member's picture cut to its paper (the transparent margin trimmed off), cached beside it
function trimmed(file) {
  const out = file.replace(/\.png$/, '-trim.png');
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(file).mtimeMs) return out;
  const code = `import cv2,sys\nim=cv2.imread(sys.argv[1],cv2.IMREAD_UNCHANGED)\nif im is None or im.ndim<3 or im.shape[2]<4:\n  cv2.imwrite(sys.argv[2],im);sys.exit(0)\na=im[:,:,3]>24;ys=a.any(1).nonzero()[0];xs=a.any(0).nonzero()[0]\nif not len(xs): cv2.imwrite(sys.argv[2],im);sys.exit(0)\ncv2.imwrite(sys.argv[2],im[ys[0]:ys[-1]+1,xs[0]:xs[-1]+1])`;
  const py = process.env.A1_PYTHON || path.join(path.dirname(new URL(import.meta.url).pathname), '../../../../../work/external-source-tool-canaries-v1/.venv/bin/python');
  const r = spawnSync(fs.existsSync(py) ? py : 'python3', ['-c', code, file, out], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(out) ? out : file;
}
// the members' pictures: [{ name, url, mask }]; generate: make the missing ones (one at a time, the imagegen lock),
// else only those already made (a page never waits on a generation it did not ask for)
export function labelPlates(cfg, { generate = false, log = () => {} } = {}) {
  const out = [];
  for (const m of labelMembers(cfg)) {
    let file = cachedArt(cfg, request(m));
    if (!file && generate) { try { file = generateArt(cfg, request(m), { log }).file; } catch (e) { log(`  label ${m.name}: ${String(e.message || e).split('\n')[0]}`); } }
    if (file) out.push({ name: m.name, url: pathToFileURL(trimmed(file)).href, mask: m.mask });
  }
  return out;
}
// each plate in each colour, made once (the paper multiplied by the colour, a stamp's ink the colour itself, its alpha
// kept) and cached beside the prop: a page cannot tint a picture cut to its own edge (a CSS mask is fetched in CORS mode
// and a file:// page gets nothing). colors: CSS hex colours; returns the plates with tints { '#rrggbb': url }
const hex6 = (c) => { const m = String(c || '').trim().toLowerCase().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/); if (!m) return null; const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]; return `#${h}`; };
export function tintPlates(plates, colors) {
  const want = [...new Set(colors.map(hex6).filter(Boolean))];
  const code = `import cv2,sys,json,numpy as np\nfor f,mask,col,out in json.loads(sys.stdin.read()):\n  im=cv2.imread(f,cv2.IMREAD_UNCHANGED).astype(float)\n  c=np.array([int(col[5:7],16),int(col[3:5],16),int(col[1:3],16)],float)\n  rgb=np.zeros_like(im[:,:,:3])+c if mask else im[:,:,:3]/255.*c\n  cv2.imwrite(out,np.dstack([rgb,im[:,:,3]]).clip(0,255).astype('uint8'))`;
  const todo = [];
  const out = plates.map((p) => { const f = fileURLToPath(p.url), tints = {};
    for (const c of want) { const t = f.replace(/\.png$/, `-${c.slice(1)}.png`); tints[c] = pathToFileURL(t).href; if (!fs.existsSync(t)) todo.push([f, !!p.mask, c, t]); }
    return { ...p, tints }; });
  if (todo.length) { const py = process.env.A1_PYTHON || path.join(path.dirname(new URL(import.meta.url).pathname), '../../../../../work/external-source-tool-canaries-v1/.venv/bin/python');
    spawnSync(fs.existsSync(py) ? py : 'python3', ['-c', code], { input: JSON.stringify(todo), encoding: 'utf8' }); }
  return out.map((p) => ({ ...p, tints: Object.fromEntries(Object.entries(p.tints).filter(([, u]) => fs.existsSync(fileURLToPath(u)))) }));
}
// every colour named in a spec or theme (the plates a page may need)
export const colorsIn = (...xs) => [...new Set(xs.flatMap((x) => JSON.stringify(x ?? '').match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []))];
// (pure) the CSS of plate i in a colour: its tinted picture stretched over the plate's box; null when that colour was not
// made (the caller keeps its flat colour, and the frame check names it: flatPlateErrors)
export function plateCss(plates, i, color) {
  if (!plates?.length) return null;
  const p = plates[((i % plates.length) + plates.length) % plates.length], u = p.tints?.[hex6(color)];
  return u ? `background:url('${u}') center/100% 100% no-repeat;` : null;   // (single quotes: it goes in a style="" attribute)
}
