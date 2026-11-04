#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  assertFilmArtDirection,
  assertShotVisualCoveragePlan,
  assertVisualProductionRun,
  assertWholeFilmPackagingDirection,
  compileWholeFilmPackagingDirection,
  compileWholeFilmVisualArchitecture,
} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const architecture = compileWholeFilmVisualArchitecture(current, {now});
  const artDirection = assertFilmArtDirection(architecture.artDirection);
  const coveragePlan = assertShotVisualCoveragePlan(architecture.coveragePlan);
  const productionRun = assertVisualProductionRun(architecture.productionRun);
  const direction = assertWholeFilmPackagingDirection(compileWholeFilmPackagingDirection(current, {now, singleWriterTaskId, architecture}));
  const next = structuredClone(current);
  next.production.filmArtDirection = artDirection;
  next.production.shotVisualCoveragePlan = coveragePlan;
  next.production.wholeFilmGenerationReadiness = architecture.generationReadiness;
  next.production.visualProductionRun = productionRun;
  next.production.wholeFilmPackagingDirection = direction;
  if (next.production.packagingBeatPlan) {
    next.production.packagingBeatPlan = {
      ...next.production.packagingBeatPlan,
      authorityScope: "HISTORY_READ_ONLY",
      advisoryOnly: true,
      current: false,
      supersededBy: coveragePlan.contract,
      supersededReason: "whole-film-coverage-is-compiled-from-each-current-article-not-a-fixed-packaging-event-list",
    };
  }
  if (next.production.packagingReview) {
    next.production.packagingReview = {
      ...next.production.packagingReview,
      authorityScope: "SHOT_LOCAL_HISTORY",
      advisoryOnly: true,
      current: false,
      supersededBy: coveragePlan.contract,
      supersededReason: "single-shot-assembly-review-cannot-block-whole-film-visual-coverage",
      legacyStatus: next.production.packagingReview.status,
      legacyStatusReadOnly: true,
      requiresExplicitApproval: false,
      userApprovalStatus: "DEFERRED_TO_WHOLE_FILM_STATIC_ASSEMBLY",
      currentShotId: null,
      nextAction: "film-visual-production-ready",
      attention: next.production.packagingReview.attention
        ? {...next.production.packagingReview.attention, status: "DEFERRED_TO_WHOLE_FILM_STATIC_ASSEMBLY", requiresUser: false, attentionKind: "WHOLE_FILM_STATIC_ASSEMBLY"}
        : null,
      updatedAt: now,
    };
  }
  if (next.production.packagingAutomation) {
    next.production.packagingAutomation = {
      ...next.production.packagingAutomation,
      scope: "whole-film-dynamic-current",
      status: productionRun.status,
      reason: productionRun.status === "GENERATION_EXECUTABLE"
        ? "all-current-package-shots-have-real-generation-inputs"
        : productionRun.status === "GENERATION_INPUTS_PARTIAL"
          ? "some-current-package-shots-still-need-generation-inputs"
        : "film-visual-production-state-derived-from-task-run",
      currentStage: "film-visual-production",
      updatedAt: now,
    };
  }
  const event = createProductionEvent({
    workspace: current,
    action: "film-visual-architecture-compiled",
    targetId: productionRun.sha256,
    payload: {
      artDirectionContract: artDirection.contract,
      artDirectionSha256: artDirection.sha256,
      coveragePlanContract: coveragePlan.contract,
      coveragePlanSha256: coveragePlan.sha256,
      productionRunContract: productionRun.contract,
      productionRunSha256: productionRun.sha256,
      directionContract: direction.contract,
      directionSha256: direction.sha256,
      shotCount: direction.counts.shotCount,
      lookMasterRequiredCount: direction.counts.lookMasterRequiredCount,
      pendingLookMasterCount: direction.counts.pendingLookMasterCount,
      productionReadyCount: productionRun.counts.readyCount,
      perShotUserApprovalRequired: false,
      nextUserGate: "WHOLE_FILM_STATIC_ASSEMBLY",
      imageGenerationPerformed: false,
      criticPerformed: false,
      layerReconstructionPerformed: false,
      motionPerformed: false,
      singleWriterTaskId,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const report = {
    contract: "A1FilmVisualArchitectureMigration/v1",
    status: "PASS",
    artDirectionSha256: artDirection.sha256,
    coveragePlanSha256: coveragePlan.sha256,
    productionRunSha256: productionRun.sha256,
    directionSha256: direction.sha256,
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    counts: direction.counts,
    reviewPolicy: direction.reviewPolicy,
    currentScope: direction.currentScope,
    nextAction: recalculated.production.authority?.nextAction || null,
    singleWriterTaskId,
    appliedAt: now,
  };
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "film-art-direction-v1.json": artDirection,
      "shot-visual-coverage-plan-v1.json": coveragePlan,
      "visual-production-run-v1.json": productionRun,
      "whole-film-packaging-direction-v1.json": direction,
      "whole-film-packaging-direction-v1/report.json": report,
    },
  });
  return {artDirection, coveragePlan, productionRun, direction, report, workspace: recalculated};
});

console.log(JSON.stringify({
  status: result.report.status,
  contracts: [result.artDirection.contract, result.coveragePlan.contract, result.productionRun.contract],
  artDirectionSha256: result.artDirection.sha256,
  coveragePlanSha256: result.coveragePlan.sha256,
  productionRunSha256: result.productionRun.sha256,
  directionSha256: result.direction.sha256,
  workspaceSha256: result.workspace.workspaceSha256,
  counts: result.direction.counts,
  currentStage: result.workspace.production.authority?.currentStage,
  nextAction: result.workspace.production.authority?.nextAction,
  queue: result.workspace.production.generation.summary,
  worker: result.workspace.production.generation.workerStatus,
  singleWriterTaskId,
}, null, 2));
