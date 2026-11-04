import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameDesignErrors, momentMixErrors, designMix } from '../apps/studio-next/src/lib/recipe-board/framedesign.mjs';

const row = (beat, over = {}) => ({
  beat, moment: 'object', composition: 'hero-object', typeMove: 'pair', material: 'flat', scale: 'title', typeLayout: 'block',
  ground: { kind: 'place-dark', place: 'the shelf' }, words: [{ big: '卡文迪什', small: 'CAVENDISH', role: 'pair' }],
  ...over,
});
const film = () => [
  row('B01', { moment: 'hero', composition: 'title-footage', typeMove: 'stackType', material: 'paper', scale: 'hero', words: [{ big: '同一棵', small: 'THE SAME', role: 'block' }] }),
  row('B02'),
  row('B03', { moment: 'data', composition: 'count-field', typeMove: 'band', material: 'ink', ink: 'dark', scale: 'figure', ground: { kind: 'paper-light', place: 'the print room' }, words: [{ big: '47%', small: '全球產量', role: 'pair' }] }),
  row('B04', { moment: 'diagram', composition: 'custom', typeMove: 'label', material: 'print', scale: 'title', words: [{ big: '吸芽', small: '', role: 'label' }] }),
  row('B05', { moment: 'evidence', composition: 'evidence-card', typeMove: 'pair', material: 'ink', ink: 'dark', scale: 'title', ground: { kind: 'paper-light', place: 'the archive' } }),
  row('B06', { moment: 'hero', composition: 'title-footage', typeMove: 'knockout', material: 'ink', ink: 'red', scale: 'hero', ground: { kind: 'place-dark', place: 'the docks' }, words: [{ big: '1921', small: 'ONCE BEFORE', role: 'block' }] }),
  row('B07', { moment: 'data', composition: 'map-table', typeMove: 'band', material: 'ink', ink: 'dark', scale: 'figure', ground: { kind: 'chart-table', place: 'the chart table' }, words: [{ big: '3萬', small: '公頃', role: 'pair' }] }),
  row('B08', { moment: 'evidence', composition: 'split-compare', typeMove: 'pair', material: 'ink', ink: 'dark', scale: 'title', ground: { kind: 'paper-light', place: 'the archive' } }),
];

test('frame design: a mixed film passes', () => {
  const rows = film();
  rows.forEach((r, i) => { r.typeLayout = ['block', 'vertical', 'edge', 'centre'][i % 4]; });
  assert.deepEqual(frameDesignErrors(rows), []);
  assert.deepEqual(momentMixErrors(rows, rows.map((r) => r.beat)), []);
  const mix = designMix(rows, rows.map((r) => r.beat));
  assert.equal(mix.heroes, 2);
  assert.ok(mix.lightShare >= 0.15 && mix.lightShare <= 0.5);
});

test('frame design: a hero set small or in flat type fails', () => {
  const rows = film();
  rows[0] = row('B01', { moment: 'hero', composition: 'title-footage', typeMove: 'pair', material: 'flat', scale: 'title', words: [{ big: '同一棵', small: 'x', role: 'pair' }] });
  const e = frameDesignErrors(rows);
  assert.ok(e.some((x) => /scale: a hero beat is set at hero/.test(x)), e.join(' | '));
  assert.ok(e.some((x) => /typeMove: a hero is set with/.test(x)), e.join(' | '));
  assert.ok(e.some((x) => /material: a hero title is made/.test(x)), e.join(' | '));
});

test('frame design: back-to-back heroes and four same grounds fail', () => {
  const rows = film();
  rows[1] = row('B02', { moment: 'hero', composition: 'title-footage', typeMove: 'stackType', material: 'paper', scale: 'hero' });
  const e = momentMixErrors(rows, rows.map((r) => r.beat));
  assert.ok(e.some((x) => /heroes back to back/.test(x)), e.join(' | '));
  const g = film();
  for (const b of ['B02', 'B03', 'B04']) g.find((r) => r.beat === b).ground = { kind: 'place-dark', place: 'the shelf' };
  assert.ok(momentMixErrors(g, g.map((r) => r.beat)).some((x) => /four place-dark grounds in a row/.test(x)));
});

test('frame design: a film of one layout, no vertical, three in a row fails', () => {
  const rows = film();
  for (const r of rows) r.typeLayout = 'edge';
  const e = momentMixErrors(rows, rows.map((r) => r.beat));
  assert.ok(e.some((x) => /three beats in a row/.test(x)), e.join(' | '));
  assert.ok(e.some((x) => /no vertical column/.test(x)), e.join(' | '));
});

test('frame design: ink on a ground it disappears into fails', () => {
  const rows = film();
  rows[1] = row('B02', { material: 'ink', ink: 'dark', ground: { kind: 'place-dark', place: 'the shelf' } });
  assert.ok(frameDesignErrors(rows).some((x) => /dark ink on a dark ground/.test(x)));
  rows[1] = row('B02', { material: 'ink', ink: 'light', ground: { kind: 'paper-light', place: 'the print room' } });
  assert.ok(frameDesignErrors(rows).some((x) => /light ink on a light ground/.test(x)));
  rows[1] = row('B02', { material: 'paper', ground: { kind: 'paper-light', place: 'the print room' } });
  assert.ok(frameDesignErrors(rows).some((x) => /light on light/.test(x)));
});

test('frame design: too many characters, legacy briefs are silent', () => {
  const rows = film();
  rows[1].words = [{ big: '你吃過的香蕉幾乎都是它的複製品', small: '', role: 'pair' }];
  assert.ok(frameDesignErrors(rows).some((x) => /characters of design type/.test(x)));
  const legacy = [{ beat: 'B01', composition: 'hero-object' }];
  assert.deepEqual(frameDesignErrors(legacy), []);
  assert.deepEqual(momentMixErrors(legacy, ['B01']), []);
});
