// Offline checks for the camera-path wiring (T09): the offline Blender camera path a chapter can request
// (A1CameraRequest/v1 -> campath.py OptFlowCam adapter -> A1CameraPath/v1) and the checks around it. The Blender run
// itself is not exercised here (it needs the OptFlowCam checkout and minutes of compute).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateCameraRequest, validateCameraOutput } from '../work/recipe-board-v1/style-lab/engine/blender/run.mjs';
import { bakeUseErrors, KIT_CALLS } from '../apps/studio-next/src/lib/recipe-board/chapter.mjs';
import { dispatchCapability, engineCapabilitiesSchemaErrors, capabilityRouteResolveErrors } from '../apps/studio-next/src/lib/recipe-board/p1hard.mjs';

// ---- the request/output contracts ----
const req = {
  contract: 'A1CameraRequest/v1', fps: 30, duration: 2, lensMM: 50, sourceArrival: 1.2, arrival: 1.8,
  keys: [{ time: 0, position: [0, 1, 0], target: [0, 1, -2] }, { time: 0.5, position: [0.3, 1.1, 1], target: [0, 1, -2] }, { time: 1, position: [0.5, 1.2, 2], target: [0, 1, -2] }],
  focus: { fStop: 2.8, anchors: [[0, [0, 1, 0]]] },
};
assert.deepEqual(validateCameraRequest(req), undefined, 'a valid camera request passes');
for (const [patch, re] of [
  [{ contract: 'A1RigidBakeRequest/v1' }, /invalid camera request bounds/],
  [{ fps: 61 }, /fps 1–60/],
  [{ fps: 0 }, /fps 1–60/],
  [{ duration: 31 }, /fps 1–60/],
  [{ lensMM: 4 }, /lensMM 8–300/],
  [{ arrival: 1.0 }, /arrival >= sourceArrival/],
  [{ keys: [] }, /keys\[\]/],
  [{ keys: req.keys.slice(0, 2) }, /keys\[\] must hold 3–16 keys/, 'a 2-key path is refused: the pinned OptFlowCam adapter cannot export it'],
  [{ keys: [{ time: 0, position: [0, 1, 0], target: [0, 1, -2] }, { time: 0.5, position: [0, 1, 0], target: [0, 1, -2] }, { time: 3, position: [0, 1, 0], target: [0, 1, -2] }] }, /in order|inside \[0,duration\]/],
  [{ keys: [{ time: 0, position: [0, 1, 0], target: [0, 1, -2] }, { time: 0.5, position: [0, 1, 0], target: [0, 1, -2] }, { time: 0.4, position: [0, 1, 0], target: [0, 1, -2] }] }, /in order/],
  [{ keys: [{ time: 0, position: [0, Infinity, 0], target: [0, 1, -2] }, req.keys[1], req.keys[2]] }, /position and target/],
  [{ focus: { fStop: 0, anchors: [] } }, /focus needs fStop/],
  [{ focus: { fStop: 2.8, anchors: [[0]] } }, /focus anchors/],
]) assert.throws(() => validateCameraRequest({ ...req, ...patch }), re, JSON.stringify(patch).slice(0, 60));
const out = { contract: 'A1CameraPath/v1', fps: 30, frames: 60, fov: 40, rows: Array.from({ length: 60 }, () => [0, 1, 0, 0, 0, 0, 1, null]) };
assert.deepEqual(validateCameraOutput(out, req), undefined, 'a valid camera path passes');
for (const [patch, re] of [
  [{ contract: 'A1RigidBake/v1' }, /invalid camera path output/],
  [{ frames: 59 }, /invalid camera path output/],
  [{ rows: out.rows.slice(0, 59) }, /invalid camera path output/],
  [{ rows: [...out.rows.slice(0, 59), [0, 1]] }, /invalid camera path output/],
  [{ rows: [...out.rows.slice(0, 59), [0, 1, 0, 0, 0, 0, NaN, null]] }, /invalid camera path output/],
]) assert.throws(() => validateCameraOutput({ ...out, ...patch }, req), re, JSON.stringify(patch).slice(0, 60));
console.log('camera path: request/output bounds verified');

// ---- a module must read the bakes it requests ----
const cameraRead = "const cam = await kit.engine.baked.camera(data['cam']);";
const rigidRead = "const drop = await kit.engine.baked.rigid(data['drop']);";
assert.deepEqual(bakeUseErrors(cameraRead, [{ key: 'cam', kind: 'camera' }]), [], 'a read camera path matches its request');
assert.deepEqual(bakeUseErrors(rigidRead, [{ key: 'drop', kind: 'rigid' }]), [], 'a read rigid bake matches its request');
assert.match(bakeUseErrors(cameraRead, []).join('\n'), /reads a bake the answer does not request/);
assert.match(bakeUseErrors(cameraRead, [{ key: 'cam', kind: 'rigid' }]).join('\n'), /requested as kind "rigid"/);
assert.match(bakeUseErrors("kit.engine.baked.camera(url('cam2'))", [{ key: 'cam', kind: 'camera' }]).join('\n'), /does not request/);
assert.deepEqual(bakeUseErrors("// kit.engine.baked.camera(data['cam'])\nconst a = 1;", []), [], 'a commented read is not a read');
assert.match(bakeUseErrors("", [{ key: 'bad key!', kind: 'camera' }]).join('\n'), /invalid key/);
assert.match(bakeUseErrors("", [{ key: 'cam', kind: 'camera' }, { key: 'cam', kind: 'camera' }]).join('\n'), /duplicate key/);
assert.deepEqual(bakeUseErrors('', []), []);
console.log('camera path: bake-use contract verified');

// ---- the capability is registered, dispatchable and consistent ----
const caps = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/engine-capabilities.json', 'utf8'));
const devices = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/devices.json', 'utf8')).devices;
const cap = caps.capabilities.find((c) => c.id === 'camera-path-bakes');
assert.ok(cap, 'camera-path-bakes is in the capability catalog');
assert.equal(cap.chapter, 'kit.engine.baked.camera');
assert.ok(cap.files.includes('blender/campath.py') && cap.files.includes('three/baked.js'));
const route = caps.routes.find((r) => r.capability === 'camera-path-bakes');
assert.ok(route, 'a route links the capability');
assert.equal(route.codeSymbol, 'kit.engine.baked.camera');
assert.equal(dispatchCapability(caps, 'camera-path-bakes').chapterCallable, true, 'the camera path dispatches as chapter-callable');
assert.equal(dispatchCapability(caps, 'camera-path-bakes').codeSymbol, 'kit.engine.baked.camera');
assert.deepEqual(engineCapabilitiesSchemaErrors(caps), []);
assert.deepEqual(capabilityRouteResolveErrors(caps, devices), [], 'every route device exists in devices.json');
const morph = fs.readFileSync('work/recipe-board-v1/style-lab/engine/templates/morph.js', 'utf8');
assert.match(morph, /camera: async \(u\) =>/, 'the chapter kit exposes kit.engine.baked.camera');
const bakedSrc = fs.readFileSync('work/recipe-board-v1/style-lab/engine/three/baked.js', 'utf8');
assert.match(bakedSrc, /url && typeof url === 'object' && url\.contract === 'A1CameraPath\/v1'/, 'the player accepts parsed data[key] like the rigid player');
const schema = JSON.parse(fs.readFileSync('work/recipe-board-v1/routing/morph.schema.json', 'utf8'));
assert.ok(schema.properties.bakes.items.properties.kind.enum.includes('camera'), 'answer.bakes accepts kind camera');
console.log('camera path: capability, dispatch, player and schema verified');

// ---- no false positives on the kept answers/chapters ----
let answers = 0, withBakes = 0;
for (const p of fs.readdirSync('work/recipe-board-v1/projects')) {
  const dir = path.join('work/recipe-board-v1/projects', p, 'tasks');
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((x) => /^morph-.*\.answer\.json$/.test(x) && !x.includes('.before-') && !x.includes('.stale-'))) {
    let a; try { a = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
    if (typeof a?.code !== 'string') continue;
    answers++;
    if ((a.bakes || []).length) withBakes++;
    assert.deepEqual(bakeUseErrors(a.code, a.bakes || []), [], `kept answer passes bake-use: ${p}/${f}`);
  }
}
assert.ok(answers >= 3, `kept morph answers scanned (${answers})`);
console.log(`camera path: ${answers} kept morph answers scanned (${withBakes} with bakes), 0 false positives`);
