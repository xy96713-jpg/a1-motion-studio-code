import assert from "node:assert/strict";
import { inspectCompiledAssetEligibility, isCompiledAssetReviewable, isArticleSourceMatch } from "../apps/studio-next/src/lib/a1-compiled-asset-eligibility.js";

const usagePolicy = {
  contract: "A1ProjectUsagePolicy/v1",
  mode: "personal-noncommercial",
  allowSourcePageScreenshots: true,
};

const base = {
  id: "a1",
  parentId: "scene-01",
  title: "test",
  source: "source-page-media",
  sourceUrl: "https://publisher.test/articles/2026/deep-ai.html?utm=ignore",
  imageUrl: "https://cdn.test/assets/a1.jpg",
  kind: "source-evidence-image",
  width: 1920,
  height: 1080,
  selectedCropMode: "contain-safe",
  imageFocalPlan: null,
  status: "待审候选",
  canAdopt: false,
  adopted: false,
  action: "none",
  sourceQualityTier: "official",
  sourceQualityLabel: "官方来源",
  sourceQualityScore: 72,
};

const sameHostDifferentPath = inspectCompiledAssetEligibility({
  ...base,
  id: "a2",
  sourceUrl: "https://publisher.test/articles/2026/",
}, { articleSourceUrl: "https://publisher.test/articles/2026/deep-ai.html" });
assert.equal(sameHostDifferentPath.eligible, true);
assert.equal(sameHostDifferentPath.articleHostMatch, 1);

const mismatchedHost = inspectCompiledAssetEligibility({
  ...base,
  id: "a3",
  sourceUrl: "https://other.test/articles/2026/deep-ai.html",
}, { articleSourceUrl: "https://publisher.test/articles/2026/deep-ai.html", requireArticleSourceMatch: true });
assert.equal(mismatchedHost.eligible, false);

assert.equal(isCompiledAssetReviewable({ ...base, sourceUrl: "https://publisher.test/articles/2026", imageUrl: "https://cdn.test/assets/a1.jpg" }, {
  articleSourceUrl: "https://publisher.test/articles/2026/deep-ai.html#part-3",
  usagePolicy,
}), true);

assert.equal(isCompiledAssetReviewable({ ...base, id: "s1", source: "source-page-screenshot", sourceUrl: "https://publisher.test/articles/2026/deep-ai.html", sourceQualityScore: 90 }, {
  articleSourceUrl: "https://publisher.test/articles/2026/deep-ai.html",
  usagePolicy,
  requireArticleSourceMatch: true,
}), false, "screenshot without evidence permission should still be rejected");

assert.equal(isArticleSourceMatch(
  "https://publisher.test/articles/2026/deep-ai.html",
  "https://publisher.test/articles/2026/deep-ai.html#part-2",
), true);

console.log(JSON.stringify({ ok: true, contract: "A1CompiledAssetEligibilityTest/v1" }, null, 2));
