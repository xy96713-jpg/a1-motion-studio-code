#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_PERSISTENT_SCREEN_RESULT_TARGET_CONTRACT,
  derivePersistentScreenResultTarget,
} from "./lib/derive-persistent-screen-result-target-v1.mjs";

const frame = {width: 960, height: 540};
const manualPersistent = "MANUAL_VERIFIED_PERSISTENT";

const ed04NearFullFrame = derivePersistentScreenResultTarget({
  region: {x: .035, y: .05, width: .93, height: .84},
  frame,
  semanticSource: manualPersistent,
});
assert.equal(ed04NearFullFrame.status, "REJECT");
assert.equal(ed04NearFullFrame.cameraTarget, null);
assert.equal(ed04NearFullFrame.reason, "NEAR_FULL_FRAME");

const ed24BottomRightToast = derivePersistentScreenResultTarget({
  region: {x: .76, y: .82, width: .22, height: .13},
  frame,
  semanticSource: manualPersistent,
});
assert.equal(ed24BottomRightToast.status, "REJECT");
assert.equal(ed24BottomRightToast.cameraTarget, null);
assert.equal(ed24BottomRightToast.reason, "EDGE_TOAST");

const persistentResultPanel = derivePersistentScreenResultTarget({
  region: {x: .32, y: .28, width: .54, height: .48},
  frame,
  semanticSource: "VERIFIED_PIXEL_DELTA",
  persistentFrameAgreement: {status: "PASS", comparedFrameCount: 4, agreementRatio: .97},
});
assert.equal(persistentResultPanel.status, "PASS");
assert.equal(persistentResultPanel.cameraTarget.semanticSource, "PIXEL_DELTA");
assert.equal(persistentResultPanel.cameraTarget.persistenceProof, "PERSISTENT_FRAME_AGREEMENT");
assert.deepEqual(persistentResultPanel.cameraTarget.center, {x: .59, y: .52});
assert.ok(persistentResultPanel.cameraTarget.suggestedScale >= 1 && persistentResultPanel.cameraTarget.suggestedScale <= 1.45);

const barePixelDelta = derivePersistentScreenResultTarget({
  region: {x: .32, y: .4, width: .42, height: .3},
  frame,
  semanticSource: "VERIFIED_PIXEL_DELTA",
});
assert.equal(barePixelDelta.status, "REJECT");
assert.equal(barePixelDelta.reason, "PERSISTENCE_UNPROVEN");

const manualTarget = derivePersistentScreenResultTarget({
  region: {x: 300, y: 210, width: 420, height: 190},
  frameWidth: frame.width,
  frameHeight: frame.height,
  semanticSource: "MANUAL_VERIFIED_PERSISTENT_EDITOR_SURFACE_NOT_TOAST",
});
assert.equal(manualTarget.status, "PASS");
assert.equal(manualTarget.cameraTarget.semanticSource, "MANUAL_VERIFIED_PERSISTENT");
assert.deepEqual(manualTarget.cameraTarget.region, {x: .3125, y: .388889, width: .4375, height: .351852});

const domTarget = derivePersistentScreenResultTarget({
  region: {x: .27, y: .22, width: .48, height: .42},
  frame,
  semanticSource: "DOM_VERIFIED_RESULT",
  persistenceEvidence: {status: "PASS", finalHoldVerified: true, sampleCount: 3},
});
assert.equal(domTarget.status, "PASS");
assert.equal(domTarget.cameraTarget.semanticSource, "DOM_VERIFIED_RESULT");
assert.equal(domTarget.cameraTarget.persistenceProof, "FINAL_HOLD_EVIDENCE");

const unprovenDomTarget = derivePersistentScreenResultTarget({
  region: {x: .27, y: .22, width: .48, height: .42},
  frame,
  semanticSource: "DOM_VERIFIED_RESULT",
});
assert.equal(unprovenDomTarget.status, "REJECT");
assert.equal(unprovenDomTarget.reason, "PERSISTENCE_UNPROVEN");

const tinyTransient = derivePersistentScreenResultTarget({
  region: {x: .45, y: .45, width: .05, height: .04},
  frame,
  semanticSource: manualPersistent,
});
assert.equal(tinyTransient.status, "REJECT");
assert.equal(tinyTransient.reason, "TRANSIENT_REGION_TOO_SMALL");

const repeat = derivePersistentScreenResultTarget({
  region: {x: .32, y: .28, width: .54, height: .48},
  frame,
  semanticSource: "VERIFIED_PIXEL_DELTA",
  persistentFrameAgreement: {agreementRatio: .97, comparedFrameCount: 4, status: "PASS"},
});
assert.equal(repeat.sha, persistentResultPanel.sha, "sha must be canonical and deterministic");
assert.match(repeat.sha, /^[a-f0-9]{64}$/u);
assert.equal(repeat.contract, A1_PERSISTENT_SCREEN_RESULT_TARGET_CONTRACT);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1PersistentScreenResultTargetTest/v1",
  admitted: ["PIXEL_DELTA_WITH_AGREEMENT", "MANUAL_VERIFIED_PERSISTENT", "DOM_VERIFIED_RESULT"],
  rejected: {
    ed04: ed04NearFullFrame.reason,
    ed24: ed24BottomRightToast.reason,
    barePixelDelta: barePixelDelta.reason,
    unprovenDom: unprovenDomTarget.reason,
    tinyTransient: tinyTransient.reason,
  },
  targetSha256: persistentResultPanel.sha,
}, null, 2));
