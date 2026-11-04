#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {withRemotionPublicBuildV1} from '../apps/studio-next/src/lib/a1-remotion-public-build-v1.mjs';
import {createRemotionRenderNodeAdapterV1, remotionRenderNodeAdapterV1} from '../apps/studio-next/src/lib/a1-node-remotion-render-adapter-v1.mjs';
import {createNodeAdapterRegistry} from '../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs';

// Tiny retained fixtures only. No browser, encoder, real bundler, or cleanup/deletion.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-remotion-public-pure-')));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const available = (bytes) => () => ({bsize: 1, bavail: bytes});
const diskOptions = {statfs: available(10 * 1024 ** 3), tempDir: root};
const source = path.join(root, 'source.png'), bytes = Buffer.from('tiny synthetic media');
fs.writeFileSync(source, bytes);
const asset = {absolutePath: source, bytes: bytes.length, sha256: sha(bytes), name: sha(bytes) + '.png'};
const stage = (label) => path.join(root, label, 'public');
const fail = (code) => (error) => error.code === code;
let actions = 0;
const action = async () => { actions += 1; };

test('null, omitted, relative public and omitted allowlist never enter bundler', async () => {
  for (const request of [{publicDir: null, assets: []}, {assets: []}, {publicDir: 'public', assets: []}, {publicDir: stage('no-list')}]) {
    await assert.rejects(withRemotionPublicBuildV1(request, action, diskOptions), fail('REMOTION_PUBLIC_EXPLICIT_DEPENDENCIES_REQUIRED'));
  }
  assert.equal(actions, 0);
});

test('empty public creates an actual empty directory with explicit safe bundle options', async () => {
  await withRemotionPublicBuildV1({publicDir: stage('empty'), assets: []}, async (prepared) => {
    assert.deepEqual(fs.readdirSync(prepared.publicDir), []);
    assert.ok(path.isAbsolute(prepared.publicDir));
    assert.equal(prepared.enableCaching, false);
    assert.equal(prepared.symlinkPublicDir, false);
    assert.equal(prepared.diskPlan.selectedBytes, 0);
    assert.equal(prepared.diskPlan.bundleReuse, false);
  }, diskOptions);
});

test('exact accepted assets, not neighbouring media, enter public; duplicates stage once', async () => {
  const unrelated = path.join(root, 'presenter.mov');
  fs.writeFileSync(unrelated, 'unrelated tiny stand-in for a large presenter');
  const before = fs.readFileSync(unrelated);
  await withRemotionPublicBuildV1({publicDir: stage('exact'), assets: [asset, asset], outputBytes: 16}, async (prepared) => {
    assert.deepEqual(fs.readdirSync(prepared.publicDir), [asset.name]);
    assert.equal(prepared.diskPlan.selectedBytes, bytes.length);
    assert.equal(prepared.diskPlan.stageCopyBytes, bytes.length);
    assert.equal(prepared.diskPlan.bundlePublicCopyBytes, bytes.length);
    assert.equal(prepared.diskPlan.estimatedIncrementBytes, bytes.length * 2 + 16 + 256 * 1024 ** 2);
    assert.deepEqual(fs.readFileSync(path.join(prepared.publicDir, asset.name)), bytes);
  }, diskOptions);
  assert.deepEqual(fs.readFileSync(unrelated), before);
});

test('exact stage reuses verified bytes without rewriting or interpreting it as a completed bundle', async () => {
  const target = path.join(stage('exact'), asset.name), before = fs.statSync(target);
  await withRemotionPublicBuildV1({publicDir: stage('exact'), assets: [asset]}, async (prepared) => {
    assert.equal(prepared.diskPlan.stageCopyBytes, 0);
    assert.equal(prepared.diskPlan.bundlePublicCopyBytes, bytes.length);
    assert.equal(prepared.diskPlan.bundleReuse, false);
  }, diskOptions);
  const after = fs.statSync(target);
  assert.equal(after.ino, before.ino);
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test('an undeclared file in a reused stage blocks rather than copying or deleting it', async () => {
  const publicDir = stage('polluted');
  fs.mkdirSync(publicDir, {recursive: true});
  fs.writeFileSync(path.join(publicDir, 'presenter.mov'), 'preserve');
  await assert.rejects(withRemotionPublicBuildV1({publicDir, assets: []}, action, diskOptions), fail('REMOTION_PUBLIC_UNDECLARED_FILE'));
  assert.equal(fs.readFileSync(path.join(publicDir, 'presenter.mov'), 'utf8'), 'preserve');
});

test('public symlink and nested directory cannot broaden the whitelist', async () => {
  const link = path.join(root, 'public-link'); fs.symlinkSync(stage('exact'), link);
  await assert.rejects(withRemotionPublicBuildV1({publicDir: link, assets: [asset]}, action, diskOptions), fail('REMOTION_PUBLIC_DIRECTORY_INVALID'));
  const publicDir = stage('nested'); fs.mkdirSync(path.join(publicDir, 'nested'), {recursive: true});
  await assert.rejects(withRemotionPublicBuildV1({publicDir, assets: []}, action, diskOptions), fail('REMOTION_PUBLIC_UNDECLARED_FILE'));
});

test('ancestor and broken public symlinks reject before following or writing their targets', async () => {
  const target = path.join(root, 'ancestor-target'); fs.mkdirSync(target);
  const ancestor = path.join(root, 'ancestor-link'); fs.symlinkSync(target, ancestor);
  await assert.rejects(withRemotionPublicBuildV1({publicDir: path.join(ancestor, 'public'), assets: [asset]}, action, diskOptions), fail('REMOTION_PUBLIC_DIRECTORY_INVALID'));
  assert.deepEqual(fs.readdirSync(target), []);
  const broken = path.join(root, 'broken-public'); fs.symlinkSync(path.join(root, 'absent-target'), broken);
  await assert.rejects(withRemotionPublicBuildV1({publicDir: broken, assets: []}, action, diskOptions), fail('REMOTION_PUBLIC_DIRECTORY_INVALID'));
  assert.equal(fs.existsSync(path.join(root, 'absent-target')), false);
});

test('final directory identity check detects replacement before bundler', async () => {
  const publicDir = stage('replaced');
  await withRemotionPublicBuildV1({publicDir, assets: []}, async (prepared) => {
    // Retain both directories: rename is reversible and no file is deleted.
    fs.renameSync(publicDir, publicDir + '-preserved'); fs.mkdirSync(publicDir);
    await assert.rejects(prepared.assertReady(), fail('REMOTION_PUBLIC_DIRECTORY_CHANGED'));
  }, diskOptions);
});

test('final SHA recheck detects same-name changed stage bytes before bundler', async () => {
  const publicDir = stage('final-corrupt');
  await withRemotionPublicBuildV1({publicDir, assets: [asset]}, async (prepared) => {
    fs.writeFileSync(path.join(publicDir, asset.name), Buffer.alloc(bytes.length));
    await assert.rejects(prepared.assertReady(), fail('REMOTION_PUBLIC_ASSET_SHA_CHANGED'));
  }, diskOptions);
});

test('symlinked source and symlinked stage file are rejected', async () => {
  const link = path.join(root, 'source-link.png'); fs.symlinkSync(source, link);
  await assert.rejects(withRemotionPublicBuildV1({publicDir: stage('source-link'), assets: [{...asset, absolutePath: link}]}, action, diskOptions), fail('REMOTION_PUBLIC_ASSET_BYTES_CHANGED'));
  const publicDir = stage('stage-link'); fs.mkdirSync(publicDir, {recursive: true}); fs.symlinkSync(source, path.join(publicDir, asset.name));
  await assert.rejects(withRemotionPublicBuildV1({publicDir, assets: [asset]}, action, diskOptions), fail('REMOTION_PUBLIC_UNDECLARED_FILE'));
});

test('path traversal, malformed SHA/bytes and filename mismatch block before staging', async () => {
  for (const bad of [{...asset, name: '../source.png'}, {...asset, sha256: 'bad'}, {...asset, bytes: -1}, {...asset, name: 'a'.repeat(64) + '.png'}]) {
    await assert.rejects(withRemotionPublicBuildV1({publicDir: stage('malformed'), assets: [bad]}, action, diskOptions), fail('REMOTION_PUBLIC_ASSET_BINDING_INVALID'));
  }
  assert.equal(fs.existsSync(stage('malformed')), false);
});

test('source size or SHA changes and corrupt reused bytes do not reach bundler', async () => {
  await assert.rejects(withRemotionPublicBuildV1({publicDir: stage('wrong-size'), assets: [{...asset, bytes: asset.bytes + 1}]}, action, diskOptions), fail('REMOTION_PUBLIC_ASSET_BYTES_CHANGED'));
  const wrongSha = 'f'.repeat(64);
  await assert.rejects(withRemotionPublicBuildV1({publicDir: stage('wrong-sha'), assets: [{...asset, sha256: wrongSha, name: wrongSha + '.png'}]}, action, diskOptions), fail('REMOTION_PUBLIC_ASSET_SHA_CHANGED'));
  const publicDir = stage('corrupt'); fs.mkdirSync(publicDir, {recursive: true}); fs.writeFileSync(path.join(publicDir, asset.name), Buffer.alloc(bytes.length));
  await assert.rejects(withRemotionPublicBuildV1({publicDir, assets: [asset]}, action, diskOptions), fail('REMOTION_PUBLIC_ASSET_SHA_CHANGED'));
  assert.equal(fs.existsSync(stage('wrong-sha')), false);
});

test('low/unknown space blocks before mkdir/copy; a declared 953 MB source is simulated without allocation', async () => {
  const request = {publicDir: stage('low-space'), assets: [asset]};
  await assert.rejects(withRemotionPublicBuildV1(request, action, {...diskOptions, statfs: available(2 * 1024 ** 3)}), fail('REMOTION_DISK_SPACE_INSUFFICIENT'));
  for (const statfs of [() => { throw new Error('unavailable'); }, () => undefined, () => ({bsize: 4096, bavail: NaN})]) {
    await assert.rejects(withRemotionPublicBuildV1(request, action, {...diskOptions, statfs}), fail('REMOTION_DISK_SPACE_UNAVAILABLE'));
  }
  await assert.rejects(withRemotionPublicBuildV1({...request, assets: [{...asset, bytes: 953298954}]}, action,
    {...diskOptions, minFreeBytes: 0, statfs: available(953298954)}), fail('REMOTION_DISK_SPACE_INSUFFICIENT'));
  assert.equal(fs.existsSync(request.publicDir), false);
});

test('space is reprobed after staging and failure leaves evidence but never enters bundler', async () => {
  let probes = 0;
  await assert.rejects(withRemotionPublicBuildV1({publicDir: stage('space-dropped'), assets: [asset]}, action,
    {...diskOptions, statfs: () => ({bsize: 1, bavail: ++probes === 1 ? 10 * 1024 ** 3 : 0})}), fail('REMOTION_DISK_SPACE_INSUFFICIENT'));
  assert.deepEqual(fs.readFileSync(path.join(stage('space-dropped'), asset.name)), bytes);
  assert.equal(probes, 2);
});

test('same-runtime live reservations block oversubscription and release after a failed action', async () => {
  let entered, finish;
  const started = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { finish = resolve; });
  const options = {...diskOptions, minFreeBytes: 0, scratchBytes: 8, statfs: available(12)};
  const first = withRemotionPublicBuildV1({publicDir: stage('reserved-first'), assets: []}, async () => { entered(); await gate; throw new Error('synthetic-build-failed'); }, options);
  await started;
  await assert.rejects(withRemotionPublicBuildV1({publicDir: stage('reserved-second'), assets: []}, action, options), fail('REMOTION_DISK_SPACE_INSUFFICIENT'));
  finish(); await assert.rejects(first, /synthetic-build-failed/u);
  await withRemotionPublicBuildV1({publicDir: stage('reserved-after-release'), assets: []}, async (prepared) => {
    assert.equal(prepared.diskPlan.spaceObservations[0].otherReservedBytes, 0);
  }, options);
});

function fixture(label) {
  const scene = {width: 32, height: 24, fps: 30, durationInFrames: 1, layers: [
    {id: 'photo', nodeId: 'asset:media-files', artifactRole: 'original-image', x: 0, y: 0, width: 32, height: 24, z: 0, from: 0, durationInFrames: 1},
  ]};
  return {node: {id: label + ':remotion-render', shotId: label, inputSha256: sha(label), input: {parameters: {scene, output: 'still'}}},
    context: {artifactRoot: path.join(root, label), dependencies: {'asset:media-files': {state: 'succeeded', artifacts: [{...asset, kind: 'IMAGE', role: 'original-image'}]}}}};
}

test('ordinary registry selects this adapter; real execute wiring uses exact public via injected pure runners', async () => {
  assert.equal(createNodeAdapterRegistry().registry['remotion-render'].execute, remotionRenderNodeAdapterV1.execute);
  let bundles = 0, launches = 0, closes = 0;
  const adapter = createRemotionRenderNodeAdapterV1({diskOptions,
    loadBundler: () => ({bundle: async (options) => {
      bundles += 1; assert.ok(options.publicDir); assert.equal(options.enableCaching, false); assert.equal(options.symlinkPublicDir, false);
      assert.deepEqual(fs.readdirSync(options.publicDir), [asset.name]); return 'synthetic-bundle-url';
    }}),
    loadRenderer: () => ({openBrowser: async () => { launches += 1; return {close: async () => { closes += 1; }}; },
      selectComposition: async (options) => { assert.equal(options.inputProps.layers[0].src, asset.name); return {id: 'A1NodeShot'}; },
      renderStill: async ({output}) => { fs.writeFileSync(output, 'mock preview; never qualified'); }}),
  });
  const {node, context} = fixture('consumer');
  const result = await adapter.execute(node, context);
  assert.equal(result.state, 'needs-review'); assert.equal(result.productionAdmission, false); assert.equal(result.visualApproval, 'NOT_GRANTED');
  assert.deepEqual([bundles, launches, closes], [1, 1, 1]);
  const recipe = JSON.parse(fs.readFileSync(path.join(context.artifactRoot, 'renders', node.inputSha256, 'editable-scene.json')));
  assert.equal(recipe.buildProof.diskPlan.bundleReuse, false);
  assert.deepEqual(recipe.buildProof.assets, [{name: asset.name, bytes: asset.bytes, sha256: asset.sha256}]);
});

test('ordinary adapter blocks space and invalid frame before loading heavy runners', async () => {
  let loads = 0;
  const adapter = createRemotionRenderNodeAdapterV1({diskOptions: {...diskOptions, statfs: available(0)}, loadBundler: () => { loads += 1; throw new Error('must not load'); }});
  const {node, context} = fixture('consumer-low');
  assert.equal((await adapter.execute(node, context)).reason, 'REMOTION_DISK_SPACE_INSUFFICIENT');
  assert.equal(fs.existsSync(context.artifactRoot), false);
  node.input.parameters.frame = 2;
  assert.equal((await adapter.execute(node, context)).reason, 'RENDER_PREVIEW_FRAME_INVALID');
  assert.equal(loads, 0);
});

process.on('exit', () => console.log(JSON.stringify({fixtureRoot: root, fixturePolicy: 'RETAINED_NO_DELETION', realBundle: 0, realBrowser: 0, realEncoder: 0, largeMediaAllocated: 0})));
