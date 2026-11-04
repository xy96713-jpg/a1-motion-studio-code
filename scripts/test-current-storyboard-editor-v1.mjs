#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {applyCurrentStoryboardBatchPatch, applyCurrentStoryboardShotPatch} from "../apps/studio-next/src/lib/a1-current-storyboard-editor-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const beforeEd02 = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((shot) => shot.shotId === "ED-02");
const beforeEd01 = workspace.production.shotIntelligence.currentStoryboardAuthority.shots.find((shot) => shot.shotId === "ED-01");
const beforeCoverage = workspace.production.shotVisualCoveragePlan.shotPlans.find((shot) => shot.shotId === "ED-01");

const approved = structuredClone(workspace);
approved.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval = "APPROVED";
approved.production.shotIntelligence.wholeFilmStaticBoard.userVisualApproval = "APPROVED";
const currentShot = approved.production.shotIntelligence.currentStoryboardAuthority.shots.find((shot) => shot.shotId === "ED-12");
const unchangedPatch = {shotId: currentShot.shotId, sourceText: currentShot.sourceText, semanticJob: currentShot.semanticJob, route: currentShot.route, presentationMode: currentShot.presentationMode, ...currentShot.actionContract};
assert.equal(applyCurrentStoryboardShotPatch(approved, unchangedPatch), approved);
assert.equal(applyCurrentStoryboardBatchPatch(approved, [unchangedPatch]), approved);
assert.equal(approved.production.shotIntelligence.wholeFilmStaticBoard.userVisualApproval, "APPROVED");
for (const shot of approved.production.shotIntelligence.currentStoryboardAuthority.shots) {
  const uiPatch = {shotId: shot.shotId, sourceText: shot.sourceText, semanticJob: shot.semanticJob, route: shot.route, presentationMode: shot.presentationMode, before: shot.actionContract?.before, hold: shot.actionContract?.hold, after: shot.actionContract?.after, handoff: shot.actionContract?.handoff};
  assert.equal(applyCurrentStoryboardShotPatch(approved, uiPatch), approved, `unchanged UI save:${shot.shotId}`);
}

const next = applyCurrentStoryboardShotPatch(workspace, {
  shotId: "ED-01",
  sourceText: "新版开场关键句",
  semanticJob: "先建立智能写作工作台的产品身份，再交给真实操作。",
  route: "PACKAGE_LOOK_MASTER",
  packageType: "FULLSCREEN_PACKAGE",
  presentationMode: "FULLSCREEN_WORKBENCH_OPENING",
  frameOccupation: "FULL_FRAME_TAKEOVER",
  before: "全屏工作台尚未操作",
  hold: "工作台与标题完整可读",
  after: "交回真人与真实操作",
  handoff: "ED-02_REAL_OPERATION",
  startMs: 0,
  endMs: 3300,
}, "2026-08-25T08:00:00.000Z");

const ed01 = next.production.shotIntelligence.currentStoryboardAuthority.shots.find((shot) => shot.shotId === "ED-01");
const ed02 = next.production.shotIntelligence.currentStoryboardAuthority.shots.find((shot) => shot.shotId === "ED-02");
const coverage = next.production.shotVisualCoveragePlan.shotPlans.find((shot) => shot.shotId === "ED-01");
const timeline = next.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items.find((shot) => shot.shotId === "ED-01");

assert.equal(ed01.sourceText, "新版开场关键句");
assert.equal(ed01.semanticJob, "先建立智能写作工作台的产品身份，再交给真实操作。");
assert.deepEqual(ed01.stateSequence, ["BEFORE", "HOLD", "AFTER"]);
assert.deepEqual(ed01.actionContract, {
  before: "全屏工作台尚未操作",
  hold: "工作台与标题完整可读",
  after: "交回真人与真实操作",
  handoff: "ED-02_REAL_OPERATION",
});
assert.equal(coverage.sourceText, "新版开场关键句");
assert.equal(coverage.semanticJob, "先建立智能写作工作台的产品身份，再交给真实操作。");
assert.equal(coverage.packageType, "FULLSCREEN_PACKAGE");
assert.equal(coverage.presentationMode, "FULLSCREEN_WORKBENCH_OPENING");
assert.equal(coverage.storyboardRevisionStatus, "CURRENT_REVIEW_REQUIRED");
assert.deepEqual(timeline.timeRange, {startMs: 0, endMs: 3300, durationMs: 3300});
assert.equal(coverage.preview?.publicUrl, beforeCoverage.preview?.publicUrl);
assert.equal(ed01.artifactPublicUrl, beforeEd01.artifactPublicUrl);
assert.deepEqual(ed02, beforeEd02);
assert.equal(next.production.shotIntelligence.currentStoryboardAuthority.userVisualApproval, "NOT_APPROVED");
assert.equal(next.production.shotIntelligence.wholeFilmStaticBoard.userVisualApproval, "NOT_APPROVED");
assert.equal(next.production.shotIntelligence.wholeFilmStaticBoard.approvalAllowed, true);
assert.equal(next.production.shotIntelligence.wholeFilmStaticBoard.productionAdmission, false);
assert.equal(next.production.motion.fullMotionAllowed, false);

assert.throws(() => applyCurrentStoryboardShotPatch(workspace, {shotId: "ED-99", sourceText: "x"}), /storyboard-shot-not-found/);
assert.throws(() => applyCurrentStoryboardShotPatch(workspace, {shotId: "ED-01", route: "CSS_PLACEHOLDER"}), /storyboard-route-invalid/);
assert.throws(() => applyCurrentStoryboardShotPatch(workspace, {shotId: "ED-01", before: "", hold: "x", after: "x"}), /storyboard-action-contract-incomplete/);
const batch = applyCurrentStoryboardBatchPatch(workspace, [
  {shotId: "ED-02", semanticJob: "批量语义二"},
  {shotId: "ED-03", semanticJob: "批量语义三"},
], "2026-08-25T08:00:00.000Z");
assert.equal(batch.production.shotVisualCoveragePlan.shotPlans.find((shot) => shot.shotId === "ED-02").semanticJob, "批量语义二");
assert.equal(batch.production.shotVisualCoveragePlan.shotPlans.find((shot) => shot.shotId === "ED-03").semanticJob, "批量语义三");
assert.throws(() => applyCurrentStoryboardBatchPatch(workspace, [{shotId: "ED-02"}, {shotId: "ED-02"}]), /storyboard-batch-duplicate-shot/);

console.log(JSON.stringify({status: "PASS", contract: "A1CurrentStoryboardEditorTest/v1", shotId: ed01.shotId}, null, 2));
