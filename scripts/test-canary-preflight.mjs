// Offline checks for scripts/canary-preflight.mjs: syntax mapping, GLB refs, material-drop and manifest gates.
// No browser, no writes outside a temp directory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { moduleScripts, syntaxErrors, glbRefs, resolveGlb, materialDropErrors, manifestErrors } from './canary-preflight.mjs';

// 1. a module script's syntax error is reported on the page's own line (not the extracted file's line)
const broken = ['<!doctype html>', '<div id="out"></div>', '<script type="module">', 'const a = 1;', 'const b = ;', '</script>'].join('\n');
const scripts = moduleScripts(broken);
assert.equal(scripts.length, 1, 'one module script found');
assert.equal(scripts[0].startLine, 3, 'the module code starts on the page line after <script>');
const syn = syntaxErrors(broken);
assert.equal(syn.errors.length, 1);
assert.match(syn.errors[0], /page line 5/, 'the parser line is mapped back to the HTML page line');
assert.match(syn.errors[0], /script 1 does not parse/);
const good = '<!doctype html>\n<script type="module">\nconst a = 1;\nwindow.__ready = true;\n</script>';
assert.deepEqual(syntaxErrors(good).errors, [], 'a parsing module passes');
assert.match(syntaxErrors('<html><body>no script</body></html>').errors.join('/'), /no <script> block/);
assert.deepEqual(moduleScripts('<script type="importmap">{}</script><script type="module">const x = 1;</script>').length, 1, 'importmap is not the module');
// a canary may use a classic <script> (E-type does); its syntax is checked the same way
const classicBroken = ['<!doctype html>', '<script>', 'var a = 1;', 'var b = ;', '</script>'].join('\n');
const classic = syntaxErrors(classicBroken);
assert.equal(classic.errors.length, 1, 'classic script syntax checked');
assert.match(classic.errors[0], /page line 4/, 'classic script error mapped to the page line');
assert.deepEqual(syntaxErrors('<script>var ok = 1;</script>').errors, [], 'a parsing classic script passes');
console.log('canary preflight: module extraction and page-line syntax mapping verified');

// 2. GLB references resolve from the page's URL space (a leading / is the repo root)
const refs = glbRefs(`const a = await loader.loadAsync('/work/recipe-board-v1/style-lab/engine/subjects/parts/banana.glb');\nconst b = 'parts/other.glb';`);
assert.deepEqual(refs.sort(), ['/work/recipe-board-v1/style-lab/engine/subjects/parts/banana.glb', 'parts/other.glb']);
assert.ok(resolveGlb('/work/x.glb', '/tmp/canary').endsWith(path.join('work', 'x.glb')));
assert.equal(resolveGlb('parts/other.glb', '/tmp/canary'), path.resolve('/tmp/canary', 'parts/other.glb'));
assert.deepEqual(glbRefs('no model here'), []);
console.log('canary preflight: GLB references and URL resolution verified');

// 3. a textured GLB whose material the page replaces loses the baked colour/normal maps (the 2026-11-04 A-3d move)
const drop = `const gltf = await loader.loadAsync('x.glb');
const src = gltf.scene;
src.traverse(o => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: '#d9a21f', roughness: .5 }); } });`;
const textured = { images: 2, textures: 2, uv: true, baseColorTexture: true, normalTexture: true };
assert.equal(materialDropErrors(drop, textured).length, 1, 'assigning a code material over a textured model fails');
assert.match(materialDropErrors(drop, textured)[0], /baked colour\/normal maps are dropped/);
assert.deepEqual(materialDropErrors(drop, { images: 0 }), [], 'an untextured model may be given a material');
assert.deepEqual(materialDropErrors(`gltf.scene.traverse(o => { o.castShadow = true; });`, textured), [], 'touching the model without a material assign passes');
console.log('canary preflight: baked-texture material-drop detection verified');

// 4. an unregistered or failed canary cannot stand in for a design direction
const manifest = { contract: 'A1EffectCanary/v1', canaries: [{ id: 'A-camera', verdict: 'mechanical-pass' }, { id: 'E-type', verdict: 'needs-type' }] };
const quality = { contract: 'A1CanaryQualityReport/v1', canaries: [{ id: 'A-camera', verdict: 'pass', errors: [] }, { id: 'E-type', verdict: 'fail', errors: ['dark area 39.0%'] }] };
assert.deepEqual(manifestErrors(manifest, quality, 'A-camera'), [], 'registered + quality pass passes');
assert.match(manifestErrors(manifest, quality, 'A-3d-final').join('/'), /not registered in canaries\/manifest\.json/);
assert.match(manifestErrors(manifest, quality, 'E-type').join('/'), /needs-type/, 'manifest verdict gates');
assert.match(manifestErrors(manifest, quality, 'E-type').join('/'), /dark area 39\.0/, 'failed quality metrics are quoted');
assert.match(manifestErrors(manifest, null, 'A-camera', 'banana-design').join('/'), /canary-quality\.mjs --project banana-design/, 'missing quality report names the exact command');
console.log('canary preflight: manifest registration and quality gates verified');

// 5. --write target stays under the project's canaries dir (shape check, no fs writes here)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canary-preflight-'));
try {
  assert.match(path.join(dir, 'preflight', 'A-camera.json'), /preflight/);
} finally { fs.rmSync(dir, { recursive: true }); }
console.log('canary preflight: report path shape verified');

// 6. the design gate refuses a direction whose frame/motion comes from a canary that has no passing preflight report
const { canaryIdInPath, canaryPreflightErrors, validateDesignBoard } = await import('./design-gate.mjs');
assert.equal(canaryIdInPath('work/recipe-board-v1/projects/p/canaries/A-3d-final/out/stills/clean-000.png'), 'A-3d-final');
assert.equal(canaryIdInPath('out/design-directions-20261104/A.png'), null, 'a normal still is not canary content');
assert.deepEqual(canaryPreflightErrors('no-such-project', null, 'frame', 'x'), []);
assert.match(canaryPreflightErrors('no-such-project', 'A-3d-final', 'frame', 'work/…/canaries/A-3d-final/out/x.png').join('/'), /without a passing canary preflight/);
const board = {
  contract: 'A1DesignBoard/v2', project: 'no-such-project', line: 'x', visualThesis: 'a thesis long enough',
  world: { name: 'w', space: 's', material: 'm', light: 'l', cameraGrammar: 'c', typeSystem: 't', seamGrammar: 's' },
  directions: [{ id: 'A', thesis: 'a thesis long enough', medium: '3d', build: '3d', frame: 'work/recipe-board-v1/projects/no-such-project/canaries/Fake/out/x.png', motion: 'work/recipe-board-v1/projects/no-such-project/canaries/Fake/out/x.mp4', checks: { composite: 'pass' } }],
};
const gate = validateDesignBoard(board).join('\n');
assert.match(gate, /frame uses canary Fake without a passing canary preflight/, 'design gate blocks un-preflighted canary frames');
assert.match(gate, /motion uses canary Fake without a passing canary preflight/);
console.log('canary preflight: design-gate promotion block verified');
