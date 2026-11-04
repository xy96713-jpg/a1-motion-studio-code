#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFile, execFileSync} from "node:child_process";
import {promisify} from "node:util";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {
  compileNodeWorkflow, claimNodeTasks, finishNodeTask, nodeInputHash, NODE_WORKFLOW_CONTRACT,
} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {
  createNodeAdapterRegistry, createNodeArtifactVerificationContextV1,
  closeNodeArtifactVerificationContextV1, getNodeArtifactVerificationContextSummaryV1,
  executeRegisteredNode,
} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts, NODE_ARTIFACT_MANIFEST_CONTRACT} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {
  A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1,
  A1_NODE_FFMPEG_SCDET_CANDIDATE_SET_V1,
  createNodeFfmpegScdetCandidateAdapterV1,
} from "../apps/studio-next/src/lib/a1-node-ffmpeg-scdet-candidate-adapter-v1.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const startedAt = Date.now();
const taskRoot = path.join(repoRoot, "work/ffmpeg-scdet-source-signal-pilot-v1");
const runId = Date.now().toString(36) + "-" + process.pid;
const sourceRoot = path.join(taskRoot, "sources", runId);
const outputRoot = path.join(taskRoot, "artifacts", runId);
const resultPath = path.join(taskRoot, "result.json");
const boardPath = path.join(taskRoot, "scdet-candidate-signal-board.png");
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
const sourceManifestContract = "A1FrameReviewSourceManifest/v1";
const planContext = {articleTitle: "synthetic FFmpeg scene score evaluation",
  articleSha256: sha256(Buffer.from("ffmpeg-scdet-synthetic-source-signal-pilot-v1", "utf8"))};
const projectId = "ffmpeg-scdet-source-signal-pilot-v1";
const workspaceSha256 = sha256(Buffer.from("synthetic-ffmpeg-scdet-workspace-v1", "utf8"));
const sourceAdapterSha256 = sha256(Buffer.from("synthetic-scdet-source-fixture-v1", "utf8"));
const sweepThresholds = [8, 10, 14];

const fixtureDefinitions = [
  {id: "scdet-explainer-stable-cut-v1", genre: "evidence-explainer", fps: 25, totalFrames: 125,
    durationSeconds: 5, gop: 50, cuts: [50, 75], sceneColors: ["0x101010", "0xf0f0f0", "0x202020"]},
  {id: "scdet-tutorial-motion-without-cut-v1", genre: "product-tutorial", fps: 30, totalFrames: 120,
    durationSeconds: 4, gop: 60, cuts: [], movingSquare: true},
  {id: "scdet-opinion-adjacent-cuts-v1", genre: "personal-opinion", fps: 60, totalFrames: 241,
    durationSeconds: 241 / 60, gop: 120, cuts: [120, 121], sceneColors: ["0x202020", "0xffffff", "0x3030e0"]},
];

fs.mkdirSync(sourceRoot, {recursive: true});
fs.mkdirSync(outputRoot, {recursive: true});

async function generateClip(group) {
  const root = path.join(sourceRoot, group.id);
  const filename = path.join(root, "media", "synthetic-source.mp4");
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  if (group.movingSquare) {
    const source = `color=c=black:s=96x54:r=${group.fps}:d=${group.durationSeconds}`
      + ",drawbox=x='44+36*sin(PI*t/2)':y=20:w=8:h=8:color=white:t=fill,format=rgb24";
    await execFileAsync(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", source, "-frames:v", String(group.totalFrames), "-an", "-sn", "-dn",
      "-c:v", "libx264rgb", "-crf", "0", "-preset", "ultrafast", "-bf", "0", "-g", String(group.gop),
      "-keyint_min", String(group.gop), "-sc_threshold", "0", "-pix_fmt", "rgb24", "-fps_mode", "cfr",
      "-video_track_timescale", "90000", "-threads", "1", "-y", filename],
    {encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024});
  } else if (group.id === "scdet-explainer-stable-cut-v1") {
    const [dark, white, darkAfter] = group.sceneColors;
    const input = `color=c=${dark}:s=96x54:r=${group.fps}:d=2.0,`
      + `geq=r='if(eq(X,0)*eq(Y,0),mod(N,256),16)':g='if(eq(X,0)*eq(Y,0),mod(floor(N/256),256),16)':b='if(eq(X,0)*eq(Y,0),mod(floor(N/65536),256),16)'`;
    const inputWhite = `color=c=${white}:s=96x54:r=${group.fps}:d=1.0,`
      + `geq=r='if(eq(X,0)*eq(Y,0),mod(N+50,256),240)':g='if(eq(X,0)*eq(Y,0),mod(floor((N+50)/256),256),240)':b='if(eq(X,0)*eq(Y,0),mod(floor((N+50)/65536),256),240)'`;
    const inputDarkAfter = `color=c=${darkAfter}:s=96x54:r=${group.fps}:d=2.0,`
      + `geq=r='if(eq(X,0)*eq(Y,0),mod(N+75,256),32)':g='if(eq(X,0)*eq(Y,0),mod(floor((N+75)/256),256),32)':b='if(eq(X,0)*eq(Y,0),mod(floor((N+75)/65536),256),32)'`;
    await execFileAsync(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", input, "-f", "lavfi", "-i", inputWhite, "-f", "lavfi", "-i", inputDarkAfter,
      "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=rgb24[out]", "-map", "[out]",
      "-frames:v", String(group.totalFrames), "-an", "-sn", "-dn", "-c:v", "libx264rgb", "-crf", "0",
      "-preset", "ultrafast", "-bf", "0", "-g", String(group.gop), "-keyint_min", String(group.gop),
      "-sc_threshold", "0", "-pix_fmt", "rgb24", "-fps_mode", "cfr", "-video_track_timescale", "90000",
      "-threads", "1", "-y", filename],
    {encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024});
  } else {
    const [dark, flash, blue] = group.sceneColors;
    const oneFrame = 1 / group.fps;
    const inputs = [
      `color=c=${dark}:s=96x54:r=${group.fps}:d=2.0,format=rgb24`,
      `color=c=${flash}:s=96x54:r=${group.fps}:d=1.0,trim=end_frame=1,setpts=PTS-STARTPTS,format=rgb24`,
      `color=c=${blue}:s=96x54:r=${group.fps}:d=2.0,format=rgb24`,
    ];
    assert.ok(oneFrame > 0);
    await execFileAsync(ffmpegPath, ["-nostdin", "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", inputs[0], "-f", "lavfi", "-i", inputs[1], "-f", "lavfi", "-i", inputs[2],
      "-filter_complex", "[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[2:v]setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0,format=rgb24[out]",
      "-map", "[out]", "-frames:v", String(group.totalFrames), "-an", "-sn", "-dn", "-c:v", "libx264rgb",
      "-crf", "0", "-preset", "ultrafast", "-bf", "0", "-g", String(group.gop), "-keyint_min", String(group.gop),
      "-sc_threshold", "0", "-pix_fmt", "rgb24", "-r", String(group.fps), "-fps_mode", "cfr", "-video_track_timescale", "90000",
      "-threads", "1", "-y", filename],
    {encoding: "utf8", timeout: 120_000, maxBuffer: 1024 * 1024});
  }
  const bytes = fs.readFileSync(filename);
  return {root, filename, bytes, sourceVideoSha256: sha256(bytes), sourceVideoBytes: bytes.length};
}

async function acceptSourceNode(group, clip) {
  const sourceVideoPath = clip.filename;
  const manifestPath = path.join(clip.root, "metadata", "frame-source-manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), {recursive: true});
  fs.writeFileSync(manifestPath, `${JSON.stringify({contract: sourceManifestContract,
    sourceVideoSha256: clip.sourceVideoSha256, fps: group.fps, totalFrames: group.totalFrames}, null, 2)}\n`,
  {flag: "wx", mode: 0o600});
  const nodeId = `source-${group.id}`;
  const input = {fixture: "synthetic-ffmpeg-scdet-source", sourceVideoSha256: clip.sourceVideoSha256,
    fps: group.fps, totalFrames: group.totalFrames};
  const inputSha256 = nodeInputHash({input, dependencies: {inputs: [], artifactKinds: {}}});
  const result = {state: "needs-review", reason: "SYNTHETIC_SOURCE_REQUIRES_TECHNICAL_ACCEPTANCE",
    productionAdmission: false, summary: {sourceVideoSha256: clip.sourceVideoSha256, fps: group.fps,
      totalFrames: group.totalFrames, durationSeconds: group.totalFrames / group.fps},
    artifactManifest: {contract: "A1NodeArtifactManifest/v1", nodeId, inputSha256,
      productionAdmission: false, artifacts: [
        fileRecord(clip.root, sourceVideoPath, "source-video", "VIDEO", {expectedMedia: {
          width: 96, height: 54, fps: group.fps, durationSeconds: group.totalFrames / group.fps,
        }}),
        fileRecord(clip.root, manifestPath, "frame-review-source-manifest", "JSON_PLAN",
          {jsonContract: sourceManifestContract}),
      ]}};
  const node = {id: nodeId, shotId: group.id, module: "synthetic-source", input, inputSha256,
    dependencies: [], dependencyArtifactKinds: {}, state: "needs-review", reason: result.reason,
    attempt: 1, maxAttempts: 2, result, acceptance: null};
  const accepted = await acceptNodeArtifacts({contract: NODE_WORKFLOW_CONTRACT, projectId, workspaceSha256,
    scope: "REVIEW_ONLY", productionAdmission: false, modules: {}, nodes: [node]}, nodeId,
  {artifactRoot: clip.root, reviewerId: "synthetic-scdet-source-acceptance", ffprobePath,
    now: 1_100_000 + group.fps});
  const sourceNode = accepted.nodes.find((item) => item.id === nodeId);
  const video = sourceNode.acceptance.artifacts.find((artifact) => artifact.role === "source-video" && artifact.kind === "VIDEO");
  const manifest = sourceNode.acceptance.artifacts.find((artifact) => artifact.role === "frame-review-source-manifest"
    && artifact.kind === "JSON_PLAN" && artifact.metadata?.jsonContract === sourceManifestContract);
  assert.equal(video.sha256, clip.sourceVideoSha256);
  assert.ok(manifest);
  return {sourceNode, clip, video, manifest,
    sourceVideoBinding: {dependencyId: sourceNode.id, acceptedManifestSha256: sourceNode.acceptance.manifestSha256,
      artifact: {path: video.path, sha256: video.sha256, bytes: video.bytes}},
    sourceManifestBinding: {dependencyId: sourceNode.id, acceptedManifestSha256: sourceNode.acceptance.manifestSha256,
      artifact: {path: manifest.path, sha256: manifest.sha256, bytes: manifest.bytes}}};
}

function moduleFlags(moduleId, active) {
  return {material: false, typography: false, recording: false, diagram: false,
    [moduleId]: active === moduleId};
}

async function runCandidateStage(input, previous, {registry, verificationContext, artifactRoot: artifacts,
  reviewerId, workerId} = {}) {
  let workflow = compileNodeWorkflow(input, previous, {moduleDefinitions: registry.definitions});
  let clockNow = 1_200_000, acceptedCount = 0, maxClaims = 0;
  while (workflow.nodes.some((node) => node.module === A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1
    && ["queued", "running", "needs-review"].includes(node.state))) {
    workflow = compileNodeWorkflow(input, workflow, {moduleDefinitions: registry.definitions});
    const claimed = claimNodeTasks(workflow, {workerId, now: clockNow});
    if (!claimed.claims.length) {
      const stuck = workflow.nodes.filter((node) => node.module === A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1
        && !["succeeded", "skipped"].includes(node.state));
      assert.deepEqual(stuck.map((node) => [node.id, node.state, node.reason]), [], "scdet stage must not stall");
      break;
    }
    assert.ok(claimed.claims.length <= 2);
    assert.ok(claimed.claims.every((claim) => claim.module === A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1));
    maxClaims = Math.max(maxClaims, claimed.claims.length);
    workflow = claimed.workflow;
    const results = await Promise.all(claimed.claims.map((claim) => executeRegisteredNode(workflow, claim, {
      registry: registry.registry, artifactRoot: artifacts, ffprobePath, verificationContext, now: clockNow + 1,
    })));
    for (let i = 0; i < claimed.claims.length; i += 1) {
      const claim = claimed.claims[i], result = results[i];
      assert.equal(result.state, "needs-review", `${claim.id}: ${result.reason || "unexpected scdet status"}`);
      assert.equal(result.productionAdmission, false);
      workflow = finishNodeTask(workflow, claim, result, clockNow + 2);
      workflow = await acceptNodeArtifacts(workflow, claim.id, {artifactRoot: artifacts,
        reviewerId, ffprobePath, now: clockNow + 3});
      const node = workflow.nodes.find((item) => item.id === claim.id);
      assert.equal(node?.state, "succeeded");
      assert.equal(node.acceptance.visualApproval, "NOT_GRANTED");
      assert.equal(node.acceptance.productionAdmission, false);
      acceptedCount += 1;
      clockNow += 10;
    }
  }
  return {workflow, acceptedCount, maxClaims};
}

const adapter = createNodeFfmpegScdetCandidateAdapterV1({ffmpegPath});
const moduleId = A1_NODE_FFMPEG_SCDET_CANDIDATE_MODULE_ID_V1;
const registry = createNodeAdapterRegistry({[moduleId]: adapter});
const sourceVerificationContext = createNodeArtifactVerificationContextV1({ffprobePath});
assert.equal(sourceVerificationContext.enabled, true);
assert.equal(createNodeAdapterRegistry().registry[moduleId], undefined,
  "scdet candidate adapter must not enter the default production registry");

const sourceStartedAt = Date.now();
const sourceRecords = [];
for (const group of fixtureDefinitions) {
  const clip = await generateClip(group);
  const accepted = await acceptSourceNode(group, clip);
  sourceRecords.push({group, ...accepted});
}
const sourceGenerationAndAcceptanceMs = Date.now() - sourceStartedAt;
const sourceWorkflow = {contract: NODE_WORKFLOW_CONTRACT, projectId, workspaceSha256, scope: "REVIEW_ONLY",
  productionAdmission: false, modules: registry.definitions, nodes: sourceRecords.map((record) => record.sourceNode)};
const detectorShots = sourceRecords.map((record) => ({
  id: `detect-${record.group.id}`,
  source: `Produce review-only FFmpeg scene-change candidates for ${record.group.genre}`,
  modules: moduleFlags(moduleId, moduleId),
  moduleDependencyBindings: {[moduleId]: [{nodeId: record.sourceNode.id, artifactKinds: ["VIDEO", "JSON_PLAN"]}]},
  moduleInputs: {[moduleId]: {sourceVideoBinding: structuredClone(record.sourceVideoBinding),
    sourceManifestBinding: structuredClone(record.sourceManifestBinding), threshold: 10}},
}));
const detectionStartedAt = Date.now();
const detectionStage = await runCandidateStage({projectId, workspaceSha256, context: planContext, shots: detectorShots},
  sourceWorkflow, {registry, verificationContext: sourceVerificationContext, artifactRoot: outputRoot,
    reviewerId: "synthetic-scdet-candidate-technical-acceptance", workerId: "synthetic-scdet-review-worker"});
const detectionElapsedMs = Date.now() - detectionStartedAt;
assert.equal(detectionStage.acceptedCount, fixtureDefinitions.length);
assert.equal(detectionStage.maxClaims, 2);

const detected = sourceRecords.map((record) => {
  const node = detectionStage.workflow.nodes.find((item) => item.module === moduleId
    && item.result?.summary?.sourceVideoSha256 === record.clip.sourceVideoSha256);
  assert.equal(node?.state, "succeeded");
  const artifact = node.acceptance.artifacts.find((item) => item.role === "scdet-candidate-set"
    && item.kind === "JSON_PLAN" && item.metadata?.jsonContract === A1_NODE_FFMPEG_SCDET_CANDIDATE_SET_V1);
  assert.ok(artifact);
  const artifactPath = path.join(node.acceptance.artifactRoot, artifact.path);
  const candidateSet = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.equal(candidateSet.contract, A1_NODE_FFMPEG_SCDET_CANDIDATE_SET_V1);
  assert.equal(candidateSet.source.sourceVideoSha256, record.clip.sourceVideoSha256);
  assert.equal(candidateSet.source.acceptedSourceManifestSha256, record.sourceNode.acceptance.manifestSha256);
  assert.equal(candidateSet.source.sourceManifestSha256, record.sourceManifestBinding.artifact.sha256);
  assert.equal(node.result.summary.sourceManifestSha256, record.sourceManifestBinding.artifact.sha256);
  assert.equal(node.result.summary.sourceIntegrityMode, "RUN_SCOPED_ATTESTATION_STAT_RECHECK",
    "the scdet adapter must reuse the scheduler's current source verification attestation");
  assert.equal(node.result.summary.sourceVideoFullSha256Passes, 0,
    "a current scheduler attestation must avoid adapter-level duplicate source hashes");
  assert.equal(candidateSet.frames.length, record.group.totalFrames);
  assert.equal(candidateSet.candidates.every((item) => item.status === "CANDIDATE_ONLY" && item.confidence === null), true);
  assert.equal(candidateSet.detector.scPass, 0);
  assert.equal(candidateSet.reviewBoundary.visualApproval, false);
  assert.equal(candidateSet.reviewBoundary.productionAdmission, false);
  return {...record, detectorNode: node, candidateArtifact: artifact,
    candidateArtifactPath: artifactPath, candidateSet};
});
const verificationBeforeClose = getNodeArtifactVerificationContextSummaryV1(sourceVerificationContext);
assert.equal(verificationBeforeClose.counters.sourceVideoShaPassCount, sourceRecords.length,
  "the scheduler context should SHA-verify each accepted video once");
assert.equal(verificationBeforeClose.counters.genericMediaMetadataProbeCount, sourceRecords.length,
  "the scheduler context should metadata-probe each accepted video once");

const analyzeAtThreshold = (fixture, threshold) => {
  const candidates = fixture.candidateSet.frames.filter((frame) => frame.rawScore >= threshold);
  const gt = new Set(fixture.group.cuts);
  const detected = new Set(candidates.map((frame) => frame.sourceFrame));
  const truePositiveFrames = [...gt].filter((frame) => detected.has(frame));
  const falsePositiveFrames = [...detected].filter((frame) => !gt.has(frame));
  const falseNegativeFrames = [...gt].filter((frame) => !detected.has(frame));
  const tp = truePositiveFrames.length;
  return {threshold, candidateCount: candidates.length, truePositiveCount: tp,
    falsePositiveCount: falsePositiveFrames.length, falseNegativeCount: falseNegativeFrames.length,
    precision: candidates.length ? Number((tp / candidates.length).toFixed(4)) : null,
    recall: gt.size ? Number((tp / gt.size).toFixed(4)) : null,
    truePositiveFrames, falsePositiveFrames, falseNegativeFrames};
};

const fixtureResults = detected.map((fixture) => {
  const allFrames = fixture.candidateSet.frames;
  assert.equal(allFrames.every((frame, index) => frame.sourceFrame === index), true,
    `${fixture.group.id}: candidate frames must preserve source decode ordinals`);
  assert.equal(allFrames.every((frame, index) => index === 0
    || frame.ptsTime > allFrames[index - 1].ptsTime), true, `${fixture.group.id}: PTS must increase strictly`);
  assert.equal(allFrames.every((frame, index) => index === 0
    || Math.abs((frame.ptsTime - allFrames[index - 1].ptsTime) - 1 / fixture.group.fps) < 0.5 / fixture.group.fps), true,
  `${fixture.group.id}: source PTS spacing must match its declared CFR rate`);
  const thresholdMetrics = sweepThresholds.map((threshold) => analyzeAtThreshold(fixture, threshold));
  const defaultMetrics = thresholdMetrics.find((row) => row.threshold === 10);
  assert.ok(defaultMetrics);
  const boundaryOffsetEvidence = fixture.group.cuts.map((expectedFrame) => {
    const nearest = defaultMetrics.truePositiveFrames.concat(defaultMetrics.falsePositiveFrames)
      .map((candidateFrame) => ({candidateFrame, offsetFrames: candidateFrame - expectedFrame}))
      .sort((a, b) => Math.abs(a.offsetFrames) - Math.abs(b.offsetFrames)
        || a.candidateFrame - b.candidateFrame)[0] || null;
    return {expectedFrame, exactMatch: Boolean(nearest && nearest.offsetFrames === 0),
      nearestCandidateFrame: nearest?.candidateFrame ?? null, nearestOffsetFrames: nearest?.offsetFrames ?? null};
  });
  assert.deepEqual(fixture.candidateSet.candidates.map((row) => row.sourceFrame).sort((a, b) => a - b),
    allFrames.filter((row) => row.rawScore >= 10).map((row) => row.sourceFrame).sort((a, b) => a - b),
    "artifact candidate list must match its declared raw score threshold");
  return {
    id: fixture.group.id,
    genre: fixture.group.genre,
    fps: fixture.group.fps,
    totalFrames: fixture.group.totalFrames,
    sourceVideoSha256: fixture.clip.sourceVideoSha256,
    sourceVideoBytes: fixture.clip.sourceVideoBytes,
    sourceVideoArtifact: {path: pathRelative(path.join(fixture.clip.root, fixture.video.path)),
      sha256: fixture.video.sha256, bytes: fixture.video.bytes},
    sourceManifestArtifact: {path: pathRelative(path.join(fixture.clip.root, fixture.manifest.path)),
      sha256: fixture.manifest.sha256, bytes: fixture.manifest.bytes,
      acceptedManifestSha256: fixture.sourceNode.acceptance.manifestSha256},
    sourceManifestArtifactSha256: fixture.sourceManifestBinding.artifact.sha256,
    sourceAcceptanceManifestSha256: fixture.sourceNode.acceptance.manifestSha256,
    candidateSetSha256: fixture.candidateSet.sha256,
    candidateSetArtifact: {path: pathRelative(fixture.candidateArtifactPath),
      sha256: fixture.candidateArtifact.sha256, bytes: fixture.candidateArtifact.bytes,
      acceptedManifestSha256: fixture.detectorNode.acceptance.manifestSha256},
    detector: fixture.candidateSet.tool,
    filter: fixture.candidateSet.detector.filterGraph,
    scoreSemantics: fixture.candidateSet.detector.scoreSemantics,
    scoreCalibration: fixture.candidateSet.detector.scoreCalibration,
    exactMetadataFrameCount: allFrames.length,
    sourceIntegrity: {mode: fixture.detectorNode.result.summary.sourceIntegrityMode,
      schedulerSourceVideoShaPasses: 1,
      adapterSourceVideoShaPasses: fixture.detectorNode.result.summary.sourceVideoFullSha256Passes,
      adapterSourceVideoBytesHashed: fixture.detectorNode.result.summary.sourceVideoBytesHashed,
      sourceManifestShaPasses: fixture.detectorNode.result.summary.sourceManifestFullSha256Passes},
    sourceFrameOrdinalSequence: "PASS",
    sourcePtsSequence: "PASS",
    groundTruthCutFrames: fixture.group.cuts,
    thresholdMetrics,
    defaultThresholdMetrics: defaultMetrics,
    boundaryOffsetEvidence,
    outputCandidates: fixture.candidateSet.candidates,
    candidateOnly: fixture.candidateSet.candidates.every((row) => row.status === "CANDIDATE_ONLY" && row.confidence === null),
    proofBoundary: {syntheticOnly: true, visualApproval: "NOT_GRANTED", productionAdmission: false},
  };
});

const aggregateByThreshold = sweepThresholds.map((threshold) => {
  const rows = fixtureResults.map((fixture) => fixture.thresholdMetrics.find((item) => item.threshold === threshold));
  const cutFixtureRows = fixtureResults.filter((fixture) => fixture.groundTruthCutFrames.length)
    .map((fixture) => fixture.thresholdMetrics.find((item) => item.threshold === threshold));
  const cutTruthCount = fixtureResults.reduce((sum, fixture) => sum + fixture.groundTruthCutFrames.length, 0);
  const tp = cutFixtureRows.reduce((sum, row) => sum + row.truePositiveCount, 0);
  const fp = rows.reduce((sum, row) => sum + row.falsePositiveCount, 0);
  const fn = cutFixtureRows.reduce((sum, row) => sum + row.falseNegativeCount, 0);
  const noCutFalsePositives = fixtureResults.filter((fixture) => !fixture.groundTruthCutFrames.length)
    .flatMap((fixture) => fixture.thresholdMetrics.find((item) => item.threshold === threshold).falsePositiveFrames);
  return {threshold, cutGroundTruthCount: cutTruthCount, truePositiveCount: tp,
    falsePositiveCount: fp, falseNegativeCount: fn,
    precision: tp + fp ? Number((tp / (tp + fp)).toFixed(4)) : null,
    recall: cutTruthCount ? Number((tp / cutTruthCount).toFixed(4)) : null,
    motionWithoutCutFalsePositiveCount: noCutFalsePositives.length};
});

assert.equal(fixtureResults.length, 3);
assert.equal(new Set(fixtureResults.map((fixture) => fixture.genre)).size, 3);
assert.equal(fixtureResults.every((fixture) => fixture.candidateOnly), true,
  "scdet output must remain raw candidates with no synthesized confidence");
assert.equal(fixtureResults.every((fixture) => fixture.scoreCalibration === "NOT_ESTABLISHED"), true);

closeNodeArtifactVerificationContextV1(sourceVerificationContext);
const verificationAfterClose = getNodeArtifactVerificationContextSummaryV1(sourceVerificationContext);
assert.equal(verificationAfterClose.closed, true);
assert.equal(verificationAfterClose.acceptedNodeVerificationCacheEntryCount, 0);
assert.equal(verificationAfterClose.inFlightVerificationCount, 0);

const imageWidth = 1_760, imageHeight = 980;
const panelTop = 160, panelHeight = 255, plotLeft = 300, plotWidth = 1_400, plotHeight = 150;
const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">`,
  `<rect width="100%" height="100%" fill="#f7f5ef"/>`,
  `<style>.title{font:700 26px Arial,sans-serif;fill:#17212b}.sub{font:13px Arial,sans-serif;fill:#59636d}.head{font:700 12px Arial,sans-serif;fill:#59636d;letter-spacing:1px}.label{font:700 14px Arial,sans-serif;fill:#1e2932}.body{font:11px Arial,sans-serif;fill:#53606b}.foot{font:12px Arial,sans-serif;fill:#66717a}</style>`,
  `<text x="32" y="38" class="title">FFmpeg scdet · SOURCE-BOUND CUT CANDIDATES</text>`,
  `<text x="32" y="65" class="sub">FFmpeg 7.1 metadata-only pass · threshold 10 raw score · candidate score is not confidence · no scene is automatically approved</text>`,
  `<text x="32" y="91" class="sub">Green lines = synthetic ground-truth cuts · amber dots = threshold candidates · red dots = false positives · y-axis shows raw scdet score</text>`];
for (const [index, fixture] of fixtureResults.entries()) {
  const group = fixtureDefinitions.find((item) => item.id === fixture.id);
  const top = panelTop + index * panelHeight;
  const baseline = top + plotHeight;
  const rawFrames = detected[index].candidateSet.frames;
  const candidates = new Set(fixture.defaultThresholdMetrics.truePositiveFrames.concat(fixture.defaultThresholdMetrics.falsePositiveFrames));
  svg.push(`<rect x="20" y="${top - 24}" width="1720" height="240" rx="8" fill="${index % 2 ? "#ffffff" : "#efebe2"}" stroke="#d9d4ca"/>`);
  svg.push(`<text x="36" y="${top}" class="label">${fixture.genre} · ${fixture.id}</text>`);
  const cutLabel = group.cuts.length ? `GT f${group.cuts.join(", f")}` : "GT cuts none";
  svg.push(`<text x="36" y="${top + 21}" class="body">${group.fps}fps · ${group.totalFrames} frames · ${cutLabel} · candidates@10 ${fixture.defaultThresholdMetrics.candidateCount} · TP/FP/FN ${fixture.defaultThresholdMetrics.truePositiveCount}/${fixture.defaultThresholdMetrics.falsePositiveCount}/${fixture.defaultThresholdMetrics.falseNegativeCount}</text>`);
  svg.push(`<line x1="${plotLeft}" y1="${baseline}" x2="${plotLeft + plotWidth}" y2="${baseline}" stroke="#8d969e" stroke-width="1"/>`);
  svg.push(`<line x1="${plotLeft}" y1="${baseline - plotHeight * 0.1}" x2="${plotLeft + plotWidth}" y2="${baseline - plotHeight * 0.1}" stroke="#ce8c35" stroke-width="1" stroke-dasharray="5 4"/>`);
  svg.push(`<text x="${plotLeft + plotWidth + 4}" y="${baseline - plotHeight * 0.1 + 4}" class="body">10</text>`);
  for (const cut of group.cuts) {
    const x = plotLeft + (cut / Math.max(1, group.totalFrames - 1)) * plotWidth;
    svg.push(`<line x1="${x.toFixed(1)}" y1="${top + 32}" x2="${x.toFixed(1)}" y2="${baseline}" stroke="#318a6b" stroke-width="2"/>`);
  }
  for (const frame of rawFrames) {
    const x = plotLeft + (frame.sourceFrame / Math.max(1, group.totalFrames - 1)) * plotWidth;
    const score = Math.max(0, Math.min(100, frame.rawScore));
    const y = baseline - (score / 100) * plotHeight;
    if (score >= 10) {
      const color = group.cuts.includes(frame.sourceFrame) ? "#d38b30" : "#be584d";
      svg.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${color}" stroke="#fff" stroke-width="1"/>`);
    } else if (score > 0) {
      svg.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="#80909a" opacity="0.42"/>`);
    }
  }
}
svg.push(`<text x="32" y="${imageHeight - 20}" class="foot">Synthetic score-to-frame mapping only. Threshold sweeps and raw per-frame scores are in result.json; real detector calibration and sampler admission remain unproven.</text></svg>`);
const boardBytes = await sharp(Buffer.from(svg.join("\n"), "utf8")).png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(boardPath, boardBytes);

const implementationPaths = [
  "apps/studio-next/src/lib/a1-node-ffmpeg-scdet-candidate-adapter-v1.mjs",
  "apps/studio-next/src/lib/a1-node-workflow-v1.mjs",
  "apps/studio-next/src/lib/a1-node-module-execution-v1.mjs",
  "apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs",
  "apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs",
  "scripts/test-a1-node-ffmpeg-scdet-candidate-adapter-v1.mjs",
  "scripts/build-ffmpeg-scdet-source-signal-pilot-v1.mjs",
  "docs/NODE_WORKFLOW_SOP.md",
  "work/ffmpeg-scdet-source-signal-pilot-v1/REUSE_DECISION.md",
];
const implementationBindings = implementationPaths.map((file) => ({path: file,
  sha256: sha256(fs.readFileSync(path.join(repoRoot, file)))}));
const contextAfterClose = verificationAfterClose;
const totalGroundTruthCuts = fixtureResults.reduce((sum, fixture) => sum + fixture.groundTruthCutFrames.length, 0);
const thresholdMetrics = sweepThresholds.map((threshold) => aggregateByThreshold.find((row) => row.threshold === threshold));
const result = {
  contract: "A1FfmpegScdetSourceSignalPilot/v1",
  phaseId: "ffmpeg-scdet-source-signal-pilot-v1",
  status: "PASS",
  createdAt: new Date().toISOString(),
  implementationBindings,
  reuseDecision: {path: "work/ffmpeg-scdet-source-signal-pilot-v1/REUSE_DECISION.md",
    sha256: sha256(fs.readFileSync(path.join(repoRoot, "work/ffmpeg-scdet-source-signal-pilot-v1/REUSE_DECISION.md")))},
  tool: {ffmpegPath, ffmpegVersion: execFileSync(ffmpegPath, ["-version"], {encoding: "utf8"}).split(/\r?\n/u)[0],
    binarySha256: adapter.tool.binarySha256, ffprobePath, ffprobeVersion: execFileSync(ffprobePath, ["-version"], {encoding: "utf8"}).split(/\r?\n/u)[0]},
  sourceGenerator: {ffmpegPath, ffmpegVersion: adapter.tool.version, ffmpegBinarySha256: adapter.tool.binarySha256,
    invocationBoundary: "SYNTHETIC_LAVFI_ONLY"},
  detector: {name: "FFmpeg scdet", thresholdUsed: 10, thresholdSweep: sweepThresholds,
    scoreSemantics: "RAW_ADJACENT_FRAME_CHANGE_SCORE_NOT_CONFIDENCE",
    scPass: 0, allFramesPreserved: true, metadataOnly: true,
    confidenceCalibration: "NOT_ESTABLISHED", motionRoleDetection: false,
    samplerAdmission: false},
  scheduler: {contract: NODE_WORKFLOW_CONTRACT, sourceNodesAccepted: sourceRecords.length,
    signalCandidateTasksAccepted: detectionStage.acceptedCount,
    maxClaims: detectionStage.maxClaims, concurrencyCap: 2,
    defaultRegistryContainsAdapter: false},
  sourceVideoShaPasses: {technicalAcceptance: sourceRecords.length,
    runScopedSchedulerContext: verificationBeforeClose.counters.sourceVideoShaPassCount,
    adapterAdditional: fixtureResults.reduce((sum, fixture) => sum + fixture.sourceIntegrity.adapterSourceVideoShaPasses, 0),
    total: sourceRecords.length + verificationBeforeClose.counters.sourceVideoShaPassCount
      + fixtureResults.reduce((sum, fixture) => sum + fixture.sourceIntegrity.adapterSourceVideoShaPasses, 0)},
  genericMediaMetadataProbes: {technicalAcceptance: sourceRecords.length,
    runScopedSchedulerContext: verificationBeforeClose.counters.genericMediaMetadataProbeCount,
    total: sourceRecords.length + verificationBeforeClose.counters.genericMediaMetadataProbeCount},
  ffmpegScdetMetadataScanProcesses: detectionStage.acceptedCount,
  accounting: {runScopedVerificationContext: {beforeClose: verificationBeforeClose,
    afterClose: {closed: verificationAfterClose.closed,
      acceptedNodeVerificationCacheEntryCount: verificationAfterClose.acceptedNodeVerificationCacheEntryCount,
      inFlightVerificationCount: verificationAfterClose.inFlightVerificationCount}}},
  fixtures: fixtureResults,
  thresholdSweep: thresholdMetrics,
  summary: {genreCount: fixtureResults.length,
    groundTruthCutCount: totalGroundTruthCuts,
    defaultThresholdCutTruePositives: fixtureResults.reduce((sum, fixture) => sum + fixture.defaultThresholdMetrics.truePositiveCount, 0),
    defaultThresholdFalsePositives: fixtureResults.reduce((sum, fixture) => sum + fixture.defaultThresholdMetrics.falsePositiveCount, 0),
    defaultThresholdFalseNegatives: fixtureResults.reduce((sum, fixture) => sum + fixture.defaultThresholdMetrics.falseNegativeCount, 0),
    movingWithoutCutFalsePositives: fixtureResults.find((fixture) => fixture.groundTruthCutFrames.length === 0)
      ?.defaultThresholdMetrics.falsePositiveCount ?? null,
    totalFramesMetadataChecked: fixtureResults.reduce((sum, fixture) => sum + fixture.exactMetadataFrameCount, 0),
    exactBoundaryMissCount: fixtureResults.reduce((sum, fixture) => sum
      + fixture.boundaryOffsetEvidence.filter((item) => !item.exactMatch).length, 0),
    largestAbsoluteNearestCutOffsetFrames: Math.max(0, ...fixtureResults.flatMap((fixture) => fixture.boundaryOffsetEvidence
      .filter((item) => item.nearestOffsetFrames !== null).map((item) => Math.abs(item.nearestOffsetFrames)))),
    candidateConfidenceAssigned: false,
    samplerReductionAuthorized: false,
    visualApproval: "NOT_GRANTED",
    productionAdmission: false,
    defaultRegistryChanged: false,
    formalAuthorityModified: false,
    sourceVerificationContextClosed: contextAfterClose.closed,
    sourceVerificationCacheEntriesAfterClose: contextAfterClose.acceptedNodeVerificationCacheEntryCount},
  timing: {sourceGenerationAndAcceptanceMs: sourceGenerationAndAcceptanceMs,
    scdetSchedulerPassMs: detectionElapsedMs,
    totalElapsedMs: Date.now() - startedAt,
    schedulerRetries: 0, humanInterventions: 0, timingComparisonClaimed: false},
  visibleArtifact: {path: pathRelative(boardPath), sha256: sha256(boardBytes), bytes: boardBytes.length,
    width: imageWidth, height: imageHeight},
  proofBoundary: {syntheticVideosGenerated: fixtureResults.length,
    userVideoBytesRead: 0, rawScoreOnly: true, confidenceCalibrated: false,
    sourceSignals: "REVIEW_REQUIRED_CANDIDATES_ONLY", visualApproval: "NOT_GRANTED",
    productionAdmission: false, defaultRegistryChanged: false, formalAuthorityModified: false},
  independentReview: {status: "PENDING", visualApproval: "NOT_GRANTED", productionAdmission: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, resultPath: pathRelative(resultPath),
  summary: result.summary, thresholdSweep: result.thresholdSweep,
  fixtures: result.fixtures.map(({id, defaultThresholdMetrics}) => ({id, ...defaultThresholdMetrics})),
  visibleArtifact: result.visibleArtifact, timing: result.timing}, null, 2));
