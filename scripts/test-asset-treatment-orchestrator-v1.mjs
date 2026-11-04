#!/usr/bin/env node

import assert from "node:assert/strict";
import {assertAssetTreatmentDecision, compileAssetTreatmentDecision} from "../apps/studio-next/src/lib/a1-asset-treatment-orchestrator-v1.mjs";

const base = {
  source: {cleanAssetAvailable: true, assetCount: 1, alphaAvailable: false, matteReviewStatus: "NOT_AVAILABLE", sourceAuthority: "NON_EVIDENCE"},
  shot: {shotFunction: "ACTION", viewerTask: "Understand why this source is present", carrierRole: "SOURCE_CONTEXT", placementPlane: "FLOATING", copyDensity: "LOW", effectIntensity: "LOW"},
  background: {complexity: "QUIET", subjectSeparation: "ADEQUATE"},
  semantics: {temporalContext: "CURRENT", domain: "GENERAL", memoryMode: "NONE", visualIntent: "SOURCE_CONTEXT", tone: "NEUTRAL", conceptualActions: []},
  sequence: {stylizedCountInWindow: 0, recentTreatments: [], recentFamilies: []},
};

const fixtures = [
  {
    id: "person-busy-identity",
    input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY"}, background: {complexity: "BUSY", subjectSeparation: "LOW"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT"}},
    expected: {mode: "CUTOUT", effectIntent: "OUTLINE", art: "CLEAN"},
  },
  {
    id: "object-plane-explainer",
    input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER", placementPlane: "OBJECT_PLANE"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT"}},
    expected: {mode: "CUTOUT", effectIntent: "SHADOW", art: "CLEAN"},
  },
  {
    id: "person-no-matte-fallback",
    input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT"}},
    expected: {mode: "SOURCE_RECT", effectIntent: "DEFAULT", art: "CLEAN"},
  },
  {
    id: "document-evidence",
    input: {...base, source: {...base.source, sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceAuthority: "AUTHORITATIVE_EVIDENCE"}, shot: {...base.shot, shotFunction: "RESULT_HOLD", viewerTask: "Read the verified document"}, semantics: {tags: []}},
    expected: {mode: "EVIDENCE_PRESERVE", effectIntent: "DEFAULT", art: "CLEAN"},
  },
  {
    id: "archive-historical",
    input: {...base, source: {...base.source, sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET"}, shot: {...base.shot, shotFunction: "REVEAL"}, semantics: {...base.semantics, temporalContext: "HISTORICAL", memoryMode: "ARCHIVE", tone: "SOBER"}},
    expected: {mode: "ARCHIVE_PRINT", effectIntent: "DEFAULT", art: "INK_MONO"},
  },
  {
    id: "science-blueprint",
    input: {...base, source: {...base.source, sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT"}, shot: {...base.shot, shotFunction: "ESTABLISH"}, semantics: {...base.semantics, domain: "ENGINEERING", visualIntent: "TACTILE_PRINT"}},
    expected: {mode: "SOURCE_RECT", effectIntent: "DEFAULT", art: "CYANOTYPE_CONTACT", support: "INK_BLEED_EDGE"},
  },
  {
    id: "digital-signal",
    input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER"}, semantics: {...base.semantics, domain: "TECHNOLOGY", memoryMode: "EARLY_DIGITAL", visualIntent: "ISOLATE_SUBJECT"}},
    expected: {mode: "CUTOUT", effectIntent: "CLEAN", art: "ATKINSON_GRAIN"},
  },
  {
    id: "conflict-duplicate",
    input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY", shotFunction: "COMPARISON"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT", conceptualActions: ["INSTABILITY", "DUPLICATION"]}},
    expected: {mode: "CUTOUT", effectIntent: "CLEAN", art: "PRINT_MISREGISTER"},
  },
  {
    id: "fractured-scene",
    input: {...base, source: {...base.source, sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT"}, shot: {...base.shot, shotFunction: "TRANSITION"}, semantics: {...base.semantics, conceptualActions: ["FRACTURE", "CONFLICT"]}},
    expected: {mode: "SOURCE_RECT", effectIntent: "DEFAULT", art: "TORN_PAPER_EDGE"},
  },
  {
    id: "plain-scene",
    input: {...base, source: {...base.source, sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT"}},
    expected: {mode: "SOURCE_RECT", effectIntent: "DEFAULT", art: "CLEAN"},
  },
  {
    id: "sequence-budget-clean",
    input: {...base, source: {...base.source, sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT"}, semantics: {...base.semantics, domain: "ENGINEERING"}, sequence: {stylizedCountInWindow: 3, recentTreatments: ["CYANOTYPE_CONTACT"], recentFamilies: ["CHEMICAL_PRINT"]}},
    expected: {mode: "SOURCE_RECT", effectIntent: "DEFAULT", art: "CLEAN"},
  },
  {
    id: "recent-repeat-clean",
    input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER"}, semantics: {...base.semantics, memoryMode: "EARLY_DIGITAL", visualIntent: "ISOLATE_SUBJECT"}, sequence: {stylizedCountInWindow: 1, recentTreatments: ["ATKINSON_GRAIN"], recentFamilies: ["DITHER"]}},
    expected: {mode: "CUTOUT", effectIntent: "CLEAN", art: "CLEAN"},
  },
  {
    id: "concept-bridge-duotone",
    input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY", shotFunction: "TRANSITION"}, semantics: {...base.semantics, visualIntent: "CONCEPTUAL_BRIDGE"}},
    expected: {mode: "CUTOUT", effectIntent: "CLEAN", art: "SPOT_DUOTONE"},
  },
  {
    id: "archive-repeat-xerox",
    input: {...base, source: {...base.source, sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET"}, semantics: {...base.semantics, memoryMode: "ARCHIVE", conceptualActions: ["REPETITION"]}},
    expected: {mode: "ARCHIVE_PRINT", effectIntent: "DEFAULT", art: "XEROX_GRAIN"},
  },
  {
    id: "person-echo-halftone",
    input: {...base, source: {...base.source, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "PERSON_IDENTITY"}, semantics: {...base.semantics, visualIntent: "ISOLATE_SUBJECT", conceptualActions: ["DUPLICATION"]}},
    expected: {mode: "CUTOUT", effectIntent: "CLEAN", art: "HALFTONE_ECHO"},
  },
  {
    id: "technical-abstraction-dither",
    input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER"}, semantics: {...base.semantics, domain: "TECHNOLOGY", visualIntent: "ISOLATE_SUBJECT"}},
    expected: {mode: "CUTOUT", effectIntent: "CLEAN", art: "DITHER_1BIT"},
  },
  {
    id: "paper-fibre-cutout",
    input: {...base, source: {...base.source, sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", alphaAvailable: true, matteReviewStatus: "PASS"}, shot: {...base.shot, carrierRole: "OBJECT_EXPLAINER"}, semantics: {...base.semantics, visualIntent: "PAPER_CUTOUT"}},
    expected: {mode: "CUTOUT", effectIntent: "CLEAN", art: "CUT_PAPER_FIBER_EDGE"},
  },
  {
    id: "source-colour-anchor",
    input: {...base, source: {...base.source, sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT"}, shot: {...base.shot, shotFunction: "TRANSITION"}, semantics: {...base.semantics, visualIntent: "COLOR_ANCHOR"}},
    expected: {mode: "SOURCE_RECT", effectIntent: "DEFAULT", art: "SELECTIVE_SOURCE_COLOR"},
  },
];

const results = fixtures.map((fixture) => ({fixture, decision: compileAssetTreatmentDecision(fixture.input)}));
for (const {fixture, decision} of results) {
  assert.equal(decision.status, "READY_FOR_REVIEW", `${fixture.id}:${decision.failures}`);
  assert.equal(decision.presentation.mode, fixture.expected.mode, `${fixture.id}:mode`);
  assert.equal(decision.separation.effectIntent, fixture.expected.effectIntent, `${fixture.id}:separation`);
  assert.equal(decision.art.selectedTreatment, fixture.expected.art, `${fixture.id}:art:${decision.art.reasons}`);
  if (fixture.expected.support) assert.equal(decision.art.supportTreatment, fixture.expected.support, `${fixture.id}:support`);
  assert.equal(decision.semantics.derivedAutomatically, true, `${fixture.id}:semantic-derivation`);
  assertAssetTreatmentDecision(decision);
}

const missingSemantics = compileAssetTreatmentDecision({...base, source: {...base.source, sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT"}, semantics: {temporalContext: "CURRENT", domain: "GENERAL", memoryMode: "NONE", visualIntent: "", tone: "NEUTRAL", conceptualActions: [], tags: []}});
assert.equal(missingSemantics.status, "BLOCKED");
assert.ok(missingSemantics.failures.includes("SEMANTIC_TAGS_REQUIRED_FOR_AUTOMATIC_TREATMENT"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1AssetTreatmentOrchestratorTest/v1",
  fixtures: results.map(({fixture, decision}) => ({id: fixture.id, presentationMode: decision.presentation.mode, separation: decision.separation.effectIntent, art: decision.art.selectedTreatment, support: decision.art.supportTreatment, reasons: decision.art.reasons})),
  failClosedChecks: ["evidence-preserve-only", "verified-alpha-before-cutout", "semantic-reason-before-effect", "sequence-style-budget", "adjacent-repeat-penalty", "clean-master-preserved"],
}, null, 2));
