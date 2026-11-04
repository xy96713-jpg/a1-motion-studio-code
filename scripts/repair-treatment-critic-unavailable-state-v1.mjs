#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const isUnavailableReview = (review) => review?.verdict === "UNAVAILABLE"
  || review?.criticTrace?.criticUnavailable === true
  || (review?.hardFailures || []).includes("visual-critic-unavailable");

const compactReason = (value) => {
  const message = String(value || "");
  if (/failed to lookup address|nodename nor servname|ENOTFOUND|EAI_AGAIN/iu.test(message)) return "visual-critic-network-unavailable:dns-resolution-failed";
  const timeout = message.match(/treatment-batch-critic-timeout:\d+s/u)?.[0];
  if (timeout) return timeout;
  const cliFailure = message.match(/treatment-batch-critic-failed:([^\s:]+)/u)?.[1];
  if (cliFailure) return `visual-critic-cli-failed:exit-${cliFailure}`;
  return message.replace(/\s+/gu, " ").slice(0, 600) || "visual-treatment-critic-unavailable";
};

const normalizedStability = (reason) => ({
  contract: "A1VisualTreatmentReviewStability/v1",
  mode: "content-addressed-single-batch",
  requiredReviewCount: 1,
  reviewCount: 0,
  minScore: null,
  medianScore: null,
  maxScore: null,
  stablePass: false,
  status: "critic-unavailable",
  reason,
  history: [],
});

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const director = next.production.visualDirector;
  const trace = director.treatmentBatchReview?.trace || null;
  const reason = compactReason(director.treatmentBatchProgress?.error
    || trace?.criticUnavailableReason
    || "visual-treatment-critic-unavailable");
  const affectedCandidateIds = [];

  for (const candidate of director.generatedCandidates || []) {
    if (candidate.generationRole !== "treatment-anchor" || !isUnavailableReview(candidate.compositeReview)) continue;
    affectedCandidateIds.push(candidate.id);
    candidate.status = "composite-review-unavailable";
    candidate.compositeReview = {
      ...candidate.compositeReview,
      scores: null,
      totalScore: null,
      hardFailures: [],
      verdict: "UNAVAILABLE",
      confidence: "none",
      visualEvidence: "视觉审片器未返回有效结果；该状态不代表视觉得分或构图结论。",
      exactTextStatus: "unreviewed",
      structuredRevision: null,
      reviewHistory: [],
      stability: normalizedStability(reason),
      reviewedAt: now,
    };
    candidate.updatedAt = now;
  }

  director.compositeReviews = (director.compositeReviews || []).map((review) => {
    if (!affectedCandidateIds.includes(review.candidateId) && !isUnavailableReview(review)) return review;
    return {
      ...review,
      scores: null,
      totalScore: null,
      hardFailures: [],
      verdict: "UNAVAILABLE",
      confidence: "none",
      visualEvidence: "视觉审片器未返回有效结果；该状态不代表视觉得分或构图结论。",
      exactTextStatus: "unreviewed",
      structuredRevision: null,
      reviewHistory: [],
      stability: normalizedStability(reason),
      reviewedAt: now,
    };
  });

  if (director.treatmentBatchReview?.trace?.criticUnavailable === true
    || director.treatmentBatchReview?.status === "UNAVAILABLE") {
    director.treatmentBatchReview = {
      ...director.treatmentBatchReview,
      status: "UNAVAILABLE",
      championTreatmentId: null,
      nextAction: "restore-visual-treatment-critic",
      directions: (director.treatmentBatchReview.directions || []).map((direction) => ({
        ...direction,
        passCount: 0,
        averageScore: null,
        minScore: null,
        unavailableCount: direction.itemCount,
        hardFailureCount: 0,
        status: "UNAVAILABLE",
      })),
      reviewedAt: now,
    };
  }

  director.treatmentBatchProgress = {
    ...(director.treatmentBatchProgress || {}),
    contract: "A1TreatmentBatchProgress/v1",
    status: "failed",
    phase: "critic-unavailable",
    completedCount: 0,
    totalCount: Number(director.treatmentBatchReview?.candidateCount || affectedCandidateIds.length || 6),
    batchHash: trace?.batchHash || director.treatmentBatchProgress?.batchHash || null,
    timeoutMs: Number(director.treatmentBatchProgress?.timeoutMs || 0) || null,
    elapsedMs: Number(trace?.durationMs || director.treatmentBatchProgress?.elapsedMs || 0),
    heartbeatAt: now,
    compositorSourceSha256: director.treatmentBatchProgress?.compositorSourceSha256 || "",
    error: reason,
  };
  director.treatmentReviewPolicy = {
    ...(director.treatmentReviewPolicy || {}),
    status: "BLOCKED_VISUAL_CRITIC_UNAVAILABLE",
    blocker: reason,
    blockedAt: now,
  };
  director.status = "treatment-review-required";
  director.updatedAt = now;
  next.production.generation.automaticDispatchAllowed = false;
  next.production.maturityLoop.currentStage = "visual-treatment";
  next.production.maturityLoop.status = "visual-critic-unavailable";
  next.production.maturityLoop.nextAction = "restore-visual-treatment-critic";

  const event = createProductionEvent({
    workspace: current,
    action: "visual-treatment-batch-critic-unavailable-normalized",
    targetId: trace?.batchHash || "visual-treatment-3x2",
    payload: {
      affectedCandidateIds,
      batchHash: trace?.batchHash || null,
      reason,
      scoreRecorded: false,
      generationDispatchAllowed: false,
      nextAction: "restore-visual-treatment-critic",
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {workspace: recalculated, event, affectedCandidateIds, reason};
});

console.log(JSON.stringify({
  contract: "A1TreatmentCriticUnavailableStateRepair/v1",
  status: "PASS",
  affectedCandidateCount: result.affectedCandidateIds.length,
  affectedCandidateIds: result.affectedCandidateIds,
  reason: result.reason,
  treatmentAudit: result.workspace.production.authority.visualTreatmentAudit,
  generationFreeze: result.workspace.production.visualDirector.generationFreeze,
  nextAction: result.workspace.production.authority.nextAction,
  gates: result.workspace.gates,
  eventId: result.event.eventId,
  workspaceSha256: result.workspace.workspaceSha256,
}, null, 2));
