#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(fs.readFileSync(path.join(
  root,
  "work/remotion-screen-coverage-wave15-v1/plan.json",
), "utf8"));

assert.equal(plan.status, "READY");
assert.equal(plan.shotCount, 15);
assert.ok(plan.familyCount >= 7, "semantic-family-diversity-too-low");

const dynamicItems = plan.items.filter((item) =>
  item.resultRegionSource === "VERIFIED_PIXEL_DELTA");
const staticItems = plan.items.filter((item) =>
  item.resultRegionSource === "FULL_STATE");
const scaleSignatures = new Set(dynamicItems.map((item) =>
  item.poses.map((pose) => pose.scale).join("/")));
const contextDurations = new Set(dynamicItems
  .filter((item) => item.poses[0]?.id === "WIDE_CONTEXT")
  .map((item) => item.poses[1]?.atMs));

assert.ok(dynamicItems.length >= 10, "dynamic-coverage-count-too-low");
assert.ok(staticItems.length >= 3, "static-state-coverage-count-too-low");
assert.ok(scaleSignatures.size >= 5, "coverage-scale-signatures-too-uniform");
assert.ok(contextDurations.size >= 4, "coverage-context-timing-too-uniform");
assert.ok(staticItems.every((item) =>
  item.strategy === "WIDE_TO_STABLE_STATE_CUT" &&
  item.poses.every((pose) => pose.scale === 1)),
"static-state-must-remain-full-frame");
assert.ok(plan.items.every((item) => item.poses.every((pose) =>
  pose.transition === "HARD_CUT" &&
  pose.continuousPanAllowed === false &&
  pose.motionBlurAllowed === false)),
"floating-camera-motion-forbidden");
assert.ok(plan.items.every((item) =>
  item.poses.at(-1).atMs <=
  JSON.parse(fs.readFileSync(path.join(root, item.propsPath), "utf8"))
    .scenes[0].durationMs - 800),
"result-hold-below-800ms");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ScreenCoverageFamilyDiversityAudit/v1",
  shotCount: plan.shotCount,
  familyCount: plan.familyCount,
  dynamicShotCount: dynamicItems.length,
  staticShotCount: staticItems.length,
  distinctScaleSignatureCount: scaleSignatures.size,
  distinctContextTimingCount: contextDurations.size,
  floatingCameraMotionCount: 0,
  scaleSignatures: [...scaleSignatures].sort(),
}, null, 2));
