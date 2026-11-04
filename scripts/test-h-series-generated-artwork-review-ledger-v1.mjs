#!/usr/bin/env node
import {
  A1_H_SERIES_GENERATED_ARTWORK_REVIEW_LEDGER_CONTRACT,
  normalizeA1HSeriesGeneratedArtworkReviewLedger,
  auditA1HSeriesGeneratedArtworkReviewLedger,
} from "../apps/studio-next/src/lib/a1-h-series-generated-artwork-review.mjs";

const beatIds = ["H03-B02", "H03-B03", "H05-B03", "H05-B04", "H10-B04", "H11-B02", "H11-B03"];
const resultManifestSha256 = "a".repeat(64);
const executionPlanSha256 = "b".repeat(64);
const review = (decisions, manifest = resultManifestSha256, plan = executionPlanSha256) => normalizeA1HSeriesGeneratedArtworkReviewLedger({
  contract: A1_H_SERIES_GENERATED_ARTWORK_REVIEW_LEDGER_CONTRACT,
  resultManifestSha256: manifest,
  executionPlanSha256: plan,
  updatedAt: "2026-07-29T00:00:00.000Z",
  decisions,
}, manifest, plan, beatIds);
const entry = (beatId, decision, order = beatIds.indexOf(beatId) + 1) => ({order, beatId, decision, note: `${decision} note`, reviewedAt: "2026-07-29T00:00:00.000Z"});
const failures = [];
const audit = (ledger) => auditA1HSeriesGeneratedArtworkReviewLedger(ledger, {resultManifestSha256, executionPlanSha256, resultBeatIds: beatIds});

const pending = review([]);
if (pending.status !== "PENDING_USER_VISUAL_REVIEW" || pending.summary.pendingCount !== 7 || audit(pending).status !== "PASS") failures.push("empty-result-review-must-remain-pending");

const mixed = review([entry("H03-B02", "approve"), entry("H03-B03", "revise")]);
if (mixed.status !== "PENDING_USER_VISUAL_REVIEW" || mixed.summary.pendingCount !== 5 || mixed.summary.approvedCount !== 1 || mixed.summary.reviseCount !== 1 || audit(mixed).status !== "PASS") failures.push("mixed-result-review-must-preserve-revise-state");

const approved = review(beatIds.map((beatId) => entry(beatId, "approve")));
if (approved.status !== "READY_FOR_EXPLICIT_ADOPTION_APPROVAL" || approved.summary.pendingCount !== 0 || approved.summary.approvedCount !== 7 || approved.summary.reviseCount !== 0 || audit(approved).status !== "PASS") failures.push("all-approved-result-review-must-open-explicit-adoption-gate");

const stale = normalizeA1HSeriesGeneratedArtworkReviewLedger(approved, "c".repeat(64), executionPlanSha256, beatIds);
if (stale.summary.reviewedCount !== 0 || stale.summary.pendingCount !== 7 || stale.status !== "PENDING_USER_VISUAL_REVIEW" || auditA1HSeriesGeneratedArtworkReviewLedger(stale, {resultManifestSha256: "c".repeat(64), executionPlanSha256, resultBeatIds: beatIds}).status !== "PASS") failures.push("stale-result-manifest-must-clear-decisions");

const duplicateAndInvalid = review([entry("H03-B02", "approve"), entry("H03-B02", "revise"), entry("H03-B03", "invalid")]);
if (duplicateAndInvalid.summary.reviewedCount !== 1 || duplicateAndInvalid.summary.pendingCount !== 6 || duplicateAndInvalid.decisions[0]?.decision !== "approve") failures.push("invalid-or-duplicate-result-decisions-must-not-expand-ledger");

console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", cases: {pending: pending.summary, mixed: mixed.summary, approved: approved.summary, stale: stale.summary}, failures}, null, 2));
if (failures.length) process.exitCode = 1;
