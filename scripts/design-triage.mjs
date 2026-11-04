#!/usr/bin/env node
// Reproduction triage: choose a build stack per design direction, before any shot is built.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const opt = (argv, k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

export function triageDirection(d, policy) {
  const t = d.triage || {};
  const role = d.role || 'unspecified';
  const ai = policy.aiVideo || {};
  const evidence = !!t.evidence || role === 'optional-evidence' || role === 'evidence';
  const text = !!t.text || role === 'type' || role === 'data';
  const complexity = Number(t.complexity || 3);
  const tooHard = !!t.tooHard;
  const aiRoleAllowed = (ai.allowedForRoles || []).includes(role) && !(ai.forbiddenForRoles || []).includes(role);
  const aiCandidate = !evidence && !text && aiRoleAllowed && Number(t.durationSec || 5) <= (ai.maxDurationSec || 5) && (tooHard || (!!t.organicRandom && complexity >= 4));
  let verdict = 'test';
  let reason = '';
  if (evidence) {
    verdict = t.assetReady ? 'real' : 'drop';
    reason = t.assetReady ? 'evidence with real assets: real footage/archival only' : 'evidence without real assets: do not fake it; drop or go find the asset';
  } else if (text) {
    verdict = 'graphic';
    reason = 'readable type/data must be code/layout, never generated';
  } else if (d.build === 'real') {
    verdict = 'real';
    reason = 'real asset required by build';
  } else if (tooHard && aiCandidate) {
    verdict = 'ai-video';
    reason = 'art shot too hard to reproduce; AI video fallback allowed after user approval';
  } else if (d.build === '3d' || t.consistentWorld || t.camera || t.contactShadow || t.exactGeometry) {
    verdict = '3d';
    reason = 'needs consistent world/camera/contact shadows; build in Blender/Three.js';
  } else if (d.build === 'procedural') {
    verdict = 'procedural';
    reason = 'procedural/diagram build';
  } else if (d.build === 'graphic') {
    verdict = 'graphic';
    reason = 'graphic/code build';
  } else {
    verdict = 'test';
    reason = 'insufficient evidence; screen test first';
  }
  const stack = verdict === 'real' ? ['real-assets'] : verdict === 'graphic' ? ['dom-css', 'svg-canvas', 'ffmpeg'] : verdict === 'ai-video' ? ['ai-video'] : verdict === '3d' ? ['webgl-three', 'blender', 'ffmpeg'] : [];
  return {
    id: d.id,
    stack,
    thesis: d.thesis,
    role,
    verdict,
    reason,
    aiCandidate,
    aiFallback: aiCandidate && verdict !== 'ai-video' ? 'ai-video' : null,
    fidelity: verdict === 'real' ? 'high' : verdict === '3d' ? (complexity >= 4 ? 'medium-high' : 'high') : verdict === 'graphic' ? 'high' : verdict === 'ai-video' ? 'medium' : 'low',
    complexity,
    needs: t.needs || d.reproduction?.needs || [],
    assetReady: !!t.assetReady,
    evidence,
    text,
    tooHard,
  };
}

export function triageBoard(board, policy) {
  return {
    contract: 'A1ReproductionTriage/v1',
    project: board.project,
    generatedAt: new Date().toISOString(),
    policy: 'work/recipe-board-v1/routing/media-policy.json',
    directions: (board.directions || []).map((d) => triageDirection(d, policy)),
    rule: 'evidence -> real only; text/data -> code; world/camera/contact shadows -> 3D; art too hard -> ai-video only with user approval; low fidelity -> drop',
  };
}

export function main(argv = process.argv.slice(2)) {
  const project = opt(argv, '--project');
  if (!project) { console.error('usage: design-triage.mjs --project <id> [--out path]'); return 2; }
  const board = read('work/recipe-board-v1/projects/' + project + '/design-board.json');
  const policy = read('work/recipe-board-v1/routing/media-policy.json');
  const report = triageBoard(board, policy);
  const out = opt(argv, '--out', 'work/recipe-board-v1/projects/' + project + '/out/design-triage.json');
  const abs = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(report, null, 1) + '\n');
  const md = ['# Design triage — ' + project, '', '| id | role | verdict | fallback | why |', '|---|---|---|---|---|', ...report.directions.map((d) => '| ' + d.id + ' | ' + d.role + ' | **' + d.verdict + '** | ' + (d.aiFallback || '—') + ' | ' + d.reason + ' |')].join('\n');
  fs.writeFileSync(abs.replace(/\.json$/, '.md'), md + '\n');
  console.log('TRIAGE: ' + out);
  for (const d of report.directions) console.log(d.id, d.role, '->', d.verdict, d.aiFallback ? '(fallback ' + d.aiFallback + ')' : '');
  return 0;
}
if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) process.exit(main());
