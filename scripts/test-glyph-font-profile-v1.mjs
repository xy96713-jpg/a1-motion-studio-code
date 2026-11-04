#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileGlyphFontProfileTrials, glyphFontProfileCatalog, GLYPH_PROPORTION_VISIBILITY_LIMITS_V1, semanticTitleGroups} from "../apps/studio-next/src/lib/a1-glyph-font-profile-v1.mjs";
import {glyphBehaviorCatalog} from "../apps/studio-next/src/lib/a1-glyph-operator-system-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
const profiles = glyphFontProfileCatalog();
const behaviorIds = new Set(glyphBehaviorCatalog().map((behavior) => behavior.id));

assert.equal(profiles.length, 2);
assert.equal(new Set(profiles.map((profile) => profile.fontId)).size, 2);
const eva = profiles.find((profile) => profile.id === "EVA_MINCHO");
assert(eva);
assert.equal(eva.fontId, "source-han-serif-heavy");
assert.equal(eva.scaleX, 0.6);
assert.equal(eva.scaleY, 1);
assert(GLYPH_PROPORTION_VISIBILITY_LIMITS_V1.minimumGlyphVisibilityRatio >= 0.8);

for (const required of ["AXIS_RESPONSIVE", "COUNTERFORM_REVEAL", "CLEAN_EDITORIAL"]) assert(behaviorIds.has(required));
const counterformBehavior = glyphBehaviorCatalog().find((behavior) => behavior.id === "COUNTERFORM_REVEAL");
assert.equal(counterformBehavior.defaultEligibility, "SEMANTIC_ROUTE_ONLY");
for (const fixture of fixtures) {
  assert.equal(semanticTitleGroups(fixture.title).join(""), fixture.title);
  const trials = compileGlyphFontProfileTrials(fixture);
  assert.equal(trials.length, 4);
  assert.equal(new Set(trials.map((trial) => trial.planSha256)).size, 4);
  assert(!trials.some((trial) => trial.behaviorId === "COUNTERFORM_REVEAL"));
  const counterformTrials = compileGlyphFontProfileTrials(fixture, ["COUNTERFORM_REVEAL"]);
  assert.equal(counterformTrials.length, 2);
  for (const trial of trials) {
    assert.equal(trial.exactCopy, fixture.title);
    assert.equal(trial.semanticGroups.join(""), fixture.title);
    assert.equal(trial.reviewBoundary.productionAdmission, false);
  }
}

console.log(JSON.stringify({
  contract: "A1GlyphFontProfileTest/v1",
  status: "PASS",
  fixtureCount: fixtures.length,
  profileCount: profiles.length,
  defaultBehaviorCount: 2,
  optInBehaviorCount: 1,
  checks: ["eva-source-han-serif-heavy", "eva-scale-x-0.60", "semantic-groups-preserve-copy", "counterform-route-only", "circle-free-defaults", "proportion-limits", "visibility-floor", "no-production-admission"],
}, null, 2));
