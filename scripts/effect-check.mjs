#!/usr/bin/env node
// Validate the effect catalog and each design direction's declared effects.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const CAP = 'work/recipe-board-v1/routing/effects.json';
const STATUS = new Set(['ready', 'installed', 'candidate', 'missing']);

export function effectCatalogErrors(catalog = read(CAP)) {
  const errors = [];
  if (catalog.contract !== 'A1EffectCatalog/v1') errors.push('contract must be A1EffectCatalog/v1');
  const seen = new Set();
  for (const e of catalog.effects || []) {
    if (!e.id) errors.push('effect missing id');
    if (seen.has(e.id)) errors.push('duplicate effect: ' + e.id);
    seen.add(e.id);
    if (!STATUS.has(e.status)) errors.push((e.id || '?') + ' invalid status: ' + e.status);
    if (!e.storyJob) errors.push((e.id || '?') + ' needs storyJob');
    if (!e.useWhen?.length) errors.push((e.id || '?') + ' needs useWhen');
    if (!e.avoidWhen?.length) errors.push((e.id || '?') + ' needs avoidWhen');
    if (!e.canary) errors.push((e.id || '?') + ' needs canary');
    if (e.status === 'ready') for (const f of e.code || []) if (!fs.existsSync(path.join(ROOT, f))) errors.push(e.id + ' ready code missing: ' + f);
    if (e.canaryVideo && !fs.existsSync(path.join(ROOT, e.canaryVideo))) errors.push(e.id + ' canary video missing: ' + e.canaryVideo);
  }
  return errors;
}

export function boardEffectErrors(board, catalog = read(CAP)) {
  const errors = [];
  const byId = new Map((catalog.effects || []).map((e) => [e.id, e]));
  for (const d of board?.directions || []) {
    for (const id of d.effects || []) {
      const e = byId.get(id);
      if (!e) { errors.push((d.id || '?') + ' unknown effect: ' + id); continue; }
      if (e.status === 'missing') errors.push((d.id || '?') + ' missing effect: ' + id);
      if (e.status === 'candidate' && !d.effectApproval?.[id]) errors.push((d.id || '?') + ' candidate effect needs canary approval: ' + id);
    }
  }
  if (board?.contract === 'A1DesignBoard/v2' && board?.selected) {
    const s = (board.directions || []).find((d) => d.id === board.selected);
    if (!s) errors.push('selected id not in directions');
    else if (!Array.isArray(s.effects) || !s.effects.length) errors.push('selected direction missing effects');
  }
  return errors;
}

export function main() {
  const catalog = read(CAP);
  const errors = effectCatalogErrors(catalog);
  const project = process.argv.includes('--project') ? process.argv[process.argv.indexOf('--project') + 1] : null;
  if (project) {
    const board = read('work/recipe-board-v1/projects/' + project + '/design-board.json');
    errors.push(...boardEffectErrors(board, catalog));
  }
  if (errors.length) { for (const e of errors) console.error('EFFECT FAIL: ' + e); return 1; }
  console.log('EFFECT OK: ' + catalog.effects.length + ' effects' + (project ? ' / ' + project : ''));
  return 0;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());
