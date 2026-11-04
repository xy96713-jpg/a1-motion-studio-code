#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertAssetArtTreatmentPlan, compileAssetArtTreatmentPlan} from "../apps/studio-next/src/lib/a1-asset-art-treatment-director-v1.mjs";

const fixtures = [
  {id: "mono-person", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "INK_MONO", expected: "INK_MONO", outputRole: "PRIMARY"},
  {id: "xerox-archive", sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET", sourceArchetype: "ARCHIVE_PRINT_EDGE", requestedTreatment: "XEROX_GRAIN", expected: "XEROX_GRAIN", outputRole: "SECONDARY"},
  {id: "halftone-person", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "HALFTONE_ECHO", expected: "HALFTONE_ECHO", outputRole: "SECONDARY"},
  {id: "dither-object", sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "DITHER_1BIT", expected: "DITHER_1BIT", outputRole: "SECONDARY"},
  {id: "torn-photo", sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT", sourceArchetype: "SOURCE_RECT_CLEAN", requestedTreatment: "TORN_PAPER_EDGE", expected: "TORN_PAPER_EDGE", outputRole: "PRIMARY"},
  {id: "misregister-person", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "PRINT_MISREGISTER", expected: "PRINT_MISREGISTER", outputRole: "SECONDARY"},
  {id: "clean-evidence", sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceArchetype: "DOCUMENT_EVIDENCE_PRESERVE", sourceAuthority: "AUTHORITATIVE_EVIDENCE", requestedTreatment: "AUTO", expected: "CLEAN", outputRole: "PRIMARY"},
  {id: "spot-duotone", sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT", sourceArchetype: "SOURCE_RECT_CLEAN", requestedTreatment: "SPOT_DUOTONE", expected: "SPOT_DUOTONE", outputRole: "PRIMARY"},
  {id: "atkinson", sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "ATKINSON_GRAIN", expected: "ATKINSON_GRAIN", outputRole: "SECONDARY"},
  {id: "ink-bleed", sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET", sourceArchetype: "ARCHIVE_PRINT_EDGE", requestedTreatment: "INK_BLEED_EDGE", expected: "INK_BLEED_EDGE", outputRole: "SUPPORT"},
  {id: "cyanotype", sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT", sourceArchetype: "SOURCE_RECT_CLEAN", requestedTreatment: "CYANOTYPE_CONTACT", expected: "CYANOTYPE_CONTACT", outputRole: "PRIMARY"},
  {id: "cut-paper-fibre", sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "CUT_PAPER_FIBER_EDGE", expected: "CUT_PAPER_FIBER_EDGE", outputRole: "PRIMARY"},
  {id: "selective-source-colour", sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT", sourceArchetype: "SOURCE_RECT_CLEAN", requestedTreatment: "SELECTIVE_SOURCE_COLOR", expected: "SELECTIVE_SOURCE_COLOR", outputRole: "PRIMARY"},
];

const results = fixtures.map((fixture) => ({fixture, plan: compileAssetArtTreatmentPlan(fixture)}));
for (const {fixture, plan} of results) {
  assert.equal(plan.status, "READY_FOR_REVIEW", `${fixture.id}:${plan.failures}`);
  assert.equal(plan.routing.treatment, fixture.expected);
  assert.equal(plan.routing.cleanMasterPreserved, true);
  assert.equal(plan.boundaries.fixedCardRatio, false);
  assert.equal(plan.boundaries.backgroundGenerated, false);
  assert.equal(plan.boundaries.titleRendered, false);
  assertAssetArtTreatmentPlan(plan);
}

const styledEvidence = compileAssetArtTreatmentPlan({sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceArchetype: "DOCUMENT_EVIDENCE_PRESERVE", sourceAuthority: "AUTHORITATIVE_EVIDENCE", requestedTreatment: "XEROX_GRAIN", outputRole: "SECONDARY"});
assert.equal(styledEvidence.status, "BLOCKED");
assert.ok(styledEvidence.failures.includes("AUTHORITATIVE_EVIDENCE_PRESERVE_ONLY"));

const primaryHalftone = compileAssetArtTreatmentPlan({sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "HALFTONE_ECHO", outputRole: "PRIMARY"});
assert.equal(primaryHalftone.status, "BLOCKED");
assert.ok(primaryHalftone.failures.includes("ART_TREATMENT_SECONDARY_ONLY"));

const tornCutout = compileAssetArtTreatmentPlan({sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "TORN_PAPER_EDGE", outputRole: "PRIMARY"});
assert.equal(tornCutout.status, "BLOCKED");
assert.ok(tornCutout.failures.includes("TORN_EDGE_REQUIRES_RECTANGULAR_SOURCE"));

const primaryAtkinson = compileAssetArtTreatmentPlan({sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "ATKINSON_GRAIN", outputRole: "PRIMARY"});
assert.equal(primaryAtkinson.status, "BLOCKED");
assert.ok(primaryAtkinson.failures.includes("ART_TREATMENT_SECONDARY_ONLY"));

const bleedAsPrimary = compileAssetArtTreatmentPlan({sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET", sourceArchetype: "ARCHIVE_PRINT_EDGE", requestedTreatment: "INK_BLEED_EDGE", outputRole: "PRIMARY"});
assert.equal(bleedAsPrimary.status, "BLOCKED");
assert.ok(bleedAsPrimary.failures.includes("ART_TREATMENT_SUPPORT_ONLY"));

const paperWithoutAlpha = compileAssetArtTreatmentPlan({sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", sourceArchetype: "SOURCE_RECT_CLEAN", requestedTreatment: "CUT_PAPER_FIBER_EDGE", outputRole: "PRIMARY"});
assert.equal(paperWithoutAlpha.status, "BLOCKED");
assert.ok(paperWithoutAlpha.failures.includes("CUT_PAPER_FIBER_REQUIRES_VERIFIED_ALPHA_ARCHETYPE"));

const selectiveEvidence = compileAssetArtTreatmentPlan({sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceArchetype: "DOCUMENT_EVIDENCE_PRESERVE", sourceAuthority: "AUTHORITATIVE_EVIDENCE", requestedTreatment: "SELECTIVE_SOURCE_COLOR", outputRole: "PRIMARY"});
assert.equal(selectiveEvidence.status, "BLOCKED");
assert.ok(selectiveEvidence.failures.includes("AUTHORITATIVE_EVIDENCE_PRESERVE_ONLY"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1AssetArtTreatmentDirectorTest/v1",
  fixtures: results.map(({fixture, plan}) => ({id: fixture.id, treatment: plan.routing.treatment, outputRole: plan.routing.outputRole, parameters: plan.parameters})),
  failClosedChecks: ["authoritative-evidence-preserve-only", "halftone-secondary-only", "torn-edge-rectangular-only", "paper-fibre-alpha-only", "selective-colour-non-evidence-only", "no-card-title-or-background"],
}, null, 2));
