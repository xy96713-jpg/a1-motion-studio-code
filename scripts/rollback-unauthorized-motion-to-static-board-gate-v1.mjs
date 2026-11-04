#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
const boardSha256 = process.argv[3];
const reportRelativePath = "whole-film-static-board-approval-v1/unauthorized-downstream-rollback-v1.json";

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("unauthorized-motion-rollback-expected-workspace-sha-required");
if (!/^[a-f0-9]{64}$/u.test(String(boardSha256 || ""))) throw new Error("unauthorized-motion-rollback-expected-board-sha-required");

const markProofOnly = (value, reason) => value && typeof value === "object" ? {
  ...value,
  status: "PROOF_ONLY_UNAUTHORIZED_MISSING_USER_APPROVAL",
  evidenceClass: "PROOF_ONLY",
  authorizationStatus: "UNAUTHORIZED_IF_NO_APPROVAL",
  authorizationReason: reason,
  productionPass: false,
  promotedRender: false,
  assemblyAllowed: false,
  wholeFilmMotionAllowed: false,
  wholeFilmMotionPlanCompilationAllowed: false,
  wholeFilmLayerExpansionAllowed: false,
  wholeFilmMotionRenderAllowed: false,
  wholeFilmReviewRenderAllowed: false,
  final1080RenderAllowed: false,
  resolveAllowed: false,
  releaseAllowed: false,
} : value;

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`unauthorized-motion-rollback-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("unauthorized-motion-rollback-requires-frozen-idle-runtime");

  const runtime = current.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  if (board?.sha256 !== boardSha256) throw new Error(`unauthorized-motion-rollback-board-sha-mismatch:${board?.sha256 || "missing"}`);
  const currentDecision = runtime.wholeFilmStaticBoardDecision;
  const approvalAuthority = currentDecision?.approvalAuthority;
  const legalApprovalFound = currentDecision?.decision === "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY"
    && currentDecision.decidedBy === "user"
    && approvalAuthority?.mode === "EXPLICIT_USER_CONFIRMATION"
    && approvalAuthority.actor === "user"
    && /^[a-f0-9]{64}$/u.test(String(approvalAuthority.userDirectiveSha256 || ""));
  const approvalAudit = {
    contract: "A1CurrentWholeFilmStaticBoardApprovalEvidenceAudit/v1",
    status: legalApprovalFound ? "PASS" : "BLOCK",
    legalApprovalFound,
    expectedBoardSha256: boardSha256,
    decisionSha256: currentDecision?.decisionSha256 || null,
    decidedBy: currentDecision?.decidedBy || null,
    approvalMode: approvalAuthority?.mode || null,
    actor: approvalAuthority?.actor || null,
    userDirectiveSha256: approvalAuthority?.userDirectiveSha256 || null,
    visualEvidence: approvalAuthority?.visualEvidence || null,
    failures: [
      !currentDecision ? "CURRENT_DECISION_MISSING" : null,
      currentDecision?.decidedBy !== "user" ? "DECISION_NOT_USER_AUTHORED" : null,
      approvalAuthority?.mode !== "EXPLICIT_USER_CONFIRMATION" ? "EXPLICIT_USER_CONFIRMATION_MISSING" : null,
      !/^[a-f0-9]{64}$/u.test(String(approvalAuthority?.userDirectiveSha256 || "")) ? "USER_DIRECTIVE_EVIDENCE_MISSING" : null,
    ].filter(Boolean),
  };
  if (approvalAudit.legalApprovalFound) throw new Error("unauthorized-motion-rollback-not-allowed-valid-user-approval-found");

  const alreadyRolledBack = board.status === "PENDING_USER_APPROVAL"
    && runtime.status === "WHOLE_FILM_STATIC_BOARD_READY"
    && current.production.visualProductionRun?.assemblyCreationAllowed === false
    && runtime.approvedMasterRasterSliceMotionCandidate?.current === false
    && runtime.wholeFilmApprovedMasterMotionPlan?.evidenceClass === "PROOF_ONLY"
    && current.production.userVisualApprovalGate?.status === "WHOLE_FILM_STATIC_BOARD_APPROVAL_REQUIRED"
    && current.production.goldenFilmVisualSystemMaturity?.current === false
    && current.production.generation.summary.queued === 0
    && current.production.generation.summary.running === 0
    && current.production.generation.workerStatus === "frozen"
    && !(runtime.packageAssemblyRecipes || []).some((recipe) => recipe?.current !== false || recipe?.authorityScope === "CURRENT")
    && !(runtime.packageAssetKitPlans || []).some((plan) => plan?.current !== false || plan?.authorityScope === "CURRENT");
  if (alreadyRolledBack) return {status: "NOOP_ALREADY_AT_STATIC_BOARD_GATE", workspaceSha256: current.workspaceSha256, legalApprovalFound: false, approvalAudit};

  const now = new Date().toISOString();
  const reason = "Missing user quote and user message id before Assembly/motion start.";
  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const previousDecision = structuredClone(nextRuntime.wholeFilmStaticBoardDecision || null);

  nextRuntime.wholeFilmStaticBoard = {
    ...nextRuntime.wholeFilmStaticBoard,
    status: "PENDING_USER_APPROVAL",
    decision: null,
    approvalAllowed: true,
    nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD",
    authorizationStatus: "AWAITING_LEGAL_USER_APPROVAL_RECORD",
  };
  nextRuntime.wholeFilmStaticBoardDecisionHistory = [
    ...(nextRuntime.wholeFilmStaticBoardDecisionHistory || []),
    ...(previousDecision?.current !== false ? [{...previousDecision, current: false, authorityScope: "HISTORY_READ_ONLY", authorizationStatus: "INVALID_MISSING_USER_APPROVAL_EVIDENCE", invalidatedAt: now}] : []),
  ];
  nextRuntime.wholeFilmStaticBoardDecision = previousDecision ? {
    ...previousDecision,
    current: false,
    authorityScope: "HISTORY_READ_ONLY",
    authorizationStatus: "INVALID_MISSING_USER_APPROVAL_EVIDENCE",
    invalidatedAt: now,
  } : null;
  nextRuntime.status = "WHOLE_FILM_STATIC_BOARD_READY";
  nextRuntime.wholeFilmBatchRecommendation = {
    ...nextRuntime.wholeFilmBatchRecommendation,
    status: "COMPLETE",
    exceptions: [],
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    staticBoard: structuredClone(nextRuntime.wholeFilmStaticBoard),
  };
  nextRuntime.currentAssembly = [];
  nextRuntime.packageAssemblyRecipes = (nextRuntime.packageAssemblyRecipes || []).map((recipe) => {
    if (recipe?.current === false && recipe?.authorityScope !== "CURRENT") return recipe;
    return {
      ...recipe,
      legacyStatus: recipe.status || null,
      current: false,
      authorityScope: "HISTORY_READ_ONLY",
      supersededBy: "WHOLE_FILM_STATIC_BOARD_APPROVAL_GATE_V2",
      authorizationStatus: "INVALID_MISSING_USER_APPROVAL_EVIDENCE",
      invalidatedReason: reason,
      invalidatedAt: now,
      userAssemblyDecision: recipe.userAssemblyDecision ? {
        ...recipe.userAssemblyDecision,
        current: false,
        authorityScope: "HISTORY_READ_ONLY",
        authorizationStatus: "INVALID_MISSING_USER_APPROVAL_EVIDENCE",
        validForCurrentBoard: false,
        invalidatedAt: now,
      } : null,
    };
  });
  nextRuntime.packageAssetKitPlans = (nextRuntime.packageAssetKitPlans || []).map((plan) => {
    if (plan?.current === false && plan?.authorityScope !== "CURRENT") return plan;
    return {
      ...plan,
      legacyStatus: plan.status || null,
      current: false,
      authorityScope: "HISTORY_READ_ONLY",
      supersededBy: "WHOLE_FILM_STATIC_BOARD_APPROVAL_GATE_V2",
      authorizationStatus: "INVALID_MISSING_USER_APPROVAL_EVIDENCE",
      invalidatedReason: reason,
      invalidatedAt: now,
    };
  });
  for (const key of [
    "wholeFilmApprovedMasterMotionPlan",
    "representativeApprovedMasterMotionPilot",
    "approvedMasterLayerPilot",
    "deterministicLayerReconstructionPilot",
    "wholeFilmDeterministicLayerActualVisualReview",
    "wholeFilmDeterministicLayerReconstruction",
  ]) nextRuntime[key] = markProofOnly(nextRuntime[key], reason);
  nextRuntime.approvedMasterRasterSliceMotionCandidate = markProofOnly(
    nextRuntime.approvedMasterRasterSliceMotionCandidate,
    reason,
  );
  if (nextRuntime.approvedMasterRasterSliceMotionCandidate) {
    nextRuntime.approvedMasterRasterSliceMotionCandidate.current = false;
    nextRuntime.approvedMasterRasterSliceMotionCandidate.authorityScope = "HISTORY_READ_ONLY";
    nextRuntime.approvedMasterRasterSliceMotionCandidate.status = "PROOF_ONLY_UNAUTHORIZED_PREMOTION_GATE";
    nextRuntime.approvedMasterRasterSliceMotionCandidate.userVisualApproval = "NOT_APPROVED";
    nextRuntime.approvedMasterRasterSliceMotionCandidate.productionEligible = false;
    nextRuntime.approvedMasterRasterSliceMotionCandidate.finalRenderAllowed = false;
    nextRuntime.approvedMasterRasterSliceMotionCandidate.invalidatedAt = now;
  }

  next.production.visualProductionRun = {
    ...next.production.visualProductionRun,
    status: "WHOLE_FILM_STATIC_BOARD_READY",
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    productionWired: false,
    motionApproved: false,
  };
  next.production.assembly = {...next.production.assembly, status: "locked-awaiting-whole-film-static-board-user-approval", productionWired: false};
  next.production.motion = {...next.production.motion, status: "locked-awaiting-whole-film-static-board-user-approval", fullMotionAllowed: false, motionApproved: false};
  next.production.release.review540p = {...next.production.release.review540p, status: "proof-only-unauthorized-if-no-approval", approvedAt: null};
  next.production.release.final1080p = {...next.production.release.final1080p, status: "locked-awaiting-whole-film-static-board-user-approval"};
  next.production.release.davinciPackage = {...next.production.release.davinciPackage, status: "locked-awaiting-whole-film-static-board-user-approval"};
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.production.goldenFilmVisualSystemMaturity = {
    ...next.production.goldenFilmVisualSystemMaturity,
    current: false,
    authorityScope: "HISTORY_READ_ONLY",
    status: "HISTORY_ONLY_UNAUTHORIZED_PREMOTION_GATE",
    supersededBy: "WHOLE_FILM_STATIC_BOARD_APPROVAL_GATE_V2",
    phaseStatuses: {...next.production.goldenFilmVisualSystemMaturity?.phaseStatuses, PHASE_4: "AWAITING_USER_APPROVAL"},
    nextAction: null,
    targetShotIds: [],
    currentWaveJobIds: [],
    awaitingApprovalBoardSha256: boardSha256,
    approvedBoardSha256: null,
    approvalAuthoritySha256: null,
    completedAt: null,
    updatedAt: now,
  };
  next.production.userVisualApprovalGate = {
    contract: "A1WholeFilmStaticBoardApprovalGate/v2",
    status: "WHOLE_FILM_STATIC_BOARD_APPROVAL_REQUIRED",
    current: true,
    authorityScope: "CURRENT",
    legalApprovalFound: false,
    userQuote: null,
    userMessageId: null,
    userVisualApproval: "NOT_APPROVED",
    blocksInternalCanary: true,
    blocksAssemblyAndLayers: true,
    blocksExternalRelease: true,
    nextAction: "review-whole-film-static-board",
    evidenceAudit: approvalAudit,
    checkedAt: now,
  };

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (recalculated.production.visualProductionRun?.assemblyCreationAllowed !== false
    || recalculated.production.visualProductionRun?.layerReconstructionAllowed !== false
    || recalculated.production.visualProductionRun?.motionAllowed !== false
    || recalculated.production.generation.summary.queued !== 0
    || recalculated.production.generation.summary.running !== 0
    || recalculated.production.generation.workerStatus !== "frozen"
    || recalculated.production.packagingLifecycleProjection?.status !== "WHOLE_FILM_STATIC_BOARD_READY"
    || recalculated.production.authority?.currentStage !== "whole-film-static-board-review"
    || (recalculated.production.shotIntelligence.packageAssemblyRecipes || []).some((recipe) => recipe?.current !== false || recipe?.authorityScope === "CURRENT")
    || (recalculated.production.shotIntelligence.packageAssetKitPlans || []).some((plan) => plan?.current !== false || plan?.authorityScope === "CURRENT")
    || !["review-whole-film-static-board", "CONFIRM_WHOLE_FILM_STATIC_BOARD"].includes(recalculated.production.authority?.nextAction?.id)) throw new Error(`unauthorized-motion-rollback-postcondition-failed:${JSON.stringify({
      lifecycle: recalculated.production.packagingLifecycleProjection?.status || null,
      currentStage: recalculated.production.authority?.currentStage || null,
      nextAction: recalculated.production.authority?.nextAction?.id || null,
      boardStatus: recalculated.production.shotIntelligence.wholeFilmStaticBoard?.status || null,
      candidateCurrent: recalculated.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate?.current,
      currentAssemblyRecipes: (recalculated.production.shotIntelligence.packageAssemblyRecipes || []).filter((recipe) => recipe?.current !== false || recipe?.authorityScope === "CURRENT").length,
      currentAssetKitPlans: (recalculated.production.shotIntelligence.packageAssetKitPlans || []).filter((plan) => plan?.current !== false || plan?.authorityScope === "CURRENT").length,
    })}`);

  const motionPlan = recalculated.production.shotIntelligence.wholeFilmApprovedMasterMotionPlan;
  const motionPilot = recalculated.production.shotIntelligence.representativeApprovedMasterMotionPilot;
  const report = {
    contract: "A1UnauthorizedDownstreamRollback/v1",
    status: "PASS",
    legalApprovalFound: false,
    approvalAudit,
    boardSha256,
    approvalMessageId: null,
    authorityStatus: "WHOLE_FILM_STATIC_BOARD_AWAITING_USER_APPROVAL",
    queue: {queued: 0, running: 0, workerStatus: "frozen"},
    downstream: {assemblyCreationAllowed: false, productionWired: false, layerReconstructionAllowed: false, criticAllowed: false, motionApproved: false, final1080Allowed: false, resolveAllowed: false},
    demotedUnauthorizedCurrentState: {
      assemblyRecipes: (runtime.packageAssemblyRecipes || []).filter((recipe) => recipe?.current !== false || recipe?.authorityScope === "CURRENT").length,
      assetKitPlans: (runtime.packageAssetKitPlans || []).filter((plan) => plan?.current !== false || plan?.authorityScope === "CURRENT").length,
    },
    proofOnlyArtifacts: [
      ...(motionPlan?.video?.sha256 ? [{kind: "WHOLE_FILM_REVIEW_MP4", publicUrl: motionPlan.video.publicUrl, sha256: motionPlan.video.sha256, evidenceClass: "PROOF_ONLY", authorizationStatus: "UNAUTHORIZED_IF_NO_APPROVAL"}] : []),
      ...(motionPilot?.video?.sha256 ? [{kind: "REPRESENTATIVE_MOTION_PILOT_MP4", publicUrl: motionPilot.video.publicUrl, sha256: motionPilot.video.sha256, evidenceClass: "PROOF_ONLY", authorizationStatus: "UNAUTHORIZED_IF_NO_APPROVAL"}] : []),
      ...(recalculated.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate?.video?.sha256 ? [{kind: "SYSTEM_VALIDATION_MP4", publicUrl: recalculated.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate.video.publicUrl, sha256: recalculated.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate.video.sha256, evidenceClass: "PROOF_ONLY", authorizationStatus: "UNAUTHORIZED_IF_NO_APPROVAL"}] : []),
    ],
    rolledBackAt: now,
  };
  const event = createProductionEvent({workspace: current, action: "rollback-unauthorized-motion-to-static-board-gate", targetId: boardSha256, payload: report, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const finalWorkspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(recalculated, now));
  const committed = persistProjectState(appRoot, finalWorkspace, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `unauthorized-motion-rollback-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {[reportRelativePath]: {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: finalWorkspace.workspaceSha256}},
  });
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId};
});

console.log(JSON.stringify(result, null, 2));
