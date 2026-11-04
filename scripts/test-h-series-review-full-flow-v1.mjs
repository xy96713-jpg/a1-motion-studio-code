#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-h-series-review-full-flow-"));
const candidateReportRelative = "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/report.json";
const candidateLedgerRelative = "apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/review-decisions.json";
const artworkPolicyRelative = "apps/studio-next/public/generated/system-line/h-series-generated-artwork-policy-v1/report.json";
const artworkResultRelative = "apps/studio-next/public/generated/system-line/h-series-generated-artwork-repair-result-v1/report.json";
const artworkLedgerRelative = "apps/studio-next/public/generated/system-line/h-series-generated-artwork-repair-result-v1/review-decisions.json";
const executionPlanRelative = "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-execution-plan-v1/report.json";
const candidatePropsSha256 = "a".repeat(64);
const executionPlanSha256 = "b".repeat(64);
const beatIds = "H01-B01,H01-B02,H01-B03,H01-B04,H02-B01,H02-B02,H02-B03,H03-B01,H03-B02,H03-B03,H04-B01,H04-B02,H04-B03,H04-B04,H05-B01,H05-B02,H05-B03,H05-B04,H06-B01,H06-B02,H07-B01,H07-B02,H07-B03,H07-B04,H07-B05,H07-B06,H08-B01,H08-B02,H08-B03,H08-B04,H08-B05,H08-B06,H09-B01,H09-B02,H09-B03,H09-B04,H09-B05,H09-B06,H09-B07,H10-B01,H10-B02,H10-B03,H10-B04,H10-B05,H11-B01,H11-B02,H11-B03".split(",");
const candidateArtworkBeatIds = ["H03-B02", "H03-B03", "H05-B03", "H05-B04", "H10-B04", "H11-B02", "H11-B03"];

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
  summary: {generatedArtworkPendingVisualReviewCount: candidateArtworkBeatIds.length},
  generatedArtworkReview: {
    candidateGeneratedArtworkBeatIds: ["H03-B02", "H03-B03", "H05-B03", "H10-B04", "H11-B03"],
    candidateLegacyArtworkBeatIds: ["H05-B04", "H11-B02"],
  },
  reviewLedger: {items: beatIds.map((beatId, index) => ({order: index + 1, beatId}))},
});
writeJson(artworkPolicyRelative, {
  contract: "A1HSeriesGeneratedArtworkPolicyAudit/v1",
  status: "WARN_PENDING_HUMAN_VISUAL_REVIEW",
  summary: {warningCount: 1, failureCount: 0, adoptionBlockedByPolicyRisk: true},
  items: [{beatId: "H10-B04", visualRisk: "forbidden-line-primitive", failures: ["suspected-decorative-dashed-line"]}],
});
writeJson(executionPlanRelative, {status: "READY_FOR_GENERATION"});

const previousRoot = process.env.A1_H_SERIES_REVIEW_ROOT;
const failures = [];
try {
  process.env.A1_H_SERIES_REVIEW_ROOT = tempRoot;
  const route = await import("../apps/studio-next/src/app/api/system-line/h-series-review/route.ts");
  const post = (payload) => route.POST(new Request("http://127.0.0.1:4311/api/system-line/h-series-review", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(payload)}));
  const initial = await route.GET();
  assert.equal(initial.status, 200);
  const initialPayload = await initial.json();
  assert.equal(initialPayload.ledger.summary.pendingCount, 47);
  assert.equal(initialPayload.artworkAdoptionGate.pendingGeneratedArtworkReviewCount, 7);

  const blockedApprove = await post({beatId: "H10-B04", decision: "approve", candidatePropsSha256});
  assert.equal(blockedApprove.status, 409);

  for (const beatId of beatIds) {
    if (beatId === "H10-B04" || beatId === "H11-B03") {
      const reviseResponse = await post({beatId, decision: "revise", note: "policy-risk fixture", candidatePropsSha256});
      assert.equal(reviseResponse.status, 200, `candidate revise failed: ${beatId}`);
      continue;
    }
    const response = await post({beatId, decision: "approve", note: "full-flow fixture", candidatePropsSha256});
    assert.equal(response.status, 200, `candidate approve failed: ${beatId}`);
  }
  let afterCandidateReview = await route.GET();
  let afterCandidatePayload = await afterCandidateReview.json();
  assert.equal(afterCandidatePayload.ledger.summary.pendingCount, 0);
  assert.equal(afterCandidatePayload.ledger.summary.reviseCount, 2);
  assert.equal(afterCandidatePayload.artworkAdoptionGate.pendingGeneratedArtworkReviewCount, 0);
  assert.equal(afterCandidatePayload.artworkAdoptionGate.blocked, true);

  const resultBeatIds = ["H10-B04", "H11-B03"];
  writeJson(artworkResultRelative, {
    contract: "A1HSeriesGeneratedArtworkRepairResultManifest/v1",
    status: "GENERATED_PENDING_VISUAL_REVIEW",
    reviewOnly: true,
    rendererAdoptionAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    source: {executionPlanSha256},
    assets: resultBeatIds.map((beatId) => ({beatId, publicUrl: `/generated/system-line/generated-artwork-assets/${beatId}-repair.png`, sha256: "c".repeat(64)})),
  });
  const repairBlocked = await post({action: "approve-adoption", confirm: true, candidatePropsSha256});
  assert.equal(repairBlocked.status, 409);
  const repairBlockedPayload = await repairBlocked.json();
  assert.equal(repairBlockedPayload.artworkAdoptionGate.pendingGeneratedArtworkReviewCount, 2);

  for (const beatId of resultBeatIds) {
    const response = await post({action: "review-generated-artwork", beatId, decision: "approve", note: "repair result reviewed", executionPlanSha256});
    assert.equal(response.status, 200, `repair review failed: ${beatId}`);
  }
  const ready = await route.GET();
  const readyPayload = await ready.json();
  assert.equal(readyPayload.ledger.summary.pendingCount, 0);
  assert.equal(readyPayload.artworkAdoptionGate.pendingGeneratedArtworkReviewCount, 0);
  assert.equal(readyPayload.artworkAdoptionGate.blocked, false);
  assert.equal(readyPayload.generatedArtworkReview.summary.pendingCount, 0);

  for (const beatId of resultBeatIds) {
    const response = await post({beatId, decision: "approve", note: "replacement result accepted", candidatePropsSha256});
    assert.equal(response.status, 200, `replacement candidate approve failed: ${beatId}`);
  }

  const adopted = await post({action: "approve-adoption", confirm: true, candidatePropsSha256});
  assert.equal(adopted.status, 200, JSON.stringify(await adopted.clone().json()));
  const adoptedPayload = await adopted.json();
  assert.equal(adoptedPayload.adoptionApproval.status, "APPROVED_FOR_ADOPTION");
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, candidateLedgerRelative), "utf8")).decisions.length, 47);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, artworkLedgerRelative), "utf8")).decisions.length, 2);
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (previousRoot === undefined) delete process.env.A1_H_SERIES_REVIEW_ROOT;
  else process.env.A1_H_SERIES_REVIEW_ROOT = previousRoot;
  fs.rmSync(tempRoot, {recursive: true, force: true});
}

console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", cases: {all47CandidateDecisionsReachArtworkGate: failures.length === 0, repairArtworkPendingBlocksAdoption: failures.length === 0, allRepairArtworkReviewsClearGate: failures.length === 0, explicitAdoptionCompletes: failures.length === 0}, failures}, null, 2));
if (failures.length) process.exitCode = 1;
