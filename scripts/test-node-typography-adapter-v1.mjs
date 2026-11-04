#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import {createRequire} from "node:module";
import path from "node:path";
import {executeTypographyNode, typographyNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-typography-adapter-v1.mjs";
import {createNodeAdapterRegistry} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {A1_TYPOGRAPHY_SHOT_VISUAL_CONTEXT_V1} from "../apps/studio-next/src/lib/a1-typography-shot-context-v1.mjs";
import {verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";

const requireApp = createRequire(path.resolve(import.meta.dirname, "../apps/studio-next/package.json"));
const sharp = requireApp("sharp");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-typography-adapter-v1-"));

function nodeFor({id, inputSha256, need = true, module = "typography", sourcePath, frameSha256, width = 640, height = 360, method = "TEST_FIXTURE_SOURCE_FRAME", exactCopy = "保留原句", groups = ["保留", "原句"]}) {
  return {
    id,
    shotId: id.split(":")[0],
    module,
    inputSha256,
    input: {
      module,
      moduleVersion: 1,
      need,
      parameters: {
        sourceFrame: {path: sourcePath, sha256: frameSha256},
        exactCopy,
        compositionInput: {
          typographyRole: "CAPTION",
          semanticEvent: "PROCESS",
          effectId: "CLEAN_EDITORIAL",
          effectDisplayGroups: groups,
          shotVisualContext: {
            contract: A1_TYPOGRAPHY_SHOT_VISUAL_CONTEXT_V1,
            carrierMode: "FOOTAGE",
            frame: {sha256: frameSha256, width, height},
            geometryEvidence: {method, frameSha256, sourceContextSha256: "a".repeat(64)},
            protectedRegions: [{id: "subject", box: {x: 0.72, y: 0.1, width: 0.2, height: 0.8}}],
            availableRegions: [{id: "safe-left", box: {x: 0.05, y: 0.1, width: 0.5, height: 0.8}, visualSuitability: 0.9}],
            anchors: [],
          },
        },
      },
    },
  };
}

try {
  const sourcePath = path.join(tempRoot, "source-frame.png");
  await sharp({create: {width: 640, height: 360, channels: 3, background: "#f0f0f0"}}).png().toFile(sourcePath);
  const sourceBytes = fs.readFileSync(sourcePath);
  const sourceSha256 = sha256(sourceBytes);
  const artifactRoot = path.join(tempRoot, "artifacts");
  let heartbeatCount = 0;
  const validNode = nodeFor({id: "shot-1:typography", inputSha256: "1".repeat(64), sourcePath, frameSha256: sourceSha256});

  assert.equal(typographyNodeAdapterV1.version, 1);
  assert.equal(typographyNodeAdapterV1.execute, executeTypographyNode);
  assert.equal(typographyNodeAdapterV1.enabled, true);
  const registered = createNodeAdapterRegistry({typography: typographyNodeAdapterV1});
  assert.equal(registered.registry.typography.available, true);
  assert.equal(registered.definitions.typography.version, 1);
  assert.deepEqual(registered.definitions.typography.dependencies, ["material", "recording"]);

  const first = await executeTypographyNode(validNode, {artifactRoot, dependencies: {}, heartbeat: () => { heartbeatCount += 1; }});
  assert.equal(first.state, "needs-review");
  assert.equal(first.reason, "TYPOGRAPHY_LAYOUT_PLAN_REQUIRES_COMPOSITE_REVIEW");
  assert.equal(first.productionAdmission, false);
  assert.equal(first.artifactKind, "LAYOUT_PLAN_ONLY");
  assert.equal(first.artifactManifest.contract, "A1NodeArtifactManifest/v1");
  assert.equal(first.artifactManifest.nodeId, validNode.id);
  assert.equal(first.artifactManifest.inputSha256, validNode.inputSha256);
  assert.equal(first.artifactManifest.artifacts.length, 1);
  const artifact = first.artifactManifest.artifacts[0];
  assert.equal(artifact.role, "typography-layout");
  assert.equal(artifact.kind, "JSON_PLAN");
  assert.equal(artifact.jsonContract, "A1NodeTypographyLayoutPlan/v1");
  assert.ok(!path.isAbsolute(artifact.path));
  assert.ok(!artifact.path.split("/").includes(".."));
  assert.ok(artifact.path.includes(validNode.inputSha256), "artifact path must be content-SHA scoped");

  const artifactPath = path.join(artifactRoot, artifact.path);
  assert.ok(fs.existsSync(artifactPath), "layout plan file must exist");
  const planBytes = fs.readFileSync(artifactPath);
  assert.equal(sha256(planBytes), artifact.sha256);
  const plan = JSON.parse(planBytes.toString("utf8"));
  assert.equal(plan.contract, "A1NodeTypographyLayoutPlan/v1");
  assert.equal(plan.sourceFrame.sha256, sourceSha256);
  assert.equal(plan.sourceFrame.byteShaVerified, true);
  assert.equal(plan.proofBoundary.layoutPlanOnly, true);
  assert.equal(plan.proofBoundary.glyphAssetGenerated, false);
  assert.equal(plan.proofBoundary.compositeGenerated, false);
  assert.equal(plan.proofBoundary.productionAdmission, false);
  assert.deepEqual(plan.compositionPlan.groups.map((group) => group.text), ["保留", "原句"]);
  assert.equal(plan.compositionPlan.groups.map((group) => group.text).join(""), plan.exactCopy);
  assert.ok(heartbeatCount >= 2, "adapter should pulse the supplied heartbeat around work");

  const acceptedShape = await verifyNodeArtifactManifest(first.artifactManifest, {artifactRoot, node: validNode});
  assert.equal(acceptedShape.artifacts.length, 1);
  assert.equal(acceptedShape.artifacts[0].sha256, artifact.sha256);

  const beforeCache = fs.statSync(artifactPath);
  const second = await executeTypographyNode(validNode, {artifactRoot, dependencies: {}});
  const afterCache = fs.statSync(artifactPath);
  assert.equal(second.state, "needs-review");
  assert.equal(second.artifactManifest.artifacts[0].sha256, artifact.sha256);
  assert.equal(afterCache.ino, beforeCache.ino, "same input SHA must reuse the existing artifact");
  assert.equal(afterCache.mtimeMs, beforeCache.mtimeMs, "cache hit must not rewrite artifact bytes");

  const missingSource = structuredClone(validNode);
  missingSource.id = "missing-source:typography";
  missingSource.inputSha256 = "2".repeat(64);
  delete missingSource.input.parameters.sourceFrame;
  const missingResult = await executeTypographyNode(missingSource, {artifactRoot});
  assert.equal(missingResult.state, "blocked");
  assert.equal(missingResult.reason, "SOURCE_FRAME_BINDING_REQUIRED");

  const wrongSha = nodeFor({id: "wrong-sha:typography", inputSha256: "3".repeat(64), sourcePath, frameSha256: "f".repeat(64)});
  const wrongShaResult = await executeTypographyNode(wrongSha, {artifactRoot});
  assert.equal(wrongShaResult.state, "blocked");
  assert.equal(wrongShaResult.reason, "SOURCE_FRAME_SHA_MISMATCH");

  const wrongContext = nodeFor({id: "wrong-context:typography", inputSha256: "8".repeat(64), sourcePath, frameSha256: sourceSha256});
  wrongContext.input.parameters.compositionInput.shotVisualContext.geometryEvidence.frameSha256 = "d".repeat(64);
  const wrongContextResult = await executeTypographyNode(wrongContext, {artifactRoot});
  assert.equal(wrongContextResult.state, "blocked");
  assert.equal(wrongContextResult.reason, "SOURCE_VISUAL_CONTEXT_SHA_MISMATCH");

  const wrongCopy = nodeFor({id: "wrong-copy:typography", inputSha256: "4".repeat(64), sourcePath, frameSha256: sourceSha256, exactCopy: "改写文案", groups: ["保留", "原句"]});
  const wrongCopyResult = await executeTypographyNode(wrongCopy, {artifactRoot});
  assert.equal(wrongCopyResult.state, "blocked");
  assert.equal(wrongCopyResult.reason, "TYPOGRAPHY_COPY_BINDING_MISMATCH");

  const envelopeOnly = nodeFor({id: "envelope-only:typography", inputSha256: "5".repeat(64), sourcePath, frameSha256: sourceSha256, method: "ROLE_ENVELOPE_ESTIMATE_ONLY"});
  const envelopeResult = await executeTypographyNode(envelopeOnly, {artifactRoot});
  assert.equal(envelopeResult.state, "blocked");
  assert.equal(envelopeResult.reason, "ROLE_ENVELOPE_CONTEXT_NOT_ACCEPTED");

  const unneeded = nodeFor({id: "unneeded:typography", inputSha256: "6".repeat(64), sourcePath, frameSha256: sourceSha256, need: false});
  const unneededResult = await executeTypographyNode(unneeded, {artifactRoot});
  assert.equal(unneededResult.state, "blocked");
  assert.equal(unneededResult.reason, "TYPOGRAPHY_NODE_NOT_REQUIRED");

  const wrongModule = nodeFor({id: "wrong-module:typography", inputSha256: "7".repeat(64), sourcePath, frameSha256: sourceSha256, module: "material"});
  const wrongModuleResult = await executeTypographyNode(wrongModule, {artifactRoot});
  assert.equal(wrongModuleResult.state, "blocked");
  assert.equal(wrongModuleResult.reason, "TYPOGRAPHY_NODE_REQUIRED");

  for (const result of [missingResult, wrongShaResult, wrongContextResult, wrongCopyResult, envelopeResult, unneededResult, wrongModuleResult]) {
    assert.equal(result.productionAdmission, false);
    assert.equal(result.artifactManifest, undefined);
  }

  console.log(JSON.stringify({
    contract: "A1NodeTypographyAdapterTest/v1",
    status: "PASS",
    validImageBinding: true,
    sourceShaMismatchBlocked: true,
    sourceContextShaMismatchBlocked: true,
    missingSourceBlocked: true,
    exactCopyMismatchBlocked: true,
    envelopeOnlyContextBlocked: true,
    duplicateContentShaReused: true,
    layoutPlanAcceptedByArtifactVerifier: true,
    productionAdmission: false,
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
}
