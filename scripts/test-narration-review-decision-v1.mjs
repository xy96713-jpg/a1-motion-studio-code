#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {applyNarrationReviewDecision} from "../apps/studio-next/src/lib/a1-narration-review-decision-v1.mjs";

const workspace = JSON.parse(fs.readFileSync("apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json", "utf8"));
const sourceInput = JSON.parse(fs.readFileSync("work/current-narration-review-decision-20260915/input.json", "utf8"));
const queueSha256 = "b".repeat(64);
for (const shotId of ["ED-14", "ED-20"]) {
  const shot = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === shotId);
  shot.motionReviewPlan.viewerReview = {status: "NARRATION_CONFLICT"};
  shot.motionReviewPlan.viewerRequirements.narrationAligned = false;
}
const input = {...sourceInput, queueSha256};
const queue = {
  contract: "A1SystemLineReviewQueue/v1",
  source: {workspaceSha256: workspace.workspaceSha256},
  queueSha256,
  items: input.items.map((item) => ({
    shotId: item.shotId,
    category: "narration",
    queueStatus: "READY_FOR_USER_REVIEW",
    candidate: {text: item.text, audio: {publicUrl: item.audio.publicUrl, sha256: item.audio.sha256}, video: {publicUrl: item.video.publicUrl, sha256: item.video.sha256}},
  })),
};
const before = {
  workspaceSha256: workspace.workspaceSha256,
  gates: structuredClone(workspace.gates),
  approval: workspace.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval,
};
const applied = applyNarrationReviewDecision(workspace, queue, input, "2026-09-15T00:00:00.000Z");
const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(applied.workspace, "2026-09-15T00:00:00.000Z"));
for (const shotId of ["ED-14", "ED-20"]) {
  const shot = recalculated.production.shotIntelligence.currentStoryboardAuthority.shots.find((item) => item.shotId === shotId);
  assert.equal(shot.motionReviewPlan.viewerReview.status, "PENDING_INTERNAL_SEQUENCE_REVIEW");
  assert.equal(shot.motionReviewPlan.viewerRequirements.narrationAligned, true);
  assert.equal(shot.motionReviewReceipt.validation.narrationReview.status, "USER_APPROVED");
  assert.equal(shot.motionReviewReceipt.productionAdmission, false);
  assert.equal(shot.motionReviewReceipt.userVisualApproval, "NOT_APPROVED");
}
assert.deepEqual(recalculated.gates, before.gates);
assert.equal(recalculated.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval, before.approval);
assert.equal(applied.decision.decisions.length, 2);
assert.equal(applied.decision.boundaries.motionAllowed, false);
assert.throws(() => applyNarrationReviewDecision(workspace, {...queue, queueSha256: "c".repeat(64)}, input), /queue-stale/);
console.log(JSON.stringify({contract: "A1NarrationReviewDecisionTest/v1", status: "PASS", shotIds: applied.decision.decisions.map((item) => item.shotId), decisionSha256: applied.decision.decisionSha256}, null, 2));
