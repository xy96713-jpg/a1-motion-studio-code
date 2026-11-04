#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {createNodeAdapterRegistry} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {A1_NODE_COMPOSITE_PLAN_V1, A1_NODE_LAYER_COMPOSITION_V1, A1_NODE_LAYER_COMPOSITION_INTENT_V1, layerCompositeNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs";
import {verifyNodeArtifactManifest} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-composite-adapter-v1-"));
const sourceRoot = path.join(root, "sources");
const artifactRoot = path.join(root, "artifacts");
fs.mkdirSync(sourceRoot);

function sourceArtifact(filename, bytes, kind = "IMAGE") {
  const file = path.join(sourceRoot, filename);
  fs.writeFileSync(file, bytes);
  return {path: filename, kind, sha256: sha256(bytes), bytes: bytes.length, absolutePath: file};
}

function makeNode({layers, id = "shot-1:layer-compositor", inputSha256 = "a".repeat(64)} = {}) {
  const dependencies = [...new Set(layers.map((layer) => layer.dependencyNodeId))];
  return {
    id, module: "layer-compositor", inputSha256, dependencies, state: "running",
    input: {
      module: "layer-compositor", moduleVersion: 1, implementationSha256: layerCompositeNodeAdapterV1.implementationSha256, need: true,
      shot: {id: "shot-1", source: "two accepted layers"},
      parameters: {composition: {contract: A1_NODE_LAYER_COMPOSITION_V1, width: 4, height: 4, layers}},
    },
  };
}

function layer({id, dependencyNodeId, artifact, dependencyManifestSha256, geometry, z, opacity = 1}) {
  return {
    id, dependencyNodeId, dependencyManifestSha256,
    artifactPath: artifact.path, artifactKind: artifact.kind, artifactSha256: artifact.sha256, artifactBytes: artifact.bytes,
    geometry, fit: "fill", z, opacity,
  };
}

const deps = {};
const backgroundBytes = await sharp({create: {width: 1, height: 1, channels: 4, background: {r: 0, g: 0, b: 255, alpha: 1}}}).png().toBuffer();
const backgroundArtifact = sourceArtifact("background.png", backgroundBytes);
deps["shot-1:background"] = {state: "succeeded", manifestSha256: "b".repeat(64), artifacts: [backgroundArtifact]};
const diagramSvgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" viewBox="0 0 2 2"><rect width="2" height="2" fill="#ff0000"/></svg>\n');
const diagramArtifact = sourceArtifact("diagram.svg", diagramSvgBytes, "SVG");
deps["shot-1:diagram"] = {state: "succeeded", manifestSha256: "c".repeat(64), artifacts: [diagramArtifact]};

const compositionLayers = [
  layer({id: "solid-background", dependencyNodeId: "shot-1:background", artifact: backgroundArtifact,
    dependencyManifestSha256: deps["shot-1:background"].manifestSha256,
    geometry: {x: 0, y: 0, width: 0.5, height: 0.5}, z: 0}),
  layer({id: "verified-diagram", dependencyNodeId: "shot-1:diagram", artifact: diagramArtifact,
    dependencyManifestSha256: deps["shot-1:diagram"].manifestSha256,
    geometry: {x: 0.25, y: 0.25, width: 0.5, height: 0.5}, z: 20, opacity: 0.5}),
];
const node = makeNode({layers: compositionLayers});

try {
  const defaultRegistry = createNodeAdapterRegistry();
  // Changed 2026-09-28: the adapter is registered by default now. It was originally held out
  // of the production registry because it had no admission path at all; it is a review-only
  // producer (needs-review, productionAdmission false, visualApproval NOT_GRANTED — asserted
  // below), so "registered" must not be read as "admitted to production". Registering it is
  // what lets a shot's packaging chain reach a composite at all.
  assert.equal(defaultRegistry.registry["layer-compositor"]?.available, true, "adapter is registered and available by default");
  const injectedRegistry = createNodeAdapterRegistry({"layer-compositor": layerCompositeNodeAdapterV1});
  assert.equal(injectedRegistry.registry["layer-compositor"].available, true, "test can inject the review-only adapter explicitly");
  assert.equal(layerCompositeNodeAdapterV1.execute.name, "executeLayerCompositeNode");

  const adapter = injectedRegistry.registry["layer-compositor"];
  const first = await adapter.execute(node, {dependencies: deps, artifactRoot});
  assert.equal(first.state, "needs-review");
  assert.equal(first.reason, "LAYER_COMPOSITE_REQUIRES_INDEPENDENT_VISUAL_REVIEW");
  assert.equal(first.visualApproval, "NOT_GRANTED");
  assert.equal(first.productionAdmission, false);
  assert.equal(first.artifactManifest.productionAdmission, false);
  assert.deepEqual(first.artifactManifest.artifacts.map((item) => item.kind).sort(), ["IMAGE", "JSON_PLAN"]);
  assert.equal(first.artifactManifest.artifacts.some((item) => item.kind === "SVG"), false, "adapter does not emit an image-bearing composition SVG");

  const entries = Object.fromEntries(first.artifactManifest.artifacts.map((item) => [item.role, item]));
  for (const record of Object.values(entries)) {
    const bytes = fs.readFileSync(path.join(artifactRoot, record.path));
    assert.equal(bytes.length, record.bytes);
    assert.equal(sha256(bytes), record.sha256);
  }
  const previewPath = path.join(artifactRoot, entries["transparent-layer-preview"].path);
  const previewBytes = fs.readFileSync(previewPath);
  const {data, info} = await sharp(previewBytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  assert.deepEqual({width: info.width, height: info.height, format: info.format}, {width: 4, height: 4, format: "raw"});
  assert.equal(info.channels, 4);
  assert.equal(data[3], 255, "background quadrant is opaque");
  const overlapOffset = (1 * 4 + 1) * 4;
  const overlapRgba = [...data.subarray(overlapOffset, overlapOffset + 4)];
  const expectedOverlapRgba = [128, 0, 127, 255];
  assert.ok(overlapRgba.every((channel, index) => Math.abs(channel - expectedOverlapRgba[index]) <= 2),
    `50% red diagram over blue background must yield approximately ${expectedOverlapRgba}, got ${overlapRgba}`);
  assert.equal(data[(3 * 4 + 3) * 4 + 3], 0, "pixels outside all normalized layer bounds remain transparent");

  const planRecord = entries["layer-composition-plan"];
  const plan = JSON.parse(fs.readFileSync(path.join(artifactRoot, planRecord.path), "utf8"));
  assert.equal(plan.contract, A1_NODE_COMPOSITE_PLAN_V1);
  assert.equal(plan.editableLayers, "ORIGINAL_ACCEPTED_DEPENDENCY_ASSETS");
  assert.equal(plan.proofBoundary.visualApproval, "NOT_GRANTED");
  assert.equal(plan.proofBoundary.productionAdmission, false);
  assert.equal(plan.composition.layers[1].id, "verified-diagram");
  assert.equal(plan.composition.layers[1].artifact.sha256, diagramArtifact.sha256);
  assert.equal(plan.composition.layers[1].artifact.path, diagramArtifact.path);
  assert.equal(plan.composition.layers[1].dependencyManifestSha256, deps["shot-1:diagram"].manifestSha256);
  assert.equal(plan.composition.layers[1].geometry.x, 0.25);
  assert.equal(plan.composition.layers[1].fit, "fill");

  const acceptedOutput = await verifyNodeArtifactManifest(first.artifactManifest, {artifactRoot, node});
  assert.equal(acceptedOutput.artifacts.length, 2, "plan and PNG preview pass existing technical artifact acceptance");
  assert.equal(acceptedOutput.artifacts.find((item) => item.kind === "IMAGE").metadata.alphaChannelPresent, true);
  assert.equal(plan.composition.layers[1].z, 20);

  const previewStat = fs.statSync(previewPath);
  const planStat = fs.statSync(path.join(artifactRoot, planRecord.path));
  const cached = await adapter.execute(node, {dependencies: deps, artifactRoot});
  assert.equal(cached.state, "needs-review");
  for (const [file, before] of [[previewPath, previewStat], [path.join(artifactRoot, planRecord.path), planStat]]) {
    const after = fs.statSync(file);
    assert.equal(after.ino, before.ino, "deterministic cache reuse preserves the existing file");
    assert.equal(after.mtimeMs, before.mtimeMs, "deterministic cache reuse does not rewrite the artifact");
  }

  const stripBytes = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]),
    {raw: {width: 2, height: 1, channels: 4}}).png().toBuffer();
  const stripArtifact = sourceArtifact("red-blue-strip.png", stripBytes);
  deps["shot-1:crop-source"] = {state: "succeeded", manifestSha256: "f".repeat(64), artifacts: [stripArtifact]};
  const cropLayer = layer({id: "source-region", dependencyNodeId: "shot-1:crop-source", artifact: stripArtifact,
    dependencyManifestSha256: deps["shot-1:crop-source"].manifestSha256,
    geometry: {x: 0, y: 0, width: 1, height: 1}, z: 0});
  cropLayer.sourceRect = {x: 0.5, y: 0, width: 0.5, height: 1};
  const cropNode = makeNode({id: "shot-1:source-region", layers: [cropLayer]});
  const cropped = await adapter.execute(cropNode, {dependencies: deps, artifactRoot});
  assert.equal(cropped.state, "needs-review");
  const croppedPreview = cropped.artifactManifest.artifacts.find((item) => item.role === "transparent-layer-preview");
  const croppedPixels = await sharp(path.join(artifactRoot, croppedPreview.path)).ensureAlpha().raw().toBuffer();
  for (let offset = 0; offset < croppedPixels.length; offset += 4) {
    assert.deepEqual([...croppedPixels.subarray(offset, offset + 4)], [0, 0, 255, 255], "crop keeps only the blue source pixels");
  }
  const croppedPlan = cropped.artifactManifest.artifacts.find((item) => item.role === "layer-composition-plan");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(artifactRoot, croppedPlan.path), "utf8")).composition.layers[0].sourceRect,
    cropLayer.sourceRect, "editable plan keeps the exact source region");
  const badCropNode = structuredClone(cropNode);
  badCropNode.id = "shot-1:bad-source-region";
  badCropNode.input.parameters.composition.layers[0].sourceRect = {x: 0.75, y: 0, width: 0.5, height: 1};
  const badCrop = await adapter.execute(badCropNode, {dependencies: deps, artifactRoot});
  assert.equal(badCrop.reason, "COMPOSITE_LAYER_SOURCE_RECT_INVALID");

  stripArtifact.role = "verified-strip";
  const intentNode = structuredClone(cropNode);
  intentNode.id = "shot-1:role-bound-source-region";
  intentNode.input.parameters = {compositionIntent: {
    contract: A1_NODE_LAYER_COMPOSITION_INTENT_V1, width: 4, height: 4,
    layers: [{id: "source-region", dependencyNodeId: "shot-1:crop-source", artifactRole: "verified-strip",
      artifactKind: "IMAGE", geometry: {x: 0, y: 0, width: 1, height: 1},
      sourceRect: cropLayer.sourceRect, fit: "fill", z: 0, opacity: 1}],
  }};
  const roleBound = await adapter.execute(intentNode, {dependencies: deps, artifactRoot});
  assert.equal(roleBound.state, "needs-review");
  const roleBoundPreview = roleBound.artifactManifest.artifacts.find((item) => item.role === "transparent-layer-preview");
  assert.equal(roleBoundPreview.sha256, croppedPreview.sha256, "late binding selects the same accepted source pixels");
  const roleBoundPlan = roleBound.artifactManifest.artifacts.find((item) => item.role === "layer-composition-plan");
  const roleBoundPlanJson = JSON.parse(fs.readFileSync(path.join(artifactRoot, roleBoundPlan.path), "utf8"));
  assert.equal(roleBoundPlanJson.bindingMode, "ACCEPTED_DEPENDENCY_ROLE");
  assert.equal(roleBoundPlanJson.composition.layers[0].artifactRole, "verified-strip");
  assert.equal(roleBoundPlanJson.composition.layers[0].dependencyManifestSha256, deps["shot-1:crop-source"].manifestSha256);
  const missingRoleNode = structuredClone(intentNode);
  missingRoleNode.id = "shot-1:missing-role";
  missingRoleNode.input.parameters.compositionIntent.layers[0].artifactRole = "unverified-role";
  assert.equal((await adapter.execute(missingRoleNode, {dependencies: deps, artifactRoot})).reason,
    "COMPOSITE_INTENT_ARTIFACT_ROLE_NOT_UNIQUE");
  const forgedPathNode = structuredClone(intentNode);
  forgedPathNode.id = "shot-1:forged-role-path";
  forgedPathNode.input.parameters.compositionIntent.layers[0].artifactPath = "../other.png";
  assert.equal((await adapter.execute(forgedPathNode, {dependencies: deps, artifactRoot})).reason,
    "COMPOSITE_INTENT_ARTIFACT_ROLE_INVALID");
  const oversizedIntentNode = structuredClone(intentNode);
  oversizedIntentNode.id = "shot-1:oversized-intent";
  oversizedIntentNode.input.parameters.compositionIntent.layers = Array.from({length: 17},
    () => structuredClone(intentNode.input.parameters.compositionIntent.layers[0]));
  assert.equal((await adapter.execute(oversizedIntentNode, {dependencies: deps, artifactRoot})).reason,
    "COMPOSITE_INTENT_INVALID");

  const badShaNode = structuredClone(node);
  badShaNode.id = "shot-1:bad-sha";
  badShaNode.input.parameters.composition.layers[0].artifactSha256 = "d".repeat(64);
  const badSha = await adapter.execute(badShaNode, {dependencies: deps, artifactRoot});
  assert.equal(badSha.state, "blocked");
  assert.match(badSha.reason, /ARTIFACT_BINDING_MISMATCH/u);

  const missingNode = structuredClone(node);
  missingNode.id = "shot-1:missing-dependency";
  const missing = await adapter.execute(missingNode, {dependencies: {}, artifactRoot});
  assert.equal(missing.state, "blocked");
  assert.equal(missing.reason, "COMPOSITE_DEPENDENCY_NOT_VERIFIED");

  const traversalNode = structuredClone(node);
  traversalNode.id = "shot-1:path-escape";
  traversalNode.input.parameters.composition.layers[0].artifactPath = "../outside.png";
  const traversal = await adapter.execute(traversalNode, {dependencies: deps, artifactRoot});
  assert.equal(traversal.state, "blocked");
  assert.equal(traversal.reason, "COMPOSITE_LAYER_ARTIFACT_BINDING_INVALID");

  const unsafeBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><script>alert(1)</script></svg>');
  const unsafeArtifact = sourceArtifact("unsafe.svg", unsafeBytes, "SVG");
  const unsafeDepId = "shot-1:unsafe";
  deps[unsafeDepId] = {state: "succeeded", manifestSha256: "e".repeat(64), artifacts: [unsafeArtifact]};
  const unsafeLayer = layer({id: "unsafe-svg", dependencyNodeId: unsafeDepId, artifact: unsafeArtifact,
    dependencyManifestSha256: deps[unsafeDepId].manifestSha256,
    geometry: {x: 0, y: 0, width: 1, height: 1}, z: 0});
  const unsafeNode = makeNode({id: "shot-1:unsafe-svg", layers: [unsafeLayer]});
  const unsafe = await adapter.execute(unsafeNode, {dependencies: deps, artifactRoot});
  assert.equal(unsafe.state, "blocked");
  assert.equal(unsafe.reason, "COMPOSITE_SOURCE_SVG_UNSAFE");

  const symlinkNode = structuredClone(node);
  symlinkNode.id = "shot-1:symlink-source";
  const linkPath = path.join(sourceRoot, "linked.png");
  fs.symlinkSync(path.join(sourceRoot, "background.png"), linkPath);
  const linkedArtifact = {...backgroundArtifact, path: "linked.png", absolutePath: linkPath};
  deps["shot-1:background"].artifacts.push(linkedArtifact);
  symlinkNode.input.parameters.composition.layers[0].artifactPath = "linked.png";
  const symlink = await adapter.execute(symlinkNode, {dependencies: deps, artifactRoot});
  assert.equal(symlink.state, "blocked");
  assert.equal(symlink.reason, "COMPOSITE_SOURCE_SYMLINK_FORBIDDEN");

  console.log(JSON.stringify({status: "PASS", focusedChecks: ["two-layer-z-geometry-opacity-binding", "exact-opacity-blend-rgba", "transparent-png-decode-and-alpha", "editable-source-asset-bindings", "source-region-pixel-crop-and-plan", "source-region-out-of-bounds", "accepted-role-late-binding", "missing-role-rejected", "forged-role-path-rejected", "oversized-intent-rejected", "existing-output-artifact-acceptance", "sha-and-byte-manifest", "deterministic-cache", "sha-mismatch", "missing-dependency", "path-traversal", "unsafe-svg", "source-symlink", "review-boundary"], adapterRegisteredByDefault: true, planContract: A1_NODE_COMPOSITE_PLAN_V1}));
} finally {
  fs.rmSync(root, {recursive: true, force: true});
}
