// The type bible's measures (the user 2026-10-28: 字体设计的不好 你没什么排版规则和圣经吗 很多位置都怪怪的; 做). The line had
// constraints (house faces, a least size, no type over type, off the edge, on its words) and no design system: each beat
// picked its own sizes and found its own empty spot, small lines sat over big ones, one film's figures went from 120 px
// to 200, and the key figures rode the 3D world wherever the camera took them. The bible (routing/type-bible.json,
// TYPE.md): a 12-column grid, five sizes, the small line under the big one on its left edge, key figures and titles on
// the screen's grid (labels may ride their things), one accent. Measured on each beat's settled frame (the keyframe's
// drawn type), for the greybox and for every chapter of a film set by it (project.json typeBible).
import fs from 'node:fs';
import path from 'node:path';
import { cnDigits } from './greybox.mjs';

export const loadBible = (cfg) => JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'type-bible.json'), 'utf8'));
const STEPS = (B) => Object.entries(B.scale).filter(([k]) => k !== 'tolerance');
// (pure, tested) the step a size is on, or null
export function stepOf(size, B) { for (const [k, v] of STEPS(B)) if (Math.abs(size - v) <= v * B.scale.tolerance) return k; return null; }
// (a source credit — a Latin line under a caption's size, as 'Suez Canal Authority / FreightWaves' — is furniture like 示意:
// the house's least sizes hold it, not the scale or the pairs)
const credit = (d) => !/[\u3400-\u9fff]/.test(String(d.text)) && /[A-Za-z]{3}/.test(String(d.text)) && d.size < 36;
const exempt = (d) => d.look || /^(note|look)$/.test(d.id || '') || String(d.text).trim() === '示意' || (d.alpha ?? 1) < 0.5 || credit(d);
// (pure, tested) the drawn pieces joined into lines: one id, one baseline band, side by side (figures and Chinese are drawn
// as separate runs of one line)
export function linesOf(drawn) {
  const out = [];
  for (const d of drawn || []) {
    if (exempt(d) || !String(d.text).trim() || !(d.size > 0)) continue;
    const kind = d.pin || d.surface ? 'pinned' : 'screen', l = out.find((o) => o.id === d.id && o.kind === kind && Math.abs((o.y0 + o.y1) / 2 - (d.y0 + d.y1) / 2) < Math.max(o.size, d.size) * 0.5 && d.x0 <= o.x1 + Math.max(o.size, d.size) * 0.6 && d.x1 >= o.x0 - Math.max(o.size, d.size) * 0.6);
    const run = d.ink ? [{ text: String(d.text), top: d.ink[0], bottom: d.ink[1] }] : [];
    if (l) { l.text += d.text; l.x0 = Math.min(l.x0, d.x0); l.x1 = Math.max(l.x1, d.x1); l.y0 = Math.min(l.y0, d.y0); l.y1 = Math.max(l.y1, d.y1); l.size = Math.max(l.size, d.size); l.runs.push(...run); if (d.inkX) l.inkX = l.inkX ? [Math.min(l.inkX[0], d.inkX[0]), Math.max(l.inkX[1], d.inkX[1])] : d.inkX.slice(); }
    else out.push({ anchor: d.anchor || null, id: d.id, kind, text: String(d.text), x0: d.x0, x1: d.x1, y0: d.y0, y1: d.y1, size: d.size, texture: !!d.texture, inScene: !!d.inScene, runs: run, block: d.block || null, inkX: d.inkX ? d.inkX.slice() : null, alpha: d.alpha ?? 1 });
  }
  return out;
}
const bare = (x) => String(x || '').replace(/[\s，。、；：？！「」·・,.;:?!()（）\-—–]/g, '');
// (pure, tested) where a line is said in its narration: the whole, else its longest run of two letters or more that is
// said (a screen line shortens what is said: 最近的水路 for 最近的一條水路, 繞過好望角 for 繞道…好望角), figures read
// either way (九十億 and 90億)
export function saidAt(said, text) {
  const S = bare(cnDigits(said)), t = bare(cnDigits(text)); if (!t) return -1;
  for (let n = t.length; n >= 2; n--) for (let i = 0; i + n <= t.length; i++) { const j = S.indexOf(t.slice(i, i + n)); if (j >= 0) return j; }
  return -1;
}
const near = (v, xs, tol) => xs.some((x) => Math.abs(v - x) <= tol);
// (pure, tested) one frame's type against the bible
export function typeBibleErrors(drawn, B, beat = '', said = '', { grid = true } = {}) {   // said: the beat's narration, in the film's script (a kicker is said first)
  const e = [], G = B.grid, tol = G.tolerance, L = linesOf(drawn), pre = beat ? `${beat}: ` : '';
  const screen = L.filter((l) => l.kind === 'screen');
  for (const l0 of grid ? screen : []) {
    // (the grid and the margins by the ink when the line has it: the type parts set the ink on the column line, its pen a
    // bearing to the side — 同一棵香蕉's pen stood at 86 with its ink on 120, banana-design)
    const l = l0.inkX ? { ...l0, x0: l0.inkX[0], x1: l0.inkX[1] } : l0, step = stepOf(l.size, B);
    if (!step) e.push(`${pre}"${l.text}" at ${Math.round(l.size)} px is off the type scale (${STEPS(B).map(([k, v]) => `${k} ${v}`).join(', ')})`);
    if (!(near(l.x0, G.lefts, tol) || near(l.x1, G.rights, tol) || Math.abs((l.x0 + l.x1) / 2 - G.centre) <= tol)) e.push(`${pre}"${l.text}" stands off the grid (its left edge ${Math.round(l.x0)}, right ${Math.round(l.x1)}: on a column line, or centred)`);
    if (l.x0 < G.margin.left - tol || l.x1 > B.frame.w - G.margin.right + tol || l.y0 < G.margin.top - tol) e.push(`${pre}"${l.text}" leaves the margins (${G.margin.left} left and right, ${G.margin.top} top)`);
    if (l.y1 > G.band) e.push(`${pre}"${l.text}" sits in the subtitle band (below ${G.band})`);
  }
  // a line's figures and words one height: their inks' tops and feet together (400 stood 47 px under the top of 米 at 204
  // px — the user 2026-10-28: 数字和文字为什么对齐不了; the box of a run is its size, not its ink, and could not see it)
  for (const l of L) { const fig = l.runs.filter((r) => /\d/.test(r.text) && !/[\u3400-\u9fff]/.test(r.text)), cjk = l.runs.filter((r) => /[\u3400-\u9fff]/.test(r.text));
    if (fig.length && cjk.length) { const ct = Math.min(...cjk.map((r) => r.top)), ft = Math.min(...fig.map((r) => r.top)), cb = Math.max(...cjk.map((r) => r.bottom)), fb = Math.max(...fig.map((r) => r.bottom));
      if (Math.abs(ft - ct) > l.size * B.figure.heightTol || Math.abs(fb - cb) > l.size * B.figure.heightTol) e.push(`${pre}"${l.text}": its figures and its words are not one height (tops ${Math.round(ft)} and ${Math.round(ct)}, feet ${Math.round(fb)} and ${Math.round(cb)})`); } }
  // pairs: a small line by a big one stands on its edge at its gap — under it, or over it as its kicker when the narration
  // says it first (每堵一天 / 九十億美元: a lead-in over its figure is the trade's own; a line said after goes under)
  for (const a of screen) for (const b of screen) {
    if (a === b || !(b.size <= a.size * 0.6)) continue;
    const ax = a.inkX || [a.x0, a.x1], bx = b.inkX || [b.x0, b.x1];
    // A declared multiline block pairs neighbouring rows, not every small row with every big row.
    // Only a spatially intervening row of this same block can interrupt a pair; different blocks
    // and legacy unblocked lines keep the old all-pairs rules. Overlap is still checked below.
    const cy = (l) => l.runs?.length ? (Math.min(...l.runs.map((r) => r.top)) + Math.max(...l.runs.map((r) => r.bottom))) / 2 : (l.y0 + l.y1) / 2;
    if (a.block && a.block === b.block && screen.some((c) => {
      if (c === a || c === b || c.block !== a.block || !(cy(c) > Math.min(cy(a), cy(b)) && cy(c) < Math.max(cy(a), cy(b)))) return false;
      const cx = c.inkX || [c.x0, c.x1];
      return Math.min(cx[1], ax[1]) > Math.max(cx[0], ax[0]) && Math.min(cx[1], bx[1]) > Math.max(cx[0], bx[0]);
    })) continue;
    const overlapX = Math.min(ax[1], bx[1]) - Math.max(ax[0], bx[0]), dy = (b.y0 + b.y1) / 2 - (a.y0 + a.y1) / 2;
    if (overlapX <= 0 || Math.abs(dy) > a.size * 1.4) continue;
    const over = b.y1 <= a.y0 + 4, sb = saidAt(said, b.text), sa = saidAt(said, a.text), kicker = sb >= 0 && sa >= 0 && sb < sa;
    if (over && !kicker) { e.push(`${pre}"${b.text}" sits over "${a.text}": the small line goes under the big one (over it only as a kicker said first)`); continue; }
    if (!over && kicker && b.y0 >= a.y1 - 4) { e.push(`${pre}"${b.text}" is said before "${a.text}": it stands over it as its kicker`); continue; }
    const gap = (over ? a.y0 - b.y1 : b.y0 - a.y1) / a.size, [lo, hi] = B.pair.gap;
    // by the ink when the line has it (a film set by the bible): one gap, the eye's (the user 2026-10-28: 间隔 … 应该可以更规范的)
    const ink = (l) => (l.runs?.length ? [Math.min(...l.runs.map((r) => r.top)), Math.max(...l.runs.map((r) => r.bottom))] : null), ia = ink(a), ib = ink(b);
    if (ia && ib && B.pair.inkGap != null) { const g2 = (over ? ia[0] - ib[1] : ib[0] - ia[1]) / a.size; if (Math.abs(g2 - B.pair.inkGap) > B.pair.inkGapTol) e.push(`${pre}"${b.text}" stands ${g2.toFixed(2)} of a size from "${a.text}" by their ink (the pair's gap is ${B.pair.inkGap})`); }
    // (one edge to a few px: a pair is set on it by construction, so the optical grid's 24 px hid two lines drifting 13 px apart)
    const pt = B.pair.edgeTol;
    if (!(Math.abs(ax[0] - bx[0]) <= pt || Math.abs(ax[1] - bx[1]) <= pt || Math.abs((ax[0] + ax[1]) / 2 - (bx[0] + bx[1]) / 2) <= pt)) e.push(`${pre}"${b.text}" under "${a.text}" is not on its edge (left ${Math.round(bx[0])} against ${Math.round(ax[0])})`);
    if (!(ia && ib && B.pair.inkGap != null) && (gap < lo - 0.02 || gap > hi + 0.02)) e.push(`${pre}"${b.text}" stands ${gap.toFixed(2)} of a size under "${a.text}" (${lo}–${hi})`);
  }
  // no line over another on the settled frame, a name printed on the world as much as one on the screen (B05: 地中海 on the
  // map ran into the kicker 亞洲到歐洲 — the chapter's geometry check let a world label pass; a blind review caught it)
  // (by the ink when the lines have it: a pair at its gap of 0.15 has boxes that overlap — a box runs 0.14 of a size under
  // its baseline, a figure's ink does not)
  const vy = (l) => (l.runs?.length ? [Math.min(...l.runs.map((r) => r.top)), Math.max(...l.runs.map((r) => r.bottom))] : [l.y0, l.y1]);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j], [ay0, ay1] = vy(a), [by0, by1] = vy(b);
    const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(ay1, by1) - Math.max(ay0, by0); if (ix <= 0 || iy <= 0) continue;
    if (ix * iy > 0.1 * Math.min((a.x1 - a.x0) * (ay1 - ay0), (b.x1 - b.x0) * (by1 - by0))) e.push(`${pre}"${a.text}" and "${b.text}" run into each other: move one clear`); }
  // key figures and titles on the screen, not riding a moving thing; a label on a thing big enough to read
  for (const l of L.filter((x) => x.kind === 'pinned' && !x.texture && !x.inScene)) {
    // (a key figure: a place's name on its map grows as the camera comes in and is still its label — 地中海, 紅海 at 197 px
    // on Suez's chart under the push; a figure riding the world is the fault: 400米 on the ship's deck)
    if (/\d/.test(l.text) && l.size >= B.scale.title * (1 - B.scale.tolerance)) e.push(`${pre}"${l.text}" (${Math.round(l.size)} px) rides a thing in the 3D world: a key figure or a title stands on the screen's grid (a label on its thing may ride it)`);
    else if (l.size < B.scale.caption * (1 - B.scale.tolerance)) e.push(`${pre}"${l.text}" on its thing is ${Math.round(l.size)} px (the caption's ${B.scale.caption} at least)`);
  }
  e.push(...designErrors(L, B, pre, { grid }));
  return e;
}
// (pure, tested) the design rules a mature studio holds a frame to (TYPE.md 成熟规范; the user 2026-10-28: 上网找最好的设计规范
// 字体的 排版的 嵌入进去 要特别成熟 才行): a frame's display type set as a designed block (typeBlock, spreadWord, pair, peakType,
// evidenceCard, stackType), never by hand; a block's lines on one axis by their ink; a word in the world never paired with a
// line on the screen (Suez's open: 一艘船 on the ship and its line under it on no common axis); on the settled frame, one
// thing read first and three levels at most, each two levels apart by 1.5 at least (hierarchy: size contrast), and two
// blocks further apart than a block's own lines (proximity: what belongs together is closer)
const lvl = (l, B) => stepOf(l.size, B) || `${Math.round(l.size)}px`;
export function designErrors(L, B, pre = '', { grid = true } = {}) {
  const e = [], D = B.design, screen = L.filter((l) => l.kind === 'screen' && (l.alpha ?? 1) >= 0.9);
  // set by hand: display type outside a designed block (lines recorded without blocks are the greybox's and older films': not judged)
  if (L.some((l) => l.block)) for (const l of screen) if (!l.block && l.size >= B.scale.title * (1 - B.scale.tolerance)) e.push(`${pre}"${l.text}" is display type set by hand: set the frame's words as one block (kit2 typeBlock, spreadWord, pair)`);
  // a block on one axis by its ink
  const blocks = {}; for (const l of screen) if (l.block) (blocks[l.block] ||= []).push(l);
  for (const [id, ls] of Object.entries(blocks)) { if (ls.length < 2 || /^spread:/.test(id)) continue; const xs = ls.map((l) => l.inkX || [l.x0, l.x1]), t = D.axisTol;
    const on = (f) => { const v = xs.map(f); return Math.max(...v) - Math.min(...v) <= t; };
    if (!(on((x) => x[0]) || on((x) => x[1]) || on((x) => (x[0] + x[1]) / 2))) e.push(`${pre}the block "${ls.map((l) => l.text).join(' / ')}" stands on no one axis by its ink (left, centre or right within ${t} px)`); }
  // a word in the world paired with a line on the screen
  for (const w of L.filter((l) => l.kind === 'pinned' && !l.texture && l.size >= B.scale.title * (1 - B.scale.tolerance))) for (const s of screen) {
    const ox = Math.min(w.x1, s.x1) - Math.max(w.x0, s.x0), dy = s.y0 >= w.y1 ? s.y0 - w.y1 : w.y0 >= s.y1 ? w.y0 - s.y1 : 0;
    if (ox > 0 && dy < w.size * 0.6) e.push(`${pre}"${s.text}" on the screen is paired with "${w.text}" in the world: a pair is one block on the screen (or both on the thing)`); }
  // a label on its thing stands by it (kit2 labelBy / labelOn record the thing): no further than 1.5 of its size
  for (const l of screen) if (l.anchor) { const [ax0, ay0, ax1, ay1] = l.anchor, ix = l.inkX || [l.x0, l.x1], gx = Math.max(ax0 - ix[1], ix[0] - ax1, 0), gy = Math.max(ay0 - l.y1, l.y0 - ay1, 0), dd = Math.hypot(gx, gy);
    if (dd > D.labelNear * l.size) e.push(`${pre}"${l.text}" stands ${Math.round(dd)} px from the thing it names (${Math.round(D.labelNear * l.size)} at most: set it beside it, kit2 labelBy)`); }
  if (!grid) return e;
  // hierarchy: one thing read first, three levels at most, each apart by the scale's contrast
  const levels = [...new Set(screen.filter((l) => l.size >= B.scale.caption * 0.9).map((l) => l.size))].sort((a, b) => b - a), steps = [...new Set(levels.map((s) => lvl({ size: s }, B)))];
  if (steps.length > D.levelsMax) e.push(`${pre}${steps.length} levels of type in one frame (${steps.join(', ')}): ${D.levelsMax} at most — headline, line, caption`);
  for (let i = 1; i < levels.length; i++) if (levels[i - 1] / levels[i] < D.levelContrast && lvl({ size: levels[i - 1] }, B) !== lvl({ size: levels[i] }, B)) e.push(`${pre}two levels of type ${Math.round(levels[i - 1])} and ${Math.round(levels[i])} px are too close to read as two (${D.levelContrast}× apart at least): one level, or further apart`);
  const top = screen.filter((l) => levels.length && l.size === levels[0]), tops = new Set(top.map((l) => l.block || l.text));
  if (levels.length && levels[0] >= B.scale.title * (1 - B.scale.tolerance) && tops.size > 1) e.push(`${pre}${tops.size} things at the largest size (${[...tops].join(', ')}): one is read first`);
  // proximity: two blocks further apart than a block's own lines (a frame whose lines carry their blocks: a greybox's and older
  // films' lines do not, and a pair of theirs would read as two groups)
  if (!L.some((l) => l.block)) return e;
  const unit = (l) => l.block || `line:${l.text}`, ink = (l) => (l.runs?.length ? [Math.min(...l.runs.map((r) => r.top)), Math.max(...l.runs.map((r) => r.bottom))] : [l.y0, l.y1]);
  for (let i = 0; i < screen.length; i++) for (let j = i + 1; j < screen.length; j++) { const a = screen[i], b = screen[j]; if (unit(a) === unit(b)) continue;
    const [ay0, ay1] = ink(a), [by0, by1] = ink(b), ax = a.inkX || [a.x0, a.x1], bx = b.inkX || [b.x0, b.x1];
    const gx = Math.max(bx[0] - ax[1], ax[0] - bx[1]), gy = Math.max(by0 - ay1, ay0 - by1), m = Math.max(a.size, b.size) * D.apart;
    if (gx < m && gy < m && Math.max(gx, gy) >= 0) e.push(`${pre}"${a.text}" and "${b.text}" are two groups set as close as one (${Math.round(Math.max(gx, gy))} px; ${Math.round(m)} at least apart, or make them one block)`); }
  return e;
}
// (pure, tested) every moment of a chapter, not one settled frame (the user 2026-10-28: 为什么检查不出来 — a pair aligned
// at the keyframe drifted apart later in the beat, and a label that came after the keyframe was never seen): the rules
// that hold at every moment — figures and words one height, a pair on its edge, at its gap, in the narration's order, no
// line run into another, a key figure on the screen — on each sample of the geometry track where the lines stand full;
// a fault standing GEO hold (0.8 s) fails its beat. The grid and the margins stay with the settled frame (a camera may
// carry a line through them)
export function trackBibleErrors(track, shots, B, saidOf = () => '', { step = 0.2, hold = 0.8 } = {}) {
  const seen = new Map();   // a fault (its numbers left out) -> its first words and the times it stood
  for (const f of track || []) { const s = (shots || []).find((x) => f.t >= x.at && f.t < x.at + x.dur); if (!s) continue;
    const drawn = (f.drawn || []).filter((d) => (d.alpha ?? 1) >= 0.9);
    for (const m of new Set(typeBibleErrors(drawn, B, s.shotId, saidOf(s), { grid: false }))) { const k = m.replace(/-?\d+(\.\d+)?/g, '#'); (seen.get(k) || seen.set(k, { m, ts: [] }).get(k)).ts.push(f.t); } }
  const out = [];
  for (const { m, ts } of seen.values()) { const spans = []; for (const t of ts) { const q = spans[spans.length - 1]; if (q && t - q[1] <= step * 1.5) q[1] = t; else spans.push([t, t]); }
    const long = spans.filter(([a, b]) => b - a + step >= hold - 1e-6); if (long.length) out.push(`${m} (${long.map(([a, b]) => `${a.toFixed(1)}-${(b + step).toFixed(1)} s`).join(', ')})`); }
  return out;
}
// (pure, tested) a line stays long enough to be read twice over at the reading speed of screen Chinese (Netflix's timed
// text: 9 characters a second for adults) and a little more: full on the screen for chars / readCps + readPad s at least
export function readTimeErrors(track, B, { step = 0.2 } = {}) {
  const D = B.design, seen = new Map(), out = [], T = track?.length ? track[track.length - 1].t : 0;
  for (const f of track || []) for (const l of linesOf((f.drawn || []).filter((d) => (d.alpha ?? 1) >= 0.9 && !d.pin && !d.surface))) { const k = l.text, r = seen.get(k); if (r && f.t - r.t1 <= step * 1.5) r.t1 = f.t; else { if (r) r.done.push([r.t0, r.t1]); seen.set(k, { t0: f.t, t1: f.t, done: r?.done || [] }); } }
  for (const [k, r] of seen) { const n = [...k.replace(/[\s·・,，。、]/g, '')].length, need = n / D.readCps + D.readPad;
    for (const [a, b] of [...r.done, [r.t0, r.t1]]) if (b - a + step < need - 1e-6 && a > 0 && b < T - 1e-6) out.push(`"${k}" stands full for ${(b - a + step).toFixed(1)} s (${a.toFixed(1)}-${(b + step).toFixed(1)} s): ${n} characters need ${need.toFixed(1)} s at ${D.readCps} a second`); }
  return out;
}
// (pure, tested) the film's figures at one size: the key figures of its beats (digits, a figure's size or more) on one step,
// the hero beats apart
export function filmTypeErrors(byBeat, B, heroes = new Set()) {
  const figs = [];
  for (const [beat, drawn] of Object.entries(byBeat)) if (!heroes.has(beat)) for (const l of linesOf(drawn)) if (/\d/.test(l.text) && l.size >= B.scale.title * 0.9) figs.push({ beat, text: l.text, step: stepOf(l.size, B), size: Math.round(l.size) });
  const steps = [...new Set(figs.map((f) => f.step || `${f.size}px`))];
  return steps.length > 1 ? [`film: its key figures stand at ${steps.join(', ')} (${figs.map((f) => `${f.beat} ${f.text} ${f.size}`).join('; ')}): one size for one role across the film`] : [];
}
// the film's type read off every chapter's settled frames (a film set by the bible): its figures at one size
export async function filmTypeReport(cfg, id) {
  const { projectPaths, loadProject } = await import('./store.mjs'), root = projectPaths(cfg, id).root;
  if (!(loadProject(cfg, id) || {}).typeBible) return [];
  const dir = path.join(root, 'out', 'chapters'), byBeat = {};
  for (const ch of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const d = path.join(dir, ch); if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d).filter((x) => /^key-\d+-B\d+\.shapes\.json$/.test(x))) { try { byBeat[f.match(/(B\d+)/)[1]] = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).drawn; } catch { /* unread */ } } }
  const fd = (await import('./filmdesign.mjs')).acceptedFilmDesign(cfg, id), heroes = new Set((fd?.beats || []).filter((r) => r.hero).map((r) => r.beat));
  return filmTypeErrors(byBeat, loadBible(cfg), heroes);
}
