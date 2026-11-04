#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  A1_NODE_FRAME_EXTRACTION_BATCH_FANOUT_V1,
  buildNodeFrameExtractionBatchFanoutV1,
} from "../apps/studio-next/src/lib/a1-node-frame-extraction-batch-fanout-v1.mjs";
import {A1_REFERENCE_FRAME_REVIEW_POLICY_V1, compileReferenceFrameReviewPlanV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {planReferenceFrameExtractionBatchesV1} from "../apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs";
import {NODE_ARTIFACT_ACCEPTANCE_CONTRACT} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {A1_NODE_FFMPEG_SOURCE_KEYFRAME_INDEX_V1} from "../apps/studio-next/src/lib/a1-node-ffmpeg-source-indexer-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const jsonSha = (value) => sha256(Buffer.from(JSON.stringify(value), "utf8"));
const acceptedNode = ({id, inputKey, result, artifact}) => {
  const inputSha256 = sha256(Buffer.from(inputKey, "utf8"));
  const node = {
    id, inputSha256, state: "succeeded",
    result: {...result, productionAdmission: false},
    acceptance: {
      contract: NODE_ARTIFACT_ACCEPTANCE_CONTRACT,
      inputSha256,
      manifestSha256: "",
      sourceResultSha256: "",
      artifacts: [artifact],
      verificationScope: "BYTES_AND_FORMAT_ONLY",
      visualApproval: "NOT_GRANTED",
      productionAdmission: false,
    },
  };
  node.acceptance.manifestSha256 = nodeInputHash({nodeId: node.id, inputSha256: node.inputSha256,
    artifacts: node.acceptance.artifacts, productionAdmission: false});
  return node;
};

function sealAcceptedNode(input) {
  const node = acceptedNode(input);
  node.acceptance.sourceResultSha256 = nodeInputHash(node.result);
  return node;
}

function makeSourceNode(genre, sourceVideoSha256) {
  return sealAcceptedNode({
    id: `${genre}:source-video`,
    inputKey: `source-input:${genre}:${sourceVideoSha256}`,
    result: {summary: {sourceVideoSha256}},
    artifact: {
      path: `fixtures/${genre}/source.avi`, role: "source-video", kind: "VIDEO",
      sha256: sourceVideoSha256, bytes: 4096,
      metadata: {width: 160, height: 90, fps: 30, durationSeconds: 200 / 30},
    },
  });
}

function makeBatchPlanNodes(genre, batchPlan) {
  return batchPlan.batches.map((batch) => sealAcceptedNode({
    id: `${genre}:${batch.id}:frame-review-plan`,
    inputKey: `frame-plan-input:${genre}:${batch.sha256}`,
    result: {summary: {batchId: batch.id, batchSha256: batch.sha256, sourcePlanSha256: batchPlan.sourcePlanSha256}},
    artifact: {
      path: `fixtures/${genre}/${batch.id}/frame-review-plan.json`,
      role: "frame-review-plan", kind: "JSON_PLAN", sha256: sha256(Buffer.from(`plan:${genre}:${batch.sha256}`, "utf8")),
      bytes: 1024 + batch.assets.length,
      metadata: {jsonContract: "A1NodeFrameReviewPlanOutput/v1"},
    },
  }));
}

function makeSourceIndexNode(genre, sourceNode, totalFrames) {
  const sourceVideoSha256 = sourceNode.result.summary.sourceVideoSha256;
  const indexSha256 = sha256(Buffer.from(`source-index:${genre}:${sourceVideoSha256}`, "utf8"));
  return sealAcceptedNode({
    id: `${genre}:source-keyframe-index`,
    inputKey: `source-index-input:${genre}:${sourceVideoSha256}`,
    result: {summary: {sourceVideoSha256,
      sourceVideoManifestSha256: sourceNode.acceptance.manifestSha256,
      indexSha256: sha256(Buffer.from(`semantic-index:${genre}:${sourceVideoSha256}`, "utf8")),
      indexArtifactSha256: indexSha256,
      totalFrames,
      ffprobeProcessCounts: {packetIndexScanProcessCount: 1, toolVersionProbeScope: "adapter-construction"}}},
    artifact: {
      path: `fixtures/${genre}/source-keyframe-index.json`,
      role: "source-keyframe-index", kind: "JSON_PLAN",
      metadata: {jsonContract: A1_NODE_FFMPEG_SOURCE_KEYFRAME_INDEX_V1},
      sha256: indexSha256, bytes: 2048,
    },
  });
}

function makePolicyPlan({genre, sourceVideoSha256, frames}) {
  return compileReferenceFrameReviewPlanV1({
    sourceVideoSha256,
    fps: 30,
    totalFrames: 200,
    sequences: frames.map((sourceFrame, index) => ({
      sequenceId: `${genre}-sequence-${String(index).padStart(3, "0")}`,
      startFrame: sourceFrame,
      endFrameExclusive: sourceFrame + 1,
      mode: "stable-hold",
      representativeFrame: sourceFrame,
    })),
  });
}

function compileGenreFanout({genre, frames}) {
  const sourceVideoSha256 = sha256(Buffer.from(`source:${genre}`, "utf8"));
  const policyPlan = makePolicyPlan({genre, sourceVideoSha256, frames});
  const batchPlan = planReferenceFrameExtractionBatchesV1({plan: policyPlan});
  const sourceNode = makeSourceNode(genre, sourceVideoSha256);
  const planNodes = makeBatchPlanNodes(genre, batchPlan);
  const result = buildNodeFrameExtractionBatchFanoutV1({batchPlan, sourceNodes: [sourceNode], batchPlanNodes: planNodes});
  return {genre, sourceVideoSha256, policyPlan, batchPlan, sourceNode, planNodes, result};
}

function testThreeGenresAndSharedSourceFanout() {
  const cases = [
    {genre: "batch-fanout-evidence", frames: [1, 24]},
    {genre: "batch-fanout-tutorial", frames: Array.from({length: 61}, (_, index) => index)},
    {genre: "batch-fanout-opinion", frames: [7, 19, 44]},
  ];
  const compiled = cases.map(compileGenreFanout);
  assert.deepEqual(compiled.map((item) => item.result.contract), Array(3).fill(A1_NODE_FRAME_EXTRACTION_BATCH_FANOUT_V1));
  assert.deepEqual(compiled.map((item) => item.result.taskCount), [1, 2, 1]);
  assert.deepEqual(compiled[1].batchPlan.batches.map((batch) => batch.uniqueFrameCount), [60, 1]);
  assert.equal(new Set(compiled.map((item) => item.genre)).size, 3);
  const allShots = compiled.flatMap((item) => item.result.shots);
  assert.equal(allShots.length, 4);
  assert.equal(new Set(allShots.map((shot) => shot.id)).size, 4);

  const tutorialShots = compiled[1].result.shots;
  assert.equal(tutorialShots.length, 2);
  assert.deepEqual(tutorialShots.map((shot) => shot.moduleDependencyBindings["ffmpeg-frame-extractor"][0].nodeId), [
    compiled[1].sourceNode.id, compiled[1].sourceNode.id,
  ], "multiple batch tasks must reuse the one accepted source node");
  assert.equal(new Set(tutorialShots.map((shot) => shot.moduleDependencyBindings["ffmpeg-frame-extractor"][1].nodeId)).size, 2,
    "each task must bind its own accepted batch plan");

  for (const item of compiled) {
    const {sha256: digest, ...body} = item.result;
    assert.equal(digest, jsonSha(body));
    assert.equal(item.result.batchPlanSha256, item.batchPlan.sha256);
    assert.equal(item.result.summary.sourceVideoCount, 1);
    assert.equal(item.result.summary.imagesExtracted, 0);
    for (const shot of item.result.shots) {
      const binding = shot.moduleInputs["ffmpeg-frame-extractor"];
      assert.equal(shot.modules["ffmpeg-frame-extractor"], true);
      assert.equal(binding.sourceVideoBinding.acceptedManifestSha256, item.sourceNode.acceptance.manifestSha256);
      assert.equal(binding.sourceVideoBinding.artifact.sha256, item.sourceVideoSha256);
      assert.equal(binding.framePlanBinding.acceptedManifestSha256,
        item.planNodes.find((node) => node.id === binding.framePlanBinding.dependencyId).acceptance.manifestSha256);
      assert.deepEqual(shot.moduleDependencyBindings["ffmpeg-frame-extractor"].map((dep) => dep.artifactKinds), [["VIDEO"], ["JSON_PLAN"]]);
      assert.equal(shot.source.includes("batch-fanout-"), false, "fixture identifiers stay in the test data, not product copy");
    }
  }
  assert.deepEqual(compileGenreFanout(cases[1]).result, compiled[1].result, "identical accepted inputs must create byte-stable task descriptors");
}

function testFailClosedOnBadReceiptsAndBatchBindings() {
  const fixture = compileGenreFanout({genre: "batch-fanout-tutorial", frames: [4, 19, 51]});
  const batchNode = fixture.planNodes[0];
  const invalidState = {...batchNode, state: "failed"};
  assert.throws(() => buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [fixture.sourceNode], batchPlanNodes: [invalidState]}), /ACCEPTED_DEPENDENCY_REQUIRED/u);

  const wrongBatchBinding = {...batchNode, result: {summary: {...batchNode.result.summary, batchSha256: "f".repeat(64)},
    productionAdmission: false}};
  wrongBatchBinding.acceptance = {...wrongBatchBinding.acceptance,
    sourceResultSha256: nodeInputHash(wrongBatchBinding.result)};
  assert.throws(() => buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [fixture.sourceNode], batchPlanNodes: [wrongBatchBinding]}), /BATCH_RECEIPT_MISMATCH/u);

  const wrongArtifactKind = {...fixture.sourceNode, acceptance: {...fixture.sourceNode.acceptance,
    artifacts: fixture.sourceNode.acceptance.artifacts.map((artifact) => ({...artifact, kind: "IMAGE"}))}};
  wrongArtifactKind.acceptance.manifestSha256 = nodeInputHash({nodeId: wrongArtifactKind.id,
    inputSha256: wrongArtifactKind.inputSha256, artifacts: wrongArtifactKind.acceptance.artifacts, productionAdmission: false});
  assert.throws(() => buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [wrongArtifactKind], batchPlanNodes: fixture.planNodes}), /DEPENDENCY_ARTIFACT_MISMATCH/u);

  const staleSource = {...fixture.sourceNode, result: {...fixture.sourceNode.result, summary: {sourceVideoSha256: "e".repeat(64)}}};
  staleSource.acceptance = {...staleSource.acceptance, sourceResultSha256: nodeInputHash(staleSource.result)};
  assert.throws(() => buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [staleSource], batchPlanNodes: fixture.planNodes}), /SOURCE_SHA_MISMATCH/u);

  const approvalLeak = {...batchNode, acceptance: {...batchNode.acceptance, visualApproval: "APPROVED"}};
  assert.throws(() => buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [fixture.sourceNode], batchPlanNodes: [approvalLeak]}), /ACCEPTED_DEPENDENCY_REQUIRED/u);

  assert.throws(() => buildNodeFrameExtractionBatchFanoutV1({batchPlan: {...fixture.batchPlan, sha256: "0".repeat(64)},
    sourceNodes: [fixture.sourceNode], batchPlanNodes: fixture.planNodes}), /BATCH_PLAN_SHA_MISMATCH/u);
}

function testHashInputsBindTaskReceipts() {
  const fixture = compileGenreFanout({genre: "batch-fanout-evidence", frames: [10]});
  const shot = fixture.result.shots[0];
  const changedSource = {...shot, moduleInputs: structuredClone(shot.moduleInputs)};
  changedSource.moduleInputs["ffmpeg-frame-extractor"].sourceVideoBinding.acceptedManifestSha256 = "c".repeat(64);
  assert.notEqual(jsonSha(shot.moduleInputs), jsonSha(changedSource.moduleInputs),
    "different accepted source receipt must change the scheduler module input fingerprint");
}

function testOneAcceptedSourceIndexIsReusedAcrossExtractorBatches() {
  const fixture = compileGenreFanout({genre: "batch-fanout-indexed-tutorial", frames: Array.from({length: 61}, (_, index) => index)});
  const sourceIndexNode = makeSourceIndexNode(fixture.genre, fixture.sourceNode, 200);
  const result = buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [fixture.sourceNode], batchPlanNodes: fixture.planNodes, sourceIndexNodes: [sourceIndexNode]});
  assert.equal(result.sourceIndexNodeCount, 1);
  assert.equal(result.summary.sourceIndexNodesReusedAcrossBatches, true);
  assert.equal(result.shots.length, 2);
  assert.deepEqual(result.shots.map((shot) => shot.moduleDependencyBindings["ffmpeg-frame-extractor"][2].nodeId),
    [sourceIndexNode.id, sourceIndexNode.id]);
  for (const shot of result.shots) {
    const indexBinding = shot.moduleInputs["ffmpeg-frame-extractor"].sourceIndexBinding;
    assert.equal(indexBinding.dependencyId, sourceIndexNode.id);
    assert.equal(indexBinding.acceptedManifestSha256, sourceIndexNode.acceptance.manifestSha256);
    assert.equal(indexBinding.artifact.sha256, sourceIndexNode.acceptance.artifacts[0].sha256);
    assert.deepEqual(shot.moduleDependencyBindings["ffmpeg-frame-extractor"][2].artifactKinds, ["JSON_PLAN"]);
  }
  const changedIndex = structuredClone(sourceIndexNode);
  changedIndex.acceptance.artifacts[0].sha256 = "f".repeat(64);
  changedIndex.acceptance.manifestSha256 = nodeInputHash({nodeId: changedIndex.id,
    inputSha256: changedIndex.inputSha256, artifacts: changedIndex.acceptance.artifacts, productionAdmission: false});
  changedIndex.result.summary.indexSha256 = "e".repeat(64);
  changedIndex.result.summary.indexArtifactSha256 = "f".repeat(64);
  changedIndex.acceptance.sourceResultSha256 = nodeInputHash(changedIndex.result);
  const changedResult = buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [fixture.sourceNode], batchPlanNodes: fixture.planNodes, sourceIndexNodes: [changedIndex]});
  assert.notEqual(changedResult.shots[0].moduleInputs["ffmpeg-frame-extractor"].sourceIndexBinding.artifact.sha256,
    result.shots[0].moduleInputs["ffmpeg-frame-extractor"].sourceIndexBinding.artifact.sha256,
    "a changed accepted index artifact SHA must change dependent extractor inputs");
  const staleSourceReceipt = structuredClone(sourceIndexNode);
  staleSourceReceipt.result.summary.sourceVideoManifestSha256 = "0".repeat(64);
  staleSourceReceipt.acceptance.sourceResultSha256 = nodeInputHash(staleSourceReceipt.result);
  assert.throws(() => buildNodeFrameExtractionBatchFanoutV1({batchPlan: fixture.batchPlan,
    sourceNodes: [fixture.sourceNode], batchPlanNodes: fixture.planNodes, sourceIndexNodes: [staleSourceReceipt]}),
  /SOURCE_INDEX_BINDING_MISMATCH/u, "an index bound to another accepted source receipt must not fan out");
}

testThreeGenresAndSharedSourceFanout();
testFailClosedOnBadReceiptsAndBatchBindings();
testHashInputsBindTaskReceipts();
testOneAcceptedSourceIndexIsReusedAcrossExtractorBatches();
console.log("PASS a1-node-frame-extraction-batch-fanout-v1: three genres, shared source receipt, per-batch plan binding, fail-closed receipt gates, stable task descriptors");
