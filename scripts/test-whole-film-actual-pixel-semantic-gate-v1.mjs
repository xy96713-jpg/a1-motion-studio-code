#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildWholeFilmActualPixelSemanticAudit, findPerceptualDuplicate, perceptualHashDistance} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const plan = workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-17");
const brief = plan.semanticDesignBrief;
const artifact = {publicUrl: "/generated/system-line/fixture.png", sha256: "a".repeat(64), width: 1600, height: 900};
const passing = {
  mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
  reviewSource: "TEST_ACTUAL_PIXEL_REVIEW",
  artifactSha256Verified: true,
  serverVisualReviewPass: true,
  viewerTakeawayMatch: true,
  actorActionMatch: true,
  sourceIdentityMatch: true,
  threeSecondReadable: true,
  genericTemplateDetected: false,
  visualComplexityWithinBudget: true,
  singleReadingPath: true,
  decorativeMotifFree: true,
  referenceCopyDetected: false,
  ocrAvailable: true,
  ocrExactCopyAligned: true,
  textExpected: true,
};

const accepted = buildWholeFilmActualPixelSemanticAudit({brief, artifact, assessment: passing, ocrText: brief.exactCopy});
assert.equal(accepted.status, "PASS");
assert.equal(accepted.recommendationEligible, true);
assert.equal(accepted.checks.artifactSha256Verified, true);
assert.equal(accepted.checks.noForeignShotCopy, true);

const serverBlocked = buildWholeFilmActualPixelSemanticAudit({
  brief,
  artifact: {...artifact, sha256: "9".repeat(64)},
  assessment: {...passing, serverVisualReviewPass: false},
  ocrText: brief.exactCopy,
});
assert.equal(serverBlocked.status, "VISUAL_REJECTED");
assert.equal(serverBlocked.recommendationEligible, false);
assert.ok(serverBlocked.findings.includes("SERVER_VISUAL_REVIEW_NOT_PASS"));

const foreignCopy = buildWholeFilmActualPixelSemanticAudit({
  brief: workspace.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-19").semanticDesignBrief,
  artifact: {...artifact, sha256: "b".repeat(64)},
  assessment: passing,
  ocrText: "所以目前主流的做法，就是先给材料，再找角度，最后再让 AI 动笔。",
  foreignCopies: [{shotId: "ED-17", text: "所以目前主流的做法，就是先给材料，再找角度，最后再让 AI 动笔。"}],
});
assert.equal(foreignCopy.status, "VISUAL_REJECTED");
assert.ok(foreignCopy.findings.some((finding) => finding.startsWith("FOREIGN_SHOT_EXACT_COPY:")));

const debugSource = buildWholeFilmActualPixelSemanticAudit({
  brief,
  artifact: {...artifact, sha256: "c".repeat(64)},
  assessment: passing,
  ocrText: "ACL 2026 project://verified-source-atlas/ed12-five-named-models",
});
assert.equal(debugSource.status, "VISUAL_REJECTED");
assert.ok(debugSource.findings.includes("DEBUG_OR_SOURCE_STRING_VISIBLE"));

const placeholder = buildWholeFilmActualPixelSemanticAudit({
  brief,
  artifact: {...artifact, sha256: "d".repeat(64)},
  assessment: {...passing, emptyPlaceholderDetected: true, reviewRisk: true},
  ocrText: brief.exactCopy,
});
assert.equal(placeholder.status, "REVIEW_REQUIRED");
assert.ok(placeholder.findings.includes("EMPTY_PLACEHOLDER_OR_SECOND_DESIGN_RISK"));

const filler = buildWholeFilmActualPixelSemanticAudit({
  brief,
  artifact: {...artifact, sha256: "e".repeat(64)},
  assessment: passing,
  ocrText: "GRID ONE",
});
assert.equal(filler.status, "VISUAL_REJECTED");
assert.ok(filler.findings.some((finding) => finding.startsWith("UNRELATED_ENGLISH_FILLER:")));

const same = "0".repeat(64);
const near = `0${"0".repeat(62)}1`;
assert.equal(perceptualHashDistance(same, near), 1);
const duplicate = findPerceptualDuplicate(
  {shotId: "ED-19", directionId: "direction-02", artifactSha256: "f".repeat(64), perceptualHash: near},
  [{shotId: "ED-17", directionId: "direction-01", artifactSha256: "1".repeat(64), perceptualHash: same}],
);
assert.equal(duplicate.scope, "CROSS_SHOT_ANOMALY");

console.log(JSON.stringify({contract: "A1WholeFilmActualPixelSemanticGateTest/v1", status: "PASS", checks: {acceptedActualPixelReview: true, foreignExactCopyRejected: true, debugSourceRejected: true, emptyPlaceholderReviewRisk: true, unrelatedFillerRejected: true, perceptualDuplicateRejected: true}}, null, 2));
