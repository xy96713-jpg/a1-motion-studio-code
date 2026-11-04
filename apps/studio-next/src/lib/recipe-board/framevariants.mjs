// framevariants.mjs: a designed frame tried in several layouts, measured, and the best kept (user, 2026-10-23: 能不能做到没问题最优呢):
// a frame was set by hand, tried, sent back and moved, 16.8 versions a shot on hupo-auto2. Here its parts are laid out
// a few ways by rule (as written, a centred stack, a left column, the main part as a hero), each is tried under the
// line's checks (layers.tryShot), the ones with fewest problems lead, and a strip of them goes to the reviewer to pick.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectPaths } from './store.mjs';

// parts that stay where they are: a full-frame wash or band under everything
const fixed = (l) => l.kind === 'shape' && (l.box?.w ?? 0) >= 95;
// a part's height in % of the frame, as near as can be told before rendering: a text by its size, a picture by its box
// or its own aspect (aspect: w / h of the picture or its crop, when known)
export function heightOf(l, aspect = null) {
  if (l.kind === 'text') return ((l.size || 120) * 1.12) / 10.8;
  if (l.box?.h != null) return l.box.h;
  const a = aspect || 6;
  return ((l.box?.w ?? 40) * 19.2) / a / 10.8 + (l.card ? (2 * (l.card.pad ?? 28)) / 10.8 : 0);
}
const weight = (l) => (l.kind === 'text' ? (l.size || 120) * [...String(l.text || '')].length * .6 : (l.box?.w ?? 40) * 19.2);
// (pure) the layouts of a frame's parts: [{ name, parts }]; aspects: { index: w / h } for the picture parts
export function frameVariants(spec, aspects = {}) {
  const parts = spec.parts || [], moving = parts.map((l, i) => ({ l, i })).filter(({ l }) => !fixed(l));
  if (moving.length < 1) return [{ name: 'written', parts }];
  const order = [...moving].sort((a, b) => (a.l.at ?? 0) - (b.l.at ?? 0) || a.i - b.i);
  const top = 8, bottom = 82, gap = 3;
  const stack = (items, hOf) => { const hs = items.map(hOf), total = hs.reduce((a, b) => a + b, 0) + gap * (items.length - 1), k = Math.min(1, (bottom - top) / Math.max(1, total));
    let y = top + Math.max(0, (bottom - top - total * k) / 2); return items.map((it, j) => { const at = y; y += (hs[j] + gap) * k; return { ...it, y: +at.toFixed(1), k }; }); };
  const place = (it, x, w, extra = {}) => { const l = it.l, box = { ...(l.box || {}), x: +x.toFixed(1), y: it.y, w: +w.toFixed(1) }; if (box.h != null) box.h = +(box.h * it.k).toFixed(1);
    return { ...l, box, ...(l.kind === 'text' && l.size ? { size: Math.round(l.size * Math.min(1, it.k)) } : {}), ...extra }; };
  const build = (laid) => parts.map((l, i) => laid.get(i) || l);
  const out = [{ name: 'written', parts }];
  { const s = stack(order, (it) => heightOf(it.l, aspects[it.i])), m = new Map(s.map((it) => { const w = it.l.kind === 'text' ? Math.min(92, it.l.box?.w ?? 80) : Math.min(84, it.l.box?.w ?? 60); return [it.i, place(it, (100 - w) / 2, w, it.l.kind === 'text' ? { align: 'center' } : {})]; }));
    out.push({ name: 'centred', parts: build(m) }); }
  { const s = stack(order, (it) => heightOf(it.l, aspects[it.i])), m = new Map(s.map((it) => [it.i, place(it, 6, Math.min(it.l.box?.w ?? 60, 80), it.l.kind === 'text' ? { align: 'left' } : {})]));
    out.push({ name: 'left', parts: build(m) }); }
  if (moving.length >= 2) {
    const hero = [...moving].sort((a, b) => weight(b.l) - weight(a.l))[0], grown = { ...hero, l: hero.l.kind === 'text' ? { ...hero.l, size: Math.round((hero.l.size || 120) * 1.25) } : { ...hero.l, box: { ...hero.l.box, w: Math.min(90, (hero.l.box?.w ?? 60) * 1.2) } } };
    const seq = order.map((it) => (it.i === hero.i ? grown : it)), s = stack(seq, (it) => heightOf(it.l, aspects[it.i]));
    const m = new Map(s.map((it) => { const w = it.l.kind === 'text' ? Math.min(94, it.l.box?.w ?? 80) : Math.min(90, it.l.box?.w ?? 60); return [it.i, place(it, (100 - w) / 2, w, it.l.kind === 'text' ? { align: 'center' } : {})]; }));
    out.push({ name: 'hero', parts: build(m) });
  }
  return out;
}
// (pure) the order to keep them in: fewest problems first, then as written first among equals
export function rankVariants(rows) {
  return [...rows].sort((a, b) => a.problems.length - b.problems.length || (a.name === 'written' ? -1 : b.name === 'written' ? 1 : 0));
}
// every layout of one shot tried and a strip of them, best first, written beside the shot's tries
export async function runVariants(cfg, id, seg, shotId, { log = () => {} } = {}) {
  const { tryShot } = await import('./layers.mjs');
  const first = await tryShot(cfg, id, seg, shotId, {});
  if (first.spec.module !== 'frame') throw new Error(`${seg} ${shotId}: layouts are tried for a designed frame (module frame), not ${first.spec.module}`);
  const aspects = {};
  (first.spec.parts || []).forEach((l, i) => { if (l.kind === 'image' && typeof l.src === 'string' && !l.phrase) { const r = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', path.join(cfg.sourceRoot, l.src)], { encoding: 'utf8' }).stdout.match(/\d+/g); if (r) { const [w, h] = r.slice(-2).map(Number), c = l.crop || { w: 1, h: 1 }; aspects[i] = (w * c.w) / (h * c.h); } } });
  const dir = path.join(projectPaths(cfg, id).out, 'passages', seg, 'variants', shotId); fs.mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const v of frameVariants(first.spec, aspects)) {
    const r = v.name === 'written' ? first : await tryShot(cfg, id, seg, shotId, { set: { parts: v.parts } });
    const file = path.join(dir, `${v.name}.jpg`); fs.copyFileSync(r.file, file);
    rows.push({ name: v.name, parts: v.parts, problems: r.problems.map((p) => p.say), file });
    log(`  ${v.name}: ${r.problems.length ? `${r.problems.length} problems` : 'the checks pass'}`);
  }
  const ranked = rankVariants(rows), strip = path.join(dir, 'strip.jpg');
  spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...ranked.flatMap((r) => ['-i', r.file]), '-filter_complex', `${ranked.map((_, i) => `[${i}]scale=1440:-2[v${i}]`).join(';')};${ranked.map((_, i) => `[v${i}]`).join('')}vstack=inputs=${ranked.length}`, '-q:v', '4', strip]);
  fs.writeFileSync(path.join(dir, 'variants.json'), JSON.stringify({ shot: shotId, ranked: ranked.map(({ name, problems, file, parts }) => ({ name, problems, file, parts })) }, null, 1) + '\n');
  return { strip, ranked };
}
