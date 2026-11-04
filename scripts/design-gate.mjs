#!/usr/bin/env node
// Design gate: at least six comparable options; the user picks one, and it is locked.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const norm = (s) => String(s || '').replace(/\s+/g, '');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const POLICY = read('work/recipe-board-v1/routing/media-policy.json');
const LOOK = read('work/recipe-board-v1/routing/look-lock.json');
const WORLD = read('work/recipe-board-v1/routing/world-board.json');
const TECH = read('work/recipe-board-v1/routing/tech-stack.json');
const TECH_BY_ID = new Map((TECH.capabilities || []).map((c) => [c.id, c]));
const EFFECT = read('work/recipe-board-v1/routing/effects.json');
const EFFECT_BY_ID = new Map((EFFECT.effects || []).map((e) => [e.id, e]));
// A frame/motion taken from a canary is a test artifact. It may stand in for a design direction only after that canary
// passed scripts/canary-preflight.mjs --write (syntax, page errors, real motion, QA'd model/texture, manifest registration).
export function canaryIdInPath(p) {
  const m = String(p || '').match(/(?:^|\/)canaries\/([^/]+)\//);
  return m ? m[1] : null;
}
export function canaryPreflightErrors(project, id, kind, file) {
  if (!id) return [];
  const reportPath = path.join(ROOT, 'work/recipe-board-v1/projects', String(project || '?'), 'canaries', 'preflight', `${id}.json`);
  let report = null;
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch {}
  const entry = report?.contract === 'A1CanaryPreflight/v1' ? (report.canaries || []).find((c) => c.id === id) : null;
  if (entry?.ok === true) return [];
  return [`${kind} uses canary ${id} without a passing canary preflight (run node scripts/canary-preflight.mjs --project ${project || '<id>'} --canary ${id} --write): ${file}`];
}
export function validateDesignBoard(board) {
  const errors = [];
  if (!board || !['A1DesignBoard/v1', 'A1DesignBoard/v2'].includes(board.contract)) errors.push('contract must be A1DesignBoard/v1 or A1DesignBoard/v2');
  if (!board?.line) errors.push('line missing');
  if (!board?.visualThesis || norm(board.visualThesis).length < 8) errors.push('visualThesis missing/too short');
  if (/TODO/i.test(String(board?.visualThesis || ''))) errors.push('visualThesis is still TODO');
  if (board?.contract === 'A1DesignBoard/v2') {
    const w = board.world || {};
    for (const k of ['name', 'space', 'material', 'light', 'cameraGrammar', 'typeSystem', 'seamGrammar']) {
      if (!w[k] || norm(w[k]).length < 2 || /TODO/i.test(String(w[k]))) errors.push('world.' + k + ' missing/TODO');
    }
    if (board.worldTest) {
      const t = board.worldTest;
      if (!t.file || !dFile(t.file)) errors.push('worldTest file missing: ' + (t.file || '?'));
      if (!(Number(t.durationSec) >= 5 && Number(t.durationSec) <= 12)) errors.push('worldTest durationSec must be 5–12');
      if (t.blindReview?.status !== 'pass') errors.push('worldTest blindReview must pass');
    }
    if (board.heroAsset) {
      const h = board.heroAsset;
      if (!h.model || !dFile(h.model)) errors.push('heroAsset model missing: ' + (h.model || '?'));
      if (!h.assetSheet || !dFile(h.assetSheet)) errors.push('heroAsset assetSheet missing: ' + (h.assetSheet || '?'));
      if (h.contactShadows !== 'pass') errors.push('heroAsset contactShadows must pass');
    }
  }
  const ds = board?.directions || [];
  if (ds.length < LOOK.minOptions) errors.push('need at least ' + LOOK.minOptions + ' options/images, got ' + ds.length);
  const seen = new Set();
  for (const d of ds) {
    if (!d.id) errors.push('direction missing id');
    const t = norm(d.thesis);
    if (t.length < 8) errors.push((d.id || '?') + ' thesis missing/too short');
    if (/TODO/i.test(String(d.thesis || ''))) errors.push((d.id || '?') + ' thesis is still TODO');
    if (seen.has(t)) errors.push((d.id || '?') + ' duplicates another thesis (layout variant, not design)');
    seen.add(t);
    if (!d.medium) errors.push((d.id || '?') + ' medium missing');
    if (!d.build) errors.push((d.id || '?') + ' build missing (3d|real|procedural|graphic)');
    else if (!POLICY.finalShotBuilds.includes(d.build)) errors.push((d.id || '?') + ' build must be one of ' + POLICY.finalShotBuilds.join('|'));
    if (d.frame && POLICY.forbiddenFinalPaths.some((x) => String(d.frame).includes(x))) errors.push((d.id || '?') + ' generated still cannot be the final frame: ' + d.frame);
    if (d.frame && d.reference && path.resolve(ROOT, d.frame) === path.resolve(ROOT, d.reference)) errors.push((d.id || '?') + ' frame equals reference; reference is not a shot');
    if (!d.frame) errors.push((d.id || '?') + ' frame missing');
    if (!d.motion) errors.push((d.id || '?') + ' motion missing');
    if (d.checks?.composite !== 'pass') errors.push((d.id || '?') + ' needs composite pass');
    if (d.frame && !fs.existsSync(path.join(ROOT, d.frame))) errors.push((d.id || '?') + ' frame file missing: ' + d.frame);
    if (d.motion && !fs.existsSync(path.join(ROOT, d.motion))) errors.push((d.id || '?') + ' motion file missing: ' + d.motion);
    for (const [kind, file] of [['frame', d.frame], ['motion', d.motion]]) {
      const id = canaryIdInPath(file);
      if (id) errors.push(...canaryPreflightErrors(board?.project, id, kind, file));
    }
  }
  const media = new Set(ds.map((d) => d.medium).filter(Boolean));
  if (media.size < 2) errors.push('directions need at least 2 media (not one template three times)');
  if (board?.worldSheet) {
    const w = board.worldSheet;
    if (w.contract !== 'A1WorldSheet/v1') errors.push('worldSheet contract must be A1WorldSheet/v1');
    if ((w.panels || []).length < WORLD.minPanels) errors.push('worldSheet needs at least ' + WORLD.minPanels + ' panels, got ' + (w.panels || []).length);
    if ((w.panels || []).length > WORLD.maxPanels) errors.push('worldSheet has more than ' + WORLD.maxPanels + ' panels');
    if (w.source && !dFile(w.source)) errors.push('worldSheet source file missing: ' + w.source);
    if (w.ok === false) errors.push('worldSheet coherence report failed');
  }
  if (board?.selected) {
    const s = ds.find((d) => d.id === board.selected);
    if (!s) errors.push('selected id not in directions');
    if (board?.userDecision?.status !== 'approved') errors.push('selected but no user approval');
    if (!s.reproduction || !['real','3d','procedural','code','texture','ai-video'].includes(s.reproduction.mode)) errors.push('selected direction missing reproduction mode');
    else if (!['high','medium'].includes(s.reproduction.fidelity)) errors.push('selected reproduction fidelity is low; change target or get a texture-approved route');
    if (board?.contract === 'A1DesignBoard/v2') {
      if (!s.buildPlan || s.buildPlan.contract !== 'A1BuildPlan/v1') errors.push('selected direction missing buildPlan');
      else if (s.buildPlan.status !== 'ready') errors.push('selected direction buildPlan is not ready');
      if (!s.benchmark || s.benchmark.status !== 'pass') errors.push('selected direction needs benchmark pass vs B12/Hupo');
      if (!Array.isArray(s.techStack) || !s.techStack.length) errors.push('selected direction missing techStack');
      if (!Array.isArray(s.effects) || !s.effects.length) errors.push('selected direction missing effects');
      for (const id of s.effects || []) {
        const e = EFFECT_BY_ID.get(id);
        if (!e) errors.push('selected direction unknown effect: ' + id);
        else if (e.status === 'missing') errors.push('selected direction uses missing effect: ' + id);
        else if (e.status === 'candidate' && !s.effectApproval?.[id]) errors.push('selected direction candidate effect needs canary approval: ' + id);
      }
      if (s.canaryVerdict && /fail|needs/i.test(String(s.canaryVerdict))) errors.push('selected direction canary not approved: ' + s.canaryVerdict);
      for (const id of s.techStack || []) {
        const c = TECH_BY_ID.get(id);
        if (!c) errors.push('selected direction unknown techStack: ' + id);
        else if (!['ready', 'installed'].includes(c.status) && !s.techApproval?.[id]) errors.push('selected direction techStack needs approval: ' + id + ' (' + c.status + ')');
      }
    }
    if (s.reproduction?.mode === 'ai-video') {
      const ai = POLICY.aiVideo || {};
      if ((ai.forbiddenForRoles || []).includes(s.role)) errors.push('AI video is not allowed for role: ' + s.role);
      if (!s.aiVideoApproval || s.aiVideoApproval.status !== 'approved') errors.push('AI video needs explicit user approval');
      if (!(Number(s.aiVideoDurationSec) > 0 && Number(s.aiVideoDurationSec) <= (ai.maxDurationSec || 5))) errors.push('AI video duration must be 1–5s');
      if (!s.triage || !s.triage.verdict) errors.push('AI video needs a triage verdict');
    }
    const lock = board?.lookLock;
    if (!lock) errors.push('selected but lookLock missing');
    else {
      if (lock.status !== 'locked') errors.push('lookLock status must be locked');
      if (lock.selected !== board.selected) errors.push('lookLock selected does not match board.selected');
      if (lock.reference && !dFile(lock.reference)) errors.push('lookLock reference file missing: ' + lock.reference);
      if (!lock.reference) errors.push('lookLock reference missing (the selected image/reference)');
      const rules = new Set(lock.rules || []);
      for (const r of LOOK.requiredRules) if (!rules.has(r)) errors.push('lookLock missing rule: ' + r);
      for (const e of LOOK.delivery.evidence) if (!lock.evidence?.[e]) errors.push('lookLock missing evidence: ' + e);
      if (lock.delivery !== 'no-different-delivery') errors.push('lookLock delivery must be no-different-delivery');
    }
  }
  return errors;
}
function dFile(p) { try { return fs.existsSync(path.join(ROOT, p)); } catch { return false; } }
export function scaffoldDesignBoard({ project, line }) {
  const dirs = ['A','B','C','D','E','F'];
  return {
    contract: 'A1DesignBoard/v2',
    project,
    line: line || 'TODO: 一句台词',
    visualThesis: 'TODO: 一句视觉论点（不是风格形容词）',
    world: {
      name: 'TODO: 世界名',
      space: 'TODO: 空间/材质',
      material: 'TODO: 材质与表面',
      light: 'TODO: 主光/补光/轮廓光',
      cameraGrammar: 'TODO: 镜头组/机位/运动语法',
      typeSystem: 'TODO: 字级/字位/字与物关系',
      seamGrammar: 'TODO: 接缝类型与动机',
    },
    worldTest: null,
    heroAsset: null,
    directions: dirs.map((id, i) => ({ id, thesis: 'TODO: 视觉论点 ' + id, medium: ['footage','3d','graphic'][i % 3], build: ['real','3d','graphic'][i % 3], reference: '', frame: '', motion: '', checks: { composite: 'pending' }, status: 'draft' })),
    selected: null,
    userDecision: null,
    lookLock: null,
  };
}
export function writeScaffold({ project, line, force = false }) {
  const file = 'work/recipe-board-v1/projects/' + project + '/design-board.json';
  const abs = path.join(ROOT, file);
  if (fs.existsSync(abs) && !force) return { ok: false, errors: ['design board already exists: ' + file] };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(scaffoldDesignBoard({ project, line }), null, 1) + '\n');
  return { ok: true, errors: [], file };
}
function opt(argv, k, d) { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }
export function main(argv = process.argv.slice(2)) {
  const project = opt(argv, '--project');
  if (!project) { console.error('usage: design-gate.mjs --project <id> [--init --line "..."]'); return 2; }
  if (argv.includes('--init')) { const r = writeScaffold({ project, line: opt(argv, '--line'), force: argv.includes('--force') }); if (!r.ok) { for (const e of r.errors) console.error('DESIGN INIT FAIL: ' + e); return 1; } console.log('DESIGN INIT: ' + r.file); return 0; }
  const file = opt(argv, '--file', 'work/recipe-board-v1/projects/' + project + '/design-board.json');
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) { console.error('DESIGN GATE: no design-board at ' + file); return 1; }
  const board = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const errors = validateDesignBoard(board);
  if (errors.length) { for (const e of errors) console.error('DESIGN GATE FAIL: ' + e); return 1; }
  console.log('DESIGN GATE OK: ' + project + ' / ' + board.directions.length + ' options / selected=' + (board.selected || 'none') + ' / lock=' + (board.lookLock?.status || 'none'));
  return 0;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());