#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { guardCheck } from './workflow-guard.mjs';
import { validateDesignBoard } from './design-gate.mjs';
import { auditProject } from './packaging-audit.mjs';
import { compareFiles } from './look-lock-check.mjs';

const ROOT = process.cwd();
const CFG = 'work/recipe-board-v1/routing/mainline.json';
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const exists = (p) => fs.existsSync(path.join(ROOT, p));
export function loadMainline() { return readJson(CFG); }
export function loadProject(id) { const p = 'work/recipe-board-v1/projects/' + id + '/project.json'; return exists(p) ? readJson(p) : null; }
export function loadDecisions(id) { const p = 'work/recipe-board-v1/projects/' + id + '/decisions.json'; return exists(p) ? readJson(p) : { contract: 'A1ProjectDecision/v1', project: id, decisions: [] }; }

export function effectiveGate(project, decisions, gate) {
  const list = (decisions?.decisions || []).filter((d) => d.gate === gate);
  const last = list[list.length - 1];
  if (last) return { status: last.status, by: last.by, at: last.at, reason: last.reason, source: 'decision' };
  if (gate === 'design') { const d = project?.design; return d?.approved ? { status: 'approved', by: d.by, at: d.at, source: 'project' } : { status: 'pending', source: 'project' }; }
  return { status: 'pending', source: 'none' };
}

export function mainlineStatus(id) {
  const cfg = loadMainline(); const project = loadProject(id); const decisions = loadDecisions(id); const entry = cfg.projects?.[id] || {};
  const gate = effectiveGate(project, decisions, 'design'); const errors = [];
  for (const a of cfg.authorities || []) if (!exists(a.path)) errors.push('missing authority ' + a.path);
  if (!project) errors.push('missing project ' + id);
  if (entry.authoritativeShotDoc && !exists(entry.authoritativeShotDoc)) errors.push('missing authoritative shot doc ' + entry.authoritativeShotDoc);
  if (entry.designBoard && !exists(entry.designBoard)) errors.push('missing design board ' + entry.designBoard);
  let boardErrors = [];
  if (entry.designBoard && exists(entry.designBoard)) {
    try { boardErrors = validateDesignBoard(readJson(entry.designBoard)); }
    catch (e) { boardErrors = ['cannot read design board: ' + String(e.message || e).slice(0, 160)]; }
  }
  for (const e of boardErrors) errors.push('design board: ' + e);
  if (gate.status === 'rejected') errors.push('design gate rejected: ' + (gate.reason || 'no reason'));
  return { project: id, phase: entry.phase || 'unknown', next: entry.next || null, gate, designBoard: { path: entry.designBoard || null, exists: !!(entry.designBoard && exists(entry.designBoard)), errors: boardErrors }, entry, errors };
}

export function mainlineCheck(id) {
  const s = mainlineStatus(id); const errors = [...s.errors];
  if (s.entry.designGate && s.gate.status !== s.entry.designGate) errors.push('design gate mismatch: config=' + s.entry.designGate + ' effective=' + s.gate.status);
  for (const d of s.entry.deprecatedShotDocs || []) if (!exists(d)) errors.push('missing deprecated doc ' + d);
  return { ...s, errors };
}

export function release({ id, task, review }) {
  const g = guardCheck({ root: ROOT, project: id, task, mode: 'present', review });
  const m = mainlineCheck(id); const a = auditProject(id); const errors = [...g.errors, ...m.errors, ...a.errors];
  const boardPath = m.entry?.designBoard;
  if (boardPath && exists(boardPath)) {
    try {
      const ev = readJson(boardPath)?.lookLock?.evidence || {};
      if (ev.lockedFrame || ev.renderFrame) {
        const c = compareFiles(path.join(ROOT, ev.lockedFrame || ''), path.join(ROOT, ev.renderFrame || ''), { minSsim: 0.55 });
        for (const e of c.errors) errors.push('look-lock compare: ' + e);
      }
    } catch (e) { errors.push('look-lock compare: ' + String(e.message || e).slice(0, 120)); }
  }
  return { ok: errors.length === 0, errors, guard: g, mainline: m };
}

export function decide({ id, gate, status, by, reason }) {
  const errors = [];
  if (!id || !gate || !status) errors.push('usage: decide --project <id> --gate design --status approved|rejected|pending --by <words>');
  if (!['approved', 'rejected', 'pending'].includes(status)) errors.push('status must be approved | rejected | pending');
  if ((status === 'approved' || status === 'rejected') && !by) errors.push('by is required for approved/rejected');
  const cfg = loadMainline(); const entry = cfg.projects?.[id];
  if (!entry) errors.push('project not in mainline.json: ' + id);
  if (status === 'approved' && gate === 'design') {
    if (!entry?.designBoard) errors.push('no designBoard configured');
    else if (!exists(entry.designBoard)) errors.push('cannot approve: missing design board ' + entry.designBoard);
    else { const e2 = validateDesignBoard(readJson(entry.designBoard)); for (const x of e2) errors.push('cannot approve: design board: ' + x); }
  }
  if (errors.length) return { ok: false, errors };
  const f = 'work/recipe-board-v1/projects/' + id + '/decisions.json';
  const dec = exists(f) ? readJson(f) : { contract: 'A1ProjectDecision/v1', project: id, decisions: [] };
  dec.decisions = (dec.decisions || []).filter((d) => d.gate !== gate);
  dec.decisions.push({ gate, status, at: new Date().toISOString(), by: by || 'system', reason: reason || '' });
  fs.writeFileSync(path.join(ROOT, f), JSON.stringify(dec, null, 1) + '\n');
  if (cfg.projects?.[id]) { cfg.projects[id].designGate = status; fs.writeFileSync(path.join(ROOT, CFG), JSON.stringify(cfg, null, 1) + '\n'); }
  fs.writeFileSync(path.join(ROOT, 'work/recipe-board-v1/MAINLINE.md'), renderDocs());
  return { ok: true, errors: [], decision: dec.decisions[dec.decisions.length - 1] };
}

export function renderDocs() {
  const cfg = loadMainline();
  const out = ['# MAINLINE（由 routing/mainline.json 生成）','', '> 不要手改；改 routing/mainline.json，再跑 node scripts/mainline.mjs docs。','', '## 权威文档',''];
  for (const a of cfg.authorities) out.push('- ' + a.path + ' — ' + a.role);
  out.push('', '## 已废弃','');
  for (const d of cfg.deprecated || []) out.push('- ' + d.path + ' — 被 ' + d.supersededBy + ' 取代：' + d.reason);
  out.push('', '## 阶段','');
  for (const s of cfg.stages || []) out.push('- ' + s.id + ' — ' + s.label);
  out.push('', '## 项目','');
  for (const [id, p] of Object.entries(cfg.projects || {})) out.push('- ' + id + ' — phase=' + p.phase + ', next=' + p.next + ', design=' + p.designGate + ', board=' + (p.designBoard || 'none') + '；' + (p.note || ''));
  out.push('', '## 命令','', '- node scripts/mainline.mjs status --project <id>', '- node scripts/mainline.mjs check --project <id>', '- node scripts/mainline.mjs release --project <id> --task <task> --review <name>', '- node scripts/design-gate.mjs --project <id>', '- node scripts/packaging-status.mjs --project <id>', '- node scripts/mainline.mjs decide --project <id> --gate design --status approved|rejected --by <words> --reason <why>', '- node scripts/mainline.mjs audit', '- node scripts/mainline.mjs docs', '');
  return out.join('\n');
}

export function mainlineAudit() {
  const cfg = loadMainline(); const errors = [];
  for (const a of cfg.authorities || []) if (!exists(a.path)) errors.push('missing authority ' + a.path);
  for (const d of cfg.deprecated || []) if (!exists(d.path)) errors.push('missing deprecated ' + d.path);
  const idx = 'work/recipe-board-v1/MAINLINE.md';
  if (exists(idx)) {
    const txt = fs.readFileSync(path.join(ROOT, idx), 'utf8');
    for (const a of cfg.authorities || []) if (a.path !== idx && !txt.includes(a.path)) errors.push('index missing authority ' + a.path);
    for (const d of cfg.deprecated || []) if (!txt.includes(d.path)) errors.push('index missing deprecated ' + d.path);
  }
  return { ok: errors.length === 0, errors };
}

function opt(argv, k, d) { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; }
export function main(argv = process.argv.slice(2)) {
  const cmd = argv[0]; const id = opt(argv, '--project', 'banana-design');
  if (cmd === 'status') { console.log(JSON.stringify(mainlineStatus(id), null, 1)); return mainlineStatus(id).errors.length ? 1 : 0; }
  if (cmd === 'check') { const r = mainlineCheck(id); console.log(JSON.stringify(r, null, 1)); return r.errors.length ? 1 : 0; }
  if (cmd === 'docs') { fs.writeFileSync(path.join(ROOT, 'work/recipe-board-v1/MAINLINE.md'), renderDocs()); console.log('MAINLINE.md written'); return 0; }
  if (cmd === 'decide') {
    const r = decide({ id, gate: opt(argv, '--gate', 'design'), status: opt(argv, '--status'), by: opt(argv, '--by'), reason: opt(argv, '--reason') });
    if (!r.ok) { for (const e of r.errors) console.error('DECIDE FAIL: ' + e); return 1; }
    console.log('DECIDED: ' + id + ' ' + opt(argv, '--gate', 'design') + '=' + opt(argv, '--status')); return 0;
  }
  if (cmd === 'release') {
    const r = release({ id, task: opt(argv, '--task'), review: opt(argv, '--review') });
    if (!r.ok) { for (const e of r.errors) console.error('RELEASE FAIL: ' + e); return 1; }
    console.log('RELEASE OK: ' + id + ' / ' + opt(argv, '--task') + ' / review ' + opt(argv, '--review')); return 0;
  }
  if (cmd === 'audit') { const r = mainlineAudit(); if (!r.ok) { for (const e of r.errors) console.error('AUDIT FAIL: ' + e); return 1; } console.log('AUDIT OK: authorities/deprecated/index consistent'); return 0; }
  console.error('usage: mainline.mjs status|check|release|decide|audit|docs ...'); return 2;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());
