#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {NODE_ARTIFACT_MANIFEST_CONTRACT, acceptNodeArtifacts, revalidateNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {assertActiveNodeClaim, claimNodeTasks, compileNodeWorkflow, finishNodeTask, nodeDependencyBlockers} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {A1_TYPOGRAPHY_SHOT_VISUAL_CONTEXT_V1} from "../apps/studio-next/src/lib/a1-typography-shot-context-v1.mjs";
import {typographyNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-typography-adapter-v1.mjs";
import {acceptNodeWorkflowArtifacts, runNodeWorkflowTick} from "../apps/studio-next/src/lib/a1-node-workflow-runtime-v1.mjs";
import {projectDirs, readNodeWorkflowState} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const requireApp = createRequire(path.resolve(import.meta.dirname, "../apps/studio-next/package.json"));
const sharp = requireApp("sharp");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-review-artifact-chain-v1-"));

function writeJsonArtifact(root, node, role, payload) {
  const directory = path.join(root, node.id.replace(/[^A-Za-z0-9._-]/gu, "_"), node.inputSha256);
  fs.mkdirSync(directory, {recursive: true});
  const name = role + ".json", bytes = Buffer.from(JSON.stringify(payload, null, 2) + "\n"), filename = path.join(directory, name);
  fs.writeFileSync(filename, bytes);
  return {
    contract: NODE_ARTIFACT_MANIFEST_CONTRACT, nodeId: node.id, inputSha256: node.inputSha256, productionAdmission: false,
    artifacts: [{path: path.relative(root, filename).split(path.sep).join("/"), role, kind: "JSON_PLAN", jsonContract: payload.contract, sha256: sha256(bytes), bytes: bytes.length}],
  };
}

try {
  const sourcePath = path.join(tempRoot, "fixture-source-frame.png");
  await sharp({create: {width: 640, height: 360, channels: 3, background: "#929292"}}).png().toFile(sourcePath);
  const sourceBytes = fs.readFileSync(sourcePath), sourceSha = sha256(sourceBytes);
  const artifactRoot = path.join(tempRoot, "artifacts");
  const typographyInput = {
    sourceFrame: {path: sourcePath, sha256: sourceSha},
    exactCopy: "保留原句",
    compositionInput: {
      typographyRole: "CAPTION", semanticEvent: "EXPLANATION", effectId: "CLEAN_EDITORIAL",
      effectDisplayGroups: ["保留", "原句"],
      shotVisualContext: {
        contract: A1_TYPOGRAPHY_SHOT_VISUAL_CONTEXT_V1, carrierMode: "FOOTAGE",
        frame: {sha256: sourceSha, width: 640, height: 360},
        geometryEvidence: {method: "TEST_FIXTURE_SOURCE_FRAME", frameSha256: sourceSha, sourceContextSha256: "a".repeat(64)},
        protectedRegions: [{id: "fixture-subject", box: {x: 0.72, y: 0.1, width: 0.2, height: 0.8}}],
        availableRegions: [{id: "fixture-left", box: {x: 0.05, y: 0.1, width: 0.5, height: 0.8}, visualSuitability: 0.9}],
        anchors: [],
      },
    },
  };
  let downstreamRuns = 0;
  const downstream = {
    label: "review-package-manifest", version: 1, available: true, dependencies: ["typography"],
    dependencyArtifactKinds: {typography: ["JSON_PLAN"]},
    execute: async (node, {dependencies}) => {
      downstreamRuns += 1;
      const layout = dependencies["fixture-scene:typography"].artifacts[0];
      return {
        state: "needs-review", reason: "LAYOUT_PLAN_CONSUMED_BY_REVIEW_RECEIPT", productionAdmission: false,
        artifactManifest: writeJsonArtifact(artifactRoot, node, "review-package", {
          contract: "A1NodeReviewPackageReceipt/v1", nodeId: node.id, inputSha256: node.inputSha256,
          consumedLayoutPlanSha256: layout.sha256, renderedPixels: false, productionAdmission: false,
        }),
      };
    },
  };
  const adapters = createNodeAdapterRegistry({typography: typographyNodeAdapterV1, review: downstream});
  const input = {
    projectId: "reference-study-fixture", workspaceSha256: "f".repeat(64),
    context: {styleProfileSha256: "e".repeat(64)},
    shots: [{
      id: "fixture-scene", source: "Original short fixture text used only to verify the module handoff.",
      exactCopy: ["保留", "原句"], version: "fixture-v1",
      modules: {material: false, recording: false, typography: true, review: true},
      moduleInputs: {typography: typographyInput},
    }],
  };

  let workflow = compileNodeWorkflow(input, null, {moduleDefinitions: adapters.definitions});
  const typoId = "fixture-scene:typography", reviewId = "fixture-scene:review";
  assert.equal(workflow.productionAdmission, false);
  assert.equal(workflow.nodes.find((node) => node.id === typoId).state, "queued");
  assert.equal(nodeDependencyBlockers(workflow, workflow.nodes.find((node) => node.id === reviewId))[0].reason, "DEPENDENCY_NOT_READY");

  const firstClaim = claimNodeTasks(workflow, {workerId: "integration-test", now: 1000});
  assert.deepEqual(firstClaim.claims.map((claim) => claim.id), [typoId]);
  const typographyResult = await executeRegisteredNode(firstClaim.workflow, firstClaim.claims[0], {registry: adapters.registry, artifactRoot, now: 1000});
  assert.equal(typographyResult.state, "needs-review");
  assert.equal(typographyResult.artifactManifest.artifacts[0].kind, "JSON_PLAN");
  assert.equal(typographyResult.artifactManifest.productionAdmission, false);
  workflow = finishNodeTask(firstClaim.workflow, firstClaim.claims[0], typographyResult, 1001);
  assert.equal(claimNodeTasks(workflow, {workerId: "blocked-review", now: 1002}).claims.length, 0);

  workflow = await acceptNodeArtifacts(workflow, typoId, {artifactRoot, reviewerId: "codex-integration-test", now: 1003});
  const typed = workflow.nodes.find((node) => node.id === typoId);
  assert.equal(typed.state, "succeeded");
  assert.equal(typed.acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
  assert.equal(typed.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(typed.acceptance.productionAdmission, false);
  const firstAcceptedAt = typed.acceptance.acceptedAt;
  const idempotent = await acceptNodeArtifacts(workflow, typoId, {artifactRoot, reviewerId: "replay", now: 2000});
  assert.equal(idempotent.nodes.find((node) => node.id === typoId).acceptance.acceptedAt, firstAcceptedAt);

  const expanded = compileNodeWorkflow(input, workflow, {moduleDefinitions: adapters.definitions});
  const reviewNode = expanded.nodes.find((node) => node.id === reviewId);
  assert.notEqual(reviewNode.inputSha256, workflow.nodes.find((node) => node.id === reviewId).inputSha256);
  assert.equal(nodeDependencyBlockers(expanded, reviewNode).length, 0);
  const reviewClaim = claimNodeTasks(expanded, {workerId: "integration-test", now: 2001});
  assert.deepEqual(reviewClaim.claims.map((claim) => claim.id), [reviewId]);

  const planPath = path.join(artifactRoot, typed.acceptance.artifacts[0].path);
  fs.appendFileSync(planPath, "tamper");
  const blockedResult = await executeRegisteredNode(reviewClaim.workflow, reviewClaim.claims[0], {registry: adapters.registry, artifactRoot, now: 2002});
  assert.deepEqual({state: blockedResult.state, reason: blockedResult.reason}, {
    state: "blocked", reason: "DEPENDENCY_ARTIFACT_VERIFICATION_FAILED",
  });
  assert.equal(downstreamRuns, 0, "corrupt upstream bytes must never reach the consumer");

  let staleAdapterRuns = 0;
  const staleAdapters = createNodeAdapterRegistry({recording: {
    version: 1,
    execute: async () => { staleAdapterRuns += 1; return {state: "needs-review", productionAdmission: false}; },
  }});
  const staleWorkflow = compileNodeWorkflow({
    projectId: "stale-claim-fixture", workspaceSha256: "d".repeat(64), shots: [{
      id: "stale-shot", source: "fixture", modules: {material: false, recording: true, typography: false},
    }],
  }, null, {moduleDefinitions: staleAdapters.definitions});
  const staleClaim = claimNodeTasks(staleWorkflow, {workerId: "stale-claim-test", now: 1000, leaseMs: 1000});
  await assert.rejects(executeRegisteredNode(staleClaim.workflow, staleClaim.claims[0], {
    registry: staleAdapters.registry, now: 2000,
  }), /stale-node-result/);
  assert.equal(staleAdapterRuns, 0, "expired claims must not start module work");

  const runtimeAppRoot = path.join(tempRoot, "runtime-app/apps/studio-next");
  const dirs = projectDirs(runtimeAppRoot);
  const runtimeWorkspace = {
    workspaceSha256: "c".repeat(64),
    article: {title: "Capture fixture", sourceTextSha256: "b".repeat(64)},
    visualBible: {},
    directorInput: {projectId: "runtime-acceptance-fixture"},
    production: {
      generation: {workerStatus: "frozen", automaticDispatchAllowed: false, jobs: []},
      shotIntelligence: {
        currentStoryboardAuthority: {contract: "A1CurrentStoryboardAuthority/v1", current: true, shots: [{
          shotId: "capture-shot", sourceText: "Capture this screen state", semanticJob: "screen capture fixture",
          exactCopy: [], versionId: "capture-v1", route: "SCREEN_EVIDENCE", sourceUrl: "http://127.0.0.1/fixture",
        }]},
        researchPackets: [],
      },
    },
  };
  for (const directory of [dirs.publicDir, dirs.artifactDir]) {
    fs.mkdirSync(directory, {recursive: true});
    fs.writeFileSync(path.join(directory, "workspace.json"), JSON.stringify(runtimeWorkspace));
  }
  const runtimeAdapters = {recording: {
    version: 1,
    execute: async (node) => ({
      state: "needs-review", reason: "FIXTURE_CAPTURE_COMPLETE", productionAdmission: false,
      artifactManifest: writeJsonArtifact(artifactRoot, node, "capture-plan", {
        contract: "A1NodeCapturePlanFixture/v1", nodeId: node.id, inputSha256: node.inputSha256,
      }),
    }),
  }};
  const runtimeTick = await runNodeWorkflowTick(runtimeAppRoot, {
    workerId: "runtime-acceptance-fixture", adapters: runtimeAdapters, artifactRoot,
  });
  assert.equal(runtimeTick.claimed, 1);
  const runtimeNodeId = "capture-shot:recording";
  await acceptNodeWorkflowArtifacts(runtimeAppRoot, runtimeNodeId, {
    adapters: runtimeAdapters, artifactRoot, reviewerId: "integration-test", now: 3000,
  });
  const acceptedRevision = readNodeWorkflowState(runtimeAppRoot).revision;
  await acceptNodeWorkflowArtifacts(runtimeAppRoot, runtimeNodeId, {
    adapters: runtimeAdapters, artifactRoot, reviewerId: "integration-replay", now: 4000,
  });
  assert.equal(readNodeWorkflowState(runtimeAppRoot).revision, acceptedRevision,
    "repeat acceptance must return the current receipt without writing a new revision");
  console.log(JSON.stringify({
    contract: "A1NodeReviewArtifactChainTest/v1", status: "PASS_REVIEW_ONLY",
    checks: [
      "source-bound-font-layout-plan", "artifact-sha-and-json-contract", "downstream-blocked-until-receipt",
      "typed-artifact-dependency", "verified-receipt-releases-dependent-module", "receipt-acceptance-idempotence",
      "changed-upstream-bytes-block-consumer", "expired-claim-blocks-adapter", "runtime-receipt-acceptance-idempotence",
      "visual-approval-not-implied", "production-admission-remains-false",
    ],
    productionAdmission: false, renderedPixels: false,
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
