import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {judgeImagePixels} from "../lib/visual-sourcing/image-pixel-judge-v1.mjs";

// Turns "is the image sourcing any good?" into a number.
//
// The expensive failure is a FALSE POSITIVE: a candidate the judge approves that
// cannot actually carry the shot, because that is what pollutes a finished film.
// A REJECT on something usable costs a retry; an approval on something unusable
// costs the shot. So false positives are reported as a separate, hard metric.

const root = path.resolve(import.meta.dirname, "..");
const sources = path.join(root, "apps/studio-next/public/generated/system-line/web-source-packaging-pilot-v1/sources");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "a1-judge-benchmark-"));

const blankPagePath = path.join(tmp, "blank-record.png");
await sharp({create: {width: 900, height: 1200, channels: 3, background: {r: 250, g: 250, b: 245}}}).png().toFile(blankPagePath);

/** Evidence shot that must bind a readable text range on a real record surface. */
const evidenceShot = (signals) => ({
  contract: "A1MaterialCarrierRequirement/v1",
  role: "evidence",
  requiredEntity: null,
  requiredAction: "append",
  requiredReadableDetail: "readable-source-detail",
  requiredVisualSignals: signals,
  sourceBinding: {mode: "CARRIER_MAY_BE_GENERATED", generationAllowed: true, requiresArticleSource: false},
  effectBinding: {targetType: "source-text-range", semanticAction: "append", requiresVerifiedCarrier: true},
});

/** Shot that needs a person on screen, bound to an object region. */
const portraitShot = {
  contract: "A1MaterialCarrierRequirement/v1",
  role: "object",
  requiredEntity: null,
  requiredAction: "hold",
  requiredReadableDetail: "recognizable-object-surface",
  requiredVisualSignals: ["portrait", "人物"],
  sourceBinding: {mode: "SOURCE_BOUND_ONLY", generationAllowed: false, requiresArticleSource: true},
  effectBinding: {targetType: "object-roi", semanticAction: "hold", requiresVerifiedCarrier: true},
};

const cases = [
  {
    name: "paper page for a text-append evidence shot",
    image: path.join(sources, "acl-2026-acl-long-1803-title-abstract.png"),
    requirement: evidenceShot(["llms", "study"]),
    expect: "PASS",
    why: "a real paper page with readable text carrying the required anchor token",
  },
  {
    name: "same paper page when the shot needs a person",
    image: path.join(sources, "acl-2026-acl-long-1803-title-abstract.png"),
    requirement: portraitShot,
    expect: "REJECT",
    why: "a document is not a portrait; the scene contradicts the shot",
  },
  {
    name: "small official headshot for a text-append evidence shot",
    image: path.join(sources, "dmitry-kobak-official-portrait.webp"),
    requirement: evidenceShot(["llms", "study"]),
    expect: "REJECT",
    why: "a portrait has no writable record surface, and it is below the resolution floor",
  },
  {
    name: "large profile page missing the required anchor text",
    image: path.join(sources, "dmitry-kobak-official-profile-source.png"),
    requirement: evidenceShot(["llms", "study"]),
    expect: "REJECT",
    why: "document-like, but the required text anchor is absent so the effect cannot bind",
  },
  {
    name: "blank page for a text-append evidence shot",
    image: blankPagePath,
    requirement: evidenceShot(["llms", "study"]),
    expect: "PENDING",
    why: "no readable text means the judge must decline rather than approve or condemn",
  },
  {
    name: "mid-size headshot below the resolution floor",
    image: path.join(sources, "vishakh-padmakumar-official-portrait.webp"),
    requirement: evidenceShot(["llms", "study"]),
    expect: "REJECT",
    why: "too small for the format regardless of content",
  },
];

const rows = [];
for (const testCase of cases) {
  const review = await judgeImagePixels({imagePath: testCase.image, requirement: testCase.requirement});
  rows.push({
    name: testCase.name,
    expect: testCase.expect,
    actual: review.status,
    match: review.status === testCase.expect,
    score: review.score,
    semanticSource: review.semanticSource,
    labels: (review.labels || []).map((label) => label.id),
    failures: review.fatalFailures,
    ocrTextLength: review.ocrTextLength,
    textRegionCount: review.textRegionCount,
    rangeToken: review.rangeToken,
    why: testCase.why,
  });
}

const total = rows.length;
const matched = rows.filter((row) => row.match).length;
// The dangerous error: approving something that cannot carry the shot.
const falsePositives = rows.filter((row) => row.expect !== "PASS" && row.actual === "PASS");
// Approved when it should have been refused or held.
const falseNegatives = rows.filter((row) => row.expect === "PASS" && row.actual !== "PASS");

const statuses = ["PASS", "REJECT", "PENDING"];
const matrix = Object.fromEntries(statuses.map((expect) => [
  expect,
  Object.fromEntries(statuses.map((actual) => [actual, rows.filter((row) => row.expect === expect && row.actual === actual).length])),
]));

const report = {
  ok: matched === total && falsePositives.length === 0,
  contract: "A1MaterialCarrierJudgeBenchmark/v1",
  accuracy: Number((matched / total).toFixed(4)),
  cases: total,
  matched,
  falsePositiveCount: falsePositives.length,
  falseNegativeCount: falseNegatives.length,
  confusionMatrix: matrix,
  rows,
};

assert.equal(falsePositives.length, 0, `judge approved unusable material: ${JSON.stringify(falsePositives.map((row) => row.name))}`);
assert.equal(matched, total, `judge disagreed with intended verdicts: ${JSON.stringify(rows.filter((row) => !row.match).map((row) => ({name: row.name, expect: row.expect, actual: row.actual})))}`);

console.log(JSON.stringify(report, null, 2));
