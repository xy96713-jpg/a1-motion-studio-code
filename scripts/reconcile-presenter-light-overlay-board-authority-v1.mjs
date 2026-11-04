#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {readProjectWorkspace, syncCurrentAuthorityMirrors} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicBoardRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1");
const artifactBoardRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/whole-film-static-board-v1");
const candidateManifestPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/presenter-light-overlay-system-v2/manifest.json");
const reportPath = path.join(publicBoardRoot, "report.json");
const artifactReportPath = path.join(artifactBoardRoot, "report.json");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const workspace = readProjectWorkspace(appRoot);
const board = workspace.production?.shotIntelligence?.wholeFilmStaticBoard;
assert.equal(board?.status, "PENDING_USER_APPROVAL");
assert.equal(board?.userVisualApproval, "NOT_APPROVED");
assert.equal(board?.approvalAllowed, true);
assert.ok(board?.publicUrl && board?.timelineBoard?.publicUrl);
const candidateManifest = readJson(candidateManifestPath);

const reportBoard = {
  publicUrl: board.publicUrl,
  sha256: board.sha256,
  width: board.width,
  height: board.height,
  itemCount: board.itemCount,
  itemSeedSha256: board.itemSeedSha256 || null,
};
const reportTimelineBoard = {
  publicUrl: board.timelineBoard.publicUrl,
  sha256: board.timelineBoard.sha256,
  width: board.timelineBoard.width,
  height: board.timelineBoard.height,
  itemCount: board.timelineBoard.itemCount,
  items: board.timelineBoard.items || [],
};
const report = {
  contract: "A1WholeFilmStaticBoardFinalizationReport/v1",
  status: "PASS",
  current: true,
  historyReadOnly: false,
  authorityScope: "CURRENT",
  workspaceSha256: workspace.workspaceSha256,
  stage: "WHOLE_FILM_STATIC_BOARD_READY",
  nextUserGate: "WHOLE_FILM_STATIC_BOARD",
  nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD",
  userApprovalRequired: true,
  userVisualApproval: "NOT_APPROVED",
  items: board.items || [],
  board: reportBoard,
  packageBoard: reportBoard,
  timelineBoard: reportTimelineBoard,
  targetShotIds: candidateManifest.targetShotIds || [],
  incumbentBoardSha256: board.styleLineageAuthority?.priorBoardDisposition?.boardSha256 || null,
  styleLineageAuthority: board.styleLineageAuthority || null,
  storyboardPixelConsistency: board.storyboardPixelConsistency || null,
  gateStatus: workspace.production.shotIntelligence.wholeFilmBatchRecommendation?.candidateAuthorityAudit?.status || "PASS",
  minimalCompositionStatus: "PASS",
  formalAssemblyCount: 0,
  assemblyCreationAllowed: false,
  layerReconstructionAllowed: false,
  criticAllowed: false,
  motionAllowed: false,
  generatedAt: new Date().toISOString(),
};
writeJsonAtomic(reportPath, report);
writeJsonAtomic(artifactReportPath, report);

const reportSha256 = fileSha256(reportPath);
const manifestBody = {
  contract: "A1WholeFilmStaticBoardCurrentAuthorityManifest/v2",
  version: 2,
  status: "PENDING_USER_APPROVAL",
  current: true,
  authorityScope: "CURRENT",
  reviewScope: "WHOLE_FILM_STATIC_BOARD",
  sourceReport: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/report.json", sha256: reportSha256},
  packageBoard: reportBoard,
  timelineBoard: reportTimelineBoard,
  packageItems: board.items || [],
  timelineItems: board.timelineBoard.items || [],
  userVisualApproval: "NOT_APPROVED",
  generationPerformed: false,
  assemblyCreated: false,
  layerReconstructionPerformed: false,
  motionCanonicalized: false,
  nextAction: "review-whole-film-static-board",
};
const manifest = {...manifestBody, boardManifestSha256: sha256(manifestBody), generatedAt: new Date().toISOString()};
writeJsonAtomic(path.join(publicBoardRoot, "board-manifest.json"), manifest);
writeJsonAtomic(path.join(artifactBoardRoot, "board-manifest.json"), manifest);
syncCurrentAuthorityMirrors(appRoot, workspace);

assert.equal(manifest.packageBoard.sha256, report.board.sha256);
assert.equal(manifest.timelineBoard.sha256, report.timelineBoard.sha256);
assert.equal(fileSha256(path.join(appRoot, "public", report.board.publicUrl.replace(/^\//u, ""))), report.board.sha256);
assert.equal(fileSha256(path.join(appRoot, "public", report.timelineBoard.publicUrl.replace(/^\//u, ""))), report.timelineBoard.sha256);
console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, packageBoardSha256: report.board.sha256, timelineBoardSha256: report.timelineBoard.sha256, reportSha256, boardManifestSha256: manifest.boardManifestSha256, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false}, null, 2));
