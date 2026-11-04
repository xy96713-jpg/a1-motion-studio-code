import assert from 'node:assert/strict';
import { inputHash, taskBindingErrors } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { chapterMaterials } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { reconcileMotionContract } from '../apps/studio-next/src/lib/recipe-board/sessionbrief.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const a = { beats: [{ id: 'B1', text: 'first' }], greybox: [{ beat: 'B1' }], motionContract: { shots: [{ shotId: 'B1', subjectMotion: 'stagger' }] }, tells: ['keep'], routes: [{ need: 'model' }], inheritance: { files: { 'HOUSE.md': 'v1' } }, example: 'gold', example3d: '', exampleKits: 'kit' };
const h = inputHash(a);
for (const changed of [
  { ...a, inheritance: { files: { 'HOUSE.md': 'v2' } } },
  { ...a, motionContract: { shots: [{ shotId: 'B1', subjectMotion: 'tableGrows' }] } },
  { ...a, tells: ['changed'] },
  { ...a, routes: [{ need: 'evidence' }] },
  { ...a, exampleKits: 'changed kit' },
]) assert.notEqual(inputHash(changed), h, 'a changed inherited input must make the task stale');
assert.deepEqual(taskBindingErrors({ sourceTaskInputHash: h }, h, null, 'new'), []);
assert.match(taskBindingErrors({ sourceTaskInputHash: 'old' }, h, null, 'new').join(), /not bound/);
assert.match(taskBindingErrors({}, h, null, 'new').join(), /not bound/);
assert.deepEqual(taskBindingErrors({}, h, { answerHash: 'old-answer' }, 'old-answer'), [], 'previously checked work may be rechecked');
assert.match(taskBindingErrors({}, h, { answerHash: 'old-answer' }, 'different-answer').join(), /not bound/);
const existing = { chapter: 'B01', project: 'p', motif: { id: 'kept', layers: [] }, delivery: { previewMp4: true }, shots: [{ shotId: 'B01', camera: { move: 'push', camMoveMin: 0.5 }, subjectMotion: 'stagger', subject: { model: 'held-model' }, type: { in: 2 }, seam: { out: 'flash', poseFrom: { s: 1, x: 0, y: 0 } } }] };
const fresh = { chapter: 'B01', project: 'p', shots: [{ shotId: 'B01', camera: { move: 'push' }, subjectMotion: 'subject-motion', type: { in: 2 }, seam: { out: 'flash' } }] };
const merged = reconcileMotionContract(existing, fresh);
assert.deepEqual(merged.errors, []);
assert.equal(merged.contract.motif.id, 'kept'); assert.equal(merged.contract.delivery.previewMp4, true);
assert.equal(merged.contract.shots[0].subject.model, 'held-model'); assert.equal(merged.contract.shots[0].camera.camMoveMin, 0.5);
assert.equal(merged.contract.shots[0].subjectMotion, 'stagger');
const conflicting = reconcileMotionContract(existing, { ...fresh, shots: [{ ...fresh.shots[0], camera: { move: 'pull' } }] });
assert.match(conflicting.errors.join(), /B01.*camera.*conflicts/, 'a changed design must be reconciled rather than silently replacing the director contract');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a1-readonly-materials-'));
try {
  const dataDir = path.join(tmp, 'work/recipe-board-v1'), root = path.join(dataDir, 'projects/test-film'), materials = path.join(root, 'materials');
  fs.mkdirSync(materials, { recursive: true });
  fs.writeFileSync(path.join(root, 'project.json'), JSON.stringify({ id: 'test-film' }));
  const source = path.join(tmp, 'source.mp4'); fs.writeFileSync(source, 'not-a-video');
  fs.writeFileSync(path.join(materials, 'needs.json'), JSON.stringify({ needs: [{ shotId: 'B01', entity: 'source' }] }));
  fs.writeFileSync(path.join(materials, 'bindings.json'), JSON.stringify({ shots: { B01: { kind: 'video', file: source } } }));
  const before = fs.readdirSync(materials).sort();
  const result = chapterMaterials({ repoRoot: tmp, sourceRoot: tmp, dataDir }, 'test-film', { shots: [{ shotId: 'B01' }] }, { prepare: false });
  assert.deepEqual(result.map((x) => x.key), ['m_B01_f0', 'm_B01_f1', 'm_B01_f2']);
  assert.deepEqual(fs.readdirSync(materials).sort(), before, 'status projection does not extract frames or run OCR');
  assert.equal(fs.existsSync(path.join(root, 'out')), false, 'status projection does not create output');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log('chapter handoff: changed inherited sources and stale answers are detected; checked work is preserved');
