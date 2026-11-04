import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameProblems } from '../apps/studio-next/src/lib/recipe-board/framecheck.mjs';

const block = (o = {}) => ({ text: '同一棵', line: 128, box: { x: 300, y: 300, w: 500, h: 200 }, move: 0, ...o });
const kinds = (blocks) => frameProblems(1, blocks).map((p) => p.kind);

test('type checks: display type with no anchor is a floating word', () => {
  assert.ok(kinds([block({ line: 300, anchor: 'none' })]).includes('floating-type'));
  assert.ok(kinds([block({ line: 300, integration: '3d' })]).includes('floating-type'));
  assert.ok(!kinds([block({ line: 300, anchor: 'print' })]).includes('floating-type'));
  assert.ok(!kinds([block({ line: 300 })]).includes('floating-type'), 'pages with no typeplan metadata are not judged');
});

test('type checks: 3D without env map or contact shadow is cheap-3d', () => {
  assert.ok(kinds([block({ integration: '3d', anchor: 'surface' })]).includes('cheap-3d'));
  assert.ok(!kinds([block({ integration: '3d', anchor: 'surface', env: true, contact: true })]).includes('cheap-3d'));
});

test('type checks: light 40 degrees off the plate is a mismatch', () => {
  assert.ok(kinds([block({ lightDir: 0, plateLight: 90 })]).includes('light-mismatch'));
  assert.ok(!kinds([block({ lightDir: 0, plateLight: 20 })]).includes('light-mismatch'));
});

test('type checks: edge sharpness far from the plate is a DOF mismatch', () => {
  assert.ok(kinds([block({ sharp: 3, plateSharp: 1 })]).includes('dof-mismatch'));
  assert.ok(!kinds([block({ sharp: 1.2, plateSharp: 1 })]).includes('dof-mismatch'));
});

test('type checks: words outside their declared plate quad are off the surface', () => {
  const quad = [[300 / 1920, 300 / 1080], [800 / 1920, 300 / 1080], [800 / 1920, 500 / 1080], [300 / 1920, 500 / 1080]];
  assert.ok(!kinds([block({ quad })]).includes('perspective-mismatch'));
  const far = quad.map(([x, y]) => [x + 0.4, y + 0.3]);
  assert.ok(kinds([block({ quad: far })]).includes('perspective-mismatch'));
});

test('type checks: three lines at one size with no ranks is a flat hierarchy', () => {
  const three = [block({ anchor: 'print' }), block({ text: '卡文迪什', anchor: 'print' }), block({ text: '47%', line: 128, anchor: 'print' })];
  assert.ok(kinds(three).includes('hierarchy-flat'));
  const ranked = [block({ rank: 1 }), block({ text: '卡文迪什', rank: 2 }), block({ text: '47%', rank: 3 })];
  assert.ok(!kinds(ranked).includes('hierarchy-flat'));
});
