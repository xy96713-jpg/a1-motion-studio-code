#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask, nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {layerCompositeNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(path.join(repoRoot, "apps/studio-next/package.json"))("sharp");
const workRoot = path.join(repoRoot, "work");
const baselinePath = path.join(workRoot, "project-diagram-output-v1", "result.json");
const taskRoot = path.join(workRoot, "node-compositor-system-v1");
const artifactRoot = path.join(taskRoot, "artifacts");
const contactSheetPath = path.join(taskRoot, "contact-sheet.png");
const resultPath = path.join(taskRoot, "result.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safeId = (value) => `${String(value).replace(/[^A-Za-z0-9._-]+/gu, "_")}-${sha256(Buffer.from(String(value), "utf8")).slice(0, 12)}`;
const baselineBytes = fs.readFileSync(baselinePath);
const baseline = JSON.parse(baselineBytes.toString("utf8"));
assert.equal(baseline.contract, "A1ProjectDiagramMaterializationTest/v1");
assert.equal(baseline.status, "PASS");
assert.equal(baseline.fixtureCount, 6);
assert.equal(baseline.genreCount, 3);
assert.equal(fs.realpathSync(workRoot), fs.realpathSync(path.join(repoRoot, "work")));
fs.mkdirSync(artifactRoot, {recursive: true});

const genericBackground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#101a28"/><rect x="48" y="48" width="1824" height="984" rx="28" fill="none" stroke="#31475d" stroke-width="4"/></svg>\n`, "utf8");
const sourceAdapterSha256 = sha256(Buffer.from("A1 isolated cross-genre fixture-source adapter v1", "utf8"));

function artifactRecord(artifactRootPath, filePath, role, kind, jsonContract = undefined) {
  const bytes = fs.readFileSync(filePath);
  const relative = path.relative(artifactRootPath, filePath).split(path.sep).join("/");
  return {path: relative, role, kind, ...(jsonContract ? {jsonContract} : {}), sha256: sha256(bytes), bytes: bytes.length};
}

async function executeFixtureSourceNode(node, {artifactRoot: outputRoot} = {}) {
  const parameters = node.input?.parameters;
  if (node.module !== "fixture-source" || node.input?.module !== "fixture-source"
    || node.input?.implementationSha256 !== sourceAdapterSha256
    || typeof parameters?.diagramPath !== "string" || !/^[a-f0-9]{64}$/u.test(parameters?.diagramSha256 || "")
    || !Number.isSafeInteger(parameters?.diagramBytes)) {
    return {state: "blocked", reason: "FIXTURE_SOURCE_INPUT_INVALID", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  const sourcePath = path.resolve(repoRoot, parameters.diagramPath);
  const realWorkRoot = fs.realpathSync(workRoot);
  if (!sourcePath.startsWith(realWorkRoot + path.sep) || !parameters.diagramPath.startsWith("work/")) {
    return {state: "blocked", reason: "FIXTURE_SOURCE_PATH_OUTSIDE_WORK", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  const entry = fs.lstatSync(sourcePath);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size !== parameters.diagramBytes) {
    return {state: "blocked", reason: "FIXTURE_SOURCE_FILE_INVALID", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }
  const diagramBytes = fs.readFileSync(sourcePath);
  if (sha256(diagramBytes) !== parameters.diagramSha256) {
    return {state: "blocked", reason: "FIXTURE_SOURCE_SHA_MISMATCH", visualApproval: "NOT_GRANTED", productionAdmission: false};
  }

  const folder = path.join(outputRoot, `fixture-source-${safeId(node.id)}`, node.inputSha256);
  fs.mkdirSync(folder, {recursive: true});
  const backgroundPath = path.join(folder, "background.svg");
  const diagramOutputPath = path.join(folder, "diagram.svg");
  const planPath = path.join(folder, "fixture-source-plan.json");
  fs.writeFileSync(backgroundPath, genericBackground);
  fs.writeFileSync(diagramOutputPath, diagramBytes);
  const plan = {contract: "A1CompositeFixtureSourcePlan/v1", nodeId: node.id, inputSha256: node.inputSha256,
    diagramSource: {path: parameters.diagramPath, sha256: parameters.diagramSha256, bytes: parameters.diagramBytes},
    background: {kind: "generic-vector-fixture", sha256: sha256(genericBackground), bytes: genericBackground.length},
    visualApproval: "NOT_GRANTED", productionAdmission: false};
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  const artifactManifest = {
    contract: "A1NodeArtifactManifest/v1", nodeId: node.id, inputSha256: node.inputSha256, productionAdmission: false,
    artifacts: [
      artifactRecord(outputRoot, backgroundPath, "generic-background", "SVG"),
      artifactRecord(outputRoot, diagramOutputPath, "source-diagram", "SVG"),
      artifactRecord(outputRoot, planPath, "fixture-source-plan", "JSON_PLAN", "A1CompositeFixtureSourcePlan/v1"),
    ],
  };
  return {state: "needs-review", reason: "FIXTURE_SOURCE_REQUIRES_TECHNICAL_ACCEPTANCE", visualApproval: "NOT_GRANTED",
    productionAdmission: false, artifactManifest};
}

const installed = createNodeAdapterRegistry({
  "fixture-source": {label: "isolated fixture source", version: 1, implementationSha256: sourceAdapterSha256, optional: true, execute: executeFixtureSourceNode},
  "layer-compositor": {...layerCompositeNodeAdapterV1, optional: true},
});
// Changed 2026-09-28: the compositor is registered by default now. It used to be excluded
// because it had no admission path; it is still a review-only producer, so being registered
// grants no production admission. The explicit injection below is kept as the isolation
// fixture — the test still proves the adapter works when handed a scoped registry.
assert.equal(createNodeAdapterRegistry().registry["layer-compositor"]?.available, true,
  "the compositor is reachable from the default registry");

const fixtures = baseline.results.map((fixture) => {
  const diagramPath = path.relative(repoRoot, path.resolve(repoRoot, fixture.svg)).split(path.sep).join("/");
  const diagramBytes = fs.readFileSync(path.join(repoRoot, diagramPath));
  assert.equal(sha256(diagramBytes), fixture.svgSha256, `locked SVG SHA for ${fixture.id}`);
  return {...fixture, diagramPath, diagramBytes: diagramBytes.length};
});
const workspaceSha256 = sha256(Buffer.from("isolated-node-compositor-research-workspace-v1", "utf8"));
const projectId = "node-compositor-system-v1";
const workflowInputForSources = {
  projectId, workspaceSha256,
  context: {articleTitle: "six-genre fixture source stage", articleSha256: sha256(baselineBytes)},
  shots: fixtures.map((fixture) => ({
    id: fixture.id,
    source: fixture.sourceCopy,
    exactCopy: fixture.diagramSpec.nodes.map((node) => node.label),
    version: "b".repeat(64),
    modules: {material: false, typography: false, recording: false, diagram: false, "fixture-source": true},
    moduleInputs: {"fixture-source": {diagramPath: fixture.diagramPath, diagramSha256: fixture.svgSha256, diagramBytes: fixture.diagramBytes}},
  })),
};

async function runUntilSettled(input, startingWorkflow, {moduleName, reviewerId, workerId}) {
  let workflow = compileNodeWorkflow(input, startingWorkflow, {moduleDefinitions: installed.definitions});
  let now = 20_000;
  let completed = 0;
  while (workflow.nodes.some((node) => node.module === moduleName && ["queued", "running", "needs-review"].includes(node.state))) {
    workflow = compileNodeWorkflow(input, workflow, {moduleDefinitions: installed.definitions});
    const batch = claimNodeTasks(workflow, {workerId, now});
    if (!batch.claims.length) {
      const remaining = workflow.nodes.filter((node) => node.module === moduleName && !["succeeded", "skipped"].includes(node.state));
      assert.deepEqual(remaining.map((node) => [node.id, node.state, node.reason]), [], "stage must not stall on a hidden dependency");
      workflow = batch.workflow;
      break;
    }
    assert.ok(batch.claims.length <= 2, "shared scheduler cap remains two concurrent claims");
    workflow = batch.workflow;
    for (const claim of batch.claims) {
      const result = await executeRegisteredNode(workflow, claim, {registry: installed.registry, artifactRoot, now: now + 1});
      assert.equal(result.state, "needs-review", `${claim.id} produces a review-only candidate`);
      assert.equal(result.visualApproval, "NOT_GRANTED");
      assert.equal(result.productionAdmission, false);
      workflow = finishNodeTask(workflow, claim, result, now + 2);
      workflow = await acceptNodeArtifacts(workflow, claim.id, {artifactRoot, reviewerId, now: now + 3});
      const accepted = workflow.nodes.find((node) => node.id === claim.id);
      assert.equal(accepted.state, "succeeded");
      assert.equal(accepted.acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
      assert.equal(accepted.acceptance.visualApproval, "NOT_GRANTED");
      assert.equal(accepted.acceptance.productionAdmission, false);
      completed += 1;
      now += 10;
    }
  }
  assert.equal(workflow.nodes.filter((node) => node.module === moduleName && node.state === "succeeded").length, fixtures.length);
  return {workflow, completed};
}

const sourceStage = await runUntilSettled(workflowInputForSources, null, {
  moduleName: "fixture-source", reviewerId: "isolated-fixture-source-technical-review", workerId: "fixture-source-worker",
});
const sourceWorkflow = sourceStage.workflow;
const workflowInputForComposites = {
  ...workflowInputForSources,
  shots: workflowInputForSources.shots.map((shot) => {
    const sourceNode = sourceWorkflow.nodes.find((node) => node.id === `${shot.id}:fixture-source`);
    assert.equal(sourceNode.state, "succeeded");
    const sourceLayers = sourceNode.acceptance.artifacts.filter((artifact) => artifact.kind === "SVG");
    const background = sourceLayers.find((artifact) => artifact.role === "generic-background");
    const diagram = sourceLayers.find((artifact) => artifact.role === "source-diagram");
    assert.ok(background && diagram);
    const makeLayer = (artifact, id, assetId, geometry, z, fit = "fill") => ({
      id, role: artifact.role, assetId, assetSha256: artifact.sha256, geometry, fit, z, opacity: 1,
      producer: {nodeId: sourceNode.id, artifactRole: artifact.role, artifactKind: artifact.kind,
        sourceAssetId: assetId, sourceAssetSha256: artifact.sha256},
    });
    const sourceBindings = [
      {assetId: `${shot.id}:background`, sha256: background.sha256, materialClass: "CODE_NATIVE_ASSET",
        identityStatus: "VERIFIED", provenanceStatus: "VERIFIED", sourceUri: "https://example.test/background.svg", usage: "synthetic fixture"},
      {assetId: `${shot.id}:diagram`, sha256: diagram.sha256, materialClass: "CODE_NATIVE_ASSET",
        identityStatus: "VERIFIED", provenanceStatus: "VERIFIED", sourceUri: "https://example.test/diagram.svg", usage: "synthetic fixture"},
    ];
    const compositionLayers = [
      makeLayer(background, "framed-background", sourceBindings[0].assetId, {x: 0.05, y: 0.06, width: 0.9, height: 0.88}, 0, "fill"),
      makeLayer(diagram, "editorial-diagram", sourceBindings[1].assetId, {x: 0.12, y: 0.18, width: 0.76, height: 0.64}, 20, "contain"),
    ];
    const decisionBody = {contract: "A1ShotPackagingDecision/v1", version: 1, shotId: shot.id, shotVersionSha256: shot.version,
      narrativeRole: "CAUSAL_EXPLANATION", viewerTask: "inspect the source-bound diagram", packagingForm: "CAUSAL_DIAGRAM",
      selectionReason: "compose declared source roles", rejectedAlternative: "manual path binding",
      copyStatus: "NO_DESIGNED_COPY", copyBindings: [], sourceBindings, sourcePixelPolicy: "PRESERVE",
      composition: {focalTarget: "diagram", hierarchy: "background then diagram", readingOrder: ["diagram"]}, layers: compositionLayers,
      effectStack: ["SOURCE_PRESERVE"], motionBeats: [], handoff: {exitCondition: "hold", nextShotRelation: "continues"},
      layoutReview: "synthetic compiler fixture", status: "READY_FOR_REVIEW", blockers: [], visualApproval: "NOT_GRANTED", productionAdmission: false};
    const packagingDecision = {...decisionBody, decisionSha256: nodeInputHash(decisionBody)};
    return {
      ...shot,
      packagingDecision,
      modules: {...shot.modules, "layer-compositor": true},
      moduleDependencies: {"layer-compositor": ["fixture-source"]},
      moduleArtifactKinds: {"layer-compositor": {"fixture-source": ["SVG"]}},
      moduleInputs: {
        ...shot.moduleInputs,
        "layer-compositor": {compositionCanvas: {contract: "A1NodeCompositionCanvas/v1", width: 1280, height: 720,
          sourceVideoSha256: shot.version}},
      },
    };
  }),
};
const compositeStage = await runUntilSettled(workflowInputForComposites, sourceWorkflow, {
  moduleName: "layer-compositor", reviewerId: "isolated-compositor-technical-review", workerId: "composite-worker",
});
const finalWorkflow = compositeStage.workflow;
const results = [];
for (const fixture of fixtures) {
  const node = finalWorkflow.nodes.find((item) => item.id === `${fixture.id}:layer-compositor`);
  assert.equal(node.state, "succeeded", `${fixture.id} compositor technical result`);
  const imageArtifact = node.acceptance.artifacts.find((artifact) => artifact.kind === "IMAGE");
  const planArtifact = node.acceptance.artifacts.find((artifact) => artifact.kind === "JSON_PLAN");
  assert.ok(imageArtifact && planArtifact);
  const imagePath = path.join(artifactRoot, imageArtifact.path);
  const imageBytes = fs.readFileSync(imagePath);
  assert.equal(sha256(imageBytes), imageArtifact.sha256);
  const metadata = await sharp(imageBytes).metadata();
  assert.deepEqual({format: metadata.format, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha},
    {format: "png", width: 1280, height: 720, hasAlpha: true});
  const plan = JSON.parse(fs.readFileSync(path.join(artifactRoot, planArtifact.path), "utf8"));
  assert.equal(plan.composition.layers.length, 2);
  assert.deepEqual(plan.composition.layers.map((layer) => layer.z), [0, 20]);
  assert.deepEqual(plan.composition.layers.map((layer) => layer.id), ["framed-background", "editorial-diagram"]);
  assert.equal(plan.proofBoundary.visualApproval, "NOT_GRANTED");
  assert.equal(plan.proofBoundary.productionAdmission, false);
  results.push({id: fixture.id, genre: fixture.genre, compositorNodeId: node.id, inputSha256: node.inputSha256,
    acceptanceManifestSha256: node.acceptance.manifestSha256, sourceSvgSha256: fixture.svgSha256,
    preview: {path: path.relative(repoRoot, imagePath).split(path.sep).join("/"), sha256: imageArtifact.sha256, bytes: imageArtifact.bytes,
      width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha},
    plan: {path: path.relative(repoRoot, path.join(artifactRoot, planArtifact.path)).split(path.sep).join("/"), sha256: planArtifact.sha256,
      layerCount: plan.composition.layers.length, layerIds: plan.composition.layers.map((layer) => layer.id), z: plan.composition.layers.map((layer) => layer.z)},
    verificationScope: node.acceptance.verificationScope, visualApproval: node.acceptance.visualApproval,
    productionAdmission: node.acceptance.productionAdmission});
}

const cellWidth = 640, cellPreviewHeight = 360, labelHeight = 32, cellHeight = cellPreviewHeight + labelHeight;
const cells = [];
for (const [index, result] of results.entries()) {
  const source = await fs.promises.readFile(path.join(repoRoot, result.preview.path));
  const preview = await sharp(source).resize(cellWidth, cellPreviewHeight, {fit: "contain", background: {r: 243, g: 241, b: 235, alpha: 1}}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#f3f1eb"/><text x="12" y="22" font-family="Arial,sans-serif" font-size="14" font-weight="600" fill="#182332">${result.genre} · ${result.id}</text></svg>`, "utf8");
  cells.push({index, bytes: await sharp({create: {width: cellWidth, height: cellHeight, channels: 4, background: {r: 243, g: 241, b: 235, alpha: 1}}})
    .composite([{input: label, left: 0, top: 0}, {input: preview, left: 0, top: labelHeight}]).png().toBuffer()});
}
const contactSheet = await sharp({create: {width: cellWidth * 3, height: cellHeight * 2, channels: 4, background: {r: 243, g: 241, b: 235, alpha: 1}}})
  .composite(cells.map(({index, bytes}) => ({input: bytes, left: (index % 3) * cellWidth, top: Math.floor(index / 3) * cellHeight})))
  .png({compressionLevel: 9, adaptiveFiltering: false}).toBuffer();
fs.writeFileSync(contactSheetPath, contactSheet);

const result = {
  contract: "A1NodeCompositeWorkflowIntegration/v1",
  status: "PASS",
  createdAt: "2026-09-28",
  sourceBaseline: {path: path.relative(repoRoot, baselinePath).split(path.sep).join("/"), sha256: sha256(baselineBytes), fixtureCount: fixtures.length,
    genreCount: new Set(fixtures.map((fixture) => fixture.genre)).size},
  scheduler: {contract: "A1NodeWorkflow/v1", sourceNodesTechnicallyAccepted: sourceStage.completed,
    compositorNodesTechnicallyAccepted: compositeStage.completed, maxConcurrentClaims: 2,
    adapter: layerCompositeNodeAdapterV1.label, defaultRegistryRegistered: false},
  fixtures: results,
  visualReview: {status: "PENDING_INDEPENDENT_PIXEL_REVIEW", contactSheetPath: path.relative(repoRoot, contactSheetPath).split(path.sep).join("/"),
    contactSheetSha256: sha256(contactSheet), width: cellWidth * 3, height: cellHeight * 2},
  proofBoundary: {artifactAcceptance: "BYTES_AND_FORMAT_ONLY", visualApproval: "NOT_GRANTED", productionAdmission: false,
    formalAuthorityModified: false, fullFilmRendered: false},
};
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({...result, resultPath: path.relative(repoRoot, resultPath).split(path.sep).join("/")}, null, 2));
