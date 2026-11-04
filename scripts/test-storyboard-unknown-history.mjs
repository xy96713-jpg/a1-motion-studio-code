import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsRewrite } from '../apps/studio-next/src/lib/recipe-board/storyboard.mjs';

const evidence = [{kind:'person',what:'A',form:'photo'},{kind:'event',what:'B',form:'video'}];
const scenes = [{card:'footage-plate',at:0,visual:'first',evidence:0},{card:'footage-plate',at:2,visual:'second',evidence:1}];
const design = {card:'footage-plate',evidence,scenes};
const shot = {recipe:'footage-plate',scenes:[{slots:{}},{slots:{}}],design:{evidence}};
const oldScenes = scenes.map(s => ({...s,recipe:s.card}));
test('unknown historical scene mapping cannot establish a swap is applied', () => {
  const changed = structuredClone(design);
  [changed.scenes[0].evidence,changed.scenes[1].evidence] = [1,0];
  assert.equal(needsRewrite(shot,changed),true);
});
for (const field of ['visual','at']) test(`changed scene ${field} requires rewrite`, () => {
  const changed = structuredClone(design);
  changed.scenes[1][field] = field === 'at' ? 3 : 'different picture';
  assert.equal(needsRewrite(shot,changed,oldScenes),true);
});
test('new evidence is not presumed applied when old evidence is unknown', () => {
  assert.equal(needsRewrite({recipe:'footage-plate'}, {card:'footage-plate',evidence:[evidence[0]]}),true);
});
