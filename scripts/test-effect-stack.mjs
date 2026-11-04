import assert from 'node:assert/strict';
import { effectCatalogErrors, boardEffectErrors } from './effect-check.mjs';
import fs from 'node:fs';
const catalog = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/effects.json','utf8'));
const board = JSON.parse(fs.readFileSync('work/recipe-board-v1/projects/banana-design/design-board.json','utf8'));
assert.deepEqual(effectCatalogErrors(catalog), []);
assert.deepEqual(boardEffectErrors(board, catalog), []);
const canaries = JSON.parse(fs.readFileSync('work/recipe-board-v1/projects/banana-design/canaries/manifest.json','utf8'));
assert.equal(canaries.contract, 'A1EffectCanary/v1');
for (const c of canaries.canaries) { assert.ok(fs.existsSync(c.video), 'canary video missing: ' + c.video); assert.ok(c.effects.length > 0); }
assert.ok(catalog.effects.some((e) => e.id === 'camera-parallax' && e.status === 'ready'));
assert.ok(catalog.effects.some((e) => e.id === 'gpu-particles' && e.status === 'candidate'));
assert.ok(catalog.effects.some((e) => e.id === 'houdini-sim' && e.status === 'missing'));
console.log('effect stack tests pass');
