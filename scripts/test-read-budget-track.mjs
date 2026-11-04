import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBudgetTrackErrors } from '../apps/studio-next/src/lib/recipe-board/storyboard.mjs';

const line = (text) => ({ text, whole: text, alpha: 1 });
const track = (from, to, text) => Array.from({ length: Math.round((to - from) / 0.2) + 1 }, (_, i) => ({ t: +(from + i * 0.2).toFixed(2), drawn: i === 0 ? [line(text)] : [line(text)] }));

test('a read whose on-screen words cannot be read in its span is reported from the kept track', () => {
  const shots = [{ shotId: 'B02', at: 0, dur: 5, design: { reads: [{ from: 0, to: 1, what: 'the name' }] } }];
  const out = readBudgetTrackErrors(track(0.2, 4.8, '卡文迪什香蕉的名字'), shots);
  assert.equal(out.length, 1);
  assert.match(out[0], /B02: read "the name" gets 1\.0s/);
  assert.match(out[0], /need 2\.1s/);
});

test('enough time passes, and a line already standing before the read is not counted again', () => {
  const shots = [{ shotId: 'B02', at: 0, dur: 5, design: { reads: [{ from: 0, to: 3, what: 'the name' }] } }];
  assert.deepEqual(readBudgetTrackErrors(track(0.2, 4.8, '卡文迪什香蕉的名字'), shots), []);
  const later = [{ shotId: 'B03', at: 2, dur: 4, design: { reads: [{ from: 0, to: 1, what: 'the name' }] } }];
  assert.deepEqual(readBudgetTrackErrors(track(0.2, 4.8, '卡文迪什香蕉的名字'), later), [], 'the line entered before this read and is not its words');
});

test('a shot without declared reads is not guessed at', () => {
  assert.deepEqual(readBudgetTrackErrors(track(0, 2, '任何字'), [{ shotId: 'B01', at: 0, dur: 4, design: {} }]), []);
});
