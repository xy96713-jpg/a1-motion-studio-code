#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {
  compileNodeWorkflow, claimNodeTasks, finishNodeTask, nodeDependencyBlockers, nodeInputHash,
  NODE_WORKFLOW_CONTRACT,
} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {
  createNodeAdapterRegistry, createNodeArtifactVerificationContextV1,
  closeNodeArtifactVerificationContextV1, getNodeArtifactVerificationContextSummaryV1,
  executeRegisteredNode,
} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts, NODE_ARTIFACT_MANIFEST_CONTRACT} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {buildNodeFrameExtractionBatchFanoutV1} from "../apps/studio-next/src/lib/a1-node-frame-extraction-batch-fanout-v1.mjs";
import {planReferenceFrameExtractionBatchesV1} from "../apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs";
import {
  A1_CONTENT_AWARE_FRAME_REVIEW_BUDGET_V1, A1_REFERENCE_FRAME_REVIEW_POLICY_V1,
  A1_SOURCE_BOUND_FRAME_SIGNALS_V1, CONTENT_AWARE_SYNTHETIC_CONFIDENCE_THRESHOLD_V1,
  compileReferenceFrameReviewPlanV1, planContentAwareFrameReviewBudgetV1,
} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1} from "../apps/studio-next/src/lib/a1-node-frame-review-plan-adapter-v1.mjs";
import {
  createNodeFfmpegSourceIndexerAdapterV1,
  A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1,
} from "../apps/studio-next/src/lib/a1-node-ffmpeg-source-indexer-v1.mjs";
import {
  createNodeFfmpegFrameExtractorAdapterV1,
  A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1,
} from "../apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executionStartedAt = Date.now();
const taskRoot = path.join(repoRoot, "work/content-aware-frame-review-budget-v1");
const runId = Date.now().toString(36) + "-" + process.pid;
const sourceRoot = path.join(taskRoot, "sources", runId);
const artifactRoot = path.join(taskRoot, "artifacts", runId);
const baselineProofPath = path.join(repoRoot, "work/event-driven-frame-review-v1/result.json");
const resultPath = path.join(taskRoot, "result.json");
const boardPath = path.join(taskRoot, "frame-budget-contact-sheet.png");
const ffmpegPath = "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = "/Users/a1/.local/bin/ffprobe";
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const pathRelative = (value) => path.relative(repoRoot, value).split(path.sep).join("/");
const fileRecord = (root, filename, role, kind, {jsonContract, expectedMedia} = {}) => {
  const bytes = fs.readFileSync(filename);
  return {path: path.relative(root, filename).split(path.sep).join("/"), role, kind,
    ...(jsonContract ? {jsonContract} : {}), ...(expectedMedia ? {expectedMedia} : {}),
    sha256: sha256(bytes), bytes: bytes.length};
};
const readPixelCode = async (filename) => {
  const {data} = await sharp(filename).removeAlpha().raw().toBuffer({resolveWithObject: true});
  assert.ok(data.length >= 3, "extracted PNG must have an RGB pixel");
  return data[0] + data[1] * 256 + data[2] * 65_536;
};

const sourceManifestContract = "A1FrameReviewSourceManifest/v1";
const sourceModuleSha256 = sha256(Buffer.from("synthetic-review-only-source-fixture-adapter-v1", "utf8"));
const planModuleSha256 = sha256(Buffer.from("synthetic-content-aware-frame-plan-adapter-v1", "utf8"));
const projectId = "content-aware-frame-review-budget-v1";
const workspaceSha256 = sha256(Buffer.from("synthetic-content-aware-frame-review-workspace-v1", "utf8"));
const context = {articleTitle: "synthetic cross-genre frame review", articleSha256: sha256(Buffer.from("frame-budget-fixture", "utf8"))};

const fixtureDefinitions = [
  {
    id: "budget-explainer-hold-cut-v1", genre: "evidence-explainer", fps: 25, gop: 50, totalFrames: 200,
    sequences: [
      {sequenceId: "hold-before", startFrame: 0, endFrameExclusive: 50, kind: "stable-hold", requiredRoles: ["HOLD"], events: [{role: "HOLD", sourceFrame: 25}]},
      {sequenceId: "short-pulse", startFrame: 50, endFrameExclusive: 100, kind: "motion", signalKind: "pulse", requiredRoles: ["ENTER", "PEAK", "EXIT"], events: [
        {role: "ENTER", sourceFrame: 51}, {role: "PEAK", sourceFrame: 54}, {role: "EXIT", sourceFrame: 58},
      ]},
      {sequenceId: "hold-after", startFrame: 100, endFrameExclusive: 200, kind: "stable-hold", requiredRoles: ["HOLD"], events: [{role: "HOLD", sourceFrame: 150}]},
    ],
    cuts: [{id: "cut-100", beforeSequenceId: "short-pulse", afterSequenceId: "hold-after", cutFrame: 100}],
  },
  {
    id: "budget-tutorial-pulse-plateau-v1", genre: "product-tutorial", fps: 30, gop: 60, totalFrames: 240,
    sequences: [
      {sequenceId: "tutorial-hold", startFrame: 0, endFrameExclusive: 60, kind: "stable-hold", requiredRoles: ["HOLD"], events: [{role: "HOLD", sourceFrame: 30}]},
      {sequenceId: "click-pulse", startFrame: 60, endFrameExclusive: 120, kind: "motion", signalKind: "pulse", requiredRoles: ["ENTER", "PEAK", "EXIT"], events: [
        {role: "ENTER", sourceFrame: 61}, {role: "PEAK", sourceFrame: 64}, {role: "EXIT", sourceFrame: 68},
      ]},
      {sequenceId: "result-plateau", startFrame: 120, endFrameExclusive: 180, kind: "motion", signalKind: "plateau", requiredRoles: ["ENTER", "PLATEAU", "EXIT"], events: [
        {role: "ENTER", sourceFrame: 121}, {role: "PLATEAU", sourceFrame: 150}, {role: "EXIT", sourceFrame: 179},
      ]},
      {sequenceId: "result-hold", startFrame: 180, endFrameExclusive: 240, kind: "stable-hold", requiredRoles: ["HOLD"], events: [{role: "HOLD", sourceFrame: 210}]},
    ],
    cuts: [
      {id: "cut-120", beforeSequenceId: "click-pulse", afterSequenceId: "result-plateau", cutFrame: 120},
      {id: "cut-180", beforeSequenceId: "result-plateau", afterSequenceId: "result-hold", cutFrame: 180},
    ],
  },
  {
    id: "budget-opinion-motion-adjacent-cuts-v1", genre: "personal-opinion", fps: 60, gop: 120, totalFrames: 480,
    sequences: [
      {sequenceId: "opinion-before", startFrame: 0, endFrameExclusive: 200, kind: "stable-hold", requiredRoles: ["HOLD"], events: [{role: "HOLD", sourceFrame: 60}]},
      {sequenceId: "cut-bridge", startFrame: 200, endFrameExclusive: 201, kind: "stable-hold", requiredRoles: ["HOLD"], events: [{role: "HOLD", sourceFrame: 200}]},
      {sequenceId: "gesture-after-cuts", startFrame: 201, endFrameExclusive: 350, kind: "motion", signalKind: "motion", requiredRoles: ["ENTER", "PEAK", "EXIT"], events: [
        {role: "ENTER", sourceFrame: 201}, {role: "PEAK", sourceFrame: 275}, {role: "EXIT", sourceFrame: 349},
      ]},
      {sequenceId: "opinion-settle", startFrame: 350, endFrameExclusive: 480, kind: "stable-hold", requiredRoles: ["HOLD"], events: [{role: "HOLD", sourceFrame: 400}]},
    ],
    cuts: [
      {id: "adjacent-cut-a", beforeSequenceId: "opinion-before", afterSequenceId: "cut-bridge", cutFrame: 200},
      {id: "adjacent-cut-b", beforeSequenceId: "cut-bridge", afterSequenceId: "gesture-after-cuts", cutFrame: 201},
    ],
  },
].map((group) => ({...group, durationSeconds: group.totalFrames / group.fps}));

fs.mkdirSync(sourceRoot, {recursive: true});
fs.mkdirSync(artifactRoot, {recursive: true});
const baselineProof = JSON.parse(fs.readFileSync(baselineProofPath, "utf8"));
assert.equal(baselineProof.status, "PASS");
assert.equal(baselineProof.summary.extractedImages, 0,
  "the prior event-driven sample is plan-only and remains the explicit baseline");
assert.equal(baselineProof.summary.humanImageReviews, 0);

async function generateSyntheticVideo(group) {
  const directory = path.join(sourceRoot, group.id);
  fs.mkdirSync(directory, {recursive: true});
  const filename = path.join(directory, "media", "synthetic-source.mp4");
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  const lavfi = `color=c=black:s=64x64:r=${group.fps}:d=${group.durationSeconds}`
    + ",format=rgb24,geq=r='mod(N,256)':g='mod(floor(N/256),256)':b='mod(floor(N/65536),256)'";
  await execFileAsync(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", lavfi, "-frames:v", String(group.totalFrames), "-an", "-sn", "-dn",
    "-c:v", "libx264rgb", "-crf", "0", "-preset", "ultrafast", "-bf", "0",
    "-g", String(group.gop), "-keyint_min", String(group.gop), "-sc_threshold", "0",
    "-pix_fmt", "rgb24", "-fps_mode", "cfr", "-video_track_timescale", "90000", "-threads", "1", "-y", filename],
  {encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024});
  const bytes = fs.readFileSync(filename);
  return {directory, filename, bytes, sha256: sha256(bytes), bytesLength: bytes.length};
}

function artifactDependency(node) {
  return {state: "succeeded", nodeId: node.id, inputSha256: node.inputSha256,
    manifestSha256: node.acceptance.manifestSha256,
    artifacts: node.acceptance.artifacts.map((artifact) => ({...artifact,
      absolutePath: path.join(node.acceptance.artifactRoot, artifact.path)}))};
}

async function acceptStandaloneArtifact({nodeId, module, input, inputSha256: boundInputSha256, resultSummary,
  artifacts, artifactRoot: root, reviewerId}) {
  const inputSha256 = boundInputSha256 || nodeInputHash({input, dependencies: {inputs: [], artifactKinds: {}}});
  const node = {id: nodeId, shotId: module, module, input, inputSha256, dependencies: [],
    dependencyArtifactKinds: {}, state: "needs-review", reason: null, attempt: 1, maxAttempts: 2,
    result: {state: "needs-review", reason: "SYNTHETIC_REVIEW_ARTIFACT_REQUIRES_TECHNICAL_ACCEPTANCE",
      productionAdmission: false, summary: resultSummary,
      artifactManifest: {contract: "A1NodeArtifactManifest/v1", nodeId, inputSha256,
        productionAdmission: false, artifacts}}, acceptance: null};
  const workflow = {contract: NODE_WORKFLOW_CONTRACT, projectId, workspaceSha256, scope: "REVIEW_ONLY",
    productionAdmission: false, modules: {}, nodes: [node]};
  const accepted = await acceptNodeArtifacts(workflow, nodeId, {artifactRoot: root, reviewerId,
    ffprobePath, now: 1_000_000});
  const acceptedNode = accepted.nodes.find((item) => item.id === nodeId);
  assert.equal(acceptedNode?.state, "succeeded");
  assert.equal(acceptedNode.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(acceptedNode.acceptance.productionAdmission, false);
  return acceptedNode;
}

async function acceptSource(group, media) {
  const videoRelative = "media/synthetic-source.mp4";
  const manifestRelative = "metadata/frame-source-manifest.json";
  const videoPath = path.join(media.directory, videoRelative);
  const manifestPath = path.join(media.directory, manifestRelative);
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  const manifestBytes = Buffer.from(`${JSON.stringify({contract: sourceManifestContract,
    sourceVideoSha256: media.sha256, fps: group.fps, totalFrames: group.totalFrames}, null, 2)}\n`, "utf8");
  fs.writeFileSync(manifestPath, manifestBytes, {flag: "wx", mode: 0o600});
  const nodeId = `source-${group.id}`;
  const input = {fixture: "synthetic-source", sourceVideoSha256: media.sha256,
    fps: group.fps, totalFrames: group.totalFrames};
  const inputSha256 = nodeInputHash({input, dependencies: {inputs: [], artifactKinds: {}}});
  const result = {state: "needs-review", reason: "SYNTHETIC_SOURCE_REQUIRES_TECHNICAL_ACCEPTANCE",
    productionAdmission: false, summary: {sourceVideoSha256: media.sha256, fps: group.fps,
      totalFrames: group.totalFrames, durationSeconds: group.durationSeconds},
    artifactManifest: {contract: "A1NodeArtifactManifest/v1", nodeId, inputSha256,
      productionAdmission: false, artifacts: [
        fileRecord(media.directory, videoPath, "source-video", "VIDEO", {expectedMedia: {
          width: 64, height: 64, fps: group.fps, durationSeconds: group.durationSeconds,
        }}),
        fileRecord(media.directory, manifestPath, "frame-review-source-manifest", "JSON_PLAN",
          {jsonContract: sourceManifestContract}),
      ]}};
  const node = {id: nodeId, shotId: group.id, module: "fixture-source", input, inputSha256,
    dependencies: [], dependencyArtifactKinds: {}, state: "needs-review", reason: result.reason,
    attempt: 1, maxAttempts: 2, result, acceptance: null};
  const accepted = await acceptNodeArtifacts({contract: NODE_WORKFLOW_CONTRACT, projectId, workspaceSha256,
    scope: "REVIEW_ONLY", productionAdmission: false, modules: {}, nodes: [node]}, nodeId,
  {artifactRoot: media.directory, reviewerId: "synthetic-source-technical-acceptance", ffprobePath, now: 1_000_010});
  const sourceNode = accepted.nodes.find((item) => item.id === nodeId);
  const video = sourceNode.acceptance.artifacts.find((artifact) => artifact.role === "source-video" && artifact.kind === "VIDEO");
  const manifest = sourceNode.acceptance.artifacts.find((artifact) => artifact.role === "frame-review-source-manifest"
    && artifact.kind === "JSON_PLAN" && artifact.metadata?.jsonContract === sourceManifestContract);
  assert.equal(video.sha256, media.sha256);
  assert.ok(manifest);
  return {sourceNode, media, video, manifest,
    videoBinding: {dependencyId: sourceNode.id, acceptedManifestSha256: sourceNode.acceptance.manifestSha256,
      artifact: {path: video.path, sha256: video.sha256, bytes: video.bytes}},
    manifestBinding: {dependencyId: sourceNode.id, acceptedManifestSha256: sourceNode.acceptance.manifestSha256,
      artifact: {path: manifest.path, sha256: manifest.sha256, bytes: manifest.bytes}}};
}

function signalSetFor(group, sourceVideoSha256) {
  return {contract: A1_SOURCE_BOUND_FRAME_SIGNALS_V1, sourceVideoSha256, fps: group.fps,
    totalFrames: group.totalFrames, coverage: {startFrame: 0, endFrameExclusive: group.totalFrames},
    complete: true, confidence: 0.98, hardCutsComplete: true,
    sequences: group.sequences.map((sequence) => ({sequenceId: sequence.sequenceId, sourceVideoSha256,
      kind: sequence.kind === "stable-hold" ? "stable-hold" : sequence.signalKind,
      complete: true, confidence: 0.98,
      events: sequence.events.map((event) => ({...event, confidence: 0.98}))})),
    hardCuts: group.cuts.map((cut) => ({...cut, sourceVideoSha256, confirmed: true, confidence: 0.98}))};
}

function makeFixed5FpsPlan(group, sourceVideoSha256) {
  const step = group.fps / 5;
  assert.equal(Number.isInteger(step), true, "synthetic frame rates must support an exact 5fps frame grid");
  const sequences = [];
  for (let frame = 0, ordinal = 0; frame < group.totalFrames; frame += step, ordinal += 1) {
    sequences.push({sequenceId: `fixed5-${String(ordinal).padStart(3, "0")}`,
      startFrame: frame, endFrameExclusive: Math.min(group.totalFrames, frame + step),
      mode: "stable-hold", representativeFrame: frame});
  }
  return compileReferenceFrameReviewPlanV1({sourceVideoSha256, fps: group.fps,
    totalFrames: group.totalFrames, sequences});
}

function planOutputNode({group, source, strategy, plan}) {
  const batchPlan = planReferenceFrameExtractionBatchesV1({plan});
  assert.equal(batchPlan.summary.batchCount, 1, `${group.id}/${strategy} must stay within one extractor batch`);
  const batch = batchPlan.batches[0];
  const nodeId = `plan-${group.id}-${strategy}`;
  const input = {sourceVideoSha256: source.media.sha256, planSha256: plan.sha256,
    strategy, batchPlanSha256: batchPlan.sha256};
  const inputSha256 = nodeInputHash({input, dependencies: {inputs: [
    {id: source.sourceNode.id, inputSha256: source.sourceNode.inputSha256,
      acceptedManifestSha256: source.sourceNode.acceptance.manifestSha256},
  ], artifactKinds: {[source.sourceNode.id]: ["JSON_PLAN"]}}});
  const planOutput = {
    contract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
    nodeId,
    inputSha256,
    sourceManifestBinding: structuredClone(source.manifestBinding),
    source: {sourceVideoSha256: source.media.sha256, fps: group.fps, totalFrames: group.totalFrames},
    plan,
    proofBoundary: {acceptedSourceManifestBytesReverified: true, sourceVideoRead: false,
      sourceVideoDecoded: false, frameExtractionPerformed: false, extractedImages: 0,
      visualApproval: false, productionAdmission: false},
  };
  const planRoot = path.join(taskRoot, "plans", runId, group.id, strategy);
  const planPath = path.join(planRoot, "frame-review-plan.json");
  fs.mkdirSync(planRoot, {recursive: true});
  fs.writeFileSync(planPath, `${JSON.stringify(planOutput, null, 2)}\n`, {flag: "wx", mode: 0o600});
  const node = {
    contract: "A1NodeFrameReviewPlanOutput/v1", nodeId, inputSha256,
    sourceManifestBinding: source.manifestBinding,
    source: planOutput.source,
    plan,
    proofBoundary: planOutput.proofBoundary,
  };
  return {batchPlan, batch, nodeId, planOutput, planPath, planRoot, nodeInput: input,
    inputSha256, sourcePlanSha256: plan.sha256};
}

async function acceptPlanOutput(group, source, planInfo) {
  const accepted = await acceptStandaloneArtifact({nodeId: planInfo.nodeId, module: "fixture-frame-plan",
    input: planInfo.nodeInput, inputSha256: planInfo.inputSha256,
    resultSummary: {batchId: planInfo.batch.id, batchSha256: planInfo.batch.sha256,
      sourcePlanSha256: planInfo.batchPlan.sourcePlanSha256, sourceVideoSha256: source.media.sha256,
      uniqueFrameCount: planInfo.batch.uniqueFrameCount, referenceCount: planInfo.batch.referenceCount,
      visualApproval: "NOT_GRANTED", productionAdmission: false},
    artifacts: [fileRecord(planInfo.planRoot, planInfo.planPath, "frame-review-plan", "JSON_PLAN",
      {jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1})],
    artifactRoot: planInfo.planRoot, reviewerId: "synthetic-frame-plan-technical-acceptance"});
  return accepted;
}

function moduleFlags(active) {
  return {material: false, typography: false, recording: false, diagram: false,
    [A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: active === A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1,
    [A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1]: active === A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1};
}

async function runAcceptedStage(input, previous, moduleName, {registry, verificationContext, artifactRoot: outputRoot,
  reviewerId, ffprobePath: verifierPath, workerId} = {}) {
  let workflow = compileNodeWorkflow(input, previous, {moduleDefinitions: registry.definitions});
  let clockNow = 900_000, acceptedCount = 0, maxClaims = 0;
  while (workflow.nodes.some((node) => node.module === moduleName
    && ["queued", "running", "needs-review"].includes(node.state))) {
    workflow = compileNodeWorkflow(input, workflow, {moduleDefinitions: registry.definitions});
    const claimed = claimNodeTasks(workflow, {workerId, now: clockNow});
    if (!claimed.claims.length) {
      const stuck = workflow.nodes.filter((node) => node.module === moduleName
        && !["succeeded", "skipped"].includes(node.state));
      assert.deepEqual(stuck.map((node) => [node.id, node.state, node.reason]), [], `${moduleName} must not stall`);
      break;
    }
    assert.ok(claimed.claims.length <= 2);
    assert.ok(claimed.claims.every((claim) => claim.module === moduleName));
    maxClaims = Math.max(maxClaims, claimed.claims.length);
    workflow = claimed.workflow;
    const results = await Promise.all(claimed.claims.map((claim) => executeRegisteredNode(workflow, claim, {
      registry: registry.registry, artifactRoot: outputRoot, ffprobePath: verifierPath,
      verificationContext, now: clockNow + 1,
    })));
    for (let index = 0; index < claimed.claims.length; index += 1) {
      const claim = claimed.claims[index];
      const result = results[index];
      assert.equal(result.state, "needs-review", `${claim.id}: ${result.reason || "unexpected scheduler result"}`);
      assert.equal(result.productionAdmission, false);
      workflow = finishNodeTask(workflow, claim, result, clockNow + 2);
      workflow = await acceptNodeArtifacts(workflow, claim.id, {artifactRoot: outputRoot,
        reviewerId, ffprobePath: verifierPath, now: clockNow + 3});
      const accepted = workflow.nodes.find((node) => node.id === claim.id);
      assert.equal(accepted?.state, "succeeded");
      assert.equal(accepted.acceptance.visualApproval, "NOT_GRANTED");
      assert.equal(accepted.acceptance.productionAdmission, false);
      acceptedCount += 1;
      clockNow += 10;
    }
  }
  return {workflow, acceptedCount, maxClaims};
}

function mergeAcceptedNodes(nodes) {
  const byId = new Map();
  for (const node of nodes) {
    const previous = byId.get(node.id);
    if (previous) {
      assert.equal(previous.inputSha256, node.inputSha256, `accepted dependency input changed: ${node.id}`);
      assert.equal(previous.acceptance?.manifestSha256, node.acceptance?.manifestSha256,
        `accepted dependency receipt changed: ${node.id}`);
    } else byId.set(node.id, node);
  }
  return [...byId.values()];
}

const indexerAdapter = createNodeFfmpegSourceIndexerAdapterV1({ffprobePath});
const extractorAdapter = createNodeFfmpegFrameExtractorAdapterV1({ffmpegPath,
  extractionStrategy: "windowed-review-only"});
const registry = createNodeAdapterRegistry({
  [A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: indexerAdapter,
  [A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1]: extractorAdapter,
});
const sourceVerificationContext = createNodeArtifactVerificationContextV1({ffprobePath});
assert.equal(sourceVerificationContext.enabled, true,
  "the synthetic indexed extractor proof needs a trusted direct FFprobe binary");
assert.equal(createNodeAdapterRegistry().registry[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1], undefined,
  "source indexer must remain absent from the default registry");
assert.equal(createNodeAdapterRegistry().registry[A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1], undefined,
  "review-only extractor must remain absent from the default registry");

const sourceRecords = [];
const sourceGenerationStartedAt = Date.now();
for (const definition of fixtureDefinitions) {
  const media = await generateSyntheticVideo(definition);
  const source = await acceptSource(definition, media);
  sourceRecords.push({group: definition, ...source});
}
const sourceGenerationElapsedMs = Date.now() - sourceGenerationStartedAt;

const sourceWorkflow = {contract: NODE_WORKFLOW_CONTRACT, projectId, workspaceSha256,
  scope: "REVIEW_ONLY", productionAdmission: false, modules: registry.definitions,
  nodes: sourceRecords.map((record) => record.sourceNode)};
const indexShots = sourceRecords.map((record) => ({
  id: `index-${record.group.id}`,
  source: `Index synthetic ${record.group.genre} source video`,
  modules: moduleFlags(A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1),
  moduleDependencyBindings: {[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: [
    {nodeId: record.sourceNode.id, artifactKinds: ["VIDEO"]},
  ]},
  moduleInputs: {[A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1]: {
    sourceVideoBinding: structuredClone(record.videoBinding),
  }},
}));
const indexingStartedAt = Date.now();
const indexStage = await runAcceptedStage({projectId, workspaceSha256, context, shots: indexShots}, sourceWorkflow,
  A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1, {registry, verificationContext: sourceVerificationContext,
    artifactRoot, reviewerId: "synthetic-source-index-technical-acceptance", ffprobePath,
    workerId: "content-aware-index-worker"});
assert.equal(indexStage.acceptedCount, fixtureDefinitions.length);
const indexingElapsedMs = Date.now() - indexingStartedAt;
const indexRecords = sourceRecords.map((record) => {
  const node = indexStage.workflow.nodes.find((item) => item.module === A1_NODE_FFMPEG_SOURCE_INDEXER_MODULE_ID_V1
    && item.result?.summary?.sourceVideoSha256 === record.media.sha256);
  assert.equal(node?.state, "succeeded");
  assert.equal(node.result.summary.sourceVideoManifestSha256, record.sourceNode.acceptance.manifestSha256);
  assert.equal(node.result.summary.ffprobePacketScanCount, 1);
  return {...record, indexNode: node};
});

const planRecords = [];
const planningStartedAt = Date.now();
for (const record of indexRecords) {
  const {group, media} = record;
  const signals = signalSetFor(group, media.sha256);
  const contentAware = planContentAwareFrameReviewBudgetV1({sourceVideoSha256: media.sha256,
    fps: group.fps, totalFrames: group.totalFrames,
    sequences: group.sequences.map(({sequenceId, startFrame, endFrameExclusive, kind, requiredRoles}) =>
      ({sequenceId, startFrame, endFrameExclusive, kind, requiredRoles})),
    signals});
  assert.equal(contentAware.status, "SIGNAL_AWARE_PLAN_READY", `${group.id} signal plan must be eligible for a reduced budget`);
  assert.equal(contentAware.summary.reviewRequired, false);
  assert.equal(contentAware.summary.missedBoundaryFreeClaim, false);
  assert.equal(contentAware.summary.visualApproval, false);
  assert.equal(contentAware.summary.productionAdmission, false);
  assert.equal(contentAware.summary.realDetectorCalibration, "NOT_ESTABLISHED");
  assert.equal(contentAware.summary.signalCompleteness, "DECLARED_BY_INPUT_NOT_INDEPENDENTLY_VERIFIED");
  const baselinePlan = makeFixed5FpsPlan(group, media.sha256);
  const contentPlanInfo = planOutputNode({group, source: record, strategy: "signal-aware", plan: contentAware.plan});
  const baselinePlanInfo = planOutputNode({group, source: record, strategy: "fixed-5fps", plan: baselinePlan});
  const contentPlanNode = await acceptPlanOutput(group, record, contentPlanInfo);
  const baselinePlanNode = await acceptPlanOutput(group, record, baselinePlanInfo);
  const contentBatch = contentPlanInfo.batchPlan;
  const baselineBatch = baselinePlanInfo.batchPlan;
  assert.equal(contentBatch.summary.uniqueSourceFrameCount, contentAware.plan.summary.uniqueSourceFrames);
  assert.equal(baselineBatch.summary.uniqueSourceFrameCount, baselinePlan.summary.uniqueSourceFrames);
  assert.ok(contentBatch.summary.uniqueSourceFrameCount < baselineBatch.summary.uniqueSourceFrameCount,
    `${group.id} content-aware plan must select fewer unique source frames than fixed 5fps`);
  const contentFanout = buildNodeFrameExtractionBatchFanoutV1({batchPlan: contentBatch,
    sourceNodes: [record.sourceNode], batchPlanNodes: [contentPlanNode], sourceIndexNodes: [record.indexNode]});
  const baselineFanout = buildNodeFrameExtractionBatchFanoutV1({batchPlan: baselineBatch,
    sourceNodes: [record.sourceNode], batchPlanNodes: [baselinePlanNode], sourceIndexNodes: [record.indexNode]});
  assert.equal(contentFanout.taskCount, 1);
  assert.equal(baselineFanout.taskCount, 1);
  planRecords.push({...record, signals, contentAware, baselinePlan, contentPlanNode, baselinePlanNode,
    contentBatch, baselineBatch,
    contentShot: contentFanout.shots[0], baselineShot: baselineFanout.shots[0],
    contentPlanInfo, baselinePlanInfo});
}
const planningElapsedMs = Date.now() - planningStartedAt;

const allShots = planRecords.flatMap(({contentShot, baselineShot}) => [baselineShot, contentShot]);
assert.equal(allShots.length, fixtureDefinitions.length * 2);
const upstreamNodes = mergeAcceptedNodes([
  ...sourceRecords.map((record) => record.sourceNode),
  ...indexRecords.map((record) => record.indexNode),
  ...planRecords.flatMap((record) => [record.baselinePlanNode, record.contentPlanNode]),
]);
const upstreamWorkflow = {contract: NODE_WORKFLOW_CONTRACT, projectId, workspaceSha256,
  scope: "REVIEW_ONLY", productionAdmission: false, modules: registry.definitions, nodes: upstreamNodes};
const extractionStartedAt = Date.now();
const extractionStage = await runAcceptedStage({projectId, workspaceSha256, context, shots: allShots}, upstreamWorkflow,
  A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1, {registry, verificationContext: sourceVerificationContext,
    artifactRoot, reviewerId: "synthetic-frame-extraction-technical-acceptance", ffprobePath,
    workerId: "content-aware-extraction-worker"});
assert.equal(extractionStage.acceptedCount, allShots.length);
assert.equal(extractionStage.maxClaims, 2);
const extractionElapsedMs = Date.now() - extractionStartedAt;

const outputsByPlanNodeId = new Map();
for (const record of planRecords) {
  outputsByPlanNodeId.set(record.contentPlanNode.id, {record, strategy: "signal-aware", images: []});
  outputsByPlanNodeId.set(record.baselinePlanNode.id, {record, strategy: "fixed-5fps", images: []});
}
const extractorNodes = extractionStage.workflow.nodes.filter((node) => node.module === A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1);
assert.equal(extractorNodes.length, allShots.length);
let exactPixelChecks = 0;
for (const node of extractorNodes) {
  assert.equal(node.state, "succeeded");
  assert.equal(node.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(node.acceptance.productionAdmission, false);
  const planDependencyId = node.dependencies[1];
  const outputGroup = outputsByPlanNodeId.get(planDependencyId);
  assert.ok(outputGroup, `extractor plan dependency must map to one deterministic strategy: ${planDependencyId}`);
  const receiptArtifact = node.acceptance.artifacts.find((artifact) => artifact.role === "frame-extraction-receipt"
    && artifact.kind === "JSON_PLAN");
  assert.ok(receiptArtifact);
  const receiptPath = path.join(node.acceptance.artifactRoot, receiptArtifact.path);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const group = outputGroup.record.group;
  const expectedPlan = outputGroup.strategy === "signal-aware" ? outputGroup.record.contentAware.plan : outputGroup.record.baselinePlan;
  assert.equal(receipt.framePlanPolicySha256, expectedPlan.sha256);
  assert.equal(receipt.frames.length, expectedPlan.summary.uniqueSourceFrames);
  assert.equal(receipt.ffprobeProcessCounts.adapterPacketIndexScanProcessCount, 0,
    "accepted source indexes must eliminate per-child packet-index scans");
  for (const frame of receipt.frames) {
    const filename = path.join(node.acceptance.artifactRoot, frame.path);
    const observedCode = await readPixelCode(filename);
    assert.equal(observedCode, frame.sourceFrame,
      `${group.id}/${outputGroup.strategy}: extracted PNG must encode its exact source frame`);
    exactPixelChecks += 1;
    outputGroup.images.push({sourceFrame: frame.sourceFrame, path: filename, roles: frame.references.map((reference) => reference.role),
      references: frame.references});
  }
  outputGroup.receipt = receipt;
  outputGroup.node = node;
}

const fixtures = planRecords.map((record) => {
  const content = outputsByPlanNodeId.get(record.contentPlanNode.id);
  const baseline = outputsByPlanNodeId.get(record.baselinePlanNode.id);
  const contentFrames = new Set(content.images.map((image) => image.sourceFrame));
  const baselineFrames = new Set(baseline.images.map((image) => image.sourceFrame));
  const requiredRoleEvidence = record.group.sequences.flatMap((sequence) => sequence.requiredRoles.map((role) => {
    const signalEvent = sequence.events.find((event) => event.role === role);
    const decision = record.contentAware.sequenceDecisions.find((item) => item.sequenceId === sequence.sequenceId);
    const selected = decision?.coveredRoles.includes(role) && decision.selectedFrames.includes(signalEvent?.sourceFrame);
    const extracted = contentFrames.has(signalEvent?.sourceFrame);
    return {sequenceId: sequence.sequenceId, role, sourceFrame: signalEvent?.sourceFrame,
      policyCovered: Boolean(selected), imageExtracted: extracted, covered: Boolean(selected && extracted)};
  }));
  const missingRoles = requiredRoleEvidence.filter((item) => !item.covered);
  const cutSideEvidence = record.group.cuts.flatMap((cut) => [
    {cutId: cut.id, side: "CUT_BEFORE", sourceFrame: cut.cutFrame - 1},
    {cutId: cut.id, side: "CUT_AFTER", sourceFrame: cut.cutFrame},
  ]).map((side) => ({...side,
    policyCovered: record.contentAware.plan.references.some((reference) => reference.sourceFrame === side.sourceFrame
      && reference.role === side.side),
    imageExtracted: contentFrames.has(side.sourceFrame),
  })).map((side) => ({...side, covered: side.policyCovered && side.imageExtracted}));
  const missedCandidateCutSides = cutSideEvidence.filter((item) => !item.covered);
  const baselineCutMisses = record.group.cuts.flatMap((cut) => [cut.cutFrame - 1, cut.cutFrame])
    .filter((frame) => !baselineFrames.has(frame));
  const uncertainSignals = structuredClone(record.signals);
  if (uncertainSignals.sequences.length) uncertainSignals.sequences[0].confidence = 0.4;
  const uncertaintyProbe = planContentAwareFrameReviewBudgetV1({sourceVideoSha256: record.media.sha256,
    fps: record.group.fps, totalFrames: record.group.totalFrames,
    sequences: record.group.sequences.map(({sequenceId, startFrame, endFrameExclusive, kind, requiredRoles}) =>
      ({sequenceId, startFrame, endFrameExclusive, kind, requiredRoles})),
    signals: uncertainSignals});
  assert.equal(uncertaintyProbe.status, "REVIEW_REQUIRED");
  assert.equal(uncertaintyProbe.summary.reviewRequired, true);
  assert.equal(uncertaintyProbe.summary.reductionAchieved, false,
    "a low-confidence content signal must not authorize sample reduction");
  assert.equal(uncertaintyProbe.sequenceDecisions[0].strategy, "FIVE_POINT_FALLBACK");
  assert.equal(uncertaintyProbe.summary.missedBoundaryFreeClaim, false);
  assert.equal(missingRoles.length, 0, `${record.group.id}: every required source-bound role must be present in extracted images`);
  assert.equal(missedCandidateCutSides.length, 0, `${record.group.id}: every confirmed cut must preserve both adjacent frames`);
  assert.ok(content.images.length < baseline.images.length, `${record.group.id}: actual extracted image count must be lower`);
  return {
    id: record.group.id,
    genre: record.group.genre,
    status: "PASS",
    fps: record.group.fps,
    totalFrames: record.group.totalFrames,
    durationSeconds: record.group.durationSeconds,
    sourceVideoSha256: record.media.sha256,
    sourceVideoBytes: record.media.bytesLength,
    sourceIndexSha256: record.indexNode.result.summary.indexSha256,
    sourceIndexArtifact: (() => {
      const artifact = record.indexNode.acceptance.artifacts.find((item) => item.role === "source-keyframe-index");
      return {path: pathRelative(path.join(record.indexNode.acceptance.artifactRoot, artifact.path)),
        sha256: artifact.sha256, bytes: artifact.bytes, acceptedManifestSha256: record.indexNode.acceptance.manifestSha256};
    })(),
    signalContract: record.signals.contract,
    signalSha256: record.contentAware.signalsSha256,
    contentAwareBudgetSha256: record.contentAware.sha256,
    contentAwarePolicySha256: record.contentAware.plan.sha256,
    contentAwareDecision: record.contentAware.status,
    fixed5FpsBaselineUniqueFrames: record.baselinePlan.summary.uniqueSourceFrames,
    fixed5FpsActuallyExtractedPngs: baseline.images.length,
    contentAwarePlanUniqueFrames: record.contentAware.plan.summary.uniqueSourceFrames,
    contentAwareActuallyExtractedPngs: content.images.length,
    extractedImageReductionPercent: Number(((1 - content.images.length / baseline.images.length) * 100).toFixed(1)),
    exactPixelOracleChecks: baseline.images.length + content.images.length,
    requiredSemanticRoleCount: requiredRoleEvidence.length,
    observedSemanticRoleCount: requiredRoleEvidence.length - missingRoles.length,
    semanticRoleRecallPercent: Number((100 * (requiredRoleEvidence.length - missingRoles.length)
      / requiredRoleEvidence.length).toFixed(1)),
    roleEvidence: requiredRoleEvidence,
    missingRoles,
    confirmedHardCutCount: record.group.cuts.length,
    expectedCutSideCount: cutSideEvidence.length,
    observedCutSideCount: cutSideEvidence.length - missedCandidateCutSides.length,
    missedCandidateCutSides,
    fixed5FpsBaselineMissedCutSideCount: baselineCutMisses.length,
    cutSideEvidence,
    policyFivePointFallbackReferenceCount: record.contentAware.summary.fivePointBaselineReferenceCount,
    policyReferenceCount: record.contentAware.summary.plannedReferenceCount,
    lowConfidenceProbe: {status: uncertaintyProbe.status,
      reviewRequired: uncertaintyProbe.summary.reviewRequired,
      reductionAchieved: uncertaintyProbe.summary.reductionAchieved,
      firstSequenceFallback: uncertaintyProbe.sequenceDecisions[0].strategy,
      missedBoundaryFreeClaim: uncertaintyProbe.summary.missedBoundaryFreeClaim},
    reusedRoleReferences: record.contentAware.plan.summary.reusedReferences,
    baselineFrames: baseline.images.map(({sourceFrame}) => sourceFrame),
    contentAwareFrames: content.images.map(({sourceFrame, roles}) => ({sourceFrame, roles})),
    baselinePlanAcceptance: {nodeId: record.baselinePlanNode.id,
      acceptedManifestSha256: record.baselinePlanNode.acceptance.manifestSha256,
      artifact: (() => {
        const artifact = record.baselinePlanNode.acceptance.artifacts.find((item) => item.role === "frame-review-plan");
        return {path: pathRelative(path.join(record.baselinePlanNode.acceptance.artifactRoot, artifact.path)),
          sha256: artifact.sha256, bytes: artifact.bytes};
      })()},
    contentAwarePlanAcceptance: {nodeId: record.contentPlanNode.id,
      acceptedManifestSha256: record.contentPlanNode.acceptance.manifestSha256,
      artifact: (() => {
        const artifact = record.contentPlanNode.acceptance.artifacts.find((item) => item.role === "frame-review-plan");
        return {path: pathRelative(path.join(record.contentPlanNode.acceptance.artifactRoot, artifact.path)),
          sha256: artifact.sha256, bytes: artifact.bytes};
      })()},
    baselineExtractedArtifacts: baseline.images.map((image) => {
      const bytes = fs.readFileSync(image.path);
      return {sourceFrame: image.sourceFrame, path: pathRelative(image.path), sha256: sha256(bytes), bytes: bytes.length,
        references: image.references};
    }),
    contentAwareExtractedArtifacts: content.images.map((image) => {
      const bytes = fs.readFileSync(image.path);
      return {sourceFrame: image.sourceFrame, path: pathRelative(image.path), sha256: sha256(bytes), bytes: bytes.length,
        references: image.references};
    }),
    extractionReceipts: {
      baseline: {nodeId: baseline.node.id, acceptedManifestSha256: baseline.node.acceptance.manifestSha256,
        receipt: (() => {
          const artifact = baseline.node.acceptance.artifacts.find((item) => item.role === "frame-extraction-receipt");
          return {path: pathRelative(path.join(baseline.node.acceptance.artifactRoot, artifact.path)),
            sha256: artifact.sha256, bytes: artifact.bytes};
        })()},
      signalAware: {nodeId: content.node.id, acceptedManifestSha256: content.node.acceptance.manifestSha256,
        receipt: (() => {
          const artifact = content.node.acceptance.artifacts.find((item) => item.role === "frame-extraction-receipt");
          return {path: pathRelative(path.join(content.node.acceptance.artifactRoot, artifact.path)),
            sha256: artifact.sha256, bytes: artifact.bytes};
        })()},
    },
    proofBoundary: {syntheticOnly: true, sourceVideoRead: true, userVideoBytesRead: 0,
      visualApproval: "NOT_GRANTED", productionAdmission: false},
  };
});

const baselineFrameCount = fixtures.reduce((sum, fixture) => sum + fixture.fixed5FpsActuallyExtractedPngs, 0);
const contentAwareFrameCount = fixtures.reduce((sum, fixture) => sum + fixture.contentAwareActuallyExtractedPngs, 0);
const totalRequiredRoles = fixtures.reduce((sum, fixture) => sum + fixture.requiredSemanticRoleCount, 0);
const observedRequiredRoles = fixtures.reduce((sum, fixture) => sum + fixture.observedSemanticRoleCount, 0);
const totalCutSides = fixtures.reduce((sum, fixture) => sum + fixture.expectedCutSideCount, 0);
const observedCutSides = fixtures.reduce((sum, fixture) => sum + fixture.observedCutSideCount, 0);
const missedCutSides = fixtures.reduce((sum, fixture) => sum + fixture.missedCandidateCutSides.length, 0);
assert.equal(fixtures.length, 3);
assert.equal(new Set(fixtures.map((fixture) => fixture.genre)).size, 3);
assert.equal(observedRequiredRoles, totalRequiredRoles);
assert.equal(observedCutSides, totalCutSides);
assert.equal(missedCutSides, 0);
assert.ok(contentAwareFrameCount < baselineFrameCount);
const proofAndMetricsElapsedMs = Date.now() - extractionStartedAt - extractionElapsedMs;

const contextSummary = getNodeArtifactVerificationContextSummaryV1(sourceVerificationContext);
closeNodeArtifactVerificationContextV1(sourceVerificationContext);
const contextFinalState = getNodeArtifactVerificationContextSummaryV1(sourceVerificationContext);
assert.equal(contextFinalState.closed, true);
assert.equal(contextFinalState.acceptedNodeVerificationCacheEntryCount, 0);
assert.equal(contextFinalState.inFlightVerificationCount, 0);

const imageWidth = 1_800, imageHeight = 1_000;
const boardStartedAt = Date.now();
const plotLeft = 310, plotWidth = 1_410, rowTop = 150, rowHeight = 275;
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">`,
  `<rect width="100%" height="100%" fill="#f7f5ef"/>`,
  `<style>.title{font:700 27px Arial,sans-serif;fill:#17212b}.sub{font:14px Arial,sans-serif;fill:#5f6871}.head{font:700 12px Arial,sans-serif;fill:#59636e;letter-spacing:1px}.label{font:700 15px Arial,sans-serif;fill:#1d2933}.body{font:11px Arial,sans-serif;fill:#52606b}.foot{font:12px Arial,sans-serif;fill:#69737d}</style>`,
  `<text x="32" y="38" class="title">CONTENT-AWARE FRAME REVIEW: BASELINE VS EXTRACTED SAMPLES</text>`,
  `<text x="32" y="67" class="sub">Synthetic sources only · fixed 5fps PNGs ${baselineFrameCount} → signal-aware PNGs ${contentAwareFrameCount} · role recall ${observedRequiredRoles}/${totalRequiredRoles} · missed confirmed cut sides ${missedCutSides}/${totalCutSides}</text>`,
  `<text x="32" y="95" class="sub">Gray ticks are actual fixed-rate baseline source frames. Colored thumbnails are actual extracted signal-aware PNGs, each checked against its source-frame ID pixel. IN/OUT abbreviate entry/exit; CUT arrows show adjacent sides.</text>`];
for (const [index, fixture] of fixtures.entries()) {
  const top = rowTop + index * rowHeight;
  const record = planRecords[index];
  const content = outputsByPlanNodeId.get(record.contentPlanNode.id);
  svg.push(`<rect x="22" y="${top}" width="1756" height="250" rx="10" fill="${index % 2 ? "#ffffff" : "#eeeae1"}" stroke="#d9d4ca"/>`);
  svg.push(`<text x="38" y="${top + 25}" class="label">${fixture.genre}</text>`);
  svg.push(`<text x="38" y="${top + 47}" class="body">${fixture.id}</text>`);
  svg.push(`<text x="38" y="${top + 69}" class="body">${fixture.fixed5FpsActuallyExtractedPngs} → ${fixture.contentAwareActuallyExtractedPngs} PNGs · roles ${fixture.observedSemanticRoleCount}/${fixture.requiredSemanticRoleCount} · cut sides ${fixture.observedCutSideCount}/${fixture.expectedCutSideCount}</text>`);
  const baselineY = top + 100;
  svg.push(`<text x="38" y="${baselineY + 4}" class="head">FIXED 5FPS</text>`);
  svg.push(`<line x1="${plotLeft}" y1="${baselineY}" x2="${plotLeft + plotWidth}" y2="${baselineY}" stroke="#aeb4b8" stroke-width="1"/>`);
  const group = record.group;
  for (const frame of fixture.baselineFrames) {
    const x = plotLeft + (frame / Math.max(1, group.totalFrames - 1)) * plotWidth;
    svg.push(`<line x1="${x.toFixed(1)}" y1="${baselineY - 7}" x2="${x.toFixed(1)}" y2="${baselineY + 7}" stroke="#858e95" stroke-width="2"/>`);
  }
  svg.push(`<text x="38" y="${top + 151}" class="head">SIGNAL-AWARE EXTRACTED PNGS</text>`);
  content.images.forEach((image, imageIndex) => {
    const x = plotLeft + imageIndex * 103;
    const y = top + 163;
    image.thumbnailX = x;
    image.thumbnailY = y;
    const roleSet = new Set(image.references.map((reference) => reference.role));
    const holdRole = record.group.sequences.some((sequence) => sequence.events.some((event) =>
      event.sourceFrame === image.sourceFrame && sequence.kind === "stable-hold"));
    const hasCutBefore = roleSet.has("CUT_BEFORE"), hasCutAfter = roleSet.has("CUT_AFTER");
    if (hasCutBefore && hasCutAfter) image.boardRole = "CUT×2";
    else {
      const compactRoles = [...roleSet].filter((role) => !["REPRESENTATIVE_HOLD", "CUT_BEFORE", "CUT_AFTER"].includes(role))
        .map((role) => role === "ENTER" ? "IN" : role === "EXIT" ? "OUT" : role);
      if (hasCutBefore) compactRoles.unshift("CUT←");
      if (hasCutAfter) compactRoles.unshift("CUT→");
      if (!compactRoles.length && holdRole) compactRoles.push("HOLD");
      image.boardRole = compactRoles.join("+") || "SAMPLE";
    }
    svg.push(`<rect x="${x - 4}" y="${y - 4}" width="54" height="54" rx="4" fill="#fff" stroke="#6f9c91" stroke-width="1.5"/>`);
    svg.push(`<text x="${x + 24}" y="${y + 69}" text-anchor="middle" class="body">f${image.sourceFrame}</text>`);
    svg.push(`<text x="${x + 24}" y="${y + 84}" text-anchor="middle" class="body">${image.boardRole.slice(0, 15)}</text>`);
  });
}
svg.push(`<text x="32" y="${imageHeight - 24}" class="foot">Exact pixel/frame-ID oracle passed for all extracted baseline and candidate PNGs. Synthetic signals are fixture truth, not a calibrated real-video detector. No real-source or human-review savings are claimed.</text></svg>`);
const boardBase = await sharp(Buffer.from(svg.join("\n"), "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
const boardComposites = [];
for (const record of planRecords) {
  const content = outputsByPlanNodeId.get(record.contentPlanNode.id);
  for (const image of content.images) {
    const thumbnail = await sharp(image.path).resize(46, 46, {fit: "contain", background: {r: 255, g: 255, b: 255, alpha: 1}})
      .png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
    boardComposites.push({input: thumbnail, left: image.thumbnailX, top: image.thumbnailY});
  }
}
const boardBytes = await sharp(boardBase).composite(boardComposites).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(boardPath, boardBytes);
const boardElapsedMs = Date.now() - boardStartedAt;

const implementationPaths = [
  "apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs",
  "apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs",
  "apps/studio-next/src/lib/a1-node-frame-extraction-batch-fanout-v1.mjs",
  "apps/studio-next/src/lib/a1-node-ffmpeg-source-indexer-v1.mjs",
  "apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs",
  "apps/studio-next/src/lib/a1-node-module-execution-v1.mjs",
  "apps/studio-next/src/lib/a1-node-workflow-v1.mjs",
  "scripts/test-content-aware-frame-review-budget-v1.mjs",
  "scripts/build-content-aware-frame-review-budget-v1.mjs",
  "docs/NODE_WORKFLOW_SOP.md",
];
const implementationBindings = implementationPaths.map((relativePath) => ({path: relativePath,
  sha256: sha256(fs.readFileSync(path.join(repoRoot, relativePath)))}));
const baselineProofBytes = fs.readFileSync(baselineProofPath);
const maxSchedulerClaims = Math.max(indexStage.maxClaims, extractionStage.maxClaims);
const extractorPacketIndexScans = extractionStage.workflow.nodes.filter((node) => node.module === A1_NODE_FFMPEG_FRAME_EXTRACTOR_MODULE_ID_V1)
  .reduce((sum, node) => sum + (node.result?.summary?.ffprobeProcessCounts?.adapterPacketIndexScanProcessCount || 0), 0);
assert.equal(extractorPacketIndexScans, 0);
const result = {
  contract: "A1ContentAwareFrameReviewBudgetSystemTest/v1",
  phaseId: "content-aware-frame-review-budget-v1",
  status: "PASS",
  createdAt: new Date().toISOString(),
  implementationBindings,
  priorPlanOnlyBaseline: {path: pathRelative(baselineProofPath), sha256: sha256(baselineProofBytes),
    plannedUniqueSourceFrames: baselineProof.summary.plannedUniqueSourceFrames,
    fixed5FpsPlanIndices: baselineProof.summary.fixed5fpsBaselineCount,
    planOnlyReductionPercent: baselineProof.summary.planOnlyReductionPercent,
    extractedImages: baselineProof.summary.extractedImages, humanImageReviews: baselineProof.summary.humanImageReviews},
  scheduler: {
    contract: NODE_WORKFLOW_CONTRACT,
    sourceNodesAccepted: sourceRecords.length,
    sourceIndexNodesAccepted: indexStage.acceptedCount,
    planNodesAccepted: planRecords.length * 2,
    extractionTasksAccepted: extractionStage.acceptedCount,
    maximumClaimLimit: 2,
    observedMaxClaims: maxSchedulerClaims,
    sourcePacketIndexScans: indexRecords.reduce((sum, record) => sum + record.indexNode.result.summary.ffprobePacketScanCount, 0),
    extractorPacketIndexScans,
    defaultRegistryContainsReviewAdapters: false,
  },
  fixtures,
  summary: {
    genreCount: new Set(fixtures.map((fixture) => fixture.genre)).size,
    fixtureCount: fixtures.length,
    fixed5FpsExtractedPngs: baselineFrameCount,
    contentAwareExtractedPngs: contentAwareFrameCount,
    actualExtractedPngReductionPercent: Number(((1 - contentAwareFrameCount / baselineFrameCount) * 100).toFixed(1)),
    exactPixelOracleChecks: exactPixelChecks,
    requiredSemanticRoles: totalRequiredRoles,
    observedSemanticRoles: observedRequiredRoles,
    semanticRoleRecallPercent: Number((100 * observedRequiredRoles / totalRequiredRoles).toFixed(1)),
    confirmedCutSides: totalCutSides,
    observedConfirmedCutSides: observedCutSides,
    missedCandidateCutSides: missedCutSides,
    schedulerConcurrencyCap: 2,
    observedMaxSchedulerClaims: maxSchedulerClaims,
    confidenceThreshold: CONTENT_AWARE_SYNTHETIC_CONFIDENCE_THRESHOLD_V1,
    realDetectorCalibration: "NOT_ESTABLISHED",
    signalCompleteness: "DECLARED_BY_INPUT_NOT_INDEPENDENTLY_VERIFIED",
    sourceVerificationContextCacheHits: contextSummary.counters.cacheHitCount,
    sourceVerificationContextClosed: contextFinalState.closed,
    sourceVerificationCacheEntriesAfterClose: contextFinalState.acceptedNodeVerificationCacheEntryCount,
    defaultRegistryChanged: false,
    formalAuthorityModified: false,
  },
  accounting: {
    sourceVideoCount: sourceRecords.length,
    sourceVideosShaVerified: sourceRecords.every((record) => record.sourceNode.acceptance.artifacts
      .some((artifact) => artifact.role === "source-video" && artifact.sha256 === record.media.sha256)),
    packetIndexScans: {sourceIndexer: indexRecords.reduce((sum, record) => sum + record.indexNode.result.summary.ffprobePacketScanCount, 0),
      extractorChildren: extractorPacketIndexScans},
    runScopedVerificationContext: {beforeClose: contextSummary,
      afterClose: {closed: contextFinalState.closed,
        acceptedNodeVerificationCacheEntryCount: contextFinalState.acceptedNodeVerificationCacheEntryCount,
        inFlightVerificationCount: contextFinalState.inFlightVerificationCount}},
  },
  executionTiming: {
    totalElapsedMs: Date.now() - executionStartedAt,
    sourceGenerationAndAcceptanceMs: sourceGenerationElapsedMs,
    sourceIndexingMs: indexingElapsedMs,
    planCompilationAndAcceptanceMs: planningElapsedMs,
    baselineAndCandidateExtractionMs: extractionElapsedMs,
    extractionInspectionAndMetricsMs: Math.max(0, proofAndMetricsElapsedMs),
    boardCompositionMs: boardElapsedMs,
    schedulerRetries: 0,
    humanInterventions: 0,
    allAcceptedNodesPassedOnFirstAttempt: true,
    timingComparisonClaimed: false,
  },
  visibleArtifact: {path: pathRelative(boardPath), sha256: sha256(boardBytes), bytes: boardBytes.length,
    width: imageWidth, height: imageHeight},
  proofBoundary: {
    fixtureSignalOrigin: "HARNESS_GROUND_TRUTH_ONLY",
    syntheticVideosGenerated: sourceRecords.length,
    syntheticFramesExtracted: exactPixelChecks,
    userVideoBytesRead: 0,
    sourceTextUsedAsMotionEvidence: false,
    realDetectorCalibration: "NOT_ESTABLISHED",
    humanReviewTimeSavingsClaimed: false,
    visualApproval: "NOT_GRANTED",
    productionAdmission: false,
    defaultRegistryChanged: false,
    formalAuthorityModified: false,
  },
  independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, resultPath: pathRelative(resultPath), summary: result.summary,
  fixtures: result.fixtures.map(({id, fixed5FpsActuallyExtractedPngs, contentAwareActuallyExtractedPngs,
    semanticRoleRecallPercent, missedCandidateCutSides, fixed5FpsBaselineMissedCutSideCount}) => ({id,
    fixed5FpsActuallyExtractedPngs, contentAwareActuallyExtractedPngs, semanticRoleRecallPercent,
    missedCandidateCutSides: missedCandidateCutSides.length, fixed5FpsBaselineMissedCutSideCount})),
  visibleArtifact: result.visibleArtifact}, null, 2));
