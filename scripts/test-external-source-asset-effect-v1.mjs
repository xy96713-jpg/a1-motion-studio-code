#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertExternalSourceAssetEffectPlan, compileExternalSourceAssetEffectPlan} from "../apps/studio-next/src/lib/a1-external-source-asset-effect-v1.mjs";

const fixtures = [
  {id: "evidence", route: "EVIDENCE_HIGHLIGHT", mediaRole: "DOCUMENT_EVIDENCE", expected: ["SOURCE_PRESERVE"]},
  {id: "person", route: "SUBJECT_ISOLATION", mediaRole: "PERSON_SUBJECT", matteAvailable: true, expected: ["CLEAN_CUTOUT", "LABEL_ANCHOR"]},
  {id: "archive", route: "ARCHIVE_COLLAGE", mediaRole: "ARCHIVE_SET", expected: ["SOURCE_PRESERVE"]},
  {id: "print", route: "DISTRESSED_PRINT", mediaRole: "PRINT_ARTIFACT", expected: ["SOURCE_PRESERVE"]},
  {id: "prop", route: "PROP_PERSPECTIVE", mediaRole: "PHYSICAL_PROP", matteAvailable: true, expected: ["CLEAN_CUTOUT", "OBJECT_PLANE_ANCHOR"]},
];

const plans = fixtures.map((fixture) => ({...fixture, plan: compileExternalSourceAssetEffectPlan(fixture)}));
for (const fixture of plans) {
  assert.equal(fixture.plan.status, "READY_FOR_REVIEW", `${fixture.id}:${fixture.plan.failures}`);
  assert.deepEqual(fixture.plan.effectStack, fixture.expected);
  assert.equal(fixture.plan.alphaContract.background, "TRANSPARENT");
  assert.equal(fixture.plan.compositionBoundary.ownsFullFrame, false);
  assert.equal(fixture.plan.compositionBoundary.mayGenerateBackground, false);
  assert.equal(fixture.plan.compositionBoundary.mayPlaceHeadline, false);
  assertExternalSourceAssetEffectPlan(fixture.plan);
}

const halftone = compileExternalSourceAssetEffectPlan({route: "SUBJECT_ISOLATION", mediaRole: "PERSON_SUBJECT", matteAvailable: true, effectIntent: "HALFTONE_ACCENT"});
assert.equal(halftone.status, "READY_FOR_REVIEW");
assert.ok(halftone.effectStack.includes("HALFTONE_ECHO"));
assert.equal(halftone.effectParameters.print.halftoneTarget, "OFFSET_ECHO_OR_SECONDARY_COPY");

const evidenceHalftone = compileExternalSourceAssetEffectPlan({route: "EVIDENCE_HIGHLIGHT", mediaRole: "DOCUMENT_EVIDENCE", effectIntent: "HALFTONE_ACCENT"});
assert.equal(evidenceHalftone.status, "BLOCKED");
assert.ok(evidenceHalftone.failures.includes("EVIDENCE_EFFECT_MUST_PRESERVE_SOURCE"));

const missingMatte = compileExternalSourceAssetEffectPlan({route: "SUBJECT_ISOLATION", mediaRole: "PERSON_SUBJECT", matteAvailable: false});
assert.equal(missingMatte.status, "BLOCKED");
assert.ok(missingMatte.failures.includes("VERIFIED_ALPHA_REQUIRED"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ExternalSourceAssetEffectTest/v1",
  fixtures: plans.map((item) => ({id: item.id, effectStack: item.plan.effectStack, planSha256: item.plan.planSha256})),
  failClosedChecks: ["no-full-frame-ownership", "no-generated-background", "no-invented-headline", "evidence-preserve-only", "verified-alpha-required"],
}, null, 2));
