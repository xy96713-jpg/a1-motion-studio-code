import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(load(relativePath));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

// The editorial shot director is downstream of the article + timed-cue AI
// director; calling it with raw text would test an unsupported entry point.
const fixture = json("apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json");
const run = json("work/six-unseen-plan-qualification-v1/run.json");
const audit = json("work/six-unseen-plan-qualification-v1/result.json");
assert.equal(fixture.articles.length, 6);
assert.equal(run.articleCount, 6);
assert.equal(audit.status, "PASS");

const genreCounts = Object.fromEntries([...new Set(fixture.articles.map((item) => item.genre))]
  .map((genre) => [genre, fixture.articles.filter((item) => item.genre === genre).length]));
const preSegmentedInputCount = fixture.articles.filter((item) =>
  Array.isArray(item.shots) && item.shots.length > 0 && !item.articleText && !item.timelineSrt,
).length;
const boundary = run.boundary;
const result = {
  contract: "A1SystemSemanticDirectorEvidenceBoundary/v1",
  savedPlanAuditStatus: audit.status,
  genreCounts,
  preSegmentedInputCount,
  planLayerQualified: boundary.planLayerQualified,
  imageGenerationQualified: boundary.imageGenerationQualified,
  motionQualified: boundary.motionQualified,
  sequenceReviewQualified: boundary.sequenceReviewQualified,
  humanVisualAcceptance: boundary.humanVisualAcceptance,
  fullRouteMaturity: boundary.fullRouteMaturity,
  fixtureSha256: sha256(load("apps/studio-next/src/data/test-fixtures/a1-six-unseen-articles-v1.json")),
};
console.log(JSON.stringify(result, null, 2));

// RED means the saved six-article proof stops at an externally supplied shot
// list. It is not a failure of the upstream AI director's API.
assert.equal(preSegmentedInputCount, 0, "cross-article-proof-still-starts-after-manual-shot-segmentation");
assert.equal(boundary.fullRouteMaturity, true, "cross-article-full-route-proof-not-established");
assert.equal(boundary.sequenceReviewQualified, true, "cross-article-continuous-sequence-review-missing");
