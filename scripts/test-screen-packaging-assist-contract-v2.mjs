#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  compileScreenPackagingAssistPlanV2,
} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-director-v2.mjs";
import {
  compileScreenPackagingAssistAdapterV2,
} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-adapter-v2.mjs";
import {
  validateScreenPackagingAssistPlanV2,
  validateScreenPackagingAssistAdapterV2,
  hashScreenPackagingAssistValueV2,
} from "../apps/studio-next/src/lib/a1-screen-packaging-assist-schema-v2.mjs";

assert.equal(
  hashScreenPackagingAssistValueV2("abc"),
  crypto.createHash("sha256").update(JSON.stringify("abc")).digest("hex"),
);

const videoSha256 = "a00b48355ba9f98283819845988fd3c657107efb7282b80cdb3974898c4e1202";
const revisionSha256 = "3479c55bdff8defe109b5c5d6586301d119687448fa1f0235ec3c704355ea541";
const textSha256 = "15cd67c661cb5a7400fc2df8f8cb410e81bea6950bd2da2e8abfeedbe7f715c8";
const source = {videoSha256, revisionSha256};
const viewport = {width: 2560, height: 1440, scrollX: 0, scrollY: 2391};
const lineRect = {x: 0.262884521484375, y: 0.5829644097222222, width: 0.135650634765625, height: 0.03125};
const textBinding = {
  kind: "TEXT_RANGE",
  sourceTextSha256: textSha256,
  matchedTextSha256: textSha256,
  rangeToken: "ED-21:document_opened",
  frameIndex: 0,
  viewport,
  coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
  lineRects: [lineRect],
  sourceStateAlreadyEmphatic: false,
};

const plan = compileScreenPackagingAssistPlanV2({
  shotId: "ED-21",
  source,
  durationFrames: 180,
  intent: "EVIDENCE_CLAIM",
  evidenceBinding: textBinding,
});
assert.equal(plan.status, "PASS");
assert.equal(plan.actors.length, 1);
assert.equal(plan.actors[0].kind, "EVIDENCE_UNDERLINE");
assert.equal(plan.evidenceBinding.sourceTextSha256, textSha256);
assert.equal(plan.evidenceBinding.frameIndex, 0);
assert.equal(validateScreenPackagingAssistPlanV2(plan).status, "PASS");

const adapter = compileScreenPackagingAssistAdapterV2({
  plan,
  sourceVideoSha256: videoSha256,
  output: {width: 960, height: 540},
});
assert.equal(adapter.status, "PASS");
assert.equal(adapter.plan.planSha256, plan.planSha256);
assert.equal(adapter.actors[0].kind, "EVIDENCE_UNDERLINE");
assert.deepEqual(adapter.actors[0].rects, [{
  x: lineRect.x * 960,
  y: lineRect.y * 540,
  width: lineRect.width * 960,
  height: lineRect.height * 540,
}]);
assert.equal("path" in adapter.actors[0], false);
assert.equal("style" in adapter.actors[0], false);
assert.equal(validateScreenPackagingAssistAdapterV2(adapter).status, "PASS");

const highlight = compileScreenPackagingAssistPlanV2({
  shotId: "ED-21",
  source,
  durationFrames: 180,
  intent: "KEY_RESULT",
  evidenceBinding: textBinding,
});
assert.equal(highlight.status, "PASS");
assert.equal(highlight.actors[0].kind, "HIGHLIGHT_WASH");

const nativeWins = compileScreenPackagingAssistPlanV2({
  shotId: "ED-21",
  source,
  durationFrames: 180,
  intent: "KEY_RESULT",
  evidenceBinding: {...textBinding, sourceStateAlreadyEmphatic: true},
});
assert.equal(nativeWins.status, "PASS");
assert.deepEqual(nativeWins.actors, []);
assert.equal(nativeWins.suppressionReason, "SOURCE_STATE_ALREADY_EMPHATIC");

const target = (frameIndex, rect, targetVideoSha256 = videoSha256) => ({
  videoSha256: targetVideoSha256,
  revisionSha256,
  frameIndex,
  viewport,
  coordinateSpace: "NORMALIZED_SOURCE_VIEWPORT",
  rect,
});
const causal = compileScreenPackagingAssistPlanV2({
  shotId: "ED-21",
  source,
  durationFrames: 180,
  intent: "CAUSE_RESULT",
  evidenceBinding: {
    kind: "CAUSAL_TARGET_PAIR",
    sourceTarget: target(30, {x: 0.1, y: 0.4, width: 0.2, height: 0.1}),
    resultTarget: target(30, {x: 0.7, y: 0.35, width: 0.2, height: 0.2}),
  },
});
assert.equal(causal.status, "PASS");
assert.equal(causal.actors[0].kind, "CAUSAL_TETHER_DASHED");
const causalAdapter = compileScreenPackagingAssistAdapterV2({
  plan: causal,
  sourceVideoSha256: videoSha256,
  output: {width: 960, height: 540},
});
assert.equal(causalAdapter.status, "PASS");
assert.equal("path" in causalAdapter.actors[0], false);
assert.equal("style" in causalAdapter.actors[0], false);
assert.equal(validateScreenPackagingAssistAdapterV2(causalAdapter).status, "PASS");

const crossFrame = compileScreenPackagingAssistPlanV2({
  shotId: "ED-21",
  source,
  durationFrames: 180,
  intent: "CAUSE_RESULT",
  evidenceBinding: {
    kind: "CAUSAL_TARGET_PAIR",
    sourceTarget: target(30, {x: 0.1, y: 0.4, width: 0.2, height: 0.1}),
    resultTarget: target(31, {x: 0.7, y: 0.35, width: 0.2, height: 0.2}),
  },
});
assert.equal(crossFrame.status, "FAIL");
assert.ok(crossFrame.failures.includes("CAUSAL_TARGET_FRAME_MISMATCH"));

const crossSource = compileScreenPackagingAssistPlanV2({
  shotId: "ED-21",
  source,
  durationFrames: 180,
  intent: "CAUSE_RESULT",
  evidenceBinding: {
    kind: "CAUSAL_TARGET_PAIR",
    sourceTarget: target(30, {x: 0.1, y: 0.4, width: 0.2, height: 0.1}),
    resultTarget: target(30, {x: 0.7, y: 0.35, width: 0.2, height: 0.2}, "b".repeat(64)),
  },
});
assert.equal(crossSource.status, "FAIL");
assert.ok(crossSource.failures.includes("CAUSAL_TARGET_SOURCE_MISMATCH"));

const missingTextIdentity = compileScreenPackagingAssistPlanV2({
  shotId: "ED-21",
  source,
  durationFrames: 180,
  intent: "EVIDENCE_CLAIM",
  evidenceBinding: {...textBinding, matchedTextSha256: null},
});
assert.equal(missingTextIdentity.status, "FAIL");
assert.ok(missingTextIdentity.failures.includes("MATCHED_TEXT_SHA256_REQUIRED"));

for (const intent of ["SECTION_ENTRY", "RESULT_ENTRY", "CIRCLE", "BOX", "RIPPLE"]) {
  const blocked = compileScreenPackagingAssistPlanV2({
    shotId: "ED-21",
    source,
    durationFrames: 180,
    intent,
    evidenceBinding: textBinding,
  });
  assert.equal(blocked.status, "FAIL");
  assert.ok(blocked.failures.includes(`FORBIDDEN_INTENT:${intent}`));
}

const tamperedPlans = [
  {...plan, status: "FAIL"},
  {...plan, planSha256: "0".repeat(64)},
  {...plan, source: {...plan.source, videoSha256: "bad"}},
  {...plan, actors: "not-an-array"},
  {...plan, unexpected: true},
  {...plan, actors: [{...plan.actors[0], kind: "CIRCLE"}]},
  {...plan, evidenceBinding: {...plan.evidenceBinding, lineRects: [{x: -1, y: 0, width: 2, height: 1}] }},
];
for (const forged of tamperedPlans)
  assert.equal(validateScreenPackagingAssistPlanV2(forged).status, "FAIL");

const tamperedAdapters = [
  {...adapter, status: "FAIL"},
  {...adapter, adapterSha256: "0".repeat(64)},
  {...adapter, sourcePlanSha256: "0".repeat(64)},
  {...adapter, policy: {...adapter.policy, stylesRendererOwned: false}},
  {...adapter, actors: [{...adapter.actors[0], kind: "CIRCLE"}]},
  {...adapter, actors: [{...adapter.actors[0], path: "M0 0Z"}]},
  {...adapter, actors: [{...adapter.actors[0], style: {stroke: "red"}}]},
  {...adapter, actors: [{...adapter.actors[0], rects: [{x: -20, y: 0, width: 50, height: 20}]}]},
  {...adapter, unexpected: true},
];
for (const forged of tamperedAdapters)
  assert.equal(validateScreenPackagingAssistAdapterV2(forged).status, "FAIL");

console.log(JSON.stringify({
  contract: "A1ScreenPackagingAssistContractTest/v2",
  status: "PASS",
  textIdentityBound: true,
  geometryFrameBound: true,
  causalSameFrameCompared: true,
  exhaustivePlanValidation: true,
  exhaustiveAdapterValidation: true,
  arbitrarySvgAndStyleRejected: true,
  negativeFixtures: tamperedPlans.length + tamperedAdapters.length + 7,
}, null, 2));
