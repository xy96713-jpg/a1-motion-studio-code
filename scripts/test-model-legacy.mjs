import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLegacyModelRevalidation, legacyModelRevalidationStatus } from '../apps/studio-next/src/lib/recipe-board/modellegacy.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-model-legacy-'));
function fixture(name) {
  const dir = path.join(root, name); fs.mkdirSync(path.join(dir, 'ship.work'), { recursive: true });
  const request = { contract: 'A1PartRequest/v1', name: 'ship', views: { front: 'front.png', left: 'left.png' }, size: [20, 4, 6] };
  const write = (file, value) => fs.writeFileSync(path.join(dir, file), typeof value === 'string' ? value : JSON.stringify(value));
  write('ship.glb', 'glTF test bytes'); write('front.png', 'front bytes'); write('left.png', 'left bytes');
  write('ship.request.json', request);
  write('ship.work/request.hashed.json', { ...request, inputHash: '1234567890abcdef', rawMesh: '/historical/path/shape.glb' });
  write('ship.json', { contract: 'A1PartMesh/v1', name: 'ship', glb: 'ship.glb', inputHash: '1234567890abcdef' });
  return { dir, request, write };
}
try {
  const good = fixture('good');
  assert.equal(legacyModelRevalidationStatus(good.dir, 'ship').ok, false);
  assert.equal(fs.existsSync(path.join(good.dir, 'ship.revalidation.json')), false, 'read-only status must not create evidence');
  const made = createLegacyModelRevalidation(good.dir, 'ship');
  assert.equal(made.reused, false); assert.match(made.record.note, /not signatures recorded at original generation/);
  assert.deepEqual(made.record.requires, ['current-use-qa', 'independent-visual-review']);
  assert.equal(legacyModelRevalidationStatus(good.dir, 'ship').ok, true);
  const before = fs.readFileSync(made.file);
  const reused = createLegacyModelRevalidation(good.dir, 'ship');
  assert.equal(reused.reused, true); assert.equal(reused.record.checkedAt, made.record.checkedAt);
  assert.ok(before.equals(fs.readFileSync(made.file)), 'idempotent creation leaves bytes untouched');
  for (const target of ['ship.glb', 'front.png', 'ship.request.json', 'ship.json', 'ship.work/request.hashed.json']) {
    const f = fixture('changed-' + target.replaceAll('/', '-')); createLegacyModelRevalidation(f.dir, 'ship');
    const sidecar = fs.readFileSync(path.join(f.dir, 'ship.revalidation.json'));
    fs.appendFileSync(path.join(f.dir, target), '\n '); // JSON remains valid but its frozen bytes change.
    assert.equal(legacyModelRevalidationStatus(f.dir, 'ship').ok, false, target);
    assert.throws(() => createLegacyModelRevalidation(f.dir, 'ship'), /cannot be overwritten/, target);
    assert.ok(sidecar.equals(fs.readFileSync(path.join(f.dir, 'ship.revalidation.json'))));
  }
  const field = fixture('bad-field'); field.write('ship.request.json', { ...field.request, size: [21, 4, 6] });
  assert.throws(() => createLegacyModelRevalidation(field.dir, 'ship'), /field does not match.*size/);
  const hash = fixture('bad-hash'); hash.write('ship.json', { contract: 'A1PartMesh/v1', name: 'ship', glb: 'ship.glb', inputHash: 'fedcba0987654321' });
  assert.throws(() => createLegacyModelRevalidation(hash.dir, 'ship'), /inputHash/);
  const named = fixture('bad-name'); named.write('ship.json', { contract: 'A1PartMesh/v1', name: 'other', glb: 'ship.glb', inputHash: '1234567890abcdef' });
  assert.throws(() => createLegacyModelRevalidation(named.dir, 'ship'), /names/);
  assert.throws(() => createLegacyModelRevalidation(good.dir, '../ship'), /invalid model name/);
  assert.throws(() => createLegacyModelRevalidation(good.dir, 123), /invalid model name/);
  const outside = path.join(root, 'outside.png'); fs.writeFileSync(outside, 'outside');
  for (const [name, ref] of [['traversal', '../outside.png'], ['absolute', outside], ['symlink', 'outside-link.png']]) {
    const f = fixture(name), req = { ...f.request, views: { front: ref } };
    if (name === 'symlink') fs.symlinkSync(outside, path.join(f.dir, ref));
    f.write('ship.request.json', req); f.write('ship.work/request.hashed.json', { ...req, inputHash: '1234567890abcdef' });
    assert.throws(() => createLegacyModelRevalidation(f.dir, 'ship'), /outside partsRoot/);
  }
  const linked = fixture('sidecar-symlink'); fs.symlinkSync(outside, path.join(linked.dir, 'ship.revalidation.json'));
  assert.throws(() => createLegacyModelRevalidation(linked.dir, 'ship'), /cannot be overwritten/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'outside');
  console.log('legacy model revalidation: current hashes, historical consistency, idempotence, mutation rejection and path confinement verified; no QA or visual approval granted');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
