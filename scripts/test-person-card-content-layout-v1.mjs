import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {solvePersonCardContentLayoutV1} from '../apps/studio-next/src/lib/a1-person-card-content-layout-v1.mjs';

const sha = s => createHash('sha256').update(s).digest('hex');
const fonts = {name: 'fixture-cjk', latin: 'fixture-latin', detail: 'fixture-cjk', disclosure: 'fixture-cjk'};
function input(texts = [['name', '排版测试'], ['latin', 'Measured layout'], ['detail', '完整原文，保持原样。'], ['disclosure', '合成排版测试，非人物事实']]) {
  const fields = texts.map(([role, text], i) => ({id: `field-${i}`, role, text, authority: {status: 'LOCKED', kind: 'SYNTHETIC_TEST', sha256: sha(text)}}));
  return {contract: 'A1PersonCardContentLayoutInput/v1', id: 'layout-development', canvas: {width: 1280, height: 960},
    recipe: 'EDITORIAL_PERSON_CONTAIN_V1', photo: {assetId: 'fixture-photo', path: '/fixture.jpg', sha256: 'a'.repeat(64), width: 1000, height: 1050},
    fields, fontRoleBindings: fonts, constraints: {}, copyLock: {status: 'LOCKED', sha256: sha(fields.map(f => f.text).join(''))}};
}
// Explicit synthetic measurements exercise algorithm control flow; actual-font equivalence is tested separately.
const measurement = {measure(text, fontId, size) {
  if (!Object.values(fonts).includes(fontId)) throw Object.assign(new Error('Unknown font'), {reason: 'FONT_BINDING_MISMATCH'});
  const width = [...text].reduce((sum, c) => sum + size * (c === 'W' ? .95 : c === 'i' ? .15 : /\p{Zs}/u.test(c) ? .25 : /\p{M}/u.test(c) ? 0 : .65), 0);
  return {advanceWidth: width, inkBounds: {minX: 0, minY: -size * .8, maxX: width, maxY: size * .1},
    ascent: size * .8, descent: -size * .2, lineGap: 0, glyphCount: [...text].length, fontSHA: 'b'.repeat(64)};
}};
let checks = 0;
const positive = v => {
  const result = solvePersonCardContentLayoutV1(v, measurement); assert.equal(result.status, 'READY', JSON.stringify(result));
  assert.equal(result.runs.map(r => r.text).join(''), v.fields.map(f => f.text).join(''));
  assert.ok(result.runs.every(r => r.fontSize >= (v.fields.find(f => f.id === r.fieldId).role === 'name' ? 32 : 24)
    && r.horizontalScale === 1 && r.verticalScale === 1));
  assert.deepEqual(solvePersonCardContentLayoutV1(v, measurement), result); checks++; return result;
};
const reject = (v, reason) => {const r = solvePersonCardContentLayoutV1(v, measurement); assert.equal(r.status, 'BLOCKED'); assert.equal(r.reason, reason, JSON.stringify(r)); assert.ok(!r.runs); checks++;};
assert.equal(positive(input()).decision.variant, 'side');
const stack = input(); stack.canvas = {width: 720, height: 1280}; stack.photo.width = 607; stack.photo.height = 430;
assert.equal(positive(stack).decision.variant, 'stack');
positive(input([['name', '测试'], ['latin', 'office  café keeps  spaces '], ['disclosure', '合成排版测试，非人物事实']]));
const narrow = positive(input([['name', '测量'], ['latin', 'i'.repeat(45)], ['disclosure', '合成排版测试，非人物事实']]));
const wide = positive(input([['name', '测量'], ['latin', 'W'.repeat(45)], ['disclosure', '合成排版测试，非人物事实']]));
assert.ok(wide.fieldPlans[1].lineCount > narrow.fieldPlans[1].lineCount || wide.fieldPlans[1].fontSize < narrow.fieldPlans[1].fontSize, 'Measured widths, not equal character-count estimates');
const overflowing = input([['name', '测试'], ['detail', 'W'.repeat(400)], ['disclosure', '合成排版测试，非人物事实']]); overflowing.canvas = {width: 640, height: 640};
reject(overflowing, 'TEXT_CAPACITY_EXCEEDED');
const numeric = input(); numeric.id = 123; reject(numeric, 'INVALID_INPUT');
const coords = input(); coords.x = 30; reject(coords, 'INVALID_INPUT');
const squeezed = input(); squeezed.constraints.minSupportFontPx = 23; reject(squeezed, 'INVALID_INPUT');
const badLock = input(); badLock.copyLock.sha256 = '0'.repeat(64); reject(badLock, 'COPY_LOCK_MISMATCH');
reject(input([['name', '测试']]), 'SYNTHETIC_DISCLOSURE_REQUIRED');
reject(input([['name', 'اختبار'], ['disclosure', '合成排版测试，非人物事实']]), 'UNSUPPORTED_SCRIPT');
const changedProtection = input(); changedProtection.photo.protectedRegions = [{id: 'roi', x: 0, y: 0, width: 1, height: 1,
  sourceSha256: 'c'.repeat(64), evidence: {path: '/evidence.json', sha256: 'd'.repeat(64)}}]; reject(changedProtection, 'PROTECTED_REGION_BINDING_MISMATCH');
const tooSmall = input(); tooSmall.photo.width = 12000; tooSmall.photo.height = 32; reject(tooSmall, 'PHOTO_RENDERED_TOO_SMALL');
const missing = solvePersonCardContentLayoutV1(input(), {measure() {throw Object.assign(new Error('Missing'), {reason: 'MISSING_GLYPH'});}});
assert.equal(missing.reason, 'MISSING_GLYPH'); checks++;
console.log(JSON.stringify({status: 'PASS', checks, measurement: 'EXPLICIT_SYNTHETIC_FIXTURE', actualPixelsOrRenderer: false, holdoutFilesUsed: false}));
