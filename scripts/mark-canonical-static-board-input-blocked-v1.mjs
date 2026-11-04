#!/usr/bin/env node

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = new URL("../apps/studio-next/", import.meta.url).pathname;

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("canonical-static-board-blocked-state-requires-frozen-idle-runtime");
  if ((runtime.currentAssembly || []).length !== 0) throw new Error("canonical-static-board-blocked-state-requires-empty-assembly");
  const scope = buildCanonicalStaticBoardScope(current);
  if (scope.status !== "BLOCKED" || scope.selectionMissingShotIds.length < 1 || scope.modeCompatibilityFailures.length) throw new Error("canonical-static-board-blocked-state-requires-selection-only-blocker");
  const alreadyCurrent = runtime.wholeFilmStaticBoard?.status === "SUPERSEDED_CANONICAL_INPUT_BLOCKED"
    && JSON.stringify(runtime.canonicalStaticBoardAuthority?.selectionMissingShotIds || []) === JSON.stringify(scope.selectionMissingShotIds)
    && current.production.authority?.currentStage === "whole-film-canonical-board-input-blocked"
    && current.production.authority?.nextAction?.id === "resolve-canonical-static-board-inputs"
    && current.production.visualProductionRun?.status === "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS"
    && current.production.packagingAutomation?.status === "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS"
    && JSON.stringify(current.production.packagingAutomation?.targetShotIds || []) === JSON.stringify(scope.selectionMissingShotIds)
    && current.gates?.packagingDeliveryGates?.status === "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS"
    && current.gates?.packagingDeliveryGates?.lookMasterGenerationAllowed === false;
  if (alreadyCurrent) return {workspace: current, scope, alreadyCurrent: true};

  const now = new Date().toISOString();
  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  nextRuntime.canonicalStaticBoardAuthority = scope;
  nextRuntime.wholeFilmStaticBoard = {
    ...(nextRuntime.wholeFilmStaticBoard || {}),
    status: "SUPERSEDED_CANONICAL_INPUT_BLOCKED",
    decision: null,
    approvalAllowed: false,
    reviewActionDisabled: true,
    blockedShotIds: [...scope.selectionMissingShotIds],
    supersededShotIds: ["ED-32"],
    blockedAt: now,
  };
  nextRuntime.wholeFilmBatchRecommendation = {
    ...(nextRuntime.wholeFilmBatchRecommendation || {}),
    status: "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS",
    exceptions: scope.selectionMissingShotIds.map((shotId) => ({shotId, code: "CANONICAL_STATIC_BOARD_SELECTION_MISSING"})),
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "CANONICAL_STATIC_BOARD_INPUTS",
    staticBoard: nextRuntime.wholeFilmStaticBoard,
  };
  next.production.visualProductionRun = {
    ...(next.production.visualProductionRun || {}),
    status: "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS",
    nextUserGate: "CANONICAL_STATIC_BOARD_INPUTS",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "CANONICAL_TITLE_REPAIR_AUDITED_BOARD_BLOCKED_INPUTS",
    generationDispatched: false,
    boardRebuilt: false,
    blockedShotIds: [...scope.selectionMissingShotIds],
  };
  next.production.packagingAutomation = {
    ...(next.production.packagingAutomation || {}),
    status: "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS",
    targetShotIds: [...scope.selectionMissingShotIds],
    generationFreeze: {...(next.production.packagingAutomation?.generationFreeze || {}), frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "canonical-static-board-input-blocked",
    targetId: scope.selectionMissingShotIds.join(","),
    payload: {authoritySha256: scope.authoritySha256, sourceRevisionHash: scope.sourceRevisionHash, blockedShotIds: scope.selectionMissingShotIds, boardSha256: runtime.wholeFilmStaticBoard?.sha256 || null, boardRebuilt: false},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1CanonicalStaticBoardInputBlockerReport/v1", status: "BLOCKED", blockedShotIds: scope.selectionMissingShotIds, authoritySha256: scope.authoritySha256, sourceRevisionHash: scope.sourceRevisionHash, boardSha256: runtime.wholeFilmStaticBoard?.sha256 || null, boardRebuilt: false, reviewActionDisabled: true, assemblyCreationAllowed: false, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"canonical-static-board-authority-v1/blocker-report.json": report}});
  return {workspace: recalculated, scope, committed, alreadyCurrent: false};
});

console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS",
  workspaceSha256: result.workspace.workspaceSha256,
  blockedShotIds: result.scope.selectionMissingShotIds,
  boardSha256: result.workspace.production.shotIntelligence.wholeFilmStaticBoard.sha256,
  boardStatus: result.workspace.production.shotIntelligence.wholeFilmStaticBoard.status,
  queue: result.workspace.production.generation.summary,
  workerStatus: result.workspace.production.generation.workerStatus,
  assemblyCount: result.workspace.production.shotIntelligence.currentAssembly.length,
  assemblyCreationAllowed: false,
  alreadyCurrent: result.alreadyCurrent,
}, null, 2));
