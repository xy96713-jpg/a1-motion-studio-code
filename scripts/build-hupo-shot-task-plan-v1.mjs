#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {mediaSha256 as sha} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
const repo = path.resolve(import.meta.dirname, '..'), taskRoot = path.join(repo, 'work/hupo-69-shot-reconstruction-v1');
const source = JSON.parse(fs.readFileSync(path.join(repo, 'work/bv1a63d6ceba-packaging-study-20260923/execution-v3/whole-film-plan.json')));
const locks = JSON.parse(fs.readFileSync(path.join(taskRoot, 'opening-candidate-v1/source-lock.json')));
const font = path.join(repo, 'apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf');
const file = (relative, role, slot) => {const filename = path.join(taskRoot, relative); return {path: filename, sha256: sha(fs.readFileSync(filename)), kind: 'IMAGE', role, slot, referenceOnly: false};};
const presenter = file('presenter-candidate-v1/original-presenter-plate.png', 'original-image', 'presenter');
const market = file('opening-candidate-v1/market-terminal-plate.png', 'original-image', 'market');
const paper = file('shared-assets/paper-strip-blank-v1.png', 'packaging-texture', 'paper');
const makeType = (texts, runs) => ({exactCopy: texts.join(''), copyLock: {status: 'LOCKED', sha256: sha(texts.join(''))}, purpose: 'SOURCE_EXACT',
  canvas: {width: 1920, height: 1080}, fontBindings: [{id: 'source-heavy-candidate', path: font, sha256: sha(fs.readFileSync(font)), postscriptName: 'SourceHanSansCN-Heavy', weight: 900}],
  runs: runs.map((run, i) => ({text: texts[i], fontId: 'source-heavy-candidate', letterSpacing: 0, fill: '#25221f', ...run}))});
const shots = source.sequencePlans.map((sequence) => ({id: sequence.sequenceId, sourceText: sequence.semanticJobDraft || sequence.title,
  visualJob: sequence.semanticJobDraft || sequence.title, sourceInterval: sequence.sourceInterval, overlaps: sequence.overlaps,
  exactCopy: [], tasks: [{module: 'media-files', dependencies: [], blocker: 'SHOT_SOURCE_COPY_AND_ROUTE_REVIEW_REQUIRED', parameters: {}}]}));
for (const id of ['P01', 'P03']) {
  const shot = shots.find((item) => item.id === id), locked = locks.sequences.find((item) => item.id === id);
  const texts = locked.designedCopy.map((item) => item.text);
  shot.exactCopy = texts;
  const duration = shot.sourceInterval.endFrameExclusive - shot.sourceInterval.startFrame;
  const common = {from: 0, durationInFrames: duration};
  const media = id === 'P01' ? [market] : [presenter, paper];
  const layers = [{id: 'base', module: 'media-files', artifactRole: id === 'P01' ? 'market' : 'presenter', x: 0, y: 0, width: 1920, height: 1080, z: 0, fit: 'cover', ...common}];
  if (id === 'P03') for (const [i, rect] of [[250,318,440,170],[1208,360,532,135],[405,700,1105,185]].entries()) layers.push({id: `paper-${i}`, module: 'media-files', artifactRole: 'paper', x: rect[0], y: rect[1], width: rect[2], height: rect[3], z: 1, fit: 'fill', ...common});
  layers.push({id: 'accurate-copy', module: 'editable-typography', artifactRole: 'typography-overlay', x: 0, y: 0, width: 1920, height: 1080, z: 2, ...common});
  const runs = id === 'P01' ? [{x: 380, baselineY: 610, fontSize: 200, fill: '#f6f3eb'}]
    : [{x: 294, baselineY: 431, fontSize: 84}, {x: 1248, baselineY: 450, fontSize: 59}, {x: 458, baselineY: 828, fontSize: 93}];
  shot.tasks = [
    {module: 'media-files', dependencies: [], parameters: {files: media}},
    {module: 'editable-typography', dependencies: [], parameters: makeType(texts, runs)},
    {module: 'remotion-render', dependencies: ['media-files', 'editable-typography'], parameters: {output: 'still', frame: id === 'P01' ? 119 : 179,
      scene: {width: 1920, height: 1080, fps: 60, durationInFrames: duration, layers}}},
  ];
}
const plan = {contract: 'A1ShotTaskPlan/v1', projectId: 'hupo-69-shot-reconstruction-v1', title: '胡泊全片镜头任务', scope: 'RESEARCH_ONLY', productionAdmission: false,
  referenceOnlySha256: [source.source.videoSha256], timeline: source.timeline, source: source.source,
  style: {direction: 'REFERENCE_RECONSTRUCTION', renderPolicy: 'STATIC_REVIEW_BEFORE_MOTION'}, shots};
const output = path.join(taskRoot, 'shot-task-plan-v1.json');
if (fs.existsSync(output) && fs.readFileSync(output, 'utf8') !== JSON.stringify(plan, null, 2) + '\n') throw new Error('existing-plan-revision-requires-targeted-edit');
fs.writeFileSync(output, JSON.stringify(plan, null, 2) + '\n');
console.log(JSON.stringify({plan: output, shots: shots.length, active: ['P01', 'P03'], visualApproval: false}));
