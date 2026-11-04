#!/usr/bin/env node
import fs from "node:fs";
import {
  buildA1HSeriesGeneratedArtworkExecutionPlan,
  auditA1HSeriesGeneratedArtworkExecutionPlan,
} from "../apps/studio-next/src/lib/a1-h-series-generated-artwork-execution-plan.mjs";

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const decision = readJson(`${root}/apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-decision-v1/report.json`);
const repairBrief = readJson(`${root}/apps/studio-next/public/generated/system-line/h-series-generated-artwork-repair-brief-v1/report.json`);
const candidateProps = readJson(`${root}/apps/studio-next/public/generated/system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json`);
const candidateBeatIds = candidateProps.scenes.map((scene) => scene.beatId);
const candidatePropsSha256 = repairBrief.sourceBinding.candidatePropsSha256;
const selectedBeatIds = new Set(decision.decisions.filter((item) => item.decision === "selected-for-generation").map((item) => item.beatId));

function ledger(decisionByBeat, binding = candidatePropsSha256) {
  const decisions = candidateBeatIds.map((beatId, index) => ({
    order: index + 1,
    beatId,
    decision: decisionByBeat(beatId, index),
    note: "gate test",
    reviewedAt: "2026-07-29T00:00:00.000Z",
  }));
  const approvedCount = decisions.filter((item) => item.decision === "approve").length;
  const reviseCount = decisions.filter((item) => item.decision === "revise").length;
  return {
    contract: "A1HSeriesVisualReviewDecisionLedger/v1",
    status: "READY_FOR_EXPLICIT_ADOPTION_APPROVAL",
    candidatePropsSha256: binding,
    summary: {candidateCount: 47, reviewedCount: 47, pendingCount: 0, approvedCount, reviseCount},
    decisions,
  };
}

function planFor(reviewLedger) {
  return buildA1HSeriesGeneratedArtworkExecutionPlan({decision, repairBrief, reviewLedger, reviewLedgerCandidatePropsSha256: candidatePropsSha256});
}

const failures = [];
const pending = buildA1HSeriesGeneratedArtworkExecutionPlan({decision, repairBrief, reviewLedger: null, reviewLedgerCandidatePropsSha256: candidatePropsSha256});
if (pending.generationDispatchAllowed !== false || pending.summary.pendingReviewCount !== 47 || pending.nextAction !== "complete-47-shot-visual-review-before-generation") failures.push("pending-review-must-block");

const revisedBeatId = [...selectedBeatIds][0];
const revised = planFor(ledger((beatId) => beatId === revisedBeatId ? "revise" : "approve"));
if (revised.generationDispatchAllowed !== false || revised.summary.reviseShotCount !== 1 || revised.nextAction !== "repair-revise-shots-and-review-again-before-generation") failures.push("revise-shot-must-block");
if (revised.jobs.find((job) => job.beatId === revisedBeatId)?.repairBriefStatus !== "revise-required") failures.push("revise-status-must-bind");

const approved = planFor(ledger(() => "approve"));
if (approved.generationDispatchAllowed !== true || approved.summary.allGenerationJobsUserApproved !== true || approved.jobs.some((job) => job.dispatchAllowed !== true)) failures.push("all-approved-must-unlock");
if (auditA1HSeriesGeneratedArtworkExecutionPlan(approved).status !== "PASS") failures.push("approved-plan-audit-must-pass");

const stale = planFor(ledger(() => "approve", "stale-props-sha256"));
if (stale.generationDispatchAllowed !== false || stale.summary.reviewLedgerBindingValid !== false) failures.push("stale-ledger-must-block");

console.log(JSON.stringify({status: failures.length ? "FAIL" : "PASS", cases: {pending: pending.nextAction, revised: revised.nextAction, approved: approved.nextAction, stale: stale.nextAction}, failures}, null, 2));
if (failures.length) process.exitCode = 1;
