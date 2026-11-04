#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("minimal-editorial-reconcile-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`minimal-editorial-reconcile-cas:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("minimal-editorial-reconcile-runtime-not-frozen-idle");
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const board = next.production.shotIntelligence.wholeFilmStaticBoard;
  board.itemCount = board.items.length;
  board.timelineBoard.itemCount = board.timelineBoard.items.length;
  board.status = "PENDING_USER_APPROVAL";
  board.userVisualApproval = "NOT_APPROVED";
  board.approvalAllowed = true;
  board.reviewActionDisabled = false;
  const currentFinalizedShotIds = board.items.map((item) => item.shotId);
  const priorBatch = next.production.shotIntelligence.wholeFilmBatchRecommendation || {};
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...priorBatch,
    status: "WHOLE_FILM_STATIC_BOARD_READY",
    finalizedShotIds: currentFinalizedShotIds,
    outputDeduplication: {
      ...(priorBatch.outputDeduplication || {}),
      historicalGenerationJobCount: priorBatch.outputDeduplication?.historicalGenerationJobCount
        ?? priorBatch.outputDeduplication?.actualJobCount
        ?? 0,
      currentFinalizedShotCount: currentFinalizedShotIds.length,
      currentFinalizedShotIds,
      shortageByShot: (priorBatch.outputDeduplication?.shortageByShot || [])
        .filter((item) => currentFinalizedShotIds.includes(item.shotId)),
    },
    staticBoard: structuredClone(board),
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
  };
  delete next.production.packagingTemporalReadabilityAuthority;
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "PASS") throw new Error(`minimal-editorial-reconcile-board-gate-blocked:${JSON.stringify(gate)}`);
  recalculated.production.shotIntelligence.wholeFilmBatchRecommendation.candidateAuthorityAudit = gate;
  if (recalculated.production.authority.currentStage !== "whole-film-static-board-review" || recalculated.production.authority.nextAction?.id !== "review-whole-film-static-board") throw new Error(`minimal-editorial-reconcile-stage-drift:${JSON.stringify(recalculated.production.authority)}`);
  const event = createProductionEvent({workspace: recalculated, action: "reconcile-minimal-editorial-current-authority-v1", targetId: board.sha256, payload: {packageCount: board.itemCount, timelineCount: board.timelineBoard.itemCount, boardSha256: board.sha256, timelineBoardSha256: board.timelineBoard.sha256, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1MinimalEditorialCurrentAuthorityReconciliation/v1", status: "PASS", workspaceSha256Before: current.workspaceSha256, stage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction, packageCount: board.itemCount, timelineCount: board.timelineBoard.itemCount, boardSha256: board.sha256, timelineBoardSha256: board.timelineBoard.sha256, boardGate: gate, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false, reconciledAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `minimal-editorial-authority-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"minimal-editorial-static-board-repair-v1/current-authority-reconciliation.json": report}});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, stage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction, packageCount: board.itemCount, timelineCount: board.timelineBoard.itemCount, boardSha256: board.sha256, timelineBoardSha256: board.timelineBoard.sha256, userVisualApproval: "NOT_APPROVED"};
});
console.log(JSON.stringify(result, null, 2));
