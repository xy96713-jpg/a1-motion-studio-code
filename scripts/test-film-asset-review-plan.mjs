import assert from "node:assert/strict";
import { buildFilmAssetReviewPlan } from "../apps/studio-next/src/lib/a1-film-asset-review-plan.js";

const sourceUrl = "https://publisher.test/article";
const shots = [
  { id: "01", screenTitle: "开场" },
  { id: "02", screenTitle: "功能 A" },
  { id: "03", screenTitle: "功能 B" },
  { id: "04", screenTitle: "功能 C" },
];
const slotPlans = [
  { shotId: "01", slotKind: "text", requiredCount: 0, status: "not-needed" },
  { shotId: "02", slotKind: "single-image", requiredCount: 1, status: "blocked" },
  { shotId: "03", slotKind: "single-image", requiredCount: 1, status: "blocked" },
  { shotId: "04", slotKind: "single-image", requiredCount: 1, status: "blocked" },
];
const asset = (shotId, id, originalImageUrl, semanticMatchScore, overrides = {}) => ({
  id,
  parentId: `scene-${shotId}`,
  imageUrl: `http://127.0.0.1:4288/assets/web-assets/cache/${id}.jpg`,
  sourceUrl,
  source: "source-page-media",
  sourceQualityTier: "source-page",
  sourceQualityScore: 68,
  evidenceFields: { imageUrl: originalImageUrl, semanticMatchScore },
  adopted: false,
  ...overrides,
});
const assets = [
  asset("02", "feature-a", "https://cdn.test/a.jpg", 86),
  asset("03", "feature-b", "https://cdn.test/b.jpg", 61),
  asset("04", "feature-c-low", "https://cdn.test/c.jpg", 0),
  asset("04", "feature-c-remote", "https://cdn.test/c2.jpg", 70, { imageUrl: "https://cdn.test/c2.jpg" }),
];

const plan = buildFilmAssetReviewPlan({ shots, slotPlans, assets, articleSourceUrl: sourceUrl });
assert.equal(plan.contract, "A1FilmAssetReviewPlan/v1");
assert.equal(plan.readyShotCount, 2);
assert.equal(plan.readyAssetCount, 2);
assert.deepEqual(plan.selections.map((selection) => selection.shotId), ["02", "03"]);
assert.deepEqual(plan.selections.flatMap((selection) => selection.assetIds), ["feature-a", "feature-b"]);
assert.deepEqual(plan.blockedShotIds, ["04"]);
assert.equal(plan.confirmationRequired, true);
assert.equal(plan.canConfirm, true);

const duplicate = buildFilmAssetReviewPlan({
  shots,
  slotPlans,
  assets: [
    asset("02", "dup-a", "https://cdn.test/shared.jpg", 80),
    asset("03", "dup-b", "https://cdn.test/shared.jpg", 80),
  ],
  articleSourceUrl: sourceUrl,
});
assert.equal(duplicate.readyShotCount, 1);
assert(duplicate.blockedShotIds.includes("03"));

const usagePolicy = {
  contract: "A1ProjectUsagePolicy/v1",
  mode: "personal-noncommercial",
  allowSourcePageScreenshots: true,
};
const screenshotAsset = asset("04", "feature-c-screenshot", "http://127.0.0.1:4288/assets/web-assets/cache/feature-c-screenshot.jpg", 0, {
  source: "source-page-screenshot",
  evidenceFields: {
    imageUrl: "https://publisher.test/article#feature-c",
    semanticMatchScore: 0,
    captureRole: "article-context",
    screenshotPermission: "user-confirmed-personal-noncommercial",
    capturedAt: "2026-07-11T03:00:00.000Z",
  },
});
const screenshotAllowed = buildFilmAssetReviewPlan({
  shots,
  slotPlans,
  assets: [screenshotAsset],
  articleSourceUrl: sourceUrl,
  usagePolicy,
});
assert.equal(screenshotAllowed.readyShotCount, 1);
assert.deepEqual(screenshotAllowed.selections[0].assetIds, ["feature-c-screenshot"]);
assert.equal(screenshotAllowed.usageMode, "personal-noncommercial");

const screenshotBlockedWithoutPolicy = buildFilmAssetReviewPlan({
  shots,
  slotPlans,
  assets: [screenshotAsset],
  articleSourceUrl: sourceUrl,
});
assert.equal(screenshotBlockedWithoutPolicy.readyShotCount, 0);
assert(screenshotBlockedWithoutPolicy.blockedShotIds.includes("04"));

const sourceDataPlan = buildFilmAssetReviewPlan({
  shots: [{ id: "01", screenTitle: "气候健康风险", source: "全球已有约 36 亿人生活在高度易受气候影响的地区。2030 年到 2050 年之间预计每年额外造成约 25 万人死亡。" }],
  slotPlans: [{ shotId: "01", slotKind: "data", requiredCount: 1, status: "ready" }],
  articleSourceUrl: "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health",
  assets: [asset("01", "who-structured-data", "https://cdn.who.int/risk-pathways.jpg", 80, {
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health",
    sourceQualityTier: "official",
    structuredDataEvidence: {
      contract: "A1StructuredDataEvidence/v1",
      metricCount: 4,
      metrics: [
        { label: "population", value: 3.6, unit: "billion" },
        { label: "projection start", value: 2030, unit: "" },
        { label: "projection end", value: 2050, unit: "" },
        { label: "additional deaths", value: 250000, unit: "" },
      ],
    },
  })],
});
assert.equal(sourceDataPlan.readyShotCount, 1, "a cached official data candidate must be confirmable only after its source metrics match the sentence");
assert.deepEqual(sourceDataPlan.selections[0].assetIds, ["who-structured-data"]);

const sharedSourceDataPlan = buildFilmAssetReviewPlan({
  shots: [
    { id: "01", screenTitle: "人口风险", source: "全球已有约 36 亿人生活在高度易受气候影响的地区。" },
    { id: "02", screenTitle: "死亡风险", source: "2030 年到 2050 年之间预计每年额外造成约 25 万人死亡。" },
  ],
  slotPlans: [
    { shotId: "01", slotKind: "data", requiredCount: 1, status: "ready" },
    { shotId: "02", slotKind: "data", requiredCount: 1, status: "ready" },
  ],
  articleSourceUrl: "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health",
  assets: ["01", "02"].map((shotId) => asset(shotId, `who-shared-data-${shotId}`, "https://cdn.who.int/risk-pathways.jpg", 80, {
    sourceUrl: "https://www.who.int/news-room/fact-sheets/detail/climate-change-and-health",
    sourceQualityTier: "official",
    structuredDataEvidence: sourceDataPlan.selections.length ? {
      contract: "A1StructuredDataEvidence/v1",
      metricCount: 4,
      metrics: [
        { label: "population", value: 3.6, unit: "billion" },
        { label: "projection start", value: 2030, unit: "" },
        { label: "projection end", value: 2050, unit: "" },
        { label: "additional deaths", value: 250000, unit: "" },
      ],
    } : null,
  })),
});
assert.equal(sharedSourceDataPlan.readyShotCount, 2, "the same source-page data visual may be confirmed for different source-verified measurements");

const sourceMapPlan = buildFilmAssetReviewPlan({
  shots: [{ id: "01", screenTitle: "地震群集中在火山口下方", source: "官方地图显示地震群集中在火山口下方，并沿既有断裂分布。" }],
  slotPlans: [{ shotId: "01", slotKind: "map", requiredCount: 1, status: "ready" }],
  articleSourceUrl: "https://www.usgs.gov/media/images/earthquake-hypocenters-map-past-year-kilauea",
  assets: [asset("01", "usgs-official-map", "https://www.usgs.gov/media/images/earthquake-hypocenters-map-past-year-kilauea", 90, {
    sourceUrl: "https://www.usgs.gov/media/images/earthquake-hypocenters-map-past-year-kilauea",
    sourceQualityTier: "official",
    sourceQualityScore: 95,
  })],
});
assert.equal(sourceMapPlan.readyShotCount, 1, "a cached official map candidate must be available for the same one-click film confirmation as other source-bound evidence");
assert.deepEqual(sourceMapPlan.selections[0].assetIds, ["usgs-official-map"]);

console.log(JSON.stringify({ ok: true, contract: "A1FilmAssetReviewPlanTest/v1", cases: 7 }, null, 2));
