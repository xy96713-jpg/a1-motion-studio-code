#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(".");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const workspace = read(path.join(publicRoot, "editorial-asset-workbench-v1/workspace.json"));
const currentReport = read(path.join(artifactRoot, "editorial-asset-workbench-v1/report.json"));
const authority = read(path.join(artifactRoot, "system-line-current-authority-v2/report.json"));
const waitingLookMaster = workspace.production.shotIntelligence?.status === "LOOK_MASTER_REVIEW_REQUIRED"
  && workspace.production.packagingReview?.status === "LOOK_MASTER_REVIEW_REQUIRED";
const blockedTrial = workspace.production.shotIntelligence?.ed10FourLayerTrial?.status === "BLOCKED_OCR";
const deterministicTrial = workspace.production.shotIntelligence?.ed10FourLayerTrial?.status === "ASSEMBLY_REVIEW_REQUIRED"
  && workspace.production.shotIntelligence?.packageAssemblyRecipes?.some((recipe) => recipe.shotId === "ED-10" && recipe.status === "ASSEMBLY_REVIEW_REQUIRED" && recipe.deterministicParity?.status === "REVIEW_REQUIRED");
const presenterFirst = workspace.production.shotIntelligence?.integratedPresenterPackage?.status === "ASSEMBLY_REVIEW_REQUIRED"
  && workspace.production.shotIntelligence?.integratedPresenterPackage?.compositionAuthority === "IMAGEGEN_INTEGRATED_PRESENTER_FRAME";
const currentKit = workspace.production.shotIntelligence?.packageAssetKitPlans?.find((plan) => plan.shotId === "ED-10");
const currentActualLayerCount = currentKit?.layers?.reduce((sum, layer) => sum + (layer.candidates || []).filter((candidate) => candidate.status === "READY" && candidate.admission?.status === "PASS").length, 0) || 0;
const currentNoneLayerCount = currentKit?.layers?.filter((layer) => layer.route === "NONE").length || 0;
const currentLifecycle = derivePackagingLifecycleProjection(workspace);
const failures = [];
const check = (condition, id, detail) => { if (!condition) failures.push({id, detail}); };

if (workspace.production.wholeFilmPackagingDirection?.contract === "A1WholeFilmPackagingDirection/v1") {
  const canonicalRepairLifecycleStatuses = ["CANONICAL_TITLE_REPAIR_BINDING_REQUIRED", "CANONICAL_TITLE_REPAIR_PENDING", "CANONICAL_TITLE_REPAIR_GENERATING"];
  if (canonicalRepairLifecycleStatuses.includes(currentLifecycle.status)) {
    const scope = currentLifecycle.status === "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED" ? "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED" : currentLifecycle.status;
    check(workspace.production.authority?.currentStage === currentLifecycle.authorityStage, "canonical-repair-authority-stage", workspace.production.authority);
    check(workspace.production.authority?.nextAction?.id === currentLifecycle.nextActionId
      && workspace.production.authority?.nextAction?.requiresUser === false
      && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify([...(currentLifecycle.targetShotIds || [])].sort()), "canonical-repair-binding-next-action", workspace.production.authority?.nextAction);
    const generating = currentLifecycle.status === "CANONICAL_TITLE_REPAIR_GENERATING";
    check(workspace.production.generation?.automaticDispatchAllowed === generating
      && (generating || (workspace.production.generation?.summary?.queued === 0 && workspace.production.generation?.summary?.running === 0)), "canonical-repair-generation-state", workspace.production.generation);
    check(workspace.production.shotIntelligence?.currentAssembly?.length === 0
      && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false, "canonical-repair-binding-downstream-locks", workspace.production.shotIntelligence?.wholeFilmBatchRecommendation);
    if (failures.length) {
      console.error(JSON.stringify({status: "FAIL", scope, failures}, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({status: "PASS", scope, workspaceSha256: workspace.workspaceSha256, nextAction: workspace.production.authority.nextAction, targetShotIds: currentLifecycle.targetShotIds}, null, 2));
    process.exit(0);
  }
  const direction = workspace.production.wholeFilmPackagingDirection;
  const currentShotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
  const expectedPackageShotIds = workspace.production.canonicalCreatorPackagingSequence.decisions
    .filter((decision) => decision.packageDecision === "PACKAGE")
    .map((decision) => decision.shotId);
  const currentPackageShotIds = workspace.production.shotIntelligence.decisionSet.items
    .filter((item) => item.packageDecision === "PACKAGE")
    .map((item) => item.shotId);
  const lifecycle = workspace.production.packagingLifecycleProjection;
  check(direction.counts?.shotCount === currentShotCount, "whole-film-shot-count", direction.counts);
  check(direction.counts?.lookMasterRequiredCount === expectedPackageShotIds.length, "whole-film-look-master-count", direction.counts);
  check(direction.counts?.pendingLookMasterCount === 0, "whole-film-pending-look-master-count", direction.counts);
  check(JSON.stringify(currentPackageShotIds) === JSON.stringify(expectedPackageShotIds), "canonical-package-membership", currentPackageShotIds);
  check(workspace.production.shotVisualCoveragePlan?.shotPlans?.length === currentShotCount, "dynamic-coverage-plan-shot-count", workspace.production.shotVisualCoveragePlan?.counts);
  check(workspace.production.visualProductionRun?.tasks?.length === currentShotCount, "dynamic-production-run-task-count", workspace.production.visualProductionRun?.counts);
  check(workspace.production.authority?.currentStage === "whole-film-static-board-review", "whole-film-authority-stage", workspace.production.authority);
  check(workspace.production.authority?.nextAction?.id === "review-whole-film-static-board"
    && workspace.production.authority?.nextAction?.requiresUser === true
    && workspace.production.authority?.nextAction?.reviewGate === "WHOLE_FILM_STATIC_BOARD", "whole-film-next-action", workspace.production.authority?.nextAction);
  check(workspace.production.shotIntelligence?.wholeFilmStaticBoard?.status === "PENDING_USER_APPROVAL"
    && workspace.production.shotIntelligence?.wholeFilmStaticBoard?.itemCount === expectedPackageShotIds.length
    && workspace.production.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.itemCount === 34, "whole-film-board-current", workspace.production.shotIntelligence?.wholeFilmStaticBoard);
  check(JSON.stringify(lifecycle?.blockedShotIds) === JSON.stringify([])
    && lifecycle?.approvalAllowed === true
    && lifecycle?.reviewActionDisabled === false, "current-static-board-ready-for-user-review", lifecycle);
  check(workspace.production.packagingBeatPlan?.authorityScope === "HISTORY_READ_ONLY" && workspace.production.packagingBeatPlan?.current === false, "legacy-packaging-plan-history-only", {authorityScope: workspace.production.packagingBeatPlan?.authorityScope, current: workspace.production.packagingBeatPlan?.current});
  check(workspace.production.packagingReview?.advisoryOnly === true && workspace.production.packagingReview?.requiresExplicitApproval === false, "single-shot-review-not-global-authority", workspace.production.packagingReview);
  check(currentActualLayerCount === 0, "pre-whole-film-approval-layer-count", currentActualLayerCount);
  check(workspace.production.generation?.summary?.queued === 0 && workspace.production.generation?.summary?.running === 0, "generation-queue-stays-frozen", workspace.production.generation?.summary);
  if (failures.length) {
    console.error(JSON.stringify({status: "FAIL", scope: "WHOLE_FILM_PACKAGING_DIRECTION", failures}, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({status: "PASS", scope: "WHOLE_FILM_STATIC_BOARD_CURRENT_AUTHORITY", workspaceSha256: workspace.workspaceSha256, canonicalPackageShotIds: currentPackageShotIds, counts: direction.counts, nextAction: workspace.production.authority.nextAction, blockedShotIds: lifecycle.blockedShotIds, layerCandidates: currentActualLayerCount}, null, 2));
  process.exit(0);
}

check(currentReport.contract === "A1EditorialAssetWorkbenchPackagingAuthorityReport/v1", "canonical-report-contract", currentReport.contract);
check(currentReport.authorityScope === "packaging-only-current", "canonical-report-current-scope", currentReport.authorityScope);
check(currentReport.historyReadOnly?.status === "HISTORY_READ_ONLY", "legacy-report-history-only", currentReport.historyReadOnly);
check(currentReport.workspaceSha256 === workspace.workspaceSha256, "canonical-report-workspace-binding", {report: currentReport.workspaceSha256, workspace: workspace.workspaceSha256});
check(currentReport.approval?.recommendedAssemblyRequiresApproval === !blockedTrial, "recommended-assembly-approval-only", currentReport.approval);
check(authority.productionState?.legacyCandidateCount === 25, "legacy-candidate-count-preserved", authority.productionState);
check(authority.productionState?.packagingLayerCandidateCount === (waitingLookMaster || presenterFirst || blockedTrial ? 0 : deterministicTrial ? currentActualLayerCount : 2), "packaging-layer-candidate-count-current", authority.productionState);
check(authority.productionState?.legacyCandidateCount === 25, "legacy-candidate-count-is-separate", authority.productionState);
check(waitingLookMaster
  ? authority.productionState?.actualLayerCandidateCount === 0 && authority.productionState?.trialCandidateCount === 0 && authority.productionState?.currentAssemblyArtifactCount === 0
  : presenterFirst
  ? authority.productionState?.actualLayerCandidateCount === 0
    && authority.productionState?.trialCandidateCount === 0
    && authority.productionState?.historicalPrePresenterFirstLayerCandidateCount === currentActualLayerCount
    && authority.productionState?.currentAssemblyArtifactCount === 1
    && authority.productionState?.currentReverseExtractedOverlayCount === 1
    && authority.productionState?.localLayerRecompositionPerformed === false
  : blockedTrial
  ? authority.productionState?.actualLayerCandidateCount === 0 && authority.productionState?.trialCandidateCount === 0
  : deterministicTrial
    ? authority.productionState?.actualLayerCandidateCount === currentActualLayerCount && authority.productionState?.trialCandidateCount === currentActualLayerCount && authority.productionState?.noneLayerRouteCount === currentNoneLayerCount
    : authority.productionState?.actualLayerCandidateCount === 2 && authority.productionState?.noneLayerRouteCount === 2, "actual-layer-trial-counts-current", authority.productionState);

const review = workspace.production.packagingReview;
check(review?.intermediateApprovalRequired === false, "no-intermediate-approval", review);
check(review?.requiresExplicitApproval === true, "recommended-assembly-approval-required", review);
check(review?.userApprovalStatus === (waitingLookMaster ? "USER_SCREENED_LOOK_MASTER_FINAL_CONFIRMATION_REQUIRED" : "RECOMMENDED_ASSEMBLY_CONFIRMATION_REQUIRED"), "approval-status-final-assembly-gate", review);
check(review?.finalReleaseApprovalRequired === true, "final-release-still-approved", review);
check(workspace.production.authority?.nextAction?.id === (blockedTrial ? "rebuild-ed10-four-layer-trial-after-ocr-block" : waitingLookMaster ? "review-user-screened-look-master-shortlist" : "review-recommended-package-assembly"), "next-action-assembly-review", workspace.production.authority?.nextAction);
check(workspace.production.authority?.nextAction?.requiresUser === (blockedTrial ? false : true), "next-action-assembly-review-requires-user", workspace.production.authority?.nextAction);
check(workspace.production.shotIntelligence?.status === (waitingLookMaster ? "LOOK_MASTER_REVIEW_REQUIRED" : "ASSEMBLY_REVIEW_REQUIRED"), "current-packaging-stage-assembly-review", workspace.production.shotIntelligence?.status);

const required = workspace.production.shotIntelligence?.researchPackets?.filter((packet) => packet.networkDecision === "REQUIRED") || [];
check(required.length === 2, "required-packet-count", required.map((packet) => packet.shotId));
check(required.every((packet) => packet.status === "RESEARCH_READY" && packet.sources.length > 0), "required-research-closed", required.map((packet) => ({shotId: packet.shotId, status: packet.status, sources: packet.sources.length})));
check(required.every((packet) => packet.sources.every((source) => source.usageClass !== "PRODUCTION_ALLOWED")), "research-not-production-promoted", required.map((packet) => packet.sources.map((source) => source.usageClass)));
check(workspace.gates.packagingDeliveryGates?.requiredResearchResolved === true, "required-research-gate-derived", workspace.gates.packagingDeliveryGates);

const recipes = workspace.production.shotIntelligence?.packageAssemblyRecipes || [];
check(recipes.length === workspace.production.packagingBeatPlan.packagingEventCount, "recipe-event-parity", {recipes: recipes.length, events: workspace.production.packagingBeatPlan.packagingEventCount});
check(recipes.every((recipe) => !String(recipe.recommendation?.reason || "").includes("先确认四层计划和来源用途")), "no-plan-approval-reason", recipes.map((recipe) => recipe.recommendation?.reason));
const ed10 = workspace.production.shotIntelligence?.packageLookMasterPlans?.find((plan) => plan.shotId === "ED-10");
check(ed10?.referenceBindingAudit?.status === "PASS", "reference-subset-audit-present", ed10?.referenceBindingAudit);
check(ed10?.referenceBindingAudit?.selectedSubsetCount === 3 && ed10?.referenceBindingAudit?.manifestSourceCount === 7, "reference-subset-count-explicit", ed10?.referenceBindingAudit);

if (failures.length) {
  console.error(JSON.stringify({status: "FAIL", failures}, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, requiredResearch: required.map((packet) => ({shotId: packet.shotId, status: packet.status, sourceCount: packet.sources.length})), candidateCounts: authority.productionState}, null, 2));
