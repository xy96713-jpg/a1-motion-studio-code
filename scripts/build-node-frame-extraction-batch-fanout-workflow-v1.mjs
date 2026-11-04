#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask, nodeDependencyBlockers} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {buildNodeFrameExtractionBatchFanoutV1} from "../apps/studio-next/src/lib/a1-node-frame-extraction-batch-fanout-v1.mjs";
import {A1_REFERENCE_FRAME_REVIEW_POLICY_V1, compileReferenceFrameReviewPlanV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";
import {A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1} from "../apps/studio-next/src/lib/a1-node-frame-review-plan-adapter-v1.mjs";
import {planReferenceFrameExtractionBatchesV1} from "../apps/studio-next/src/lib/a1-reference-frame-batch-planner-v1.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskRoot = path.join(repoRoot, "work/scheduler-frame-extraction-batch-fanout-v1");
const sourceRoot = path.join(taskRoot, "sources");
const artifactRoot = path.join(taskRoot, "artifacts");
const resultPath = path.join(taskRoot, "result.json");
const graphPath = path.join(taskRoot, "fanout-map.png");
const ffmpegPath = "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = path.join(repoRoot, ".tools/bin/ffprobe");
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
const sourceManifestContract = "A1FrameReviewSourceManifest/v1";
const sourceModuleSha256 = sha256(Buffer.from("synthetic-review-only-source-fixture-adapter-v1", "utf8"));
const batchPlanModuleSha256 = sha256(Buffer.from("synthetic-review-only-frame-batch-plan-adapter-v1", "utf8"));
const extractorModuleSha256 = sha256(Buffer.from("synthetic-no-extraction-fanout-probe-v1", "utf8"));
const sourcePlans = [
  {id: "evidence", genre: "evidence-explainer", frames: [1, 24], blue: 23},
  {id: "tutorial", genre: "product-tutorial", frames: Array.from({length: 61}, (_, index) => index), blue: 73},
  {id: "opinion", genre: "personal-opinion", frames: [7, 19, 44], blue: 123},
].map((group) => ({...group, fps: 30, totalFrames: 200, durationSeconds: 200 / 30}));
const sourceMedia = new Map();
fs.mkdirSync(sourceRoot, {recursive: true});
fs.mkdirSync(artifactRoot, {recursive: true});

for (const group of sourcePlans) {
  const filename = path.join(sourceRoot, `${group.id}-200f.avi`);
  const lavfi = `nullsrc=size=160x90:rate=${group.fps}:duration=${group.durationSeconds},format=gbrp,geq=r='mod(N,256)':g='mod(floor(N/256),256)':b='${group.blue}'`;
  await execFileAsync(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error", "-fflags", "+bitexact",
    "-f", "lavfi", "-i", lavfi, "-frames:v", String(group.totalFrames), "-c:v", "ffv1", "-level", "3",
    "-flags:v", "+bitexact", "-map_metadata", "-1", "-pix_fmt", "gbrp", "-threads", "1", "-f", "avi", "-y", filename],
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
          width: 160, height: 90, fps: group.fps, durationSeconds: group.durationSeconds,
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

const extractorProbeCalls = [];
const executeFanoutProbeNode = async (node, {dependencies = {}} = {}) => {
  const parameters = node.input?.parameters;
  const sourceId = parameters?.sourceVideoBinding?.dependencyId;
  const planId = parameters?.framePlanBinding?.dependencyId;
  const source = dependencies[sourceId], plan = dependencies[planId];
  if (!source || !plan || source.state !== "succeeded" || plan.state !== "succeeded"
    || source.manifestSha256 !== parameters.sourceVideoBinding.acceptedManifestSha256
    || plan.manifestSha256 !== parameters.framePlanBinding.acceptedManifestSha256) {
    return {state: "blocked", reason: "FANOUT_PROBE_DEPENDENCY_MISMATCH", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  extractorProbeCalls.push({nodeId: node.id, sourceDependencyId: sourceId, planDependencyId: planId,
    sourceManifestSha256: source.manifestSha256, batchPlanManifestSha256: plan.manifestSha256});
  return {state: "needs-review", reason: "FANOUT_TASK_DEPENDENCIES_REVALIDATED_NO_EXTRACTION",
    visualApproval: "NOT_GRANTED", productionAdmission: false,
    summary: {sourceDependencyId: sourceId, planDependencyId: planId,
      imagesExtracted: 0, visualApproval: "NOT_GRANTED", productionAdmission: false}};
};

const installed = createNodeAdapterRegistry({
  "fixture-source": {label: "合成来源", version: 1, optional: true,
    implementationSha256: sourceModuleSha256, execute: executeSyntheticSourceNode},
  "fixture-batch-plan": {label: "合成批次计划", version: 1, optional: true,
    implementationSha256: batchPlanModuleSha256, execute: executeSyntheticBatchPlanNode},
  "ffmpeg-frame-extractor": {label: "抽帧依赖探针", version: 1, optional: true,
    implementationSha256: extractorModuleSha256, execute: executeFanoutProbeNode},
});
assert.equal(createNodeAdapterRegistry().registry["ffmpeg-frame-extractor"], undefined,
  "the production registry must not receive the review-only extractor module");

const projectId = "scheduler-frame-extraction-batch-fanout-v1";
const workspaceSha256 = sha256(Buffer.from("scheduler-frame-extraction-batch-fanout-synthetic-v1", "utf8"));
const moduleFlags = (active) => ({
  material: false, typography: false, recording: false, diagram: false,
  "fixture-source": active === "fixture-source",
  "fixture-batch-plan": active === "fixture-batch-plan",
  "ffmpeg-frame-extractor": active === "ffmpeg-frame-extractor",
});
const context = {articleTitle: "synthetic cross-genre scheduler fanout", articleSha256: sha256(Buffer.from("fanout-test-input", "utf8"))};

async function runAcceptedStage(input, previous, moduleName, workerId, reviewerId) {
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
    for (const claim of batch.claims) {
      const result = await executeRegisteredNode(workflow, claim, {registry: installed.registry, artifactRoot,
        ffprobePath, now: now + 1});
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
  sourceWorkflow, "fixture-batch-plan", "batch-plan-worker", "batch-plan-technical-check");
const batchWorkflow = batchStage.workflow;
const batchNodesByGroup = new Map(sourcePlans.map((group) => [group.id, group.batchPlan.batches.map((batch) => {
  const node = batchWorkflow.nodes.find((item) => item.id === `plan-${group.id}-${batch.id}:fixture-batch-plan`);
  assert.equal(node?.state, "succeeded");
  return node;
})]));

const fanoutResults = sourcePlans.map((group) => {
  const source = acceptedSources.get(group.id);
  const result = buildNodeFrameExtractionBatchFanoutV1({batchPlan: group.batchPlan,
    sourceNodes: [source.node], batchPlanNodes: batchNodesByGroup.get(group.id)});
  return {group, source, result};
});
const fanoutShots = fanoutResults.flatMap((item) => item.result.shots);
assert.equal(fanoutShots.length, 4);
assert.equal(new Set(fanoutShots.map((shot) => shot.id)).size, 4);

const fanoutInput = {projectId, workspaceSha256, context, shots: fanoutShots};
const fanoutWorkflow = compileNodeWorkflow(fanoutInput, batchWorkflow, {moduleDefinitions: installed.definitions});
const extractorNodes = fanoutWorkflow.nodes.filter((node) => node.module === "ffmpeg-frame-extractor");
const retainedSourceNodes = fanoutWorkflow.nodes.filter((node) => node.module === "fixture-source" && node.state === "succeeded");
const retainedPlanNodes = fanoutWorkflow.nodes.filter((node) => node.module === "fixture-batch-plan" && node.state === "succeeded");
assert.equal(extractorNodes.length, 4);
assert.equal(retainedSourceNodes.length, 3, "one accepted source node per source SHA must be retained");
assert.equal(retainedPlanNodes.length, 4, "each batch plan node must be retained once");
for (const node of extractorNodes) {
  assert.equal(node.dependencies.length, 2);
  assert.deepEqual(nodeDependencyBlockers(fanoutWorkflow, node), []);
  const sourceDep = fanoutWorkflow.nodes.find((item) => item.id === node.dependencies[0]);
  const planDep = fanoutWorkflow.nodes.find((item) => item.id === node.dependencies[1]);
  assert.equal(sourceDep.module, "fixture-source");
  assert.equal(planDep.module, "fixture-batch-plan");
  assert.equal(node.dependencyArtifactKinds[sourceDep.id][0], "VIDEO");
  assert.equal(node.dependencyArtifactKinds[planDep.id][0], "JSON_PLAN");
}

let scheduledWorkflow = fanoutWorkflow;
let maxRunningClaims = 0, tasksRevalidated = 0;
let clockNow = 900_000;
while (scheduledWorkflow.nodes.some((node) => node.module === "ffmpeg-frame-extractor" && node.state === "queued")) {
  const claimBatch = claimNodeTasks(scheduledWorkflow, {workerId: "synthetic-fanout-worker", now: clockNow});
  assert.ok(claimBatch.claims.length >= 1);
  assert.ok(claimBatch.claims.length <= 2);
  maxRunningClaims = Math.max(maxRunningClaims, claimBatch.claims.length);
  scheduledWorkflow = claimBatch.workflow;
  for (const claim of claimBatch.claims) {
    const result = await executeRegisteredNode(scheduledWorkflow, claim, {
      registry: installed.registry, artifactRoot, ffprobePath, now: clockNow + 1,
    });
    assert.equal(result.state, "needs-review");
    assert.equal(result.reason, "FANOUT_TASK_DEPENDENCIES_REVALIDATED_NO_EXTRACTION");
    assert.equal(result.productionAdmission, false);
    const sourceId = claim.dependencies[0], planId = claim.dependencies[1];
    assert.ok(extractorProbeCalls.some((call) => call.nodeId === claim.id
      && call.sourceDependencyId === sourceId && call.planDependencyId === planId));
    scheduledWorkflow = finishNodeTask(scheduledWorkflow, claim, result, clockNow + 2);
    tasksRevalidated += 1;
    clockNow += 10;
  }
}
assert.equal(tasksRevalidated, 4);
assert.equal(maxRunningClaims, 2);
assert.equal(new Set(extractorProbeCalls.map((call) => call.sourceDependencyId)).size, 3);

const groupColors = ["#d84a32", "#3169b3", "#198d78"];
const imageWidth = 1_520, imageHeight = 580;
const columnX = {source: 80, batch: 565, task: 1_080};
let rowCursorY = 145;
const svgParts = [];
svgParts.push(`<rect width="100%" height="100%" fill="#f8f6f0"/>`);
svgParts.push(`<style>.title{font:700 24px Arial,sans-serif;fill:#17202b}.sub{font:13px Arial,sans-serif;fill:#606975}.head{font:700 11px Arial,sans-serif;fill:#5c636a;letter-spacing:1px}.label{font:700 13px Arial,sans-serif;fill:#202a34}.body{font:11px Arial,sans-serif;fill:#56616c}.foot{font:12px Arial,sans-serif;fill:#606975}</style>`);
svgParts.push(`<text x="24" y="30" class="title">SOURCE-BOUND BATCH FAN-OUT</text>`);
svgParts.push(`<text x="480" y="29" class="sub">3 accepted sources → 4 accepted batch plans → 4 review-only tasks · concurrency ≤ 2 · 0 frames extracted</text>`);
svgParts.push(`<text x="${columnX.source}" y="102" class="head">ACCEPTED SOURCE NODE</text>`);
svgParts.push(`<text x="${columnX.batch}" y="102" class="head">ACCEPTED BATCH PLAN</text>`);
svgParts.push(`<text x="${columnX.task}" y="102" class="head">SCHEDULER TASK</text>`);
for (const [groupIndex, item] of fanoutResults.entries()) {
  const {group, source, result} = item;
  const color = groupColors[groupIndex];
  const top = rowCursorY;
  const tasks = result.shots;
  const subGap = tasks.length > 1 ? 78 : 0;
  const sourceY = top + ((tasks.length - 1) * subGap + 66) / 2 - 33;
  svgParts.push(`<text x="24" y="${top + 3}" class="label">${group.genre}</text>`);
  svgParts.push(`<rect x="${columnX.source}" y="${sourceY}" width="330" height="66" rx="8" fill="#fffdf7" stroke="#d9d5ca"/>`);
  svgParts.push(`<rect x="${columnX.source}" y="${sourceY}" width="6" height="66" fill="${color}"/>`);
  svgParts.push(`<text x="${columnX.source + 18}" y="${sourceY + 25}" class="label">${source.node.id}</text>`);
  svgParts.push(`<text x="${columnX.source + 18}" y="${sourceY + 48}" class="body">VIDEO SHA ${group.sourceVideoSha256.slice(0, 12)}…</text>`);
  tasks.forEach((shot, taskIndex) => {
    const taskY = top + taskIndex * subGap;
    const planDepId = shot.moduleDependencyBindings["ffmpeg-frame-extractor"][1].nodeId;
    const planNode = batchNodesByGroup.get(group.id).find((node) => node.id === planDepId);
    const planSha = planNode.result.summary.batchSha256;
    const batchIndex = taskIndex;
    const batch = group.batchPlan.batches[batchIndex];
    svgParts.push(`<line x1="${columnX.source + 330}" y1="${sourceY + 33}" x2="${columnX.batch - 18}" y2="${taskY + 32}" stroke="#8a9297" stroke-width="1.5"/>`);
    svgParts.push(`<line x1="${columnX.batch + 330}" y1="${taskY + 32}" x2="${columnX.task - 18}" y2="${taskY + 32}" stroke="#8a9297" stroke-width="1.5"/>`);
    svgParts.push(`<rect x="${columnX.batch}" y="${taskY}" width="330" height="66" rx="8" fill="#fffdf7" stroke="#d9d5ca"/>`);
    svgParts.push(`<rect x="${columnX.batch}" y="${taskY}" width="6" height="66" fill="${color}"/>`);
    svgParts.push(`<text x="${columnX.batch + 18}" y="${taskY + 25}" class="label">${batch.id} · ${batch.uniqueFrameCount} frames</text>`);
    svgParts.push(`<text x="${columnX.batch + 18}" y="${taskY + 48}" class="body">batch SHA ${planSha.slice(0, 12)}… · JSON_PLAN</text>`);
    svgParts.push(`<rect x="${columnX.task}" y="${taskY}" width="390" height="66" rx="8" fill="#f2f6f4" stroke="#c6d3ce"/>`);
    svgParts.push(`<text x="${columnX.task + 18}" y="${taskY + 25}" class="label">${shot.id}:ffmpeg-frame-extractor</text>`);
    svgParts.push(`<text x="${columnX.task + 18}" y="${taskY + 48}" class="body">reuses ${source.node.id} · lease checked · no extraction</text>`);
  });
  rowCursorY += (tasks.length - 1) * subGap + 66 + 40;
}
svgParts.push(`<text x="24" y="552" class="foot">External dependency IDs and accepted manifest SHAs enter each task fingerprint. Graph is synthetic and review-only; formal production authority remains unchanged.</text>`);
const graphSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">${svgParts.join("\n")}</svg>`;
const graphBytes = await sharp(Buffer.from(graphSvg, "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(graphPath, graphBytes);

const result = {
  contract: "A1NodeFrameExtractionBatchFanoutWorkflowIntegration/v1",
  status: "PASS",
  phaseId: "scheduler-frame-extraction-batch-fanout-v1",
  createdAt: "2026-09-28",
  scheduler: {contract: "A1NodeWorkflow/v1", module: "ffmpeg-frame-extractor", defaultRegistryRegistered: false,
    sourceNodesAccepted: sourceStage.acceptedCount, batchPlanNodesAccepted: batchStage.acceptedCount,
    extractorTasks: extractorNodes.length, externalSourceNodeCount: retainedSourceNodes.length,
    externalBatchPlanNodeCount: retainedPlanNodes.length, maxRunningClaims: maxRunningClaims,
    tasksWithDependenciesRevalidated: tasksRevalidated},
  fixtures: fanoutResults.map(({group, source, result: fanout}) => ({
    id: `batch-fanout-${group.id}`, genre: group.genre, status: "PASS",
    sourceVideoSha256: group.sourceVideoSha256, sourceNodeId: source.node.id,
    uniqueFrames: group.batchPlan.summary.uniqueSourceFrameCount,
    batchPlanSha256: group.batchPlan.sha256, taskCount: fanout.taskCount,
    reusedSourceNodeAcrossTasks: fanout.summary.sourceNodesReusedAcrossBatches,
  })),
  tasks: extractorNodes.map((node) => ({id: node.id, inputSha256: node.inputSha256,
    dependencies: node.dependencies,
    dependencyArtifactKinds: node.dependencyArtifactKinds,
    state: scheduledWorkflow.nodes.find((item) => item.id === node.id)?.state,
    acceptanceManifestSha256: node.acceptance?.manifestSha256 || null,
    visualApproval: "NOT_GRANTED", productionAdmission: false})),
  summary: {genreCount: 3, sourceVideoCount: 3, batchPlanCount: 4, fanoutTaskCount: 4,
    tutorialBatchesShareOneSourceNode: true, maxConcurrency: 2, dependencyBlockers: 0,
    sourceVideoDecoded: false, actualFramesExtracted: 0},
  visibleArtifact: {path: pathRelative(graphPath), sha256: sha256(graphBytes), bytes: graphBytes.length,
    width: imageWidth, height: imageHeight},
  proofBoundary: {syntheticVideosGenerated: 3, videoHeadersVerified: true, videoFramesDecoded: false,
    actualFramesExtracted: 0, visualApproval: "NOT_GRANTED", productionAdmission: false,
    defaultRegistryRegistered: false, formalAuthorityModified: false},
  independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({...result, resultPath: pathRelative(resultPath)}, null, 2));
