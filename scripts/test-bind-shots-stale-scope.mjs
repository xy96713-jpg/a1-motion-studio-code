import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { bindShots, changedNeeds, needPrint, retireChangedNeeds } from '../apps/studio-next/src/lib/recipe-board/materials.mjs';

const root = fs.mkdtempSync(path.join(process.env.TMPDIR, 'bind-stale-'));
const id = 'fixture', cfg = { dataDir: root, sourceRoot: root, repoRoot: root };
const project = path.join(root, 'projects', id), dir = path.join(project, 'materials'), shots = path.join(project, 'shots');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(shots);
const put = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
const material = name => path.join(dir, name), shot = name => path.join(shots, name + '.json');
try {
 put(path.join(project, 'project.json'), { id }); put(path.join(project, 'storyboard.json'), { shots: [] });
 const old = { shotId: 'B01', kind: 'news', original: 'old', bind: 'picture' };
 const current = { ...old, original: 'new' }, valid = { shotId: 'B02', kind: 'news', form: 'photo', original: 'valid', bind: 'picture' };
 const scene = { shotId: 'B03', kind: 'news', original: 'scene', scene: 1, bind: 'picture' };
 const oldScene = { ...scene, scene: 2, original: 'previous' }, newScene = { ...oldScene, original: 'changed' };
 const binding = n => ({ kind: 'image', file: path.join(root, n.shotId + (n.scene || '') + '.jpg'), credit: 'fixture', needPrint: needPrint(n) });
 for (const n of [old, valid, scene, oldScene]) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=64x64', '-frames:v', '1', binding(n).file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
 }
 put(material('needs.json'), { needs: [current, valid, scene, newScene] });
 put(material('bindings.json'), { shots: { B01: binding(old), B02: binding(valid), 'B03~1': binding(scene), 'B03~2': binding(oldScene) } });
 put(material('approvals.json'), { batches: [{ items: [old, valid, scene, oldScene].map(n => ({ shotId: n.shotId + (n.scene ? '~' + n.scene : ''), status: 'fetched', needPrint: needPrint(n) })) }] });
 put(shot('B01'), { recipe: 'card', slots: { picture: { asset: 'historical.jpg' } } });
 put(shot('B02'), { recipe: 'card', slots: { picture: { gen: 'placeholder' } } });
 put(shot('B03'), { recipe: 'card', slots: { picture: { gen: 'still' } }, scenes: [{ slots: { picture: { gen: 'scene0' } } }, { slots: { picture: { gen: 'scene1' } } }, { slots: { picture: { asset: 'historical-scene2.jpg' } } }] });
 const before = Object.fromEntries([shot('B01'), shot('B03'), material('bindings.json'), material('approvals.json')].map(f => [f, fs.readFileSync(f)]));
 assert.deepEqual(new Set(changedNeeds(cfg, id)), new Set(['B01', 'B03~2']));
 const logs = []; bindShots(cfg, id, { only: new Set(['B01', 'B02']), log: x => logs.push(x) });
 assert.deepEqual(fs.readFileSync(shot('B01')), before[shot('B01')], 'stale B01 must not change');
 assert.equal(JSON.parse(fs.readFileSync(shot('B02'))).slots.picture.asset, 'B02.jpg', 'valid legacy form binds');
 for (const f of [shot('B03'), material('bindings.json'), material('approvals.json')]) assert.deepEqual(fs.readFileSync(f), before[f]);
 assert.ok(logs.some(x => x.includes('B01') && /stale|changed/i.test(x)));
 const b02 = fs.readFileSync(shot('B02')); bindShots(cfg, id, { only: new Set(['B01', 'B02']) }); assert.deepEqual(fs.readFileSync(shot('B02')), b02);
 bindShots(cfg, id, { only: new Set(['B03']) });
 const s = JSON.parse(fs.readFileSync(shot('B03'))), original = JSON.parse(before[shot('B03')]);
 assert.equal(s.scenes[1].slots.picture.asset, 'B031.jpg');
 assert.deepEqual(s.scenes[2], original.scenes[2]); assert.deepEqual(s.scenes[0], original.scenes[0]); assert.deepEqual(s.slots, original.slots);
 const b03 = fs.readFileSync(shot('B03')); bindShots(cfg, id, { only: new Set(['B03']) }); assert.deepEqual(fs.readFileSync(shot('B03')), b03);
 assert.throws(() => retireChangedNeeds(cfg, id), /disabled|blocked/i);
 for (const f of [material('bindings.json'), material('approvals.json')]) assert.deepEqual(fs.readFileSync(f), before[f]);
 console.log('bindShots stale key, scene, only and history verified');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
