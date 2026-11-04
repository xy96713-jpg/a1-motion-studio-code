#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {diagramNodeAdapterV1, executeDiagramNode, A1_NODE_DIAGRAM_PLAN_V1} from "../apps/studio-next/src/lib/a1-node-diagram-adapter-v1.mjs";
import {nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {RETRO_PIXEL_FONT_MANIFEST} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-diagram-adapter-v1-"));
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.join(repoRoot, "work");
const fontRecord = RETRO_PIXEL_FONT_MANIFEST.find((item) => item.assetId === "type-pixel-correction");
const fontPath = "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf";
const sourceText = "模型先训练，再通过验证，最后上线";
const diagramSpec = {
  contract: "A1DeterministicDiagramSpec/v1",
  kind: "sequence",
  nodes: [
    {id: "train", label: "训练"},
    {id: "verify", label: "验证"},
    {id: "launch", label: "上线"},
  ],
  edges: [
    {from: "train", to: "verify", relation: "before-after"},
    {from: "verify", to: "launch", relation: "before-after"},
  ],
};
let sourceLockFixtureRoot = null;

function nodeFor({
  id = "shot-1:diagram",
  source = sourceText,
  spec = diagramSpec,
  font = {assetId: fontRecord.assetId, path: fontPath, sha256: fontRecord.sha256},
  sourceEvidenceIds = [],
  sourceEvidenceManifestSha256 = null,
  sourceEvidenceManifestPath = null,
  sourceBodySha256 = null,
  sourceUrl = "",
  implementationSha256 = diagramNodeAdapterV1.implementationSha256,
} = {}) {
  const input = {
    projectId: "diagram-adapter-test",
    context: {articleTitle: "验证图解 claim"},
    shot: {
      id: "shot-1",
      source,
      visual: "sequence explanation",
      exactCopy: ["训练", "验证", "上线"],
      version: "fixture-v1",
      sourceUrl,
      slotKind: "single-image",
    },
    module: "diagram",
    moduleVersion: 1,
    implementationSha256,
    need: true,
    parameters: {
      diagramSpec: spec,
      sourceEvidenceIds,
      ...(sourceEvidenceManifestSha256 == null ? {} : {sourceEvidenceManifestSha256}),
      ...(sourceEvidenceManifestPath == null ? {} : {sourceEvidenceManifestPath}),
      ...(sourceBodySha256 == null ? {} : {sourceBodySha256}),
      fontBinding: font,
      width: 1280,
      height: 720,
    },
  };
  return {
    id,
    shotId: "shot-1",
    module: "diagram",
    inputSha256: nodeInputHash({input, dependencies: []}),
    input,
    dependencies: [],
    state: "running",
    lease: {workerId: "test-worker", token: "test-lease", expiresAt: Date.now() + 60_000},
  };
}

function createSourceLockFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(workRoot, ".a1-node-diagram-source-lock-adapter-test-"));
  const captureRoot = path.join(fixtureRoot, "source-capture");
  fs.mkdirSync(captureRoot);
  const bodyPath = path.join(captureRoot, "body.txt");
  const pagePath = path.join(captureRoot, "page.json");
  const lockPath = path.join(fixtureRoot, "source-lock.json");
  const bodyBytes = Buffer.from(sourceText, "utf8");
  const bodySha256 = sha256(bodyBytes);
  const sourceUrl = "https://example.org/diagram-adapter-test";
  const sourceTitle = "Diagram Adapter Source Lock Test";
  fs.writeFileSync(bodyPath, bodyBytes);
  fs.writeFileSync(pagePath, `${JSON.stringify({contract: "A1ArticlePageSource/v1", sourceUrl, targetUrl: sourceUrl, title: sourceTitle}, null, 2)}\n`);
  const manifest = {
    contract: "A1ArticleClaimSourceLock/v1",
    source: {title: sourceTitle, canonicalUrl: sourceUrl, articleBodyPath: "source-capture/body.txt", articleBodySha256: bodySha256, localPageCapture: "source-capture/page.json"},
    claims: [{evidenceId: "article-paragraph-03", sourceParagraph: 3, exactText: sourceText, exactTextSha256: sha256(Buffer.from(sourceText, "utf8"))}],
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(lockPath, manifestBytes);
  return {
    root: fixtureRoot,
    sourceUrl,
    sourceEvidenceManifestPath: path.relative(repoRoot, lockPath).split(path.sep).join("/"),
    sourceEvidenceManifestSha256: sha256(manifestBytes),
    sourceBodySha256: bodySha256,
  };
}

try {
  assert.equal(diagramNodeAdapterV1.version, 1);
  assert.equal(diagramNodeAdapterV1.enabled, true);
  assert.equal(diagramNodeAdapterV1.execute, executeDiagramNode);
  assert.match(diagramNodeAdapterV1.implementationSha256, /^[a-f0-9]{64}$/u);

  const compilerSourcePath = new URL("../apps/studio-next/src/lib/a1-project-diagram-svg-v1.mjs", import.meta.url);
  const adapterSourcePath = new URL("../apps/studio-next/src/lib/a1-node-diagram-adapter-v1.mjs", import.meta.url);
  const resolverSourcePath = new URL("../apps/studio-next/src/lib/a1-node-source-lock-resolver-v1.mjs", import.meta.url);
  const compilerSourceBytes = fs.readFileSync(compilerSourcePath);
  const adapterSourceBytes = fs.readFileSync(adapterSourcePath);
  const resolverSourceBytes = fs.readFileSync(resolverSourcePath);
  const implementationSha = (resolverBytes, compilerBytes) => sha256(Buffer.concat([
    Buffer.from("diagram/v1\0", "utf8"), adapterSourceBytes, Buffer.from("\0", "utf8"), resolverBytes,
    Buffer.from("\0", "utf8"), compilerBytes,
  ]));
  assert.equal(diagramNodeAdapterV1.implementationSha256, implementationSha(resolverSourceBytes, compilerSourceBytes),
    "implementation SHA covers adapter, resolver, and actual compiler source bytes");

  const sourceLockFixture = createSourceLockFixture();
  sourceLockFixtureRoot = sourceLockFixture.root;
  const validNode = nodeFor({
    sourceEvidenceIds: ["article-paragraph-03"],
    sourceEvidenceManifestPath: sourceLockFixture.sourceEvidenceManifestPath,
    sourceEvidenceManifestSha256: sourceLockFixture.sourceEvidenceManifestSha256,
    sourceBodySha256: sourceLockFixture.sourceBodySha256,
    sourceUrl: sourceLockFixture.sourceUrl,
  });
  const changedCompilerSha = implementationSha(resolverSourceBytes, Buffer.concat([compilerSourceBytes, Buffer.from("\n// simulated compiler revision", "utf8")]));
  const changedCompilerInput = structuredClone(validNode.input);
  changedCompilerInput.implementationSha256 = changedCompilerSha;
  assert.notEqual(nodeInputHash({input: changedCompilerInput, dependencies: []}), validNode.inputSha256,
    "a compiler source change must invalidate the node input hash and cached artifacts");
  const changedResolverSha = implementationSha(Buffer.concat([resolverSourceBytes, Buffer.from("\n// simulated resolver revision", "utf8")]), compilerSourceBytes);
  const changedResolverInput = structuredClone(validNode.input);
  changedResolverInput.implementationSha256 = changedResolverSha;
  assert.notEqual(nodeInputHash({input: changedResolverInput, dependencies: []}), validNode.inputSha256,
    "a resolver source change must invalidate the node input hash and cached artifacts");

  const staleImplementation = nodeFor({implementationSha256: "c".repeat(64)});
  const staleImplementationResult = await executeDiagramNode(staleImplementation, {artifactRoot: path.join(tempRoot, "artifacts")});
  assert.equal(staleImplementationResult.state, "blocked");
  assert.equal(staleImplementationResult.reason, "DIAGRAM_IMPLEMENTATION_SHA_MISMATCH");

  const artifactRoot = path.join(tempRoot, "artifacts");
  let heartbeatCount = 0;
  const first = await executeDiagramNode(validNode, {
    artifactRoot,
    dependencies: {},
    heartbeat: () => { heartbeatCount += 1; },
  });
  assert.equal(first.state, "needs-review");
  assert.equal(first.reason, "DIAGRAM_SVG_REQUIRES_INDEPENDENT_VISUAL_REVIEW");
  assert.equal(first.productionAdmission, false);
  assert.equal(first.visualApproval, false);
  assert.equal(first.artifactKind, "EDITABLE_DIAGRAM_SVG");
  assert.equal(first.artifactManifest.contract, "A1NodeArtifactManifest/v1");
  assert.equal(first.artifactManifest.nodeId, validNode.id);
  assert.equal(first.artifactManifest.inputSha256, validNode.inputSha256);
  assert.equal(first.artifactManifest.productionAdmission, false);
  assert.deepEqual(first.artifactManifest.artifacts.map((item) => item.kind).sort(), ["JSON_PLAN", "SVG"]);
  assert.ok(heartbeatCount >= 2);

  const byRole = Object.fromEntries(first.artifactManifest.artifacts.map((item) => [item.role, item]));
  const svgArtifact = byRole["editable-diagram"];
  const planArtifact = byRole["diagram-plan"];
  for (const artifact of [svgArtifact, planArtifact]) {
    assert.ok(!path.isAbsolute(artifact.path));
    assert.ok(!artifact.path.split("/").includes(".."));
    assert.ok(artifact.path.includes(validNode.inputSha256), "artifact path must be scoped to the claimed input SHA");
    const bytes = fs.readFileSync(path.join(artifactRoot, artifact.path));
    assert.equal(bytes.length, artifact.bytes);
    assert.equal(sha256(bytes), artifact.sha256);
  }
  const svgBytes = fs.readFileSync(path.join(artifactRoot, svgArtifact.path));
  const svg = svgBytes.toString("utf8");
  assert.match(svg, /<svg\b/u);
  assert.match(svg, /data-diagram-node-id="train"/u);
  assert.match(svg, /data-diagram-node-id="verify"/u);
  assert.match(svg, /data-diagram-node-id="launch"/u);

  const plan = JSON.parse(fs.readFileSync(path.join(artifactRoot, planArtifact.path), "utf8"));
  assert.equal(plan.contract, A1_NODE_DIAGRAM_PLAN_V1);
  assert.equal(plan.inputSha256, validNode.inputSha256);
  assert.equal(plan.sourceTextSha256, sha256(Buffer.from(sourceText, "utf8")));
  assert.deepEqual(plan.sourceEvidenceIds, ["article-paragraph-03"]);
  assert.equal(plan.sourceEvidenceManifestSha256, sourceLockFixture.sourceEvidenceManifestSha256);
  assert.equal(plan.sourceBodySha256, sourceLockFixture.sourceBodySha256);
  assert.equal(plan.sourceLockResolution.contract, "A1NodeSourceLockResolution/v1");
  assert.equal(plan.sourceLockResolution.status, "RESOLVED_FOR_COPY_BINDING_ONLY");
  assert.equal(plan.sourceLockResolution.sourceEvidenceResolved, true);
  assert.equal(plan.sourceLockResolution.factualClaimApproval, "NOT_APPROVED");
  assert.equal(plan.sourceLockResolution.rightsApproval, "NOT_WITHIN_SCOPE");
  assert.equal(plan.proofBoundary.sourceEvidenceResolved, true);
  assert.equal(plan.proofBoundary.factualClaimApproval, "NOT_APPROVED");
  assert.deepEqual(plan.visibleEdgeLabels, [], "legacy diagram specs without edge labels must expose an empty visibleEdgeLabels list");
  assert.equal(plan.fontBinding.sha256, fontRecord.sha256);
  assert.equal(plan.svg.sha256, svgArtifact.sha256);
  assert.equal(plan.svg.editableVector, true);
  assert.equal(plan.svg.rasterBaked, false);
  assert.equal(plan.proofBoundary.visualApproval, false);
  assert.equal(plan.proofBoundary.productionAdmission, false);

  const verified = await verifyNodeArtifactManifest(first.artifactManifest, {artifactRoot, node: validNode});
  assert.equal(verified.artifacts.length, 2);
  assert.equal(verified.artifacts.find((item) => item.kind === "SVG").metadata.editable, true);
  assert.equal(verified.artifacts.find((item) => item.kind === "SVG").metadata.rasterBaked, false);

  const svgBeforeCache = fs.statSync(path.join(artifactRoot, svgArtifact.path));
  const planBeforeCache = fs.statSync(path.join(artifactRoot, planArtifact.path));
  const cached = await executeDiagramNode(validNode, {artifactRoot});
  const svgAfterCache = fs.statSync(path.join(artifactRoot, svgArtifact.path));
  const planAfterCache = fs.statSync(path.join(artifactRoot, planArtifact.path));
  assert.equal(cached.state, "needs-review");
  assert.equal(cached.artifactManifest.artifacts.find((item) => item.kind === "SVG").sha256, svgArtifact.sha256);
  assert.equal(svgAfterCache.ino, svgBeforeCache.ino, "same claim must reuse the SVG cache entry");
  assert.equal(svgAfterCache.mtimeMs, svgBeforeCache.mtimeMs, "cache reuse must not rewrite the SVG");
  assert.equal(planAfterCache.ino, planBeforeCache.ino, "same claim must reuse the plan cache entry");

  const staleSource = structuredClone(validNode);
  staleSource.input.shot.source += "更改";
  const staleResult = await executeDiagramNode(staleSource, {artifactRoot});
  assert.equal(staleResult.state, "blocked");
  assert.equal(staleResult.reason, "DIAGRAM_NODE_INPUT_SHA_MISMATCH");

  const unboundLabel = nodeFor({source: "只有另一段原文"});
  const unboundLabelResult = await executeDiagramNode(unboundLabel, {artifactRoot});
  assert.equal(unboundLabelResult.state, "blocked");
  assert.equal(unboundLabelResult.reason, "DIAGRAM_NODE_LABEL_NOT_IN_SOURCE_COPY");

  const missingEvidenceManifest = nodeFor({sourceEvidenceIds: ["article-paragraph-03"], sourceEvidenceManifestSha256: null,
    sourceEvidenceManifestPath: sourceLockFixture.sourceEvidenceManifestPath, sourceBodySha256: sourceLockFixture.sourceBodySha256, sourceUrl: sourceLockFixture.sourceUrl});
  const missingEvidenceManifestResult = await executeDiagramNode(missingEvidenceManifest, {artifactRoot});
  assert.equal(missingEvidenceManifestResult.state, "blocked");
  assert.equal(missingEvidenceManifestResult.reason, "DIAGRAM_SOURCE_EVIDENCE_MANIFEST_SHA_REQUIRED");

  const invalidEvidenceManifest = nodeFor({sourceEvidenceIds: ["article-paragraph-03"], sourceEvidenceManifestSha256: "not-a-sha",
    sourceEvidenceManifestPath: sourceLockFixture.sourceEvidenceManifestPath, sourceBodySha256: sourceLockFixture.sourceBodySha256, sourceUrl: sourceLockFixture.sourceUrl});
  const invalidEvidenceManifestResult = await executeDiagramNode(invalidEvidenceManifest, {artifactRoot});
  assert.equal(invalidEvidenceManifestResult.state, "blocked");
  assert.equal(invalidEvidenceManifestResult.reason, "DIAGRAM_SOURCE_EVIDENCE_MANIFEST_SHA_INVALID");

  const missingResolverInputs = nodeFor({sourceEvidenceIds: ["article-paragraph-03"], sourceEvidenceManifestSha256: "c".repeat(64), sourceUrl: sourceLockFixture.sourceUrl});
  const missingResolverInputsResult = await executeDiagramNode(missingResolverInputs, {artifactRoot});
  assert.equal(missingResolverInputsResult.state, "blocked");
  assert.equal(missingResolverInputsResult.reason, "DIAGRAM_SOURCE_LOCK_INPUTS_REQUIRED");

  const mismatchedSourceLock = nodeFor({sourceEvidenceIds: ["article-paragraph-03"], sourceEvidenceManifestSha256: "f".repeat(64),
    sourceEvidenceManifestPath: sourceLockFixture.sourceEvidenceManifestPath, sourceBodySha256: sourceLockFixture.sourceBodySha256, sourceUrl: sourceLockFixture.sourceUrl});
  const mismatchedSourceLockResult = await executeDiagramNode(mismatchedSourceLock, {artifactRoot});
  assert.equal(mismatchedSourceLockResult.state, "blocked");
  assert.equal(mismatchedSourceLockResult.reason, "DIAGRAM_SOURCE_LOCK_RESOLUTION_FAILED");
  assert.equal(mismatchedSourceLockResult.blockers[0].code, "NODE_SOURCE_LOCK_MANIFEST_SHA_MISMATCH");

  const syntheticWithoutEvidence = nodeFor({sourceEvidenceIds: [], sourceEvidenceManifestSha256: null});
  const syntheticWithoutEvidenceResult = await executeDiagramNode(syntheticWithoutEvidence, {artifactRoot});
  assert.equal(syntheticWithoutEvidenceResult.state, "needs-review");
  const syntheticPlanArtifact = syntheticWithoutEvidenceResult.artifactManifest.artifacts.find((item) => item.role === "diagram-plan");
  const syntheticPlan = JSON.parse(fs.readFileSync(path.join(artifactRoot, syntheticPlanArtifact.path), "utf8"));
  assert.deepEqual(syntheticPlan.sourceEvidenceIds, []);
  assert.equal(syntheticPlan.sourceEvidenceManifestSha256, null, "empty evidence fixtures remain compatible without a manifest SHA");
  assert.equal(syntheticPlan.sourceLockResolution, null, "synthetic no-evidence path does not claim a source lock resolution");
  assert.equal(syntheticPlan.proofBoundary.sourceEvidenceResolved, false);

  const labelledSpec = structuredClone(diagramSpec);
  labelledSpec.edges[0].label = "再通过";
  const labelledNode = nodeFor({id: "edge-label:diagram", spec: labelledSpec});
  const labelledResult = await executeDiagramNode(labelledNode, {artifactRoot});
  assert.equal(labelledResult.state, "needs-review");
  assert.equal(labelledResult.productionAdmission, false);
  assert.equal(labelledResult.visualApproval, false);
  const labelledPlanArtifact = labelledResult.artifactManifest.artifacts.find((item) => item.role === "diagram-plan");
  const labelledPlan = JSON.parse(fs.readFileSync(path.join(artifactRoot, labelledPlanArtifact.path), "utf8"));
  assert.deepEqual(labelledPlan.visibleEdgeLabels, ["再通过"]);
  assert.equal(labelledPlan.proofBoundary.visualApproval, false);
  assert.equal(labelledPlan.proofBoundary.productionAdmission, false);
  const labelledSvgArtifact = labelledResult.artifactManifest.artifacts.find((item) => item.role === "editable-diagram");
  const labelledSvg = fs.readFileSync(path.join(artifactRoot, labelledSvgArtifact.path), "utf8");
  assert.match(labelledSvg, /data-a1-diagram-edge-labels="exact-source-substrings"/u);
  assert.match(labelledSvg, /data-diagram-edge-label-id="edge-0"/u);
  assert.doesNotMatch(labelledSvg, /<text\b|<rect\b|<image\b/iu);

  const invalidEdgeLabelSpec = structuredClone(diagramSpec);
  invalidEdgeLabelSpec.edges[0].label = "不存在的来源原文";
  const invalidEdgeLabelResult = await executeDiagramNode(nodeFor({id: "invalid-edge-label:diagram", spec: invalidEdgeLabelSpec}), {artifactRoot});
  assert.equal(invalidEdgeLabelResult.state, "blocked");
  assert.equal(invalidEdgeLabelResult.reason, "DIAGRAM_EDGE_LABEL_NOT_IN_SOURCE_COPY");

  const staleFontSha = nodeFor({font: {...validNode.input.parameters.fontBinding, sha256: "f".repeat(64)}});
  const staleFontResult = await executeDiagramNode(staleFontSha, {artifactRoot});
  assert.equal(staleFontResult.state, "blocked");
  assert.equal(staleFontResult.reason, "DIAGRAM_FONT_SHA_MISMATCH");

  const unsafeFont = nodeFor({font: {...validNode.input.parameters.fontBinding, path: path.resolve(tempRoot, "untrusted.ttf")}});
  const unsafeFontResult = await executeDiagramNode(unsafeFont, {artifactRoot});
  assert.equal(unsafeFontResult.state, "blocked");
  assert.equal(unsafeFontResult.reason, "DIAGRAM_APPROVED_FONT_BINDING_REQUIRED");

  const artifactTarget = path.join(tempRoot, "artifact-target");
  const artifactSymlink = path.join(tempRoot, "artifact-symlink");
  fs.mkdirSync(artifactTarget);
  fs.symlinkSync(artifactTarget, artifactSymlink, "dir");
  const unsafeRootResult = await executeDiagramNode(nodeFor({id: "symlink-root:diagram"}), {artifactRoot: artifactSymlink});
  assert.equal(unsafeRootResult.state, "blocked");
  assert.equal(unsafeRootResult.reason, "DIAGRAM_ARTIFACT_ROOT_INVALID");
  assert.deepEqual(fs.readdirSync(artifactTarget), [], "symlinked artifact roots must not receive files");

  const traversalNode = nodeFor({id: "../../outside:diagram"});
  const traversalResult = await executeDiagramNode(traversalNode, {artifactRoot});
  assert.equal(traversalResult.state, "needs-review", "node IDs are sanitized before they become path components");
  for (const artifact of traversalResult.artifactManifest.artifacts) {
    const absolute = path.resolve(artifactRoot, artifact.path);
    const relative = path.relative(artifactRoot, absolute);
    assert.ok(!relative.startsWith(`..${path.sep}`) && relative !== "..");
  }

  for (const result of [staleImplementationResult, staleResult, unboundLabelResult, missingEvidenceManifestResult, invalidEvidenceManifestResult,
    missingResolverInputsResult, mismatchedSourceLockResult, invalidEdgeLabelResult, staleFontResult, unsafeFontResult, unsafeRootResult]) {
    assert.equal(result.productionAdmission, false);
    assert.equal(result.visualApproval, false);
    assert.equal(result.artifactManifest, undefined);
  }

  console.log(JSON.stringify({
    contract: "A1NodeDiagramAdapterTest/v1",
    status: "PASS",
    implementationShaBindsAdapterAndCompiler: true,
    implementationShaBindsResolver: true,
    compilerChangeInvalidatesNodeInputSha: true,
    claimSourceShaBound: true,
    diagramLabelsMustMatchSource: true,
    evidenceManifestShaRequiredForSourceIds: true,
    evidenceManifestShaCopiedToPlan: true,
    copySourceLockReceiptResolvedBeforeArtifact: true,
    missingResolverInputsBlockedForEvidenceIds: true,
    emptyEvidenceFixtureCompatibility: true,
    sourceBoundEditableEdgeLabelProduced: true,
    invalidEdgeLabelRejected: true,
    visibleEdgeLabelsProjectedToPlan: true,
    approvedLocalFontShaVerified: true,
    unsafeArtifactRootBlocked: true,
    editableSvgAndPlanWritten: true,
    shaAndByteManifestVerified: true,
    contentAddressedCacheReused: true,
    reviewOnlyBoundary: true,
  }, null, 2));
} finally {
  fs.rmSync(tempRoot, {recursive: true, force: true});
  if (sourceLockFixtureRoot) fs.rmSync(sourceLockFixtureRoot, {recursive: true, force: true});
}
