#!/usr/bin/env node
// Validate the tech-stack catalog and each design direction's declared stack.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const CAP = 'work/recipe-board-v1/routing/tech-stack.json';
const STATUS = new Set(['ready', 'installed', 'candidate', 'missing']);

export function catalogErrors(catalog = read(CAP)) {
  const errors = [];
  if (catalog.contract !== 'A1TechStack/v1') errors.push('contract must be A1TechStack/v1');
  const seen = new Set();
  for (const c of catalog.capabilities || []) {
    if (!c.id) errors.push('capability missing id');
    if (seen.has(c.id)) errors.push('duplicate capability: ' + c.id);
    seen.add(c.id);
    if (!STATUS.has(c.status)) errors.push((c.id || '?') + ' invalid status: ' + c.status);
    if (c.status === 'ready') {
      for (const f of c.files || []) if (!fs.existsSync(path.join(ROOT, f))) errors.push(c.id + ' ready file missing: ' + f);
      if (c.tool && !c.files?.length) { /* tool checked at runtime */ }
    }
    if (!c.use?.length) errors.push((c.id || '?') + ' needs use notes');
    if (!c.notFor?.length) errors.push((c.id || '?') + ' needs notFor notes');
  }
  return errors;
}

export function boardTechErrors(board, catalog = read(CAP)) {
  const errors = [];
  const byId = new Map((catalog.capabilities || []).map((c) => [c.id, c]));
  for (const d of board?.directions || []) {
    for (const id of d.techStack || []) {
      const c = byId.get(id);
      if (!c) { errors.push((d.id || '?') + ' unknown techStack: ' + id); continue; }
      if (!['ready', 'installed'].includes(c.status) && !d.techApproval?.[id]) errors.push((d.id || '?') + ' techStack needs approval: ' + id + ' (' + c.status + ')');
    }
  }
  if (board?.contract === 'A1DesignBoard/v2' && board?.selected) {
    const s = (board.directions || []).find((d) => d.id === board.selected);
    if (!s) errors.push('selected id not in directions');
    else if (!Array.isArray(s.techStack) || !s.techStack.length) errors.push('selected direction missing techStack');
  }
  return errors;
}

export function main() {
  const catalog = read(CAP);
  const errors = catalogErrors(catalog);
  const project = process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : null;
  if (project) {
    const board = read('work/recipe-board-v1/projects/' + project + '/design-board.json');
    errors.push(...boardTechErrors(board, catalog));
  }
  if (errors.length) { for (const e of errors) console.error('TECH FAIL: ' + e); return 1; }
  console.log('TECH OK: ' + catalog.capabilities.length + ' capabilities' + (project ? ' / ' + project : ''));
  return 0;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());
