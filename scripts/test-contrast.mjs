import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, contrastErrors, MIN } from '../apps/studio-next/src/lib/recipe-board/contrast.mjs';

test('contrast: black on white is 21:1; cream on dark passes large type', () => {
  assert.ok(Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 0.01);
  const cream = [217, 210, 197], dark = [36, 28, 13];
  assert.ok(contrastRatio(cream, dark) > 10);
});
test('contrast: a weak red on grey fails, a fixed one passes for large type', () => {
  const weak = contrastRatio([168, 54, 42], [63, 62, 60]);
  assert.ok(weak < 2);
  assert.ok(contrastErrors([{ label: '1921', ratio: weak, large: true }]).length === 1);
  const fixed = contrastRatio([219, 75, 55], [38, 37, 36]);
  assert.ok(fixed >= MIN.large);
  assert.deepEqual(contrastErrors([{ label: '1921', ratio: fixed, large: true }]), []);
});
test('contrast: a body line needs 4.5', () => {
  assert.ok(contrastErrors([{ label: 'source', ratio: 4.0, large: false }]).length === 1);
  assert.deepEqual(contrastErrors([{ label: 'source', ratio: 4.6, large: false }]), []);
});
