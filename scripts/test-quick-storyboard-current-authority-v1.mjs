#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const workspace = readProjectWorkspace(appRoot);
const shotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
const packageCount = workspace.production.canonicalCreatorPackagingSequence.decisions
  .filter((decision) => decision.packageDecision === "PACKAGE").length;
const lifecycle = derivePackagingLifecycleProjection(workspace);
const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const publicBootstrapBytes = fs.readFileSync(path.join(publicRoot, "client-bootstrap.json"));
const artifactBootstrapBytes = fs.readFileSync(path.join(artifactRoot, "client-bootstrap.json"));
const bootstrap = JSON.parse(publicBootstrapBytes.toString("utf8"));
const compactLifecycle = bootstrap.workspace.production.packagingLifecycleProjection;
const compactBoard = bootstrap.workspace.production.shotIntelligence.wholeFilmStaticBoard;
const phase = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"), "utf8"));

assert.equal(Buffer.compare(publicBootstrapBytes, artifactBootstrapBytes), 0, "bootstrap mirrors must be byte-identical");
assert.equal(bootstrap.contract, "A1EditorialWorkbenchClientBootstrap/v1");
assert.equal(bootstrap.snapshotKind, "PACKAGING_ONLY");
assert.equal(bootstrap.workspaceSha256, workspace.workspaceSha256);
const repairPending = phase.status === "CANONICAL_TITLE_REPAIR_PENDING";
const paletteBindingBlocked = phase.status === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED"
  || phase.authority?.currentStage === "creator-packaging-palette-binding-repair-required";
const boardDeferred = repairPending || paletteBindingBlocked || phase.authority?.currentStage === "article-assets"
  || lifecycle.status !== "WHOLE_FILM_STATIC_BOARD_READY";
assert.equal(compactLifecycle.status, lifecycle.status);
assert.equal(compactLifecycle.authorityStage, phase.authority.currentStage);
assert.equal(compactLifecycle.nextActionId, phase.authority.nextAction.id);
assert.equal(compactLifecycle.requiresExplicitApproval, phase.authority.nextAction.requiresUser === true);
assert.equal(compactLifecycle.nextUserGate, phase.authority.nextAction.reviewGate || lifecycle.nextUserGate || null);
assert.deepEqual(compactLifecycle.blockedShotIds, []);
if (boardDeferred) {
  assert.equal(compactBoard, undefined, "static-board payload stays deferred until title repair completes");
} else {
  assert.equal(compactBoard.sha256, board.sha256);
  assert.equal(compactBoard.itemCount, packageCount);
  assert.equal(compactBoard.timelineBoard.itemCount, shotCount);
}
assert.equal(phase.authority.nextAction.id, lifecycle.nextActionId);
assert.equal(phase.authority.nextAction.requiresUser, lifecycle.requiresExplicitApproval);
if (!boardDeferred) assert.deepEqual(phase.boardReview?.blockedShotIds || [], compactLifecycle.blockedShotIds || []);
assert.equal(phase.reviewDecision.motionPrototypeAllowed, false);
assert.equal(phase.reviewDecision.finalRenderAllowed, false);
assert.equal(phase.reviewDecision.resolveExportAllowed, false);

const surfaceSource = fs.readFileSync(path.join(appRoot, "src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"), "utf8");
const quickStoryboardSource = fs.readFileSync(path.join(appRoot, "src/app/system-line-visual-workbench/QuickStoryboardTable.tsx"), "utf8");
assert.match(surfaceSource, /data-a1-whole-film-static-board-review/);
assert.match(surfaceSource, /currentPackageCount\} 个包装节点，一次看完/);
assert.match(surfaceSource, /currentBeatCount\} 个 beat/);
assert.match(surfaceSource, /权威未对齐，禁止确认/);
assert.match(quickStoryboardSource, /\{packageRows\.length\} 个包装镜头/);
assert.doesNotMatch(quickStoryboardSource, /13 个包装镜头/);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1CurrentWholeFilmStaticBoardAuthority/v1",
  shotCount,
  packageCount,
  noPackageCount: shotCount - packageCount,
  blockedShotIds: compactLifecycle.blockedShotIds,
  approvalAllowed: Boolean(lifecycle.approvalAllowed),
  currentScheduleReadOnly: true,
}, null, 2));
