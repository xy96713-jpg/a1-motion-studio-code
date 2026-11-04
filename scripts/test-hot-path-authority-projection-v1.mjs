#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";

import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";
import {canonicalTitleRepairActualPixelAuditPassed, canonicalTitleRepairCandidatesBound, canonicalTitleRepairCheckpoint, canonicalTitleRepairRawBindingIsAdmissible, canonicalTitleRepairUnboundShotIds, derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const appRoot = path.join(path.resolve(import.meta.dirname, ".."), "apps/studio-next");
const workspace = readProjectWorkspace(appRoot);
const executionStatus = readExecutionStatus(appRoot);
const latestVisualBoardReviewCurrent = executionStatus.status === "LATEST_WHOLE_FILM_VISUAL_BOARD_REVIEW_REQUIRED";
const currentVisualDecisionLedgerReviewCurrent = executionStatus.status === "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED";
const currentWholeFilmStaticReviewCurrent = workspace.production.shotIntelligence.wholeFilmStaticBoard?.status === "PENDING_USER_APPROVAL"
  && workspace.production.shotIntelligence.wholeFilmStaticBoard?.userVisualApproval !== "APPROVED";
const currentStaticReviewAuthority = latestVisualBoardReviewCurrent || currentVisualDecisionLedgerReviewCurrent || currentWholeFilmStaticReviewCurrent;
const auditPassed = canonicalTitleRepairActualPixelAuditPassed(workspace);
const checkpointPending = canonicalTitleRepairCheckpoint(workspace);
const lifecycle = derivePackagingLifecycleProjection(workspace);
const unboundWorkspace = structuredClone(workspace);
for (const plan of unboundWorkspace.production.shotIntelligence.packageLookMasterPlans) delete plan.provisionalWholeFilmBoardSelection;
const unboundLifecycle = derivePackagingLifecycleProjection(unboundWorkspace);
const candidatesBound = canonicalTitleRepairCandidatesBound(workspace);
const canonicalUnboundShotIds = canonicalTitleRepairUnboundShotIds(workspace);
const canonicalManifest = workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
const approvedStaticBoardCurrent = workspace.production.shotIntelligence.wholeFilmStaticBoard?.status === "APPROVED"
  && workspace.production.shotIntelligence.wholeFilmStaticBoardDecision?.decision === "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY"
  && workspace.production.shotIntelligence.wholeFilmStaticBoardDecision?.approvalAuthority?.contract === "A1WholeFilmStaticBoardApprovalAuthority/v1";
const activeCurrentWaveJobCount = (workspace.production.generation.jobs || []).filter((job) => ["queued", "running"].includes(job.status)
  && job.canonicalRepairBinding?.authoritySha256 === canonicalManifest?.authoritySha256
  && job.canonicalRepairBinding?.manifestSha256 === canonicalManifest?.manifestSha256).length;

for (const plan of workspace.production.shotIntelligence.packageLookMasterPlans || []) {
  if (!String(plan.canonicalRepair?.formalTypographyStyleMode || "").startsWith("EVA_")) continue;
  if (!(canonicalManifest?.generationEligibleShotIds || []).includes(plan.shotId)) continue;
  const selectedSha = plan.provisionalWholeFilmBoardSelection?.artifact?.sha256 || plan.selectedLookMasterBinding?.artifactSha256 || null;
  if (!selectedSha) continue;
  const raw = (workspace.production.shotIntelligence.lookMasterRawReferences || []).find((item) => item.shotId === plan.shotId
    && item.planSha256 === plan.planSha256
    && item.artifact?.sha256 === selectedSha);
  assert.equal(canonicalTitleRepairRawBindingIsAdmissible(plan, raw), true, `EVA plan ${plan.shotId} cannot bind a non-EVA candidate`);
}

// A historical PASS must not close the checkpoint after the current plan
// switches formal typography (notably EVA fullscreen).  Only a PASS whose
// raw artifact is still current-plan and style-bound may do so.
if (auditPassed || currentStaticReviewAuthority || approvedStaticBoardCurrent) {
  assert.equal(checkpointPending, false, "an authoritative actual-pixel audit must close the dispatch checkpoint");
} else {
  assert.equal(checkpointPending, true, "a stale or unbound audit must reopen the canonical dispatch checkpoint");
}
if (candidatesBound) {
  assert.notEqual(lifecycle.status, "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED", "bound candidates must not leave the hot path in the repair-binding gate");
} else {
  assert.ok(["CANONICAL_TITLE_REPAIR_BINDING_REQUIRED", "CANONICAL_TITLE_REPAIR_PENDING", "CANONICAL_TITLE_REPAIR_GENERATING", "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED", "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED", "WHOLE_FILM_STATIC_BOARD_READY", "MOTION_READY", "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW"].includes(lifecycle.status), "unbound candidates must remain in a fail-closed repair/static gate unless a current static authority already supersedes candidate selection");
  assert.ok(canonicalUnboundShotIds.length > 0, "an unbound current audit must expose target shot ids");
}
if (latestVisualBoardReviewCurrent) {
  assert.equal(executionStatus.nextAction.id, "REVIEW_LATEST_WHOLE_FILM_VISUAL_BOARD");
  assert.equal(executionStatus.nextAction.targetShotIds.includes("ED-13"), false);
} else if (currentVisualDecisionLedgerReviewCurrent) {
  assert.equal(executionStatus.nextAction.id, "review-full-static-storyboard-rework");
  assert.equal(unboundLifecycle.status, "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED");
  assert.equal(unboundLifecycle.motionAllowed, false);
} else if (approvedStaticBoardCurrent) {
  assert.ok(["MOTION_READY", "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW"].includes(unboundLifecycle.status));
  const expectedMotionTargets = unboundLifecycle.status === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW"
    ? unboundWorkspace.production.staticStoryboardRework.targetShotIds
    : (unboundWorkspace.production.shotIntelligence.wholeFilmStaticBoard.items || []).map((item) => item.shotId);
  assert.deepEqual([...unboundLifecycle.targetShotIds].sort(), [...expectedMotionTargets].sort());
} else if (currentWholeFilmStaticReviewCurrent) {
  assert.equal(unboundLifecycle.status, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(unboundLifecycle.nextActionId, "review-whole-film-static-board");
  assert.equal(unboundLifecycle.requiresExplicitApproval, true);
  assert.equal(unboundLifecycle.motionAllowed, false);
} else {
  assert.deepEqual([...unboundLifecycle.targetShotIds].sort(), [...canonicalTitleRepairUnboundShotIds(unboundWorkspace)].sort());
}
if ((auditPassed || currentStaticReviewAuthority || approvedStaticBoardCurrent) && !approvedStaticBoardCurrent) {
  assert.ok(!String(unboundLifecycle.nextActionId).includes("dispatch-canonical-title-repair"));
} else if (!approvedStaticBoardCurrent && !currentWholeFilmStaticReviewCurrent) {
  assert.ok(["dispatch-canonical-title-repair", "continue-canonical-title-repair"].includes(unboundLifecycle.nextActionId), "stale EVA evidence must stay on the bounded canonical repair route");
}
if (checkpointPending) {
  assert.equal(lifecycle.status === "CANONICAL_TITLE_REPAIR_GENERATING", canonicalManifest?.generationDispatched === true && activeCurrentWaveJobCount > 0, "canonical repair may report generating only while its current manifest owns an active job");
}

console.log(JSON.stringify({
  status: "PASS",
  auditPassed,
  latestVisualBoardReviewCurrent,
  candidatesBound,
  checkpointPending,
  lifecycleStatus: lifecycle.status,
  nextAction: lifecycle.nextActionId,
  targetShotIds: lifecycle.targetShotIds,
  activeCurrentWaveJobCount,
  unboundLifecycleStatus: unboundLifecycle.status,
}, null, 2));
