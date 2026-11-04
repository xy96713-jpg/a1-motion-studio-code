#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {compileGlyphEffectPrograms, glyphEffectProgramCatalog} from "../apps/studio-next/src/lib/a1-glyph-effect-program-v1.mjs";
import {typographyEffectForbiddenMechanisms} from "../apps/studio-next/src/lib/a1-typography-effect-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
const catalog = glyphEffectProgramCatalog();
const required = ["CLEAN_EDITORIAL", "EVA_COMPRESS", "AXIS_RESPONSIVE", "SPLICE_REASSEMBLE", "PRINT_REGISTRATION", "LOCAL_GRADIENT", "BASELINE_CASCADE", "DIRECTIONAL_SHEAR", "COUNTERFORM_REVEAL", "PIXEL_TRACKING_LOCK"];

assert.equal(fixtures.length, 3);
assert.equal(new Set(fixtures.map((fixture) => fixture.genre)).size, 3);
assert.equal(catalog.length, 10);
assert.deepEqual(new Set(catalog.map((program) => program.id)), new Set(required));
assert(catalog.every((program) => program.fillProgram.clippedToGlyphAlpha === true));
assert(catalog.every((program) => program.outputMode === "TRANSPARENT_GLYPH_ASSET"));
const serialized = JSON.stringify(catalog).toLowerCase();
for (const forbidden of typographyEffectForbiddenMechanisms()) assert(!serialized.includes(forbidden), `forbidden effect mechanism:${forbidden}`);

for (const fixture of fixtures) {
  const programs = compileGlyphEffectPrograms(fixture);
  assert.equal(programs.length, 10);
  assert.equal(new Set(programs.map((program) => program.programSha256)).size, 10);
  for (const program of programs) {
    assert.equal(program.exactCopy, fixture.title);
    assert.equal(program.effectTarget, "GLYPH_OUTLINES");
    assert.equal(program.outputMode, "TRANSPARENT_GLYPH_ASSET");
    assert(program.glyphGeometryOperators.length >= 4);
    assert.equal(program.fillProgram.clippedToGlyphAlpha, true);
    assert.equal(program.authoredSceneElementsAllowed, false);
    assert.equal(program.reviewBoundary.productionAdmission, false);
  }
}

console.log(JSON.stringify({contract: "A1GlyphEffectProgramTest/v1", status: "PASS", fixtureCount: fixtures.length, programCount: catalog.length, checks: ["three-genres", "ten-glyph-only-effect-programs", "transparent-output", "gradient-clipped-to-glyph", "no-scene-elements", "no-machine-aesthetic-pass"]}, null, 2));
