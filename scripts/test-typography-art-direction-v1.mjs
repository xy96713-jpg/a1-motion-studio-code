#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileTypographyArtDirections, typographyArtDirectionCatalog} from "../apps/studio-next/src/lib/a1-typography-art-direction-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fixtureFile = path.join(root, "test-fixtures/typography-art-direction-v1.json");
const fixtures = JSON.parse(fs.readFileSync(fixtureFile, "utf8")).fixtures;

assert.equal(new Set(fixtures.map((fixture) => fixture.genre)).size, 3);
const catalog = typographyArtDirectionCatalog();
assert.equal(catalog.length, 3);
assert.equal(new Set(catalog.map((item) => item.layoutFamily)).size, 3);
assert.equal(new Set(catalog.map((item) => item.materialFamily)).size, 3);
assert.equal(new Set(catalog.map((item) => item.titleFontId)).size, 3);
assert(catalog.some((item) => item.materialFamily.includes("gradient")));
assert(catalog.some((item) => item.materialFamily.includes("halftone")));

for (const fixture of fixtures) {
  const plans = compileTypographyArtDirections(fixture);
  assert.equal(plans.length, 3);
  assert.equal(new Set(plans.map((plan) => plan.planSha256)).size, 3);
  for (const plan of plans) {
    assert.equal(plan.titleLines.join(""), fixture.title);
    assert.equal(plan.exactCopy, fixture.title);
    assert.equal(plan.reviewBoundary.aestheticApproval, "NONE_USER_REVIEW_REQUIRED");
    assert.equal(plan.reviewBoundary.productionAdmission, false);
    assert.equal(plan.reviewBoundary.userVisualApproval, "NOT_APPROVED");
    assert.equal(plan.coverageIntent.carrier, "FULLSCREEN_HERO_TYPE");
    assert.equal(plan.coverageIntent.titleIsPrimaryActor, true);
    assert.equal(plan.coverageIntent.presenterGeometryAllowed, false);
    assert(plan.geometry.titleSize >= 260);
  }
}

console.log(JSON.stringify({
  contract: "A1TypographyArtDirectionTest/v1",
  status: "PASS",
  fixtureCount: fixtures.length,
  directionCount: catalog.length,
  checks: ["three-genres", "three-layout-families", "three-material-families", "three-font-voices", "exact-copy-preserved", "no-machine-aesthetic-pass"],
}, null, 2));
