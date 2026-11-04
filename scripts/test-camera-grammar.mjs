// Offline checks for the camera grammar (routing/camera-grammar.json, A1CameraGrammar/v1): CAMERA.md and
// SHOT-DIRECTION.md §3 made checkable against the shot-motion contract. The rules that need the measured picture stay
// with the runtime measurement and the reviews; this file checks the contract-level ones only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cameraGrammarErrors, CAMERA_GRAMMAR } from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';

const grammar = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/camera-grammar.json', 'utf8'));
assert.equal(grammar.contract, CAMERA_GRAMMAR, 'grammar file declares A1CameraGrammar/v1');
assert.ok(Array.isArray(grammar.notMachineChecked) && grammar.notMachineChecked.length, 'the grammar says what it cannot check');

const shot = (id, camera, extra = {}) => ({ shotId: id, subjectMotion: 'static', type: {}, seam: {}, ...extra, camera });
const contract = (shots) => ({ contract: 'A1ShotMotionContract/v1', chapter: 'B99', shots });
const errs = (shots) => cameraGrammarErrors(contract(shots), grammar);

// a locked default and a slow push that carries the pose are the normal case
assert.deepEqual(errs([
  shot('B01', { move: 'push', from: { s: 1.08, x: 0, y: -20 }, to: { s: 1.22, x: -40, y: 0 }, camMoveMin: 0.55, camMoveMax: 0.65 }),
  shot('B02', { move: 'static' }, { seam: { in: 'push', poseFrom: { s: 1.22, x: -40, y: 0 } } }),
]), [], 'a push that moves, then a locked shot carrying the pose, passes');
assert.deepEqual(errs([shot('B01', { move: 'locked' })]), [], 'CAMERA.md alias locked maps to static');

// locked really means locked
assert.match(errs([shot('B01', { move: 'static', camMoveMin: 0.55, camMoveMax: 0.65 })]).join('\n'), /locked shot does not push/, 'a static shot with a push band fails');
assert.match(errs([shot('B01', { move: 'static', from: { s: 1, x: 0, y: 0 }, to: { s: 1.2, x: 0, y: 0 } })]).join('\n'), /static but from→to differ/, 'a static shot whose from/to differ fails');

// a declared move must move, and it must be a known move with one owner
assert.match(errs([shot('B01', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } })]).join('\n'), /does not move/, 'push from = to fails');
assert.match(errs([shot('B01', { move: 'push', from: { s: 1, x: 0, y: 0 } })]).join('\n'), /only one of from\/to/, 'a one-ended move fails');
assert.match(errs([shot('B01', { move: 'zoom' })]).join('\n'), /unknown camera move "zoom"/, 'an unknown move fails');
assert.match(errs([shot('B01', { move: 'pan' }, { camMove: 'push' })]).join('\n'), /two camera owners/, 'camera.move vs camMove disagreement fails');
assert.match(errs([shot('B01', {})]).join('\n'), /no camera move declared/, 'no camera owner at all fails');

// whips are seam-only; the intensity band must be sane
assert.match(errs([shot('B01', { move: 'whip' })]).join('\n'), /seam-only/, 'a whip inside a shot fails');
assert.deepEqual(errs([shot('B01', { move: 'whip' }, { seam: { in: 'cut', out: 'whip' } })]), [], 'a whip on a whip/cut seam passes');
assert.match(errs([shot('B01', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.1, x: 0, y: 0 }, camMoveMin: 1.2 })]).join('\n'), /outside 0\.\.1/, 'a band outside 0..1 fails');
assert.match(errs([shot('B01', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.1, x: 0, y: 0 }, camMoveMin: 0.6, camMoveMax: 0.5 })]).join('\n'), /camMoveMin 0\.6 > camMoveMax 0\.5/, 'an inverted band fails');

// the camera pose is carried across a push/match/whip seam (SHOT-DIRECTION.md §3 能量延续)
const jumped = errs([
  shot('B01', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.2, x: -40, y: 0 } }),
  shot('B02', { move: 'static' }, { seam: { in: 'push', poseFrom: { s: 1.1, x: -20, y: 0 } } }),
]);
assert.equal(jumped.length, 1);
assert.match(jumped[0], /does not continue B01's camera\.to \(s\/x\)/, 'a seam that jumps the camera fails with the jumped axes');
assert.deepEqual(errs([
  shot('B01', { move: 'push', from: { s: 1, x: 0, y: 0 }, to: { s: 1.2, x: -40, y: 0 } }),
  shot('B02', { move: 'static', from: { s: 1.2, x: -40, y: 0 }, to: { s: 1.2, x: -40, y: 0 } }, { seam: { in: 'match', poseFrom: { s: 1.2, x: -40, y: 0 } } }),
]), [], 'a continued pose passes (and an equal from/to on a locked shot is not a move)');

// guard against false positives: every kept motion contract in the projects must pass the grammar as it is
const projects = fs.readdirSync('work/recipe-board-v1/projects').filter((p) => fs.existsSync(path.join('work/recipe-board-v1/projects', p, 'tasks')));
const files = projects.flatMap((p) => fs.readdirSync(path.join('work/recipe-board-v1/projects', p, 'tasks'))
  .filter((f) => /^session-.*\.motion\.json$/.test(f) && !f.includes('.before-'))
  .map((f) => path.join('work/recipe-board-v1/projects', p, 'tasks', f)));
assert.ok(files.length >= 4, `the kept motion contracts exist (found ${files.length})`);

// the contract schema and the camera grammar must agree, and every field the kept contracts use must be described
// (the schema had drifted: real contracts carry camera.from/to and shot.medium/pictureLock, which it did not describe)
const schema = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/shot-motion-contract.schema.json', 'utf8'));
const itemProps = schema.properties.shots.items.properties;
assert.deepEqual([...itemProps.camera.properties.move.enum].sort(), Object.keys(grammar.vocabulary).sort(), 'schema camera.move enum equals the grammar vocabulary');
for (const k of ['from', 'to']) assert.ok(itemProps.camera.properties[k], `schema describes camera.${k}`);
for (const k of ['medium', 'pictureLock']) assert.ok(itemProps[k], `schema describes shot.${k}`);
const described = new Set(Object.keys(itemProps));
for (const file of files) {
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const sh of c.shots || []) for (const k of Object.keys(sh)) assert.ok(described.has(k), `schema describes shot.${k} (${file})`);
  assert.deepEqual(cameraGrammarErrors(c, grammar), [], `kept contract passes the camera grammar: ${file}`);
}
console.log(`camera grammar: ${files.length} kept motion contracts pass; locked/move/seam/pose/band rules, aliases and schema agreement verified`);
