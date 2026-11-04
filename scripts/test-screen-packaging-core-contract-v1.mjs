#!/usr/bin/env node
import assert from "node:assert/strict";
import {compileScreenPackagingCorePlanV1} from "../apps/studio-next/src/lib/a1-screen-packaging-core-director-v1.mjs";
import {compileScreenPackagingCoreAdapterV1} from "../apps/studio-next/src/lib/a1-screen-packaging-core-adapter-v1.mjs";
import {
  screenPackagingCoreSafeCameraPoseV1,
  validateScreenPackagingCorePlanV1,
  validateScreenPackagingCoreAdapterV1,
} from "../apps/studio-next/src/lib/a1-screen-packaging-core-schema-v1.mjs";

const safeRightPose = screenPackagingCoreSafeCameraPoseV1({center: {x: .84, y: .37}, scale: 1.14});
assert.ok(safeRightPose.center.x <= 1 - .5 / 1.14);
assert.ok(safeRightPose.center.y >= .5 / 1.14);
assert.equal(safeRightPose.scale, 1.14);

const source = {
  videoSha256: "46dd59c06114c5cab1cdf8c60ac40aec6240f4d91ee976ce261a80e3ab82a14b",
  revisionSha256: "95ae369a7c0c69b3371d20813c3283917d303aaa5d26680dacb061adea693d31",
  width: 2560,
  height: 1440,
  fps: 60,
  frameCount: 395,
};
const target = ({frameIndex, scrollY, rect}) => ({
  videoSha256: source.videoSha256,
  revisionSha256: source.revisionSha256,
  frameIndex,
  viewport: {width: source.width, height: source.height, scrollX: 0, scrollY},
  coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
  rect,
});
const focusPlan = compileScreenPackagingCorePlanV1({
  id: "ed04-focus-handoff",
  shotId: "ED-04",
  effectId: "FOCUS_HANDOFF",
  source,
  durationFrames: 185,
  evidence: {
    kind: "FOCUS_HANDOFF_EVIDENCE",
    sourceStartFrame: 210,
    sourceEndFrame: 394,
    primaryTarget: target({
      frameIndex: 240,
      scrollY: 2564,
      rect: {x: 0.18203125, y: 0.4544921875, width: 0.4453125, height: 0.0798611111111111},
    }),
    secondaryTarget: target({
      frameIndex: 313,
      scrollY: 2564,
      rect: {x: 0.68359375, y: 0.24118958333333333, width: 0.29765625, height: 0.25194375},
    }),
  },
});
assert.equal(focusPlan.status, "PASS");
assert.equal(focusPlan.effectId, "FOCUS_HANDOFF");
assert.equal(validateScreenPackagingCorePlanV1(focusPlan).status, "PASS");

const focusAdapter = compileScreenPackagingCoreAdapterV1({
  plan: focusPlan,
  sourceVideoSha256: source.videoSha256,
  output: {width: 960, height: 540},
});
assert.equal(focusAdapter.status, "PASS");
assert.equal(focusAdapter.actor.kind, "FOCUS_HANDOFF");
assert.equal(focusAdapter.actor.sourceStartFrame, 210);
assert.equal(focusAdapter.actor.sourceEndFrame, 394);
assert.equal(focusAdapter.actor.primaryFrame, 240);
assert.equal(focusAdapter.actor.secondaryFrame, 313);
assert.equal(focusAdapter.actor.primaryTarget.x, 0.18203125 * 960);
assert.equal(focusAdapter.actor.secondaryTarget.x, 0.68359375 * 960);
assert.equal("path" in focusAdapter.actor, false);
assert.equal("style" in focusAdapter.actor, false);
assert.equal(validateScreenPackagingCoreAdapterV1(focusAdapter).status, "PASS");

const invalidOrder = compileScreenPackagingCorePlanV1({
  id: "bad-focus-order",
  shotId: "ED-04",
  effectId: "FOCUS_HANDOFF",
  source,
  durationFrames: 185,
  evidence: {
    ...focusPlan.evidence,
    primaryTarget: {...focusPlan.evidence.primaryTarget, frameIndex: 320},
  },
});
assert.equal(invalidOrder.status, "FAIL");
assert.ok(invalidOrder.failures.includes("FOCUS_TARGET_ORDER_INVALID"));

for (const forged of [
  {...focusPlan, status: "FAIL"},
  {...focusPlan, planSha256: "0".repeat(64)},
  {...focusPlan, source: {...focusPlan.source, videoSha256: "a".repeat(64)}},
  {...focusPlan, evidence: {...focusPlan.evidence, unexpected: true}},
]) assert.equal(validateScreenPackagingCorePlanV1(forged).status, "FAIL");
for (const forged of [
  {...focusAdapter, adapterSha256: "0".repeat(64)},
  {...focusAdapter, actor: {...focusAdapter.actor, path: "M0 0Z"}},
  {...focusAdapter, actor: {...focusAdapter.actor, style: {filter: "blur(20px)"}}},
  {...focusAdapter, actor: {...focusAdapter.actor, secondaryTarget: {x: -1, y: 0, width: 20, height: 20}}},
]) assert.equal(validateScreenPackagingCoreAdapterV1(forged).status, "FAIL");

const compareSource = {
  videoSha256: "1a00c0fef53b3511c848191fba4d15418692e5f99cf04e25158036944a6e867b",
  revisionSha256: "f70b92e6e3f83e9554544e26ed76b000fd633acd17699b5637087059a5a3dae4",
  width: 2560,
  height: 1440,
  fps: 60,
  frameCount: 419,
};
const comparePlan = compileScreenPackagingCorePlanV1({
  id: "ed05-wipe-diff",
  shotId: "ED-05",
  effectId: "WIPE_COMPARE_DIFFERENCE_FLASH",
  source: compareSource,
  durationFrames: 180,
  evidence: {
    kind: "WIPE_COMPARE_EVIDENCE",
    beforeFrame: 78,
    afterFrame: 174,
    sharedGeometry: true,
    viewport: {width: 2560, height: 1440},
    coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
    diffRegion: {x: 1750 / 2560, y: 436.797 / 1440, width: 762 / 2560, height: 461.672 / 1440},
  },
});
assert.equal(comparePlan.status, "PASS");
assert.equal(validateScreenPackagingCorePlanV1(comparePlan).status, "PASS");
const compareAdapter = compileScreenPackagingCoreAdapterV1({
  plan: comparePlan,
  sourceVideoSha256: compareSource.videoSha256,
  output: {width: 960, height: 540},
});
assert.equal(compareAdapter.status, "PASS");
assert.equal(compareAdapter.actor.kind, "WIPE_COMPARE_DIFFERENCE_FLASH");
assert.equal(compareAdapter.actor.beforeFrame, 78);
assert.equal(compareAdapter.actor.afterFrame, 174);
assert.equal(compareAdapter.actor.diffRegion.x, 1750 / 2560 * 960);
assert.equal("wipePath" in compareAdapter.actor, false);
assert.equal("flashStyle" in compareAdapter.actor, false);
assert.equal(validateScreenPackagingCoreAdapterV1(compareAdapter).status, "PASS");

const invalidCompare = compileScreenPackagingCorePlanV1({
  id: "bad-compare",
  shotId: "ED-05",
  effectId: "WIPE_COMPARE_DIFFERENCE_FLASH",
  source: compareSource,
  durationFrames: 180,
  evidence: {...comparePlan.evidence, sharedGeometry: false},
});
assert.equal(invalidCompare.status, "FAIL");
assert.ok(invalidCompare.failures.includes("COMPARE_SHARED_GEOMETRY_REQUIRED"));

const waitPlan = compileScreenPackagingCorePlanV1({
  id: "ed04-wait-compression",
  shotId: "ED-04",
  effectId: "WAIT_COMPRESSION",
  source,
  durationFrames: 121,
  evidence: {
    kind: "WAIT_COMPRESSION_EVIDENCE",
    sourceStartFrame: 225,
    sourceEndFrame: 345,
    originalWaitStartMs: 4365,
    originalWaitEndMs: 54654,
    outputWaitStartMs: 4000,
    outputWaitEndMs: 5220,
    resultEventName: "paragraph_candidates_hold",
    resultFrame: 313,
  },
});
assert.equal(waitPlan.status, "PASS");
assert.equal(validateScreenPackagingCorePlanV1(waitPlan).status, "PASS");
const waitAdapter = compileScreenPackagingCoreAdapterV1({
  plan: waitPlan,
  sourceVideoSha256: source.videoSha256,
  output: {width: 960, height: 540},
});
assert.equal(waitAdapter.status, "PASS");
assert.equal(waitAdapter.actor.kind, "WAIT_COMPRESSION");
assert.equal(waitAdapter.actor.resultFrame, 313);
assert.ok(waitAdapter.actor.compressionRatio > 40 && waitAdapter.actor.compressionRatio < 42);
assert.equal(validateScreenPackagingCoreAdapterV1(waitAdapter).status, "PASS");

const invalidWait = compileScreenPackagingCorePlanV1({
  id: "bad-wait",
  shotId: "ED-04",
  effectId: "WAIT_COMPRESSION",
  source,
  durationFrames: 121,
  evidence: {...waitPlan.evidence, outputWaitEndMs: 56000},
});
assert.equal(invalidWait.status, "FAIL");
assert.ok(invalidWait.failures.includes("WAIT_NOT_COMPRESSED"));

const resultRect = {x: 1750 / 2560, y: 347.313 / 1440, width: 762 / 2560, height: 362.797 / 1440};
const holdPlan = compileScreenPackagingCorePlanV1({
  id: "ed04-result-hold",
  shotId: "ED-04",
  effectId: "RESULT_HOLD",
  source,
  durationFrames: 180,
  evidence: {
    kind: "RESULT_HOLD_EVIDENCE",
    sourceStartFrame: 313,
    sourceEndFrame: 394,
    minimumSourceHoldFrames: 60,
    finalFrameExtensionFrames: 98,
    resultTarget: {
      videoSha256: source.videoSha256,
      revisionSha256: source.revisionSha256,
      firstFrame: 313,
      lastFrame: 394,
      viewport: {width: 2560, height: 1440, scrollX: 0, scrollY: 2564},
      coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
      rect: resultRect,
      identitySha256: "53c90bd1decf3ecf9a773d23bb25631521b9fb41c8520290f7d55ddb97bcf89c",
      maxDriftPx: 0,
    },
  },
});
assert.equal(holdPlan.status, "PASS");
assert.equal(validateScreenPackagingCorePlanV1(holdPlan).status, "PASS");
const holdAdapter = compileScreenPackagingCoreAdapterV1({
  plan: holdPlan,
  sourceVideoSha256: source.videoSha256,
  output: {width: 960, height: 540},
});
assert.equal(holdAdapter.status, "PASS");
assert.equal(holdAdapter.actor.kind, "RESULT_HOLD");
assert.equal(holdAdapter.actor.finalFrameExtensionFrames, 98);
assert.equal(holdAdapter.actor.resultTarget.x, resultRect.x * 960);
assert.equal(validateScreenPackagingCoreAdapterV1(holdAdapter).status, "PASS");

const invalidHold = compileScreenPackagingCorePlanV1({
  id: "bad-hold",
  shotId: "ED-04",
  effectId: "RESULT_HOLD",
  source,
  durationFrames: 180,
  evidence: {...holdPlan.evidence, minimumSourceHoldFrames: 120},
});
assert.equal(invalidHold.status, "FAIL");
assert.ok(invalidHold.failures.includes("RESULT_SOURCE_HOLD_TOO_SHORT"));

console.log(JSON.stringify({
  contract: "A1ScreenPackagingCoreContractTest/v1",
  status: "PASS",
  effects: ["FOCUS_HANDOFF", "WIPE_COMPARE_DIFFERENCE_FLASH", "WAIT_COMPRESSION", "RESULT_HOLD"],
  actualSourceIdentityBound: true,
  sequentialTargetFramesBound: true,
  arbitraryPathAndStyleRejected: true,
}, null, 2));
