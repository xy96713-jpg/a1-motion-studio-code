import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designDensityErrors } from '../apps/studio-next/src/lib/recipe-board/design-density.mjs';

test('design density: a continuous shot passes; a still with a caption fails', () => {
  const good = [{ beat: 'B04', seconds: 9, states: ['母株，吸芽已在', '切斷地下莖', '新株落在右側'], events: [
    { at: 1.2, kind: 'text', what: '吸芽的名字立起' },
    { at: 2.6, kind: 'graphic', what: '地下莖閱讀線畫出' },
    { at: 4.0, kind: 'space', what: '切到新株特寫' },
    { at: 5.4, kind: 'text', what: '分離之後，就是另一株' },
    { at: 7.0, kind: 'space', what: '新株落幅' },
  ] }];
  assert.deepEqual(designDensityErrors(good), []);
  const still = [{ beat: 'B04', seconds: 9, states: ['一臉', '一臉', '一臉'], events: [{ at: 1, kind: 'text', what: '一行字' }] }];
  const e = designDensityErrors(still);
  assert.ok(e.some((x) => /events: 1 events/.test(x)), e.join(' | '));
  assert.ok(e.some((x) => /two layers take turns/.test(x)), e.join(' | '));
  const gap = [{ beat: 'B03', seconds: 9, states: ['a', 'b', 'c'], events: [
    { at: 0.5, kind: 'graphic', what: 'x' }, { at: 1.2, kind: 'text', what: 'y' }, { at: 5.5, kind: 'space', what: 'z' },
  ] }];
  assert.ok(designDensityErrors(gap).some((x) => /with nothing changing/.test(x)), designDensityErrors(gap).join(' | '));
  const legacy = [{ beat: 'B02', composition: 'hero-object' }];
  assert.deepEqual(designDensityErrors(legacy), []);
});
