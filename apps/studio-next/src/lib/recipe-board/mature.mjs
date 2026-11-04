// HOUSE 「成熟」四条硬合同 — structural checks on greybox (+ filmdesign palette on beats).
// Pixel-level taste stays later; answer-shape gates fail here. Spine jumps: warn in usage meter
// for unclaimed/legacy; **fail** when matureFirstDraft claimed or design-set project (P0 C2 2026-10-29).
// Title / evidence-card / empty-placeholder always fail greybox.
import { grid as TG } from '../../../../../work/recipe-board-v1/style-lab/engine/templates/typegrid.js';

export const W = 1920, H = 1080;
export const EVIDENCE_SHAPES = ['photo', 'screen'];
export const EVIDENCE_BLOCK_MIN_SHARE = 0.15;

export const MATURE_CODES = Object.freeze({
  SPINE: 'palette-spine-jump',
  TITLE: 'title-press-weak',
  EVIDENCE_CARD: 'evidence-not-card',
  PLACEHOLDER: 'placeholder-main',
});

// hue families for the house palettes (routing/palettes.json). Neutrals carry the spine without counting as a jump.
export const PALETTE_HUE_FAMILY = Object.freeze({
  noir: 'neutral',
  'cream-print': 'neutral',
  'amber-lamp': 'neutral',
  mustard: 'mustard',
  'film-red': 'red',
  'cobalt-card': 'cobalt',
  'indigo-night': 'indigo',
  'teal-chart': 'teal',
});

// adjacent coloured families allowed without an explicit turn (shared spine or warm/cool flip)
const RELATED = new Set([
  'mustard|red', 'red|mustard',
  'cobalt|indigo', 'indigo|cobalt',
  'indigo|teal', 'teal|indigo',
  'cobalt|teal', 'teal|cobalt',
  'mustard|amber', 'amber|mustard',
]);

export function paletteHueFamily(id) {
  if (id == null || id === '(none)') return 'neutral';
  return PALETTE_HUE_FAMILY[id] || 'other';
}

export function huesRelated(a, b) {
  if (!a || !b) return true;
  if (a === 'neutral' || b === 'neutral') return true;
  if (a === b) return true;
  return RELATED.has(`${a}|${b}`);
}

const frame = W * H;
const shareOf = (k) => (Math.min(k.w, W) * Math.min(k.h, H)) / frame;
const approxSize = (n, target) => Math.abs(n - target) <= target * 0.06;

// (pure, tested) 主色一条脊：相邻拍不得无理由跳第三套色相（中性承运；同族或 RELATED 放行）
// opts.hard / opts.claim / claimsMatureFirstDraft → level fail (string errors for greybox); else warn objects for usage
export function matureSpineErrors(beats = [], opts = {}) {
  const hard = opts.hard === true || opts.claim === true || claimsMatureFirstDraft(null, opts)
    || opts.project?.matureFirstDraft === true
    || opts.project?.gateSet === 'design';
  const e = [];
  for (let i = 1; i < (beats || []).length; i++) {
    const a = beats[i - 1], b = beats[i];
    const fa = paletteHueFamily(a.palette?.id || a.palette), fb = paletteHueFamily(b.palette?.id || b.palette);
    if (huesRelated(fa, fb)) continue;
    const say = `${a.beat}→${b.beat}: palette spine jumps ${fa}→${fb} (${a.palette?.id || a.palette}→${b.palette?.id || b.palette}): HOUSE mature — one lead hue; adjacent beats stay related or pass through neutral`;
    if (hard) e.push(`${MATURE_CODES.SPINE}: ${say}`);
    else e.push({ level: 'warn', code: MATURE_CODES.SPINE, beat: `${a.beat}→${b.beat}`, say });
  }
  return e;
}

// (pure, tested) 标题字压场：hero / medium=type / medium=evidence 须有 ≥ title（128）的字；hero 还须 ≥ figure（200）
export function matureTitlePressErrors(answer, beats = []) {
  const e = [], by = Object.fromEntries((beats || []).map((b) => [b.beat, b]));
  const titleFloor = TG.size.title, figureFloor = TG.size.figure;
  for (const r of answer?.beats || []) {
    const meta = by[r.beat] || {};
    const needs = meta.hero || meta.medium === 'type' || meta.medium === 'evidence';
    if (!needs) continue;
    const sizes = (r.type || []).map((t) => t.size || 0);
    const max = sizes.length ? Math.max(...sizes) : 0;
    const floor = meta.hero ? figureFloor : titleFloor;
    if (max + 1e-6 < floor * 0.94) {
      e.push(`${r.beat}: title type too weak (max ${max || 0} px; ${meta.hero ? 'hero' : meta.medium} needs ≥ ${floor} — TYPE.md five tiers / HOUSE mature title-press)`);
    }
  }
  return e;
}

function hasSourceCaption(r) {
  const types = r.type || [];
  if (types.some((t) => t.role === 'caption')) return true;
  // caption-sized line that reads as a source / date / outlet (still counts when role was left as small)
  return types.some((t) => approxSize(t.size || 0, TG.size.caption) && /来源|出处|报道|通讯|社|报|网|News|Reuters|AP\b|Maxar|Wiki|Food|Freight|卫星|路透|美联|\d{4}/i.test(String(t.text || '')));
}

function hasCardPlate(r, ev) {
  return (r.blocks || []).some((k) => {
    if (k === ev) return false;
    if (!(k.role === 'context' || k.role === 'subject')) return false;
    if (!['rect', 'screen', 'photo'].includes(k.shape)) return false;
    const contains = k.x <= ev.x + 1 && k.y <= ev.y + 1 && k.x + k.w >= ev.x + ev.w - 1 && k.y + k.h >= ev.y + ev.h - 1;
    if (!contains) return false;
    return shareOf(k) < 0.92;
  });
}

// (pure, tested) 证据必须卡式：嵌卡或明显内嵌 + 来源行 + 大字；禁止整页 Wiki 平铺当主画面
export function matureEvidenceCardErrors(answer, beats = []) {
  const e = [], by = Object.fromEntries((beats || []).map((b) => [b.beat, b]));
  for (const r of answer?.beats || []) {
    if (by[r.beat]?.medium !== 'evidence') continue;
    const evs = (r.blocks || []).filter((k) => k.role === 'evidence' && EVIDENCE_SHAPES.includes(k.shape));
    if (!evs.length) continue; // evidenceBlockErrors owns the missing-plate case
    const best = evs.reduce((a, k) => (shareOf(k) > shareOf(a) ? k : a), evs[0]);
    const share = shareOf(best);
    const wikiFlat = share >= 0.78 && !hasCardPlate(r, best);
    const insetOrCard = share <= 0.72 || hasCardPlate(r, best);
    const source = hasSourceCaption(r);
    const big = (r.type || []).some((t) => (t.size || 0) >= TG.size.title * 0.94);
    if (wikiFlat || !insetOrCard || !source || !big) {
      const why = [
        wikiFlat ? 'full-page wiki flat' : null,
        !insetOrCard ? 'not inset/card-wrapped' : null,
        !source ? 'no source caption' : null,
        !big ? `no big type ≥${TG.size.title}` : null,
      ].filter(Boolean).join(', ');
      e.push(`${r.beat}: evidence is not card-packaged (${why}; need inset card + source caption + big type — HOUSE mature; no full-page Wiki flat)`);
    }
  }
  return e;
}

const EMPTY_GEOM = new Set(['rect', 'ellipse']);
const FILLED_HINT = (k) => !!(k.image || k.model) || (['photo', 'screen', 'map'].includes(k.shape) && k.image);

// (pure, tested) 禁止空框 / 孤大叉 / 半屏占位几何当主画面
export function maturePlaceholderErrors(answer) {
  const e = [];
  for (const r of answer?.beats || []) {
    const blocks = r.blocks || [];
    const hasFilled = blocks.some(FILLED_HINT);
    for (const k of blocks) {
      const share = shareOf(k);
      const label = String(k.label || '');
      const loneX = /^(X|×|✕|大叉|叉)$/i.test(label.trim()) || (/大叉/.test(label) && share >= 0.12);
      if (loneX && share >= 0.08 && (k.role === 'subject' || k.role === 'mark' || k.role === 'context')) {
        e.push(`${r.beat}: lone big X / cross placeholder is the main picture ("${label}", ${Math.round(share * 100)} %): HOUSE mature — no empty frame / lone X as the lead`);
        continue;
      }
      if (!EMPTY_GEOM.has(k.shape) || k.image || k.model) continue;
      const asSubject = k.role === 'subject' && share >= 0.28;
      const asHalf = share >= 0.45;
      if ((asSubject || asHalf) && !hasFilled) {
        e.push(`${r.beat}: empty placeholder geometry is the main picture ("${label}", ${k.shape}, ${Math.round(share * 100)} %): HOUSE mature — no empty frame / half-screen bare ${k.shape}`);
      }
    }
  }
  return e;
}

// hard fails wired into greyboxErrors. Spine fails when claim/design-set (opts); else usage warn-only via matureSpineFlags
export function matureHardErrors(answer, beats = [], opts = {}) {
  const hard = [
    ...matureTitlePressErrors(answer, beats),
    ...matureEvidenceCardErrors(answer, beats),
    ...maturePlaceholderErrors(answer),
  ];
  const spineHard = opts.hard === true || claimsMatureFirstDraft(answer, opts)
    || opts.project?.matureFirstDraft === true
    || opts.project?.gateSet === 'design';
  if (spineHard) hard.push(...matureSpineErrors(beats, { ...opts, hard: true }));
  return hard;
}

export function matureSpineFlags(beats = []) {
  // usage meter always warn-shaped (never string fails) so banana/suez meters do not flip
  return matureSpineErrors(beats, { hard: false }).map((x) => (typeof x === 'string'
    ? { level: 'warn', code: MATURE_CODES.SPINE, beat: '?', say: x }
    : x));
}

// ---------------------------------------------------------------- 成熟第一稿 runtime gate
// Fails only when a chapter/film *claims* mature first draft (answer.matureFirstDraft /
// project.matureFirstDraft / opts.claim). Aggregates measurable bars; docs checklist alone
// is not enough. Does not import greybox (avoids cycle) — callers pass opening/seam/photo
// gate hits when they have them, or the lightweight checks below run standalone.
export const MATURE_FIRST_DRAFT_CODE = 'mature-first-draft-incomplete';

export function claimsMatureFirstDraft(answer, opts = {}) {
  if (opts.claim === true) return true;
  if (answer?.matureFirstDraft === true) return true;
  if (opts.project?.matureFirstDraft === true) return true;
  return false;
}

function _beatHasInShotMotion(r) {
  const move = r?.camera?.move || 'static';
  if (move !== 'static') return true;
  for (const x of [...(r?.blocks || []), ...(r?.type || [])]) {
    if (x.enter && x.enter !== 'cut') return true;
    if (x.in != null && x.in > 0.05) return true;
  }
  return false;
}

// (pure, tested) when claimed, every HOUSE mature-first-draft bar must clear measurable gates
export function matureFirstDraftErrors(answer, beats = [], opts = {}) {
  if (!claimsMatureFirstDraft(answer, opts)) return [];
  const rows = answer?.beats || [];
  const missing = [];
  // 1 motion — every beat has in-shot motion; plus any injected openingMotionErrors
  const noMotion = rows.filter((r) => !_beatHasInShotMotion(r)).map((r) => r.beat);
  if (noMotion.length) missing.push(`motion: ${noMotion.join(', ')} lack in-shot motion (camera≠static or block/type enter)`);
  if ((opts.openingErrors || []).length) missing.push(`motion/opening: ${opts.openingErrors.slice(0, 2).join(' | ')}`);
  if ((opts.cameraErrors || []).length) missing.push(`motion/camera: ${opts.cameraErrors.slice(0, 2).join(' | ')}`);
  // 2 material-packaging — mature evidence card + title press on evidence
  const mat = [...matureEvidenceCardErrors(answer, beats), ...matureTitlePressErrors(answer, beats).filter((x) => /evidence|title type/i.test(x))];
  if (mat.length) missing.push(`material-packaging: ${mat.slice(0, 2).join(' | ')}`);
  // 3 type-layout — title press hard
  const typ = matureTitlePressErrors(answer, beats);
  if (typ.length) missing.push(`type-layout: ${typ.slice(0, 2).join(' | ')}`);
  // 4 real-mesh — injected photoPlaneSubjectErrors + subjectPipelineErrors (chapter path; HOUSE: QA-passed glb, no Tube filler)
  if ((opts.photoPlaneErrors || []).length) missing.push(`real-mesh: ${opts.photoPlaneErrors.slice(0, 2).join(' | ')}`);
  if ((opts.subjectPipelineErrors || []).length) missing.push(`real-mesh/subject-pipeline: ${opts.subjectPipelineErrors.slice(0, 2).join(' | ')}`);
  // 5 shot-core — every beat has camera.move named + (note or type timing); no empty static poster claim
  const weakCore = rows.filter((r) => {
    const move = r?.camera?.move;
    if (!move) return true;
    if (move === 'static' && !(r.type || []).some((t) => t.in != null || (t.enter && t.enter !== 'cut'))) return true;
    return false;
  }).map((r) => r.beat);
  if (weakCore.length) missing.push(`shot-core: ${weakCore.join(', ')} lack a clear shot core (camera move + type timing)`);
  // 6 seam-transition — injected seam errors + hard-cut settle when rows given
  if ((opts.seamErrors || []).length) missing.push(`seam-transition: ${opts.seamErrors.slice(0, 2).join(' | ')}`);
  else {
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if ((a.out || 'cut') !== 'cut') continue;
      const ma = a.camera?.move || 'static', mb = b.camera?.move || 'static';
      if (ma !== 'static' || mb !== 'static') {
        missing.push(`seam-transition: ${a.beat}→${b.beat} hard cut with camera still moving (${ma}→${mb})`);
        break;
      }
    }
  }
  // placeholder as main picture also blocks mature claim
  const ph = maturePlaceholderErrors(answer);
  if (ph.length) missing.push(`shot-core/placeholder: ${ph.slice(0, 2).join(' | ')}`);
  if (!missing.length) return [];
  return [`${MATURE_FIRST_DRAFT_CODE}: claimed mature first draft but bars incomplete — ${missing.join('; ')} (HOUSE 成熟第一稿检查清单; routing/mature-first-draft.json)`];
}

