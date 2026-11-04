import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designStats, benchmarkErrors, benchmarkReport, TARGETS } from '../apps/studio-next/src/lib/recipe-board/benchmark.mjs';

const row = (beat, o) => ({ beat, moment: 'object', composition: 'hero-object', typeMove: 'pair', material: 'flat', scale: 'title', ground: { kind: 'place-dark' }, words: [{ big: '卡文迪什', small: '', role: 'pair' }], ...o });
const film = () => [
  row('B01', { moment: 'hero', composition: 'title-footage', typeMove: 'stackType', material: 'paper', scale: 'hero', words: [{ big: '同一棵', role: 'block' }] }),
  row('B02'), row('B03', { moment: 'data', composition: 'count-field', typeMove: 'band', material: 'ink', scale: 'figure', ground: { kind: 'paper-light' }, words: [{ big: '47%', role: 'pair' }] }),
  row('B04', { moment: 'diagram', composition: 'custom', typeMove: 'label', material: 'print', scale: 'title', ground: { kind: 'paper-light' }, words: [{ big: '吸芽', role: 'label' }] }),
  row('B05', { moment: 'evidence', composition: 'evidence-card', typeMove: 'pair', material: 'paper', scale: 'title', ground: { kind: 'paper-light' } }),
  row('B06', { moment: 'hero', composition: 'title-footage', typeMove: 'knockout', material: 'ink', scale: 'hero', ground: { kind: 'place-dark' }, words: [{ big: '1921', role: 'block' }] }),
  row('B07', { moment: 'data', composition: 'map-table', typeMove: 'band', material: 'ink', scale: 'figure', ground: { kind: 'chart-table' }, words: [{ big: '3萬', role: 'pair' }] }),
  row('B08', { moment: 'evidence', composition: 'split-compare', typeMove: 'pair', material: 'paper', scale: 'title', ground: { kind: 'paper-light' } }),
  row('B09', { moment: 'object', composition: 'hero-object', typeMove: 'surfaceType', material: 'flat', scale: 'title', ground: { kind: 'place-dark' } }),
  row('B10', { moment: 'object', composition: 'figure-card', typeMove: 'knockout', material: 'ink', scale: 'title', ground: { kind: 'place-dark' }, words: [{ big: '單一', role: 'block' }] }),
];
test('benchmark: a mixed film passes the reference targets', () => {
  const rows = film(), beats = rows.map((r) => r.beat);
  const report = benchmarkReport(rows, beats);
  assert.equal(report.errors.length, 0, report.errors.join(' | '));
  assert.ok(report.stats.heroShare >= TARGETS.heroShare[0] && report.stats.heroShare <= TARGETS.heroShare[1]);
  assert.ok(report.stats.medianChars <= 12);
});
test('benchmark: a flat, all-dark, hero-less film fails', () => {
  const rows = film().map((r) => ({ ...r, moment: 'object', composition: 'hero-object', typeMove: 'pair', material: 'flat', scale: 'title', ground: { kind: 'place-dark' } }));
  const e = benchmarkErrors(designStats(rows, rows.map((r) => r.beat)));
  assert.ok(e.some((x) => /heroShare/.test(x)), e.join(' | '));
  assert.ok(e.some((x) => /lightShare/.test(x)), e.join(' | '));
  assert.ok(e.some((x) => /materialShare/.test(x)), e.join(' | '));
});
