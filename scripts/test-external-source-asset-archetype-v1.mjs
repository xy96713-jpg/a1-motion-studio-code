#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertExternalSourceAssetArchetypePlan, compileExternalSourceAssetArchetypePlan} from "../apps/studio-next/src/lib/a1-external-source-asset-archetype-v1.mjs";

const fixtures = [
  {id: "cutout-clean", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", matteAvailable: true, expected: "TIGHT_CUTOUT"},
  {id: "cutout-outline", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", matteAvailable: true, effectIntent: "OUTLINE", expected: "CUTOUT_CONTRAST_STROKE"},
  {id: "archive-print", sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET", expected: "ARCHIVE_PRINT_EDGE"},
  {id: "scene-rect", sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT", expected: "SOURCE_RECT_CLEAN"},
  {id: "document", sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", expected: "DOCUMENT_EVIDENCE_PRESERVE"},
  {id: "diptych", sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT", assetCount: 2, comparisonIntent: true, expected: "PHOTO_DIPTYCH"},
  {id: "halftone", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", matteAvailable: true, effectIntent: "HALFTONE_ACCENT", outputRole: "SECONDARY", expected: "HALFTONE_ECHO"},
];

const results = fixtures.map((fixture) => ({fixture, plan: compileExternalSourceAssetArchetypePlan(fixture)}));
for (const {fixture, plan} of results) {
  assert.equal(plan.status, "READY_FOR_REVIEW", `${fixture.id}:${plan.failures}`);
  assert.equal(plan.archetype, fixture.expected);
  assert.equal(plan.geometry.aspectPolicy, "SOURCE_DRIVEN");
  assert.equal(plan.geometry.fixedCardRatio, null);
  assert.equal(plan.geometry.visibleCard, false);
  assert.equal(plan.boundaries.backgroundGenerated, false);
  assert.equal(plan.boundaries.titleRendered, false);
  assertExternalSourceAssetArchetypePlan(plan);
}

const unverifiedFragment = compileExternalSourceAssetArchetypePlan({sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", requestedArchetype: "EVIDENCE_FRAGMENT"});
assert.equal(unverifiedFragment.status, "BLOCKED");
assert.ok(unverifiedFragment.failures.includes("VERIFIED_EVIDENCE_FOCUS_REQUIRED"));

const primaryHalftone = compileExternalSourceAssetArchetypePlan({sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", matteAvailable: true, requestedArchetype: "HALFTONE_ECHO"});
assert.equal(primaryHalftone.status, "BLOCKED");
assert.ok(primaryHalftone.failures.includes("HALFTONE_ECHO_SECONDARY_ONLY"));

const missingMatte = compileExternalSourceAssetArchetypePlan({sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", requestedArchetype: "TIGHT_CUTOUT"});
assert.equal(missingMatte.status, "BLOCKED");
assert.ok(missingMatte.failures.includes("VERIFIED_ALPHA_REQUIRED"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ExternalSourceAssetArchetypeTest/v1",
  fixtures: results.map(({fixture, plan}) => ({id: fixture.id, archetype: plan.archetype, canvasPolicy: plan.geometry.canvasPolicy, effects: plan.treatment.effects})),
  failClosedChecks: ["no-fixed-card-ratio", "unverified-evidence-fragment", "halftone-secondary-only", "verified-alpha-required", "no-title-or-background"],
}, null, 2));

