import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefBeatsUneatenErrors } from '../apps/studio-next/src/lib/recipe-board/shotmotion.mjs';

const contract = { shots: [], beats: [{ t: 4.5, read: 'reveal' }] };

test('a commented beat cannot satisfy the motion contract', () => {
  const errors = briefBeatsUneatenErrors('// at:4.5\nexport const beats=[];', contract);
  assert.ok(errors.some((error) => error.includes('beats[4.5]')));
});

test('an actual declared beat still passes the static hint', () => {
  assert.deepEqual(briefBeatsUneatenErrors('export const beats=[{at:4.5}];', contract), []);
});
