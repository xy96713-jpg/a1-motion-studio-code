#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileTypographyCompositionV1} from "../apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frameSha256 = "b".repeat(64);
const context = (available = [{id: "region", box: {x: .08, y: .75, width: .84, height: .18}, visualSuitability: .95}]) => ({
  contract: "A1TypographyShotVisualContext/v1",
  carrierMode: "FOOTAGE",
  frame: {sha256: frameSha256, width: 1920, height: 1080},
  geometryEvidence: {method: "TEST_CONTEXT_GEOMETRY", frameSha256},
  protectedRegions: [{id: "subject", box: {x: .42, y: .16, width: .22, height: .54}}],
  availableRegions: available,
  anchors: [], safetyPadding: .012, minimumGroupWidth: .025, minimumGroupHeight: .025,
});

const cases = [
  {mechanism: "spatial-axis type", key: "SPATIAL_AXIS_TYPE", expectedRecipe: "REFERENCE_SPATIAL_AXIS_BASELINE", composition: "SPATIAL_AXIS_OR_NEGATIVE_SPACE"},
  {mechanism: "quiet question", key: "QUIET_QUESTION", expectedRecipe: "REFERENCE_QUIET_QUESTION", composition: "SUBJECT_AWARE_NEGATIVE_SPACE"},
  {mechanism: "stage word", key: "STAGE_WORD", expectedRecipe: "REFERENCE_STAGE_WORD", composition: "SUBJECT_AWARE_NEGATIVE_SPACE"},
  {mechanism: "giant glyph and subject overlap", key: "GIANT_GLYPH_AND_SUBJECT_OVERLAP", expectedRecipe: "REFERENCE_GIANT_GLYPH_CLEARANCE", composition: "SUBJECT_AWARE_NEGATIVE_SPACE"},
  {mechanism: "full-frame editorial spread", key: "FULL_FRAME_EDITORIAL_SPREAD", expectedRecipe: "REFERENCE_FULL_FRAME_SPREAD", composition: "SUBJECT_AWARE_NEGATIVE_SPACE"},
];

const plans = cases.map((item) => compileTypographyCompositionV1({
  typographyRole: "FULLSCREEN_HERO", semanticEvent: "QUESTION", effectId: "EVA_COMPRESS",
  effectDisplayGroups: ["问题"], compositionMechanism: item.composition,
  referenceMechanism: item.mechanism, shotVisualContext: context(), requireShotVisualContext: true,
}));
for (let i = 0; i < cases.length; i += 1) {
  assert.equal(plans[i].status, "PASS_REVIEW_ONLY", cases[i].mechanism);
  assert.equal(plans[i].referenceMechanism, cases[i].key, cases[i].mechanism);
  assert.equal(plans[i].recipeId, cases[i].expectedRecipe, cases[i].mechanism);
  assert.ok(plans[i].layoutContext.status === "PASS_REVIEW_ONLY", cases[i].mechanism);
  assert.ok(plans[i].groups.every((item) => item.box.x >= 0 && item.box.y >= 0 && item.box.x + item.box.width <= 1 && item.box.y + item.box.height <= 1), cases[i].mechanism);
}
assert.equal(new Set(plans.map((item) => item.recipeId)).size, cases.length);
assert.ok(plans[0].groups[0].box.y > .6, "spatial-axis route should use a scene axis near the lower safe field");
assert.ok(plans[1].groups[0].fontScale < 1, "quiet-question route should lower typographic intensity");
assert.ok(plans[2].groups[0].fontScale > 1, "stage-word route should establish a dominant word");
assert.ok(plans[3].groups[0].fontScale > 1, "giant-glyph route should claim negative space while respecting protection");
assert.ok(plans[4].groups[plans[4].dominantGroupIndex].box.width > .7, "editorial-spread route should use a broad composition field");

const uiAxis = compileTypographyCompositionV1({
  typographyRole: "SOURCE_ANNOTATION", semanticEvent: "PROCESS", effectId: "CLEAN_EDITORIAL",
  effectDisplayGroups: ["打开设置"], compositionMechanism: "SOURCE_NATIVE_OR_UI_MARGIN",
  referenceMechanism: "SPATIAL_AXIS_TYPE", shotVisualContext: context([{id: "margin", box: {x: .03, y: .12, width: .18, height: .76}, visualSuitability: .95}]),
  requireShotVisualContext: true,
});
assert.equal(uiAxis.status, "PASS_REVIEW_ONLY");
assert.equal(uiAxis.recipeId, "UI_MARGIN_SPATIAL_AXIS");
assert.equal(uiAxis.groups[0].writingMode, "VERTICAL_TB");

for (const mechanism of ["rejected subtitle-like negative control", "unknown reference mechanism"]) {
  const blocked = compileTypographyCompositionV1({
    typographyRole: "FULLSCREEN_HERO", semanticEvent: "QUESTION", effectId: "EVA_COMPRESS",
    effectDisplayGroups: ["问题"], compositionMechanism: "SUBJECT_AWARE_NEGATIVE_SPACE",
    referenceMechanism: mechanism, shotVisualContext: context(), requireShotVisualContext: true,
  });
  assert.equal(blocked.status, "BLOCK", mechanism);
  assert.ok(blocked.failures.some((failure) => ["REFERENCE_MECHANISM_REJECTED", "REFERENCE_MECHANISM_UNSUPPORTED"].includes(failure.code)), mechanism);
}

const runtime = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-typography-composition-director-v1.mjs"), "utf8");
for (const forbidden of ["holdout-evidence-water", "holdout-evidence-sleep", "holdout-tutorial-backup", "holdout-tutorial-camera", "holdout-opinion-meeting", "holdout-opinion-reading", "resident water waste", "backup workflow", "meeting opinion"]) {
  assert.equal(runtime.includes(forbidden), false, forbidden);
}
const result = {contract: "A1TypographyReferenceMechanismRoutingTest/v1", status: "PASS", routeCount: cases.length, uniqueRecipeCount: new Set(plans.map((item) => item.recipeId)).size, uiAxisRegression: uiAxis.status, negativeControlsBlocked: true, productionAdmission: false};
const output = path.join(root, "work/typography-director-v3-shadow-v1/visual-context-canary/reference-bound-canary-v1/mechanism-routing-test.json");
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
