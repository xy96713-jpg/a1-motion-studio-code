#!/usr/bin/env node
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = `${process.cwd()}/apps/studio-next`;
const now = new Date().toISOString();
withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const lookPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kitPlan = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const attempt = {
    contract: "A1Ed10BatchRankedAttempt/v1",
    status: "SUPERSEDED_BEFORE_FORMAL_EXECUTION",
    capturedAt: now,
    comparativeReview: lookPlan?.comparativeReview || null,
    board: lookPlan?.comparativeReviewBoard || null,
    selectedLookMasterBinding: lookPlan?.selectedLookMasterBinding || null,
    finalAssemblyReview: runtime.finalAssemblyReview || null,
    reason: "执行前审计发现 one-off controller、层级假 PASS 与固定四槽路由；产物保留为历史证据，不作为当前 authority。",
  };
  lookPlan.historicalBatchRankedAttempts = [...(lookPlan.historicalBatchRankedAttempts || []), attempt];
  for (const key of ["fastCandidateDiscovery", "explorationCandidates", "comparativeReviewBoard", "comparativeReview", "batchRanked"]) delete lookPlan[key];
  lookPlan.recommendation = null;
  lookPlan.selectedLookMasterId = null;
  lookPlan.selectedLookMasterBinding = null;
  lookPlan.status = "CANDIDATES_PARTIAL";
  kitPlan.historicalReconstructionAttempts = [...(kitPlan.historicalReconstructionAttempts || []), {attemptContract: attempt.contract, capturedAt: now, status: attempt.status, selectedDirectionId: attempt.selectedLookMasterBinding?.directionId || null}];
  kitPlan.selectedLookMasterBinding = null;
  kitPlan.status = "WAITING_FOR_LOOK_MASTER";
  for (const layer of kitPlan.layers) { layer.candidates = []; layer.selectedCandidateId = null; layer.status = layer.route === "NONE" ? "NONE" : layer.route === "REUSE" ? "REUSE_CANDIDATE_REQUIRED" : "GENERATION_PLAN_ONLY"; }
  runtime.packageAssemblyRecipes = runtime.packageAssemblyRecipes.filter((item) => item.shotId !== "ED-10");
  runtime.status = "LOOK_MASTER_CANDIDATES_READY";
  runtime.finalAssemblyReview = null;
  runtime.batchRanked = null;
  next.production.shotIntelligence = runtime;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, next, {event: createProductionEvent({workspace: next, action: "supersede-invalid-ed10-batch-ranked-attempt", targetId: "ED-10", payload: {attemptContract: attempt.contract}})});
  console.log(JSON.stringify({status: "RESTORED_SAFE_AUTHORITY", workspaceSha256: next.workspaceSha256, runtimeStatus: runtime.status, preservedAttempt: attempt.contract}, null, 2));
});
