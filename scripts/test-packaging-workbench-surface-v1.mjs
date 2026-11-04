#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const coverage = workspace.production.shotVisualCoveragePlan;
const run = workspace.production.visualProductionRun;
const lifecycle = derivePackagingLifecycleProjection(workspace);
const runtime = workspace.production.shotIntelligence;
const currentShotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
const ed10Kit = runtime.packageAssetKitPlans.find((plan) => plan.shotId === "ED-10");
const semanticReviewRequired = runtime.wholeFilmBatchRecommendation?.status === "SEMANTIC_REVIEW_REQUIRED";
const staticBoardExceptions = runtime.wholeFilmBatchRecommendation?.exceptions?.length || 0;
const reconciliationRequired = runtime.wholeFilmBatchRecommendation?.reconciliationRequired === true;
const semanticTimelineReconciled = runtime.wholeFilmBatchRecommendation?.reconciliationStatus === "SEMANTIC_TIMELINE_RECONCILED";
const exceptionRepairRequired = runtime.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
  && runtime.wholeFilmBatchRecommendation?.reconciliationRequired !== true
  && runtime.wholeFilmBatchRecommendation?.nextUserGate === "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED"
  && (runtime.wholeFilmBatchRecommendation?.exceptions || []).some((item) => item.shotId);
const semanticPilotReviewRequired = runtime.status === "SEMANTIC_PILOT_REVIEW_REQUIRED";
const candidateSelectionPending = run?.status === "CANDIDATE_SELECTION_PENDING";
const generationInputsPartial = run?.status === "GENERATION_INPUTS_PARTIAL";
const maturityAuthority = workspace.production.goldenFilmVisualSystemMaturity;
const maturityCurrent = maturityAuthority?.current === true && maturityAuthority?.status && maturityAuthority?.nextAction;
const deliveryArchitectureCurrent = workspace.production.packagingContractArchitectureAudit?.status === "PASS";
const packageExportAuthorizationCurrent = workspace.production.authority?.currentStage === "package-export-authorization";
const visualRepairRequired = workspace.production.authority?.currentStage === "visual-repair-required";
const surfaceSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");

assert.equal(workspace.production.filmArtDirection?.contract, "A1FilmArtDirection/v1");
assert.equal(coverage?.contract, "A1ShotVisualCoveragePlan/v1");
assert.equal(run?.contract, "A1VisualProductionRun/v1");
assert.equal(coverage?.counts?.shotCount, currentShotCount);
assert.equal(coverage?.shotPlans.length, currentShotCount);
assert.equal(run?.tasks.length, currentShotCount);
assert.equal(run?.userApprovalPolicy?.perShotApprovalRequired, false);
assert.equal(run?.userApprovalPolicy?.wholeFilmStaticBoardApprovalRequired, true);
assert.equal(ed10Kit?.layers?.reduce((count, layer) => count + (layer.candidates?.length || 0), 0) || 0, 0);
assert.equal(workspace.summary.queuedJobCount, 0);
assert.equal(workspace.summary.runningJobCount, 0);
assert.equal(runtime.generation?.workerStatus || workspace.production.generation.workerStatus, "frozen");
const staticBoardReviewRequired = run?.status === "WHOLE_FILM_STATIC_BOARD_READY";
const authorityExpectation = (() => {
  if (lifecycle.status === "WHOLE_FILM_STATIC_BOARD_READY") return {stage: "whole-film-static-board-review", nextAction: "review-whole-film-static-board", requiresUser: true};
  if (visualRepairRequired) return {stage: "visual-repair-required", nextAction: workspace.production.packagingLifecycleProjection?.nextActionId, requiresUser: workspace.production.packagingLifecycleProjection?.requiresExplicitApproval === true};
  if (packageExportAuthorizationCurrent) return {stage: "package-export-authorization", nextAction: "AUTHORIZE_PACKAGE_EXPORT", requiresUser: true};
  if (deliveryArchitectureCurrent) return {stage: "package-static-asset-proof-authorization", nextAction: "AUTHORIZE_PACKAGE_STATIC_REVIEW", requiresUser: true};
  if (maturityCurrent) return {stage: maturityAuthority.status, nextAction: maturityAuthority.nextAction, requiresUser: maturityAuthority.nextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD"};
  if (semanticPilotReviewRequired) return {stage: "semantic-pilot-review-required", nextAction: "semantic-pilot-review-required", requiresUser: true};
  if (reconciliationRequired) return {stage: "film-look-master-semantic-reconciliation-required", nextAction: "reconcile-current-look-master-bindings", requiresUser: false};
  if (exceptionRepairRequired) return {stage: "film-look-master-exception-repair-required", nextAction: "repair-look-master-exceptions", requiresUser: false};
  if (semanticReviewRequired) return {stage: "film-look-master-semantic-review-required", nextAction: "review-whole-film-look-master-semantics", requiresUser: true};
  if (candidateSelectionPending) return {stage: "film-look-master-auto-selection", nextAction: "rank-whole-film-look-master-candidates", requiresUser: false};
  if (staticBoardReviewRequired) return {stage: "whole-film-static-board-review", nextAction: "review-whole-film-static-board", requiresUser: true};
  if (generationInputsPartial) return {stage: "film-generation-inputs-partial", nextAction: "prepare-whole-film-generation-inputs", requiresUser: false};
  return {stage: "film-generation-executable", nextAction: "queue-whole-film-look-master-generation", requiresUser: false};
})();
assert.equal(workspace.production.authority?.currentStage, authorityExpectation.stage);
assert.equal(workspace.production.authority?.nextAction?.id, authorityExpectation.nextAction);
assert.equal(workspace.production.authority?.nextAction?.requiresUser, authorityExpectation.requiresUser);
assert.equal(workspace.gates?.packagingDeliveryGates?.requiredResearchResolved, true);
if (semanticPilotReviewRequired) {
  assert.deepEqual(runtime.semanticPilot.targetShotIds, ["ED-12", "ED-17", "ED-09"]);
  assert.equal(runtime.semanticPilot.candidates.length, 3);
  assert.equal(runtime.semanticPilot.recommendation, null);
  assert.equal(runtime.semanticPilot.selected, null);
  assert.deepEqual(runtime.semanticPilot.currentAssembly, []);
} else if (reconciliationRequired) {
  assert.equal(runtime.wholeFilmBatchRecommendation.status, "PARTIAL_WITH_EXCEPTIONS");
  assert.equal(runtime.wholeFilmBatchRecommendation.nextUserGate, null);
  assert.equal(runtime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(runtime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
  assert.deepEqual(runtime.wholeFilmBatchRecommendation.currentAssembly || [], []);
  assert.ok(runtime.wholeFilmBatchRecommendation.reconciliation?.status === "PASS");
  assert.equal(runtime.wholeFilmBatchRecommendation.rebindRecords.length, 12);
  assert.ok(runtime.wholeFilmBatchRecommendation.exceptions.every((item) => item.shotId !== "ED-12"));
} else if (semanticReviewRequired) {
  assert.equal(runtime.wholeFilmBatchRecommendation.outputDeduplication.actualUniqueCandidateCount, 23);
  assert.equal(runtime.wholeFilmBatchRecommendation.outputDeduplication.duplicateCandidateCount, 3);
  assert.equal(runtime.packageLookMasterPlans.filter((plan) => plan.provisionalWholeFilmBoardSelection).length, 0);
} else if (exceptionRepairRequired) {
  assert.equal(runtime.wholeFilmBatchRecommendation.status, "PARTIAL_WITH_EXCEPTIONS");
  assert.equal(runtime.wholeFilmBatchRecommendation.nextUserGate, "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED");
  assert.equal(runtime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(runtime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
  assert.deepEqual(
    [...new Set(runtime.wholeFilmBatchRecommendation.exceptions.map((item) => item.shotId).filter(Boolean))].sort(),
    ["ED-13", "ED-31", "ED-32"],
  );
  assert.deepEqual(runtime.wholeFilmBatchRecommendation.currentAssembly || [], []);
} else if (candidateSelectionPending) {
  assert.equal(runtime.wholeFilmBatchRecommendation.status, "PARTIAL_WITH_EXCEPTIONS");
  assert.equal(runtime.wholeFilmBatchRecommendation.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(runtime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(runtime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
  if (semanticTimelineReconciled) {
    assert.equal(runtime.decisionSet.summary.packageCount, 12);
    assert.equal(runtime.decisionSet.items.find((item) => item.shotId === "ED-01")?.packageDecision, "NO_PACKAGE");
    assert.equal(coverage.shotPlans.find((item) => item.shotId === "ED-01")?.route, "PRESENTER_BASE");
    assert.equal((runtime.wholeFilmBatchRecommendation.exceptions || []).some((item) => item.shotId === "ED-01"), false);
  } else {
    assert.ok((runtime.wholeFilmBatchRecommendation.exceptions || []).length > 0);
  }
  assert.deepEqual(runtime.wholeFilmBatchRecommendation.currentAssembly || [], []);
  const blockedRequiredResearchShotIds = new Set((workspace.production.wholeFilmGenerationReadiness?.items || [])
    .filter((item) => item.missingInputs?.includes("REQUIRED_RESEARCH"))
    .map((item) => item.shotId));
  for (const shotId of blockedRequiredResearchShotIds) {
    assert.ok((runtime.wholeFilmBatchRecommendation.exceptions || []).some((item) => item.shotId === shotId && item.code === "REQUIRED_RESEARCH_SOURCE_PACKET_BLOCKED"));
  }
} else if (generationInputsPartial) {
  assert.equal(runtime.wholeFilmBatchRecommendation.status, "PARTIAL_WITH_EXCEPTIONS");
  assert.equal(runtime.wholeFilmBatchRecommendation.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(runtime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(runtime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
  assert.ok((runtime.wholeFilmBatchRecommendation.exceptions || []).some((item) => item.code === "REQUIRED_RESEARCH_SOURCE_PACKET_BLOCKED"));
} else if (staticBoardReviewRequired) {
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.deepEqual(lifecycle.blockedShotIds, []);
  assert.equal(lifecycle.approvalAllowed, true);
  assert.equal(lifecycle.reviewActionDisabled, false);
  assert.ok(staticBoardExceptions >= 0);
}

assert.match(surfaceSource, /data-a1-whole-film-direction="true"/u);
assert.match(surfaceSource, /data-a1-layout-target="desktop-only"/u);
assert.match(surfaceSource, /data-a1-min-viewport-width="1180"/u);
assert.doesNotMatch(surfaceSource, /data-a1-layout-target="mobile"/u);
assert.match(surfaceSource, /approve-whole-film-static-board/u);
assert.match(surfaceSource, /data-a1-whole-film-static-board-review="true"/u);
assert.match(surfaceSource, /全片静态板已就绪，等待统一确认/u);
assert.match(surfaceSource, /workspace\.production\.packagingLifecycleProjection/u);
assert.match(surfaceSource, /packagingLifecycle\?\.status === "WHOLE_FILM_STATIC_BOARD_READY"/u);
assert.match(surfaceSource, /FULL LOOK MASTER ACTUAL PIXEL PASS/u);
assert.match(surfaceSource, /USER_VISUAL_APPROVED=false/u);
assert.match(surfaceSource, /wholeFilmStaticBoard\.timelineBoard/u);
assert.match(surfaceSource, /bindingManifest\.blockedShotIds\.length === 0/u);
assert.match(surfaceSource, /确认全片静态板，批准进入拆层/u);
assert.match(surfaceSource, /路线板可审查，但当前门禁尚未通过/u);
assert.match(surfaceSource, /packagingLifecycle\.approvalAllowed === true/u);
assert.match(surfaceSource, /packagingLifecycle\.reviewActionDisabled !== true/u);
assert.match(clientSource, /approve-whole-film-static-board/u);
assert.match(clientSource, /expectedWorkspaceSha256: workspace\.workspaceSha256/u);
assert.match(clientSource, /expectedBoardSha256: staticBoard\?\.sha256/u);
assert.match(clientSource, /expectedBoardItemSeedSha256: staticBoard\?\.itemSeedSha256/u);
assert.match(clientSource, /PackagingWorkbenchSurface/u);

console.log(JSON.stringify({
  status: "PASS",
  surface: "ARTICLE_DRIVEN_FILM_VISUAL_WORKBENCH",
  articleDrivenShotCount: currentShotCount,
  actualVisualReadyCount: coverage.counts.actualVisualReadyCount,
  packageCount: coverage.counts.lookMasterRequiredCount,
  perShotApproval: false,
  nextUserGate: lifecycle.status === "WHOLE_FILM_STATIC_BOARD_READY"
    ? "WHOLE_FILM_STATIC_BOARD"
    : visualRepairRequired
    ? "OBJECTIVE_VISUAL_REVIEW"
    : packageExportAuthorizationCurrent
    ? "PACKAGE_EXPORT_AUTHORIZATION"
    : deliveryArchitectureCurrent
    ? "PACKAGE_STATIC_REVIEW_AUTHORIZATION"
    : semanticPilotReviewRequired
    ? "SEMANTIC_PILOT_REVIEW"
    : reconciliationRequired
      ? null
      : semanticReviewRequired
        ? "SEMANTIC_PLAN_REVIEW"
        : runtime.wholeFilmBatchRecommendation?.nextUserGate || null,
  layerCandidates: 0,
  queue: 0,
  worker: "frozen",
}, null, 2));
