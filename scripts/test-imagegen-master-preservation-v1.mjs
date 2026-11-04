#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  assertPackageAssemblyRecipe,
  buildPackageLayerCandidate,
  queuePackageLayerGenerationJobs,
} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {
  assertImagegenMasterPreservationPolicy,
  imagegenMasterReconstructionFailures,
} from "../apps/studio-next/src/lib/a1-imagegen-master-preservation-v1.mjs";
import {planIdentity, reviewPackageLookMaster} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspaceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const beforeBytes = fs.readFileSync(workspaceFile);
const beforeFileSha256 = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const workspace = JSON.parse(beforeBytes.toString("utf8"));
const currentRuntime = structuredClone(workspace.production.shotIntelligence);
const currentLookPlan = currentRuntime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const currentKit = currentRuntime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const sourceContext = currentRuntime.videoPackagingContexts.items.find((item) => item.shotId === "ED-10");
const currentDecision = currentRuntime.decisionSet.items.find((item) => item.shotId === "ED-10");
const decision = {
  ...currentDecision,
  packageDecision: "PACKAGE",
  assemblyMode: currentLookPlan.assemblyMode,
  presentationMode: currentLookPlan.presentationMode,
};
const demand = workspace.library.assets.find((asset) => asset.shotDemand?.shotId === "ED-10")?.shotDemand;
currentLookPlan.videoContext = buildVideoPackagingContext({
  decision,
  demand,
  holdFrame: sourceContext.baseFrame,
  subjectBounds: {x: 0.58, y: 0.08, width: 0.34, height: 0.84, semanticRole: "test-presenter-face-and-body", status: "TEST_DECLARED"},
  safeZones: [{id: "test-caption-safe-zone", x: 0.04, y: 0.05, width: 0.3, height: 0.28, semanticRole: "editor-caption-safe-zone"}],
  visualAnchors: sourceContext.visualAnchors,
  createdAt: "2026-08-05T00:00:00.000Z",
});
currentLookPlan.planSha256 = crypto.createHash("sha256").update(JSON.stringify(planIdentity(currentLookPlan))).digest("hex");
const recoveredFixtureCandidate = ({artifactSha256, candidateId, directionId}) => {
  const raw = currentRuntime.lookMasterRawReferences.find((item) => item.shotId === "ED-10" && item.artifact?.sha256 === artifactSha256);
  assert.ok(raw?.artifact?.publicUrl && raw?.pixelAudit?.compositePreview?.publicUrl, `recovered ${directionId} pixel evidence required`);
  return {
    contract: "A1FastLookMasterExplorationCandidate/v1",
    candidateId,
    directionId,
    artifact: raw.artifact,
    provenance: raw.provenance,
    compositePreview: raw.pixelAudit.compositePreview,
    lightChecks: {...raw.lightChecks, decode: "PASS", dimensions: "PASS", baseFrameComposite: "PASS"},
    userVisualDisposition: "USER_SCREENED_SHORTLIST",
    packagingIntent: {reconstructionMap: {TYPOGRAPHY: "rebuild approved master pixels only"}},
    reconstructionMap: {TYPOGRAPHY: "rebuild approved master pixels only"},
  };
};
const recoveredC02 = recoveredFixtureCandidate({
  artifactSha256: "c597e2124c6316af96d6adfaff8d2edda963505eedcfe40ab864a230aab83468",
  candidateId: "exploration-ed-10-direction-02-c597e2124c63",
  directionId: "direction-02",
});
const recoveredC04 = recoveredFixtureCandidate({
  artifactSha256: "06111e5acc991d703dc33b4a229c7ec38ecc114e3e22ef45f7ddf06b932a023a",
  candidateId: "exploration-ed-10-direction-04-06111e5acc99",
  directionId: "direction-04",
});
// Build a selection fixture entirely in memory. The persisted workspace may be
// waiting for a Look Master or already waiting for final Assembly approval;
// neither state should be changed just to test the preservation contract.
currentRuntime.status = "LOOK_MASTER_REVIEW_REQUIRED";
currentRuntime.packageAssemblyRecipes = currentRuntime.packageAssemblyRecipes.filter((item) => item.shotId !== "ED-10" || item.status === "HISTORY_READ_ONLY" || item.current === false);
currentLookPlan.status = "LOOK_MASTER_REVIEW_REQUIRED";
currentLookPlan.recommendation = null;
currentLookPlan.reviewDecision = null;
currentLookPlan.selectedLookMasterId = null;
currentLookPlan.selectedLookMasterBinding = null;
currentLookPlan.explorationCandidates = [recoveredC02, recoveredC04];
currentLookPlan.currentCandidateSource = {status: "RECOVERED_EXISTING_LOOK_MASTER_CANDIDATES", selectedCandidateId: null, selectedDirectionId: null};
currentLookPlan.activeCandidateSet = {status: "PENDING_USER_LOOK_MASTER_REVIEW", candidateIds: [recoveredC02.candidateId, recoveredC04.candidateId], candidateCount: 2, selectedCandidateId: null, selectedDirectionId: null, recommendationStatus: "USER_SCREENED_SHORTLIST_PENDING_FINAL_CONFIRMATION"};
currentKit.status = "WAITING_FOR_LOOK_MASTER";
currentKit.selectedLookMasterBinding = null;
for (const layer of currentKit.layers) {
  layer.candidates = [];
  layer.selectedCandidateId = null;
}
const fixtureCandidateId = currentLookPlan?.activeCandidateSet?.candidateIds?.find((candidateId) => currentLookPlan.explorationCandidates?.find((candidate) => candidate.candidateId === candidateId)?.directionId === "direction-02");
const fixtureCandidate = currentLookPlan?.explorationCandidates?.find((candidate) => candidate.candidateId === fixtureCandidateId);
assert.ok(fixtureCandidate?.artifact?.sha256 && fixtureCandidate?.artifact?.publicUrl, "current C02 shortlist candidate fixture required");
assert.match(fixtureCandidate.packagingIntent?.reconstructionMap?.TYPOGRAPHY || fixtureCandidate.reconstructionMap?.TYPOGRAPHY || "", /rebuild/u, "fixture must retain the legacy reconstructionMap wording under test");

const reviewed = reviewPackageLookMaster(currentRuntime, {
  shotId: "ED-10",
  candidateId: fixtureCandidate.candidateId,
  decision: "approved",
  note: "in-memory regression fixture only",
  now: "2026-08-05T08:00:00.000Z",
});
const alternateCandidate = currentLookPlan.explorationCandidates.find((candidate) => candidate.directionId === "direction-04" && currentLookPlan.activeCandidateSet.candidateIds.includes(candidate.candidateId));
assert.ok(alternateCandidate?.artifact?.sha256, "current C04 shortlist candidate fixture required");
const alternateReviewed = reviewPackageLookMaster(currentRuntime, {shotId: "ED-10", candidateId: alternateCandidate.candidateId, decision: "approved", note: "in-memory alternate regression fixture only", now: "2026-08-05T08:00:00.000Z"});
const alternatePlan = alternateReviewed.runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const alternateRecipe = alternateReviewed.runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10" && item.status !== "HISTORY_READ_ONLY" && item.current !== false);
assertImagegenMasterPreservationPolicy(alternatePlan, {requirePublicUrl: true});
assert.equal(alternatePlan.selectedLookMasterBinding.artifactSha256, alternateCandidate.artifact.sha256);
assert.equal(alternateRecipe.assemblySource.mode, "IMAGEGEN_APPROVED_LOOK_MASTER");
assert.equal(alternateRecipe.assemblyComposite.sha256, alternateCandidate.artifact.sha256);
assert.equal(alternateRecipe.assemblySource.localLayerRecompositionPerformed, false);
assert.equal(alternateRecipe.assemblySource.localSecondDesignPerformed, false);
const plan = reviewed.runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const recipe = reviewed.runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10" && item.status !== "HISTORY_READ_ONLY" && item.current !== false);
const binding = plan.selectedLookMasterBinding;
assert.equal(reviewed.runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10")?.activeCandidateSet?.selectedCandidateId, fixtureCandidate.candidateId);
assert.equal(binding.selectionSource, "RECOVERED_EXISTING_USER_SCREENED_SHORTLIST");
assertImagegenMasterPreservationPolicy(plan, {requirePublicUrl: true});
assert.equal(plan.masterPreservationPolicy.compositionAuthority, "APPROVED_IMAGEGEN_LOOK_MASTER");
assert.equal(plan.masterPreservationPolicy.localSecondDesignForbidden, true);
assert.equal(plan.masterPreservationPolicy.freehandReflowForbidden, true);
assert.equal(plan.masterPreservationPolicy.decompositionTiming, "AFTER_RECOMMENDED_ASSEMBLY_APPROVAL");
for (const layer of plan.layers) {
  if (layer.route === "NONE") {
    assert.equal(layer.reconstructionPolicy.operation, "NONE");
    assert.equal(layer.candidateBudget, 0);
  } else {
    assert.equal(layer.reconstructionPolicy.operation, "EXTRACT_APPROVED_MASTER_PIXELS");
    assert.equal(layer.candidateBudget, 1, `${layer.kind} must have one extraction, not visual variants`);
    assert.deepEqual(layer.reconstructionPolicy.geometryLock, plan.masterPreservationPolicy.masterCanvas);
  }
}

assertPackageAssemblyRecipe(plan, recipe);
assert.equal(recipe.assemblySource.mode, "IMAGEGEN_APPROVED_LOOK_MASTER");
assert.equal(recipe.assemblySource.localLayerRecompositionPerformed, false);
assert.equal(recipe.assemblySource.localSecondDesignPerformed, false);
assert.equal(recipe.assemblyComposite.sha256, binding.artifactSha256, "approved master pixels are the Assembly");
assert.equal(recipe.parityAudit.normalizedPixelDelta, 0);
assert.equal(recipe.parityAudit.masterPixelParity.status, "PASS");
assert.ok(Object.values(recipe.decompositionSlots).every((slot) => ["NONE", "DECOMPOSE_AFTER_ASSEMBLY_APPROVAL"].includes(slot.route)));

const fixture = structuredClone(workspace);
fixture.production.shotIntelligence = reviewed.runtime;
const recipeIndex = fixture.production.shotIntelligence.packageAssemblyRecipes.findIndex((item) => item.shotId === "ED-10" && item.status !== "HISTORY_READ_ONLY" && item.current !== false);
fixture.production.shotIntelligence.status = "ASSEMBLY_REVIEW_REQUIRED";
fixture.production.generation.jobs = [];
fixture.production.generation.summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
assert.throws(() => queuePackageLayerGenerationJobs(fixture, "ED-10"), /blocked-until-imagegen-master-assembly-approved/);

fixture.production.shotIntelligence.packageAssemblyRecipes[recipeIndex].userAssemblyDecision = {decision: "approved", decidedAt: "2026-08-05T08:00:01.000Z"};
const requiredLayers = plan.layers.filter((layer) => layer.route !== "NONE");
assert.ok(requiredLayers.length > 0);
assert.throws(
  () => queuePackageLayerGenerationJobs(fixture, "ED-10", {now: "2026-08-05T08:00:02.000Z"}),
  /package-layer-imagegen-extraction-retired-use-deterministic-master-mask-partition/,
);

const typographyLayer = plan.layers.find((layer) => layer.kind === "TYPOGRAPHY");
assert.ok(typographyLayer && typographyLayer.route !== "NONE", "typography extraction fixture required");
const artifactSha256 = crypto.createHash("sha256").update("master-typography-extraction").digest("hex");
const masterCanvas = plan.masterPreservationPolicy.masterCanvas;
const candidateInput = {
  candidateId: "ed-10-master-type-extraction",
  artifact: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/package-layers/ED-10/typography/master-extraction.png", sha256: artifactSha256, width: masterCanvas.width, height: masterCanvas.height, mimeType: "image/png", workspaceImported: true, alphaVerified: true},
  cache: {variantNonce: "master-extraction-v1"},
  provenance: {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: "master-extraction-job", policyAudit: {status: "PASS"}, visualAudit: {status: "PASS"}, styleAudit: {status: "PASS", styleBriefSha256: plan.styleBriefSha256}},
  isolation: {singleLayer: true, crossLayerComposite: false, textFree: false, fullFrame: false, transparentLayer: true, containsBackground: false, containsTypography: true, containsElementKit: false, containsIllustration: false},
  typography: {integratedVisualActor: true, cssOnly: false, postPastedText: false, exactPhrase: plan.copySpec.exactPhrase, ocrText: plan.copySpec.exactPhrase, ocrExact: true, editableShadow: {publicUrl: "/generated/system-line/test/editable-shadow.json", sha256: crypto.createHash("sha256").update("shadow").digest("hex")}, fontBindings: [{assetId: "type-pixel-correction", sha256: crypto.createHash("sha256").update("font").digest("hex")}]},
};
const candidate = buildPackageLayerCandidate(plan, "TYPOGRAPHY", candidateInput, {now: "2026-08-05T08:00:03.000Z"});
assert.equal(candidate.status, "READY");
assert.equal(candidate.typography.visibleGlyphSource, "APPROVED_IMAGEGEN_MASTER_PIXELS");
assert.equal(candidate.typography.localTextComposite, false);
assert.equal(candidate.typography.editableShadowVisible, false);
assert.deepEqual(candidate.geometry, plan.masterPreservationPolicy.masterCanvas);

const shifted = buildPackageLayerCandidate(plan, "TYPOGRAPHY", {...candidateInput, candidateId: "ed-10-shifted-type", geometry: {...plan.masterPreservationPolicy.masterCanvas, x: 24}}, {now: "2026-08-05T08:00:04.000Z"});
assert.equal(shifted.status, "RAW_REFERENCE");
assert.ok(shifted.admission.failures.includes("candidate-master-geometry-lock-violated"));
const redesigned = buildPackageLayerCandidate(plan, "TYPOGRAPHY", {...candidateInput, candidateId: "ed-10-redesigned-type", reconstruction: {localSecondDesignPerformed: true}}, {now: "2026-08-05T08:00:05.000Z"});
assert.equal(redesigned.status, "RAW_REFERENCE");
assert.ok(redesigned.admission.failures.includes("candidate-local-second-design-forbidden"));
const visibleLocalText = structuredClone(candidate);
visibleLocalText.reconstruction.localTypographyComposite = true;
visibleLocalText.reconstruction.editableShadowVisible = true;
assert.ok(imagegenMasterReconstructionFailures(plan, typographyLayer, visibleLocalText).includes("candidate-visible-local-typography-forbidden"));

const afterFileSha256 = crypto.createHash("sha256").update(fs.readFileSync(workspaceFile)).digest("hex");
assert.equal(afterFileSha256, beforeFileSha256, "regression test must not mutate current workspace authority");

console.log(JSON.stringify({
  status: "PASS",
  assemblyUsesApprovedMasterDirectly: true,
  localSecondDesignForbidden: true,
  postApprovalExtractionJobs: 0,
  deterministicMasterMaskPartitionRequired: true,
  extractionCandidatesPerRequiredLayer: 1,
  shiftedGeometryRejected: shifted.admission.failures,
  redesignedCandidateRejected: redesigned.admission.failures,
  visibleLocalTypographyRejected: true,
  recoveredFixtureCandidateId: fixtureCandidate.candidateId,
  recoveredSelectableDirections: [fixtureCandidate.directionId, alternateCandidate.directionId],
  legacyReconstructionMapOverriddenByMasterPreservationPolicy: true,
  workspaceAuthorityUnchanged: true,
}, null, 2));
