// Design checks on a rendered still: the layout rules the replicas taught (and the HyperFrames
// house rules agree with), measured from the page itself. A finding is a fact about the frame, not
// taste: type too small to read in video, text spilling out of its box or the frame, two pieces of
// text on top of each other, text over the presenter's face. The run lists them; the writer and the
// critic act on them. Faces come from macOS Vision (faces.swift), cached by the picture's bytes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DESIGN_RULES = {
  minCjkPx: 22,        // CJK type in a 1080p frame (video sizes; captions and labels 22, the reference's smallest)
  minLatinPx: 16,      // small Latin captions (English lines under a title) may go smaller than CJK
  framePad: 8,         // px a text box may sit past the frame edge before it counts as out of frame
  slotPad: 12,         // px a text may spill past its own slot box
  overlap: 0.12,       // share of the smaller text box two texts may share
  facePad: 0.06,       // the face box grows by this share of its size on every side
};

const facesCache = path.join(os.tmpdir(), 'recipe-board-faces');
export function facesOf(file) {
  if (!file || !fs.existsSync(file)) return [];
  const key = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 20);
  const hit = path.join(facesCache, key + '.json');
  if (fs.existsSync(hit)) return JSON.parse(fs.readFileSync(hit, 'utf8'));
  let boxes = [];
  try { boxes = JSON.parse(execFileSync('swift', [path.join(path.dirname(new URL(import.meta.url).pathname), 'faces.swift'), file], { encoding: 'utf8', timeout: 60000 })); } catch { boxes = []; }
  fs.mkdirSync(facesCache, { recursive: true });
  fs.writeFileSync(hit, JSON.stringify(boxes));
  return boxes;
}

// A picture's faces in frame coordinates (0–1) once it covers a 16:9 frame (object-fit: cover, centred).
export function frameFaces(file, W = 1920, H = 1080) {
  const faces = facesOf(file);
  if (!faces.length) return [];
  let iw = 0, ih = 0;
  try { [iw, ih] = execFileSync(process.env.A1_FFPROBE || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().split(',').map(Number); } catch { return []; }
  if (!iw || !ih) return [];
  const k = Math.max(W / iw, H / ih), ox = (W - iw * k) / 2, oy = (H - ih * k) / 2;
  return faces.map(([x, y, w, h]) => [(ox + x * iw * k) / W, (oy + y * ih * k) / H, (w * iw * k) / W, (h * ih * k) / H]);
}

// Where a big title goes on a photo so it does not cross a face (clara B26 set 十五分钟 across Son's
// eyes): the side away from the faces when they keep to one side, the lower band when they hold the middle.
// null when the title's own box is clear. Boxes are [x, y, w, h] in 0–1.
export function titleClearOfFaces(box, faces, pad = DESIGN_RULES.facePad) {
  const grow = ([x, y, w, h]) => [x - w * pad, y - h * pad, w * (1 + 2 * pad), h * (1 + 2 * pad)];
  const hits = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  const fs = faces.filter((f) => f[2] * f[3] > 0.002).map(grow);
  if (!fs.some((f) => hits(box, f))) return null;
  const x0 = Math.min(...fs.map((f) => f[0])), x1 = Math.max(...fs.map((f) => f[0] + f[2]));
  if (x0 >= 0.5) return { box: [0.05, box[1], Math.max(0.3, x0 - 0.08), box[3]], align: 'left' };
  if (x1 <= 0.5) return { box: [x1 + 0.03, box[1], Math.max(0.3, 0.95 - x1 - 0.03), box[3]], align: 'right' };
  // a face across the middle: the title goes below it when there is room, else to the wider side
  const below = Math.max(...fs.map((f) => f[1] + f[3]));
  if (below < 0.6) return { box: [box[0], below + 0.02, box[2], Math.min(0.24, 0.84 - below)], align: 'center' };
  return x0 > 1 - x1 ? { box: [0.04, box[1], Math.max(0.28, x0 - 0.06), box[3]], align: 'left' } : { box: [x1 + 0.02, box[1], Math.max(0.28, 0.96 - x1 - 0.02), box[3]], align: 'right' };
}

// The dark band across the bottom of a generated poster card, in the image's 0–1 coordinates, with the
// image's pixel size: [x0, y0, x1, y1, iw, ih], or null. Each generation puts its band at its own height,
// so a tag at a fixed place sat on the paper edge on some cards (hupo B45 最反常识的一环).
const bandCache = new Map();
export function darkBand(file) {
  if (!file || !fs.existsSync(file)) return null;
  if (bandCache.has(file)) return bandCache.get(file);
  let out = null;
  try {
    const [iw, ih] = execFileSync(process.env.A1_FFPROBE || 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().split(',').map(Number);
    const W = 64, H = 128;
    // luma on a black ground (transparent edges of a cut-out card read as dark only where the card is)
    const px = execFileSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', `scale=${W}:${H}:flags=area,format=rgba`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 24 });
    const at = (x, y) => { const i = (y * W + x) * 4; return { l: 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2], a: px[i + 3] }; };
    const dark = (x, y) => { const p = at(x, y); return p.a > 128 && p.l < 85; };
    // rows (bottom 45%) where most of the card's width is dark
    const rows = [];
    for (let y = Math.floor(H * 0.55); y < H; y++) {
      let n = 0, x0 = W, x1 = -1;
      for (let x = 0; x < W; x++) if (dark(x, y)) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      rows.push({ y, n, x0, x1 });
    }
    const band = rows.filter((r) => r.n > W * 0.45);
    if (band.length >= 3) {
      // the longest run of consecutive band rows
      let best = [], cur = [];
      for (const r of band) { if (cur.length && r.y !== cur[cur.length - 1].y + 1) cur = []; cur.push(r); if (cur.length > best.length) best = [...cur]; }
      const x0 = Math.min(...best.map((r) => r.x0)), x1 = Math.max(...best.map((r) => r.x1));
      out = [x0 / W, best[0].y / H, (x1 + 1) / W, (best[best.length - 1].y + 1) / H, iw, ih];
    }
  } catch { out = null; }
  bandCache.set(file, out);
  return out;
}

// In the page: every piece of visible text (leaf elements with their own text), its box, size and slot;
// the slot boxes; and the background picture's faces mapped into frame pixels (object-fit cover).
export async function measurePage(page, faces) {
  return page.evaluate(({ faces }) => {
    const W = 1920, H = 1080;
    const texts = [];
    for (const el of document.querySelectorAll('.stage *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.display === 'none') continue;
      // decoration is not text to read: quote marks alone, ghost words (faint, behind everything)
      const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      if (/^[“”"'‘’「」『』*|]+$/.test(ownText)) continue;
      // placeholders for missing pictures and the TODO badge are reported as TODOs, not as layout
      if (el.closest('.ph, .todo, .ghost, .ghost-sheet')) continue;
      let op = 1; for (let a = el; a && a !== document.body; a = a.parentElement) op *= +getComputedStyle(a).opacity;
      const rgba = cs.color.match(/rgba?\(([^)]+)\)/); const alpha = rgba ? +(rgba[1].split(',')[3] ?? 1) : 1;
      if (op * alpha < 0.35) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const slot = el.closest('[data-slot]');
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      texts.push({ text: text.slice(0, 24), size: parseFloat(cs.fontSize), box: [r.left, r.top, r.width, r.height], slot: slot?.dataset.slot || null, subtitle: !!el.closest('.subtitle'), credit: /^素材|^来源|credit/i.test(text) || !!el.closest('.credit, .src') });
    }
    const slots = {};
    for (const s of document.querySelectorAll('[data-slot]')) { const r = s.getBoundingClientRect(); slots[s.dataset.slot] = [r.left, r.top, r.width, r.height]; }
    let faceBoxes = [];
    const bg = document.querySelector('[data-slot="background"] img');
    if (bg && faces.length && bg.naturalWidth) {
      const r = bg.getBoundingClientRect();
      const fit = getComputedStyle(bg).objectFit;
      const k = fit === 'contain' ? Math.min(r.width / bg.naturalWidth, r.height / bg.naturalHeight) : Math.max(r.width / bg.naturalWidth, r.height / bg.naturalHeight);
      const ox = r.left + (r.width - bg.naturalWidth * k) / 2, oy = r.top + (r.height - bg.naturalHeight * k) / 2;
      faceBoxes = faces.map(([x, y, w, h]) => [ox + x * bg.naturalWidth * k, oy + y * bg.naturalHeight * k, w * bg.naturalWidth * k, h * bg.naturalHeight * k]);
    }
    return { W, H, texts, slots, faces: faceBoxes };
  }, { faces });
}

const area = ([, , w, h]) => Math.max(0, w) * Math.max(0, h);
const inter = (a, b) => { const x = Math.max(a[0], b[0]), y = Math.max(a[1], b[1]); const r = Math.min(a[0] + a[2], b[0] + b[2]), d = Math.min(a[1] + a[3], b[1] + b[3]); return Math.max(0, r - x) * Math.max(0, d - y); };

export function designFindings(m, rules = DESIGN_RULES) {
  const out = [];
  const add = (rule, slot, text, detail) => out.push({ rule, slot, text, detail });
  for (const t of m.texts) {
    if (t.subtitle || t.credit) continue;
    const cjk = /[⺀-￿]/.test(t.text);
    if (t.size < (cjk ? rules.minCjkPx : rules.minLatinPx)) add('type-too-small', t.slot, t.text, `${Math.round(t.size)}px`);
    const [x, y, w, h] = t.box;
    if (x < -rules.framePad || y < -rules.framePad || x + w > m.W + rules.framePad || y + h > m.H + rules.framePad) add('out-of-frame', t.slot, t.text, `box ${t.box.map(Math.round).join(',')}`);
    const s = t.slot && t.slot !== 'background' ? m.slots[t.slot] : null;
    if (s && (x < s[0] - rules.slotPad || x + w > s[0] + s[2] + rules.slotPad)) add('spills-out-of-box', t.slot, t.text, `${Math.round(Math.max(s[0] - x, x + w - s[0] - s[2]))}px past its slot`);
    for (const f of m.faces) {
      const g = [f[0] - f[2] * rules.facePad, f[1] - f[3] * rules.facePad, f[2] * (1 + 2 * rules.facePad), f[3] * (1 + 2 * rules.facePad)];
      if (inter(g, t.box) > 0.08 * Math.min(area(g), area(t.box))) add('over-the-face', t.slot, t.text, 'text covers the presenter\'s face');
    }
  }
  const ts = m.texts.filter((t) => !t.subtitle && !t.credit);
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    if (ts[i].slot === ts[j].slot) continue;
    if (inter(ts[i].box, ts[j].box) > rules.overlap * Math.min(area(ts[i].box), area(ts[j].box))) add('texts-collide', `${ts[i].slot}/${ts[j].slot}`, `${ts[i].text} × ${ts[j].text}`, 'two pieces of text on top of each other');
  }
  // one finding per rule and slot
  const seen = new Set();
  return out.filter((f) => { const k = f.rule + '|' + f.slot; return !seen.has(k) && seen.add(k); });
}

// How light a picture is under a box of the frame (0–1, the picture covering a 16:9 frame, centred): the mean luma of
// that part. A card's words over a real page or photo take their ink from it, not from the film's tokens (the banana
// film's B17: the film's light ink, set for its dark world, stamped 國家緊急狀態 white over a light web page)
const lumaCache = new Map();
export function regionLuma(file, [x, y, w, h], W = 1920, H = 1080) {
  if (!file || !fs.existsSync(file)) return null;
  const key = `${file}|${[x, y, w, h].join(',')}`; if (lumaCache.has(key)) return lumaCache.get(key);
  let out = null;
  try {
    const cw = Math.max(2, Math.round(w * W)), ch = Math.max(2, Math.round(h * H)), cx = Math.round(x * W), cy = Math.round(y * H);
    const px = execFileSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},crop=${cw}:${ch}:${cx}:${cy},scale=32:16:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
    let sum = 0; for (const v of px) sum += v; out = px.length ? sum / px.length / 255 : null;
  } catch { out = null; }
  lumaCache.set(key, out); return out;
}

// Where on a picture a title can stand without crossing the picture's own words: the busy-ness (edge density) of
// horizontal bands of it, covering a 16:9 frame. quietBand returns the y (0–1) of the band of height h with the least
// detail between y0 and y1, and the detail of the band the title already holds (both 0–1). The banana film's B17
// stamped 國家緊急狀態 straight across the page's own headline (the recipe: 不压网页标题)
const bandsCache = new Map();
export function detailBands(file, N = 54) {
  if (!file || !fs.existsSync(file)) return null;
  if (bandsCache.has(file)) return bandsCache.get(file);
  let out = null;
  try {
    const W = 96, H = N;
    const px = execFileSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
    out = Array.from({ length: H }, (_, y) => { let e = 0; for (let x = 1; x < W; x++) e += Math.abs(px[y * W + x] - px[y * W + x - 1]); if (y > 0) for (let x = 0; x < W; x++) e += Math.abs(px[y * W + x] - px[(y - 1) * W + x]); return e / (W * 2 * 255); });
  } catch { out = null; }
  bandsCache.set(file, out); return out;
}
// the same over a box anywhere on the picture: the quietest place of w × h (0–1 of the frame) between the margins and the
// subtitle band, and how busy the box already given is. A hero title over a photo stood centred across its subject
// (suez-evergiven-blind 2026-10-27: 一艘船 over the ship on the satellite picture, 浮起來 in black over its containers)
const cellsCache = new Map();
export function detailCells(file, W = 96, H = 54) {
  if (!file || !fs.existsSync(file)) return null;
  if (cellsCache.has(file)) return cellsCache.get(file);
  let out = null;
  try {
    const px = execFileSync(process.env.A1_FFMPEG || 'ffmpeg', ['-loglevel', 'error', '-i', file, '-frames:v', '1', '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
    out = { W, H, e: Array.from({ length: W * H }, (_, i) => { const x = i % W, y = Math.floor(i / W); return ((x > 0 ? Math.abs(px[i] - px[i - 1]) : 0) + (y > 0 ? Math.abs(px[i] - px[i - W]) : 0)) / 510; }) };
  } catch { out = null; }
  cellsCache.set(file, out); return out;
}
export function quietSpot(file, [w, h], given = null, { x0 = 0.05, x1 = 0.95, y0 = 0.07, y1 = 0.78 } = {}) {
  const c = detailCells(file); if (!c) return null;
  const { W, H, e } = c, cw = Math.max(1, Math.round(w * W)), ch = Math.max(1, Math.round(h * H));
  const mean = (cx, cy, ww = cw, hh = ch) => { let s = 0; for (let y = cy; y < cy + hh; y++) for (let x = cx; x < cx + ww; x++) s += e[Math.min(H - 1, y) * W + Math.min(W - 1, x)]; return s / (ww * hh); };
  let best = null;
  for (let y = Math.round(y0 * H); y + ch <= Math.round(y1 * H); y++) for (let x = Math.round(x0 * W); x + cw <= Math.round(x1 * W); x++) { const m = mean(x, y); if (!best || m < best.m - 1e-9) best = { x, y, m }; }
  if (!best) return null;
  const here = given ? mean(Math.round(given[0] * W), Math.round(given[1] * H), Math.max(1, Math.round(given[2] * W)), Math.max(1, Math.round(given[3] * H))) : null;
  return { box: [best.x / W, best.y / H, cw / W, ch / H], detail: best.m, here };
}
// Whether two picture files show the same photograph, whatever their crop and size (samepic.py: one searched inside the
// other at several scales): two copies of one picture from two sources (a Commons original and its mobile copy) are one
// picture, so a cut between them is no cut (suez B01 2026-10-27)
const sameCache = new Map();
export function samePicture(a, b, min = 0.92) {
  if (!a || !b) return false; if (a === b) return true;
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  const key = [a, b].sort().join('|'); if (sameCache.has(key)) return sameCache.get(key) >= min;
  let r = 0;
  try { r = Number(execFileSync('python3', [new URL('./samepic.py', import.meta.url).pathname, a, b], { encoding: 'utf8', timeout: 60000 }).trim()) || 0; } catch { r = 0; }
  sameCache.set(key, r); return r >= min;
}
export function quietBand(file, [x, y, w, h], { y0 = 0.06, y1 = 0.8 } = {}) {
  const b = detailBands(file); if (!b) return null;
  const N = b.length, rows = Math.max(1, Math.round(h * N)), mean = (r0) => { let s = 0; for (let r = r0; r < r0 + rows; r++) s += b[Math.min(N - 1, r)]; return s / rows; };
  const here = mean(Math.round(y * N)); let best = null;
  for (let r = Math.round(y0 * N); r + rows <= Math.round(y1 * N); r++) { const m = mean(r); if (!best || m < best.m) best = { r, m }; }
  return best ? { y: best.r / N, detail: best.m, here } : null;
}
