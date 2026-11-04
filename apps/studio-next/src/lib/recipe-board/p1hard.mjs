// P1 hard-input gates 2026-10-29 (a1-motion-4). Measurable fail only — no soft/aesthetic fudge.
import fs from 'node:fs';
import path from 'node:path';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

/** A5: opening may only claim kit.kind==="build" devices (plus chapter paths). */
export const KIT_KINDS = Object.freeze(['build', 'seam', 'type', 'narrative']);

export function deviceKindOf(device, devices = []) {
  if (!device) return null;
  const row = (devices || []).find((d) => d.id === device);
  const k = row?.kit?.kind;
  return KIT_KINDS.includes(k) ? k : null;
}

/**
 * A5 — early-open beat picked a ready non-build device without chapter path → fail.
 * Chapter paths (model / map / orbit) still clear; build-kind devices clear.
 */
export function openingKitKindErrors(rows = [], beats = [], devices = [], {
  hasOpeningBuildDevice = () => false,
} = {}) {
  const e = [];
  const meta = Object.fromEntries((beats || []).map((b) => [b.beat || b.id, b]));
  (rows || []).forEach((r, i) => {
    if (!r) return;
    const m = meta[r.beat] || {};
    const isEarlyOpen = i < 3 || m.act === 'open';
    if (!isEarlyOpen) return;
    if (hasOpeningBuildDevice(r)) return;
    if (!r.device) return;
    const kind = deviceKindOf(r.device, devices);
    if (!kind) return; // unknown / unmigrated — openingMotionErrors still covers structure
    if (kind === 'build') return;
    e.push(`${r.beat}: opening-kit-kind: device "${r.device}" kit.kind=${kind} — 开场只认 kit.kind=build（或章节 mapPlane/subject/orbit）；narrative/type/seam 不得冒充开场建造`);
  });
  return e;
}

/** B3 — greybox/film picked a turnedDown id. */
export function turnedDownPickErrors(rows = [], compositionsDoc = null) {
  const e = [];
  const td = compositionsDoc?.turnedDown || [];
  const byId = new Map(td.filter((t) => t.id).map((t) => [t.id, t]));
  if (!byId.size) return e;
  for (const r of rows || []) {
    const pick = r.composition || r.lookId || r.turnedDownId || null;
    if (pick && byId.has(pick)) {
      const t = byId.get(pick);
      e.push(`${r.beat}: turnedDown: composition/look "${pick}" was turned down (${t.said || t.what || pick})`);
    }
  }
  return e;
}

/** B4 — every engine-capabilities route.device must exist; codeSymbol must be non-empty when set. */
export function capabilityRouteResolveErrors(capabilitiesDoc = null, devices = []) {
  const e = [];
  const routes = capabilitiesDoc?.routes || [];
  const byId = new Set((devices || []).map((d) => d.id));
  routes.forEach((r, i) => {
    const tag = `engine-capabilities.routes[${i}]`;
    if (!r?.device) {
      e.push(`${tag}: missing device (need kitPath/device binding)`);
      return;
    }
    if (!byId.has(r.device)) e.push(`${tag}: device "${r.device}" not in devices.json`);
    if (r.codeSymbol != null && !String(r.codeSymbol).trim()) e.push(`${tag}: codeSymbol empty`);
    if (r.kitPath != null && !String(r.kitPath).trim()) e.push(`${tag}: kitPath empty`);
  });
  return e;
}

/** B5 — screen / filmed evidence kinds must bind filmed-screen or real-page-mark (or real-page). */
export const SCREEN_OK_DEVICES = Object.freeze(['filmed-screen', 'real-page-mark', 'real-page']);

export function screenFilmedDeviceErrors(rows = []) {
  const e = [];
  for (const r of rows || []) {
    const kind = String(r.kind || r.routeKind || '');
    const screenish = /screen|filmed|webpage|页面|屏幕|led|crt/i.test(kind) || r.medium === 'screen' || r.screen === true;
    if (!screenish) continue;
    const d = r.device || '';
    if (!SCREEN_OK_DEVICES.includes(d)) {
      e.push(`${r.beat}: screen-device: kind/medium wants a filmed screen but device="${d || '(none)'}" — need filmed-screen or real-page-mark`);
    }
  }
  return e;
}

/**
 * D1 — label (caption/annotation role, small type) center must sit within maxDist px of its subject bbox.
 * TYPE §5 标签离标的太远.
 */
export function labelDistanceErrors(rows = [], { maxDist = 220, labelMaxPx = 72 } = {}) {
  const e = [];
  for (const r of rows || []) {
    const subjects = (r.blocks || []).filter((b) => b && (b.role === 'subject' || b.role === 'evidence') && Number.isFinite(b.x));
    if (!subjects.length) continue;
    const labels = (r.type || []).filter((t) => t && Number.isFinite(t.size) && t.size <= labelMaxPx && (t.role === 'caption' || t.role === 'annotation' || t.role === 'label'));
    for (const t of labels) {
      if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
      let best = Infinity;
      for (const s of subjects) {
        const cx = s.x + (s.w || 0) / 2, cy = s.y + (s.h || 0) / 2;
        const dx = t.x - cx, dy = t.y - cy;
        best = Math.min(best, Math.hypot(dx, dy));
        // also distance to bbox edge
        const ex = t.x < s.x ? s.x - t.x : t.x > s.x + (s.w || 0) ? t.x - (s.x + (s.w || 0)) : 0;
        const ey = t.y < s.y ? s.y - t.y : t.y > s.y + (s.h || 0) ? t.y - (s.y + (s.h || 0)) : 0;
        best = Math.min(best, Math.hypot(ex, ey));
      }
      if (best > maxDist) {
        e.push(`${r.beat}: label-distance: "${t.text}" is ${Math.round(best)}px from its subject (max ${maxDist}) — TYPE§5 标签离标的太远`);
      }
    }
  }
  return e;
}

/** F1 — film design rows must name a houseStyle id when catalog present. */
export function houseStylePickErrors(rows = [], houseStyleDoc = null) {
  const e = [];
  const ids = new Set();
  if (houseStyleDoc?.id) ids.add(houseStyleDoc.id);
  for (const x of houseStyleDoc?.styles || houseStyleDoc?.looks || []) if (x?.id) ids.add(x.id);
  if (houseStyleDoc?.house?.id) ids.add(houseStyleDoc.house.id);
  // catalog may be a single house object without styles list — require row.houseStyle when field used
  for (const r of rows || []) {
    if (r.houseStyle == null && r.house == null) {
      // only enforce when catalog exposes enumerable ids OR when sibling rows already set it
      continue;
    }
    const pick = r.houseStyle || r.house;
    if (ids.size && !ids.has(pick)) e.push(`${r.beat}: houseStyle: "${pick}" not in house-style.json`);
  }
  // film-level: if any row missing houseStyle while opts.requireHouseStyle
  return e;
}

export function houseStyleRequiredErrors(rows = [], { required = false } = {}) {
  if (!required) return [];
  const e = [];
  for (const r of rows || []) {
    if (r.houseStyle == null && r.house == null) e.push(`${r.beat}: houseStyle: filmdesign must set houseStyle id (P1 F1)`);
  }
  return e;
}

/** F3 — medium / screen id must ∈ media.json. */
export function mediaCatalogErrors(rows = [], mediaDoc = null) {
  const e = [];
  const media = mediaDoc?.media || [];
  const ids = new Set(media.map((m) => m.id).filter(Boolean));
  if (!ids.size) return e;
  for (const r of rows || []) {
    const mid = r.medium || r.screen || r.media || null;
    if (mid == null || mid === true || mid === false) continue;
    if (!ids.has(String(mid))) e.push(`${r.beat}: media: "${mid}" not in media.json (${[...ids].slice(0, 8).join(', ')})`);
  }
  return e;
}

/**
 * H1 — design/greybox approved but chapter morph not delivered → blocked status copy.
 * Pure: pass flags.
 */
export function greyboxNotFinalStatus({ greyboxApproved = false, morphOk = false, chapterId = null } = {}) {
  if (!greyboxApproved || morphOk) return null;
  const who = chapterId ? `chapter ${chapterId}` : 'chapters';
  return `灰盒非终态: greybox approved but ${who} morph/preview not done — session-brief→morph→engine required (HOUSE); status=blocked`;
}

/**
 * H5 — build lesson-draft rows from retro ranked kinds (for lessons.json inbox / append).
 * Does not auto-write production lessons without review — returns drafts only.
 */
export function retroLessonDrafts(rankedKinds = [], { project = null, at = null, max = 3 } = {}) {
  const when = at || new Date().toISOString().slice(0, 10);
  return (rankedKinds || []).slice(0, max).map(([kind, v], i) => ({
    id: `retro-${project || 'film'}-${when}-${kind}`,
    from: 'retro',
    said: `${when} retro #${i + 1}: ${kind} ×${v?.n || 0}`,
    do: v?.examples?.[0] ? `Prevent: ${String(v.examples[0]).slice(0, 160)}` : `Move ${kind} checks earlier`,
    check: `retro-kind:${kind}`,
    status: 'draft',
  }));
}

/** Persist drafts under routing/lesson-inbox.json (append, dedupe by id). */
export function appendRetroLessonDrafts(cfg, drafts = []) {
  if (!cfg?.dataDir || !drafts.length) return { added: 0, file: null };
  const f = path.join(cfg.dataDir, 'routing', 'lesson-inbox.json');
  const cur = readJson(f, { contract: 'A1LessonInbox/v1', items: [] });
  const have = new Set((cur.items || []).map((x) => x.id));
  let added = 0;
  for (const d of drafts) {
    if (!d?.id || have.has(d.id)) continue;
    (cur.items ||= []).push(d);
    have.add(d.id);
    added++;
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(cur, null, 1) + '\n');
  return { added, file: f };
}



// ----- Opus55 P1 G4/G5/G7/G9/G10 extensions 2026-10-29 -----

/** G4 — load engine-capabilities.json from dataDir. */
export function loadEngineCapabilities(cfg) {
  if (!cfg?.dataDir) return null;
  return readJson(path.join(cfg.dataDir, 'routing', 'engine-capabilities.json'), null);
}

/**
 * G4 — schema errors for A1EngineCapabilities/v1 (structural; B4 still cross-checks devices).
 * Pure: pass the document.
 */
export function engineCapabilitiesSchemaErrors(doc = null) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['engine-capabilities: missing document'];
  if (doc.contract !== 'A1EngineCapabilities/v1') e.push('engine-capabilities: contract must be A1EngineCapabilities/v1');
  if (!Array.isArray(doc.capabilities) || !doc.capabilities.length) e.push('engine-capabilities: capabilities[] required');
  else {
    doc.capabilities.forEach((c, i) => {
      const tag = `capabilities[${i}]`;
      if (!c?.id) e.push(`${tag}: missing id`);
      if (!['chapter', 'card', 'retired'].includes(c?.status)) e.push(`${tag}: status must be chapter|card|retired`);
    });
  }
  if (!Array.isArray(doc.routes) || !doc.routes.length) e.push('engine-capabilities: routes[] required');
  else {
    doc.routes.forEach((r, i) => {
      const tag = `routes[${i}]`;
      if (!r?.need) e.push(`${tag}: missing need`);
      if (!r?.device) e.push(`${tag}: missing device`);
      if (!String(r?.kitPath || '').trim()) e.push(`${tag}: missing kitPath`);
      if (!String(r?.codeSymbol || '').trim()) e.push(`${tag}: missing codeSymbol`);
    });
  }
  return e;
}

/**
 * G4 — status surface: which engines are chapter-callable vs card-only vs retired.
 */
export function engineCapabilitiesStatus(doc = null) {
  const caps = doc?.capabilities || [];
  const by = { chapter: [], card: [], retired: [] };
  for (const c of caps) {
    const s = c?.status;
    if (by[s]) by[s].push(c.id);
  }
  return {
    contract: doc?.contract || null,
    chapter: by.chapter,
    card: by.card,
    retired: by.retired,
    routes: (doc?.routes || []).length,
    line: `engines: chapter=[${by.chapter.join(',') || '—'}] card=[${by.card.join(',') || '—'}] retired=${by.retired.length} routes=${(doc?.routes || []).length}`,
  };
}

/**
 * G4 — dispatch: resolve a need string or capability id → { device, kitPath, codeSymbol, need, capability }.
 */
export function dispatchCapability(doc = null, needOrId = '') {
  const q = String(needOrId || '').trim();
  if (!doc || !q) return null;
  // Link by explicit capability id, or the table's exact chapter/codeSymbol.
  // Device=id supports legacy rows; never infer links from substring matches.
  // Multiple linked routes use table order (the first is the default); callers
  // wanting a particular variant dispatch its need/device instead. Do not sort.
  const linked = (r, c) => r.capability != null ? r.capability === c.id
    : r.device === c.id || (typeof c.chapter === 'string' && c.chapter.trim() !== '' && r.codeSymbol === c.chapter);
  const callable = (r) => [r?.kitPath, r?.codeSymbol].every(v => typeof v === 'string' && v.trim() !== '') && r.codeSymbol.trim() !== 'device:None';
  const cap = (doc.capabilities || []).find((c) => c.id === q);
  if (cap) {
    const route = (doc.routes || []).find((r) => linked(r, cap));
    return {
      capability: cap.id,
      status: cap.status,
      device: route?.device || null,
      kitPath: route?.kitPath || null,
      codeSymbol: route?.codeSymbol || null,
      need: route?.need || null,
      chapterCallable: cap.status === 'chapter' && callable(route),
    };
  }
  const route = (doc.routes || []).find((r) => r.need === q || (r.need && r.need.includes(q)) || r.device === q || r.codeSymbol === q);
  if (!route) return null;
  const owners = (doc.capabilities || []).filter(c => linked(route, c));
  return {
    capability: null,
    status: null,
    device: route.device,
    kitPath: route.kitPath,
    codeSymbol: route.codeSymbol,
    need: route.need,
    chapterCallable: callable(route) && owners.every(c => c.status === 'chapter'),
  };
}

/** G5 — effort tiers (OVH import). */
export const EFFORT_TIERS = Object.freeze(['quick', 'standard', 'studio']);

export function loadEffortTiers(cfg) {
  if (!cfg?.dataDir) return null;
  return readJson(path.join(cfg.dataDir, 'routing', 'effort-tiers.json'), null);
}

/**
 * G5 — resolve effort from opts / project / env. Default standard.
 */
export function resolveEffort(opts = null, project = null) {
  const raw = opts?.effort ?? opts?.runProfile ?? project?.effort ?? project?.runProfile ?? process.env.A1_EFFORT ?? 'standard';
  const p = String(raw).trim().toLowerCase();
  if (p === 'overnight') return 'studio';
  if (EFFORT_TIERS.includes(p)) return p;
  return 'standard';
}

// Studio requires real preview evidence even when a chapter's rough-cut
// contract only asks for warnings. Other effort levels retain their contract.
export function effortDelivery(delivery = null, effort = 'standard') {
  return resolveEffort({ effort }) === 'studio'
    ? { ...(delivery || {}), previewMp4: true, bindMorphHash: true, stillsBeforePreview: true }
    : delivery;
}

/**
 * G5 — studio overnight checklist items (director skill + tests).
 * Returns soft warnings when studio skips stills/animatic/polish language in a run note; pure for unit tests.
 */
export function effortStudioChecklistErrors(effort = 'standard', flags = {}) {
  if (resolveEffort({ effort }) !== 'studio') return [];
  const e = [];
  if (flags.stillsBeforePreview === false) e.push('effort-studio: stills→preview required under studio (do not skip stills)');
  if (flags.animatic === false) e.push('effort-studio: animatic required under studio');
  if (flags.polishRounds != null && flags.polishRounds < 1) e.push('effort-studio: polish rounds ≥1 under studio (fix worst-3)');
  return e;
}

/**
 * G7 — version-aware TextGeometry advisory (flxrnc's r160 trap).
 * This heuristic does not parse each constructor or replace rendered QA.
 */
export const THREE_PIN_HINT = 'TextGeometry: r162 and earlier use height; r163+ use depth (pin the actual version)';

export function versionTrapErrors({ threeVersion = null, morphCode = '', templateNote = '' } = {}) {
  const e = [];
  const ver = threeVersion != null ? String(threeVersion) : null;
  const code = String(morphCode || '');
  if (/TextGeometry\s*\(/.test(code)) {
    const m = ver?.match(/^0\.(\d+)(?:\.|$)/), minor = m ? +m[1] : null;
    if (minor === null) e.push(`version-trap: TextGeometry requires a known three.js version; ${THREE_PIN_HINT}`);
    else if (minor <= 162 && !/\bheight\s*:/.test(code)) e.push(`version-trap: three.js ${ver} TextGeometry needs height; depth is overwritten`);
    else if (minor >= 163 && !/\bdepth\s*:/.test(code)) e.push(`version-trap: three.js ${ver} TextGeometry needs depth; don't rely on height`);
  }
  return e;
}

/**
 * G9 harden — design/greybox approved + morph missing → always blocked (alias of greyboxNotFinalStatus).
 */
export function greyboxNotFilmHardStop(opts = {}) {
  return greyboxNotFinalStatus(opts);
}

/**
 * G10 — final approved requires retro lesson drafts (hard step).
 * Pure flags: finalApproved, hasRetroFile, draftCount.
 */
export function retroHardStepErrors({ finalApproved = false, hasRetroFile = false, draftCount = 0 } = {}) {
  if (!finalApproved) return [];
  const e = [];
  if (!hasRetroFile) e.push('retro-hard-step: final approved but out/film/retro.md missing — run retro before close');
  if (!(draftCount >= 1)) e.push('retro-hard-step: final approved but no lesson drafts (lesson-inbox / retro-lesson-drafts) — H5 hard step');
  return e;
}

/**
 * Rough-cut gateProfile: demote balance (主体偏上 fill) + ground-busier to warn (B26 calm pattern).
 * Type pierce (cross) / text-over-object stay hard — never matched here.
 */
export const ROUGH_CUT_WARN_RE = /picture sits in the top half|ground is busier than the subject/;

export function partitionRoughCutWarns(msgs = [], { roughCut = false } = {}) {
  if (!roughCut) return { errors: [...(msgs || [])], warnings: [] };
  const errors = [], warnings = [];
  for (const m of msgs || []) (ROUGH_CUT_WARN_RE.test(String(m)) ? warnings : errors).push(m);
  return { errors, warnings };
}

/** F2 — recall/memory / vhs-ish screen must bind vhs-osd | filmed-screen | showa-poster (hard). */
export const RECALL_OK_DEVICES = Object.freeze(['vhs-osd', 'filmed-screen', 'showa-poster', 'real-page-mark']);

export function mediaKindDeviceErrors(rows = []) {
  const e = [];
  for (const r of rows || []) {
    const act = String(r.act || '');
    // only act-tagged recall/memory — screen texture alone is not enough (avoid false-killing clean/vhs picks)
    const recall = /^(recall|memory)$/i.test(act) || /回忆|记忆/.test(act);
    if (!recall) continue;
    const d = r.device || '';
    if (!RECALL_OK_DEVICES.includes(d)) {
      e.push(`${r.beat}: recall-device: act=${act} wants vhs-osd|filmed-screen|showa-poster but device="${d || '(none)'}" (P1 F2)`);
    }
  }
  return e;
}

/**
 * E3 — organic / biological subject must have partset multi-view (≥2) + QA before morph.
 * Pure when buildViewsByName provided; otherwise reads partsRoot/<name>.build.json.
 */
export function claimsOrganicSubject(code = '', { film = null, project = null } = {}) {
  if (project?.subject?.organic === true || project?.organic === true) return true;
  // explicit markers only — model name alone is not enough (tests set project.subject.organic)
  const blob = `${JSON.stringify(project?.subject || {})}\n${JSON.stringify(film || [])}\n${String(code || '').slice(0, 4000)}`;
  return /\borganic\b|有机主体|organic subject|formFor\s*:\s*['"]organic['"]|subjectKind\s*:\s*['"]organic['"]/i.test(blob);
}

export function organicMultiViewErrors(code, project, {
  film = null,
  partsRoot = null,
  modelsNamed = null,
  minViews = 2,
  buildViewsByName = null,
} = {}) {
  if (!claimsOrganicSubject(code, { film, project })) return [];
  const e = [];
  const names = typeof modelsNamed === 'function'
    ? modelsNamed(code).map((m) => (typeof m === 'string' ? m : m.name)).filter(Boolean)
    : [...String(code || '').matchAll(/props\.model\s*\(\s*[^,]+,\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1]);
  if (!names.length) {
    e.push('organic-partset: organic subject claimed but no kit.props.model name — run partset multi-view+QA before morph (P1 E3)');
    return e;
  }
  for (const name of names) {
    let views = buildViewsByName?.(name);
    if (views == null && partsRoot) {
      try {
        const b = JSON.parse(fs.readFileSync(path.join(partsRoot, `${name}.build.json`), 'utf8'));
        views = Object.keys(b?.views || {});
      } catch { views = null; }
    }
    if (!views || views.length < minViews) {
      e.push(`organic-partset: model ${name} needs ≥${minViews} partset views+QA before morph (got ${views ? views.length : 0}) (P1 E3)`);
    }
    if (partsRoot) {
      try {
        const qa = JSON.parse(fs.readFileSync(path.join(partsRoot, `${name}.qa.json`), 'utf8'));
        if (!(qa?.ok === true || qa?.contract === 'A1ModelCheck/v1' && qa.ok)) {
          e.push(`organic-partset: model ${name} qa.json not ok — cannot enter morph preview (P1 E3)`);
        }
      } catch {
        e.push(`organic-partset: model ${name} missing qa.json — cannot enter morph preview (P1 E3)`);
      }
    }
  }
  return e;
}
