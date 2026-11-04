import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildAssetReviewRecommendation } from "../apps/studio-next/src/lib/a1-asset-review-recommendation.js";

const shot = { id: "02", screenTitle: "来源证据", source: "文章需要真实来源图" };
const singleSlot = { contract: "A1AssetSlotPlan/v1", shotId: "02", slotKind: "single-image", status: "blocked", requiredCount: 1 };
const multiSlot = { ...singleSlot, slotKind: "multi-image", requiredCount: 3 };

function asset(id, overrides = {}) {
  return {
    id,
    parentId: "scene-02",
    title: id,
    source: "web-asset-discovery",
    sourceUrl: `https://sources.test/${id}`,
    imageUrl: `https://images.test/${id}.jpg`,
    kind: "source-evidence-image",
    width: 1600,
    height: 900,
    selectedCropMode: "contain-safe",
    imageFocalPlan: null,
    status: "待审候选",
    canAdopt: false,
    adopted: false,
    action: "none",
    sourceQualityTier: "open-knowledge",
    sourceQualityLabel: "开放知识源",
    sourceQualityScore: 70,
    ...overrides,
  };
}

const official = asset("official-source", { sourceQualityTier: "official", sourceQualityScore: 61 });
const knowledge = asset("knowledge-high-score", { sourceQualityTier: "open-knowledge", sourceQualityScore: 99 });
const single = buildAssetReviewRecommendation({ shot, slotPlan: singleSlot, assets: [knowledge, official], articleSourceUrl: "" });
assert.equal(single.contract, "A1AssetReviewRecommendation/v1");
assert.equal(single.status, "ready");
assert.deepEqual(single.recommendedAssetIds, ["official-source"]);
assert.equal(single.confirmationRequired, true);

const sameTier = buildAssetReviewRecommendation({
  shot,
  slotPlan: singleSlot,
  assets: [asset("score-70"), asset("score-90", { sourceQualityScore: 90 })],
  articleSourceUrl: "",
});
assert.deepEqual(sameTier.recommendedAssetIds, ["score-90"]);

const hostMatch = buildAssetReviewRecommendation({
  shot,
  slotPlan: singleSlot,
  assets: [
    asset("other-host", { sourceUrl: "https://other.test/page", sourceQualityScore: 80 }),
    asset("article-host", { sourceUrl: "https://article.test/evidence", sourceQualityScore: 80 }),
  ],
  articleSourceUrl: "https://article.test/story",
});
assert.deepEqual(hostMatch.recommendedAssetIds, ["article-host"]);

const exclusions = buildAssetReviewRecommendation({
  shot,
  slotPlan: singleSlot,
  assets: [
    asset("missing-source", { sourceUrl: "" }),
    asset("low-score", { sourceQualityScore: 59 }),
    asset("search-plan", { source: "A1 source-query-plan", kind: "reference-image-search-plan" }),
  ],
  articleSourceUrl: "",
});
assert.equal(exclusions.status, "insufficient");
assert.deepEqual(exclusions.recommendedAssetIds, []);
assert.equal(exclusions.alternativeAssetIds.length, 3);

const stableTie = buildAssetReviewRecommendation({
  shot,
  slotPlan: singleSlot,
  assets: [asset("z-last"), asset("a-first")],
  articleSourceUrl: "",
});
assert.deepEqual(stableTie.recommendedAssetIds, ["a-first"]);

const multi = buildAssetReviewRecommendation({
  shot,
  slotPlan: multiSlot,
  assets: [
    asset("official-a", { sourceQualityTier: "official", sourceQualityScore: 90, sourceUrl: "https://a.test/one" }),
    asset("official-a-duplicate", { sourceQualityTier: "official", sourceQualityScore: 89, sourceUrl: "https://a.test/two", imageUrl: "https://images.test/official-a.jpg" }),
    asset("publisher-b", { sourceQualityTier: "publisher", sourceQualityScore: 88, sourceUrl: "https://b.test/two" }),
    asset("knowledge-c", { sourceQualityTier: "open-knowledge", sourceQualityScore: 87, sourceUrl: "https://c.test/three" }),
  ],
  articleSourceUrl: "",
});
assert.deepEqual(multi.recommendedAssetIds, ["official-a", "publisher-b", "knowledge-c"]);
assert.equal(multi.sourceDiversityCount, 3);

const insufficient = buildAssetReviewRecommendation({
  shot,
  slotPlan: multiSlot,
  assets: [asset("only-one"), asset("duplicate", { imageUrl: "https://images.test/only-one.jpg" })],
  articleSourceUrl: "",
});
assert.equal(insufficient.status, "insufficient");
assert.equal(insufficient.recommendedAssetIds.length, 1);

const focal = buildAssetReviewRecommendation({
  shot,
  slotPlan: singleSlot,
  assets: [asset("focal", {
    selectedCropMode: "focal-cover",
    imageFocalPlan: {
      contract: "A1ImageFocalPlan/v1",
      objectPosition: { x: 42, y: 57 },
      zoom: 116,
      sourceDimensions: { width: 1600, height: 900 },
    },
  })],
  articleSourceUrl: "",
});
assert.deepEqual(focal.cropDefaults[0], { assetId: "focal", cropMode: "focal-cover", focalX: 42, focalY: 57, zoom: 116 });

const fallback = buildAssetReviewRecommendation({ shot, slotPlan: singleSlot, assets: [asset("fallback")], articleSourceUrl: "" });
assert.deepEqual(fallback.cropDefaults[0], { assetId: "fallback", cropMode: "contain-safe", focalX: 50, focalY: 50, zoom: 100 });

const report = {
  ok: true,
  contract: "A1AssetReviewRecommendationModuleTest/v1",
  single,
  multi,
  insufficient,
  focal: focal.cropDefaults[0],
};
const outDir = path.join(process.cwd(), ".codex-artifacts", "asset-review-recommendation", "2026-07-10");
fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, "module-test.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
