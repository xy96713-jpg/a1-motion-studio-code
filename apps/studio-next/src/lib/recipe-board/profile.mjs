// A film's style profile: whose way with type and light it follows. `gawx` is the house fusion (style-lab
// SYNTHESIS-house-style-20261027.md): Gawx's colour and type, 回形针's motion and texture, 胡泊's evidence cards. The two films the line learned from first
// (回形针, 胡泊) set a big figure on almost every beat on a lit ground; the creators the user follows now (Gawx Art,
// measured 2026-10-27: style-lab/RESEARCH-film-finish-20261027.md) keep three frames in four free of words, set the
// biggest line at a median 4 % of the frame's height, make big type a rare event (2.6 % of frames), put most big words
// on things in the scene (a chalkboard, a label, a poster), and grade the picture low-key (median luma 0.12-0.21). The
// user 2026-10-27: 先做字的密度、字长在实物上、画面低调化，这三件一起改进系统.
//
// project.json `profile` (or the style's) names it; a film without one keeps the line's older way ('paperclip').
//   profileFor(project, style)            -> the profile
//   typeDensityErrors(track, shots, P)    big free type held longer than the profile allows, beat by beat
//   surfaceTypeErrors(track, shots, P)    too few of the chapter's words on things in the scene
//   lowKeyErrors(rows, P, chapterId)      the keyframes lit brighter than the profile's (rows: ground.py, mean 0-1)
//   colourErrors(rows, P, chapterId)      the keyframes' colour structure: one family, a little strong colour (ground.py)
//   pairErrors(track, shots, P)           free lines on screen together that neither align nor step in size
//   surfaceReadErrors(track, shots, P)    words on things too small or too slanted to read
//   figureGroundErrors(rows, P)           the subject lit off a quiet ground at each keyframe
import fs from 'node:fs';
import path from 'node:path';
import { readStyle } from './filmlook.mjs';

export const PROFILES = {
  paperclip: { id: 'paperclip', figureMin: 72, bigPx: null, bigShareMax: null, freeLinesMax: null, surfaceMin: null, lumaMax: null, lowKey: false },
  gawx: {
    id: 'gawx',
    // a figure the line says may stand small (the floor for readable CJK); big type is the rare event
    figureMin: 34,
    // big: 12 % of the frame's height (130 px of 1080); held on at most this share of a beat's time as free type
    bigPx: 130, bigShareMax: 0.2,
    // free lines on screen at once
    freeLinesMax: 2,
    // of the chapter's word-time, at least this share on things in the scene (type.surfaceType, printOn, ground type)
    surfaceMin: 0.35,
    // the keyframes' mean luma (ground.py lum), most of them under this
    lumaMax: 0.36, lowKey: true, lightsMin: 0.45,
    // colour (style-lab RESEARCH-colour-type-20261027): most keyframes carry one family of colour on 2 % of the frame or
    // more (not a dead grey), strong colour on 6 % at most, two families at most
    familyMin: 0.02, strongMax: 0.04, familiesMax: 2,
    // two free lines at once are a pair: they share an edge or a centre, the big one 1.5 times the small or more
    pairRatio: 1.5, alignPx: 14,
    // design before code: a brief beat by beat from the composition grammar, and a taste review of the style frames
    // before a chapter is accepted (beatdesign.mjs; the user 2026-10-27: 先做设计先行)
    designFirst: true,
  },
};
// Explicit authority scope: TYPE projects keep legacy measured style quotas as
// review notes, not instructions to darken/recolour the design or move titles onto objects.
// Unmigrated profiles retain their historical checks; readability never downgrades.
export function profileRuleScope(project = {}, rule) {
  return project.typeBible === true && ['surface-quota', 'brightness-quota', 'type-density', 'colour-quota'].includes(rule) ? 'note' : 'error';
}
export const PROFILE_IDS = Object.keys(PROFILES);
export function profileFor(project = {}, style = null) { return PROFILES[project.profile || style?.profile] || PROFILES.paperclip; }
export function profileOf(cfg, id) {
  try {
    const project = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'projects', id, 'project.json'), 'utf8'));
    return profileFor(project, readStyle(cfg, project.style));
  } catch { return PROFILES.paperclip; }
}

const beatOf = (shots, t) => { let b = shots[0]; for (const s of shots) if (s.at <= t + 1e-6) b = s; return b; };
const free = (d) => !d.object && !d.surface && !d.readout && !d.deco && (d.alpha ?? 1) >= 0.3;

// (pure) a beat where a free line of big type stands longer than the profile allows: big type is the rare event
export function typeDensityErrors(track, shots, P) {
  if (!P?.bigPx || !track?.length || !shots?.length) return [];
  const by = new Map();
  for (const f of track) {
    const s = beatOf(shots, f.t), r = by.get(s.shotId) || { n: 0, big: 0, lines: 0, says: {} };
    const fl = (f.drawn || []).filter(free), big = fl.filter((d) => d.size >= P.bigPx);
    r.n++; if (big.length) { r.big++; for (const d of big) r.says[d.whole || d.text] = (r.says[d.whole || d.text] || 0) + 1; }
    if (P.freeLinesMax && new Set(fl.map((d) => d.whole || d.text)).size > P.freeLinesMax) r.lines++;
    by.set(s.shotId, r);
  }
  const out = [];
  for (const [b, r] of by) {
    const say = Object.entries(r.says).sort((x, y) => y[1] - x[1]).map(([k]) => k).slice(0, 2).join('", "');   // the lines that stand longest
    if (r.n >= 5 && r.big / r.n > P.bigShareMax) out.push(`${b}: big free type ("${say}", ${P.bigPx} px and up) stands ${Math.round((100 * r.big) / r.n)} % of the beat (the ${P.id} profile: a rare event, ${Math.round(P.bigShareMax * 100)} % at most): print it on something in the scene (type.surfaceType, printOn, groundType) or set it small`);
    if (P.freeLinesMax && r.n >= 5 && r.lines / r.n > 0.25) out.push(`${b}: more than ${P.freeLinesMax} free lines on screen ${Math.round((100 * r.lines) / r.n)} % of the beat (the ${P.id} profile): one line, most of the time none`);
  }
  return out;
}

// (pure) the chapter's words: how much of their time on screen they stand on things (a surface, an object) and not free
export function surfaceTypeErrors(track, shots, P, chapterId = 'chapter') {
  if (P?.surfaceMin == null || !track?.length) return [];
  let on = 0, all = 0;
  for (const f of track) for (const d of f.drawn || []) { if ((d.alpha ?? 1) < 0.3 || d.readout || d.deco) continue; const w = [...String(d.text)].length; all += w; if (d.object || d.surface || d.anchor) on += w; }   // (a label set by the thing it names — kit2 labelBy — names that thing)
  if (all < 20) return [];
  return on / all < P.surfaceMin ? [`${chapterId}: ${Math.round((100 * on) / all)} % of the chapter's words stand on things in the scene (the ${P.id} profile: ${Math.round(P.surfaceMin * 100)} % at least): paint a name on the hull, stencil a figure on a container, write it on the chart (type.surfaceType), instead of setting it over the picture`] : [];
}

// (pure) the keyframes lit brighter than the profile: rows [{ mean }] from ground.py
export function lowKeyErrors(rows, P, chapterId = 'chapter') {
  if (!P?.lowKey || !rows?.length) return [];
  const lit = rows.filter((r) => r.mean != null && r.mean > P.lumaMax);
  // and low-key is not dull: the lights still reach up (Gawx's 99th percentile .50-.81; the Suez white model stood at .39,
  // a brown murk with nothing lit — the user 2026-10-27: 尤其是设计美学方面)
  const dull = rows.filter((r) => r.hi != null && r.hi < P.lightsMin);
  if (P.lightsMin && dull.length * 2 > rows.length) return [`${chapterId}: nothing on its keyframes is lit (their lights reach ${rows.map((r) => (r.hi ?? 0).toFixed(2)).join(' ')}; the ${P.id} profile: ${P.lightsMin} or more): low-key with a light — the lamp's pool bright on what is looked at, a pale thing in it, the rest falling to dark`];
  return lit.length * 2 > rows.length ? [`${chapterId}: its keyframes are lit high (mean luma ${rows.map((r) => (r.mean ?? 0).toFixed(2)).join(' ')}; the ${P.id} profile is low-key, under ${P.lumaMax}): a dark ground with the light in pools on what matters (a lamp over the chart, the sun on the ship), not a lit sheet`] : [];
}

// (pure) the keyframes' colour against the profile: rows [{ neutral, strong, families, family }] from ground.py. The
// creators measured keep half to four fifths of the frame neutral, one family of colour (4-12 % of it) in tones of one
// hue, and strong colour on 0.4-3.5 %; the Suez white model, its glow taken away, came out with none at all
// A map chapter (mono: its brief's beats mostly take a mono composition, compositions.json palettes) is a clean neutral
// chart with the accent in one place, as 回形针's maps (the user 2026-10-27: 地图章节按回形针做 … 颜色族不要求铺满画面): no
// family of colour is asked of it, at most one (the accent's), strong colour capped as anywhere
export function colourErrors(rows, P, chapterId = 'chapter', { mono = false } = {}) {
  if (P?.familyMin == null || !rows?.length) return [];
  const out = [], has = rows.filter((r) => r.family != null), half = (n) => n * 2 > has.length, most = mono ? 1 : P.familiesMax;
  if (!has.length) return [];
  const dead = mono ? [] : has.filter((r) => r.family < P.familyMin), loud = has.filter((r) => r.strong > P.strongMax), many = has.filter((r) => r.families > most);
  if (half(dead.length)) out.push(`${chapterId}: its keyframes carry no family of colour (the biggest covers ${has.map((r) => Math.round(r.family * 1000) / 10 + '%').join(' ')}; the ${P.id} profile: ${P.familyMin * 100} % or more): lay one family of the accent's hue in its tones over the things of the scene (design.palette.tones: rust, ochre, umber), the accent itself only on the one thing`);
  if (half(loud.length)) out.push(`${chapterId}: strong colour covers ${loud.map((r) => Math.round(r.strong * 100) + '%').join(' ')} of its keyframes (the ${P.id} profile: ${P.strongMax * 100} % at most): the accent on the one thing looked at, the rest in its quieter tones`);
  if (half(many.length)) out.push(mono ? `${chapterId}: ${many.map((r) => r.families).join(' ')} families of colour on a map chapter's keyframes (one at most: the accent in one place on a neutral chart; no warm light washed over it)` : `${chapterId}: ${many.map((r) => r.families).join(' ')} families of colour on its keyframes (the ${P.id} profile: ${P.familiesMax} at most): one hue in its tones, a second only where the subject has it (the sea)`);
  return out;
}

// (pure) two or more free lines on screen together: the two biggest share a left edge, a centre or a right edge
// (within alignPx), and the big one is pairRatio times the small or more — a word and its line, never two loose
// labels of a size (the creators measured: TAIWAN / MANUFACTURING, €480,000 / average advance for first time directors)
export function pairErrors(track, shots, P) {
  if (!P?.pairRatio || !track?.length || !shots?.length) return [];
  const by = new Map();
  for (const f of track) {
    const fl = [], seen = new Set();
    for (const d of f.drawn || []) { if (!free(d) || (d.alpha ?? 1) < 0.5 || d.size < 22) continue; const k = d.whole || d.text; if (seen.has(k)) continue; seen.add(k); fl.push(d); }
    if (fl.length < 2) continue;
    const [a, b] = fl.sort((x, y) => y.size - x.size), s = beatOf(shots, f.t).shotId, r = by.get(s) || { n: 0, bad: 0, say: null };
    const aligned = Math.abs(a.x0 - b.x0) <= P.alignPx || Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2) <= P.alignPx || Math.abs(a.x1 - b.x1) <= P.alignPx;
    const stepped = a.size / b.size >= P.pairRatio;
    r.n++; if (!aligned || !stepped) { r.bad++; r.say ||= `"${a.whole || a.text}" ${Math.round(a.size)} px and "${b.whole || b.text}" ${Math.round(b.size)} px${aligned ? '' : ', on no shared edge'}${stepped ? '' : ', one size'}`; }
    by.set(s, r);
  }
  const out = [];
  for (const [b, r] of by) if (r.bad >= 5 && r.bad / r.n > 0.3) out.push(`${b}: free lines on screen together do not pair (${r.say}; ${Math.round((100 * r.bad) / r.n)} % of the time): set them as one pair — the word and its line on one edge, the line a half or a third its size (type.flat.pair) — or put one on the thing it names`);
  return out;
}

// (pure) words on things that do not read: a word printed on a surface is a line offered to be read while it shows
// (the hull's name far off excepted: it is read when its beat is close). Over the frames it is fully shown, its median
// height on screen at least the readable floor, its median slant within 20 degrees of level (the Suez white model,
// 2026-10-27: 擱淺, 400米, 偏出航道, 排隊, 2.7萬立方米 printed flat on the ground came out small and askew — the user:
// 你客观看看还有哪些问题 尤其是设计美学方面). A label on a map stands upright on its point (surfaceType face: 'camera').
export const READ_MIN = 34, SLANT_MAX = 20, READ_HOLD = 0.8;
export function surfaceReadErrors(track, shots, P) {
  if (!P?.surfaceMin || !track?.length) return [];
  const by = new Map();
  for (const f of track) for (const d of f.drawn || []) {
    if (!d.surface || d.texture || (d.alpha ?? 1) < 0.5) continue;
    const r = by.get(d.text) || { sizes: [], turns: [], at: [], t: f.t }; r.sizes.push(d.size); r.at.push(f.t); if (d.turn != null) r.turns.push(Math.abs(((d.turn + 540) % 360) - 180) > 90 ? 180 - Math.abs(((d.turn + 540) % 360) - 180) : Math.abs(((d.turn + 540) % 360) - 180)); by.set(d.text, r);
  }
  const med = (v) => { const a = [...v].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  const out = [];
  for (const [text, r] of by) {
    if (r.sizes.length < 5) continue;
    const b = beatOf(shots, r.t).shotId, sz = med(r.sizes), tn = med(r.turns);
    const slant = tn == null ? null : Math.min(tn, 180 - tn);
    // a stretch under the size standing READ_HOLD s fails too, not only the median (沙土和淤泥 sat at 37 px, then 31 as the
    // camera drew back, and the review read 21: Suez B10, 2026-10-27)
    let start = null, worst = Infinity, low = null; for (let i = 0; i < r.sizes.length; i++) { const gap = i > 0 && r.at[i] - r.at[i - 1] > 0.45; if (r.sizes[i] >= READ_MIN || gap) { start = null; worst = Infinity; } if (r.sizes[i] < READ_MIN) { if (start == null) start = r.at[i]; worst = Math.min(worst, r.sizes[i]); if (r.at[i] - start >= READ_HOLD && !low) low = { t: r.at[i], px: worst }; } }
    if (sz >= READ_MIN && low) { out.push(`${beatOf(shots, low.t).shotId}: "${text}" on its surface shrinks to ${Math.round(low.px)} px for ${READ_HOLD} s or more (at least ${READ_MIN}, by ${low.t.toFixed(1)} s): set it larger on the thing, or let it go before the camera draws back`); continue; }
    if (sz < READ_MIN) out.push(`${b}: "${text}" on its surface reads at ${Math.round(sz)} px (at least ${READ_MIN}): set it larger on the thing, or stand it up on its point facing the camera (surfaceType face: 'camera')`);
    else if (slant != null && slant > SLANT_MAX) out.push(`${b}: "${text}" on its surface slants ${Math.round(slant)} degrees on screen (at most ${SLANT_MAX}): turn it to read level from where the camera stands, or stand it up on its point (face: 'camera')`);
  }
  return out;
}

// (pure) the subject stands off its ground at each keyframe: rows [{ beat, things, figL, gndL, figEdge, gndEdge }] read
// off the frame (morph.js __figureGround: the 3D things that are not ground, and the words, against the rest). The
// mature frames this line learnt from (回形针 Vol.138, Gawx) keep a quiet ground and a figure lit off it; Suez's globe
// before a rust wall had neither (the user 2026-10-27: 背景铁锈不好)
export const FG_SEP = 0.1, FG_CONTRAST = 0.12, FG_BUSY = 1.0;
export function figureGroundErrors(rows, P) {
  if (!P?.designFirst || !rows?.length) return [];
  const out = [];
  for (const r of rows) {
    if (r.things < 0.02) continue;   // a frame of words and flat drawing: no 3D figure to stand off
    if ((r.sep ?? 0) < FG_SEP && Math.abs(r.figL - r.gndL) < FG_CONTRAST) out.push(`${r.beat}: the subject does not stand off its ground (a step of ${r.sep ?? 0} across its outline, at least ${FG_SEP}; lightness ${r.figL} against ${r.gndL}): a rim or key light on its edge, or quiet and darken the ground behind it (compositions.json grounds.rule)`);
    if (r.gndEdge > r.figEdge * FG_BUSY) out.push(`${r.beat}: the ground is busier than the subject (detail ${r.gndEdge} against ${r.figEdge}): a quiet ground — halftone or a dark place out of focus — not a patterned plate`);
  }
  return out;
}
