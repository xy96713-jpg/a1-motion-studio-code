#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_EVENT_SETTLE_SCREEN_MOTION_CONTRACT,
  compileEventSettleScreenMotion,
} from "../apps/studio-next/src/lib/a1-event-settle-screen-motion-v1.mjs";

const shortShot = compileEventSettleScreenMotion({
  durationMs: 2_000,
  beats: [
    {id: "action-framing", atMs: 0, center: {x: 0.57, y: 0.43}, scale: 1.18, role: "ACTION"},
    {id: "result-visible", atMs: 900, center: {x: 0.64, y: 0.5}, scale: 1.3, role: "RESULT", moveDurationMs: 320},
  ],
});
assert.equal(shortShot.contract, A1_EVENT_SETTLE_SCREEN_MOTION_CONTRACT);
assert.equal(shortShot.status, "PASS");
assert.equal(shortShot.motionWindows.length, 1);
assert.equal(shortShot.motionWindows[0].durationMs, 320);
assert.equal(shortShot.motionWindows[0].startMs < 900, true);
assert.equal(shortShot.motionWindows[0].endMs > 900, true);
assert.equal(shortShot.resultHoldMs >= 800, true);
assert.equal(shortShot.motionDutyCycle, 0.16);

const multiEventLongShot = compileEventSettleScreenMotion({
  durationMs: 6_400,
  beats: [
    {id: "context", atMs: 0, center: {x: 0.5, y: 0.5}, scale: 1, role: "CONTEXT"},
    {id: "select", atMs: 1_350, center: {x: 0.38, y: 0.46}, scale: 1.22, role: "ACTION"},
    {id: "apply", atMs: 3_050, center: {x: 0.59, y: 0.58}, scale: 1.34, role: "ACTION"},
    {id: "result", atMs: 5_050, center: {x: 0.61, y: 0.55}, scale: 1.42, role: "RESULT", moveDurationMs: 360},
  ],
});
assert.equal(multiEventLongShot.status, "PASS");
assert.equal(multiEventLongShot.motionWindows.length, 3);
assert.ok(multiEventLongShot.motionWindows.every((window) => window.durationMs >= 280 && window.durationMs <= 440));
assert.ok(multiEventLongShot.motionWindows.every((window) => window.path === "STRAIGHT_LINE" && ["cinematic-in","glide"].includes(window.easing) && window.overshoot === 0));
assert.equal(multiEventLongShot.motionWindows.at(-1).easing,"glide");
assert.ok(multiEventLongShot.motionWindows.every((window) => window.startMs < window.eventAtMs && window.eventAtMs < window.endMs));
assert.ok(multiEventLongShot.motionWindows.slice(1).every((window, index) => window.startMs - multiEventLongShot.motionWindows[index].endMs >= 160));
assert.equal(multiEventLongShot.eventAlignment.length, 4);
assert.ok(multiEventLongShot.eventAlignment.every((alignment) => alignment.settleLagMs >= 0));
assert.equal(multiEventLongShot.cameraTrack.at(-1).scale, 1.42);
assert.equal(multiEventLongShot.policy.automaticWideRestore, false);

const actionFramingWithoutResultRoi = compileEventSettleScreenMotion({
  durationMs: 3_200,
  beats: [
    {id: "verified-action", atMs: 1_150, center: {x: 0.72, y: 0.64}, scale: 1.28, role: "ACTION", moveDurationMs: 360},
  ],
});
assert.equal(actionFramingWithoutResultRoi.status, "PASS");
assert.equal(actionFramingWithoutResultRoi.cameraTrack.at(-1).x, 0.72);
assert.equal(actionFramingWithoutResultRoi.cameraTrack.at(-1).y, 0.64);
assert.equal(actionFramingWithoutResultRoi.cameraTrack.at(-1).scale, 1.28);
assert.equal(actionFramingWithoutResultRoi.holdWindows.at(-1).role, "RESULT_HOLD");
assert.equal(actionFramingWithoutResultRoi.resultHoldMs >= 800, true);

const staticState = compileEventSettleScreenMotion({
  durationMs: 2_400,
  beats: [
    {id: "static-state", atMs: 0, center: {x: 0.5, y: 0.5}, scale: 1, role: "STATIC_STATE"},
  ],
});
assert.equal(staticState.status, "PASS");
assert.equal(staticState.motionWindows.length, 0);
assert.equal(staticState.motionDutyCycle, 0);
assert.equal(staticState.resultHoldMs, 2_400);
assert.deepEqual(staticState.cameraTrack.map(({x, y, scale}) => ({x, y, scale})), [
  {x: 0.5, y: 0.5, scale: 1},
  {x: 0.5, y: 0.5, scale: 1},
]);
assert.equal(staticState.holdWindows.length, 1);
assert.equal(staticState.holdWindows[0].role, "RESULT_HOLD");

const overlapping = compileEventSettleScreenMotion({
  durationMs: 3_200,
  beats: [
    {id: "first", atMs: 900, center: {x: 0.3, y: 0.4}, scale: 1.2, role: "ACTION", moveDurationMs: 360},
    {id: "second", atMs: 1_080, center: {x: 0.7, y: 0.6}, scale: 1.35, role: "RESULT", moveDurationMs: 360},
  ],
});
assert.equal(overlapping.status, "FAIL");
assert.ok(overlapping.failures.some((failure) => failure.startsWith("MOTION_WINDOWS_OVERLAP:")));
assert.deepEqual(overlapping.cameraTrack, []);

const outOfBounds = compileEventSettleScreenMotion({
  durationMs: 2_400,
  beats: [
    {id: "invalid-roi", atMs: 900, center: {x: 1.1, y: 0.5}, scale: 1.2, role: "ACTION"},
  ],
});
assert.equal(outOfBounds.status, "FAIL");
assert.ok(outOfBounds.failures.includes("BEAT_CENTER_OUT_OF_RANGE:invalid-roi"));

const outOfBoundsMotionWindow = compileEventSettleScreenMotion({
  durationMs: 2_400,
  beats: [
    {id: "too-early", atMs: 100, center: {x: 0.7, y: 0.5}, scale: 1.2, role: "ACTION", moveDurationMs: 360},
  ],
});
assert.equal(outOfBoundsMotionWindow.status, "FAIL");
assert.ok(outOfBoundsMotionWindow.failures.includes("MOTION_WINDOW_OUT_OF_RANGE:too-early"));

const insufficientResultHold = compileEventSettleScreenMotion({
  durationMs: 2_800,
  beats: [
    {id: "late-result", atMs: 2_300, center: {x: 0.6, y: 0.55}, scale: 1.3, role: "RESULT", moveDurationMs: 360},
  ],
});
assert.equal(insufficientResultHold.status, "FAIL");
assert.ok(insufficientResultHold.failures.includes("RESULT_HOLD_TOO_SHORT"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1EventSettleScreenMotionTest/v1",
  scenarios: {
    shortShot: {moves: shortShot.motionWindows.length, resultHoldMs: shortShot.resultHoldMs},
    multiEventLongShot: {moves: multiEventLongShot.motionWindows.length, motionDutyCycle: multiEventLongShot.motionDutyCycle},
    actionFramingWithoutResultRoi: {finalPose: actionFramingWithoutResultRoi.cameraTrack.at(-1)},
    staticState: {moves: staticState.motionWindows.length, resultHoldMs: staticState.resultHoldMs},
    failClosed: {
      overlap: overlapping.failures,
      outOfBounds: outOfBounds.failures,
      outOfBoundsMotionWindow: outOfBoundsMotionWindow.failures,
      insufficientResultHold: insufficientResultHold.failures,
    },
  },
}, null, 2));
