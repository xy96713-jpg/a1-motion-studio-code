import assert from "node:assert/strict";
import {
  SCREEN_PACKAGING_CAMERA_SPRING_CONTRACT_V1,
  screenPackagingCameraSpringEaseV1,
  screenPackagingCameraSettleFramesV1,
} from "../apps/studio-next/src/lib/a1-screen-packaging-camera-spring-v1.mjs";

const APPROX = 1e-9;

assert.equal(SCREEN_PACKAGING_CAMERA_SPRING_CONTRACT_V1, "A1ScreenPackagingCameraSpring/v1");

// Endpoints are exact for both regimes.
assert.equal(screenPackagingCameraSpringEaseV1(0, "zoom-in"), 0);
assert.equal(screenPackagingCameraSpringEaseV1(1, "zoom-in"), 1);
assert.equal(screenPackagingCameraSpringEaseV1(0, "zoom-out"), 0);
assert.equal(screenPackagingCameraSpringEaseV1(1, "zoom-out"), 1);

// Clamping outside [0,1].
assert.equal(screenPackagingCameraSpringEaseV1(-2, "zoom-in"), 0);
assert.equal(screenPackagingCameraSpringEaseV1(4, "zoom-in"), 1);

// Zoom-in is the underdamped Cap curve: it must overshoot slightly past 1
// before settling (that tiny settle is the "alive" feel versus cubic easing).
// Zoom-out is overdamped: strictly monotonic all the way.
for (const [mode, mayOvershoot] of [["zoom-out", false], ["zoom-in", true]]) {
  let prev = -Infinity;
  let peak = 0;
  for (let i = 0; i <= 240; i += 1) {
    const v = screenPackagingCameraSpringEaseV1(i / 240, mode);
    peak = Math.max(peak, v);
    if (!mayOvershoot) assert.ok(v >= prev - APPROX, `${mode} must be monotonic at ${i}`);
    prev = v;
  }
  if (mode === "zoom-in") {
    assert.ok(peak > 1, `zoom-in should overshoot, got ${peak}`);
    assert.ok(peak < 1.01, `overshoot must stay under 1%, got ${peak}`);
    // After the peak it must ring back toward 1, not drift away.
    const end = screenPackagingCameraSpringEaseV1(1, "zoom-in");
    assert.ok(Math.abs(end - 1) < APPROX);
  } else {
    assert.ok(peak <= 1 + APPROX, `zoom-out must not overshoot, got ${peak}`);
  }
}

// Zoom-out should read softer: at t=0.5 it lags behind zoom-in
// (more of its motion happens in the second half).
assert.ok(
  screenPackagingCameraSpringEaseV1(0.5, "zoom-out") < screenPackagingCameraSpringEaseV1(0.5, "zoom-in"),
);

// Invalid mode fails closed.
assert.throws(() => screenPackagingCameraSpringEaseV1(0.5, "linear"), /camera-spring-mode-invalid/);

// Settle window: number of 60fps frames until within epsilon of rest.
const settle60 = screenPackagingCameraSettleFramesV1(60, "zoom-in", 1e-3);
assert.ok(settle60 >= 40 && settle60 <= 60, `zoom-in settle frames ${settle60}`);
const settleOut60 = screenPackagingCameraSettleFramesV1(60, "zoom-out", 1e-3);
assert.ok(settleOut60 >= 40 && settleOut60 <= 75, `zoom-out settle frames ${settleOut60}`);

// Settle frames scale with frame rate (time-step independent).
assert.equal(
  screenPackagingCameraSettleFramesV1(30, "zoom-in", 1e-3),
  Math.round((settle60 / 60) * 30),
);

console.log("screen-packaging-camera-spring-v1: PASS");
