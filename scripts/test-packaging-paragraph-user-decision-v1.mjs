#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";
import {
  assertPackagingParagraphUserDecision,
  createPackagingParagraphUserDecision,
  readPackagingParagraphUserDecision,
  recordPackagingParagraphUserDecision,
} from "../apps/studio-next/src/lib/a1-packaging-paragraph-user-decision-v1.mjs";
import {createEffectiveReviewAuthority} from "../apps/studio-next/src/lib/a1-effective-review-authority-v1.mjs";
import {assertPackagingParagraphPlayablePlan, createPackagingParagraphPlayablePlan, readPackagingParagraphPlayablePlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-plan-v1.mjs";

const appRoot = path.join(process.cwd(), "apps/studio-next");
const status = readExecutionStatus(appRoot);
const lifecycle = status.packagingParagraphLifecycle;
assert.equal(lifecycle?.status, "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW");
const stripFile = path.join(appRoot, "public", lifecycle.review.stripPublicUrl.replace(/^\//u, ""));
const assessmentFile = path.join(path.dirname(path.dirname(stripFile)), "visual-director-assessment-v1", "assessment.json");
const assessment = JSON.parse(fs.readFileSync(assessmentFile, "utf8"));
const projectRoot = process.cwd();
const staticCanaryPlan = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-plan.json"), "utf8"));
const requestPack = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-request-pack.json"), "utf8"));
const mediaDiscovery = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/film-media-discovery-v1-latest.json"), "utf8"));
const reviewRoot = path.dirname(path.dirname(assessmentFile));

assert.throws(() => createPackagingParagraphUserDecision({decision: "approve", lifecycle, assessment}), /actual-pixels-confirmation-required/u);
const approved = createPackagingParagraphUserDecision({decision: "approve", actualPixelsConfirmed: true, lifecycle, assessment, decidedAt: "2026-08-13T00:00:00.000Z"});
assertPackagingParagraphUserDecision(approved, {lifecycle});
assert.equal(approved.status, "STATIC_PARAGRAPH_CANARY_USER_APPROVED");
assert.equal(approved.scope.approvalGranularity, "THREE_FRAME_STATIC_PARAGRAPH_ONLY");
assert.equal(approved.outcome.boundedPlayableParagraphPlanCompilationAllowed, true);
assert.equal(approved.boundary.fullFilmVisualApproval, false);
assert.equal(approved.boundary.motionAllowed, false);
assert.equal(approved.boundary.boundedPlayableParagraphRenderAllowed, false);
assert.equal(approved.boundary.workspaceMutationPerformed, false);
const playablePlan = createPackagingParagraphPlayablePlan({userDecision: approved, staticCanaryPlan, requestPack, assessment, reviewRoot, mediaDiscovery, createdAt: approved.decidedAt});
assertPackagingParagraphPlayablePlan(playablePlan, {userDecision: approved});
assert.equal(playablePlan.timeline.durationMs, 18921);
assert.equal(playablePlan.timeline.minimumReadableDurationMs, 12858);
assert.equal(playablePlan.timeline.sourceAudioTimeCompressionAllowed, false);
assert.equal(playablePlan.audio.sha256, "ad156741f33dc1ae0d01f4b155a577d5cc33d1036e70f29b278a213d8a46b73b");
assert.equal(playablePlan.shots.at(-1).playbackRange.endMs, 18921);
assert.equal(playablePlan.nextAction.id, "AUTHORIZE_BOUNDED_PLAYABLE_PARAGRAPH_RENDER");
assert.equal(playablePlan.boundary.renderAuthorized, false);
assert.equal(playablePlan.boundary.wholeFilmMotionAllowed, false);

const revise = createPackagingParagraphUserDecision({decision: "revise", note: "ED-13 的文字框仍然太像模板，请只返修文字与机制的融合。", actualPixelsConfirmed: true, lifecycle, assessment, decidedAt: "2026-08-13T00:00:01.000Z"});
assert.equal(revise.status, "STATIC_PARAGRAPH_CANARY_USER_REVISE_REQUIRED");
assert.equal(revise.outcome.boundedStaticRepairPlanCompilationAllowed, true);
assert.equal(revise.boundary.repairMediaDispatchAllowed, false);
assert.throws(() => createPackagingParagraphUserDecision({decision: "revise", actualPixelsConfirmed: true, lifecycle, assessment}), /revision-note-required/u);
assert.throws(() => assertPackagingParagraphUserDecision({...approved, boundary: {...approved.boundary, fullFilmVisualApproval: true}}, {lifecycle}), /sha-invalid/u);
assert.throws(() => createPackagingParagraphUserDecision({decision: "approve", actualPixelsConfirmed: true, lifecycle: {...lifecycle, lifecycleSha256: "f".repeat(64)}, assessment}), /effective-lifecycle-sha-invalid/u);

const effective = createEffectiveReviewAuthority({
  persistedStatus: status.persistedStatus,
  persistedCurrentStage: status.currentStage,
  persistedNextAction: status.effectiveAuthority.persistedBaseAuthority.nextAction,
  lifecycle,
  userDecision: approved,
  continuation: playablePlan,
  userVisualApproval: "NOT_APPROVED",
});
assert.equal(effective.source.mode, "VALIDATED_USER_DECISION_OVER_LIFECYCLE");
assert.equal(effective.status, "BOUNDED_PLAYABLE_PLAN_COMPILED_AWAITING_RENDER_AUTHORIZATION");
assert.equal(effective.nextAction.id, "AUTHORIZE_BOUNDED_PLAYABLE_PARAGRAPH_RENDER");
assert.equal(effective.boundary.fullFilmVisualApproval, false);
assert.equal(effective.boundary.userVisualApproval, "NOT_APPROVED");
const staleContinuationFallback = createEffectiveReviewAuthority({persistedStatus: status.persistedStatus, persistedNextAction: status.effectiveAuthority.persistedBaseAuthority.nextAction, lifecycle, userDecision: approved, continuation: {...playablePlan, source: {...playablePlan.source, userDecisionSha256: "0".repeat(64)}}});
assert.equal(staleContinuationFallback.status, "STATIC_PARAGRAPH_CANARY_USER_APPROVED");
assert.equal(staleContinuationFallback.source.continuationPlanSha256, null);
const reviseContinuationFallback = createEffectiveReviewAuthority({persistedStatus: status.persistedStatus, persistedNextAction: status.effectiveAuthority.persistedBaseAuthority.nextAction, lifecycle, userDecision: revise, continuation: playablePlan});
assert.equal(reviseContinuationFallback.status, "STATIC_PARAGRAPH_CANARY_USER_REVISE_REQUIRED");
assert.equal(reviseContinuationFallback.source.continuationPlanSha256, null);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-user-decision-"));
const temporaryAppRoot = path.join(temporaryRoot, "apps/studio-next");
fs.mkdirSync(temporaryAppRoot, {recursive: true});
try {
  const first = recordPackagingParagraphUserDecision(temporaryAppRoot, {decision: "approve", actualPixelsConfirmed: true, lifecycle, assessment, decidedAt: "2026-08-13T00:00:00.000Z", buildContinuation: (receipt) => createPackagingParagraphPlayablePlan({userDecision: receipt, staticCanaryPlan, requestPack, assessment, reviewRoot, mediaDiscovery, createdAt: receipt.decidedAt})});
  assert.equal(first.idempotent, false);
  assert.equal(first.continuation.planSha256, playablePlan.planSha256);
  const second = recordPackagingParagraphUserDecision(temporaryAppRoot, {decision: "approve", actualPixelsConfirmed: true, lifecycle, assessment, decidedAt: "2026-08-13T00:00:03.000Z", buildContinuation: () => { throw new Error("idempotent-write-must-not-recompile"); }});
  assert.equal(second.idempotent, true);
  assert.equal(second.receipt.decisionSha256, first.receipt.decisionSha256);
  assert.equal(readPackagingParagraphUserDecision(temporaryAppRoot, {lifecycle}).decisionSha256, first.receipt.decisionSha256);
  assert.equal(readPackagingParagraphPlayablePlan(temporaryAppRoot, {lifecycle, userDecision: first.receipt}).planSha256, first.continuation.planSha256);
  assert.throws(() => recordPackagingParagraphUserDecision(temporaryAppRoot, {decision: "revise", note: "换掉当前机制图。", actualPixelsConfirmed: true, lifecycle, assessment}), /immutable-conflict/u);
} finally {
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
}

console.log(JSON.stringify({
  status: "PASS",
  contract: approved.contract,
  scope: approved.scope.id,
  approvalIsStaticOnly: approved.boundary.fullFilmVisualApproval === false,
  workspaceMutationPerformed: approved.boundary.workspaceMutationPerformed,
  boundedRenderAllowed: approved.boundary.boundedPlayableParagraphRenderAllowed,
  sourceAlignedPlaybackDurationMs: playablePlan.timeline.durationMs,
  sourceAudioTimeCompressionAllowed: playablePlan.timeline.sourceAudioTimeCompressionAllowed,
  playablePlanCompiledAtomically: true,
  idempotentWrite: true,
  immutableConflictRejected: true,
  reviseNoteRequired: true,
  explicitActualPixelsConfirmationRequired: true,
}, null, 2));
