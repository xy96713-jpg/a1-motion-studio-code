#!/usr/bin/env node

import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertCanonicalCreatorPackagingSequence, assertCreatorPackagingPaletteRegistry, assertCreatorPaletteShotBindingManifest, resolvePaletteEntryFile} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const report = JSON.parse(fs.readFileSync(path.join(artifactDir, "creator-packaging-palette-review-v1", "report.json"), "utf8"));
const maturity = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/golden-film-visual-system-maturity-v1/maturity-run.json"), "utf8"));
const repair = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json"), "utf8"));
const currentPhase = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"), "utf8"));
const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sequence = assertCanonicalCreatorPackagingSequence(workspace.production.canonicalCreatorPackagingSequence, {expectedShotCount: 34});
const registry = assertCreatorPackagingPaletteRegistry(workspace.production.creatorPackagingPaletteRegistry);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// The current creator-packaging authority supersedes the historical
// 13/21 maturity branches below. Keep those branches as regression coverage,
// but validate the live 12/22 control-plane state first and fail closed.
if (currentPhase.authority?.currentStage === "ed10-look-master-replacement-review") {
  const packageCount = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length;
  const noPackageCount = sequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE").length;
  assert.equal(packageCount, 12);
  assert.equal(noPackageCount, 22);
  assert.equal(workspace.production.creatorPackagingCandidateDecision.candidateId, "ED-19-c4");
  assert.equal(workspace.production.creatorPackagingCandidateDecision.userVisualApproval, "APPROVED");
  assert.equal(currentPhase.authority.nextAction.id, "confirm-ed10-direction-c-before-eva-rebuild");
  assert.equal(currentPhase.authority.nextAction.requiresUser, true);
  assert.deepEqual(currentPhase.authority.nextAction.targetShotIds, ["ED-10"]);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
  assert.equal(workspace.gates.packagingDeliveryGates.motionAllowed, false);
  assert.equal(workspace.gates.packagingDeliveryGates.deliveryAllowed, false);
  console.log(JSON.stringify({status: "PASS", authorityStatus: currentPhase.status, packageCount, noPackageCount, approvedCandidateId: "ED-19-c4", nextAction: currentPhase.authority.nextAction.id, workerStatus: workspace.production.generation.workerStatus, assemblyCount: 0}, null, 2));
  process.exit(0);
}
if (currentPhase.status === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED") {
  const packageCount = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length;
  const noPackageCount = sequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE").length;
  const binding = assertCreatorPaletteShotBindingManifest(workspace.production.creatorPaletteShotBindingManifest, {workspace, requirePass: false});
  const repairSummary = repair.summary;
  assert.equal(packageCount, 12);
  assert.equal(noPackageCount, 22);
  assert.equal(binding.packageShotCount, packageCount);
  assert.equal(binding.status, "BLOCKED");
  assert.ok(binding.blockedShotIds.length > 0);
  assert.equal(repairSummary.packageCount, packageCount);
  assert.equal(repairSummary.noPackageCount, noPackageCount);
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED");
  assert.equal(currentPhase.next.recommended.id, "adopt-ed-19-c4-or-reject-and-hold");
  assert.equal(currentPhase.next.recommended.requiresExplicitApproval, true);
  assert.deepEqual(currentPhase.next.recommended.targetShotIds, ["ED-19"]);
  assert.equal(workspace.production.packagingLifecycleProjection.gateKind, "CANDIDATE_VISUAL_DECISION_GATE");
  assert.equal(workspace.production.packagingLifecycleProjection.nextUserGate, "CREATOR_PACKAGING_CANDIDATE_ADOPTION");
  assert.equal(currentPhase.authority.creatorPackagingCandidateDecision.candidateId, "ED-19-c4");
  assert.equal(currentPhase.authority.creatorPackagingCandidateDecision.status, "READY_FOR_USER_REVIEW");
  assert.notEqual(workspace.production.authority.nextAction.id, "compile-creator-packaging-palette-bound-repair");
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
  assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(workspace.gates.packagingDeliveryGates.motionAllowed, false);
  assert.equal(workspace.gates.packagingDeliveryGates.deliveryAllowed, false);
  console.log(JSON.stringify({
    status: "PASS",
    authorityStatus: currentPhase.status,
    packageCount,
    noPackageCount,
    bindingStatus: binding.status,
    blockedShotIds: binding.blockedShotIds,
    repairStatus: repair.status,
    nextAction: currentPhase.next.recommended.id,
    queue: workspace.production.generation.summary,
    workerStatus: workspace.production.generation.workerStatus,
    imageGenerationAllowed: currentPhase.authority.packagingAutomation.generationFreeze.imageGenerationAllowed,
    assemblyCreationAllowed: workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed,
  }, null, 2));
  process.exit(0);
}

if (workspace.production.creatorPaletteShotBindingManifest?.status === "PASS"
  && sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length === 12
  && workspace.production.authority?.currentStage === "article-assets") {
  const binding = assertCreatorPaletteShotBindingManifest(workspace.production.creatorPaletteShotBindingManifest, {workspace, requirePass: true});
  assert.equal(binding.packageShotCount, 12);
  assert.equal(binding.passCount, 12);
  assert.deepEqual(binding.blockedShotIds, []);
  assert.equal(workspace.production.incrementalRepairManifestAuthority.currentRepairStatus, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED");
  assert.equal(workspace.production.creatorPackagingCandidateDecision.candidateId, "ED-19-c4");
  assert.equal(workspace.production.creatorPackagingCandidateDecision.userVisualApproval, "APPROVED");
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
  assert.equal(workspace.gates.packagingDeliveryGates.motionAllowed, false);
  assert.ok(["automatic-article-packaging-qa", "run-objective-qa-for-13-in-use-assets", "repair-or-rebind-current-in-use-assets-no-blind-regeneration", "rebuild-current-12-package-static-board"].includes(workspace.production.authority.nextAction.id));
  console.log(JSON.stringify({status: "PASS", packageCount: 12, noPackageCount: 22, bindingStatus: binding.status, approvedCandidateId: "ED-19-c4", nextAction: workspace.production.authority.nextAction.id}, null, 2));
  process.exit(0);
}

const currentBoard = workspace.production.shotIntelligence.wholeFilmStaticBoard;
if (currentBoard?.status === "PENDING_USER_APPROVAL" && workspace.production.authority?.currentStage === "whole-film-static-board-review") {
  const packageCount = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length;
  const noPackageCount = sequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE").length;
  const binding = assertCreatorPaletteShotBindingManifest(workspace.production.creatorPaletteShotBindingManifest, {workspace, requirePass: true});
  const scope = buildCanonicalStaticBoardScope(workspace, {boardItems: currentBoard.items});
  assert.equal(packageCount + noPackageCount, 34);
  assert.equal(packageCount, currentBoard.itemCount);
  assert.equal(binding.packageShotCount, packageCount);
  assert.equal(binding.passCount, packageCount);
  assert.deepEqual(binding.blockedShotIds, []);
  assert.equal(scope.status, "PASS");
  assert.deepEqual(scope.requiredPackageBoardShotIds, sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId));
  assert.deepEqual(scope.selectionMissingShotIds, []);
  assert.equal(currentBoard.itemCount, packageCount);
  assert.equal(currentBoard.timelineBoard.itemCount, 34);
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED");
  assert.deepEqual({packageCount: repair.summary.packageCount, noPackageCount: repair.summary.noPackageCount}, {packageCount, noPackageCount});
  assert.equal(currentPhase.status, "ACTIVE_REVIEW_GATED");
  assert.equal(currentPhase.boardReview.status, "WHOLE_FILM_STATIC_BOARD_PENDING_USER_APPROVAL");
  assert.equal(currentPhase.boardReview.itemCount, packageCount);
  assert.equal(currentPhase.boardReview.approvalAllowed, true);
  assert.equal(currentPhase.next.recommended.id, "review-whole-film-static-board");
  assert.equal(currentPhase.next.recommended.requiresExplicitApproval, true);
  assert.equal(workspace.production.authority.nextAction.requiresUser, true);
  assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
  console.log(JSON.stringify({status: "PASS", packageCount, noPackageCount, bindingStatus: binding.status, boardStatus: currentBoard.status, boardSha256: currentBoard.sha256, nextAction: currentPhase.next.recommended.id}, null, 2));
  process.exit(0);
}

if (currentPhase.status === "CANONICAL_TITLE_REPAIR_PENDING" && currentPhase.authority?.currentStage === "canonical-title-repair-pending") {
  const packageCount = sequence.decisions.filter((item) => item.packageDecision === "PACKAGE").length;
  const noPackageCount = sequence.decisions.filter((item) => item.packageDecision === "NO_PACKAGE").length;
  const binding = assertCreatorPaletteShotBindingManifest(workspace.production.creatorPaletteShotBindingManifest, {workspace, requirePass: true});
  const scope = buildCanonicalStaticBoardScope(workspace, {boardItems: currentBoard.items});
  assert.equal(packageCount, 12);
  assert.equal(noPackageCount, 22);
  assert.equal(binding.packageShotCount, packageCount);
  assert.equal(binding.passCount, packageCount);
  assert.deepEqual(binding.blockedShotIds, []);
  assert.equal(registry.status, "SYSTEM_APPROVED_CREATOR_PACKAGING_PALETTE");
  assert.equal(scope.status, "PASS");
  assert.equal(currentBoard.status, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
  assert.equal(currentBoard.itemCount, packageCount);
  assert.equal(currentBoard.approvalAllowed, false);
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED");
  assert.equal(currentPhase.next.recommended.id, "dispatch-canonical-title-repair");
  assert.deepEqual(currentPhase.next.recommended.targetShotIds, ["ED-08", "ED-13", "ED-19"]);
  assert.equal(currentPhase.next.recommended.requiresExplicitApproval, false);
  assert.equal(workspace.production.authority.nextAction.requiresUser, false);
  assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
  console.log(JSON.stringify({status: "PASS", packageCount, noPackageCount, bindingStatus: binding.status, boardStatus: currentBoard.status, boardSha256: currentBoard.sha256, nextAction: currentPhase.next.recommended.id, targetShotIds: currentPhase.next.recommended.targetShotIds}, null, 2));
  process.exit(0);
}

if (["WHOLE_FILM_STATIC_BOARD", "READY_FOR_STATIC_BOARD_BUILD"].includes(maturity.overallStatus)) {
  const binding = assertCreatorPaletteShotBindingManifest(workspace.production.creatorPaletteShotBindingManifest, {workspace, requirePass: true});
  const scope = buildCanonicalStaticBoardScope(workspace, {boardItems: workspace.production.shotIntelligence.wholeFilmStaticBoard.items});
  const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
  assert.equal(sequence.rhythmAudit.status, "PASS");
  assert.equal(sequence.rhythmAudit.packageCount, 13);
  assert.equal(sequence.rhythmAudit.noPackageCount, 21);
  assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.status, "LOCAL_PASS_GLOBAL_UNPROVEN");
  assert.equal(sequence.maturity.globalHupoSequenceStatus, "LOCAL_CHAIN_ONLY");
  assert.deepEqual(sequence.decisions.filter((item) => item.contentTreatment === "EDITORIAL_EXPLAINER" && item.packageDecision === "PACKAGE").map((item) => item.shotId), ["ED-12", "ED-14", "ED-17"]);
  assert.equal(sequence.decisions.find((item) => item.shotId === "ED-15").packageDecision, "NO_PACKAGE");
  assert.equal(sequence.decisions.find((item) => item.shotId === "ED-15").route, "PRESENTER_BASE");
  assert.equal(binding.status, "PASS");
  assert.equal(binding.packageShotCount, 13);
  assert.equal(binding.passCount, 13);
  assert.deepEqual(binding.blockedShotIds, []);
  assert.equal(scope.status, "PASS");
  assert.equal(scope.requiredPackageBoardShotIds.length, 13);
  assert.deepEqual(scope.selectionMissingShotIds, []);
  assert.equal(board.itemCount, 13);
  assert.equal(board.timelineBoard.itemCount, 34);
  assert.equal(report.status, maturity.overallStatus);
  assert.equal(report.authorityStatus, maturity.overallStatus);
  assert.equal(report.creatorPackagingPalette.repairSummary.packageCount, 13);
  assert.equal(report.creatorPackagingPalette.repairSummary.noPackageCount, 21);
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED");
  assert.deepEqual({packageCount: repair.summary.packageCount, noPackageCount: repair.summary.noPackageCount}, {packageCount: 13, noPackageCount: 21});
  assert.equal(repair.entries.find((entry) => entry.shotId === "ED-15").packageDecision, "NO_PACKAGE");
  assert.equal(repair.generationLedger.adoptedGeneratedCount, 0);
  assert.equal(repair.generationLedger.attemptedGeneratedCount, maturity.imageLedger.attemptedGeneratedCount);
  assert.deepEqual(repair.generationLedger.candidateShas, maturity.imageLedger.candidateShas);
  assert.equal(repair.generationLedger.rejectedGeneratedCount + repair.generationLedger.systemEligibleGeneratedCount, repair.generationLedger.attemptedGeneratedCount);
  assert.equal(repair.generationLedger.pendingGeneratedCount + repair.generationLedger.adoptedGeneratedCount, repair.generationLedger.systemEligibleGeneratedCount);
  if (maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD") {
    assert.equal(board.approvalAllowed, true);
  } else {
    assert.equal(board.status, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
    assert.equal(board.approvalAllowed, false);
  }
  assert.equal(currentPhase.status, maturity.overallStatus);
  if (maturity.overallStatus === "WHOLE_FILM_STATIC_BOARD") {
    assert.equal(currentPhase.boardReview.status, "WHOLE_FILM_STATIC_BOARD_PENDING_USER_APPROVAL");
    assert.equal(currentPhase.boardReview.approvalAllowed, true);
    assert.equal(currentPhase.next.recommended.id, "CONFIRM_WHOLE_FILM_STATIC_BOARD");
    assert.equal(currentPhase.next.recommended.requiresExplicitApproval, true);
    assert.equal(workspace.production.authority.nextAction.requiresUser, true);
  } else {
    assert.equal(currentPhase.boardReview.status, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
    assert.equal(currentPhase.boardReview.approvalAllowed, false);
    assert.equal(currentPhase.next.recommended.id, "REBUILD_WHOLE_FILM_STATIC_BOARD");
    assert.equal(currentPhase.next.recommended.requiresExplicitApproval, false);
    assert.equal(workspace.production.authority.nextAction.requiresUser, false);
  }
  assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
  console.log(JSON.stringify({status: "PASS", packageCount: 13, noPackageCount: 21, bindingStatus: binding.status, boardStatus: board.status, boardSha256: board.sha256, nextAction: currentPhase.next.recommended.id}, null, 2));
  process.exit(0);
}

if (maturity.overallStatus === "BLOCKED_BEFORE_GENERATION" && maturity.phases.PHASE_3.status === "READY") {
  const binding = assertCreatorPaletteShotBindingManifest(workspace.production.creatorPaletteShotBindingManifest, {workspace, requirePass: false});
  const realScope = buildCanonicalStaticBoardScope(workspace);
  const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
  assert.equal(sequence.conflictAudit.status, "PASS");
  assert.equal(sequence.rhythmAudit.packageCount, 13);
  assert.equal(sequence.rhythmAudit.noPackageCount, 21);
  assert.equal(sequence.decisions.find((item) => item.shotId === "ED-15").packageDecision, "NO_PACKAGE");
  assert.equal(binding.status, "BLOCKED");
  assert.equal(binding.packageShotCount, 13);
  const generationTargetShotIds = maturity.phases.PHASE_0.summary.generationReadyShotIds;
  assert.equal(binding.passCount, 13 - generationTargetShotIds.length);
  assert.deepEqual(binding.blockedShotIds, generationTargetShotIds);
  assert.equal(realScope.status, "BLOCKED");
  assert.deepEqual(realScope.selectionMissingShotIds, generationTargetShotIds);
  assert.equal(board.status, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
  assert.equal(board.approvalAllowed, false);
  assert.equal(repair.status, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED");
  assert.deepEqual({packageCount: repair.summary.packageCount, noPackageCount: repair.summary.noPackageCount, readyForGenerationCount: repair.summary.readyForGenerationCount}, {packageCount: 13, noPackageCount: 21, readyForGenerationCount: generationTargetShotIds.length});
  assert.equal(currentPhase.status, maturity.overallStatus);
  assert.equal(currentPhase.next.recommended.id, "DISPATCH_BOUNDED_GENERATION_WAVE");
  assert.deepEqual(currentPhase.next.recommended.targetShotIds, generationTargetShotIds);
  assert.equal(currentPhase.reviewDecision.requiresExplicitApproval, false);
  assert.equal(currentPhase.reviewDecision.reviewActionDisabled, true);
  assert.equal(report.status, maturity.overallStatus);
  assert.equal(report.nextAction, maturity.nextAction);
  assert.equal(report.creatorPackagingPalette.repairSummary.packageCount, 13);
  assert.equal(report.creatorPackagingPalette.repairSummary.noPackageCount, 21);
  assert.equal(report.bindingManifestSha256, binding.manifestSha256);
  assert.equal(report.repairManifestSha256, workspace.production.incrementalRepairManifestAuthority.manifestSha256);
  assert.equal(workspace.production.generation.summary.queued, 0);
  assert.equal(workspace.production.generation.summary.running, 0);
  assert.equal(workspace.production.generation.workerStatus, "frozen");
  assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
  assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  console.log(JSON.stringify({status: "PASS", packageCount: 13, noPackageCount: 21, bindingStatus: binding.status, blockedShotIds: binding.blockedShotIds, boardStatus: board.status, nextAction: currentPhase.next.recommended.id}, null, 2));
  process.exit(0);
}

assert.equal(sequence.conflictAudit.status, "PASS");
assert.equal(sequence.conflictAudit.conflictCount, 0);
assert.equal(sequence.rhythmAudit.status, "PASS");
assert.equal(sequence.rhythmAudit.packageCount, 13);
assert.equal(sequence.rhythmAudit.noPackageCount, 21);
assert.equal(sequence.rhythmAudit.fullFrameTakeoverCount, 6);
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.status, "LOCAL_PASS_GLOBAL_UNPROVEN");
assert.equal(sequence.rhythmAudit.hupoOrderedSequenceAudit.coverage.globalSequenceMaturityProven, false);
assert.equal(sequence.maturity.globalHupoSequenceStatus, "LOCAL_CHAIN_ONLY");
assert.deepEqual(sequence.decisions.filter((item) => item.contentTreatment === "EDITORIAL_EXPLAINER" && item.frameOccupation === "FULL_FRAME_TAKEOVER").map((item) => item.shotId), []);
assert.deepEqual(sequence.decisions.filter((item) => item.packageDecision === "PACKAGE" && item.contentTreatment === "EDITORIAL_EXPLAINER").map((item) => item.shotId), ["ED-12", "ED-14", "ED-17"]);
for (const shotId of ["ED-19", "ED-33"]) {
  const decision = sequence.decisions.find((item) => item.shotId === shotId);
  assert.equal(decision.contentTreatment, "HERO_TYPOGRAPHY");
  assert.equal(decision.frameOccupation, "FULL_FRAME_TAKEOVER");
}
assert.ok(["CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED", "SYSTEM_APPROVED_CREATOR_PACKAGING_PALETTE"].includes(registry.status));
assert.deepEqual(registry.laneCTargetResolution.targetShotIds, ["ED-12", "ED-14", "ED-17"]);
assert.equal(new Set(registry.entries.map((entry) => entry.laneId)).size, 3);
assert.equal(registry.entries.filter((entry) => entry.laneId === "PRESENTER_OVERLAY_PIXEL_WINDOW").length, 4);
assert.equal(registry.entries.filter((entry) => entry.laneId === "HERO_TYPOGRAPHY").length, 2);
assert.equal(registry.entries.filter((entry) => entry.laneId === "EDITORIAL_EXPLAINER_STRUCTURE").length, 1);
assert.ok(registry.entries.filter((entry) => entry.laneId === "PRESENTER_OVERLAY_PIXEL_WINDOW").every((entry) => entry.contentTreatment === "PIXEL_WINDOW" && entry.frameOccupation === "OVERLAY"));
assert.ok(registry.entries.filter((entry) => entry.laneId === "HERO_TYPOGRAPHY").every((entry) => entry.contentTreatment === "HERO_TYPOGRAPHY"));
assert.equal(registry.entries.filter((entry) => entry.laneId === "EDITORIAL_EXPLAINER_STRUCTURE").length, 1);
assert.equal(registry.laneReadiness.EDITORIAL_EXPLAINER_STRUCTURE.status, "READY");
assert.equal(registry.entries.find((entry) => entry.laneId === "EDITORIAL_EXPLAINER_STRUCTURE").shotId, "ED-14");
assert.equal(registry.entries.find((entry) => entry.laneId === "EDITORIAL_EXPLAINER_STRUCTURE").frameOccupation, "SPLIT");
assert.equal(registry.confirmationAllowed, registry.status === "SYSTEM_APPROVED_CREATOR_PACKAGING_PALETTE");
assert.ok(registry.entries.filter((entry) => entry.laneId === "PRESENTER_OVERLAY_PIXEL_WINDOW").every((entry) => entry.overlayCompositeAudit?.status === "PASS" && entry.holdFrameCompatibility === "PASS"));
const heroTypographyEntries = registry.entries.filter((entry) => entry.laneId === "HERO_TYPOGRAPHY");
assert.ok(heroTypographyEntries.find((entry) => entry.shotId === "ED-33")?.paletteReferenceAlias?.status === "PASS");
assert.equal(heroTypographyEntries.find((entry) => entry.shotId === "ED-16")?.sourceAudit?.originHistoryReadOnly, false);
for (const entry of registry.entries) assert.ok(resolvePaletteEntryFile(publicRoot, entry));

const boardFile = path.join(publicRoot, String(workspace.production.shotIntelligence.wholeFilmStaticBoard.publicUrl).replace(/^\//u, ""));
assert.equal(sha256(fs.readFileSync(boardFile)), report.boardSha256Before);
assert.equal(report.boardSha256After, report.boardSha256Before);
assert.equal(report.boardRebuilt, false);
assert.equal(report.candidateShasUnchanged, true);
assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.status, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
const binding = assertCreatorPaletteShotBindingManifest(workspace.production.creatorPaletteShotBindingManifest, {workspace, requirePass: false});
assert.equal(binding.status, "BLOCKED");
assert.equal(binding.packageShotCount, 14);
assert.equal(binding.passCount, 13);
const expectedBindingConflictShotIds = ["ED-15"];
assert.deepEqual([...new Set(binding.modeCompatibilityFailures.map((item) => item.shotId))].sort(), ["ED-15"]);
const realScope = buildCanonicalStaticBoardScope(workspace);
assert.equal(realScope.status, "BLOCKED");
assert.deepEqual(realScope.requiredPackageBoardShotIds.sort(), ["ED-07", "ED-08", "ED-09", "ED-10", "ED-12", "ED-13", "ED-14", "ED-15", "ED-16", "ED-17", "ED-19", "ED-31", "ED-33", "ED-34"]);
assert.deepEqual(realScope.selectionMissingShotIds.sort(), ["ED-07", "ED-13", "ED-14", "ED-15"]);
assert.deepEqual([...new Set(realScope.modeCompatibilityFailures.map((item) => item.shotId))].sort(), ["ED-15"]);
for (const entry of binding.entries) {
  assert.equal(entry.sequenceSha256, binding.sequenceSha256);
  assert.equal(entry.canonicalDecisionSha256, sequence.decisions.find((item) => item.shotId === entry.shotId).decisionSha256);
  assert.equal(entry.contentTreatment, sequence.decisions.find((item) => item.shotId === entry.shotId).contentTreatment);
  assert.equal(entry.frameOccupation, sequence.decisions.find((item) => item.shotId === entry.shotId).frameOccupation);
}
const bypassAttempt = structuredClone(workspace);
delete bypassAttempt.production.creatorPaletteShotBindingManifest;
assert.equal(buildCanonicalStaticBoardScope(bypassAttempt).status, "BLOCKED", "old plan selection must not bypass the current palette binding");

const ed20 = sequence.decisions.find((item) => item.shotId === "ED-20");
assert.deepEqual({packageDecision: ed20.packageDecision, contentTreatment: ed20.contentTreatment, frameOccupation: ed20.frameOccupation, currentStatus: ed20.currentStatus, generationAllowed: ed20.generationAllowed}, {packageDecision: "NO_PACKAGE", contentTreatment: "REAL_EVIDENCE", frameOccupation: "CLEAN_BASE", currentStatus: "SOURCE_CAPTURE_REQUIRED", generationAllowed: false});
assert.equal(ed20.sourceCaptureHandoff.packagingPaletteBlocking, false);
assert.equal(ed20.sourceCaptureHandoff.staticPackageBoardBlocking, false);
assert.equal(sequence.decisions.find((item) => item.shotId === "ED-32").packageDecision, "NO_PACKAGE");
for (const sha of ["5c4dbc907ec2e68f7400d71297d21e2d38703869e08dfe2393bceacdcc0c6235", "d144bc403ba16c51de2c5453a90772de8e63a29b465a077eeea3da4bd33d2e4e", "a304d71d956a81e355392c7512ef92b99b9f29fe8977762c3eddac72741b88c4"]) {
  const raw = workspace.production.shotIntelligence.lookMasterRawReferences.find((item) => item.artifact?.sha256 === sha);
  assert.equal(raw.historyReadOnly, true);
  assert.equal(raw.current, false);
  assert.equal(raw.status, "HISTORY_READ_ONLY");
}

assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal((workspace.production.shotIntelligence.currentAssembly || []).length, 0);
assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.finalizedShotIds.length, 14);
assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.finalizedShotIds.includes("ED-20"), false);
assert.equal(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.finalizedShotIds.includes("ED-32"), false);
assert.deepEqual(workspace.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions, []);
assert.deepEqual(workspace.production.shotIntelligence.wholeFilmStaticBoard.blockedShotIds, []);
assert.deepEqual(workspace.production.shotIntelligence.wholeFilmStaticBoard.nonBlockingEditorHandoffShotIds, ["ED-20"]);
assert.equal(workspace.gates.packagingDeliveryGates.packageEventCount, 14);
assert.equal(workspace.gates.packagingDeliveryGates.noPackageCount, 20);
assert.ok(workspace.gates.packagingDeliveryGates.blockers.includes("EXISTING_14_SHOT_PALETTE_BINDING_MODE_CONFLICTS"));
assert.ok(workspace.gates.packagingDeliveryGates.blockers.includes("SYSTEM_PALETTE_SELECTION_REVOKED_BY_CURRENT_AESTHETIC_GATE") || workspace.gates.packagingDeliveryGates.blockers.includes("SYSTEM_PALETTE_SELECTION_REQUIRES_PREFLIGHT_ONLY"));
assert.equal(workspace.gates.packagingDeliveryGates.layerReconstructionAllowed, false);
assert.equal(workspace.gates.packagingDeliveryGates.criticReviewAllowed, false);
assert.equal(workspace.gates.packagingDeliveryGates.motionAllowed, false);
assert.equal(currentPhase.status, maturity.overallStatus);
assert.equal(currentPhase.reviewDecision.reviewActionDisabled, true);
assert.equal(currentPhase.reviewDecision.requiresExplicitApproval, false);
assert.equal(currentPhase.reviewDecision.userVisualApproval, maturity.overallStatus);
assert.equal(currentPhase.reviewDecision.packagingReviewStatus, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
assert.equal(currentPhase.boardReview.status, "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
assert.equal(currentPhase.next.recommended.id, maturity.nextAction);
assert.deepEqual(currentPhase.next.recommended.targetShotIds, ["ED-15"]);
assert.equal(report.status, maturity.overallStatus);
assert.equal(report.authorityStatus, "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED");
assert.equal(report.nextAction, maturity.nextAction);
assert.equal(report.laneC.status, "RESOLVED");
assert.deepEqual(report.laneC.targetShotIds, ["ED-12", "ED-14", "ED-17"]);
assert.equal(report.bindingManifestSha256, binding.manifestSha256);
assert.equal(report.repairManifestSha256, workspace.production.incrementalRepairManifestAuthority.manifestSha256);
assert.equal(currentPhase.repairManifestAuthority.manifestSha256, workspace.production.incrementalRepairManifestAuthority.manifestSha256);

console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, boardSha256: report.boardSha256Before, sequenceSha256: sequence.sequenceSha256, registrySha256: registry.registrySha256, scopeStatus: realScope.status, conflictShotCount: expectedBindingConflictShotIds.length, bindingBlockers: binding.blockers, modeDistribution: {package: sequence.rhythmAudit.packageCount, noPackage: sequence.rhythmAudit.noPackageCount, frameOccupation: sequence.rhythmAudit.frameOccupationDistribution}, laneRecommendations: report.laneRecommendations, ed20Status: ed20.currentStatus, queue: workspace.production.generation.summary, workerStatus: workspace.production.generation.workerStatus, assemblyCount: 0}, null, 2));
