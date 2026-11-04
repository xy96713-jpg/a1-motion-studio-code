#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir, publicDir} = projectDirs(appRoot);
const maturityRelativePath = path.join("golden-film-visual-system-maturity-v1", "maturity-run.json");
const maturityArtifactPath = path.join(artifactDir, maturityRelativePath);
const maturityPublicPath = path.join(publicDir, maturityRelativePath);
const repairPublicPath = path.join(publicDir, "incremental-repair-executor-v1", "repair-manifest.json");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const maturityArtifactBytes = fs.readFileSync(maturityArtifactPath);
const maturityPublicBytes = fs.readFileSync(maturityPublicPath);
assert.equal(sha256(maturityArtifactBytes), sha256(maturityPublicBytes), "artifact/public maturity manifest must be identical");
const maturity = readJson(maturityPublicPath);
const repair = readJson(repairPublicPath);
const {maturityRunSha256, ...maturityBody} = maturity;
const primitiveSwitchExhausted = maturity.overallStatus === "ED15_OVERLAY_PRIMITIVE_SWITCH_EXHAUSTED";
const taxonomyReauthorReady = maturity.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY";
const taxonomyReauthorExhausted = maturity.overallStatus === "ED15_OVERLAY_TAXONOMY_REAUTHOR_EXHAUSTED";
const currentNextAction = taxonomyReauthorReady
  ? "DISPATCH_ED15_OVERLAY_TAXONOMY_REAUTHOR_WAVE_MAX_2"
  : taxonomyReauthorExhausted
    ? "ACCEPT_ED15_NO_PACKAGE_OR_USER_REWRITE_SOURCE"
    : primitiveSwitchExhausted ? "REAUTHOR_ED15_OVERLAY_TAXONOMY_OR_ACCEPT_NO_PACKAGE" : "DISPATCH_ED15_DUAL_GAP_OVERLAY_REPAIR_WAVE_MAX_2";
assert.equal(sha256(maturityBody), maturityRunSha256, "maturity manifest self-hash must be stable");

assert.equal(maturity.contract, "A1GoldenFilmVisualSystemMaturityRun/v1");
assert.equal(maturity.maturityId, "GOLDEN_FILM_VISUAL_SYSTEM_MATURITY_V1");
// Current canonical closure: ED-15 is formally adjudicated as a
// NO_PACKAGE presenter beat, so the mature run has 13 PACKAGE shots and no
// generation-ready repair. Keep the historical assertions below for older
// archived runs while making the current contract executable.
if (["WHOLE_FILM_STATIC_BOARD", "READY_FOR_STATIC_BOARD_BUILD"].includes(maturity.overallStatus)) {
  const workspace = readProjectWorkspace(appRoot);
  const binding = workspace.production.creatorPaletteShotBindingManifest;
  const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
  const batch = workspace.production.shotIntelligence.wholeFilmBatchRecommendation;
  const currentRepair = workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  assert.deepEqual(Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])), {
    PHASE_0: "PASS",
    PHASE_1: "PASS",
    PHASE_2: "PASS",
    PHASE_3: "ZERO_COST_CLOSURE",
    PHASE_4: maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD" ? "PASS" : "READY_FOR_STATIC_BOARD_BUILD",
  });
  assert.equal(maturity.phases.PHASE_0.summary.packageCount, 13);
  assert.equal(maturity.phases.PHASE_0.summary.unknownCount, 0);
  assert.deepEqual(maturity.phases.PHASE_0.summary.generationReadyShotIds, []);
  assert.equal(maturity.phases.PHASE_0.summary.newGeneratedCount, 0);
  assert.equal(maturity.phases.PHASE_0.summary.reusedExistingCandidateCount, 13);
  assert.equal(maturity.phases.PHASE_1.summary.beatCount, 34);
  assert.equal(maturity.phases.PHASE_1.summary.packageCount, 13);
  assert.equal(maturity.phases.PHASE_1.summary.noPackageCount, 21);
  assert.equal(maturity.phases.PHASE_2.planModeConflicts.length, 0);
  assert.deepEqual(maturity.phases.PHASE_2.generationPreflight, []);
  assert.deepEqual(maturity.phases.PHASE_3.targetShotIds, []);
  assert.equal(maturity.phases.PHASE_3.generationAllowed, false);
  const currentWaveJobs = (workspace.production.generation.jobs || []).filter((job) => maturity.phases.PHASE_3.currentWaveJobIds.includes(job.id));
  const currentWaveGeneratedShas = [...new Set(currentWaveJobs.filter((job) => job.status === "complete" && job.output?.sha256).map((job) => job.output.sha256))].sort();
  assert.ok(currentWaveGeneratedShas.length > 0, "the completed bounded wave remains visible after zero-cost closure");
  assert.equal(maturity.phases.PHASE_3.generationDispatched, true);
  assert.deepEqual(maturity.phases.PHASE_3.newGeneratedShas, currentWaveGeneratedShas);
  assert.equal(maturity.phases.PHASE_4.boardRebuilt, maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD");
  assert.equal(maturity.phases.PHASE_4.status, maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD" ? "PASS" : "READY_FOR_STATIC_BOARD_BUILD");
  assert.equal(maturity.phases.PHASE_4.userApproval, false);
  assert.equal(maturity.imageLedger.newGeneratedCount, currentWaveGeneratedShas.length);
  assert.deepEqual(maturity.imageLedger.newGeneratedShas, currentWaveGeneratedShas);
  assert.equal(maturity.imageLedger.reusedExistingCandidateCount, 13);
  assert.equal(maturity.imageLedger.attemptedGeneratedCount, currentWaveGeneratedShas.length);
  assert.deepEqual(maturity.imageLedger.candidateShas, currentWaveGeneratedShas);
  assert.equal(maturity.imageLedger.adoptedGeneratedCount, 0);
  assert.equal(maturity.imageLedger.rejectedGeneratedCount + maturity.imageLedger.systemEligibleGeneratedCount, currentWaveGeneratedShas.length);
  assert.equal(maturity.imageLedger.pendingGeneratedCount + maturity.imageLedger.adoptedGeneratedCount, maturity.imageLedger.systemEligibleGeneratedCount);
  assert.equal(maturity.imageLedger.goodPngShaChanged, false);
  assert.equal(maturity.imageLedger.generationDispatched, true);
  assert.equal(maturity.runtimeFreeze.queue, 0);
  assert.equal(maturity.runtimeFreeze.running, 0);
  assert.equal(maturity.runtimeFreeze.workerStatus, "frozen");
  assert.equal(maturity.runtimeFreeze.assemblyCount, 0);
  assert.equal(maturity.runtimeFreeze.assemblyCreationAllowed, false);
  assert.equal(binding.status, "PASS");
  assert.equal(binding.passCount, 13);
  assert.deepEqual(binding.blockedShotIds, []);
  assert.equal(board.reviewScope, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(board.itemCount, 13);
  assert.equal(board.timelineBoard.itemCount, 34);
  if (maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD") {
    assert.equal(board.status, "PENDING_USER_APPROVAL");
    assert.equal(board.approvalAllowed, true);
  } else {
    assert.equal(board.status, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
    assert.equal(board.approvalAllowed, false);
  }
  assert.ok(["WHOLE_FILM_STATIC_BOARD", "WHOLE_FILM_STATIC_BOARD_READY", "READY_FOR_STATIC_BOARD_BUILD", "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED"].includes(batch.status));
  assert.equal(batch.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(batch.assemblyCreationAllowed, false);
  assert.equal(workspace.production.visualProductionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(workspace.production.authority.nextAction.id, maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD" ? "CONFIRM_WHOLE_FILM_STATIC_BOARD" : "REBUILD_WHOLE_FILM_STATIC_BOARD");
  assert.equal(workspace.production.authority.nextAction.requiresUser, maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD");
  assert.equal(workspace.production.packagingLifecycleProjection.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED");
  assert.deepEqual({packageCount: repair.summary.packageCount, noPackageCount: repair.summary.noPackageCount}, {packageCount: 13, noPackageCount: 21});
  assert.equal(maturity.systemRegression.status, "PASS");
  assert.ok(maturity.systemRegression.cases.every((item) => item.status === "PASS"));
  assert.equal(maturity.nextAction, maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD" ? "CONFIRM_WHOLE_FILM_STATIC_BOARD" : "REBUILD_WHOLE_FILM_STATIC_BOARD");
  assert.equal(maturity.inputHashes.bindingManifestSha256, binding.manifestSha256);
  assert.equal(repair.maturityAuthority?.maturityRunSha256, maturityRunSha256);
  assert.equal(repair.creatorPaletteShotBindingManifestSha256, binding.manifestSha256);
  assert.equal(workspace.production.incrementalRepairManifestAuthority.manifestSha256, repair.manifestSha256);
  assert.equal(maturity.inputHashes.boardSha256, board.sha256);
  console.log(JSON.stringify({
    status: "PASS",
    maturityRunSha256,
    phases: Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])),
    reusedExistingCandidateCount: maturity.imageLedger.reusedExistingCandidateCount,
    newGeneratedCount: maturity.imageLedger.newGeneratedCount,
    generationRequiredShotIds: maturity.phases.PHASE_0.summary.generationReadyShotIds,
    regressionCaseCount: maturity.systemRegression.cases.length,
    overallStatus: maturity.overallStatus,
  }, null, 2));
  process.exit(0);
}
// Current route recompile checkpoint: all Phase 0 classifications are
// deterministic, while three canonical mode changes still require a bounded
// generation wave.  This is ready-to-dispatch, not a worker dispatch.
if (maturity.overallStatus === "BLOCKED_BEFORE_GENERATION"
  && maturity.phases.PHASE_0.status === "PASS"
  && maturity.phases.PHASE_3.status === "READY") {
  const workspace = readProjectWorkspace(appRoot);
  const binding = workspace.production.creatorPaletteShotBindingManifest;
  const expectedGenerationTargets = [...binding.blockedShotIds].sort();
  assert.deepEqual(Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])), {
    PHASE_0: "PASS",
    PHASE_1: "PASS",
    PHASE_2: "PASS",
    PHASE_3: "READY",
    PHASE_4: "BLOCKED",
  });
  assert.equal(maturity.phases.PHASE_0.summary.packageCount, 13);
  assert.equal(maturity.phases.PHASE_0.summary.noPackageCount, 21);
  assert.equal(maturity.phases.PHASE_0.summary.unknownCount, 0);
  assert.deepEqual(maturity.phases.PHASE_0.summary.generationReadyShotIds, expectedGenerationTargets);
  assert.equal(maturity.phases.PHASE_0.summary.reusedExistingCandidateCount, binding.passCount);
  assert.equal(maturity.phases.PHASE_1.summary.beatCount, 34);
  assert.equal(maturity.phases.PHASE_1.summary.packageCount, 13);
  assert.equal(maturity.phases.PHASE_1.summary.noPackageCount, 21);
  assert.equal(maturity.phases.PHASE_2.planModeConflicts.length, 0);
  assert.deepEqual(maturity.phases.PHASE_2.generationPreflight.map((item) => item.shotId).sort(), expectedGenerationTargets);
  assert.ok(maturity.phases.PHASE_2.generationPreflight.every((item) => item.status === "PASS" && item.candidateCount === 2 && item.candidatePreflights.every((candidate) => candidate.status === "PASS" && candidate.attachmentPass === true && candidate.fullLookMasterPass === true && candidate.aestheticPass === true)));
  assert.deepEqual(maturity.phases.PHASE_3.targetShotIds, expectedGenerationTargets);
  assert.equal(maturity.phases.PHASE_3.generationAllowed, false);
  assert.equal(maturity.phases.PHASE_3.generationDispatched, false);
  assert.equal(maturity.phases.PHASE_4.boardRebuilt, false);
  assert.equal(maturity.phases.PHASE_4.userApproval, false);
  assert.equal(maturity.imageLedger.newGeneratedCount, 0);
  assert.deepEqual(maturity.imageLedger.newGeneratedShas, []);
  assert.equal(maturity.imageLedger.reusedExistingCandidateCount, binding.passCount);
  assert.equal(maturity.imageLedger.generationDispatched, false);
  assert.equal(maturity.imageLedger.goodPngShaChanged, false);
  assert.equal(maturity.runtimeFreeze.queue, 0);
  assert.equal(maturity.runtimeFreeze.running, 0);
  assert.equal(maturity.runtimeFreeze.workerStatus, "frozen");
  assert.equal(maturity.runtimeFreeze.assemblyCount, 0);
  assert.equal(maturity.runtimeFreeze.assemblyCreationAllowed, false);
  assert.equal(binding.status, "BLOCKED");
  assert.equal(binding.passCount + binding.blockedShotIds.length, 13);
  assert.deepEqual(binding.blockedShotIds, expectedGenerationTargets);
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED");
  assert.deepEqual({packageCount: repair.summary.packageCount, noPackageCount: repair.summary.noPackageCount, readyForGenerationCount: repair.summary.readyForGenerationCount}, {packageCount: 13, noPackageCount: 21, readyForGenerationCount: expectedGenerationTargets.length});
  assert.equal(maturity.systemRegression.status, "PASS");
  assert.ok(maturity.systemRegression.cases.every((item) => item.status === "PASS"));
  assert.equal(maturity.nextAction, "DISPATCH_BOUNDED_GENERATION_WAVE");
  assert.equal(maturity.inputHashes.bindingManifestSha256, binding.manifestSha256);
  assert.equal(repair.maturityAuthority?.maturityRunSha256, maturityRunSha256);
  assert.equal(workspace.production.incrementalRepairManifestAuthority.manifestSha256, repair.manifestSha256);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  console.log(JSON.stringify({
    status: "PASS",
    maturityRunSha256,
    phases: Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])),
    reusedExistingCandidateCount: maturity.imageLedger.reusedExistingCandidateCount,
    newGeneratedCount: maturity.imageLedger.newGeneratedCount,
    generationRequiredShotIds: maturity.phases.PHASE_0.summary.generationReadyShotIds,
    regressionCaseCount: maturity.systemRegression.cases.length,
    overallStatus: maturity.overallStatus,
  }, null, 2));
  process.exit(0);
}
// Current universal-reference wave checkpoint: one complete Look Master was
// produced and audited, while five provider attempts timed out. A system
// eligible candidate is pending user visual approval; it is not adopted.
if (maturity.overallStatus === "BLOCKED_TARGETED_GENERATION_WAVE") {
  const workspace = readProjectWorkspace(appRoot);
  const binding = workspace.production.creatorPaletteShotBindingManifest;
  const maturityAuthority = workspace.production.goldenFilmVisualSystemMaturity;
  assert.deepEqual(Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])), {
    PHASE_0: "PASS",
    PHASE_1: "PASS",
    PHASE_2: "PASS",
    PHASE_3: "ACTUAL_PIXEL_AUDIT_COMPLETE_WITH_REJECTIONS",
    PHASE_4: "BLOCKED",
  });
  assert.equal(maturity.phases.PHASE_0.summary.packageCount, 13);
  assert.equal(maturity.phases.PHASE_0.summary.noPackageCount, 21);
  assert.equal(maturity.phases.PHASE_0.summary.unknownCount, 0);
  assert.deepEqual(maturity.phases.PHASE_0.summary.generationReadyShotIds, ["ED-08", "ED-31", "ED-34"]);
  assert.equal(maturity.phases.PHASE_0.summary.reusedExistingCandidateCount, 10);
  assert.equal(maturity.phases.PHASE_1.summary.beatCount, 34);
  assert.equal(maturity.phases.PHASE_1.summary.packageCount, 13);
  assert.equal(maturity.phases.PHASE_1.summary.noPackageCount, 21);
  assert.equal(maturity.phases.PHASE_2.planModeConflicts.length, 0);
  assert.deepEqual(maturity.phases.PHASE_3.targetShotIds, ["ED-08", "ED-31", "ED-34"]);
  assert.equal(maturity.phases.PHASE_3.currentWaveJobIds.length, 6);
  assert.equal(maturity.phases.PHASE_3.generationAllowed, false);
  assert.equal(maturity.phases.PHASE_3.generationDispatched, true);
  assert.deepEqual(maturity.imageLedger.newGeneratedShas, ["8e357b24159aa2f9db78abf751ffd0dcaac1fa3a3e796a51efc392daa03d5990"]);
  assert.equal(maturity.imageLedger.newGeneratedCount, 1);
  assert.equal(maturity.imageLedger.attemptedGeneratedCount, 1);
  assert.equal(maturity.imageLedger.adoptedGeneratedCount, 0);
  assert.equal(maturity.imageLedger.rejectedGeneratedCount, 1);
  assert.equal(maturity.imageLedger.systemEligibleGeneratedCount, 0);
  assert.equal(maturity.imageLedger.pendingGeneratedCount, 0);
  assert.equal(maturity.imageLedger.referenceAttachmentAudit.currentWaveJobCount, 6);
  assert.equal(maturity.imageLedger.referenceAttachmentAudit.currentWaveCompletedJobCount, 1);
  assert.equal(maturity.imageLedger.referenceAttachmentAudit.currentWaveFailedJobCount, 5);
  assert.equal(maturity.imageLedger.referenceAttachmentAudit.currentWaveTimeoutJobCount, 5);
  assert.equal(maturity.imageLedger.referenceAttachmentAudit.currentWaveAdoptedGeneratedCount, 0);
  assert.equal(maturity.imageLedger.referenceAttachmentAudit.currentWaveSystemEligibleGeneratedCount, 0);
  assert.equal(maturity.imageLedger.referenceAttachmentAudit.currentWaveUserVisualApprovedCount, 0);
  assert.equal(maturity.imageLedger.goodPngShaChanged, false);
  assert.equal(maturity.runtimeFreeze.queue, 0);
  assert.equal(maturity.runtimeFreeze.running, 0);
  assert.equal(maturity.runtimeFreeze.workerStatus, "frozen");
  assert.equal(maturity.runtimeFreeze.assemblyCount, 0);
  assert.equal(maturity.runtimeFreeze.assemblyCreationAllowed, false);
  assert.equal(maturity.phases.PHASE_4.boardRebuilt, false);
  assert.equal(maturity.phases.PHASE_4.userApproval, false);
  assert.equal(binding.status, "BLOCKED");
  assert.equal(binding.passCount, 10);
  assert.deepEqual(binding.blockedShotIds, ["ED-08", "ED-31", "ED-34"]);
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED");
  assert.deepEqual({packageCount: repair.summary.packageCount, noPackageCount: repair.summary.noPackageCount, readyForGenerationCount: repair.summary.readyForGenerationCount}, {packageCount: 13, noPackageCount: 21, readyForGenerationCount: 3});
  assert.equal(repair.generationLedger.attemptedGeneratedCount, 1);
  assert.equal(repair.generationLedger.adoptedGeneratedCount, 0);
  assert.equal(repair.generationLedger.rejectedGeneratedCount, 1);
  assert.equal(repair.generationLedger.systemEligibleGeneratedCount, 0);
  assert.equal(repair.generationLedger.pendingGeneratedCount, 0);
  assert.equal(repair.generationLedger.referenceAttachmentAudit.currentWaveFailedJobCount, 5);
  assert.equal(repair.generationLedger.referenceAttachmentAudit.currentWaveTimeoutJobCount, 5);
  assert.equal(repair.generationLedger.candidateShas[0], "8e357b24159aa2f9db78abf751ffd0dcaac1fa3a3e796a51efc392daa03d5990");
  assert.equal(maturity.systemRegression.cases.find((item) => item.id === "UNIVERSAL_REFERENCE_ATTACHMENT_CONTRACT").status, "PASS");
  assert.equal(maturity.systemRegression.cases.find((item) => item.id === "GENERATION_LEDGER_DISTINGUISHES_ATTEMPTED_ADOPTED_REJECTED").status, "PASS");
  assert.equal(maturity.systemRegression.cases.filter((item) => item.status === "BLOCKED").map((item) => item.id).join(","), "PRESENTER_AWARE_OVERLAY");
  assert.equal(maturityAuthority.maturityRunSha256, maturityRunSha256);
  assert.equal(maturity.inputHashes.bindingManifestSha256, binding.manifestSha256);
  assert.equal(maturity.inputHashes.repairManifestSha256, repair.manifestSha256);
  assert.equal(workspace.production.incrementalRepairManifestAuthority.manifestSha256, repair.manifestSha256);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  console.log(JSON.stringify({
    status: "PASS",
    maturityRunSha256,
    phases: Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])),
    attemptedGeneratedCount: maturity.imageLedger.attemptedGeneratedCount,
    systemEligibleGeneratedCount: maturity.imageLedger.systemEligibleGeneratedCount,
    userVisualApprovedCount: maturity.imageLedger.adoptedGeneratedCount,
    failedJobCount: maturity.imageLedger.referenceAttachmentAudit.currentWaveFailedJobCount,
    regressionCaseCount: maturity.systemRegression.cases.length,
    overallStatus: maturity.overallStatus,
  }, null, 2));
  process.exit(0);
}

assert.deepEqual(Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])), {
  PHASE_0: "PASS",
  PHASE_1: "PASS",
  PHASE_2: "PASS",
  PHASE_3: primitiveSwitchExhausted || taxonomyReauthorExhausted ? "ACTUAL_PIXEL_AUDIT_WITH_REJECTIONS" : "READY",
  PHASE_4: "BLOCKED",
});

const phase0 = maturity.phases.PHASE_0;
assert.equal(phase0.summary.packageCount, 14);
assert.equal(phase0.summary.unknownCount, 0);
assert.deepEqual(phase0.summary.generationReadyShotIds, ["ED-15"]);
assert.equal(phase0.summary.newGeneratedCount, 0);
assert.equal(phase0.summary.reusedExistingCandidateCount, 13);
assert.deepEqual(phase0.results.filter((item) => ["ED-09", "ED-14"].includes(item.shotId)).map((item) => item.classification), ["REBINDABLE", "REBINDABLE"]);
assert.deepEqual(phase0.results.filter((item) => ["ED-15", "ED-16"].includes(item.shotId)).map((item) => item.classification), ["GENERATION_REQUIRED", "PASS"]);
for (const item of phase0.results) {
  assert.equal(item.ocrPerformed, false, `${item.shotId} must not repeat OCR during migration`);
  assert.equal(item.semanticReviewPerformed, false, `${item.shotId} must not repeat semantic review during migration`);
}

const phase1 = maturity.phases.PHASE_1;
assert.deepEqual(phase1.summary, {beatCount: 34, packageCount: 14, noPackageCount: 20, networkRequiredCount: 1, networkHelpfulCount: 5, networkSkipCount: 28, titleActorCount: 15});
assert.equal(phase1.failureReasons.length, 0);
const ed14Beat = maturity.decisionContract.beats.find((item) => item.shotId === "ED-14");
assert.ok(ed14Beat.sourceReferences.length > 0, "ED-14 must retain a real source reference");
assert.ok(ed14Beat.sourceReferences.every((source) => source.id && source.sourceUrl && source.sha256 && source.fileExists), "ED-14 source reference must be traceable");

const phase2 = maturity.phases.PHASE_2;
assert.deepEqual(phase2.failureReasons, []);
assert.equal(phase2.planModeConflicts.length, 0);
assert.equal(phase2.generationPreflight.find((item) => item.shotId === "ED-16").status, "PASS");
assert.equal(phase2.generationPreflight.find((item) => item.shotId === "ED-15").status, "PASS");
assert.equal(phase2.nextAction, currentNextAction);

const latestWaveDispatched = primitiveSwitchExhausted || taxonomyReauthorExhausted;
assert.equal(maturity.imageLedger.newGeneratedCount, latestWaveDispatched ? 2 : 0);
assert.equal(maturity.imageLedger.newGeneratedShas.length, latestWaveDispatched ? 2 : 0);
assert.equal(maturity.imageLedger.historicalGeneratedCount, taxonomyReauthorReady || taxonomyReauthorExhausted ? 8 : primitiveSwitchExhausted ? 6 : 4);
assert.deepEqual(new Set(maturity.imageLedger.historicalGeneratedShas), new Set([
  "9f737c499dd83f50cf774664d643fca209e4a2ba00e49398da0267238c485928",
  "41ba764915cde41000758fd90488e06fb33ee6577cfb24419a49f38749b4f8e9",
  "be5bd1710599f197a94bffcce99b617adec80effd706b9fcac0997d0bb94adad",
  "3a5693baf05840f963f7f31f7ab6850f9143ccc623da672ad342e1ad6401ed06",
  ...(primitiveSwitchExhausted || taxonomyReauthorReady || taxonomyReauthorExhausted ? [
    "0254723799071a10d4391b3f17fbe74e8dd2815aa9212a91d0f0cc9a1feecb24",
    "1a3ea8d35d91179d987545474d429ba100be1052bbbc61edc82092ec4919db3c",
    ...(taxonomyReauthorReady || taxonomyReauthorExhausted ? [
      "6fe25300c82eaccb4db79251bc77d1b309a37eaee263a30d25c275eabc54561f",
      "b17a5545a2307c41155f7f5e68e131e31a53b75e5b607be2e8bd6f10fae3414b",
    ] : []),
  ] : []),
]));
assert.equal(maturity.imageLedger.generationDispatched, latestWaveDispatched);
assert.equal(maturity.imageLedger.goodPngShaChanged, false);
assert.equal(maturity.runtimeFreeze.queue, 0);
assert.equal(maturity.runtimeFreeze.running, 0);
assert.equal(maturity.runtimeFreeze.workerStatus, "frozen");
assert.equal(maturity.runtimeFreeze.assemblyCount, 0);
assert.equal(maturity.runtimeFreeze.assemblyCreationAllowed, false);
assert.equal(maturity.phases.PHASE_4.boardRebuilt, false);
assert.equal(maturity.phases.PHASE_4.userApproval, false);

const workspace = readProjectWorkspace(appRoot);
assert.equal(repair.manifestSha256, workspace.production.incrementalRepairManifestAuthority.manifestSha256);
assert.equal(maturity.inputHashes.bindingManifestSha256, workspace.production.creatorPaletteShotBindingManifest.manifestSha256);
assert.equal(maturity.inputHashes.repairManifestSha256, repair.manifestSha256);
assert.equal(maturity.inputHashes.boardSha256, workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256);
assert.equal(maturity.systemRegression.status, "PASS");
assert.ok(maturity.systemRegression.cases.every((item) => item.status === "PASS"));
assert.equal(maturity.overallStatus, taxonomyReauthorReady ? "ED15_OVERLAY_TAXONOMY_REAUTHOR_READY" : taxonomyReauthorExhausted ? "ED15_OVERLAY_TAXONOMY_REAUTHOR_EXHAUSTED" : primitiveSwitchExhausted ? "ED15_OVERLAY_PRIMITIVE_SWITCH_EXHAUSTED" : "ED15_DUAL_GAP_OVERLAY_REPAIR_READY");
assert.equal(maturity.nextAction, currentNextAction);
assert.deepEqual(maturity.phases.PHASE_3.targetShotIds, ["ED-15"]);
assert.equal(maturity.phases.PHASE_3.generationAllowed, false);
assert.equal(maturity.phases.PHASE_3.generationDispatched, latestWaveDispatched);
if (primitiveSwitchExhausted) {
  assert.equal(maturity.phases.PHASE_3.repairAttempt, 2);
  assert.equal(maturity.phases.PHASE_3.visualPrimitiveSwitch.toPrimitive, "presenter-aware-dual-gap-offset-wordforms");
  assert.ok(maturity.phases.PHASE_3.failureReasons.includes("ED15_OVERLAY_PRIMITIVE_SWITCH_NO_PASS"));
}
if (taxonomyReauthorReady) {
  assert.equal(maturity.phases.PHASE_3.repairAttempt, 3);
  assert.equal(maturity.phases.PHASE_3.taxonomyReauthor.toPrimitive, "presenter-aware-dual-gap-type-lockup");
  assert.deepEqual(maturity.phases.PHASE_3.failureReasons, []);
}
if (taxonomyReauthorExhausted) assert.ok(maturity.phases.PHASE_3.failureReasons.includes("ED15_OVERLAY_TAXONOMY_REAUTHOR_NO_PASS"));
assert.equal(maturity.decisionContract.beats.find((item) => item.shotId === "ED-15").visualActorContract.contract, "A1PresenterAwareDualGapTypographyActor/v1");
assert.deepEqual(maturity.decisionContract.beats.find((item) => item.shotId === "ED-15").visualActorContract.visiblePhrases, ["讨厌什么句式", "带到哪里"]);

console.log(JSON.stringify({
  status: "PASS",
  maturityRunSha256,
  phases: Object.fromEntries(Object.entries(maturity.phases).map(([id, phase]) => [id, phase.status])),
  reusedExistingCandidateCount: maturity.imageLedger.reusedExistingCandidateCount,
  newGeneratedCount: maturity.imageLedger.newGeneratedCount,
  generationRequiredShotIds: phase0.summary.generationReadyShotIds,
  regressionCaseCount: maturity.systemRegression.cases.length,
  overallStatus: maturity.overallStatus,
}, null, 2));
