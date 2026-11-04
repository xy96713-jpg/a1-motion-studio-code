#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha = process.env.A1_ED10_EXPECTED_WORKSPACE_SHA || "ec9156cd7146c08a20c1c21420f4267b4c18f5ed7c2ccc56d4adab759c6167aa";
const now = process.env.A1_ED10_RESTORE_AT || new Date().toISOString();
const reason = "unauthorized-presenter-first-reentry-after-look-master-stop";

const historyRecord = (value, extra = {}) => value == null ? null : {
  ...structuredClone(value),
  ...extra,
  status: "HISTORY_READ_ONLY",
  current: false,
  historyReadOnly: true,
  advisoryOnly: true,
  supersededReason: reason,
  supersededAt: now,
};

function repeatedPresenterFirstEvents() {
  const file = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/events.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\n/u)
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    })
    .filter((event) => event.action === "presenter-first-package-ready-for-assembly-review" && event.targetId === "ED-10")
    .map((event) => ({eventId: event.eventId, createdAt: event.createdAt, workspaceSha256Before: event.workspaceSha256Before}));
}

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha) throw new Error(`ed10-restore-workspace-sha-mismatch:${current.workspaceSha256}`);

  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-restore-records-missing");
  if (runtime.visualReplacement?.contract !== "A1ED10LookMasterVisualReplacement/v1"
    || runtime.visualReplacement.status !== "AWAITING_USER_LOOK_MASTER_REVIEW"
    || runtime.visualReplacement.stopAtUserLookMasterReview !== true
    || runtime.visualReplacement.noLayerReconstruction !== true
    || runtime.visualReplacement.layerReconstructionStarted !== false) throw new Error("ed10-restore-visual-replacement-gate-invalid");
  if (plan.explorationCandidates?.length !== 4 || plan.fastCandidateDiscovery?.candidates?.length !== 4) throw new Error("ed10-restore-four-look-masters-required");
  if (recipe.selectedLookMasterBinding?.directionId !== "direction-02"
    || recipe.assemblySource?.authoritativeFullFrame?.sha256 !== "2b0dfabc228f542a391e227686b72750afdc788947a73b53e55139dd4a29827a") throw new Error("ed10-restore-presenter-first-route-not-current");

  const repeatedEvents = repeatedPresenterFirstEvents();

  // Keep the unauthorized presenter-first state as an immutable audit record,
  // but remove every live selector that could expose it as approvable.
  recipe.historyPresenterFirstAssembly = {
    contract: "A1ED10PresenterFirstAssemblyHistory/v1",
    status: "VISUAL_REJECTED",
    current: false,
    historyReadOnly: true,
    reason,
    preservedAt: now,
    repeatedPresenterFirstEvents: repeatedEvents,
    recipeSha256: recipe.recipeSha256,
    selectedDirectionId: recipe.selectedLookMasterBinding?.directionId || null,
    selectedMasterSha256: recipe.selectedLookMasterBinding?.artifactSha256 || null,
    assemblySha256: recipe.assemblyComposite?.sha256 || null,
    packageOnlySha256: recipe.packageOnlyComposite?.sha256 || null,
    assemblySource: structuredClone(recipe.assemblySource || null),
    selectedLookMasterBinding: structuredClone(recipe.selectedLookMasterBinding || null),
    reconstructionSource: structuredClone(recipe.reconstructionSource || null),
    approvalBinding: structuredClone(recipe.approvalBinding || null),
    parityAudit: structuredClone(recipe.parityAudit || null),
    deterministicParity: structuredClone(recipe.deterministicParity || null),
  };
  recipe.selectedLookMasterBinding = null;
  recipe.reconstructionSource = null;
  recipe.approvalBinding = null;
  recipe.parityAudit = null;
  recipe.deterministicParity = null;
  recipe.assemblyVisualReview = null;
  recipe.userAssemblyDecision = null;
  recipe.assemblyPreviewAvailable = false;
  recipe.assemblyReadyForUserReview = false;
  recipe.assemblyUserApproved = false;
  recipe.recommendation = {status: "HISTORY_READ_ONLY", reason};
  recipe.status = "HISTORY_READ_ONLY";
  recipe.current = false;
  recipe.historyReadOnly = true;
  recipe.advisoryOnly = true;
  recipe.visualStatus = "VISUAL_REJECTED";
  recipe.supersededBy = "A1ED10LookMasterVisualReplacement/v1";

  kit.historyLookMasterRoute = {
    contract: "A1ED10PresenterFirstKitHistory/v1",
    status: "VISUAL_REJECTED",
    current: false,
    historyReadOnly: true,
    reason,
    preservedAt: now,
    selectedLookMasterBinding: structuredClone(kit.selectedLookMasterBinding || null),
    reconstructionSource: structuredClone(kit.reconstructionSource || null),
  };
  kit.historyLayerCandidates = kit.layers.flatMap((layer) => (layer.candidates || []).map((candidate) => ({layerKind: layer.kind, candidate: structuredClone(candidate)})));
  kit.selectedLookMasterBinding = null;
  kit.reconstructionSource = null;
  for (const layer of kit.layers) {
    layer.historyCandidateIds = (layer.candidates || []).map((candidate) => candidate.candidateId);
    layer.candidates = [];
    layer.selectedCandidateId = null;
    layer.status = layer.route === "NONE" ? "NONE" : layer.route === "REUSE" ? "REUSE_CANDIDATE_REQUIRED" : "GENERATION_PLAN_ONLY";
  }
  kit.status = "WAITING_FOR_LOOK_MASTER";
  kit.current = false;
  kit.historyReadOnly = true;
  kit.advisoryOnly = true;
  kit.supersededBy = "A1ED10LookMasterVisualReplacement/v1";

  plan.historicalPresenterFirstReentry = {
    contract: "A1ED10PresenterFirstReentryHistory/v1",
    status: "HISTORY_READ_ONLY",
    current: false,
    historyReadOnly: true,
    reason,
    preservedAt: now,
    repeatedPresenterFirstEvents: repeatedEvents,
    previousStatus: plan.status,
    previousCurrentStage: plan.currentStage,
    previousActiveCandidateSet: structuredClone(plan.activeCandidateSet || null),
    selectedLookMasterId: plan.selectedLookMasterId || null,
    selectedLookMasterBinding: structuredClone(plan.selectedLookMasterBinding || null),
  };
  plan.recommendation = null;
  plan.selectedLookMasterId = null;
  plan.selectedLookMasterBinding = null;
  plan.status = "LOOK_MASTER_REVIEW_REQUIRED";
  plan.currentStage = "LOOK_MASTER_REVIEW_REQUIRED";
  plan.currentCandidateSource = {contract: "A1CurrentPackageCandidateSource/v1", source: "fastCandidateDiscovery", legacySelectorDisabled: true};
  plan.candidateDirectionAuthority = "FAST_CANDIDATE_DISCOVERY_PENDING_USER_REVIEW";
  plan.activeCandidateSet = {
    ...plan.activeCandidateSet,
    status: "PENDING_USER_LOOK_MASTER_REVIEW",
    selectedDirectionId: null,
    selectedCandidateId: null,
    recommendationStatus: "AUTO_RANKED_PENDING_USER_LOOK_MASTER_REVIEW",
  };
  plan.stateReconciliation = {
    ...(plan.stateReconciliation || {}),
    contract: "A1PackageLookMasterStateReconciliation/v1",
    status: "CURRENT",
    previousStatus: "ASSEMBLY_REVIEW_REQUIRED",
    currentStatus: "LOOK_MASTER_REVIEW_REQUIRED",
    selectedDirectionId: null,
    selectedMasterSha256: null,
    staleFieldsQuarantined: [
      ...(plan.stateReconciliation?.staleFieldsQuarantined || []),
      "presenter-first-package-ready-for-assembly-review-after-visualReplacement-stop",
    ],
    reconciledAt: now,
  };

  runtime.batchRankedHistory = historyRecord(runtime.batchRanked);
  runtime.batchRanked = null;
  runtime.currentCandidateSource = {contract: "A1CurrentPackageCandidateSource/v1", status: "ACTIVE", source: "fastCandidateDiscovery", shotIds: ["ED-10"], legacySelectorsDisabled: true};
  runtime.integratedPresenterPackage = historyRecord(runtime.integratedPresenterPackage, {visualStatus: "VISUAL_REJECTED", supersededBy: "A1ED10LookMasterVisualReplacement/v1"});
  runtime.status = "LOOK_MASTER_REVIEW_REQUIRED";
  runtime.updatedAt = now;

  next.production.packagingReview = {
    ...next.production.packagingReview,
    status: "LOOK_MASTER_REVIEW_REQUIRED",
    currentDecision: null,
    currentShotId: null,
    binding: null,
    intermediateApprovalRequired: false,
    requiresExplicitApproval: true,
    userApprovalStatus: "RECOMMENDED_LOOK_MASTER_CONFIRMATION_REQUIRED",
    nextAction: "review-recommended-package-look-master",
    updatedAt: now,
  };
  next.production.packagingAutomation = {
    ...next.production.packagingAutomation,
    status: "FROZEN",
    reason: "waiting-for-user-look-master-review",
    currentStage: "LOOK_MASTER_REVIEW_REQUIRED",
    updatedAt: now,
  };
  next.production.shotIntelligence = runtime;

  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  assertEditorialAssetWorkbench(recalculated);
  const event = createProductionEvent({
    workspace: recalculated,
    action: "restore-ed10-look-master-review-authority",
    targetId: "ED-10",
    payload: {
      reason,
      sourceWorkspaceSha256: current.workspaceSha256,
      visualReplacementStatus: runtime.visualReplacement.status,
      currentCandidateSource: "fastCandidateDiscovery",
      candidateIds: plan.activeCandidateSet.candidateIds,
      candidateArtifactSha256: plan.explorationCandidates.map((candidate) => candidate.artifact.sha256),
      supersededPresenterFirstEventIds: repeatedEvents.map((item) => item.eventId),
      supersededAssemblySha256: recipe.historyPresenterFirstAssembly.assemblySha256,
    },
  });
  persistProjectState(appRoot, recalculated, {event});
  console.log(JSON.stringify({
    status: "RESTORED_LOOK_MASTER_REVIEW_AUTHORITY",
    workspaceSha256: recalculated.workspaceSha256,
    eventId: event.eventId,
    runtimeStatus: runtime.status,
    planStatus: plan.status,
    kitStatus: kit.status,
    recipeStatus: recipe.status,
    candidateIds: plan.activeCandidateSet.candidateIds,
    candidateArtifactSha256: plan.explorationCandidates.map((candidate) => candidate.artifact.sha256),
    oldAssemblySha256: recipe.historyPresenterFirstAssembly.assemblySha256,
    queued: recalculated.production.generation.summary.queued,
    running: recalculated.production.generation.summary.running,
  }, null, 2));
});
