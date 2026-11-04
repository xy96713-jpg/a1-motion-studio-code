#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const workspace = readJson(path.join(artifactRoot, "workspace.json"));
const publicWorkspace = readJson(path.join(generatedRoot, "workspace.json"));
const manifest = readJson(path.join(generatedRoot, "opening-ten-shot-director-board-v1/manifest.json"));
const review = readJson(path.join(generatedRoot, "opening-ten-shot-director-board-v1/agent-actual-pixel-review.json"));
const phase = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"));
const uiSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"), "utf8");
const targetShotIds = ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"];

assert.equal(workspace.workspaceSha256, publicWorkspace.workspaceSha256);
assert.equal(workspace.workspaceSha256, phase.authority.workspaceSha256);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.userVisualApprovalGate.userVisualApproval, "NOT_APPROVED");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.status, "PENDING_USER_APPROVAL");
assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256, "4675ef547fdaf080064ed698ba270339ed74f513075748b18b192676f35d57cd");
assert.equal(workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.sha256, "42af83f86344638606236272da263275d4844b62cabcbcb5c2f377663912b740");

assert.equal(manifest.status, "AGENT_ACTUAL_PIXEL_PASS");
assert.equal(manifest.openingRange.durationMs, 49620);
assert.deepEqual(manifest.shotIds, Array.from({length: 10}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`));
assert.equal(review.status, "PASS");
assert.equal(review.boundaries.userVisualApproval, "NOT_APPROVED");
assert.equal(review.boundaries.motionAllowed, false);
const directorBoardFile = path.join(publicRoot, manifest.directorBoard.publicUrl.replace(/^\//u, ""));
const stateBoardFile = path.join(publicRoot, manifest.screenActionStateBoard.publicUrl.replace(/^\//u, ""));
assert.equal(sha256(directorBoardFile), manifest.directorBoard.sha256);
assert.equal(sha256(stateBoardFile), manifest.screenActionStateBoard.sha256);

const plans = new Map(workspace.production.shotVisualCoveragePlan.shotPlans.map((shot) => [shot.shotId, shot]));
for (const shotId of targetShotIds) {
  const shot = plans.get(shotId);
  assert.equal(shot.route, "SCREEN_EVIDENCE");
  assert.equal(shot.packageDecision, "NO_PACKAGE");
  assert.equal(shot.screenActions.length, 3);
  assert.deepEqual(shot.screenStateBindings.map((state) => state.role), ["BEFORE", "ACTION", "RESULT"]);
  assert.equal(shot.screenStateBindings.length, 3);
  assert.equal(shot.screenDemoOwnership, "SYSTEM_SIMULATED_FROM_VERIFIED_SOURCE");
  assert.equal(shot.screenMotionContract.cameraPath, "CUBIC_EASE_IN_OUT");
  assert.equal(shot.screenMotionContract.minimumSettleMs, 350);
  assert.equal(shot.screenMotionContract.hardJumpZoomForbidden, true);
  assert.equal(shot.screenMotionContract.subtitleTimeRangeIsHardBoundary, true);
}
assert.match(uiSource, /data-a1-opening-director-board-image="10-SHOT"/u);
assert.match(uiSource, /data-a1-opening-screen-state-board="15-VERIFIED-STATES"/u);
assert.match(uiSource, /AGENT PIXEL PASS · USER NOT APPROVED/u);

process.stdout.write(`${JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, openingDurationMs: manifest.openingRange.durationMs, shotCount: manifest.shotIds.length, screenShotCount: targetShotIds.length, screenStateCount: targetShotIds.length * 3, boardSha256: manifest.directorBoard.sha256, userVisualApproval: "NOT_APPROVED", motionPerformed: false}, null, 2)}\n`);
