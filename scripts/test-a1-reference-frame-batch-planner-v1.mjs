#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  A1_REFERENCE_FRAME_BATCH_PLAN_V1,
  A1_REFERENCE_FRAME_EXTRACTION_BATCH_V1,
  REFERENCE_FRAME_BATCH_LIMITS_V1,
  planReferenceFrameExtractionBatchesV1,
} from "../apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs";
import {compileReferenceFrameReviewPlanV1, A1_REFERENCE_FRAME_REVIEW_POLICY_V1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sourceA = "a".repeat(64);
const sourceB = "b".repeat(64);

function sealPlan(body) {
  const {sha256: _priorSha256, ...unsigned} = body;
  return {...unsigned, sha256: sha256(Buffer.from(JSON.stringify(unsigned), "utf8"))};
}

function planForStableFrames({sourceVideoSha256 = sourceA, totalFrames = 200, frames}) {
  return compileReferenceFrameReviewPlanV1({
    sourceVideoSha256,
    fps: 30,
    totalFrames,
    sequences: frames.map((frame, index) => ({
      sequenceId: `sequence-${String(index).padStart(3, "0")}`,
      startFrame: frame,
      endFrameExclusive: frame + 1,
      mode: "stable-hold",
    })),
  });
}

function testThreeSyntheticGenrePlans() {
  const syntheticGenres = [
    {name: "evidence-explainer", frames: [12, 36], roles: ["SOURCE_HOLD", "CLAIM_HOLD"]},
    {name: "product-tutorial", frames: [4, 19, 51], roles: ["BEFORE", "ACTION", "RESULT"]},
    {name: "personal-opinion", frames: [2, 24, 47], roles: ["PRESENTER_HOLD", "TYPE_ENTER", "HANDOFF"]},
  ];
  for (const [index, genre] of syntheticGenres.entries()) {
    const plan = compileReferenceFrameReviewPlanV1({
      sourceVideoSha256: sha256(Buffer.from(`synthetic-source-${genre.name}`)),
      fps: 30,
      totalFrames: 90,
      sequences: [{
        sequenceId: `${genre.name}-sequence`,
        startFrame: 0,
        endFrameExclusive: 90,
        mode: "semantic-motion",
        anchors: genre.frames.map((sourceFrame, anchorIndex) => ({role: genre.roles[anchorIndex], sourceFrame})),
      }],
    });
    const batches = planReferenceFrameExtractionBatchesV1({plan});
    assert.equal(batches.contract, A1_REFERENCE_FRAME_BATCH_PLAN_V1);
    assert.equal(batches.sourcePlanSha256, plan.sha256);
    assert.equal(batches.summary.sourceVideoCount, 1);
    assert.equal(batches.summary.uniqueSourceFrameCount, genre.frames.length, `${genre.name} frame count`);
    assert.equal(batches.summary.extractedImages, 0);
    assert.equal(batches.summary.visualApproval, false);
    assert.equal(batches.summary.productionAdmission, false);
    assert.equal(index < 3, true);
  }
}

function testRepeatedFrameMergesButRetainsEveryReference() {
  const compiled = compileReferenceFrameReviewPlanV1({
    sourceVideoSha256: sourceA,
    fps: 30,
    totalFrames: 120,
    sequences: [
      {sequenceId: "hold", startFrame: 10, endFrameExclusive: 21, mode: "stable-hold", representativeFrame: 15},
      {sequenceId: "parallel", startFrame: 10, endFrameExclusive: 21, mode: "explicit-reference", anchors: [
        {role: "OVERLAP_LAYER", sourceFrame: 15},
      ]},
      {sequenceId: "exit", startFrame: 15, endFrameExclusive: 40, mode: "semantic-motion", anchors: [
        {role: "HANDOFF", sourceFrame: 15},
      ]},
    ],
  });
  const sharedAsset = compiled.assets[0];
  const plan = sealPlan({...compiled, assets: sharedAsset.references.map((reference, index) => ({
    ...sharedAsset,
    id: `duplicate-row-${index}`,
    references: [reference],
  })), sha256: undefined});
  const result = planReferenceFrameExtractionBatchesV1({plan, maxImagesPerBatch: 1, maxArtifactsPerBatch: 2});
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].uniqueFrameCount, 1);
  assert.equal(result.batches[0].referenceCount, 3);
  assert.deepEqual(result.batches[0].assets[0].references.map((reference) => [reference.sequenceId, reference.role]), [
    ["exit", "HANDOFF"],
    ["hold", "REPRESENTATIVE_HOLD"],
    ["parallel", "OVERLAP_LAYER"],
  ]);
  assert.equal(result.summary.sourcePlanReferenceCount, 3);
  assert.equal(result.summary.mergedDuplicateAssetRows, 2);
}

function testMultiSourceIdentityAndStableOrdering() {
  const references = [
    {sequenceId: "source-a", role: "ENTER", sourceFrame: 7, scope: "SEQUENCE", reason: "source A event"},
    {sequenceId: "source-b", role: "ENTER", sourceFrame: 7, scope: "SEQUENCE", reason: "source B event"},
    {sequenceId: "source-a", role: "HOLD", sourceFrame: 2, scope: "SEQUENCE", reason: "source A hold"},
  ];
  const assets = [
    {id: "b-frame-7", sourceVideoSha256: sourceB, sourceFrame: 7,
      references: [{sequenceId: "source-b", role: "ENTER", scope: "SEQUENCE", reason: "source B event"}]},
    {id: "a-frame-7", sourceVideoSha256: sourceA, sourceFrame: 7,
      references: [{sequenceId: "source-a", role: "ENTER", scope: "SEQUENCE", reason: "source A event"}]},
    {id: "a-frame-2", sourceVideoSha256: sourceA, sourceFrame: 2,
      references: [{sequenceId: "source-a", role: "HOLD", scope: "SEQUENCE", reason: "source A hold"}]},
  ];
  const plan = sealPlan({
    contract: A1_REFERENCE_FRAME_REVIEW_POLICY_V1,
    source: {videoSha256: sourceA, fps: 30, totalFrames: 120},
    references,
    assets,
    summary: {referenceCount: 3, uniqueSourceFrames: 3, reusedReferences: 0,
      extractedImages: 0, visualApproval: false, productionAdmission: false},
  });
  const planned = planReferenceFrameExtractionBatchesV1({plan, maxImagesPerBatch: 2, maxArtifactsPerBatch: 3});
  assert.equal(planned.summary.sourceVideoCount, 2);
  assert.equal(planned.batches.length, 2, "batches must not mix distinct source videos");
  assert.deepEqual(planned.batches.map((batch) => batch.sourceVideoSha256), [sourceA, sourceB]);
  assert.deepEqual(planned.batches[0].assets.map((asset) => asset.sourceFrame), [2, 7]);
  assert.deepEqual(planned.batches[1].assets.map((asset) => asset.sourceFrame), [7]);
  assert.notEqual(planned.batches[0].assets[1].sourceVideoSha256, planned.batches[1].assets[0].sourceVideoSha256,
    "same frame number from different video SHAs must remain distinct");

  const reversedPlan = sealPlan({...plan, assets: [...assets].reverse(), references: [...references].reverse(), sha256: undefined});
  const reversed = planReferenceFrameExtractionBatchesV1({plan: reversedPlan, maxImagesPerBatch: 2, maxArtifactsPerBatch: 3});
  assert.deepEqual(reversed.batches.map((batch) => batch.assets), planned.batches.map((batch) => batch.assets),
    "asset and reference ordering must be canonical after planning");
  const repeated = planReferenceFrameExtractionBatchesV1({plan, maxImagesPerBatch: 2, maxArtifactsPerBatch: 3});
  assert.deepEqual(repeated, planned, "the same plan and budgets must compile byte-stable output");
}

function testSixtyAndSixtyOneFrameBoundaries() {
  const frames60 = [...Array.from({length: 59}, (_, index) => index), 60];
  const plan60 = planForStableFrames({totalFrames: 61, frames: frames60});
  const oneBatch = planReferenceFrameExtractionBatchesV1({plan: plan60});
  assert.equal(oneBatch.batches.length, 1);
  assert.equal(oneBatch.batches[0].uniqueFrameCount, 60);
  assert.equal(oneBatch.batches[0].artifactCountWithReceipt, 61);
  assert.equal(oneBatch.batches[0].artifactCountWithReceipt <= 64, true);
  assert.deepEqual(oneBatch.batches[0].assets.map((asset) => asset.sourceFrame), frames60);

  const plan61 = planForStableFrames({totalFrames: 61, frames: Array.from({length: 61}, (_, index) => index)});
  const twoBatches = planReferenceFrameExtractionBatchesV1({plan: plan61});
  assert.deepEqual(twoBatches.batches.map((batch) => batch.uniqueFrameCount), [60, 1]);
  assert.deepEqual(twoBatches.batches.map((batch) => batch.artifactCountWithReceipt), [61, 2]);
  const allFrames = twoBatches.batches.flatMap((batch) => batch.assets.map((asset) => asset.sourceFrame));
  assert.deepEqual(allFrames, Array.from({length: 61}, (_, index) => index), "61 frames must be batched, never truncated");
  assert.equal(twoBatches.summary.sourcePlanReferenceCount, 61);
  assert.equal(twoBatches.summary.uniqueSourceFrameCount, 61);
}

function testReferenceConservationAndHashBindings() {
  const plan = compileReferenceFrameReviewPlanV1({
    sourceVideoSha256: sourceA,
    fps: 30,
    totalFrames: 200,
    sequences: [
      {sequenceId: "start", startFrame: 0, endFrameExclusive: 40, mode: "semantic-motion", anchors: [
        {role: "ENTER", sourceFrame: 0}, {role: "HOLD", sourceFrame: 30},
      ]},
      {sequenceId: "overlap", startFrame: 30, endFrameExclusive: 70, mode: "semantic-motion", anchors: [
        {role: "HANDOFF", sourceFrame: 30}, {role: "EXIT", sourceFrame: 69},
      ]},
    ],
  });
  const result = planReferenceFrameExtractionBatchesV1({plan, maxImagesPerBatch: 2, maxArtifactsPerBatch: 3});
  const outputReferences = result.batches.flatMap((batch) => batch.assets.flatMap((asset) => asset.references));
  assert.equal(outputReferences.length, plan.references.length);
  assert.equal(result.batches.reduce((sum, batch) => sum + batch.referenceCount, 0), plan.references.length);
  assert.equal(result.sourcePlanSha256, plan.sha256);
  assert.equal(planReferenceFrameExtractionBatchesV1({plan}).sourcePlanSha256, plan.sha256);

  for (const batch of result.batches) {
    const {sha256: digest, ...body} = batch;
    assert.equal(digest, sha256(Buffer.from(JSON.stringify(body), "utf8")), `${batch.id} digest`);
    assert.equal(batch.contract, A1_REFERENCE_FRAME_EXTRACTION_BATCH_V1);
    assert.equal(batch.inputPlanSha256, plan.sha256);
    assert.equal(batch.artifactCountWithReceipt, batch.uniqueFrameCount + 1);
    assert.ok(batch.uniqueFrameCount <= 60);
  }
  const {sha256: resultDigest, ...resultBody} = result;
  assert.equal(resultDigest, sha256(Buffer.from(JSON.stringify(resultBody), "utf8")));
}

function testFailClosedSchemaHashAndBudget() {
  const valid = planForStableFrames({totalFrames: 20, frames: [1, 2, 3]});
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: {...valid, sha256: "0".repeat(64)}}), /plan-sha-mismatch/u);
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: {...valid, contract: "Other/v1"}}), /plan-sha-mismatch|contract-mismatch/u);
  const badRole = sealPlan({...valid, assets: valid.assets.map((asset) => ({...asset, references: asset.references.map((ref) => ({...ref, role: "bad role"}))}))});
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: badRole}), /asset-reference-invalid/u);
  const badFrame = sealPlan({...valid, assets: valid.assets.map((asset, index) => index === 0 ? {...asset, sourceFrame: -1} : asset)});
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: badFrame}), /asset-invalid/u);
  const missingReference = sealPlan({...valid, references: valid.references.slice(1)});
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: missingReference}), /reference-conservation-failed/u);
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: valid, maxImagesPerBatch: 61}), /budget-invalid/u);
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: valid, maxArtifactsPerBatch: 65}), /budget-invalid/u);
  assert.throws(() => planReferenceFrameExtractionBatchesV1({plan: valid, maxImagesPerBatch: 60, maxArtifactsPerBatch: 60}), /budget-invalid/u);
  assert.equal(REFERENCE_FRAME_BATCH_LIMITS_V1.absoluteMaxArtifactsPerBatch, 64);
}

testThreeSyntheticGenrePlans();
testRepeatedFrameMergesButRetainsEveryReference();
testMultiSourceIdentityAndStableOrdering();
testSixtyAndSixtyOneFrameBoundaries();
testReferenceConservationAndHashBindings();
testFailClosedSchemaHashAndBudget();
console.log("PASS a1-reference-frame-batch-planner-v1: three synthetic genres, stable multi-source dedup, reference conservation, 60/61 batching, hashes, and fail-closed limits");
