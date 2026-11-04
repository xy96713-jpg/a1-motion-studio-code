import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {createRemotionBoundedBundleV1, remotionOutputBudgetPluginV1} from '../apps/studio-next/src/lib/a1-p45-remotion-build-consumer-v1.mjs';
import {runRemotionPublicBundleSmokeV1} from './run-remotion-public-bundle-smoke-v1.mjs';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'a1-bounded-bundle-pure-')));
const entryPoint = path.join(root, 'entry.tsx'); fs.writeFileSync(entryPoint, 'export {};');
const diskOptions = {statfs: () => ({bsize: 1, bavail: 10 * 1024 ** 3}), tempDir: root};
const sha = (b) => createHash('sha256').update(b).digest('hex');
const bytes = Buffer.from('tiny fixture only'), source = path.join(root, 'fixture.png'); fs.writeFileSync(source, bytes);
const asset = {absolutePath: source, bytes: bytes.length, sha256: sha(bytes), name: sha(bytes) + '.png'};
const request = (id, assets = []) => ({entryPoint, outDir: path.join(root, id, 'bundle'), publicDir: path.join(root, id, 'public'), assets});
function hooksFor(plugin) {
  let moduleFactory, compilation;
  plugin.apply({hooks: {normalModuleFactory: {tap: (_, fn) => { moduleFactory = fn; }}, thisCompilation: {tap: (_, fn) => { compilation = fn; }}}});
  let beforeResolve, processAssets;
  moduleFactory({hooks: {beforeResolve: {tap: (_, fn) => { beforeResolve = fn; }}}});
  return {resolve: (request) => beforeResolve({request}), emit: (assets) => {
    compilation({hooks: {processAssets: {tap: (_, fn) => { processAssets = fn; }}}, getAssets: () => assets}); processAssets();
  }};
}

test('external media and remote/data imports reject before compilation/output', () => {
  const hooks = hooksFor(remotionOutputBudgetPluginV1({maximumWebpackBytes: 100}));
  for (const source of ['/source/presenter.mov', './picture.png', './font.ttf', './pic.bmp', './audio.m4a', './audio.aac', './font.eot', 'https://host/main.js', 'data:image/png;base64,abc']) {
    assert.throws(() => hooks.resolve(source), /EXTERNAL_ASSET_IMPORT_FORBIDDEN/u);
  }
  hooks.resolve('react'); hooks.resolve('./component.tsx');
});

test('asset metadata over the byte limit rejects before emit without allocating it', () => {
  const hooks = hooksFor(remotionOutputBudgetPluginV1({maximumWebpackBytes: 100}));
  assert.throws(() => hooks.emit([{name: 'bundle.js', source: {size: () => 953298954}}]), /OUTPUT_LIMIT_BEFORE_EMIT/u);
  assert.throws(() => hooks.emit([{name: 'presenter.mov', source: {size: () => 1}}]), /UNDECLARED_EMITTED_ASSET/u);
  assert.throws(() => hooks.emit([{name: 'bundle.js.map', source: {size: () => 1}}]), /UNDECLARED_EMITTED_ASSET/u);
  hooks.emit([{name: 'bundle.js', source: {size: () => 100}}]);
});

test('exact consumer wires no cache/maps, serial compact mode, helper and actual copied-byte validation with mock bundler', async () => {
  const configSeen = [];
  const consumer = createRemotionBoundedBundleV1({diskOptions,
    loadMinimizer: () => class { constructor(options) { assert.deepEqual(options, {parallel: false, extractComments: false}); } },
    loadBundler: () => ({bundle: async (options) => {
      const config = options.webpackOverride({optimization: {}, plugins: [], resolve: {}}); configSeen.push(config);
      assert.equal(options.enableCaching, false); assert.equal(options.symlinkPublicDir, false); assert.ok(options.publicDir);
      assert.equal(config.devtool, false); assert.equal(config.cache, false); assert.equal(config.optimization.emitOnErrors, false);
      const hooks = hooksFor(config.plugins.at(-1)); hooks.emit([{name: 'bundle.js', source: {size: () => 3}}]);
      fs.mkdirSync(path.join(options.outDir, 'public'), {recursive: true});
      fs.writeFileSync(path.join(options.outDir, 'bundle.js'), 'abc'); fs.writeFileSync(path.join(options.outDir, 'index.html'), 'tiny html');
      for (const name of fs.readdirSync(options.publicDir)) fs.copyFileSync(path.join(options.publicDir, name), path.join(options.outDir, 'public', name));
      return options.outDir;
    }}),
  });
  const empty = await consumer(request('empty')); assert.equal(empty.publicBytes, 0); assert.deepEqual(empty.publicFiles, []);
  const exact = await consumer({...request('exact', [asset]), compact: true});
  assert.equal(exact.publicBytes, bytes.length); assert.deepEqual(exact.publicFiles, [asset.name]);
  assert.equal(exact.totalNewBytes, exact.measured.bytes + bytes.length); assert.equal(exact.productionAdmission, false);
  for (const file of exact.measured.files) assert.match(file.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(configSeen[0].optimization.minimize, false); assert.equal(configSeen[1].optimization.minimize, true);
});

test('low space, polluted empty stage and null public do not load a bundler', async () => {
  let loads = 0; const loadBundler = () => { loads += 1; throw new Error('must not load'); };
  const low = createRemotionBoundedBundleV1({diskOptions: {...diskOptions, statfs: () => ({bsize: 1, bavail: 0})}, loadBundler});
  await assert.rejects(low(request('low')), /DISK_SPACE_INSUFFICIENT/u); assert.equal(fs.existsSync(path.dirname(request('low').outDir)), false);
  const consumer = createRemotionBoundedBundleV1({diskOptions, loadBundler}), dirty = request('dirty');
  fs.mkdirSync(dirty.publicDir, {recursive: true}); fs.writeFileSync(path.join(dirty.publicDir, 'presenter.mov'), 'preserved');
  await assert.rejects(consumer(dirty), /PUBLIC_UNDECLARED_FILE/u);
  await assert.rejects(consumer({...request('null'), publicDir: null}), /SIBLING_PUBLIC_REQUIRED/u);
  assert.equal(loads, 0); assert.equal(fs.readFileSync(path.join(dirty.publicDir, 'presenter.mov'), 'utf8'), 'preserved');
});

test('undeclared or changed bundle public bytes cannot produce a PASS receipt', async () => {
  const consumer = createRemotionBoundedBundleV1({diskOptions, loadBundler: () => ({bundle: async (options) => {
    fs.mkdirSync(path.join(options.outDir, 'public'), {recursive: true}); fs.writeFileSync(path.join(options.outDir, 'public', asset.name), Buffer.alloc(bytes.length)); return options.outDir;
  }})});
  await assert.rejects(consumer(request('bad-public-sha', [asset])), /PUBLIC_SHA_CHANGED/u);
});

test('existing output, different stage parent and out-of-range byte budgets reject', async () => {
  const consumer = createRemotionBoundedBundleV1({diskOptions});
  const existing = request('existing'); fs.mkdirSync(existing.outDir, {recursive: true});
  await assert.rejects(consumer(existing), /FRESH_ENTRY_OUTPUT_REQUIRED/u);
  await assert.rejects(consumer({...request('other-parent'), publicDir: path.join(root, 'other', 'public')}), /SIBLING_PUBLIC_REQUIRED/u);
  for (const maximumOutputBytes of [0, 21 * 1024 ** 2, NaN]) await assert.rejects(consumer({...request('bad-budget'), maximumOutputBytes}), /OUTPUT_BUDGET_INVALID/u);
});

test('smoke import and rejected invocation cannot start a real bundle', async () => {
  await assert.rejects(runRemotionPublicBundleSmokeV1({outputRoot: path.join(root, 'never-created'), workDeadlineMs: 0}), /FRESH_OWNED_OUTPUT_AND_DEADLINE_REQUIRED/u);
  assert.equal(fs.existsSync(path.join(root, 'never-created')), false);
});

test('smoke rejects an output ancestor symlink before any fixture write', async () => {
  const target = path.join(root, 'link-target'); fs.mkdirSync(target); const link = path.join(root, 'link-parent'); fs.symlinkSync(target, link);
  await assert.rejects(runRemotionPublicBundleSmokeV1({outputRoot: path.join(link, 'new-output'), workDeadlineMs: Date.now() + 1000}), /OUTPUT_PATH_INVALID/u);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('output created during async preflight is preserved and bundle is not called', async () => {
  const args = request('raced-output'); let bundles = 0;
  const consumer = createRemotionBoundedBundleV1({diskOptions, loadBundler: () => {
    fs.mkdirSync(args.outDir); fs.writeFileSync(path.join(args.outDir, 'preserve.txt'), 'preserve');
    return {bundle: async () => { bundles += 1; }};
  }});
  await assert.rejects(consumer(args), /FRESH_ENTRY_OUTPUT_REQUIRED/u);
  assert.equal(bundles, 0); assert.equal(fs.readFileSync(path.join(args.outDir, 'preserve.txt'), 'utf8'), 'preserve');
});
process.on('exit', () => console.log(JSON.stringify({fixtureRoot: root, fixturesRetained: true, realBundles: 0, realBrowser: 0, realEncoder: 0, largeMediaAllocated: 0, filesDeleted: 0})));
