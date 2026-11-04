#!/usr/bin/env node
// One glance at the packaging loop: what passed, what is missing, what to do next.
import fs from 'node:fs';
import path from 'node:path';
import { auditPlan } from './packaging-audit.mjs';
import { validateDesignBoard } from './design-gate.mjs';
import { compareFiles } from './look-lock-check.mjs';

const ROOT = process.cwd();
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return null; } };
const exists = (p) => fs.existsSync(path.join(ROOT, p));

export function projectStatus(id) {
  const base = 'work/recipe-board-v1/projects/' + id;
  const project = readJson(base + '/project.json');
  const brief = readJson(base + '/brief.json');
  const plan = readJson(base + '/plan.json');
  const board = readJson(base + '/design-board.json');
  const options = readJson(base + '/design-options.json');
  const decisions = readJson(base + '/decisions.json');
  const stages = [];
  const add = (id, label, ok, errors, next) => stages.push({ id, label, ok, errors: errors || [], next: ok ? null : next });

  add('project', '项目', !!project, project ? [] : ['missing project.json'], '创建 project.json');
  add('intake', '文本/事实', !!brief && !!plan?.beats?.length, brief && plan?.beats?.length ? [] : ['missing brief or plan beats'], '先写 brief/plan');
  const planErrors = plan ? auditPlan(plan) : ['missing plan.json'];
  add('editorial', '逐拍视觉问题', planErrors.length === 0, planErrors, '补每拍 intent/视觉落点/技术路由/camera/in-out');
  const optErrors = options ? (options.options?.length >= 6 ? [] : ['need at least 6 options']) : ['missing design-options.json'];
  add('design-options', '≥6 设计选项', optErrors.length === 0, optErrors, '跑 node scripts/design-options.mjs --brief <brief> --out design-options.json');
  const boardErrors = board ? validateDesignBoard(board) : ['missing design-board.json'];
  add('design-board', '设计板/锁定', boardErrors.length === 0, boardErrors, '填 6 方向；用户选定；写 lookLock 七项/证据');
  const lock = board?.lookLock;
  const lockErrors = [];
  const lockOk = !!(board?.selected && lock?.status === 'locked' && lock?.delivery === 'no-different-delivery');
  if (!lockOk) lockErrors.push('selected/lookLock missing or not locked');
  if (lock?.evidence?.lockedFrame || lock?.evidence?.renderFrame) {
    const c = compareFiles(lock.evidence.lockedFrame, lock.evidence.renderFrame, { minSsim: 0.55 });
    if (!c.ok) lockErrors.push(...c.errors);
  } else if (lockOk) lockErrors.push('lookLock evidence files missing (lockedFrame/renderFrame)');
  add('look-lock', '用户锁图', lockErrors.length === 0, lockErrors, '用户挑一版，写 lookLock + lockedFrame/renderFrame');
  add('previz', '灰盒/运动合同', !!(plan?.beats?.length && plan.beats.every((b) => b.design?.camera && b.design?.in && b.design?.out)), [], '补 camera/in/out；灰盒过运动合同');
  const modules = new Set((plan?.beats || []).map((b) => b.route?.primaryModule).filter(Boolean));
  const routeErrors = [];
  (plan?.beats || []).forEach((b) => { const id = b.id || 'beat'; if (!b.route?.primaryModule) routeErrors.push(id + ': no primaryModule'); if (!(b.route?.chain || []).length) routeErrors.push(id + ': no route.chain'); });
  if (modules.size < 2) routeErrors.push('need at least 2 technical routes across the film');
  add('build', '技术路由', routeErrors.length === 0, routeErrors, '按镜头选 3d/real/procedural/graphic，并写 route.chain');
  add('delivery', '交付门', false, ['requires design-gate + packaging-audit + release review'], '过 design-gate + packaging-audit，再 release');
  const next = stages.find((s) => !s.ok);
  return { project: id, ok: stages.every((s) => s.ok), next: next ? { stage: next.id, action: next.next, errors: next.errors } : null, stages };
}

export function main(argv = process.argv.slice(2)) {
  const id = argv[argv.indexOf('--project') + 1] || 'banana-design';
  const s = projectStatus(id);
  if (argv.includes('--json')) console.log(JSON.stringify(s, null, 1));
  else {
    console.log('PACKAGING STATUS: ' + id);
    for (const x of s.stages) console.log((x.ok ? 'PASS ' : 'BLOCK') + '  ' + x.label + (x.ok ? '' : ' — ' + (x.errors[0] || '')));
    console.log(s.next ? 'NEXT: ' + s.next.stage + ' — ' + s.next.action : 'STATUS: ready for review');
  }
  return s.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());