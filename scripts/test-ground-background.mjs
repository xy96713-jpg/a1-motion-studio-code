import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { groundTintErrors } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ground-background-'));
let rows;
try {
  const r = spawnSync('python3', [path.join(root, 'scripts/test-ground-background-fixtures.py'), root, tmp], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  rows = JSON.parse(r.stdout);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const errors = row => groundTintErrors([row], [{ beat: 'B03', ground: '#1c1c1c' }], ['B03']);
for (const name of ['real-B03', 'neutral-content', 'neutral-grain', 'neutral-gradient']) {
  test(`ground background: ${name} excludes localized coloured content`, () => {
    assert.deepEqual(errors(rows[name]), []);
    assert.equal(rows[name].rim, '#1c1c1c');
    assert.equal(rows[name].rimEstimate.status, 'measured');
  });
}
for (const name of ['tinted-content', 'tinted-grain']) {
  test(`ground background: ${name} retains real tint hard rejection`, () => {
    assert.match(errors(rows[name]).join(), /its ground renders/);
    assert.equal(rows[name].rim, '#2a1d1e');
    assert.equal(rows[name].rimEstimate.status, 'measured');
  });
}
for (const name of ['ambiguous', 'nonflat-texture']) {
  test(`ground background: ${name} explicitly unknown, never a neutral estimate`, () => {
    assert.equal(rows[name].rim, null);
    assert.equal(rows[name].rimEstimate.status, 'unknown');
    assert.ok(rows[name].rimEstimate.reason);
  });
}
console.log(JSON.stringify({ groundBackgroundEvidence: rows }));
