import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PROFILES, profileRuleScope, colourErrors, lowKeyErrors } from '../apps/studio-next/src/lib/recipe-board/profile.mjs';
import { groundTintErrors, filmFollowErrors } from '../apps/studio-next/src/lib/recipe-board/filmdesign.mjs';

const chapter = fs.readFileSync(new URL('../apps/studio-next/src/lib/recipe-board/chapter.mjs', import.meta.url), 'utf8');
// Like the existing pipeline/source tests, exercise the production consumer without rendering.
// Execute its actual dispatcher and contiguous brightness/palette/colour statements, not a replica.
const dispatcher = chapter.slice(chapter.indexOf('  const profileCheck ='), chapter.indexOf('  let motion =', chapter.indexOf('  const profileCheck =')));
const start = chapter.indexOf("        profileCheck('brightness-quota', filmFollowErrors");
const end = chapter.indexOf('        { // rough-cut: ground busier', start);
assert.ok(start > 0 && end > start, 'runtime keyframe consumer must be found');
assert.match(dispatcher, /profileRuleScope\(loadProject\(cfg, id\), rule\)/);
// Only trusted repository source/constants are compiled; no external input is evaluated.
const consume = new Function('deps', `const { project, rows, mono, film, script, profileRuleScope, colourErrors, lowKeyErrors, groundTintErrors, filmFollowErrors } = deps;
  const cfg = {}, id = 'fixture', errors = [], warnings = [], PROF = ${JSON.stringify(PROFILES.gawx)};
  const g = { id: 'B01', shots: [{ shotId: 'B01' }] };
  const loadProject = () => project, acceptedFilmDesign = () => film, filmRows = x => x;
  const colourScript = () => script, filmAccent = () => null, loadPalettes = () => ({});
  const acceptedBrief = () => ({}), loadCompositions = () => ({}), monoChapter = () => mono;
  ${dispatcher}
  ${chapter.slice(start, end)}
  return { errors, warnings };`);
const run = (project, rows, { mono = false, film = null, script = [] } = {}) => consume({ project, rows, mono, film, script, profileRuleScope, colourErrors, lowKeyErrors, groundTintErrors, filmFollowErrors });
const quotas = [
  { family: 0, strong: 0, families: 0 },
  { family: .2, strong: .3, families: 4 },
];

test('colour quota is a note only for explicit TYPE projects; other authority scopes stay hard', () => {
  assert.equal(profileRuleScope({ typeBible: true }, 'colour-quota'), 'note');
  for (const project of [{}, { typeBible: false }, { typeBible: 'true' }]) assert.equal(profileRuleScope(project, 'colour-quota'), 'error');
  for (const rule of ['ground-tint', 'facts', 'fonts', 'layout', 'surface-read', 'unknown']) assert.equal(profileRuleScope({ typeBible: true }, rule), 'error');
});

test('actual chapter colour consumer retains measurements as TYPE notes, legacy as errors', () => {
  for (const row of quotas) {
    const expected = colourErrors([row], PROFILES.gawx, 'B01');
    assert.ok(expected.length, 'fixture must really violate the legacy quota');
    const typed = run({ typeBible: true }, [row]);
    assert.deepEqual(typed.errors, [], 'TYPE must not fail old colour quotas');
    assert.deepEqual(typed.warnings, expected.map(m => `HOUSE/TYPE review note (colour-quota; not a redesign instruction): ${m}`));
    for (const project of [{}, { typeBible: false }, { typeBible: 'true' }]) assert.deepEqual(run(project, [row]), { errors: expected, warnings: [] });
  }
});

test('actual chapter consumer preserves mono/noir exception and empty measurement behavior', () => {
  const rows = [{ family: 0, strong: 0, families: 0 }];
  const film = [{ beat: 'B01', palette: 'noir' }];
  assert.deepEqual(run({}, rows, { mono: true, film }), { errors: [], warnings: [] });
  assert.ok(run({}, rows, { mono: true, film: [{ beat: 'B01', palette: 'mustard' }] }).errors.length, 'coloured maps retain legacy quota');
  for (const project of [{}, { typeBible: true }]) assert.deepEqual(run(project, []), { errors: [], warnings: [] });
});

test('actual chapter consumer keeps real palette mismatch hard, separate from quota notes', () => {
  const rows = [{ rim: '#110b0c', ...quotas[1] }], script = [{ beat: 'B01', ground: '#151313' }];
  const expected = groundTintErrors(rows, script, ['B01']);
  assert.equal(expected.length, 1, 'real neutral-ground contract must fail');
  const result = run({ typeBible: true }, rows, { film: [{ beat: 'B01', palette: 'noir' }], script });
  assert.deepEqual(result.errors, expected);
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings.every(m => m.includes('colour-quota')));
  // Neighbouring production safety checks must not be routed through aesthetic scope.
  assert.match(chapter, /errors\.push\(\.\.\.numberErrors\(shownTexts/);
  assert.match(chapter, /\.\.\.digitFaceErrors\(drawn, s\.shotId\)/);
  assert.match(chapter, /errors\.push\(\.\.\.await bibleTrackErrors/);
  assert.match(chapter, /errors\.push\(\.\.\.geometryErrors\(track/);
});
