// Declarative director routes (A1DirectorRoutes/v1): 旁白/beat semantics → kind → composition → ready devices.
// One source of truth for filmdesign / beatdesign / sessionbrief auto-pick. Never select opening shells
// (array-build / stagger-reveal / light-3d / presenter-close); only kit.status==="ready" (or table status ready when catalog absent).
import fs from 'node:fs';
import path from 'node:path';
import { visualLanguageIds, visualLanguages } from '../../../../../work/recipe-board-v1/style-lab/engine/templates/visual-language.js';

// Optional expressive layers, not replacements for composition/device/opening/evidence gates.
export function visualLanguageShortlist(beat = {}, table = null) {
  const purpose = beat.visualPurpose ?? beat.directorIntent?.visualPurpose;
  if (purpose === 'clean' || beat.medium === 'evidence' || beat.kind === 'evidence' || beat.directorIntent?.route === 'evidence') return [];
  const cue = routeCueText(beat);
  return (table?.visualLanguages || []).filter(r => r.status === 'ready' &&
    visualLanguageIds.includes(r.id) && typeof visualLanguages[r.export] === 'function' &&
    r.entry === 'type.dev.visualLanguage' && r.module === 'templates/visual-language.js' &&
    (purpose ? r.purposes?.includes(purpose) : r.cues?.some(c => cue.includes(c)))).map(r => ({...r}));
}

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

/** Unwired opening shells — never auto-selected, even if a table row is wrong. */
export const OPENING_SHELL_IDS = Object.freeze(['array-build', 'stagger-reveal', 'light-3d', 'presenter-close']);

export function loadDirectorRoutes(cfg) {
  if (!cfg?.dataDir) return null;
  return readJson(path.join(cfg.dataDir, 'routing', 'director-routes.json'), null);
}

export function routesByKind(table) {
  return Object.fromEntries((table?.routes || []).map((r) => [r.kind, r]));
}

/**
 * Cue string used for semantics[] matching. Meta tokens (act=open / medium=evidence / hero) are
 * synthesized from beat fields so table semantics like "act=open" hit without needing them in narration.
 */
export function routeCueText(beat = {}) {
  const parts = [];
  if (beat.kind) parts.push(String(beat.kind));
  if (beat.act === 'open') parts.push('act=open', '开场');
  if (beat.hero === true && !beat.act) parts.push('hero 首镜', '开场');
  if (beat.medium === 'evidence') parts.push('medium=evidence');
  const narration = String(beat.text ?? beat.narration ?? '');
  if (narration) parts.push(narration);
  return parts.join('\n');
}

/**
 * (pure) Map a beat (narration / explicit kind / act / medium) → route kind.
 * Priority: explicit kind → opening (act/hero) → evidence medium → best semantics[] hit on cue text.
 */
export function matchRouteKind(beat = {}, table = null) {
  const routes = table?.routes || [];
  if (!routes.length) return null;
  const known = new Set(routes.map((r) => r.kind));
  // Opening beats always route to opening (never shells)
  if (beat.act === 'open' || (beat.hero === true && !beat.act)) return known.has('opening') ? 'opening' : null;
  // A documented director decision overrides the keyword suggestion. A custom semantic
  // action has no forced catalog route; its production checks still apply separately.
  if (beat.directorIntent?.route === 'custom') return null;
  if (known.has(beat.directorIntent?.route)) return beat.directorIntent.route;
  if (beat.kind && known.has(beat.kind)) return beat.kind;
  if (beat.medium === 'evidence' && known.has('evidence')) return 'evidence';

  const cue = routeCueText(beat);
  // Score independent clauses: a denial of evidence must not erase a later map.
  const clauses = cue.split(/[,，。；;.!！?？]|(?:但是|但|然而|\bbut\b)/i);
  const positive = (re, neg) => clauses.some(c => re.test(c) && !neg.test(c));
  const hasMap = positive(/地图|地圖|(?<![a-z0-9_])map(?![a-z0-9_])/i, /(?:没有|沒有|无|無|不使用)(?:任何)?(?:地图|地圖)|\b(?:no|without)\s+(?:any\s+)?map\b/i);
  const hasEvidence = positive(/证据|證據|(?<![a-z0-9_])evidence(?![a-z0-9_])/i, /(?:没有|沒有|缺乏|无|無)(?:任何|可靠的?)?(?:证据|證據)|(?:证据|證據)(?:不足|缺乏)|\b(?:no|without|lack(?:s|ing)?(?: of)?)\s+(?:any\s+|reliable\s+)*evidence\b|\bevidence(?:\s*-\s*free|\s+(?:is\s+)?(?:insufficient|lacking|absent))\b/i);
  // A worldwide percentage describes a quantity unless a separate geographic cue calls for a map.
  // "全球" alone is scope, not a place or route; it must not overpower an explicit ratio.
  const ratio = /(?:\d+(?:\.\d+)?\s*[%％]|百分之|占比|比例)/.test(cue);
  let best = null, bestScore = 0;
  for (const r of routes) {
    let score = (ratio && r.kind === 'numbers' ? 3 : 0) + (r.kind === 'map' && hasMap ? 2 : 0) + (r.kind === 'evidence' && hasEvidence ? 2 : 0);
    for (const s of r.semantics || []) {
      const tok = String(s || '');
      if (!tok) continue;
      if (ratio && r.kind === 'map' && tok === '全球') continue;
      if (cue.includes(tok)) score += Math.max(1, tok.length);
    }
    if (score > bestScore) {
      bestScore = score;
      best = r.kind;
    }
  }
  return bestScore > 0 ? best : null;
}

// Explicit per-shot scope: never retrospectively reopen unrelated accepted shots.
export const requiresEventContract = (beat = {}) => beat.productionRisk === 'high' || beat.activeRevision === true;

// Scope belongs to existing director/greybox task inputs, not the candidate answer.
// Union is deliberate: answer omission or false cannot cancel an issued repair.
export function taskScopedDesign(cfg, id, design = {}) {
  const dir = path.join(cfg.dataDir, 'projects', id, 'tasks');
  const inputs = ['filmdesign', 'greybox'].flatMap(step => readJson(path.join(dir, `${step}.task.json`))?.input?.beats || []);
  return { ...design, beats: applyEventScope(design?.beats || [], inputs) };
}
export function applyEventScope(rows = [], inputs = []) {
  const ids = new Set(inputs.filter(requiresEventContract).map(b => b.beat));
  const out = rows.map(b => ids.has(b.beat) ? { ...b, activeRevision: true } : { ...b });
  for (const beat of ids) if (!out.some(b => b.beat === beat)) out.push({ beat, activeRevision: true });
  return out;
}

// Local seconds explicitly chosen by the director. Equal times allow a genuine hold.
export function eventTimeErrors(beat = {}) {
  const t = beat.directorIntent?.eventTimes, values = ['start', 'key', 'end'].map(k => t?.[k]);
  if (!t || values.some(v => !Number.isFinite(v) || v < 0) ||
      (Number.isFinite(beat.dur) && values.some(v => v >= beat.dur)) ||
      values[0] > values[1] || values[1] > values[2])
    return [`${beat.beat || '?'}.eventTimes: unknown; require local seconds 0 <= start <= key <= end < duration`];
  return [];
}

// Presence and provenance contract, not a claim that prose is semantically correct.
export function directorIntentErrors(beat = {}, { requireMotionDesign = false } = {}) {
  requireMotionDesign ||= requiresEventContract(beat);
  const d = beat.directorIntent;
  if (d == null) return requireMotionDesign ? [`film.${beat.beat || "?"}.directorIntent: required for motion design`] : [];
  const out = [], tag = `film.${beat.beat || '?'}.directorIntent`;
  if (typeof d !== 'object' || Array.isArray(d)) return [`${tag}: must be an object`];
  if (!['opening', 'evidence', 'numbers', 'map', 'compare', 'custom'].includes(d.route)) out.push(`${tag}.route: choose a known route or custom`);
  for (const k of ['question', 'change', 'reason']) if (typeof d[k] !== 'string' || d[k].trim().length < 5) out.push(`${tag}.${k}: describe the viewer question, visible change and reason`);
  if (requireMotionDesign || ['start', 'end', 'handoff'].some((k) => d[k] != null)) {
    for (const k of ['start', 'end', 'handoff']) if (typeof d[k] !== 'string' || d[k].trim().length < 5) out.push(`${tag}.${k}: describe the composition state or semantic handoff (a cut/hold is valid)`);
  }
  for (const k of ['evidence', 'art', 'type']) if (typeof d.layers?.[k] !== 'string' || d.layers[k].trim().length < 1) out.push(`${tag}.layers.${k}: describe the layer or explicitly say none`);
  if (requiresEventContract(beat) || d.assets != null) {
    if (!Array.isArray(d.assets) || !d.assets.length) out.push(`${tag}.assets: bind event operations to assets (code-only type is also an asset)`);
    for (const a of Array.isArray(d.assets) ? d.assets : []) {
      const at = `${tag}.assets.${a?.id || '?'}`;
      if (!a || !['art', 'evidence', 'type'].includes(a.use) || !['generated', 'real', 'code'].includes(a.source) || typeof a.file !== 'string' || !a.file.trim()) out.push(`${at}: declare use/source/file`);
      if (!['hold', 'camera', 'per-object', 'deform', 'reveal'].includes(a?.operation)) out.push(`${at}.operation: declare required event operation`);
      if (!['whole-image', 'layers', 'mesh', 'code'].includes(a?.operability)) out.push(`${at}.operability: declare actual asset capability`);
      if (['per-object', 'deform'].includes(a?.operation) && a.operability === 'whole-image') out.push(`${at}.operability: a whole image cannot satisfy per-object/deform events`);
      if (a?.use === 'evidence' && (a.source !== 'real' || typeof a.provenance !== 'string' || !a.provenance.trim())) out.push(`${at}: evidence requires a real source and provenance; existing evidence binding checks still apply`);
      if (a?.use === 'type' && a.source !== 'code') out.push(`${at}: type requires a code source`);
    }
  }
  return out;
}

/**
 * (pure) Ready device ids for a route.
 * - Requires table device.status === "ready"
 * - Always drops OPENING_SHELL_IDS
 * - When a devices catalog is given, also requires kit.status === "ready" (or kit missing for bare-id tests)
 */
export function readyDevicesForRoute(route, devicesCatalog = null) {
  const shells = new Set(OPENING_SHELL_IDS);
  const rows = Array.isArray(devicesCatalog)
    ? devicesCatalog
    : (devicesCatalog?.devices || null);
  const byId = rows
    ? Object.fromEntries(rows.map((d) => {
        const row = typeof d === 'string' ? { id: d } : d;
        return [row?.id, row];
      }).filter(([id]) => id))
    : null;
  const out = [];
  for (const d of route?.devices || []) {
    const id = typeof d === 'string' ? d : d?.id;
    if (!id || shells.has(id)) continue;
    const declared = typeof d === 'string' ? 'ready' : d?.status;
    if (declared != null && declared !== 'ready') continue;
    if (byId) {
      const row = byId[id];
      if (!row) continue;
      const st = row.kit?.status;
      if (st === 'none' || st === 'blocked') continue;
      if (st != null && st !== 'ready') continue;
    }
    out.push(id);
  }
  return out;
}

/**
 * (pure) Full auto-pick for one beat: kind → composition → ready devices (+ chapterPaths / gold).
 */
export function pickDirectorDefaults(beat = {}, { table = null, devices = null } = {}) {
  const kind = matchRouteKind(beat, table);
  const visualLanguages = visualLanguageShortlist(beat, table);
  if (!kind) {
    return { kind: null, composition: null, altCompositions: [], devices: [], chapterPaths: [], gold: [], route: null, visualLanguages };
  }
  const route = routesByKind(table)[kind] || null;
  return {
    kind,
    composition: route?.composition || null,
    altCompositions: [...(route?.altCompositions || [])],
    devices: readyDevicesForRoute(route, devices),
    chapterPaths: [...(route?.chapterPaths || [])],
    gold: [...(route?.gold || [])],
    visualLanguages,
    route,
  };
}

/** (pure) Defaults map keyed by beat id — for task inject / session brief. */

/** Answer fields a route pick is expected to pin into filmdesign/greybox beats. Shells never. */
export function routeAnswerFields(pick) {
  if (!pick?.kind) return null;
  const devices = (pick.devices || []).filter((id) => id && !OPENING_SHELL_IDS.includes(id));
  return {
    kind: pick.kind,
    composition: pick.composition || null,
    device: devices[0] || null,
    devices,
    altCompositions: [...(pick.altCompositions || pick.route?.altCompositions || [])],
  };
}

/**
 * Pin route defaults into one answer beat: fill missing kind / composition / device from pick.
 * Does not overwrite a non-empty field (mismatch → routeUneatenErrors). Never pins shells.
 */
export function pinRouteIntoAnswerBeat(row = {}, pick = null) {
  if (requiresEventContract(row)) return { ...row }; // recommendation is not a director decision
  const fields = routeAnswerFields(pick);
  if (!fields) return { ...row };
  const out = { ...row };
  if ((out.kind == null || out.kind === '') && fields.kind) out.kind = fields.kind;
  if ((out.composition == null || out.composition === '') && fields.composition) {
    out.composition = fields.composition;
  }
  if ((out.device == null || out.device === '') && fields.device) out.device = fields.device;
  return out;
}

/** Pin routeDefaults map (beat id → pick) into an answer's beats[]. */
export function pinRouteDefaultsIntoAnswer(answer, routeDefaultsByBeat = {}, explicitBeats = []) {
  if (!answer?.beats) return answer;
  return {
    ...answer,
    beats: answer.beats.map((r) => {
      const id = r?.beat;
      const pick = id != null ? routeDefaultsByBeat[id] : null;
      return pick && !explicitBeats.includes(id) ? pinRouteIntoAnswerBeat(r, pick) : { ...r };
    }),
  };
}

/**
 * Fail when director-routes auto-pick selected X but the answer beat did not eat it.
 * Message always includes 「路由选了但答案未吃」 so usage/check can catch it measurably.
 * fields: subset to check — filmdesign defaults kind+composition+device; greybox typically device.
 */
export function routeUneatenErrors(rows = [], routeDefaultsByBeat = {}, { prefix = 'film', fields = null } = {}) {
  const check = fields || ['kind', 'composition', 'device'];
  const e = [];
  for (const r of rows || []) {
    const id = r?.beat;
    if (!id) continue;
    const want = routeAnswerFields(routeDefaultsByBeat[id]);
    if (!want) continue;
    const tag = `${prefix}.${id}`;
    const uneaten = (field, detail) =>
      e.push(`${tag}.${field}: 路由选了但答案未吃 (${detail})`);
    if (check.includes('kind') && want.kind) {
      if (r.kind == null || r.kind === '') uneaten('kind', `route kind=${want.kind}, answer missing`);
      else if (r.kind !== want.kind) uneaten('kind', `route kind=${want.kind}, answer got ${r.kind}`);
    }
    if (check.includes('composition') && want.composition) {
      const allowed = new Set([want.composition, ...(want.altCompositions || [])].filter(Boolean));
      if (r.composition == null || r.composition === '') {
        uneaten('composition', `route composition=${want.composition}, answer missing`);
      } else if (!allowed.has(r.composition)) {
        uneaten('composition', `route composition=${want.composition}, answer got ${r.composition}`);
      }
    }
    if (check.includes('device') && want.devices.length) {
      const allowed = new Set(want.devices);
      if (r.device == null || r.device === '') {
        uneaten('device', `route devices=[${want.devices.join(',')}], answer missing`);
      } else if (!allowed.has(r.device)) {
        uneaten('device', `route devices=[${want.devices.join(',')}], answer got ${r.device}`);
      }
    }
  }
  return e;
}

export function pickDirectorDefaultsByBeat(beats = [], { table = null, devices = null } = {}) {
  const out = {};
  for (const b of beats || []) {
    const id = b?.beat ?? b?.shotId ?? b?.id;
    if (!id) continue;
    out[id] = pickDirectorDefaults(b, { table, devices });
  }
  return out;
}
