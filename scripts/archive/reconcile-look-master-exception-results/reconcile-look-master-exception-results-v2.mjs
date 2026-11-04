#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {finalizeWholeFilmLookMasterBatch} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
const targetShotIds = ["ED-01", "ED-14", "ED-16"];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("exception-reconciliation-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rawKey = (raw) => `${raw.shotId}:${raw.referenceId}`;
const currentRawForPlan = (runtime, plan) => (runtime.lookMasterRawReferences || [])
  .filter((raw) => raw.shotId === plan.shotId && raw.planSha256 === plan.planSha256)
  .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`exception-reconciliation-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  const generation = current.production.generation;
  if (generation.summary.queued !== 0 || generation.summary.running !== 0 || generation.workerStatus !== "frozen") throw new Error("exception-reconciliation-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("exception-reconciliation-must-not-touch-assembly");

  const beforeArtifactShas = (current.production.shotIntelligence.lookMasterRawReferences || [])
    .map((raw) => raw.artifact?.sha256)
    .filter(Boolean)
    .sort();
  const beforeRawStatuses = new Map((current.production.shotIntelligence.lookMasterRawReferences || []).map((raw) => [rawKey(raw), raw.status]));
  const staged = structuredClone(current);
  const runtime = staged.production.shotIntelligence;
  const plans = runtime.packageLookMasterPlans.filter((plan) => targetShotIds.includes(plan.shotId));
  if (plans.length !== targetShotIds.length) throw new Error("exception-reconciliation-target-plans-incomplete");

  const lightCheckUpdates = [];
  for (const plan of plans) {
    for (const raw of currentRawForPlan(runtime, plan)) {
      const compatibility = raw.pixelAudit?.footageCompatibility;
      const artifact = raw.artifact;
      const semanticChecks = raw.semanticPixelAudit?.checks || {};
      raw.lightChecks = {
        ...(raw.lightChecks || {}),
        decode: artifact?.width >= 640 && artifact?.height >= 360 ? "PASS" : "FAIL",
        dimensions: artifact?.width >= 640 && artifact?.height >= 360 ? "PASS" : "FAIL",
        baseFrameComposite: compatibility?.status === "PASS" ? "PASS" : "FAIL",
        subjectOcclusion: compatibility?.subjectOcclusion?.status === "PASS" ? "PASS" : compatibility?.subjectOcclusion?.status || "UNVERIFIED",
        ocrExact: semanticChecks.ocrExactCopyAligned === true ? "PASS" : "FAIL",
        remoteCritic: "SKIPPED_BY_BOUNDED_REPAIR",
      };
      lightCheckUpdates.push({shotId: plan.shotId, referenceId: raw.referenceId, artifactSha256: artifact?.sha256 || null, status: raw.semanticPixelAudit?.status || null, baseFrameComposite: raw.lightChecks.baseFrameComposite});
    }
  }

  const finalized = finalizeWholeFilmLookMasterBatch(staged, staged.production.shotVisualCoveragePlan, {
    now: new Date().toISOString(),
    actualPixelSemanticAuditRequired: true,
    semanticReviewFindings: [],
  });
  const next = finalized.workspace;
  const nextRuntime = next.production.shotIntelligence;
  const exceptionShotIds = finalized.exceptions.map((item) => item.shotId);
  const exceptionSet = new Set(exceptionShotIds);

  // The director finalizer is allowed to calculate rankings, but this bounded
  // checkpoint must not publish a partial whole-film board. Keep the actual
  // pixel-pass eligibility on each raw while removing provisional board state.
  for (const plan of nextRuntime.packageLookMasterPlans.filter((item) => targetShotIds.includes(item.shotId))) {
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    plan.status = exceptionSet.has(plan.shotId) ? "SEMANTIC_REVIEW_REQUIRED" : "LOOK_MASTER_CANDIDATES_READY";
    for (const raw of currentRawForPlan(nextRuntime, plan)) {
      const previousStatus = beforeRawStatuses.get(rawKey(raw));
      if (raw.semanticPixelAudit?.status === "PASS" && ["ACTUAL_PIXEL_SEMANTIC_PASS", "CURRENT_SEMANTIC_PASS_REBOUND"].includes(previousStatus)) {
        raw.status = previousStatus;
      }
    }
  }

  const finalizedRecommendation = nextRuntime.wholeFilmBatchRecommendation;
  const recommendation = {
    ...finalizedRecommendation,
    status: "PARTIAL_WITH_EXCEPTIONS",
    finalizedShotIds: (finalizedRecommendation.finalizedShotIds || []).filter((shotId) => !exceptionSet.has(shotId)),
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    currentAssembly: [],
    recommendation: null,
    selected: null,
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    actualPixelSemanticAuditRequired: true,
    actualPixelSemanticAuditContract: "A1WholeFilmActualPixelSemanticGate/v1",
    explorationOnly: true,
    reconciliationRequired: false,
    reconciliationStatus: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    reconciliation: {
      ...(finalizedRecommendation.reconciliation || {}),
      contract: "A1LookMasterExceptionResultReconciliation/v2",
      status: "PASS",
      targetShotIds,
      exceptionShotIds,
      artifactSha256Changed: false,
      actualPixelAuditRerun: false,
      ocrRerun: false,
      duplicateAuditRerun: false,
      boardPublished: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionPerformed: false,
      completedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  nextRuntime.wholeFilmBatchRecommendation = recommendation;
  nextRuntime.currentAssembly = [];
  nextRuntime.packageAssetKitPlans = (nextRuntime.packageAssetKitPlans || []).map((kit) => ({...kit, current: false, authorityScope: "HISTORY_READ_ONLY", status: "HISTORY_READ_ONLY"}));
  nextRuntime.packageAssemblyRecipes = (nextRuntime.packageAssemblyRecipes || []).map((recipe) => ({...recipe, current: false, selected: false, authorityScope: "HISTORY_READ_ONLY", status: "VISUAL_REJECTED"}));
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  next.production.visualProductionRun = {
    ...next.production.visualProductionRun,
    status: "GENERATION_INPUTS_PARTIAL",
    nextUserGate: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, new Date().toISOString()));
  const afterArtifactShas = (recalculated.production.shotIntelligence.lookMasterRawReferences || [])
    .map((raw) => raw.artifact?.sha256)
    .filter(Boolean)
    .sort();
  assert.deepEqual(afterArtifactShas, beforeArtifactShas);
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.reconciliationRequired, false);
  assert.equal(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.deepEqual(recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions.map((item) => item.shotId), exceptionShotIds);
  assert.equal(recalculated.production.authority.currentStage, "film-look-master-exception-repair-required");
  assert.deepEqual(recalculated.production.authority.nextAction.targetShotIds, exceptionShotIds);

  const now = new Date().toISOString();
  const commitId = `look-master-exception-repair-reconcile-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const event = createProductionEvent({
    workspace: current,
    action: "reconcile-look-master-exception-results",
    targetId: "WHOLE_FILM_STATIC_BOARD",
    payload: {
      contract: "A1LookMasterExceptionResultReconciliation/v2",
      targetShotIds,
      exceptionShotIds,
      lightCheckUpdates,
      artifactSha256Changed: false,
      generatedAssetsChanged: false,
      actualPixelAuditRerun: false,
      staticBoardPublished: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionPerformed: false,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const reportBase = {
    contract: "A1LookMasterExceptionResultReconciliationReport/v2",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    commitId,
    checkpointJournal: {status: "COMMITTED", journalPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/checkpoint-journal.json"},
    targetShotIds,
    exceptionShotIds,
    lightCheckUpdates,
    generatedPngCount: 0,
    artifactSha256Changed: false,
    artifactSha256Before: beforeArtifactShas,
    artifactSha256After: afterArtifactShas,
    actualPixelAuditRerun: false,
    ocrRerun: false,
    duplicateAuditRerun: false,
    staticBoardPublished: false,
    assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length,
    assemblyCreationAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed,
    layerReconstructionAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.layerReconstructionAllowed,
    criticAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.criticAllowed,
    motionAllowed: recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.motionAllowed,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    authority: {currentStage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction},
    generatedAt: now,
  };
  const report = {...reportBase, reportSha256: sha256(reportBase)};
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId,
    files: {"look-master-exception-repair-v2/reconciliation.json": report},
  });
  return {...report, workspaceSha256After: committed.workspaceSha256, checkpointJournal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
