import { assertScopeAllows } from './project-scope.mjs';
// The greybox rough (the user 2026-10-28: 我发现你一直在扣细节 但是整篇走向和设计排版和感觉都没做好呢 我说了粗稿可以很低精度
// 几何模块或者什么的能替代 确保全篇方向什么的 可以一镜镜再渲染). Before any chapter is built, the whole film is laid out
// as low-fidelity frames: every beat its composition in grey blocks (the subject, the context, the evidence, a screen),
// its real words in the house type at their place and size, its palette's ground and its screen named, its camera
// move — a frame a beat and a rough reel on the beats' clock, made in a minute. The direction gate is judged on it: the
// telling, what each beat says, the layout and the type, the colour and the screens across the film, where the hero
// moments are. No model, no material, no detail is judged here; the chapters are built to it afterwards (one session a
// chapter: SOP), each beat's greybox their brief.
//   task greybox (prompts/greybox.md, routing/greybox.schema.json) -> answer: per beat { blocks, type, camera, note }
//   greyboxErrors(answer, beats, facts)   (pure, tested) the line's checks: every beat, inside the frame, type sizes,
//                                         no type over type, at most three lines to read, figures from the beat's words,
//                                         evidence medium → photo|screen evidence plate (evidenceBlockErrors);
//                                         HOUSE mature hard: title-press / evidence-card / no placeholder-main (mature.mjs)
//   renderGreybox(cfg, id, answer)        out/greybox/<beat>.png, sheet.png (with the beat's words and why), greybox.mp4
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { reviewSubmissionStatus } from './agenttask.mjs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { assertRenderStorage, projectPaths, loadProject } from './store.mjs';
import { checkNasMount } from './nas-output.mjs';
import { diskFreeGb, diskError } from './pool.mjs';
import { SEAMS, COVER_SEAMS, worldOrScreenJump, worldOrScreenSwitch, coversWorldJump, illegalSeamOutErrors, worldJumpSeamErrors, cutStreakSeamErrors, hardCutSettleErrors, flashSeamErrors, FLASH_DUR_DEFAULT } from './seams.mjs';
export { SEAMS, COVER_SEAMS, worldOrScreenJump, worldOrScreenSwitch, coversWorldJump } from './seams.mjs';
import os from 'node:os';
import { grid as TG } from '../../../../../work/recipe-board-v1/style-lab/engine/templates/typegrid.js';
import { matureHardErrors, matureFirstDraftErrors } from './mature.mjs';
import { loadDirectorRoutes, pickDirectorDefaultsByBeat, pinRouteDefaultsIntoAnswer, routeUneatenErrors, requiresEventContract, directorIntentErrors, taskScopedDesign, eventTimeErrors } from './directorroutes.mjs';
import { openingKitKindErrors, turnedDownPickErrors, screenFilmedDeviceErrors, labelDistanceErrors, mediaCatalogErrors } from './p1hard.mjs';
export { openingKitKindErrors, turnedDownPickErrors, screenFilmedDeviceErrors, labelDistanceErrors, mediaCatalogErrors, capabilityRouteResolveErrors, greyboxNotFinalStatus, greyboxNotFilmHardStop, retroLessonDrafts, retroHardStepErrors, loadEngineCapabilities, engineCapabilitiesSchemaErrors, engineCapabilitiesStatus, dispatchCapability, resolveEffort, effortStudioChecklistErrors, EFFORT_TIERS, versionTrapErrors, partitionRoughCutWarns, ROUGH_CUT_WARN_RE, houseStylePickErrors, houseStyleRequiredErrors, SCREEN_OK_DEVICES } from './p1hard.mjs';
export { matureHardErrors, matureTitlePressErrors, matureEvidenceCardErrors, maturePlaceholderErrors, matureSpineErrors, matureSpineFlags, matureFirstDraftErrors, claimsMatureFirstDraft, MATURE_CODES, MATURE_FIRST_DRAFT_CODE, PALETTE_HUE_FAMILY } from './mature.mjs';
export { hardCutSettleErrors, flashSeamErrors, FLASH_DUR_MIN, FLASH_DUR_MAX, FLASH_TYPE_READ_MIN, FLASH_READABLE_SIZE, FLASH_DUR_DEFAULT } from './seams.mjs';

export const GREYBOX_STEP = 'greybox';
export const W = 1920, H = 1080, BAND = 935, CJK_MIN = 34, LATIN_MIN = 20, LINES_MAX = 3;
// TYPE.md §7 / type-bible.design — within-frame hierarchy (greybox soft until knife3)
export const TYPE_LEVELS_MAX = 3, TYPE_LEVEL_CONTRAST = 1.5;
export const SHAPES = ['rect', 'ellipse', 'line', 'ship', 'globe', 'map', 'photo', 'screen', 'people', 'chart', 'arrow', 'grid'];   // grid: a share of a hundred drawn as it will be (a data graphic is code: quick, so made as the film has it)
export const ROLES = ['subject', 'context', 'evidence', 'mark'];
export const TYPE_ROLES = ['big', 'small', 'caption', 'number'];
export const MOVES = ['static', 'push', 'pull', 'pan', 'orbit', 'cut'];
// film medium=evidence → greybox must show a readable evidence plate (prompts/greybox.md: 证据拍放 photo/screen，大到看得出是证据)
export const EVIDENCE_SHAPES = ['photo', 'screen'];
export const EVIDENCE_BLOCK_MIN_SHARE = 0.15;   // ≥15 % of the frame (banana B17 ~45 %, suez B02 ~39 %)
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
// the typeplan, when the film has one, decides where each line sits and in what ink: typedesign -> greybox.
export function typePlanRows(rows, plan) {
  const beats = plan?.answer?.beats; if (!Array.isArray(beats)) return rows;
  const by = Object.fromEntries(beats.map((b) => [b.beat, b]));
  return rows.map((r) => { const b = by[r.beat]; if (!b?.lines?.length) return r;
    const type = (r.type || []).map((t, i) => { const pl = b.lines[i]; const q = pl?.perspective?.quad; if (!pl || !q) return t;
      const x0 = Math.min(...q.map((p) => p[0])) * 1920, y0 = Math.min(...q.map((p) => p[1])) * 1080;
      const size = pl.size || t.size;
      const dx = pl.inkOffset?.dx || 0, dy = pl.inkOffset?.dy || 0;
      return { ...t, text: pl.text, size, role: size >= 120 ? 'big' : size >= 56 ? 'small' : 'caption', x: x0 - dx, y: y0 - dy, align: 'left', ink: pl.ink, print: pl.integration === 'print' };
    });
    return { ...r, type };
  });
}
const cjk = (s) => /[㐀-鿿豈-﫿]/.test(String(s));
const figures = (s) => (String(s).replace(/[,，\s]/g, '').match(/\d+(?:\.\d+)?/g) || []);

// (pure) a type line's box, as the page sets it: one line, size px tall, CJK a size a character, Latin and figures about half
export function typeBox(t) {
  const n = [...String(t.text || '')].reduce((a, ch) => a + (cjk(ch) ? 1 : 0.55), 0), w = n * t.size * (t.role === 'big' && cjk(t.text) ? 0.74 : 1);
  const x0 = t.align === 'center' ? t.x - w / 2 : t.align === 'right' ? t.x - w : t.x;
  return { x0, y0: t.y, x1: x0 + w, y1: t.y + t.size * 1.1 };
}
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

// (pure, tested) when a line's words are said in its beat (seconds from the beat's start), as the chapters time them
// (morph.js said: the beat's length shared over its line's letters); in either script; null when the beat does not say it
const bare = (x) => String(x).replace(/[\s，。、；：？！「」『』“”"'·・,.;:?!()（）\-—–]/g, '');
export function saidIn(beatText, words, dur, hantText = null, wordTimes = null) {
  const w = bare(words); if (!w) return null;
  // a recording's own word times when the line has them (voice.mjs words.json): the first letter's time in the beat
  if (wordTimes?.length) { const chars = wordTimes.map((x) => x.c).join(''), i = chars.indexOf(w); if (i >= 0) return +wordTimes[i].t.toFixed(2); }
  for (const line of [hantText, beatText]) { const b = bare(line || ''), i = b.indexOf(w); if (i >= 0 && b.length) return +((dur * i) / b.length).toFixed(2); }
  return null;
}
// (pure, tested) when a line comes in: at its words less 0.3 s (the voice's timing) unless the director holds it later
export const typeIn = (t, beat) => { const s = saidIn(beat.text, t.text, beat.dur || 5, beat.hant, beat.wordTimes); return t.in != null ? t.in : s != null ? Math.max(0, s - 0.3) : 0.3; };
// (pure, tested) type placed by the line, not by hand (the user 2026-10-23: 肯定能从代码上 数学上做好): a line with no x, y
// takes the nearest spot to its anchor (near) that is inside the safe frame, above the subtitle band, clear of the subject
// and the evidence and of the lines placed before it; 'under' sits below the line before, on its left edge
export const NEARS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right', 'under'];
export function placeType(row) {
  // a margin round the subject and the evidence (type touching its picture reads as stuck to it), a lighter cost on the context
  const PAD = 32, box4 = (k, p) => ({ x0: k.x - p, y0: k.y - p, x1: k.x + k.w + p, y1: k.y + k.h + p });
  const out = [], hard = (row.blocks || []).filter((k) => k.role === 'subject' || k.role === 'evidence').map((k) => box4(k, PAD)), soft = (row.blocks || []).filter((k) => k.role === 'context' || k.role === 'mark').map((k) => box4(k, 12));
  for (const t0 of row.type || []) {
    if (t0.x != null && t0.y != null) { out.push(t0); continue; }
    const t = { ...t0, align: 'left' }, b0 = typeBox({ ...t, x: 0, y: 0 }), w = b0.x1 - b0.x0, h = b0.y1 - b0.y0, prev = out[out.length - 1], pb = prev && typeBox(prev);
    const A = { 'top-left': [80, 90], top: [W / 2 - w / 2, 90], 'top-right': [W - 80 - w, 90], left: [80, 420 - h / 2], center: [W / 2 - w / 2, 470 - h / 2], right: [W - 80 - w, 420 - h / 2], 'bottom-left': [80, BAND - 60 - h], bottom: [W / 2 - w / 2, BAND - 60 - h], 'bottom-right': [W - 80 - w, BAND - 60 - h], under: pb ? [pb.x0, pb.y1 + TG.inkGap * (prev.size || 100)] : [TG.left(0), 420] }[t.near || 'top-left'];
    let best = null;
    // a pair's small line exactly under its big one, on its edge, one gap (the bible's: TYPE.md §3, as the chapters set it —
    // the grid's 12 px rhythm put it anywhere from 0.15 to 0.3 apart) when the spot is clear of the lines and the subject
    if (t0.near === 'under' && pb) { const box = { x0: A[0], y0: A[1], x1: A[0] + w, y1: A[1] + h }; if (!out.some((o) => overlap(typeBox(o), box) > 0) && hard.reduce((a, k) => a + overlap(k, box), 0) === 0) best = { x: A[0], y: A[1], cost: -1 }; }
    // (on the type bible's grid: a left edge on a column line, a top on a 12 px rhythm inside the margins — TYPE.md)
    const xs = Array.from({ length: TG.cols }, (_, k) => TG.left(k)).filter((x) => x + w <= W - TG.margin.right + 10);
    for (let y = TG.top; y + h <= BAND - 8; y += 12) for (const x of xs) {
      const box = { x0: x, y0: y, x1: x + w, y1: y + h };
      if (out.some((o) => overlap(typeBox(o), box) > 0)) continue;
      const cover = hard.reduce((a, k) => a + overlap(k, box), 0) / (w * h), lean = soft.reduce((a, k) => a + overlap(k, box), 0) / (w * h), cost = Math.hypot(x - A[0], y - A[1]) + cover * 4000 + lean * 900;
      if (!best || (best.cost >= 0 && cost < best.cost)) best = { x, y, cost };
    }
    out.push(best ? { ...t, x: best.x, y: best.y } : { ...t0, x: A[0], y: A[1], align: 'left' });
  }
  return out;
}
// (pure, tested) a beat's layout in a word: what its biggest line is (a figure or words) and where it stands (thirds)
export function layoutSig(r) {
  const T = placeType(r); if (!T.length) return null;
  const big = T.reduce((a, t) => (t.size > a.size ? t : a)), b = typeBox(big), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const col = cx < W / 3 ? 'left' : cx > (2 * W) / 3 ? 'right' : 'centre', row = cy < H / 3 ? 'top' : cy > (2 * H) / 3 ? 'low' : 'mid';
  // (what the eye reads first: a figure or words, and where; the shape under it the eye reads as the same card)
  return `${/\d/.test(big.text) ? 'a figure' : 'words'} ${row}-${col}`;
}
// (pure, tested) the line's checks of a greybox answer. beats: [{ beat, text }]; facts: extra texts a figure may come from
// (pure, tested) greybox row.device must point at a ready kit (same selectedDeviceKitErrors as storyboard)

// (pure, tested) director-routes auto-pick must land in greybox answer.device (and kind/composition when present)
export function greyboxRouteUneatenErrors(rows, routeDefaultsByBeat = {}) {
  return routeUneatenErrors(rows, routeDefaultsByBeat, { prefix: 'greybox', fields: ['kind', 'composition', 'device'] });
}

export function greyboxDeviceKitErrors(rows, devices, opts = {}) {
  if (!devices?.length) return [];
  const chosen = (rows || []).filter((r) => r.device).map((r) => ({ beat: r.beat, devices: [r.device] }));
  // lazy import kept out of module top to avoid cycle with refbreakdown; callers may pass a pure selectedDeviceKitErrors
  const { selectedDeviceKitErrors } = requireDeviceKit();
  return selectedDeviceKitErrors(chosen, devices, opts);
}
let _selectedDeviceKitErrors = null;
function requireDeviceKit() {
  if (_selectedDeviceKitErrors) return { selectedDeviceKitErrors: _selectedDeviceKitErrors };
  // sync dynamic: refbreakdown is ESM; use import.meta via pre-bound setter from stepGreybox / tests
  // fallback mirrors A3: status + empty/未接线 (symbols need bound real fn)
  return { selectedDeviceKitErrors: _selectedDeviceKitErrors || ((chosen, devices, opts = {}) => {
    const by = new Map((devices || []).map((d) => [d.id, d])), e = [];
    const symbols = opts.symbols || null;
    for (const row of chosen || []) {
      const beat = row.beat || '?';
      for (const id of row.devices || []) {
        const d = by.get(id);
        if (!d) { e.push(`${beat}: device "${id}" is not in routing/devices.json`); continue; }
        const st = d.kit?.status;
        if (st !== 'ready') { e.push(`${beat}: device "${id}" has no ready kit route (kit.status ${st || 'missing'}; make its kit ready before selecting it)`); continue; }
        const use = String(d.kit?.use || '').trim();
        if (!use) { e.push(`${beat}: device "${id}" is ready but kit.use is empty (fake wiring — name a real template symbol)`); continue; }
        if (/未接线/.test(use)) { e.push(`${beat}: device "${id}" kit.use says 未接线 (not a ready route)`); continue; }
        if (!symbols) continue;
        const refs = [];
        for (const m of use.matchAll(/\b((?:type\.(?:flat|dev)|kit\.engine|K[245])\.[A-Za-z][A-Za-z0-9]*)\b/g)) if (!refs.includes(m[1])) refs.push(m[1]);
        if (refs.length && !refs.some((r) => symbols.has(r))) e.push(`${beat}: device "${id}" kit.use has no real template symbol (${refs.join(' / ')}); wire to an exported callable or demote kit.status`);
      }
    }
    return e;
  }) };
}
export function bindSelectedDeviceKitErrors(fn) { _selectedDeviceKitErrors = fn; }

// (pure, tested) P0 E1: greybox answer static scan — Plane+photo / photo-plane subject claim without real mesh
export function greyboxPhotoPlaneErrors(answer, beats = [], project = null) {
  if (project && project.process && project.process !== 'six-stage') return [];
  const e = [], by = Object.fromEntries((beats || []).map((b) => [b.beat, b]));
  for (const r of answer?.beats || []) {
    const meta = by[r.beat] || {};
    const wants3d = meta.form === '3d' || meta.medium === '3d' || /3d|mesh|主体|立体/i.test(String(r.note || ''));
    const subjects = (r.blocks || []).filter((k) => k.role === 'subject');
    for (const k of subjects) {
      const photoPlane = (k.shape === 'photo' || k.shape === 'plane') && (k.image || k.src) && !k.model;
      const declared = /PlaneGeometry|photo-plane|照片贴[Pp]lane/i.test(String(k.note || r.note || ''));
      if ((photoPlane && (wants3d || k.as3d === true || k.spatial === true)) || declared) {
        e.push(`${r.beat}: photo-plane-as-subject — subject is photo on a plane without model (HOUSE: 禁止照片贴 Plane 当 3D 主体)`);
      }
    }
    if (r.code && /PlaneGeometry/.test(r.code) && /(?:map|MeshBasicMaterial|TextureLoader|photo)/i.test(r.code) && !/kit\.props\.model|kit\.engine\.subject|block\.model/.test(r.code)) {
      e.push(`${r.beat}: photo-plane-as-subject — greybox code builds PlaneGeometry + photo without kit subject path`);
    }
  }
  return e;
}

// (pure, tested) P0 E1: greybox static subject-pipeline tells (Tube/Box filler as subject without kit path)
export function greyboxSubjectPipelineErrors(answer, beats = [], project = null) {
  if (project && project.process && project.process !== 'six-stage') return [];
  const e = [];
  for (const r of answer?.beats || []) {
    const note = String(r.note || '');
    const subjects = (r.blocks || []).filter((k) => k.role === 'subject');
    for (const k of subjects) {
      if ((k.shape === 'tube' || k.shape === 'box' || /TubeGeometry|BoxGeometry/.test(String(k.note || note))) && !k.model) {
        e.push(`${r.beat}: subject-pipeline-filler — Tube/Box filler subject without kit.props.model / kit.engine.subject / block.model`);
      }
    }
    if (r.code && /TubeGeometry|BoxGeometry/.test(r.code) && !/kit\.props\.model|kit\.engine\.subject|block\.model/.test(r.code) && /subject|hero|主角/i.test(r.code + note)) {
      e.push(`${r.beat}: subject-pipeline-filler — code uses Tube/Box filler without kit subject path`);
    }
  }
  return e;
}

export function greyboxErrors(answer, beats, facts = [], opts = {}) {
  const e = [], rows = answer?.beats || [], by = Object.fromEntries(rows.map((r) => [r.beat, r]));
  for (const b of beats.filter(requiresEventContract)) e.push(...directorIntentErrors(b));
  for (const b of beats) if (!by[b.beat]) e.push(`${b.beat}: no greybox frame`);
  // one layout three beats running (the review: six beats a big figure on top and a line under it, three in a row, read as
  // a carousel of number cards)
  { const sig = rows.map((r) => layoutSig(r)); for (let k = 2; k < sig.length; k++) if (sig[k] && sig[k] === sig[k - 1] && sig[k] === sig[k - 2]) e.push(`${rows[k - 2].beat}–${rows[k].beat}: one layout three beats running (${sig[k]}): turn the composition (where the big words stand, what holds the frame)`); }
  for (const r of rows) {
    const b = beats.find((x) => x.beat === r.beat); if (!b) { e.push(`${r.beat}: not a beat of the film`); continue; }
    if (!(r.blocks || []).length && !(r.type || []).length) e.push(`${r.beat}: an empty frame (no block, no type)`);
    for (const k of r.blocks || []) {
      if (!SHAPES.includes(k.shape)) e.push(`${r.beat}: block "${k.label}" shape ${k.shape}: one of ${SHAPES.join(', ')}`);
      if (!ROLES.includes(k.role)) e.push(`${r.beat}: block "${k.label}" role ${k.role}: one of ${ROLES.join(', ')}`);
      if (!(k.w > 0 && k.h > 0)) e.push(`${r.beat}: block "${k.label}" has no size`);
      if (k.gridMotion) { const g = k.gridMotion; if (k.shape !== 'grid' || !Number.isFinite(g.from) || !Number.isFinite(g.to) || g.from < 0 || g.from > 100 || g.to < 0 || g.to > 100 || g.to !== k.lit || !Number.isFinite(g.start) || !Number.isFinite(g.end) || g.start < 0 || g.end <= g.start || g.end > (b.dur ?? 0)) e.push(`${r.beat}: "${k.label}" gridMotion needs grid, 0–100 counts and a valid time span ending at lit`); }
    }
    if ((r.blocks || []).filter((k) => k.role === 'subject').length > 2) e.push(`${r.beat}: more than two subjects: one thing the eye goes to (a second at most)`);
    if ((r.type || []).some((t) => (t.x == null || t.y == null) && t.near != null && !NEARS.includes(t.near))) e.push(`${r.beat}: a line's near is one of ${NEARS.join(', ')}`);
    const T = placeType(r).map((t) => ({ ...t, box: typeBox(t) }));
    for (let i = 1; i < T.length; i++) if (r.type[i].near === 'under') {
      const prev = T[i - 1].box, next = T[i].box;
      if (Math.abs(next.x0 - prev.x0) > 6 || next.y0 < prev.y1) e.push(`${r.beat}: "${T[i].text}" must sit under and align with "${T[i - 1].text}": make room for the pair`);
    }
    for (const t of r.type || []) { const sd = saidIn(b.text, t.text, b.dur || 5, b.hant, b.wordTimes); if (t.in != null && sd != null && t.in < sd - 0.3 - 1e-6) e.push(`${r.beat}: "${t.text}" comes in at ${t.in} s, before its words (said at ${sd} s; 0.3 s before them at the earliest)`); }
    for (const t of T) {
      if (!Object.values(TG.size).some((v) => Math.abs(t.size - v) <= v * 0.06)) e.push(`${r.beat}: "${t.text}" at ${t.size} px is off the type scale (${Object.entries(TG.size).map(([k, v]) => `${k} ${v}`).join(', ')}: TYPE.md)`);
      if (!TYPE_ROLES.includes(t.role)) e.push(`${r.beat}: "${t.text}" role ${t.role}: one of ${TYPE_ROLES.join(', ')}`);
      if (t.size < (cjk(t.text) ? CJK_MIN : LATIN_MIN)) e.push(`${r.beat}: "${t.text}" at ${t.size} px (${cjk(t.text) ? CJK_MIN : LATIN_MIN} at least)`);
      if (t.box.x0 < 24 || t.box.x1 > W - 24 || t.box.y0 < 24) e.push(`${r.beat}: "${t.text}" leaves the frame or hugs its edge (24 px)`);
      if (t.box.y1 > BAND) e.push(`${r.beat}: "${t.text}" sits in the subtitle band (below ${BAND} px)`);
      for (const f of figures(t.text)) if (![b.text, ...facts].some((s) => figures(s).includes(f))) e.push(`${r.beat}: "${t.text}" carries ${f}, not in the beat's words nor its sources`);
    }
    // small type over the subject or the evidence reads as a label stuck on the picture (big type may press on it: a house
    // mechanism); measured on the placed boxes (the audit: the solver's margin was a cost, never checked)
    // (a picture filling the frame is its ground: type set on a full-frame photo is the house's photo-over-type, B11)
    { const subj = (r.blocks || []).filter((k) => (k.role === 'subject' || k.role === 'evidence') && k.w * k.h < 0.8 * W * H).map((k) => ({ x0: k.x, y0: k.y, x1: k.x + k.w, y1: k.y + k.h }));
      // (a caption may tag its thing: the coordinate-track and readout devices)
      for (const t of T) if (t.size < 90 && t.role !== 'caption') { const a = (t.box.x1 - t.box.x0) * (t.box.y1 - t.box.y0), o = subj.reduce((x, k) => x + overlap(k, t.box), 0); if (a > 0 && o / a > 0.15) e.push(`${r.beat}: "${t.text}" (${t.size} px) lies on the subject (${Math.round((o / a) * 100)} % of it): small type stands clear of the picture`); } }
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (overlap(T[i].box, T[j].box) > 0.1 * Math.min((T[i].box.x1 - T[i].box.x0) * (T[i].box.y1 - T[i].box.y0), (T[j].box.x1 - T[j].box.x0) * (T[j].box.y1 - T[j].box.y0))) e.push(`${r.beat}: "${T[i].text}" and "${T[j].text}" over each other`);
    if (T.length > LINES_MAX) e.push(`${r.beat}: ${T.length} lines to read at once (${LINES_MAX} at most)`);
    if (!MOVES.includes(r.camera?.move)) e.push(`${r.beat}: camera move ${r.camera?.move}: one of ${MOVES.join(', ')}`);
    // something on screen at the cut (the greybox's blind review, 2026-10-28: four cuts landed on an empty ground and waited)
    if (rows.indexOf(r) > 0) { const there = (r.blocks || []).filter((k) => (k.in ?? 0) <= 0.05 && k.role !== 'mark').reduce((a, k) => a + Math.min(k.w, W) * Math.min(k.h, H), 0);
      if (there < 0.06 * W * H) e.push(`${r.beat}: starts from nothing at its cut (${Math.round((there / (W * H)) * 100)} % of the frame there at 0 s): let its subject or its ground be there when the cut lands`); }
    // the motion is the film's (the user 2026-10-28: 镜头的衔接和动效不能打折): every seam named, every entrance one the reel draws, in its beat
    // allowed outs: single source seams.mjs SEAMS (same list usage refuses to silently ignore)
    for (const x of [...(r.blocks || []), ...(r.type || [])]) { if (x.enter != null && !['cut', 'fade', 'rise', 'scale', 'wipe', 'type-on', 'draw'].includes(x.enter)) e.push(`${r.beat}: "${x.label || x.text}" enters by ${x.enter}`); if (x.in != null && (x.in < 0 || x.in > (b.dur ?? 99) - 0.4)) e.push(`${r.beat}: "${x.label || x.text}" comes in at ${x.in} s, outside its beat (${b.dur ?? '?'} s, 0.4 s to read it at least)`); }
  }
  e.push(...illegalSeamOutErrors(rows));
  // hard seam gates (HOUSE: 硬切两边都停稳; 换世界用快甩/信号坏/闪白; no bare cut-streak) — same predicates as houseusage
  e.push(...greyboxSeamErrors(answer, beats));
  // hard camera from/to (schema has from/to; null + move≠static used to render via cameraKeys fallback)
  e.push(...cameraMotionErrors(rows));
  // HOUSE: 开场禁止静帧海报硬切 — first 2–3 / act=open / hero；只认已接线 lineup-row / copy-to-repeat / table-grows 或章节 mapPlane/subject/orbit（横移扫海报不算；未接线空壳不得过门）
  e.push(...openingMotionErrors(rows, beats));
  // HOUSE knife1: mid-film (non-opening) same-image×N / CSS clone posing as lineup — wired devices + prop-family diversity pass
  e.push(...midFilmFakeArrayErrors(rows, beats));
  // HOUSE knife3: within-frame type hierarchy (≤3 levels, ≥1.5×, one first-read) — TYPE.md §7 / type-bible.design
  e.push(...typeHierarchyErrors(rows));
  // film medium=evidence → greybox evidence plate (photo|screen, readable size)
  e.push(...evidenceBlockErrors(rows, beats));
  // HOUSE mature hard contracts (title press / evidence card / no empty placeholder main; spine hard on claim/design-set)
  e.push(...matureHardErrors(answer, beats, { claim: opts.claimMatureFirstDraft, project: opts.project, hard: opts.hardSpine }));
  // any beat selecting a non-ready / fake-wired device kit fails (shells / presenter-close / unknown / empty use)
  if (opts.devices) e.push(...greyboxDeviceKitErrors(rows, opts.devices, { symbols: opts.kitSymbols }));
  // director-routes: when auto-pick resolved a kind, greybox answer must eat device (and kind/composition if set)
  if (opts.routeDefaults) e.push(...greyboxRouteUneatenErrors(rows, opts.routeDefaults));
  // P0 E1: static photo-plane / subject-pipeline from greybox answer → mature claim real-mesh bar
  const photoPlaneErrors = opts.photoPlaneErrors || greyboxPhotoPlaneErrors(answer, beats, opts.project);
  const subjectPipelineErrors = opts.subjectPipelineErrors || greyboxSubjectPipelineErrors(answer, beats, opts.project);
  e.push(...photoPlaneErrors);
  e.push(...subjectPipelineErrors);
  // claimed mature first draft → six-bar runtime gate (inject photo/subject)
  e.push(...matureFirstDraftErrors(answer, beats, {
    claim: opts.claimMatureFirstDraft,
    project: opts.project,
    openingErrors: openingMotionErrors(rows, beats),
    cameraErrors: cameraMotionErrors(rows),
    seamErrors: greyboxSeamErrors(answer, beats),
    photoPlaneErrors,
    subjectPipelineErrors,
  }));
  // P1 A5/B3/B5/D1/F3 — hard measurable gates (PIPELINE-HARD-INPUT-AUDIT-20261029)
  if (opts.devices) e.push(...openingKitKindErrors(rows, beats, opts.devices, { hasOpeningBuildDevice }));
  if (opts.compositions) e.push(...turnedDownPickErrors(rows, opts.compositions));
  e.push(...screenFilmedDeviceErrors(rows));
  e.push(...labelDistanceErrors(rows));
  if (opts.media) e.push(...mediaCatalogErrors(rows, opts.media));
  return e;
}


// (pure, tested) filmdesign medium=evidence is a hard promise the greybox shows evidence (HOUSE / L113 / greybox.md):
// role=evidence, shape photo|screen, large enough to read as evidence — not a tiny mark or a subject standing in
export function evidenceBlockErrors(rows, beats = []) {
  const e = [], byBeat = Object.fromEntries((beats || []).map((b) => [b.beat, b]));
  const frame = W * H;
  for (const r of rows || []) {
    const med = byBeat[r.beat]?.medium;
    if (med !== 'evidence') continue;
    const ev = (r.blocks || []).filter((k) => k.role === 'evidence');
    if (!ev.length) {
      e.push(`${r.beat}: film medium=evidence but no evidence block (role evidence, shape photo|screen): show the real page/photo large — do not leave it as subject-only or empty`);
      continue;
    }
    const shaped = ev.filter((k) => EVIDENCE_SHAPES.includes(k.shape));
    if (!shaped.length) {
      e.push(`${r.beat}: evidence block shape ${ev.map((k) => k.shape).join('/')} — evidence beats use photo or screen (prompts/greybox.md)`);
      continue;
    }
    const best = shaped.reduce((a, k) => Math.max(a, Math.min(k.w, W) * Math.min(k.h, H)), 0);
    if (best < EVIDENCE_BLOCK_MIN_SHARE * frame) {
      e.push(`${r.beat}: evidence block only ${Math.round((best / frame) * 100)} % of the frame (${Math.round(EVIDENCE_BLOCK_MIN_SHARE * 100)} % at least): enlarge the photo/screen so the evidence reads`);
    }
  }
  return e;
}

// (pure, tested) motion hard fails on the greybox answer, using filmdesign fields carried on beats when present
// jump / cut-streak predicates come from seams.mjs (same as houseusage)
export function greyboxSeamErrors(answer, beats = []) {
  const e = [], rows = answer?.beats || [];
  e.push(...worldJumpSeamErrors(rows, beats));
  e.push(...cutStreakSeamErrors(rows));
  e.push(...hardCutSettleErrors(rows));
  // flash duration/readability (HOUSE knife2): band + cut-enter type under white peak + settle/read time after flash
  e.push(...flashSeamErrors(rows, beats, { flashDur: FLASH_DUR_DEFAULT }));
  // after a cut, the landing beat must show subject or evidence (or a large ground) at 0 s — tighten the empty-cut rule
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], r = rows[i];
    if (prev.out !== 'cut') continue;
    const at0 = (r.blocks || []).filter((k) => (k.in ?? 0) <= 0.05);
    const subj = at0.filter((k) => k.role === 'subject' || k.role === 'evidence');
    const subjArea = subj.reduce((a, k) => a + Math.min(k.w, W) * Math.min(k.h, H), 0);
    const groundArea = at0.filter((k) => k.role === 'context').reduce((a, k) => a + Math.min(k.w, W) * Math.min(k.h, H), 0);
    if (subjArea < 0.04 * W * H && groundArea < 0.35 * W * H)
      e.push(`${r.beat}: cut lands with no subject/evidence at 0 s (${Math.round((subjArea / (W * H)) * 100)} % subject, ${Math.round((groundArea / (W * H)) * 100)} % ground): put the subject or a full ground there when the cut lands`);
  }
  return e;
}

// An explicitly named real image must exist; silently drawing a placeholder hides missing evidence.
export function greyboxAssetErrors(answer, root) {
  const errors = [];
  for (const row of answer?.beats || []) for (const block of row.blocks || []) {
    if (!block.image) continue;
    const file = path.isAbsolute(block.image) ? block.image : path.join(root, block.image);
    try { if (!fs.statSync(file).isFile()) throw new Error('not a file'); }
    catch { errors.push(`${row.beat}: image "${block.image}" is not an available file: provide its real path or clear the image for a deliberate placeholder`); }
  }
  return errors;
}

// ---------------------------------------------------------------- the voice's timing
// (the audit of 2026-10-28: the type was timed by the letters' share of a beat estimated in whole seconds, with no
// recording.) With a recording the beats stand on its real spans (voice/timings.json) and, when the line has its words'
// times (voice/words.json, local Whisper), every line comes in on its words; without one the timing is an estimate, and
// the sheet says so
export function voiceTiming(cfg, id) {
  const root = projectPaths(cfg, id).root, tm = readJson(path.join(root, 'voice', 'timings.json'));
  if (!tm?.beats) return { state: 'none', beats: {}, words: [] };
  const wf = tm.words ? path.join(root, tm.words) : path.join(root, 'voice', 'words.json'), wj = readJson(wf);
  const words = (wj?.segments || []).flatMap((x) => x.words || []).map((x) => ({ word: x.word, s: x.startMs / 1000 }));
  return { state: words.length ? 'words' : 'beats', beats: tm.beats, words };
}
// (pure, tested) a beat's letters with their times from its start, from the recording's words inside its span
export function beatWordTimes(span, words) {
  if (!span || !words?.length) return null;
  const out = []; for (const w of words) if (w.s >= span.start - 0.05 && w.s < span.end) for (const c of bare(w.word)) out.push({ c, t: Math.max(0, w.s - span.start) });
  return out.length ? out : null;
}

// ---------------------------------------------------------------- the task
export async function greyboxInput(cfg, id) {
  const C = await import('./chapter.mjs'), F = await import('./filmdesign.mjs'), P = await import('./palettes.mjs');
  const beats = C.filmBeats(cfg, id), fd = taskScopedDesign(cfg, id, F.acceptedFilmDesign(cfg, id)), lib = P.loadPalettes(cfg), root = projectPaths(cfg, id).root;
  const sb = readJson(path.join(root, 'storyboard.json'), {}), vt = voiceTiming(cfg, id);
  const table = loadDirectorRoutes(cfg);
  const devicesLib = (await import('./filmdesign.mjs')).loadDevices(cfg);
  const shaped = beats.map((b) => {
    const d = (fd?.beats || []).find((r) => r.beat === b.beat) || {};
    return { beat: b.beat, text: b.text, act: d.act || null, medium: d.medium || null, hero: d.hero === true, directorIntent: d.directorIntent || null };
  });
  const routeDefaults = pickDirectorDefaultsByBeat(shaped, { table, devices: devicesLib });
  return beats.map((b) => { const d = (fd?.beats || []).find((r) => r.beat === b.beat) || {}, s = (sb.shots || []).find((x) => x.beat === b.beat) || {}, pal = P.beatColour({ beat: b.beat, palette: d.palette }, lib);
    const pick = routeDefaults[b.beat] || {};
    return { beat: b.beat, at: b.at, dur: b.dur, text: b.text, timing: vt.state, wordTimes: beatWordTimes(vt.beats[b.beat], vt.words), act: d.act || null, scale: d.scale || null, medium: d.medium || null, palette: pal, screen: d.screen || 'clean', why: d.why || '', hero: !!d.hero, heroHow: d.heroHow || null,
      productionRisk: d.productionRisk, activeRevision: d.activeRevision, directorIntent: d.directorIntent || null, device: d.device ?? (requiresEventContract(d) ? null : pick.devices?.[0]) ?? null, kind: d.kind ?? (requiresEventContract(d) ? null : pick.kind) ?? null, composition: d.composition ?? (requiresEventContract(d) ? null : pick.composition) ?? null,
      routeKind: pick.kind || null, routeComposition: pick.composition || null, routeDevices: pick.devices || [],
      reads: s.reads || [], figure: s.diagram?.figure || s.why || '', evidence: (s.evidence || []).map((x) => `${x.form}: ${x.what}`) }; });
}
export async function greyboxTask(cfg, id) {
  const beats = await greyboxInput(cfg, id), fd = (await import('./filmdesign.mjs')).acceptedFilmDesign(cfg, id);
  const F = await import('./filmdesign.mjs');
  const table = loadDirectorRoutes(cfg);
  const devicesLib = F.loadDevices(cfg);
  const routeDefaults = pickDirectorDefaultsByBeat(beats.map((b) => ({
    beat: b.beat, text: b.text, act: b.act || null, medium: b.medium || null, hero: b.hero === true, directorIntent: b.directorIntent || null,
  })), { table, devices: devicesLib });
  return { rules: 'work/recipe-board-v1/prompts/greybox.md', schema: 'work/recipe-board-v1/routing/greybox.schema.json', forInput: sha(JSON.stringify(beats)),
    input: { frame: { w: W, h: H, band: BAND }, arc: fd?.arc || null, beats, visualDirection: 'work/recipe-board-v1/SEMANTIC-VISUAL-DIRECTION.md', directorRoutes: 'work/recipe-board-v1/routing/director-routes.json', routeDefaults, ...((await import('./gatestate.mjs')).userLockedOf(loadProject(cfg, id), beats.map((b) => b.beat)) ? { userLocked: (await import('./gatestate.mjs')).userLockedOf(loadProject(cfg, id), beats.map((b) => b.beat)) } : {}) } };
}

// ---------------------------------------------------------------- the render
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// (pure, tested) the colour a subject's block is filled with: the palette's key, or its ink when the key is the ground
// itself (mustard: key and ground both #d6a121 — the block vanished into it and the cut was measured as empty, banana B02)
const rgbOf = (h) => { const x = String(h || '').replace('#', ''); return x.length >= 6 ? [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)) : null; };
export function subjectFill(key, ground, ink) { const a = rgbOf(key), b = rgbOf(ground); return a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 60 ? `${ink}66` : `${key}cc`; }
function shapeHtml(k, ink, key, accent = key, ground = null) {
  const box = `left:${k.x}px;top:${k.y}px;width:${k.w}px;height:${k.h}px`, fill = k.role === 'subject' ? subjectFill(key, ground, ink) : k.role === 'evidence' ? '#00000066' : k.role === 'mark' ? accent : `${ink}22`, line = k.role === 'subject' ? ink : k.role === 'mark' ? accent : `${ink}88`;
  // Mark labels are director metadata, not tiny on-screen words; readable place names use type.
  const lab = k.role === 'mark' ? '' : `<span class="lab">${esc(k.label)}</span>`;
  switch (k.shape) {
    case 'ellipse': case 'globe': return `<div class="b" style="${box};border-radius:50%;background:${fill};border:2px solid ${line}">${k.shape === 'globe' ? `<div class="mer"></div>` : ''}${lab}</div>`;
    case 'line': return `<div class="b" style="${box};background:${line};border:0">${lab}</div>`;
    case 'arrow': return `<div class="b" style="${box};background:${line};clip-path:polygon(0 35%,80% 35%,80% 0,100% 50%,80% 100%,80% 65%,0 65%)">${lab}</div>`;
    case 'ship': return `<div class="b" style="${box};background:${fill};border:0;clip-path:polygon(0 0,82% 0,100% 50%,82% 100%,0 100%)">${lab}</div>`;
    case 'map': return `<div class="b" style="${box};background:${fill};border:2px dashed ${line}">${lab}</div>`;
    case 'grid': { const n = Math.max(0, Math.min(100, Math.round(k.lit ?? 0))); return `<div class="b" style="${box};display:grid;grid-template-columns:repeat(10,1fr);gap:4%;padding:2%;background:transparent;border:0">${Array.from({ length: 100 }, (_, i) => `<i style="display:block;border-radius:8%;background:${i >= 100 - n ? accent : `${ink}66`}"></i>`).join('')}${lab}</div>`; }
    case 'chart': return `<div class="b" style="${box};background:transparent;border-left:2px solid ${line};border-bottom:2px solid ${line}"><div class="bars" style="--c:${key}"></div>${lab}</div>`;
    case 'photo': case 'screen': return `<div class="b ph" style="${box};background:${k.shape === 'screen' ? '#0b0b0b' : '#3a3a3a'};border:${k.shape === 'screen' ? 6 : 2}px solid ${line}">${lab}</div>`;
    case 'people': return `<div class="b" style="${box};border:0;background:transparent"><div style="position:absolute;left:30%;top:0;width:40%;height:38%;border-radius:50%;background:${fill};border:2px solid ${line}"></div><div style="position:absolute;left:15%;top:42%;width:70%;height:58%;border-radius:40% 40% 0 0;background:${fill};border:2px solid ${line}"></div>${lab}</div>`;
    default: return `<div class="b" style="${box};background:${fill};border:2px solid ${line}">${lab}</div>`;
  }
}
export async function fontCss(cfg, id) {
  const H = await import('./house.mjs'), p = loadProject(cfg, id) || {}, r = H.letterRoles(undefined, p.style), all = H.houseFonts().all, f = (fam) => all.find((a) => a.family === fam && a.installed)?.path;
  // the display face drawn narrow as the house sets it, or the greybox fails (never the plain face silently: the second audit)
  const disp = H.shapedFont(r.display, r.x) || f(r.display);
  // a house face missing fails the greybox, never a system face in its place (house rule; the audit: it fell back to serif silently)
  for (const [role, file] of [['display', disp], ['small', f(r.small)], ['latin', f(r.latin)]]) if (!file) throw new Error(`greybox: the house face for ${role} is not installed (work/recipe-board-v1/fonts/house/)`);
  const src = (file) => `url('${pathToFileURL(file).href}')`;
  return `@font-face{font-family:GBDisplay;src:${src(disp)}}@font-face{font-family:GBSmall;src:${src(f(r.small))}}@font-face{font-family:GBLatin;src:${src(f(r.latin))};unicode-range:${H.LATIN_RANGE}}@font-face{font-family:GBLast;src:${src(f(r.last))}}`;
}
// the sheet: every frame with its beat's words, its act and why underneath, read in order (the direction gate's page)
export function sheetHtml(rows, inputs, css, files, notes = [], hit = '', seam = '') {
  const cell = (r) => { const i = inputs.find((x) => x.beat === r.beat) || {};
    return `<div class="c"><img src="${pathToFileURL(files[r.beat]).href}"><div class="w"><b>${esc(r.beat)}</b> ${esc((i.at ?? 0).toFixed(1))}s · ${esc(i.dur)}s${i.hero ? ' · 重頭' : ''}<br>${esc(i.text)}<br><span>${esc(r.note || i.why || '')}</span></div></div>`; };
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}.t.print{-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0.82 1'/></feComponentTransfer></filter><rect width='6' height='6' filter='url(%23n)' fill='white'/></svg>");-webkit-mask-size:6px 6px;mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0.82 1'/></feComponentTransfer></filter><rect width='6' height='6' filter='url(%23n)' fill='white'/></svg>");mask-size:6px 6px}*{margin:0;box-sizing:border-box}body{background:#111;color:#ddd;width:2400px;padding:24px;font:20px GBLast}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.c img{width:100%;display:block}.w{padding:8px 2px 14px;line-height:1.45}.w span{color:#999}.t0{color:#c9a96e;margin:0 0 10px}.hit{color:#9ec9a6;margin:0 0 4px;font:18px GBLast}.seam{color:#8aa0b0;margin:0 0 14px;font:16px GBLast}.n{margin-top:20px;color:#c9a96e;line-height:1.6}</style></head>
<body><div class="t0">${esc({ words: '字的时间：配音逐字对齐', beats: '字的时间：拍长来自配音，拍内按字数估算', none: '字的时间：按字数估算（还没有配音）' }[inputs[0]?.timing || 'none'])}</div>${hit ? `<div class="hit">house · ${esc(hit)}</div>` : ''}${seam ? `<div class="seam">${esc(seam)}</div>` : ''}<div class="g">${rows.map(cell).join('')}</div>${(notes || []).length ? `<div class="n"><b>内部盲审留下、还没解决的问题</b><br>${notes.map((n) => `${esc(n.beat)}（${n.severity}）：${esc(n.say)} → ${esc(n.fix)}`).join('<br>')}</div>` : ''}</body></html>`;
}
// ---------------------------------------------------------------- the motion rough
// (the user 2026-10-28, on the first greybox: 模型 背景 字体设计什么的耗时不长的可以正常做 只有耗时的才做 … 尤其是镜头的衔接和动效不能打折)
// What is quick is made as the film will have it: the palette's ground with its screen's texture, the house type, a model
// the library has (drawn as itself from its own views), a real picture in hand. Only what is slow (a model not made yet,
// a generated plate, a heavy 3D scene) stands as a block. The motion is the film's: the camera on the settle curve, each
// line coming in its own way at its moment, and every seam designed — cut, match, whip, push, glitch, flash.
export const ENTERS = ['cut', 'fade', 'rise', 'scale', 'wipe', 'type-on', 'draw'];
export const SEAM_DUR = { cut: 0, match: 0.4, whip: 0.36, push: 0.5, glitch: 0.2, flash: FLASH_DUR_DEFAULT };
// A flash belongs to the seam, not the outgoing layer: that layer is hidden at the exact cut.
export function flashAt(t, beats, duration) {
  return beats.reduce((v, b) => b.out === 'flash' && Math.abs(t - (b.at + b.dur)) < duration / 2 ? Math.max(v, 1 - Math.abs(t - (b.at + b.dur)) / (duration / 2)) : v, 0);
}

// (pure, tested) a camera pose {s,x,y} with finite numbers
export function camPose(p) {
  return !!(p && typeof p === 'object' && Number.isFinite(p.s) && Number.isFinite(p.x) && Number.isFinite(p.y));
}
// (pure, tested) explicit in-shot motion: from+to, or keys (≥2 poses). Schema requires from/to (nullable); this is the hard gate.
export function hasExplicitCameraMotion(cam = {}) {
  if (camPose(cam.from) && camPose(cam.to)) return true;
  const keys = cam.keys;
  return Array.isArray(keys) && keys.length >= 2 && keys.every(camPose);
}
export function posesEqual(a, b, eps = 1e-6) {
  return camPose(a) && camPose(b) && Math.abs(a.s - b.s) <= eps && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}
// HOUSE: 相连的运动是一个运动 — prev.to hands off to next.from (or keys ends)
export function settleContinuousAcross(prevCam, nextCam) {
  if (!prevCam || !nextCam) return false;
  const prevEnd = camPose(prevCam.to) ? prevCam.to : (Array.isArray(prevCam.keys) ? prevCam.keys[prevCam.keys.length - 1] : null);
  const nextStart = camPose(nextCam.from) ? nextCam.from : (Array.isArray(nextCam.keys) ? nextCam.keys[0] : null);
  return posesEqual(prevEnd, nextStart);
}
// (pure, tested) non-static must declare real from→to (or keys) with a delta; settle-continuous across seams is checked when both sides are explicit
export function cameraMotionErrors(rows) {
  const e = [], list = rows || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i], cam = r.camera || {}, move = cam.move || 'static';
    if (move === 'static') continue;
    if (!MOVES.includes(move)) continue; // move enum already fails elsewhere
    if (!hasExplicitCameraMotion(cam)) {
      e.push(`${r.beat}: camera ${move} needs explicit from/to (or keys) — null hides missing motion at render (cameraKeys fallback)`);
      continue;
    }
    const a = camPose(cam.from) ? cam.from : cam.keys[0];
    const b = camPose(cam.to) ? cam.to : cam.keys[cam.keys.length - 1];
    if (posesEqual(a, b)) e.push(`${r.beat}: camera ${move} from/to (or keys) has no motion (same pose): give a real from→to, or mark static`);
    // HOUSE / greybox.md: push must change 景别 (real scale delta)
    if (move === 'push' && camPose(a) && camPose(b) && Math.abs(a.s - b.s) < 0.03) {
      e.push(`${r.beat}: camera push needs a real from/to scale change (景别); |Δs|≥0.03`);
    }
  }
  // HOUSE: 动着的带着同一个运动过去 — carry seam must settle-continue when both cameras declare poses
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (!['match', 'push'].includes(a.out)) continue;
    if (!hasExplicitCameraMotion(a.camera) || !hasExplicitCameraMotion(b.camera)) continue;
    if (settleContinuousAcross(a.camera, b.camera)) continue;
    // static on either side is fine (settle at the seam); only flag when both are moving and poses do not meet
    const am = (a.camera?.move || 'static') !== 'static', bm = (b.camera?.move || 'static') !== 'static';
    if (am && bm) e.push(`${a.beat}→${b.beat}: ${a.out} carry but cameras do not settle-continue (prev.to ≠ next.from)`);
  }
  return e;
}

/** True if any type line has a real enter (not cut) or late in (>0.15s). */
export function hasTypeEnterMotion(row) {
  return (row?.type || []).some((ty) => {
    const enter = ty?.enter;
    if (enter && enter !== 'cut') return true;
    if (ty?.in != null && Number(ty.in) > 0.15) return true;
    return false;
  });
}

/** True if any block has gridMotion or a non-cut enter with delayed in. */
export function hasBlockEnterMotion(row) {
  return (row?.blocks || []).some((b) => {
    if (b?.gridMotion) return true;
    const enter = b?.enter;
    if (enter && enter !== 'cut' && b?.in != null && Number(b.in) > 0.1) return true;
    return false;
  });
}

/**
 * Opening build devices that are actually wired (HOUSE).
 * Unwired shells (array-build / stagger-reveal / light-3d) must NOT be kit.status:ready
 * and do NOT clear the opening hard gate — 未接线不得标 ready.
 */
export const OPENING_BUILD_DEVICES = Object.freeze([
  'lineup-row', 'copy-to-repeat', 'table-grows',
]);

const _OPENING_BUILD_SET = new Set(OPENING_BUILD_DEVICES);
/** Unwired opening shells — must not be kit.status:ready and never clear the gate. */
export const UNWIRED_OPENING_SHELLS = Object.freeze([
  'array-build', 'stagger-reveal', 'light-3d', 'presenter-close',
]);
const _UNWIRED_OPENING_SET = new Set(UNWIRED_OPENING_SHELLS);
const _FRAME_AREA = 1920 * 1080;

function _visualBlocks(row) {
  return (row?.blocks || []).filter((b) => b && (
    ['subject', 'context', 'accent', 'mark'].includes(b.role)
    || b.image || b.model
    || ['photo', 'art', 'rect', 'ellipse', 'grid', 'ship', 'people', 'map', 'globe', 'chart'].includes(b.shape)
  ));
}

/** Chapter path: kit.mapPlane / chartTable — greybox uses shape map|globe|chart. */
export function hasChapterMapPlanePath(row) {
  return (row?.blocks || []).some((b) => b && ['map', 'globe', 'chart'].includes(b.shape));
}

/** Chapter path: kit.engine.subject / kit.props.model — greybox block.model set. */
export function hasChapterSubjectPath(row) {
  return (row?.blocks || []).some((b) => b?.model);
}

/** Chapter path: subject in space with orbit camera (engine orbit / subject). */
export function hasChapterOrbitPath(row) {
  return hasChapterSubjectPath(row) && (row?.camera?.move === 'orbit');
}

/** Wired lineup-row: ≥2 units spread horizontally, appearing together (not staggered same-img CSS rise). */
export function hasLineupRow(row) {
  if (row?.device !== 'lineup-row') return false;
  const units = _visualBlocks(row).filter((b) => ['subject', 'context', 'accent'].includes(b.role));
  if (units.length < 2) return false;
  const xs = units.map((b) => Number(b.x)).filter(Number.isFinite);
  if (xs.length < 2 || (Math.max(...xs) - Math.min(...xs)) < 80) return false;
  const ins = units.map((b) => Number(b.in ?? 0));
  // lineup is a row that is there; staggered rise of one duplicated plate is not lineup
  return (Math.max(...ins) - Math.min(...ins)) <= 0.15;
}

/** Wired copy-to-repeat (type.dev.copyRepeat). */
export function hasCopyToRepeat(row) {
  if (row?.device !== 'copy-to-repeat') return false;
  const units = _visualBlocks(row);
  return units.length >= 2 || hasBlockEnterMotion(row) || hasTypeEnterMotion(row);
}

/** Wired table-grows (type.dev.tableGrows) — needs grid + gridMotion (or declared grid). */
export function hasTableGrows(row) {
  const grids = (row?.blocks || []).filter((b) => b?.shape === 'grid');
  const moving = grids.filter((b) => b?.gridMotion);
  if (row?.device === 'table-grows') return moving.length >= 1 || grids.length >= 1;
  return moving.length >= 1;
}

/**
 * REMOVED as opening pass: same-image × N staggered CSS rise / bare device array-build.
 * Kept export name so callers do not break; always false — use hasTableGrows / hasLineupRow.
 */
export function hasArrayBuild(_row) {
  return false;
}

/**
 * REMOVED as opening pass: unwired stagger-reveal shell / inferred stagger alone.
 * Staggered blocks without a wired device no longer clear the opening gate.
 */
export function hasStaggerReveal(_row) {
  return false;
}

/**
 * REMOVED as opening pass: unwired light-3d device id.
 * Real chapter subject/orbit paths are hasChapterSubjectPath / hasChapterOrbitPath.
 */
export function hasLight3d(row) {
  return hasChapterOrbitPath(row);
}

/** Opening has an allowed wired build or a real chapter engine path. */
export function hasOpeningBuildDevice(row) {
  if (hasLineupRow(row) || hasCopyToRepeat(row) || hasTableGrows(row)) return true;
  if (hasChapterOrbitPath(row) || hasChapterSubjectPath(row) || hasChapterMapPlanePath(row)) return true;
  // Declared wired device alone is not enough without structure (checked above).
  // number-grows / letter-grid / array-build / stagger-reveal / light-3d do NOT clear.
  void _OPENING_BUILD_SET;
  return false;
}

/**
 * Classic static photo/poster composition: one dominant full/large photo|art|bleed
 * already on screen at t≈0 with cut, and no wired opening build / chapter path.
 * Pan/push alone over that poster does NOT clear this — HOUSE opening default.
 */

/**
 * Same art path × N with staggered CSS enter — the banned "array-build" fake.
 * Does not clear the gate; with no wired/chapter path, opening must fail.
 */
export function isSameImageStaggerFake(row) {
  const imgs = (row?.blocks || []).filter((b) => b?.image);
  if (imgs.length < 3) return false;
  const paths = new Set(imgs.map((b) => String(b.image)));
  if (paths.size !== 1) return false;
  const ins = imgs.map((b) => Number(b.in ?? 0));
  return (Math.max(...ins) - Math.min(...ins)) > 0.15;
}

export function isStaticPosterComposition(row) {
  if (hasOpeningBuildDevice(row)) return false;
  const blocks = row?.blocks || [];
  const earlyCut = blocks.filter((b) => Number(b?.in ?? 0) <= 0.05 && String(b?.enter || 'cut') === 'cut');
  const photoLike = earlyCut.filter((b) => {
    const area = (Number(b.w) || 0) * (Number(b.h) || 0);
    return Boolean(b.image)
      || ['photo', 'art'].includes(b.shape)
      || (['rect', 'ellipse'].includes(b.shape) && area >= _FRAME_AREA * 0.45 && ['subject', 'context'].includes(b.role));
  });
  if (photoLike.length >= 1) {
    const subjects = blocks.filter((b) => b.role === 'subject' || b.image || ['photo', 'art'].includes(b.shape));
    if (subjects.length <= 1) return true;
    const ins = new Set(subjects.map((b) => Number(b.in ?? 0)));
    if (ins.size <= 1) return true;
  }
  // big type only, empty stage — still a poster card
  if (!blocks.length && (row?.type || []).some((t) => (t.size || 0) >= 128)) return true;
  return false;
}

/**
 * Opening hard gate (HOUSE / greybox.md): first 2–3 shots and any act=open / hero
 * must use a WIRED device (lineup-row / copy-to-repeat / table-grows) or a chapter
 * path (mapPlane / subject / orbit). Forbidden: static photo poster + big-type hard cut;
 * also forbidden: unwired shells (array-build / stagger-reveal / light-3d) or same-image×N CSS rise.
 * Error codes: "opening-static-poster-no-build" / "opening static poster"
 */
export function openingMotionErrors(rows = [], beats = []) {
  const e = [];
  const meta = Object.fromEntries((beats || []).map((b) => [b.beat || b.id, b]));
  const idxs = new Set();
  for (let i = 0; i < Math.min(3, (rows || []).length); i++) idxs.add(i);
  (rows || []).forEach((r, i) => {
    const m = meta[r.beat] || {};
    if (m.act === 'open' || m.hero === true) idxs.add(i);
  });
  for (const i of [...idxs].sort((a, b) => a - b)) {
    const r = rows[i];
    if (!r) continue;
    const m = meta[r.beat] || {};
    // NEW hard default only on true opening (first 3 or act=open) — mid-film hero may still be evidence cards
    const isEarlyOpen = i < 3 || m.act === 'open';
    const posterMsg = `${r.beat}: opening-static-poster-no-build: opening static poster — 开场只认已接线 lineup-row / copy-to-repeat / table-grows，或章节路径 mapPlane/subject/orbit；禁止静帧照片海报+大字硬切，禁止未接线 array-build/stagger-reveal/light-3d 空壳或同图×N CSS rise 冒充（单镜横移/推入扫一张海报不算）`;
    if (isEarlyOpen) {
      // bare unwired shell id never clears — even with pan/push
      if (_UNWIRED_OPENING_SET.has(r.device) && !hasOpeningBuildDevice(r)) {
        e.push(posterMsg);
        continue;
      }
      // same PNG × N staggered CSS rise is the banned fake array-build
      if (isSameImageStaggerFake(r) && !hasOpeningBuildDevice(r)) {
        e.push(posterMsg);
        continue;
      }
      if (isStaticPosterComposition(r)) {
        e.push(posterMsg);
        continue;
      }
    }
    const move = r.camera?.move || 'static';
    if (move !== 'static') continue;
    if (hasTypeEnterMotion(r) || hasBlockEnterMotion(r) || hasOpeningBuildDevice(r)) continue;
    e.push(`${r.beat}: opening static poster (camera static with no type-enter/motion): give lineup-row / copy-to-repeat / table-grows or chapter mapPlane/subject/orbit or late type enter — 开场禁止静帧海报硬切`);
  }
  return e;
}

/** Min identical image blocks that count as a mid-film clone array (aligns with chapter repeatErrors spirit). */
export const MID_FILM_CLONE_MIN = 3;
/** Error code substring for mid-film fake-array hard gate. */
export const MID_FILM_FAKE_ARRAY_CODE = 'mid-film-fake-array';

/**
 * Same art path × N (≥ MID_FILM_CLONE_MIN) — clone array, staggered or simultaneous.
 * Distinct paths (prop-family members) are not this.
 */
export function isSameImageCloneArray(row, min = MID_FILM_CLONE_MIN) {
  const imgs = (row?.blocks || []).filter((b) => b?.image);
  if (imgs.length < min) return false;
  return new Set(imgs.map((b) => String(b.image))).size === 1;
}

/**
 * ≥min image blocks with ≥2 distinct paths — prop-family diversity (routing/props.json members).
 * Clears the mid-film fake-array gate when wired devices are not used.
 */
export function hasPropFamilyDiversity(row, min = MID_FILM_CLONE_MIN) {
  const imgs = (row?.blocks || []).filter((b) => b?.image);
  if (imgs.length < min) return false;
  return new Set(imgs.map((b) => String(b.image))).size >= 2;
}

/** Wired mid-film array build that clears the fake-array gate (same devices as opening). */
export function hasWiredArrayBuild(row) {
  return hasLineupRow(row) || hasCopyToRepeat(row) || hasTableGrows(row);
}

/**
 * CSS-array posing as a real lineup on a mid-film beat: same-image×N (stagger or clone),
 * or an unwired shell (array-build / stagger-reveal / …) with ≥3 visual units and no diversity.
 */
export function isMidFilmFakeArray(row) {
  if (!row) return false;
  if (hasWiredArrayBuild(row)) return false;
  if (hasPropFamilyDiversity(row)) return false;
  if (isSameImageStaggerFake(row) || isSameImageCloneArray(row)) return true;
  if (_UNWIRED_OPENING_SET.has(row.device)) {
    const units = _visualBlocks(row).filter((b) => ['subject', 'context', 'accent'].includes(b.role));
    return units.length >= MID_FILM_CLONE_MIN;
  }
  return false;
}


/**
 * Within-frame type hierarchy (HOUSE knife3 / TYPE.md §7 / type-bible.design):
 * ≤ TYPE_LEVELS_MAX steps, adjacent used sizes ≥ TYPE_LEVEL_CONTRAST× apart when on different
 * scale steps, and one thing read first at the largest size (≥ title). Mirrors typebible
 * designErrors hierarchy; greybox previously only checked the five-step scale + mins.
 */
export function typeStepOf(size) {
  for (const [k, v] of Object.entries(TG.size)) if (Math.abs(size - v) <= v * 0.06) return k;
  return null;
}

export function typeHierarchyErrors(rows = []) {
  const e = [], captionFloor = TG.size.caption * 0.9, titleFloor = TG.size.title * (1 - 0.06);
  for (const r of rows || []) {
    const lines = (r.type || []).filter((t) => Number.isFinite(t?.size) && t.size >= captionFloor);
    if (lines.length < 2) continue;
    const levels = [...new Set(lines.map((t) => t.size))].sort((a, b) => b - a);
    const steps = [...new Set(levels.map(typeStepOf).filter(Boolean))];
    if (steps.length > TYPE_LEVELS_MAX) e.push(`${r.beat}: ${steps.length} levels of type in one frame (${steps.join(', ')}): ${TYPE_LEVELS_MAX} at most — headline, line, caption`);
    for (let i = 1; i < levels.length; i++) {
      const a = levels[i - 1], b = levels[i], sa = typeStepOf(a), sb = typeStepOf(b);
      if (a / b < TYPE_LEVEL_CONTRAST && sa && sb && sa !== sb) e.push(`${r.beat}: two levels of type ${Math.round(a)} and ${Math.round(b)} px are too close to read as two (${TYPE_LEVEL_CONTRAST}× apart at least): one level, or further apart`);
    }
    const tops = new Set(lines.filter((t) => t.size === levels[0]).map((t) => t.text));
    if (levels.length && levels[0] >= titleFloor && tops.size > 1) e.push(`${r.beat}: ${tops.size} things at the largest size (${[...tops].join(', ')}): one is read first`);
  }
  return e;
}

/**
 * Mid-film hard gate (HOUSE knife1): non-opening beats must not pose one photo×N / CSS clone
 * as a real lineup. Opening beats stay under openingMotionErrors.
 * Allow: wired lineup-row / copy-to-repeat / table-grows; prop-family diversity (distinct image paths).
 * Fail code: mid-film-fake-array
 */
export function midFilmFakeArrayErrors(rows = [], beats = []) {
  const e = [];
  const meta = Object.fromEntries((beats || []).map((b) => [b.beat || b.id, b]));
  (rows || []).forEach((r, i) => {
    if (!r) return;
    const m = meta[r.beat] || {};
    // opening covered by openingMotionErrors (first 3 or act=open)
    if (i < 3 || m.act === 'open') return;
    if (!isMidFilmFakeArray(r)) return;
    e.push(`${r.beat}: ${MID_FILM_FAKE_ARRAY_CODE}: mid-film fake array — 片中禁止同图×N / CSS 克隆冒充阵列；用已接线 lineup-row / copy-to-repeat / table-grows，或 prop family 多样性（routing/props.json 不同成员）；未接线 array-build/stagger-reveal 空壳不过门`);
  });
  return e;
}

// (pure, tested) a beat's camera, from its move when the answer gives no keys
export function cameraKeys(c = {}) {
  const d = { static: [{ s: 1, x: 0, y: 0 }, { s: 1.01, x: 0, y: 0 }], push: [{ s: 1, x: 0, y: 0 }, { s: 1.09, x: 0, y: 0 }], pull: [{ s: 1.1, x: 0, y: 0 }, { s: 1, x: 0, y: 0 }],
    pan: [{ s: 1.05, x: 70, y: 0 }, { s: 1.05, x: -70, y: 0 }], orbit: [{ s: 1.04, x: 50, y: 10 }, { s: 1.08, x: -40, y: -10 }], cut: [{ s: 1, x: 0, y: 0 }, { s: 1.02, x: 0, y: 0 }] }[c.move] || [{ s: 1, x: 0, y: 0 }, { s: 1, x: 0, y: 0 }];
  return [c.from || d[0], c.to || d[1]];
}
// a library model's views without ground, made once beside it (blender/model_sheet.py alpha-*)
export function modelSprite(cfg, name, view = 'three-quarter') {
  const C = path.join(cfg.dataDir, 'style-lab', 'engine', 'subjects', 'parts'), glb = path.join(C, `${name}.glb`), dir = path.join(C, `${name}.views`, 'hi'), f = path.join(dir, `alpha-${view}.png`);
  if (!fs.existsSync(glb)) return null;
  if (!fs.existsSync(f)) { const blender = process.env.BLENDER || ['/Users/a1/.local/bin/blender', '/Applications/Blender.app/Contents/MacOS/Blender'].find((b) => fs.existsSync(b)) || 'blender';
    spawnSync(blender, ['-b', '--factory-startup', '-P', path.join(cfg.dataDir, 'style-lab', 'engine', 'blender', 'model_sheet.py'), '--', glb, dir, '900'], { encoding: 'utf8', timeout: 5 * 60 * 1000 }); }
  if (!fs.existsSync(f)) return null;
  // trimmed to the model (the views keep the margin a turntable needs: a ship drawn into its block came out a speck)
  const t = f.replace(/\.png$/, '-trim.png');
  if (!fs.existsSync(t)) spawnSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]);b=im.getchannel("A").getbbox();(im.crop(b) if b else im).save(sys.argv[2])', f, t]);
  return fs.existsSync(t) ? t : f;
}
const SCREEN_CSS = {
  led2: (ink) => `background-image:radial-gradient(circle at 50% 50%, transparent 46%, #0006 54%);background-size:6px 6px`,
  ledred: (ink) => `background-image:radial-gradient(circle at 50% 50%, transparent 46%, #0006 54%);background-size:6px 6px`,
  crt: () => `background:repeating-linear-gradient(0deg,#0006 0 2px,transparent 2px 4px),radial-gradient(ellipse at 50% 50%,transparent 60%,#000a 100%)`,
  vhs: () => `background:repeating-linear-gradient(0deg,#ffffff08 0 1px,transparent 1px 3px);filter:saturate(1.2)`,
  mono: () => `background:repeating-linear-gradient(0deg,#0005 0 2px,transparent 2px 4px)`,
  amber: () => `background:repeating-linear-gradient(0deg,#0005 0 2px,transparent 2px 4px)`,
  halftone: (ink) => `background-image:radial-gradient(#0008 30%, transparent 32%);background-size:8px 8px`,
  film: () => `background:radial-gradient(ellipse at 50% 50%,transparent 55%,#0009 100%)`,
};
function blockHtml(k, pal, cfg, root) {
  const box = `left:${k.x}px;top:${k.y}px;width:${k.w}px;height:${k.h}px`;
  if (k.model) { const f = modelSprite(cfg, k.model, k.view || 'three-quarter'); if (f) return `<img class="el" data-k='${JSON.stringify({ in: k.in ?? 0, enter: k.enter || 'fade' })}' src="${pathToFileURL(f).href}" style="position:absolute;${box};object-fit:contain">`; }
  if (k.image) { const f = path.isAbsolute(k.image) ? k.image : path.join(root, k.image); if (fs.existsSync(f)) return `<div class="el" data-k='${JSON.stringify({ in: k.in ?? 0, enter: k.enter || 'fade' })}' style="position:absolute;${box};background:url('${pathToFileURL(f).href}') center/cover;${k.shape === 'screen' ? `border:10px solid #111;box-shadow:0 30px 80px #000a` : ''}"></div>`; }
  return shapeHtml(k, pal.ink, pal.key, pal.accent, pal.ground).replace(/<div class="b( [^"]*)?"/, (m, x) => `<div class="b${x || ''} el" data-k='${JSON.stringify({ in: k.in ?? 0, enter: k.enter || (k.shape === 'line' || k.shape === 'arrow' ? 'draw' : 'fade'), ...(k.gridMotion ? { gridMotion: k.gridMotion, gridAccent: pal.accent, gridMuted: `${pal.ink}66` } : {}) })}'`);
}
export function gridCount(t, g) { const p = Math.max(0, Math.min(1, (t - g.start) / (g.end - g.start))); return Math.round(g.from + (g.to - g.from) * p); }
export function reelHtml(rows, inputs, css, cfg, root) {
  let t = 0; const beats = rows.map((r) => { const i = inputs.find((x) => x.beat === r.beat) || {}; const b = { beat: r.beat, at: i.at ?? t, dur: i.dur || 5, out: SEAMS.includes(r.out) ? r.out : 'cut', cam: cameraKeys(r.camera) }; t = b.at + b.dur; return b; });
  const layers = rows.map((r, n) => { const i = inputs.find((x) => x.beat === r.beat) || {}, pal = i.palette || { ground: '#1c1c1c', ink: '#ece6da', key: '#d7d7d7', accent: '#c8501e' }, scr = SCREEN_CSS[i.screen];
    const type = placeType(r).map((ty, k) => { const b = typeBox(ty), fam = ty.size >= 90 ? 'GBLatin,GBDisplay,GBLast' : 'GBLatin,GBSmall,GBLast', col = ty.ink || (ty.accent ? pal.accent : ty.role === 'caption' ? `${pal.ink}bb` : pal.ink);
      return `<div class="t el${ty.print ? ' print' : ''}" data-k='${JSON.stringify({ in: typeIn(ty, i), enter: ty.enter || (ty.size >= 90 ? 'scale' : 'rise') })}' style="left:${b.x0}px;top:${ty.y}px;font-size:${ty.size}px;font-family:${fam};color:${col}">${esc(ty.text)}</div>`; }).join('');
    return `<div class="L" id="L${n}" style="background:${pal.ground}"><div class="cam"><div class="gr" style="background-image:radial-gradient(${pal.ink}14 1.2px, transparent 1.4px)"></div>${(r.blocks || []).map((k) => blockHtml(k, pal, cfg, root)).join('')}</div>${scr ? `<div class="scr" style="${scr(pal.ink)}"></div>` : ''}${type}<div class="vig"></div></div>`; }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}.t.print{-webkit-mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0.82 1'/></feComponentTransfer></filter><rect width='6' height='6' filter='url(%23n)' fill='white'/></svg>");-webkit-mask-size:6px 6px;mask-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0.82 1'/></feComponentTransfer></filter><rect width='6' height='6' filter='url(%23n)' fill='white'/></svg>");mask-size:6px 6px}
*{margin:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
.L{position:absolute;inset:0;overflow:hidden;visibility:hidden}.cam{position:absolute;inset:0;transform-origin:50% 50%}.gr{position:absolute;inset:-10%;background-size:14px 14px}
.b{position:absolute}.lab{position:absolute;left:8px;top:6px;font:22px GBSmall,GBLast;color:#ffffff88;white-space:nowrap}
.ph:after{content:'';position:absolute;inset:0;background:linear-gradient(to top right,transparent 49.5%,#fff4 50%,transparent 50.5%),linear-gradient(to bottom right,transparent 49.5%,#fff4 50%,transparent 50.5%)}
.mer{position:absolute;inset:0;border-radius:50%;background:repeating-linear-gradient(90deg,transparent 0 18%,#fff2 18% 19%)}
.bars{position:absolute;inset:12% 8% 0 6%;background:repeating-linear-gradient(90deg,var(--c) 0 9%,transparent 9% 14%);clip-path:polygon(0 70%,20% 55%,40% 60%,60% 35%,80% 40%,100% 10%,100% 100%,0 100%);opacity:.8}
.t{position:absolute;white-space:nowrap;line-height:1.1}.scr{position:absolute;inset:0;pointer-events:none}.vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 48%,transparent 62%,#0007 100%)}
#fx{position:absolute;inset:0;z-index:10;pointer-events:none;background:#fff;opacity:0}
</style></head><body>${layers}<div id="fx"></div><script>
const B=${JSON.stringify(beats)}, DUR=${JSON.stringify(SEAM_DUR)};
const flashAt=${flashAt.toString()};
const gridCount=${gridCount.toString()};
const ease=(u)=>u<=0?0:u>=1?1:0.5-0.5*Math.cos(Math.PI*u), cl=(u)=>Math.max(0,Math.min(1,u)), lerp=(a,b,u)=>a+(b-a)*u;
const L=[...document.querySelectorAll('.L')], ELS=L.map((l)=>[...l.querySelectorAll('.el')].map((e)=>({e,k:JSON.parse(e.dataset.k)})));
function enter(o,p){const e=o.e,k=o.k.enter;const q=ease(p);e.style.opacity=k==='cut'?(p>0?1:0):q;
 if(k==='rise')e.style.transform='translateY('+(1-q)*40+'px)';else if(k==='scale')e.style.transform='scale('+(1.12-0.12*q)+')';else e.style.transform='';
 if(k==='wipe'||k==='type-on'||k==='draw'){e.style.opacity=p>0?1:0;e.style.clipPath='inset(0 '+(100-q*100)+'% 0 0)';}else e.style.clipPath='';}
window.seek=(t)=>{let fx=flashAt(t,B,DUR.flash);
 // each seam its own rule (cut: switch at the boundary; glitch: switch, both sides split and jittered; flash: switch under a
 // white peak; whip: switch, the outgoing flung and blurred out, the incoming flung in from the other side; push: both on
 // screen, the outgoing pushed off by the incoming; match: the incoming dissolves in over the outgoing, which holds)
 B.forEach((b,i)=>{const l=L[i],a=b.at,e=b.at+b.dur,pin=i>0?B[i-1].out:'cut',dIn=DUR[pin]||0,dOut=DUR[b.out]||0;
  const both=(k)=>k==='match'||k==='push'||k==='whip', early=both(pin)?dIn/2:0, late=both(b.out)?dOut/2:0;
  const vis=t>=a-early&&t<e+late; l.style.visibility=vis?'visible':'hidden'; if(!vis)return;
  const u=cl((t-a)/b.dur),c=b.cam,s=lerp(c[0].s,c[1].s,ease(u)),x=lerp(c[0].x,c[1].x,ease(u)),y=lerp(c[0].y,c[1].y,ease(u));
  l.querySelector('.cam').style.transform='translate('+x+'px,'+y+'px) scale('+s+')';
  for(const o of ELS[i]){const p=(o.k.in<=0.05&&o.k.enter!=='draw'&&o.k.enter!=='type-on'&&o.k.enter!=='wipe')?1:o.k.enter==='cut'?(t-a>=o.k.in?1:0):cl((t-a-o.k.in)/(o.k.enter==='type-on'?0.9:0.55));enter(o,p);if(o.k.gridMotion){const n=gridCount(t-a,o.k.gridMotion);o.e.querySelectorAll('i').forEach((cell,j)=>cell.style.background=j>=100-n?o.k.gridAccent:o.k.gridMuted);}}
  let op=1,tx=0,bl=0,sh='',z=t<a?3:2;
  // coming in
  if(t<a+dIn/2&&dIn){const v=cl((t-(a-dIn/2))/dIn);
   if(pin==='match')op=ease(v); else if(pin==='push')tx=(1-ease(v))*1920; else if(pin==='whip'){tx=(1-ease(v))*1920;bl=Math.sin(Math.PI*v)*34;} else if(pin==='glitch'&&t-a<dIn/2&&t>=a){tx=((Math.sin(t*173)*0.5)*40);sh='drop-shadow(14px 0 #f00a) drop-shadow(-14px 0 #0ffa)';}}
  // going out
  if(t>e-dOut/2&&dOut){const v=cl((t-(e-dOut/2))/dOut);
   if(b.out==='push')tx=-ease(v)*1920; else if(b.out==='whip'){tx=-ease(v)*1920;bl=Math.sin(Math.PI*v)*34;} else if(b.out==='glitch'&&t<e){tx=((Math.sin(t*211)*0.5)*40);sh='drop-shadow(14px 0 #f00a) drop-shadow(-14px 0 #0ffa)';}
   if(b.out==='match')z=1;}
  l.style.opacity=op; l.style.zIndex=z; l.style.transform=tx?'translateX('+tx+'px)':''; l.style.filter=(bl?'blur('+bl+'px) ':'')+sh;
 }); document.getElementById('fx').style.opacity=fx; };
window.TOTAL=${t};
</script></body></html>`;
}
export async function renderGreybox(cfg, id, answer, { log = () => {}, fps = 15, stillsOnly = false } = {}) {
  if (!stillsOnly) assertScopeAllows(loadProject(cfg, id), 'greybox');
  assertRenderStorage(cfg, id);
  const H0 = await import('./house.mjs'), root = projectPaths(cfg, id).root, dir = path.join(root, 'out', stillsOnly ? 'greybox-preflight' : 'greybox');
  const assetErrors = greyboxAssetErrors(answer, root);
  if (assetErrors.length) throw new Error(assetErrors.join('; '));
  fs.mkdirSync(dir, { recursive: true });
  // the words on screen in Traditional, as the film sets them (house.mjs script)
  const hant = (x) => (H0.traditionalOn() && x ? H0.toHant([x])[0] : x), inputs = (await greyboxInput(cfg, id)).map((i) => ({ ...i, hant: hant(i.text) }));
  const rows = typePlanRows((answer.beats || []).map((r) => ({ ...r, type: (r.type || []).map((t) => ({ ...t, text: hant(t.text) })), blocks: (r.blocks || []).map((k) => ({ ...k, label: hant(k.label) })), camera: { ...r.camera, note: hant(r.camera?.note) } })), readJson(path.join(projectPaths(cfg, id).root, 'typeplan.json')));
  if (process.env.RB_DEBUG_ROWS) console.log('ROWS', JSON.stringify((rows.find((r) => r.beat === 'B18')?.type || []).map((t) => ({ text: t.text, x: t.x, y: t.y, ink: t.ink }))));
  const scratch = stillsOnly ? null : process.env.RB_GREYBOX_FRAMES_ROOT;
  if (scratch) {
    checkNasMount(scratch);
    for (const [label, dir0] of [['local temporary volume', os.tmpdir()], ['NAS frame volume', scratch]]) { const err = diskError(diskFreeGb(dir0)); if (err) throw new Error(`${label}: ${err}`); }
  }
  const css = await fontCss(cfg, id), { chromium } = await import('playwright'), files = {}, frames = scratch ? fs.mkdtempSync(path.join(scratch, 'greybox-')) : path.join(dir, 'frames');
  if (!scratch && !stillsOnly) { fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true }); }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } }), rf = path.join(dir, 'reel.html');
    fs.writeFileSync(rf, reelHtml(rows, inputs, css, cfg, root)); await page.goto(pathToFileURL(rf).href, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
    // each beat's settled frame (its words all in, the camera near its end) for the sheet
    for (const r of rows) { const i = inputs.find((x) => x.beat === r.beat) || {}; await page.evaluate((t) => window.seek(t), (i.at ?? 0) + (i.dur || 5) - 0.3); const f = path.join(dir, `${r.beat}.png`); await page.screenshot({ path: f }); files[r.beat] = f; }
    // the reel: every frame on the film's clock, half size
    if (!stillsOnly) {
      const total = await page.evaluate(() => window.TOTAL), n = Math.round(total * fps); await page.setViewportSize({ width: W, height: H });
      for (let k = 0; k < n; k++) { await page.evaluate((t) => window.seek(t), k / fps); await page.screenshot({ path: path.join(frames, `${String(k).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 80, scale: 'css' }); }
    }
    const sp = await browser.newPage({ viewport: { width: 2400, height: 800 } }), sf = path.join(dir, 'sheet.html');
    // sheet notes read the house-usage meter: drop stale「大半硬切」claims when seams are already designed
    const U = await import('./houseusage.mjs');
    const meter = U.houseUsageRead(cfg, id, { write: false });
    const open = U.sheetOpenNotes(readJson(path.join(root, 'tasks', `${GREYBOX_REVIEW_STEP}.answer.json`))?.issues || [], meter);
    const { evidence: hit, seam } = U.houseUsageSummariesOf(meter);
    fs.writeFileSync(sf, sheetHtml(rows, inputs.map((i) => ({ ...i, text: hant(i.text) })), css, files, open, hit, seam)); await sp.goto(pathToFileURL(sf).href, { waitUntil: 'load' }); await sp.evaluate(() => document.fonts.ready);
    await sp.screenshot({ path: path.join(dir, 'sheet.png'), fullPage: true });
  } finally { await browser.close(); }
  if (stillsOnly) { log(`  greybox preflight: ${rows.length} frames at out/greybox-preflight/sheet.png (no gate or reel changed)`); return { dir, sheet: path.join(dir, 'sheet.png'), reel: null, frames: files }; }
  const reel = path.join(dir, 'greybox.mp4'), temp = path.join(dir, `.greybox-${crypto.randomUUID()}.partial.mp4`);
  const encoded = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-vf', 'scale=960:-2', '-pix_fmt', 'yuv420p', '-crf', '22', temp], { encoding: 'utf8' });
  if (encoded.status !== 0 || !fs.existsSync(temp) || !fs.statSync(temp).size) { fs.rmSync(temp, { force: true }); throw new Error(`greybox encoding failed; frames retained at ${frames}: ${encoded.stderr || encoded.error?.message || 'no video'}`); }
  fs.renameSync(temp, reel);
  fs.rmSync(frames, { recursive: true, force: true });
  log(`  greybox: ${rows.length} beats, out/greybox/sheet.png and greybox.mp4 (the motion rough)`);
  return { dir, sheet: path.join(dir, 'sheet.png'), reel: path.join(dir, 'greybox.mp4'), frames: files };
}

// (the audit of 2026-10-28: the empty-cut check read the answer's blocks — a faint dashed map counted as there while the
// frame stood empty.) Measured on the rendered reel: the frame 0.1 s after each cut, the share of it that differs from the
// beat's ground; under CUT_FILL it lands on nothing
// (and against the frame's own smooth light: a pixel counts only where it also stands off the frame blurred — a cream ground's
// vignette read as 6 % full where the frame stood empty, banana-design B05 → B06; the faint subject blocks of B12 and B20
// read 5 %, the empty one 1.4 %)
export const CUT_FILL = 0.04;
export function measureCuts(dir, inputs, rows = []) {   // rows: the greybox's beats (the seam into each: measured once it has passed)
  const reel = path.join(dir, 'greybox.mp4'), tmp = path.join(dir, 'cutframes'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const seamOf = (k) => SEAM_DUR[(rows.find((r) => r.beat === inputs[k].beat) || {}).out] || 0;
  const cutsAt = inputs.slice(1).map((b, k) => { const f = path.join(tmp, `${k}.png`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(b.at + seamOf(k) / 2 + 0.1), '-i', reel, '-frames:v', '1', '-vf', 'scale=320:-2', f]); return { beat: b.beat, f, ground: b.palette?.ground || '#1c1c1c' }; });
  const rows2 = cutsAt;
  // against the frame's own ground: its median colour (the palette's nominal ground under the texture and the vignette read
  // as content, and a flat placeholder panel the size of the frame read as 91 % full — the second audit, 2026-10-28)
  const py = 'import sys,json\nfrom PIL import Image,ImageFilter\nout=[]\nfor f in json.loads(sys.argv[1]):\n  im=Image.open(f).convert("RGB");w,h=im.size;px=im.load();bl=im.filter(ImageFilter.GaussianBlur(w/10)).load()\n  pts=[(x,y) for y in range(int(h*0.08),int(h*0.92),2) for x in range(int(w*0.06),int(w*0.94),2)]\n  med=[sorted(px[p][c] for p in pts)[len(pts)//2] for c in range(3)]\n  out.append(sum(1 for (x,y) in pts if sum(abs(px[x,y][c]-med[c]) for c in range(3))>60 and sum(abs(px[x,y][c]-bl[x,y][c]) for c in range(3))>30)/len(pts))\nprint(json.dumps(out))';
  const have = rows2.filter((x) => fs.existsSync(x.f));
  if (have.length !== rows2.length) throw new Error(`greybox: the reel's frame after ${rows2.filter((x) => !fs.existsSync(x.f)).map((x) => x.beat).join(', ')} could not be read`);
  const r = spawnSync('python3', ['-c', py, JSON.stringify(have.map((x) => x.f))], { encoding: 'utf8' });
  let fills; try { fills = JSON.parse(r.stdout); } catch { throw new Error(`greybox: the cuts could not be measured (${String(r.stderr || '').trim().split('\n').pop()})`); }   // (never a silent pass)
  fs.rmSync(tmp, { recursive: true, force: true });
  return rows2.map((x, k) => ({ beat: x.beat, fill: fills[k] }));
}
// (pure, tested) the measured cuts that land on nothing
export const cutErrors = (cuts) => cuts.filter((c) => c.fill != null && c.fill < CUT_FILL).map((c) => `${c.beat}: lands on nothing at its cut (measured on the reel: ${Math.round(c.fill * 100)} % of the frame off its ground 0.1 s after the cut, ${CUT_FILL * 100} % at least): let its subject or its ground's features be there`);

// ---------------------------------------------------------------- the step
export async function stepGreybox(cfg, id, options = {}) {
  assertScopeAllows(loadProject(cfg, id), 'greybox');
  const dir = path.join(projectPaths(cfg, id).root, 'out', 'greybox');
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, '.render.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx'); }
  catch (e) {
    if (e.code === 'EEXIST') return { state: 'blocked', why: `greybox already running or lock needs inspection: ${lock}` };
    throw e;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + '\n');
    return await stepGreyboxLocked(cfg, id, options);
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
async function stepGreyboxLocked(cfg, id, { log = console.log } = {}) {
  const { writeTask, readAnswer, writeCheck, taskPaths } = await import('./agenttask.mjs');
  // ⑧ greybox-advance: design-set films need accepted filmdesign + current storyboard before the rough advances
  { const GS = await import('./gatestate.mjs'), p = loadProject(cfg, id) || {};
    if (GS.designSet(p)) {
      const pin = await GS.greyboxAdvancePinErrors(cfg, id);
      if (pin.length) { log(`  greybox: blocked — ${pin[0]}`); return { state: 'blocked', errors: pin, why: pin[0] }; }
    } }
  const t = await greyboxTask(cfg, id), tp = taskPaths(cfg, id, GREYBOX_STEP), had = readJson(tp.task);
  if (had?.forInput !== t.forInput) writeTask(cfg, id, GREYBOX_STEP, t);
  let answer = readAnswer(cfg, id, GREYBOX_STEP); if (!answer) return { state: 'waiting', why: `the greybox (tasks/${GREYBOX_STEP}.task.json)` };
  // force-write route defaults into greybox answer (device/kind/composition) when missing
  const routeDefaults = t.input.routeDefaults || {};
  {
    const { writeAnswer } = await import('./agenttask.mjs');
    const pinned = pinRouteDefaultsIntoAnswer(answer, routeDefaults, (t.input.beats || []).filter(requiresEventContract).map(b => b.beat));
    if (JSON.stringify(pinned) !== JSON.stringify(answer)) {
      writeAnswer(cfg, id, GREYBOX_STEP, pinned);
      answer = pinned;
    }
  }
  // (the checks' own code in the key: a greybox accepted before is checked again when they change, as the chapters are)
  const typePlanHash = (() => { try { return JSON.stringify(readJson(path.join(projectPaths(cfg, id).root, 'typeplan.json'))?.answerHash || ''); } catch { return ''; } })();
  const h = sha(fs.readFileSync(tp.answer, 'utf8') + typePlanHash + t.forInput + greyboxErrors.toString() + greyboxAssetErrors.toString() + shapeHtml.toString() + blockHtml.toString() + flashAt.toString() + gridCount.toString() + reelHtml.toString() + renderGreybox.toString() + layoutSig.toString() + placeType.toString()), chk = readJson(tp.check);
  if (chk?.ok && chk.answerHash === h && fs.existsSync(path.join(projectPaths(cfg, id).root, 'out', 'greybox', 'sheet.png'))) return { state: 'ready', hash: h, review: (await greyboxReview(cfg, id, { log })).state };
  const facts = (() => { try { return fs.readdirSync(path.join(projectPaths(cfg, id).root, 'materials', 'sources')).filter((f) => f.endsWith('.txt')).map((f) => fs.readFileSync(path.join(projectPaths(cfg, id).root, 'materials', 'sources', f), 'utf8')); } catch { return []; } })();
  const RB = await import('./refbreakdown.mjs');
  const devices = RB.loadDevices(cfg);
  const kitSymbols = RB.loadKitSymbolIndex(cfg);
  bindSelectedDeviceKitErrors(RB.selectedDeviceKitErrors);
  const compositions = (() => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'compositions.json'), 'utf8')); } catch { return null; } })();
  const media = (() => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'media.json'), 'utf8')); } catch { return null; } })();
  const errors = [...greyboxErrors(answer, t.input.beats, facts, { devices, project: loadProject(cfg, id), routeDefaults, kitSymbols, compositions, media }), ...greyboxAssetErrors(answer, projectPaths(cfg, id).root)];
  if (errors.length) { writeCheck(cfg, id, GREYBOX_STEP, { ok: false, errors, answerHash: h }); log(`  greybox: sent back (${errors.length}): ${errors.slice(0, 3).join(' | ')}`); return { state: 'rejected', errors }; }
  // Never let the previous sheet satisfy the new answer while its reel is still being rendered.
  writeCheck(cfg, id, GREYBOX_STEP, { ok: false, pendingRender: true, errors: [], answerHash: h });
  try { await renderGreybox(cfg, id, answer, { log }); }
  catch (error) { writeCheck(cfg, id, GREYBOX_STEP, { ok: false, pendingRender: false, errors: [`render failed: ${error.message || error}`], answerHash: h }); throw error; }
  { const cuts = cutErrors(measureCuts(path.join(projectPaths(cfg, id).root, 'out', 'greybox'), await greyboxInput(cfg, id), answer.beats || []));
    if (cuts.length) { writeCheck(cfg, id, GREYBOX_STEP, { ok: false, errors: cuts, answerHash: h }); log(`  greybox: sent back (${cuts.length}) by the reel's measure: ${cuts.slice(0, 2).join(' | ')}`); return { state: 'rejected', errors: cuts }; } }
  writeCheck(cfg, id, GREYBOX_STEP, { ok: true, errors: [], answerHash: h });
  // a rough changed after it was sent back is reviewed again; one that passed stays passed (greyboxReview)
  const rv = await greyboxReview(cfg, id, { log });
  return { state: 'ready', hash: h, review: rv.state };
}
// the hash the direction gate is bound to: the accepted greybox answer
export function greyboxHash(cfg, id) { const c = readJson(path.join(projectPaths(cfg, id).root, 'tasks', `${GREYBOX_STEP}.check.json`)); return c?.ok ? c.answerHash : null; }

// ---------------------------------------------------------------- the greybox's blind review (before the user sees it)
// A studio's internal review: the director's rough is looked at by someone who did not make it before it goes to the
// client (the user 2026-10-28: 按你推荐的都执行好). One fresh reviewer, the sheet, a strip of every seam (the frames just
// before, at and after each cut) and the reference films' sheets; six scores and the issues by beat. It passes once: a
// greybox changed after it passed is held by the code's checks, and the user sees it at the design gate.
export const GREYBOX_REVIEW_STEP = 'greybox-review';
// Rebuild sheet.html + sheet.png from existing beat frames (no reel / mp4). Usage hit + seam lines stay current.
// dir wins; else --preflight / preflight:true → out/greybox-preflight (same hit as main sheet, no mp4).
export async function writeGreyboxSheet(cfg, id, { dir = null, preflight = false, log = () => {} } = {}) {
  assertRenderStorage(cfg, id);
  const H0 = await import('./house.mjs'), U = await import('./houseusage.mjs');
  const root = projectPaths(cfg, id).root, out = dir || path.join(root, 'out', preflight ? 'greybox-preflight' : 'greybox');
  const answer = readJson(path.join(root, 'tasks', `${GREYBOX_STEP}.answer.json`));
  if (!answer?.beats?.length) throw new Error(`writeGreyboxSheet: no ${GREYBOX_STEP}.answer.json`);
  const hant = (x) => (H0.traditionalOn() && x ? H0.toHant([x])[0] : x);
  const inputs = (await greyboxInput(cfg, id)).map((i) => ({ ...i, text: hant(i.text), hant: hant(i.text) }));
  const rows = typePlanRows((answer.beats || []).map((r) => ({ ...r, type: (r.type || []).map((t) => ({ ...t, text: hant(t.text) })), blocks: (r.blocks || []).map((k) => ({ ...k, label: hant(k.label) })), camera: { ...r.camera, note: hant(r.camera?.note) } })), readJson(path.join(projectPaths(cfg, id).root, 'typeplan.json')));
  const files = {};
  for (const r of rows) {
    const f = path.join(out, `${r.beat}.png`);
    if (!fs.existsSync(f)) throw new Error(`writeGreyboxSheet: missing frame ${f}`);
    files[r.beat] = f;
  }
  const css = await fontCss(cfg, id);
  const meter = U.houseUsageRead(cfg, id, { write: false });
  const open = U.sheetOpenNotes(readJson(path.join(root, 'tasks', `${GREYBOX_REVIEW_STEP}.answer.json`))?.issues || [], meter);
  const { evidence: hit, seam } = U.houseUsageSummariesOf(meter);
  const sf = path.join(out, 'sheet.html');
  fs.writeFileSync(sf, sheetHtml(rows, inputs, css, files, open, hit, seam));
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const sp = await browser.newPage({ viewport: { width: 2400, height: 800 } });
    await sp.goto(pathToFileURL(sf).href, { waitUntil: 'load' });
    await sp.evaluate(() => document.fonts.ready);
    await sp.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });
  } finally { await browser.close(); }
  log(`  greybox sheet: ${rows.length} beats, ${hit || '–'}${seam ? ` · ${seam}` : ''} → ${path.join(out, 'sheet.png')} (no reel)`);
  return { dir: out, sheet: path.join(out, 'sheet.png'), hit, seam, open };
}
export const GREYBOX_SCORES = ['arc', 'telling', 'layout', 'colour', 'seams', 'motion'];
// (pure, tested) a review's verdict: every score 3 at least, a mean of 3.5, no issue of severity 4 or more. From its
// GREYBOX_ROUNDS-th review on, the mean is a note, not a hold: the greybox decides the film's direction and its large faults
// (a score under 3, an issue of 4), and its remaining issues of 3 go to the chapters' briefs (sessionbrief) — banana-design's
// fourth review came back on the same three general notes as the third (hard cuts, a layout run), a loop with no end
// (the user 2026-10-28: 关口过一次就算过 … 是不是效率 流程太低效)
export const GREYBOX_ROUNDS = 3;
export function greyboxReviewErrors(a, round = 1) {
  if (!a?.scores) return ['greybox-review: no scores'];
  const e = [], v = GREYBOX_SCORES.map((k) => a.scores[k]);
  for (const k of GREYBOX_SCORES) if (!(a.scores[k] >= 3)) e.push(`greybox-review.${k}: ${a.scores[k]}`);
  const mean = v.reduce((x, y) => x + (y || 0), 0) / v.length; if (mean < 3.5 && round < GREYBOX_ROUNDS) e.push(`greybox-review: mean ${mean.toFixed(2)} (3.5 at least; from review ${GREYBOX_ROUNDS} on, scores of 3 and no issue of 4 pass)`);
  for (const i of a.issues || []) if (i.severity >= 4) e.push(`${i.beat}: ${i.say} (severity ${i.severity})`);
  return e;
}
const reviewGateFile = (cfg, id) => path.join(projectPaths(cfg, id).root, 'tasks', `${GREYBOX_REVIEW_STEP}.gate.json`);
// Runtime submission evidence, not a security boundary against arbitrary local shell writes.
function eventSubmissionStatus(cfg, id, task) {
  const file = path.join(projectPaths(cfg, id).root, 'tasks', `${GREYBOX_STEP}.answer.json`);
  if (task?.independentReview?.writerStep !== GREYBOX_STEP || !fs.existsSync(file) || task.forAnswer !== sha(fs.readFileSync(file))) return { ok: false, why: 'independent review task is not bound to the current greybox answer' };
  return reviewSubmissionStatus(cfg, id, GREYBOX_REVIEW_STEP, task, { writerStep: GREYBOX_STEP });
}
// true once a blind review passed; false while one is due or failed; undefined with no greybox yet
export function greyboxReviewPassed(cfg, id) {
  const root = projectPaths(cfg, id).root, gate = readJson(reviewGateFile(cfg, id));
  const design = readJson(path.join(root, 'tasks', 'filmdesign.answer.json'));
  const scoped = taskScopedDesign(cfg, id, design).beats.filter(requiresEventContract);
  if (gate?.passedAt && !scoped.length) return true;
  if (gate?.passedAt && gate.greybox === greyboxHash(cfg, id)) {
    const task = readJson(path.join(root, 'tasks', `${GREYBOX_REVIEW_STEP}.task.json`));
    const reviewFile = path.join(root, 'tasks', `${GREYBOX_REVIEW_STEP}.answer.json`);
    if (!eventSubmissionStatus(cfg, id, task).ok || !fs.existsSync(reviewFile) || gate.reviewAnswerHash !== sha(fs.readFileSync(reviewFile))) return false;
    const events = task?.input?.events || [];
    const digest = f => fs.existsSync(f) ? sha(fs.readFileSync(f)) : null;
    if (scoped.every(b => events.some(e => e.beat === b.beat && JSON.stringify(e.intent) === JSON.stringify(b.directorIntent))) && events.length === scoped.length && events.every(e => !eventTimeErrors({ beat: e.beat, dur: e.interval?.dur, directorIntent: e.intent }).length && e.frames.length === 3 && e.frames.every(f => f.time === e.interval?.at + e.intent.eventTimes[f.state]) && e.status === 'measured' && e.reel === digest(path.join(root, 'out', 'greybox', 'greybox.mp4')) && e.frames.every(f => f.hash && f.hash === digest(f.file))) && JSON.stringify(gate.eventBindings) === JSON.stringify(events.map(e => e.binding))) return true;
  }
  return scoped.length || greyboxHash(cfg, id) ? false : undefined;
}
// the seams' strip: each cut's three frames in a row, one row a seam, from the reel
export function seamStrip(dir, inputs) {
  const reel = path.join(dir, 'greybox.mp4'), out = path.join(dir, 'seams.png'), tmp = path.join(dir, 'seamframes'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const cuts = inputs.slice(1).map((b) => b.at), rows = [];
  cuts.forEach((t, k) => { const fs3 = [t - 0.25, t, t + 0.25].map((x, j) => { const f = path.join(tmp, `${k}-${j}.png`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(Math.max(0, x)), '-i', reel, '-frames:v', '1', '-vf', 'scale=320:-2', f]); return f; });
    const r = path.join(tmp, `row-${k}.png`); spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...fs3.flatMap((f) => ['-i', f]), '-filter_complex', 'hstack=3', r]); if (fs.existsSync(r)) rows.push(r); });
  if (rows.length) spawnSync('ffmpeg', ['-loglevel', 'error', '-y', ...rows.flatMap((f) => ['-i', f]), '-filter_complex', `vstack=${rows.length}`, out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return fs.existsSync(out) ? out : null;
}
// Protocol validation only: an independent reviewer judges the event, never a pixel delta.
export function eventReviewErrors(answer, evidence = []) {
  const errors = [];
  for (const e of evidence) {
    const rows = (answer?.events || []).filter(r => r.beat === e.beat), r = rows[0];
    if (e.status !== 'measured') errors.push(`${e.beat}.event: unknown (missing current frame evidence)`);
    if (rows.length !== 1 || r?.binding !== e.binding) errors.push(`${e.beat}.event: missing/stale review binding`);
    if (r?.verdict !== 'pass') errors.push(`${e.beat}.event: ${r?.verdict || 'unknown'} — ${r?.observed || 'not reviewed'}`);
    if (typeof r?.observed !== 'string' || r.observed.trim().length < 5) errors.push(`${e.beat}.event: describe observed start/change/end and handoff`);
  }
  return errors;
}

export function eventReviewEvidence(dir, inputs, version, { extract = true } = {}) {
  const reel = path.join(dir, 'greybox.mp4');
  const digest = f => fs.existsSync(f) ? sha(fs.readFileSync(f)) : null;
  return inputs.filter(requiresEventContract).map(b => {
    const timingErrors = [...eventTimeErrors(b)];
    if (!Number.isFinite(b.at) || b.at < 0 || !Number.isFinite(b.dur) || b.dur <= 0) timingErrors.push('unknown beat interval');
    const i = inputs.indexOf(b), frames = (timingErrors.length ? [] : ['start', 'key', 'end']).map(state => {
      const time = b.at + b.directorIntent.eventTimes[state], file = path.join(dir, `event-${b.beat}-${state}-${sha(JSON.stringify({ version, time, intent: b.directorIntent })).slice(0, 12)}.png`);
      if (extract) {
        fs.rmSync(file, { force: true });
        if (fs.existsSync(reel)) spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(time), '-i', reel, '-frames:v', '1', file]);
      }
      return { state, time, file, hash: digest(file) };
    });
    const context = { previous: inputs[i - 1]?.directorIntent || null, next: inputs[i + 1]?.directorIntent || null };
    const content = { version, reel: digest(reel), beat: b.beat, intent: b.directorIntent, interval: { at: b.at, dur: b.dur }, timingErrors, context, frames };
    return { ...content, status: !timingErrors.length && content.reel && frames.length === 3 && frames.every(f => f.hash) ? 'measured' : 'unknown', binding: sha(JSON.stringify(content)) };
  });
}

export async function greyboxReview(cfg, id, { log = () => {} } = {}) {
  const { writeTask, readTask, taskPaths, writeCheck } = await import('./agenttask.mjs');
  const h = greyboxHash(cfg, id); if (!h) return { state: 'waiting' };
  const eventInputs = await greyboxInput(cfg, id), scoped = eventInputs.some(requiresEventContract);
  const previousGate = readJson(reviewGateFile(cfg, id));
  if (previousGate?.passedAt && !scoped) return { state: 'passed' };
  const tp = taskPaths(cfg, id, GREYBOX_REVIEW_STEP), task = readTask(cfg, id, GREYBOX_REVIEW_STEP), dir = path.join(projectPaths(cfg, id).root, 'out', 'greybox');
  const events = eventReviewEvidence(dir, eventInputs, h, { extract: false });
  const writerFile = path.join(projectPaths(cfg, id).root, 'tasks', `${GREYBOX_STEP}.answer.json`);
  const forAnswer = fs.existsSync(writerFile) ? sha(fs.readFileSync(writerFile)) : null;
  const proof = scoped ? eventSubmissionStatus(cfg, id, task) : null;
  if (previousGate?.passedAt && previousGate.greybox === h && (!scoped || (proof.ok && fs.existsSync(tp.answer) && previousGate.reviewAnswerHash === sha(fs.readFileSync(tp.answer)))) && JSON.stringify(previousGate.eventBindings) === JSON.stringify(events.map(e => e.binding)) && events.every(e => e.status === 'measured')) return { state: 'passed' };
  if (task?.forGreybox !== h || JSON.stringify(task?.input?.events || []) !== JSON.stringify(events) || (scoped && (task?.forAnswer !== forAnswer || task?.independentReview?.writerStep !== GREYBOX_STEP))) {
    const inputs = await greyboxInput(cfg, id), seams = seamStrip(dir, inputs), refs = (await import('./filmdesign.mjs')).referenceSheets(cfg);
    const U = await import('./houseusage.mjs');
    const meter = U.houseUsageRead(cfg, id, { write: false });
    const measuredEvents = eventReviewEvidence(dir, inputs, h);
    writeTask(cfg, id, GREYBOX_REVIEW_STEP, { rules: 'work/recipe-board-v1/prompts/greybox-review.md', schema: 'work/recipe-board-v1/routing/greybox-review.schema.json', forGreybox: h,
      ...(scoped ? { forAnswer, independentReview: { writerStep: GREYBOX_STEP, submit: `node scripts/recipe-board.mjs submit-task --project ${id} --step ${GREYBOX_REVIEW_STEP} --answer-file <candidate.json>`, note: 'The writer must submit greybox via submit-task first; a distinct runtime thread submits this review. Direct answer writes do not count.' } } : {}),
      input: { events: measuredEvents, beats: inputs.map((b) => ({ beat: b.beat, at: b.at, dur: b.dur, text: b.text, act: b.act, hero: b.hero })), seams: inputs.slice(1).map((b, k) => ({ row: k + 1, from: inputs[k].beat, to: b.beat, at: b.at })),
        houseUsage: U.houseUsageReviewInput(meter),
        images: '第一张是这部片的灰盒粗稿总览（每拍一帧，下面是台词和导演的说明）；第二张是每处衔接的三帧（切点前 0.25 秒、切点、切点后 0.25 秒，一行一处，顺序见 input.seams）；后面是对标片的整片抽帧。写 seams 分数与衔接类 issues 时以 input.houseUsage 的衔接计数为准：cut 未过半且 bareCut 为 0 时不得写「大半硬切／一路硬切」。' },
      images: [path.join(dir, 'sheet.png'), ...(seams ? [seams] : []), ...refs, ...measuredEvents.flatMap(e => e.frames.filter(f => f.hash).map(f => f.file))] });
    return { state: 'review' };
  }
  const a = readJson(tp.answer); if (!a || !fs.existsSync(tp.answer) || fs.statSync(tp.answer).mtimeMs < fs.statSync(tp.task).mtimeMs) return { state: 'review' };
  // (rounds counted by the answer, not by the runs that read it: the round had counted every run, five for four reviews)
  const answerHash = sha(JSON.stringify(a) + h), prev = readJson(tp.check), round = (prev?.round || 0) + (prev?.answerHash === answerHash ? 0 : 1);
  const errors = [...greyboxReviewErrors(a, round), ...eventReviewErrors(a, events)];
  if (scoped && !proof.ok) errors.push(`greybox-review independent submission: ${proof.why}`);
  writeCheck(cfg, id, GREYBOX_REVIEW_STEP, { ok: !errors.length, errors, forGreybox: h, review: a, answerHash });
  if (!errors.length) { fs.writeFileSync(reviewGateFile(cfg, id), JSON.stringify({ contract: 'A1ReviewGate/v1', passedAt: new Date().toISOString(), greybox: h, scores: a.scores, eventBindings: events.map(e => e.binding), ...(scoped ? { reviewAnswerHash: sha(fs.readFileSync(tp.answer)) } : {}) }, null, 1) + '\n'); log('  greybox-review: passed'); return { state: 'passed' }; }
  log(`  greybox-review: sent back (${errors.length}): ${errors.slice(0, 3).join(' | ')}`); return { state: 'rejected', errors, issues: a.issues || [] };
}

// ---------------------------------------------------------------- the chapters held to the greybox
// (the independent audit of 2026-10-28: nothing in a chapter's task or its checks read the approved greybox — "build it to
// the greybox" was a sentence in a brief.) A chapter of a film approved on its greybox gets each beat's greybox in its
// task, and its keyframes are measured against it: every line the greybox sets is on the beat's frame, within a quarter
// of the frame of where the greybox placed it. A beat may differ on purpose, said in the module
// (export const greyboxDiffer = { B07: '<why>' }), as the reviews' follows/differ are.
export const DRIFT = 0.25;
// (pure, tested) figures written either way read as one (九十億 and 90億: the second audit's false alarm on B08)
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }, CU = { 十: 10, 百: 100, 千: 1000 };
export function cnDigits(t) {
  return String(t || '').replace(/[零〇一二兩两三四五六七八九十百千]+/g, (m) => {
    if (!/[十百千]/.test(m) && m.length > 1) return [...m].map((c) => CN[c] ?? c).join('');
    let total = 0, cur = 0; for (const c of m) { if (c in CN) cur = CN[c]; else { total += (cur || 1) * CU[c]; cur = 0; } }
    return String(total + cur);
  });
}
const key = (x) => bare(cnDigits(x));
// (pure, tested) drawn: { <beat>: [{ text, whole, x0, y0, x1, y1 }] } read off the keyframes; rows: the approved greybox's
// beats; hant: the film's script for the greybox's words; differ: { <beat>: why }. A line of the greybox not on its frame
// is an error; one standing far from its place is a note until the measure is calibrated on a film built to its greybox
// (AGENTS: a new chapter check is tried on kept tracks first — there is no such film yet)
export function greyboxDriftErrors(drawn, rows, { hant = (x) => x, differ = {} } = {}) {
  const errors = [], notes = [];
  for (const r of rows || []) {
    if (!drawn[r.beat] || differ[r.beat]) continue;
    for (const t of placeType(r)) {
      const want = key(hant(t.text)), b = typeBox(t), got = drawn[r.beat].find((d) => [d.text, d.whole].some((x) => x && (key(x).includes(want) || (want.includes(key(x)) && key(x).length >= 2))));
      if (!got) { errors.push(`${r.beat}: "${t.text}" of the approved greybox is not on its frame (or say why in greyboxDiffer)`); continue; }
      const dx = ((got.x0 + got.x1) / 2 - (b.x0 + b.x1) / 2) / W, dy = ((got.y0 + got.y1) / 2 - (b.y0 + b.y1) / 2) / H;
      if (Math.hypot(dx, dy) > DRIFT) notes.push(`${r.beat}: "${t.text}" stands ${Math.round(Math.hypot(dx, dy) * 100)} % of the frame from where the approved greybox put it (${DRIFT * 100} % at most; or say why in greyboxDiffer)`);
    }
  }
  return { errors, notes };
}
// (pure, tested) the module's own reasons for departing from the greybox
export const greyboxDifferOf = (code) => { const m = /export\s+const\s+greyboxDiffer\s*=\s*(\{[\s\S]*?\});/.exec(String(code || '')); if (!m) return {}; try { return Function(`return (${m[1]})`)(); } catch { return {}; } };
// the greybox the chapters follow once the design is approved: its checked answer as it stands (stale: sent back by its checks)
export function approvedGreybox(cfg, id) {
  const root = projectPaths(cfg, id).root, p = loadProject(cfg, id) || {};
  if (!(p.gateSet === 'design' && p.design?.approved)) return { state: 'none' };
  const c = readJson(path.join(root, 'tasks', `${GREYBOX_STEP}.check.json`)), a = readJson(path.join(root, 'tasks', `${GREYBOX_STEP}.answer.json`));
  // (approved once — the user 2026-10-28: 定设计只批一次，之后改动不重开、不挡章节: the chapters follow the greybox as it stands once
  // it passes its checks, a change shown at the final; only a greybox sent back by its checks holds them —
  // hold = acceptance / session-brief / fine render, NOT chapter preview.mp4 or draft white-model look)
  return c?.ok && a ? { state: 'approved', answer: a, changed: c.answerHash !== p.design.greybox } : { state: 'stale' };
}
// a greybox sent back after design approval: structure hold for acceptance, not a morph geometry fault
export const GREYBOX_STALE_RE = /the greybox was sent back by its checks/;
export const isGreyboxStaleHold = (e) => GREYBOX_STALE_RE.test(String(e || ''));
export const morphCodeErrors = (errors = []) => (errors || []).filter((e) => !isGreyboxStaleHold(e));
export function greyboxStaleMessage(id, chapterId) {
  return `${chapterId}: the greybox was sent back by its checks after the design was approved: fix it before accepting this chapter (preview and draft still allowed; node scripts/recipe-board.mjs gate --project ${id})`;
}
// the approved greybox's rows of a chapter's beats (for its task), when the film's design was approved on it
export function greyboxFor(cfg, id, beats) {
  const g = approvedGreybox(cfg, id); if (g.state !== 'approved') return null;   // (only the approved one: the second audit)
  return (g.answer.beats || []).filter((r) => beats.includes(r.beat)).map((r) => ({ ...r, type: placeType(r) }));
}
