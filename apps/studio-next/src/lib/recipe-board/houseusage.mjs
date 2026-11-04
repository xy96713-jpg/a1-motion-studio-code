// House Usage Meter v0 — counts how a project's filmdesign + greybox answer uses the house's
// screens, palettes, seams and evidence (no user score). Deep-reads filmedScreen / device kit hits
// when storyboard + devices.json are present (fail evidence-flat; fail device-no-kit). Writes out/film/house-usage.json.
 //   node scripts/recipe-board.mjs usage --project <id>
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths, loadProject } from './store.mjs';
import { finishOf } from './finish.mjs';
import { selectedDeviceKitErrors, loadDevices, loadKitSymbolIndex } from './refbreakdown.mjs';
import {
  SEAMS, MOTION_SEAMS, CARRY_SEAMS, COVER_SEAMS,
  worldOrScreenJump, coversWorldJump, isUncoveredJumpOut, unknownSeamOuts, settledCam,
} from './seams.mjs';
export { SEAMS, MOTION_SEAMS, CARRY_SEAMS, COVER_SEAMS, worldOrScreenJump, coversWorldJump, isUncoveredJumpOut } from './seams.mjs';
import { matureSpineFlags } from './mature.mjs';

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

const countBy = (rows, key) => {
  const out = {};
  for (const r of rows) { const k = r?.[key] ?? '(none)'; out[k] = (out[k] || 0) + 1; }
  return out;
};

// (pure, tested) measure house usage from already-loaded answers (no disk)
export function measureHouseUsage({ film, greybox, bindings = null, storyboard = null, finish = null, project = null, id = null, devices: devicesCatalog = null, kitSymbols = null } = {}) {
  const filmBeats = film?.beats || [];
  const greyBeats = greybox?.beats || [];
  const byGrey = Object.fromEntries(greyBeats.map((r) => [r.beat, r]));
  const n = filmBeats.length || greyBeats.length;
  const screens = countBy(filmBeats, 'screen');
  const palettes = countBy(filmBeats, 'palette');
  const seams = countBy(greyBeats, 'out');
  const nonClean = filmBeats.filter((r) => (r.screen || 'clean') !== 'clean').length;
  const screenNotCleanShare = n ? +(nonClean / n).toFixed(3) : null;

  // jumps: cover rules from seams.mjs (same as greyboxSeamErrors / worldJumpSeamErrors)
  let jumps = 0, jumpsCoveredMotion = 0, jumpsCoveredAny = 0, jumpsBareCut = 0;
  const jumpRows = [];
  for (let i = 0; i < filmBeats.length - 1; i++) {
    const a = filmBeats[i], b = filmBeats[i + 1];
    if (!worldOrScreenJump(a, b)) continue;
    jumps++;
    const ga = byGrey[a.beat] || {}, gb = byGrey[b.beat] || {};
    const out = ga.out || 'cut';
    const settled = settledCam(ga.camera) && settledCam(gb.camera);
    const covered = coversWorldJump(out, ga.camera, gb.camera);
    const row = { from: a.beat, to: b.beat, screen: [a.screen || 'clean', b.screen || 'clean'], scale: [a.scale, b.scale], out, settled, covered };
    jumpRows.push(row);
    if (MOTION_SEAMS.includes(out)) jumpsCoveredMotion++;
    if (covered) jumpsCoveredAny++;
    if (isUncoveredJumpOut(out, ga.camera, gb.camera)) jumpsBareCut++;
  }
  const jumpMotionShare = jumps ? +(jumpsCoveredMotion / jumps).toFixed(3) : null;
  const jumpCarryShare = jumps ? +(jumpsCoveredAny / jumps).toFixed(3) : null;

  // evidence: filmdesign medium=evidence is the hard promise; storyboard evidence lists are asks
  const boundShots = bindings?.shots && typeof bindings.shots === 'object' && !Array.isArray(bindings.shots)
    ? Object.keys(bindings.shots) : Array.isArray(bindings?.shots) ? bindings.shots.map((s) => s.beat || s.shotId || s).filter(Boolean) : [];
  // prefix match: materials keys are often "B17~page" (same as materialsInHand / evidenceBindingErrors)
  const boundSet = new Set(boundShots.map((k) => String(k).split('~')[0]));
  const evidenceBeats = filmBeats.filter((r) => r.medium === 'evidence').map((r) => r.beat);
  const sbEvidence = (storyboard?.shots || []).filter((s) => (s.evidence || []).length && !s.noEvidence).map((s) => s.beat);
  const promised = evidenceBeats; // design medium=evidence; storyboard lists stay informational
  const evidenceBound = promised.filter((b) => boundSet.has(b));
  const evidenceUnbound = promised.filter((b) => !boundSet.has(b));

  // finish / filmedScreen / device — deep-read when storyboard + device catalog are present
  const finishHit = finish || null;
  const deviceCounts = {};
  for (const s of storyboard?.shots || []) for (const d of s.devices || []) deviceCounts[d] = (deviceCounts[d] || 0) + 1;
  const bySb = Object.fromEntries((storyboard?.shots || []).map((s) => [s.beat, s]));
  const EVIDENCE_SCREEN_DEVICES = new Set(['filmed-screen', 'real-doc-callout', 'real-page-mark']);
  const filmedScreenBeats = filmBeats.filter((r) => (r.screen || 'clean') !== 'clean').map((r) => ({ beat: r.beat, screen: r.screen }));
  const filmedScreenHits = [];
  for (const r of filmBeats) {
    const sb = bySb[r.beat] || {}, screen = r.screen || 'clean', via = [];
    if (screen !== 'clean') via.push(`screen:${screen}`);
    if ((sb.devices || []).includes('filmed-screen')) via.push('device:filmed-screen');
    if (via.length) filmedScreenHits.push({ beat: r.beat, via });
  }
  const evidenceFilmed = filmBeats.filter((r) => r.medium === 'evidence').map((r) => {
    const sb = bySb[r.beat] || {}, screen = r.screen || 'clean', devs = (sb.devices || []).filter((d) => EVIDENCE_SCREEN_DEVICES.has(d));
    const hit = screen !== 'clean' || devs.length > 0;
    return { beat: r.beat, hit, screen, devices: devs };
  });
  const chosen = (storyboard?.shots || []).map((s) => ({ beat: s.beat, devices: s.devices || [] }));
  const deviceKitErrors = devicesCatalog ? selectedDeviceKitErrors(chosen, devicesCatalog, { symbols: kitSymbols || null }) : [];
  const deviceReady = {}, deviceUnknown = [], deviceNotReady = [];
  if (devicesCatalog) {
    const by = new Map(devicesCatalog.map((d) => [d.id, d]));
    for (const id of Object.keys(deviceCounts)) {
      const d = by.get(id);
      if (!d) deviceUnknown.push(id);
      else if (d.kit?.status !== 'ready') deviceNotReady.push(id);
      else deviceReady[id] = deviceCounts[id];
    }
  }

  const flags = [];
  if (screenNotCleanShare != null && screenNotCleanShare < 0.15) flags.push({ level: 'warn', code: 'screen-sparse', say: `only ${Math.round(screenNotCleanShare * 100)} % of beats leave clean (screens carry texture; aim higher where readings/records belong)` });
  if (Object.keys(palettes).filter((k) => k !== '(none)').length <= 1 && n >= 6) flags.push({ level: 'warn', code: 'one-palette', say: 'one palette across the film (harmony may hold, but the arc has no colour turns)' });
  if (jumps >= 2 && jumpMotionShare != null && jumpMotionShare < 0.5) flags.push({ level: 'warn', code: 'jump-bare', say: `flash|whip|glitch cover ${Math.round(jumpMotionShare * 100)} % of ${jumps} world/screen jumps (bare cut on ${jumpsBareCut})` });
  if (jumpsBareCut > 0) flags.push({ level: 'fail', code: 'jump-cut', say: `${jumpsBareCut} world/screen jump(s) leave on cut without a covering seam (want whip/glitch/flash/match/push, or cut with both ends settled)` });
  { const outs = greyBeats.map((r) => r.out); let run = 0;
    for (let i = 0; i < outs.length; i++) { run = outs[i] === 'cut' ? run + 1 : 0; if (run >= 3) { flags.push({ level: 'fail', code: 'cut-streak', say: `≥3 consecutive outs are cut (${greyBeats[i - 2].beat}–${greyBeats[i].beat}): break with match/whip/glitch/flash/push` }); break; } } }
  if (promised.length && evidenceUnbound.length) flags.push({ level: 'fail', code: 'evidence-unbound', say: `${evidenceUnbound.length}/${promised.length} filmdesign evidence beats lack a materials binding (${evidenceUnbound.join(', ')}): bind real material or change the medium` });
  if ((seams.cut || 0) > Math.ceil(n * 0.55) && n >= 6) flags.push({ level: 'warn', code: 'cut-heavy', say: `${seams.cut || 0}/${n} seams are cut (>55 %): the line prefers designed seams` });
  // evidence on clean with no filmed/page device: hard fail (same promise as filmedScreen / page device)
  { const flat = evidenceFilmed.filter((x) => !x.hit).map((x) => x.beat);
    if (flat.length) flags.push({ level: 'fail', code: 'evidence-flat', say: `${flat.join(', ')}: filmdesign medium=evidence on clean with no filmed-screen / real-doc-callout / real-page-mark — use kit.engine.filmedScreen or a page device` }); }
  for (const msg of deviceKitErrors) flags.push({ level: 'fail', code: 'device-no-kit', say: msg });
  // unknown out: greybox check errors; meter must not silently ignore (same SEAMS allow-list)
  { const unk = unknownSeamOuts(greyBeats);
    if (unk.length) flags.push({ level: 'fail', code: 'seam-unknown', say: `${unk.length} greybox out(s) not in house seams (${unk.map((u) => `${u.beat}:${u.out}`).join(', ')}): one of ${SEAMS.join(', ')}` }); }
  // HOUSE mature spine: warn only (does not flip pass — banana/suez usage must not regress)
  for (const f of matureSpineFlags(filmBeats)) flags.push({ level: 'warn', code: f.code, say: f.say });

  const pass = !flags.some((f) => f.level === 'fail');
  const m = {
    contract: 'A1RecipeBoardHouseUsage/v0',
    project: id || project?.id || null,
    at: new Date().toISOString(),
    n,
    screen: { counts: screens, notClean: nonClean, notCleanShare: screenNotCleanShare, filmedScreenBeats },
    filmedScreen: { hits: filmedScreenHits, evidence: evidenceFilmed },
    palette: { counts: palettes, families: Object.keys(palettes).filter((k) => k !== '(none)').length },
    seam: { counts: seams, allowed: SEAMS },
    jumps: { n: jumps, motionCovered: jumpsCoveredMotion, carryCovered: jumpsCoveredAny, bareCut: jumpsBareCut, motionShare: jumpMotionShare, carryShare: jumpCarryShare, rows: jumpRows },
    evidence: { promised, bound: evidenceBound, unbound: evidenceUnbound, storyboardAsks: sbEvidence, bindings: boundShots.length },
    finish: finishHit,
    devices: { counts: deviceCounts, ready: deviceReady, unknown: deviceUnknown, notReady: deviceNotReady },
    flags,
    pass,
    mode: 'warn-and-flag', // v0: CLI does not fail the process; JSON flags carry fail/warn
  };
  // short evidence + seam: same strings sheet/CLI/review already print (one source)
  m.summaries = { evidence: houseUsageEvidenceSummary(m, { short: true }), seam: houseUsageSeamSummary(m) };
  return m;
}

export function houseUsageLine(m) {
  const scr = m.screen?.notCleanShare == null ? '–' : `${Math.round(m.screen.notCleanShare * 100)}%≠clean`;
  const pal = m.palette?.families ?? 0;
  const seam = Object.entries(m.seam?.counts || {}).map(([k, v]) => `${k}:${v}`).join(' ') || '–';
  const jmp = m.jumps?.n ? `jumps ${m.jumps.motionCovered}/${m.jumps.n} motion` : 'jumps 0';
  const ev = m.evidence?.promised?.length ? `evidence ${m.evidence.bound.length}/${m.evidence.promised.length}` : 'evidence –';
  const { evidence: hit } = houseUsageSummariesOf(m);
  const fl = (m.flags || []).length ? `flags ${(m.flags || []).map((f) => f.code).join(',')}` : 'flags none';
  return `house-usage ${m.pass ? 'PASS' : 'FAIL'} · ${m.n} beats · ${scr} · ${pal} palettes · ${seam} · ${jmp} · ${ev} · ${hit} · ${fl}`;
}

// (pure, tested) filmedScreen / evidence hit summary for CLI line, sheet/review input
export function houseUsageEvidenceSummary(m, { short = false } = {}) {
  const hits = m?.filmedScreen?.hits || [];
  const ev = m?.filmedScreen?.evidence || [];
  const evHit = ev.filter((x) => x.hit).length;
  const flat = ev.filter((x) => !x.hit).map((x) => x.beat);
  if (short) {
    const flatBit = flat.length ? ` flat ${flat.join(',')}` : '';
    return `filmed ${hits.length}·ev ${evHit}/${ev.length || 0}${flatBit}`;
  }
  const hitBeats = hits.map((h) => `${h.beat}(${(h.via || []).join('+')})`).join(' ') || '–';
  const flatBit = flat.length ? ` · evidence-flat ${flat.join(', ')}` : '';
  return `filmedScreen ${hits.length} hit [${hitBeats}] · evidence-screen ${evHit}/${ev.length || 0}${flatBit}`;
}

// load project answers and write out/film/house-usage.json

const SEAM_ZH = { cut: '硬切', match: '叠化', whip: '快甩', push: '推', glitch: '信号坏', flash: '闪白' };
// stale blind-review wording that claims the film is mostly hard cuts
const HARD_CUT_CLAIM = /大半是硬切|大半硬切|一路硬切|衔接多是.{0,12}硬切|\d+\s*处衔接里大半/;

export function houseUsageSeamSummary(m) {
  const counts = m?.seam?.counts || {};
  const parts = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${SEAM_ZH[k] || k}${v}`);
  const jmp = m?.jumps;
  const jumpBit = jmp?.n ? `世界跳 motion ${jmp.motionCovered}/${jmp.n} bareCut ${jmp.bareCut}` : '世界跳 0';
  return `衔接 ${parts.join(' / ') || '–'} · ${jumpBit}`;
}

// prefer meter.summaries (written by measureHouseUsage); fall back for older house-usage.json
export function houseUsageSummariesOf(m) {
  return {
    evidence: m?.summaries?.evidence ?? houseUsageEvidenceSummary(m, { short: true }),
    seam: m?.summaries?.seam ?? houseUsageSeamSummary(m),
  };
}

// (pure, tested) greybox-review.task.json input.houseUsage — seam/evidence from summariesOf only
export function houseUsageReviewInput(meter) {
  const sum = houseUsageSummariesOf(meter);
  return {
    line: houseUsageLine(meter),
    seam: sum.seam,
    evidence: sum.evidence,
    counts: meter?.seam?.counts || {},
    jumps: { n: meter?.jumps?.n || 0, motionCovered: meter?.jumps?.motionCovered || 0, bareCut: meter?.jumps?.bareCut || 0 },
    filmedScreen: {
      n: (meter?.filmedScreen?.hits || []).length,
      evidenceHit: (meter?.filmedScreen?.evidence || []).filter((x) => x.hit).length,
      evidenceN: (meter?.filmedScreen?.evidence || []).length,
    },
    pass: !!meter?.pass,
  };
}

// readers (sessionbrief / greybox review+sheet): remasure, then prefer disk house-usage.json summaries.*
export function houseUsageRead(cfg, id, { write = false } = {}) {
  const m = houseUsage(cfg, id, { write });
  const disk = readJson(path.join(projectPaths(cfg, id).root, 'out', 'film', 'house-usage.json'));
  if (disk?.summaries && (disk.summaries.evidence != null || disk.summaries.seam != null)) {
    m.summaries = {
      evidence: disk.summaries.evidence ?? m.summaries?.evidence,
      seam: disk.summaries.seam ?? m.summaries?.seam,
    };
  }
  return m;
}

export function isStaleHardCutClaim(issue) {
  return HARD_CUT_CLAIM.test(`${issue?.say || ''} ${issue?.fix || ''} ${issue?.overall || ''}`);
}

// (pure, tested) drop blind-review issues that claim mostly-hard-cuts when the meter says cuts are not heavy
export function reconcileReviewIssuesWithUsage(issues, meter) {
  const list = Array.isArray(issues) ? issues : [];
  if (!meter?.seam) return list.slice();
  const cut = meter.seam.counts?.cut || 0;
  const n = meter.n || 0;
  const cutHeavy = (meter.flags || []).some((f) => f.code === 'cut-heavy');
  const bare = meter.jumps?.bareCut || 0;
  const mostlyDesigned = !cutHeavy && bare === 0 && (n < 6 || cut <= Math.ceil(n * 0.55));
  if (!mostlyDesigned) return list.slice();
  return list.filter((iss) => !isStaleHardCutClaim(iss));
}

// sheet / audit open notes: severity filter after meter reconcile
export function sheetOpenNotes(issues, meter, { minSeverity = 3 } = {}) {
  return reconcileReviewIssuesWithUsage(issues, meter).filter((n) => (n.severity ?? 0) >= minSeverity);
}

export function houseUsage(cfg, id, { write = true } = {}) {
  const root = projectPaths(cfg, id).root, tasks = path.join(root, 'tasks');
  const film = readJson(path.join(tasks, 'filmdesign.answer.json'))
    || readJson(path.join(tasks, 'filmdesign.check.json'))?.answer
    || null;
  const greybox = readJson(path.join(tasks, 'greybox.answer.json'));
  const bindings = readJson(path.join(root, 'materials', 'bindings.json'));
  const storyboard = readJson(path.join(root, 'storyboard.json'));
  const project = loadProject(cfg, id) || {};
  const finish = finishOf(cfg, id);
  const devices = loadDevices(cfg);
  const kitSymbols = loadKitSymbolIndex(cfg);
  const m = measureHouseUsage({ film, greybox, bindings, storyboard, finish, project, id, devices, kitSymbols });
  if (write) {
    const dir = path.join(root, 'out', 'film');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'house-usage.json'), JSON.stringify(m, null, 1) + '\n');
    m.file = path.join(dir, 'house-usage.json');
  }
  return m;
}
