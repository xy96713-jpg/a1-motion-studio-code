#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildStoryboardPixelConsistencyAudit} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {compileShotVisualCoveragePlan} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const overridesFile = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("semantic-parity-repair-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`semantic-parity-repair-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("semantic-parity-repair-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("semantic-parity-repair-assembly-must-remain-empty");
  if (current.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("semantic-parity-repair-user-approval-boundary-invalid");

  const now = new Date().toISOString();
  const next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = JSON.parse(fs.readFileSync(overridesFile, "utf8"));
  next.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(next, {now});
  next.production.shotVisualCoveragePlan = compileShotVisualCoveragePlan(next, next.production.filmArtDirection, {now});
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});

  const board = next.production.shotIntelligence.wholeFilmStaticBoard;
  const liveAudit = buildStoryboardPixelConsistencyAudit(next, {board, now});
  const blockedShotIds = [...liveAudit.blockedShotIds];
  if (liveAudit.status !== "BLOCK" || JSON.stringify(blockedShotIds) !== JSON.stringify(["ED-08"])) {
    throw new Error(`semantic-parity-repair-unexpected-blockers:${JSON.stringify({blockedShotIds, failures: liveAudit.items.filter((item) => item.status !== "PASS")})}`);
  }

  next.production.storyboardPixelConsistency = liveAudit;
  next.production.shotIntelligence.wholeFilmStaticBoard = {
    ...board,
    status: "VISUAL_REPAIR_REQUIRED",
    approvalAllowed: false,
    reviewActionDisabled: true,
    blockedShotIds,
    blockers: blockedShotIds.map((shotId) => `SHOT_SEMANTIC_PIXEL_PARITY_BLOCKED:${shotId}`),
    storyboardPixelConsistency: liveAudit,
    userVisualApproval: "NOT_APPROVED",
    decision: null,
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
    status: "SEMANTIC_PIXEL_REPAIR_REQUIRED",
    exceptions: liveAudit.items.filter((item) => item.status !== "PASS").map((item) => ({shotId: item.shotId, failures: item.failures})),
    staticBoard: structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard),
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
  };
  next.production.visualProductionRun = {
    ...next.production.visualProductionRun,
    status: "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
  };
  next.production.packagingAutomation = {
    ...next.production.packagingAutomation,
    status: "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED",
    targetShotIds: blockedShotIds,
    automaticDispatchAllowed: false,
    workerStatus: "frozen",
  };
  next.production.authority = {
    ...next.production.authority,
    currentStage: "whole-film-static-board-semantic-repair",
    state: "whole-film-static-board-semantic-repair",
    nextAction: {
      id: "repair-shot-semantic-pixel-parity",
      label: "只修复 ED-08 的分镜—画面一致性；旧板不可批准",
      requiresUser: false,
      targetShotIds: blockedShotIds,
      reviewGate: "WHOLE_FILM_STATIC_BOARD",
    },
  };

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "BLOCK" || JSON.stringify(gate.blockedShotIds) !== JSON.stringify(["ED-08"])) throw new Error(`semantic-parity-repair-gate-drift:${JSON.stringify(gate)}`);
  if (recalculated.production.authority.nextAction?.id !== "repair-shot-semantic-pixel-parity") throw new Error(`semantic-parity-repair-authority-drift:${JSON.stringify(recalculated.production.authority)}`);

  const report = {
    contract: "A1ShotSemanticPixelParityRepairCheckpoint/v1",
    status: "VISUAL_REPAIR_REQUIRED",
    workspaceSha256Before: current.workspaceSha256,
    blockedShotIds,
    liveAudit,
    candidateAuthorityAudit: gate,
    userFeedback: {
      kind: "CURRENT_THREAD_REPAIR_DIRECTIVE",
      quotes: [
        "一定要好好确认分镜状态，画面是否和分镜上写的一致，落实到系统上",
        "希望都做成熟，都要客观验证到成熟",
      ],
      userVisualApproval: "NOT_APPROVED",
    },
    boundary: {imagegenPerformed: false, assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false, finalRenderPerformed: false},
    createdAt: now,
  };
  const event = createProductionEvent({workspace: recalculated, action: "reopen-current-board-for-semantic-parity-repair-v1", targetId: blockedShotIds.join(","), payload: report, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `semantic-pixel-parity-repair-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"shot-semantic-pixel-parity-v1/report.json": report},
  });
  return {
    status: report.status,
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: committed.workspaceSha256,
    blockedShotIds,
    nextAction: recalculated.production.authority.nextAction,
    userVisualApproval: "NOT_APPROVED",
  };
});

console.log(JSON.stringify(result, null, 2));
