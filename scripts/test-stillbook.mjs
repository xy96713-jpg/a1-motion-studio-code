import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stillbookCoverageErrors } from '../apps/studio-next/src/lib/recipe-board/stillbook.mjs';
import { loadVariantMatrix, solveFilmVariants, variantDiversityReport } from '../apps/studio-next/src/lib/recipe-board/variants.mjs';

test('a still book needs exactly one existing still per beat', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stillbook-'));
  try {
    fs.writeFileSync(path.join(root, 'B01.png'), 'x');
    const beats = [{ beat: 'B01' }, { beat: 'B02' }];
    const ok = stillbookCoverageErrors(beats, [{ beat: 'B01', file: path.join(root, 'B01.png') }, { beat: 'B02', file: path.join(root, 'B01.png') }]);
    assert.deepEqual(ok, []);
    const missing = stillbookCoverageErrors(beats, [{ beat: 'B01', file: path.join(root, 'B01.png') }]);
    assert.ok(missing.some((e) => /B02: no final still/.test(e)));
    const dup = stillbookCoverageErrors(beats, [{ beat: 'B01', file: path.join(root, 'B01.png') }, { beat: 'B01', file: path.join(root, 'B01.png') }]);
    assert.ok(dup.some((e) => /duplicate stills/.test(e)));
    const gone = stillbookCoverageErrors(beats, [{ beat: 'B01', file: path.join(root, 'nope.png') }, { beat: 'B02', file: path.join(root, 'B01.png') }]);
    assert.ok(gone.some((e) => /B01: still file does not exist/.test(e)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('variant matrix solver assigns diverse carriers and 3-state motion scores across 20 beats', () => {
  const dataDir = path.resolve('work/recipe-board-v1');
  const matrix = loadVariantMatrix({ dataDir });
  assert.ok(matrix && matrix.contract === 'A1VariantMatrix/v1');
  const plan = JSON.parse(fs.readFileSync(path.join(dataDir, 'projects/banana-design/plan.json'), 'utf8'));
  const solved = solveFilmVariants(plan.beats, matrix);
  assert.equal(solved.length, 20);
  const report = variantDiversityReport(solved, matrix);
  assert.ok(report.uniqueCarriers >= 10, `expected >= 10 unique carriers, got ${report.uniqueCarriers}`);
  assert.deepEqual(report.warnings, []);
  for (const r of solved) {
    assert.ok(r.chosen?.motionScore?.t0 && r.chosen?.motionScore?.t1 && r.chosen?.motionScore?.t2);
  }
});
