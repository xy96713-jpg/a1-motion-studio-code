#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {frameReviewPlanNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-frame-review-plan-adapter-v1.mjs";
import {createNodeFfmpegFrameExtractorAdapterV1} from "../apps/studio-next/src/lib/a1-node-ffmpeg-frame-extractor-v1.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const taskRoot = path.join(repoRoot, "work/ffmpeg-frame-extraction-adapter-v1");
const sourceRoot = path.join(taskRoot, "sources");
const artifactRoot = path.join(taskRoot, "artifacts");
const contactSheetPath = path.join(taskRoot, "selected-frame-contact-sheet.png");
const resultPath = path.join(taskRoot, "result.json");
const sourcePlanRoot = path.join(repoRoot, "work/event-driven-frame-review-v1");
const inputPath = path.join(sourcePlanRoot, "plan-inputs.json");
const ffmpegPath = "/Users/a1/.local/bin/ffmpeg";
const ffprobePath = path.join(repoRoot, ".tools/bin/ffprobe");
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeId = (value) => `${String(value).replace(/[^A-Za-z0-9._-]+/gu, "_")}-${sha256(Buffer.from(String(value), "utf8")).slice(0, 12)}`;
const artifactPath = (root, filename, role, kind, {jsonContract, expectedMedia} = {}) => {
  const bytes = fs.readFileSync(filename);
  return {path: path.relative(root, filename).split(path.sep).join("/"), role, kind,
    ...(jsonContract ? {jsonContract} : {}), ...(expectedMedia ? {expectedMedia} : {}),
    sha256: sha256(bytes), bytes: bytes.length};
};

const inputBytes = fs.readFileSync(inputPath);
const sourceData = JSON.parse(inputBytes.toString("utf8"));
assert.equal(sourceData.contract, "A1EventDrivenFrameReviewInputs/v1");
assert.equal(sourceData.groups.length, 3);
assert.equal(new Set(sourceData.groups.map((group) => group.genre)).size, 3);
fs.mkdirSync(sourceRoot, {recursive: true});
fs.mkdirSync(artifactRoot, {recursive: true});

// Each synthetic frame encodes its zero-based input frame number in the center pixel.
// This lets the integration check prove exact frame identity from output pixels,
// independently of the adapter's JSON receipt.
const frameIndexBias = new Map([["evidence", 0], ["tutorial", 1], ["opinion", 2]]);
const frameColorBase = new Map([["evidence", 23], ["tutorial", 73], ["opinion", 123]]);
const syntheticSources = new Map();
for (const group of sourceData.groups) {
  const durationSeconds = group.totalFrames / group.fps;
  const bias = frameIndexBias.get(group.id);
  const blue = frameColorBase.get(group.id);
  assert.ok(Number.isInteger(bias) && Number.isInteger(blue));
  const filename = path.join(sourceRoot, `${group.id}-${group.totalFrames}f.avi`);
  const lavfi = `nullsrc=size=160x90:rate=${group.fps}:duration=${durationSeconds},format=gbrp,geq=r='mod(N,256)':g='mod(floor(N/256)+${bias},256)':b='${blue}'`;
  const {stdout, stderr} = await execFileAsync(ffmpegPath, [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-fflags", "+bitexact", "-f", "lavfi", "-i", lavfi,
    "-frames:v", String(group.totalFrames), "-c:v", "ffv1", "-level", "3", "-flags:v", "+bitexact",
    "-map_metadata", "-1", "-pix_fmt", "gbrp", "-threads", "1", "-f", "avi", "-y", filename,
  ], {encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024});
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  const videoBytes = fs.readFileSync(filename);
  const videoSha256 = sha256(videoBytes);
  assert.ok(videoBytes.length > 0);
  group.sourceVideoSha256 = videoSha256;
  syntheticSources.set(group.id, {filename, videoSha256, video: videoBytes, videoBytes: videoBytes.length, durationSeconds, bias, blue});
}

const sourceManifestContract = "A1FrameReviewSourceManifest/v1";
const sourceModuleSha256 = sha256(Buffer.from("A1 synthetic source-video and frame-manifest fixture adapter v1", "utf8"));
async function executeSyntheticSourceNode(node, {artifactRoot: root} = {}) {
  const parameters = node.input?.parameters;
  const source = syntheticSources.get(parameters?.groupId);
  const group = sourceData.groups.find((item) => item.id === parameters?.groupId);
  if (node.module !== "fixture-source" || node.input?.implementationSha256 !== sourceModuleSha256
    || !source || !group || parameters.sourceVideoSha256 !== source.videoSha256) {
    return {state: "blocked", reason: "SYNTHETIC_SOURCE_INPUT_INVALID", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  const directory = path.join(root, `fixture-source-${safeId(node.id)}`, node.inputSha256);
  fs.mkdirSync(directory, {recursive: true});
  const videoPath = path.join(directory, "source-video.avi");
  const sourceManifestPath = path.join(directory, "frame-source-manifest.json");
  if (fs.existsSync(videoPath)) {
    assert.equal(sha256(fs.readFileSync(videoPath)), source.videoSha256, "reuse only byte-identical synthetic source artifacts");
  } else {
    fs.writeFileSync(videoPath, source.video, {flag: "wx", mode: 0o600});
  }
  const manifest = {contract: sourceManifestContract, sourceVideoSha256: source.videoSha256,
    fps: group.fps, totalFrames: group.totalFrames};
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (fs.existsSync(sourceManifestPath)) assert.deepEqual(fs.readFileSync(sourceManifestPath), manifestBytes, "reuse only the identical source manifest");
  else fs.writeFileSync(sourceManifestPath, manifestBytes, {flag: "wx", mode: 0o600});
  return {
    state: "needs-review", reason: "SYNTHETIC_SOURCE_FIXTURE_REQUIRES_TECHNICAL_ACCEPTANCE",
    visualApproval: "NOT_GRANTED", productionAdmission: false,
    artifactManifest: {
      contract: "A1NodeArtifactManifest/v1", nodeId: node.id, inputSha256: node.inputSha256, productionAdmission: false,
      artifacts: [
        artifactPath(root, videoPath, "source-video", "VIDEO", {expectedMedia: {
          width: 160, height: 90, fps: group.fps, durationSeconds: source.durationSeconds,
        }}),
        artifactPath(root, sourceManifestPath, "frame-review-source-manifest", "JSON_PLAN", {jsonContract: sourceManifestContract}),
      ],
    },
  };
}

const extractorAdapter = createNodeFfmpegFrameExtractorAdapterV1({ffmpegPath});
const installed = createNodeAdapterRegistry({
  "fixture-source": {label: "合成来源夹具", version: 1, optional: true,
    implementationSha256: sourceModuleSha256, execute: executeSyntheticSourceNode},
  "frame-review-plan": {...frameReviewPlanNodeAdapterV1, optional: true},
  "ffmpeg-frame-extractor": {...extractorAdapter, optional: true},
});
assert.equal(createNodeAdapterRegistry().registry["ffmpeg-frame-extractor"], undefined,
  "review-only FFmpeg extractor must remain outside the default production registry");

const commonModuleFlags = (active) => ({
  material: false, typography: false, recording: false, diagram: false,
  "fixture-source": active === "fixture-source",
  "frame-review-plan": active === "frame-review-plan",
  "ffmpeg-frame-extractor": active === "ffmpeg-frame-extractor",
});
const projectId = "ffmpeg-frame-extraction-adapter-v1";
const workspaceSha256 = sha256(Buffer.from("synthetic-ffmpeg-frame-extractor-workflow-v1", "utf8"));
const baseShots = sourceData.groups.map((group) => ({
  id: group.id,
  source: `Synthetic ${group.genre} source-video frame fixture`,
  modules: commonModuleFlags("fixture-source"),
  moduleInputs: {"fixture-source": {groupId: group.id, sourceVideoSha256: group.sourceVideoSha256}},
}));

async function runStage(input, previous, moduleName, workerId, reviewerId) {
  let workflow = compileNodeWorkflow(input, previous, {moduleDefinitions: installed.definitions});
  let now = 200_000;
  let acceptedCount = 0;
  while (workflow.nodes.some((node) => node.module === moduleName && ["queued", "running", "needs-review"].includes(node.state))) {
    workflow = compileNodeWorkflow(input, workflow, {moduleDefinitions: installed.definitions});
    const batch = claimNodeTasks(workflow, {workerId, now});
    if (!batch.claims.length) {
      const waiting = workflow.nodes.filter((node) => node.module === moduleName && !["succeeded", "skipped"].includes(node.state));
      assert.deepEqual(waiting.map((node) => [node.id, node.state, node.reason]), [], `${moduleName} must not stall on a hidden dependency`);
      break;
    }
    assert.ok(batch.claims.length <= 2, "the shared node scheduler must enforce its two-task concurrency cap");
    assert.ok(batch.claims.every((claim) => claim.module === moduleName),
      `${moduleName} stage must not unexpectedly requeue a dependency module`);
    workflow = batch.workflow;
    for (const claim of batch.claims) {
      let heartbeatCount = 0;
      const result = await executeRegisteredNode(workflow, claim, {
        registry: installed.registry, artifactRoot, ffprobePath, now: now + 1,
        heartbeat: async () => { heartbeatCount += 1; },
      });
      assert.equal(result.state, "needs-review", `${claim.id} stays review-only (result=${JSON.stringify(result)})`);
      assert.equal(result.productionAdmission, false);
      assert.ok(result.visualApproval === false || result.visualApproval === "NOT_GRANTED");
      if (moduleName === "ffmpeg-frame-extractor") assert.ok(heartbeatCount >= 2, "extractor brackets source work with lease heartbeats");
      workflow = finishNodeTask(workflow, claim, result, now + 2);
      workflow = await acceptNodeArtifacts(workflow, claim.id, {artifactRoot, reviewerId, ffprobePath, now: now + 3});
      const accepted = workflow.nodes.find((node) => node.id === claim.id);
      assert.equal(accepted.state, "succeeded");
      assert.equal(accepted.acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
      assert.equal(accepted.acceptance.visualApproval, "NOT_GRANTED");
      assert.equal(accepted.acceptance.productionAdmission, false);
      acceptedCount += 1;
      now += 10;
    }
  }
  assert.equal(workflow.nodes.filter((node) => node.module === moduleName && node.state === "succeeded").length, sourceData.groups.length);
  return {workflow, acceptedCount};
}

const sourceStage = await runStage({projectId, workspaceSha256,
  context: {articleTitle: "synthetic frame extraction test", articleSha256: sha256(inputBytes)}, shots: baseShots},
  null, "fixture-source", "synthetic-source-worker", "synthetic-source-technical-test");
const sourceWorkflow = sourceStage.workflow;
const acceptedSources = new Map(sourceData.groups.map((group) => {
  const node = sourceWorkflow.nodes.find((item) => item.id === `${group.id}:fixture-source`);
  assert.equal(node?.state, "succeeded");
  const video = node.acceptance.artifacts.find((item) => item.role === "source-video" && item.kind === "VIDEO");
  const sourceManifest = node.acceptance.artifacts.find((item) => item.role === "frame-review-source-manifest"
    && item.kind === "JSON_PLAN" && item.metadata.jsonContract === sourceManifestContract);
  assert.ok(video && sourceManifest);
  assert.equal(video.sha256, group.sourceVideoSha256);
  assert.deepEqual({width: video.metadata.width, height: video.metadata.height, fps: video.metadata.fps,
    durationSeconds: video.metadata.durationSeconds},
  {width: 160, height: 90, fps: group.fps, durationSeconds: group.totalFrames / group.fps});
  return [group.id, {node, video, sourceManifest}];
}));

const planShots = baseShots.map((shot) => {
  const group = sourceData.groups.find((item) => item.id === shot.id);
  const accepted = acceptedSources.get(group.id);
  return {...shot,
    modules: {...commonModuleFlags("frame-review-plan"), "fixture-source": true},
    moduleDependencies: {"frame-review-plan": ["fixture-source"]},
    moduleArtifactKinds: {"frame-review-plan": {"fixture-source": ["JSON_PLAN"]}},
    moduleInputs: {
      ...shot.moduleInputs,
      "frame-review-plan": {
        sourceManifestBinding: {dependencyId: accepted.node.id,
          acceptedManifestSha256: accepted.node.acceptance.manifestSha256,
          artifact: {path: accepted.sourceManifest.path, sha256: accepted.sourceManifest.sha256, bytes: accepted.sourceManifest.bytes}},
        plan: {sequences: group.sequences, hardCuts: group.hardCuts},
      },
    },
  };
});
const planStage = await runStage({projectId, workspaceSha256,
  context: {articleTitle: "synthetic frame extraction test", articleSha256: sha256(inputBytes)}, shots: planShots},
  sourceWorkflow, "frame-review-plan", "synthetic-plan-worker", "synthetic-plan-technical-test");
const planWorkflow = planStage.workflow;
const acceptedPlans = new Map(sourceData.groups.map((group) => {
  const node = planWorkflow.nodes.find((item) => item.id === `${group.id}:frame-review-plan`);
  assert.equal(node?.state, "succeeded");
  const planArtifact = node.acceptance.artifacts.find((item) => item.kind === "JSON_PLAN"
    && item.metadata.jsonContract === "A1NodeFrameReviewPlanOutput/v1");
  assert.ok(planArtifact);
  const wrapper = JSON.parse(fs.readFileSync(path.join(artifactRoot, planArtifact.path), "utf8"));
  assert.equal(wrapper.contract, "A1NodeFrameReviewPlanOutput/v1");
  assert.equal(wrapper.source.sourceVideoSha256, group.sourceVideoSha256);
  assert.equal(wrapper.plan.summary.visualApproval, false);
  assert.equal(wrapper.plan.summary.productionAdmission, false);
  assert.equal(wrapper.proofBoundary.frameExtractionPerformed, false);
  return [group.id, {node, artifact: planArtifact, wrapper}];
}));

const extractionShots = planShots.map((shot) => {
  const source = acceptedSources.get(shot.id);
  const plan = acceptedPlans.get(shot.id);
  return {...shot,
    modules: {...commonModuleFlags("ffmpeg-frame-extractor"), "fixture-source": true, "frame-review-plan": true},
    moduleDependencies: {...shot.moduleDependencies, "ffmpeg-frame-extractor": ["fixture-source", "frame-review-plan"]},
    moduleArtifactKinds: {...shot.moduleArtifactKinds,
      "ffmpeg-frame-extractor": {"fixture-source": ["VIDEO"], "frame-review-plan": ["JSON_PLAN"]}},
    moduleInputs: {
      ...shot.moduleInputs,
      "ffmpeg-frame-extractor": {
        sourceVideoBinding: {dependencyId: source.node.id,
          acceptedManifestSha256: source.node.acceptance.manifestSha256,
          artifact: {path: source.video.path, sha256: source.video.sha256, bytes: source.video.bytes}},
        framePlanBinding: {dependencyId: plan.node.id,
          acceptedManifestSha256: plan.node.acceptance.manifestSha256,
          artifact: {path: plan.artifact.path, sha256: plan.artifact.sha256, bytes: plan.artifact.bytes}},
      },
    },
  };
});
const extractionStage = await runStage({projectId, workspaceSha256,
  context: {articleTitle: "synthetic frame extraction test", articleSha256: sha256(inputBytes)}, shots: extractionShots},
  planWorkflow, "ffmpeg-frame-extractor", "synthetic-extractor-worker", "synthetic-extractor-technical-test");
const finalWorkflow = extractionStage.workflow;

const groupResults = [];
const fixtureResults = [];
const frameResults = [];
for (const group of sourceData.groups) {
  const source = acceptedSources.get(group.id);
  const plan = acceptedPlans.get(group.id);
  const node = finalWorkflow.nodes.find((item) => item.id === `${group.id}:ffmpeg-frame-extractor`);
  assert.equal(node?.state, "succeeded");
  const artifacts = node.acceptance.artifacts;
  const receiptArtifact = artifacts.find((item) => item.role === "frame-extraction-receipt"
    && item.kind === "JSON_PLAN" && item.metadata.jsonContract === "A1NodeFfmpegFrameExtractionReceipt/v1");
  const imageArtifacts = artifacts.filter((item) => item.kind === "IMAGE").sort((a, b) => a.role.localeCompare(b.role, "en"));
  assert.ok(receiptArtifact);
  const receiptBytes = fs.readFileSync(path.join(artifactRoot, receiptArtifact.path));
  assert.equal(sha256(receiptBytes), receiptArtifact.sha256);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  assert.equal(receipt.contract, "A1NodeFfmpegFrameExtractionReceipt/v1");
  assert.equal(receipt.source.videoSha256, group.sourceVideoSha256);
  assert.equal(receipt.framePlanPolicySha256, plan.wrapper.plan.sha256);
  assert.equal(receipt.profile.fpsMode, "passthrough");
  assert.equal(receipt.profile.seekUsed, false);
  assert.equal(receipt.profile.passes, 1);
  assert.equal(receipt.proofBoundary.selectedFrameIndicesAreZeroBased, true);
  assert.equal(receipt.proofBoundary.visualApproval, "NOT_GRANTED");
  assert.equal(receipt.proofBoundary.productionAdmission, false);
  assert.equal(imageArtifacts.length, receipt.frames.length);
  assert.ok(artifacts.length <= 64, "the extraction manifest stays under the 64-artifact verifier limit");
  assert.equal(imageArtifacts.length, new Set(receipt.frames.map((item) => item.sourceFrame)).size,
    "duplicate role references resolve to one image per source frame");

  const records = [];
  for (const [ordinal, frame] of receipt.frames.entries()) {
    const image = imageArtifacts.find((item) => item.role === `source-frame-${String(ordinal).padStart(4, "0")}`);
    assert.ok(image);
    assert.equal(image.path, frame.path);
    assert.equal(image.sha256, frame.sha256);
    assert.equal(image.bytes, frame.bytes);
    const imageBytes = fs.readFileSync(path.join(artifactRoot, image.path));
    assert.equal(sha256(imageBytes), image.sha256);
    const {data, info} = await sharp(imageBytes).raw().toBuffer({resolveWithObject: true});
    assert.deepEqual({format: info.format, width: info.width, height: info.height, channels: info.channels},
      {format: "raw", width: 160, height: 90, channels: 3});
    const center = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    const centerRgb = [...data.subarray(center, center + 3)];
    const expectedRgb = [frame.sourceFrame % 256, Math.floor(frame.sourceFrame / 256) + frameIndexBias.get(group.id),
      frameColorBase.get(group.id)];
    assert.deepEqual(centerRgb, expectedRgb, `${group.id} output ordinal ${ordinal} must encode source frame ${frame.sourceFrame}`);
    const entry = {sourceFrame: frame.sourceFrame, ordinal, referenceCount: frame.references.length,
      references: frame.references, image: {path: image.path, sha256: image.sha256, bytes: image.bytes},
      centerRgb, expectedRgb};
    records.push(entry);
    frameResults.push({groupId: group.id, genre: group.genre, ...entry});
  }

  for (const sequence of group.sequences) {
    const refs = plan.wrapper.plan.references.filter((entry) => entry.sequenceId === sequence.sequenceId);
    const frames = [...new Set(refs.map((entry) => entry.sourceFrame))].sort((a, b) => a - b);
    const extracted = records.filter((record) => record.references.some((reference) => reference.sequenceId === sequence.sequenceId));
    assert.deepEqual(extracted.map((record) => record.sourceFrame).sort((a, b) => a - b), frames,
      `${sequence.sequenceId} must map every planned frame to one extracted image`);
    fixtureResults.push({id: sequence.sequenceId, genre: group.genre, sourceVideoSha256: group.sourceVideoSha256,
      sourceFrames: frames, referenceCount: refs.length, uniqueFrames: frames.length, extractedImages: extracted.length,
      planNodeId: plan.node.id, planSha256: plan.wrapper.plan.sha256, extractorNodeId: node.id});
  }
  groupResults.push({id: group.id, genre: group.genre, fps: group.fps, totalFrames: group.totalFrames,
    sourceVideo: {sha256: source.video.sha256, bytes: source.video.bytes, width: source.video.metadata.width,
      height: source.video.metadata.height, durationSeconds: source.video.metadata.durationSeconds,
      codec: source.video.metadata.codec, pixelFormat: source.video.metadata.pixelFormat},
    sourceNodeId: source.node.id, sourceAcceptanceManifestSha256: source.node.acceptance.manifestSha256,
    planNodeId: plan.node.id, planSha256: plan.wrapper.plan.sha256,
    extractorNodeId: node.id, extractorInputSha256: node.inputSha256,
    extractorAcceptanceManifestSha256: node.acceptance.manifestSha256,
    extractedFrames: records.length, roleReferences: records.reduce((sum, item) => sum + item.references.length, 0),
    frames: records, receipt: {path: receiptArtifact.path, sha256: receiptArtifact.sha256, bytes: receiptArtifact.bytes},
    verificationScope: node.acceptance.verificationScope, visualApproval: node.acceptance.visualApproval,
    productionAdmission: node.acceptance.productionAdmission});
}

assert.equal(groupResults.length, 3);
assert.equal(fixtureResults.length, 6);
assert.equal(new Set(fixtureResults.map((fixture) => fixture.genre)).size, 3);
assert.equal(frameResults.length, 16);
assert.equal(new Set(frameResults.map((frame) => `${frame.groupId}:${frame.sourceFrame}`)).size, 16);
assert.equal(fixtureResults.reduce((sum, item) => sum + item.referenceCount, 0), 18);
assert.equal(fixtureResults.reduce((sum, item) => sum + item.uniqueFrames, 0), 16);
assert.equal(groupResults.reduce((sum, item) => sum + item.roleReferences, 0), 18);

const cellWidth = 320, imageHeight = 180, labelHeight = 34, cellHeight = imageHeight + labelHeight;
const cells = [];
for (const [index, frame] of frameResults.entries()) {
  const sourceBytes = fs.readFileSync(path.join(artifactRoot, frame.image.path));
  const preview = await sharp(sourceBytes).resize(cellWidth, imageHeight, {fit: "fill"}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#f4f1e9"/><text x="8" y="14" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#111820">${frame.genre} · n=${frame.sourceFrame}</text><text x="8" y="28" font-family="Arial,sans-serif" font-size="10" fill="#465261">RGB ${frame.centerRgb.join(",")} · ${frame.referenceCount} role refs</text></svg>`, "utf8");
  const cellBytes = await sharp({create: {width: cellWidth, height: cellHeight, channels: 4,
    background: {r: 244, g: 241, b: 233, alpha: 1}}})
    .composite([{input: label, left: 0, top: 0}, {input: preview, left: 0, top: labelHeight}]).png().toBuffer();
  cells.push({index, bytes: cellBytes});
}
const contactSheet = await sharp({create: {width: cellWidth * 4, height: cellHeight * 4, channels: 4,
  background: {r: 244, g: 241, b: 233, alpha: 1}}})
  .composite(cells.map(({index, bytes}) => ({input: bytes, left: (index % 4) * cellWidth, top: Math.floor(index / 4) * cellHeight})))
  .png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(contactSheetPath, contactSheet);

const groupsByGenre = groupResults.map((group) => ({id: group.id, genre: group.genre, sourceVideoSha256: group.sourceVideo.sha256,
  frameCount: group.extractedFrames, uniqueFrames: group.frames.map((frame) => frame.sourceFrame)}));
const result = {
  contract: "A1NodeFfmpegFrameExtractorWorkflowIntegration/v1",
  status: "PASS",
  phaseId: "ffmpeg-frame-extraction-adapter-v1",
  createdAt: "2026-09-28",
  inputPlan: {path: path.relative(repoRoot, inputPath).split(path.sep).join("/"), sha256: sha256(inputBytes),
    sequenceCount: fixtureResults.length, genreCount: new Set(fixtureResults.map((item) => item.genre)).size},
  scheduler: {contract: "A1NodeWorkflow/v1", sourceFixtureNodesAccepted: sourceStage.acceptedCount,
    frameReviewPlanNodesAccepted: planStage.acceptedCount, extractorNodesAccepted: extractionStage.acceptedCount,
    maxConcurrentClaims: 2, defaultRegistryRegistered: false,
    modules: ["fixture-source", "frame-review-plan", "ffmpeg-frame-extractor"],
    injectedOnlyModules: ["fixture-source", "ffmpeg-frame-extractor"]},
  toolchain: {ffmpegPath, version: extractorAdapter.tool.version, binarySha256: extractorAdapter.tool.binarySha256,
    ffprobePath, extractorProfile: "ffmpeg-select-source-n-png-passthrough-v1"},
  syntheticFixture: {kind: "lossless-index-coded-cfr", container: "AVI", encoder: "FFV1", bitexactEncoding: true,
    dimensions: [160, 90], frameRates: [...new Set(sourceData.groups.map((group) => group.fps))],
    totalFrames: sourceData.groups.map((group) => group.totalFrames), sourceGroups: groupsByGenre,
    colorOracle: "center RGB encodes source frame index as R=frame%256, G=floor(frame/256)+groupBias, B=groupBase"},
  groups: groupResults,
  fixtures: fixtureResults,
  summary: {genreCount: 3, sequenceCount: 6, sourceGroups: 3, plannedRoleReferences: 18,
    plannedUniqueFrames: 16, extractedImages: frameResults.length,
    duplicateRoleReferencesDeduplicated: 2, perNodeImageLimit: 60, largestNodeImageCount: Math.max(...groupResults.map((group) => group.extractedFrames)),
    exactSourceFramePixelChecks: frameResults.length, humanImageReview: 0},
  visibleArtifact: {path: path.relative(repoRoot, contactSheetPath).split(path.sep).join("/"), sha256: sha256(contactSheet),
    bytes: contactSheet.length, width: cellWidth * 4, height: cellHeight * 4},
  proofBoundary: {verificationScope: "BYTES_AND_FORMAT_ONLY", exactFrameOracle: "SYNTHETIC_FRAME_INDEX_PIXEL_CODE",
    sourceVideoDecodePasses: 3, actualHuBoFramesRead: 0, visualApproval: "NOT_GRANTED", productionAdmission: false,
    defaultRegistryChanged: false, formalAuthorityModified: false, userSourceRead: false,
    CPUDecodeSavingsMeasured: false, productionIntegration: false},
  visualReview: {status: "PENDING_INDEPENDENT_CONTACT_SHEET_REVIEW", visualApproval: "NOT_GRANTED",
    productionAdmission: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({...result, resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/")}, null, 2));
