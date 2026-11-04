#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createNodeAdapterRegistry, createNodeArtifactVerificationContextV1,
  getNodeArtifactVerificationContextSummaryV1, closeNodeArtifactVerificationContextV1,
  executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts, NODE_ARTIFACT_MANIFEST_CONTRACT} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {
  A1_FRAME_REVIEW_SOURCE_MANIFEST_V1,
  A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1,
  A1_NODE_FFMPEG_SCDET_CANDIDATE_SET_V1,
  createNodeFfmpegScdetCandidateAdapterV1,
  parseFfmpegScdetMetadataV1,
  validateFfmpegScdetCfrPtsMappingV1,
} from "../apps/studio-next/src/lib/a1-node-ffmpeg-scdet-candidate-adapter-v1.mjs";
import {NODE_WORKFLOW_CONTRACT, nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffmpegPath = process.env.A1_TEST_FFMPEG_PATH || "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = process.env.A1_TEST_FFPROBE_PATH || "/Users/a1/.local/bin/ffprobe";
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-ffmpeg-scdet-candidate-v1-"));
const WIDTH = 64, HEIGHT = 64, FPS = 25, TOTAL_FRAMES = 100;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function runCli(binary, args, {timeout = 120_000, maxBuffer = 4 * 1024 * 1024} = {}) {
  return execFileSync(binary, args, {encoding: "utf8", timeout, maxBuffer, stdio: ["ignore", "pipe", "pipe"]});
}

function fileRecord(root, filename, role, kind, {jsonContract, expectedMedia} = {}) {
  const bytes = fs.readFileSync(filename);
  return {path: path.relative(root, filename).split(path.sep).join("/"), role, kind,
    ...(jsonContract ? {jsonContract} : {}), ...(expectedMedia ? {expectedMedia} : {}),
    sha256: sha256(bytes), bytes: bytes.length};
}

function lavfiSource(kind) {
  if (kind === "moving-no-cut") {
    const movingBox = "if(between(X,mod(N,48),mod(N,48)+7)*between(Y,28,35),255,0)";
    return `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${TOTAL_FRAMES / FPS},format=rgb24,geq=r='${movingBox}':g='${movingBox}':b='${movingBox}'`;
  }
  if (!(["single-cut", "adjacent-cuts"].includes(kind))) throw new Error("unknown-geq-fixture");
  const channel = kind === "single-cut" ? "if(lt(N,25),0,255)" : "if(lt(N,50),0,if(lt(N,51),255,64))";
  return `color=c=black:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${TOTAL_FRAMES / FPS},format=rgb24,geq=r='${channel}':g='${channel}':b='${channel}'`;
}

function generateVideo(kind, fixtureId) {
  const directory = path.join(tempRoot, "sources", fixtureId);
  const filename = path.join(directory, "media", "synthetic-cfr.mp4");
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  runCli(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", lavfiSource(kind),
    "-frames:v", String(TOTAL_FRAMES), "-an", "-sn", "-dn", "-c:v", "libx264rgb", "-crf", "0",
    "-preset", "ultrafast", "-bf", "0", "-g", "50", "-keyint_min", "50", "-sc_threshold", "0",
    "-pix_fmt", "rgb24", "-fps_mode", "cfr", "-video_track_timescale", "90000", "-threads", "1",
    "-y", filename]);
  return {directory, filename, bytes: fs.readFileSync(filename)};
}

async function acceptSource({fixtureId, filename, bytes, fps = FPS, totalFrames = TOTAL_FRAMES}) {
  const root = path.dirname(path.dirname(filename));
  const relativeVideo = path.relative(root, filename).split(path.sep).join("/");
  const manifestPath = path.join(root, "metadata", "frame-source-manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  const videoSha256 = sha256(bytes);
  const manifest = {contract: A1_FRAME_REVIEW_SOURCE_MANIFEST_V1, sourceVideoSha256: videoSha256, fps, totalFrames};
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {flag: "wx", mode: 0o600});

  const nodeId = `synthetic-source:${fixtureId}`;
  const input = {fixture: "ffmpeg-scdet-synthetic-cfr-source", sourceVideoSha256: videoSha256, fps, totalFrames};
  const inputSha256 = nodeInputHash({input, dependencies: {inputs: [], artifactKinds: {}}});
  const relativeManifest = path.relative(root, manifestPath).split(path.sep).join("/");
  const artifacts = [
    fileRecord(root, filename, "source-video", "VIDEO", {expectedMedia: {
      width: WIDTH, height: HEIGHT, fps, durationSeconds: totalFrames / fps,
    }}),
    fileRecord(root, manifestPath, "frame-review-source-manifest", "JSON_PLAN",
      {jsonContract: A1_FRAME_REVIEW_SOURCE_MANIFEST_V1}),
  ];
  const sourceNode = {id: nodeId, shotId: fixtureId, module: "fixture-source", input, inputSha256,
    dependencies: [], dependencyArtifactKinds: {}, state: "needs-review", attempt: 1, maxAttempts: 2,
    result: {state: "needs-review", reason: "SYNTHETIC_SOURCE_REQUIRES_TECHNICAL_ACCEPTANCE", productionAdmission: false,
      artifactManifest: {contract: NODE_ARTIFACT_MANIFEST_CONTRACT, nodeId, inputSha256,
        productionAdmission: false, artifacts}}, acceptance: null};
  const accepted = await acceptNodeArtifacts({contract: NODE_WORKFLOW_CONTRACT, projectId: "ffmpeg-scdet-candidate-test",
    workspaceSha256: sha256(Buffer.from("synthetic-scdet-candidate-test", "utf8")), scope: "REVIEW_ONLY",
    productionAdmission: false, modules: {}, nodes: [sourceNode]}, nodeId,
  {artifactRoot: root, reviewerId: "synthetic-cfr-source-technical-acceptance", ffprobePath, now: 1_000_000});
  const acceptedNode = accepted.nodes.find((node) => node.id === nodeId);
  assert.equal(acceptedNode.state, "succeeded");
  assert.equal(acceptedNode.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(acceptedNode.acceptance.productionAdmission, false);
  const video = acceptedNode.acceptance.artifacts.find((item) => item.role === "source-video" && item.kind === "VIDEO");
  const sourceManifest = acceptedNode.acceptance.artifacts.find((item) => item.role === "frame-review-source-manifest"
    && item.kind === "JSON_PLAN" && item.metadata?.jsonContract === A1_FRAME_REVIEW_SOURCE_MANIFEST_V1);
  assert.ok(video && sourceManifest);
  return {
    node: acceptedNode,
    root,
    filename,
    manifestPath,
    videoBinding: {dependencyId: nodeId, acceptedManifestSha256: acceptedNode.acceptance.manifestSha256,
      artifact: {path: video.path, sha256: video.sha256, bytes: video.bytes}},
    manifestBinding: {dependencyId: nodeId, acceptedManifestSha256: acceptedNode.acceptance.manifestSha256,
      artifact: {path: sourceManifest.path, sha256: sourceManifest.sha256, bytes: sourceManifest.bytes}},
    dependency: {state: "succeeded", nodeId, inputSha256: acceptedNode.inputSha256,
      manifestSha256: acceptedNode.acceptance.manifestSha256,
      artifacts: acceptedNode.acceptance.artifacts.map((artifact) => ({...artifact, absolutePath: path.join(root, artifact.path)}))},
    videoSha256,
    relativeVideo,
    relativeManifest,
  };
}

function makeNode(source, adapter, {threshold, id}) {
  const input = {projectId: "ffmpeg-scdet-synthetic-test", context: {}, shot: {id, source: "synthetic generated CFR"},
    module: A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1, moduleVersion: adapter.version,
    implementationSha256: adapter.implementationSha256, need: true,
    parameters: {sourceVideoBinding: structuredClone(source.videoBinding),
      sourceManifestBinding: structuredClone(source.manifestBinding), threshold}};
  const dependencyFingerprint = {id: source.node.id, inputSha256: source.node.inputSha256,
    acceptedManifestSha256: source.node.acceptance.manifestSha256};
  return {id, shotId: id, module: A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1, input,
    inputSha256: nodeInputHash({input, dependencies: {inputs: [dependencyFingerprint],
      artifactKinds: {[source.node.id]: ["VIDEO", "JSON_PLAN"]}}}),
    dependencies: [source.node.id], dependencyArtifactKinds: {[source.node.id]: ["VIDEO", "JSON_PLAN"]},
    state: "running", lease: {workerId: "synthetic-scdet-test", token: "test-lease", expiresAt: Date.now() + 60_000}};
}

async function execute(adapter, source, {threshold, id, artifactRoot}) {
  const node = makeNode(source, adapter, {threshold, id});
  const result = await adapter.execute(node, {dependencies: {[source.node.id]: structuredClone(source.dependency)}, artifactRoot});
  if (result.state !== "needs-review") return {node, result, artifact: null, bytes: null};
  const entry = result.artifactManifest.artifacts[0];
  const filename = path.join(artifactRoot, entry.path);
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha256(bytes), entry.sha256);
  return {node, result, artifact: JSON.parse(bytes.toString("utf8")), bytes};
}

async function executeThroughScheduler(adapter, registry, source, {threshold, id, artifactRoot}) {
  const node = makeNode(source, adapter, {threshold, id});
  const verificationContext = createNodeArtifactVerificationContextV1({ffprobePath});
  assert.equal(verificationContext.enabled, true, `run-scoped FFprobe attestation unavailable: ${verificationContext.disabledReason}`);
  const now = Date.now();
  const workflow = {contract: NODE_WORKFLOW_CONTRACT, projectId: "ffmpeg-scdet-synthetic-test",
    workspaceSha256: sha256(Buffer.from("synthetic-scdet-candidate-test", "utf8")), scope: "REVIEW_ONLY",
    productionAdmission: false, modules: registry.definitions, nodes: [structuredClone(source.node), node]};
  try {
    const result = await executeRegisteredNode(workflow, node, {registry: registry.registry, artifactRoot,
      verificationContext, ffprobePath, now});
    const verificationSummary = getNodeArtifactVerificationContextSummaryV1(verificationContext);
    if (result.state !== "needs-review") return {node, result, artifact: null, bytes: null, verificationSummary};
    const entry = result.artifactManifest.artifacts[0];
    const bytes = fs.readFileSync(path.join(artifactRoot, entry.path));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha256(bytes), entry.sha256);
    return {node, result, artifact: JSON.parse(bytes.toString("utf8")), bytes, verificationSummary};
  } finally {
    closeNodeArtifactVerificationContextV1(verificationContext);
  }
}

function testMetadataParserRejectsUntrustworthyRecords() {
  const good = [
    "[Parsed_metadata_1 @ 0x1] frame:0    pts:0       pts_time:0",
    "[Parsed_metadata_1 @ 0x1] lavfi.scd.score=0.000",
    "[Parsed_metadata_1 @ 0x1] frame:1    pts:3600    pts_time:0.04",
    "[Parsed_metadata_1 @ 0x1] lavfi.scd.score=99.609",
  ].join("\n");
  const rows = parseFfmpegScdetMetadataV1(good, {expectedFrames: 2});
  assert.deepEqual(rows.map(({sourceFrame, pts, ptsTime, rawScore}) => [sourceFrame, pts, ptsTime, rawScore]), [
    [0, "0", "0", 0], [1, "3600", "0.04", 99.609],
  ]);
  assert.deepEqual(validateFfmpegScdetCfrPtsMappingV1(rows, {fps: 25, totalFrames: 2}), {
    firstPts: "0", ptsPerFrame: "3600", firstPtsTime: "0", lastPts: "3600", lastPtsTime: "0.04",
    secondsPerFrame: 0.04, coverage: "FULL_CONSECUTIVE_CFR",
  });
  assert.throws(() => parseFfmpegScdetMetadataV1(good.replace("frame:1", "frame:2"), {expectedFrames: 2}),
    /SCDET_METADATA_FRAME_ORDINAL_NOT_CONSECUTIVE/u);
  assert.throws(() => parseFfmpegScdetMetadataV1(good.replace("lavfi.scd.score=0.000\n", ""), {expectedFrames: 2}),
    /SCDET_METADATA_SCORE_MISSING/u);
  assert.throws(() => parseFfmpegScdetMetadataV1(good.replace("pts:3600", "pts:N\/A"), {expectedFrames: 2}),
    /SCDET_METADATA_PTS_UNSUPPORTED/u);
  assert.throws(() => validateFfmpegScdetCfrPtsMappingV1([
    {sourceFrame: 0, pts: "0", ptsTime: "0", rawScore: 0},
    {sourceFrame: 1, pts: "0", ptsTime: "0.04", rawScore: 0},
  ], {fps: 25, totalFrames: 2}), /SCDET_METADATA_PTS_NOT_MONOTONIC/u);
  assert.throws(() => validateFfmpegScdetCfrPtsMappingV1([
    {sourceFrame: 0, pts: "0", ptsTime: "0", rawScore: 0},
    {sourceFrame: 1, pts: "3600", ptsTime: "0.05", rawScore: 0},
  ], {fps: 25, totalFrames: 2}), /SCDET_METADATA_PTS_TIME_NOT_CFR/u);
}

function assertCandidateOnlyOutput(result) {
  assert.equal(result.result.state, "needs-review", `adapter blocked: ${result.result.reason}`);
  assert.equal(result.result.reason, "SCDET_RAW_CANDIDATES_REQUIRE_INDEPENDENT_CALIBRATION_AND_REVIEW");
  assert.equal(result.result.visualApproval, false);
  assert.equal(result.result.productionAdmission, false);
  assert.equal(result.result.artifactManifest.productionAdmission, false);
  assert.equal(result.artifact.contract, A1_NODE_FFMPEG_SCDET_CANDIDATE_SET_V1);
  assert.equal(result.artifact.status, "CANDIDATE_ONLY");
  assert.equal(result.artifact.detector.scPass, 0);
  assert.equal(result.artifact.detector.scoreSemantics, "RAW_SCDET_CHANGE_SCORE_NOT_CONFIDENCE");
  assert.equal(result.artifact.detector.scoreCalibration, "NOT_ESTABLISHED");
  assert.equal(result.artifact.reviewBoundary.samplerAuthorization, false);
  assert.equal(result.artifact.reviewBoundary.signalContractEmission, "NONE");
  assert.equal(result.artifact.reviewBoundary.visualApproval, false);
  assert.equal(result.artifact.reviewBoundary.productionAdmission, false);
  assert.equal(Object.hasOwn(result.artifact, "signals"), false);
  assert.equal(Object.hasOwn(result.artifact, "signalSet"), false);
  assert.ok(result.artifact.candidates.every((candidate) => candidate.status === "CANDIDATE_ONLY"
    && candidate.confidence === null));
}

async function testAcceptedCutFixtureAndThresholdSweep(adapter) {
  const video = generateVideo("single-cut", "single-cut-f25-v1");
  const source = await acceptSource({fixtureId: "single-cut-f25-v1", ...video});
  const low = await execute(adapter, source, {threshold: 50, id: "cut-low-threshold", artifactRoot: path.join(tempRoot, "output-low")});
  assertCandidateOnlyOutput(low);
  assert.equal(low.artifact.source.sourceVideoSha256, source.videoSha256);
  assert.equal(low.artifact.source.fps, FPS);
  assert.equal(low.artifact.source.totalFrames, TOTAL_FRAMES);
  assert.equal(low.artifact.sourceBindings.sourceVideo.acceptedManifestSha256, source.node.acceptance.manifestSha256);
  assert.equal(low.artifact.sourceBindings.sourceManifest.artifact.sha256, source.manifestBinding.artifact.sha256);
  assert.equal(low.artifact.tool.path, path.resolve(ffmpegPath));
  assert.match(low.artifact.tool.version, /7\.1/u);
  assert.match(low.artifact.tool.binarySha256, /^[a-f0-9]{64}$/u);
  assert.equal(low.artifact.coverage.observedFrameRecords, TOTAL_FRAMES);
  assert.equal(low.artifact.coverage.complete, true);
  assert.equal(low.artifact.coverage.ptsMapping.firstPts, "0");
  assert.equal(low.artifact.coverage.ptsMapping.ptsPerFrame, "3600");
  assert.equal(low.artifact.frames.length, TOTAL_FRAMES);
  assert.deepEqual(low.artifact.frames.map((row) => row.sourceFrame), Array.from({length: TOTAL_FRAMES}, (_, index) => index));
  const cut = low.artifact.frames.find((row) => row.sourceFrame === 25);
  assert.ok(cut.rawScore > 99, `expected strong raw score at f25, got ${cut.rawScore}`);
  assert.equal(cut.pts, "90000");
  assert.equal(Number(cut.ptsTime), 1);
  assert.deepEqual(low.artifact.candidates.map((candidate) => candidate.sourceFrame), [25]);
  assert.equal(low.result.summary.sourceVideoFullSha256Passes, 2);
  assert.equal(low.result.summary.sourceVideoBytesHashed, source.videoBinding.artifact.bytes * 2);
  assert.equal(low.result.summary.sourceManifestFullSha256Passes, 2);
  assert.equal(low.result.summary.sourceManifestBytesHashed, source.manifestBinding.artifact.bytes * 2);
  assert.equal(low.result.summary.sourceIntegrityMode, "ADAPTER_FULL_SHA");
  assert.equal(low.result.summary.ffmpegMetadataScanProcesses, 1);
  assert.deepEqual(low.result.summary.constructorProbeProcesses, {version: 1, filters: 1});

  const high = await execute(adapter, source, {threshold: 100, id: "cut-high-threshold", artifactRoot: path.join(tempRoot, "output-high")});
  assertCandidateOnlyOutput(high);
  assert.deepEqual(high.artifact.frames.map((row) => row.rawScore), low.artifact.frames.map((row) => row.rawScore),
    "changing the threshold selects candidate rows but does not convert or change raw scores");
  assert.deepEqual(high.artifact.candidates, []);
  assert.equal(high.artifact.detector.threshold, 100);
  assert.equal(low.artifact.detector.threshold, 50);

  const repeated = await execute(adapter, source, {threshold: 50, id: "cut-low-threshold", artifactRoot: path.join(tempRoot, "output-repeat")});
  assert.deepEqual(repeated.bytes, low.bytes, "same accepted source, threshold and tool must produce deterministic artifact bytes");

  const registry = createNodeAdapterRegistry({[A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1]: adapter});
  const attested = await executeThroughScheduler(adapter, registry, source, {threshold: 50, id: "cut-attested-run",
    artifactRoot: path.join(tempRoot, "output-attested")});
  assertCandidateOnlyOutput(attested);
  assert.equal(attested.result.summary.sourceIntegrityMode, "RUN_SCOPED_ATTESTATION_STAT_RECHECK");
  assert.equal(attested.result.summary.sourceVideoFullSha256Passes, 0,
    "a current scheduler attestation must replace duplicate adapter source SHA passes");
  assert.equal(attested.result.summary.sourceVideoBytesHashed, 0);
  assert.equal(attested.verificationSummary.counters.sourceVideoShaPassCount, 1,
    "the scheduler must retain the first full source verification pass");
}

async function testAdjacentCutsAndMovingWithoutCut(adapter) {
  const adjacentVideo = generateVideo("adjacent-cuts", "adjacent-cuts-f25-v1");
  const adjacentSource = await acceptSource({fixtureId: "adjacent-cuts-f25-v1", ...adjacentVideo});
  const adjacent = await execute(adapter, adjacentSource, {threshold: 20, id: "adjacent-cuts", artifactRoot: path.join(tempRoot, "output-adjacent")});
  assertCandidateOnlyOutput(adjacent);
  assert.deepEqual(adjacent.artifact.candidates.map((candidate) => candidate.sourceFrame), [50, 51]);
  assert.equal(adjacent.artifact.frames[50].pts, String(50 * 3600));
  assert.equal(adjacent.artifact.frames[51].pts, String(51 * 3600));
  assert.ok(adjacent.artifact.frames[50].rawScore > 99);
  assert.ok(adjacent.artifact.frames[51].rawScore >= 20);

  const movingVideo = generateVideo("moving-no-cut", "moving-no-cut-f25-v1");
  const movingSource = await acceptSource({fixtureId: "moving-no-cut-f25-v1", ...movingVideo});
  const moving = await execute(adapter, movingSource, {threshold: 10, id: "moving-no-cut", artifactRoot: path.join(tempRoot, "output-moving")});
  assertCandidateOnlyOutput(moving);
  assert.equal(moving.artifact.frames.length, TOTAL_FRAMES);
  assert.deepEqual(moving.artifact.candidates, [], "small moving geometry should stay below this explicit synthetic threshold");
  assert.ok(Math.max(...moving.artifact.frames.map((row) => row.rawScore)) > 0,
    "moving-without-cut fixture must produce raw nonzero change scores");
  assert.ok(Math.max(...moving.artifact.frames.map((row) => row.rawScore)) < 10);
}

async function testSourceMutationAndAcceptedBindingFailClosed(adapter) {
  const video = generateVideo("single-cut", "mutation-fixture-f25-v1");
  const source = await acceptSource({fixtureId: "mutation-fixture-f25-v1", ...video});
  const original = fs.readFileSync(source.filename);
  const modified = Buffer.from(original);
  modified[modified.length - 1] ^= 1;
  fs.writeFileSync(source.filename, modified);
  try {
    const changed = await execute(adapter, source, {threshold: 50, id: "mutated-source", artifactRoot: path.join(tempRoot, "output-mutated")});
    assert.equal(changed.result.state, "blocked");
    assert.equal(changed.result.reason, "SCDET_SOURCE_VIDEO_SHA_MISMATCH");
    assert.equal(changed.result.visualApproval, false);
    assert.equal(changed.result.productionAdmission, false);
  } finally {
    fs.writeFileSync(source.filename, original);
  }

  const wrongBindingSource = structuredClone(source);
  wrongBindingSource.videoBinding.artifact.sha256 = "b".repeat(64);
  const wrongBinding = await execute(adapter, wrongBindingSource, {threshold: 50, id: "wrong-accepted-binding",
    artifactRoot: path.join(tempRoot, "output-wrong-binding")});
  assert.equal(wrongBinding.result.state, "blocked");
  assert.equal(wrongBinding.result.reason, "SCDET_ACCEPTED_ARTIFACT_BINDING_MISMATCH");
}

async function main() {
  assert.ok(fs.existsSync(ffmpegPath), `trusted FFmpeg missing: ${ffmpegPath}`);
  assert.ok(fs.existsSync(ffprobePath), `technical acceptance FFprobe missing: ${ffprobePath}`);
  testMetadataParserRejectsUntrustworthyRecords();
  const adapter = createNodeFfmpegScdetCandidateAdapterV1({ffmpegPath});
  assert.equal(adapter.enabled, true);
  assert.equal(adapter.optional, true);
  assert.equal(adapter.tool.path, path.resolve(ffmpegPath));
  assert.match(adapter.implementationSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(adapter.processCounts, {versionProbeAtConstruction: 1, filterCapabilityProbeAtConstruction: 1,
    metadataScanPerExecute: 1});
  assert.throws(() => createNodeFfmpegScdetCandidateAdapterV1({ffmpegPath: ffprobePath}), /FFMPEG_SCDET_VERSION_UNREADABLE/u,
    "a different executable with an FFprobe version must not be accepted as the FFmpeg runtime");
  const defaultRegistry = createNodeAdapterRegistry();
  assert.equal(defaultRegistry.registry[A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1], undefined,
    "the candidate provider remains absent from the default adapter registry");
  const injectedRegistry = createNodeAdapterRegistry({[A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1]: adapter});
  assert.equal(injectedRegistry.registry[A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1].available, true);

  await testAcceptedCutFixtureAndThresholdSweep(adapter);
  await testAdjacentCutsAndMovingWithoutCut(adapter);
  await testSourceMutationAndAcceptedBindingFailClosed(adapter);
  console.log("PASS ffmpeg-scdet-candidate-adapter-v1: accepted CFR source, exact f25 and adjacent cut PTS, full scdet records, moving-without-cut, raw threshold sweep, deterministic artifact, source/tool/binding boundaries, review-only output");
}

try {
  await main();
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
