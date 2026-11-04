import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createVerifiedPersonCardMeasurementV1, preparePersonCardContentLayoutV1} from '../apps/studio-next/src/lib/a1-person-card-content-preparation-v1.mjs';
import {compileFontkitGlyphPathManifestV1} from '../apps/studio-next/src/lib/a1-fontkit-glyph-path-compiler-v1.mjs';
import {compileShotTaskWorkspaceV1} from '../apps/studio-next/src/lib/a1-shot-task-graph-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'work/module-development-launch-v1/person-card-content-layout-v1/INTERFACE-AND-SUPPORTED-LIMITS-v1.json')));
const fonts = spec.existingVerifiedInputs.fontPreset;
const measurement = createVerifiedPersonCardMeasurementV1(fonts);
for (const [fontId, text, size] of [['eva-cn', '测量测试', 64], ['identity-en', 'AV office ffi gy', 38], ['support', '字号底线，保留完整文字。', 24]]) {
  const font = fonts.find(f => f.id === fontId), measured = measurement.measure(text, fontId, size);
  const compiled = compileFontkitGlyphPathManifestV1({manifestId: `layout-measure-${fontId}`, exactCopy: text, fontFile: font.path, fontId, placement: {x: 0, baselineY: 0, fontSize: size}});
  assert.equal(measured.fontSHA, compiled.font.sha256);
  assert.equal(measured.glyphCount, compiled.run.glyphCount);
  for (const k of ['minX', 'minY', 'maxX', 'maxY']) assert.ok(Math.abs(measured.inkBounds[k] - compiled.run.canvasInkBounds[k]) < 1e-7, `Actual outline ${fontId}/${k}`);
  assert.ok(Math.abs(measured.advanceWidth - compiled.run.advanceWidth * size / compiled.font.unitsPerEm) < 1e-7);
}
assert.throws(() => measurement.measure('🧬', 'eva-cn', 32), e => e.reason === 'MISSING_GLYPH');
assert.throws(() => createVerifiedPersonCardMeasurementV1([{...fonts[0], sha256: '0'.repeat(64)}]), e => e.reason === 'FONT_BINDING_MISMATCH');
assert.equal((await preparePersonCardContentLayoutV1({photo: {path: '/nonexistent/private.png', sha256: '0'.repeat(64)}})).reason, 'PHOTO_BINDING_MISMATCH');
const photo = {assetId: 'verified-development-photo', path: spec.existingVerifiedInputs.photo.path,
  sha256: spec.existingVerifiedInputs.photo.sha256, width: 1000, height: 1050};
const originalField = {id: 'fact', role: 'name', text: '潘梓正', authority: {kind: 'SOURCE_EXACT', evidence: spec.existingVerifiedInputs.realCopyAuthority}};
// Deliberately stop after trusted source validation at the invalid-font guard: no solver/runtime needed.
const sourceProbe = {photo, fields: [originalField], fontRoleBindings: {name: 'unknown-font'}};
assert.equal((await preparePersonCardContentLayoutV1(sourceProbe)).reason, 'FONT_BINDING_MISMATCH', 'Real source fact and photograph bytes validated');
assert.equal((await preparePersonCardContentLayoutV1({...sourceProbe, photo: {...photo, width: 999}})).reason, 'PHOTO_BINDING_MISMATCH');
assert.equal((await preparePersonCardContentLayoutV1({...sourceProbe, fields: [{...originalField, text: '不存在的身份事实'}]})).reason, 'COPY_LOCK_MISMATCH');
assert.equal((await preparePersonCardContentLayoutV1({...sourceProbe, fields: [{...originalField, text: '计算机科学博士'}]})).reason, 'COPY_LOCK_MISMATCH', 'Verified fact cannot be relabeled as a person name');
assert.equal((await preparePersonCardContentLayoutV1({...sourceProbe, photo: {...photo, protectedRegions: [{id: 'guessed-face', x: .1, y: .1, width: .2, height: .2,
  sourceSha256: photo.sha256, evidence: spec.existingVerifiedInputs.realCopyAuthority}]}})).reason, 'PROTECTED_REGION_BINDING_MISMATCH');
const sourceDir = path.join(root, 'work/module-development-launch-v1/environments/sources/work/content-layout-source-bindings-v1');
const handoff = JSON.parse(fs.readFileSync(path.join(sourceDir, 'handoff.json')));
const liangPhoto = {assetId: 'verified-alternate-photo', path: handoff.photo.absolutePath, sha256: handoff.photo.sha256, width: 607, height: 430};
const liangProbe = {photo: liangPhoto, fields: [{id: 'name', role: 'name', text: '梁文锋', authority: {kind: 'SOURCE_EXACT',
  evidence: {path: handoff.nameAuthority.absolutePath, sha256: handoff.nameAuthority.sha256}}}], fontRoleBindings: {name: 'unknown-font'}};
assert.equal((await preparePersonCardContentLayoutV1(liangProbe)).reason, 'FONT_BINDING_MISMATCH', 'Alternate public source photo and exact name verified');
assert.equal((await preparePersonCardContentLayoutV1({...sourceProbe, photo: liangPhoto})).reason, 'PHOTO_BINDING_MISMATCH', 'Names cannot cross-bind another person photograph');
console.log(JSON.stringify({status: 'PASS', checks: ['3 real fonts match incumbent outline compiler and advance', 'missing glyph rejects',
  'font SHA rejects', 'unverified photo path rejects before read', 'actual Pan/Liang source bindings', 'wrong photo dimensions reject',
  'unsourced factual copy rejects', 'unverified face annotation rejects'], rendererRuns: 0, actualPixelReview: false}));

if (process.argv.includes('--with-solver')) {
  const sha = value => createHash('sha256').update(value).digest('hex');
  const fields = [['name', '排版测试'], ['latin', 'Layout test'], ['detail', '完整文字保持原样。'], ['disclosure', '合成排版测试，非人物事实']]
    .map(([role, text], i) => ({id: `field-${i}`, role, text, authority: {status: 'LOCKED', kind: 'SYNTHETIC_TEST', sha256: sha(text)}}));
  const input = {contract: 'A1PersonCardContentLayoutInput/v1', id: 'content-layout-development', canvas: {width: 1280, height: 960},
    recipe: spec.recipe, photo: {assetId: 'verified-development-photo', path: spec.existingVerifiedInputs.photo.path,
      sha256: spec.existingVerifiedInputs.photo.sha256, width: 1000, height: 1050}, fields,
    fontRoleBindings: {name: 'eva-cn', latin: 'identity-en', detail: 'support', disclosure: 'support'}, constraints: {},
    copyLock: {status: 'LOCKED', sha256: sha(fields.map(f => f.text).join(''))}};
  const prepared = await preparePersonCardContentLayoutV1(input);
  assert.equal(prepared.status, 'READY', JSON.stringify(prepared));
  assert.deepEqual(await preparePersonCardContentLayoutV1(input), prepared, 'Actual font preparation deterministic');
  assert.equal(prepared.parameters['editable-typography'].runs.map(r => r.text).join(''), input.fields.map(f => f.text).join(''));
  assert.ok(prepared.layout.runs.every(r => r.horizontalScale === 1 && r.verticalScale === 1));
  const bad = structuredClone(input); bad.photo.width++;
  assert.equal((await preparePersonCardContentLayoutV1(bad)).reason, 'PHOTO_BINDING_MISMATCH');
  const fake = structuredClone(input); fake.fields[0].authority = {...fake.fields[0].authority, kind: 'SOURCE_EXACT', evidence: spec.existingVerifiedInputs.realCopyAuthority};
  assert.equal((await preparePersonCardContentLayoutV1(fake)).reason, 'COPY_LOCK_MISMATCH');
  const matrix = [];
  for (const canvas of [{width: 1280, height: 960}, {width: 720, height: 1280}]) for (const photo of [input.photo, liangPhoto]) {
    const test = {...input, canvas, photo};
    const p = await preparePersonCardContentLayoutV1(test);
    assert.equal(p.status, 'READY', JSON.stringify(p));
    assert.equal(p.layout.runs.map(r => r.text).join(''), fields.map(f => f.text).join(''));
    for (const r of p.layout.runs) {
      const binding = fonts.find(f => f.id === r.fontId), actual = compileFontkitGlyphPathManifestV1({manifestId: `actual-run-${r.fieldId}`,
        exactCopy: r.text, fontFile: binding.path, fontId: r.fontId, placement: {x: r.x, baselineY: r.baselineY, fontSize: r.fontSize}});
      for (const k of ['minX', 'minY', 'maxX', 'maxY']) assert.ok(Math.abs(r.inkBounds[k] - actual.run.canvasInkBounds[k]) < 1e-7, `Prepared run ink ${k}`);
    }
    const plan = {contract: 'A1ShotTaskPlan/v1', scope: 'RESEARCH_ONLY', productionAdmission: false, projectId: test.id,
      shots: [{id: test.id, sourceVersionSha256: p.layout.inputSha256, sourceText: p.layout.exactCopy, visualJob: 'Development layout', exactCopy: fields.map(f => f.text),
        tasks: Object.entries(p.parameters).map(([module, parameters]) => ({module, dependencies: module === 'layer-compositor' ? ['media-files', 'editable-typography'] : [], parameters}))}]};
    assert.equal(compileShotTaskWorkspaceV1(plan).production.shotIntelligence.currentStoryboardAuthority.shots.length, 1);
    matrix.push({canvas, sourcePhotoSHA: photo.sha256, variant: p.layout.decision.variant, scale: p.layout.decision.scale, runs: p.layout.runs.length});
  }
  const long = structuredClone(input); long.canvas = {width: 640, height: 640}; long.fields[2].text = '宽'.repeat(400);
  long.fields[2].authority.sha256 = sha(long.fields[2].text); long.copyLock.sha256 = sha(long.fields.map(f => f.text).join(''));
  assert.equal((await preparePersonCardContentLayoutV1(long)).reason, 'TEXT_CAPACITY_EXCEEDED');
  console.log(JSON.stringify({status: 'PASS', actualFonts: true, solver: true, matrix, actualCapacityReject: true, ordinaryGraphCompile: true, nativeOrPixelPASS: false}));
}
