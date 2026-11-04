#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_ANCHOR_LOCKED_SCREEN_CAMERA_CONTRACT,
  deriveAnchorLockedPose,
  deriveRoiSafeAnchorLockedPose,
  projectSourcePoint,
  sampleAnchorLockedSegment,
} from "../apps/studio-next/src/lib/a1-anchor-locked-screen-camera-v1.mjs";

const fromPose = {x: 0.5, y: 0.5, scale: 1};
const sourceAnchor = {x: 0.832422, y: 0.463585};
const result = deriveAnchorLockedPose({fromPose, sourceAnchor, targetScale: 1.28});
assert.equal(result.contract, A1_ANCHOR_LOCKED_SCREEN_CAMERA_CONTRACT);
assert.ok(Math.abs(result.clampDisplacement.x) < 1e-9);
assert.ok(Math.abs(result.clampDisplacement.y) < 1e-9);
const before = projectSourcePoint({sourcePoint: sourceAnchor, cameraPose: fromPose});
const after = projectSourcePoint({sourcePoint: sourceAnchor, cameraPose: result.pose});
assert.ok(Math.hypot((after.x - before.x) * 960, (after.y - before.y) * 540) < 1e-8);
const sampled = sampleAnchorLockedSegment({fromPose, toPose: result.pose, anchorLockToNext: result.anchorLockToNext});
assert.ok(sampled.maxDriftPx < 1e-8);

const returnPose = deriveAnchorLockedPose({fromPose: result.pose, sourceAnchor, targetScale: 1.03});
const returnSampled = sampleAnchorLockedSegment({fromPose: result.pose, toPose: returnPose.pose, anchorLockToNext: returnPose.anchorLockToNext});
assert.ok(returnSampled.maxDriftPx < 1e-8);

const nearLeftAnchor = {x: 0.42, y: 0.595};
const offsetPose = {x: 0.4729032258064516, y: 0.5169073225806452, scale: 1.24};
const edgeSafeReturn = deriveAnchorLockedPose({fromPose: offsetPose, sourceAnchor: nearLeftAnchor, targetScale: 1.03});
assert.equal(edgeSafeReturn.scaleAdjustedForCanvas, true);
assert.ok(edgeSafeReturn.pose.scale > 1.03 && edgeSafeReturn.pose.scale < 1.04);
const edgeSafeSample = sampleAnchorLockedSegment({fromPose: offsetPose, toPose: edgeSafeReturn.pose, anchorLockToNext: edgeSafeReturn.anchorLockToNext});
assert.ok(edgeSafeSample.maxDriftPx < 1e-8);

const edgeRegion = {x: 0.683594, y: 0.303321, width: 0.297656, height: 0.320529};
const roiSafe = deriveRoiSafeAnchorLockedPose({
  fromPose,
  sourceAnchor,
  targetRegion: edgeRegion,
  requestedScale: 1.28,
  safeMarginPx: 6,
});
assert.equal(roiSafe.status, "PASS");
assert.equal(roiSafe.scaleCappedForRoi, true);
assert.ok(roiSafe.resolvedScale > 1.08 && roiSafe.resolvedScale < 1.09);
assert.ok(roiSafe.projectedRegion.pixels.right <= 954.000001);
assert.ok(roiSafe.projectedRegion.pixels.left >= 5.999999);

const geometryFixtures = [
  {id: "CENTER_WIDE", anchor: {x: .5, y: .5}, region: {x: .2, y: .25, width: .6, height: .5}, requestedScale: 1.24, expectedCapped: false},
  {id: "LEFT_EDGE", anchor: {x: .12, y: .5}, region: {x: .01, y: .3, width: .24, height: .4}, requestedScale: 1.28, expectedCapped: true},
  {id: "RIGHT_EDGE", anchor: {x: .88, y: .5}, region: {x: .75, y: .3, width: .24, height: .4}, requestedScale: 1.28, expectedCapped: true},
  {id: "BOTTOM_EDGE", anchor: {x: .5, y: .88}, region: {x: .3, y: .76, width: .4, height: .22}, requestedScale: 1.3, expectedCapped: true},
];
const geometryResults = geometryFixtures.map((fixture) => {
  const solved = deriveRoiSafeAnchorLockedPose({fromPose, sourceAnchor: fixture.anchor, targetRegion: fixture.region, requestedScale: fixture.requestedScale, safeMarginPx: 6});
  assert.equal(solved.status, "PASS", fixture.id);
  assert.equal(solved.scaleCappedForRoi, fixture.expectedCapped, fixture.id);
  assert.ok(solved.projectedRegion.pixels.left >= 5.999999, fixture.id);
  assert.ok(solved.projectedRegion.pixels.top >= 5.999999, fixture.id);
  assert.ok(solved.projectedRegion.pixels.right <= 954.000001, fixture.id);
  assert.ok(solved.projectedRegion.pixels.bottom <= 534.000001, fixture.id);
  return {id: fixture.id, requestedScale: fixture.requestedScale, resolvedScale: solved.resolvedScale, projectedRegion: solved.projectedRegion.pixels};
});

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1AnchorLockedScreenCameraTest/v1",
  zoomInMaxAnchorDriftPx: sampled.maxDriftPx,
  zoomOutMaxAnchorDriftPx: returnSampled.maxDriftPx,
  edgeSafeReturnMaxAnchorDriftPx: edgeSafeSample.maxDriftPx,
  roiSafe: {requestedScale: roiSafe.requestedScale, resolvedScale: roiSafe.resolvedScale, projectedRegion: roiSafe.projectedRegion.pixels},
  geometryResults,
  endpointPose: result.pose,
  returnPose: returnPose.pose,
}, null, 2));
