#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";
import {assertPackagingParagraphEffectiveLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-effective-lifecycle-v1.mjs";
import {createPackagingParagraphUserDecision} from "../apps/studio-next/src/lib/a1-packaging-paragraph-user-decision-v1.mjs";
import {createPackagingParagraphPlayablePlan} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-plan-v1.mjs";
import {createEffectiveReviewAuthority} from "../apps/studio-next/src/lib/a1-effective-review-authority-v1.mjs";
import {
  assertPackagingParagraphPlayableUserDecision,
  createPackagingParagraphPlayableUserDecision,
  readPackagingParagraphPlayableUserDecision,
  recordPackagingParagraphPlayableUserDecision,
} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-user-decision-v1.mjs";
import {
  assertPackagingParagraphPlayableRenderAuthorization,
  assertPackagingParagraphPlayableRenderProps,
  assertPackagingParagraphPlayableRenderResult,
  assertPackagingParagraphPlayableReviewFiles,
  assertPackagingParagraphPlayableRenderState,
  assertPackagingParagraphPlayableAgentAssessment,
  buildPackagingParagraphPlayableRenderImplementationBinding,
  compilePackagingParagraphPlayableFramePlan,
  createPackagingParagraphPlayableRenderAuthorization,
  createPackagingParagraphPlayableRenderProps,
  createPackagingParagraphPlayableRenderResult,
  createPackagingParagraphPlayableRenderState,
  createPackagingParagraphPlayableAgentAssessment,
  packagingParagraphPlayableRenderPaths,
  readPackagingParagraphPlayableRender,
  recordPackagingParagraphPlayableRenderAuthorization,
  updatePackagingParagraphPlayableRenderState,
} from "../apps/studio-next/src/lib/a1-packaging-paragraph-playable-render-v1.mjs";

const projectRoot = process.cwd();
const appRoot = path.join(projectRoot, "apps/studio-next");
const status = readExecutionStatus(appRoot);
// The playable paragraph is history-only while the faceless article-asset
// authority is current. Read its sealed lifecycle directly so this remains a
// compatibility contract test without letting it compete for live authority.
const historicalLifecycleCheckpoint = JSON.parse(fs.readFileSync(path.join(
  projectRoot,
  ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-effective-lifecycle-v1/current.json",
), "utf8"));
assert.equal(historicalLifecycleCheckpoint.status, "VALIDATED_CURRENT");
const lifecycle = status.packagingParagraphLifecycle
  || assertPackagingParagraphEffectiveLifecycle(historicalLifecycleCheckpoint.lifecycle);
assert.equal(lifecycle?.status, "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW");

const stripFile = path.join(appRoot, "public", lifecycle.review.stripPublicUrl.replace(/^\//u, ""));
const assessmentFile = path.join(path.dirname(path.dirname(stripFile)), "visual-director-assessment-v1", "assessment.json");
const assessment = JSON.parse(fs.readFileSync(assessmentFile, "utf8"));
const staticCanaryPlan = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-plan.json"), "utf8"));
const requestPack = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-request-pack.json"), "utf8"));
const mediaDiscovery = JSON.parse(fs.readFileSync(path.join(projectRoot, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/film-media-discovery-v1-latest.json"), "utf8"));
const reviewRoot = path.dirname(path.dirname(assessmentFile));
const userDecision = createPackagingParagraphUserDecision({decision: "approve", actualPixelsConfirmed: true, lifecycle, assessment, decidedAt: "2026-08-13T00:00:00.000Z"});
const plan = createPackagingParagraphPlayablePlan({userDecision, staticCanaryPlan, requestPack, assessment, reviewRoot, mediaDiscovery, createdAt: userDecision.decidedAt});
const productionFixturePaths = packagingParagraphPlayableRenderPaths(appRoot, plan.planSha256);
const productionStateBefore = {
  bundleExists: fs.existsSync(productionFixturePaths.bundle),
  authorizationBytes: fs.existsSync(productionFixturePaths.authorization) ? fs.readFileSync(productionFixturePaths.authorization) : null,
  stateBytes: fs.existsSync(productionFixturePaths.state) ? fs.readFileSync(productionFixturePaths.state) : null,
};
const implementation = buildPackagingParagraphPlayableRenderImplementationBinding(projectRoot);
const rendererSource = fs.readFileSync(path.join(projectRoot, "remotion-renderer/src/PackagingParagraphPlayableCanaryV1.tsx"), "utf8");
assert.doesNotMatch(rendererSource, /Arial|TRIED SET|SURFACE ≠ ROOT|SOURCE → BOUNDED CLAIM/u);

const framePlan = compilePackagingParagraphPlayableFramePlan(plan);
assert.equal(framePlan.fps, 30);
assert.equal(framePlan.durationInFrames, 569);
assert.equal(framePlan.audioTrimStartFrame, 1546);
assert.equal(framePlan.audioTrimEndFrame, 2115);
assert.equal(framePlan.quantization.authoritativeSourceRangeFullyCovered, true);
assert.equal(framePlan.quantization.timeCompressionApplied, false);
assert.ok(framePlan.quantization.leadingPaddingMs < framePlan.quantization.frameMs);
assert.ok(framePlan.quantization.trailingPaddingMs < framePlan.quantization.frameMs);
assert.deepEqual(framePlan.shots.map((shot) => [shot.shotId, shot.frameStart, shot.frameEnd]), [["ED-12", 0, 156], ["ED-13", 156, 306], ["ED-14", 306, 569]]);

const props = createPackagingParagraphPlayableRenderProps(plan);
assertPackagingParagraphPlayableRenderProps(props, {plan});
assert.equal(props.timeline.encodedDurationMs, 18966.666667);
assert.equal(props.audio.playbackRate, 1);
assert.deepEqual(props.shots.map((shot) => shot.semanticActionId), ["REVEAL_TRIED_MODELS_IN_ORDER", "ADVANCE_FLUENCY_THEN_HIT_ROOT_OBSTRUCTION", "REVEAL_SOURCE_THEN_THREE_BOUNDED_FINDINGS"]);
assert.equal(props.motionPolicy.staticSlideshowPassAllowed, false);
assert.equal(props.boundary.wholeFilmMotionAllowed, false);

assert.throws(() => createPackagingParagraphPlayableRenderAuthorization({plan, userDecision, implementation}), /explicit-confirmation-required/u);
const authorization = createPackagingParagraphPlayableRenderAuthorization({plan, userDecision, implementation, boundedRenderConfirmed: true, authorizedAt: "2026-08-13T00:01:00.000Z"});
assertPackagingParagraphPlayableRenderAuthorization(authorization, {plan, userDecision, implementation});
assert.equal(authorization.render.automaticDispatch, true);
assert.equal(authorization.render.automaticObjectiveAudit, true);
assert.equal(authorization.boundary.boundedPlayableParagraphRenderAllowed, true);
assert.equal(authorization.boundary.workspaceMutationAllowed, false);
assert.equal(authorization.boundary.workspaceUserVisualApproval, "NOT_APPROVED");
assert.equal(authorization.boundary.wholeFilmMotionAllowed, false);
assert.equal(authorization.boundary.resolveAllowed, false);
assert.equal(authorization.boundary.finalRenderAllowed, false);
assert.throws(() => assertPackagingParagraphPlayableRenderAuthorization({...authorization, boundary: {...authorization.boundary, finalRenderAllowed: true}}, {plan, userDecision}), /sha-invalid/u);

const queued = createPackagingParagraphPlayableRenderState({authorization, status: "BOUNDED_PLAYABLE_RENDER_QUEUED", attemptId: "attempt-fixture", updatedAt: "2026-08-13T00:01:00.000Z"});
assertPackagingParagraphPlayableRenderState(queued, {authorization});
const rendering = createPackagingParagraphPlayableRenderState({authorization, status: "BOUNDED_PLAYABLE_RENDERING", attemptId: queued.attemptId, updatedAt: "2026-08-13T00:01:01.000Z", pid: 12345});
assert.equal(rendering.process.pid, 12345);

const fixtureVideoBytes = Buffer.from("fixture-playable-video");
const fixtureContactSheetBytes = Buffer.from("fixture-temporal-contact-sheet");
const shaA = crypto.createHash("sha256").update(fixtureVideoBytes).digest("hex");
const shaB = crypto.createHash("sha256").update(fixtureContactSheetBytes).digest("hex");
const sampleReports = props.shots.flatMap((shot) => ["setup", "action", "hold"].map((phase, index) => ({shotId: shot.shotId, phase, frame: shot.reviewFrames[phase], sha256: String((index + 1) % 10).repeat(64), bytes: 100, publicUrl: `/fixture/${shot.shotId}-${phase}.png`})));
const checks = {authorizedImplementationCurrent: true, sourceBindingsPreserved: true, reviewOnly960x540: true, fps30: true, audioPresent: true, h264Video: true, exactVideoFrameCount: true, videoDurationMatchesFramePlan: true, audioCoversAuthoritativeWindow: true, sourceWindowFullyCovered: true, noAudioTimeCompression: true, nineTemporalSamples: true, semanticMotionVisible: true, stableHoldReturnsToBoundStaticPixels: true, staticSlideshowRejectedByPolicy: true, wholeFilmStillFrozen: true, downstreamStillFrozen: true};
const result = createPackagingParagraphPlayableRenderResult({authorization, props, generatedAt: "2026-08-13T00:01:02.000Z", video: {publicUrl: "/fixture/video.mp4", sha256: shaA, bytes: fixtureVideoBytes.length}, contactSheet: {publicUrl: "/fixture/sheet.png", sha256: shaB, bytes: fixtureContactSheetBytes.length}, reportPublicUrl: "/fixture/result.json", samples: sampleReports, media: {container: {durationMs: props.timeline.encodedDurationMs + 63.333}, video: {codec: "h264", width: 960, height: 540, fps: "30/1", durationMs: props.timeline.encodedDurationMs, frameCount: props.durationInFrames}, audio: {codec: "aac", sampleRate: "48000", channels: 1, durationMs: props.timeline.encodedDurationMs + 62.666, maximumBoundaryPaddingMs: 65}}, checks});
assertPackagingParagraphPlayableRenderResult(result, {authorization, props});
assert.equal(result.status, "PASS_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW");
const failedAudioChecks = {...checks, audioCoversAuthoritativeWindow: false};
const failedAudioResult = createPackagingParagraphPlayableRenderResult({authorization, props, generatedAt: "2026-08-13T00:01:02.500Z", video: {publicUrl: "/fixture/video.mp4", sha256: shaA, bytes: fixtureVideoBytes.length}, contactSheet: {publicUrl: "/fixture/sheet.png", sha256: shaB, bytes: fixtureContactSheetBytes.length}, reportPublicUrl: "/fixture/result.json", samples: sampleReports, media: result.media, checks: failedAudioChecks});
assert.equal(failedAudioResult.status, "FAIL");
assert.deepEqual(failedAudioResult.failures, ["audioCoversAuthoritativeWindow"]);
const readyOutput = {resultSha256: result.resultSha256, objectiveAuditStatus: result.status, video: result.output.video, contactSheet: result.output.contactSheet, reportPublicUrl: result.output.reportPublicUrl};
const ready = createPackagingParagraphPlayableRenderState({authorization, status: "BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW", attemptId: queued.attemptId, updatedAt: "2026-08-13T00:01:03.000Z", output: readyOutput});
assertPackagingParagraphPlayableRenderState(ready, {authorization});
assert.equal(ready.nextAction.id, "AGENT_ACTUAL_PIXEL_REVIEW_PLAYABLE_PARAGRAPH");
assert.equal(ready.boundary.workspaceUserVisualApproval, "NOT_APPROVED");
const passRaw = {
  verdict: "PASS",
  dimensions: ["semanticAction", "paragraphContinuity", "readability", "motionRestraint", "aestheticCoherence", "sourceAlignment"].map((id) => ({id, result: "PASS", evidence: `Actual pixel evidence passes ${id} across the temporal board.`})),
  shots: ["ED-12", "ED-13", "ED-14"].map((shotId) => ({shotId, visibleAction: "PASS", stableRead: "PASS", evidence: `${shotId} visibly performs its declared semantic action and settles.`})),
  strongestMoment: "ED-14 source-to-bounded-claim handoff is the clearest paragraph resolution.",
  weakestMoment: "ED-13 remains the densest shot but retains a readable stable hold.",
  repairInstruction: null,
};
const agentAssessment = createPackagingParagraphPlayableAgentAssessment({authorization, result, raw: passRaw, assessedAt: "2026-08-13T00:01:04.000Z", reviewerModel: "fixture-visual-director"});
assertPackagingParagraphPlayableAgentAssessment(agentAssessment, {authorization, result});
assert.equal(agentAssessment.status, "AGENT_RECOMMENDS_USER_PLAYABLE_REVIEW");
assert.equal(agentAssessment.boundary.agentRecommendationIsNotUserApproval, true);
const agentOutput = {...readyOutput, agentAssessment: {publicUrl: "/fixture/agent-assessment.json", sha256: "c".repeat(64), assessmentSha256: agentAssessment.assessmentSha256, status: agentAssessment.status}};
const agentReady = createPackagingParagraphPlayableRenderState({authorization, status: "BOUNDED_PLAYABLE_AGENT_RECOMMENDS_USER_REVIEW", attemptId: queued.attemptId, updatedAt: "2026-08-13T00:01:05.000Z", output: agentOutput});
assertPackagingParagraphPlayableRenderState(agentReady, {authorization});
assert.equal(agentReady.nextAction.id, "USER_FINAL_PLAYABLE_PARAGRAPH_DECISION");
assert.equal(agentReady.nextAction.requiresUser, true);
const playableRenderForDecision = {authorization, state: agentReady, agentAssessment, agentAssessmentFileSha256: agentOutput.agentAssessment.sha256};
assert.throws(() => createPackagingParagraphPlayableUserDecision({decision: "approve", playableRender: playableRenderForDecision}), /playback-confirmation-required/u);
const playableUserDecision = createPackagingParagraphPlayableUserDecision({decision: "approve", playbackConfirmed: true, playableRender: playableRenderForDecision, decidedAt: "2026-08-13T00:01:07.000Z"});
assertPackagingParagraphPlayableUserDecision(playableUserDecision, {playableRender: playableRenderForDecision});
assert.equal(playableUserDecision.status, "PLAYABLE_PARAGRAPH_USER_APPROVED");
assert.equal(playableUserDecision.boundary.fullFilmVisualApproval, false);
assert.equal(playableUserDecision.boundary.wholeFilmMotionAllowed, false);
const playableRevision = createPackagingParagraphPlayableUserDecision({decision: "revise", note: "ED-13 的阻断动作仍显得过快。", playbackConfirmed: true, playableRender: playableRenderForDecision, decidedAt: "2026-08-13T00:01:08.000Z"});
assert.equal(playableRevision.status, "PLAYABLE_PARAGRAPH_USER_REVISE_REQUIRED");
assert.equal(playableRevision.boundary.repairMediaDispatchAllowed, false);
const repairRaw = structuredClone(passRaw);
repairRaw.verdict = "REPAIR";
repairRaw.dimensions[1].result = "FAIL";
repairRaw.repairInstruction = "Only repair the ED-13 to ED-14 handoff timing; do not regenerate static frames or expand scope.";
const repairAssessment = createPackagingParagraphPlayableAgentAssessment({authorization, result, raw: repairRaw, assessedAt: "2026-08-13T00:01:06.000Z"});
assert.equal(repairAssessment.status, "PLAYABLE_VISUAL_REPAIR_REQUIRED");
assert.equal(repairAssessment.boundary.repairMediaDispatchAllowed, false);

const authorityQueued = createEffectiveReviewAuthority({persistedStatus: status.persistedStatus, persistedNextAction: status.effectiveAuthority.persistedBaseAuthority.nextAction, lifecycle, userDecision, continuation: plan, playableRender: {authorization, state: queued}, userVisualApproval: "NOT_APPROVED"});
assert.equal(authorityQueued.status, "BOUNDED_PLAYABLE_RENDER_QUEUED");
assert.equal(authorityQueued.nextAction.id, "WAIT_FOR_BOUNDED_PLAYABLE_RENDER");
assert.equal(authorityQueued.boundary.boundedPlayableParagraphRenderAllowed, true);
assert.equal(authorityQueued.boundary.motionAllowed, false);
const authorityReady = createEffectiveReviewAuthority({persistedStatus: status.persistedStatus, persistedNextAction: status.effectiveAuthority.persistedBaseAuthority.nextAction, lifecycle, userDecision, continuation: plan, playableRender: {authorization, state: ready}, userVisualApproval: "NOT_APPROVED"});
assert.equal(authorityReady.status, "BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW");
assert.equal(authorityReady.nextAction.id, "AGENT_ACTUAL_PIXEL_REVIEW_PLAYABLE_PARAGRAPH");
assert.equal(authorityReady.boundary.fullFilmVisualApproval, false);
const authorityAgentReady = createEffectiveReviewAuthority({persistedStatus: status.persistedStatus, persistedNextAction: status.effectiveAuthority.persistedBaseAuthority.nextAction, lifecycle, userDecision, continuation: plan, playableRender: {authorization, state: agentReady}, userVisualApproval: "NOT_APPROVED"});
assert.equal(authorityAgentReady.status, "BOUNDED_PLAYABLE_AGENT_RECOMMENDS_USER_REVIEW");
assert.equal(authorityAgentReady.nextAction.id, "USER_FINAL_PLAYABLE_PARAGRAPH_DECISION");
assert.equal(authorityAgentReady.nextAction.requiresExplicitApproval, true);
const authorityPlayableApproved = createEffectiveReviewAuthority({persistedStatus: status.persistedStatus, persistedNextAction: status.effectiveAuthority.persistedBaseAuthority.nextAction, lifecycle, userDecision, continuation: plan, playableRender: {authorization, state: agentReady}, playableUserDecision, userVisualApproval: "NOT_APPROVED"});
assert.equal(authorityPlayableApproved.status, "PLAYABLE_PARAGRAPH_USER_APPROVED");
assert.equal(authorityPlayableApproved.nextAction.id, "AUTHORIZE_TASTE_BOUND_WHOLE_FILM_ROLLOUT");
assert.equal(authorityPlayableApproved.nextAction.requiresExplicitApproval, true);
assert.equal(authorityPlayableApproved.boundary.fullFilmVisualApproval, false);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-playable-render-"));
const temporaryAppRoot = path.join(temporaryRoot, "apps/studio-next");
try {
  for (const entry of implementation.entries) {
    const source = path.join(projectRoot, entry.relativePath);
    const target = path.join(temporaryRoot, entry.relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(source, target);
  }
  fs.mkdirSync(temporaryAppRoot, {recursive: true});
  const first = recordPackagingParagraphPlayableRenderAuthorization(temporaryAppRoot, {plan, userDecision, boundedRenderConfirmed: true, authorizedAt: "2026-08-13T00:01:00.000Z"});
  assert.equal(first.idempotent, false);
  assert.equal(first.state.status, "BOUNDED_PLAYABLE_RENDER_QUEUED");
  const second = recordPackagingParagraphPlayableRenderAuthorization(temporaryAppRoot, {plan, userDecision, boundedRenderConfirmed: true, authorizedAt: "2026-08-13T00:01:09.000Z"});
  assert.equal(second.idempotent, true);
  const runningState = updatePackagingParagraphPlayableRenderState(temporaryAppRoot, {authorization: first.authorization, status: "BOUNDED_PLAYABLE_RENDERING", pid: 12345, updatedAt: "2026-08-13T00:01:01.000Z"});
  assert.equal(runningState.status, "BOUNDED_PLAYABLE_RENDERING");
  const temporaryRenderPaths = packagingParagraphPlayableRenderPaths(temporaryAppRoot, plan.planSha256);
  fs.mkdirSync(temporaryRenderPaths.publicRoot, {recursive: true});
  const temporaryVideoFile = path.join(temporaryRenderPaths.publicRoot, "packaging-paragraph-playable-960x540.mp4");
  const temporaryContactSheetFile = path.join(temporaryRenderPaths.publicRoot, "temporal-contact-sheet.png");
  fs.writeFileSync(temporaryVideoFile, fixtureVideoBytes);
  fs.writeFileSync(temporaryContactSheetFile, fixtureContactSheetBytes);
  const temporaryResult = createPackagingParagraphPlayableRenderResult({authorization: first.authorization, props, generatedAt: "2026-08-13T00:01:02.000Z", video: {publicUrl: `${temporaryRenderPaths.publicUrlRoot}/packaging-paragraph-playable-960x540.mp4`, sha256: shaA, bytes: fixtureVideoBytes.length}, contactSheet: {publicUrl: `${temporaryRenderPaths.publicUrlRoot}/temporal-contact-sheet.png`, sha256: shaB, bytes: fixtureContactSheetBytes.length}, reportPublicUrl: `${temporaryRenderPaths.publicUrlRoot}/result.json`, samples: sampleReports, media: result.media, checks});
  fs.writeFileSync(path.join(temporaryRenderPaths.publicRoot, "result.json"), `${JSON.stringify(temporaryResult, null, 2)}\n`, "utf8");
  const temporaryReadyOutput = {resultSha256: temporaryResult.resultSha256, objectiveAuditStatus: temporaryResult.status, video: temporaryResult.output.video, contactSheet: temporaryResult.output.contactSheet, reportPublicUrl: temporaryResult.output.reportPublicUrl};
  const readyState = updatePackagingParagraphPlayableRenderState(temporaryAppRoot, {authorization: first.authorization, status: "BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW", output: temporaryReadyOutput, updatedAt: "2026-08-13T00:01:03.000Z"});
  assert.equal(readyState.status, "BOUNDED_PLAYABLE_RENDER_READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW");
  const reviewingState = updatePackagingParagraphPlayableRenderState(temporaryAppRoot, {authorization: first.authorization, status: "BOUNDED_PLAYABLE_AGENT_REVIEWING", output: temporaryReadyOutput, updatedAt: "2026-08-13T00:01:04.000Z"});
  assert.equal(reviewingState.status, "BOUNDED_PLAYABLE_AGENT_REVIEWING");
  const temporaryAgentAssessment = createPackagingParagraphPlayableAgentAssessment({authorization: first.authorization, result: temporaryResult, raw: passRaw, assessedAt: "2026-08-13T00:01:04.000Z", reviewerModel: "fixture-visual-director"});
  const temporaryAssessmentFile = path.join(temporaryRenderPaths.publicRoot, "agent-visual-director-assessment.json");
  fs.writeFileSync(temporaryAssessmentFile, `${JSON.stringify(temporaryAgentAssessment, null, 2)}\n`, "utf8");
  const temporaryAssessmentFileSha256 = crypto.createHash("sha256").update(fs.readFileSync(temporaryAssessmentFile)).digest("hex");
  const tempAgentOutput = {...temporaryReadyOutput, agentAssessment: {publicUrl: `${temporaryRenderPaths.publicUrlRoot}/agent-visual-director-assessment.json`, sha256: temporaryAssessmentFileSha256, assessmentSha256: temporaryAgentAssessment.assessmentSha256, status: temporaryAgentAssessment.status}};
  const tempAgentReady = updatePackagingParagraphPlayableRenderState(temporaryAppRoot, {authorization: first.authorization, status: "BOUNDED_PLAYABLE_AGENT_RECOMMENDS_USER_REVIEW", output: tempAgentOutput, updatedAt: "2026-08-13T00:01:05.000Z"});
  assert.equal(tempAgentReady.status, "BOUNDED_PLAYABLE_AGENT_RECOMMENDS_USER_REVIEW");
  const tempPlayableRender = readPackagingParagraphPlayableRender(temporaryAppRoot, {plan, userDecision});
  assert.equal(tempPlayableRender.agentAssessment.assessmentSha256, temporaryAgentAssessment.assessmentSha256);
  assert.equal(tempPlayableRender.agentAssessmentFileSha256, temporaryAssessmentFileSha256);
  assert.equal(assertPackagingParagraphPlayableReviewFiles(temporaryAppRoot, tempPlayableRender).result.resultSha256, temporaryResult.resultSha256);
  const recordedPlayableDecision = recordPackagingParagraphPlayableUserDecision(temporaryAppRoot, {decision: "approve", playbackConfirmed: true, playableRender: tempPlayableRender, decidedAt: "2026-08-13T00:01:07.000Z"});
  assert.equal(recordedPlayableDecision.idempotent, false);
  assert.equal(recordedPlayableDecision.receipt.status, "PLAYABLE_PARAGRAPH_USER_APPROVED");
  const repeatedPlayableDecision = recordPackagingParagraphPlayableUserDecision(temporaryAppRoot, {decision: "approve", playbackConfirmed: true, playableRender: tempPlayableRender, decidedAt: "2026-08-13T00:02:00.000Z"});
  assert.equal(repeatedPlayableDecision.idempotent, true);
  assert.equal(readPackagingParagraphPlayableUserDecision(temporaryAppRoot, {playableRender: tempPlayableRender}).decisionSha256, recordedPlayableDecision.receipt.decisionSha256);
  assert.throws(() => recordPackagingParagraphPlayableUserDecision(temporaryAppRoot, {decision: "revise", note: "change", playbackConfirmed: true, playableRender: tempPlayableRender}), /immutable-conflict/u);
  fs.appendFileSync(temporaryVideoFile, "tampered");
  assert.throws(() => assertPackagingParagraphPlayableReviewFiles(temporaryAppRoot, tempPlayableRender), /review-file-sha-invalid:video/u);
  assert.throws(() => updatePackagingParagraphPlayableRenderState(temporaryAppRoot, {authorization: first.authorization, status: "BOUNDED_PLAYABLE_RENDERING"}), /transition-invalid/u);
} finally {
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
}

const temporaryRetryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-paragraph-playable-render-retry-"));
const temporaryRetryAppRoot = path.join(temporaryRetryRoot, "apps/studio-next");
try {
  for (const entry of implementation.entries) {
    const source = path.join(projectRoot, entry.relativePath);
    const target = path.join(temporaryRetryRoot, entry.relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(source, target);
  }
  fs.mkdirSync(temporaryRetryAppRoot, {recursive: true});
  const firstAttempt = recordPackagingParagraphPlayableRenderAuthorization(temporaryRetryAppRoot, {plan, userDecision, boundedRenderConfirmed: true, authorizedAt: "2026-08-13T00:03:00.000Z"});
  updatePackagingParagraphPlayableRenderState(temporaryRetryAppRoot, {authorization: firstAttempt.authorization, status: "BOUNDED_PLAYABLE_RENDERING", pid: 12346, updatedAt: "2026-08-13T00:03:01.000Z"});
  const failedAttempt = updatePackagingParagraphPlayableRenderState(temporaryRetryAppRoot, {authorization: firstAttempt.authorization, status: "BOUNDED_PLAYABLE_RENDER_FAILED", failure: "paragraph-playable-render-objective-audit-failed:durationWithinOneFrame", updatedAt: "2026-08-13T00:03:02.000Z"});
  const retry = recordPackagingParagraphPlayableRenderAuthorization(temporaryRetryAppRoot, {plan, userDecision, boundedRenderConfirmed: true, authorizedAt: "2026-08-13T00:04:00.000Z"});
  assert.equal(retry.retried, true);
  assert.equal(retry.idempotent, false);
  assert.equal(retry.state.status, "BOUNDED_PLAYABLE_RENDER_QUEUED");
  assert.notEqual(retry.authorization.authorizationSha256, firstAttempt.authorization.authorizationSha256);
  assert.equal(retry.previousAttempt.stateSha256, failedAttempt.stateSha256);
  assert.equal(JSON.parse(fs.readFileSync(path.join(retry.previousAttempt.historyBundle, "state.json"), "utf8")).stateSha256, failedAttempt.stateSha256);
} finally {
  fs.rmSync(temporaryRetryRoot, {recursive: true, force: true});
}

const productionStateAfter = {
  bundleExists: fs.existsSync(productionFixturePaths.bundle),
  authorizationBytes: fs.existsSync(productionFixturePaths.authorization) ? fs.readFileSync(productionFixturePaths.authorization) : null,
  stateBytes: fs.existsSync(productionFixturePaths.state) ? fs.readFileSync(productionFixturePaths.state) : null,
};
assert.deepEqual(productionStateAfter, productionStateBefore);

console.log(JSON.stringify({status: "PASS", authorityScope: status.packagingParagraphLifecycle ? "CURRENT" : "HISTORY_ONLY_COMPATIBILITY", contract: authorization.contract, playableDecisionContract: playableUserDecision.contract, compositionId: props.compositionId, sourceAlignedDurationMs: plan.timeline.durationMs, encodedDurationMs: props.timeline.encodedDurationMs, durationInFrames: props.durationInFrames, authoritativeSourceRangeFullyCovered: framePlan.quantization.authoritativeSourceRangeFullyCovered, sourceAudioPlaybackRate: props.audio.playbackRate, semanticActionCount: props.shots.length, automaticDispatch: authorization.render.automaticDispatch, automaticObjectiveAudit: authorization.render.automaticObjectiveAudit, automaticAgentReview: true, explicitRenderConfirmationRequired: true, explicitPlaybackConfirmationRequired: true, immutableAuthorization: true, immutablePlayableDecision: true, stateMachineVerified: true, workspaceMutationAllowed: authorization.boundary.workspaceMutationAllowed, userVisualApproval: authorization.boundary.workspaceUserVisualApproval, wholeFilmMotionAllowed: authorization.boundary.wholeFilmMotionAllowed, resolveAllowed: authorization.boundary.resolveAllowed, finalRenderAllowed: authorization.boundary.finalRenderAllowed, productionStateUnchanged: true}, null, 2));
