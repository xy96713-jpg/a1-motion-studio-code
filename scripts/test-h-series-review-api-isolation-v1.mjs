#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-h-series-review-api-"));
const candidateReportRelative = "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/report.json";
const candidateLedgerRelative = "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/review-decisions.json";
const artworkPolicyRelative = "apps/studio-next/public/generated/system-line/h-series-generated-artwork-policy-v1/report.json";
// Keep this fixture on the current editorial-artwork manifest path. The live
// route previously pointed at the retired repair-result path, which made the
// UI report `generatedArtworkReview: null` even though seven current assets
// were waiting for review.
const artworkResultRelative = "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-result-manifest-v1/report.json";
const artworkLedgerRelative = "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-result-manifest-v1/review-decisions.json";
const beatIds = ["H03-B02", "H03-B03"];
const candidatePropsSha256 = "a".repeat(64);
const executionPlanSha256 = "b".repeat(64);

function writeJson(relativePath, value) {
  const file = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

writeJson(candidateReportRelative, {
  contract: "A1HSeriesPreproductionMotionPreview/v1",
  status: "PASS",
  reviewOnly: true,
  proofOnly: true,
  currentAuthorityMutated: false,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  sourceBinding: {candidateProps: {sha256: candidatePropsSha256}},
  summary: {generatedArtworkPendingVisualReviewCount: 0},
  reviewLedger: {items: beatIds.map((beatId, index) => ({order: index + 1, beatId}))},
});
writeJson(artworkPolicyRelative, {
  contract: "A1HSeriesGeneratedArtworkPolicyAudit/v1",
  status: "WARN_PENDING_HUMAN_VISUAL_REVIEW",
  summary: {warningCount: 1, failureCount: 0, adoptionBlockedByPolicyRisk: true},
  items: [{beatId: "H03-B02", visualRisk: "forbidden-line-primitive", failures: ["suspected-decorative-dashed-line"]}],
});
writeJson(artworkResultRelative, {
  contract: "A1HSeriesGeneratedArtworkResultManifest/v1",
  status: "GENERATED_PENDING_VISUAL_REVIEW",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {executionPlanSha256},
  assets: beatIds.map((beatId) => ({beatId, publicUrl: `/generated/system-line/generated-artwork-assets/${beatId}-repair.png`, localPath: `apps/studio-next/public/generated/system-line/generated-artwork-assets/${beatId}-repair.png`, sha256: "c".repeat(64)})),
});

const previousRoot = process.env.A1_H_SERIES_REVIEW_ROOT;
process.env.A1_H_SERIES_REVIEW_ROOT = tempRoot;
const failures = [];
try {
  const route = await import("../apps/studio-next/src/app/api/system-line/h-series-review/route.ts");
  const post = (payload) => route.POST(new Request("http://127.0.0.1:4311/api/system-line/h-series-review", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(payload)}));
  const initial = await route.GET();
  assert.equal(initial.status, 200);
  const initialPayload = await initial.json();
  assert.equal(initialPayload.ledger.summary.pendingCount, 2);
  assert.equal(initialPayload.generatedArtworkReview.summary.pendingCount, 2);

  const blockedInitialApprove = await post({beatId: "H03-B02", decision: "approve", note: "candidate review test", candidatePropsSha256});
  assert.equal(blockedInitialApprove.status, 409);
  const candidateResponse = await post({beatId: "H03-B02", decision: "revise", note: "candidate review test", candidatePropsSha256});
  assert.equal(candidateResponse.status, 200);
  const candidatePayload = await candidateResponse.json();
  assert.equal(candidatePayload.ledger.summary.reviseCount, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, candidateLedgerRelative), "utf8")).decisions.length, 1);

  const artworkResponse = await post({action: "review-generated-artwork", beatId: "H03-B02", decision: "approve", note: "artwork review test", executionPlanSha256});
  assert.equal(artworkResponse.status, 200);
  const artworkPayload = await artworkResponse.json();
  assert.equal(artworkPayload.generatedArtworkReview.summary.approvedCount, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, artworkLedgerRelative), "utf8")).decisions.length, 1);

  const riskyApproveResponse = await post({beatId: "H03-B02", decision: "approve", note: "candidate review test", candidatePropsSha256});
  // The repaired result has now been visually approved, so the policy risk is
  // resolved without mutating the policy report itself.
  assert.equal(riskyApproveResponse.status, 200);
  const candidateSecondApproveResponse = await post({beatId: "H03-B03", decision: "approve", note: "candidate review test", candidatePropsSha256});
  assert.equal(candidateSecondApproveResponse.status, 200);
  const adoptionBlockedResponse = await post({action: "approve-adoption", confirm: true, candidatePropsSha256});
  assert.equal(adoptionBlockedResponse.status, 409);
  const adoptionBlockedPayload = await adoptionBlockedResponse.json();
  assert.equal(adoptionBlockedPayload.artworkAdoptionGate.blocked, true);
  assert.equal(adoptionBlockedPayload.artworkAdoptionGate.policyWarningCount, 0);

  const after = await route.GET();
  const afterPayload = await after.json();
  assert.equal(afterPayload.ledger.summary.reviseCount, 0);
  assert.equal(afterPayload.ledger.summary.pendingCount, 0);
  assert.equal(afterPayload.generatedArtworkReview.summary.approvedCount, 1);

  // A new review report with the same candidate props is still a new review surface.
  // The API must fail closed instead of carrying decisions across the report boundary.
  const candidateReportPath = path.join(tempRoot, candidateReportRelative);
  const candidateReport = JSON.parse(fs.readFileSync(candidateReportPath, "utf8"));
  candidateReport.generatedAt = "2026-07-29T00:00:00.000Z";
  fs.writeFileSync(candidateReportPath, `${JSON.stringify(candidateReport, null, 2)}\n`, "utf8");
  const stale = await route.GET();
  assert.equal(stale.status, 200);
  const stalePayload = await stale.json();
  assert.equal(stalePayload.ledger.summary.reviewedCount, 0);
  assert.equal(stalePayload.ledger.summary.pendingCount, 2);
  assert.equal(stalePayload.revisionQueue.summary.openCount, 0);
  assert.equal(stalePayload.adoptionApproval.status, "PENDING_USER_VISUAL_REVIEW");
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  if (previousRoot === undefined) delete process.env.A1_H_SERIES_REVIEW_ROOT;
  else process.env.A1_H_SERIES_REVIEW_ROOT = previousRoot;
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", cases: {candidateLedgerAndArtworkLedgerAreSeparate: failures.length === 0, reportHashChangeClearsCandidateDecisions: failures.length === 0, adoptionBlockedByArtworkPolicy: failures.length === 0, riskyArtworkCannotBeApproved: failures.length === 0}, failures}, null, 2));
if (failures.length) process.exitCode = 1;
