#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildWholeFilmStaticBoardApprovalSeed, hashWholeFilmStaticBoardApprovalSeed} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("static-board-integrity-repair-expected-workspace-sha-required");
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`static-board-integrity-repair-cas-failed:${locked.workspaceSha256}`);
  const runtime = locked.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  if (locked.production.generation.summary.queued !== 0 || locked.production.generation.summary.running !== 0 || locked.production.generation.workerStatus !== "frozen") throw new Error("static-board-integrity-repair-requires-frozen-idle-runtime");
  if ((runtime.currentAssembly || []).length !== 0) throw new Error("static-board-integrity-repair-assembly-must-remain-empty");
  if (locked.production.visualProductionRun?.status !== "WHOLE_FILM_STATIC_BOARD_READY" || runtime.wholeFilmBatchRecommendation?.nextUserGate !== "WHOLE_FILM_STATIC_BOARD" || board?.status !== "PENDING_USER_APPROVAL") throw new Error("static-board-integrity-repair-stage-invalid");
  const boardFile = path.join(appRoot, "public", String(board.publicUrl || "").replace(/^\//u, ""));
  if (!fs.existsSync(boardFile) || fileSha256(boardFile) !== board.sha256) throw new Error("static-board-integrity-repair-board-media-sha-invalid");

  const now = new Date().toISOString();
  const next = structuredClone(locked);
  const nextRuntime = next.production.shotIntelligence;
  const seed = buildWholeFilmStaticBoardApprovalSeed(next.production.shotVisualCoveragePlan, nextRuntime.packageLookMasterPlans);
  const itemSeedSha256 = hashWholeFilmStaticBoardApprovalSeed(seed);
  const viewedSeed = (nextRuntime.wholeFilmStaticBoard.items || []).map((item) => ({shotId: item.shotId, planSha256: item.planSha256, candidateId: item.candidateId, artifactSha256: item.artifactSha256}));
  assert.deepEqual(viewedSeed, seed);

  const selectedCandidates = [];
  for (const item of seed) {
    const raw = nextRuntime.lookMasterRawReferences.find((candidate) => candidate.shotId === item.shotId && candidate.planSha256 === item.planSha256 && candidate.artifact?.sha256 === item.artifactSha256);
    if (!raw || raw.current === false || raw.recommendationEligible !== true || raw.selectionEligible !== true || raw.candidateAuditAuthority?.status !== "PASS" || raw.pixelAudit?.status !== "PASS" || raw.semanticPixelAudit?.status !== "PASS") throw new Error(`static-board-integrity-repair-selected-authority-invalid:${item.shotId}`);
    if (!raw.serverVisualAssessment) {
      if (raw.pixelAudit.serverVisualAssessmentSha256 !== raw.semanticPixelAudit.auditSha256) throw new Error(`static-board-integrity-repair-server-assessment-source-invalid:${item.shotId}`);
      raw.serverVisualAssessment = {
        contract: "A1BoundServerVisualAssessment/v1",
        status: "PASS",
        assessmentMode: "ACTUAL_PIXEL_SEMANTIC_AUDIT_COMPATIBILITY_BINDING",
        artifactSha256: raw.artifact.sha256,
        sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256,
        assessmentSha256: raw.semanticPixelAudit.auditSha256,
      };
    }
    const serverSha256 = raw.serverVisualAssessment.assessmentSha256 || raw.serverVisualAssessment.auditSha256;
    if (raw.serverVisualAssessment.status !== "PASS" || serverSha256 !== raw.pixelAudit.serverVisualAssessmentSha256) throw new Error(`static-board-integrity-repair-server-assessment-invalid:${item.shotId}`);
    raw.current = true;
    raw.recommendationEligible = true;
    raw.selectionEligible = true;
    raw.assemblyEligible = true;
    selectedCandidates.push({
      shotId: item.shotId,
      planSha256: item.planSha256,
      candidateId: item.candidateId,
      artifactSha256: item.artifactSha256,
      pixelAuditSha256: raw.pixelAudit.auditSha256,
      semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
      serverVisualAssessmentSha256: serverSha256,
      candidateAuditAuthoritySha256: raw.candidateAuditAuthority.authoritySha256,
    });
  }
  nextRuntime.wholeFilmStaticBoard = {...nextRuntime.wholeFilmStaticBoard, itemSeedSha256, decision: null};
  nextRuntime.wholeFilmBatchRecommendation = {
    ...nextRuntime.wholeFilmBatchRecommendation,
    status: "COMPLETE",
    exceptions: [],
    assemblyCreationAllowed: true,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    staticBoard: structuredClone(nextRuntime.wholeFilmStaticBoard),
  };
  next.production.visualProductionRun = {...next.production.visualProductionRun, status: "WHOLE_FILM_STATIC_BOARD_READY", nextUserGate: "WHOLE_FILM_STATIC_BOARD", assemblyCreationAllowed: true, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false};
  nextRuntime.currentAssembly = [];
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

  const event = createProductionEvent({workspace: locked, action: "repair-current-whole-film-static-board-approval-integrity", targetId: "WHOLE_FILM_STATIC_BOARD", payload: {contract: "A1WholeFilmStaticBoardApprovalIntegrityRepair/v1", boardSha256: board.sha256, itemSeedSha256, selectedCandidateCount: selectedCandidates.length, formalAssemblyCount: 0, downstreamStarted: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(recalculated.production.generation.summary.queued, 0);
  assert.equal(recalculated.production.generation.summary.running, 0);
  assert.equal(recalculated.production.generation.workerStatus, "frozen");
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(recalculated.gates.packagingDeliveryGates.status, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(recalculated.gates.packagingDeliveryGates.userAssemblyReviewAllowed, true);

  const actualPixelReport = {contract: "A1WholeFilmActualPixelRecommendationGateReport/v1", status: "COMPLETE", workspaceSha256: recalculated.workspaceSha256, stage: "WHOLE_FILM_STATIC_BOARD_READY", nextUserGate: "WHOLE_FILM_STATIC_BOARD", requiredPackageShotCount: seed.length, selectedCandidateCount: selectedCandidates.length, selectedCandidates, exceptions: [], assemblyCreationAllowed: true, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, generatedAt: now};
  const staticBoardReport = {contract: "A1WholeFilmStaticBoardFinalizationReport/v1", status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, stage: "WHOLE_FILM_STATIC_BOARD_READY", nextUserGate: "WHOLE_FILM_STATIC_BOARD", items: nextRuntime.wholeFilmStaticBoard.items, board: {publicUrl: board.publicUrl, sha256: board.sha256, width: board.width, height: board.height, itemSeedSha256}, exceptions: [], provisionalSelectionCount: seed.length, formalAssemblyCount: 0, assemblyCreationAllowed: true, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, generatedAt: now};
  const repairReport = {contract: "A1WholeFilmStaticBoardApprovalIntegrityRepair/v1", status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: recalculated.workspaceSha256, boardSha256: board.sha256, itemSeedSha256, selectedCandidateCount: selectedCandidates.length, compatibilityServerAssessmentBindings: selectedCandidates.filter((item) => {
    const raw = recalculated.production.shotIntelligence.lookMasterRawReferences.find((candidate) => candidate.shotId === item.shotId && candidate.artifact?.sha256 === item.artifactSha256);
    return raw?.serverVisualAssessment?.assessmentMode === "ACTUAL_PIXEL_SEMANTIC_AUDIT_COMPATIBILITY_BINDING";
  }).length, formalAssemblyCount: 0, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, downstream: {imagegen: false, assembly: false, layerReconstruction: false, critic: false, motion: false}, generatedAt: now};
  const commitId = `static-board-approval-integrity-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId, files: {"whole-film-actual-pixel-recommendation-gate-v1/report.json": actualPixelReport, "whole-film-static-board-v1/report.json": staticBoardReport, "whole-film-static-board-approval-integrity-v1/report.json": repairReport}});
  return {...repairReport, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || null};
});

console.log(JSON.stringify(result, null, 2));
