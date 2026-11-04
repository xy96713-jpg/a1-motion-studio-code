import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'partset-security-'));
try {
  const base = path.join(temp, 'work/recipe-board-v1'), blender = path.join(base, 'style-lab/engine/blender'), parts = path.join(base, 'style-lab/engine/subjects/parts'), project = path.join(base, 'projects/fixture'), materials = path.join(project, 'materials');
  for (const p of [blender, parts, materials]) fs.mkdirSync(p, { recursive: true });
  fs.copyFileSync(path.join(repo, 'work/recipe-board-v1/style-lab/engine/blender/partset.mjs'), path.join(blender, 'partset.mjs'));
  fs.writeFileSync(path.join(blender, 'ref.mjs'), "export function generateRef(){throw Error('unexpected generation')}\n");
  fs.writeFileSync(path.join(blender, 'asset_review.mjs'), "export const viewHashes=()=>({}), reviewValid=()=>false, writeReviewTask=()=>{}, readJson=()=>null, assetReviewStatus=()=>false;\n");
  const sentinel = path.join(temp, 'outside.png'); fs.writeFileSync(sentinel, 'fixture-only-sentinel');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(path.join(materials, 'front.png'), image);
  fs.writeFileSync(path.join(materials, 'back.png'), image);
  fs.mkdirSync(path.join(materials, 'nested'));
  fs.copyFileSync(path.join(materials, 'back.png'), path.join(materials, 'nested/back.png'));
  fs.symlinkSync('front.png', path.join(materials, 'internal.png'));
  fs.symlinkSync(sentinel, path.join(materials, 'escape.png'));
  const manifest = path.join(materials, 'views.json');
  function run(name, views) {
    fs.writeFileSync(manifest, JSON.stringify(views));
    return spawnSync(process.execPath, [path.join(blender, 'partset.mjs'), name, 'fixture', '--views', manifest, '--no-run'], { encoding: 'utf8' });
  }
  const bad = run('absolute', { front: sentinel, back: 'back.png' });
  assert.notEqual(bad.status, 0, 'absolute outside view must be rejected');
  assert.equal(fs.existsSync(path.join(parts, 'absolute.ref-front.png')), false, 'sentinel must not be copied');
  for (const [name, file, message] of [
    ['traversal', '../../../../outside.png', /--views back:.*parent/],
    ['insideparent', '../materials/back.png', /--views back:.*parent/],
    ['symlink', 'escape.png', /--views back:.*inside the project/],
    ['missing', 'missing.png', /--views back: unavailable/],
    ['winabsolute', 'C:\\outside.png', /--views back:.*relative/],
  ]) {
    const result = run(name, { front: 'front.png', back: file });
    assert.notEqual(result.status, 0, name);
    assert.match(result.stderr, message, name);
    assert.equal(fs.existsSync(path.join(parts, `${name}.ref-front.png`)), false, `${name}: no partial copy`);
    assert.equal(fs.existsSync(path.join(parts, `${name}.ref-back.png`)), false, `${name}: no sentinel copy`);
  }
  for (const suffix of ['ref-front.png', 'ref-front.json', 'request.json', 'ref-review.task.json']) {
    const name = `dest-${suffix.replaceAll('.', '-')}`;
    fs.symlinkSync(sentinel, path.join(parts, `${name}.${suffix}`));
    const before = fs.readFileSync(sentinel);
    const result = run(name, { front: 'front.png', back: 'back.png' });
    assert.notEqual(result.status, 0, `destination symlink ${suffix} must be rejected`);
    assert.deepEqual(fs.readFileSync(sentinel), before, `destination ${suffix} must not modify outside`);
    assert.equal(fs.existsSync(path.join(parts, `${name}.ref-back.png`)), false, 'destination validation must precede copies');
  }
  fs.linkSync(sentinel, path.join(parts, 'hardlink.ref-front.json'));
  const hardlink = run('hardlink', { front: 'front.png', back: 'back.png' });
  assert.notEqual(hardlink.status, 0, 'hard-linked destination must be rejected');
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'fixture-only-sentinel');
  assert.equal(fs.existsSync(path.join(parts, 'hardlink.ref-front.png')), false);
  const good = run('valid', { front: './front.png', back: 'nested/back.png', left: 'internal.png' });
  assert.equal(good.status, 0, good.stderr);
  assert.deepEqual(fs.readFileSync(path.join(parts, 'valid.ref-front.png')), image);
  assert.deepEqual(fs.readFileSync(path.join(parts, 'valid.ref-left.png')), image);
  const req = JSON.parse(fs.readFileSync(path.join(parts, 'valid.request.json')));
  assert.deepEqual(req.views, { front: 'valid.ref-front.png', back: 'valid.ref-back.png', left: 'valid.ref-left.png' });
  // Exercise the unchanged historical manifest in isolation, then a separate
  // project-local copy of its four known assets. Never modify its old review.
  const historicDir = path.join(repo, 'work/recipe-board-v1/projects/banana-design/materials/3d-reference-canary-20261029');
  const historic = JSON.parse(fs.readFileSync(path.join(historicDir, 'selected-views-candidate.json'), 'utf8'));
  assert.deepEqual(Object.keys(historic), ['front', 'back', 'left', 'right']);
  assert.ok(Object.values(historic).every(path.isAbsolute));
  const rejected = run('historic-original', historic);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /--views front:.*relative/);
  assert.equal(fs.existsSync(path.join(parts, 'historic-original.ref-front.png')), false);
  const actualParts = path.join(repo, 'work/recipe-board-v1/style-lab/engine/subjects/parts');
  const known = { front: path.join(historicDir, 'end-blossom.png'), back: path.join(historicDir, 'end-stem.png'), left: path.join(actualParts, 'banana-pipeline-canary-20261029.ref.png'), right: path.join(actualParts, 'banana-pipeline-canary-20261029.ref-mirror.png') };
  const local = {};
  for (const [key, source] of Object.entries(known)) {
    local[key] = `historic-${key}.png`;
    fs.copyFileSync(source, path.join(materials, local[key]));
  }
  const migrated = run('historic-copy', local);
  assert.equal(migrated.status, 0, migrated.stderr);
  for (const [key, source] of Object.entries(known)) assert.deepEqual(fs.readFileSync(path.join(parts, `historic-copy.ref-${key}.png`)), fs.readFileSync(source));
  const sibling = path.join(base, 'projects/other');
  fs.mkdirSync(sibling, { recursive: true });
  fs.writeFileSync(path.join(sibling, 'other.png'), image);
  fs.symlinkSync(path.join(sibling, 'other.png'), path.join(materials, 'sibling.png'));
  const crossProject = run('cross-project', { front: 'front.png', back: 'sibling.png' });
  assert.notEqual(crossProject.status, 0);
  assert.match(crossProject.stderr, /inside the project/);
  const outsideManifest = path.join(temp, 'outside.json');
  fs.writeFileSync(outsideManifest, JSON.stringify({ front: 'outside.png', back: 'outside.png' }));
  const outside = spawnSync(process.execPath, [path.join(blender, 'partset.mjs'), 'outside', 'fixture', '--views', outsideManifest, '--no-run'], { encoding: 'utf8' });
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /manifest must be inside a project/);
  assert.equal(fs.existsSync(path.join(parts, 'outside.ref-front.png')), false);
  console.log('partset views security tests passed');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
