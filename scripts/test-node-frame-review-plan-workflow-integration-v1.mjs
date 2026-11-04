#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {frameReviewPlanNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-frame-review-plan-adapter-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repoRoot, "work/frame-review-plan-node-v1");
const artifactRoot = path.join(outputRoot, "artifacts");
const resultPath = path.join(outputRoot, "result.json");
const sourcePlanRoot = path.join(repoRoot, "work/event-driven-frame-review-v1");
const inputPath = path.join(sourcePlanRoot, "plan-inputs.json");
const baselineResultPath = path.join(sourcePlanRoot, "result.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeNode = (value) => String(value).replace(/[^A-Za-z0-9._-]+/gu, "_") + "-" + sha256(Buffer.from(String(value), "utf8")).slice(0, 12);
const artifactFile = (root, file, role, kind, jsonContract) => {
  const bytes = fs.readFileSync(file);
  return {path: path.relative(root, file).split(path.sep).join("/"), role, kind,
    ...(jsonContract ? {jsonContract} : {}), sha256: sha256(bytes), bytes: bytes.length};
};

const inputBytes = fs.readFileSync(inputPath);
const sourceData = JSON.parse(inputBytes.toString("utf8"));
assert.equal(sourceData.contract, "A1EventDrivenFrameReviewInputs/v1");
const priorResultBytes = fs.readFileSync(baselineResultPath);
const priorResult = JSON.parse(priorResultBytes.toString("utf8"));
assert.equal(priorResult.status, "PASS");
const priorVisibleBytes = fs.readFileSync(path.join(repoRoot, priorResult.visibleArtifact.path));
assert.equal(sha256(priorVisibleBytes), priorResult.visibleArtifact.sha256);
fs.mkdirSync(artifactRoot, {recursive: true});

const sourceManifestContract = "A1FrameReviewSourceManifest/v1";
const sourceModuleSha256 = sha256(Buffer.from("A1 synthetic frame-source manifest adapter v1", "utf8"));
async function executeSourceManifestNode(node, {artifactRoot: root} = {}) {
  const source = node.input?.parameters;
  if (node.module !== "source-manifest" || node.input?.module !== "source-manifest"
    || node.input?.implementationSha256 !== sourceModuleSha256
    || !/^[a-f0-9]{64}$/u.test(source?.sourceVideoSha256 || "")
    || !Number.isFinite(source?.fps) || source.fps <= 0
    || !Number.isSafeInteger(source?.totalFrames) || source.totalFrames < 1) {
    return {state: "blocked", reason: "FRAME_SOURCE_MANIFEST_INPUT_INVALID", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  const directory = path.join(root, "source-manifest-" + safeNode(node.id), node.inputSha256);
  fs.mkdirSync(directory, {recursive: true});
  const manifestPath = path.join(directory, "frame-source-manifest.json");
  const manifest = {contract: sourceManifestContract, sourceVideoSha256: source.sourceVideoSha256,
    fps: source.fps, totalFrames: source.totalFrames};
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return {state: "needs-review", reason: "FRAME_SOURCE_MANIFEST_REQUIRES_TECHNICAL_ACCEPTANCE",
    visualApproval: "NOT_GRANTED", productionAdmission: false,
    artifactManifest: {contract: "A1NodeArtifactManifest/v1", nodeId: node.id, inputSha256: node.inputSha256, productionAdmission: false,
      artifacts: [artifactFile(root, manifestPath, "frame-review-source-manifest", "JSON_PLAN", sourceManifestContract)]}};
}

const installed = createNodeAdapterRegistry({
  "source-manifest": {label: "synthetic frame-source manifest", version: 1, optional: true,
    implementationSha256: sourceModuleSha256, execute: executeSourceManifestNode},
  "frame-review-plan": {...frameReviewPlanNodeAdapterV1, optional: true},
});
assert.equal(createNodeAdapterRegistry().registry["frame-review-plan"], undefined,
  "review-plan executor remains unregistered in the production runtime");

const projectId = "frame-review-plan-node-v1";
const workspaceSha256 = sha256(Buffer.from("frame-review-plan-node-v1-synthetic-workspace", "utf8"));
const sourceStageInput = {projectId, workspaceSha256,
  context: {articleTitle: "cross-genre frame-plan fixtures", articleSha256: sha256(inputBytes)},
  shots: sourceData.groups.map((group) => ({id: group.id, source: "Review source frame plan for " + group.genre,
    modules: {material: false, typography: false, recording: false, diagram: false, "source-manifest": true, "frame-review-plan": false},
    moduleInputs: {"source-manifest": {sourceVideoSha256: group.sourceVideoSha256, fps: group.fps, totalFrames: group.totalFrames}}}))};

async function runStage(input, previous, moduleName, workerId, reviewerId) {
  let workflow = compileNodeWorkflow(input, previous, {moduleDefinitions: installed.definitions});
  let now = 90_000;
  let acceptedCount = 0;
  while (workflow.nodes.some((node) => node.module === moduleName && ["queued", "running", "needs-review"].includes(node.state))) {
    workflow = compileNodeWorkflow(input, workflow, {moduleDefinitions: installed.definitions});
    const batch = claimNodeTasks(workflow, {workerId, now});
    if (!batch.claims.length) {
      const waiting = workflow.nodes.filter((node) => node.module === moduleName && !["succeeded", "skipped"].includes(node.state));
      assert.deepEqual(waiting.map((node) => [node.id, node.state, node.reason]), [], "review-plan stage must not stall on a hidden dependency");
      break;
    }
    assert.ok(batch.claims.length <= 2, "shared node scheduler must enforce its two-task cap");
    workflow = batch.workflow;
    for (const claim of batch.claims) {
      const result = await executeRegisteredNode(workflow, claim, {registry: installed.registry, artifactRoot, now: now + 1});
      assert.equal(result.state, "needs-review", claim.id + " remains a review-only candidate");
      assert.equal(result.productionAdmission, false);
      assert.ok(result.visualApproval === false || result.visualApproval === "NOT_GRANTED");
      workflow = finishNodeTask(workflow, claim, result, now + 2);
      workflow = await acceptNodeArtifacts(workflow, claim.id, {artifactRoot, reviewerId, now: now + 3});
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

const sourceStage = await runStage(sourceStageInput, null, "source-manifest", "source-manifest-worker", "source-manifest-technical-test");
const sourceWorkflow = sourceStage.workflow;
const sourceNodes = new Map(sourceData.groups.map((group) => {
  const node = sourceWorkflow.nodes.find((item) => item.id === group.id + ":source-manifest");
  assert.equal(node?.state, "succeeded");
  const artifact = node.acceptance.artifacts.find((item) => item.role === "frame-review-source-manifest" && item.kind === "JSON_PLAN");
  assert.ok(artifact);
  return [group.id, {node, artifact}];
}));

const planStageInput = {...sourceStageInput,
  shots: sourceStageInput.shots.map((shot) => {
    const group = sourceData.groups.find((item) => item.id === shot.id);
    const source = sourceNodes.get(group.id);
    return {...shot,
      modules: {...shot.modules, "frame-review-plan": true},
      moduleDependencies: {"frame-review-plan": ["source-manifest"]},
      moduleArtifactKinds: {"frame-review-plan": {"source-manifest": ["JSON_PLAN"]}},
      moduleInputs: {...shot.moduleInputs,
        "frame-review-plan": {
          sourceManifestBinding: {dependencyId: source.node.id, acceptedManifestSha256: source.node.acceptance.manifestSha256,
            artifact: {path: source.artifact.path, sha256: source.artifact.sha256, bytes: source.artifact.bytes}},
          plan: {sequences: group.sequences, hardCuts: group.hardCuts},
        }},
    };
  })};
const planStage = await runStage(planStageInput, sourceWorkflow, "frame-review-plan", "frame-review-plan-worker", "frame-review-plan-technical-test");
const finalWorkflow = planStage.workflow;
const groups = [];
const fixtures = [];
for (const group of sourceData.groups) {
  const source = sourceNodes.get(group.id);
  const node = finalWorkflow.nodes.find((item) => item.id === group.id + ":frame-review-plan");
  assert.equal(node?.state, "succeeded");
  const outputArtifact = node.acceptance.artifacts.find((item) => item.kind === "JSON_PLAN");
  assert.ok(outputArtifact);
  const outputBytes = fs.readFileSync(path.join(artifactRoot, outputArtifact.path));
  assert.equal(sha256(outputBytes), outputArtifact.sha256);
  const wrapper = JSON.parse(outputBytes.toString("utf8"));
  assert.equal(wrapper.contract, "A1NodeFrameReviewPlanOutput/v1");
  assert.equal(wrapper.plan.contract, "A1ReferenceFrameReviewPolicy/v1");
  assert.equal(wrapper.plan.summary.extractedImages, 0);
  assert.equal(wrapper.plan.summary.visualApproval, false);
  const baselinePlanPath = path.join(sourcePlanRoot, "source-plans", group.id + "-plan.json");
  const baselinePlan = JSON.parse(fs.readFileSync(baselinePlanPath, "utf8"));
  assert.equal(wrapper.plan.sha256, baselinePlan.sha256, group.id + " compiled policy byte identity");
  groups.push({id: group.id, genre: group.genre, nodeId: node.id, inputSha256: node.inputSha256,
    sourceManifestAcceptanceSha256: source.node.acceptance.manifestSha256, planSha256: wrapper.plan.sha256,
    sourceManifestArtifact: {path: source.artifact.path, sha256: source.artifact.sha256, bytes: source.artifact.bytes,
      jsonContract: sourceManifestContract, sourceVideoSha256: group.sourceVideoSha256, fps: group.fps, totalFrames: group.totalFrames},
    outputArtifact: {path: outputArtifact.path, sha256: outputArtifact.sha256, bytes: outputArtifact.bytes},
    verificationScope: node.acceptance.verificationScope, visualApproval: node.acceptance.visualApproval,
    productionAdmission: node.acceptance.productionAdmission});
  for (const sequence of group.sequences) {
    const references = wrapper.plan.references.filter((item) => item.sequenceId === sequence.sequenceId);
    const frames = [...new Set(references.map((item) => item.sourceFrame))].sort((a, b) => a - b);
    fixtures.push({id: sequence.sequenceId, genre: group.genre, sourceVideoSha256: group.sourceVideoSha256,
      sourceFrames: frames, referenceCount: references.length, uniqueFrames: frames.length, planNodeId: node.id,
      planSha256: wrapper.plan.sha256, extractedImages: 0});
  }
}

assert.equal(fixtures.length, 6);
assert.equal(groups.length, 3);
assert.equal(new Set(fixtures.map((item) => item.genre)).size, 3);
assert.equal(fixtures.reduce((sum, item) => sum + item.uniqueFrames, 0), priorResult.summary.plannedUniqueSourceFrames);
assert.equal(groups.reduce((sum, item) => sum + 1, 0), 3);

const result = {
  contract: "A1NodeFrameReviewPlanWorkflowIntegration/v1",
  status: "PASS",
  phaseId: "frame-review-plan-node-v1",
  createdAt: "2026-09-28",
  inputFixture: {path: path.relative(repoRoot, inputPath).split(path.sep).join("/"), sha256: sha256(inputBytes)},
  priorPolicyResult: {path: path.relative(repoRoot, baselineResultPath).split(path.sep).join("/"), sha256: sha256(priorResultBytes),
    planOnlyReductionPercent: priorResult.summary.planOnlyReductionPercent},
  scheduler: {contract: "A1NodeWorkflow/v1", sourceManifestNodesAccepted: sourceStage.acceptedCount,
    frameReviewPlanNodesAccepted: planStage.acceptedCount, maxConcurrentClaims: 2,
    defaultRegistryRegistered: false, outputKinds: ["JSON_PLAN"], extractorInvoked: false},
  sourceManifestFixtureScope: "SYNTHETIC_METADATA_ONLY_NO_SOURCE_VIDEO_BYTES",
  groups,
  fixtures,
  summary: {genreCount: 3, sequenceCount: 6, sourceGroups: 3,
    selectedUniqueFrames: fixtures.reduce((sum, item) => sum + item.uniqueFrames, 0),
    extractedImages: 0, humanImageReviews: 0},
  visibleArtifact: priorResult.visibleArtifact,
  proofBoundary: {verificationScope: "BYTES_AND_FORMAT_ONLY", visualApproval: "NOT_GRANTED", productionAdmission: false,
    sourceVideosDecoded: 0, actualFramesExtracted: 0, formalAuthorityModified: false},
};
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({...result, resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/")}, null, 2));
