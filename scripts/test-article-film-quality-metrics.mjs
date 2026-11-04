import assert from "node:assert/strict";
import { measureArticleFilmQuality } from "../apps/studio-next/src/lib/a1-article-film-quality.js";

const payload = {
  props: {
    items: [
      { id: "shot-01", selectedSlug: "title-split", title: "开场", assetSlotPlan: { slotKind: "text", requiredCount: 0 } },
      { id: "shot-02", selectedSlug: "image-zoom-reveal", title: "真实证据", assetSlotPlan: { slotKind: "single-image", requiredCount: 1 } },
      { id: "shot-03", selectedSlug: "image-carousel", title: "前后变化", assetSlotPlan: { slotKind: "multi-image", requiredCount: 2 } },
      { id: "shot-04", selectedSlug: "quote-card", title: "这是一个明显过长并且可能造成排版风险的中文镜头标题文本", assetSlotPlan: { slotKind: "text", requiredCount: 0 } },
    ],
  },
  state: {
    assets: [
      { id: "a", parentId: "scene-02", imageUrl: "http://cache/a.jpg", adopted: true, evidenceFields: { semanticMatchScore: 12 } },
      { id: "b", parentId: "scene-03", imageUrl: "http://cache/b.jpg", adopted: true, evidenceFields: { semanticMatchScore: 9 } },
    ],
  },
};

const result = measureArticleFilmQuality(payload);
assert.equal(result.contract, "A1ArticleFilmQualityMetrics/v1");
assert.equal(result.shotCount, 4);
assert.equal(result.visualRequiredShotCount, 2);
assert.equal(result.assetCoveredShotCount, 1);
assert.equal(result.assetCoverage, 0.5);
assert.equal(result.textCardRatio, 0.5);
assert.equal(result.maxTemplateRun, 1);
assert.equal(result.semanticVisualHitRate, 0.5);
assert.deepEqual(result.typographyRiskShotIds, ["04"]);
assert(result.flags.includes("asset-coverage-low"));

console.log(JSON.stringify({ ok: true, contract: result.contract, result }, null, 2));
