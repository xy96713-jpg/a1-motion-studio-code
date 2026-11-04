#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {
  applyLookMasterPortfolioAudit,
  assertLookMasterPortfolioAudit,
  buildLookMasterPortfolioAudit,
  buildSupplementalLookMasterPrompt,
  effectiveDirectionBudget,
  reopenPackageLookMasterForDiversity,
} from "../apps/studio-next/src/lib/a1-look-master-portfolio-v1.mjs";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
// This fixture exercises the retired user-approval compatibility path.  The
// active workspace policy is intentionally removed so the test cannot mistake
// history behavior for the live batch-ranked controller.
const {activePackagingPolicy: _activePackagingPolicy, ...legacyRuntime} = workspace.production.shotIntelligence;
const runtime = legacyRuntime;

assert.equal(effectiveDirectionBudget({familyMaturity: "mature"}), 2);
assert.equal(effectiveDirectionBudget({familyMaturity: "ordinary"}), 3);
assert.equal(effectiveDirectionBudget({firstRealCalibration: true}), 4);

const legacyInput = structuredClone(runtime);
const legacyInputPlan = legacyInput.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
legacyInputPlan.selectedLookMasterBinding = null;
legacyInputPlan.comparativeReview = null;
legacyInputPlan.recommendation = null;
const reopened = reopenPackageLookMasterForDiversity(legacyInput, {shotId: "ED-10", now: "2026-08-04T15:00:00.000Z"});
const plan = reopened.runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const kit = reopened.runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
assert.equal(reopened.runtime.status, "LOOK_MASTER_CANDIDATES_READY");
assert.equal(plan.reviewDecision.status, "REVIEW_REOPENED");
assert.equal(plan.reviewDecision.status, "REVIEW_REOPENED");
assert.equal(plan.reviewDecision.reason, "SUPERSEDED_BY_USER_DIVERSITY_FEEDBACK");
assert.equal(plan.effectiveDirectionBudget, 4);
assert.equal(plan.portfolioPolicy.duplicateCandidatesDoNotCount, true);
assert.equal(plan.supplementalCandidateDirections.length, 2);
assert.equal(new Set(plan.supplementalCandidateDirections.map((item) => item.primaryFamily)).size, 2);
assert.equal(kit.status, "WAITING_FOR_LOOK_MASTER");
assert.equal(kit.selectedLookMasterBinding, null);
assert.equal(reopened.runtime.queuePolicy.workerStatus, "frozen");

const [signalDirection, overlayDirection] = plan.supplementalCandidateDirections;
const signalPrompt = buildSupplementalLookMasterPrompt(plan, signalDirection);
const overlayPrompt = buildSupplementalLookMasterPrompt(plan, overlayDirection);
assert.match(signalPrompt, /scanline-crt-signal/);
assert.match(signalPrompt, /Hard avoid: cream-paper/);
assert.match(overlayPrompt, /COEXIST_WITH_BASE_VIDEO/);
assert.match(overlayPrompt, /Preserve the real subject and negative space/);
assert.notEqual(signalDirection.fingerprint, overlayDirection.fingerprint);

const fixtureDir = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/test-look-master-portfolio-v1");
fs.mkdirSync(fixtureDir, {recursive: true});
const signalFile = path.join(fixtureDir, "signal.png");
const overlayFile = path.join(fixtureDir, "overlay.png");
await sharp({create: {width: 960, height: 540, channels: 4, background: {r: 8, g: 12, b: 18, alpha: 1}}})
  .composite(Array.from({length: 24}, (_, index) => ({input: Buffer.from(`<svg width="960" height="2"><rect width="960" height="2" fill="${index % 2 ? "#f4f0e4" : "#e8513d"}"/></svg>`), left: 0, top: 14 + index * 20})))
  .png().toFile(signalFile);
await sharp({create: {width: 960, height: 540, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
  .composite([{input: Buffer.from('<svg width="260" height="220"><path d="M20 30h190v28H90v40h150v35H65v52H20z" fill="#c9ef39"/><rect x="205" y="165" width="34" height="34" fill="#fff"/></svg>'), left: 650, top: 45}])
  .png().toFile(overlayFile);
const fileSha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const supplementalRaws = [
  {direction: signalDirection, file: signalFile, id: "portfolio-test-signal", score: 22},
  {direction: overlayDirection, file: overlayFile, id: "portfolio-test-overlay", score: 24},
].map(({direction, file, id, score}) => ({
  contract: "A1PackageLookMasterRaw/v1",
  referenceId: id,
  shotId: "ED-10",
  eventId: plan.eventId,
  planSha256: plan.planSha256,
  styleBriefSha256: plan.styleBriefSha256,
  candidateDirectionId: direction.directionId,
  directionFingerprint: direction.fingerprint,
  artifact: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/test-look-master-portfolio-v1/${path.basename(file)}`, sha256: fileSha(file), width: 960, height: 540, workspaceImported: true},
  pixelAudit: {status: "PASS", totalScore: score},
  serverVisualAssessment: {status: "PASS", totalScore: score},
  packagingIntent: direction.packagingIntent,
}));
const runtimeWithSupplemental = structuredClone(reopened.runtime);
const retainedEd10ByDirection = new Map();
const currentBaseDirectionIds = new Set((plan.candidateDirections || []).map((item) => item.directionId));
for (const raw of runtimeWithSupplemental.lookMasterRawReferences) {
  if (raw.shotId !== "ED-10" || !currentBaseDirectionIds.has(raw.candidateDirectionId)) continue;
  if (!retainedEd10ByDirection.has(raw.candidateDirectionId)) retainedEd10ByDirection.set(raw.candidateDirectionId, raw);
}
runtimeWithSupplemental.lookMasterRawReferences = [
  ...runtimeWithSupplemental.lookMasterRawReferences.filter((raw) => raw.shotId !== "ED-10"),
  ...retainedEd10ByDirection.values(),
];
runtimeWithSupplemental.lookMasterRawReferences.push(...supplementalRaws);
const planWithCandidates = runtimeWithSupplemental.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
for (const raw of supplementalRaws) {
  const direction = planWithCandidates.supplementalCandidateDirections.find((item) => item.directionId === raw.candidateDirectionId);
  planWithCandidates.candidates.push({
    candidateId: `look-master-ed-10-${direction.directionId}`,
    candidateSha256: crypto.createHash("sha256").update(`candidate:${direction.directionId}`).digest("hex"),
    status: "AUDITED",
    admission: {status: "PASS", failures: []},
    artifact: raw.artifact,
    candidateDirection: direction,
    packagingIntent: direction.packagingIntent,
    auditArtifact: {totalScore: raw.serverVisualAssessment.totalScore, auditSha256: crypto.createHash("sha256").update(`audit:${direction.directionId}`).digest("hex"), serverVisualAssessmentSha256: crypto.createHash("sha256").update(`review:${direction.directionId}`).digest("hex"), compositePreview: {publicUrl: raw.artifact.publicUrl, sha256: raw.artifact.sha256}, footageCompatibility: {status: "PASS"}},
  });
}

const audit = await buildLookMasterPortfolioAudit({plan: planWithCandidates, rawReferences: runtimeWithSupplemental.lookMasterRawReferences, publicRoot, now: "2026-08-04T15:00:01.000Z"});
assertLookMasterPortfolioAudit(audit);
assert.equal(audit.rawCandidateCount, retainedEd10ByDirection.size + supplementalRaws.length);
assert.equal(audit.effectiveDirectionCount, 3);
assert.equal(audit.status, "SUPPLEMENTAL_DIRECTIONS_REQUIRED");
assert.ok(audit.duplicateDirectionIds.includes("direction-01"), "same cream-paper/cobalt/giant-glyph direction must not count twice");
assert.ok(audit.pairwiseComparisons.some((pair) => pair.classification === "DUPLICATE_FAMILY"), "pairwise portfolio audit must catch high-scoring same-family candidates");

const applied = applyLookMasterPortfolioAudit(runtimeWithSupplemental, audit, {now: "2026-08-04T15:00:02.000Z"});
assert.equal(applied.runtime.status, "LOOK_MASTER_CANDIDATES_READY");
assert.equal(applied.runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10").status, "CANDIDATES_PARTIAL");
assert.equal(applied.runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10").recommendation, null);
assert.equal(applied.runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10").status, "WAITING_FOR_LOOK_MASTER");

console.log(JSON.stringify({status: "PASS", auditedOutcome: audit.status, rawCandidateCount: audit.rawCandidateCount, effectiveDirectionCount: audit.effectiveDirectionCount, duplicateDirectionIds: audit.duplicateDirectionIds}, null, 2));
