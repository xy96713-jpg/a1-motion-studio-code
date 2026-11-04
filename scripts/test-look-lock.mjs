import assert from 'node:assert/strict';
import { compareFiles } from './look-lock-check.mjs';
const r = compareFiles('work/recipe-board-v1/style-lab/banana-3d/b01-key-lineup.png', 'work/recipe-board-v1/style-lab/banana-3d/b01-key-lineup.png', { minSsim: 0.99 });
assert.equal(r.ok, true);
assert.ok(r.ssim > 0.99);
const bad = compareFiles('work/recipe-board-v1/style-lab/banana-3d/b01-key-lineup.png', 'work/recipe-board-v1/style-lab/banana-3d/k3-flat-3d-alpha2.png', { minSsim: 0.99 });
assert.equal(bad.ok, false);
assert.ok(bad.ssim < 0.99);
console.log('look-lock check tests pass');
