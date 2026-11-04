import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const run = name => spawnSync(process.execPath, ['scripts/reproof-blender-chapter.mjs'], {cwd:process.cwd(), env:{...process.env, BLENDER_PROOF_ROOT:name}, encoding:'utf8', timeout:15000});
const dir = path.resolve('work/blender-rigid-reproof-test-' + randomBytes(8).toString('hex'));
mkdirSync(dir);
try {
  const r=run(path.basename(dir)); assert.notEqual(r.status,0); assert.match(r.stderr,/proof output directory already exists/);
  const bad=run('../blender-production-proof-20261031'); assert.notEqual(bad.status,0); assert.match(bad.stderr,/BLENDER_PROOF_ROOT must/);
} finally { rmSync(dir,{recursive:true}); }
console.log('proof refuses existing and unsafe directories');
