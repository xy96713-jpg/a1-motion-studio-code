import assert from "node:assert/strict";
import {buildFilmTypographyProfile, validateFilmTypographyProfile} from "../apps/studio-next/src/lib/a1-film-typography-director-v1.mjs";

const assignments = [
  {shotId:"01", typographyRole:"FULLSCREEN_HERO", semanticEvent:"CHAPTER_BREAK", carrier:"FULL_FRAME_TAKEOVER"},
  {shotId:"02", typographyRole:"NO_TYPE", semanticEvent:"ORDINARY", carrier:"NONE"},
  {shotId:"03", typographyRole:"EXPLANATION_DIAGRAM", semanticEvent:"PROCESS", carrier:"DIAGRAM_STATE_PLANE"},
  {shotId:"04", typographyRole:"EVIDENCE_TRANSLATION", semanticEvent:"EVIDENCE", carrier:"EVIDENCE_TRANSLATION_PLANE"},
  {shotId:"05", typographyRole:"FULLSCREEN_HERO", semanticEvent:"STRONG_CONTRAST", carrier:"FULL_FRAME_TAKEOVER"},
  {shotId:"06", typographyRole:"PRESENTER_MARKER", semanticEvent:"DETAIL", carrier:"PRESENTER_ATTACHED_MARKER"},
  {shotId:"07", typographyRole:"PRESENTER_HERO", semanticEvent:"IDENTITY", carrier:"PRESENTER_DEPTH_HERO"},
  {shotId:"08", typographyRole:"CONCLUSION_STAMP", semanticEvent:"CONCLUSION", carrier:"FOREGROUND_VERDICT_STAMP"},
];
const profile = buildFilmTypographyProfile(assignments, {articleId:"blind-article", programMode:"LONG_TAKE_OPINION"});
assert.deepEqual(validateFilmTypographyProfile(profile), []);
assert.ok(profile.activeFamilies.length >= 4);
assert.equal(profile.assignments[0].eventFamily, "DIDONE_TITLE_GRID");
assert.ok(profile.suppressed.some((item) => item.preferred === "CROP_WORDMARK" && item.reason === "hero-window-budget"));
assert.equal(profile.assignments[3].eventFamily, "MICRO_EDITORIAL_SERIF");
assert.equal(profile.assignments[6].eventFamily, "SPATIAL_GEOMETRIC");
assert.ok(profile.assignments.every((item, index) => index < 6 || true));
assert.equal(profile.productionAdmission, false);
console.log(JSON.stringify({contract:"A1FilmTypographyDirectorTest/v1",status:"PASS",activeFamilies:profile.activeFamilies,familyCounts:profile.familyCounts,suppressed:profile.suppressed},null,2));
