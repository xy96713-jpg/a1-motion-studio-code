#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileGlyphBehaviorFamilies, glyphBehaviorCatalog} from "../apps/studio-next/src/lib/a1-glyph-operator-system-v1.mjs";
import {typographyEffectForbiddenMechanisms} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
const catalog = glyphBehaviorCatalog();

assert.equal(new Set(fixtures.map((fixture) => fixture.genre)).size, 3);
assert.equal(catalog.length, 10);
assert.equal(new Set(catalog.map((behavior) => behavior.id)).size, 10);
assert.equal(new Set(catalog.map((behavior) => behavior.fontBinding)).size, 3);
assert(catalog.every((behavior) => behavior.outputMode === "TRANSPARENT_GLYPH_ASSET"));
const serialized = JSON.stringify(catalog).toLowerCase();
for (const forbidden of typographyEffectForbiddenMechanisms()) assert(!serialized.includes(forbidden), `forbidden behavior mechanism:${forbidden}`);

for (const fixture of fixtures) {
  const plans = compileGlyphBehaviorFamilies(fixture);
  assert.equal(plans.length, 10);
  assert.equal(new Set(plans.map((plan) => plan.planSha256)).size, 10);
  for (const plan of plans) {
    assert.equal(plan.exactCopy, fixture.title);
    assert(plan.geometryOperators.length >= 4);
    assert(plan.compositingOperators.length >= 1);
    assert.equal(plan.outputMode, "TRANSPARENT_GLYPH_ASSET");
    assert.equal(plan.typographyOnly, true);
    assert.equal(plan.reviewBoundary.productionAdmission, false);
  }
}

console.log(JSON.stringify({contract: "A1GlyphOperatorSystemTest/v1", status: "PASS", fixtureCount: fixtures.length, behaviorCount: catalog.length, checks: ["three-genres", "ten-behavior-families", "three-font-profiles", "exact-copy", "transparent-glyph-only", "operator-diversity", "no-machine-aesthetic-pass"]}, null, 2));
