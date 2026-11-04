#!/usr/bin/env node
// Workflow guard: no task, no work; no passed review, no delivery.
//   node scripts/workflow-guard.mjs --project <id> --task <task>
//   node scripts/workflow-guard.mjs --project <id> --task <task> --mode present --review <name>
//   node scripts/workflow-guard.mjs --project <id> --task <task> --kind experiment   (must allowStyleLab)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function scopeErrors(changed, scopes) {
  const list = (scopes || []).map((s) => String(s).replace(/\/$/, ''));
  if (!list.length) return ['task has no writeScopes'];
  return changed.filter((f) => !list.some((s) => f === s || f.startsWith(s + '/')));
}

export function verdictErrors(verdict) {
  if (!verdict) return ['no review verdict'];
  if (verdict.verdict !== 'pass') return ['review verdict=' + verdict.verdict];
  const blocking = (verdict.mustFix || []).filter((m) => (m.severity || 0) >= 3);
  return blocking.length ? [blocking.length + ' blocking must-fix'] : [];
}

export function guardCheck({ root = process.cwd(), project, task, mode = 'check', review = null, kind = null } = {}) {
  const errors = [];
  if (!project || !task) return { ok: false, errors: ['usage: --project <id> --task <task>'] };
  const taskFile = path.join(root, 'work/recipe-board-v1/projects', project, 'tasks', task + '.json');
  if (!fs.existsSync(taskFile)) return { ok: false, errors: ['no task ' + task + ' — 没有任务不许开工'] };
  const t = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  if (kind && kind !== t.kind) errors.push('task kind ' + (t.kind || 'none') + ' is not ' + kind);
  if (t.kind === 'experiment' && !t.allowStyleLab) errors.push('experiment task must set allowStyleLab');
  let changed = [];
  try {
    changed = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean).map((l) => l.slice(3).trim()).filter((f) => !f.endsWith('/'));
  } catch (e) { errors.push('git status failed: ' + String(e.message || e).slice(0, 120)); }
  const baseAt = t.baseAt ? Date.parse(t.baseAt) : 0;
  changed = changed.filter((f) => { try { return fs.statSync(path.join(root, f)).mtimeMs >= baseAt - 2000; } catch { return true; } });
  errors.push(...scopeErrors(changed, t.writeScopes));
  if (mode === 'present') {
    const dp = path.join(root, 'work/recipe-board-v1/projects', project, 'decisions.json');
    if (fs.existsSync(dp)) {
      const dec = JSON.parse(fs.readFileSync(dp, 'utf8'));
      const last = (dec.decisions || []).filter((d) => d.gate === 'design').slice(-1)[0];
      if (last && last.status === 'rejected') errors.push('design gate rejected by user: ' + (last.reason || 'no reason'));
    }
    if (!review) errors.push('present needs --review <name>');
    else {
      const vf = path.join(root, 'work/recipe-board-v1/reviews', review + '.verdict.json');
      errors.push(...(fs.existsSync(vf) ? verdictErrors(JSON.parse(fs.readFileSync(vf, 'utf8'))) : ['no review ' + review + ' — 没有盲审不许交付']));
    }
  }
  return { ok: errors.length === 0, errors, task: t };
}

export function main(argv = process.argv.slice(2)) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const r = guardCheck({ project: opt('--project'), task: opt('--task'), mode: opt('--mode', 'check'), review: opt('--review'), kind: opt('--kind') });
  if (!r.ok) { for (const e of r.errors) console.error('GUARD: ' + e); return 1; }
  console.log('GUARD ok: ' + opt('--project') + '/' + opt('--task') + (opt('--mode') === 'present' ? ' (review ' + opt('--review') + ' passed)' : ''));
  return 0;
}

const self = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (self === import.meta.url) process.exit(main());