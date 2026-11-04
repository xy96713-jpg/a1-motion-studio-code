// Sequence review: the film looked at as a sequence, not shot by shot. Every still can pass on its own and
// the film still be wrong: one page shown in two beats in a row (hupo-auto2 B02/B03), two cuts that look
// the same, a long stretch without the presenter. Rules only (no model), after render; the director pass
// (direct.mjs) reads the result.
//
// What the reference does (style-lab/reference-hupo/cuts-labelled.json, 139 cuts): a news page is followed
// by another page cut 8 of 18 times, and every one of those is the same reading going on (the camera moves
// on to the next line); it never re-opens a page it has just shown. After a page it goes back to the
// presenter, with or without tags, 7 of 18 times.
//
//   out/sequence-review.json   { issues: [{ code, level, shots, message }], hashes }
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { projectPaths, loadShots, loadProject, readPlan } from './store.mjs';
import { showsPresenter } from './medium.mjs';
import { saysSame } from './cardgeometry.mjs';

const readJson = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);

// the shots in film order (the plan's beat order; file order otherwise)
export function filmOrder(cfg, id) {
  const shots = loadShots(cfg, id);
  const order = (readPlan(cfg, id)?.beats || []).map((b) => b.id);
  const at = (s) => { const i = order.indexOf(s.shotId); return i < 0 ? 1e6 : i; };
  return [...shots].sort((a, b) => at(a) - at(b) || a.shotId.localeCompare(b.shotId));
}

// What a shot shows as evidence: source urls (materials bindings) and material files without the
// project/shot prefix the fetch step gives every copy (the same page fetched for B02 and B03 is one page).
// Map source -> { kind: 'page' | 'picture', view } — a page's view is where its reading window sits.
export function sourcesOf(shot, bindings = {}, project = '') {
  const out = new Map();
  const shown = JSON.stringify([shot.slots, (shot.scenes || []).map((sc) => sc.slots)]);
  for (const [k, b] of Object.entries(bindings)) {
    if (k.split('~')[0] !== shot.shotId) continue;
    // a binding left over from before the shot was rewritten is not on screen
    const stem = b.file ? path.basename(b.file).replace(/\.[a-z0-9]+$/i, '') : '';
    if (!stem || !shown.includes(stem)) continue;
    if (b.url) out.set(b.url, { kind: b.role === 'page' || b.archive ? 'page' : 'picture', view: b.archive?.readTop ?? null });
  }
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'asset' && typeof v === 'string' && /materials\/clips\//.test(v)) {
        const stem = path.basename(v).replace(/\.[a-z0-9]+$/i, '').replace(new RegExp(`^${project}-[A-Za-z0-9]+(~\\d+)?-`), '').replace(/-window$/, '');
        if (![...out.keys()].some((u) => u.startsWith('file:') && u === 'file:' + stem)) out.set('file:' + stem, { kind: 'picture', view: null });
      } else walk(v);
    }
  };
  walk(shot.slots); (shot.scenes || []).forEach((sc) => walk(sc.slots));
  return out;
}

// a 16x16 difference hash of a still (256 bits as a 0/1 string); null when the still is missing
export function stillHash(file) {
  if (!fs.existsSync(file)) return null;
  const buf = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'scale=17:16:flags=area,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  let bits = '';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bits += buf[y * 17 + x] > buf[y * 17 + x + 1] ? '1' : '0';
  return bits;
}
export const hashDistance = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d / a.length; };

const recalls = (shot) => JSON.stringify(shot).match(/"recall":"([^"]+)"/g)?.map((m) => m.slice(10, -1)) || [];
export function layoutFingerprint(shot) {
  const parts = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.box) && o.box.length === 4 && o.box.every(Number.isFinite)) parts.push(o.box.map((n) => n.toFixed(2)).join(','));
    else if (['x', 'y', 'w', 'h'].every((k) => Number.isFinite(o[k]))) parts.push(['x', 'y', 'w', 'h'].map((k) => o[k].toFixed(2)).join(','));
    for (const [k, v] of Object.entries(o)) if (k !== 'asset' && k !== 'gen') walk(v);
  };
  for (const c of shot.scenes?.length ? shot.scenes : [shot]) { parts.push(c.recipe || shot.recipe || 'unknown'); walk(c.slots); }
  return parts.join('|');
}

// Pure: the issues of a sequence. shots in film order with { shotId, sources: Map, presenter, hash, recall: [] }.
//   same-view (error): a page shown again at the same place — the B02/B03 repeat
//   page-again (warning): the same page read further down — fine as one reading, better in one shot
//   picture-again (warning): the same photo, logo or product picture — the reference cuts to another
//     picture of the same subject (its person cuts are 19 different photos)
export function sequenceIssues(shots, { gap = 2, alike = 0.12, overuse = 2 } = {}) {
  const issues = [];
  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j <= Math.min(i + gap, shots.length - 1); j++) {
      const a = shots[i], b = shots[j];
      const meant = b.recall.some((r) => r.includes(a.shotId)) || a.recall.some((r) => r.includes(b.shotId));
      if (meant) continue;
      if (a.information && b.information && saysSame(a.information, b.information)) issues.push({ code: 'information-repeat', level: 'error', shots: [a.shotId, b.shotId],
        message: `${a.shotId} and ${b.shotId} restate the same information; new footage or a new layout does not make it a new beat` });
      for (const [src, x] of a.sources) {
        const y = b.sources.get(src);
        if (!y) continue;
        const name = src.replace(/^file:/, '');
        if (x.kind === 'page' && y.kind === 'page' && x.view === y.view) {
          issues.push({ code: 'same-view', level: 'error', shots: [a.shotId, b.shotId], source: src,
            message: `${b.shotId} opens the same page as ${a.shotId} at the same place (${name}): the reference never re-opens a page it has just shown; after a page it goes back to the presenter (with tags), or the reading goes on in the same shot` });
        } else if (x.kind === 'page' && y.kind === 'page') {
          issues.push({ code: 'page-again', level: 'warning', shots: [a.shotId, b.shotId], source: src,
            message: `${b.shotId} reads the same page as ${a.shotId} further on (${name}): keep it as one reading (one shot moving down the page) or give the second beat the presenter` });
        } else {
          issues.push({ code: 'picture-again', level: 'warning', shots: [a.shotId, b.shotId], source: src,
            message: `${b.shotId} shows the same picture as ${a.shotId} (${name}): use another picture of the same subject, or the presenter` });
        }
        break;
      }
    }
    const a = shots[i], b = shots[i + 1];
    if (b && a.hash && b.hash && !a.presenter && !b.presenter && !b.recall.length) {
      const d = hashDistance(a.hash, b.hash);
      if (d < alike) issues.push({ code: 'look-alike', level: 'warning', shots: [a.shotId, b.shotId], distance: +d.toFixed(3),
        message: `${a.shotId} and ${b.shotId} look almost the same (${Math.round(d * 100)}% different): the cut will read as a repeat; change what the second shows or merge them` });
    }
  }
  let run = [];
  const flushLayout = () => {
    if (run.length >= 3) issues.push({ code: 'layout-repeat', level: 'error', shots: run.map((s) => s.shotId),
      message: `${run.map((s) => s.shotId).join('/')} repeat one composition three times; a flash or different material is not a new visual sentence` });
    run = [];
  };
  for (const s of shots) {
    if (s.layout && !s.recall.length && run.length && run[0].layout === s.layout) run.push(s);
    else { flushLayout(); if (s.layout && !s.recall.length) run = [s]; }
  }
  flushLayout();
  // film-wide: one picture in more than `overuse` shots (recaps aside) reads as a film short of material
  const uses = new Map();
  // the brief's motif (the reference's dollar b-roll, 6 times) comes back on purpose: not counted
  for (const s of shots) for (const [src, x] of s.sources) if (x.kind === 'picture' && !s.recall.length && !s.motif) uses.set(src, [...(uses.get(src) || []), s.shotId]);
  for (const [src, ids] of uses) if (ids.length > overuse) issues.push({ code: 'overused', level: 'warning', shots: ids, source: src,
    message: `the same picture is on screen in ${ids.length} shots (${ids.join(',')}): ${src.replace(/^file:/, '')}; find other pictures of the subject` });
  return issues;
}

export function reviewSequence(cfg, id) {
  const p = projectPaths(cfg, id);
  const project = loadProject(cfg, id);
  const bindings = readJson(path.join(p.root, 'materials', 'bindings.json'), { shots: {} }).shots || {};
  const cacheFile = path.join(p.out, 'sequence-review.json');
  const prev = readJson(cacheFile, { hashes: {} }).hashes || {};
  const hashes = {};
  const shots = filmOrder(cfg, id).map((s) => {
    const still = path.join(p.candidates, `${s.shotId}.png`);
    const stamp = fs.existsSync(still) ? `${fs.statSync(still).size}:${Math.round(fs.statSync(still).mtimeMs)}` : '';
    hashes[s.shotId] = stamp && prev[s.shotId]?.stamp === stamp ? prev[s.shotId] : { stamp, hash: stamp ? stillHash(still) : null };
    return { shotId: s.shotId, sources: sourcesOf(s, bindings, id), presenter: s.recipe?.startsWith('presenter') || showsPresenter(project, s), hash: hashes[s.shotId].hash, recall: recalls(s), motif: !!String(s.design?.motifState || '').trim(), information: [s.text, s.design?.screenText].filter(Boolean).join(' '), layout: layoutFingerprint(s) };
  });
  const issues = sequenceIssues(shots);
  fs.mkdirSync(p.out, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify({ at: new Date().toISOString(), issues, hashes }, null, 1) + '\n');
  return { issues };
}

// Material report: how much real material the film shows, against the reference (cuts-labelled.json:
// 74 evidence cuts in 521 s — news 18, people 19, companies 6, data 9, b-roll 20, plus recaps — almost
// every one a different real picture; b-roll is footage). Written to out/material-report.json and given
// to the director with each chapter.
export const REFERENCE_MATERIAL = { seconds: 521, evidenceCuts: 74, brollCuts: 20, personCuts: 19, newsCuts: 18 };
const PICTURE_CARDS = new Set(['footage-plate', 'title-hero-over-photo', 'title-word-broll', 'stamp-over-evidence', 'screen-full', 'person-nameplate', 'person-intro', 'quote-portrait-bw', 'product-side-card', 'presenter-side-card', 'paper-collage-figures', 'article-highlight-dark', 'article-highlight-light']);
export function materialReport(cfg, id) {
  const p = projectPaths(cfg, id);
  const bindings = readJson(path.join(p.root, 'materials', 'bindings.json'), { shots: {} }).shots || {};
  const approvals = readJson(path.join(p.root, 'materials', 'approvals.json'), { batches: [] });
  const decided = new Set(approvals.batches.flatMap((b) => b.items.map((i) => i.shotId)));
  const candidates = readJson(path.join(p.root, 'materials', 'candidates.json'), { shots: {} }).shots || {};
  const shots = filmOrder(cfg, id);
  const sources = new Map();
  let pictureCuts = 0, realCuts = 0, generatedCuts = 0, videoCuts = 0;
  const byChapter = {};
  for (const s of shots) {
    const cuts = s.scenes?.length ? s.scenes.map((sc) => ({ card: sc.recipe || s.recipe, slots: sc.slots || {} })) : [{ card: s.recipe, slots: s.slots || {} }];
    const ch = (byChapter[s.design?.chapter || '?'] ||= { pictureCuts: 0, realCuts: 0, generatedCuts: 0, sources: new Set() });
    for (const c of cuts) {
      if (!PICTURE_CARDS.has(c.card)) continue;
      pictureCuts++; ch.pictureCuts++;
      const js = JSON.stringify(c.slots);
      if (/materials\/clips\//.test(js)) { realCuts++; ch.realCuts++; if (/\.(mp4|mov|webm)/i.test(js)) videoCuts++; }
      else if (/"gen"/.test(js)) { generatedCuts++; ch.generatedCuts++; }
    }
    for (const [src] of sourcesOf(s, bindings, id)) { sources.set(src, [...(sources.get(src) || []), s.shotId]); ch.sources.add(src); }
  }
  const waiting = Object.keys(candidates).filter((k) => (candidates[k].candidates || []).length && !decided.has(k) && candidates[k].need?.kind !== 'presenter');
  const report = {
    at: new Date().toISOString(),
    distinctRealSources: sources.size,
    pictureCuts, realCuts, generatedCuts, videoCuts,
    reused: [...sources].filter(([, ids]) => ids.length > 1).map(([src, ids]) => ({ source: src.replace(/^file:/, ''), shots: ids })),
    waitingForUser: waiting,
    reference: REFERENCE_MATERIAL,
    perMinute: { ours: +(sources.size / ((shots.reduce((a, s) => a + (s.motion?.duration || 0), 0) || 1) / 60)).toFixed(1), reference: +(REFERENCE_MATERIAL.evidenceCuts / (REFERENCE_MATERIAL.seconds / 60)).toFixed(1) },
    byChapter: Object.fromEntries(Object.entries(byChapter).map(([k, v]) => [k, { ...v, sources: v.sources.size }])),
  };
  fs.writeFileSync(path.join(p.out, 'material-report.json'), JSON.stringify(report, null, 1) + '\n');
  return report;
}

