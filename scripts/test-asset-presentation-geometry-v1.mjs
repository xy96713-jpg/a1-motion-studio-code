#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertAssetPresentationGeometryPlan, compileAssetPresentationGeometryPlan} from "../apps/studio-next/src/lib/a1-asset-presentation-geometry-v1.mjs";

const fixtures = [
  {id: "portrait-cutout", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceWidth: 900, sourceHeight: 1200, matteAvailable: true, expectedFamily: "CUTOUT_ASSET", expectedRatio: "4:5"},
  {id: "archive-landscape", sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET", sourceWidth: 1600, sourceHeight: 1100, expectedFamily: "PHOTO_CARD", expectedRatio: "4:3"},
  {id: "wide-scene", sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT", sourceWidth: 1920, sourceHeight: 1080, expectedFamily: "EDITORIAL_CROP", expectedRatio: "16:9"},
  {id: "portrait-document", sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceWidth: 900, sourceHeight: 1400, expectedFamily: "EVIDENCE_RECT", expectedRatio: "3:4"},
  {id: "landscape-document", sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceWidth: 1400, sourceHeight: 900, expectedFamily: "EVIDENCE_RECT", expectedRatio: "4:3"},
  {id: "prop-no-matte", sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", sourceWidth: 1200, sourceHeight: 900, expectedFamily: "OBJECT_CARD", expectedRatio: "1:1"},
];

const results = fixtures.map((fixture) => ({fixture, plan: compileAssetPresentationGeometryPlan(fixture)}));
for (const {fixture, plan} of results) {
  assert.equal(plan.status, "READY_FOR_REVIEW", `${fixture.id}:${plan.failures}`);
  assert.equal(plan.presentationFamily, fixture.expectedFamily);
  assert.equal(plan.ratio.primary, fixture.expectedRatio);
  assert.equal(plan.ratio.review.length, 3);
  assert.equal(new Set(plan.ratio.review).size, 3);
  assert.equal(Object.keys(plan.ratio.outputs).length, 3);
  assert.equal(plan.compositionBoundary.ownsFullFrame, false);
  assert.equal(plan.compositionBoundary.visibleCopyRenderedHere, false);
  assertAssetPresentationGeometryPlan(plan);
}

const badRatio = compileAssetPresentationGeometryPlan({...fixtures[0], requestedRatio: "2:1"});
assert.equal(badRatio.status, "BLOCKED");
assert.ok(badRatio.failures.includes("REQUESTED_RATIO_UNSUPPORTED"));

const missingDimensions = compileAssetPresentationGeometryPlan({sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE"});
assert.equal(missingDimensions.status, "BLOCKED");
assert.ok(missingDimensions.failures.includes("SOURCE_DIMENSIONS_REQUIRED"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1AssetPresentationGeometryTest/v1",
  fixtures: results.map(({fixture, plan}) => ({id: fixture.id, family: plan.presentationFamily, primaryRatio: plan.ratio.primary, reviewRatios: plan.ratio.review, cropMode: plan.crop.mode})),
  failClosedChecks: ["unsupported-ratio", "missing-source-dimensions", "no-full-frame-ownership", "no-visible-copy"],
}, null, 2));

