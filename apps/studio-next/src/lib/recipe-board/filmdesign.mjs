// The whole film designed before its beats, and measured and reviewed as a whole after (the user 2026-10-27: 我没说细节
// 这些 我再说整片的美学设计; then: 按你说的加整片设计这一步（整片的起伏图、重头画面、整片量尺和整片盲审）). Beats each
// fine on their own made a flat film: seven tenths the same dark chart from above, one tone from the grounding to the
// release, the big moments only at the two ends.
//   1. filmdesign: the director's arc, beat by beat — the act it plays (open … peak … close), its scale (world, region,
//      place, object, detail), its value (dark, mid, light), its medium (diagram, footage, type, evidence), how strong the
//      red is, and the hero moments (four to six: the open, the turn, the peak, the close) with how each is made. Checked
//      (filmDesignNotes): heroes where the story turns, no long run of the same look, more than one medium, the red at
//      its strongest on the peak. Its rows go into every chapter's brief and module task (input.film).
//   2. the film measured (filmarc.py on the white model): its longest unchanging stretch, the share of it in such
//      stretches, new looks a minute, the spread of its lightness — floors set at the least varied of the references
//      (回形针 Vol.138 and Vol.047, Gawx, Johnny Harris, Nerdwriter: 8.8 to 39 changes a minute, lightness spread 0.17 to
//      0.64, at most half the film in stretches of 20 s; Suez before this step: 1.9, 0.075, 0.80).
//   3. film-taste: two reviewers who did not make it, given the film's overview sheet beside the references' sheets
//      (prompts/film-taste.md), score its rhythm, arc, variety, hero moments and cohesion; averaged.
//   4. the board (filmboard.py, out/film/board.png): the arc as designed over the film as measured, the hero frames.
import fs from 'node:fs';
import { houseStyleRequiredErrors, houseStylePickErrors, mediaCatalogErrors, screenFilmedDeviceErrors, capabilityRouteResolveErrors, mediaKindDeviceErrors } from './p1hard.mjs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectPaths, loadProject } from './store.mjs';
import { readStyle } from './filmlook.mjs';
import { needKey, needPrint, bindingMatchesForm } from './materials.mjs';
import * as DB from './designbrain.mjs';
import { chapterGuidance, chapterTechniques, positiveReferenceCue } from './techniques.mjs';
import { loadPalettes, filmPaletteErrors, filmPaletteNotes, beatColour, filmColourErrors, filmColourNotes } from './palettes.mjs';
import { paletteHueFamily, huesRelated } from './mature.mjs';
import { loadDirectorRoutes, pickDirectorDefaults, pickDirectorDefaultsByBeat, pinRouteDefaultsIntoAnswer, routeUneatenErrors, directorIntentErrors, taskScopedDesign, applyEventScope, OPENING_SHELL_IDS as ROUTE_OPENING_SHELLS } from './directorroutes.mjs';
import { loadVariantMatrix, solveFilmVariants, variantDiversityReport } from './variants.mjs';
// the screen a beat is shown on (routing/media.json; the user 2026-10-16: 还不如之前的那种 led — the texture; 2026-10-28:
// 先介质进家里的样子): every beat names one; screen share is advisory, never a quota
export const loadMedia = (cfg) => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'media.json'), 'utf8')); } catch { return null; } };
export function filmScreenErrors(rows, media) {
  if (!media || !rows?.length) return [];
  const by = Object.fromEntries((media.media || []).map((m) => [m.id, m])), e = [];
  for (const r of rows) if (!by[r.screen]) e.push(`film.${r.beat}.screen: one of ${Object.keys(by).join(', ')}`);

  return e;
}
// (pure, tested) how much of the film is on a screen: a note, not a quota (a screen is chosen for what the beat shows)
export function filmScreenNotes(rows, media) {
  if (!media || !rows?.length || filmScreenErrors(rows, media).length) return [];
  const by = Object.fromEntries((media.media || []).map((m) => [m.id, m])), n = rows.length, on = rows.filter((r) => by[r.screen].screen).length / n, F = media.film || {}, out = [];
  for (const r of rows) { const m = by[r.screen]; if (Array.isArray(m.palettes) && r.palette && !m.palettes.includes(r.palette)) out.push(`film.${r.beat}: review the ${m.id} screen with the ${r.palette} palette (usual pairings: ${m.palettes.join(', ')}); judge rendered colour and readability, not membership in a style pairing`); }
  if (n >= 6 && on < (F.screenShareMin ?? 0.3)) out.push(`film: ${Math.round(on * 100)} % of its beats on a screen (the user values the screen's texture most: where a beat shows a reading, a record, a signal, an old picture, a screen fits)`);
  if (n >= 6 && on > (F.screenShareMax ?? 0.85)) out.push(`film: ${Math.round(on * 100)} % of its beats on a screen (real photos and pages want to be seen clean)`);
  return out;
}
// (pure, tested) every beat says why its palette and its screen suit what it says (the director knows why, the user
// 2026-10-28: 要合适 … 导演要知道这些): a reason of some length, not one reason pasted over many beats
export function designWhyErrors(rows) {
  const e = [], seen = {};
  for (const r of rows || []) { const w = String(r.why || '').trim(); if (w.length < 10) e.push(`film.${r.beat}.why: say why this palette and this screen suit what the beat says (a sentence, from its words)`); else (seen[w] ||= []).push(r.beat); }
  for (const [w, bs] of Object.entries(seen)) if (bs.length >= 3) e.push(`film: ${bs.join(', ')} give one reason (${w.slice(0, 30)}…): each beat says its own`);
  return e;
}

// ---- shortlists (palettes / media / devices catalogs): the director picks by id, never free-fills
// Clean streak/share are review notes; per-beat reasons remain a design contract.
// per-beat shortlists (3–8) from act/medium/scale + device cues: when byBeat is present, the pick MUST land
// in that beat's shortlist (filmShortlistErrors); top-level lists stay the full catalog (reject free names)
export const CLEAN_STREAK_MAX = 5;
export const CLEAN_SHARE_NEED_WHY = 0.85;
export const SHORTLIST_MIN = 3;
export const SHORTLIST_MAX = 8;
// palette catalog is 8 today — without a tighter max, byBeat.palettes === catalog (no filter).
// 7 keeps banana/suez picks in-range after scorePaletteForBeat HOUSE cues, and excludes ≥1 id per beat.
export const PALETTE_SHORTLIST_MAX = 7;
export const loadDevices = (cfg) => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'devices.json'), 'utf8')); } catch { return null; } };
export const loadHouseStyle = (cfg) => { try { return JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'routing', 'house-style.json'), 'utf8')); } catch { return null; } };
// (pure) keep order, drop dups, fill from fallback, clamp to [min, max] (catalog may be smaller than min)
export function clampShortlist(ids, fallback = [], { min = SHORTLIST_MIN, max = SHORTLIST_MAX } = {}) {
  const out = [], seen = new Set();
  for (const id of [...(ids || []), ...(fallback || [])]) {
    if (!id || seen.has(id)) continue;
    seen.add(id); out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
// (pure) rank a palette row for one beat by act / medium / value / scale / red (HOUSE: suitable, not forced)
export function scorePaletteForBeat(p, beat = {}) {
  let s = 0;
  const act = beat.act || '', med = beat.medium || '', val = beat.value || '', scale = beat.scale || '';
  const red = beat.red ?? 0, forText = String(p?.for || '');
  if (p?.id === 'noir') s += 1;
  if ((act === 'peak' || red >= 2) && /警示|转折|高潮|红/.test(forText)) s += 3;
  if (act === 'turn' && /转折|大字|强调|芥黄/.test(forText)) s += 2;
  if (med === 'evidence' && /证据|文件|报纸/.test(forText)) s += 3;
  if (med === 'type' && /大字|纸|芥黄/.test(forText)) s += 2;
  if ((scale === 'world' || scale === 'region') && /地图|海|航线|地理|夜/.test(forText)) s += 3;
  if (val === 'light' && /芥黄|米白|纸/.test(forText)) s += 2;
  if (val === 'dark' && /暗|夜|琥珀|中性|基调|讲述/.test(forText)) s += 2;
  if (med === 'diagram' && /地图|读数|数字|清单|钴蓝/.test(forText)) s += 1;
  // HOUSE cues that used to score 0 (mustard mid/diagram, teal place/evidence, amber object, noir release)
  if (val === 'mid' && /芥黄|米白|纸|强调|中性|海|航线|琥珀|基调/.test(forText)) s += 2;
  if ((scale === 'object' || scale === 'detail') && /物件|桌面|室内|特写|琥珀/.test(forText)) s += 2;
  if ((scale === 'place' || scale === 'region') && /地图|航线|地理|海/.test(forText)) s += 2;
  if (act === 'press' && /警示|红|暗|夜|基调|讲述|数字|清单/.test(forText)) s += 1;
  if (act === 'build' && /强调|大字|芥黄|纸|证据|地图|航线|琥珀|物件/.test(forText)) s += 1;
  if ((act === 'open' || act === 'close' || act === 'release') && /基调|讲述|过渡|安静/.test(forText)) s += 2;
  if (med === 'diagram' && /大字|强调|芥黄|基调/.test(forText)) s += 1;
  if (med === 'evidence' && /地图|航线|地理|海/.test(forText)) s += 2;
  if (med === 'evidence' && /基调|讲述|过渡|安静/.test(forText)) s += 2;
  return s;
}
// (pure) rank a screen row for one beat (该上屏才上屏: evidence/footage prefer clean/film;
// HOUSE mature step 3: evidence further prefers film/crt/vhs packaged screen over flat clean wiki)
export function scoreScreenForBeat(m, beat = {}) {
  let s = 0;
  const med = beat.medium || '', act = beat.act || '', forText = String(m?.for || '');
  if (m?.id === 'clean') s += 2;
  if ((med === 'evidence' || med === 'footage') && (m?.id === 'clean' || m?.id === 'film')) s += 3;
  // evidence: filmed / CRT / VHS read as page-on-a-card or screen-in-frame; clean alone leans full-page Wiki flat
  if (med === 'evidence' && (m?.id === 'film' || m?.id === 'crt' || m?.id === 'vhs')) s += 3;
  if (med === 'diagram' && /数据|数字|读数|灯珠|代码|日志|示波器/.test(forText)) s += 2;
  if (act === 'peak' && /警示|红字/.test(forText)) s += 2;
  if ((act === 'press' || act === 'build' || med === 'evidence') && /新闻|旧|报纸|报道|监控|录像|网点/.test(forText)) s += 2;
  if (beat.palette && Array.isArray(m?.palettes) && m.palettes.includes(beat.palette)) s += 2;
  if (m?.palettes === 'any') s += 1;
  return s;
}
// HOUSE mature step 3: evidence default candidates prefer card packaging; demote full-page-flat / empty-main paths.
// Empty-frame / lone-X are greybox geometry (maturePlaceholderErrors) — not device ids; shortlist just keeps them out of the recommend seed.
export const EVIDENCE_CARD_DEVICES = Object.freeze([
  'real-doc-callout', 'filmed-screen', 'real-in-frame', 'clipping-stack',
  'real-page-mark', 'banner-verdict', 'callout-line', 'evidence-on-timeline',
]);
// full-bleed photo-over-type reads as wiki-flat main; keep catalog-legal but rank after cards (or drop from top 8)
export const EVIDENCE_DEMOTE_DEVICES = Object.freeze(['photo-over-type']);
// HOUSE「文案→包装」: opening shortlist only these wired devices, and only when kit.status==="ready"
export const OPENING_READY_DEVICES = Object.freeze(['lineup-row', 'copy-to-repeat', 'table-grows']);
export const OPENING_SHELL_DEVICES = Object.freeze(['array-build', 'stagger-reveal', 'light-3d', 'presenter-close']);

/**
 * (pure) opening device ids allowed into a shortlist.
 * - Always exclude OPENING_SHELL_DEVICES (never treat as allowed openings).
 * - Prefer catalog rows with kit.status==="ready".
 * - If a row is missing kit (tests with bare ids), allow only OPENING_READY_DEVICES membership.
 */
export function readyOpeningDeviceIds(devices = []) {
  const rows = (devices || []).map((d) => (typeof d === 'string' ? { id: d } : d)).filter((d) => d?.id);
  const byId = Object.fromEntries(rows.map((d) => [d.id, d]));
  const out = [];
  for (const id of OPENING_READY_DEVICES) {
    if (OPENING_SHELL_DEVICES.includes(id)) continue;
    const row = byId[id];
    if (!row) continue;
    const st = row.kit?.status;
    if (st === 'none' || st === 'blocked') continue;
    if (st != null && st !== 'ready') continue;
    // st === 'ready' OR kit missing (bare id) → allow
    out.push(id);
  }
  return out;
}

// (pure) one beat's recommended 3–8 ids; cued device ids (from narration cues) preferred.
// When director-routes table is passed, seed ready devices for the matched kind (opening/evidence/numbers/map/compare).
export function designBeatShortlist(beat, { palettes = [], media = [], devices = [], cued = [], prevPalette = null, table = null } = {}) {
  const byScoreThenId = (scoreFn) => (a, b) => {
    const d = scoreFn(b, beat) - scoreFn(a, beat);
    return d !== 0 ? d : String(a.id || '').localeCompare(String(b.id || ''));
  };
  // HOUSE mature spine: soft preference for related/neutral to previous hue (boost only — never hard-exclude a catalog pick)
  const prevFam = prevPalette != null ? paletteHueFamily(prevPalette) : null;
  const scorePal = (p, b) => {
    let s = scorePaletteForBeat(p, b);
    if (prevFam) {
      const fam = paletteHueFamily(p?.id);
      if (huesRelated(prevFam, fam)) s += 4;
    }
    return s;
  };
  const palIds = [...(palettes || [])].sort(byScoreThenId(scorePal)).map((p) => p.id).filter(Boolean);
  const scrIds = [...(media || [])].sort(byScoreThenId(scoreScreenForBeat)).map((m) => m.id).filter(Boolean);
  const allDev = (devices || []).map((d) => d.id).filter(Boolean);
  const evergreen = ['carrier', 'subject-stays', 'rhyme', 'callback'].filter((id) => allDev.includes(id));
  // director-routes auto-pick (narration/act/medium → kind → ready devices); shells never
  const routePick = table ? pickDirectorDefaults(beat, { table, devices }) : { kind: null, devices: [] };
  const routeDev = (routePick.devices || []).filter((id) => allDev.includes(id) && !ROUTE_OPENING_SHELLS.includes(id));
  // HOUSE「文案→包装」opening: act=open / hero / route kind opening — only kit.status==="ready" wired devices (shells never)
  const isOpen = beat?.act === 'open' || (beat?.hero === true && !beat?.act) || routePick.kind === 'opening';
  const openingBuild = isOpen ? readyOpeningDeviceIds(devices).filter((id) => allDev.includes(id)) : [];
  const isEvidence = beat?.medium === 'evidence' || routePick.kind === 'evidence';
  // evidence: card-packaged paths first (order only — still legal if catalog-listed)
  const cardFirst = isEvidence
    ? EVIDENCE_CARD_DEVICES.filter((id) => allDev.includes(id))
    : [];
  const demote = new Set(isEvidence ? EVIDENCE_DEMOTE_DEVICES : []);
  // fill order: non-demoted catalog ids, then demoted (so photo-over-type / flat-main stay out of the top 8 when cards fill it)
  const fillDev = [
    ...allDev.filter((id) => !demote.has(id) && !(isOpen && ROUTE_OPENING_SHELLS.includes(id))),
    ...allDev.filter((id) => demote.has(id)),
  ];
  // A required route cannot be truncated by a long list of narration cues.
  const deviceSeed = [...routeDev, ...(cued || []), ...openingBuild, ...cardFirst, ...evergreen];
  return {
    palettes: clampShortlist(palIds, palIds, { max: PALETTE_SHORTLIST_MAX }),
    screens: clampShortlist(scrIds, scrIds),
    devices: clampShortlist(deviceSeed, fillDev),
    ...(routePick.kind ? { routeKind: routePick.kind, routeComposition: routePick.composition || null } : {}),
  };
}
// narration only for device cues — never design `why` (why describes look choice and drifts cues off the article)
export function deviceCueText(b) {
  return String(b?.text ?? b?.narration ?? '');
}
// palette/screen score act/medium/scale/value/red; device cues use narration.
// Task (filmBeats) often lacks act/medium; check used to spread the whole design row (incl. palette/screen/why),
// so byBeat shown in the task ≠ byBeat rebuilt at check. Merge through one helper: design supplies scoring
// fields when present, plan supplies narration text; never copy palette/screen/device/why/hero (picks under gate).
export function beatForShortlist(planLike = null, designRow = null, { narration = null } = {}) {
  const id = (planLike && (planLike.beat ?? planLike.shotId ?? planLike.id)) ?? designRow?.beat;
  if (!id) return null;
  const p = planLike || {}, d = designRow || {};
  const text = narration != null
    ? String(narration[id] ?? narration[p.beat] ?? narration[p.id] ?? '')
    : deviceCueText(p);
  const out = { beat: id, text };
  if (d.directorIntent != null) out.directorIntent = d.directorIntent;
  for (const k of ['act', 'medium', 'scale', 'value']) {
    const v = d[k] ?? p[k];
    if (v != null && v !== '') out[k] = v;
  }
  const red = d.red ?? p.red;
  if (red != null) out.red = red;
  return out;
}
// (pure) mirror refbreakdown.deviceCues against narration; returns { [beatId]: deviceId[] }
export function cuedDevicesByBeat(beats, deviceRows = []) {
  if (!beats?.length || !deviceRows?.length) return null;
  const cueOf = (d) => { try { return d.cue ? new RegExp(d.cue) : null; } catch { return null; } };
  const cues = (deviceRows || []).map((d) => [d, cueOf(d)]).filter(([, r]) => r);
  if (!cues.length) return null;
  return Object.fromEntries(beats.map((b) => {
    const id = b?.beat ?? b?.shotId ?? b?.id;
    const hit = cues.filter(([, r]) => r.test(deviceCueText(b))).map(([d]) => d.id);
    return [id, hit];
  }).filter(([id]) => id));
}
export function designShortlistsFrom({ palettes = null, media = null, devices = null, beats = null, cuedByBeat = null, table = null } = {}) {
  const base = {
    palettes: (palettes?.palettes || []).map((p) => p.id).filter(Boolean),
    screens: (media?.media || []).map((m) => m.id).filter(Boolean),
    devices: (devices?.devices || []).map((d) => d.id).filter(Boolean),
  };
  if (!beats?.length) return base;
  // same cue source as designShortlists / refbreakdown: narration on the beat — never why
  const cue = cuedByBeat ?? cuedDevicesByBeat(beats, devices?.devices || []) ?? {};
  const byBeat = {};
  let prevPalette = null;
  for (const b of beats) {
    const id = b?.beat ?? b?.shotId ?? b?.id;
    if (!id) continue;
    byBeat[id] = designBeatShortlist(b, {
      palettes: palettes?.palettes || [],
      media: media?.media || [],
      devices: devices?.devices || [],
      cued: cue[id] || b.devices || [],
      prevPalette,
      table,
    });
    // spine soft-boost only from an explicit chosen palette (answer/plan). Never chain shortlist tops —
    // that poisoned B17 film-red when B01's top was cobalt (synthetic withBeats + banana pick check).
    prevPalette = b.palette || prevPalette;
  }
  return { ...base, byBeat };
}
export function designShortlists(cfg, beats = null, { design = null } = {}) {
  const palettes = loadPalettes(cfg), media = loadMedia(cfg), devices = loadDevices(cfg);
  const table = loadDirectorRoutes(cfg);
  // task shortlists: same beat shape as check (beatForShortlist) — plan narration + design act/medium when answer exists
  const byDesign = Object.fromEntries((design?.beats || []).map((r) => [r.beat, r]));
  const shaped = beats?.length
    ? beats.map((b) => {
        const s = beatForShortlist(b, byDesign[b.beat ?? b.id] || null);
        // spine carry only (not scoring input): when an answer already picked, chain that hue into the next beat's soft boost
        const pick = byDesign[b.beat ?? b.id]?.palette;
        if (s && pick) s.palette = pick;
        return s;
      }).filter(Boolean)
    : null;
  return designShortlistsFrom({ palettes, media, devices, beats: shaped, table });
}
// (pure, tested) palette/screen/(optional)device must be catalog ids; when shortlists.byBeat.<beat> is present,
// the pick must also land in that beat's 3–8 shortlist (HOUSE: 从短名单点名 — recommend became hard gate)
export function filmShortlistErrors(rows, shortlists) {
  if (!shortlists || !rows?.length) return [];
  const P = new Set(shortlists.palettes || []), S = new Set(shortlists.screens || []), D = new Set(shortlists.devices || []), e = [];
  for (const r of rows) {
    if (r.palette != null && P.size && !P.has(r.palette)) e.push(`film.${r.beat}.palette: pick an id from the shortlist (${[...P].join(', ')}), not a free name`);
    if (r.screen != null && S.size && !S.has(r.screen)) e.push(`film.${r.beat}.screen: pick an id from the shortlist (${[...S].join(', ')}), not a free name`);
    if (r.device != null && D.size && !D.has(r.device)) e.push(`film.${r.beat}.device: pick an id from the shortlist (${[...D].slice(0, 12).join(', ')}${D.size > 12 ? ', …' : ''}), not a free name`);
    const bb = shortlists.byBeat?.[r.beat];
    if (!bb) continue;
    const Pb = new Set(bb.palettes || []), Sb = new Set(bb.screens || []), Db = new Set(bb.devices || []);
    if (r.palette != null && Pb.size && !Pb.has(r.palette)) e.push(`film.${r.beat}.palette: pick from this beat's shortlist (${[...Pb].join(', ')}), not only the catalog (got ${r.palette})`);
    if (r.screen != null && Sb.size && !Sb.has(r.screen)) e.push(`film.${r.beat}.screen: pick from this beat's shortlist (${[...Sb].join(', ')}), not only the catalog (got ${r.screen})`);
    if (r.directorIntent?.route !== 'custom' && r.device != null && Db.size && !Db.has(r.device)) e.push(`film.${r.beat}.device: pick from this beat's shortlist (${[...Db].slice(0, 12).join(', ')}${Db.size > 12 ? ', …' : ''}), not only the catalog (got ${r.device})`);
  }
  return e;
}

// (pure, tested) director-routes auto-pick must land in the answer (kind/composition/device) — 「路由选了但答案未吃」
export function filmRouteUneatenErrors(rows, routeDefaultsByBeat = {}) {
  return routeUneatenErrors(rows, routeDefaultsByBeat, { prefix: 'film', fields: ['kind', 'composition', 'device'] });
}

// (pure, tested) too many cleans in a row, or almost-all-clean with missing why — does NOT force LED (HOUSE: 该上屏才上屏)
export function filmCleanNotes(rows, { streakMax = CLEAN_STREAK_MAX, cleanShare = CLEAN_SHARE_NEED_WHY } = {}) {
  const e = [], n = rows?.length || 0; if (!n) return e;
  let run = 0, start = 0;
  for (let i = 0; i < n; i++) {
    if ((rows[i].screen || 'clean') === 'clean') {
      if (!run) start = i;
      run++;
      if (run === streakMax) e.push(`film: ${rows[start].beat}–${rows[i].beat}: ${streakMax} beats in a row on clean (review whether information and rhythm evolve; keep clean when appropriate, never add a screen just to break the run)`);
    } else run = 0;
  }
  const cleanN = rows.filter((r) => (r.screen || 'clean') === 'clean').length;
  if (n >= 6 && cleanN / n >= cleanShare) {
    const noWhy = rows.filter((r) => String(r.why || '').trim().length < 10);
    if (noWhy.length) e.push(`film: ${Math.round((cleanN / n) * 100)} % of beats on clean with ${noWhy.length} beat(s) missing why (${noWhy.map((r) => r.beat).join(', ')}): almost-all-clean needs a reason per beat`);
  }
  return e;
}
// Compatibility entry point: retain the old missing-reason contract only.
// Ordinary per-beat reasons are independently checked by designWhyErrors.
export function filmCleanGateErrors(rows, options = {}) {
  return filmCleanNotes(rows, options).filter((note) => note.includes('missing why'));
}
// (pure, tested) note only: a world/scale jump that stays clean→clean — greybox must cover with a non-cut seam; do not demand a screen here
export function filmWorldJumpNotes(rows) {
  const out = [], order = ['world', 'region', 'place', 'object', 'detail'];
  for (let i = 0; i < (rows?.length || 0) - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const ia = order.indexOf(a.scale), ib = order.indexOf(b.scale);
    if (ia < 0 || ib < 0 || Math.abs(ia - ib) < 2) continue;
    if ((a.screen || 'clean') !== 'clean' || (b.screen || 'clean') !== 'clean') continue;
    out.push(`film: ${a.beat}→${b.beat} jumps scale ${a.scale}→${b.scale} while both stay clean: keep clean if the beat shows a real thing or a line of type; in greybox cover the jump with whip/glitch/flash/match/push (not a bare cut)`);
  }
  return out;
}
// (pure, tested) medium=evidence is a hard promise of a materials/bindings.json shot for that beat (prefix key ok)
export function evidenceBindingErrors(answer, bindings) {
  const shots = bindings?.shots;
  const keys = shots && typeof shots === 'object' && !Array.isArray(shots) ? Object.keys(shots)
    : Array.isArray(shots) ? shots.map((s) => s.beat || s.shotId || s).filter(Boolean) : [];
  const bound = new Set(keys.map((k) => String(k).split('~')[0]));
  const e = [];
  for (const r of answer?.beats || []) {
    if (r.medium !== 'evidence') continue;
    if (!bound.has(r.beat)) e.push(`film.${r.beat}: evidence with no materials binding (materials/bindings.json shots key for this beat): bind a real page/photo first, or pick another medium`);
  }
  return e;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const FILM_STEP = 'filmdesign', FILM_TASTE_STEP = 'film-taste';
export const ACTS = ['open', 'build', 'press', 'peak', 'turn', 'release', 'close'];
export const SCALES = ['world', 'region', 'place', 'object', 'detail'];
export const VALUES = ['dark', 'mid', 'light'];
export const MEDIA = ['diagram', 'footage', 'type', 'evidence'];
// the floors, at the least varied of the references (filmarc.py, measured 2026-10-27)
export const FILM_ARC = { flatMax: 0.5, changesMin: 6, rangeMin: 0.15 };
export const FILM_TASTE = { pass: 3, mean: 3.5, reviewers: 2 };

// (pure) the designed arc against the beats
export function filmDesignErrors(answer, beats, lib = null, media = null, devices = null, { narration = null, table = null, houseStyle = null, requireHouseStyle = false, derivedHouseStyle = false, requireMotionDesign = false } = {}) {
  const e = [], rows = beats.map((b) => (answer?.beats || []).find((r) => r.beat === b));
  const motionDesign = requireMotionDesign || answer?.motionRules != null;
  if (motionDesign) for (const k of ["timing", "continuity"]) {
    if (typeof answer?.motionRules?.[k] !== "string" || answer.motionRules[k].trim().length < 5) e.push(`film.motionRules.${k}: declare a shared semantic motion rule; not an effect quota`);
  }
  if (String(answer?.arc || '').trim().length < 20) e.push('arc: say the film\'s rise and fall in a few lines (where it opens, where it presses, its peak, how it releases)');
  rows.forEach((r, i) => {
    const b = beats[i], tag = `film.${b}`;
    if (!r) { e.push(`${tag}: no row for this beat`); return; }
    e.push(...directorIntentErrors(r, { requireMotionDesign: motionDesign }));
    if (r.directorIntent?.route === 'custom' && r.device && devices) {
      const selected = (devices.devices || []).find((d) => d.id === r.device);
      if (!selected || selected.kit?.status !== 'ready') e.push(`${tag}.device: custom route requires a ready device (${r.device})`);
    }
    if (!ACTS.includes(r.act)) e.push(`${tag}.act: one of ${ACTS.join(', ')}`);
    if (!SCALES.includes(r.scale)) e.push(`${tag}.scale: one of ${SCALES.join(', ')}`);
    if (!VALUES.includes(r.value)) e.push(`${tag}.value: one of ${VALUES.join(', ')}`);
    if (!MEDIA.includes(r.medium)) e.push(`${tag}.medium: one of ${MEDIA.join(', ')}`);
    if (![0, 1, 2, 3].includes(r.red)) e.push(`${tag}.red: 0 (none) to 3 (the film's strongest)`);
    if (r.hero && String(r.heroHow || '').trim().length < 5) e.push(`${tag}.heroHow: say how this hero moment is made (big type over footage, a light ground, the whole globe …)`);
  });
  if (rows.some((r) => !r)) return e;
  // the film's palettes (palettes.mjs: the user 2026-10-28, 可以各种配色 但要和谐)
  if (lib) e.push(...filmPaletteErrors(rows, lib));
  if (media) e.push(...filmScreenErrors(rows, media));
  if (lib || media) {
    e.push(...designWhyErrors(rows));
    // shortlist + clean gates only when catalogs are in play (new/design path); legacy calls without lib/media stay intact
    // byBeat hard gate: same beatForShortlist as task (design act/medium/scale/value + narration text; never palette/why)
    const shortlists = designShortlistsFrom({
      palettes: lib, media, devices, table,
      beats: rows.map((r) => {
        const s = beatForShortlist({ beat: r.beat }, r, { narration });
        if (s && r.palette) s.palette = r.palette; // spine carry only — scoring still ignores palette
        return s;
      }),
    });
    e.push(...filmShortlistErrors(rows, shortlists));
    // director-routes: when auto-pick resolved a kind, answer must eat kind/composition/device
    const routeDefaults = pickDirectorDefaultsByBeat(rows.map((r) => {
      const s = beatForShortlist({ beat: r.beat }, r, { narration });
      return s || { beat: r.beat };
    }), { table, devices });
    e.push(...filmRouteUneatenErrors(rows, routeDefaults));
    // Clean-run detection is delivered via filmDesignNotes, never an effect quota.
  }
  // P1 F1/F2/F3 — houseStyle + screen/media + screen-device hard gates
  {
    const hsDoc = houseStyle || null;
    const filmHs = answer?.houseStyle || answer?.house || null;
    const presetIds = new Set((hsDoc?.presets || []).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean));
    if (hsDoc || requireHouseStyle) {
      if (!filmHs && !derivedHouseStyle) e.push('film: houseStyle: filmdesign must set houseStyle id or use this film’s derived house style');
      else if (filmHs && presetIds.size && !presetIds.has(filmHs)) e.push(`film: houseStyle: "${filmHs}" not in house-style.json presets (${[...presetIds].join(', ')})`);
      for (const r of rows) {
        if (!r?.palette) e.push(`film.${r.beat}.palette: filmdesign must set palette id (P1 F1)`);
      }
    }
    e.push(...houseStylePickErrors(rows, hsDoc));
    if (media) e.push(...mediaCatalogErrors(rows.map((r) => ({ beat: r.beat, medium: r.screen || null })), media));
    e.push(...screenFilmedDeviceErrors(rows));
    e.push(...mediaKindDeviceErrors(rows));
  }
  return e;
}

// Narrative heuristics are review prompts, not quotas. No reason/waiver can suppress
// a finding or weaken the separate facts, readability, catalog and execution gates.
export function filmDesignNotes(answer, beats, lib = null, media = null) {
  const rows = beats.map((b) => (answer?.beats || []).find((r) => r.beat === b)).filter(Boolean);
  if (!rows.length) return [];
  beats = rows.map((r) => r.beat);
  const e = [...filmPaletteNotes(rows, lib), ...filmScreenNotes(rows, media), ...filmCleanNotes(rows), ...filmWorldJumpNotes(rows)];
  const n = rows.length, heroes = rows.map((r, i) => (r.hero ? i : -1)).filter((i) => i >= 0), want = [Math.min(4, Math.max(2, Math.ceil(n / 4))), 6];
  if (heroes.length < want[0] || heroes.length > want[1]) e.push(`film: ${heroes.length} hero moments (${want[0]} to ${want[1]} for ${n} beats: the open, the turn, the peak, the close)`);
  if (!heroes.includes(0) && !heroes.includes(1)) e.push('film: the film opens on a hero moment (its first or second beat)');
  if (!heroes.includes(n - 1) && !heroes.includes(n - 2)) e.push('film: the film closes on a hero moment (its last or second-last beat)');
  if (n >= 6 && !heroes.some((i) => i >= n / 3 && i < (2 * n) / 3)) e.push('film: no hero moment in its middle third (where it presses or turns)');
  for (let i = 1; i < heroes.length; i++) if (heroes[i] === heroes[i - 1] + 1) e.push(`film: hero moments side by side at ${beats[heroes[i - 1]]} and ${beats[heroes[i]]} (a hero needs quieter beats around it)`);
  // no long run of one look: the same scale, medium and value more than three beats running
  let run = 1; for (let i = 1; i < n; i++) { const a = rows[i - 1], b = rows[i]; run = a.scale === b.scale && a.medium === b.medium && a.value === b.value ? run + 1 : 1; if (run === 4) e.push(`film: ${beats[i - 3]}–${beats[i]} are four beats of one look (${b.scale}, ${b.medium}, ${b.value}): change the scale, the medium or the light`); }
  const share = (k, v) => rows.filter((r) => r[k] === v).length / n;
  if (share('medium', 'diagram') > 0.7) e.push(`film: ${Math.round(share('medium', 'diagram') * 100)} % of its beats are diagrams (70 % at most: footage, big type, evidence between them)`);
  if (new Set(rows.map((r) => r.medium)).size < 2) e.push('film: one medium the whole film');
  if (new Set(rows.map((r) => r.value)).size < 2) e.push('film: one value the whole film (dark, mid, light: let the light move with the story)');
  if (new Set(rows.map((r) => r.scale)).size < 3) e.push('film: fewer than three scales (the world, a place, a thing, a detail: the camera should travel)');
  const peaks = rows.map((r, i) => (r.act === 'peak' ? i : -1)).filter((i) => i >= 0);
  if (!peaks.length) e.push('film: no peak');
  else { const top = Math.max(...rows.map((r) => r.red)); if (!peaks.some((i) => rows[i].red === top)) e.push('film: the red is strongest away from the peak (it climbs to the peak)'); }
  if (rows.filter((r) => r.red === 3).length > 2) e.push('film: the red at its strongest on more than two beats (it is the peak\'s)');
  // the peak's look is its own: no other beat on its ground (a light data card before a light peak made the peak read as
  // a second card: the whole-film review of Suez, 2026-10-27)
  for (const i of peaks) { const p = rows[i], twin = rows.filter((r, j) => j !== i && r.value === p.value && p.value !== 'dark'); if (twin.length) e.push(`film: the peak ${beats[i]} shares its ${p.value} ground with ${twin.map((r) => r.beat).join(', ')} (the peak's look is its own: keep the others off it)`); }
  return e.map((note) => `review only (not a quota): ${note}`);
}

// (pure) a chapter's keyframes against the film's design: each beat's lightness in the band its value names (ground.py
// mean; the Suez white model's beats designed mid came out dark, and the film measured flat)
export const VALUE_BANDS = { dark: [0, 0.22], mid: [0.2, 0.5], light: [0.48, 1] };
export function filmFollowErrors(rows, film, beats) {
  if (!film?.length || !rows?.length) return [];
  return beats.map((b, i) => { const r = film.find((x) => x.beat === b), k = rows[i]; if (!r || k?.mean == null) return null; const [lo, hi] = VALUE_BANDS[r.value];
    // (the factor to set it right in one go: the band's middle over what it reads, in linear light — export function exposure3(t))
    const mid = (lo + hi) / 2, f = Math.pow(Math.max(0.02, mid) / Math.max(0.02, k.mean), 2.2);
    return k.mean < lo || k.mean > hi ? `${b}: the film's design has it ${r.value} (lightness ${lo}–${hi}); its keyframe reads ${k.mean.toFixed(2)}: ${k.mean < lo ? 'lift its ground or its light' : 'press it down'} — a 3D scene: exposure3 ×${f.toFixed(2)} for its seconds; a flat frame: its ground, its overlay or its picture's tone (filmdesign)` : null; }).filter(Boolean);
}
// (pure, tested) each beat's ground renders the colour the script gave it: a ground the script made near-neutral is
// not tinted on screen (Suez: #121111 asked, (34, 29, 30) rendered — a texture written in linear values rounded its few
// levels and tipped the hue; the reviewers read it brown two rounds before anyone measured it). rows: ground.py (rim)
export function groundTintErrors(rows, script, beats) {
  const { toOklch } = DB, out = [];
  beats.forEach((b, i) => { const c = script.find((x) => x.beat === b), r = rows[i]; if (!c) return;
    if (r?.rimStatus === 'unknown' || r?.rimEstimate?.status === 'unknown') {
      out.push(`${b}: its ground source detection is unknown${r.rimEstimate?.reason ? `: ${r.rimEstimate.reason}` : ''} (filmdesign)`);
      return;
    }
    if (!r?.rim) return;
    const want = toOklch(c.ground), got = toOklch(r.rim);
    if (want.C < 0.01 && got.C > Math.max(0.008, want.C + 0.006) && got.L < 0.6) out.push(`${b}: its ground renders ${r.rim} (chroma ${got.C.toFixed(3)}, hue ${Math.round(got.h)}°) where the colour script asked a neutral ${c.ground}: a texture or a light tints it (filmdesign)`);
  });
  return out;
}
// ---- the film's colour script (the user 2026-10-27: 和谐配色什么的也要想好): one accent for the whole film, each beat's
// ground and ink drawn from it by the act it plays — the warm-neutral dark of the accent's own hue for the telling,
// pressed darker and turned to the cool complement where it presses, a split-cool step at the turn, the peak on the
// film's one warm paper, the mid a lifted neutral. Every ground of low chroma in the accent's hue or its complement
// (harmony), ink 7:1 on it, the accent 2.2:1 (designbrain harmonyErrors)
const SCRIPT = {   // [L, C, hue offset from the accent] by value, then by act
  // (the darks near neutral — C 0.012 toward the red read as brown, turned down twice; the paper warm, not pink: stills review)
  // (and C 0.005 in the accent's hue still read warm brown on the halftone: both reviewers of Suez's stills round 7, the
  // user's 不要脏棕色 — the darks of the accent's side are neutral now, C 0.002; the turn and the press keep their cool step)
  dark: { open: [0.19, 0.002, 0], build: [0.2, 0.002, 0], press: [0.16, 0.012, 180], peak: [0.17, 0.002, 0], turn: [0.19, 0.012, 160], release: [0.21, 0.002, 20], close: [0.18, 0.002, 0] },
  mid: { any: [0.34, 0.003, 0] },   // (0.42 left the ink 6.3:1 and the red 1.9:1 on it)
  light: { any: [0.9, 0.01, 30] },
};
export function colourScript(design, accent, lib = null) {
  const { toOklch, fromOklch } = DB, a = toOklch(accent);
  return (design?.beats || []).map((r) => { if (lib && r.palette) { const c = beatColour(r, lib); if (c) return c; }   // a beat's palette, when the design names one (palettes.json)
    const t = SCRIPT[r.value] || SCRIPT.dark, [L, C, dh] = t[r.act] || t.any || SCRIPT.dark.build, ground = fromOklch({ L, C, h: (a.h + dh + 360) % 360 });
    const ink = L > 0.6 ? fromOklch({ L: 0.2, C: 0.01, h: a.h }) : fromOklch({ L: 0.93, C: 0.006, h: a.h });
    return { beat: r.beat, ground, ink, accent, temper: dh === 0 ? 'warm-neutral' : dh >= 150 ? 'cool' : 'warm' }; });
}
// (pure) the script in harmony: every ground's hue on the accent's or its complement's side, low chroma, ink and accent legible
export function colourScriptErrors(script) {
  const { toOklch, harmonyErrors } = DB, out = [];
  for (const c of script) {
    if (c.palette) continue;   // (a palette keeps its own harmony: palettes.mjs paletteErrors)
    out.push(...harmonyErrors({ id: c.beat, ground: c.ground, ink: c.ink, accent: c.accent, tone: 'dark' }));
    const g = toOklch(c.ground), h = toOklch(c.accent).h, d = Math.abs((((g.h - h) % 360) + 540) % 360 - 180);   // 180 - |hue difference|: 180 the same hue, 0 the complement
    if (g.C > 0.008 && d < 145 && d > 40) out.push(`${c.beat}: its ground's hue stands ${Math.round(180 - d)}° from the accent's (its own side or the complement's only)`);
  }
  return out;
}
// (pure) the film as measured against the floors
export function filmArcErrors(m, F = FILM_ARC, lib = null) {
  if (!m || m.error || !m.seconds) return [];
  const out = [...(lib && m.colour ? filmColourErrors(m.colour, lib) : [])];
  if (m.flat > F.flatMax) out.push(`film: ${Math.round(m.flat * 100)} % of it in stretches of 20 s or more that keep one look (the longest ${m.longest} s from ${m.longestAt} s; ${F.flatMax * 100} % at most)`);
  if (m.changes < F.changesMin) out.push(`film: ${m.changes} new looks a minute (${F.changesMin} or more: the references 8.8 to 39)`);
  if (m.range < F.rangeMin) out.push(`film: its lightness spreads ${m.range} (${F.rangeMin} or more: the light does not move with the story)`);
  return out;
}

import { taskMaterialInventory } from './material-inventory.mjs';
// the real materials in hand, by beat (materials/bindings.json): the design is made with them, not before them
// each with its quality for the frame (matquality.py, kept in materials/quality.json by the file's hash): its size, the
// border it carries, how surely it shows its subject and where (the crop the frame should take)
export function materialsInHand(cfg, id, { measure = true, subjects = {} } = {}) {   // subjects: { beat: the English phrase the frame must show (filmdesign subject) }
  const root = projectPaths(cfg, id).root, b = readJson(path.join(root, 'materials', 'bindings.json'), {})?.shots || {}, out = {}, items = [];
  const qf = path.join(root, 'materials', 'quality.json'), q = readJson(qf, {});
  // the subject in English for the image model (it does not read Chinese: 长赐号 scored a ship 0.02, the need's own English search 0.87)
  const needs = readJson(path.join(root, 'materials', 'needs.json'), {})?.needs || [], english = (beat) => needs.find((n) => n.shotId === beat && n.archive?.keywords?.length)?.archive.keywords[0] || null;
  for (const [k, v] of Object.entries(b)) { const beat = k.split('~')[0]; if (!v?.file || !fs.existsSync(v.file) || !/\.(jpe?g|png|webp)$/i.test(v.file)) continue;
    const need = (() => { try { return JSON.parse(v.needPrint); } catch { return []; } })(), phrase = subjects[beat] || `a photo of ${english(beat) || String(need[3] || '').replace(/[^\x20-\x7e]/g, '').trim() || 'the subject'}`, key = `${path.basename(v.file)}:${fs.statSync(v.file).size}:${phrase}`;
    if (!q[key] && measure && !items.some((x) => x.id === key)) items.push({ id: key, file: v.file, subject: phrase });
    (out[beat] ||= []).push({ key: k, kind: v.kind, what: need[2] || null, file: v.file, q: key }); }
  if (items.length) { const tmp = path.join(root, 'materials', '.quality-in.json'), res = path.join(root, 'materials', '.quality-out.json'); fs.writeFileSync(tmp, JSON.stringify(items));
    const r = spawnSync('python3', [path.join(HERE, 'matquality.py'), tmp, res], { encoding: 'utf8' }); if (!r.status) { Object.assign(q, readJson(res, {})); fs.writeFileSync(qf, JSON.stringify(q, null, 1) + '\n'); } }
  for (const ms of Object.values(out)) for (const m of ms) m.quality = q[m.q] || null;
  return out;
}
// (pure) usable for a full frame: big enough (whole, or its subject's crop) and its subject sure (0.5)
export const fillsFrame = (m) => !!m?.quality && (m.quality.subject ?? 0) >= 0.5 && (m.quality.full || m.quality.boxFull);
// (pure) footage and evidence only where a real material is in hand; a beat that has one and draws a diagram is told
export function materialErrors(answer, inHand) {
  const out = [];
  for (const r of answer?.beats || []) { const m = inHand[r.beat] || [];
    if ((r.medium === 'footage' || r.medium === 'evidence') && !r.subject) out.push(`film.${r.beat}: ${r.medium}: say what the frame must show recognisably (subject, an English phrase: the material is measured and cropped by it)`);
    if ((r.medium === 'footage' || r.medium === 'evidence') && !m.length) out.push(`film.${r.beat}: ${r.medium} with no real material in hand for it (materials/bindings.json): find it first, or another medium`);
    // footage fills the frame: a picture too small for it, or one whose subject does not read, holds the beat back (an
    // evidence card shows its page at half the frame, so its size is not held to a full frame)
    else if (r.medium === 'footage' && m.some((x) => x.quality) && !m.some(fillsFrame)) { const x = m.find((y) => y.quality)?.quality; out.push(`film.${r.beat}: footage, but the material in hand does not fill a frame (${x.w}×${x.h}${(x.subject ?? 1) < 0.5 ? `, its subject reads ${x.subject}${x.instead ? ` — it looks like ${x.instead}` : ''}` : ''}): find a bigger or clearer one, or set it as a card`); } }
  return out;
}
// Scoped to explicit current photo needs on new designs. This detects contradiction or
// unreadable bytes; it does not establish provenance, rights, or visual suitability.
export function currentPhotoEvidenceErrors(answer, needs, bindings) {
  const out = [], all = Array.isArray(needs) ? needs : [];
  for (const row of answer?.beats || []) {
    if (row.medium !== 'evidence') continue;
    const requested = all.filter(n => n?.shotId === row.beat && n.form === 'photo');
    if (!requested.length) continue; // legacy unspecified and other media retain their existing behavior
    const usable = requested.some(n => {
      const key = needKey(n), b = bindings?.shots?.[key];
      return all.filter(other => other?.shotId && needKey(other) === key).length === 1 &&
        b?.needPrint === needPrint(n) && bindingMatchesForm(n, b);
    });
    if (!usable) out.push(`film.${row.beat}: evidence material is unknown or contradicts the current photo need (binding, scene or image bytes); find a current usable material`);
  }
  return out;
}
// Read-only progress, never an assertion of quality or hash verification.
function materialProgress(cfg, id) {
  const dir = path.join(projectPaths(cfg, id).root, 'materials');
  const read = (name) => {
    let fd;
    try {
      if (!fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink()) return null;
      const file = path.join(dir, name), st = fs.lstatSync(file);
      if (!st.isFile() || st.isSymbolicLink() || st.size > 4 * 1024 * 1024) return null;
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || opened.size > 4 * 1024 * 1024 || opened.dev !== st.dev || opened.ino !== st.ino) return null;
      const buf = Buffer.alloc(opened.size); let n = 0;
      while (n < buf.length) { const got = fs.readSync(fd, buf, n, buf.length - n, n); if (!got) break; n += got; }
      return JSON.parse(buf.subarray(0, n).toString('utf8'));
    } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
  };
  const ns = read('needs.json'), cs = read('candidates.json'), bs = read('bindings.json'), ps = read('proposed-batch.json');
  if (!Array.isArray(ns?.needs)) return null;
  const out = {}, counts = new Map();
  for (const n of ns.needs) if (n?.shotId) counts.set(needKey(n), (counts.get(needKey(n)) || 0) + 1);
  for (const n of ns.needs) {
    if (!n?.shotId) continue;
    const key = needKey(n), c = cs?.shots?.[key], b = bs?.shots?.[key];
    const current = c?.need && needPrint(c.need) === needPrint(n);
    let status = 'unknown';
    if (counts.get(key) === 1 && bs?.shots && typeof bs.shots === 'object') {
      // Bindings and receipts are untrusted paths and local receipts are not authentication.
      // Do not read either path or claim a binding until a safe provenance verifier exists.
      if (b) status = 'unknown';
      else if (c && current && Array.isArray(c.candidates) && c.candidates.length) status = 'candidates';
      else if (c && current && c.searchedAt && Array.isArray(c.candidates) && !c.candidates.length && !c.reuse && Array.isArray(c.errors) && !c.errors.length) status = 'no-results';
      else if (!c && cs?.shots && typeof cs.shots === 'object' && bs?.shots && typeof bs.shots === 'object') status = 'unsearched';
    }
    // Only known, fixed rejection messages cross the task boundary: arbitrary text can contain secrets.
    const reason = (ps?.weakPicks || []).find((p) => p.shotId === key)?.why;
    const allowed = ['no subject match', 'looked at by eye: none of the candidates shows what is asked', 'every candidate chosen by eye was tried and failed', "the title names none of the need's people or places", 'the picture does not match what the shot must show'];
    const sources = status === 'candidates' ? [...new Set(c.candidates.map((x) => x?.source).filter((x) => ['web', 'youtube', 'archive', 'news-photo', 'library', 'commons'].includes(x)))] : [];
    const kind = status === 'bound' && ['image', 'video'].includes(b.kind) ? b.kind : null;
    (out[n.shotId] ||= []).push({ key, status, ...(status === 'candidates' ? { candidateCount: c.candidates.length, sources } : {}), ...(kind ? { kind } : {}), ...(current && allowed.includes(reason) ? { rejectedReason: reason } : {}) });
  }
  return out;
}
export function filmDesignTask(cfg, id, beats, { measured = null, design = null, requireMotionDesign = true } = {}) {
  const inventory = taskMaterialInventory(cfg, id);
  beats = applyEventScope(taskScopedDesign(cfg, id, { beats }).beats, design?.beats || []);
  const table = loadDirectorRoutes(cfg);
  const devicesLib = loadDevices(cfg);
  const byDesign = Object.fromEntries((design?.beats || []).map((r) => [r.beat, r]));
  const shaped = (beats || []).map((b) => beatForShortlist(b, byDesign[b.beat ?? b.id] || null)).filter(Boolean);
  const routeDefaults = pickDirectorDefaultsByBeat(shaped.length ? shaped : (beats || []), { table, devices: devicesLib });
  // Storyboard is prior context, not a filmdesign decision. Use it only to find
  // analogous mechanisms; never pin its suggestions as the final route.
  const storyboard = readJson(path.join(projectPaths(cfg, id).root, 'storyboard.json'), {});
  const queries = shaped.map(b => {
    const selected = byDesign[b.beat]?.directorIntent?.route;
    const resolved = Boolean(selected) || b.act === 'open';
    const kind = resolved ? routeDefaults[b.beat]?.kind : null;
    const shot = (storyboard.shots || []).find(s => s.beat === b.beat);
    const context = shot ? { intent:shot.intent ?? null, treatment:shot.treatment ?? null, evidence:shot.evidence ?? null, noEvidence:shot.noEvidence ?? null, why:shot.why || '', figure:shot.diagram?.figure || '', reads:(shot.reads || []).map(r => r.what), declined:(shot.declined || []).map(d => d.device), act:shot.act || null } : null;
    const semantic = [b.text, context?.why, context?.figure, ...(context?.reads || [])].filter(Boolean).join('\n');
    const devices = [];
    // Use the retrieval's existing clause-local polarity. Symmetry/side-by-side
    // says nothing about axes: only an affirmative two-axis relation qualifies.
    const positive = re => positiveReferenceCue(semantic, re, /不是|不要|无需|無需|不需要|不应|不應|不使用|禁止|不得|避免|\b(?:no|not|without)\b/i);
    const declared = new Set(shot?.devices || []);
    if (shot && positive(/两轴|兩軸|双轴|雙軸|四象限|two[- ]ax[ei]s|quadrant/i)) devices.push('quadrant-compare');
    if (shot && positive(/换成|替换成|更换为|换种|替代为/)) devices.push('label-swap');
    if (shot && !devices.includes('quadrant-compare') && !devices.includes('label-swap') && (positive(/地图|地圖/) || (!/地图|地圖/.test(semantic) && (declared.has('map-pin-count') || shot.diagram?.form === 'map')))) devices.push('map-pin-count');
    // The existing routing-table intent denotes a real article/page, unlike
    // generic evidence asset lists (also present on concept/atmosphere shots).
    // This kind is retrieval context only; it never enters routeDefaults.
    const evidenceCue = /证据|證據|报道|報道|(?<![a-z0-9_])(?:evidence|report(?:s|ed)?)(?![a-z0-9_])/i;
    const evidenceDeclined = context?.declined.some(d => ['evidence', 'evidence-article'].includes(d));
    // Same evidence polarity as chapterGuidance, plus the task's existing
    // imperative-denial guard; no new positive keywords or prose injection.
    const positiveEvidence = positiveReferenceCue(semantic, evidenceCue, /不是|不要|无需|無需|不需要|不应|不應|不使用|禁止|不得|避免|\b(?:no|not|without)\b|(?:没有|沒有|缺乏|无|無)(?:任何|可靠的?)?(?:证据|證據|报道|報道)|(?:证据|證據)(?:不足|缺乏)|\black(?:s|ing)?(?: of)?\s+(?:any\s+|reliable\s+)*(?:evidence|reports?)\b|\bevidence(?:\s*-\s*free|\s+(?:is\s+)?(?:insufficient|lacking|absent))\b/i);
    const evidenceDenied = context?.intent === 'evidence-article' && (evidenceDeclined || Boolean(context?.noEvidence?.trim()) || (evidenceCue.test(semantic) && !positiveEvidence));
    const priorKind = context?.intent === 'evidence-article' && !evidenceDenied ? 'evidence' : null;
    return { beat:b.beat, text:b.text, context, devices:resolved ? [] : devices.filter(d => !context?.declined.includes(d)), ...(resolved ? {kind, routeResolved:true} : priorKind ? {kind:priorKind} : evidenceDenied ? {kind:null, routeResolved:true} : {}) };
  });
  const library = cfg.referenceLibrary || (cfg.referenceLibraryBuilder || chapterTechniques)(cfg);
  const guidance = chapterGuidance(cfg, id, queries, { library, k: Number.MAX_SAFE_INTEGER });
  const rows = new Map(guidance.beats.map(row => [row.beat, row]));
  const recovered = guidance.recovered && {...guidance.recovered, beats:guidance.recovered.beats.map(row => ({...row, references:row.references.filter(r => r.project !== id)}))};
  // L112 predates HOUSE's explicit no-screen-quota decision. Do not deliver its
  // contradictory quota to a director; keep the rest of the shared lesson library intact.
  const currentLessons = xs => (xs || []).filter(x => !/^L(?:112-screen-medium|100-profile-gawx):/.test(x));
  const referenceGuidance = { ...guidance, lessons: currentLessons(guidance.lessons), recovered, sourceRoot: path.resolve(cfg.sourceRoot || cfg.repoRoot || process.cwd()),
    note: 'Candidates for research, not selected devices or current approval. Missing or unmatched references are unknown; delivery is not evidence of viewing.',
    beats: queries.map(q => { const row = rows.get(q.beat) || {beat:q.beat, nearest:[], lessons:[]};
      const nearest = row.nearest.filter(r => r.frame && r.source).slice(0,3).map(r => ({...r, frameStatus:'available', sourceStatus:'available', acceptance:{...r.acceptance,currentApproval:false},
        usage: [r.usage,
          r.devices?.includes('label-swap') ? '仅借标签区域换词；不证明农业主体或田地原位替换。' : '',
          r.devices?.includes('map-pin-count') ? '仅借地理标注；参考中的连线不能当作本片传播路线，也不证明并排主体的共同脆弱。' : '',
        ].filter(Boolean).join(' ') }));
      return {...row, context:q.context, lessons: currentLessons(row.lessons), nearest, status:nearest.length ? 'candidates' : 'unknown'}; }) };
  const variantMatrix = loadVariantMatrix(cfg);
  const solvedVariants = variantMatrix ? solveFilmVariants(shaped.length ? shaped : (beats || []), variantMatrix) : [];
  const variantPlan = variantMatrix ? {
    contract: variantMatrix.contract,
    diversity: variantDiversityReport(solvedVariants, variantMatrix),
    byBeat: Object.fromEntries(solvedVariants.map((r) => [r.beat, r])),
  } : null;
  return {
    rules: 'work/recipe-board-v1/prompts/filmdesign.md', schema: 'work/recipe-board-v1/routing/filmdesign.schema.json',
    input: { referenceGuidance, variantPlan, variantMatrix: 'work/recipe-board-v1/routing/variant-matrix.json', requireMotionDesign, materialProgress: materialProgress(cfg, id), motionDesign: "directorIntent.start/change/end/handoff + film motionRules.timing/continuity; meaning first, cut/hold allowed, no mandatory axis or morph", materials: inventory.materials, materialDiagnostics: inventory.diagnostics, materialInventoryTruncated: inventory.truncated, materialQualityStatus: inventory.qualityStatus, materialInventoryStatus: inventory.status, materialProgressNote: "Inventory PNG chunk structure and dimensions are checked, not CRC or decoded; materialInventoryTruncated indicates the 1000-binding limit; images over 16 MiB are excluded; legacy quality is unknown, not verified. Inventory is a non-authoritative hint: unknown or empty is not evidence of no assets; presence does not verify provenance, quality, rights or review. Existing task/review identity does not track progress.", visualDirection: 'work/recipe-board-v1/SEMANTIC-VISUAL-DIRECTION.md', palettes: 'work/recipe-board-v1/routing/palettes.json', mediaCatalog: 'work/recipe-board-v1/routing/media.json', devices: 'work/recipe-board-v1/routing/devices.json', directorRoutes: 'work/recipe-board-v1/routing/director-routes.json', shortlists: designShortlists(cfg, beats, { design }), routeDefaults, beats, seconds: beats.reduce((a, b) => Math.max(a, (b.at || 0) + (b.dur || 0)), 0), acts: ACTS, scales: SCALES, values: VALUES, media: MEDIA, floors: FILM_ARC, measured, style: 'work/recipe-board-v1/HOUSE.md' },
  };
}

export async function stepFilmDesign(cfg, id, beats, { log = console.log } = {}) {
  const { writeTask, readAnswer, writeAnswer, writeCheck, taskPaths } = await import('./agenttask.mjs');
  const measured = readJson(path.join(projectPaths(cfg, id).out, 'film', 'arc.json'));
  // read answer first so task shortlists merge design act/medium (same beatForShortlist as check); first pass stays plan-only
  let answer = readAnswer(cfg, id, FILM_STEP);
  const priorTask = readJson(taskPaths(cfg, id, FILM_STEP).task);
  const requireMotionDesign = priorTask ? priorTask.input?.requireMotionDesign === true : !answer;
  writeTask(cfg, id, FILM_STEP, filmDesignTask(cfg, id, beats, { measured, design: answer, requireMotionDesign }));
  if (!answer) return { state: 'waiting' };
  answer = taskScopedDesign(cfg, id, answer);
  const devicesLib = loadDevices(cfg);
  const narration = Object.fromEntries((beats || []).map((b) => [b.beat, b.text || '']));
  const table = loadDirectorRoutes(cfg);
  // force-write route defaults into answer shape (kind/composition/device) when missing — director is expected to keep them
  {
    const byDesign = Object.fromEntries((answer.beats || []).map((r) => [r.beat, r]));
    const shaped = (beats || []).map((b) => beatForShortlist(b, byDesign[b.beat] || null)).filter(Boolean);
    const routeDefaults = pickDirectorDefaultsByBeat(shaped.length ? shaped : (beats || []), { table, devices: devicesLib });
    const pinned = pinRouteDefaultsIntoAnswer(answer, routeDefaults);
    if (JSON.stringify(pinned) !== JSON.stringify(answer)) {
      writeAnswer(cfg, id, FILM_STEP, pinned);
      answer = pinned;
      writeTask(cfg, id, FILM_STEP, filmDesignTask(cfg, id, beats, { measured, design: answer, requireMotionDesign }));
    }
  }
  const tp = taskPaths(cfg, id, FILM_STEP), h = sha(fs.readFileSync(tp.answer, 'utf8'));
  const subjects = Object.fromEntries((answer.beats || []).filter((r) => r.subject).map((r) => [r.beat, r.subject]));
  const lib = loadPalettes(cfg), mediaLib = loadMedia(cfg), houseStyleLib = loadHouseStyle(cfg), bindings = readJson(path.join(projectPaths(cfg, id).root, 'materials', 'bindings.json'), {});
  const project = loadProject(cfg, id) || {}, selectedStyle = readStyle(cfg, project.style);
  const derivedHouseStyle = project.style === `film:${id}` && selectedStyle?.derived === true;
  const currentNeeds = readJson(path.join(projectPaths(cfg, id).root, 'materials', 'needs.json'), {})?.needs;
  const errors = [...filmDesignErrors(answer, beats.map((b) => b.beat), lib, mediaLib, devicesLib, { narration, table, houseStyle: houseStyleLib, derivedHouseStyle, requireMotionDesign }), ...mediaKindDeviceErrors(answer.beats || []), ...colourScriptErrors(colourScript(answer, filmAccent(cfg, id), lib)), ...materialErrors(answer, materialsInHand(cfg, id, { subjects })), ...evidenceBindingErrors(answer, bindings), ...(project.gateSet === 'design' ? currentPhotoEvidenceErrors(answer, currentNeeds, bindings) : [])];
  const notes = [...filmDesignNotes(answer, beats.map((b) => b.beat), lib, mediaLib), ...filmColourNotes(measured?.colour, lib)];   // (notes for the director and the film's review, not a quota)
  writeCheck(cfg, id, FILM_STEP, { ok: !errors.length, errors, notes, answerHash: h });
  for (const n of notes) log(`  ${FILM_STEP}: note — ${n}`);
  if (errors.length) log(`  ${FILM_STEP}: rejected (${errors.length}): ${errors.slice(0, 3).join(' | ')}`);
  return errors.length ? { state: 'rejected', errors } : { state: 'accepted', design: answer };
}
// the accepted design, unchanged since its check
export function acceptedFilmDesign(cfg, id) {
  const dir = path.join(projectPaths(cfg, id).root, 'tasks'), a = path.join(dir, `${FILM_STEP}.answer.json`), c = readJson(path.join(dir, `${FILM_STEP}.check.json`));
  if (!c?.ok || !fs.existsSync(a) || c.answerHash !== sha(fs.readFileSync(a, 'utf8'))) return null;
  return taskScopedDesign(cfg, id, readJson(a));
}
// a chapter's rows of the design (what its beats are to the whole film)
// (each row carries its lightness as numbers — valueBand — so a writer sets it before it is measured)
export const filmRows = (design, beats, accent = null, lib = null) => { if (!design) return null; const sc = accent ? Object.fromEntries(colourScript(design, accent, lib).map((c) => [c.beat, c])) : {}; return beats.map((b) => design.beats.find((r) => r.beat === b)).filter(Boolean).map((r) => ({ ...(sc[r.beat] ? { ...r, palette: sc[r.beat] } : r), ...(VALUE_BANDS[r.value] ? { valueBand: VALUE_BANDS[r.value] } : {}) })); };
// the film's accent: the design brain's (design.json), else the house red
export function filmAccent(cfg, id) { return readJson(path.join(projectPaths(cfg, id).root, 'design.json'))?.chapters?.[0]?.palette?.accent || '#c8501e'; }

// ---- after the white model: the film measured, its overview sheet, the whole-film review, the board
export function measureFilm(cfg, id, film) {
  const out = path.join(projectPaths(cfg, id).out, 'film'); fs.mkdirSync(out, { recursive: true });
  const r = spawnSync('python3', [path.join(HERE, 'filmarc.py'), film, '--json'], { encoding: 'utf8' });
  const m = r.status ? { error: (r.stderr || '').slice(-300) } : JSON.parse(r.stdout.trim().split('\n').pop());
  // and its colour across it (style-lab/tools/palette-arc.py: the lead colour, the families taking turns)
  { const c = spawnSync('python3', [path.join(cfg.dataDir, 'style-lab', 'tools', 'palette-arc.py'), film, '2'], { encoding: 'utf8' }); if (!c.status) try { m.colour = JSON.parse(c.stdout.trim().split('\n').pop()); } catch {} }
  m.notes = filmColourNotes(m.colour, loadPalettes(cfg));
  fs.writeFileSync(path.join(out, 'arc.json'), JSON.stringify(m) + '\n');
  return m;
}
// an overview sheet: one frame every `every` seconds, six across
export function overviewSheet(video, file, { every = 3, from = null, to = null, cols = 6 } = {}) {
  const args = ['-loglevel', 'error', '-y']; if (from != null) args.push('-ss', String(from)); args.push('-i', video); if (to != null) args.push('-t', String(to - (from || 0)));
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim()) || 60;
  const n = Math.ceil(((to ?? dur) - (from ?? 0)) / every), rows = Math.ceil(n / cols);
  args.push('-vf', `fps=1/${every},scale=320:-2,tile=${cols}x${rows}`, '-frames:v', '1', file);
  execFileSync('ffmpeg', args); return file;
}
// the references' sheets, made once (style-lab/film-sheets/)
export function referenceSheets(cfg) {
  const dir = path.join(cfg.dataDir, 'style-lab', 'film-sheets'); fs.mkdirSync(dir, { recursive: true });
  const refs = [['paperclip-138', path.join(cfg.dataDir, 'projects', 'paperclip-138', 'reference', 'vol138.mp4'), 0, 300], ['paperclip-047', path.join(cfg.dataDir, 'projects', 'paperclip-047', 'reference', 'vol047.mp4'), 0, 300]];
  const out = [];
  for (const [name, v, a, b] of refs) { const f = path.join(dir, `${name}.jpg`); if (!fs.existsSync(f) && fs.existsSync(v)) try { overviewSheet(v, f, { every: 5, from: a, to: b }); } catch { continue; } if (fs.existsSync(f)) out.push(f); }
  return out;
}
// (pure, tested) a film review answered: both reviewers' answers there with their scores
export const filmReviewed = (answers) => answers.length >= FILM_TASTE.reviewers && answers.every((a) => a?.scores && Object.keys(a.scores).length);
// the film before its beats (the user 2026-10-28: 是不是效率 流程太低效和不规范呢 客观觉得怎么做最好呢): on a six-stage film
// the beats' taste reviews wait until the whole film has been reviewed once on its white model — Suez's film review named
// the evidence too small, the screens too few and the ending weak after seven rounds on its beats' details. Once is
// enough: a later film review is the film's, not a gate on every beat
export function filmFirstDue(cfg, id) {
  const p = readJson(path.join(projectPaths(cfg, id).root, 'project.json')) || {};
  if (p.process !== 'six-stage') return false;
  const dir = path.join(projectPaths(cfg, id).root, 'tasks');
  return !filmReviewed([`${FILM_TASTE_STEP}.answer.json`, `${FILM_TASTE_STEP}.answer-2.json`].map((f) => readJson(path.join(dir, f))));
}
export async function filmTasteGate(cfg, id, film, { log = console.log } = {}) {
  const { writeTask, readTask, taskPaths } = await import('./agenttask.mjs');
  const P = projectPaths(cfg, id), sheet = overviewSheet(film, path.join(P.out, 'film', 'sheet.jpg'), { every: 3 });
  const forFilm = sha(fs.readFileSync(sheet)), tp = taskPaths(cfg, id, FILM_TASTE_STEP), task = readTask(cfg, id, FILM_TASTE_STEP);
  const design = acceptedFilmDesign(cfg, id), measured = readJson(path.join(P.out, 'film', 'arc.json'));
  const notes = [...filmDesignNotes(design, (design?.beats || []).map((r) => r.beat), loadPalettes(cfg), loadMedia(cfg)), ...filmColourNotes(measured?.colour, loadPalettes(cfg))];
  for (const note of notes) log(`  ${FILM_TASTE_STEP}: note — ${note}`);
  const files = [tp.answer, tp.answer.replace(/\.answer\.json$/, '.answer-2.json')];
  const fresh = (f) => fs.existsSync(f) && fs.existsSync(tp.task) && fs.statSync(f).mtimeMs > fs.statSync(tp.task).mtimeMs;
  const reviewTask = { rules: 'work/recipe-board-v1/prompts/film-taste.md', schema: 'work/recipe-board-v1/routing/film-taste.schema.json', forFilm, reviewers: FILM_TASTE.reviewers, answers: ['answer.json', 'answer-2.json'],
    input: { images: '第一张是这部片的整片抽帧（每 3 秒一帧，从左到右、从上到下）；后面是对标片的整片抽帧（每 5 秒一帧）', design: design?.arc || null, notes }, images: [sheet, ...referenceSheets(cfg)] };
  // Bind what the reviewers actually receive, including reference image bytes. Do not
  // hash task writtenAt, image mtimes or measurement bookkeeping: the sheet is rebuilt
  // on every call. Metrics affect identity through the notes delivered to the reviewer.
  const inputHash = sha(JSON.stringify({ ...reviewTask, imageHashes: reviewTask.images.map((f) => sha(fs.readFileSync(f))) }));
  if (task?.forFilm !== forFilm || task?.inputHash !== inputHash) {
    // Legacy reviews had only a sheet identity, so their input cannot be proven current.
    // Re-review once (even previously accepted ones); retain old answers/check as audit
    // artifacts, but remove them from active paths regardless of clock skew/mtime.
    for (const f of [...files, tp.check]) if (fs.existsSync(f)) {
      fs.renameSync(f, `${f}.stale-${sha(JSON.stringify(task ?? null))}-${sha(fs.readFileSync(f))}`);
    }
    writeTask(cfg, id, FILM_TASTE_STEP, { ...reviewTask, inputHash });
    return { pending: FILM_TASTE_STEP };
  }
  if (!files.every(fresh)) return { pending: FILM_TASTE_STEP };
  const merged = mergeFilmTaste(files.map((f) => readJson(f)));
  return { errors: filmTasteErrors(merged), review: merged };
}
// (pure) two reviews read as one: each score the mean of the two
export function mergeFilmTaste(answers) {
  const got = answers.filter((a) => a?.scores); if (!got.length) return null;
  const keys = Object.keys(got[0].scores), scores = Object.fromEntries(keys.map((k) => [k, got.reduce((a, x) => a + (x.scores[k] || 0), 0) / got.length]));
  return { scores, issues: got.flatMap((a) => a.issues || []), overall: got.map((a) => a.overall).filter(Boolean).join(' / ') };
}
export function filmTasteErrors(m, F = FILM_TASTE) {
  if (!m) return ['film-taste: no review'];
  const v = Object.values(m.scores), mean = v.reduce((a, b) => a + b, 0) / v.length, out = [];
  for (const [k, s] of Object.entries(m.scores)) if (s < F.pass) out.push(`film-taste.${k}: ${s}`);
  if (mean < F.mean) out.push(`film-taste: mean ${mean.toFixed(2)} (at least ${F.mean})`);
  return out;
}
// the board: the arc as designed over the film as measured, the hero frames
export function filmBoard(cfg, id, { design, measured, beats, film = null, stills = null, file }) {
  const P = projectPaths(cfg, id), dir = path.join(P.out, 'film');
  // each hero moment's frame, taken from the film itself at that beat (a card's as much as a chapter's)
  const heroes = (design?.beats || []).filter((r) => r.hero).map((r) => { const b = beats.find((x) => x.beat === r.beat), f = path.join(dir, `hero-${r.beat}.jpg`);
    const still = stills?.find((f) => path.basename(f).endsWith(`-${r.beat}.png`));   // (the approved still before the film exists)
    if (still) { try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', still, '-vf', 'scale=960:-2', f]); } catch { /* left without its frame */ } }
    else if (b && film) try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(b.at + b.dur * 0.85), '-i', film, '-frames:v', '1', '-vf', 'scale=960:-2', f]); } catch { /* left without its frame */ }
    return { beat: r.beat, how: r.heroHow, frame: fs.existsSync(f) ? f : null }; });
  const spec = path.join(P.out, 'film', 'board.json'); fs.writeFileSync(spec, JSON.stringify({ design, measured, beats, heroes, script: design ? colourScript(design, filmAccent(cfg, id), loadPalettes(cfg)) : [] }) + '\n');
  const r = spawnSync('python3', [path.join(HERE, 'filmboard.py'), spec, file], { encoding: 'utf8' });
  return r.status ? null : file;
}
