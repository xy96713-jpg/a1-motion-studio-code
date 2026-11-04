#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFile, execFileSync} from "node:child_process";
import {promisify} from "node:util";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask, nodeDependencyBlockers} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {
  createNodeAdapterRegistry,
  createNodeArtifactVerificationContextV1,
  closeNodeArtifactVerificationContextV1,
  executeRegisteredNode,
  getNodeArtifactVerificationContextSummaryV1,
} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {buildNodeFrameExtractionBatchFanoutV1} from "../apps/studio-next/src/lib/a1-node-frame-extraction-batch-fanout-v1.mjs";
import {createNodeFfmpegSourceIndexerAdapterV1, A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1} from "../apps/studio-next/src/lib/a1-node-ffmpeg-source-indexer-v1.mjs";
import {createNodeFfmpegFrameExtractorAdapterV1, A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1} from "../apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs";
import {A1_REFERENCE_FRAME_REVIEW_POLICY_V1, compileReferenceFrameReviewPlanV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1} from "../apps/studio-next/src/lib/a1-node-frame-review-plan-adapter-v1.mjs";
import {planReferenceFrameExtractionBatchesV1} from "../apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskRoot = path.join(repoRoot, "work/run-scoped-source-verification-reuse-v1");
const sourceRoot = path.join(taskRoot, "sources");
const runId = Date.now().toString(36) + "-" + process.pid;
const artifactRoot = path.join(taskRoot, "artifacts", runId);
const resultPath = path.join(taskRoot, "result.json");
const graphPath = path.join(taskRoot, "verification-reuse-map.png");
const ffmpegPath = "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = "/Users/a1/.local/bin/ffprobe";
const baselineResultPath = path.join(repoRoot, "work/shared-source-keyframe-index-dependency-v1/result.json");
const baselineResult = JSON.parse(fs.readFileSync(baselineResultPath, "utf8"));
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeId = (value) => `${String(value).replace(/[^A-Za-z0-9._-]+/gu, "_")}-${sha256(Buffer.from(String(value), "utf8")).slice(0, 12)}`;
const pathRelative = (value) => path.relative(repoRoot, value).split(path.sep).join("/");
const fileRecord = (root, filename, role, kind, {jsonContract, expectedMedia} = {}) => {
  const bytes = fs.readFileSync(filename);
  return {path: path.relative(root, filename).split(path.sep).join("/"), role, kind,
    ...(jsonContract ? {jsonContract} : {}), ...(expectedMedia ? {expectedMedia} : {}),
    sha256: sha256(bytes), bytes: bytes.length};
};
const readPixelCode = async (filename) => {
  const {data} = await sharp(filename).removeAlpha().raw().toBuffer({resolveWithObject: true});
  return data[0] + data[1] * 256 + data[2] * 65_536;
};
const sourceManifestContract = "A1FrameReviewSourceManifest/v1";
const sourceModuleSha256 = sha256(Buffer.from("synthetic-review-only-source-fixture-adapter-v1", "utf8"));
const batchPlanModuleSha256 = sha256(Buffer.from("synthetic-review-only-frame-batch-plan-adapter-v1", "utf8"));
const sourcePlans = [
  {id: "source-index-cfr25-narrated", genre: "narrated-explainer", fps: 25, gop: 50},
  {id: "source-index-cfr30-tutorial", genre: "screen-tutorial", fps: 30, gop: 60},
  {id: "source-index-cfr60-opinion", genre: "opinion-piece", fps: 60, gop: 120},
].map((group) => ({...group, durationSeconds: 8, totalFrames: group.fps * 8,
  frames: Array.from({length: 65}, (_, index) => Math.floor(index * (group.fps * 8 - 1) / 64))}));
const sourceMedia = new Map();
fs.mkdirSync(sourceRoot, {recursive: true});
fs.mkdirSync(artifactRoot, {recursive: true});

for (const group of sourcePlans) {
  const filename = path.join(sourceRoot, group.id + "-" + group.totalFrames + "f.mp4");
  const lavfi = "color=c=black:s=64x64:r=" + group.fps + ":d=" + group.durationSeconds
    + ",format=rgb24,geq=r='mod(N,256)':g='mod(floor(N/256),256)':b='mod(floor(N/65536),256)'";
  await execFileAsync(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", lavfi, "-frames:v", String(group.totalFrames), "-an", "-sn", "-dn",
    "-c:v", "libx264rgb", "-crf", "0", "-preset", "ultrafast", "-bf", "0",
    "-g", String(group.gop), "-keyint_min", String(group.gop), "-sc_threshold", "0",
    "-pix_fmt", "rgb24", "-fps_mode", "cfr", "-video_track_timescale", "90000", "-threads", "1", "-y", filename],
  {encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024});
  const bytes = fs.readFileSync(filename);
  group.sourceVideoSha256 = sha256(bytes);
  group.sourceVideoBytes = bytes.length;
  const policy = compileReferenceFrameReviewPlanV1({
    sourceVideoSha256: group.sourceVideoSha256,
    fps: group.fps,
    totalFrames: group.totalFrames,
    sequences: group.frames.map((frame, index) => ({sequenceId: `${group.id}-beat-${String(index + 1).padStart(3, "0")}`,
      startFrame: frame, endFrameExclusive: frame + 1, mode: "stable-hold", representativeFrame: frame})),
  });
  group.policyPlan = policy;
  group.batchPlan = planReferenceFrameExtractionBatchesV1({plan: policy});
  sourceMedia.set(group.id, {filename, bytes, sha256: group.sourceVideoSha256});
}

async function writeOrVerify(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  if (fs.existsSync(filename)) assert.deepEqual(fs.readFileSync(filename), bytes, `existing cache file differs: ${pathRelative(filename)}`);
  else fs.writeFileSync(filename, bytes, {flag: "wx", mode: 0o600});
}

async function executeSyntheticSourceNode(node, {artifactRoot: root} = {}) {
  const parameters = node.input?.parameters;
  const group = sourcePlans.find((item) => item.id === parameters?.groupId);
  const media = sourceMedia.get(parameters?.groupId);
  if (node.module !== "fixture-source" || node.input?.implementationSha256 !== sourceModuleSha256
    || !group || !media || parameters.sourceVideoSha256 !== group.sourceVideoSha256) {
    return {state: "blocked", reason: "FANOUT_SOURCE_INPUT_INVALID", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  const directory = path.join(root, `source-fixture-${safeId(node.id)}`, node.inputSha256);
  const videoPath = path.join(directory, "source-video.avi");
  const manifestPath = path.join(directory, "frame-source-manifest.json");
  await writeOrVerify(videoPath, media.bytes);
  const manifestBytes = Buffer.from(`${JSON.stringify({contract: sourceManifestContract,
    sourceVideoSha256: group.sourceVideoSha256, fps: group.fps, totalFrames: group.totalFrames}, null, 2)}\n`, "utf8");
  await writeOrVerify(manifestPath, manifestBytes);
  return {state: "needs-review", reason: "SYNTHETIC_SOURCE_RECEIPT_REQUIRES_TECHNICAL_ACCEPTANCE",
    visualApproval: "NOT_GRANTED", productionAdmission: false,
    artifactManifest: {contract: "A1NodeArtifactManifest/v1", nodeId: node.id, inputSha256: node.inputSha256,
      productionAdmission: false, artifacts: [
        fileRecord(root, videoPath, "source-video", "VIDEO", {expectedMedia: {
          width: 64, height: 64, fps: group.fps, durationSeconds: group.durationSeconds,
        }}),
        fileRecord(root, manifestPath, "frame-review-source-manifest", "JSON_PLAN", {jsonContract: sourceManifestContract}),
      ]},
    summary: {sourceVideoSha256: group.sourceVideoSha256, visualApproval: "NOT_GRANTED", productionAdmission: false}};
}

function policyPlanForBatch({group, batch, sourceManifestBinding}) {
  const references = batch.assets.flatMap((asset) => asset.references.map((reference) => ({
    sequenceId: reference.sequenceId, role: reference.role, sourceFrame: asset.sourceFrame,
    scope: reference.scope, reason: reference.reason,
  })));
  const body = {
    contract: A1_REFERENCE_FRAME_REVIEW_POLICY_V1,
    source: {videoSha256: group.sourceVideoSha256, fps: group.fps, totalFrames: group.totalFrames},
    references,
    assets: batch.assets,
    summary: {referenceCount: batch.referenceCount, uniqueSourceFrames: batch.uniqueFrameCount,
      reusedReferences: batch.referenceCount - batch.uniqueFrameCount, extractedImages: 0,
      visualApproval: false, productionAdmission: false},
  };
  return {...body, sha256: sha256(Buffer.from(JSON.stringify(body), "utf8"))};
}

async function executeSyntheticBatchPlanNode(node, {artifactRoot: root, dependencies = {}} = {}) {
  const parameters = node.input?.parameters;
  const sourceManifestBinding = parameters?.sourceManifestBinding;
  const batch = parameters?.batch;
  const group = sourcePlans.find((item) => item.id === parameters?.groupId);
  const dependency = dependencies?.[sourceManifestBinding?.dependencyId];
  const sourceArtifact = dependency?.artifacts?.find((artifact) => artifact.role === "frame-review-source-manifest"
    && artifact.kind === "JSON_PLAN" && artifact.metadata?.jsonContract === sourceManifestContract
    && artifact.path === sourceManifestBinding?.artifact?.path && artifact.sha256 === sourceManifestBinding?.artifact?.sha256
    && artifact.bytes === sourceManifestBinding?.artifact?.bytes);
  if (node.module !== "fixture-batch-plan" || node.input?.implementationSha256 !== batchPlanModuleSha256
    || !group || !batch || !sourceArtifact || dependency?.state !== "succeeded"
    || dependency.manifestSha256 !== sourceManifestBinding.acceptedManifestSha256
    || batch.sourceVideoSha256 !== group.sourceVideoSha256 || batch.inputPlanSha256 !== group.batchPlan.sourcePlanSha256) {
    return {state: "blocked", reason: "FANOUT_BATCH_INPUT_INVALID", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  const plan = policyPlanForBatch({group, batch, sourceManifestBinding});
  const wrapper = {
    contract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    nodeId: node.id,
    inputSha256: node.inputSha256,
    sourceManifestBinding: structuredClone(sourceManifestBinding),
    source: {sourceVideoSha256: group.sourceVideoSha256, fps: group.fps, totalFrames: group.totalFrames},
    plan,
    proofBoundary: {acceptedSourceManifestBytesReverified: true, sourceVideoRead: false,
      sourceVideoDecoded: false, frameExtractionPerformed: false, extractedImages: 0,
      visualApproval: false, productionAdmission: false},
  };
  const directory = path.join(root, `batch-plan-${safeId(node.id)}`, node.inputSha256);
  const outputPath = path.join(directory, "frame-review-plan.json");
  const outputBytes = Buffer.from(`${JSON.stringify(wrapper, null, 2)}\n`, "utf8");
  await writeOrVerify(outputPath, outputBytes);
  return {state: "needs-review", reason: "SYNTHETIC_FRAME_PLAN_REQUIRES_TECHNICAL_ACCEPTANCE",
    visualApproval: "NOT_GRANTED", productionAdmission: false,
    summary: {batchId: batch.id, batchSha256: batch.sha256,
      sourcePlanSha256: batch.inputPlanSha256, sourceVideoSha256: batch.sourceVideoSha256,
      uniqueFrameCount: batch.uniqueFrameCount, referenceCount: batch.referenceCount,
      visualApproval: "NOT_GRANTED", productionAdmission: false},
    artifactManifest: {contract: "A1NodeArtifactManifest/v1", nodeId: node.id, inputSha256: node.inputSha256,
      productionAdmission: false, artifacts: [fileRecord(root, outputPath, "frame-review-plan", "JSON_PLAN",
        {jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1})]}};
}

const sourceIndexerAdapter = createNodeFfmpegSourceIndexerAdapterV1({ffprobePath});
const extractorAdapter = createNodeFfmpegFrameExtractorAdapterV1({
  ffmpegPath,
  extractionStrategy: "windowed-review-only",
});
const installed = createNodeAdapterRegistry({
  "fixture-source": {label: "合成来源", version: 1, optional: true,
    implementationSha256: sourceModuleSha256, execute: executeSyntheticSourceNode},
  "fixture-batch-plan": {label: "合成批次计划", version: 1, optional: true,
    implementationSha256: batchPlanModuleSha256, execute: executeSyntheticBatchPlanNode},
  [A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: sourceIndexerAdapter,
  [A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1]: extractorAdapter,
});
const sourceVerificationContext = createNodeArtifactVerificationContextV1({ffprobePath});
assert.equal(sourceVerificationContext.enabled, true,
  "the source-verification cache requires a trusted direct FFprobe binary");
assert.equal(baselineResult.summary?.status || baselineResult.status, "PASS",
  "the previous scheduler integration must be a passing baseline");
assert.equal(createNodeAdapterRegistry().registry["ffmpeg-frame-extractor"], undefined,
  "the production registry must not receive the review-only extractor module");
assert.equal(createNodeAdapterRegistry().registry[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1], undefined,
  "the production registry must not receive the review-only source indexer");

const projectId = "scheduler-frame-extraction-batch-fanout-v1";
const workspaceSha256 = sha256(Buffer.from("scheduler-frame-extraction-batch-fanout-synthetic-v1", "utf8"));
const moduleFlags = (active) => ({
  material: false, typography: false, recording: false, diagram: false,
  "fixture-source": active === "fixture-source",
  "fixture-batch-plan": active === "fixture-batch-plan",
  [A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: active === A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1,
  [A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1]: active === A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1,
});
const context = {articleTitle: "synthetic cross-genre scheduler fanout", articleSha256: sha256(Buffer.from("fanout-test-input", "utf8"))};

async function runAcceptedStage(input, previous, moduleName, workerId, reviewerId,
  {verificationContext = null, parallelClaims = false} = {}) {
  let workflow = compileNodeWorkflow(input, previous, {moduleDefinitions: installed.definitions});
  let now = 700_000;
  let acceptedCount = 0, maxClaims = 0;
  while (workflow.nodes.some((node) => node.module === moduleName && ["queued", "running", "needs-review"].includes(node.state))) {
    workflow = compileNodeWorkflow(input, workflow, {moduleDefinitions: installed.definitions});
    const batch = claimNodeTasks(workflow, {workerId, now});
    if (!batch.claims.length) {
      const waiting = workflow.nodes.filter((node) => node.module === moduleName && !["succeeded", "skipped"].includes(node.state));
      assert.deepEqual(waiting.map((node) => [node.id, node.state, node.reason]), [], `${moduleName} stage must not stall`);
      break;
    }
    maxClaims = Math.max(maxClaims, batch.claims.length);
    assert.ok(batch.claims.length <= 2);
    assert.ok(batch.claims.every((claim) => claim.module === moduleName));
    workflow = batch.workflow;
    const executeClaim = (claim) => executeRegisteredNode(workflow, claim, {
      registry: installed.registry, artifactRoot, ffprobePath, now: now + 1,
      ...(verificationContext ? {verificationContext} : {}),
    });
    const parallelResults = parallelClaims ? await Promise.all(batch.claims.map(executeClaim)) : null;
    for (let claimIndex = 0; claimIndex < batch.claims.length; claimIndex += 1) {
      const claim = batch.claims[claimIndex];
      const result = parallelResults ? parallelResults[claimIndex] : await executeClaim(claim);
      assert.equal(result.state, "needs-review", `${claim.id}: ${result.reason || "no reason"}`);
      assert.equal(result.productionAdmission, false);
      workflow = finishNodeTask(workflow, claim, result, now + 2);
      workflow = await acceptNodeArtifacts(workflow, claim.id, {artifactRoot, reviewerId, ffprobePath, now: now + 3});
      const accepted = workflow.nodes.find((node) => node.id === claim.id);
      assert.equal(accepted.state, "succeeded");
      assert.equal(accepted.acceptance.visualApproval, "NOT_GRANTED");
      assert.equal(accepted.acceptance.productionAdmission, false);
      acceptedCount += 1;
      now += 10;
    }
  }
  return {workflow, acceptedCount, maxClaims};
}

const sourceShots = sourcePlans.map((group) => ({
  id: group.id, source: `Synthetic ${group.genre} source video`,
  modules: moduleFlags("fixture-source"),
  moduleInputs: {"fixture-source": {groupId: group.id, sourceVideoSha256: group.sourceVideoSha256}},
}));
const sourceStage = await runAcceptedStage({projectId, workspaceSha256, context, shots: sourceShots},
  null, "fixture-source", "source-fixture-worker", "source-fixture-technical-check");
const sourceWorkflow = sourceStage.workflow;
const acceptedSources = new Map(sourcePlans.map((group) => {
  const node = sourceWorkflow.nodes.find((item) => item.id === `${group.id}:fixture-source`);
  assert.equal(node?.state, "succeeded");
  const manifest = node.acceptance.artifacts.find((artifact) => artifact.role === "frame-review-source-manifest"
    && artifact.kind === "JSON_PLAN" && artifact.metadata.jsonContract === sourceManifestContract);
  const video = node.acceptance.artifacts.find((artifact) => artifact.role === "source-video" && artifact.kind === "VIDEO");
  assert.ok(manifest && video);
  assert.equal(video.sha256, group.sourceVideoSha256);
  return [group.id, {node, manifest, video}];
}));

const sourceIndexShots = sourcePlans.map((group) => {
  const source = acceptedSources.get(group.id);
  const binding = {
    dependencyId: source.node.id,
    acceptedManifestSha256: source.node.acceptance.manifestSha256,
    artifact: {path: source.video.path, sha256: source.video.sha256, bytes: source.video.bytes},
  };
  return {
    id: "source-index-" + group.id,
    source: "Build one verified keyframe index for " + group.genre,
    modules: moduleFlags(A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1),
    moduleDependencyBindings: {
      [A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: [
        {nodeId: source.node.id, artifactKinds: ["VIDEO"]},
      ],
    },
    moduleInputs: {
      [A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: {sourceVideoBinding: binding},
    },
  };
});
const indexStage = await runAcceptedStage({
  projectId, workspaceSha256, context, shots: sourceIndexShots,
}, sourceWorkflow, A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1,
"source-indexer-worker", "source-indexer-technical-check",
{verificationContext: sourceVerificationContext});
const acceptedIndexes = new Map(sourcePlans.map((group) => {
  const node = indexStage.workflow.nodes.find((item) =>
    item.module === A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1
    && item.result?.summary?.sourceVideoSha256 === group.sourceVideoSha256);
  assert.equal(node?.state, "succeeded");
  assert.equal(node.result.summary.sourceVideoManifestSha256,
    acceptedSources.get(group.id).node.acceptance.manifestSha256);
  assert.equal(node.result.summary.ffprobePacketScanCount, 1);
  assert.equal(node.result.summary.sourceByteAudit.sourceIntegrityMode, "RUN_SCOPED_ATTESTATION_STAT_RECHECK");
  assert.equal(node.result.summary.sourceByteAudit.adapterFullFileSha256Passes, 0);
  assert.equal(node.result.summary.sourceByteAudit.adapterBytesHashed, 0);
  return [group.id, node];
}));

const batchSpecs = sourcePlans.flatMap((group) => {
  const source = acceptedSources.get(group.id);
  return group.batchPlan.batches.map((batch) => ({group, source, batch}));
});
const batchPlanShots = batchSpecs.map(({group, source, batch}) => ({
  id: `plan-${group.id}-${batch.id}`,
  source: `Synthetic ${group.genre} accepted batch plan`,
  modules: moduleFlags("fixture-batch-plan"),
  moduleDependencyBindings: {"fixture-batch-plan": [{nodeId: source.node.id, artifactKinds: ["JSON_PLAN"]}]},
  moduleInputs: {"fixture-batch-plan": {
    groupId: group.id,
    sourceManifestBinding: {dependencyId: source.node.id,
      acceptedManifestSha256: source.node.acceptance.manifestSha256,
      artifact: {path: source.manifest.path, sha256: source.manifest.sha256, bytes: source.manifest.bytes}},
    batch: {id: batch.id, sha256: batch.sha256, inputPlanSha256: batch.inputPlanSha256,
      sourceVideoSha256: batch.sourceVideoSha256, uniqueFrameCount: batch.uniqueFrameCount,
      referenceCount: batch.referenceCount, assets: batch.assets},
  }},
}));
const batchStage = await runAcceptedStage({projectId, workspaceSha256, context, shots: batchPlanShots},
  sourceWorkflow, "fixture-batch-plan", "batch-plan-worker", "batch-plan-technical-check",
  {verificationContext: sourceVerificationContext, parallelClaims: true});
const batchWorkflow = batchStage.workflow;
const batchNodesByGroup = new Map(sourcePlans.map((group) => [group.id, group.batchPlan.batches.map((batch) => {
  const node = batchWorkflow.nodes.find((item) => item.id === `plan-${group.id}-${batch.id}:fixture-batch-plan`);
  assert.equal(node?.state, "succeeded");
  return node;
})]));

const fanoutResults = sourcePlans.map((group) => {
  const source = acceptedSources.get(group.id);
  const sourceIndexNode = acceptedIndexes.get(group.id);
  const result = buildNodeFrameExtractionBatchFanoutV1({batchPlan: group.batchPlan,
    sourceNodes: [source.node], batchPlanNodes: batchNodesByGroup.get(group.id),
    sourceIndexNodes: [sourceIndexNode]});
  return {group, source, sourceIndexNode, result};
});
const fanoutShots = fanoutResults.flatMap((item) => item.result.shots);
assert.equal(fanoutShots.length, 6);
assert.equal(new Set(fanoutShots.map((shot) => shot.id)).size, 6);

const fanoutInput = {projectId, workspaceSha256, context, shots: fanoutShots};
const combinedNodes = new Map();
for (const node of [...batchWorkflow.nodes, ...indexStage.workflow.nodes]) {
  const existing = combinedNodes.get(node.id);
  if (existing) {
    assert.equal(existing.inputSha256, node.inputSha256, "shared accepted dependency input SHA must match across stages");
    assert.equal(existing.acceptance?.manifestSha256, node.acceptance?.manifestSha256,
      "shared accepted dependency receipts must match across stages");
  } else {
    combinedNodes.set(node.id, node);
  }
}
const combinedUpstream = {...batchWorkflow, nodes: [...combinedNodes.values()]};
const fanoutWorkflow = compileNodeWorkflow(fanoutInput, combinedUpstream, {moduleDefinitions: installed.definitions});
const extractorNodes = fanoutWorkflow.nodes.filter((node) => node.module === A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1);
const retainedSourceNodes = fanoutWorkflow.nodes.filter((node) => node.module === "fixture-source" && node.state === "succeeded");
const retainedPlanNodes = fanoutWorkflow.nodes.filter((node) => node.module === "fixture-batch-plan" && node.state === "succeeded");
const retainedIndexNodes = fanoutWorkflow.nodes.filter((node) => node.module === A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1 && node.state === "succeeded");
assert.equal(extractorNodes.length, 6);
assert.equal(retainedSourceNodes.length, 3, "one accepted source node per source SHA must be retained");
assert.equal(retainedIndexNodes.length, 3, "one accepted keyframe-index node per source SHA must be retained");
assert.equal(retainedPlanNodes.length, 6, "each batch plan node must be retained once");
for (const node of extractorNodes) {
  assert.equal(node.dependencies.length, 3);
  assert.deepEqual(nodeDependencyBlockers(fanoutWorkflow, node), []);
  const sourceDep = fanoutWorkflow.nodes.find((item) => item.id === node.dependencies[0]);
  const planDep = fanoutWorkflow.nodes.find((item) => item.id === node.dependencies[1]);
  const indexDep = fanoutWorkflow.nodes.find((item) => item.id === node.dependencies[2]);
  assert.equal(sourceDep.module, "fixture-source");
  assert.equal(planDep.module, "fixture-batch-plan");
  assert.equal(indexDep.module, A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1);
  assert.equal(node.dependencyArtifactKinds[sourceDep.id][0], "VIDEO");
  assert.equal(node.dependencyArtifactKinds[planDep.id][0], "JSON_PLAN");
  assert.equal(node.dependencyArtifactKinds[indexDep.id][0], "JSON_PLAN");
}

let scheduledWorkflow = fanoutWorkflow;
let maxRunningClaims = 0, tasksExecuted = 0, childPacketIndexScans = 0;
let childGenericMediaProbes = 0, totalFramePixelChecks = 0;
const extractorResults = [];
let clockNow = 900_000;
while (scheduledWorkflow.nodes.some((node) => node.module === A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1
  && node.state === "queued")) {
  const claimBatch = claimNodeTasks(scheduledWorkflow, {workerId: "synthetic-fanout-worker", now: clockNow});
  assert.ok(claimBatch.claims.length >= 1);
  assert.ok(claimBatch.claims.length <= 2);
  maxRunningClaims = Math.max(maxRunningClaims, claimBatch.claims.length);
  scheduledWorkflow = claimBatch.workflow;
  for (const claim of claimBatch.claims) {
    const result = await executeRegisteredNode(scheduledWorkflow, claim, {
      registry: installed.registry, artifactRoot, ffprobePath, now: clockNow + 1,
      verificationContext: sourceVerificationContext,
    });
    assert.equal(result.state, "needs-review");
    assert.equal(result.reason, "REFERENCE_FRAME_IMAGES_REQUIRE_INDEPENDENT_REVIEW");
    assert.equal(result.productionAdmission, false);
    assert.equal(claim.dependencies.length, 3);
    const [sourceId, planId, indexId] = claim.dependencies;
    const indexNode = scheduledWorkflow.nodes.find((item) => item.id === indexId);
    assert.equal(indexNode?.module, A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1);
    assert.equal(claim.input.parameters.sourceIndexBinding.dependencyId, indexId);
    const acceptedIndexArtifact = indexNode.acceptance.artifacts.find((artifact) =>
      artifact.role === "source-keyframe-index" && artifact.kind === "JSON_PLAN");
    assert.ok(acceptedIndexArtifact);
    assert.equal(claim.input.parameters.sourceIndexBinding.acceptedManifestSha256, indexNode.acceptance.manifestSha256);
    assert.deepEqual(claim.input.parameters.sourceIndexBinding.artifact, {
      path: acceptedIndexArtifact.path,
      sha256: acceptedIndexArtifact.sha256,
      bytes: acceptedIndexArtifact.bytes,
    });
    const receiptManifest = result.artifactManifest.artifacts.find((artifact) =>
      artifact.role === "frame-extraction-receipt" && artifact.kind === "JSON_PLAN");
    assert.ok(receiptManifest, "extractor receipt must be present in the review-only result");
    const receipt = JSON.parse(fs.readFileSync(path.join(artifactRoot, receiptManifest.path), "utf8"));
    assert.equal(receipt.sourceIndexBinding.dependencyId, indexId);
    assert.equal(receipt.sourceKeyframeIndexSha256, indexNode.result.summary.indexSha256);
    assert.equal(receipt.ffprobeProcessCounts.adapterPacketIndexScanProcessCount, 0);
    assert.equal(receipt.ffprobeProcessCounts.adapterConstructionVersionProbeProcessCount, 0);
    assert.equal(receipt.sourceByteAudit.sourceIntegrityMode, "RUN_SCOPED_ATTESTATION_STAT_RECHECK");
    assert.equal(receipt.sourceByteAudit.adapterFullFileSha256Passes, 0);
    assert.equal(receipt.sourceByteAudit.adapterBytesHashed, 0);
    assert.equal(receipt.sourceByteAudit.schedulerSourceVideoRevalidation, "OUTSIDE_ADAPTER_NOT_COUNTED");
    childPacketIndexScans += receipt.ffprobeProcessCounts.adapterPacketIndexScanProcessCount;
    const planNode = scheduledWorkflow.nodes.find((item) => item.id === planId);
    const group = sourcePlans.find((item) =>
      item.sourceVideoSha256 === indexNode.result.summary.sourceVideoSha256);
    const batch = group.batchPlan.batches.find((item) => item.sha256 === planNode.result.summary.batchSha256);
    assert.ok(batch);
    const exactFrames = [];
    for (const frame of receipt.frames) {
      const pixelCode = await readPixelCode(path.join(artifactRoot, frame.path));
      assert.equal(pixelCode, frame.sourceFrame, "decoded frame pixel ID must equal its planned source frame");
      exactFrames.push(frame.sourceFrame);
      totalFramePixelChecks += 1;
    }
    assert.deepEqual(exactFrames, batch.assets.map((asset) => asset.sourceFrame));
    extractorResults.push({
      id: claim.id,
      groupId: group.id,
      batchId: batch.id,
      sourceIndexNodeId: indexId,
      sourceIndexArtifactSha256: claim.input.parameters.sourceIndexBinding.artifact.sha256,
      indexSemanticSha256: receipt.sourceKeyframeIndexSha256,
      targetFrames: exactFrames,
      exactPixelOracle: "PASS",
      adapterPacketIndexScans: receipt.ffprobeProcessCounts.adapterPacketIndexScanProcessCount,
      adapterFullFileSha256Passes: receipt.sourceByteAudit.adapterFullFileSha256Passes,
      adapterBytesHashed: receipt.sourceByteAudit.adapterBytesHashed,
      sourceIntegrityMode: receipt.sourceByteAudit.sourceIntegrityMode,
    });
    scheduledWorkflow = finishNodeTask(scheduledWorkflow, claim, result, clockNow + 2);
    tasksExecuted += 1;
    clockNow += 10;
  }
}
assert.equal(tasksExecuted, 6);
assert.equal(maxRunningClaims, 2);
assert.equal(new Set(extractorResults.map((item) => item.sourceIndexNodeId)).size, 3);
assert.equal(totalFramePixelChecks, 195);
assert.equal(childPacketIndexScans, 0, "child extraction tasks reuse the accepted source index");
const indexerAdapterBytesHashed = [...acceptedIndexes.values()].reduce((sum, node) =>
  sum + node.result.summary.sourceByteAudit.adapterBytesHashed, 0);
const extractorAdapterBytesHashed = extractorResults.reduce((sum, node) =>
  sum + node.adapterBytesHashed, 0);
const sourceAcceptanceBytesHashed = sourcePlans.reduce((sum, group) => sum + group.sourceVideoBytes, 0);
const verificationContextSummary = getNodeArtifactVerificationContextSummaryV1(sourceVerificationContext);
const verificationCounters = verificationContextSummary.counters;
const sourceAcceptanceShaPasses = sourceStage.acceptedCount;
const sourceAcceptanceGenericMediaProbes = sourceStage.acceptedCount;
const contextualSourceShaPasses = verificationCounters.sourceVideoShaPassCount;
const contextualGenericMediaProbes = verificationCounters.genericMediaMetadataProbeCount;
const sourceIndexPacketScanCount = [...acceptedIndexes.values()].reduce((sum, node) =>
  sum + node.result.summary.ffprobePacketScanCount, 0);
const totalSourceShaPasses = sourceAcceptanceShaPasses + contextualSourceShaPasses
  + [...acceptedIndexes.values()].reduce((sum, node) => sum + node.result.summary.sourceByteAudit.adapterFullFileSha256Passes, 0)
  + extractorResults.reduce((sum, node) => sum + node.adapterFullFileSha256Passes, 0);
const totalSourceBytesHashed = sourceAcceptanceBytesHashed + verificationCounters.sourceVideoBytesHashed
  + indexerAdapterBytesHashed + extractorAdapterBytesHashed;
const genericMediaProbeCount = sourceAcceptanceGenericMediaProbes + contextualGenericMediaProbes;
const baselineCounters = baselineResult.accounting;
assert.equal(sourceAcceptanceShaPasses, sourcePlans.length);
assert.equal(contextualSourceShaPasses, sourcePlans.length,
  "one full source SHA check per source should warm this execution context");
assert.equal(contextualGenericMediaProbes, sourcePlans.length,
  "one media-header probe per source should warm this execution context");
assert.equal(sourceIndexPacketScanCount, sourcePlans.length);
assert.equal(totalSourceShaPasses, 6,
  "three source acceptance hashes plus one context verification hash per source are expected");
assert.equal(genericMediaProbeCount, 6,
  "three source acceptance probes plus one context verification probe per source are expected");
assert.equal(verificationCounters.cacheHitCount > 0, true, "later batch and extraction dependencies must reuse cached verification");
assert.equal(verificationCounters.inFlightCoalescedWaitCount, 0,
  "this scheduler path primes source entries before fan-out; in-flight coalescing is covered by the focused executor test");
closeNodeArtifactVerificationContextV1(sourceVerificationContext);
const verificationContextFinalSummary = getNodeArtifactVerificationContextSummaryV1(sourceVerificationContext);
assert.equal(verificationContextFinalSummary.acceptedNodeVerificationCacheEntryCount, 0,
  "the run-scoped context must clear its cache after this batch");
assert.equal(verificationContextFinalSummary.closed, true,
  "the run-scoped context must be closed after this batch");
const implementationPaths = [
  "apps/studio-next/src/lib/a1-node-module-execution-v1.mjs",
  "apps/studio-next/src/lib/a1-node-ffmpeg-source-indexer-v1.mjs",
  "apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs",
  "apps/studio-next/src/lib/a1-node-frame-extraction-batch-fanout-v1.mjs",
  "apps/studio-next/src/lib/a1-node-workflow-v1.mjs",
  "scripts/test-node-module-execution-v1.mjs",
  "scripts/test-node-ffmpeg-source-indexer-v1.mjs",
  "scripts/test-node-ffmpeg-frame-extractor-v1.mjs",
  "scripts/test-a1-node-frame-extraction-batch-fanout-v1.mjs",
  "scripts/build-run-scoped-source-verification-reuse-v1.mjs",
  "docs/NODE_WORKFLOW_SOP.md",
];
const implementationBindings = implementationPaths.map((relativePath) => ({
  path: relativePath,
  sha256: sha256(fs.readFileSync(path.join(repoRoot, relativePath))),
}));

const groupColors = ["#d84a32", "#3169b3", "#198d78"];
const imageWidth = 1_520, imageHeight = 760;
const columnX = {source: 80, batch: 565, task: 1_080};
let rowCursorY = 145;
const svgParts = [];
svgParts.push(`<rect width="100%" height="100%" fill="#f8f6f0"/>`);
svgParts.push(`<style>.title{font:700 24px Arial,sans-serif;fill:#17202b}.sub{font:13px Arial,sans-serif;fill:#606975}.head{font:700 11px Arial,sans-serif;fill:#5c636a;letter-spacing:1px}.label{font:700 13px Arial,sans-serif;fill:#202a34}.body{font:11px Arial,sans-serif;fill:#56616c}.foot{font:12px Arial,sans-serif;fill:#606975}</style>`);
svgParts.push(`<text x="24" y="30" class="title">RUN-SCOPED SOURCE VERIFICATION REUSE</text>`);
svgParts.push(`<text x="24" y="58" class="sub">3 synthetic sources · source SHA passes ${baselineCounters.sourceShaBytes.totalFullFileShaPasses}→${totalSourceShaPasses} · media probes ${baselineCounters.ffprobeProcesses.genericMediaHeaderProbeCount}→${genericMediaProbeCount} · ${totalFramePixelChecks} exact PNGs</text>`);
svgParts.push(`<text x="${columnX.source}" y="102" class="head">ACCEPTED VIDEO + RUN CONTEXT</text>`);
svgParts.push(`<text x="${columnX.batch}" y="102" class="head">ACCEPTED FRAME BATCH</text>`);
svgParts.push(`<text x="${columnX.task}" y="102" class="head">SCHEDULED EXTRACTOR</text>`);
for (const [groupIndex, item] of fanoutResults.entries()) {
  const {group, source, sourceIndexNode, result} = item;
  const color = groupColors[groupIndex];
  const top = rowCursorY;
  const tasks = result.shots;
  const subGap = tasks.length > 1 ? 78 : 0;
  const sourceY = top + ((tasks.length - 1) * subGap + 66) / 2 - 33;
  svgParts.push(`<text x="24" y="${top + 3}" class="label">${group.genre}</text>`);
  svgParts.push(`<rect x="${columnX.source}" y="${sourceY}" width="330" height="66" rx="8" fill="#fffdf7" stroke="#d9d5ca"/>`);
  svgParts.push(`<rect x="${columnX.source}" y="${sourceY}" width="6" height="66" fill="${color}"/>`);
  svgParts.push(`<text x="${columnX.source + 18}" y="${sourceY + 25}" class="label">${source.node.id}</text>`);
  svgParts.push(`<text x="${columnX.source + 18}" y="${sourceY + 48}" class="body">1 context SHA · 1 packet scan · ${sourceIndexNode.result.summary.indexSha256.slice(0, 12)}…</text>`);
  tasks.forEach((shot, taskIndex) => {
    const taskY = top + taskIndex * subGap;
    const planDepId = shot.moduleDependencyBindings["ffmpeg-frame-extractor"][1].nodeId;
    const planNode = batchNodesByGroup.get(group.id).find((node) => node.id === planDepId);
    const planSha = planNode.result.summary.batchSha256;
    const batchIndex = taskIndex;
    const batch = group.batchPlan.batches[batchIndex];
    const proof = extractorResults.find((entry) => entry.groupId === group.id && entry.batchId === batch.id);
    svgParts.push(`<line x1="${columnX.source + 330}" y1="${sourceY + 33}" x2="${columnX.batch - 18}" y2="${taskY + 32}" stroke="#8a9297" stroke-width="1.5"/>`);
    svgParts.push(`<line x1="${columnX.batch + 330}" y1="${taskY + 32}" x2="${columnX.task - 18}" y2="${taskY + 32}" stroke="#8a9297" stroke-width="1.5"/>`);
    svgParts.push(`<rect x="${columnX.batch}" y="${taskY}" width="330" height="66" rx="8" fill="#fffdf7" stroke="#d9d5ca"/>`);
    svgParts.push(`<rect x="${columnX.batch}" y="${taskY}" width="6" height="66" fill="${color}"/>`);
    svgParts.push(`<text x="${columnX.batch + 18}" y="${taskY + 25}" class="label">${batch.id} · ${batch.uniqueFrameCount} frames</text>`);
    svgParts.push(`<text x="${columnX.batch + 18}" y="${taskY + 48}" class="body">batch SHA ${planSha.slice(0, 12)}… · JSON_PLAN</text>`);
    svgParts.push(`<rect x="${columnX.task}" y="${taskY}" width="390" height="66" rx="8" fill="#f2f6f4" stroke="#c6d3ce"/>`);
    svgParts.push(`<text x="${columnX.task + 18}" y="${taskY + 25}" class="label">${batch.id} → indexed extractor</text>`);
    svgParts.push(`<text x="${columnX.task + 18}" y="${taskY + 48}" class="body">reuses index · ${proof.targetFrames.length} exact PNGs · 0 packet scans</text>`);
  });
  rowCursorY += (tasks.length - 1) * subGap + 66 + 40;
}
svgParts.push(`<text x="24" y="735" class="foot">Three source verifications are shared across index, batch and child nodes; context closes after the run. Synthetic only; no wall-time gain or production admission is claimed.</text>`);
const graphSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">${svgParts.join("\n")}</svg>`;
const graphBytes = await sharp(Buffer.from(graphSvg, "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(graphPath, graphBytes);

const maxSchedulerClaims = Math.max(sourceStage.maxClaims, indexStage.maxClaims,
  batchStage.maxClaims, maxRunningClaims);
const result = {
  contract: "A1RunScopedSourceVerificationReuseIntegration/v1",
  phaseId: "run-scoped-source-verification-reuse-v1",
  status: "PASS",
  createdAt: new Date().toISOString(),
  implementationBindings,
  runtime: {
    ffmpegPath,
    ffprobePath,
    ffmpegVersion: execFileSync(ffmpegPath, ["-version"], {encoding: "utf8"}).split(/\r?\n/u)[0],
  },
  scheduler: {
    contract: "A1NodeWorkflow/v1",
    sourceNodesAccepted: sourceStage.acceptedCount,
    sourceIndexNodesAccepted: indexStage.acceptedCount,
    batchPlanNodesAccepted: batchStage.acceptedCount,
    extractorTasksExecuted: tasksExecuted,
    externalSourceNodeCount: retainedSourceNodes.length,
    externalSourceIndexNodeCount: retainedIndexNodes.length,
    externalBatchPlanNodeCount: retainedPlanNodes.length,
    maxRunningClaims: maxSchedulerClaims,
    dependencyBlockers: 0,
    defaultRegistryRegistered: false,
  },
  fixtures: fanoutResults.map(({group, source, sourceIndexNode, result: fanout}) => ({
    id: group.id,
    genre: group.genre,
    status: "PASS",
    fps: group.fps,
    gopFrames: group.gop,
    totalFrames: group.totalFrames,
    sourceVideoSha256: group.sourceVideoSha256,
    sourceVideoBytes: group.sourceVideoBytes,
    sourceNodeId: source.node.id,
    sourceIndexNodeId: sourceIndexNode.id,
    sourceIndexArtifactSha256: sourceIndexNode.result.summary.indexArtifactSha256,
    sourceIndexSemanticSha256: sourceIndexNode.result.summary.indexSha256,
    packetIndexScans: sourceIndexNode.result.summary.ffprobePacketScanCount,
    batchPlanSha256: group.batchPlan.sha256,
    batchCount: fanout.taskCount,
    uniqueTargetFrames: group.batchPlan.summary.uniqueSourceFrameCount,
    exactOutputFrameCount: extractorResults.filter((item) => item.groupId === group.id)
      .reduce((sum, item) => sum + item.targetFrames.length, 0),
    exactPixelOracle: "PASS",
  })),
  tasks: extractorResults,
  accounting: {
    ffprobeProcesses: {
      packetIndexScanCount: sourceIndexPacketScanCount,
      packetIndexScansPerSource: sourceIndexPacketScanCount / sourcePlans.length,
      childPacketIndexScanCount: childPacketIndexScans,
      genericMediaHeaderProbeCount: genericMediaProbeCount,
      sourceAcceptanceProbeCount: sourceAcceptanceGenericMediaProbes,
      runScopedContextProbeCount: contextualGenericMediaProbes,
      trustedToolVersionProbeCount: verificationCounters.toolVersionProbeProcessCount,
      byWorkflowStage: {sourceArtifactAcceptance: sourceAcceptanceGenericMediaProbes,
        sharedRunContext: contextualGenericMediaProbes, indexerPacketIndexScans: sourceIndexPacketScanCount,
        batchAndExtractorCacheHits: verificationCounters.cacheHitCount},
    },
    sourceShaBytes: {
      initialAcceptedVideoManifestBytes: sourceAcceptanceBytesHashed,
      runScopedContextBytes: verificationCounters.sourceVideoBytesHashed,
      indexerAdapterBytes: indexerAdapterBytesHashed,
      extractorAdapterBytes: extractorAdapterBytesHashed,
      totalBytesHashed: totalSourceBytesHashed,
      totalFullFileShaPasses: totalSourceShaPasses,
      allAcceptedArtifactShaPassesInsideContext: verificationCounters.fullArtifactShaPassCount,
      allAcceptedArtifactBytesHashedInsideContext: verificationCounters.fullArtifactBytesHashed,
      decoderWorkIsReportedSeparately: true,
    },
    runScopedVerificationContext: {
      preCloseSnapshot: verificationContextSummary,
      finalState: {
        closed: verificationContextFinalSummary.closed,
        acceptedNodeVerificationCacheEntryCount: verificationContextFinalSummary.acceptedNodeVerificationCacheEntryCount,
        inFlightVerificationCount: verificationContextFinalSummary.inFlightVerificationCount,
      },
    },
    priorBaseline: {artifact: pathRelative(baselineResultPath),
      genericMediaHeaderProbeCount: baselineCounters.ffprobeProcesses.genericMediaHeaderProbeCount,
      sourceFullFileShaPassCount: baselineCounters.sourceShaBytes.totalFullFileShaPasses,
      sourceFullFileBytesHashed: baselineCounters.sourceShaBytes.totalBytesHashed},
  },
  summary: {
    genreCount: 3,
    sourceVideoCount: 3,
    sourceIndexCount: 3,
    sourceIndexNodesReusedAcrossBatches: true,
    packetIndexScanCount: 3,
    childPacketIndexScanCount: 0,
    batchPlanCount: 6,
    extractorTaskCount: 6,
    targetFrameCount: totalFramePixelChecks,
    exactPixelOraclePass: true,
    schedulerConcurrencyCap: 2,
    observedMaxSchedulerClaims: maxSchedulerClaims,
    genericMediaHeaderProbeCount: genericMediaProbeCount,
    sourceFullFileShaPassCount: totalSourceShaPasses,
    sourceFullFileBytesHashed: totalSourceBytesHashed,
    sourceVerificationContextCacheHits: verificationCounters.cacheHitCount,
    sourceVerificationContextCoalescedWaits: verificationCounters.inFlightCoalescedWaitCount,
    sourceVerificationContextClosed: verificationContextFinalSummary.closed
      && verificationContextFinalSummary.acceptedNodeVerificationCacheEntryCount === 0,
    defaultRegistryChanged: false,
    formalAuthorityModified: false,
  },
  visibleArtifact: {
    path: pathRelative(graphPath),
    sha256: sha256(graphBytes),
    bytes: graphBytes.length,
    width: imageWidth,
    height: imageHeight,
  },
  proofBoundary: {
    syntheticVideosGenerated: 3,
    syntheticSourceFramesDecoded: true,
    syntheticFramesExtracted: totalFramePixelChecks,
    userVideoBytesRead: 0,
    sourceVideosHashVerified: true,
    adapterWindowingUsedAcceptedSourceIndex: true,
    visualApproval: "NOT_GRANTED",
    productionAdmission: false,
    defaultRegistryRegistered: false,
    formalAuthorityModified: false,
  },
  independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
};
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({
  status: result.status,
  resultPath: pathRelative(resultPath),
  summary: result.summary,
  accounting: result.accounting,
  visibleArtifact: result.visibleArtifact,
}, null, 2));
