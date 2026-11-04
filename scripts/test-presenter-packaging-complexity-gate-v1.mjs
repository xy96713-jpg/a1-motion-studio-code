#!/usr/bin/env node
import assert from "node:assert/strict";

import {derivePresenterPackagingComplexityGate} from "../apps/studio-next/src/lib/a1-presenter-packaging-complexity-gate-v1.mjs";
import {deriveCreatorPackagingProjection} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {presenterLightOverlayProjection} from "../apps/studio-next/src/lib/a1-presenter-light-overlay-policy-v1.mjs";

const simple = derivePresenterPackagingComplexityGate({
  semanticIntent: "人物口播时只出现一个简单对比标题与轻遮罩",
  semanticStructure: {kinds: ["SIMPLE_CONTRAST_TITLE", "LIGHT_MASK"], stepCount: 1, relationshipCount: 0, regionCount: 1},
  presentationMode: "OVERLAY",
  frameOccupation: "OVERLAY",
  baseVisualCarrier: "PRESENTER_BASE",
  baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  baseSubjectMustRemainVisible: true,
});
assert.equal(simple.status, "SIMPLE_PRESENTER_PACKAGING_PASS");
assert.equal(simple.confirmed, true);
assert.equal(simple.presenterMustRemainDominant, true);

const singleWorkflowConclusion = derivePresenterPackagingComplexityGate({
  semanticIntent: "把写作的不便收束为一条可控工作流",
  semanticStructure: {kinds: ["SINGLE_CONCLUSION", "SINGLE_CONTROLLED_RIBBON"], stepCount: 1, relationshipCount: 0, regionCount: 1},
  presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
  frameOccupation: "OVERLAY",
  baseVisualCarrier: "PRESENTER_BASE",
  baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  baseSubjectMustRemainVisible: true,
});
assert.equal(singleWorkflowConclusion.status, "SIMPLE_PRESENTER_PACKAGING_PASS");
assert.deepEqual(singleWorkflowConclusion.semanticComplexity.complexSignals, []);

const ed19SemanticCompanionInput = {
  semanticIntent: "把整理、编排、读取、检查压成同一条后台处理轨道",
  semanticStructure: {kinds: ["METHOD_SEQUENCE"], stepCount: 4, relationshipCount: 3, regionCount: 1},
  presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
  frameOccupation: "OVERLAY",
  baseVisualCarrier: "PRESENTER_BASE",
  baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  baseSubjectMustRemainVisible: true,
};
const ed19SemanticCompanion = derivePresenterPackagingComplexityGate(ed19SemanticCompanionInput);
assert.equal(ed19SemanticCompanion.status, "SEMANTIC_COMPANION_PRESENTER_PACKAGING_PASS");
assert.equal(ed19SemanticCompanion.confirmed, true);
assert.equal(ed19SemanticCompanion.overlayWeight, "SEMANTIC_COMPANION");
assert.equal(ed19SemanticCompanion.visualBudget.maxGeneratedVisualCoverage, 0.45);
assert.equal(ed19SemanticCompanion.visualBudget.maxWindows, 2);
assert.equal(ed19SemanticCompanion.semanticComplexity.semanticCompression.classification, "LINEAR_COMPRESSIBLE");
assert.deepEqual(ed19SemanticCompanion.semanticComplexity.complexSignals, []);

const ed19Projection = deriveCreatorPackagingProjection({contentTreatment: "PIXEL_WINDOW", packageDecision: "PACKAGE", ...ed19SemanticCompanionInput});
assert.equal(ed19Projection.presentationMode, "PRESENTER_INTEGRATED_LOOK_MASTER");
assert.equal(ed19Projection.frameOccupation, "OVERLAY");
assert.equal(ed19Projection.assemblyMode, "OVERLAY");
assert.equal(ed19Projection.complexityGate.overlayWeight, "SEMANTIC_COMPANION");

const ed19OverlayPolicy = presenterLightOverlayProjection({
  packageDecision: "PACKAGE",
  contentTreatment: "PIXEL_WINDOW",
  frameOccupation: "OVERLAY",
  presentationMode: "PRESENTER_INTEGRATED_LOOK_MASTER",
  assemblyMode: "OVERLAY",
  baseVisualCarrier: "PRESENTER_BASE",
  presenterVisibility: "REQUIRED",
  presenterPackagingMode: "PRESENTER_CUTOUT_COMPOSITE",
  complexityGate: ed19Projection.complexityGate,
});
assert.equal(ed19OverlayPolicy.status, "PASS");
assert.equal(ed19OverlayPolicy.route, "PRESENTER_SEMANTIC_COMPANION");
assert.equal(ed19OverlayPolicy.overlayWeight, "SEMANTIC_COMPANION");
assert.equal(ed19OverlayPolicy.rules.maxGeneratedVisualCoverage, 0.45);
assert.equal(ed19OverlayPolicy.rules.maxAttachedWindows, 2);

const complexOverlayInput = {
  semanticIntent: "把整理、编排、读取、检查做成四步工作流",
  semanticStructure: {kind: "MULTI_STEP_WORKFLOW", stepCount: 4, relationshipCount: 3, regionCount: 4},
  presentationMode: "OVERLAY",
  frameOccupation: "OVERLAY",
  baseVisualCarrier: "PRESENTER_BASE",
  baseVideoRelationship: "COEXIST_WITH_BASE_VIDEO",
  baseSubjectMustRemainVisible: true,
};
const complexOverlay = derivePresenterPackagingComplexityGate(complexOverlayInput);
assert.equal(complexOverlay.confirmed, false);
assert.equal(complexOverlay.status, "REROUTE_REQUIRED_FULL_FRAME_TAKEOVER");
assert.deepEqual(complexOverlay.effectiveRoute, {presentationMode: "FULLSCREEN_EXPLAINER_TAKEOVER", frameOccupation: "FULL_FRAME_TAKEOVER", baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER", baseSubjectMustRemainVisible: false});

const projection = deriveCreatorPackagingProjection({contentTreatment: "EDITORIAL_EXPLAINER", packageDecision: "PACKAGE", ...complexOverlayInput});
assert.equal(projection.presentationMode, "FULLSCREEN_EXPLAINER_TAKEOVER");
assert.equal(projection.frameOccupation, "FULL_FRAME_TAKEOVER");
assert.equal(projection.assemblyMode, "EXPLAINER");
assert.equal(projection.complexityGate.status, "REROUTE_REQUIRED_FULL_FRAME_TAKEOVER");

const complexFullscreen = derivePresenterPackagingComplexityGate({...complexOverlayInput, presentationMode: "FULLSCREEN_EXPLAINER_TAKEOVER", frameOccupation: "FULL_FRAME_TAKEOVER", baseVideoRelationship: "TEMPORARY_FULL_FRAME_TAKEOVER", baseSubjectMustRemainVisible: false, baseVisualCarrier: null});
assert.equal(complexFullscreen.confirmed, true);
assert.equal(complexFullscreen.status, "COMPLEX_EXPLANATION_FULL_FRAME_TAKEOVER_PASS");

const branchedOverlay = derivePresenterPackagingComplexityGate({
  ...ed19SemanticCompanionInput,
  semanticIntent: "整理后分别进入读取和检查两条分支",
  semanticStructure: {kinds: ["METHOD_SEQUENCE"], stepCount: 4, relationshipCount: 3, regionCount: 1, branchCount: 1},
});
assert.equal(branchedOverlay.status, "REROUTE_REQUIRED_FULL_FRAME_TAKEOVER");
assert.ok(branchedOverlay.semanticComplexity.complexSignals.includes("BRANCHED_STRUCTURE"));

console.log(JSON.stringify({status: "PASS", simple: simple.status, semanticCompanion: ed19SemanticCompanion.status, complexOverlay: complexOverlay.status, projection: projection.presentationMode, complexFullscreen: complexFullscreen.status, branchedOverlay: branchedOverlay.status}));
