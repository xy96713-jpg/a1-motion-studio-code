import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTRACT, ROLES, typeDesignErrors, typeDesignStats } from '../apps/studio-next/src/lib/recipe-board/typedesign.mjs';

const line = (o = {}) => ({
  text: '同一棵', role: 'hero', reason: '这一拍在说超市香蕉都是同一棵克隆', ink: '#1b1814',
  anchor: { kind: 'print', target: '货架挡板' }, material: 'paper',
  light: { dir: -35, source: 'plate' }, integration: 'print',
  perspective: { quad: [[0.06, 0.20], [0.56, 0.20], [0.56, 0.56], [0.06, 0.56]] },
  hierarchy: { rank: 1 }, ...o,
});
const plan = (lines = [line()], extra = {}) => ({ contract: CONTRACT, planHash: 'abcdef0123', beats: [{ beat: 'B01', lines }], ...extra });
const errors = (p, opts = {}) => typeDesignErrors(p, opts).errors;

test('typedesign: a valid plan passes', () => {
  assert.deepEqual(errors(plan()), []);
});

test('typedesign: every word says why it is here', () => {
  assert.ok(errors(plan([line({ reason: '' })])).some((e) => /no reason/.test(e)));
  assert.ok(errors(plan([line({ reason: 'ok' })])).some((e) => /no reason/.test(e)));
});

test('typedesign: no anchor is a floating word', () => {
  const e = errors(plan([line({ anchor: { kind: 'none', target: 'nothing' } })]));
  assert.ok(e.some((x) => /anchor.kind/.test(x)));
  const e2 = errors(plan([line({ anchor: { kind: 'surface' } })]));
  assert.ok(e2.some((x) => /anchor.target/.test(x)));
});

test('typedesign: 3D needs an environment map, a contact shadow and an anchor', () => {
  const e = errors(plan([line({ integration: '3d' })]));
  assert.ok(e.some((x) => /environment map/.test(x)));
  assert.ok(e.some((x) => /contact shadow/.test(x)));
  const ok = plan([line({ integration: '3d', envMap: true, contactShadow: true, anchor: { kind: 'surface', target: '台面' } })]);
  assert.deepEqual(errors(ok), []);
});

test('typedesign: 3D is budgeted across the film', () => {
  const two3d = [line({ integration: '3d', envMap: true, contactShadow: true, anchor: { kind: 'surface', target: '台面' } }), line({ text: '47%', role: 'figure', reason: '产量份额', integration: '3d', envMap: true, contactShadow: true, anchor: { kind: 'surface', target: '台面' }, hierarchy: { rank: 2 } })];
  assert.ok(errors(plan(two3d, { budget: { type3dShots: 1 } })).some((e) => /3D budget/.test(e)));
  assert.deepEqual(errors(plan(two3d, { budget: { type3dShots: 2 } })), []);
});

test('typedesign: print and card need a quad on the plate', () => {
  assert.ok(errors(plan([line({ perspective: null })])).some((e) => /perspective.quad/.test(e)));
  assert.ok(errors(plan([line({ text: '同一棵香蕉', size: 300, perspective: { quad: [[0.06, 0.2], [0.10, 0.2], [0.10, 0.7], [0.06, 0.7]] } })])).some((e) => /does not fit/.test(e)));
  assert.ok(errors(plan([line({ integration: 'card', perspective: { quad: [[0, 0]] } })])).some((e) => /perspective.quad/.test(e)));
});

test('typedesign: one hero a beat, and a real hierarchy when two lines share it', () => {
  assert.ok(errors(plan([line(), line({ text: '47%', role: 'hero', reason: '第二个 hero', hierarchy: { rank: 2 } })])).some((e) => /hero lines/.test(e)));
  const flat = [line({ role: 'sub', text: '同一棵', hierarchy: { rank: 1 } }), line({ text: '47%', role: 'caption', reason: '小注', hierarchy: { rank: 2 } })];
  assert.ok(errors(plan(flat)).some((e) => /differ by/.test(e)));
  const ranks = [line({ hierarchy: { rank: 1 } }), line({ text: '47%', role: 'title', reason: '副行', hierarchy: { rank: 1 } })];
  assert.ok(errors(plan(ranks)).some((e) => /ranks repeat/.test(e)));
});

test('typedesign: a size off the role step is refused', () => {
  assert.ok(errors(plan([line({ size: 200 })])).some((e) => /off the hero step/.test(e)));
  assert.deepEqual(errors(plan([line({ size: 300 })])), []);
});

test('typedesign: a floating word may not rotate or float', () => {
  assert.ok(errors(plan([line({ anchor: { kind: 'surface', target: '台面' }, motion: { type: 'rotate' } })])).length === 0);
  assert.ok(errors(plan([line({ anchor: { kind: 'none', target: 'x' }, motion: { type: 'rotate' } })])).some((e) => /may not rotate/.test(e) || /anchor.kind/.test(e)));
});

test('typedesign: the plan hash ties the answer to the plan', () => {
  const p = { beats: [{ id: 'B01', intent: 'title', text: '同一棵' }] };
  const e = typeDesignErrors(plan(), { plan: p }).errors;
  assert.ok(e.some((x) => /planHash/.test(x)));
});

test('typedesign: stats count the film s type', () => {
  const s = typeDesignStats(plan());
  assert.equal(s.lines, 1);
  assert.equal(s.roles.hero, 1);
  assert.equal(s.integrations.print, 1);
  assert.equal(s.type3d, 0);
});
test('typedesign: one reveal pasted on every beat is not a motion decision', () => {
  const beats = Array.from({ length: 5 }, (_, i) => ({ beat: 'B0' + (i + 1), lines: [line({ text: '字' + i, motion: { type: null, reveal: 'camera settles; the word is already there', drift: 0 } })] }));
  assert.ok(errors({ contract: CONTRACT, planHash: 'abcdef0123', beats }).some((e) => /one reveal/.test(e)));
});

test('typedesign: one quad reused across the film is an overlay, not a surface', () => {
  const beats = Array.from({ length: 6 }, (_, i) => ({ beat: 'B0' + (i + 1), lines: [line({ text: '字' + i, perspective: { quad: [[0.1, 0.2], [0.3, 0.2], [0.3, 0.5], [0.1, 0.5]] } })] }));
  assert.ok(errors({ contract: CONTRACT, planHash: 'abcdef0123', beats }).some((e) => /one quad is reused/.test(e)));
});

test('typedesign: a long line cannot fit a narrow anchor', () => {
  const narrow = [[0.05, 0.2], [0.10, 0.2], [0.10, 0.6], [0.05, 0.6]];
  assert.ok(errors(plan([line({ text: '同一棵香蕉', size: 300, perspective: { quad: narrow } })])).some((e) => /does not fit/.test(e)));
});
const gline = (o = {}) => line({ integration: 'graphic', anchor: { kind: 'graphic', target: '第 1 欄' }, perspective: { quad: null }, composition: { align: 'left', edge: 'top', column: 1, crop: false }, ...o });

test('typedesign: graphic type is anchored to the frame composition', () => {
  assert.deepEqual(errors(plan([gline()])), []);
  assert.ok(errors(plan([gline({ composition: null })])).some((e) => /composition/.test(e)));
  assert.ok(errors(plan([gline({ anchor: { kind: 'print', target: 'x' } })])).some((e) => /graphic type is anchored/.test(e)));
  assert.ok(errors(plan([gline({ composition: { align: 'left', edge: null, column: 1, crop: true } })])).some((e) => /needs edge/.test(e)));
  assert.ok(errors(plan([gline({ text: '一二三四五六七八九十十一十二', size: 300 })])).some((e) => /does not crop/.test(e)));
});

test('typedesign: occlusion names the covered glyphs and the edge', () => {
  const occ = line({ integration: 'occlusion', anchor: { kind: 'occluded', target: '果串' }, perspective: { quad: null }, composition: null, occludeBy: '果串', occlusion: { covers: [1, 2], edge: 'right', contactShadow: true, ao: true } });
  assert.deepEqual(errors(plan([occ])), []);
  const bad = line({ integration: 'occlusion', anchor: { kind: 'occluded', target: '果串' }, perspective: { quad: null }, composition: null, occludeBy: '果串', occlusion: null });
  assert.ok(errors(plan([bad])).some((e) => /occlusion needs/.test(e)));
});
test('typedesign: a plan whose copy is not the film s copy is refused', () => {
  const film = { B01: { lines: [{ text: '同一棵香蕉', size: 300, role: 'big', box: { x0: 120, y0: 96, x1: 1230, y1: 426 } }] } };
  assert.ok(typeDesignErrors(plan(), { film }).errors.some((e) => /text-not-in-film/.test(e)));
  const ok = typeDesignErrors(plan([line({ text: '同一棵香蕉' })]), { film });
  assert.deepEqual(ok.errors.filter((e) => /text-not-in-film/.test(e)), []);
});

test('typedesign: every planned beat with words is designed', () => {
  const p = { beats: [{ id: 'B01', intent: 'title', text: 'a', onScreen: { headline: '同一棵香蕉' } }, { id: 'B02', intent: 'concept', text: 'b', onScreen: { headline: '卡文迪什' } }] };
  assert.ok(typeDesignErrors(plan(), { plan: p }).errors.some((e) => /B02: no line planned/.test(e)));
});

test('typedesign: graphic type is capped at a quarter of the lines', () => {
  const beats = Array.from({ length: 8 }, (_, i) => ({ beat: 'B0' + (i + 1), lines: [line({ text: '字' + i, integration: 'graphic', anchor: { kind: 'graphic', target: '第 1 欄' }, perspective: { quad: null }, composition: { align: 'left', edge: 'top', column: 1, crop: false } })] }));
  assert.ok(typeDesignErrors({ contract: CONTRACT, planHash: 'abcdef0123', beats }).errors.some((e) => /graphic-share/.test(e)));
});

test('typedesign: graphic type must be the beat s headline', () => {
  const film = { B01: { headline: '同一棵香蕉', keywords: ['香芽蕉'] } };
  const g = line({ text: '香芽蕉', role: 'sub', integration: 'graphic', anchor: { kind: 'graphic', target: '第 1 欄' }, perspective: { quad: null }, composition: { align: 'left', edge: 'top', column: 1, crop: false } });
  assert.ok(typeDesignErrors(plan([g]), { film }).errors.some((e) => /graphic type is the beat/.test(e)));
});
