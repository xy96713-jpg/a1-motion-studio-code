#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  A1_FRAME_REVIEW_SOURCE_MANIFEST_V1,
  A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
  FRAME_REVIEW_SOURCE_MANIFEST_ROLE_V1,
  executeFrameReviewPlanNode,
  frameReviewPlanNodeAdapterV1,
} from "../apps/studio-next/src/lib/a1-node-frame-review-plan-adapter-v1.mjs";
import {createNodeAdapterRegistry} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts, NODE_ARTIFACT_MANIFEST_CONTRACT, verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {compileReferenceFrameReviewPlanV1} from "../apps/studio-next/src/lib/a1-reference-frame-review-policy-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-frame-review-plan-v1-"));
const sourceVideoSha256 = "f".repeat(64);
const sourceManifest = {
  contract: A1_FRAME_REVIEW_SOURCE_MANIFEST_V1,
  sourceVideoSha256,
  fps: 60,
  totalFrames: 100,
};
const sequences = [
  {sequenceId: "hold-scene", startFrame: 0, endFrameExclusive: 10, mode: "stable-hold"},
  {sequenceId: "motion-scene", startFrame: 10, endFrameExclusive: 30, mode: "semantic-motion", anchors: [
    {role: "ENTER", sourceFrame: 10},
    {role: "HOLD", sourceFrame: 20},
    {role: "EXIT", sourceFrame: 29},
  ]},
];
const hardCuts = [{id: "scene-cut", beforeSequenceId: "hold-scene", afterSequenceId: "motion-scene", cutFrame: 10}];

async function createAcceptedSourceFixture({manifest = sourceManifest, fixtureId = "source"} = {}) {
  const root = path.join(tempRoot, fixtureId);
  const artifactRoot = path.join(root, "source-artifacts");
  const artifactPath = "source-manifest/source.json";
  const filename = path.join(artifactRoot, artifactPath);
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(filename, bytes);
  const sourceNode = {id: `${fixtureId}:source`, inputSha256: "e".repeat(64)};
  const artifactManifest = {
    contract: NODE_ARTIFACT_MANIFEST_CONTRACT,
    nodeId: sourceNode.id,
    inputSha256: sourceNode.inputSha256,
    productionAdmission: false,
    artifacts: [{
      path: artifactPath,
      role: FRAME_REVIEW_SOURCE_MANIFEST_ROLE_V1,
      kind: "JSON_PLAN",
      jsonContract: manifest.contract,
      sha256: sha256(bytes),
      bytes: bytes.length,
    }],
  };
  const verified = await verifyNodeArtifactManifest(artifactManifest, {artifactRoot, node: sourceNode});
  const acceptedSource = await acceptNodeArtifacts({
    scope: "REVIEW_ONLY",
    productionAdmission: false,
    nodes: [{
      ...sourceNode,
      state: "needs-review",
      result: {state: "needs-review", productionAdmission: false, artifactManifest},
    }],
  }, sourceNode.id, {artifactRoot, reviewerId: "accepted-source-manifest-test"});
  const acceptedSourceNode = acceptedSource.nodes[0];
  assert.equal(acceptedSourceNode.state, "succeeded");
  assert.equal(acceptedSourceNode.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(acceptedSourceNode.acceptance.productionAdmission, false);
  const dependencyId = `${fixtureId}:source`;
  const dependency = {
    state: "succeeded",
    manifestSha256: acceptedSourceNode.acceptance.manifestSha256,
    artifacts: acceptedSourceNode.acceptance.artifacts.map((artifact) => ({
      ...artifact,
      absolutePath: path.join(acceptedSourceNode.acceptance.artifactRoot, artifact.path),
    })),
  };
  return {
    artifactRoot,
    artifactPath,
    filename,
    dependencyId,
    dependency,
    binding: {
      dependencyId,
      acceptedManifestSha256: acceptedSourceNode.acceptance.manifestSha256,
      artifact: {path: artifactPath, sha256: sha256(bytes), bytes: bytes.length},
    },
  };
}

function makeNode(sourceFixture, {plan = {sequences, hardCuts}, id = "scene-a:frame-review-plan"} = {}) {
  const dependencyInputSha256 = "c".repeat(64);
  const input = {
    projectId: "frame-review-plan-test",
    context: {},
    shot: {id: "scene-a", source: "Source identity is carried by an accepted manifest."},
    module: "frame-review-plan",
    moduleVersion: frameReviewPlanNodeAdapterV1.version,
    implementationSha256: frameReviewPlanNodeAdapterV1.implementationSha256,
    need: true,
    parameters: {
      sourceManifestBinding: structuredClone(sourceFixture.binding),
      plan: structuredClone(plan),
    },
  };
  const dependencyModule = sourceFixture.dependencyId.split(":").at(-1);
  const artifactKinds = {[dependencyModule]: ["JSON_PLAN"]};
  return {
    id,
    shotId: "scene-a",
    module: "frame-review-plan",
    input,
    inputSha256: nodeInputHash({
      input,
      dependencies: {
        inputs: [{id: sourceFixture.dependencyId, inputSha256: dependencyInputSha256,
          acceptedManifestSha256: sourceFixture.binding.acceptedManifestSha256}],
        artifactKinds,
      },
    }),
    dependencies: [sourceFixture.dependencyId],
    dependencyArtifactKinds: {[sourceFixture.dependencyId]: ["JSON_PLAN"]},
    state: "running",
    lease: {workerId: "adapter-test", token: "test-lease", expiresAt: Date.now() + 60_000},
  };
}

async function runNode(node, sourceFixture, artifactRoot) {
  return executeFrameReviewPlanNode(node, {
    dependencies: {[sourceFixture.dependencyId]: sourceFixture.dependency},
    artifactRoot,
  });
}

try {
  assert.equal(frameReviewPlanNodeAdapterV1.version, 1);
  assert.equal(frameReviewPlanNodeAdapterV1.enabled, true);
  assert.equal(frameReviewPlanNodeAdapterV1.execute, executeFrameReviewPlanNode);
  assert.match(frameReviewPlanNodeAdapterV1.implementationSha256, /^[a-f0-9]{64}$/u);

  const defaultRegistry = createNodeAdapterRegistry();
  assert.equal(defaultRegistry.registry["frame-review-plan"], undefined,
    "frame-review-plan must remain absent from the default production registry");
  const injected = createNodeAdapterRegistry({"frame-review-plan": frameReviewPlanNodeAdapterV1});
  assert.equal(injected.registry["frame-review-plan"].available, true);

  const sourceFixture = await createAcceptedSourceFixture();
  const artifactRoot = path.join(tempRoot, "frame-review-output");
  const node = makeNode(sourceFixture);
  let heartbeatCount = 0;
  const first = await executeFrameReviewPlanNode(node, {
    dependencies: {[sourceFixture.dependencyId]: sourceFixture.dependency},
    artifactRoot,
    heartbeat: () => { heartbeatCount += 1; },
  });
  assert.equal(first.state, "needs-review");
  assert.equal(first.reason, "FRAME_REVIEW_PLAN_REQUIRES_INDEPENDENT_REVIEW");
  assert.equal(first.visualApproval, false);
  assert.equal(first.productionAdmission, false);
  assert.equal(first.artifactKind, "FRAME_REVIEW_PLAN_ONLY");
  assert.equal(first.artifactManifest.contract, NODE_ARTIFACT_MANIFEST_CONTRACT);
  assert.equal(first.artifactManifest.productionAdmission, false);
  assert.equal(first.artifactManifest.artifacts.length, 1);
  assert.deepEqual(first.artifactManifest.artifacts.map(({kind, role, jsonContract}) => ({kind, role, jsonContract})), [{
    kind: "JSON_PLAN",
    role: "frame-review-plan",
    jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1,
  }]);
  assert.ok(heartbeatCount >= 2);

  const artifactRecord = first.artifactManifest.artifacts[0];
  assert.ok(!path.isAbsolute(artifactRecord.path));
  assert.ok(!artifactRecord.path.split("/").includes(".."));
  assert.ok(artifactRecord.path.includes(node.inputSha256));
  const planFile = path.join(artifactRoot, artifactRecord.path);
  const planBytes = fs.readFileSync(planFile);
  assert.equal(planBytes.length, artifactRecord.bytes);
  assert.equal(sha256(planBytes), artifactRecord.sha256);
  const output = JSON.parse(planBytes.toString("utf8"));
  assert.equal(output.contract, A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1);
  assert.equal(output.nodeId, node.id);
  assert.equal(output.inputSha256, node.inputSha256);
  assert.equal(output.sourceManifestBinding.acceptedManifestSha256, sourceFixture.binding.acceptedManifestSha256);
  assert.deepEqual(output.source, {sourceVideoSha256, fps: 60, totalFrames: 100});
  const expectedPolicyPlan = compileReferenceFrameReviewPlanV1({sourceVideoSha256, fps: 60, totalFrames: 100, sequences, hardCuts});
  assert.deepEqual(output.plan, expectedPolicyPlan,
    "output.plan must preserve the shared policy object byte-for-byte at the object/SHA contract level");
  assert.equal(output.plan.sha256, expectedPolicyPlan.sha256);
  assert.equal(output.plan.summary.extractedImages, 0);
  assert.equal(output.plan.summary.visualApproval, false);
  assert.equal(output.plan.summary.productionAdmission, false);
  assert.equal(output.proofBoundary.acceptedSourceManifestBytesReverified, true);
  assert.equal(output.proofBoundary.sourceVideoRead, false);
  assert.equal(output.proofBoundary.sourceVideoDecoded, false);
  assert.equal(output.proofBoundary.frameExtractionPerformed, false);
  assert.equal(output.proofBoundary.extractedImages, 0);
  assert.equal(output.proofBoundary.visualApproval, false);
  assert.equal(output.proofBoundary.productionAdmission, false);
  assert.equal(Object.hasOwn(output, "sourceVideoPath"), false);
  assert.deepEqual(fs.readdirSync(path.dirname(planFile)), ["frame-review-plan.json"],
    "the adapter must emit only its JSON_PLAN output");

  const technicallyVerified = await verifyNodeArtifactManifest(first.artifactManifest, {artifactRoot, node});
  assert.equal(technicallyVerified.artifacts.length, 1);
  assert.deepEqual(technicallyVerified.artifacts[0].metadata, {jsonContract: A1_NODE_FRAME_REVIEW_PLAN_OUTPUT_V1});

  const beforeCache = fs.statSync(planFile);
  const cached = await runNode(node, sourceFixture, artifactRoot);
  const afterCache = fs.statSync(planFile);
  assert.equal(cached.state, "needs-review");
  assert.equal(cached.artifactManifest.artifacts[0].sha256, artifactRecord.sha256);
  assert.equal(afterCache.ino, beforeCache.ino, "same input SHA must reuse the plan file");
  assert.equal(afterCache.mtimeMs, beforeCache.mtimeMs, "cache reuse must not rewrite the plan file");

  const workflow = {
    scope: "REVIEW_ONLY",
    productionAdmission: false,
    nodes: [{...node, state: "needs-review", result: first, acceptance: null}],
  };
  const accepted = await acceptNodeArtifacts(workflow, node.id, {
    artifactRoot,
    reviewerId: "frame-review-plan-test",
  });
  const acceptedNode = accepted.nodes[0];
  assert.equal(acceptedNode.state, "succeeded");
  assert.equal(acceptedNode.acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
  assert.equal(acceptedNode.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(acceptedNode.acceptance.productionAdmission, false);

  const missingDependency = await executeFrameReviewPlanNode(node, {dependencies: {}, artifactRoot});
  assert.equal(missingDependency.state, "blocked");
  assert.equal(missingDependency.reason, "FRAME_REVIEW_SOURCE_ACCEPTANCE_RECEIPT_MISMATCH");

  const badReceiptDependency = structuredClone(sourceFixture.dependency);
  badReceiptDependency.manifestSha256 = "0".repeat(64);
  const badReceipt = await executeFrameReviewPlanNode(node, {
    dependencies: {[sourceFixture.dependencyId]: badReceiptDependency}, artifactRoot,
  });
  assert.equal(badReceipt.reason, "FRAME_REVIEW_SOURCE_ACCEPTANCE_RECEIPT_MISMATCH");

  const badArtifactShaNode = structuredClone(node);
  badArtifactShaNode.input.parameters.sourceManifestBinding.artifact.sha256 = "9".repeat(64);
  const badArtifactSha = await runNode(badArtifactShaNode, sourceFixture, artifactRoot);
  assert.equal(badArtifactSha.reason, "FRAME_REVIEW_SOURCE_ARTIFACT_BINDING_MISMATCH");

  const badArtifactBytesNode = structuredClone(node);
  badArtifactBytesNode.input.parameters.sourceManifestBinding.artifact.bytes += 1;
  const badArtifactBytes = await runNode(badArtifactBytesNode, sourceFixture, artifactRoot);
  assert.equal(badArtifactBytes.reason, "FRAME_REVIEW_SOURCE_ARTIFACT_BINDING_MISMATCH");

  const traversalNode = structuredClone(node);
  traversalNode.input.parameters.sourceManifestBinding.artifact.path = "../escape.json";
  assert.equal((await runNode(traversalNode, sourceFixture, artifactRoot)).reason, "FRAME_REVIEW_SOURCE_BINDING_INVALID");

  const badKindDependency = structuredClone(sourceFixture.dependency);
  badKindDependency.artifacts[0].kind = "IMAGE";
  assert.equal((await executeFrameReviewPlanNode(node, {
    dependencies: {[sourceFixture.dependencyId]: badKindDependency}, artifactRoot,
  })).reason, "FRAME_REVIEW_SOURCE_ARTIFACT_BINDING_MISMATCH");

  const wrongContractFixture = await createAcceptedSourceFixture({
    fixtureId: "wrong-contract",
    manifest: {...sourceManifest, contract: "OtherSourceManifest/v1"},
  });
  const wrongContractNode = makeNode(wrongContractFixture, {id: "scene-b:frame-review-plan"});
  assert.equal((await runNode(wrongContractNode, wrongContractFixture, artifactRoot)).reason, "FRAME_REVIEW_SOURCE_ARTIFACT_BINDING_MISMATCH");

  const missingFieldsFixture = await createAcceptedSourceFixture({
    fixtureId: "missing-fields",
    manifest: {contract: A1_FRAME_REVIEW_SOURCE_MANIFEST_V1, sourceVideoSha256},
  });
  const missingFieldsNode = makeNode(missingFieldsFixture, {id: "scene-c:frame-review-plan"});
  assert.equal((await runNode(missingFieldsNode, missingFieldsFixture, artifactRoot)).reason, "FRAME_REVIEW_SOURCE_MANIFEST_INVALID");

  const invalidPlanNode = makeNode(sourceFixture, {
    id: "scene-d:frame-review-plan",
    plan: {sequences: [{sequenceId: "out-of-range", startFrame: 0, endFrameExclusive: 101, mode: "stable-hold"}], hardCuts: []},
  });
  assert.equal((await runNode(invalidPlanNode, sourceFixture, artifactRoot)).reason, "FRAME_REVIEW_POLICY_PLAN_INVALID");

  const tamperedFixture = await createAcceptedSourceFixture({fixtureId: "tampered"});
  const tamperedNode = makeNode(tamperedFixture, {id: "scene-e:frame-review-plan"});
  const originalBytes = fs.readFileSync(tamperedFixture.filename);
  const changedBytes = Buffer.from(originalBytes);
  changedBytes[changedBytes.length - 2] ^= 1;
  fs.writeFileSync(tamperedFixture.filename, changedBytes);
  assert.equal((await runNode(tamperedNode, tamperedFixture, artifactRoot)).reason, "FRAME_REVIEW_SOURCE_ARTIFACT_SHA_MISMATCH");

  const missingFileFixture = await createAcceptedSourceFixture({fixtureId: "missing-file"});
  const missingFileNode = makeNode(missingFileFixture, {id: "scene-f:frame-review-plan"});
  fs.unlinkSync(missingFileFixture.filename);
  assert.equal((await runNode(missingFileNode, missingFileFixture, artifactRoot)).reason, "FRAME_REVIEW_SOURCE_ARTIFACT_UNAVAILABLE");

  const symlinkFixture = await createAcceptedSourceFixture({fixtureId: "symlink"});
  const symlinkNode = makeNode(symlinkFixture, {id: "scene-g:frame-review-plan"});
  const savedBytesPath = path.join(path.dirname(symlinkFixture.filename), "saved.json");
  fs.renameSync(symlinkFixture.filename, savedBytesPath);
  fs.symlinkSync(savedBytesPath, symlinkFixture.filename);
  assert.equal((await runNode(symlinkNode, symlinkFixture, artifactRoot)).reason, "FRAME_REVIEW_SOURCE_ARTIFACT_SYMLINK_FORBIDDEN");

  console.log("PASS node-frame-review-plan-adapter-v1: accepted JSON_PLAN binding, source/file integrity, shared policy output, review-only artifact verification, deterministic cache, registry absence, and no-extraction boundary");
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
