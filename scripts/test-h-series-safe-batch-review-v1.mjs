#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-h-series-safe-batch-review-"));
const candidateReportRelative = "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/report.json";
const candidateLedgerRelative = "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/review-decisions.json";
const visualFixQueueRelative = "apps/studio-next/public/generated/system-line/h-series-semantic-directed-visual-fix-queue-v1/report.json";
const artworkPolicyRelative = "apps/studio-next/public/generated/system-line/h-series-generated-artwork-policy-v1/report.json";
const beatIds = ["H01-B01", "H01-B02", "H01-B03", "H02-B01", "H02-B02", "H02-B03"];
const candidatePropsSha256 = "a".repeat(64);
const sourcePropsSha256 = "b".repeat(64);
const artworkManifestSha256 = "c".repeat(64);

function writeJson(relativePath, value) {
  const filePath = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  sourceBinding: {
    candidateProps: {sha256: candidatePropsSha256},
    sourceProps: {sha256: sourcePropsSha256},
    generatedArtworkManifestSha256: artworkManifestSha256,
  },
  generatedArtworkReview: {candidateGeneratedArtworkBeatIds: ["H02-B02"]},
  reviewLedger: {items: beatIds.map((beatId, index) => ({order: index + 1, beatId}))},
});

writeJson(visualFixQueueRelative, {
  contract: "A1HSeriesSemanticDirectedVisualFixQueue/v1",
  status: "PASS",
  reviewOnly: true,
  finalRenderAllowed: false,
  source: {propsSha256: sourcePropsSha256},
  summary: {sceneCount: beatIds.length},
  targetItems: [{beatId: "H02-B01"}],
});

writeJson(artworkPolicyRelative, {
  contract: "A1HSeriesGeneratedArtworkPolicyAudit/v1",
  status: "WARN_PENDING_HUMAN_VISUAL_REVIEW",
  reviewOnly: true,
  finalRenderAllowed: false,
  source: {manifestSha256: artworkManifestSha256},
  summary: {warningCount: 1, failureCount: 0},
  items: [{beatId: "H02-B03", visualRisk: "forbidden-line-primitive", failures: ["suspected-decorative-dashed-line"]}],
});

const previousRoot = process.env.A1_H_SERIES_REVIEW_ROOT;
const failures = [];
try {
  process.env.A1_H_SERIES_REVIEW_ROOT = tempRoot;
  const route = await import("../apps/studio-next/src/app/api/system-line/h-series-review/route.ts");
  const post = (payload) => route.POST(new Request("http://127.0.0.1:4311/api/system-line/h-series-review", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(payload),
  }));

  const initialResponse = await route.GET();
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  assert.equal(initial.reviewTriage.status, "READY_FOR_EXPLICIT_SAFE_BATCH_REVIEW");
  assert.deepEqual(initial.reviewTriage.safeBeatIds, ["H01-B01", "H01-B02", "H01-B03"]);
  assert.deepEqual(initial.reviewTriage.attentionItems.map((item) => item.beatId), ["H02-B01", "H02-B02", "H02-B03"]);
  assert.equal(initial.reviewTriage.summary.safeCount, 3);
  assert.equal(initial.reviewTriage.summary.attentionCount, 3);

  const singleRevise = await post({beatId: "H01-B02", decision: "revise", note: "keep this explicit decision", candidatePropsSha256});
  assert.equal(singleRevise.status, 200);

  const missingConfirmation = await post({
    action: "approve-safe-batch",
    candidatePropsSha256,
    candidateReportSha256: initial.reviewTriage.candidateReportSha256,
    triageBindingSha256: initial.reviewTriage.triageBindingSha256,
  });
  assert.equal(missingConfirmation.status, 400);

  const batchResponse = await post({
    action: "approve-safe-batch",
    confirm: true,
    candidatePropsSha256,
    candidateReportSha256: initial.reviewTriage.candidateReportSha256,
    triageBindingSha256: initial.reviewTriage.triageBindingSha256,
  });
  assert.equal(batchResponse.status, 200);
  const batch = await batchResponse.json();
  assert.deepEqual(batch.approvedBeatIds, ["H01-B01", "H01-B03"]);
  assert.equal(batch.ledger.summary.reviewedCount, 3);
  assert.equal(batch.ledger.summary.approvedCount, 2);
  assert.equal(batch.ledger.summary.reviseCount, 1);
  assert.equal(batch.ledger.summary.pendingCount, 3);
  assert.equal(batch.reviewTriage.summary.attentionPendingCount, 3);

  const persisted = JSON.parse(fs.readFileSync(path.join(tempRoot, candidateLedgerRelative), "utf8"));
  assert.equal(persisted.decisions.find((item) => item.beatId === "H01-B02").decision, "revise");
  assert.equal(persisted.decisions.find((item) => item.beatId === "H01-B02").decisionMode, "single-shot");
  const batchDecisions = persisted.decisions.filter((item) => item.decisionMode === "safe-batch");
  assert.equal(batchDecisions.length, 2);
  assert.ok(batchDecisions.every((item) => item.triageBindingSha256 === initial.reviewTriage.triageBindingSha256));

  const idempotentResponse = await post({
    action: "approve-safe-batch",
    confirm: true,
    candidatePropsSha256,
    candidateReportSha256: batch.reviewTriage.candidateReportSha256,
    triageBindingSha256: batch.reviewTriage.triageBindingSha256,
  });
  assert.equal(idempotentResponse.status, 200);
  const idempotent = await idempotentResponse.json();
  assert.deepEqual(idempotent.approvedBeatIds, []);
  assert.equal(idempotent.ledger.decisions.length, 3);

  writeJson(visualFixQueueRelative, {
    contract: "A1HSeriesSemanticDirectedVisualFixQueue/v1",
    status: "PASS",
    reviewOnly: true,
    finalRenderAllowed: false,
    source: {propsSha256: sourcePropsSha256},
    summary: {sceneCount: beatIds.length},
    targetItems: [{beatId: "H01-B01"}, {beatId: "H02-B01"}],
  });
  const staleResponse = await post({
    action: "approve-safe-batch",
    confirm: true,
    candidatePropsSha256,
    candidateReportSha256: batch.reviewTriage.candidateReportSha256,
    triageBindingSha256: batch.reviewTriage.triageBindingSha256,
  });
  assert.equal(staleResponse.status, 409);

  const refreshedResponse = await route.GET();
  const refreshed = await refreshedResponse.json();
  assert.equal(refreshed.reviewTriage.summary.attentionCount, 4);
  assert.equal(refreshed.ledger.summary.reviewedCount, 1);
  assert.equal(refreshed.ledger.summary.pendingCount, 5);
  assert.equal(refreshed.ledger.decisions[0].beatId, "H01-B02");
  assert.equal(refreshed.ledger.decisions[0].decision, "revise");
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (previousRoot === undefined) delete process.env.A1_H_SERIES_REVIEW_ROOT;
  else process.env.A1_H_SERIES_REVIEW_ROOT = previousRoot;
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

console.log(JSON.stringify({
  status: failures.length ? "FAIL" : "PASS",
  cases: {
    triageIsDerivedFromCurrentRiskSources: failures.length === 0,
    explicitConfirmationIsRequired: failures.length === 0,
    existingSingleShotDecisionIsPreserved: failures.length === 0,
    pendingSafeShotsOnlyAreApproved: failures.length === 0,
    repeatedBatchIsIdempotent: failures.length === 0,
    changedTriageInvalidatesBatchDecisions: failures.length === 0,
  },
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
