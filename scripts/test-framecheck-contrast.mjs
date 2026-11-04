import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameProblems } from '../apps/studio-next/src/lib/recipe-board/framecheck.mjs';
const block = (o) => ({ text: '47%', line: 200, box: { x: 300, y: 300, w: 500, h: 300 }, move: 0, ...o });
test('framecheck: material ratio under the WCAG floor is unreadable', () => {
  assert.ok(frameProblems(1, [block({ ratio: 2.0, large: true })]).some((p) => /material contrast/.test(p.say)));
  assert.deepEqual(frameProblems(1, [block({ ratio: 4.0, large: true })]), []);
  assert.ok(frameProblems(1, [block({ ratio: 4.0, large: false })]).some((p) => /material contrast/.test(p.say)));
  assert.deepEqual(frameProblems(1, [block({ ratio: 4.6, large: false })]), []);
});