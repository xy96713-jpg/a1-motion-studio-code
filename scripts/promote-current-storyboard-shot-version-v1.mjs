#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const source = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1/ED-01-opening-title-three-state-board.png");
const publicTarget = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-storyboard-authority-v1/ED-01-opening-title-three-state-board.png");
const artifactTarget = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/current-storyboard-authority-v1/ED-01-opening-title-three-state-board.png");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const now = new Date().toISOString();
assert.ok(fs.existsSync(source), "ed01-opening-three-state-source-required");

const result = withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  const board = current.production?.shotIntelligence?.wholeFilmStaticBoard;
  assert.equal(board?.status, "PENDING_USER_APPROVAL");
  assert.equal(board?.userVisualApproval, "NOT_APPROVED");
  const next = structuredClone(current);
  const artifactSha256 = fileSha256(source);
  fs.mkdirSync(path.dirname(publicTarget), {recursive: true});
  fs.mkdirSync(path.dirname(artifactTarget), {recursive: true});
  fs.copyFileSync(source, publicTarget);
  fs.copyFileSync(source, artifactTarget);
  const publicUrl = "/generated/system-line/editorial-asset-workbench-v1/current-storyboard-authority-v1/ED-01-opening-title-three-state-board.png";
  const updateItem = (item) => item?.shotId !== "ED-01" ? item : {
    ...item,
    artifactSha256,
    artifactPublicUrl: publicUrl,
    previewPublicUrl: publicUrl,
    route: "PACKAGE_LOOK_MASTER",
    routeLabel: "FULLSCREEN WORKBENCH OPENING",
    sourceRole: "IMAGEGEN_LOOK_MASTER",
    titleRole: "HERO_WORKBENCH",
    presentationMode: "FULLSCREEN_WORKBENCH_OPENING",
    frameOccupation: "FULL_FRAME_TAKEOVER",
    stateSequence: ["BEFORE", "HOLD", "AFTER"],
    currentStoryboardVersionId: "ed01-opening-title-three-state-v1",
    currentStoryboardVersionStatus: "CURRENT_REVIEW_ONLY",
    productionAdmission: false,
    reviewOnly: true,
    provenance: "USER_SELECTED_ED01_OPENING_THREE_STATE_BOARD",
  };
  const runtimeBoard = next.production.shotIntelligence.wholeFilmStaticBoard;
  runtimeBoard.items = (runtimeBoard.items || []).map(updateItem);
  runtimeBoard.timelineBoard.items = (runtimeBoard.timelineBoard.items || []).map(updateItem);
  const allItems = runtimeBoard.timelineBoard.items || [];
  next.production.shotIntelligence.currentStoryboardAuthority = {
    contract: "A1CurrentStoryboardAuthority/v1",
    current: true,
    status: "CURRENT_REVIEW_ONLY_USER_APPROVAL_REQUIRED",
    authorityScope: "CURRENT",
    userVisualApproval: "NOT_APPROVED",
    sourceWorkspaceSha256: current.workspaceSha256,
    shotCount: allItems.length,
    shots: allItems.map((item) => ({
      shotId: item.shotId,
      order: item.order,
      current: true,
      authoritativeOverride: item.shotId === "ED-01",
      versionId: item.currentStoryboardVersionId || `board-${item.artifactSha256 || item.shotId}`,
      artifactPublicUrl: item.previewPublicUrl || item.preview?.publicUrl || null,
      artifactSha256: item.artifactSha256 || item.preview?.sha256 || null,
      route: item.route,
      presentationMode: item.presentationMode || null,
      frameOccupation: item.frameOccupation || null,
      stateSequence: item.stateSequence || null,
      source: item.sourceRole || item.preview?.provenance || null,
      reviewOnly: item.reviewOnly !== false,
    })),
    ed01Binding: {versionId: "ed01-opening-title-three-state-v1", artifactPublicUrl: publicUrl, artifactSha256, presentationMode: "FULLSCREEN_WORKBENCH_OPENING", stateSequence: ["BEFORE", "HOLD", "AFTER"]},
    nextAction: "review-current-whole-film-static-board",
  };
  const event = createProductionEvent({workspace: current, action: "promote-current-storyboard-shot-version", targetId: "ED-01", payload: {versionId: "ed01-opening-title-three-state-v1", artifactSha256, presentationMode: "FULLSCREEN_WORKBENCH_OPENING", stateSequence: ["BEFORE", "HOLD", "AFTER"], authorityContract: "A1CurrentStoryboardAuthority/v1"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const report = {contract: "A1CurrentStoryboardShotPromotion/v1", status: "PASS", shotId: "ED-01", versionId: "ed01-opening-title-three-state-v1", artifactSha256, publicUrl, presentationMode: "FULLSCREEN_WORKBENCH_OPENING", stateSequence: ["BEFORE", "HOLD", "AFTER"], userVisualApproval: "NOT_APPROVED", productionAdmission: false, event, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, createdAt: now};
  persistProjectState(appRoot, recalculated, {event, files: {"current-storyboard-authority-v1/ED-01-promotion.json": report}, expectedWorkspaceSha256: current.workspaceSha256});
  return {workspace: recalculated, report};
});
console.log(JSON.stringify({status: result.report.status, shotId: result.report.shotId, versionId: result.report.versionId, artifactSha256: result.report.artifactSha256, publicUrl: result.report.publicUrl, presentationMode: result.report.presentationMode, userVisualApproval: result.report.userVisualApproval, productionAdmission: result.report.productionAdmission, workspaceSha256: result.workspace.workspaceSha256}, null, 2));
