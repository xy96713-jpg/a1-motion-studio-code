#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  A1_SCREEN_RECORDING_PRODUCTION_ROUTE,
  assertProductionScreenRecordingCandidate,
  classifyScreenRecordingArtifact,
  evaluateScreenRecordingDuration,
} from "../apps/studio-next/src/lib/a1-screen-recording-production-policy-v1.mjs";

assert.equal(evaluateScreenRecordingDuration(2800).band, "SHORT_ACTION");
assert.equal(evaluateScreenRecordingDuration(5800).band, "DEFAULT_4_TO_8_SECONDS");
assert.equal(evaluateScreenRecordingDuration(8533).band, "COMPLEX_8_TO_10_SECONDS");
assert.equal(evaluateScreenRecordingDuration(10000).status, "PASS");
assert.equal(evaluateScreenRecordingDuration(10001).status, "REVIEW_REQUIRED");
assert.equal(evaluateScreenRecordingDuration(12940,{beatDurationsMs:[5368,5869,1703],informationBearing:true}).band,"LONG_CAUSAL_SEQUENCE");
assert.equal(evaluateScreenRecordingDuration(12940,{beatDurationsMs:[11000,1940],informationBearing:true}).status,"SPLIT_REQUIRED");

const longSequence = classifyScreenRecordingArtifact({
  kind: "LONG_SEQUENCE_QUALIFICATION",
  path: "work/screen-sequence-qualification-v1/renders/review.mp4",
  durationMs: 37248,
});
assert.equal(longSequence.productionEligible, false);
assert.equal(longSequence.classification, "REVIEW_ONLY_DIAGNOSTIC");

const pageCamReview = classifyScreenRecordingArtifact({
  kind: "REMOTION_PAGE_CAM_REVIEW",
  path: "work/cinematic-screen-camera-v1/review.mp4",
  durationMs: 6000,
});
assert.equal(pageCamReview.productionEligible, false);

const capDecision = assertProductionScreenRecordingCandidate({
  kind: "CAP_EXPORT",
  path: "work/screen-production/shot.mp4",
  durationMs: 6600,
  capProjectPath: "work/screen-production/shot.cap",
  sourceVideoSha256: "a".repeat(64),
  interactionTimelineSha256: "b".repeat(64),
});
assert.equal(capDecision.productionEligible, true);
assert.equal(A1_SCREEN_RECORDING_PRODUCTION_ROUTE.screenPackagingRenderer, "CAP_EXPORT");
assert.equal(A1_SCREEN_RECORDING_PRODUCTION_ROUTE.finalFilmAssembly, "REMOTION");

assert.throws(
  () =>
    assertProductionScreenRecordingCandidate({
      kind: "CAP_EXPORT",
      path: "work/screen-production/too-long.mp4",
      durationMs: 12000,
      beatDurationsMs: [11000, 1000],
      capProjectPath: "work/screen-production/too-long.cap",
      sourceVideoSha256: "a".repeat(64),
      interactionTimelineSha256: "b".repeat(64),
    }),
  /SCREEN_BEAT_EXCEEDS_10S_SPLIT_REQUIRED/u,
);

console.log(
  JSON.stringify(
    {
      contract: "A1ScreenRecordingProductionPolicyTest/v1",
      status: "PASS",
      defaultBandMs: [4000, 8000],
      hardMaximumContinuousBeatMs: 10000,
      productionRenderer: "CAP_EXPORT",
      longQualificationRejected: true,
      remotionPageCamReviewRejected: true,
      longCausalSequenceAllowedWithBeatMap: true,
    },
    null,
    2,
  ),
);
