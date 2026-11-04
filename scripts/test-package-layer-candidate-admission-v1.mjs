#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  advancePackageRuntimeWithCandidate,
  assertPackageAssemblyRecipe,
  assertPackageLayerCandidate,
  buildPackageLayerCandidate,
  queuePackageLayerGenerationJobs,
  summarizePackageLayerCandidates,
} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {applyImagegenMasterPreservationPolicy} from "../apps/studio-next/src/lib/a1-imagegen-master-preservation-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const root = process.cwd();
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const originalRuntime = workspace.production.shotIntelligence;
let originalPlan = structuredClone(originalRuntime.packageAssetKitPlans.find((plan) => plan.shotId === "ED-10"));
assert.ok(originalPlan, "ED-10 package reconstruction plan required");

const persistedMaster = structuredClone(originalPlan.selectedLookMasterBinding);
assert.ok(persistedMaster?.artifactPublicUrl && persistedMaster?.artifactSha256, "verified ED-10 pixel fixture required");
// Approval is simulated only in this isolated test clone. The artifact and
// hash remain the real persisted historical pixel evidence.
const approvedMaster = {...persistedMaster, status: "VISUAL_APPROVED"};
originalPlan.selectedLookMasterBinding = approvedMaster;
originalPlan.reconstructionSource = {directionId: approvedMaster.directionId, artifactSha256: approvedMaster.artifactSha256, selectedMasterSha256: approvedMaster.artifactSha256, comparativeReviewSha256: approvedMaster.comparativeReviewSha256};
originalPlan = applyImagegenMasterPreservationPolicy(originalPlan, {selectedLookMasterBinding: approvedMaster});
originalPlan.status = "LAYER_RECONSTRUCTION_READY";
originalPlan.current = true;
originalPlan.authorityScope = "CURRENT";
for (const layer of originalPlan.layers) {
  layer.candidates = [];
  layer.selectedCandidateId = null;
  layer.status = layer.route === "NONE" ? "NOT_REQUIRED" : "RECONSTRUCTION_REQUIRED";
}

function validInput(plan, layerKind, index) {
  const layer = plan.layers.find((item) => item.kind === layerKind);
  const contentSha256 = sha256(`${plan.planSha256}:${layerKind}:${index}`);
  const masterCanvas = plan.masterPreservationPolicy?.masterCanvas || {width: 1920, height: 1080};
  const provenance = {
    policyAudit: {status: "PASS"},
    visualAudit: {status: "PASS"},
    styleAudit: {status: "PASS", styleBriefSha256: plan.styleBriefSha256},
    ...(layer.route === "GENERATE" ? {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: `job-${layerKind.toLowerCase()}-${index}`} : {}),
    ...(layer.route === "REUSE" ? {sourceAssetIds: [`approved-${layerKind.toLowerCase()}-${index}`]} : {}),
    ...(layer.route === "SOURCE" ? {sourceUrls: [`https://example.test/${layerKind.toLowerCase()}/${index}`], rights: {status: "PRODUCTION_ALLOWED"}} : {}),
  };
  const base = {
    candidateId: `ed-10-${layerKind.toLowerCase()}-${index}`,
    artifact: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/package-layers/ed-10/${layerKind.toLowerCase()}-${index}.png`, sha256: contentSha256, width: masterCanvas.width, height: masterCanvas.height, mimeType: "image/png", workspaceImported: true, alphaVerified: layerKind !== "BACKGROUND"},
    cache: {variantNonce: `v${index}`},
    provenance,
    ranking: {score: 100 - index, reason: "deterministic-test-ranking"},
    isolation: {singleLayer: true, crossLayerComposite: false, textFree: layerKind !== "TYPOGRAPHY", fullFrame: layerKind === "BACKGROUND", transparentLayer: layerKind !== "BACKGROUND", containsBackground: false, containsTypography: false, containsElementKit: false, containsIllustration: false},
  };
  if (layerKind === "TYPOGRAPHY") base.typography = {integratedVisualActor: true, cssOnly: false, postPastedText: false, exactPhrase: plan.copySpec.exactPhrase, ocrText: plan.copySpec.exactPhrase, ocrExact: true, editableShadow: {publicUrl: `${base.artifact.publicUrl}.editable.json`, sha256: sha256(`editable:${index}`)}, fontBindings: [{assetId: "a1-retro-editorial-font", sha256: sha256("font-file")}]};
  if (layerKind === "ELEMENT_KIT") base.elementKit = {nodes: [{id: `actor-${index}`, bounds: {x: 20, y: 20, width: 200, height: 200}}]};
  if (layerKind === "ILLUSTRATION") base.illustration = {semanticRole: "discarded-draft-metaphor", nonFactualAuxiliary: true};
  return base;
}

const badCompositeInput = validInput(originalPlan, "TYPOGRAPHY", 99);
badCompositeInput.isolation.singleLayer = false;
badCompositeInput.isolation.crossLayerComposite = true;
badCompositeInput.isolation.containsBackground = true;
const badComposite = buildPackageLayerCandidate(originalPlan, "TYPOGRAPHY", badCompositeInput);
assert.equal(badComposite.status, "LAYER_EXTRACTION_REQUIRED", "a full composite cannot become a reconstructed typography layer");
assert.throws(() => assertPackageLayerCandidate(originalPlan, badComposite, {requireReady: true}), /package-layer-candidate-not-admissible/);

const missingEditableInput = validInput(originalPlan, "TYPOGRAPHY", 98);
delete missingEditableInput.typography.editableShadow;
const missingEditable = buildPackageLayerCandidate(originalPlan, "TYPOGRAPHY", missingEditableInput);
assert.equal(missingEditable.status, "RAW_REFERENCE");
assert.ok(missingEditable.admission.failures.includes("typography-editable-shadow-required"));

const presenterFirstBlockedWorkspace = structuredClone(workspace);
presenterFirstBlockedWorkspace.production.shotIntelligence.status = "LAYER_RECONSTRUCTION_READY";
presenterFirstBlockedWorkspace.production.shotIntelligence.packageAssetKitPlans = [structuredClone(originalPlan)];
presenterFirstBlockedWorkspace.production.shotIntelligence.packageAssemblyRecipes = [];
assert.throws(() => queuePackageLayerGenerationJobs(presenterFirstBlockedWorkspace, "ED-10"), /blocked-until-imagegen-master-assembly-approved/);
originalPlan.integratedAssemblyReview = {status: "APPROVED", approvedBy: "test", userApprovalRequired: false};

const blockedWorkspace = structuredClone(workspace);
blockedWorkspace.production.shotIntelligence.status = "LOOK_MASTER_PLANS_READY";
blockedWorkspace.production.shotIntelligence.packageAssetKitPlans = [structuredClone(originalPlan)];
blockedWorkspace.production.shotIntelligence.packageAssetKitPlans[0].selectedLookMasterBinding = null;
delete blockedWorkspace.production.shotIntelligence.packageAssetKitPlans[0].masterPreservationPolicy;
blockedWorkspace.production.shotIntelligence.packageAssetKitPlans[0].status = "WAITING_FOR_LOOK_MASTER";
assert.throws(() => queuePackageLayerGenerationJobs(blockedWorkspace, "ED-10"), /look-master-approval-required/);

const reconstructionWorkspace = structuredClone(workspace);
reconstructionWorkspace.production.shotIntelligence.status = "LAYER_RECONSTRUCTION_READY";
reconstructionWorkspace.production.shotIntelligence.packageAssetKitPlans = [structuredClone(originalPlan)];
// Current production recipes are history-only until whole-film board approval.
// Reuse the ED-10 recipe only inside this unlocked clone, then explicitly turn
// the clone into the legacy post-approval fixture below.
const reconstructionRecipe = reconstructionWorkspace.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
assert.ok(reconstructionRecipe, "isolated ED-10 recipe fixture required");
reconstructionRecipe.current = true;
reconstructionRecipe.authorityScope = "CURRENT";
reconstructionRecipe.selectedLookMasterBinding = structuredClone(approvedMaster);
reconstructionRecipe.reconstructionSource = {directionId: approvedMaster.directionId, artifactSha256: approvedMaster.artifactSha256, selectedMasterSha256: approvedMaster.artifactSha256, comparativeReviewSha256: approvedMaster.comparativeReviewSha256};
const approvedMasterFrame = {publicUrl: approvedMaster.artifactPublicUrl, sha256: approvedMaster.artifactSha256, width: 1920, height: 1080, relationship: "APPROVED_IMAGEGEN_LOOK_MASTER_DIRECT"};
reconstructionRecipe.status = "ASSEMBLY_REVIEW_REQUIRED";
reconstructionRecipe.assemblyPreviewAvailable = true;
reconstructionRecipe.assemblyReadyForUserReview = true;
reconstructionRecipe.materialIntegration = "imagegen-approved-look-master-direct";
reconstructionRecipe.assemblySource = {mode: "IMAGEGEN_APPROVED_LOOK_MASTER", authoritativeFullFrame: approvedMasterFrame, localLayerRecompositionPerformed: false, localSecondDesignPerformed: false, decompositionTiming: "AFTER_RECOMMENDED_ASSEMBLY_APPROVAL"};
reconstructionRecipe.assemblyComposite = approvedMasterFrame;
reconstructionRecipe.masterPreservationPolicy = structuredClone(originalPlan.masterPreservationPolicy);
reconstructionRecipe.layerCandidateIds = {};
reconstructionRecipe.parityAudit = {...reconstructionRecipe.parityAudit, method: "DIRECT_APPROVED_MASTER_IDENTITY", status: "PASS", selectedLookMasterSha256: approvedMaster.artifactSha256, assemblyPreview: approvedMasterFrame, normalizedPixelDelta: 0, masterPixelParity: {status: "PASS"}};
reconstructionRecipe.deterministicParity = {...reconstructionRecipe.deterministicParity, status: "PASS", selectedLookMasterSha256: approvedMaster.artifactSha256, assemblyPreview: approvedMasterFrame, normalizedPixelDelta: 0, masterPixelParity: {status: "PASS"}};
reconstructionRecipe.approvalBinding = {...reconstructionRecipe.approvalBinding, assemblySha256: approvedMaster.artifactSha256, selectedMasterSha256: approvedMaster.artifactSha256, userApproved: true};
reconstructionRecipe.userAssemblyDecision = {decision: "approved", approvedBy: "test", userApprovalRequired: false};
reconstructionWorkspace.production.generation.jobs = [];
reconstructionWorkspace.production.generation.summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: 0};
assert.throws(() => queuePackageLayerGenerationJobs(reconstructionWorkspace, "ED-10"), /imagegen-extraction-retired-use-deterministic-master-mask-partition/);
delete reconstructionWorkspace.production.shotIntelligence.approvedMasterLayerCanaryAudit;
const queuedOnce = queuePackageLayerGenerationJobs(reconstructionWorkspace, "ED-10");
assert.ok(queuedOnce.jobs.length > 0);
assert.ok(queuedOnce.jobs.every((job) => job.targetKind === "package-layer" && job.referenceInputs[0].kind === "selected-look-master" && job.referenceInputs[0].role === "approved-imagegen-master-immutable-pixel-source" && job.referenceInputs[0].publicUrl === approvedMaster.artifactPublicUrl && job.referenceInputs[0].sha256 === approvedMaster.artifactSha256));
assert.ok(queuedOnce.jobs.every((job) => job.prompt.includes("Pixel-extract exactly one independently replaceable") && job.prompt.includes("not a new design") && !job.prompt.includes("Output ONLY this layer")));
const imagegenTypographyJob = queuedOnce.jobs.find((job) => job.packageLayerKind === "TYPOGRAPHY");
assert.ok(imagegenTypographyJob, "the package-layer fixture must exercise generated typography");
assert.match(imagegenTypographyJob.prompt, /Extract the approved master's existing visible Chinese glyph pixels exactly/u);
assert.match(imagegenTypographyJob.prompt, /Do not regenerate the glyph design/u);
assert.doesNotMatch(imagegenTypographyJob.prompt, /server will typeset/u);

const autoSelectedWorkspace = structuredClone(reconstructionWorkspace);
autoSelectedWorkspace.production.shotIntelligence.packageAssetKitPlans[0].selectedLookMasterBinding = {
  ...approvedMaster,
  status: "BATCH_RANKED_AUTO_SELECTED",
  auditSha256: null,
  serverVisualAssessmentSha256: null,
  reviewDecisionSha256: null,
  userApprovalRequired: false,
};
const autoSelectedQueued = queuePackageLayerGenerationJobs(autoSelectedWorkspace, "ED-10");
assert.ok(autoSelectedQueued.jobs.length > 0, "auto-selected winner must enter the legacy-compatible layer queue without Look Master approval");

let runtime = structuredClone(reconstructionWorkspace.production.shotIntelligence);
const targetCounts = Object.fromEntries(originalPlan.layers.filter((layer) => layer.route !== "NONE").map((layer) => [layer.kind, Math.max(1, layer.budgetRange.min)]));
for (const [layerKind, count] of Object.entries(targetCounts)) {
  for (let index = 1; index <= count; index += 1) {
    const currentPlan = runtime.packageAssetKitPlans[0];
    const candidate = buildPackageLayerCandidate(currentPlan, layerKind, validInput(currentPlan, layerKind, index));
    assert.equal(candidate.status, "READY", `${layerKind}/${index} must pass post-selection single-layer admission`);
    runtime = advancePackageRuntimeWithCandidate(runtime, candidate).runtime;
  }
}

const advancedPlan = runtime.packageAssetKitPlans[0];
const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10" && item.assemblySource?.mode === "IMAGEGEN_APPROVED_LOOK_MASTER");
assert.equal(advancedPlan.status, "MOTION_DECOMPOSITION_READY");
assert.equal(runtime.status, "MOTION_READY");
assert.equal(recipe.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(recipe.materialIntegration, "imagegen-approved-look-master-direct");
assert.equal(recipe.assemblySource.localLayerRecompositionPerformed, false);
assert.equal(recipe.assemblySource.localSecondDesignPerformed, false);
assert.equal(recipe.assemblyComposite.sha256, approvedMaster.artifactSha256);
assert.equal(recipe.parityAudit.method, "DIRECT_APPROVED_MASTER_IDENTITY");
assert.equal(recipe.parityAudit.normalizedPixelDelta, 0);
assert.equal(recipe.masterPreservationPolicy.policySha256, advancedPlan.masterPreservationPolicy.policySha256);
assert.deepEqual(Object.keys(recipe.decompositionSlots).sort(), ["BACKGROUND", "ELEMENT_KIT", "ILLUSTRATION", "TYPOGRAPHY"]);
for (const layer of advancedPlan.layers) {
  if (layer.route === "NONE") {
    assert.equal(layer.selectedCandidateId, null, `${layer.kind} NONE route cannot select an extraction candidate`);
  } else {
    assert.ok(layer.selectedCandidateId, `${layer.kind} must have exactly one extracted candidate`);
    assert.equal(layer.selectedCandidateSource, "APPROVED_MASTER_PIXEL_EXTRACTION");
    assert.equal(layer.candidates.length, 1, `${layer.kind} must not fan out after master selection`);
  }
}
assertPackageAssemblyRecipe(advancedPlan, recipe);

console.log(JSON.stringify({status: "PASS", blockedBeforeLookMasterApproval: true, queuedReconstructionJobs: queuedOnce.jobs.length, rejectedComposite: badComposite.status, rejectedTypographyWithoutEditableShadow: missingEditable.status, admitted: summarizePackageLayerCandidates([advancedPlan]).admitted, runtimeStatus: runtime.status, recipeStatus: recipe.status, directMasterAssembly: true, decompositionStatus: advancedPlan.motionDecomposition.status}, null, 2));
