#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createNodeAdapterRegistry, executeRegisteredNode, createNodeArtifactVerificationContextV1,
  getNodeArtifactVerificationContextSummaryV1, closeNodeArtifactVerificationContextV1} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts, NODE_ARTIFACT_MANIFEST_CONTRACT, verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {
  A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1,
  A1_NODE_FFMPEG_SOURCE_KEYFRAME_INDEX_V1,
  FFMPEG_SOURCE_KEYFRAME_INDEX_JSON_CONTRACT_V1,
  assertSourceIndexStartPtsEligibleV1,
  createNodeFfmpegSourceIndexerAdapterV1,
  validateSourceKeyframeIndexV1,
} from "../apps/studio-next/src/lib/a1-node-ffmpeg-source-indexer-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffmpegPath = process.env.A1_TEST_FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = process.env.A1_TEST_FFPROBE_PATH || "/Users/a1/.local/bin/ffprobe";
const artifactVerifierFfprobePath = path.join(repoRoot, ".tools/bin/ffprobe");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-ffmpeg-source-indexer-v1-"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function runCli(binary, args, {timeout = 120_000, maxBuffer = 2 * 1024 * 1024} = {}) {
  return execFileSync(binary, args, {encoding: "utf8", timeout, maxBuffer, stdio: ["ignore", "pipe", "pipe"]});
}

function hashFile(filename) {
  return sha256(fs.readFileSync(filename));
}

async function acceptVideo(root, filename) {
  const bytes = fs.readFileSync(filename), relativePath = path.relative(root, filename).split(path.sep).join("/");
  const nodeId = "fixture:source-video";
  const artifactManifest = {
    contract: NODE_ARTIFACT_MANIFEST_CONTRACT,
    nodeId,
    inputSha256: sha256(Buffer.from(`${nodeId}/input`, "utf8")),
    productionAdmission: false,
    artifacts: [{path: relativePath, role: "source-video", kind: "VIDEO", expectedMedia: {width: 160, height: 90, fps: 30},
      sha256: sha256(bytes), bytes: bytes.length}],
  };
  const workflow = await acceptNodeArtifacts({scope: "REVIEW_ONLY", productionAdmission: false,
    nodes: [{id: nodeId, inputSha256: artifactManifest.inputSha256, state: "needs-review",
      result: {state: "needs-review", productionAdmission: false, artifactManifest}}]}, nodeId,
  {artifactRoot: root, reviewerId: "synthetic-source-index-acceptance", ffprobePath: artifactVerifierFfprobePath});
  const accepted = workflow.nodes[0];
  assert.equal(accepted.state, "succeeded");
  assert.equal(accepted.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(accepted.acceptance.productionAdmission, false);
  return {
    id: nodeId,
    inputSha256: accepted.inputSha256,
    binding: {dependencyId: nodeId, acceptedManifestSha256: accepted.acceptance.manifestSha256,
      artifact: {path: relativePath, sha256: sha256(bytes), bytes: bytes.length}},
    dependency: {state: "succeeded", manifestSha256: accepted.acceptance.manifestSha256,
      artifacts: accepted.acceptance.artifacts.map((artifact) => ({...artifact,
        absolutePath: path.join(accepted.acceptance.artifactRoot, artifact.path)}))},
    acceptedNode: accepted,
    filename,
  };
}

function makeIndexerNode(videoFixture, adapter) {
  const input = {
    projectId: "synthetic-source-indexer-test",
    context: {},
    shot: {id: "source", source: "Synthetic generated CFR source video."},
    module: A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1,
    moduleVersion: adapter.version,
    implementationSha256: adapter.implementationSha256,
    need: true,
    parameters: {sourceVideoBinding: structuredClone(videoFixture.binding)},
  };
  return {
    id: "fixture:source-indexer",
    shotId: "source",
    module: A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1,
    input,
    inputSha256: nodeInputHash({input, dependencies: {
      inputs: [{id: videoFixture.id, inputSha256: videoFixture.inputSha256,
        acceptedManifestSha256: videoFixture.binding.acceptedManifestSha256}],
      artifactKinds: {"source-video": ["VIDEO"]},
    }}),
    dependencies: [videoFixture.id],
    dependencyArtifactKinds: {[videoFixture.id]: ["VIDEO"]},
    state: "running",
    lease: {workerId: "synthetic-indexer-test", token: "source-index-test-lease", expiresAt: Date.now() + 60_000},
  };
}

let adapter;
try {
  assert.equal(assertSourceIndexStartPtsEligibleV1(0n), 0n);
  assert.throws(() => assertSourceIndexStartPtsEligibleV1(-1n), /FRAME_SOURCE_INDEX_NEGATIVE_START_PTS/u);
  assert.ok(fs.existsSync(ffmpegPath), `trusted FFmpeg unavailable: ${ffmpegPath}`);
  assert.ok(fs.existsSync(ffprobePath), `trusted FFprobe unavailable: ${ffprobePath}`);
  adapter = createNodeFfmpegSourceIndexerAdapterV1({ffprobePath});
  assert.equal(adapter.version, 1);
  assert.equal(adapter.enabled, true);
  assert.equal(adapter.optional, true);
  assert.equal(adapter.tool.path, path.resolve(ffprobePath));
  assert.equal(adapter.processCounts.toolVersionProbeAtConstruction, 1);
  assert.equal(adapter.processCounts.packetIndexScanPerExecute, 1);
  assert.equal(createNodeAdapterRegistry().registry[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1], undefined,
    "source indexer must remain outside the default production registry");
  const injectedRegistry = createNodeAdapterRegistry({[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: adapter});
  assert.equal(injectedRegistry.definitions[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1].optional, true);

  const sourceRoot = path.join(tempRoot, "source-artifacts");
  const sourcePath = path.join(sourceRoot, "media", "synthetic-30fps-long-gop.mp4");
  fs.mkdirSync(path.dirname(sourcePath), {recursive: true});
  runCli(ffmpegPath, [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=8",
    "-frames:v", "240", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-bf", "0",
    "-x264-params", "open-gop=0:scenecut=0", "-fps_mode", "cfr", "-threads", "1", "-y", sourcePath,
  ]);
  const sourceVideoSha256 = hashFile(sourcePath);
  const sourceFixture = await acceptVideo(sourceRoot, sourcePath);
  assert.equal(sourceFixture.binding.artifact.sha256, sourceVideoSha256);
  const node = makeIndexerNode(sourceFixture, adapter);
  const artifactRoot = path.join(tempRoot, "indexer-output");
  const first = await adapter.execute(node, {dependencies: {[sourceFixture.id]: structuredClone(sourceFixture.dependency)}, artifactRoot});
  assert.equal(first.state, "needs-review", `indexer returned ${first.reason}`);
  assert.equal(first.visualApproval, "NOT_GRANTED");
  assert.equal(first.productionAdmission, false);
  assert.deepEqual(first.summary.ffprobeProcessCounts, {
    toolVersionProbeProcessCount: 1,
    packetIndexScanProcessCount: 1,
    toolVersionProbeScope: "adapter-construction",
    schedulerSourceVideoMetadataProbe: "OUTSIDE_ADAPTER_NOT_COUNTED",
  });
  assert.equal(first.summary.ffprobePacketScanCount, 1);
  assert.equal(first.artifactManifest.productionAdmission, false);
  assert.equal(first.artifactManifest.artifacts.length, 1);
  const [declared] = first.artifactManifest.artifacts;
  assert.equal(declared.role, "source-keyframe-index");
  assert.equal(declared.kind, "JSON_PLAN");
  assert.equal(declared.jsonContract, FFMPEG_SOURCE_KEYFRAME_INDEX_JSON_CONTRACT_V1);
  assert.equal(first.summary.indexArtifactSha256, declared.sha256);
  const indexPath = path.join(artifactRoot, declared.path);
  const indexBytes = fs.readFileSync(indexPath);
  assert.equal(indexBytes.length, declared.bytes);
  assert.equal(hashFile(indexPath), declared.sha256);
  const index = JSON.parse(indexBytes.toString("utf8"));
  assert.equal(index.contract, A1_NODE_FFMPEG_SOURCE_KEYFRAME_INDEX_V1);
  assert.equal(index.nodeId, node.id);
  assert.equal(index.inputSha256, node.inputSha256);
  assert.equal(index.sourceVideoBinding.acceptedManifestSha256, sourceFixture.binding.acceptedManifestSha256);
  assert.equal(index.source.sourceVideoSha256, sourceVideoSha256);
  assert.equal(index.source.totalFrames, 240);
  assert.equal(index.source.fps, 30);
  assert.deepEqual(index.keyframes.map((row) => row.sourceFrame), [0, 60, 120, 180]);
  assert.equal(index.tool.path, adapter.tool.path);
  assert.equal(index.tool.version, adapter.tool.version);
  assert.equal(index.tool.binarySha256, adapter.tool.binarySha256);
  assert.deepEqual(index.probeAudit, {toolVersionProbeProcessCount: 1, packetIndexScanProcessCount: 1,
    toolVersionProbeScope: "adapter-construction"});
  assert.deepEqual(first.summary.sourceByteAudit, {adapterFullFileSha256Passes: 2,
    adapterBytesHashed: index.sourceVideoBinding.artifact.bytes * 2,
    sourceIntegrityMode: "ADAPTER_FULL_SHA",
    schedulerSourceVideoRevalidation: "OUTSIDE_ADAPTER_NOT_COUNTED"});
  const {indexSha256, ...indexBody} = index;
  assert.equal(indexSha256, nodeInputHash(indexBody));
  const validated = validateSourceKeyframeIndexV1(index, {sourceVideoBinding: sourceFixture.binding,
    source: {sourceVideoSha256, fps: 30, totalFrames: 240}, indexNodeId: node.id});
  assert.equal(validated.keyframes.length, 4);
  const tamperedSemanticIndex = structuredClone(index);
  tamperedSemanticIndex.keyframes[1].pts = String(BigInt(tamperedSemanticIndex.keyframes[1].pts) + 1n);
  assert.throws(() => validateSourceKeyframeIndexV1(tamperedSemanticIndex, {
    sourceVideoBinding: sourceFixture.binding,
    source: {sourceVideoSha256, fps: 30, totalFrames: 240},
    indexNodeId: node.id,
  }), /FRAME_SOURCE_INDEX_DOCUMENT_SHA_MISMATCH/u,
  "changed semantic frame timing must fail the index body SHA");

  const verifier = await verifyNodeArtifactManifest(first.artifactManifest, {artifactRoot, node,
    ffprobePath: artifactVerifierFfprobePath});
  assert.equal(verifier.artifacts.length, 1);
  assert.equal(verifier.artifacts[0].metadata.jsonContract, FFMPEG_SOURCE_KEYFRAME_INDEX_JSON_CONTRACT_V1);
  const accepted = await acceptNodeArtifacts({scope: "REVIEW_ONLY", productionAdmission: false,
    nodes: [{...node, state: "needs-review", result: first, acceptance: null}]}, node.id,
  {artifactRoot, reviewerId: "synthetic-source-index-acceptance"});
  const acceptedNode = accepted.nodes[0];
  assert.equal(acceptedNode.state, "succeeded");
  assert.equal(acceptedNode.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(acceptedNode.acceptance.productionAdmission, false);
  assert.equal(acceptedNode.acceptance.artifacts[0].role, "source-keyframe-index");

  const verificationContext = createNodeArtifactVerificationContextV1({ffprobePath});
  assert.equal(verificationContext.enabled, true);
  const schedulerRegistry = createNodeAdapterRegistry({[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: adapter});
  const schedulerArtifactRoot = path.join(tempRoot, "indexer-attested-output");
  const scheduledResult = await executeRegisteredNode({scope: "REVIEW_ONLY", productionAdmission: false,
    modules: schedulerRegistry.definitions, nodes: [sourceFixture.acceptedNode, node]}, node,
  {registry: schedulerRegistry.registry, verificationContext, ffprobePath, artifactRoot: schedulerArtifactRoot});
  assert.equal(scheduledResult.state, "needs-review", `attested indexer returned ${scheduledResult.reason}`);
  assert.equal(scheduledResult.artifactManifest.artifacts[0].sha256, first.artifactManifest.artifacts[0].sha256,
    "the accepted keyframe-index artifact remains stable across full-SHA and attested source verification modes");
  assert.deepEqual(scheduledResult.summary.sourceByteAudit, {
    adapterFullFileSha256Passes: 0,
    adapterBytesHashed: 0,
    sourceIntegrityMode: "RUN_SCOPED_ATTESTATION_STAT_RECHECK",
    schedulerSourceVideoRevalidation: "OUTSIDE_ADAPTER_NOT_COUNTED",
  }, "a current accepted-source attestation must replace duplicate indexer SHA passes with stat checks");
  assert.equal(scheduledResult.summary.ffprobeProcessCounts.packetIndexScanProcessCount, 1,
    "the indexer still performs its one packet scan when reusing a source verification attestation");
  const verificationSummary = getNodeArtifactVerificationContextSummaryV1(verificationContext);
  assert.equal(verificationSummary.counters.toolVersionProbeProcessCount, 1);
  assert.equal(verificationSummary.counters.sourceVideoShaPassCount, 1);
  assert.equal(verificationSummary.counters.genericMediaMetadataProbeCount, 1);
  closeNodeArtifactVerificationContextV1(verificationContext);

  const missingSource = await adapter.execute(node, {dependencies: {}, artifactRoot});
  assert.equal(missingSource.state, "blocked");
  assert.equal(missingSource.reason, "FRAME_SOURCE_INDEX_ACCEPTANCE_RECEIPT_MISMATCH");
  console.log("PASS node-ffmpeg-source-indexer-v1: source indexing retains two SHA passes without an attestation, consumes a current scheduler attestation with zero adapter SHA passes, keeps one packet scan and separate version/media-probe counters, and remains review-only");
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
