#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {compileWholeFilmExplorationOutputDeduplication} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = "5d7146e2f08920a25861b2d5aa110435066e9a54dbb5a4bfc43ce6eac3c94cb6";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.summary.queuedJobCount !== 0 || current.summary.runningJobCount !== 0) throw new Error("static-board-integrity-repair-requires-idle-queue");
  if (current.production.shotIntelligence.currentAssembly?.length) throw new Error("static-board-integrity-repair-must-not-touch-assembly");

  const staged = structuredClone(current);
  const runtime = staged.production.shotIntelligence;
  const currentPackageShotIds = new Set(
    staged.production.shotVisualCoveragePlan.shotPlans
      .filter((shot) => shot.route === "PACKAGE_LOOK_MASTER")
      .map((shot) => shot.shotId),
  );
  const removedPlans = runtime.packageLookMasterPlans.filter((plan) => !currentPackageShotIds.has(plan.shotId));
  runtime.packageLookMasterPlanHistory = [
    ...(runtime.packageLookMasterPlanHistory || []),
    ...removedPlans.map((plan) => ({...plan, status: "HISTORY_READ_ONLY", current: false, authorityScope: "HISTORY_READ_ONLY"})),
  ];
  runtime.packageLookMasterPlans = runtime.packageLookMasterPlans.filter((plan) => currentPackageShotIds.has(plan.shotId));
  const videoContextSet = runtime.videoPackagingContexts;
  if (videoContextSet?.contract === "A1VideoPackagingContextSet/v1") {
    runtime.videoPackagingContextHistory = [
      ...(runtime.videoPackagingContextHistory || []),
      ...videoContextSet.items.filter((item) => !currentPackageShotIds.has(item.shotId)),
    ];
    runtime.videoPackagingContexts = {
      ...videoContextSet,
      items: videoContextSet.items.filter((item) => currentPackageShotIds.has(item.shotId)),
      summary: {...videoContextSet.summary, contextCount: currentPackageShotIds.size},
    };
  }
  const outputDeduplication = compileWholeFilmExplorationOutputDeduplication(staged, {
    shotIds: runtime.packageLookMasterPlans.map((plan) => plan.shotId),
  });
  for (const duplicate of outputDeduplication.duplicates) {
    const job = staged.production.generation.jobs.find((item) => item.id === duplicate.jobId);
    if (job) {
      job.outputDuplicate = duplicate;
      job.selectionEligible = false;
      job.reviewStatus = duplicate.scope === "SAME_SHOT" ? "OUTPUT_DUPLICATE_HISTORY_ONLY" : "OUTPUT_DUPLICATE_CROSS_SHOT_ANOMALY";
    }
  }
  const recommendation = runtime.wholeFilmBatchRecommendation || {};
  recommendation.outputDeduplication = {
    contract: outputDeduplication.contract,
    actualJobCount: outputDeduplication.actualJobCount,
    actualUniqueCandidateCount: outputDeduplication.actualUniqueCandidateCount,
    duplicateCandidateCount: outputDeduplication.duplicateCandidateCount,
    duplicates: outputDeduplication.duplicates,
    shortageByShot: outputDeduplication.byShot
      .filter((item) => item.uniqueCandidates.length < item.requiredCandidateCount)
      .map((item) => ({
        shotId: item.shotId,
        actualUniqueCandidateCount: item.uniqueCandidates.length,
        requiredCandidateCount: item.requiredCandidateCount,
        duplicateCandidateCount: item.duplicates.length,
      })),
  };
  runtime.wholeFilmBatchRecommendation = recommendation;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(staged, now));
  const event = createProductionEvent({
    workspace: current,
    action: "whole-film-static-board-integrity-repaired",
    targetId: recalculated.workspaceSha256,
    payload: {
      contract: "A1WholeFilmStaticBoardIntegrityRepair/v1",
      alignedDecisionSetToCoverage: true,
      currentPlanBoundJobCount: outputDeduplication.actualJobCount,
      actualUniqueCandidateCount: outputDeduplication.actualUniqueCandidateCount,
      duplicateCandidateCount: outputDeduplication.duplicateCandidateCount,
      duplicateScopes: [...new Set(outputDeduplication.duplicates.map((item) => item.scope))],
      selectionPersisted: false,
      assemblyCreated: false,
      layerReconstructionStarted: false,
      singleWriterTaskId,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {
    contract: "A1WholeFilmStaticBoardIntegrityRepairReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    currentPlanBoundJobCount: outputDeduplication.actualJobCount,
    actualUniqueCandidateCount: outputDeduplication.actualUniqueCandidateCount,
    duplicateCandidateCount: outputDeduplication.duplicateCandidateCount,
    duplicates: outputDeduplication.duplicates,
    alignedNoPackageShotIds: recalculated.production.shotVisualCoveragePlan.shotPlans.filter((shot) => shot.packageDecision === "NO_PACKAGE").map((shot) => shot.shotId),
    selected: recalculated.production.shotIntelligence.currentAssembly || [],
    queue: recalculated.production.generation.summary,
    singleWriterTaskId,
    generatedAt: now,
  };
  persistProjectState(appRoot, recalculated, {event, files: {"whole-film-static-board-integrity-repair-v1/report.json": report}});
  return report;
});

console.log(JSON.stringify(result, null, 2));
