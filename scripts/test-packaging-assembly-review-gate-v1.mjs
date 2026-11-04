#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {packagingReviewBinding, applyPackagingReviewDecision, applyPackageSubjectPlacementConfirmation, packagingProductionAllowed, advancePackageMotionIr} from "../apps/studio-next/src/lib/a1-packaging-review-controller-v1.mjs";
import {deriveProductionAuthority} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildEd10TrialScopeNote, derivePackageAssemblyReviewState} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {derivePackageSubjectBoundsPlacementGate} from "../apps/studio-next/src/lib/a1-package-video-placement-gate-v1.mjs";
import {assertPackageAssemblyRecipe, buildDeterministicLayerSelectionEvidence} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {classifyPackageProvenance, isPackageProvenanceProductionReady} from "../apps/studio-next/src/lib/a1-package-provenance-v1.mjs";

const repoRoot = process.cwd();
const workspacePath = path.join(repoRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const shot = workspace.production.shotIntelligence;
const recipe = shot.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
const waitingLookMasterPlan = shot.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const liveExceptionShotIds = [...new Set((shot.wholeFilmBatchRecommendation?.exceptions || []).map((item) => item.shotId).filter(Boolean))].sort();
if (shot.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
  && shot.wholeFilmBatchRecommendation?.nextUserGate === "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED") {
  assert.deepEqual(liveExceptionShotIds, ["ED-13", "ED-31", "ED-32"]);
  assert.equal(workspace.production.visualProductionRun.status, "CANDIDATE_SELECTION_PENDING");
  assert.equal(workspace.production.authority.currentStage, "film-look-master-exception-repair-required");
  assert.equal(workspace.production.authority.nextAction.id, "repair-look-master-exceptions");
  assert.equal(packagingProductionAllowed(workspace), false);
  assert.deepEqual(shot.currentAssembly || [], []);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  console.log(JSON.stringify({status: "PASS", gate: "WHOLE_FILM_STATIC_BOARD_STILL_LOCKED", exceptionRepairRequired: true, exceptionShotIds: liveExceptionShotIds, currentAssembly: 0, nextUserGate: shot.wholeFilmBatchRecommendation.nextUserGate}, null, 2));
  process.exit(0);
}
if (workspace.production.wholeFilmPackagingDirection?.contract === "A1WholeFilmPackagingDirection/v1") {
  const direction = workspace.production.wholeFilmPackagingDirection;
  const currentRecipes = shot.packageAssemblyRecipes.filter((item) => item.status !== "HISTORY_READ_ONLY" && item.current !== false);
  const currentKits = shot.packageAssetKitPlans.filter((item) => item.status !== "HISTORY_READ_ONLY" && item.current !== false);
  assert.equal(direction.reviewPolicy.perShotUserApprovalRequired, false);
  assert.equal(direction.reviewPolicy.wholeFilmStaticAssemblyReviewRequired, true);
  assert.equal(direction.reviewPolicy.layerExtractionBeforeWholeFilmAssemblyApproval, false);
  assert.equal(workspace.production.packagingReview?.advisoryOnly, true);
  assert.equal(workspace.production.packagingReview?.requiresExplicitApproval, false);
  assert.equal(workspace.production.visualProductionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(workspace.production.authority?.nextAction?.id, "review-whole-film-static-board");
  assert.equal(workspace.production.authority?.nextAction?.reviewGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(shot.wholeFilmBatchRecommendation?.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(shot.wholeFilmStaticBoard?.status, "PENDING_USER_APPROVAL");
  assert.equal(shot.wholeFilmStaticBoard?.decision, null);
  assert.equal(currentRecipes.length, 0);
  assert.equal(currentKits.length, 0);
  assert.equal(packagingProductionAllowed(workspace), false);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  console.log(JSON.stringify({status: "PASS", scope: "WHOLE_FILM_STATIC_ASSEMBLY_GATE", perShotUserApprovalRequired: false, currentAssembly: 0, currentKits: 0, nextUserGate: "WHOLE_FILM_STATIC_BOARD"}, null, 2));
  process.exit(0);
}
if (shot.status === "LOOK_MASTER_REVIEW_REQUIRED" && waitingLookMasterPlan?.currentCandidateSource?.status === "RECOVERED_EXISTING_LOOK_MASTER_CANDIDATES") {
  const waitingKit = shot.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const waitingBinding = packagingReviewBinding(workspace, "ED-10");
  assert.equal(workspace.production.packagingReview.status, "LOOK_MASTER_REVIEW_REQUIRED");
  assert.equal(workspace.production.packagingReview.currentDecision, null);
  assert.deepEqual(waitingLookMasterPlan.activeCandidateSet?.directionIds, ["direction-02", "direction-04"]);
  assert.equal(waitingLookMasterPlan.activeCandidateSet?.selectedCandidateId, null);
  assert.deepEqual(waitingBinding.currentAssembly, []);
  assert.equal(recipe.status, "HISTORY_READ_ONLY");
  assert.equal(recipe.visualStatus, "VISUAL_REJECTED");
  assert.equal(recipe.current, false);
  assert.equal(recipe.assemblyReadyForUserReview, false);
  assert.equal(waitingKit.status, "WAITING_FOR_LOOK_MASTER");
  assert.equal(waitingKit.layers.reduce((sum, layer) => sum + (layer.candidates?.length || 0), 0), 0);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  console.log(JSON.stringify({
    status: "PASS",
    waitingForLookMaster: true,
    activeShortlist: waitingLookMasterPlan.activeCandidateSet.directionIds,
    currentAssembly: waitingBinding.currentAssembly,
    oldRecipe: {status: recipe.status, visualStatus: recipe.visualStatus, current: recipe.current},
    queue: workspace.production.generation.summary,
  }, null, 2));
  process.exit(0);
}
assert.equal(workspace.production.packagingReview.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(workspace.production.packagingReview.currentDecision, null);
if (shot.integratedPresenterPackage?.status === "ASSEMBLY_REVIEW_REQUIRED") {
  const currentKit = shot.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  assert.equal(recipe.assemblySource?.mode, "IMAGEGEN_INTEGRATED_PRESENTER_FRAME");
  assert.equal(recipe.assemblySource?.localLayerRecompositionPerformed, false);
  assert.equal(recipe.assemblyComposite?.relationship, "IMAGEGEN_COMPOSED_WITH_REAL_PRESENTER_FRAME");
  assert.equal(recipe.packageOnlyComposite?.relationship, "IMAGEGEN_REVERSE_EXTRACTED_PACKAGE_ONLY");
  assert.equal(recipe.packageOnlyComposite?.alphaVerified, true);
  assert.equal(recipe.contextPreview?.assemblySha256, recipe.assemblyComposite?.sha256);
  assert.equal(recipe.contextPreview?.packageOnlySha256, recipe.packageOnlyComposite?.sha256);
  assert.equal(recipe.decompositionSlots?.BACKGROUND?.route, "NONE");
  assert.equal(recipe.decompositionSlots?.TYPOGRAPHY?.route, "DECOMPOSE_AFTER_ASSEMBLY_APPROVAL");
  assert.equal(recipe.decompositionSlots?.ELEMENT_KIT?.route, "DECOMPOSE_AFTER_ASSEMBLY_APPROVAL");
  assert.equal(currentKit.integratedAssemblyPolicy?.fourSlotsAreDeliveryContractsNotPrecompositionInputs, true);
  assert.equal(currentKit.integratedAssemblyReview?.status, "REVIEW_REQUIRED");
  assert.equal(shot.integratedPresenterPackage.ocr?.exact, true);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  console.log(JSON.stringify({status: "PASS", presenterFirstIntegratedAssembly: true, assembly: recipe.assemblyComposite, packageOnly: recipe.packageOnlyComposite, ocr: shot.integratedPresenterPackage.ocr, queue: workspace.production.generation.summary}, null, 2));
  process.exit(0);
}
if (workspace.production.authority.currentStage === "assembly-review-required" && workspace.production.authority.nextAction.id === "review-recommended-package-assembly") {
  assert.equal(workspace.production.authority.nextAction.recommendationStatus, "PENDING_PLACEMENT_VERIFICATION");
  assert.match(workspace.production.authority.nextAction.label, /放置验证未完成/u);
}
if (String(shot.ed10FourLayerTrial?.status || "").startsWith("BLOCKED_") && recipe.status === "HISTORY_READ_ONLY") {
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.ok(shot.ed10FourLayerTrial.failureReason);
  assert.equal(shot.ed10FourLayerTrial.currentAssemblyPreserved, true);
  assert.equal(recipe.status, "HISTORY_READ_ONLY");
  assert.ok(shot.ed10FourLayerTrial.preservedAssembly?.assemblyComposite?.sha256);
  assert.equal(workspace.production.authority.nextAction.id, shot.ed10FourLayerTrial.status === "BLOCKED_OCR" ? "rebuild-ed10-four-layer-trial-after-ocr-block" : "rebuild-ed10-four-layer-trial-after-block");
  assert.equal(workspace.production.packagingAutomation.status, "FROZEN");
  assert.match(workspace.production.packagingAutomation.reason, new RegExp(`ed10-four-layer-trial-${shot.ed10FourLayerTrial.status.toLowerCase()}-rebuild-required`));
  console.log(JSON.stringify({status: "PASS", blockedTrial: true, failureReason: shot.ed10FourLayerTrial.failureReason, preservedAssembly: shot.ed10FourLayerTrial.preservedAssembly, queue: workspace.production.generation.summary}, null, 2));
  process.exit(0);
}
if (shot.ed10FourLayerTrial?.status === "ASSEMBLY_REVIEW_REQUIRED" && recipe.status === "ASSEMBLY_REVIEW_REQUIRED") {
  const currentKit = shot.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const actualLayerCount = currentKit.layers.reduce((sum, layer) => sum + layer.candidates.filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length, 0);
  assert.equal(shot.ed10FourLayerTrial.actualLayerCandidateCount, actualLayerCount);
  assert.equal(currentKit.layers.find((layer) => layer.kind === "BACKGROUND")?.route, "NONE");
  assert.equal(currentKit.layers.find((layer) => layer.kind === "BACKGROUND")?.candidates.filter((candidate) => candidate.status === "READY").length, 0);
  assert.ok(currentKit.layers.find((layer) => layer.kind === "BACKGROUND")?.candidates.some((candidate) => candidate.admission?.failures?.includes("overlay-opaque-full-frame-background-forbidden")));
  assert.equal(recipe.parityAudit?.status, "REVIEW_REQUIRED");
  assert.equal(recipe.deterministicParity?.status, "REVIEW_REQUIRED");
  assert.equal(recipe.finalAssemblyReview, null);
  assert.equal(recipe.assemblyReadyForUserReview, true);
  assert.equal(recipe.assemblyUserApproved, false);
  assert.ok(recipe.assemblyComposite?.sha256);
  assert.ok(recipe.contextPreview?.sha256);
  assert.equal(recipe.contextPreview.baseFrameSha256, recipe.videoContext.baseFrame.sha256);
  assert.equal(recipe.contextPreview.assemblySha256, recipe.assemblyComposite.sha256);
  const reviewState = derivePackageAssemblyReviewState(recipe, workspace);
  assert.equal(reviewState.assemblyPreviewAvailable, true);
  assert.equal(reviewState.assemblyReadyForUserReview, true);
  assert.equal(reviewState.currentAssemblyAvailableForApproval, true);
  assert.equal(reviewState.currentAssemblyRequiresApproval, true);
  assert.equal(reviewState.deterministicParityStatus, "REVIEW_REQUIRED");
  assert.equal(buildEd10TrialScopeNote(shot.ed10FourLayerTrial), `本轮实际尝试 BACKGROUND 1 / TYPOGRAPHY 3 / ELEMENT_KIT 1 / ILLUSTRATION 2；已完成 ${actualLayerCount} 个确定性层候选与 Assembly 预览，等待用户审阅（未运行 critic）。`);
  const registry = workspace.production.packageLayerAdmissionRegistry || {};
  const activeLayerCandidates = (shot.packageAssetKitPlans.find((item) => item.shotId === "ED-10")?.layers || []).flatMap((layer) => layer.candidates || []).filter((candidate) => candidate.status === "READY");
  assert.equal(Object.values(registry).filter((entry) => entry?.status !== "HISTORY_READ_ONLY" && entry?.current !== false).length, activeLayerCandidates.length);
  for (const candidate of activeLayerCandidates) {
    const admissionId = candidate.provenance?.serverAuditId || candidate.serverAuditId || candidate.admission?.admissionId;
    assert.ok(admissionId, `active candidate ${candidate.candidateId} must expose server admission id`);
    assert.ok(registry[admissionId], `active candidate ${candidate.candidateId} must have a server registry record`);
    assert.equal(registry[admissionId].artifactSha256, candidate.artifact?.sha256);
  }
  const danglingRegistry = structuredClone(workspace);
  const firstAdmissionId = activeLayerCandidates[0]?.provenance?.serverAuditId || activeLayerCandidates[0]?.serverAuditId || activeLayerCandidates[0]?.admission?.admissionId;
  delete danglingRegistry.production.packageLayerAdmissionRegistry[firstAdmissionId];
  assert.throws(() => assertEditorialAssetWorkbench(danglingRegistry), /package-layer-server-admission-registry-missing/u, "a READY candidate may not outlive its server-owned admission record");
  const deterministicBinding = packagingReviewBinding(workspace, "ED-10");
  assert.equal(deterministicBinding.currentAssembly.length, 1);
  const historyOnlyClone = structuredClone(workspace);
  historyOnlyClone.production.shotIntelligence.packageAssemblyRecipes.push({
    ...structuredClone(recipe),
    shotId: "ED-10-HISTORY",
    status: "HISTORY_READ_ONLY",
    assemblyReadyForUserReview: false,
    finalAssemblyReview: {status: "PASS", assemblySha256: recipe.assemblyComposite.sha256},
  });
  const historyBinding = packagingReviewBinding(historyOnlyClone);
  assert.equal(historyBinding.currentAssembly.some((item) => item.shotId === "ED-10-HISTORY"), false, "history recipe cannot enter current Assembly binding");
  const currentWorkbenchReport = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/report.json"), "utf8"));
  assert.equal(currentWorkbenchReport.summary?.assemblyPreviewAvailable, true);
  assert.equal(currentWorkbenchReport.summary?.assemblyReadyForUserReview, true);
  assert.equal(currentWorkbenchReport.summary?.currentAssemblyAvailableForApproval, true);
  assert.equal(currentWorkbenchReport.summary?.assemblyUserApproved, false);
  assert.equal(currentWorkbenchReport.approval?.recommendedAssemblyRequiresApproval, true);
  assert.equal(currentWorkbenchReport.approval?.recommendationStatus, "PENDING_PLACEMENT_VERIFICATION");
  assert.equal(currentWorkbenchReport.gates?.recommendationStatus, currentWorkbenchReport.approval?.recommendationStatus);
  assert.equal(currentWorkbenchReport.summary?.layerTrialScopeNote, buildEd10TrialScopeNote(shot.ed10FourLayerTrial));
  assert.equal(currentWorkbenchReport.summary?.assemblyPreviewReviewAllowed, true);
  assert.equal(currentWorkbenchReport.summary?.userAssemblyReviewAllowed, true);
  assert.equal(currentWorkbenchReport.summary?.packagingRawReferenceCount, 0, "legacy packaging RAW count remains compatible");
  assert.equal(currentWorkbenchReport.summary?.packagingLayerRawReferenceCount, 7, "package-layer RAW count must expose the seven bounded-trial raw references");
  assert.equal(currentWorkbenchReport.summary?.packagingLayerExtractionRequiredCount, 0);
  const placementGate = derivePackageSubjectBoundsPlacementGate(workspace, "ED-10");
  assert.equal(placementGate.status, "REQUIRED_BEFORE_FORMAL_MULTI_POINT_OR_MOTION");
  assert.equal(placementGate.confirmed, false);
  assert.equal(currentWorkbenchReport.summary?.subjectBoundsPlacementStatus, placementGate.status);
  assert.equal(currentWorkbenchReport.summary?.subjectBoundsPlacementConfirmed, false);
  assert.equal(currentWorkbenchReport.summary?.subjectBoundsPlacementReason, placementGate.reason);
  assert.equal(currentWorkbenchReport.summary?.assemblyContextPreviewAvailable, true);
  assert.equal(currentWorkbenchReport.summary?.assemblyContextBaseFrameSha256, recipe.contextPreview.baseFrameSha256);
  assert.equal(currentWorkbenchReport.summary?.overlayPlacementReviewStatus, "UNVERIFIED_SUBJECT_BOUNDS");
  const geometrySafetyPlan = structuredClone(currentKit);
  geometrySafetyPlan.videoContext = {...geometrySafetyPlan.videoContext, subjectBounds: {x: 720, y: 180, width: 520, height: 760}, safeZones: [{x: 0, y: 0, width: 620, height: 1080}], availableRegions: [{x: 0, y: 0, width: 620, height: 1080}]};
  const geometryLayer = geometrySafetyPlan.layers.find((layer) => layer.kind === "TYPOGRAPHY");
  const geometryCandidate = geometryLayer.candidates[0];
  geometryCandidate.geometry = {x: 760, y: 220, width: 420, height: 200};
  const unsafeEvidence = buildDeterministicLayerSelectionEvidence(geometrySafetyPlan, {selectedCandidateIds: {TYPOGRAPHY: geometryCandidate.candidateId}});
  const unsafeScore = unsafeEvidence.layers.find((layer) => layer.layerKind === "TYPOGRAPHY").candidateScores.find((item) => item.candidateId === geometryCandidate.candidateId);
  assert.equal(unsafeScore.evidence.videoSafety.status, "FAIL", "safe zones alone must not pass a geometry that overlaps the subject");
  geometryCandidate.geometry = {x: 80, y: 220, width: 420, height: 200};
  const safeEvidence = buildDeterministicLayerSelectionEvidence(geometrySafetyPlan, {selectedCandidateIds: {TYPOGRAPHY: geometryCandidate.candidateId}});
  const safeScore = safeEvidence.layers.find((layer) => layer.layerKind === "TYPOGRAPHY").candidateScores.find((item) => item.candidateId === geometryCandidate.candidateId);
  assert.equal(safeScore.evidence.videoSafety.status, "PASS", "a candidate actually inside an available region may pass geometry safety");
  assert.equal(currentWorkbenchReport.summary?.serverParityReviewAllowed, false);
  assert.equal(currentWorkbenchReport.summary?.criticReviewAllowed, false);
  assert.doesNotMatch(JSON.stringify(currentWorkbenchReport), /当前因 OCR 阻塞，0 个候选准入/u);
  assert.match(fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8"), /derivePackageAssemblyReviewState/);
  assert.match(fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8"), /buildEd10TrialScopeNote/);
  assert.match(fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8"), /derivePackageSubjectBoundsPlacementGate/);
  const legacyAudit = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/audit-report.json"), "utf8"));
  assert.equal(legacyAudit.status, "HISTORY_READ_ONLY");
  assert.equal(legacyAudit.supersededBy?.currentWorkspaceSha256, workspace.workspaceSha256);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal(shot.ed10FourLayerTrial.serverVisualReview, "SKIPPED_BY_BOUNDED_TRIAL");
  const selectionEvidence = recipe.selectionEvidence?.layers?.flatMap((layer) => layer.candidateScores || []) || [];
  assert.ok(selectionEvidence.some((entry) => entry.evidence?.videoSafety?.status === "UNVERIFIED_SUBJECT_BOUNDS_NULL"), "selection evidence must remain honest while bounds are absent");
  assert.equal(shot.ed10FourLayerTrial.result?.status, "ASSEMBLY_REVIEW_REQUIRED");
  assert.equal(shot.ed10FourLayerTrial.result?.parityStatus, "REVIEW_REQUIRED");
  assert.doesNotMatch(JSON.stringify(shot.ed10FourLayerTrial.result), /BLOCKED_|parityStatus["']?:["']BLOCK/u);
  const source = fs.readFileSync(path.join(repoRoot, "scripts/continue-ed10-four-layer-trial-v1.mjs"), "utf8");
  assert.doesNotMatch(source, /runPackageAssemblyParityVisualReview|a1-package-look-master-reviewer-v1/);
  const approved = applyPackagingReviewDecision(structuredClone(workspace), "approved", {shotId: "ED-10", actor: "test", now: "2026-08-05T00:00:00.000Z"});
  assert.equal(approved.workspace.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10").userAssemblyDecision.decision, "approved");
  assert.throws(() => advancePackageMotionIr(recalculateEditorialAssetWorkbench(approved.workspace, "2026-08-05T00:00:01.000Z"), {shotId: "ED-10", now: "2026-08-05T00:00:02.000Z"}), /package-motion-ir-assembly-approval-required|package-motion-ir-assembly-parity-or-user-decision-required|provenance/u);
  const complete = structuredClone(workspace);
  const completeApproved = applyPackagingReviewDecision(complete, "approved", {shotId: "ED-10", actor: "test", now: "2026-08-05T00:00:00.000Z"});
  const completeKit = completeApproved.workspace.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const completeRecipe = completeApproved.workspace.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  completeKit.selectedLookMasterBinding = {
    ...completeKit.selectedLookMasterBinding,
    provenanceMode: "SYSTEM_GENERATED",
    provenanceStatus: "COMPLETE",
    traceabilityStatus: "COMPLETE",
    generationJobId: "job-ed10-server-owned",
    generationId: "gen-ed10-server-owned",
    provenance: {...(completeKit.selectedLookMasterBinding.provenance || {}), provenanceStatus: "COMPLETE", traceabilityStatus: "COMPLETE", generationId: "gen-ed10-server-owned", generationJobId: "job-ed10-server-owned", operatorImported: false},
  };
  completeRecipe.deterministicParity = {...completeRecipe.deterministicParity, status: "PASS", auditSha256: completeRecipe.deterministicParity?.auditSha256 || completeRecipe.parityAudit?.auditSha256 || "server-parity-audit-ed10"};
  const placement = applyPackageSubjectPlacementConfirmation(completeApproved.workspace, {shotId: "ED-10", recipeSha256: completeRecipe.recipeSha256, layerCandidateIds: completeRecipe.layerCandidateIds, confirmedBy: "user", now: "2026-08-05T00:00:03.000Z"});
  const placedRecipe = placement.workspace.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  assert.equal(placedRecipe.manualPlacementConfirmation.status, "CONFIRMED");
  assert.equal(placement.workspace.production.packagingReview.currentDecision.binding.bindingSha256, placement.binding.bindingSha256);
  assert.equal(placedRecipe.approvalBinding.recipeSha256, placedRecipe.recipeSha256);
  assert.equal(placedRecipe.deterministicParity.recipeSha256, placedRecipe.recipeSha256);
  assertPackageAssemblyRecipe(placement.workspace.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10"), placedRecipe);
  assert.equal(packagingProductionAllowed(placement.workspace), true, "approve -> placement -> complete provenance/parity must unlock production predicate");
  console.log(JSON.stringify({status: "PASS", deterministicAssemblyReview: true, trial: shot.ed10FourLayerTrial.status, actualLayerCandidateCount: shot.ed10FourLayerTrial.actualLayerCandidateCount, parity: recipe.parityAudit.status, serverVisualReview: shot.ed10FourLayerTrial.serverVisualReview, queue: workspace.production.generation.summary}, null, 2));
  process.exit(0);
}
assert.equal(recipe.finalAssemblyReview.status, "PASS");

const kit = shot.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const actualLayers = kit.layers.reduce((sum, layer) => sum + layer.candidates.filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length, 0);
const noneLayers = kit.layers.filter((layer) => layer.route === "NONE").length;
assert.equal(actualLayers, 2, "ED-10 remains a two-actual-layer trial");
assert.equal(noneLayers, 2, "ED-10 retains two semantic NONE routes");
assert.equal(classifyPackageProvenance(kit.selectedLookMasterBinding), "OPERATOR_IMPORTED");
assert.equal(isPackageProvenanceProductionReady(kit.selectedLookMasterBinding), false);
assert.equal(kit.selectedLookMasterBinding.generationId, null);

const binding = packagingReviewBinding(workspace);
assert.ok(binding.assemblyBindingSha256, "current Assembly binding must be hash-bound");
assert.equal(binding.currentAssembly.length, 1);
assert.equal(binding.currentAssembly[0].recipeSha256, recipe.recipeSha256);
assert.deepEqual(binding.currentAssembly[0].layerCandidateIds, recipe.layerCandidateIds);
assert.ok(binding.bindingSha256, "review binding must include recipe/layer graph");

const packagingAutomation = workspace.production.packagingAutomation;
assert.ok(packagingAutomation, "packaging-only lane must expose current automation state");
assert.notEqual(packagingAutomation.status, "running");
assert.equal(packagingAutomation.generationFreeze.automaticDispatchAllowed, false);
assert.equal(packagingAutomation.generationFreeze.workerStatus, "frozen");
assert.equal(packagingAutomation.legacyGlobalPolicyStatus, "HISTORY_READ_ONLY");
assert.equal(packagingAutomation.legacyGlobalPolicy?.current, false);
assert.equal(packagingAutomation.legacyGlobalPolicy?.advisoryOnly, true);

const panelSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/system-line-visual-workbench/ShotIntelligencePanel.tsx"), "utf8");
const mapSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/system-line-visual-workbench/PackagingBeatMapPanel.tsx"), "utf8");
const workbenchRouteSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8");
assert.match(panelSource, /data-a1-current-assembly-review/);
assert.match(panelSource, /data-a1-current-assembly-action=/);
assert.match(panelSource, /onAction\("packaging-review"/);
assert.doesNotMatch(panelSource, /disabled=\{busy \|\| !provenanceComplete\}/);
assert.match(panelSource, /data-a1-current-assembly-approve-enabled="true"/);
assert.match(panelSource, /Motion IR 仍被硬阻断/);
assert.match(panelSource, /data-a1-overlay-placement-risk="UNVERIFIED_SUBJECT_BOUNDS"/);
assert.match(panelSource, /data-a1-selected-master-provenance-mode/);
assert.match(panelSource, /OPERATOR_IMPORTED/);
assert.match(panelSource, /ED-10 overlay trial/);
assert.doesNotMatch(panelSource, /data-a1-package-motion-ir-action="build"/);
assert.match(mapSource, /LEGACY ANCHOR REVIEW · ADVISORY ONLY/);
assert.match(workbenchRouteSource, /body\.action === "build-package-motion-ir"/);
assert.match(workbenchRouteSource, /advancePackageMotionIr/);
assert.match(workbenchRouteSource, /assemblyContextPreviewAvailable/);
assert.match(workbenchRouteSource, /overlayPlacementReviewStatus/);
const packagingReviewRouteSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/api/system-line/packaging-review/route.ts"), "utf8");
assert.match(packagingReviewRouteSource, /automaticMotionIrTransition/);
assert.match(packagingReviewRouteSource, /advancePackageMotionIr/);
assert.match(packagingReviewRouteSource, /decision === "approved" && packagingProductionAllowed\(next\)/);
const reviewControllerSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/lib/a1-packaging-review-controller-v1.mjs"), "utf8");
assert.match(reviewControllerSource, /package-motion-ir-assembly-approval-required/);
const clientSource = fs.readFileSync(path.join(repoRoot, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");
assert.match(clientSource, /仅自动发现、排序和缓存关键包装事件/);
assert.match(clientSource, /action === "build-package-motion-ir"/);
assert.match(clientSource, /data-a1-packaging-automation-status/);

for (const decision of ["approved", "structure-revise-required", "visual-primitive-switch-required"]) {
  const clone = structuredClone(workspace);
  const result = applyPackagingReviewDecision(clone, decision, {actor: "test", now: "2026-08-05T00:00:00.000Z"});
  const evaluated = recalculateEditorialAssetWorkbench(result.workspace, "2026-08-05T00:00:01.000Z");
  assert.equal(result.decision.immutable, true);
  assert.equal(result.decision.binding.bindingSha256, binding.bindingSha256);
  assert.equal(result.decision.binding.assemblyBindingSha256, binding.assemblyBindingSha256);
  assert.deepEqual(result.decision.binding.currentAssembly, binding.currentAssembly);
  assert.equal(result.workspace.production.packagingReview.currentDecision.binding.bindingSha256, binding.bindingSha256);
  if (decision === "approved") {
    const authority = deriveProductionAuthority(evaluated);
    assert.equal(authority.nextAction.id, "complete-package-provenance-trace");
    assert.equal(authority.nextAction.requiresUser, true);
    assert.equal(evaluated.production.shotIntelligence.status, "ASSEMBLY_REVIEW_REQUIRED", "approval alone does not render or start motion");
  } else {
    const authority = deriveProductionAuthority(evaluated);
    assert.equal(evaluated.production.shotIntelligence.status, "ASSEMBLY_REVIEW_REQUIRED");
    assert.equal(authority.nextAction.id, decision === "structure-revise-required" ? "await-structure-revise-package-assembly" : "await-switch-package-visual-primitive");
    assert.equal(authority.nextAction.requiresUser, true);
    assert.match(evaluated.production.packagingAutomation.reason, /controlled-(structure-revise|primitive-switch)-dispatch/u);
  }
}

const approved = structuredClone(workspace);
const first = applyPackagingReviewDecision(approved, "approved", {actor: "test", now: "2026-08-05T00:00:00.000Z"});
assert.throws(() => applyPackagingReviewDecision(first.workspace, "structure-revise-required", {actor: "test", now: "2026-08-05T00:01:00.000Z"}), /packaging-review-decision-immutable|packaging-anchor-or-assembly-proof-not-ready/u);
const approvedRecalculated = recalculateEditorialAssetWorkbench(first.workspace, "2026-08-05T00:00:01.000Z");
assert.throws(() => advancePackageMotionIr(approvedRecalculated, {shotId: "ED-10", now: "2026-08-05T00:00:02.000Z"}), /package-motion-ir-assembly-approval-required/u, "INCOMPLETE_REVIEW provenance must block Motion IR");

console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: workspace.workspaceSha256,
  runtimeStatus: shot.status,
  assemblyBindingSha256: binding.assemblyBindingSha256,
  recipeSha256: recipe.recipeSha256,
  actualLayerCandidateCount: actualLayers,
  noneLayerRouteCount: noneLayers,
  packagingAutomationStatus: packagingAutomation.status,
  currentAssemblyActions: ["approve", "structure-revise", "primitive-switch"],
}, null, 2));
