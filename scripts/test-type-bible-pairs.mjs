#!/usr/bin/env node
// Frozen production geometry only: no rendering and no candidate/receipt writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { linesOf, typeBibleErrors, trackBibleErrors } from '../apps/studio-next/src/lib/recipe-board/typebible.mjs';
import { toHant } from '../apps/studio-next/src/lib/recipe-board/house.mjs';
const root = new URL('../', import.meta.url);
const read = (rel) => JSON.parse(fs.readFileSync(new URL(rel, root), 'utf8'));
const B = read('work/recipe-board-v1/routing/type-bible.json');
const pairErrors = (drawn, said = '') => typeBibleErrors(drawn, B, '', said, { grid: false }).filter((e) => /not on its edge|by their ink|of a size under|goes under the big one|as its kicker/.test(e));
const frozen = (rel) => read(`work/banana-full-stills-production-20261030/${rel}`);
const line = (text, size, top, height, x = 120, width = 400, block = 'one') => ({ id: text, text, size, x0: x, x1: x + width, y0: top, y1: top + height, ink: [top, top + height], inkX: [x, x + width], block });
const triple = () => [line('日期', 48, 100, 40, 120, 180), line('標題', 128, 159.2, 110), line('三萬公頃', 200, 299.2, 180, 120, 600)];

test('production regression inputs remain the exact frozen track bytes', () => {
  for (const [rel, hash] of [
    ['safe-ink-repair-20261031/B08/track.json', '15c520eac2fa105aafd365c8cc69df2bacd1ae5986f6f29befd721b4a4c60915'],
    ['map-relations-20261031/B09/current/STILLS/track.json', '112ca1d408d778d9156945d711881b19c6f1f8161ed3624d791634dbf02a803a'],
  ]) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(`work/banana-full-stills-production-20261030/${rel}`, root))).digest('hex'), hash, rel);
});

test('frozen B08: pair edges follow aligned visible ink, not unequal pen bearings', (t) => {
  const f = frozen('safe-ink-repair-20261031/B08/track.json');
  const full = f.track.find((s) => ['土壤真菌', '巴拿馬病', '整株枯萎'].every((t) => linesOf(s.drawn).some((l) => l.text === t && l.alpha >= .9)));
  assert.ok(full, 'frozen three-line cause group exists');
  assert.deepEqual(pairErrors(full.drawn, '土壤真菌，巴拿馬病，整株枯萎'), []);
  const replay = trackBibleErrors(f.track, f.shots, B, (s) => toHant([s.text])[0]);
  assert.deepEqual(replay.filter((e) => /not on its edge/.test(e)), []);
  t.diagnostic(`B08 retained runtime failures: ${JSON.stringify(replay)}`);
});

test('frozen B09: date cannot pair across the intervening title to the figure', (t) => {
  const f = frozen('map-relations-20261031/B09/current/STILLS/track.json');
  const said = toHant([f.shots[0].text])[0]; // chapter.mjs production narration normalization
  const full = f.track.find((s) => ['1940—1960', '烏盧阿河谷', '三萬公頃'].every((t) => linesOf(s.drawn).some((l) => l.text === t && l.alpha >= .9)));
  assert.ok(full, 'frozen three-line loss group exists');
  assert.deepEqual(pairErrors(full.drawn, said), []);
  // Before the middle title appears these ARE adjacent: retain the actual bad gap.
  const replay = trackBibleErrors(f.track, f.shots, B, () => said);
  assert.match(replay.join('\n'), /1940—1960.*0\.86.*三萬公頃.*by their ink.*0.0-3.8 s/);
  const settled = f.track.filter((s) => s.t >= full.t);
  assert.deepEqual(trackBibleErrors(settled, f.shots, B, () => said).filter((e) => /1940—1960.*三萬公頃/.test(e)), []);
  t.diagnostic(`B09 retained runtime failures: ${JSON.stringify(replay)}`);
});

test('ink edges accept different bearings but reject real ink drift beyond six pixels', () => {
  const a = line('主標題', 200, 100, 180, 120, 600), b = line('補充', 64, 310, 55, 120, 200);
  b.x0 = 108; b.x1 = 308;
  assert.deepEqual(pairErrors([a, b]), []);
  b.x0 = 120; b.x1 = 320; b.inkX = [127, 327];
  assert.match(pairErrors([a, b]).join('\n'), /not on its edge/);
  b.inkX = [126, 326];
  assert.deepEqual(pairErrors([a, b]), [], 'six px boundary stays inclusive');
});

test('same-block three lines use spatial neighbours even with shuffled draw order', () => {
  const [date, title, figure] = triple();
  assert.deepEqual(pairErrors([figure, date, title], '日期標題三萬公頃'), []);
});

test('adjacent bad gap and order remain hard failures inside a block', () => {
  const [date, title, figure] = triple();
  date.y0 -= 20; date.y1 -= 20; date.ink = [date.y0, date.y1];
  assert.match(pairErrors([date, title, figure], '日期標題三萬公頃').join('\n'), /by their ink/);
  assert.match(pairErrors(triple(), '標題日期三萬公頃').join('\n'), /goes under the big one/);
});

test('different-block and unblocked legacy all-pairs checks are not waived', () => {
  for (const mode of ['different', 'none', 'foreign-middle']) {
    const ls = triple();
    for (let i = 0; i < ls.length; i++) ls[i].block = mode === 'none' ? null : mode === 'different' ? `block${i}` : i === 1 ? 'foreign' : 'one';
    assert.match(pairErrors(ls, '日期標題三萬公頃').join('\n'), /日期.*三萬公頃.*by their ink/, mode);
  }
});

test('block metadata cannot waive four reading levels or overlapping lines', () => {
  const ls = [...triple(), line('第四主行', 64, 509.2, 55, 120, 240)];
  assert.match(typeBibleErrors(ls, B, '', '日期標題三萬公頃第四主行').join('\n'), /4 levels of type/);
  const overlap = [line('主標題', 200, 100, 180), line('補充', 64, 220, 55)];
  assert.match(typeBibleErrors(overlap, B, '', '', { grid: false }).join('\n'), /run into each other/);
});

test('real pair drift sustained through the track still fails the hold gate', () => {
  const ls = [line('主標題', 200, 100, 180, 120, 600), line('補充', 64, 310, 55, 133, 200)];
  const track = [0, .2, .4, .6, .8].map((t) => ({ t, drawn: ls }));
  assert.match(trackBibleErrors(track, [{ shotId: 'B00', at: 0, dur: 1 }], B).join('\n'), /not on its edge.*0.0-1.0 s/);
});
