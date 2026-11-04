import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { loadPackaging, loadBenchmarks, loadGawx, loadPairing, pairingErrors, compositeErrors, packagingErrors, benchmarkErrors, gawxErrors, benchmarkForCategory, allVariants, variantById, pickVariants, scoreVariant, resolveParams, contractErrors, invariants, contrastRatioHex, hueDiff, assignPackaging, packagingShotErrors, sequencePackagingErrors, harmonyErrors, typeCompositionErrors } from '../apps/studio-next/src/lib/recipe-board/packaging.mjs';

const DATA = path.join(process.cwd(), 'work/recipe-board-v1');
const pkg = loadPackaging(DATA);
const bench = loadBenchmarks(DATA);
const gawx = loadGawx(DATA);
const pairing = loadPairing(DATA);

test('packaging: the taxonomy loads and is structurally valid', () => {
  assert.ok(pkg, 'taxonomy file must exist');
  assert.deepEqual(packagingErrors(pkg), []);
  assert.ok(allVariants(pkg).length >= 47, 'enough variants to be useful');
  assert.equal(pkg.categories.length, 10);
});

test('packaging: invariants are the house invariants, not per-variant choices', () => {
  const inv = invariants(pkg);
  assert.deepEqual(inv.typeLadder, [300, 200, 128, 64, 48]);
  assert.equal(inv.leadEm, 0.15);
  assert.ok(inv.roleRatioMin >= 1.5);
  assert.ok(inv.dressBans.includes('text-shadow') && inv.dressBans.includes('text-outline'));
  assert.equal(inv.contrastMin.body, 4.5);
  assert.equal(inv.safeFrame.subtitleBand, 935);
});

test('packaging: every variant carries refs, failure modes, checks and defaults', () => {
  for (const v of allVariants(pkg)) {
    assert.ok(v.refs.frames.length >= 1, v.id + ' refs');
    assert.ok(v.failureModes.length >= 1, v.id + ' failureModes');
    assert.ok(v.checks.length >= 1, v.id + ' checks');
    assert.ok(v.defaults && Object.keys(v.defaults).length, v.id + ' defaults');
  }
});



test('type-effect: Hupo large-type / mask variants are codified with evidence', () => {
  const cat = pkg.categories.find((c) => c.id === 'type-effect');
  assert.ok(cat, 'type-effect category missing');
  assert.ok(cat.variants.length >= 6);
  for (const v of cat.variants) {
    assert.ok(v.refs.benchmarks.films.includes('hupo'), v.id + ' needs hupo evidence');
    assert.ok(v.refs.frames.some((f) => f.includes('sheet-by-kind')), v.id + ' needs sheet ref');
    assert.ok(v.failureModes.length >= 1);
  }
  const ev = benchmarkForCategory(bench, 'type-effect');
  assert.deepEqual(ev.films, ['hupo']);
  assert.ok(ev.hupo.examples.length >= 5);
});

test('type-effect: the five-step ladder, grid, scene and fill contrast are enforced', () => {
  const v = variantById(pkg, 'te-image-fill');
  assert.ok(v.contract.sceneRequired);
  assert.ok(v.params.sizePx.max <= 300, 'type-effect cannot exceed the ladder hero');
  const bad = typeCompositionErrors(v, { sizes: { hero: 600 }, margins: [0] });
  assert.ok(bad.some((x) => /scene/.test(x)));
  assert.ok(bad.some((x) => /ladder/.test(x)));
  assert.ok(bad.some((x) => /margin/.test(x)));
  assert.ok(bad.some((x) => /fillContrast/.test(x)));
  assert.deepEqual(typeCompositionErrors(v, { sizes: { hero: 200, sub: 64 }, margins: [120], scene: 'photo', fillContrast: 5, effectCount: 1 }), []);
  const noScene = assignPackaging(pkg, { headline: '同一棵香蕉', dur: 4 }, { intent: 'title', surface: 'any', gawx });
  assert.notEqual(variantById(pkg, noScene.variant).category, 'type-effect', 'auto-assignment cannot pick a type-effect without a scene');
});

test('type-image pairing: six reference-derived pairings load and validate', () => {
  assert.ok(pairing, 'type-image-pairing.json must exist');
  assert.equal(pairing.contract, 'A1TypeImagePairing/v1');
  assert.equal(pairing.pairings.length, 6);
  for (const p of pairing.pairings) {
    assert.ok(p.faces.length >= 1, p.id + ' faces');
    assert.ok(p.placement.length >= 1, p.id + ' placement');
    assert.ok(p.refs.length >= 1, p.id + ' refs');
    assert.ok(p.failureModes.length >= 1, p.id + ' failureModes');
  }
});

test('type-image pairing: wrong face/placement/size and lying evidence fail', () => {
  const person = { pairing: 'tip-person-side', register: 'person', face: 'House Kokka', size: 128, placement: 'beside-face', accentCount: 1, faceBox: { x1: 1200, x2: 1700, y1: 200, y2: 800 }, typeBox: { x1: 120, x2: 600, y1: 300, y2: 450 } };
  assert.deepEqual(pairingErrors(pairing, person), []);
  assert.ok(pairingErrors(pairing, { ...person, typeBox: { x1: 1300, x2: 1500, y1: 300, y2: 500 } }).some((x) => /overlaps the face/.test(x)));
  assert.ok(pairingErrors(pairing, { ...person, face: 'House Soukou' }).some((x) => /face/.test(x)));
  assert.ok(pairingErrors(pairing, { ...person, size: 300 }).some((x) => /over cap/.test(x)));
  assert.ok(pairingErrors(pairing, { pairing: 'tip-page-slab', register: 'evidence-page', headlineVisible: false, sourceLine: false }).some((x) => /headline/.test(x)));
  assert.ok(pairingErrors(pairing, { pairing: 'tip-object-behind', register: 'product-object', occlusion: 0.05 }).some((x) => /occlusion/.test(x)));
  assert.ok(pairingErrors(pairing, { pairing: 'nope' }).some((x) => /unknown/.test(x)));
});

test('composite: hard matte, real occlusion and background depth are checked', () => {
  const ok = { pairing: 'tip-object-behind', hardMatte: true, backgroundSource: 'B02', subjectSource: 'B12', backgroundScale: 1.9, backgroundBlur: 16, backgroundBrightness: 0.1, blackScrim: false, coverage: 0.28, glyphVisible: [0.7, 0.68, 0.66, 0.8, 0.98], keepWholeGlyph: 4, inkInsideSubject: 0, lightMatch: true };
  assert.deepEqual(compositeErrors(ok), []);
  assert.ok(compositeErrors({ ...ok, hardMatte: false }).some((x) => /hard/.test(x)));
  assert.ok(compositeErrors({ ...ok, backgroundSource: 'B12' }).some((x) => /same photo/.test(x)));
  assert.ok(compositeErrors({ ...ok, backgroundBrightness: 0.28 }).some((x) => /brightness/.test(x)));
  assert.ok(compositeErrors({ ...ok, coverage: 0.2 }).some((x) => /covers/.test(x)));
  assert.ok(compositeErrors({ ...ok, glyphVisible: [0.6, 0.7, 0.7, 0.8, 0.8] }).some((x) => /65%/.test(x)));
  assert.ok(compositeErrors({ ...ok, inkInsideSubject: 12 }).some((x) => /bleed/.test(x)));
  assert.ok(compositeErrors({ ...ok, blackScrim: true }).some((x) => /black scrim/.test(x)));
});
test('gawx: four films, type samples, layout and colour variants are measured and valid', () => {
  assert.ok(gawx, 'gawx-layout-colour.json must exist');
  assert.deepEqual(gawxErrors(gawx), []);
  assert.equal(Object.keys(gawx.films).length, 4, '四个 Gawx 片');
  assert.ok(gawx.typography.gawx.frames >= 500, 'type sample');
  assert.equal(gawx.layoutVariants.length, 4);
  assert.equal(gawx.colourVariants.length, 6);
  assert.equal(gawx.harmonyRules.maxColouredFamiliesPerFrame, 2);
  assert.ok(gawx.gaps.length >= 2, 'gawx gaps must be stated');
});

test('gawx: measured palettes and variants satisfy the harmony contract', () => {
  for (const [name, f] of Object.entries(gawx.films)) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(f.palette.ground), name + ' ground hex');
    assert.ok(/^#[0-9a-f]{6}$/i.test(f.palette.ink), name + ' ink hex');
    assert.ok(contrastRatioHex(f.palette.ink, f.palette.ground) >= 3, name + ' ink/ground contrast');
  }
  for (const v of gawx.colourVariants) {
    const rel = v.measured.relations, c = v.contract;
    if (rel.inkContrast !== undefined) assert.ok(rel.inkContrast >= (c.inkContrastMin || 3), v.id + ' measured ink contrast');
    const def = v.defaults;
    assert.ok(contrastRatioHex(def.ink, def.ground) >= (c.inkContrastMin || 3), v.id + ' default ink/ground contrast');
    if (c.hueRule === 'analogous' && rel.hueLeadSecond !== undefined) assert.ok(rel.hueLeadSecond <= (c.hueMaxDeg || 45), v.id + ' analogous hue');
    if (rel.hueWarmCool !== undefined) { const [lo, hi] = c.hueRangeDeg || [90, 210]; assert.ok(rel.hueWarmCool >= lo && rel.hueWarmCool <= hi, v.id + ' warm/cool hue range'); }
  }
  const t = gawx.typography.gawx;
  assert.ok(t.biggest[0] < t.biggest[1] && t.biggest[1] < t.biggest[2] && t.biggest[2] < t.biggest[3], 'type size quantiles ordered');
  assert.ok(t.margin[0] > 0 && t.margin[1] < 0.5, 'measured margins');
  for (const v of gawx.layoutVariants) {
    const sf = v.params.sizeFrac; if (sf) assert.ok(sf.min >= t.biggest[0] - 0.005 && sf.max <= t.biggest[3] + 0.005, v.id + ' size range inside measured');
  }
  assert.equal(hueDiff('#623e1b', '#8c734c') <= 45, true, 'analogous pair measured <=45°');
});

test('gawx: taxonomy and benchmarks carry the gawx categories with evidence', () => {
  assert.ok(pkg.categories.some((c) => c.id === 'gawx-layout'));
  assert.ok(pkg.categories.some((c) => c.id === 'colour-harmony'));
  assert.ok(bench.films.gawx, 'benchmarks include gawx');
  for (const id of ['gawx-layout', 'colour-harmony']) {
    const ev = benchmarkForCategory(bench, id);
    assert.deepEqual(ev.films, ['gawx'], id + ' evidence film');
    for (const v of pkg.categories.find((c) => c.id === id).variants) assert.ok(v.refs.benchmarks.films.includes('gawx'), v.id);
  }
  const picked = pickVariants(pkg, { intent: 'title', surface: 'ground', count: 4 });
  assert.ok(picked.some((id) => variantById(pkg, id).category === 'colour-harmony'), 'pick covers colour');
  assert.ok(picked.some((id) => variantById(pkg, id).category === 'gawx-layout'), 'pick covers layout');
});
test('packaging: selection follows intent categories, surface and repeats', () => {
  const title = pickVariants(pkg, { intent: 'title', surface: 'page', count: 3 });
  assert.ok(title.length >= 2);
  const cats = pkg.selection.intentToCategories.title;
  for (const id of title) assert.ok(cats.includes(variantById(pkg, id).category), id + ' outside intent categories');
  const recent = ['ec-inset-page', 'ec-inset-page'];
  assert.equal(scoreVariant(variantById(pkg, 'ec-inset-page'), { recent }), -1, 'two uses in the window exclude it');
  const again = pickVariants(pkg, { intent: 'title', surface: 'page', recent, count: 3 });
  assert.ok(!again.includes('ec-inset-page'));
});

test('packaging: parameters resolve inside their declared ranges only', () => {
  const v = variantById(pkg, 'ts-page-margin');
  assert.equal(resolveParams(v, { column: 12 }).column, 12);
  assert.equal(resolveParams(v, { column: 99 }).column, v.defaults.column);
  assert.equal(resolveParams(v, { side: 'middle' }).side, v.defaults.side);
});


test('packaging: both benchmark films were taken apart and the evidence validates', () => {
  assert.ok(bench, 'packaging-benchmarks.json must exist');
  assert.deepEqual(benchmarkErrors(bench, pkg), []);
  assert.equal(bench.films.paperclip.sections, 11, '回形针 11 段拆解');
  assert.ok(bench.films.paperclip.beats >= 40, '回形针 beat 数');
  assert.ok(bench.films.paperclip.elementsPerBeat >= 2, '每拍元素数');
  assert.ok(bench.films.hupo.shots >= 69, '胡泊 69 镜/切片');
  assert.ok(Object.keys(bench.films.hupo.labels).length >= 8, '胡泊 label 分类');
  assert.ok(bench.gaps.length >= 3, '必须写明还没量到的');
});

test('packaging: every variant cites benchmark evidence from at least one of the two films', () => {
  const reqFor = (id) => bench.requirements?.categoryFilms?.[id] || bench.requirements?.defaultFilms || ['paperclip', 'hupo'];
  for (const c of pkg.categories) {
    const ev = benchmarkForCategory(bench, c.id);
    const req = reqFor(c.id);
    assert.deepEqual(ev.films.slice().sort(), req.slice().sort(), c.id + ' needs its benchmark films');
    for (const v of c.variants) {
      assert.ok(v.refs.benchmarks && v.refs.benchmarks.films.length >= 1, v.id + ' needs film refs');
      for (const f of v.refs.benchmarks.films) assert.ok(ev.films.includes(f), v.id + ' cites a film its category lacks');
    }
  }
  const T = bench.films.hupo.labels.T;
  assert.ok(Array.isArray(T.durSec) && T.durSec.length === 3 && T.durSec[0] <= T.durSec[1] && T.durSec[1] <= T.durSec[2], 'hupo T duration range');
  assert.ok(bench.films.paperclip.deviceFrequency['title-to-texture'] >= 1, 'paperclip device evidence');
});

test('packaging: assignment produces shots that pass their own shot check', () => {
  const a = assignPackaging(pkg, { headline: '同一棵香蕉', dur: 4 }, { intent: 'title', surface: 'any', gawx });
  assert.ok(a, 'assignment must find a variant');
  const shot = { shotId: 'B01', design: { packaging: a } };
  assert.deepEqual(packagingShotErrors(shot, pkg, bench, gawx), []);
  const gh = variantById(pkg, 'gh-title-photo');
  const bad = { shotId: 'B02', design: { packaging: { variant: gh.id, params: {}, spec: { roles: ['hero'], sizes: { hero: 128 }, leadEm: 0.15, contrastMin: 3, margins: [120], chars: 5 } } } };
  assert.ok(packagingShotErrors(bad, pkg, bench, gawx).length > 0, 'bad sizes must fail');
});

test('packaging: the repeat window is enforced across shots', () => {
  const mk = (id) => ({ shotId: id, design: { packaging: { variant: 'gh-title-photo', params: {}, spec: {} } } });
  assert.deepEqual(sequencePackagingErrors([mk('B01'), mk('B02')], pkg), []);
  assert.match(sequencePackagingErrors([mk('B01'), mk('B02'), mk('B03')], pkg).join('\n'), /used >2 times/);
});

test('packaging: harmony errors catch a bad palette pairing', () => {
  const v = variantById(pkg, 'ch-dark-analogous');
  assert.deepEqual(harmonyErrors(v, { ground: '#100d0c', ink: '#f1f0ed', lead: '#623e1b', second: '#8c734c' }), []);
  assert.ok(harmonyErrors(v, { ground: '#100d0c', ink: '#141210', lead: '#623e1b', second: '#8c734c' }).some((x) => /contrast/.test(x)));
});
test('packaging: contract checks catch the faults the blind reviews found', () => {
  const v = variantById(pkg, 'ec-inset-page');
  const ok = { roles: ['hero', 'caption'], sizes: { hero: 300 }, leadEm: 0.15, contrastMin: 5, margins: [80], chars: 6, cardRequired: true, captionRequired: true };
  assert.deepEqual(contractErrors(v, ok), []);
  assert.match(contractErrors(v, { ...ok, sizes: { hero: 128 } }).join('\n'), /under 200/);
  assert.match(contractErrors(v, { ...ok, leadEm: 0.3 }).join('\n'), /lead/);
  assert.match(contractErrors(v, { ...ok, contrastMin: 2 }).join('\n'), /contrast/);
  assert.match(contractErrors(v, { ...ok, margins: [10] }).join('\n'), /margin/);
  assert.match(contractErrors(v, { ...ok, cardRequired: false }).join('\n'), /cardRequired/);
  const n = variantById(pkg, 'dn-hero-count');
  assert.match(contractErrors(n, { roles: ['hero', 'sub'], sizes: { hero: 300 }, leadEm: 0.15, contrastMin: 4, margins: [40], unitRequired: false }).join('\n'), /unitRequired/);
});
