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
  A1_NODE_FFMPEG_FRAME_EXTRACTOR_V1,
  A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1,
  FFMPEG_FRAME_EXTRACTOR_DECODE_METRIC_V1,
  FFMPEG_FRAME_EXTRACTOR_PROFILE_V1,
  FFMPEG_FRAME_EXTRACTOR_WINDOWED_PROFILE_V1,
  assertWindowedSourcePtsEligibilityV1,
  createNodeFfmpegFrameExtractorAdapterV1,
} from "../apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs";
import {A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1} from "../apps/studio-next/src/lib/a1-node-frame-review-plan-adapter-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {compileReferenceFrameReviewPlanV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {createNodeFfmpegSourceIndexerAdapterV1} from "../apps/studio-next/src/lib/a1-node-ffmpeg-source-indexer-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffmpegPath = process.env.A1_TEST_FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = path.join(repoRoot, ".tools/bin/ffprobe");
const windowedFfprobePath = process.env.A1_TEST_FFPROBE_PATH || "/Users/a1/.local/bin/ffprobe";
const selectedFrames = [0, 17, 59, 177, 299];
const sourceWidth = 160;
const sourceHeight = 90;
const sourceFps = 30;
const sourceTotalFrames = 300;
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-ffmpeg-frame-extractor-v1-"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function runCli(binary, args, {timeout = 120_000, maxBuffer = 2 * 1024 * 1024} = {}) {
  return execFileSync(binary, args, {encoding: "utf8", timeout, maxBuffer, stdio: ["ignore", "pipe", "pipe"]});
}

function hashFile(filename) {
  return sha256(fs.readFileSync(filename));
}

async function acceptArtifact({root, nodeId, role, kind, jsonContract, filename, expectedMedia, reviewerId}) {
  const bytes = fs.readFileSync(filename);
  const relativePath = path.relative(root, filename).split(path.sep).join("/");
  const artifactManifest = {
    contract: NODE_ARTIFACT_MANIFEST_CONTRACT,
    nodeId,
    inputSha256: sha256(Buffer.from(`${nodeId}/input`, "utf8")),
    productionAdmission: false,
    artifacts: [{
      path: relativePath,
      role,
      kind,
      ...(jsonContract ? {jsonContract} : {}),
      ...(expectedMedia ? {expectedMedia} : {}),
      sha256: sha256(bytes),
      bytes: bytes.length,
    }],
  };
  const dependencyNode = {id: nodeId, inputSha256: artifactManifest.inputSha256};
  const workflow = await acceptNodeArtifacts({
    scope: "REVIEW_ONLY",
    productionAdmission: false,
    nodes: [{
      ...dependencyNode,
      state: "needs-review",
      result: {state: "needs-review", productionAdmission: false, artifactManifest},
    }],
  }, nodeId, {artifactRoot: root, reviewerId, ffprobePath});
  const accepted = workflow.nodes[0];
  assert.equal(accepted.state, "succeeded");
  assert.equal(accepted.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(accepted.acceptance.productionAdmission, false);
  return {
    dependencyId: nodeId,
    dependency: {
      state: "succeeded",
      manifestSha256: accepted.acceptance.manifestSha256,
      artifacts: accepted.acceptance.artifacts.map((artifact) => ({
        ...artifact,
        absolutePath: path.join(accepted.acceptance.artifactRoot, artifact.path),
      })),
    },
    binding: {
      dependencyId: nodeId,
      acceptedManifestSha256: accepted.acceptance.manifestSha256,
      artifact: {path: relativePath, sha256: sha256(bytes), bytes: bytes.length},
    },
    artifactRoot: root,
    artifactPath: relativePath,
    filename,
    artifactManifest,
    acceptedNode: accepted,
  };
}

function sourcePlanOutput({videoSha256, frameIndices, fps = sourceFps, totalFrames = sourceTotalFrames,
  nodeId = "fixture:frame-review-plan", inputSha256 = "2".repeat(64)} = {}) {
  const sequences = [{
    sequenceId: "synthetic-sequence",
    startFrame: 0,
    endFrameExclusive: totalFrames,
    mode: "explicit-reference",
    anchors: frameIndices.map((sourceFrame, index) => ({role: `FRAME_${String(index).padStart(2, "0")}`, sourceFrame})),
  }];
  const plan = compileReferenceFrameReviewPlanV1({sourceVideoSha256: videoSha256, fps, totalFrames, sequences});
  return {
    contract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    nodeId,
    inputSha256,
    sourceManifestBinding: {
      dependencyId: "fixture:source-manifest",
      acceptedManifestSha256: "c".repeat(64),
      artifact: {path: "source/manifest.json", sha256: "d".repeat(64), bytes: 123},
    },
    source: {sourceVideoSha256: videoSha256, fps, totalFrames},
    plan,
    proofBoundary: {
      acceptedSourceManifestBytesReverified: true,
      sourceVideoRead: false,
      sourceVideoDecoded: false,
      frameExtractionPerformed: false,
      extractedImages: 0,
      visualApproval: false,
      productionAdmission: false,
    },
  };
}

function makeNode(videoFixture, planFixture, {id = "scene:ffmpeg-frame-extractor", adapterFor = adapter,
  sourceIndexFixture = null} = {}) {
  const sourceVideoBinding = structuredClone(videoFixture.binding);
  const framePlanBinding = structuredClone(planFixture.binding);
  const input = {
    projectId: "synthetic-frame-extractor-test",
    context: {},
    shot: {id: "scene", source: "Synthetic generated CFR input."},
    module: A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1,
    moduleVersion: adapterFor.version,
    implementationSha256: adapterFor.implementationSha256,
    need: true,
    parameters: {sourceVideoBinding, framePlanBinding,
      ...(sourceIndexFixture ? {sourceIndexBinding: structuredClone(sourceIndexFixture.binding)} : {})},
  };
  const dependencies = [videoFixture.dependencyId, planFixture.dependencyId,
    ...(sourceIndexFixture ? [sourceIndexFixture.dependencyId] : [])];
  const dependencyFingerprints = dependencies.map((dependencyId, index) => ({
      id: dependencyId,
      inputSha256: (index === 0 ? "a" : "b").repeat(64),
      acceptedManifestSha256: index === 0 ? sourceVideoBinding.acceptedManifestSha256
        : index === 1 ? framePlanBinding.acceptedManifestSha256 : sourceIndexFixture.binding.acceptedManifestSha256,
  }));
  return {
    id,
    shotId: "scene",
    module: A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1,
    input,
    inputSha256: nodeInputHash({input, dependencies: {
      inputs: dependencyFingerprints,
      artifactKinds: {"source-video": ["VIDEO"], "frame-review-plan": ["JSON_PLAN"],
        ...(sourceIndexFixture ? {"source-keyframe-index": ["JSON_PLAN"]} : {})},
    }}),
    dependencies,
    dependencyArtifactKinds: {
      [videoFixture.dependencyId]: ["VIDEO"],
      [planFixture.dependencyId]: ["JSON_PLAN"],
      ...(sourceIndexFixture ? {[sourceIndexFixture.dependencyId]: ["JSON_PLAN"]} : {}),
    },
    state: "running",
    lease: {workerId: "synthetic-test", token: "test-lease", expiresAt: Date.now() + 60_000},
  };
}

function dependenciesFor(videoFixture, planFixture, sourceIndexFixture = null) {
  return {
    [videoFixture.dependencyId]: structuredClone(videoFixture.dependency),
    [planFixture.dependencyId]: structuredClone(planFixture.dependency),
    ...(sourceIndexFixture ? {[sourceIndexFixture.dependencyId]: structuredClone(sourceIndexFixture.dependency)} : {}),
  };
}

async function execute(node, videoFixture, planFixture, artifactRoot, heartbeat) {
  return adapter.execute(node, {dependencies: dependenciesFor(videoFixture, planFixture), artifactRoot, heartbeat});
}

async function executeWith(adapterFor, node, videoFixture, planFixture, artifactRoot, heartbeat, sourceIndexFixture = null) {
  return adapterFor.execute(node, {dependencies: dependenciesFor(videoFixture, planFixture, sourceIndexFixture), artifactRoot, heartbeat});
}

async function createAcceptedSourceIndex(videoFixture, indexerAdapter, artifactRoot) {
  const input = {
    projectId: "synthetic-frame-extractor-test",
    context: {},
    shot: {id: "source", source: "Synthetic generated CFR input."},
    module: "ffmpeg-source-indexer",
    moduleVersion: indexerAdapter.version,
    implementationSha256: indexerAdapter.implementationSha256,
    need: true,
    parameters: {sourceVideoBinding: structuredClone(videoFixture.binding)},
  };
  const node = {
    id: `fixture:source-index:${videoFixture.binding.artifact.sha256.slice(0, 12)}`,
    shotId: "source",
    module: "ffmpeg-source-indexer",
    input,
    inputSha256: nodeInputHash({input, dependencies: {inputs: [{id: videoFixture.dependencyId,
      inputSha256: sha256(Buffer.from(`${videoFixture.dependencyId}/input`, "utf8")),
      acceptedManifestSha256: videoFixture.binding.acceptedManifestSha256}], artifactKinds: {"source-video": ["VIDEO"]}}}),
    dependencies: [videoFixture.dependencyId],
    dependencyArtifactKinds: {[videoFixture.dependencyId]: ["VIDEO"]},
  };
  const result = await indexerAdapter.execute(node, {dependencies: {[videoFixture.dependencyId]: structuredClone(videoFixture.dependency)}, artifactRoot});
  assert.equal(result.state, "needs-review", `source indexer returned ${result.reason}`);
  assert.equal(result.summary.ffprobeProcessCounts.packetIndexScanProcessCount, 1);
  const accepted = await acceptNodeArtifacts({scope: "REVIEW_ONLY", productionAdmission: false,
    nodes: [{...node, state: "needs-review", result, acceptance: null}]}, node.id,
  {artifactRoot, reviewerId: "synthetic-source-index-acceptance", ffprobePath});
  const acceptedNode = accepted.nodes[0];
  assert.equal(acceptedNode.state, "succeeded");
  const artifact = acceptedNode.acceptance.artifacts[0];
  return {
    dependencyId: acceptedNode.id,
    binding: {dependencyId: acceptedNode.id, acceptedManifestSha256: acceptedNode.acceptance.manifestSha256,
      artifact: {path: artifact.path, sha256: artifact.sha256, bytes: artifact.bytes}},
    dependency: {state: "succeeded", manifestSha256: acceptedNode.acceptance.manifestSha256,
      artifacts: acceptedNode.acceptance.artifacts.map((entry) => ({...entry,
        absolutePath: path.join(acceptedNode.acceptance.artifactRoot, entry.path)}))},
    acceptedNode,
    result,
  };
}

function selectExpression(frame) {
  return `select='eq(n,${frame})'`;
}

let adapter, windowedAdapter, indexedWindowedAdapter, sourceIndexerAdapter;

try {
  assert.equal(assertWindowedSourcePtsEligibilityV1(0n), 0n);
  assert.throws(() => assertWindowedSourcePtsEligibilityV1(-1n),
    /FRAME_EXTRACTOR_WINDOWED_NEGATIVE_SOURCE_PTS/u);
  // Available synthetic muxers normalize negative timestamps (Matroska/AVI), reject them (NUT), or mark MP4 pre-roll packets discard and report a shortened duration that is rejected before index finalization. Exercise the exact finalizer guard directly.
  assert.ok(fs.existsSync(ffmpegPath), `trusted FFmpeg test binary unavailable: ${ffmpegPath}`);
  assert.ok(fs.existsSync(ffprobePath), `artifact verifier FFprobe unavailable: ${ffprobePath}`);
  adapter = createNodeFfmpegFrameExtractorAdapterV1({ffmpegPath});
  assert.equal(adapter.version, 1);
  assert.equal(adapter.enabled, true);
  assert.equal(adapter.execute.name, "execute");
  assert.match(adapter.implementationSha256, /^[a-f0-9]{64}$/u);
  assert.match(adapter.tool.binarySha256, /^[a-f0-9]{64}$/u);
  assert.match(adapter.tool.version, /7\.1/u);
  assert.throws(() => createNodeFfmpegFrameExtractorAdapterV1({ffmpegPath: "ffmpeg"}), /ABSOLUTE_PATH_REQUIRED/u);
  assert.equal(adapter.extractionStrategy, "full-source");
  assert.equal(adapter.keyframeIndexTool, undefined);
  const oldFfmpegPath = path.join(repoRoot, ".tools/bin/ffmpeg");
  if (fs.existsSync(oldFfmpegPath)) assert.throws(() => createNodeFfmpegFrameExtractorAdapterV1({ffmpegPath: oldFfmpegPath}), /BINARY_FILE_INVALID|VERSION_TOO_OLD/u);
  windowedAdapter = createNodeFfmpegFrameExtractorAdapterV1({ffmpegPath, extractionStrategy: "windowed-review-only",
    ffprobePath: windowedFfprobePath});
  sourceIndexerAdapter = createNodeFfmpegSourceIndexerAdapterV1({ffprobePath: windowedFfprobePath});
  assert.equal(windowedAdapter.extractionStrategy, "windowed-review-only");
  assert.equal(windowedAdapter.keyframeIndexTool.path, path.resolve(windowedFfprobePath));
  assert.match(windowedAdapter.keyframeIndexTool.binarySha256, /^[a-f0-9]{64}$/u);
  assert.notEqual(windowedAdapter.implementationSha256, adapter.implementationSha256,
    "windowed strategy must have a distinct implementation/cache identity");
  indexedWindowedAdapter = createNodeFfmpegFrameExtractorAdapterV1({ffmpegPath,
    extractionStrategy: "windowed-review-only"});
  assert.equal(indexedWindowedAdapter.keyframeIndexTool, undefined,
    "a windowed adapter with an accepted source index needs no FFprobe runtime path");
  assert.equal(indexedWindowedAdapter.processCounts.packetIndexScanPerExecuteWithIndex, 0);

  const defaultRegistry = createNodeAdapterRegistry();
  assert.equal(defaultRegistry.registry[A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1], undefined,
    "FFmpeg frame extraction must remain absent from the default production registry");
  const injectedRegistry = createNodeAdapterRegistry({[A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1]: adapter});
  assert.equal(injectedRegistry.registry[A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1].available, true);

  const sourceVideoRoot = path.join(tempRoot, "source-video-artifacts");
  const sourceVideoPath = path.join(sourceVideoRoot, "media", "synthetic-10s-cfr.mkv");
  fs.mkdirSync(path.dirname(sourceVideoPath), {recursive: true});
  runCli(ffmpegPath, [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `testsrc2=size=${sourceWidth}x${sourceHeight}:rate=${sourceFps}:duration=10`,
    "-frames:v", String(sourceTotalFrames),
    "-c:v", "ffv1", "-level", "3", "-pix_fmt", "yuv420p", "-fps_mode", "cfr",
    "-y", sourceVideoPath,
  ], {timeout: 120_000});
  const sourceVideoSha256 = hashFile(sourceVideoPath);
  const videoFixture = await acceptArtifact({
    root: sourceVideoRoot,
    nodeId: "fixture:source-video",
    role: "source-video",
    kind: "VIDEO",
    filename: sourceVideoPath,
    expectedMedia: {width: sourceWidth, height: sourceHeight, fps: sourceFps},
    reviewerId: "synthetic-video-acceptance",
  });
  const sourceVideoVerified = await verifyNodeArtifactManifest(videoFixture.artifactManifest, {
    artifactRoot: sourceVideoRoot,
    node: {id: videoFixture.dependencyId, inputSha256: videoFixture.artifactManifest.inputSha256},
    ffprobePath,
  });
  assert.equal(sourceVideoVerified.artifacts[0].kind, "VIDEO");
  assert.equal(sourceVideoVerified.artifacts[0].metadata.width, sourceWidth);
  assert.equal(sourceVideoVerified.artifacts[0].metadata.height, sourceHeight);

  const planRoot = path.join(tempRoot, "frame-plan-artifacts");
  const planPath = path.join(planRoot, "plans", "review-plan.json");
  fs.mkdirSync(path.dirname(planPath), {recursive: true});
  const planOutput = sourcePlanOutput({videoSha256: sourceVideoSha256, frameIndices: selectedFrames});
  fs.writeFileSync(planPath, `${JSON.stringify(planOutput, null, 2)}\n`);
  const planFixture = await acceptArtifact({
    root: planRoot,
    nodeId: "fixture:frame-review-plan",
    role: "frame-review-plan",
    kind: "JSON_PLAN",
    jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    filename: planPath,
    reviewerId: "synthetic-plan-acceptance",
  });
  const artifactRoot = path.join(tempRoot, "extractor-artifacts");
  const node = makeNode(videoFixture, planFixture);
  let heartbeatCount = 0;
  const first = await execute(node, videoFixture, planFixture, artifactRoot, () => { heartbeatCount += 1; });
  assert.equal(first.state, "needs-review", `adapter returned ${first.reason}`);
  assert.equal(first.reason, "REFERENCE_FRAME_IMAGES_REQUIRE_INDEPENDENT_REVIEW");
  assert.equal(first.visualApproval, "NOT_GRANTED");
  assert.equal(first.productionAdmission, false);
  assert.equal(first.artifactKind, "REFERENCE_FRAME_EXTRACTION_REVIEW_ONLY");
  assert.ok(heartbeatCount >= 2);
  assert.equal(first.artifactManifest.contract, NODE_ARTIFACT_MANIFEST_CONTRACT);
  assert.equal(first.artifactManifest.productionAdmission, false);
  assert.equal(first.artifactManifest.artifacts.length, selectedFrames.length + 1);
  assert.equal(first.artifactManifest.artifacts.filter((artifact) => artifact.kind === "IMAGE").length, selectedFrames.length);
  assert.equal(first.artifactManifest.artifacts.filter((artifact) => artifact.kind === "JSON_PLAN").length, 1);

  const entries = Object.fromEntries(first.artifactManifest.artifacts.map((artifact) => [artifact.role, artifact]));
  const receiptArtifact = entries["frame-extraction-receipt"];
  const receiptPath = path.join(artifactRoot, receiptArtifact.path);
  const receiptBytes = fs.readFileSync(receiptPath);
  assert.equal(receiptBytes.length, receiptArtifact.bytes);
  assert.equal(hashFile(receiptPath), receiptArtifact.sha256);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  assert.equal(receipt.contract, A1_NODE_FFMPEG_FRAME_EXTRACTOR_V1);
  assert.equal(receipt.nodeId, node.id);
  assert.equal(receipt.inputSha256, node.inputSha256);
  assert.equal(receipt.tool.path, adapter.tool.path);
  assert.equal(receipt.tool.version, adapter.tool.version);
  assert.equal(receipt.tool.binarySha256, adapter.tool.binarySha256);
  assert.equal(receipt.profile.id, FFMPEG_FRAME_EXTRACTOR_PROFILE_V1);
  assert.equal(receipt.profile.fpsMode, "passthrough");
  assert.equal(receipt.profile.seekUsed, false);
  assert.equal(receipt.profile.passes, 1);
  assert.equal(receipt.proofBoundary.visualApproval, "NOT_GRANTED");
  assert.equal(receipt.proofBoundary.productionAdmission, false);
  assert.deepEqual(receipt.frames.map((frame) => frame.sourceFrame), selectedFrames);
  assert.deepEqual(receipt.frames.map((frame) => frame.ordinal), selectedFrames.map((_, ordinal) => ordinal));
  assert.deepEqual(receipt.frames.map((frame) => frame.references[0].role), selectedFrames.map((_, index) => `FRAME_${String(index).padStart(2, "0")}`));

  for (let ordinal = 0; ordinal < selectedFrames.length; ordinal += 1) {
    const sourceFrame = selectedFrames[ordinal];
    const artifact = entries[`source-frame-${String(ordinal).padStart(4, "0")}`];
    const outputPng = path.join(artifactRoot, artifact.path);
    assert.equal(artifact.kind, "IMAGE");
    assert.ok(!path.isAbsolute(artifact.path));
    assert.ok(!artifact.path.split("/").includes(".."));
    assert.equal(hashFile(outputPng), artifact.sha256);
    assert.equal(fs.statSync(outputPng).size, artifact.bytes);

    const expectedPng = path.join(tempRoot, `expected-frame-${String(ordinal).padStart(4, "0")}.png`);
    runCli(ffmpegPath, [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-i", sourceVideoPath,
      "-map", "0:v:0", "-an", "-sn", "-dn",
      "-vf", selectExpression(sourceFrame),
      "-fps_mode", "passthrough", "-frames:v", "1", "-start_number", "0",
      "-c:v", "png", "-compression_level", "6", "-pred", "mixed", "-threads", "1",
      "-f", "image2", "-y", expectedPng,
    ]);
    assert.equal(hashFile(outputPng), hashFile(expectedPng), `output ordinal ${ordinal} must equal source frame n=${sourceFrame}`);
    runCli(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", outputPng, "-frames:v", "1", "-f", "null", "-"]);
  }

  const verifiedOutput = await verifyNodeArtifactManifest(first.artifactManifest, {artifactRoot, node, ffprobePath});
  assert.equal(verifiedOutput.artifacts.length, selectedFrames.length + 1);
  assert.equal(verifiedOutput.artifacts.filter((item) => item.kind === "IMAGE").length, selectedFrames.length);
  assert.ok(verifiedOutput.artifacts.filter((item) => item.kind === "IMAGE").every((item) => item.metadata.codec === "png"));

  const firstStats = receipt.frames.map((frame) => fs.statSync(path.join(artifactRoot, frame.path)));
  const cached = await execute(node, videoFixture, planFixture, artifactRoot);
  assert.equal(cached.state, "needs-review", `cache returned ${cached.reason}`);
  assert.equal(cached.summary.cached, true);
  assert.deepEqual(cached.artifactManifest.artifacts.map((item) => item.sha256), first.artifactManifest.artifacts.map((item) => item.sha256));
  receipt.frames.forEach((frame, index) => {
    const after = fs.statSync(path.join(artifactRoot, frame.path));
    assert.equal(after.ino, firstStats[index].ino, "cache reuse must preserve PNG inode");
    assert.equal(after.mtimeMs, firstStats[index].mtimeMs, "cache reuse must not rewrite PNG files");
  });

  const windowedProfileResults = [];
  for (const {fps, gopFrames} of [
    {fps: 25, gopFrames: 50},
    {fps: 30, gopFrames: 60},
    {fps: 60, gopFrames: 120},
  ]) {
    const totalFrames = fps * 8;
    const targetFrames = [...new Set([0, gopFrames - 1, gopFrames, gopFrames + 1, totalFrames - 2, totalFrames - 1])];
    const profileSourceRoot = path.join(tempRoot, `long-gop-source-${fps}`);
    const profileSourcePath = path.join(profileSourceRoot, "media", `synthetic-${fps}fps-long-gop.mp4`);
    fs.mkdirSync(path.dirname(profileSourcePath), {recursive: true});
    runCli(ffmpegPath, [
      "-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `testsrc2=size=${sourceWidth}x${sourceHeight}:rate=${fps}:duration=8`,
      "-frames:v", String(totalFrames),
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p",
      "-g", String(gopFrames), "-keyint_min", String(gopFrames), "-sc_threshold", "0", "-bf", "0",
      "-x264-params", "open-gop=0:scenecut=0", "-fps_mode", "cfr", "-threads", "1", "-y", profileSourcePath,
    ]);
    const profileVideoSha256 = hashFile(profileSourcePath);
    const profileVideoFixture = await acceptArtifact({
      root: profileSourceRoot,
      nodeId: `fixture:source-video-${fps}fps`,
      role: "source-video",
      kind: "VIDEO",
      filename: profileSourcePath,
      expectedMedia: {width: sourceWidth, height: sourceHeight, fps},
      reviewerId: `synthetic-${fps}fps-video-acceptance`,
    });
    const profilePlanRoot = path.join(tempRoot, `long-gop-plan-${fps}`);
    const profilePlanPath = path.join(profilePlanRoot, "plans", "review-plan.json");
    fs.mkdirSync(path.dirname(profilePlanPath), {recursive: true});
    const profilePlanOutput = sourcePlanOutput({videoSha256: profileVideoSha256,
      frameIndices: targetFrames, fps, totalFrames});
    fs.writeFileSync(profilePlanPath, `${JSON.stringify(profilePlanOutput, null, 2)}\n`);
    const profilePlanFixture = await acceptArtifact({
      root: profilePlanRoot,
      nodeId: `fixture:frame-review-plan-${fps}fps`,
      role: "frame-review-plan",
      kind: "JSON_PLAN",
      jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
      filename: profilePlanPath,
      reviewerId: `synthetic-${fps}fps-plan-acceptance`,
    });
    const profileSourceIndexFixture = await createAcceptedSourceIndex(profileVideoFixture, sourceIndexerAdapter,
      path.join(tempRoot, `long-gop-index-${fps}`));
    const fullSourceNode = makeNode(profileVideoFixture, profilePlanFixture, {
      id: `scene:full-source-${fps}fps`, adapterFor: adapter,
    });
    const windowedNode = makeNode(profileVideoFixture, profilePlanFixture, {
      id: `scene:windowed-${fps}fps`, adapterFor: indexedWindowedAdapter, sourceIndexFixture: profileSourceIndexFixture,
    });
    assert.notEqual(fullSourceNode.inputSha256, windowedNode.inputSha256,
      "strategy-specific implementation SHA must produce distinct node/cache identity");
    const profileArtifactRoot = path.join(tempRoot, `long-gop-output-${fps}`);
    const fullSourceResult = await executeWith(adapter, fullSourceNode, profileVideoFixture, profilePlanFixture,
      path.join(profileArtifactRoot, "full-source"));
    const windowedResult = await executeWith(indexedWindowedAdapter, windowedNode, profileVideoFixture, profilePlanFixture,
      path.join(profileArtifactRoot, "windowed"), undefined, profileSourceIndexFixture);
    assert.equal(fullSourceResult.state, "needs-review", `full-source ${fps}fps profile: ${fullSourceResult.reason}`);
    assert.equal(windowedResult.state, "needs-review", `windowed ${fps}fps profile: ${windowedResult.reason}`);
    const artifactFor = (result, root, role) => {
      const artifact = result.artifactManifest.artifacts.find((item) => item.role === role);
      assert.ok(artifact, `missing ${role} in ${fps}fps profile`);
      return path.join(root, artifact.path);
    };
    const fullReceipt = JSON.parse(fs.readFileSync(artifactFor(fullSourceResult,
      path.join(profileArtifactRoot, "full-source"), "frame-extraction-receipt"), "utf8"));
    const windowedReceiptPath = artifactFor(windowedResult, path.join(profileArtifactRoot, "windowed"),
      "frame-extraction-receipt");
    const windowedReceipt = JSON.parse(fs.readFileSync(windowedReceiptPath, "utf8"));
    assert.equal(fullReceipt.profile.id, FFMPEG_FRAME_EXTRACTOR_PROFILE_V1);
    assert.equal(fullReceipt.profile.seekUsed, false);
    assert.equal(fullReceipt.strategyDecision.executed, "full-source");
    assert.equal(fullReceipt.decodeWorkMeasurement, null);
    assert.equal(windowedReceipt.profile.id, FFMPEG_FRAME_EXTRACTOR_WINDOWED_PROFILE_V1);
    assert.equal(windowedReceipt.sourceKeyframeIndexSha256, profileSourceIndexFixture.result.summary.indexSha256);
    assert.equal(windowedReceipt.sourceIndexBinding.acceptedManifestSha256,
      profileSourceIndexFixture.binding.acceptedManifestSha256);
    assert.deepEqual(windowedReceipt.ffprobeProcessCounts, {adapterConstructionVersionProbeProcessCount: 0,
      adapterPacketIndexScanProcessCount: 0, schedulerSourceVideoMetadataProbe: "OUTSIDE_ADAPTER_NOT_COUNTED"});
    assert.deepEqual(windowedResult.summary.ffprobeProcessCounts, {adapterConstructionVersionProbeProcessCount: 0,
      adapterPacketIndexScanProcessCount: 0, schedulerSourceVideoMetadataProbe: "OUTSIDE_ADAPTER_NOT_COUNTED"},
      "accepted source index must keep FFprobe packet scans out of extractor children");
    assert.deepEqual(windowedReceipt.sourceByteAudit, {
      adapterFullFileSha256Passes: 2,
      adapterBytesHashed: profileVideoFixture.binding.artifact.bytes * 2,
      sourceIntegrityMode: "ADAPTER_FULL_SHA",
      schedulerSourceVideoRevalidation: "OUTSIDE_ADAPTER_NOT_COUNTED",
    });
    assert.deepEqual(windowedResult.summary.sourceByteAudit, windowedReceipt.sourceByteAudit);
    assert.equal(windowedReceipt.decodeWorkMeasurement.contract, FFMPEG_FRAME_EXTRACTOR_DECODE_METRIC_V1);
    assert.equal(windowedReceipt.decodeWorkMeasurement.observedFrameRecords,
      windowedReceipt.decodeWorkMeasurement.windows.reduce((sum, item) => sum + item.observedFrameRecords, 0));
    assert.ok(windowedReceipt.decodeWorkMeasurement.observedFrameRecords < totalFrames,
      `windowed ${fps}fps decode-frame records must be below the ${totalFrames}-frame full-source baseline`);
    assert.equal(windowedReceipt.proofBoundary.visualApproval, "NOT_GRANTED");
    assert.equal(windowedReceipt.proofBoundary.productionAdmission, false);
    assert.equal(windowedResult.productionAdmission, false);
    assert.deepEqual(windowedReceipt.frames.map((frame) => frame.sourceFrame), targetFrames);
    if (fps === 25) {
      const staleIndexFixture = structuredClone(profileSourceIndexFixture);
      staleIndexFixture.binding.acceptedManifestSha256 = "0".repeat(64);
      const staleIndexNode = makeNode(profileVideoFixture, profilePlanFixture, {
        id: "scene:windowed-stale-source-index", adapterFor: indexedWindowedAdapter, sourceIndexFixture: staleIndexFixture,
      });
      assert.notEqual(staleIndexNode.inputSha256, windowedNode.inputSha256,
        "index receipt changes must invalidate extractor input/cache identity");
      const staleIndexResult = await executeWith(indexedWindowedAdapter, staleIndexNode, profileVideoFixture,
        profilePlanFixture, path.join(profileArtifactRoot, "stale-index"), undefined, staleIndexFixture);
      assert.equal(staleIndexResult.state, "blocked");
      assert.equal(staleIndexResult.reason, "FRAME_EXTRACTOR_ACCEPTANCE_RECEIPT_MISMATCH",
        "a supplied stale index binding must block instead of spawning FFprobe or falling back");

      const indexArtifact = profileSourceIndexFixture.acceptedNode.acceptance.artifacts.find((item) =>
        item.role === "source-keyframe-index");
      const acceptedIndexPath = path.join(profileSourceIndexFixture.acceptedNode.acceptance.artifactRoot,
        indexArtifact.path);
      const originalIndexBytes = fs.readFileSync(acceptedIndexPath);
      const tamperedIndexDocument = JSON.parse(fs.readFileSync(acceptedIndexPath, "utf8"));
      const originalIndexSha = tamperedIndexDocument.indexSha256;
      tamperedIndexDocument.indexSha256 = (originalIndexSha[0] === "0" ? "1" : "0") + originalIndexSha.slice(1);
      const tamperedIndexBytes = Buffer.from(JSON.stringify(tamperedIndexDocument, null, 2) + "\n");
      assert.equal(tamperedIndexBytes.length, indexArtifact.bytes,
        "mutated index test keeps the accepted artifact byte length");
      fs.writeFileSync(acceptedIndexPath, tamperedIndexBytes);
      let mutatedIndexResult;
      try {
        const mutatedIndexNode = makeNode(profileVideoFixture, profilePlanFixture, {
          id: "scene:windowed-tampered-source-index-bytes",
          adapterFor: indexedWindowedAdapter,
          sourceIndexFixture: profileSourceIndexFixture,
        });
        mutatedIndexResult = await executeWith(indexedWindowedAdapter, mutatedIndexNode,
          profileVideoFixture, profilePlanFixture, path.join(profileArtifactRoot, "tampered-index-bytes"),
          undefined, profileSourceIndexFixture);
      } finally {
        fs.writeFileSync(acceptedIndexPath, originalIndexBytes);
      }
      assert.equal(mutatedIndexResult.state, "blocked");
      assert.equal(mutatedIndexResult.reason, "FRAME_EXTRACTOR_PLAN_SHA_MISMATCH",
        "mutated accepted index bytes must fail closed before windowed decoding");
    }

    for (let ordinal = 0; ordinal < targetFrames.length; ordinal += 1) {
      const fullFrame = fullSourceResult.artifactManifest.artifacts.find((item) => item.role ===
        `source-frame-${String(ordinal).padStart(4, "0")}`);
      const windowedFrame = windowedResult.artifactManifest.artifacts.find((item) => item.role ===
        `source-frame-${String(ordinal).padStart(4, "0")}`);
      assert.ok(fullFrame && windowedFrame, `profile ${fps}fps frame ${ordinal} artifact missing`);
      assert.equal(hashFile(path.join(profileArtifactRoot, "windowed", windowedFrame.path)),
        hashFile(path.join(profileArtifactRoot, "full-source", fullFrame.path)),
        `windowed ${fps}fps source frame ${targetFrames[ordinal]} must match full-source pixels exactly`);
    }

    const windowedFrameStats = windowedReceipt.frames.map((frame) => fs.statSync(path.join(profileArtifactRoot, "windowed", frame.path)));
    const cachedWindowed = await executeWith(indexedWindowedAdapter, windowedNode, profileVideoFixture, profilePlanFixture,
      path.join(profileArtifactRoot, "windowed"), undefined, profileSourceIndexFixture);
    assert.equal(cachedWindowed.summary.cached, true);
    assert.deepEqual(cachedWindowed.artifactManifest.artifacts.map((item) => item.sha256),
      windowedResult.artifactManifest.artifacts.map((item) => item.sha256));
    windowedReceipt.frames.forEach((frame, index) => {
      const after = fs.statSync(path.join(profileArtifactRoot, "windowed", frame.path));
      assert.equal(after.ino, windowedFrameStats[index].ino, "windowed cache reuse must preserve PNG inode");
      assert.equal(after.mtimeMs, windowedFrameStats[index].mtimeMs, "windowed cache reuse must not rewrite PNG files");
    });
    windowedProfileResults.push({fps, totalFrames, decodedFrameRecords: windowedReceipt.decodeWorkMeasurement.observedFrameRecords,
      sourceIndexPacketScans: profileSourceIndexFixture.result.summary.ffprobeProcessCounts.packetIndexScanProcessCount,
      childPacketIndexScans: windowedReceipt.ffprobeProcessCounts.adapterPacketIndexScanProcessCount,
      childSourceHashPasses: windowedReceipt.sourceByteAudit.adapterFullFileSha256Passes,
      childSourceBytesHashed: windowedReceipt.sourceByteAudit.adapterBytesHashed});
    if (fps === 25) {
      const schedulerNode = makeNode(profileVideoFixture, profilePlanFixture, {
        id: "scene:scheduler-attested-windowed-25fps", adapterFor: indexedWindowedAdapter,
        sourceIndexFixture: profileSourceIndexFixture,
      });
      const schedulerRegistry = createNodeAdapterRegistry({
        [A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1]: indexedWindowedAdapter,
      });
      const schedulerWorkflow = {
        scope: "REVIEW_ONLY",
        productionAdmission: false,
        modules: schedulerRegistry.definitions,
        nodes: [profileVideoFixture.acceptedNode, profilePlanFixture.acceptedNode,
          profileSourceIndexFixture.acceptedNode, schedulerNode],
      };
      const verificationContext = createNodeArtifactVerificationContextV1({ffprobePath: windowedFfprobePath});
      assert.equal(verificationContext.enabled, true);
      const schedulerResult = await executeRegisteredNode(schedulerWorkflow, schedulerNode, {
        registry: schedulerRegistry.registry,
        artifactRoot: path.join(profileArtifactRoot, "scheduler-attested"),
        ffprobePath: windowedFfprobePath,
        verificationContext,
      });
      assert.equal(schedulerResult.state, "needs-review", `scheduler-attested extractor: ${schedulerResult.reason}`);
      assert.deepEqual(schedulerResult.summary.ffprobeProcessCounts, {
        adapterConstructionVersionProbeProcessCount: 0,
        adapterPacketIndexScanProcessCount: 0,
        schedulerSourceVideoMetadataProbe: "OUTSIDE_ADAPTER_NOT_COUNTED",
      });
      assert.deepEqual(schedulerResult.summary.sourceByteAudit, {
        adapterFullFileSha256Passes: 0,
        adapterBytesHashed: 0,
        sourceIntegrityMode: "RUN_SCOPED_ATTESTATION_STAT_RECHECK",
        schedulerSourceVideoRevalidation: "OUTSIDE_ADAPTER_NOT_COUNTED",
      });
      const contextSummary = getNodeArtifactVerificationContextSummaryV1(verificationContext);
      assert.equal(contextSummary.counters.sourceVideoShaPassCount, 1);
      assert.equal(contextSummary.counters.sourceVideoBytesHashed, profileVideoFixture.binding.artifact.bytes);
      assert.equal(contextSummary.counters.genericMediaMetadataProbeCount, 1);
      closeNodeArtifactVerificationContextV1(verificationContext);
      windowedProfileResults.at(-1).schedulerFullSourceHashPasses = contextSummary.counters.sourceVideoShaPassCount;
      windowedProfileResults.at(-1).extractorFullSourceHashPasses = schedulerResult.summary.sourceByteAudit.adapterFullFileSha256Passes;
    }
  }

  const fallbackSourceRoot = path.join(tempRoot, "noncfr-fallback-source");
  const fallbackSourcePath = path.join(fallbackSourceRoot, "media", "synthetic-near-cfr-pts-gap.mp4");
  fs.mkdirSync(path.dirname(fallbackSourcePath), {recursive: true});
  runCli(ffmpegPath, [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=4",
    "-frames:v", "120", "-vf", "setpts=PTS+eq(N\\,55)",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "0", "-pix_fmt", "yuv420p",
    "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-bf", "0",
    "-x264-params", "open-gop=0:scenecut=0", "-fps_mode", "passthrough", "-threads", "1", "-y", fallbackSourcePath,
  ]);
  const fallbackVideoSha256 = hashFile(fallbackSourcePath);
  const fallbackFps = 3600 / 119;
  const fallbackVideoFixture = await acceptArtifact({
    root: fallbackSourceRoot,
    nodeId: "fixture:source-video-near-cfr-pts-gap",
    role: "source-video",
    kind: "VIDEO",
    filename: fallbackSourcePath,
    expectedMedia: {width: sourceWidth, height: sourceHeight, fps: fallbackFps},
    reviewerId: "synthetic-near-cfr-video-acceptance",
  });
  const fallbackPlanRoot = path.join(tempRoot, "noncfr-fallback-plan");
  const fallbackPlanPath = path.join(fallbackPlanRoot, "plans", "review-plan.json");
  fs.mkdirSync(path.dirname(fallbackPlanPath), {recursive: true});
  const fallbackTargetFrames = [54, 55, 56, 119];
  const fallbackPlanOutput = sourcePlanOutput({videoSha256: fallbackVideoSha256,
    frameIndices: fallbackTargetFrames, fps: fallbackFps, totalFrames: 120});
  fs.writeFileSync(fallbackPlanPath, `${JSON.stringify(fallbackPlanOutput, null, 2)}\n`);
  const fallbackPlanFixture = await acceptArtifact({
    root: fallbackPlanRoot,
    nodeId: "fixture:frame-review-plan-near-cfr-pts-gap",
    role: "frame-review-plan",
    kind: "JSON_PLAN",
    jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    filename: fallbackPlanPath,
    reviewerId: "synthetic-near-cfr-plan-acceptance",
  });
  const fallbackFullNode = makeNode(fallbackVideoFixture, fallbackPlanFixture, {
    id: "scene:near-cfr-full-source", adapterFor: adapter,
  });
  const fallbackWindowedNode = makeNode(fallbackVideoFixture, fallbackPlanFixture, {
    id: "scene:near-cfr-windowed", adapterFor: windowedAdapter,
  });
  const fallbackArtifacts = path.join(tempRoot, "noncfr-fallback-output");
  const fallbackFullResult = await executeWith(adapter, fallbackFullNode, fallbackVideoFixture, fallbackPlanFixture,
    path.join(fallbackArtifacts, "full-source"));
  const fallbackWindowedResult = await executeWith(windowedAdapter, fallbackWindowedNode,
    fallbackVideoFixture, fallbackPlanFixture, path.join(fallbackArtifacts, "windowed"));
  assert.equal(fallbackFullResult.state, "needs-review", `fallback baseline: ${fallbackFullResult.reason}`);
  assert.equal(fallbackWindowedResult.state, "needs-review", `windowed fallback: ${fallbackWindowedResult.reason}`);
  const fallbackReceiptArtifact = fallbackWindowedResult.artifactManifest.artifacts.find((item) =>
    item.role === "frame-extraction-receipt");
  assert.ok(fallbackReceiptArtifact);
  const fallbackReceipt = JSON.parse(fs.readFileSync(path.join(fallbackArtifacts, "windowed", fallbackReceiptArtifact.path), "utf8"));
  assert.deepEqual(fallbackReceipt.strategyDecision, {
    requested: "windowed-review-only",
    executed: "full-source",
    fallbackReason: "FRAME_EXTRACTOR_WINDOWED_NONINTEGER_CFR_TIMEBASE",
  });
  assert.equal(fallbackReceipt.profile.id, FFMPEG_FRAME_EXTRACTOR_PROFILE_V1);
  assert.equal(fallbackReceipt.decodeWorkMeasurement, null,
    "a compatibility fallback must not carry a windowed decode-work claim");
  assert.deepEqual(fallbackReceipt.ffprobeProcessCounts, {adapterConstructionVersionProbeProcessCount: 1,
    adapterPacketIndexScanProcessCount: 1, schedulerSourceVideoMetadataProbe: "OUTSIDE_ADAPTER_NOT_COUNTED"});
  assert.deepEqual(fallbackReceipt.sourceByteAudit, {adapterFullFileSha256Passes: 3,
    adapterBytesHashed: fallbackVideoFixture.binding.artifact.bytes * 3,
    sourceIntegrityMode: "ADAPTER_FULL_SHA",
    schedulerSourceVideoRevalidation: "OUTSIDE_ADAPTER_NOT_COUNTED"});
  for (let ordinal = 0; ordinal < fallbackTargetFrames.length; ordinal += 1) {
    const fullFrame = fallbackFullResult.artifactManifest.artifacts.find((item) => item.role ===
      `source-frame-${String(ordinal).padStart(4, "0")}`);
    const fallbackFrame = fallbackWindowedResult.artifactManifest.artifacts.find((item) => item.role ===
      `source-frame-${String(ordinal).padStart(4, "0")}`);
    assert.ok(fullFrame && fallbackFrame);
    assert.equal(hashFile(path.join(fallbackArtifacts, "windowed", fallbackFrame.path)),
      hashFile(path.join(fallbackArtifacts, "full-source", fullFrame.path)),
      `fallback frame ${fallbackTargetFrames[ordinal]} must preserve full-source pixels`);
  }
  const invalidDependencyNode = structuredClone(fallbackWindowedNode);
  invalidDependencyNode.input.parameters.framePlanBinding.acceptedManifestSha256 = "0".repeat(64);
  const invalidDependencyResult = await executeWith(windowedAdapter, invalidDependencyNode,
    fallbackVideoFixture, fallbackPlanFixture, path.join(tempRoot, "invalid-windowed-dependency-output"));
  assert.equal(invalidDependencyResult.state, "blocked");
  assert.equal(invalidDependencyResult.reason, "FRAME_EXTRACTOR_ACCEPTANCE_RECEIPT_MISMATCH",
    "dependency failures must not use the compatibility fallback");

  const acceptanceWorkflow = {
    scope: "REVIEW_ONLY",
    productionAdmission: false,
    nodes: [{...node, state: "needs-review", result: first, acceptance: null}],
  };
  const technicallyAccepted = await acceptNodeArtifacts(acceptanceWorkflow, node.id, {
    artifactRoot,
    reviewerId: "synthetic-frame-extractor-acceptance",
    ffprobePath,
  });
  assert.equal(technicallyAccepted.nodes[0].state, "succeeded");
  assert.equal(technicallyAccepted.nodes[0].acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
  assert.equal(technicallyAccepted.nodes[0].acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(technicallyAccepted.nodes[0].acceptance.productionAdmission, false);

  const missingDependencies = await adapter.execute(node, {dependencies: {}, artifactRoot});
  assert.equal(missingDependencies.reason, "FRAME_EXTRACTOR_ACCEPTANCE_RECEIPT_MISMATCH");
  const receiptMismatchNode = structuredClone(node);
  receiptMismatchNode.input.parameters.framePlanBinding.acceptedManifestSha256 = "0".repeat(64);
  assert.equal((await adapter.execute(receiptMismatchNode, {dependencies: dependenciesFor(videoFixture, planFixture), artifactRoot})).reason,
    "FRAME_EXTRACTOR_ACCEPTANCE_RECEIPT_MISMATCH");
  const pathEscapeNode = structuredClone(node);
  pathEscapeNode.input.parameters.sourceVideoBinding.artifact.path = "../outside.mkv";
  assert.equal((await adapter.execute(pathEscapeNode, {dependencies: dependenciesFor(videoFixture, planFixture), artifactRoot})).reason,
    "FRAME_EXTRACTOR_VIDEO_BINDING_INVALID");
  const wrongKindDependencies = dependenciesFor(videoFixture, planFixture);
  wrongKindDependencies[videoFixture.dependencyId].artifacts[0].kind = "IMAGE";
  assert.equal((await adapter.execute(node, {dependencies: wrongKindDependencies, artifactRoot})).reason,
    "FRAME_EXTRACTOR_DEPENDENCY_ARTIFACT_BINDING_MISMATCH");

  const overCapFrameIndices = Array.from({length: 61}, (_, index) => index);
  const overCapPlanRoot = path.join(tempRoot, "over-cap-plan-artifacts");
  const overCapPath = path.join(overCapPlanRoot, "plans", "over-cap.json");
  fs.mkdirSync(path.dirname(overCapPath), {recursive: true});
  const overCapPlan = {
    contract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    nodeId: "fixture:over-cap-plan",
    inputSha256: "8".repeat(64),
    sourceManifestBinding: planOutput.sourceManifestBinding,
    source: planOutput.source,
    plan: compileReferenceFrameReviewPlanV1({
      sourceVideoSha256,
      fps: sourceFps,
      totalFrames: sourceTotalFrames,
      sequences: overCapFrameIndices.map((sourceFrame) => ({
        sequenceId: `sequence-${sourceFrame}`,
        startFrame: sourceFrame,
        endFrameExclusive: sourceFrame + 1,
        mode: "stable-hold",
      })),
    }),
    proofBoundary: planOutput.proofBoundary,
  };
  fs.writeFileSync(overCapPath, `${JSON.stringify(overCapPlan, null, 2)}\n`);
  const overCapFixture = await acceptArtifact({
    root: overCapPlanRoot,
    nodeId: "fixture:over-cap-plan",
    role: "frame-review-plan",
    kind: "JSON_PLAN",
    jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    filename: overCapPath,
    reviewerId: "synthetic-over-cap-plan-acceptance",
  });
  const overCapNode = makeNode(videoFixture, overCapFixture, {id: "scene:over-cap"});
  const overCap = await execute(overCapNode, videoFixture, overCapFixture, artifactRoot);
  assert.equal(overCap.state, "blocked");
  assert.equal(overCap.reason, "FRAME_EXTRACTION_BATCH_REQUIRED");
  assert.equal(Object.hasOwn(overCap, "artifactManifest"), false, "over-cap jobs must not silently produce a partial set");

  const mismatchedPlanRoot = path.join(tempRoot, "mismatch-plan-artifacts");
  const mismatchedPlanPath = path.join(mismatchedPlanRoot, "plans", "mismatch.json");
  fs.mkdirSync(path.dirname(mismatchedPlanPath), {recursive: true});
  const otherVideoSha = "9".repeat(64);
  const mismatchedPlan = sourcePlanOutput({videoSha256: otherVideoSha, frameIndices: selectedFrames,
    nodeId: "fixture:mismatch-plan", inputSha256: "5".repeat(64)});
  fs.writeFileSync(mismatchedPlanPath, `${JSON.stringify(mismatchedPlan, null, 2)}\n`);
  const mismatchedPlanFixture = await acceptArtifact({
    root: mismatchedPlanRoot,
    nodeId: "fixture:mismatch-plan",
    role: "frame-review-plan",
    kind: "JSON_PLAN",
    jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    filename: mismatchedPlanPath,
    reviewerId: "synthetic-mismatched-plan-acceptance",
  });
  const mismatchNode = makeNode(videoFixture, mismatchedPlanFixture, {id: "scene:source-sha-mismatch"});
  assert.equal((await execute(mismatchNode, videoFixture, mismatchedPlanFixture, artifactRoot)).reason,
    "FRAME_EXTRACTOR_SOURCE_VIDEO_SHA_MISMATCH");

  const tamperedPlanRoot = path.join(tempRoot, "tampered-plan-artifacts");
  const tamperedPlanPath = path.join(tamperedPlanRoot, "plans", "tampered-plan.json");
  fs.mkdirSync(path.dirname(tamperedPlanPath), {recursive: true});
  const tamperedPlan = structuredClone(planOutput);
  tamperedPlan.plan.sha256 = "a".repeat(64);
  fs.writeFileSync(tamperedPlanPath, `${JSON.stringify(tamperedPlan, null, 2)}\n`);
  const tamperedPlanFixture = await acceptArtifact({
    root: tamperedPlanRoot,
    nodeId: "fixture:tampered-plan",
    role: "frame-review-plan",
    kind: "JSON_PLAN",
    jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    filename: tamperedPlanPath,
    reviewerId: "synthetic-tampered-plan-acceptance",
  });
  const tamperedPlanNode = makeNode(videoFixture, tamperedPlanFixture, {id: "scene:policy-sha-mismatch"});
  assert.equal((await execute(tamperedPlanNode, videoFixture, tamperedPlanFixture, artifactRoot)).reason,
    "FRAME_EXTRACTOR_POLICY_PLAN_SHA_MISMATCH");
  const windowedTamperedPlanNode = makeNode(videoFixture, tamperedPlanFixture, {
    id: "scene:windowed-policy-sha-mismatch", adapterFor: windowedAdapter,
  });
  const windowedTamperedPlanResult = await executeWith(windowedAdapter, windowedTamperedPlanNode,
    videoFixture, tamperedPlanFixture, artifactRoot);
  assert.equal(windowedTamperedPlanResult.state, "blocked");
  assert.equal(windowedTamperedPlanResult.reason, "FRAME_EXTRACTOR_POLICY_PLAN_SHA_MISMATCH",
    "invalid plans must fail closed rather than enter the compatibility fallback");

  const changedVideoRoot = path.join(tempRoot, "changed-source-video-artifacts");
  const changedVideoPath = path.join(changedVideoRoot, "media", "synthetic-10s-cfr.mkv");
  fs.mkdirSync(path.dirname(changedVideoPath), {recursive: true});
  fs.copyFileSync(sourceVideoPath, changedVideoPath);
  const changedVideoFixture = await acceptArtifact({
    root: changedVideoRoot,
    nodeId: "fixture:changed-source-video",
    role: "source-video",
    kind: "VIDEO",
    filename: changedVideoPath,
    expectedMedia: {width: sourceWidth, height: sourceHeight, fps: sourceFps},
    reviewerId: "synthetic-changed-source-video-acceptance",
  });
  const originalVideoBytes = fs.readFileSync(changedVideoPath);
  const changedVideoBytes = Buffer.from(originalVideoBytes);
  changedVideoBytes[changedVideoBytes.length - 17] ^= 1;
  fs.writeFileSync(changedVideoPath, changedVideoBytes);
  const changedVideoNode = makeNode(changedVideoFixture, planFixture, {id: "scene:video-bytes-mismatch"});
  assert.equal((await execute(changedVideoNode, changedVideoFixture, planFixture, artifactRoot)).reason,
    "FRAME_EXTRACTOR_VIDEO_SHA_MISMATCH");
  const windowedChangedVideoNode = makeNode(changedVideoFixture, planFixture, {
    id: "scene:windowed-video-bytes-mismatch", adapterFor: windowedAdapter,
  });
  const windowedChangedVideoResult = await executeWith(windowedAdapter, windowedChangedVideoNode,
    changedVideoFixture, planFixture, artifactRoot);
  assert.equal(windowedChangedVideoResult.state, "blocked");
  assert.equal(windowedChangedVideoResult.reason, "FRAME_EXTRACTOR_VIDEO_SHA_MISMATCH",
    "source hash failures must fail closed rather than enter the compatibility fallback");

  const symlinkRoot = path.join(tempRoot, "symlink-source-video-artifacts");
  const symlinkVideoPath = path.join(symlinkRoot, "media", "synthetic-10s-cfr.mkv");
  fs.mkdirSync(path.dirname(symlinkVideoPath), {recursive: true});
  fs.copyFileSync(sourceVideoPath, symlinkVideoPath);
  const symlinkVideoFixture = await acceptArtifact({
    root: symlinkRoot,
    nodeId: "fixture:symlink-source-video",
    role: "source-video",
    kind: "VIDEO",
    filename: symlinkVideoPath,
    expectedMedia: {width: sourceWidth, height: sourceHeight, fps: sourceFps},
    reviewerId: "synthetic-symlink-source-video-acceptance",
  });
  const savedVideoPath = path.join(path.dirname(symlinkVideoPath), "saved-source.mkv");
  fs.renameSync(symlinkVideoPath, savedVideoPath);
  fs.symlinkSync(savedVideoPath, symlinkVideoPath);
  const symlinkNode = makeNode(symlinkVideoFixture, planFixture, {id: "scene:source-video-symlink"});
  assert.equal((await execute(symlinkNode, symlinkVideoFixture, planFixture, artifactRoot)).reason,
    "FRAME_EXTRACTOR_DEPENDENCY_ARTIFACT_SYMLINK_FORBIDDEN");

  console.log(`PASS node-ffmpeg-frame-extractor-v1: synthetic CFR exact source frames, passthrough PNGs, accepted dependency integrity, 60-frame cap, deterministic cache, verifier compatibility, safe full-source fallback, and review-only boundary; windowed profiles=${JSON.stringify(windowedProfileResults)}`);
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
