const nextUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";
const backendUrl = process.env.A1_BACKEND_URL || "http://localhost:4288";
const sourceUrl = `${backendUrl}/generated/source-page-jsonld-media-fixture.html`;

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

const initialState = {
  contract: "A1NextLegacyBridgeState/v1",
  legacyOrigin: "A1ArticleTemplateCompiler/v1",
  projectTitle: "结构化数据证据修复测试",
  sourceUrl,
  generatedAt: new Date().toISOString(),
  projectId: "compiled-structured-data-test",
  projectCount: 0,
  assetCount: 0,
  templateOptions: [],
  shots: [
    {
      id: "01",
      role: "依据",
      source: "核心城市订单量增长 24%，但三线城市仍低于去年同期。",
      visual: "数据证据",
      assetNeed: "需要来源页表格或结构化数据",
      template: "rve-progress-bars",
      status: "待修复",
      route: "data/metrics",
      screenTitle: "核心城市订单量增长 24%",
      templateSelection: {
        contract: "A1TemplateSelectionPlan/v1",
        selectedTemplateId: "rve-progress-bars",
        selectedSlug: "progress-bars",
        gateId: "instrument-data",
      },
    },
  ],
  assets: [],
};

const failures = [];

const discovery = await postJson(`${nextUrl}/api/a1-actions/discover-compiled-assets`, {
  state: initialState,
  shotId: "01",
});
const discoveredState = discovery.payload.state || {};
const candidate = Array.isArray(discoveredState.assets) ? discoveredState.assets[0] : null;
const candidateStructured = candidate?.structuredDataEvidence || {};

assert(discovery.response.ok && discovery.payload.ok, `discover structured candidate failed ${discovery.response.status}: ${JSON.stringify(discovery.payload).slice(0, 800)}`, failures);
assert(candidate?.sourceQualityTier === "source-page", `expected source-page candidate, got ${candidate?.sourceQualityTier || "missing"}`, failures);
assert(candidateStructured.contract === "A1StructuredDataEvidence/v1", `candidate should carry structured data evidence: ${JSON.stringify(candidateStructured)}`, failures);
assert(Number(candidateStructured.metricCount || 0) >= 2, `candidate should carry table metrics: ${JSON.stringify(candidateStructured)}`, failures);

const review = await postJson(`${nextUrl}/api/a1-actions/review-compiled-asset`, {
  state: discoveredState,
  shotId: "01",
  assetId: candidate?.id || "",
  cropMode: "contain-safe",
});
const reviewedState = review.payload.state || {};
const reviewedAsset = Array.isArray(reviewedState.assets) ? reviewedState.assets.find((asset) => asset.id === candidate?.id) : null;

assert(review.response.ok && review.payload.ok, `review structured candidate failed ${review.response.status}: ${JSON.stringify(review.payload).slice(0, 800)}`, failures);
assert(reviewedAsset?.adopted === true, `structured candidate should be adopted: ${JSON.stringify(reviewedAsset)}`, failures);
assert(reviewedAsset?.structuredDataEvidence?.contract === "A1StructuredDataEvidence/v1", `reviewed asset should preserve structured evidence: ${JSON.stringify(reviewedAsset)}`, failures);

const save = await postJson(`${nextUrl}/api/a1-actions/save-compiled-project`, {
  state: reviewedState,
});
const projectId = save.payload.projectId || "";
assert(save.response.ok && save.payload.ok && projectId, `save structured project failed ${save.response.status}: ${JSON.stringify(save.payload).slice(0, 800)}`, failures);

const persistedResponse = await fetch(`${backendUrl}/api/projects/${encodeURIComponent(projectId)}`);
const persisted = await persistedResponse.json().catch(() => ({}));
const timelineItem = persisted.payload?.compiledArticle?.templateTimelineProps?.items?.[0] || {};
const templateStructured = timelineItem.templateProps?.structuredDataEvidence || {};
const materialStructured = timelineItem.templateProps?.materialEvidence?.structuredDataEvidence || {};
const sceneStructured = persisted.payload?.scenes?.[0]?.assets?.[0]?.structuredDataEvidence || {};
const repairStructured = timelineItem.templateProps?.sourceEvidenceRepair?.structuredDataEvidence || {};
const progressItems = Array.isArray(timelineItem.templateProps?.items) ? timelineItem.templateProps.items : [];
const progressEvidenceItems = Array.isArray(timelineItem.templateProps?.evidenceItems) ? timelineItem.templateProps.evidenceItems : [];
const progressRawValues = progressItems.map((item) => item.raw || item.rawValue || item.value);
const progressFrame = timelineItem.templateProps?.measurementFrame || "";

assert(persistedResponse.ok && persisted.ok, `persisted structured project should load: ${JSON.stringify(persisted).slice(0, 800)}`, failures);
assert(templateStructured.contract === "A1StructuredDataEvidence/v1", `timeline templateProps should preserve structured evidence: ${JSON.stringify(templateStructured)}`, failures);
assert(materialStructured.contract === "A1StructuredDataEvidence/v1", `timeline materialEvidence should preserve structured evidence: ${JSON.stringify(materialStructured)}`, failures);
assert(sceneStructured.contract === "A1StructuredDataEvidence/v1", `saved scene asset should preserve structured evidence: ${JSON.stringify(sceneStructured)}`, failures);
assert(repairStructured.contract === "A1StructuredDataEvidence/v1", `sourceEvidenceRepair should preserve structured evidence: ${JSON.stringify(repairStructured)}`, failures);
assert(progressFrame === "structured-source-page-data", `progress-bars should mark structured data measurement frame, got ${progressFrame || "missing"}`, failures);
assert(progressItems.some((item) => item.dataSource === "structured-source-page-table" && item.raw === "24%" && item.value === 24), `progress-bars should use 24% structured metric as an item: ${JSON.stringify(progressItems)}`, failures);
assert(progressItems.some((item) => item.dataSource === "structured-source-page-table" && item.raw === "-8%" && item.rawValue === -8 && item.value === 8), `progress-bars should use -8% structured metric magnitude with raw signed value: ${JSON.stringify(progressItems)}`, failures);
assert(progressEvidenceItems.every((item) => /structured-source-page-table|核心城市|三线城市/u.test(`${item.dataSource || ""} ${item.evidence || ""}`)), `progress evidence items should cite structured table evidence: ${JSON.stringify(progressEvidenceItems)}`, failures);

if (failures.length) {
  console.error(JSON.stringify({
    ok: false,
    failures,
    projectId,
    candidateStructured,
    templateStructured,
    materialStructured,
    sceneStructured,
    repairStructured,
    progressItems,
    progressRawValues,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1CompiledStructuredDataRepairPersistenceTest/v1",
  nextUrl,
  backendUrl,
  sourceUrl,
  projectId,
  candidate: {
    id: candidate.id,
    source: candidate.source,
    sourceQualityTier: candidate.sourceQualityTier,
    structuredDataContract: candidateStructured.contract,
    metricCount: candidateStructured.metricCount,
    metrics: candidateStructured.metrics,
  },
  persisted: {
    timelineStructuredContract: templateStructured.contract,
    materialStructuredContract: materialStructured.contract,
    sceneStructuredContract: sceneStructured.contract,
    repairStructuredContract: repairStructured.contract,
    progressMeasurementFrame: progressFrame,
    progressItems: progressItems.map((item) => ({
      label: item.label,
      value: item.value,
      rawValue: item.rawValue,
      raw: item.raw,
      suffix: item.suffix,
      dataSource: item.dataSource,
    })),
  },
}, null, 2));
