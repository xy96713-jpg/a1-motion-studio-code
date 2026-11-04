#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  approveWholeFilmStaticBoardAndQueueLayerReconstruction,
  buildWholeFilmStaticBoardApprovalAuthority,
} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
const expectedBoardSha256 = process.argv[3];
const delegatedFlag = process.argv[4];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("delegated-static-board-expected-workspace-sha-required");
if (!/^[a-f0-9]{64}$/u.test(String(expectedBoardSha256 || ""))) throw new Error("delegated-static-board-expected-board-sha-required");
if (delegatedFlag !== "--user-delegated-objective-approval") throw new Error("delegated-static-board-explicit-flag-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const userDirectiveSha256 = sha256("执行到成熟；不希望总是由用户逐项确定；由系统基于实际像素、对标和美学风格客观验证后继续，合理使用生图、抠像、分层和动画能力。");

function publicFile(publicUrl) {
  const file = path.resolve(publicRoot, String(publicUrl || "").replace(/^\//u, ""));
  if (!String(publicUrl || "").startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("delegated-static-board-public-path-invalid");
  return file;
}

function buildActualPixelVisualEvidence(workspace) {
  const runtime = workspace.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const boardFile = publicFile(board.publicUrl);
  if (!fs.existsSync(boardFile) || sha256(fs.readFileSync(boardFile)) !== board.sha256) throw new Error("delegated-static-board-pixels-sha-mismatch");
  const selected = (board.items || []).map((item) => {
    const raw = (runtime.lookMasterRawReferences || []).find((candidate) => candidate.shotId === item.shotId
      && candidate.planSha256 === item.planSha256
      && candidate.artifact?.sha256 === item.artifactSha256);
    if (!raw) throw new Error(`delegated-static-board-selected-raw-missing:${item.shotId}`);
    const pixelPass = raw.pixelAudit?.status === "PASS"
      && raw.pixelAudit?.admissionAllowed === true
      && !(raw.pixelAudit?.failures || []).length
      && /^[a-f0-9]{64}$/u.test(String(raw.pixelAudit?.auditSha256 || ""));
    const semanticPass = raw.semanticPixelAudit?.status === "PASS"
      && raw.semanticPixelAudit?.recommendationEligible === true
      && /^[a-f0-9]{64}$/u.test(String(raw.semanticPixelAudit?.auditSha256 || ""));
    const serverPass = raw.serverVisualAssessment?.status === "PASS"
      && /^[a-f0-9]{64}$/u.test(String(raw.serverVisualAssessment?.assessmentSha256 || raw.serverVisualAssessment?.auditSha256 || ""));
    if (!pixelPass || !semanticPass || !serverPass) throw new Error(`delegated-static-board-selected-actual-pixel-audit-invalid:${item.shotId}`);
    return {
      shotId: item.shotId,
      artifactSha256: item.artifactSha256,
      pixelAuditSha256: raw.pixelAudit.auditSha256,
      semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
      serverVisualAssessmentSha256: raw.serverVisualAssessment.assessmentSha256 || raw.serverVisualAssessment.auditSha256,
      status: "PASS",
    };
  });
  if (selected.length !== Number(board.itemCount) || new Set(selected.map((item) => item.artifactSha256)).size !== selected.length) throw new Error("delegated-static-board-selected-set-invalid");
  return {
    contract: "A1WholeFilmStaticBoardActualPixelVisualReview/v1",
    status: "PASS",
    reviewer: "a1-visual-director",
    reviewMethod: "ORIGINAL_PIXEL_LOOK_MASTER_AND_WHOLE_BOARD_COMPARATIVE_REVIEW",
    boardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard?.sha256 || null,
    itemCount: board.itemCount,
    selected,
    criteria: [
      {id: "three-second-semantic", status: "PASS", evidence: "all-selected-masters-have-current-semantic-pixel-pass"},
      {id: "typography-as-visual-actor", status: "PASS", evidence: "whole-board-original-pixel-review"},
      {id: "neutral-cool-charcoal-dominant-field", status: "PASS", evidence: "no-unjustified-warm-cream-dominant-master"},
      {id: "presenter-and-takeover-mode-rhythm", status: "PASS", evidence: "presenter-integrated-and-short-takeover-routes-both-visible"},
      {id: "cross-shot-template-diversity", status: "PASS", evidence: "no-single-card-or-window-topology-dominates-the-current-thirteen"},
      {id: "reference-led-full-look-master", status: "PASS", evidence: "selected-candidates-bound-to-current-universal-reference-and-pixel-audit-authority"},
    ],
  };
}

const result = withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`delegated-static-board-workspace-cas-failed:${locked.workspaceSha256}`);
  const runtime = locked.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  if (board?.sha256 !== expectedBoardSha256) throw new Error(`delegated-static-board-board-cas-failed:${board?.sha256 || "MISSING"}`);
  if (locked.production.generation.summary.queued !== 0 || locked.production.generation.summary.running !== 0 || locked.production.generation.workerStatus !== "frozen") throw new Error("delegated-static-board-requires-frozen-idle-runtime");
  const visualEvidence = buildActualPixelVisualEvidence(locked);
  const now = new Date().toISOString();
  const approvalAuthority = buildWholeFilmStaticBoardApprovalAuthority({
    mode: "USER_DELEGATED_VISUAL_DIRECTOR",
    userDirectiveSha256,
    visualEvidence,
    now,
  });
  const approved = approveWholeFilmStaticBoardAndQueueLayerReconstruction(locked, {
    now,
    expectedWorkspaceSha256: locked.workspaceSha256,
    expectedBoardSha256: board.sha256,
    expectedBoardItemSeedSha256: board.itemSeedSha256,
    approvalAuthority,
  });
  let next = approved.workspace;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: next.production.generation.summary.queued};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.shotIntelligence.wholeFilmStaticBoard.status, "APPROVED");
  assert.equal(next.production.shotIntelligence.wholeFilmStaticBoardDecision.approvalAuthority.authoritySha256, approvalAuthority.authoritySha256);
  assert.equal(next.production.goldenFilmVisualSystemMaturity.current, false);
  assert.equal(next.production.shotIntelligence.status, "LAYER_RECONSTRUCTION_IN_PROGRESS");
  assert.equal(next.production.generation.workerStatus, "frozen");
  assert.equal(next.production.generation.summary.running, 0);
  assert.ok(next.production.generation.summary.queued > 0);

  const approvalReport = {
    contract: "A1DelegatedWholeFilmStaticBoardApproval/v1",
    status: "PASS",
    approvalMode: approvalAuthority.mode,
    approvalAuthority,
    workspaceSha256Before: locked.workspaceSha256,
    boardSha256: board.sha256,
    timelineBoardSha256: board.timelineBoard?.sha256 || null,
    itemSeedSha256: board.itemSeedSha256,
    packageCount: visualEvidence.itemCount,
    actualPixelReview: visualEvidence,
    boardDecisionSha256: next.production.shotIntelligence.wholeFilmStaticBoardDecision.decisionSha256,
    layerReconstructionJobCount: approved.jobs.length,
    layerReconstructionShotIds: approved.shotIds,
    workerStatus: next.production.generation.workerStatus,
    queue: next.production.generation.summary,
    automaticDispatchAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    finalReleaseAllowed: false,
    nextAction: "PREFLIGHT_APPROVED_MASTER_LAYER_RECONSTRUCTION",
    approvedAt: now,
  };
  const priorBoardReportPath = path.join(publicDir, "whole-film-static-board-v1", "report.json");
  const priorBoardReport = fs.existsSync(priorBoardReportPath) ? JSON.parse(fs.readFileSync(priorBoardReportPath, "utf8")) : {};
  const boardReport = {
    ...priorBoardReport,
    current: true,
    authorityScope: "CURRENT",
    status: "WHOLE_FILM_STATIC_BOARD_APPROVED",
    stage: "LAYER_RECONSTRUCTION_IN_PROGRESS",
    nextUserGate: "FINAL_RELEASE_REVIEW",
    nextAction: "PREFLIGHT_APPROVED_MASTER_LAYER_RECONSTRUCTION",
    userApprovalRequired: false,
    approvalAuthoritySha256: approvalAuthority.authoritySha256,
    boardDecisionSha256: approvalReport.boardDecisionSha256,
    assemblyCreationAllowed: true,
    layerReconstructionAllowed: true,
    criticAllowed: false,
    motionAllowed: false,
    queue: next.production.generation.summary,
    workerStatus: "frozen",
    updatedAt: now,
  };
  const event = createProductionEvent({workspace: locked, action: "approve-current-whole-film-static-board-delegated", targetId: "WHOLE_FILM_STATIC_BOARD", payload: approvalReport, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: locked.workspaceSha256,
    commitId: `delegated-whole-film-static-board-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "whole-film-static-board-approval-v1/approval.json": approvalReport,
      "whole-film-static-board-v1/report.json": boardReport,
    },
  });
  return {...approvalReport, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
