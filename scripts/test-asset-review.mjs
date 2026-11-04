import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { reviewValid, viewHashes, ensureReviewTask, submitAssetReview, assetReviewStatus, viewSetProblem } from '../work/recipe-board-v1/style-lab/engine/blender/asset_review.mjs';
import { textureVerdict, glbTextureInfo } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { partRequestMatches } from '../work/recipe-board-v1/style-lab/engine/build/subject.mjs';
const hashes = { front: '111', left: '222' };
const answer = { contract: 'A1ReferenceReviewAnswer/v1', ok: true, reviewer: 'independent reviewer', reason: 'viewpoint and scale inspected', hashes };
assert.equal(reviewValid(answer, answer.contract, hashes), true);
assert.equal(reviewValid(answer, answer.contract, { ...hashes, front: 'changed' }), false);
assert.equal(reviewValid({ ...answer, ok: false }, answer.contract, hashes), false);
assert.equal(reviewValid({ ...answer, reviewer: '' }, answer.contract, hashes), false);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-view-review-'));
fs.writeFileSync(path.join(dir, 'view.png'), 'view');
const task = path.join(dir, 'test.ref-review.task.json'), dest = path.join(dir, 'test.ref-review.answer.json'), candidate = path.join(dir, 'candidate.json');
ensureReviewTask(task, { contract: 'A1ReferenceReviewTask/v1', hashes, images: ['view.png'] }, { CODEX_THREAD_ID: 'author' });
fs.writeFileSync(candidate, JSON.stringify(answer));
assert.throws(() => submitAssetReview(task, dest, candidate, { CODEX_THREAD_ID: 'author' }), /different threads/);
assert.throws(() => submitAssetReview(task, dest, candidate, {}), /missing submitting thread/);
assert.equal(assetReviewStatus(task, dest), false);
submitAssetReview(task, dest, candidate, { CODEX_THREAD_ID: 'reviewer' });
assert.equal(assetReviewStatus(task, dest), true);
ensureReviewTask(task, { contract: 'A1ReferenceReviewTask/v1', hashes, images: ['view.png'] }, { CODEX_THREAD_ID: 'another' });
assert.equal(assetReviewStatus(task, dest), true, 'resume must retain original task author and receipt');
fs.writeFileSync(dest, JSON.stringify({ ...answer, reason: 'modified' }));
assert.equal(assetReviewStatus(task, dest), false, 'answer change invalidates receipt');
submitAssetReview(task, dest, candidate, { CODEX_THREAD_ID: 'reviewer' });
ensureReviewTask(task, { contract: 'A1ReferenceReviewTask/v1', hashes: { ...hashes, left: 'changed' }, images: ['view.png'] }, { CODEX_THREAD_ID: 'author' });
assert.equal(assetReviewStatus(task, dest), false, 'changed task invalidates receipt');
const req = { name: 'model', why: 'banana', image: 'view.png' };
assert.notEqual(viewHashes(req, dir).__request, viewHashes({ ...req, why: 'pear' }, dir).__request, 'changed object invalidates the review');
fs.rmSync(dir, { recursive: true });
console.log('reference review: pass, changed input, rejection, missing reviewer verified');

// multi-view truth: the image-to-3D line needs genuinely different viewpoints (Claude 2026-10-19 3f7a6d28:2518/2522:
// AI 生图派生多视角); a mirrored pair is one viewpoint twice (banana-hero-tex-20261104, 2026-11-04).
const viewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-view-set-'));
try {
  const svg = (fill, cx) => Buffer.from(`<svg width="160" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="160" height="160" fill="${fill}"/><circle cx="${cx}" cy="80" r="40" fill="#fff"/></svg>`);
  const side = path.join(viewDir, 'side.png'), other = path.join(viewDir, 'other.png'), mirror = path.join(viewDir, 'mirror.png');
  await sharp(svg('#123456', 40)).png().toFile(side);
  await sharp(svg('#c8a02f', 120)).png().toFile(other);
  await sharp(side).flop().toFile(mirror);
  const two = (a, b) => viewSetProblem([{ key: 'left', file: a }, { key: 'right', file: b }]);
  const mirrored = two(side, mirror);
  assert.equal(mirrored.ok, false, 'a mirrored copy is not a second viewpoint');
  assert.equal(mirrored.genuine, 1, 'mirrored views collapse to one viewpoint');
  assert.match(mirrored.problem, /left and right are the same picture mirrored/);
  assert.match(mirrored.problem, /ref\.mjs/, 'the failure names the AI multi-view route (partset default derives end/rear)');
  const identical = two(side, side);
  assert.equal(identical.ok, false);
  assert.match(identical.problem, /left and right are the same picture/);
  const genuine = two(side, other);
  assert.equal(genuine.ok, true, 'two genuinely different views pass');
  assert.equal(genuine.genuine, 2);
  const four = viewSetProblem([{ key: 'front', file: other }, { key: 'left', file: side }, { key: 'back', file: other }, { key: 'right', file: mirror }]);
  assert.equal(four.ok, true, 'a four-view set with one mirror still holds two genuine viewpoints');
  assert.equal(four.genuine, 2);
  assert.equal(viewSetProblem([{ key: 'left', file: side }]).ok, true, 'a single view is not a multi-view set to compare');
} finally { fs.rmSync(viewDir, { recursive: true }); }
console.log('reference view set: mirror, identical and genuine viewpoints verified');

// baked texture truth: a partset texture request must come back as a GLB that carries the 2K colour/normal maps.
const complete = { images: 2, textures: 2, uv: true, baseColorTexture: true, normalTexture: true };
assert.equal(textureVerdict('flat', { textureRequested: true, glb: {} }).ok, false, 'a texture request without maps fails');
assert.match(textureVerdict('flat', { textureRequested: true, glb: {} }).say, /no baked colour\/normal maps[\s\S]*no UVs/);
assert.equal(textureVerdict('tex', { textureRequested: true, glb: complete, coverage: { projectedShare: 0.9 } }).ok, true, 'colour + normal on UVs passes');
assert.equal(textureVerdict('tex', { textureRequested: true, glb: complete, coverage: { projectedShare: 0.2 } }).ok, false, 'mostly flat fill fails');
assert.match(textureVerdict('tex', { textureRequested: true, glb: complete, coverage: { projectedShare: 0.2 } }).say, /projected on only 20 %/);
assert.equal(textureVerdict('no-tex', { textureRequested: false, glb: {} }).ok, true, 'a part with no texture request is not judged on texture');
const glb = (() => {
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, meshes: [{ primitives: [{ attributes: { TEXCOORD_0: 0 } }] }], images: [{}, {}], textures: [{}, {}], materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1 } }] }));
  const pad = (4 - (json.length % 4)) % 4, chunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]), out = Buffer.alloc(20 + chunk.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(20 + chunk.length, 8);
  out.writeUInt32LE(chunk.length, 12); out.writeUInt32LE(0x4e4f534a, 16); chunk.copy(out, 20);
  return out;
})();
assert.deepEqual(glbTextureInfo(glb), { images: 2, textures: 2, uv: true, baseColorTexture: true, normalTexture: true, readable: true });
assert.equal(glbTextureInfo(Buffer.from('not a glb')).readable, false, 'a non-GLB is not read as textured');
console.log('baked texture verdict: maps, UVs, projection coverage and GLB reading verified');

const part = { name: 'shell', label: 'shell', what: 'a shell', size: [4, 3, 2], at: [0, 1, 0] };
const request = { why: 'partset: a shell, a part of thing (object)', long: 'x', fitMax: 4, fitBox: part.size, at: part.at, tags: { group: 'shell', label: 'shell', ex: 1, ey: 0, ez: 0 } };
assert.equal(partRequestMatches(request, part, 'thing', 'object', [1, 0, 0]), true);
assert.equal(partRequestMatches(request, { ...part, size: [5, 3, 2] }, 'thing', 'object', [1, 0, 0]), false);
console.log('resumable subject parts: matching and changed plans verified');
