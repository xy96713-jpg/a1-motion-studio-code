#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  EXTERNAL_SOURCE_PACKAGING_ROUTES,
  assertExternalSourcePackagingPlan,
  compileExternalSourcePackagingPlan,
} from "../apps/studio-next/src/lib/a1-external-source-packaging-router-v1.mjs";

const sha = (character) => character.repeat(64);
const source = (id, character, fixtureOnly = false) => ({
  id,
  assetUri: `/fixture/${id}.png`,
  sha256: sha(character),
  fixtureOnly,
  provenance: {sourceUri: fixtureOnly ? `fixture://${id}` : `https://source.test/${id}`, license: fixtureOnly ? "test-only fixture" : "verified review use", reviewed: true},
});
const review = (overrides = {}) => ({
  contract: "A1MaterialCarrierPixelReview/v1",
  status: "PASS",
  entityCorrect: true,
  sceneContextCorrect: true,
  actionCarrierFit: true,
  carrierVisible: true,
  materialRegion: {x: 0.08, y: 0.1, width: 0.84, height: 0.78},
  featurePrintDigest: sha("f").slice(0, 32),
  labels: [],
  ...overrides,
});

const fixtures = [
  {
    id: "route-evidence",
    expected: EXTERNAL_SOURCE_PACKAGING_ROUTES.EVIDENCE_HIGHLIGHT,
    input: {mediaRole: "DOCUMENT_EVIDENCE", source: source("document", "a"), requirement: {role: "evidence", effectBinding: {targetType: "source-text-range", semanticAction: "mark"}}, pixelReview: review({rangeRoi: {x: 0.18, y: 0.26, width: 0.58, height: 0.16}})},
  },
  {
    id: "route-subject",
    expected: EXTERNAL_SOURCE_PACKAGING_ROUTES.SUBJECT_ISOLATION,
    input: {mediaRole: "PERSON_SUBJECT", source: source("person", "b"), requirement: {role: "evidence", requiredEntity: "Verified subject", effectBinding: {targetType: "material-region", semanticAction: "reveal"}}, pixelReview: review({labels: [{id: "people", confidence: 0.95}]}), identityVerified: true, sourceClean: true, subjectMatte: {status: "PASS", alphaSafe: true, sourceSha256: sha("b"), matteSha256: sha("9")}},
  },
  {
    id: "route-archive",
    expected: EXTERNAL_SOURCE_PACKAGING_ROUTES.ARCHIVE_COLLAGE,
    input: {mediaRole: "ARCHIVE_SET", sources: [source("archive-a", "c"), source("archive-b", "d")], requirement: {role: "context", effectBinding: {targetType: "material-region", semanticAction: "reveal"}}, pixelReview: review()},
  },
  {
    id: "route-print",
    expected: EXTERNAL_SOURCE_PACKAGING_ROUTES.DISTRESSED_PRINT,
    input: {mediaRole: "PRINT_ARTIFACT", source: source("print", "e"), requirement: {role: "context", effectBinding: {targetType: "material-region", semanticAction: "hold"}}, pixelReview: review()},
  },
  {
    id: "route-prop",
    expected: EXTERNAL_SOURCE_PACKAGING_ROUTES.PROP_PERSPECTIVE,
    input: {mediaRole: "PHYSICAL_PROP", source: source("prop", "1", true), requirement: {role: "object", effectBinding: {targetType: "object-roi", semanticAction: "append"}}, pixelReview: review({objectRoi: {x: 0.22, y: 0.18, width: 0.5, height: 0.6}})},
  },
];

const plans = fixtures.map((fixture) => ({...fixture, plan: compileExternalSourcePackagingPlan(fixture.input)}));
for (const fixture of plans) {
  assert.equal(fixture.plan.status, "READY_FOR_REVIEW", `${fixture.id}:${fixture.plan.failures}`);
  assert.equal(fixture.plan.route, fixture.expected);
  assert.equal(fixture.plan.reviewBoundary.productionAdmission, false);
  assert.equal(fixture.plan.sourceTruth.generatedPixelsAuthoritative, false);
  assertExternalSourcePackagingPlan(fixture.plan);
}
assert.equal(new Set(plans.map((fixture) => fixture.plan.route)).size, 5);

const missingProvenance = compileExternalSourcePackagingPlan({...fixtures[0].input, source: {...source("bad", "2"), provenance: {reviewed: false}}});
assert.equal(missingProvenance.status, "BLOCKED");
assert.ok(missingProvenance.failures.includes("SOURCE_URI_MISSING"));
assert.ok(missingProvenance.failures.includes("SOURCE_RIGHTS_BOUNDARY_MISSING"));

const missingMatte = compileExternalSourcePackagingPlan({...fixtures[1].input, subjectMatte: null});
assert.equal(missingMatte.status, "BLOCKED");
assert.ok(missingMatte.failures.includes("VERIFIED_SUBJECT_MATTE_REQUIRED"));

const pendingPixels = compileExternalSourcePackagingPlan({...fixtures[0].input, pixelReview: {...fixtures[0].input.pixelReview, status: "PENDING"}});
assert.equal(pendingPixels.status, "BLOCKED");
assert.ok(pendingPixels.failures.includes("PIXEL_REVIEW_NOT_PASS"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ExternalSourcePackagingRouterTest/v1",
  routes: plans.map((fixture) => ({id: fixture.id, route: fixture.plan.route, planSha256: fixture.plan.planSha256})),
  failClosedChecks: ["missing-provenance", "missing-subject-matte", "pending-pixel-review"],
}, null, 2));
