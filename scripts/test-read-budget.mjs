import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readsErrors, readBudgetErrors } from '../apps/studio-next/src/lib/recipe-board/storyboard.mjs';

// The read-speed bottom line (OpenVideoHarness 03-motion-design §2): 7 CJK glyphs or 20 other
// characters a second, plus 0.8 s to find the line; never less than READ_MIN.
const long = '這是一行標題需要時間讀完';   // 13 CJK glyphs
const n = [...long].length;
const need = n / 7 + 0.8;

test('a read whose on-screen words cannot be read in its span fails', () => {
  const out = readBudgetErrors([{ from: 0, to: 1, what: 'the title', text: long }]);
  assert.equal(out.length, 1);
  assert.match(out[0], /too short to read 12 characters/);
  assert.match(out[0], new RegExp(`${need.toFixed(2)}s`));
});

test('a read with enough time passes, and a read with no declared text is not guessed at', () => {
  assert.deepEqual(readBudgetErrors([{ from: 0, to: Math.ceil(need * 10) / 10, what: 'the title', text: long }]), []);
  assert.deepEqual(readBudgetErrors([{ from: 0, to: 0.8, what: 'a question' }]), []);
});

test('the read budget is part of the storyboard read check', () => {
  const shot = { seconds: 5, reads: [{ from: 0, to: 1, what: 'the title', text: long }] };
  assert.ok(readsErrors(shot).some((e) => /too short to read/.test(e)));
  shot.reads[0].to = 4;
  assert.deepEqual(readsErrors(shot), []);
});

test('Latin characters are budgeted at 20 a second', () => {
  assert.ok(readBudgetErrors([{ from: 0, to: 1, what: 'label', text: 'The quick brown fox jumps over' }]).length);
  assert.deepEqual(readBudgetErrors([{ from: 0, to: 2.4, what: 'label', text: 'The quick brown fox jumps over' }]), []);
});
