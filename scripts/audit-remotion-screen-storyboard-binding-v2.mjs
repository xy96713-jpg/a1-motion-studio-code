#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const workspacePath = path.join(
  publicRoot,
  "generated/system-line/editorial-asset-workbench-v1/workspace.json",
);
const planPath = path.join(
  root,
  "work/remotion-screen-coverage-wave15-v1/plan.json",
);
const reportPath = path.join(
  publicRoot,
  "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v2/report.json",
);
const sha256 = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
if (workspace.production?.shotIntelligence?.currentStoryboardAuthority?.screenStoryboardWave?.version === "EVENT_SETTLE_V1") {
  console.log(JSON.stringify({
    status: "NOT_APPLICABLE",
    contract: "A1RemotionScreenStoryboardBindingAudit/v2",
    supersededBy: "A1EventSettleScreenStoryboardBindingAudit/v1",
  }, null, 2));
  process.exit(0);
}
const nextAction = workspace.production?.authority?.nextAction?.id;
if (nextAction !== "review-screen-storyboard-wave-15") {
  console.log(JSON.stringify({
    status: "NOT_APPLICABLE",
    contract: "A1RemotionScreenStoryboardBindingAudit/v2",
    nextAction,
  }, null, 2));
  process.exit(0);
}

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const authority =
  workspace.production.shotIntelligence.currentStoryboardAuthority;
const wave = authority.screenStoryboardWave;

assert.equal(plan.status, "READY");
assert.equal(plan.items.length, 15);
assert.equal(report.status, "READY_FOR_USER_SHOT_BY_SHOT_REVIEW");
assert.equal(report.shotCount, 15);
assert.equal(report.sourceCoveragePlanSha256, plan.planSha256);
assert.ok(
  ["READY_FOR_USER_SHOT_BY_SHOT_REVIEW", "SHOT_REVIEW_IN_PROGRESS"]
    .includes(wave.status),
  "current-wave-review-status-invalid",
);
assert.equal(wave.shotIds.length, 15);
const decisions = Object.values(wave.decisions || {});
const approvedCount = decisions.filter((item) =>
  item.status === "APPROVED").length;
const revisionCount = decisions.filter((item) =>
  item.status === "REVISION_REQUIRED").length;
assert.equal(wave.approvedCount, approvedCount);
assert.equal(wave.revisionCount, revisionCount);
assert.equal(wave.pendingCount, 15 - approvedCount - revisionCount);
assert.equal(
  wave.approvedCount + wave.revisionCount + wave.pendingCount,
  15,
  "review-counts-must-conserve-wave-size",
);
assert.equal(workspace.production.motion.fullMotionAllowed, false);
assert.notEqual(
  workspace.production.motion.fullFilmMotionSpecPlan?.status,
  "READY",
);

const items = plan.items.map((item) => {
  const shot = authority.shots.find((candidate) =>
    candidate.shotId === item.shotId);
  const reportShot = report.shots.find((candidate) =>
    candidate.shotId === item.shotId);
  assert.ok(shot, `${item.shotId}:workspace-shot-missing`);
  assert.ok(reportShot, `${item.shotId}:report-shot-missing`);
  assert.equal(shot.screenStoryboard?.narrationBinding?.status, "PASS");
  assert.equal(shot.screenStoryboard?.causalPlan?.status, "PASS");
  assert.ok([
    "READY_FOR_USER_SHOT_BY_SHOT_REVIEW",
    "APPROVED",
    "REVISION_REQUIRED",
  ].includes(shot.screenStoryboard?.reviewStatus));
  assert.equal(shot.backgroundScreenCandidate?.productionAdmission, false);
  const decision = wave.decisions?.[item.shotId];
  if (decision) {
    assert.equal(decision.revisionSha256, shot.revisionSha256,
      `${item.shotId}:decision-revision-drift`);
    assert.equal(decision.videoSha256, shot.screenStoryboard.video.sha256,
      `${item.shotId}:decision-video-drift`);
    assert.equal(decision.boardSha256, shot.screenStoryboard.board.sha256,
      `${item.shotId}:decision-board-drift`);
  }

  const sourceFile = path.join(root, item.outputPath);
  const publicUrl = shot.screenStoryboard.video.publicUrl;
  const publicFile = path.join(publicRoot, publicUrl.replace(/^\//u, ""));
  const sourceSha256 = sha256(sourceFile);
  const publicSha256 = sha256(publicFile);
  assert.equal(shot.screenStoryboard.video.sha256, sourceSha256,
    `${item.shotId}:workspace-source-sha-drift`);
  assert.equal(reportShot.video.sha256, sourceSha256,
    `${item.shotId}:report-source-sha-drift`);
  assert.equal(publicSha256, sourceSha256,
    `${item.shotId}:public-source-sha-drift`);
  assert.equal(
    shot.backgroundScreenCandidate.storyboardReviewVideo.sha256,
    sourceSha256,
    `${item.shotId}:review-video-sha-drift`,
  );
  return {shotId: item.shotId, sha256: sourceSha256};
});

const contactSheetFile = path.join(
  publicRoot,
  wave.contactSheet.publicUrl.replace(/^\//u, ""),
);
assert.equal(sha256(contactSheetFile), wave.contactSheet.sha256);
assert.equal(report.contactSheet.sha256, wave.contactSheet.sha256);
const continuousReviewFile = path.join(
  publicRoot,
  wave.continuousReview.publicUrl.replace(/^\//u, ""),
);
assert.equal(sha256(continuousReviewFile), wave.continuousReview.sha256);
assert.equal(report.continuousReview.sha256, wave.continuousReview.sha256);
assert.ok(wave.continuousReview.durationMs > 100_000);
assert.equal(wave.screenCoverage.status, "PARTIAL_BLOCKED");
assert.equal(wave.screenCoverage.routeShotCount, 16);
assert.equal(wave.screenCoverage.reviewReadyCount, 15);
assert.deepEqual(wave.screenCoverage.blockedShotIds, ["ED-20"]);
assert.equal(wave.screenCoverage.blockers[0].expectedActionId,
  "codexMaterialToWorkbench");
assert.equal(wave.screenCoverage.blockers[0].availableSourceActionId, "review");
assert.match(wave.screenCoverage.blockers[0].availableEvidencePublicUrl,
  /ed-20-screen-evidence-960x540\.mp4$/u);
assert.match(wave.screenCoverage.blockers[0].semanticAlternativePublicUrl,
  /ed20-workflow-explainer-candidate-960x540\.mp4$/u);
const semanticAlternativeFile = path.join(
  publicRoot,
  wave.screenCoverage.blockers[0].semanticAlternativePublicUrl.replace(/^\//u, ""),
);
assert.equal(sha256(semanticAlternativeFile),
  wave.screenCoverage.blockers[0].semanticAlternativeSha256);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1RemotionScreenStoryboardBindingAudit/v2",
  workspaceSha256: workspace.workspaceSha256,
  checkedShotCount: items.length,
  contactSheetSha256: wave.contactSheet.sha256,
  boundaries: {
    approvedCount: wave.approvedCount,
    revisionCount: wave.revisionCount,
    pendingCount: wave.pendingCount,
    productionAdmission: false,
    fullMotionAllowed: workspace.production.motion.fullMotionAllowed,
  },
}, null, 2));
