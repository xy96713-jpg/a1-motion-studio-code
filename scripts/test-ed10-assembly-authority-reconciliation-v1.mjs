#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertPackageAssemblyRecipe} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {assertCurrentComparativeReviewEvidence, assertPackageLookMasterPlan} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {deriveProductionAuthority} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const production = workspace.production;
const runtime = production.shotIntelligence;
const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
assert.ok(plan && kit && recipe, "ED-10 packaging history records must remain auditable");

if (production.wholeFilmPackagingDirection?.contract === "A1WholeFilmPackagingDirection/v1") {
  const direction = production.wholeFilmPackagingDirection;
  const currentRecipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10" && item.status !== "HISTORY_READ_ONLY" && item.current !== false);
  const ed10Route = direction.shotPlans.find((item) => item.shotId === "ED-10");
  assert.equal(production.authority?.currentStage, "whole-film-static-board-review");
  assert.equal(production.authority?.nextAction?.id, "review-whole-film-static-board");
  assert.deepEqual(production.authority?.nextAction?.targetShotIds, []);
  assert.equal(production.authority?.nextAction?.requiresUser, true);
  assert.equal(ed10Route?.route, "PACKAGE_LOOK_MASTER");
  assert.equal(ed10Route?.productionStatus, "ACTUAL_PACKAGE_READY");
  assert.equal(ed10Route?.preview?.kind, "RECOMMENDED_LOOK_MASTER_PENDING_WHOLE_FILM_CONFIRMATION");
  assert.equal(currentRecipe, undefined);
  assert.equal(kit.current, false);
  assert.equal(kit.status, "HISTORY_READ_ONLY");
  assert.equal(kit.layers.reduce((sum, layer) => sum + (layer.candidates?.length || 0), 0), 0);
  assert.equal(production.packagingReview?.advisoryOnly, true);
  assert.equal(production.packagingReview?.current, false);
  assert.equal(production.packagingReview?.requiresExplicitApproval, false);
  assert.equal(production.userVisualApprovalGate?.userVisualApproval, "NOT_APPROVED");
  assert.equal(production.assembly?.status, "locked-awaiting-whole-film-static-board-user-approval");
  assert.equal(production.generation.summary.queued, 0);
  assert.equal(production.generation.summary.running, 0);
  assert.equal(production.generation.workerStatus, "frozen");
  console.log(JSON.stringify({status: "PASS", scope: "WHOLE_FILM_STATIC_BOARD_CURRENT_AUTHORITY", workspaceSha256: workspace.workspaceSha256, ed10VerdictMasterSha256: ed10Route.preview?.sha256 || null, ed10AssemblyHistoryOnly: true, layerCandidates: 0, assemblyStatus: production.assembly.status, nextAction: production.authority.nextAction}, null, 2));
  process.exit(0);
}

// A failed four-layer trial is intentionally not an Assembly approval state.
// Validate the recovery envelope before the legacy current-Assembly checks
// below; otherwise this historical fixture would be mistaken for a live
// two-layer review and the reconciliation script could reset it.
if (String(runtime.ed10FourLayerTrial?.status || "").startsWith("BLOCKED_") && recipe.status === "HISTORY_READ_ONLY") {
  assert.equal(runtime.ed10FourLayerTrial.partialRawReferenceCount, 7);
  assert.equal(runtime.ed10FourLayerTrial.actualLayerCandidateCount || 0, 0);
  assert.equal(runtime.ed10FourLayerTrial.candidateIds?.length || 0, 0);
  assert.equal(runtime.ed10FourLayerTrial.currentAssemblyPreserved, true);
  assert.equal(runtime.ed10FourLayerTrial.preservedAssembly?.status, "HISTORY_READ_ONLY");
  assert.equal(workspace.production.authority?.nextAction?.id, "rebuild-ed10-four-layer-trial-after-ocr-block");
  assert.equal(workspace.production.packagingAutomation?.status, "FROZEN");
  assert.equal(workspace.production.generation?.summary?.queued, 0);
  assert.equal(workspace.production.generation?.summary?.running, 0);
  assert.equal(workspace.production.generation?.workerStatus, "frozen");
  const report = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/report.json", "utf8"));
  assert.equal(report.summary?.attemptedScope, "ED10_FOUR_LAYER_TRIAL");
  assert.equal(report.summary?.fourLayerTrialStatus, runtime.ed10FourLayerTrial.status);
  assert.equal(report.summary?.fourLayerTrialRawReferenceCount, 7);
  assert.equal(report.summary?.trialCandidateCount, 0);
  assert.equal(report.packagingLaneSummary?.attemptedScope, "ED10_FOUR_LAYER_TRIAL");
  assert.equal(report.packagingLaneSummary?.fourLayerTrialStatus, runtime.ed10FourLayerTrial.status);
  assert.equal(report.packagingLaneSummary?.currentAssemblyStatus, "HISTORY_READ_ONLY");
  assert.notEqual(report.packagingLaneSummary?.nextAction, "review-recommended-package-assembly");
  assert.equal(workspace.status, `PACKAGING_LANE_${String(runtime.status).replaceAll("-", "_")}`);
  console.log(JSON.stringify({status: "PASS", blockedTrial: true, workspaceSha256: workspace.workspaceSha256, trialStatus: runtime.ed10FourLayerTrial.status, rawReferenceCount: 7, currentAssemblyStatus: "HISTORY_READ_ONLY", nextAction: workspace.production.authority.nextAction}, null, 2));
  process.exit(0);
}
if (runtime.status === "LOOK_MASTER_REVIEW_REQUIRED" && production.packagingReview?.status === "LOOK_MASTER_REVIEW_REQUIRED") {
  assert.equal(plan.status, "LOOK_MASTER_REVIEW_REQUIRED");
  assert.equal(plan.currentCandidateSource?.status, "RECOVERED_EXISTING_LOOK_MASTER_CANDIDATES");
  assert.deepEqual(plan.activeCandidateSet?.directionIds, ["direction-02", "direction-04"]);
  assert.equal(plan.activeCandidateSet?.selectedCandidateId, null);
  assert.equal(kit.status, "WAITING_FOR_LOOK_MASTER");
  assert.equal(recipe.status, "HISTORY_READ_ONLY");
  assert.equal(recipe.current, false);
  assert.equal(recipe.visualStatus, "VISUAL_REJECTED");
  assert.equal(workspace.production.authority?.nextAction?.id, "review-user-screened-look-master-shortlist");
  assert.equal(production.generation.summary.queued, 0);
  assert.equal(production.generation.summary.running, 0);
  assert.equal(production.generation.workerStatus, "frozen");
  console.log(JSON.stringify({status: "PASS", recoveredWaitingState: true, workspaceSha256: workspace.workspaceSha256, activeShortlist: ["direction-02", "direction-04"], selectedMaster: null, currentAssemblyStatus: recipe.status, layerCandidates: 0, queue: production.generation.summary, worker: production.generation.workerStatus}, null, 2));
  process.exit(0);
}
assertPackageLookMasterPlan(plan);
assertCurrentComparativeReviewEvidence(plan);
if (runtime.integratedPresenterPackage?.status === "ASSEMBLY_REVIEW_REQUIRED") {
  const selectedDirectionId = runtime.integratedPresenterPackage.selectedDirectionId;
  assert.ok(selectedDirectionId, "presenter-first Assembly must bind one selected full-frame direction");
  assert.equal(runtime.status, "ASSEMBLY_REVIEW_REQUIRED");
  assert.equal(plan.activeCandidateSet?.candidateCount, 4);
  assert.equal(plan.activeCandidateSet?.selectedDirectionId, selectedDirectionId);
  assert.equal(kit.selectedLookMasterBinding?.directionId, selectedDirectionId);
  assert.equal(recipe.selectedLookMasterBinding?.directionId, selectedDirectionId);
  assert.equal(recipe.status, "ASSEMBLY_REVIEW_REQUIRED");
  assert.equal(recipe.assemblySource?.mode, "IMAGEGEN_INTEGRATED_PRESENTER_FRAME");
  assert.equal(recipe.assemblySource?.localLayerRecompositionPerformed, false);
  assert.equal(recipe.assemblySource?.authoritativeFullFrame?.sha256, recipe.assemblyComposite?.sha256);
  assert.equal(recipe.assemblySource?.reverseExtractedPackage?.sha256, recipe.packageOnlyComposite?.sha256);
  assert.equal(recipe.packageOnlyComposite?.alphaVerified, true);
  assert.deepEqual(recipe.layerCandidateIds, {BACKGROUND: null, TYPOGRAPHY: null, ELEMENT_KIT: null, ILLUSTRATION: null});
  assert.deepEqual(recipe.approvalBinding?.layerHashes, []);
  assert.equal(recipe.approvalBinding?.bindingMode, "IMAGEGEN_INTEGRATED_ASSEMBLY");
  assert.equal(recipe.prePresenterFirstLayerSelection?.status, "HISTORY_READ_ONLY");
  assert.equal(recipe.decompositionSlots?.TYPOGRAPHY?.route, "DECOMPOSE_AFTER_ASSEMBLY_APPROVAL");
  assert.equal(recipe.decompositionSlots?.ELEMENT_KIT?.route, "DECOMPOSE_AFTER_ASSEMBLY_APPROVAL");
  assert.equal(recipe.parityAudit?.status, "REVIEW_REQUIRED");
  assert.equal(recipe.assemblyReadyForUserReview, true);
  assert.equal(runtime.integratedPresenterPackage.ocr?.exact, true);
  assert.equal(runtime.integratedPresenterPackage.alpha?.status, "PASS");
  assertPackageAssemblyRecipe(kit, recipe);
  const derived = deriveProductionAuthority(workspace);
  assert.equal(production.authority.currentStage, derived.currentStage);
  assert.equal(production.authority.nextAction.id, "review-recommended-package-assembly");
  assert.equal(production.generation.summary.queued, 0);
  assert.equal(production.generation.summary.running, 0);
  assert.equal(production.generation.workerStatus, "frozen");
  const report = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/report.json", "utf8"));
  assert.equal(report.workspaceSha256, workspace.workspaceSha256);
  assert.equal(report.summary?.actualLayerCandidateCount, 0);
  assert.equal(report.summary?.historicalPrePresenterFirstLayerCandidateCount, 3);
  assert.equal(report.summary?.currentAssemblyArtifactCount, 1);
  assert.equal(report.summary?.currentReverseExtractedOverlayCount, 1);
  assert.equal(report.summary?.compositionAuthority, "IMAGEGEN_INTEGRATED_PRESENTER_FRAME");
  console.log(JSON.stringify({status: "PASS", presenterFirstIntegratedAssembly: true, workspaceSha256: workspace.workspaceSha256, selectedDirectionId, assemblyStatus: recipe.status, currentLayerCandidates: 0, historicalLayerCandidates: 3, assembly: recipe.assemblyComposite, packageOnly: recipe.packageOnlyComposite, queue: {queued: production.generation.summary.queued, running: production.generation.summary.running}, worker: production.generation.workerStatus}, null, 2));
  process.exit(0);
}
const selectedDirection05 = plan.fastCandidateDiscovery?.candidates?.find((candidate) => candidate.directionId === "direction-05");
assert.ok(selectedDirection05, "ED-10 direction-05 active exploration candidate must exist");
const selectedArtifactSha256 = selectedDirection05.artifact?.sha256;
const selectedRawReferences = (runtime.lookMasterRawReferences || []).filter((raw) => raw.shotId === "ED-10" && raw.artifact?.sha256 === selectedArtifactSha256);
const historicalFailRaw = selectedRawReferences.find((raw) => raw.pixelAudit?.status === "FAIL");
assert.ok(historicalFailRaw, "the old direction-05 FAIL raw evidence must remain auditable");
assert.equal(historicalFailRaw.status, "HISTORY_READ_ONLY");
assert.equal(historicalFailRaw.current, false);
assert.equal(historicalFailRaw.advisoryOnly, true);
assert.ok(historicalFailRaw.currentReplacement, "old FAIL raw must point to its current PASS replacement");
const currentPassRaw = selectedRawReferences.find((raw) => raw.referenceId === selectedDirection05.rawReferenceId);
assert.ok(currentPassRaw, "active direction-05 candidate must point to a current raw evidence record");
assert.notEqual(currentPassRaw.status, "HISTORY_READ_ONLY");
assert.equal(currentPassRaw.current, true);
assert.equal(currentPassRaw.pixelAudit?.status, undefined, "FAIL pixel audit cannot remain on the active raw source");
assert.equal(currentPassRaw.serverVisualAssessment?.status, "PASS");
assert.equal(currentPassRaw.serverVisualAssessment?.artifactSha256, selectedArtifactSha256);
assert.equal(currentPassRaw.serverVisualAssessment?.planSha256, plan.planSha256);
assert.equal(currentPassRaw.currentPassEvidence?.status, "PASS");
assert.equal(currentPassRaw.currentPassEvidence?.artifactSha256, selectedArtifactSha256);
assert.equal(currentPassRaw.currentPassEvidence?.planSha256, plan.planSha256);
assert.equal(currentPassRaw.currentPassEvidence?.rebindMode, "EXISTING_SERVER_PASS_REBOUND_NO_NEW_REVIEW");
assert.equal(selectedDirection05.currentPassEvidence?.evidenceSha256, currentPassRaw.currentPassEvidence?.evidenceSha256);
assert.equal(selectedDirection05.previousServerAssessment?.status, "PASS");
assert.equal(selectedDirection05.previousServerAssessment?.currentBindingSha256, currentPassRaw.currentPassEvidence?.evidenceSha256);
const staleLookEvidence = structuredClone(plan);
staleLookEvidence.comparativeReviewBoard.planSha256 = "9cd2b507382b89a5ad38a5a6ba48286e5343c6a63c853d9b70d91f24547e590e";
assert.throws(() => assertCurrentComparativeReviewEvidence(staleLookEvidence), /look-master-current-comparative-plan-binding-invalid/);

assert.equal(runtime.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(plan.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(plan.stateReconciliation?.status, "CURRENT");
assert.equal(plan.videoContextReconciliation?.status, "CURRENT");
assert.equal(plan.videoContextReconciliation?.recommendationAllowed, true);
assert.equal(plan.videoContext?.footageCompatibility, "COMPATIBLE");
assert.equal(plan.videoContext?.recommendationAllowed, true);
assert.equal(plan.videoContext?.recommendationBlocker, null);
assert.equal(plan.videoContext?.footageCompatibility, plan.videoContextReconciliation?.footageCompatibility);
assert.equal(plan.videoContext?.recommendationAllowed, plan.videoContextReconciliation?.recommendationAllowed);
assert.equal(plan.videoContext?.recommendationBlocker, plan.videoContextReconciliation?.recommendationBlocker);
assert.equal(plan.assemblyMode, "TYPOGRAPHY");
assert.equal(kit.assemblyMode, plan.assemblyMode);
assert.equal(recipe.assemblyMode, plan.assemblyMode);
assert.equal(plan.presentationMode, "OVERLAY");
assert.equal(kit.presentationMode, plan.presentationMode);
assert.equal(recipe.presentationMode, plan.presentationMode);
assert.equal(recipe.insertionMode, "OVERLAY");
assert.ok(plan.assemblyModeReason);
assert.ok(plan.whyThisModeBeatsOtherModes);
assert.ok(plan.presentationModeReason);
assert.ok(plan.whyPresentationModeBeatsOtherModes);
assert.equal(kit.assemblyModeReason, plan.assemblyModeReason);
assert.equal(kit.whyThisModeBeatsOtherModes, plan.whyThisModeBeatsOtherModes);
assert.equal(recipe.assemblyModeReason, plan.assemblyModeReason);
assert.equal(recipe.whyThisModeBeatsOtherModes, plan.whyThisModeBeatsOtherModes);
assert.equal(recipe.presentationModeReason, plan.presentationModeReason);
assert.equal(recipe.whyPresentationModeBeatsOtherModes, plan.whyPresentationModeBeatsOtherModes);
for (const context of [plan.videoContext, kit.videoContext, recipe.videoContext]) {
  assert.equal(context?.assemblyMode, plan.assemblyMode);
  assert.equal(context?.presentationMode, plan.presentationMode);
  assert.equal(context?.footageCompatibility, "COMPATIBLE");
  assert.equal(context?.recommendationAllowed, true);
  assert.equal(context?.recommendationBlocker, null);
}
assert.equal(plan.selectedLookMasterBinding?.lookMasterPlanSha256, plan.planSha256);
assert.equal(kit.selectedLookMasterBinding?.lookMasterPlanSha256, plan.planSha256);
assert.equal(recipe.selectedLookMasterBinding?.lookMasterPlanSha256, plan.planSha256);
assert.equal(kit.selectedLookMasterBinding?.provenanceStatus, "INCOMPLETE_REVIEW");
assert.equal(recipe.selectedLookMasterBinding?.provenanceStatus, "INCOMPLETE_REVIEW");
assert.ok(kit.selectedLookMasterBinding?.importedSourceId);
assert.ok(kit.selectedLookMasterBinding?.generationJobId);
assert.equal(plan.legacyVideoContextIdentity?.status, "HISTORY_READ_ONLY");
assert.equal(plan.legacyVideoContextIdentity?.videoContext?.footageCompatibility, "PENDING_COMPOSITE_AUDIT");
assert.equal(plan.legacyVideoContextIdentity?.videoContext?.recommendationAllowed, false);
assert.equal(plan.legacyVideoContextIdentity?.videoContext?.recommendationBlocker, "actual-look-master-composite-audit-required");

assert.equal(plan.portfolioAudit?.status, "PASS");
assert.equal(plan.portfolioAudit?.effectiveDirectionCount, 4);
assert.equal(plan.historicalPortfolioAudit?.status, "HISTORY_READ_ONLY");
assert.equal(plan.historicalPortfolioAudit?.advisoryOnly, true);
assert.equal(plan.activeCandidateSet?.status, "ACTIVE");
assert.equal(plan.activeCandidateSet?.candidateCount, 4);
assert.deepEqual(plan.activeCandidateSet?.directionIds, ["direction-02", "direction-03", "direction-04", "direction-05"]);
assert.equal(plan.activeCandidateSet?.selectedDirectionId, "direction-05");
assert.equal(plan.candidateDirectionAuthority, "ACTIVE_COMPARATIVE_BOARD");
assert.deepEqual(plan.currentCandidateDirections?.map((item) => item.directionId), ["direction-02", "direction-03", "direction-04", "direction-05"]);
assert.equal(plan.legacyCandidateDirections?.status, "HISTORY_READ_ONLY");
assert.equal(plan.comparativeReviewBoard?.candidateCount, 4);
assert.deepEqual((plan.comparativeReviewBoard?.candidates || []).map((item) => item.directionId).sort(), ["direction-02", "direction-03", "direction-04", "direction-05"]);
assert.equal(plan.fastCandidateDiscovery?.planSha256, plan.planSha256);
assert.equal(plan.comparativeReviewBoard?.planSha256, plan.planSha256);
assert.equal(plan.comparativeReview?.planSha256, plan.planSha256);
assert.equal(plan.portfolioAudit?.planSha256, plan.planSha256);
assert.equal(plan.fastCandidateDiscovery?.discoverySha256, plan.comparativeReviewBoard?.discoverySha256);
assert.equal(plan.fastCandidateDiscovery?.discoverySha256, plan.comparativeReview?.discoverySha256);
assert.equal(plan.comparativeReview?.boardSha256, plan.comparativeReviewBoard?.board?.sha256);
assert.equal(plan.activeCandidateSet?.reviewSha256, plan.comparativeReview?.reviewSha256);
assert.equal(plan.portfolioAudit?.comparativeReviewSha256, plan.comparativeReview?.reviewSha256);
assert.ok((plan.candidates || []).every((candidate) => candidate.status === "HISTORY_READ_ONLY" && candidate.current === false));

const finalReview = recipe.finalAssemblyReview;
if (runtime.ed10FourLayerTrial?.status === "BLOCKED_OCR") {
  assert.equal(recipe.status, "HISTORY_READ_ONLY");
  assert.equal(runtime.ed10FourLayerTrial.partialRawReferenceCount, 7);
  assert.equal(runtime.ed10FourLayerTrial.currentAssemblyPreserved, true);
  assert.equal(workspace.production.authority?.nextAction?.id, "rebuild-ed10-four-layer-trial-after-ocr-block");
  assert.equal(workspace.production.packagingAutomation?.status, "FROZEN");
  assert.equal(workspace.production.packagingAutomation?.reason, "ed10-four-layer-trial-blocked-ocr-rebuild-required");
  console.log(JSON.stringify({status: "PASS", blockedTrial: true, workspaceSha256: workspace.workspaceSha256, trialStatus: runtime.ed10FourLayerTrial.status, rawReferenceCount: runtime.ed10FourLayerTrial.partialRawReferenceCount, currentAssemblyStatus: recipe.status, nextAction: workspace.production.authority.nextAction}, null, 2));
  process.exit(0);
}
if (runtime.ed10FourLayerTrial?.status === "ASSEMBLY_REVIEW_REQUIRED" && recipe.status === "ASSEMBLY_REVIEW_REQUIRED") {
  assert.equal(runtime.ed10FourLayerTrial.parityStatus, "REVIEW_REQUIRED");
  assert.equal(runtime.ed10FourLayerTrial.result?.status, "ASSEMBLY_REVIEW_REQUIRED");
  assert.equal(runtime.ed10FourLayerTrial.result?.parityStatus, "REVIEW_REQUIRED");
  assert.doesNotMatch(JSON.stringify(runtime.ed10FourLayerTrial.result), /BLOCKED_|parityStatus["']?:["']BLOCK/u);
  assert.equal(recipe.parityAudit?.status, "REVIEW_REQUIRED");
  assert.equal(recipe.deterministicParity?.status, "REVIEW_REQUIRED");
  assert.equal(recipe.finalAssemblyReview, null);
  assert.equal(recipe.assemblyPreviewAvailable, true);
  assert.equal(recipe.assemblyReadyForUserReview, true);
  assert.equal(recipe.assemblyUserApproved, false);
  const currentKit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const actualLayerCandidateCount = currentKit.layers.reduce((sum, layer) => sum + layer.candidates.filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length, 0);
  assert.equal(runtime.ed10FourLayerTrial.actualLayerCandidateCount, actualLayerCandidateCount);
  assert.equal(workspace.production.authority?.nextAction?.id, "review-recommended-package-assembly");
  assert.equal(workspace.production.authority?.nextAction?.requiresUser, true);
  assert.equal(workspace.production.packagingAutomation?.status, "PAUSED_WAITING_FOR_ASSEMBLY_REVIEW");
  console.log(JSON.stringify({status: "PASS", deterministicAssemblyReview: true, workspaceSha256: workspace.workspaceSha256, trialStatus: runtime.ed10FourLayerTrial.status, actualLayerCandidateCount: runtime.ed10FourLayerTrial.actualLayerCandidateCount, parityStatus: recipe.parityAudit.status, serverVisualReview: runtime.ed10FourLayerTrial.serverVisualReview}, null, 2));
  process.exit(0);
}
assert.equal(recipe.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(finalReview?.status, "PASS");
for (const evidence of [recipe.parityAudit, finalReview]) {
  assert.equal(evidence?.layerScope?.slotCount, 4);
  assert.equal(evidence?.layerScope?.actualLayerCount, 2);
  assert.equal(evidence?.layerScope?.noneLayerCount, 2);
  assert.deepEqual(evidence?.layerScope?.actualLayerKinds, ["TYPOGRAPHY", "ELEMENT_KIT"]);
  assert.deepEqual(evidence?.layerScope?.noneLayerKinds, ["BACKGROUND", "ILLUSTRATION"]);
  assert.doesNotMatch(JSON.stringify(evidence), /四层重组|RECONSTRUCTED_FOUR_LAYER_ASSEMBLY/u, "current PASS evidence must not claim four produced layers");
  assert.match(evidence?.structuralParity?.evidence || "", /2 层实际.*2 个 NONE/u);
}
assert.doesNotMatch(JSON.stringify(plan.comparativeReview), /四层易于重建|四层拆解清晰|四层变化较少/u, "active comparative review must describe slot-aware reconstruction");
assert.equal(plan.comparativeReview?.reviewSha256, plan.activeCandidateSet?.reviewSha256);
assert.equal(plan.comparativeReview?.reviewSha256, plan.portfolioAudit?.comparativeReviewSha256);
assert.equal(kit.selectedLookMasterBinding?.status, "BATCH_RANKED_AUTO_SELECTED");
assert.equal(kit.selectedLookMasterBinding?.directionId, "direction-05");
assert.equal(kit.selectedLookMasterBinding?.artifactSha256, finalReview?.masterSha256);
assert.equal(plan.selectedLookMasterBinding?.directionId, "direction-05");
assert.equal(plan.selectedLookMasterBinding?.artifactSha256, kit.selectedLookMasterBinding?.artifactSha256);
assert.equal(recipe.selectedLookMasterBinding?.directionId, "direction-05");
assert.equal(recipe.selectedLookMasterBinding?.artifactSha256, kit.selectedLookMasterBinding?.artifactSha256);
assert.equal(recipe.finalAssemblyReview?.selectedDirectionId, "direction-05");
assert.equal(recipe.finalAssemblyReview?.masterSha256, kit.selectedLookMasterBinding?.artifactSha256);
assert.equal(recipe.parityAudit?.planSha256, kit.planSha256);
assert.equal(recipe.parityAudit?.recipeSha256, recipe.recipeSha256);
assert.equal(recipe.finalAssemblyReview?.planSha256, kit.planSha256);
assert.equal(recipe.finalAssemblyReview?.recipeSha256, recipe.recipeSha256);
assert.equal(recipe.approvalBinding?.planSha256, recipe.planSha256);
assert.equal(recipe.approvalBinding?.recipeSha256, recipe.recipeSha256);
assert.equal(recipe.approvalBinding?.buildKey, recipe.buildKey);
assert.deepEqual([...(recipe.approvalBinding?.layerHashes || [])].sort(), kit.layers.flatMap((layer) => {
  const selected = (layer.candidates || []).find((candidate) => candidate.candidateId === recipe.layerCandidateIds?.[layer.kind]);
  return selected ? [selected.candidateSha256] : [];
}).sort());
assert.equal(recipe.approvalBinding?.selectedDirectionId, "direction-05");
assert.equal(recipe.approvalBinding?.selectedMasterSha256, kit.selectedLookMasterBinding?.artifactSha256);
const staleApprovalBindingRecipe = structuredClone(recipe);
staleApprovalBindingRecipe.approvalBinding.planSha256 = "685289ef411bf279e2a93576f3e871993c411cb1f88e0353faab40da9a6e50c6";
assert.throws(() => assertPackageAssemblyRecipe(kit, staleApprovalBindingRecipe), /package-assembly-approval-binding-current-hash-invalid/);
assert.equal(recipe.parityAudit?.assemblyPreview?.sha256, recipe.assemblyComposite?.sha256);
assert.equal(recipe.finalAssemblyReview?.assemblySha256, recipe.assemblyComposite?.sha256);
assert.equal(recipe.parityAudit?.rebindMode, "CURRENT_LOOK_REVIEW_HASH_REBIND");
assert.equal(recipe.legacyParityAudit?.status, "HISTORY_READ_ONLY");
assert.equal(recipe.legacyFinalAssemblyReview?.status, "HISTORY_READ_ONLY");
for (const layer of kit.layers) {
  for (const candidate of layer.candidates) {
    if (candidate.status === "READY") assert.equal(candidate.provenance?.deterministicBuild?.sourceMasterSha256, kit.selectedLookMasterBinding?.artifactSha256);
  }
}

const derived = deriveProductionAuthority(workspace);
assert.equal(production.authority.currentStage, derived.currentStage, "persisted authority stage must match deriveProductionAuthority");
assert.equal(production.authority.nextAction.id, derived.nextAction.id, "persisted authority action must match deriveProductionAuthority");
assert.equal(production.authority.nextAction.requiresUser, derived.nextAction.requiresUser);
assert.equal(workspace.status, `PACKAGING_LANE_${String(runtime.status).replaceAll("-", "_")}`);
assert.equal(runtime.currentCandidateSource?.legacySelectorsDisabled, true);
assert.equal(production.generation.summary.queued, 0);
assert.equal(production.generation.summary.running, 0);
assert.equal(production.generation.workerStatus, "frozen");
assert.equal(production.packagingAutomation?.legacyGlobalPolicyStatus, "HISTORY_READ_ONLY");
assert.equal(production.packagingAutomation?.generationFreeze?.frozen, true);
assert.equal(production.packagingAutomation?.legacyGlobalPolicy?.advisoryOnly, true);
assert.equal(production.packagingStyleBriefAudit?.briefCount, production.packagingStyleBriefs.length);
assert.equal(production.packagingStyleBriefAudit?.results.length, production.packagingStyleBriefs.length);
assert.deepEqual(production.packagingStyleBriefAudit?.fingerprintSet?.slice().sort(), [...new Set(production.packagingStyleBriefAudit.results.map((item) => item.fingerprint))].sort());
assert.equal(production.packagingStyleBriefAudit?.fingerprintSet?.length, 5);
assert.equal(production.shotIntelligence.activePackagingPolicy?.lookMasterFlow, "BATCH_RANKED_AUTO_SELECTED");
assert.notEqual(workspace.visualBible.visualGenerationPolicy?.sha256, production.shotIntelligence.activePackagingPolicy?.sha256);
const report = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/report.json", "utf8"));
assert.equal(report.workspaceSha256, workspace.workspaceSha256);
assert.equal(report.summary?.masterDirectionCount, 4);
assert.equal(report.summary?.actualLayerCandidateCount, 2);
assert.equal(report.summary?.noneLayerRouteCount, 2);
assert.equal(report.packagingLaneSummary?.selectedDirectionId, "direction-05");
assert.equal(report.packagingLaneSummary?.layerTrialScope, "按 direction-05 reconstructionMap 裁剪后的两层实际试点；不是四层各有多候选");

console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, rootStatus: workspace.status, runtimeStatus: runtime.status, activeEffectiveDirectionCount: plan.activeCandidateSet?.candidateCount, selectedDirectionId: plan.activeCandidateSet?.selectedDirectionId, assemblyStatus: recipe.status, parity: finalReview?.status, queue: {queued: production.generation.summary.queued, running: production.generation.summary.running}, worker: production.generation.workerStatus}, null, 2));
