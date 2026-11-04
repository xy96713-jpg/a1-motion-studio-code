#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {runWholeFilmAiDirector} from "../apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts";
import {mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1} from "../apps/studio-next/src/lib/a1-node-director-workflow-mapper-v1.mjs";
import {compileNodeWorkflow, claimNodeTasks, finishNodeTask, nodeInputHash} from "../apps/studio-next/src/lib/a1-node-workflow-v1.mjs";
import {createNodeAdapterRegistry, executeRegisteredNode} from "../apps/studio-next/src/lib/a1-node-module-execution-v1.mjs";
import {acceptNodeArtifacts} from "../apps/studio-next/src/lib/a1-node-artifact-acceptance-v1.mjs";
import {diagramNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-diagram-adapter-v1.mjs";
import {A1_NODE_LAYER_COMPOSITION_V1, layerCompositeNodeAdapterV1} from "../apps/studio-next/src/lib/a1-node-composite-adapter-v1.mjs";
import {RETRO_PIXEL_FONT_MANIFEST} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRequire = createRequire(path.join(ROOT, "apps/studio-next/package.json"));
const sharp = appRequire("sharp");
const OUTPUT = path.join(ROOT, "work/director-plan-to-composite-dag-v1");
const WIDTH = 1280;
const HEIGHT = 720;
const MAX_PROJECT_CONCURRENCY = 2;
const fixtures = [
  {id: "dag-explainer-canopy-heat-v1", genre: "evidence-explainer", title: "城市树冠与地表温度", sourceText: "树冠遮蔽地面，蒸散带走热量，城市表面温度因此下降。", labels: ["树冠", "蒸散", "温度因此下降"], kind: "causal"},
  {id: "dag-explainer-river-data-v1", genre: "evidence-explainer", title: "降雨与河口水位", sourceText: "上游降雨增加后，支流流量先上升，河口水位随后变化。", labels: ["降雨增加", "支流流量", "河口水位"], kind: "sequence"},
  {id: "dag-tutorial-import-crop-v1", genre: "product-tutorial", title: "素材整理步骤", sourceText: "先导入素材，再裁剪画面，最后预览导出结果。", labels: ["导入素材", "裁剪画面", "预览导出"], kind: "sequence"},
  {id: "dag-tutorial-review-export-v1", genre: "product-tutorial", title: "检查与导出", sourceText: "检查文字边界，调整安全区，最后确认导出文件。", labels: ["文字边界", "调整安全区", "导出文件"], kind: "sequence"},
  {id: "dag-opinion-tool-judgment-v1", genre: "personal-opinion", title: "工具与判断", sourceText: "工具能减少重复劳动，但判断依据仍由人来承担。", labels: ["重复劳动", "判断依据", "人来承担"], kind: "comparison"},
  {id: "dag-opinion-author-choice-v1", genre: "personal-opinion", title: "自动化与作者选择", sourceText: "自动化可以加快流程，作者保留取舍，作品方向才清晰。", labels: ["加快流程", "作者保留取舍", "作品方向"], kind: "causal"},
];

function makeShotOutput(fixture) {
  const nodes = fixture.labels.map((label, index) => ({id: `n${index + 1}`, label}));
  return {
    contract: "A1WholeFilmShotPlanOutput/v1",
    shots: [{
      firstCueId: 1,
      lastCueId: 1,
      chapterId: "C01",
      editMode: "full-package",
      narrativeJob: "把原句中的关系组织成可编辑图解。",
      viewerTakeaway: fixture.sourceText,
      viewerQuestion: "这句话表达的关系是否清楚？",
      semanticActor: {identity: `${fixture.labels[0]}及其语义关联对象`, action: "按原句关系连接三个节点", beforeState: "信息尚未形成图示", afterState: "关系被图解呈现", target: fixture.labels[2]},
      mediumDecisionReason: "原句包含三个有序概念，确定性图解能保留词语并表达关系。",
      presenterDirection: null,
      overlayBrief: null,
      presenterPackage: {intensity: "not-applicable", keyPhrases: [], spatialAnchor: "not-applicable", faceSafeZone: "not-applicable", occlusionRule: "不涉及人物画面。"},
      screenActions: [],
      packageBrief: "保留原句文字，用三节点图解表达语义关系。",
      transitionOut: "停留后交给下一段。",
      requiredMaterialIds: [`diagram-${fixture.id}`],
      materialRequirements: [{
        id: `diagram-${fixture.id}`,
        duty: "deterministic-diagram",
        evidenceIds: [],
        exactCopy: null,
        diagramSpec: {
          contract: "A1DeterministicDiagramSpec/v1",
          kind: fixture.kind,
          nodes,
          edges: [
            {from: "n1", to: "n2", relation: fixture.kind === "comparison" ? "compares" : fixture.kind === "causal" ? "causes" : "before-after"},
            {from: "n2", to: "n3", relation: fixture.kind === "comparison" ? "compares" : fixture.kind === "causal" ? "causes" : "before-after"},
          ],
        },
      }],
      visualJob: "让口播原句里的三个概念及其关系可以被看见。",
      primaryActor: "原句中的三个关系节点",
      materialRoute: "approved-asset-pack",
      topology: "editorial-evidence-field",
      typographyRole: "source-bound-diagram-labels",
      keyPhrases: [],
      layoutConstraints: ["只使用源文案中的节点标签", "保持三节点关系清晰"],
      motionPhrase: "关系由左向右建立，最终完整停住供阅读。",
      handoffActor: fixture.labels[2],
      structureDirections: ["三个节点按语义顺序展开", "关系线只连接已有节点"],
    }],
  };
}

function makeStrategy() {
  return {
    contract: "A1WholeFilmStrategyOutput/v1",
    visualThesis: "用源文案决定包装形式，关系图示保持可编辑。",
    presenterRole: "人物承担立场和个人表达。",
    screenRole: "真实界面承担可验证操作。",
    packageRole: "图解承担抽象关系解释。",
    typeOnlyRule: "独立判断或停顿可使用纯字体。",
    rhythmArc: ["建立语境", "展示关系", "收束结论"],
    chapters: [{chapterId: "C01", title: "关系说明", firstCueId: 1, lastCueId: 1, narrativeArc: "从原句到可读关系图"}],
    globalRules: ["准确保留源文案", "不把图解写成证据结论", "人物和真实屏幕不做替代", "所有候选保持 review-only"],
  };
}

function makeDirectorInput(fixture) {
  const articleAnalysis = {
    contract: "A1ArticleUnderstanding/v1",
    source: {cueCount: 1},
    directorUnderstanding: "单句合成输入仅用于验证导演计划到执行图的接口，不代表事实研究。",
    coreClaim: fixture.sourceText,
    argumentMovement: ["输入原句", "组织关系", "查看图解"],
    antiMisreadings: ["不得把合成输入视为已核实证据"],
  };
  return {
    projectId: `synthetic-${fixture.id}`,
    title: fixture.title,
    articleText: fixture.sourceText,
    cues: [{cueId: 1, sourceStartMs: 0, sourceEndMs: 4000, sourceText: fixture.sourceText}],
    timeline: {authority: "provided-time-cues"},
    articleAnalysis: {analysis: articleAnalysis, provenance: {path: `/synthetic/${fixture.id}/analysis.json`, sha256: sha256(JSON.stringify(articleAnalysis))}},
    strategyCandidate: {strategy: makeStrategy(), provenance: {taskId: `synthetic-strategy-${fixture.id}`, outputHash: sha256(fixture.id)}},
    shotSkeletonCandidate: {shots: [{firstCueId: 1, lastCueId: 1, chapterId: "C01", editMode: "full-package"}], provenance: {path: `/synthetic/${fixture.id}/skeleton.json`, sha256: sha256(`skeleton:${fixture.id}`)}},
    mediaInventory: {boundMaterialIds: []},
  };
}

async function runDirector(fixture) {
  let now = 10_000;
  const result = await runWholeFilmAiDirector(makeDirectorInput(fixture), {
    capabilityRunner: async () => ({available: true, version: "synthetic-fixture-runtime"}),
    structuredPassRunner: async (request) => ({output: makeShotOutput(fixture), model: "deterministic-fixture", taskId: request.taskId, durationMs: 1, codexVersion: "fixture"}),
    now: () => ++now,
    randomId: () => `synthetic-${fixture.id}`,
  });
  assert.equal(result.status, "completed", `director failed for ${fixture.id}: ${result.reason || "unknown"}`);
  assert.equal(result.plan.contract, "A1WholeFilmAiDirectorPlan/v1");
  assert.equal(result.plan.reviewOnly, true);
  assert.equal(result.plan.gates.acceptedShotIrCompilationAllowed, false);
  assert.equal(result.plan.shots.length, 1);
  assert.equal(result.plan.shots[0].sourceText, fixture.sourceText);
  assert.deepEqual(result.plan.shots[0].materialRequirements[0].evidenceIds, []);
  return result.plan;
}

async function withPool(items, size, handler) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await handler(items[index], index);
    }
  }
  await Promise.all(Array.from({length: Math.min(size, items.length)}, () => worker()));
  return results;
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filename);
  return sha256(bytes);
}

async function readImagePixels(filename) {
  const {data, info} = await sharp(filename).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let nonzeroAlpha = 0, minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const alpha = data[(y * info.width + x) * info.channels + 3];
    if (alpha) {
      nonzeroAlpha += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return {width: info.width, height: info.height, channels: info.channels, nonzeroAlphaPixels: nonzeroAlpha,
    alphaBounds: maxX >= 0 ? {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1} : null};
}

const font = RETRO_PIXEL_FONT_MANIFEST.find((item) => item.assetId === "type-pixel-correction");
assert.ok(font?.sha256, "approved deterministic diagram font must be present");
fs.mkdirSync(path.join(OUTPUT, "plans"), {recursive: true});
const injectedRegistry = createNodeAdapterRegistry({"layer-compositor": {...layerCompositeNodeAdapterV1, optional: true}});
assert.equal(injectedRegistry.registry.diagram.execute, diagramNodeAdapterV1.execute);
assert.equal(injectedRegistry.registry["layer-compositor"].execute, layerCompositeNodeAdapterV1.execute);
assert.equal(injectedRegistry.registry["layer-compositor"].optional, true);
const state = {activeProjects: 0, maxConcurrentProjects: 0, activeExecutions: 0, maxConcurrentExecutions: 0};

const fixtureResults = await withPool(fixtures, MAX_PROJECT_CONCURRENCY, async (fixture) => {
  state.activeProjects += 1;
  state.maxConcurrentProjects = Math.max(state.maxConcurrentProjects, state.activeProjects);
  try {
    const directorPlan = await runDirector(fixture);
    const directorPlanReplay = await runDirector(fixture);
    const directorPlanSha256 = nodeInputHash(directorPlan);
    assert.equal(nodeInputHash(directorPlanReplay), directorPlanSha256, `injected director plan must be deterministic for ${fixture.id}`);
    writeJson(path.join(OUTPUT, "plans", `${fixture.id}.json`), directorPlan);

    const mapped = mapA1WholeFilmDirectorPlanToNodeWorkflowInputV1(directorPlan, {
      workspaceSha256: directorPlan.source.timelineSha256,
      fontBinding: {assetId: font.assetId, path: "apps/studio-next/public/a1-editorial-fonts/fusion-pixel.ttf", sha256: font.sha256},
      canvas: {width: WIDTH, height: HEIGHT},
      moduleDefinitions: injectedRegistry.definitions,
    });
    assert.equal(mapped.audit.sourceEvidenceResolved, false);
    assert.equal(mapped.audit.shots[0].sourceCopySha256, sha256(Buffer.from(fixture.sourceText, "utf8")));
    for (const label of fixture.labels) {
      assert.ok(mapped.audit.shots[0].copyBindings.some((binding) => binding.exactCopy === label && binding.sourceSubstringVerified === true));
    }
    const stageOne = compileNodeWorkflow(mapped.workflowInput, null, {moduleDefinitions: mapped.moduleDefinitions});
    assert.equal(stageOne.scope, "REVIEW_ONLY");
    assert.equal(stageOne.productionAdmission, false);
    const diagramNode = stageOne.nodes.find((node) => node.module === "diagram" && node.input.need === true);
    assert.ok(diagramNode, `diagram requirement must create one task for ${fixture.id}`);
    assert.equal(diagramNode.input.shot.source, fixture.sourceText);
    assert.deepEqual(diagramNode.input.parameters.sourceEvidenceIds, []);
    assert.equal(diagramNode.input.parameters.diagramSpec.nodes.every((node) => fixture.sourceText.includes(node.label)), true);
    const stageOneReplay = compileNodeWorkflow(mapped.workflowInput, null, {moduleDefinitions: mapped.moduleDefinitions});
    assert.equal(stageOne.planSha256, stageOneReplay.planSha256, `stage-one DAG fingerprint must be deterministic for ${fixture.id}`);

    const artifactRoot = path.join(OUTPUT, "artifacts", fixture.id);
    const firstClaim = claimNodeTasks(stageOne, {workerId: `worker-${fixture.id}`, now: 1000});
    assert.equal(firstClaim.claims.length, 1);
    assert.equal(firstClaim.claims[0].id, diagramNode.id);
    state.activeExecutions += 1;
    state.maxConcurrentExecutions = Math.max(state.maxConcurrentExecutions, state.activeExecutions);
    let diagramResult;
    try {
      diagramResult = await executeRegisteredNode(firstClaim.workflow, firstClaim.claims[0], {
        registry: injectedRegistry.registry, artifactRoot, now: 1001,
      });
    } finally { state.activeExecutions -= 1; }
    assert.equal(diagramResult.state, "needs-review");
    let reviewedDiagram = finishNodeTask(firstClaim.workflow, firstClaim.claims[0], diagramResult, 1002);
    reviewedDiagram = await acceptNodeArtifacts(reviewedDiagram, diagramNode.id, {artifactRoot, reviewerId: "synthetic-technical-acceptance", now: 1003});
    const acceptedDiagram = reviewedDiagram.nodes.find((node) => node.id === diagramNode.id);
    assert.equal(acceptedDiagram.state, "succeeded");
    assert.equal(acceptedDiagram.acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
    assert.equal(acceptedDiagram.acceptance.visualApproval, "NOT_GRANTED");
    assert.equal(acceptedDiagram.acceptance.productionAdmission, false);
    const svgReceipt = acceptedDiagram.acceptance.artifacts.find((artifact) => artifact.kind === "SVG");
    const diagramPlanReceipt = acceptedDiagram.acceptance.artifacts.find((artifact) => artifact.kind === "JSON_PLAN");
    const diagramPlanJson = JSON.parse(fs.readFileSync(path.join(acceptedDiagram.acceptance.artifactRoot, diagramPlanReceipt.path), "utf8"));
    assert.equal(diagramPlanJson.proofBoundary.sourceCopyBound, true);
    assert.equal(diagramPlanJson.proofBoundary.sourceEvidenceResolved, false);
    assert.equal(diagramPlanJson.proofBoundary.visualApproval, false);
    for (const label of fixture.labels) assert.ok(diagramPlanJson.svg.visibleLabels.includes(label), `diagram receipt must preserve source label ${label}`);
    assert.equal(diagramPlanJson.sourceTextSha256, sha256(Buffer.from(fixture.sourceText, "utf8")));

    const compNodeId = diagramNode.id;
    const compInput = {
      projectId: directorPlan.projectId,
      workspaceSha256: directorPlan.source.timelineSha256,
      context: {articleTitle: directorPlan.source.title, articleSha256: directorPlan.source.articleSha256},
      shots: [{
        id: directorPlan.shots[0].shotId,
        source: directorPlan.shots[0].sourceText,
        modules: {material: false, typography: false, recording: false, "layer-compositor": true},
        moduleInputs: {"layer-compositor": {composition: {
          contract: A1_NODE_LAYER_COMPOSITION_V1,
          width: WIDTH,
          height: HEIGHT,
          layers: [{
            id: "accepted-diagram",
            dependencyNodeId: compNodeId,
            dependencyManifestSha256: acceptedDiagram.acceptance.manifestSha256,
            artifactPath: svgReceipt.path,
            artifactKind: "SVG",
            artifactSha256: svgReceipt.sha256,
            artifactBytes: svgReceipt.bytes,
            geometry: {x: 0.08, y: 0.12, width: 0.84, height: 0.76},
            z: 1,
            opacity: 1,
            fit: "contain",
          }],
        }}},
        moduleDependencyBindings: {"layer-compositor": [{nodeId: compNodeId, artifactKinds: ["SVG"]}]},
      }],
    };
    const stageTwo = compileNodeWorkflow(compInput, reviewedDiagram, {moduleDefinitions: injectedRegistry.definitions});
    const compositeNode = stageTwo.nodes.find((node) => node.module === "layer-compositor");
    assert.ok(compositeNode);
    assert.deepEqual(compositeNode.dependencies, [compNodeId]);
    assert.equal(compositeNode.inputSha256, nodeInputHash({input: compositeNode.input, dependencies: {
      inputs: [],
      artifactKinds: {},
      externalBindings: [{nodeId: compNodeId, inputSha256: diagramNode.inputSha256,
        acceptedManifestSha256: acceptedDiagram.acceptance.manifestSha256, artifactKinds: ["SVG"]}],
    }}), "composition fingerprint must bind the accepted diagram receipt SHA");
    const secondClaim = claimNodeTasks(stageTwo, {workerId: `compositor-${fixture.id}`, now: 2000});
    assert.equal(secondClaim.claims.length, 1);
    state.activeExecutions += 1;
    state.maxConcurrentExecutions = Math.max(state.maxConcurrentExecutions, state.activeExecutions);
    let compositeResult;
    try {
      compositeResult = await executeRegisteredNode(secondClaim.workflow, secondClaim.claims[0], {
        registry: injectedRegistry.registry, artifactRoot, now: 2001,
      });
    } finally { state.activeExecutions -= 1; }
    assert.equal(compositeResult.state, "needs-review", JSON.stringify(compositeResult));
    let reviewedComposite = finishNodeTask(secondClaim.workflow, secondClaim.claims[0], compositeResult, 2002);
    reviewedComposite = await acceptNodeArtifacts(reviewedComposite, compositeNode.id, {artifactRoot, reviewerId: "synthetic-technical-acceptance", now: 2003});
    const acceptedComposite = reviewedComposite.nodes.find((node) => node.id === compositeNode.id);
    assert.equal(acceptedComposite.state, "succeeded");
    assert.equal(acceptedComposite.acceptance.verificationScope, "BYTES_AND_FORMAT_ONLY");
    assert.equal(acceptedComposite.acceptance.visualApproval, "NOT_GRANTED");
    assert.equal(acceptedComposite.acceptance.productionAdmission, false);
    const previewReceipt = acceptedComposite.acceptance.artifacts.find((artifact) => artifact.role === "transparent-layer-preview");
    const previewPath = path.join(acceptedComposite.acceptance.artifactRoot, previewReceipt.path);
    const pixels = await readImagePixels(previewPath);
    assert.equal(pixels.width, WIDTH);
    assert.equal(pixels.height, HEIGHT);
    assert.ok(pixels.nonzeroAlphaPixels > 0, `transparent preview must contain decoded visible pixels for ${fixture.id}`);
    assert.ok(pixels.alphaBounds.x >= 0 && pixels.alphaBounds.y >= 0);
    assert.ok(pixels.alphaBounds.x + pixels.alphaBounds.width <= WIDTH);
    assert.ok(pixels.alphaBounds.y + pixels.alphaBounds.height <= HEIGHT);
    const compositePlanReceipt = acceptedComposite.acceptance.artifacts.find((artifact) => artifact.kind === "JSON_PLAN");
    const compositePlan = JSON.parse(fs.readFileSync(path.join(acceptedComposite.acceptance.artifactRoot, compositePlanReceipt.path), "utf8"));
    assert.equal(compositePlan.proofBoundary.sourceArtifactBytesVerified, true);
    assert.equal(compositePlan.proofBoundary.geometryBound, true);
    assert.equal(compositePlan.proofBoundary.visualApproval, "NOT_GRANTED");
    assert.equal(compositePlan.contract, "A1NodeCompositePlan/v1");
    assert.equal(compositePlan.composition.layers[0].artifact.sha256, svgReceipt.sha256);
    assert.equal(compositePlan.composition.layers[0].dependencyManifestSha256, acceptedDiagram.acceptance.manifestSha256);

    return {
      id: fixture.id,
      genre: fixture.genre,
      status: "PASS",
      directorPlanSha256,
      stageOnePlanSha256: stageOne.planSha256,
      diagramNodeId: diagramNode.id,
      diagramInputSha256: diagramNode.inputSha256,
      diagramManifestSha256: acceptedDiagram.acceptance.manifestSha256,
      diagramSvgSha256: svgReceipt.sha256,
      diagramSourceCopyBound: diagramPlanJson.proofBoundary.sourceCopyBound,
      sourceEvidenceIds: diagramPlanJson.sourceEvidenceIds,
      sourceEvidenceResolved: diagramPlanJson.proofBoundary.sourceEvidenceResolved,
      stageTwoPlanSha256: stageTwo.planSha256,
      compositeNodeId: compositeNode.id,
      compositeInputSha256: compositeNode.inputSha256,
      compositeManifestSha256: acceptedComposite.acceptance.manifestSha256,
      compositePngSha256: previewReceipt.sha256,
      previewArtifactPath: previewReceipt.path,
      compositePlanSha256: compositePlanReceipt.sha256,
      pixels,
      technicalAcceptance: "BYTES_AND_FORMAT_ONLY",
      visualApproval: "NOT_GRANTED",
      productionAdmission: false,
    };
  } finally {
    state.activeProjects -= 1;
  }
});

assert.equal(fixtureResults.length, fixtures.length);
assert.ok(fixtureResults.every((fixture) => fixture.status === "PASS"));
assert.equal(new Set(fixtureResults.map((fixture) => fixture.compositePngSha256)).size, fixtures.length,
  "different director outputs should create different accepted pixel artifacts");
assert.ok(state.maxConcurrentProjects <= MAX_PROJECT_CONCURRENCY);
assert.ok(state.maxConcurrentProjects >= 2, "the isolated harness should exercise two concurrent project tasks");
assert.ok(state.maxConcurrentExecutions <= 2);

const tiles = [];
for (const result of fixtureResults) {
  const preview = path.join(OUTPUT, "artifacts", result.id, result.previewArtifactPath);
  const reviewBackground = {r: 27, g: 29, b: 35};
  const tileBytes = await sharp(preview).resize(640, 360, {fit: "contain", background: {...reviewBackground, alpha: 1}})
    .flatten({background: reviewBackground}).png().toBuffer();
  const titleSvg = Buffer.from(`<svg width="640" height="40"><rect width="100%" height="100%" fill="#101216"/><text x="14" y="27" fill="#ffffff" font-family="sans-serif" font-size="16">${escapeXml(result.genre)} · ${escapeXml(result.id)}</text></svg>`);
  const tile = await sharp({create: {width: 640, height: 400, channels: 4, background: {...reviewBackground, alpha: 1}}})
    .composite([{input: titleSvg, left: 0, top: 0}, {input: tileBytes, left: 0, top: 40}]).png().toBuffer();
  tiles.push(tile);
}
const contactSheetPath = path.join(OUTPUT, "composite-contact-sheet.png");
await sharp({create: {width: 1920, height: 800, channels: 4, background: {r: 12, g: 14, b: 18, alpha: 1}}})
  .composite(tiles.map((input, index) => ({input, left: (index % 3) * 640, top: Math.floor(index / 3) * 400})))
  .png({compressionLevel: 9, adaptiveFiltering: false}).toFile(contactSheetPath);

function escapeXml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;"}[character]));
}

const contactSheetSha256 = sha256(fs.readFileSync(contactSheetPath));
const result = {
  contract: "A1DirectorPlanCompositeDagIntegration/v1",
  status: "PASS",
  scope: "SYNTHETIC_REVIEW_ONLY",
  fixtureCount: fixtureResults.length,
  genreCount: new Set(fixtureResults.map((fixture) => fixture.genre)).size,
  concurrency: {maxProjectTasks: state.maxConcurrentProjects, maxNodeExecutions: state.maxConcurrentExecutions, limit: MAX_PROJECT_CONCURRENCY},
  reusableModules: ["runWholeFilmAiDirector", "compileNodeWorkflow", "diagramNodeAdapterV1", "acceptNodeArtifacts", "layerCompositeNodeAdapterV1"],
  executionRegistry: {
    compositorInjectedForHarness: true,
    diagramModule: "EXISTING_OPTIONAL_PLAN_SELECTED",
    defaultRegistryChanged: false,
  },
  fixtures: fixtureResults,
  proofBoundary: {
    sourceEvidenceResolved: false,
    technicalAcceptance: "BYTES_AND_FORMAT_ONLY",
    visualApproval: "NOT_GRANTED",
    productionAdmission: false,
    productionAuthorityChanged: false,
  },
  visibleArtifact: {path: "work/director-plan-to-composite-dag-v1/composite-contact-sheet.png", sha256: contactSheetSha256, width: 1920, height: 800},
};
const resultSha256 = writeJson(path.join(OUTPUT, "result.json"), result);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtureCount, genreCount: result.genreCount,
  maxConcurrentProjectTasks: result.concurrency.maxProjectTasks, maxConcurrentNodeExecutions: result.concurrency.maxNodeExecutions,
  contactSheetSha256, resultSha256, output: path.relative(ROOT, path.join(OUTPUT, "result.json"))}, null, 2));
