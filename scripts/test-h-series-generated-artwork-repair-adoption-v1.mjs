#!/usr/bin/env node
import {
  buildA1HSeriesGeneratedArtworkRepairAdoptionPlan,
  auditA1HSeriesGeneratedArtworkRepairAdoptionPlan,
} from "../apps/studio-next/src/lib/a1-h-series-generated-artwork-repair-adoption.mjs";

const beatIds = ["H03-B02", "H03-B03"];
const manifestSha = "a".repeat(64);
const executionPlanSha = "b".repeat(64);
const candidateProps = {
  contract: "A1MicrobeatLayeredFullPlan/v1",
  projectId: "july1-writing-workbench",
  scenes: beatIds.map((beatId) => ({beatId, screenText: beatId, layers: [{kind: "foreground-subject", asset: `old/${beatId}.png`, assetSha256: "0".repeat(64), editable: false, motion: {action: "old"}}]})),
};
const resultManifest = {
  contract: "A1HSeriesGeneratedArtworkRepairResultManifest/v1",
  status: "GENERATED_PENDING_VISUAL_REVIEW",
  reviewOnly: true,
  rendererAdoptionAllowed: false,
  finalRenderAllowed: false,
  source: {executionPlanSha256: executionPlanSha},
  assets: beatIds.map((beatId) => ({beatId, localPath: `apps/studio-next/public/generated/system-line/generated-artwork-assets/${beatId}-repair.png`, publicUrl: `/generated/system-line/generated-artwork-assets/${beatId}-repair.png`, sha256: "c".repeat(64)})),
};
const ledger = (decisions, resultSha = manifestSha) => ({contract: "A1HSeriesGeneratedArtworkReviewLedger/v1", resultManifestSha256: resultSha, executionPlanSha256: executionPlanSha, status: decisions.length === beatIds.length ? "READY_FOR_EXPLICIT_ADOPTION_APPROVAL" : "PENDING_USER_VISUAL_REVIEW", summary: {candidateCount: beatIds.length, reviewedCount: decisions.length, pendingCount: beatIds.length - decisions.length, approvedCount: decisions.filter((item) => item.decision === "approve").length, reviseCount: decisions.filter((item) => item.decision === "revise").length}, decisions});
const decision = (beatId, value) => ({order: beatIds.indexOf(beatId) + 1, beatId, decision: value, note: "test", reviewedAt: "2026-07-29T00:00:00.000Z"});
const failures = [];
const build = (reviewLedger, manifest = resultManifest, executionPlan = null) => buildA1HSeriesGeneratedArtworkRepairAdoptionPlan({candidateProps, candidatePropsSha256: "d".repeat(64), resultManifest: manifest, resultManifestSha256: manifest === resultManifest ? manifestSha : "e".repeat(64), reviewLedger, executionPlan});

const missing = build(null, null);
if (missing.status !== "WAITING_FOR_GENERATED_ARTWORK_RESULT" || auditA1HSeriesGeneratedArtworkRepairAdoptionPlan(missing).status !== "PASS") failures.push("missing-result-must-block");
const gatedMissing = build(null, null, {status: "WAITING_FOR_USER_VISUAL_DECISIONS", generationDispatchAllowed: false, nextAction: "complete-47-shot-visual-review-before-generation"});
if (gatedMissing.nextAction !== "complete-47-shot-visual-review-before-generation") failures.push("adoption-plan-must-follow-earliest-generation-gate");
const pending = build(ledger([decision("H03-B02", "approve")]));
if (pending.status !== "WAITING_FOR_GENERATED_ARTWORK_REVIEW" || pending.summary.pendingAssetCount !== 1) failures.push("pending-result-review-must-block");
const revised = build(ledger([decision("H03-B02", "approve"), decision("H03-B03", "revise")]));
if (revised.status !== "REPAIR_REQUIRED" || revised.summary.reviseAssetCount !== 1) failures.push("revise-result-review-must-block");
const ready = build(ledger([decision("H03-B02", "approve"), decision("H03-B03", "approve")]));
if (ready.status !== "READY_FOR_EXPLICIT_APPROVAL" || ready.summary.adoptedAssetCount !== 2 || ready.summary.changedSceneCount !== 2 || ready.adoptionItems.some((item) => item.rendererAsset.startsWith("/")) || auditA1HSeriesGeneratedArtworkRepairAdoptionPlan(ready).status !== "PASS") failures.push("all-approved-result-review-must-build-plan-only-candidate");
const stale = build(ledger([decision("H03-B02", "approve"), decision("H03-B03", "approve")], "z".repeat(64)));
if (stale.status !== "WAITING_FOR_GENERATED_ARTWORK_REVIEW" || stale.source?.ledgerBindingValid !== false) failures.push("stale-result-review-must-block");

console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", cases: {missing: missing.status, pending: pending.status, revised: revised.status, ready: ready.status, stale: stale.status}, failures}, null, 2));
if (failures.length) process.exitCode = 1;
