#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {derivePackagingAttentionDecision} from "../apps/studio-next/src/lib/a1-active-packaging-policy-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {applyAutomaticSafeLookMasterSelection} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const plan = runtime?.packageLookMasterPlans?.find((item) => item.shotId === "ED-10");
  if (!runtime || !plan) throw new Error("current-packaging-look-master-plan-required");
  if (current.summary.queuedJobCount !== 0 || current.summary.runningJobCount !== 0) throw new Error("current-packaging-attention-policy-queue-must-be-idle");
  const attention = derivePackagingAttentionDecision(runtime, plan);
  if (attention.status !== "AUTO_CONTINUE" || attention.requiresUser || !attention.recommendedCandidateId) throw new Error(`current-packaging-attention-policy-not-safe:${attention.attentionKind || attention.status}`);
  const selected = applyAutomaticSafeLookMasterSelection(runtime, {shotId: plan.shotId, now});
  let next = structuredClone(current);
  next.production.shotIntelligence = selected.runtime;
  const selectedPlan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === plan.shotId);
  if (selectedPlan?.fastCandidateDiscovery) {
    selectedPlan.fastCandidateDiscovery.status = "FINAL_ASSEMBLY_REVIEW_REQUIRED";
    selectedPlan.fastCandidateDiscovery.recommendationStatus = "SAFE_RECOMMENDATION_AUTO_SELECTED";
    selectedPlan.fastCandidateDiscovery.recommendedCandidateId = attention.recommendedCandidateId;
    selectedPlan.fastCandidateDiscovery.recommendedDirectionId = attention.recommendedDirectionId || selectedPlan.activeCandidateSet?.selectedDirectionId || null;
  }
  if (selectedPlan?.userVisualScreening) selectedPlan.userVisualScreening.status = "USER_SCREENED_SHORTLIST_RESOLVED_BY_SAFE_AUTOMATION";
  if (selectedPlan?.activeCandidateSet?.userScreening) selectedPlan.activeCandidateSet.userScreening.status = "USER_SCREENED_SHORTLIST_RESOLVED_BY_SAFE_AUTOMATION";
  if (next.production.shotIntelligence.visualReplacement?.contract === "A1ED10LookMasterVisualReplacement/v1") {
    next.production.shotIntelligence.visualReplacement.status = "FINAL_ASSEMBLY_REVIEW_REQUIRED";
    next.production.shotIntelligence.visualReplacement.stopAtUserLookMasterReview = false;
    next.production.shotIntelligence.visualReplacement.stopAtFinalAssemblyReview = true;
    next.production.shotIntelligence.visualReplacement.safeRecommendationSelectedAt = now;
    next.production.shotIntelligence.visualReplacement.selectedCandidateId = attention.recommendedCandidateId;
    next.production.shotIntelligence.visualReplacement.selectedDirectionId = attention.recommendedDirectionId || selectedPlan?.activeCandidateSet?.selectedDirectionId || null;
    next.production.shotIntelligence.visualReplacement.layerReconstructionStarted = false;
    next.production.shotIntelligence.visualReplacement.noLayerReconstruction = true;
  }
  next.production.packagingReview.status = "ASSEMBLY_REVIEW_REQUIRED";
  next.production.packagingReview.intermediateApprovalRequired = false;
  next.production.packagingReview.requiresExplicitApproval = true;
  next.production.packagingReview.userApprovalStatus = "FINAL_ASSEMBLY_CONFIRMATION_REQUIRED";
  next.production.packagingReview.currentShotId = plan.shotId;
  next.production.packagingReview.nextAction = "review-recommended-package-assembly";
  next.production.packagingReview.updatedAt = now;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  const event = createProductionEvent({
    workspace: current,
    action: "safe-look-master-auto-selected-for-final-assembly-review",
    targetId: plan.shotId,
    payload: {
      candidateId: attention.recommendedCandidateId,
      directionId: attention.recommendedDirectionId || selectedPlan?.activeCandidateSet?.selectedDirectionId || null,
      selectionReason: attention.reason,
      generationPerformed: false,
      layerReconstructionStarted: false,
      criticPerformed: false,
      motionStarted: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, next, {event});
  return {workspace: next, attention, review: selected.review, event};
});

const runtime = result.workspace.production.shotIntelligence;
const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const currentRecipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10" && item.status !== "HISTORY_READ_ONLY" && item.current !== false);
console.log(JSON.stringify({
  status: "SAFE_LOOK_MASTER_AUTO_SELECTED_FOR_FINAL_ASSEMBLY_REVIEW",
  shotId: "ED-10",
  selectedCandidateId: plan.activeCandidateSet?.selectedCandidateId || plan.selectedLookMasterId,
  selectedDirectionId: plan.activeCandidateSet?.selectedDirectionId || plan.selectedLookMasterBinding?.directionId,
  assemblySha256: currentRecipe?.assemblyComposite?.sha256 || null,
  assemblyStatus: currentRecipe?.status || null,
  oldRecipeHistoryCount: runtime.packageAssemblyRecipes.filter((item) => item.shotId === "ED-10" && item.status === "HISTORY_READ_ONLY").length,
  layerCandidateCount: runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10")?.layers.reduce((sum, layer) => sum + (layer.candidates?.length || 0), 0) || 0,
  queue: {queued: result.workspace.summary.queuedJobCount, running: result.workspace.summary.runningJobCount, workerStatus: result.workspace.production.generation.workerStatus},
  generationPerformed: false,
}, null, 2));
