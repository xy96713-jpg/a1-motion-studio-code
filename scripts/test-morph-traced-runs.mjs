import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as kit from '../work/recipe-board-v1/style-lab/engine/templates/kit2.js';

const templates = new URL('../work/recipe-board-v1/style-lab/engine/templates/', import.meta.url);
const morph = fs.readFileSync(new URL('morph.js', templates), 'utf8');
const kitSource = fs.readFileSync(new URL('kit2.js', templates), 'utf8');
// Execute the actual traced fillText wrapper, not a reimplementation. The sink
// replaces downstream geometry/raster capture only; no browser/font pixels here.
const start = morph.indexOf('  g.fillText = function (text, x, y, ...rest) {', morph.indexOf('function traced('));
const end = morph.indexOf('  const tracedFill = function', start);
assert.ok(start >= 0 && end > start, 'actual traced wrapper extraction boundary');
const wrapper = morph.slice(start, end);
const inkStart = kitSource.indexOf('function inkSide(');
const inkEnd = kitSource.indexOf('\nconst blockOn', inkStart);
assert.ok(inkStart >= 0 && inkEnd > inkStart, 'actual shared measurement extraction boundary');
const inkSide = vm.runInNewContext(`${kitSource.slice(inkStart, inkEnd)}; inkSide`, {...kit});
const size = 64, face = '"House Kokka"';
const font = `400 ${size}px ${face}`;
// Deliberately synthetic, additive metrics: CJK 60px, Latin 45px, slash
// 64px. This catches slash envelope contamination without claiming real ink.
function context(text, role, align) {
  const stack = [], measured = [];
  return {font, textAlign: align, globalAlpha: .8, __cued: true,
    __line: text, __typeRole: role, measured,
    getTransform: () => ({a: 1, b: 0}),
    save() { stack.push([this.font, this.textAlign]); },
    restore() { [this.font, this.textAlign] = stack.pop(); },
    measureText(t) {
      const k = parseFloat(this.font.match(/([\d.]+)px/)[1]) / size;
      const width = [...String(t)].length * 32 * k;
      const height = /[/|]/.test(t) ? 64 : /[\u3400-\u9fff]/.test(t) ? 60 : 45;
      measured.push({text: String(t), k, width});
      return {width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width,
        actualBoundingBoxAscent: height * k, actualBoundingBoxDescent: 0};
    }};
}
function draw(text, role, align, overrides = {}) {
  const g = context(text, role, align), out = [];
  vm.runInNewContext(wrapper, {...kit, ...overrides, g, TERM_PX: 90,
    TERM_CHARS: 12, bareW: String, cueGate: () => 1,
    tracedFill(t, x, y) { const m = g.measureText(t);
      // Convert native canvas anchor to a left edge, including the unsplit path.
      const left = x - (g.textAlign === 'center' ? m.width / 2 : g.textAlign === 'right' ? m.width : 0);
      out.push({text: t, x: left, y,
      k: parseFloat(g.font.match(/([\d.]+)px/)[1]) / size, width: m.width,
      height: m.actualBoundingBoxAscent, role: g.__typeRole}); }});
  g.fillText(text, 500, 100);
  assert.equal(g.font, font);
  assert.equal(g.textAlign, align);
  assert.equal(g.globalAlpha, .8);
  // __line restoration is a separate historical issue, not changed here.
  return out;
}
function close(a, b, message) { assert.ok(Math.abs(a - b) < 1e-8, `${message}: ${a} vs ${b}`); }
function contract(text, role, expected, bible, overrides = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = {__bible: bible};
  try {
    assert.deepEqual(kit.typeRuns(text), expected, 'shared run semantics');
    for (const align of ['left', 'center', 'right']) {
      const out = draw(text, role, align, overrides);
      assert.deepEqual(out.map(r => r.text), expected, 'actual traced run sequence');
      assert.equal(out.map(r => r.text).join(''), text, 'no text lost');
      const g = context(text, role, align);
      const [left, right] = inkSide(g, text, size, face, align);
      close(out[0].x, 500 - left, 'draw start matches shared inkSide');
      close(out.at(-1).x + out.at(-1).width, 500 + right, 'draw end matches shared inkSide');
      for (const [i, r] of out.entries()) {
        const mixed = /[\u3400-\u9fff]/.test(text);
        const scaled = bible && (mixed || (role !== 'caption' && /\d/.test(r.text))) && /[A-Za-z0-9]/.test(r.text) && !/[\u3400-\u9fff]/.test(r.text);
        close(r.k, scaled ? 60 / 45 : 1, 'independent mock-metric scale oracle');
        close(r.y, 100, 'zero-descent fixture baseline');
        assert.equal(r.role, role);
        if (i) close(r.x, out[i - 1].x + out[i - 1].width, 'contiguous advances');
        if (scaled) assert.ok(g.measured.some(m => m.text === r.text && Math.abs(m.k - r.k) < 1e-8), 'shared measurement uses drawn scale');
      }
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  }
}
const samples = [
  ['middle dot', '8·05', 'figure', ['8', '·', '05']],
  ['hyphenation point', '8‧05', 'figure', ['8', '‧', '05']],
  ['katakana dot', '8・05', 'figure', ['8', '・', '05']],
  ['decimal percent', '31.6% 中文', 'sub', ['31.6% ', '中文']],
  ['digits with CJK', '23萬枚', 'sub', ['23', '萬枚']],
  ['mixed ISO slash', 'ISO/FTC 單一數據', 'sub', ['ISO', '/', 'FTC ', '單一數據']],
  ['mixed caption', '1940—1960 · 烏盧阿河谷', 'caption', ['1940—1960 ', '·', ' ', '烏盧阿河谷']],
  ['Latin caption', 'APS · Ploetz · 2005', 'caption', ['APS ', '·', ' Ploetz ', '·', ' 2005']],
  ['Latin-only slash', 'ISO/FTC source', 'caption', ['ISO/FTC source']],
];
// Explicit opt-in fault injection lives only in this test process. Run the same
// tests against the pre-fix policies to demonstrate RED without editing sources.
const legacySplit = t => String(t).split(kit.RUN_SPLIT).filter(Boolean);
const legacyScale = (g, r) => /\d/.test(r) ? kit.figureScale(g, r) : 1;
const overrides = process.env.RB_TEST_TRACED_LEGACY === 'split' ? {typeRuns: legacySplit}
  : process.env.RB_TEST_TRACED_LEGACY === 'scale' ? {figureScale: legacyScale} : {};
for (const [name, text, role, expected] of samples) {
  for (const bible of [true, false]) test(`actual traced / shared measure: ${name}, bible=${bible}`, () => {
    const runs = !bible && name === 'mixed ISO slash' ? ['ISO/FTC ', '單一數據'] : expected;
    contract(text, role, runs, bible, overrides);
  });
}
test('negative control: old direct RUN_SPLIT drawing fails shared slash contract', () => {
  assert.throws(() => contract('ISO/FTC 中文', 'sub', ['ISO', '/', 'FTC ', '中文'], true,
    {typeRuns: legacySplit}), {code: 'ERR_ASSERTION', message: /actual traced run sequence/});
});
test('negative control: old digit-only scaling fails shared letter measurement', () => {
  assert.throws(() => contract('ISO/FTC 中文', 'sub', ['ISO', '/', 'FTC ', '中文'], true,
    {figureScale: legacyScale}), {code: 'ERR_ASSERTION', message: /draw end matches shared inkSide/});
});
