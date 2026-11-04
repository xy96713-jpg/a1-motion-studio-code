import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSameSceneStaticSamplingAdapterV1} from '../apps/studio-next/src/lib/a1-same-scene-static-sampling-v1.mjs';
import {mediaSha256} from '../apps/studio-next/src/lib/a1-node-media-file-adapter-v1.mjs';
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-three-states-')));
const bytes = Buffer.from('isolated synthetic asset'), file = path.join(root, 'asset.png'); fs.writeFileSync(file, bytes);
const dependencies = {'X1:media-files': {artifacts: [{role: 'plate', kind: 'IMAGE', sha256: mediaSha256(bytes), bytes: bytes.length, absolutePath: file}]}};
const node = {id: 'X1:remotion-render', shotId: 'X1', inputSha256: 'a'.repeat(64), input: {parameters: {output: 'still',
  scene: {width: 160, height: 120, fps: 30, durationInFrames: 90, layers: [{nodeId: 'X1:media-files', artifactRole: 'plate', x: 0, y: 0, width: 160, height: 120, z: 0, from: 0, durationInFrames: 90}]},
  staticFrames: ['ENTRY', 'HOLD', 'HANDOFF'].map((state, i) => ({state, frame: i * 30, sourceFrame: i * 30, referenceFrameSha256: 'b'.repeat(64)}))}}};
const frames = []; let bundles = 0, browsers = 0, closed = 0;
const adapter = createSameSceneStaticSamplingAdapterV1({diskOptions: {statfs: () => ({bsize: 1, bavail: 10 * 1024 ** 3}), tempDir: root},
  loadBundler: () => ({bundle: async () => {bundles++; return 'synthetic://bundle';}}),
  loadRenderer: () => ({openBrowser: async () => {browsers++; return {close: async () => {closed++;}};}, selectComposition: async () => ({id: 'A1NodeShot'}),
    renderStill: async options => {frames.push(options.frame); fs.writeFileSync(options.output, Buffer.from(`synthetic-frame-${options.frame}`));}})});
try {
  node.input.parameters.staticSamplingImplementationSha256 = adapter.samplingImplementationSha256;
  const result = await adapter.execute(node, {artifactRoot: path.join(root, 'outputs'), dependencies});
  assert.deepEqual(frames, [0, 30, 60]); assert.equal(bundles, 1); assert.equal(browsers, 1); assert.equal(closed, 1);
  assert.equal(result.staticSampling.samples.length, 3); assert.equal(result.staticSampling.wholeShotPASS, false);
  assert.equal(result.visualApproval, 'NOT_GRANTED');
  assert.equal(new Set(result.artifactManifest.artifacts.map(artifact => artifact.path)).size, result.artifactManifest.artifacts.length);
  assert.equal(result.artifactManifest.artifacts.filter(artifact => artifact.role === 'composite-preview').length, 1);
  assert.ok(result.staticSampling.samples.every(sample => fs.existsSync(path.join(root, 'outputs', sample.artifact.path))));
  for (const mutate of [n => n.input.parameters.staticFrames[1].frame = 0, n => n.input.parameters.staticFrames[0].referenceFrameSha256 = 'bad', n => n.input.parameters.output = 'video']) {
    const bad = structuredClone(node); mutate(bad); assert.equal((await adapter.execute(bad, {artifactRoot: path.join(root, 'outputs'), dependencies})).state, 'blocked');
  }
  assert.equal(bundles, 1, 'invalid requests never enter a bundler');
} finally {fs.rmSync(root, {recursive: true, force: true});}
console.log(JSON.stringify({status: 'PASS', measurements: {bundles, browserSessions: browsers, stills: frames.length, closed},
  realBrowsers: 0, checks: ['single-build-single-session-three-frames', 'same-scene-receipt', 'reference-binding', 'ascending-state-times', 'no-motion-or-approval']}));
