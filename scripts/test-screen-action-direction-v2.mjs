#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  compileScreenActionDirectionV2,
  minimumJerk,
  minimumJerkAcceleration,
  minimumJerkVelocity,
} from "../apps/studio-next/src/lib/a1-screen-action-direction-v2.mjs";
const base = {
  durationMs: 6000,
  fps: 60,
  sourceCanvas: { width: 1280, height: 720 },
  outputCanvas: { width: 960, height: 540 },
  resultHoldStartMs: 4800,
};
const center = compileScreenActionDirectionV2({
  ...base,
  shotId: "CAL-CENTER",
  actionAtMs: 1600,
  actionRegion: { x: 0.42, y: 0.42, width: 0.16, height: 0.16 },
});
const offset = compileScreenActionDirectionV2({
  ...base,
  shotId: "CAL-OFFSET",
  actionAtMs: 2100,
  actionRegion: { x: 0.66, y: 0.3, width: 0.2, height: 0.2 },
});
const actor = compileScreenActionDirectionV2({
  ...base,
  shotId: "CAL-ACTOR",
  actionAtMs: 1600,
  actionRegion: { x: 0.2, y: 0.3, width: 0.2, height: 0.15 },
  attentionActors: [
    {
      id: "actor",
      kind: "SOURCE_BOUND_FOCUS_WINDOW",
      selector: "#verified",
      sourceCropSha256: "a".repeat(64),
      evidenceAtMs: 4000,
      geometry: { x: 0.66, y: 0.25, width: 0.28, height: 0.24 },
      phases: { enterMs: 3900, peakMs: 4080, holdEndMs: 5200, exitEndMs: 5500 },
    },
  ],
});
for (const result of [center, offset, actor]) {
  assert.equal(result.status, "PASS", JSON.stringify(result.failures));
  assert.ok(result.cameraPerformance.moveCount <= 1);
  assert.ok(result.cameraPerformance.maximumScale <= 1.18);
  assert.ok(result.diagnostics.maximumAnchorDriftPx <= 0.5);
  assert.ok(result.diagnostics.maximumHoldDriftPx <= 0.1);
  assert.ok(result.diagnostics.entryVelocityRatio <= 0.02);
  assert.ok(result.diagnostics.exitVelocityRatio <= 0.02);
  assert.ok(Math.abs(result.diagnostics.entryAcceleration) < 1e-9);
  assert.ok(Math.abs(result.diagnostics.exitAcceleration) < 1e-9);
}
assert.equal(actor.cameraPerformance.mode, "ANCHOR_LOCKED_MINIMUM_JERK");
assert.equal(actor.motionSignal.kind, "CAMERA_AND_ACTOR");
assert.ok(actor.diagnostics.minimumActorVisibleRatio >= 0.98);
assert.equal(actor.samples[0].actors[0].opacity, 0);
assert.ok(actor.samples.find((sample) => sample.atMs >= 4080).actors[0].opacity > 0.5);
assert.equal(actor.samples.at(-1).actors[0].opacity, 0);
assert.equal(minimumJerk(0), 0);
assert.equal(minimumJerk(1), 1);
assert.equal(minimumJerkVelocity(0), 0);
assert.equal(minimumJerkVelocity(1), 0);
assert.ok(Math.abs(minimumJerkAcceleration(0)) < 1e-9);
assert.ok(Math.abs(minimumJerkAcceleration(1)) < 1e-9);
console.log(
  JSON.stringify(
    {
      status: "PASS",
      contract: "A1ScreenActionDirectionV2Test/v1",
      calibrations: [center, offset, actor].map((item) => ({
        shotId: item.shotId,
        mode: item.cameraPerformance.mode,
        moveCount: item.cameraPerformance.moveCount,
        maximumScale: item.cameraPerformance.maximumScale,
        diagnostics: item.diagnostics,
        directionSha256: item.directionSha256,
      })),
    },
    null,
    2,
  ),
);
