import assert from "node:assert/strict";
import fs from "node:fs";
import {motionReviewSource, assertMotionReviewBinding, assertMotionReviewReceipt} from "../apps/studio-next/src/lib/a1-shot-motion-review-v1.mjs";
import {applyCurrentStoryboardShotPatch} from "../apps/studio-next/src/lib/a1-current-storyboard-editor-v1.mjs";

const w = JSON.parse(fs.readFileSync(new URL("../apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json", import.meta.url)));
const shot = w.production.shotIntelligence.currentStoryboardAuthority.shots.find((s) => s.shotId === "ED-12");
const receipt = {contract: "A1ShotMotionReviewReceipt/v1", shotId: shot.shotId, source: motionReviewSource(shot), usageMode: "INTERNAL_REVIEW_CANARY_ONLY", productionAdmission: false, userVisualApproval: "NOT_APPROVED", validation: {decoded: true, finalFrameMatchesSource: true}, video: {sha256: "a".repeat(64)}, rendererSha256: "b".repeat(64)};
assert.doesNotThrow(() => assertMotionReviewReceipt(shot, receipt));
for (const field of ["versionId", "artifactSha256", "motionDesignSha256", "durationMs", "semanticSha256"]) {
  const stale = structuredClone(receipt);
  stale.source[field] = "changed";
  assert.throws(() => assertMotionReviewBinding(shot, stale), /motion-review-stale/);
}
assert.throws(() => assertMotionReviewReceipt(shot, {...receipt, productionAdmission: true}), /approval-forbidden/);
assert.throws(() => assertMotionReviewReceipt({...shot, prototypeEligible: false}, receipt), /authorization-required/);
assert.throws(() => assertMotionReviewReceipt(shot, {...receipt, validation: {decoded: true}}), /pixel-proof-required/);

const fixture = structuredClone(w);
fixture.production.shotIntelligence.currentStoryboardAuthority.shots.find((s) => s.shotId === "ED-12").motionReviewReceipt = {...receipt, status: "READY_FOR_USER_REVIEW"};
const changed = applyCurrentStoryboardShotPatch(fixture, {shotId: "ED-12", semanticJob: "测试：修改语义必须使旧动画失效"});
const nextShot = changed.production.shotIntelligence.currentStoryboardAuthority.shots.find((s) => s.shotId === "ED-12");
assert.equal(nextShot.motionReviewReceipt.status, "STALE_REVIEW_REQUIRED");
assert.equal(nextShot.singleShotMotionCanaryAuthorization, null);
assert.equal(nextShot.prototypeEligible, false);
assert.equal(nextShot.motionDesignContract, null);
assert.equal(nextShot.motionDesignStatus, "RECOMPILE_REQUIRED");
assert.equal(nextShot.motionReviewReceipt.video.sha256, receipt.video.sha256);
assert.deepEqual(changed.production.shotIntelligence.currentStoryboardAuthority.shots.find((s) => s.shotId === "ED-14"), fixture.production.shotIntelligence.currentStoryboardAuthority.shots.find((s) => s.shotId === "ED-14"));
assert.equal(changed.production.shotIntelligence.currentStoryboardAuthority.productionAdmission, false);
console.log(JSON.stringify({status: "PASS", checks: ["source-version-sha-timing-semantics-bound", "approval-escalation-rejected", "canary-authorization-required", "editing-invalidates-output-and-authorization", "unrelated-shots-preserved"]}));
