#!/usr/bin/env node
// Generic packaging audit: any text must have beats, visual landings, technical routes and seams.
import fs from 'node:fs';
import path from 'node:path';
import { validateDesignBoard } from './design-gate.mjs';

const ROOT = process.cwd();
const PLAY = 'work/recipe-board-v1/routing/packaging-workflow.json';
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const nonEmpty = (v) => Array.isArray(v) ? v.length > 0 : has(v);

export function auditPlan(plan) {
  const errors = [];
  if (!plan || plan.contract !== 'A1DirectorPlan/v1') errors.push('plan contract must be A1DirectorPlan/v1');
  const beats = plan?.beats || [];
  if (beats.length < 1) errors.push('plan needs at least one beat');
  const needs = ['intent', 'duration'];
  beats.forEach((b, i) => {
    const id = b.id || 'beat#' + (i + 1);
    for (const k of needs) if (!has(b[k])) errors.push(id + ': missing ' + k);
    if (!has(b.text) && !has(b.onScreen?.headline)) errors.push(id + ': no text or onScreen.headline');
    if (!has(b.route?.primaryModule)) errors.push(id + ': missing route.primaryModule');
    if (!nonEmpty(b.route?.chain)) errors.push(id + ': missing route.chain (technical route)');
    if (!b.design?.camera || !has(b.design.camera.move)) errors.push(id + ': missing design.camera.move');
    if (!has(b.design?.in)) errors.push(id + ': missing design.in');
    if (!has(b.design?.out)) errors.push(id + ': missing design.out');
    if (!nonEmpty(b.design?.hero) && !nonEmpty(b.design?.evidence) && !has(b.onScreen?.headline)) errors.push(id + ': no visual landing (hero/evidence/headline)');
  });
  for (let i = 0; i < beats.length - 1; i++) {
    const a = beats[i], b = beats[i + 1];
    if (!has(a.design?.out)) errors.push((a.id || 'beat#' + (i + 1)) + ': seam out missing');
    if (!has(b.design?.in)) errors.push((b.id || 'beat#' + (i + 2)) + ': seam in missing');
  }
  return errors;
}

export function auditProject(projectId, { root = ROOT } = {}) {
  const errors = [];
  const dir = path.join(root, 'work/recipe-board-v1/projects', projectId);
  const planPath = path.join(dir, 'plan.json');
  const boardPath = path.join(dir, 'design-board.json');
  if (!fs.existsSync(planPath)) errors.push('missing plan.json');
  if (fs.existsSync(planPath)) {
    try { errors.push(...auditPlan(JSON.parse(fs.readFileSync(planPath, 'utf8')))); }
    catch (e) { errors.push('cannot read plan: ' + String(e.message || e).slice(0, 120)); }
  }
  if (fs.existsSync(boardPath)) {
    try { errors.push(...validateDesignBoard(JSON.parse(fs.readFileSync(boardPath, 'utf8'))).map((e) => 'design-board: ' + e)); }
    catch (e) { errors.push('cannot read design-board: ' + String(e.message || e).slice(0, 120)); }
  } else errors.push('missing design-board.json');
  return { project: projectId, ok: errors.length === 0, errors };
}

export function main(argv = process.argv.slice(2)) {
  const id = argv[argv.indexOf('--project') + 1] || 'banana-design';
  const r = auditProject(id);
  if (argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else if (r.ok) console.log('PACKAGING AUDIT OK: ' + id);
  else for (const e of r.errors) console.error('PACKAGING AUDIT FAIL: ' + e);
  return r.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());
