import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { discoverAutomaticAssetCandidates } from "../apps/studio-next/src/lib/a1-automatic-asset-candidates.js";
import { deriveMaterialCarrierRequirement, hasVerifiedMaterialEffectAnchor } from "../apps/studio-next/src/lib/a1-material-carrier-requirement-v1.mjs";

const state = {
  contract: "A1NextLegacyBridgeState/v1",
  source: "fallback",
  legacyOrigin: "http://localhost:4288",
  projectId: "compiled-fixture",
  projectTitle: "自动素材候选测试",
  sourceUrl: "https://example.test/article",
  projectCount: 1,
  assetCount: 0,
  generatedAt: new Date(0).toISOString(),
  shots: [
    { id: "01", screenTitle: "开场", source: "文章开场", template: "rve-title-split" },
    { id: "02", screenTitle: "真实地点", source: "这一句需要一张真实地点图片", template: "rve-image-zoom-reveal" },
    { id: "03", screenTitle: "前后变化", source: "这一句需要三张不同来源图片", template: "rve-image-carousel" },
    { id: "04", screenTitle: "数据", source: "文章给出 41.4 亿公顷", template: "rve-stat-counter" },
  ],
  assets: [],
  templateOptions: [],
  renderBridge: { contract: "A1NextRenderPropsBridge/v1", ok: true },
};

const slotPlans = [
  { contract: "A1AssetSlotPlan/v1", shotId: "01", slotKind: "text", status: "not-needed", requiredCount: 0, query: "开场", subSlots: [] },
  { contract: "A1AssetSlotPlan/v1", shotId: "02", slotKind: "single-image", status: "blocked", requiredCount: 1, query: "真实地点", subSlots: [{ query: "真实地点 主图" }] },
  {
    contract: "A1AssetSlotPlan/v1",
    shotId: "03",
    slotKind: "multi-image",
    status: "blocked",
    requiredCount: 3,
    query: "前后变化",
    subSlots: [{ query: "前后变化 过去" }, { query: "前后变化 现在" }, { query: "前后变化 参照" }],
  },
  { contract: "A1AssetSlotPlan/v1", shotId: "04", slotKind: "data", status: "blocked", requiredCount: 1, query: "41.4 亿公顷", subSlots: [] },
];

function jsonResponse(candidates) {
  return new Response(JSON.stringify({ candidates }), { status: 200, headers: { "content-type": "application/json" } });
}

const requestBodies = [];
const fakeFetch = async (_url, init) => {
  const body = JSON.parse(String(init.body || "{}"));
  requestBodies.push(body);
  if (body.shotId === "02") {
    return jsonResponse([
      {
        id: "candidate:place",
        canonicalName: "地点",
        cachedImageUrl: "/cache/place.jpg",
        sourceUrl: "https://source.test/place",
        sourceQualityTier: "source-page",
        selectedCropMode: "focal-cover",
        imageFocalPlan: {
          contract: "A1ImageFocalPlan/v1",
          objectPosition: { x: 42, y: 57 },
          zoom: 116,
          sourceDimensions: { width: 1600, height: 900 },
        },
      },
      { id: "candidate:place-duplicate", cachedImageUrl: "/cache/place.jpg", sourceUrl: "https://source.test/place-copy" },
      { id: "candidate:no-source", cachedImageUrl: "/cache/no-source.jpg" },
    ]);
  }
  if (body.shotId === "04") {
    return jsonResponse([{
      id: "candidate:data",
      label: "data",
      imageUrl: "https://images.test/data.jpg",
      sourcePageUrl: "https://source.test/data",
      sourceQualityTier: "official",
      structuredDataEvidence: {
        contract: "A1StructuredDataEvidence/v1",
        metricCount: 1,
        metrics: [{ label: "面积", value: 41.4, unit: "亿公顷" }],
      },
    }]);
  }
  const suffix = body.query.includes("过去") ? "before" : body.query.includes("现在") ? "after" : "context";
  return jsonResponse([{ id: `candidate:${suffix}`, label: suffix, imageUrl: `https://images.test/${suffix}.jpg`, sourcePageUrl: `https://source.test/${suffix}`, sourceQualityTier: "open-knowledge" }]);
};

const completed = await discoverAutomaticAssetCandidates(state, { slotPlans, fetchImpl: fakeFetch, legacyOrigin: "http://legacy.test", concurrency: 2 });
assert.deepEqual(completed.report.requestedShotIds, ["02", "03", "04"]);
assert.equal(completed.report.contract, "A1AutomaticAssetCandidateDiscovery/v1");
assert.equal(completed.report.status, "completed");
assert.equal(completed.report.candidateCount, 5);
assert.deepEqual(completed.report.unresolvedShotIds, []);
assert.equal(completed.report.shots.every((shot) => shot.errors.length === 0), true);
assert.equal(requestBodies.every((body) => body.sourceUrl === state.sourceUrl), true);
assert.equal(requestBodies.some((body) => body.shotId === "01"), false);
assert.equal(completed.state.assets.every((asset) => asset.adopted === false && asset.canAdopt === false), true);
assert.equal(completed.state.assets.every((asset) => asset.imageUrl && asset.sourceUrl), true);
assert.equal(new Set(completed.state.assets.map((asset) => `${asset.parentId}:${asset.imageUrl}`)).size, 5);
const focalCandidate = completed.state.assets.find((asset) => asset.id === "candidate:place");
assert.equal(focalCandidate.selectedCropMode, "focal-cover");
assert.equal(focalCandidate.imageFocalPlan.objectPosition.x, 42);
assert.equal(focalCandidate.adopted, false);

const sourcePageFirstState = {
  ...state,
  shots: [{ id: "03", screenTitle: "辅助功能示例", source: "文章需要三张不同的官方示例图", template: "rve-image-carousel" }],
  assets: [],
};
const sourcePageFirstPlan = [{
  contract: "A1AssetSlotPlan/v1",
  shotId: "03",
  slotKind: "multi-image",
  status: "blocked",
  requiredCount: 3,
  query: "Apple accessibility examples",
  subSlots: [{ query: "Apple accessibility examples primary" }, { query: "Apple accessibility examples alternative" }],
}];
const sourcePageFirstRequests = [];
const sourcePageFirst = await discoverAutomaticAssetCandidates(sourcePageFirstState, {
  slotPlans: sourcePageFirstPlan,
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init.body || "{}"));
    sourcePageFirstRequests.push(body.query);
    return jsonResponse([
      { id: "candidate:apple-hero", imageUrl: "https://images.test/apple-hero.jpg", sourceUrl: state.sourceUrl },
      { id: "candidate:apple-label", imageUrl: "https://images.test/apple-label.jpg", sourceUrl: state.sourceUrl },
      { id: "candidate:apple-magnifier", imageUrl: "https://images.test/apple-magnifier.jpg", sourceUrl: state.sourceUrl },
    ]);
  },
});
assert.equal(sourcePageFirst.report.status, "completed");
assert.deepEqual(sourcePageFirstRequests, ["Apple accessibility examples"], "a source page that already supplies enough distinct media must not trigger redundant sub-slot crawls");
assert.equal(sourcePageFirst.state.assets.length, 3);

const repeatedSourceState = {
  ...state,
  shots: [
    { id: "01", screenTitle: "辅助功能营养标签", source: "营养标签说明应用支持能力", template: "rve-image-zoom-reveal" },
    { id: "02", screenTitle: "放大器阅读模式", source: "放大器帮助低视力用户阅读", template: "rve-polaroid-frame" },
  ],
  assets: [],
};
const repeatedSourcePlans = repeatedSourceState.shots.map((shot) => ({
  contract: "A1AssetSlotPlan/v1",
  shotId: shot.id,
  slotKind: "single-image",
  status: "blocked",
  requiredCount: 1,
  query: shot.screenTitle,
  subSlots: [],
}));
const repeatedSource = await discoverAutomaticAssetCandidates(repeatedSourceState, {
  slotPlans: repeatedSourcePlans,
  concurrency: 2,
  fetchImpl: async () => jsonResponse([
    { id: "candidate:hero", cachedImageUrl: "/cache/hero.jpg", originalRemoteUrl: "https://images.test/hero.jpg", sourceUrl: state.sourceUrl, evidenceFields: { imageUrl: "https://images.test/hero.jpg" } },
    { id: "candidate:detail", cachedImageUrl: "/cache/detail.jpg", originalRemoteUrl: "https://images.test/detail.jpg", sourceUrl: state.sourceUrl, evidenceFields: { imageUrl: "https://images.test/detail.jpg" } },
  ]),
});
assert.equal(repeatedSource.report.status, "completed");
assert.equal(repeatedSource.state.assets.length, 2);
assert.equal(new Set(repeatedSource.state.assets.map((asset) => asset.evidenceFields?.imageUrl)).size, 2, "shots from one source page must receive distinct source visuals when alternatives exist");

let retryCalls = 0;
const retryState = { ...state, shots: [state.shots[1]], assets: [] };
const retryResult = await discoverAutomaticAssetCandidates(retryState, {
  slotPlans: [slotPlans[1]],
  fetchImpl: async () => {
    retryCalls += 1;
    if (retryCalls === 1) throw new Error("transient source-page timeout");
    return jsonResponse([{ id: "candidate:retry", cachedImageUrl: "/cache/retry.jpg", sourceUrl: state.sourceUrl }]);
  },
});
assert.equal(retryCalls, 2);
assert.equal(retryResult.report.status, "completed");
assert.equal(retryResult.report.shots[0].errors.length, 0);

let coldSourceActiveRequests = 0;
let coldSourceWarmed = false;
const coldSourceState = {
  ...state,
  shots: [state.shots[1], { ...state.shots[1], id: "03", screenTitle: "第二个来源镜头" }],
  assets: [],
};
const coldSourcePlans = [
  slotPlans[1],
  { ...slotPlans[1], shotId: "03", query: "第二个来源镜头" },
];
const coldSourceResult = await discoverAutomaticAssetCandidates(coldSourceState, {
  slotPlans: coldSourcePlans,
  concurrency: 2,
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init.body || "{}"));
    coldSourceActiveRequests += 1;
    if (!coldSourceWarmed && coldSourceActiveRequests > 1) {
      coldSourceActiveRequests -= 1;
      throw new Error("The operation was aborted due to timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    coldSourceWarmed = true;
    coldSourceActiveRequests -= 1;
    return jsonResponse([{
      id: `candidate:cold-source:${body.shotId}`,
      cachedImageUrl: `/cache/cold-source-${body.shotId}.jpg`,
      sourceUrl: state.sourceUrl,
    }]);
  },
});
assert.equal(coldSourceResult.report.status, "completed", "one source page must be warmed before parallel shot searches compete for the cold crawl");
assert.deepEqual(coldSourceResult.report.unresolvedShotIds, []);

const partial = await discoverAutomaticAssetCandidates(state, {
  slotPlans,
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init.body || "{}"));
    if (body.shotId === "03") throw new Error("fixture multi-image unavailable");
    return jsonResponse([{ id: "candidate:partial", imageUrl: "https://images.test/partial.jpg", sourceUrl: "https://source.test/partial" }]);
  },
});
assert.equal(partial.report.status, "partial");
assert.equal(partial.report.candidateCount, 1);
assert.deepEqual(partial.report.unresolvedShotIds, ["03", "04"]);

const unavailable = await discoverAutomaticAssetCandidates(state, {
  slotPlans,
  fetchImpl: async () => { throw new Error("fixture legacy unavailable"); },
});
assert.equal(unavailable.report.status, "unavailable");
assert.equal(unavailable.report.candidateCount, 0);
assert.deepEqual(unavailable.report.unresolvedShotIds, ["02", "03", "04"]);
assert.deepEqual(unavailable.state.assets, state.assets);

let sourceBoundSearchCalls = 0;
const sourceBoundState = {
  ...state,
  sourceUrl: "",
  shots: [
    { id: "01", screenTitle: "城市热力图显示 300 个新增门店", source: "城市热力图显示 300 个新增门店集中在轨道交通周边", template: "rve-image-zoom-reveal" },
  ],
  assets: [],
};
const sourceBoundSlots = [
  { contract: "A1AssetSlotPlan/v1", shotId: "01", slotKind: "single-image", status: "blocked", requiredCount: 1, query: "城市热力图显示 300 个新增门店", subSlots: [] },
];
const sourceRequired = await discoverAutomaticAssetCandidates(sourceBoundState, {
  slotPlans: sourceBoundSlots,
  fetchImpl: async () => {
    sourceBoundSearchCalls += 1;
    return jsonResponse([{
      id: "candidate:auto-map-source",
      imageUrl: "https://images.test/city-heatmap.jpg",
      sourceUrl: "https://source.test/city-heatmap",
    }]);
  },
});
assert.equal(sourceBoundSearchCalls, 1, "unsourced map claims must initiate review-only source discovery");
assert.equal(sourceRequired.report.status, "completed");
assert.deepEqual(sourceRequired.report.searchedShotIds, ["01"]);
assert.deepEqual(sourceRequired.report.sourceAnchorRequiredShotIds, []);
assert.deepEqual(sourceRequired.report.unresolvedShotIds, []);
assert.equal(sourceRequired.report.shots[0].reason, "candidate-found");
assert.equal(sourceRequired.state.assets[0].adopted, false, "automatic source research must not adopt a candidate");

const sourcedDataState = {
  ...state,
  sourceUrl: "https://example.test/source-data",
  shots: [{ id: "01", screenTitle: "来源页数据", source: "官方报告显示 3.6 billion people", template: "rve-stat-counter" }],
  assets: [],
};
const sourcedDataPlan = [{
  contract: "A1AssetSlotPlan/v1",
  shotId: "01",
  slotKind: "data",
  status: "ready",
  requiredCount: 1,
  query: "official source data 3.6 billion",
  subSlots: [],
}];
const sourcedData = await discoverAutomaticAssetCandidates(sourcedDataState, {
  slotPlans: sourcedDataPlan,
  fetchImpl: async () => jsonResponse([{
    id: "candidate:source-data",
    cachedImageUrl: "/cache/source-data.jpg",
    sourceUrl: sourcedDataState.sourceUrl,
    sourceQualityTier: "official",
    structuredDataEvidence: {
      contract: "A1StructuredDataEvidence/v1",
      metricCount: 1,
      metrics: [{ label: "population", value: 3.6, unit: "billion" }],
    },
  }]),
});
assert.deepEqual(sourcedData.report.requestedShotIds, ["01"], "a data shot with an article source must enter automatic evidence discovery even when text-derived numbers make its slot mechanically ready");
assert.equal(sourcedData.report.candidateCount, 1);
assert.equal(sourcedData.state.assets[0]?.structuredDataEvidence?.contract, "A1StructuredDataEvidence/v1");

const repeatedSourceData = await discoverAutomaticAssetCandidates({
  ...sourcedDataState,
  shots: [
    { id: "01", screenTitle: "来源页数据 A", source: "官方报告显示 3.6 billion people", template: "rve-stat-counter" },
    { id: "02", screenTitle: "来源页数据 B", source: "官方报告显示 250000 additional deaths", template: "rve-progress-bars" },
  ],
}, {
  slotPlans: ["01", "02"].map((shotId) => ({ ...sourcedDataPlan[0], shotId, query: `official source data ${shotId}` })),
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init.body || "{}"));
    return jsonResponse([{
      id: `candidate:shared-data:${body.shotId}`,
      cachedImageUrl: "/cache/source-data-shared.jpg",
      sourceUrl: sourcedDataState.sourceUrl,
      sourceQualityTier: "official",
      structuredDataEvidence: {
        contract: "A1StructuredDataEvidence/v1",
        metricCount: 2,
        metrics: [{ label: "population", value: 3.6, unit: "billion" }, { label: "deaths", value: 250000, unit: "" }],
      },
    }]);
  },
});
assert.equal(repeatedSourceData.report.candidateCount, 2, `one source-page data visual may support distinct source-verified metrics in multiple shots: ${JSON.stringify(repeatedSourceData.report)}`);
assert.deepEqual(repeatedSourceData.report.unresolvedShotIds, []);

const carrierRequests = [];
const carrierState = {
  ...state,
  sourceUrl: "",
  shots: [{
    id: "carrier-01",
    screenTitle: "账面记录 500 人",
    source: "洗衣店实际到店 50 人，账页却记为 500 人；异常数字必须追加在可见账本证据上。",
    template: "rve-image-zoom-reveal",
  }],
  assets: [],
};
const carrierResult = await discoverAutomaticAssetCandidates(carrierState, {
  slotPlans: [{
    contract: "A1AssetSlotPlan/v1",
    shotId: "carrier-01",
    slotKind: "single-image",
    status: "blocked",
    requiredCount: 1,
    query: "洗衣店 账本 客流记录",
    subSlots: [],
  }],
  fetchImpl: async (_url, init) => {
    const body = JSON.parse(String(init.body || "{}"));
    carrierRequests.push(body);
    return jsonResponse([{
      id: "candidate:ledger",
      cachedImageUrl: "/cache/laundromat-ledger.jpg",
      sourceUrl: "https://source.test/laundromat-ledger",
      sourceQualityTier: "source-page",
    }]);
  },
});
assert.equal(carrierRequests.length, 1);
assert.match(carrierRequests[0].query, /laundromat cashier writing daily register/u);
assert.equal(carrierRequests[0].materialCarrierRequirement.role, "evidence");
assert.equal(carrierRequests[0].materialCarrierRequirement.effectBinding.semanticAction, "append");
assert.equal(carrierResult.state.assets[0].effectBinding.targetType, "source-text-range");
assert.equal(carrierResult.state.assets[0].adopted, false, "carrier-bound assets remain review-only");
assert.equal(hasVerifiedMaterialEffectAnchor(carrierResult.state.assets[0]), false, "a semantic candidate without an exact text anchor must fail closed");
const anchoredCarrier = {
  ...carrierResult.state.assets[0],
  evidenceFields: {
    semanticMatchScore: 20,
    rangeToken: "carrier-01:ledger-entry",
    sourceTextSha256: "a".repeat(64),
  },
};
assert.equal(hasVerifiedMaterialEffectAnchor(anchoredCarrier), true, "a verified text range may enable the bound append effect");
const personRequirement = deriveMaterialCarrierRequirement({
  entity: "具体人物",
  source: "文章介绍具体人物的采访对象和原文插图。",
}, { slotKind: "single-image", query: "人物照片 原文插图" });
assert.equal(personRequirement.sourceBinding.mode, "SOURCE_BOUND_ONLY");
assert.equal(personRequirement.sourceBinding.generationAllowed, false);
assert.equal(personRequirement.sourceBinding.requiresArticleSource, true);
assert.ok(personRequirement.forbiddenFallback.includes("imagegen"));

const verifiedPackageState = {
  ...state,
  sourceUrl: "https://official.test/research",
  shots: [{id: "package-01", screenTitle: "研究证据", source: "官方报告需要标记并展示可读证据页面。", template: "rve-image-zoom-reveal"}],
  assets: [],
};
const verifiedPackage = await discoverAutomaticAssetCandidates(verifiedPackageState, {
  slotPlans: [{contract: "A1AssetSlotPlan/v1", shotId: "package-01", slotKind: "single-image", status: "blocked", requiredCount: 1, query: "official research evidence page", subSlots: []}],
  fetchImpl: async () => jsonResponse([{
    id: "candidate:verified-package",
    canonicalName: "Official report annotated highlighted evidence page",
    cachedImageUrl: "/assets/web-assets/cache/verified-package.png",
    cachedImageSha256: "b".repeat(64),
    sourceUrl: verifiedPackageState.sourceUrl,
    sourceQualityTier: "official",
    sourceQualityScore: 96,
    license: "by",
    evidenceFields: {cachedImageSha256: "b".repeat(64), license: "by", sourceQualityTier: "official"},
    materialCarrierPixelReview: {
      contract: "A1MaterialCarrierPixelReview/v1",
      status: "PASS",
      score: 94,
      entityCorrect: true,
      sceneContextCorrect: true,
      actionCarrierFit: true,
      carrierVisible: true,
      pageRegion: {x: 0.08, y: 0.1, width: 0.84, height: 0.76},
      labels: [{id: "document", confidence: 0.94}],
      featurePrintDigest: "c".repeat(32),
      fatalFailures: [],
    },
  }]),
});
const verifiedPackageAsset = verifiedPackage.state.assets[0];
assert.equal(verifiedPackageAsset.externalSourcePackagingPlan?.status, "READY_FOR_REVIEW");
assert.equal(verifiedPackageAsset.externalSourcePackagingPlan?.route, "EVIDENCE_HIGHLIGHT");
assert.equal(verifiedPackageAsset.externalSourcePackagingPlan?.reviewBoundary?.productionAdmission, false);
assert.equal(verifiedPackageAsset.automaticTreatmentDecision?.status, "READY_FOR_REVIEW");
assert.equal(verifiedPackageAsset.automaticTreatmentDecision?.presentation?.mode, "EVIDENCE_PRESERVE");
assert.equal(verifiedPackageAsset.automaticTreatmentDecision?.art?.selectedTreatment, "CLEAN");
assert.equal(verifiedPackage.report.treatmentDecisionCount, 1);
assert.equal(verifiedPackage.report.cleanTreatmentCount, 1);

const verifiedPersonState = {
  ...state,
  sourceUrl: "https://official.test/person",
  shots: [{
    id: "person-01",
    screenTitle: "人物转场",
    source: "文章介绍一位具体人物，需要识别本人并形成概念转场。",
    entity: "具体人物",
    template: "rve-image-zoom-reveal",
    assetTreatmentSemantics: {visualIntent: "CONCEPTUAL_BRIDGE", tone: "TENSE"},
    backgroundComplexity: "BUSY",
    subjectSeparation: "LOW",
  }],
  assets: [],
};
const verifiedPerson = await discoverAutomaticAssetCandidates(verifiedPersonState, {
  slotPlans: [{contract: "A1AssetSlotPlan/v1", shotId: "person-01", slotKind: "single-image", status: "blocked", requiredCount: 1, query: "official person portrait", subSlots: []}],
  fetchImpl: async () => jsonResponse([{
    id: "candidate:verified-person",
    canonicalName: "Verified official portrait",
    cachedImageUrl: "/assets/web-assets/cache/verified-person.png",
    cachedImageSha256: "d".repeat(64),
    sourceUrl: verifiedPersonState.sourceUrl,
    sourceQualityTier: "official",
    sourceQualityScore: 97,
    license: "by",
    evidenceFields: {
      cachedImageSha256: "d".repeat(64),
      license: "by",
      sourceQualityTier: "official",
      identityVerified: true,
      sourceClean: true,
      burnedTextPresent: false,
      subjectMatte: {
        status: "PASS",
        alphaSafe: true,
        sourceSha256: "d".repeat(64),
        matteSha256: "e".repeat(64),
      },
    },
    materialCarrierPixelReview: {
      contract: "A1MaterialCarrierPixelReview/v1",
      status: "PASS",
      score: 96,
      entityCorrect: true,
      sceneContextCorrect: true,
      actionCarrierFit: true,
      carrierVisible: true,
      labels: [{id: "person", confidence: 0.98}],
      featurePrintDigest: "f".repeat(32),
      fatalFailures: [],
    },
  }]),
});
const verifiedPersonAsset = verifiedPerson.state.assets[0];
assert.equal(verifiedPersonAsset.externalSourcePackagingPlan?.route, "SUBJECT_ISOLATION");
assert.equal(verifiedPersonAsset.automaticTreatmentDecision?.presentation?.mode, "CUTOUT");
assert.equal(verifiedPersonAsset.automaticTreatmentDecision?.separation?.effectIntent, "OUTLINE");
assert.equal(verifiedPersonAsset.automaticTreatmentDecision?.art?.selectedTreatment, "SPOT_DUOTONE");
assert.equal(verifiedPersonAsset.automaticTreatmentDecision?.boundaries?.productionAdmission, false);
assert.equal(verifiedPerson.report.cutoutCount, 1);
assert.equal(verifiedPerson.report.stylizedTreatmentCount, 1);

const report = {
  ok: true,
  contract: "A1AutomaticAssetCandidateModuleTest/v1",
  completed: completed.report,
  partial: partial.report,
  unavailable: unavailable.report,
  carrierRequirement: carrierResult.report,
  externalSourcePackagingPlan: verifiedPackageAsset.externalSourcePackagingPlan,
  evidenceTreatmentDecision: verifiedPackageAsset.automaticTreatmentDecision,
  personTreatmentDecision: verifiedPersonAsset.automaticTreatmentDecision,
};
const outDir = path.join(process.cwd(), ".codex-artifacts", "automatic-asset-candidates", "2026-07-10");
fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, "module-test.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
