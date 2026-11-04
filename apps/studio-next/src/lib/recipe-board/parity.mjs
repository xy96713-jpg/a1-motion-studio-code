// The parity audit (user, 2026-10-26: 把对标彻底复刻好 … 拆设计语言到系统 … 尤其是动效): how near the film comes to its
// reference, measured, sub-shot by sub-shot, on the breakdown both share (breakdown.mjs: the reference's card.json, ours
// ours.json, the same measures). Each ours sub-shot is paired with the reference's it overlaps most; each measure is held to
// a tolerance; the report gives, per measure, the share within it and the furthest pairs. Motion first: the camera's push
// and travel, its moving share, its ease and speed, the entrance's onset and build, the events a second, the cuts.
//   parityReport(cfg, id) -> { measures: [{ key, group, within, n, median, worst: [...] }], cuts, passages: {...} }
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths } from './store.mjs';

// (pure) the measures, each with how to read it off a sub-shot and its tolerance; gap() is how far ours is, 0 a match
export const MEASURES = [
  { key: 'push', group: 'motion', read: (s) => s.camera?.zoom, gap: (o, r) => Math.abs(Math.log(o) - Math.log(r)), tol: .03, unit: 'log zoom' },
  { key: 'travel', group: 'motion', read: (s) => s.camera?.pan && Math.hypot(...s.camera.pan), gap: (o, r) => Math.abs(o - r), tol: .03, unit: 'frame widths' },
  { key: 'moving', group: 'motion', read: (s) => s.camera?.moving, gap: (o, r) => Math.abs(o - r), tol: .2, unit: 'share of the sub-shot' },
  { key: 'ease', group: 'motion', read: (s) => s.camera?.ease, gap: (o, r) => Math.abs(o - r), tol: .3, unit: '0 even, 1 eased' },
  { key: 'speed', group: 'motion', read: (s) => s.camera?.speed, gap: (o, r) => Math.abs(Math.log((o + .01) / (r + .01))), tol: Math.log(1.6), unit: 'log ratio' },
  { key: 'onset', group: 'motion', read: (s) => s.camera?.anim?.onset, gap: (o, r) => Math.abs(o - r), tol: .3, unit: 's to the first change' },
  { key: 'build', group: 'motion', read: (s) => s.camera?.anim?.build, gap: (o, r) => Math.abs(o - r), tol: .6, unit: 's of building' },
  { key: 'pulses', group: 'motion', read: (s) => s.camera?.anim?.pulses, gap: (o, r) => Math.abs(o - r), tol: 1, unit: 'beats of change' },
  { key: 'events', group: 'motion', read: (s) => (s.events || []).length / Math.max(.3, s.end - s.at), gap: (o, r) => Math.abs(o - r), tol: .6, unit: 'entrances a second' },
  { key: 'type', group: 'design', read: (s) => s.display?.h ?? ((s.text || []).reduce((a, t) => Math.max(a, t.h || 0), 0) || null), gap: (o, r) => Math.abs(Math.log(o / r)), tol: Math.log(1.25), unit: 'log ratio of the display line' },
  { key: 'typeY', group: 'design', read: (s) => s.display?.cy ?? (s.text || [])[0]?.cy ?? null, gap: (o, r) => Math.abs(o - r), tol: .15, unit: 'frame heights' },
  { key: 'lum', group: 'look', read: (s) => s.look?.lum, gap: (o, r) => Math.abs(o - r), tol: 12, unit: 'L*' },
  { key: 'contrast', group: 'look', read: (s) => s.look?.contrast, gap: (o, r) => Math.abs(o - r), tol: 10, unit: 'L* spread' },
  { key: 'vignette', group: 'look', read: (s) => s.look?.vignette, gap: (o, r) => Math.abs(o - r), tol: 20, unit: '' },
  { key: 'grain', group: 'look', read: (s) => s.look?.grain, gap: (o, r) => Math.abs(o - r), tol: .6, unit: '' },
];
export const CUT_TOL = .3;

// (pure) ours paired with the reference's sub-shot it overlaps most (by time)
export function pairSubs(ours, ref) {
  return ours.map((o) => { let best = null, b = 0; for (const r of ref) { const ov = Math.min(o.end, r.end) - Math.max(o.at, r.at); if (ov > b) { b = ov; best = r; } } return best && b > .2 ? { o, r: best } : null; }).filter(Boolean);
}

// (pure) the measures over pairs: per key, the share within tolerance, the median gap and the furthest pairs
export function measurePairs(pairs, seg = '') {
  return MEASURES.map((m) => { const rows = [];
    for (const { o, r } of pairs) { const a = m.read(o), b = m.read(r); if (a == null || b == null || !isFinite(a) || !isFinite(b)) continue; rows.push({ seg, at: +o.at.toFixed(2), ref: r.id, ours: +(+a).toFixed(3), theirs: +(+b).toFixed(3), gap: +m.gap(a, b).toFixed(3) }); }
    return { key: m.key, group: m.group, unit: m.unit, tol: m.tol, rows }; });
}

// (pure) the reference's cuts each matched by one of ours within CUT_TOL, and ours the reference does not make
export function cutParity(ours, ref) {
  const hit = ref.filter((c) => ours.some((d) => Math.abs(d - c) <= CUT_TOL)).length, extra = ours.filter((d) => !ref.some((c) => Math.abs(d - c) <= CUT_TOL)).length;
  return { ref: ref.length, matched: hit, extra };
}

const median = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function parityReport(cfg, id) {
  const root = path.join(projectPaths(cfg, id).root, 'out', 'passages'), by = {}, cuts = { ref: 0, matched: 0, extra: 0 }, passages = {};
  for (const seg of fs.readdirSync(root)) {
    const dir = path.join(root, seg, 'breakdown'), cf = path.join(dir, 'card.json'), of = path.join(dir, 'ours.json');
    if (!fs.existsSync(cf) || !fs.existsSync(of)) continue;
    const card = JSON.parse(fs.readFileSync(cf, 'utf8')), ours = JSON.parse(fs.readFileSync(of, 'utf8'));
    // (both on the film's clock: ours is measured from the passage's own start, the card on the film's)
    const off = ours.at || card.range?.[0] || 0, os = (ours.subs || []).map((s) => ({ ...s, at: s.at + off, end: s.end + off }));
    const ms = measurePairs(pairSubs(os, card.subs || []), seg);
    for (const m of ms) (by[m.key] ||= { ...m, rows: [] }).rows.push(...m.rows);
    const c = cutParity((ours.cuts || []).map((t) => t + off), card.cuts || []); for (const k of Object.keys(cuts)) cuts[k] += c[k];
    passages[seg] = Object.fromEntries(ms.map((m) => [m.key, m.rows.length ? +(m.rows.filter((r) => r.gap <= m.tol).length / m.rows.length).toFixed(2) : null]));
  }
  const measures = MEASURES.map((m) => { const x = by[m.key] || { rows: [] }, g = x.rows.map((r) => r.gap);
    return { key: m.key, group: m.group, unit: m.unit, tol: +m.tol.toFixed(3), n: g.length, within: g.length ? +(g.filter((v) => v <= m.tol).length / g.length).toFixed(2) : null, median: g.length ? +median(g).toFixed(3) : null, worst: [...x.rows].sort((a, b) => b.gap - a.gap).slice(0, 6) }; });
  return { measures, cuts, passages };
}
