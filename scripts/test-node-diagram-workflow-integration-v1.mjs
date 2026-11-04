#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask, nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {RETRO_PIXEL_FONT_MANIFEST} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const adapters = createNodeAdapterRegistry();
assert.equal(adapters.registry.diagram?.available, true);
assert.equal(adapters.definitions.diagram?.optional, true);
const source = "先训练模型，再通过验证，最后上线";
const font = RETRO_PIXEL_FONT_MANIFEST.find((item) => item.assetId === "type-pixel-correction");
const parameters = {
  diagramSpec: {contract: "A1DeterministicDiagramSpec/v1", kind: "sequence",
    nodes: [{id: "train", label: "训练"}, {id: "verify", label: "验证"}, {id: "launch", label: "上线"}],
    edges: [{from: "train", to: "verify", relation: "before-after"}, {from: "verify", to: "launch", relation: "before-after"}]},
  sourceEvidenceIds: [],
  fontBinding: {assetId: font.assetId, path: "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf", sha256: font.sha256},
  width: 1280, height: 720,
};
const input = {projectId: "diagram-workflow-integration", workspaceSha256: "a".repeat(64),
  context: {articleTitle: "训练图解", articleSha256: "b".repeat(64)},
  shots: [
    {id: "optional-unselected", source, modules: {material: false, typography: false, recording: false}},
    {id: "diagram-selected", source, exactCopy: ["训练", "验证", "上线"],
      modules: {material: false, typography: false, recording: false, diagram: true},
      moduleInputs: {diagram: parameters}},
  ]};

const planned = compileNodeWorkflow(input, null, {moduleDefinitions: adapters.definitions});
assert.equal(planned.nodes.some((node) => node.shotId === "optional-unselected" && node.module === "diagram"), false,
  "optional diagram route must not create an unknown blocker when it was not selected");
const diagramNode = planned.nodes.find((node) => node.shotId === "diagram-selected" && node.module === "diagram");
assert.equal(diagramNode?.state, "queued");
assert.equal(diagramNode.inputSha256, nodeInputHash({input: diagramNode.input, dependencies: []}));

const claimed = claimNodeTasks(planned, {workerId: "diagram-integration-worker", now: 1000});
assert.equal(claimed.claims.length, 1);
assert.equal(claimed.claims[0].id, diagramNode.id);
const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-node-diagram-workflow-integration-"));
try {
  const result = await executeRegisteredNode(claimed.workflow, claimed.claims[0], {registry: adapters.registry, artifactRoot, now: 1001});
  assert.equal(result.state, "needs-review");
  assert.equal(result.productionAdmission, false);
  assert.equal(result.visualApproval, false);
  let completed = finishNodeTask(claimed.workflow, claimed.claims[0], result, 1002);
  const needsReview = completed.nodes.find((node) => node.id === diagramNode.id);
  const technicallyAccepted = await acceptNodeArtifacts(completed, diagramNode.id,
    {artifactRoot, reviewerId: "diagram-integration-test", now: 1003});
  const acceptedNode = technicallyAccepted.nodes.find((node) => node.id === diagramNode.id);
  assert.equal(acceptedNode.state, "succeeded");
  assert.equal(acceptedNode.acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
  assert.equal(acceptedNode.acceptance.visualApproval, "NOT_GRANTED");
  assert.equal(acceptedNode.acceptance.productionAdmission, false);
  assert.equal(needsReview.acceptance, null);
  assert.deepEqual(acceptedNode.acceptance.artifacts.map((item) => item.kind).sort(), ["JSON_PLAN", "SVG"]);
  const diagramPlanArtifact = acceptedNode.acceptance.artifacts.find((item) => item.kind === "JSON_PLAN");
  const diagramPlan = JSON.parse(fs.readFileSync(path.join(artifactRoot, diagramPlanArtifact.path), "utf8"));
  assert.deepEqual(diagramPlan.sourceEvidenceIds, []);
  assert.equal(diagramPlan.proofBoundary.sourceEvidenceResolved, false);
  assert.equal(diagramPlan.proofBoundary.visualApproval, false);

  const existingDiagramPath = path.resolve(process.cwd(), "work/project-diagram-output-v1/result.json");
  const existingDiagramRun = JSON.parse(fs.readFileSync(existingDiagramPath, "utf8"));
  assert.equal(existingDiagramRun.contract, "A1ProjectDiagramMaterializationTest/v1");
  assert.equal(existingDiagramRun.status, "PASS");
  assert.equal(existingDiagramRun.fixtureCount, 6);
  assert.equal(existingDiagramRun.genreCount, 3);
  assert.equal(existingDiagramRun.productionAdmission, false);
  assert.equal(existingDiagramRun.fontSha256, font.sha256);
  const crossThemeInput = {projectId: "cross-theme-diagram-adapter-integration", workspaceSha256: "c".repeat(64),
    context: {articleTitle: "cross-theme diagram adapter", articleSha256: "d".repeat(64)},
    shots: existingDiagramRun.results.map((fixture) => {
      const source = fixture.sourceCopy;
      assert.equal(sha256(Buffer.from(source, "utf8")), fixture.sourceTextSha256, `source text SHA for ${fixture.id}`);
      assert.equal(fixture.sourceMode, "TRANSCRIPT_ONLY_EXPLANATORY", `source mode for ${fixture.id}`);
      const priorSvg = fs.readFileSync(path.resolve(process.cwd(), fixture.svg));
      assert.equal(sha256(priorSvg), fixture.svgSha256, `prior SVG SHA for ${fixture.id}`);
      return {id: fixture.id, source, exactCopy: fixture.diagramSpec.nodes.map((node) => node.label),
        modules: {material: false, typography: false, recording: false, diagram: true},
        moduleInputs: {diagram: {diagramSpec: fixture.diagramSpec, sourceEvidenceIds: [],
          fontBinding: {assetId: font.assetId, path: "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf", sha256: font.sha256}}}};
    })};
  let crossThemeWorkflow = compileNodeWorkflow(crossThemeInput, null, {moduleDefinitions: adapters.definitions});
  let crossThemeNow = 2000;
  let crossThemeSucceeded = 0;
  const crossThemeArtifactRoot = path.join(artifactRoot, "cross-theme");
  while (crossThemeWorkflow.nodes.some((node) => node.module === "diagram" && node.state === "queued")) {
    const claimBatch = claimNodeTasks(crossThemeWorkflow, {workerId: "cross-theme-diagram-worker", now: crossThemeNow});
    assert.ok(claimBatch.claims.length > 0 && claimBatch.claims.length <= 2);
    crossThemeWorkflow = claimBatch.workflow;
    for (const claim of claimBatch.claims) {
      const fixture = existingDiagramRun.results.find((item) => item.id === claim.shotId);
      const generated = await executeRegisteredNode(crossThemeWorkflow, claim,
        {registry: adapters.registry, artifactRoot: crossThemeArtifactRoot, now: crossThemeNow + 1});
      assert.equal(generated.state, "needs-review", `adapter output for ${fixture.id}`);
      assert.equal(generated.productionAdmission, false);
      assert.equal(generated.visualApproval, false);
      const svgSha = generated.artifactManifest.artifacts.find((item) => item.kind === "SVG")?.sha256;
      assert.equal(svgSha, fixture.svgSha256, `adapter SVG byte parity for ${fixture.id}`);
      crossThemeWorkflow = finishNodeTask(crossThemeWorkflow, claim, generated, crossThemeNow + 2);
      crossThemeWorkflow = await acceptNodeArtifacts(crossThemeWorkflow, claim.id,
        {artifactRoot: crossThemeArtifactRoot, reviewerId: "cross-theme-diagram-integration-test", now: crossThemeNow + 3});
      const accepted = crossThemeWorkflow.nodes.find((item) => item.id === claim.id);
      assert.equal(accepted.state, "succeeded");
      assert.equal(accepted.acceptance.visualApproval, "NOT_GRANTED");
      assert.equal(accepted.acceptance.productionAdmission, false);
      crossThemeSucceeded += 1;
      crossThemeNow += 10;
    }
  }
  assert.equal(crossThemeSucceeded, 6);
  assert.equal(crossThemeWorkflow.nodes.filter((node) => node.module === "diagram" && node.state === "succeeded").length, 6);

  const integrationReport = {contract: "A1NodeDiagramWorkflowIntegrationTest/v1", status: "PASS_REVIEW_ONLY_FIXTURE",
    adapterId: acceptedNode.module, adapterInputSha256: acceptedNode.inputSha256,
    artifactManifestSha256: acceptedNode.acceptance.manifestSha256,
    artifactKinds: acceptedNode.acceptance.artifacts.map((item) => item.kind).sort(),
    verificationScope: acceptedNode.acceptance.verificationScope, visualApproval: acceptedNode.acceptance.visualApproval,
    productionAdmission: acceptedNode.acceptance.productionAdmission,
    crossTheme: {contract: "A1NodeDiagramCrossThemeIntegration/v1", status: "PASS_REVIEW_ONLY", fixtureCount: crossThemeSucceeded,
      genreCount: new Set(existingDiagramRun.results.map((item) => item.genre)).size,
      sourceFixtureRunSha256: sha256(fs.readFileSync(existingDiagramPath)), exactSvgByteParityCount: crossThemeSucceeded,
      visualApproval: "NOT_GRANTED", productionAdmission: false},
    checks: ["optional-route-only-when-selected", "real-adapter-registered", "sha-bound-claim", "dispatcher-produced-file-backed-svg", "six-existing-three-genre-diagrams-through-same-dispatcher", "adapter-svg-byte-parity-with-existing-outputs", "artifact-acceptance-is-bytes-and-format-only", "visual-approval-remains-ungranted", "research-only-production-boundary"]};
  const resultPath = path.resolve(process.cwd(), "work/hupo-69-shot-reconstruction-v1/diagram-adapter-integration-result-v1.json");
  fs.writeFileSync(resultPath, `${JSON.stringify(integrationReport, null, 2)}\n`);
  integrationReport.resultSha256 = crypto.createHash("sha256").update(fs.readFileSync(resultPath)).digest("hex");
  console.log(JSON.stringify({...integrationReport, resultPath: path.relative(process.cwd(), resultPath)}, null, 2));
} finally {
  fs.rmSync(artifactRoot, {recursive: true, force: true});
}
