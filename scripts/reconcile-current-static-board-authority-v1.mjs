#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {syncCurrentAuthorityMirrors} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {sha256Json, writeJsonAtomic} from "../apps/studio-next/src/lib/a1-system-validation-runner-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicBoardRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1");
const artifactBoardRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/whole-film-static-board-v1");
const reportPath = path.join(publicBoardRoot, "report.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const resolvePublicFile = (publicUrl) => path.join(appRoot, "public", String(publicUrl).replace(/^\//u, ""));

const workspace = readProjectWorkspace(appRoot);
const report = readJson(reportPath);
const board = workspace.production?.shotIntelligence?.wholeFilmStaticBoard;
assert.equal(report.contract, "A1WholeFilmStaticBoardFinalizationReport/v1");
assert.equal(report.status, "PASS");
assert.equal(board?.status, "PENDING_USER_APPROVAL");
assert.equal(board?.sha256, report.board?.sha256);
assert.equal(board?.timelineBoard?.sha256, report.timelineBoard?.sha256);
assert.equal(fileSha256(resolvePublicFile(report.board.publicUrl)), report.board.sha256);
assert.equal(fileSha256(resolvePublicFile(report.timelineBoard.publicUrl)), report.timelineBoard.sha256);

const manifestBody = {
  contract: "A1WholeFilmStaticBoardCurrentAuthorityManifest/v2",
  version: 2,
  status: "PENDING_USER_APPROVAL",
  current: true,
  authorityScope: "CURRENT",
  reviewScope: "WHOLE_FILM_STATIC_BOARD",
  sourceReport: {
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/report.json",
    sha256: fileSha256(reportPath),
  },
  packageBoard: {
    publicUrl: report.board.publicUrl,
    width: report.board.width,
    height: report.board.height,
    sha256: report.board.sha256,
    itemCount: report.items.length,
  },
  timelineBoard: {
    publicUrl: report.timelineBoard.publicUrl,
    width: report.timelineBoard.width,
    height: report.timelineBoard.height,
    sha256: report.timelineBoard.sha256,
    itemCount: report.timelineBoard.itemCount,
  },
  packageItems: report.items,
  timelineItems: report.timelineBoard.items || board.timelineBoard.items || [],
  userVisualApproval: "NOT_APPROVED",
  generationPerformed: false,
  assemblyCreated: false,
  layerReconstructionPerformed: false,
  motionCanonicalized: false,
  nextAction: "review-whole-film-static-board",
};
const manifest = {
  ...manifestBody,
  boardManifestSha256: sha256Json(manifestBody),
  generatedAt: new Date().toISOString(),
};
writeJsonAtomic(path.join(publicBoardRoot, "board-manifest.json"), manifest);
writeJsonAtomic(path.join(artifactBoardRoot, "board-manifest.json"), manifest);

syncCurrentAuthorityMirrors(appRoot, workspace);
const phase = readJson(phasePath);
const nextPhase = {
  ...phase,
  reviewDecision: {
    ...(phase.reviewDecision || {}),
    status: phase.status,
    userVisualApproval: "NOT_APPROVED",
    intermediateApprovalRequired: true,
    requiresExplicitApproval: true,
    acceptedShotIrAllowed: false,
    motionPrototypeAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  },
  boardReview: {
    ...(phase.boardReview || {}),
    boardSha256: report.board.sha256,
    packageBoardSha256: report.board.sha256,
    timelineBoardSha256: report.timelineBoard.sha256,
    currentBoardManifestSha256: manifest.boardManifestSha256,
    userVisualApproval: "NOT_APPROVED",
    approvalAllowed: true,
  },
};
writeJsonAtomic(phasePath, nextPhase);
assert.equal(nextPhase.boardReview.boardSha256, report.board.sha256);
assert.equal(nextPhase.boardReview.packageBoardSha256, report.board.sha256);
assert.equal(nextPhase.boardReview.timelineBoardSha256, report.timelineBoard.sha256);
assert.equal(phase.goldenFilmVisualSystemMaturity?.current, false);
assert.equal(phase.goldenFilmVisualSystemMaturity?.authorityScope, "HISTORY_READ_ONLY");

console.log(JSON.stringify({
  status: "PASS",
  packageBoardSha256: manifest.packageBoard.sha256,
  timelineBoardSha256: manifest.timelineBoard.sha256,
  boardManifestSha256: manifest.boardManifestSha256,
  boardManifestBytes: fs.statSync(path.join(publicBoardRoot, "board-manifest.json")).size,
  historyAuthorityExplicit: true,
  userVisualApproval: "NOT_APPROVED",
}, null, 2));
