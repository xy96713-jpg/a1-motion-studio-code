import assert from "node:assert/strict";
import path from "node:path";
import {
  promoteWebAssetCandidate,
  validatePromotionReview,
} from "../lib/storyboard-web-asset-promotion.js";
import {judgeImagePixels} from "../lib/visual-sourcing/image-pixel-judge-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const documentImage = path.join(root, "apps/studio-next/public/generated/system-line/web-source-packaging-pilot-v1/sources/acl-2026-acl-long-1803-title-abstract.png");

const candidate = {
  id: "candidate:web-research-page",
  parentId: "shot:ED-14",
  kind: "reference-image",
  label: "Research page",
  canonicalName: "Research page",
  status: "metadata-fetched",
  source: "duckduckgo-image-search",
  sourceUrl: "https://aclanthology.org/2026.acl-long.1803/",
  imageUrl: "/assets/web-assets/cache/research-page.png",
  cachedImageUrl: "/assets/web-assets/cache/research-page.png",
  width: 993,
  height: 1404,
  author: "ACL Anthology",
};

const baseReview = {
  approvedBy: "test-reviewer",
  visualAuditPath: "/tmp/visual-audit.png",
  promotionMode: "renderable-image",
  licenseReview: "approved",
  previewPolicy: "cached-image",
  attribution: "ACL Anthology",
};

const evidenceRequirement = {
  contract: "A1MaterialCarrierRequirement/v1",
  role: "evidence",
  requiredEntity: null,
  requiredAction: "append",
  requiredReadableDetail: "readable-source-detail",
  requiredVisualSignals: ["llms", "study"],
  sourceBinding: {mode: "CARRIER_MAY_BE_GENERATED", generationAllowed: true, requiresArticleSource: false},
  effectBinding: {targetType: "source-text-range", semanticAction: "append", requiresVerifiedCarrier: true},
};

const results = {};

// --- 1. human review alone still promotes (no regression) ------------------
{
  const validation = validatePromotionReview(candidate, baseReview);
  assert.equal(validation.ok, true, `existing human-review path must keep working: ${validation.failures}`);
  const promoted = promoteWebAssetCandidate(candidate, baseReview);
  assert.equal(promoted.ok, true);
  assert.equal(promoted.promoted.actualPixelAudit, null, "no automated audit supplied means null, not a fake pass");
  results.humanReviewOnly = {ok: promoted.ok, actualPixelAudit: promoted.promoted.actualPixelAudit};
}

// --- 2. supplying a non-passing audit blocks promotion --------------------
{
  for (const status of ["PENDING", "REJECT"]) {
    const review = {...baseReview, materialCarrierPixelReview: {contract: "A1MaterialCarrierPixelReview/v1", status}};
    const validation = validatePromotionReview(candidate, review);
    assert.equal(validation.ok, false, `a ${status} pixel audit must not promote`);
    assert.ok(
      validation.failures.some((failure) => failure.startsWith("actualPixelSemanticAuditNotPassed")),
      `expected actualPixelSemanticAuditNotPassed, got ${validation.failures}`,
    );
    results[`${status}BlocksPromotion`] = validation.failures;
  }
}

// --- 3. a caller can demand an automated audit outright -------------------
{
  const demanding = {...baseReview, requireActualPixelSemanticAudit: true};
  const withoutAudit = validatePromotionReview(candidate, demanding);
  assert.equal(withoutAudit.ok, false, "demanding an audit must fail when none was supplied");
  assert.ok(withoutAudit.failures.includes("missingActualPixelSemanticAudit"));

  const withAudit = validatePromotionReview(candidate, {
    ...demanding,
    materialCarrierPixelReview: {contract: "A1MaterialCarrierPixelReview/v1", status: "PASS", score: 90},
  });
  assert.equal(withAudit.ok, true, `a passing audit must satisfy the demand: ${withAudit.failures}`);
  results.demandAudit = {withoutAudit: withoutAudit.failures, withAuditOk: withAudit.ok};
}

// --- 4. real pixels flow end to end into the verified entry ---------------
{
  const review = await judgeImagePixels({imagePath: documentImage, requirement: evidenceRequirement});
  assert.equal(review.status, "PASS", `fixture must pass pixel review: ${review.fatalFailures}`);

  const promoted = promoteWebAssetCandidate(candidate, {...baseReview, materialCarrierPixelReview: review});
  assert.equal(promoted.ok, true, `verified pixels must promote: ${promoted.failures}`);
  const audit = promoted.promoted.actualPixelAudit;
  assert.equal(audit.contract, "A1ActualPixelSemanticAudit/v1");
  assert.equal(audit.status, "PASS");
  assert.equal(audit.semanticSource, "local");
  assert.equal(audit.ocrTextLength > 0, true, "OCR evidence must be carried into the verified entry");
  assert.equal(audit.textRegionCount > 0, true);
  assert.ok(audit.labels.length > 0, "classification labels must be carried");
  assert.ok(audit.rangeToken, "the bound text anchor must be carried");
  assert.equal(typeof audit.featurePrintDigest, "string");
  assert.equal(audit.featurePrintDigest.length, 32, "feature print digest enables duplicate/reuse lookup later");
  assert.equal(promoted.promoted.verifiedForRender, true);
  assert.equal(promoted.promoted.renderAllowed, true);
  results.endToEnd = {
    promotedOk: promoted.ok,
    auditStatus: audit.status,
    semanticSource: audit.semanticSource,
    labels: audit.labels.map((label) => label.id),
    ocrTextLength: audit.ocrTextLength,
    textRegionCount: audit.textRegionCount,
    rangeToken: audit.rangeToken,
    featurePrintDigest: audit.featurePrintDigest,
  };
}

console.log(JSON.stringify({
  ok: true,
  contract: "A1ActualPixelAuditPromotionTest/v1",
  ...results,
}, null, 2));
