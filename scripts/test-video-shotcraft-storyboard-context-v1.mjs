#!/usr/bin/env node
import assert from "node:assert/strict";
import {deriveVideoShotcraftContextFromStoryboardShot} from "../apps/studio-next/src/lib/a1-video-shotcraft-storyboard-context-v1.mjs";

const capturedSource = {exists: true, shaMatches: true, sha256: "a".repeat(64), width: 2560, height: 1440};
const screen = (actionId, hold, extras = {}) => ({shotId: `screen-${actionId}`, order: 2, route: "SCREEN_EVIDENCE", source: "REAL_SOURCE", semanticJob: hold, sourceText: hold, actionContract: {before: "before", hold, after: "after"}, motionReviewPlan: {capturedSource}, screenStoryboard: {actionId, semanticJob: hold, actionContract: {hold}, presentationPolicy: {telemetryRetainedForTimingOnly: true}, causalPlan: {actionCount: 1}, cameraDirection: {motionWindows: extras.motionWindows || [{id: "one"}]}, frames: {setup: {sha256: "b".repeat(64)}, result: {sha256: "c".repeat(64)}}}});
const cases = [
  [screen("review", "点击后系统逐项标出建议"), "ai-stream-response"],
  [screen("presentation", "打开演示模式并调整滚动速度"), "scroll-brake"],
  [screen("paragraph", "双击空行输入需求并提交"), "single-click-trigger"],
  [screen("paragraph", "系统返回多个候选并逐项查看"), "ai-stream-response"],
  [screen("historyIsolation", "切换到另一篇文章验证主题隔离"), "theme-switch"],
  [screen("saveHistory", "关闭并重新打开核对最新版"), "before-after-comparison"],
];
for (const [shot, expected] of cases) assert.equal(deriveVideoShotcraftContextFromStoryboardShot(shot).context.intentId, expected);
assert.equal(deriveVideoShotcraftContextFromStoryboardShot({shotId: "presenter", route: "PRESENTER_BASE", source: "PRESENTER_BASE"}).disposition, "SKIP_SOURCE_LED");
assert.equal(deriveVideoShotcraftContextFromStoryboardShot({...screen("presentation", "native full-state interaction"), screenStoryboard: {...screen("presentation", "native full-state interaction").screenStoryboard, cameraDirection: {motionWindows: [], resultTargetAdmission: {status: "NOT_REQUIRED", reason: "FULL_STATE_KEEP_ACTION_COMPOSITION"}}}}).reason, "NATIVE_FULL_STATE_ACTION_ALREADY_DIRECTS_ATTENTION");
assert.equal(deriveVideoShotcraftContextFromStoryboardShot({shotId: "physical", order: 10, route: "PACKAGE_LOOK_MASTER", source: "GENERATED_EDITORIAL", semanticJob: "single physical metaphor", actionContract: {before: "before", hold: "object moves", after: "after"}}).disposition, "REVIEW_REQUIRED");
assert.equal(deriveVideoShotcraftContextFromStoryboardShot({shotId: "steps", order: 17, route: "PACKAGE_LOOK_MASTER", source: "GENERATED_EDITORIAL", semanticJob: "三个步骤按顺序形成工作流", actionContract: {before: "before", hold: "按顺序", after: "after"}}).context.intentId, "timeline-travel");
console.log(JSON.stringify({status: "PASS", contract: "A1VideoShotcraftStoryboardContextTest/v1", screenCases: cases.length, presenterSkipped: true, unsafeMetaphorHeldForReview: true, reusableProcessMapped: true}, null, 2));
