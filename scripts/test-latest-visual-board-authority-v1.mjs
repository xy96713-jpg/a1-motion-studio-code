#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";
import {createEffectiveReviewAuthority} from "../apps/studio-next/src/lib/a1-effective-review-authority-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
// Always run, including when the live approved-ledger branch exits early.
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-board-precedence-"));
try {
  const fixtureApp = path.join(fixtureRoot, "apps/studio-next");
  const phaseFile = path.join(fixtureRoot, ".codex-artifacts/system-progress-system-line/current-phase.json");
  const manifestFile = path.join(fixtureApp, "public/generated/system-line/editorial-asset-workbench-v1/typography-role-bound-whole-film-board-v1/manifest.json");
  fs.mkdirSync(path.dirname(phaseFile), {recursive: true});
  fs.mkdirSync(path.dirname(manifestFile), {recursive: true});
  const workspaceSha256 = "a".repeat(64);
  // Same-SHA but invalid historical board must be ignored ONLY downstream.
  fs.writeFileSync(manifestFile, JSON.stringify({sourceWorkspaceSha256: workspaceSha256}));
  for (const [stage, id, approval] of [
    ["motion-ready", "review-semantic-screen-wave15", true],
    ["representative-motion", "compile-full-film-motion-specs", false],
    ["whole-film-540p-motion-review", "review-current-whole-film-540p", true],
  ]) {
    const nextAction = {id, label: id, requiresExplicitApproval: approval, targetShotIds: ["TEST-01"]};
    fs.writeFileSync(phaseFile, JSON.stringify({status: "TEST_DOWNSTREAM", authority: {currentStage: stage, workspaceSha256, nextAction: {id: "BUILD_OLD_MOTION"}}, next: {recommended: nextAction}}));
    const projected = readExecutionStatus(fixtureApp);
    assert.equal(projected.latestVisualBoardReview, null);
    assert.equal(projected.packagingParagraphLifecycle, null);
    assert.equal(projected.status, "TEST_DOWNSTREAM");
    assert.deepEqual(projected.nextAction, nextAction);
    assert.equal(projected.effectiveAuthority.source.mode, "PERSISTED_BASE_ONLY");
    assert.equal(projected.effectiveAuthority.boundary.motionAllowed, false);
    assert.equal(projected.effectiveAuthority.boundary.finalRenderAllowed, false);
  }
  fs.writeFileSync(phaseFile, JSON.stringify({authority: {currentStage: "shot-review", workspaceSha256}}));
  assert.throws(() => readExecutionStatus(fixtureApp), /latest-visual-board-review-invalid:contract-or-source/u);
} finally {
  fs.rmSync(fixtureRoot, {recursive: true, force: true});
}
const status = readExecutionStatus(appRoot);
const workspace = readProjectWorkspace(appRoot);
const currentWholeFilmStaticBoard = workspace.production?.shotIntelligence?.wholeFilmStaticBoard;
if (currentWholeFilmStaticBoard?.current === true && currentWholeFilmStaticBoard.status === "PENDING_USER_APPROVAL") {
  assert.equal(status.latestVisualBoardReview, null);
  assert.equal(status.status, "ACTIVE_REVIEW_GATED");
  assert.equal(status.currentStage, "whole-film-static-board-review");
  assert.equal(status.nextAction.id, "review-whole-film-static-board");
  assert.equal(status.nextAction.requiresExplicitApproval, true);
  assert.equal(status.effectiveAuthority.boundary.userVisualApproval, "NOT_APPROVED");
  assert.equal(status.effectiveAuthority.boundary.motionAllowed, false);
  assert.equal(status.effectiveAuthority.boundary.finalRenderAllowed, false);
  assert.equal(currentWholeFilmStaticBoard.timelineBoard.itemCount, 34);
  const boardFile = path.join(appRoot, "public", currentWholeFilmStaticBoard.publicUrl.replace(/^\//u, ""));
  const timelineFile = path.join(appRoot, "public", currentWholeFilmStaticBoard.timelineBoard.publicUrl.replace(/^\//u, ""));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(boardFile)).digest("hex"), currentWholeFilmStaticBoard.sha256);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(timelineFile)).digest("hex"), currentWholeFilmStaticBoard.timelineBoard.sha256);
  assert.notEqual(workspace.production?.currentVisualDecisionLedger?.current, true);
  console.log(JSON.stringify({status: "PASS", currentWholeFilmStaticBoardPrecedesHistoricalLedgers: true, boardSha256: currentWholeFilmStaticBoard.sha256, timelineBoardSha256: currentWholeFilmStaticBoard.timelineBoard.sha256, shotCount: currentWholeFilmStaticBoard.timelineBoard.itemCount, motionFrozen: true}, null, 2));
  process.exit(0);
}
if (workspace.production?.currentVisualDecisionLedger?.current === true && workspace.production.currentVisualDecisionLedger.userVisualApproval !== "APPROVED") {
  const pointer = workspace.production.currentVisualDecisionLedger;
  const ledger = JSON.parse(fs.readFileSync(path.join(appRoot, "public", pointer.publicUrl.replace(/^\//u, "")), "utf8"));
  assert.equal(status.latestVisualBoardReview, null);
  assert.equal(status.status, "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED");
  assert.equal(status.nextAction.id, "review-full-static-storyboard-rework");
  assert.equal(status.nextAction.requiresExplicitApproval, true);
  assert.equal(pointer.ledgerSha256, ledger.ledgerSha256);
  assert.equal(ledger.entries.length, 34);
  assert.equal(ledger.entries.find((item) => item.shotId === "ED-01")?.lockedUserDecision?.id, "ED01_OPENING_THREE_STATE");
  assert.equal(ledger.entries.find((item) => item.shotId === "ED-31")?.lockedUserDecision?.id, "ED31_CURRENT_FUSION_PIXEL_COBALT");
  assert.equal(ledger.entries.every((item) => item.animationAllowed === false), true);
  console.log(JSON.stringify({status: "PASS", currentVisualDecisionLedgerPrecedesHistoricalBoards: true, ledgerSha256: ledger.ledgerSha256, shotCount: ledger.shotCount, animationFrozen: true}, null, 2));
  process.exit(0);
}
if (workspace.production?.currentVisualDecisionLedger?.current === true && workspace.production.currentVisualDecisionLedger.userVisualApproval === "APPROVED") {
  const pointer = workspace.production.currentVisualDecisionLedger;
  const ledger = JSON.parse(fs.readFileSync(path.join(appRoot, "public", pointer.publicUrl.replace(/^\//u, "")), "utf8"));
  assert.equal(status.latestVisualBoardReview, null);
  // Downstream actions belong to the current phase, not a historical board's enum.
  const phase = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"), "utf8"));
  assert.ok(["motion-ready", "representative-motion", "whole-film-540p-motion-review"].includes(phase.authority.currentStage));
  assert.equal(status.status, phase.status);
  assert.equal(status.currentStage, phase.authority.currentStage);
  assert.ok(phase.next.recommended.id);
  assert.equal(typeof phase.next.recommended.requiresExplicitApproval, "boolean");
  assert.deepEqual(status.nextAction, phase.next.recommended);
  assert.equal(status.nextAction.id, workspace.production.authority.nextAction.id);
  assert.equal(status.effectiveAuthority.source.mode, "PERSISTED_BASE_ONLY");
  assert.deepEqual(status.effectiveAuthority.persistedBaseAuthority.nextAction, phase.next.recommended);
  assert.equal(status.packagingParagraphLifecycle, null);
  assert.equal(status.effectiveAuthority.boundary.finalRenderAllowed, false);
  assert.equal(pointer.ledgerSha256, ledger.ledgerSha256);
  assert.equal(pointer.animationAllowed, true);
  assert.equal(workspace.production.motion.representativeCanary.agentReview?.status, "PASS");
  console.log(JSON.stringify({status: "PASS", approvedVisualLedgerFeedsRepresentativeMotion: true, internalMotionGatesContinuous: true, ledgerSha256: ledger.ledgerSha256, shotCount: ledger.shotCount, nextAction: status.nextAction.id}, null, 2));
  process.exit(0);
}
const latestBoardManifest = JSON.parse(fs.readFileSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/typography-role-bound-whole-film-board-v1/manifest.json"), "utf8"));
const semanticTimelineCurrent = status.latestVisualBoardReview.review.semanticTimelineCurrent;
assert.equal(status.status, semanticTimelineCurrent ? "LATEST_WHOLE_FILM_VISUAL_BOARD_REVIEW_REQUIRED" : "LATEST_WHOLE_FILM_VISUAL_BOARD_RECOMPILE_REQUIRED");
assert.equal(status.nextAction.id, semanticTimelineCurrent ? "REVIEW_LATEST_WHOLE_FILM_VISUAL_BOARD" : "RECOMPILE_WHOLE_FILM_VISUAL_BOARD_FROM_CURRENT_SEMANTIC_TIMELINE");
assert.equal(status.nextAction.requiresExplicitApproval, semanticTimelineCurrent);
assert.deepEqual(status.nextAction.targetShotIds, latestBoardManifest.packageItems.map((item) => item.shotId));
assert.equal(status.nextAction.targetShotIds.includes("ED-13"), false);
assert.equal(latestBoardManifest.packageItems.length, 11);
assert.equal(latestBoardManifest.packageItems.every((item) => item.typographyRole && item.typographyMode && item.copyMode), true);
assert.equal(latestBoardManifest.typographyContract.systemFallbackForbidden, true);
const packageShotIds = new Set(workspace.production.storyboardProductionProjection.items.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId));
for (const shotId of status.nextAction.targetShotIds) assert.equal(packageShotIds.has(shotId), true);
assert.equal(status.latestVisualBoardReview.review.styleSystem.id, "a1-fusion-pixel-semantic-material-editorial-v3");
assert.equal(status.effectiveAuthority.persistedBaseAuthority.retainedAsHistoricalDecision, true);
for (const board of [status.latestVisualBoardReview.review.packageBoard, status.latestVisualBoardReview.review.timelineBoard]) {
  const file = path.join(appRoot, "public", board.publicUrl.replace(/^\/+/, ""));
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), board.sha256);
}
const planPath = path.join(root, ".codex-artifacts/system-progress-system-line/current-storyboard-production-v1/packaging-paragraph-canary-plan.json");
const before = fs.existsSync(planPath) ? fs.readFileSync(planPath) : null;
const blocked = spawnSync(process.execPath, [path.join(root, "scripts/build-packaging-paragraph-canary-plan-v1.mjs")], {cwd: root, encoding: "utf8", timeout: 15000});
assert.notEqual(blocked.status, 0);
assert.match(`${blocked.stdout}\n${blocked.stderr}`, /packaging-paragraph-canary-plan-invalid:authority-gate/u);
if (before) assert.deepEqual(fs.readFileSync(planPath), before);
const blindGenres = [
  {genre: "technical-tutorial", targetShotIds: ["T-01", "T-04"]},
  {genre: "research-evidence", targetShotIds: ["R-02", "R-05", "R-08"]},
  {genre: "personal-essay", targetShotIds: ["P-03"]},
];
for (const fixture of blindGenres) {
  const lifecycleSha256 = crypto.createHash("sha256").update(fixture.genre).digest("hex");
  const authority = createEffectiveReviewAuthority({
    persistedStatus: "MOTION_READY",
    persistedCurrentStage: "motion-ready",
    persistedNextAction: {id: "BUILD_OLD_MOTION", label: "BUILD_OLD_MOTION", requiresExplicitApproval: false, targetShotIds: []},
    lifecycle: {status: "LATEST_WHOLE_FILM_VISUAL_BOARD_REVIEW_REQUIRED", lifecycleSha256, targetShotIds: fixture.targetShotIds, nextAction: {id: "REVIEW_LATEST_WHOLE_FILM_VISUAL_BOARD", requiresUser: true, targetShotIds: fixture.targetShotIds}, boundary: {productionAdmitted: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}},
  });
  assert.equal(authority.nextAction.id, "REVIEW_LATEST_WHOLE_FILM_VISUAL_BOARD");
  assert.deepEqual(authority.nextAction.targetShotIds, fixture.targetShotIds);
  assert.equal(authority.persistedBaseAuthority.retainedAsHistoricalDecision, true);
}
console.log(JSON.stringify({status: "PASS", latestBoardPrecedesOldLifecycle: true, semanticTimelineCurrent, staleBoardRequiresRecompile: !semanticTimelineCurrent, generationBlockedUntilLatestBoardReview: true, targetShotIds: status.nextAction.targetShotIds, styleSystem: status.latestVisualBoardReview.review.styleSystem, blindGenres: blindGenres.map((item) => item.genre)}, null, 2));
