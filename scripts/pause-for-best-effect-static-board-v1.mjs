#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const shotIds = next.library.assets
    .filter((asset) => asset.route === "shot-composition")
    .sort((left, right) => left.shotDemand.order - right.shotDemand.order)
    .map((asset) => asset.shotDemand.shotId);

  next.production.acceptedShotIr = {
    contract: "A1AcceptedShotIRSet/v2",
    status: "locked-upstream-best-effect-board",
    sourceWorkspaceSha256: null,
    shotCount: 0,
    sha256: null,
    publicUrl: null,
    compiledAt: null,
  };
  next.production.motion = {
    contract: "A1RepresentativeMotionGate/v1",
    status: "locked-upstream-best-effect-board",
    representativePlan: null,
    previewArtifact: null,
    review: {status: "pending", score: null, maxScore: 24, hardFailures: [], reviewedAt: null},
    fullMotionAllowed: false,
  };
  next.production.release.review540p = {status: "locked-upstream-best-effect-board", publicUrl: null, sha256: null, renderedAt: null, durationMs: null, width: 960, height: 540, approvedAt: null};
  next.production.release.final1080p = {status: "locked", publicUrl: null, sha256: null, requestedAt: null};
  next.production.release.davinciPackage = {status: "locked", publicUrl: null, sha256: null};
  next.production.assembly.status = "best-effect-static-board-required";
  next.production.maturityLoop.status = "paused-best-effect-static-board";
  next.production.maturityLoop.bestEffectBoard = {
    contract: "A1BestEffectStaticBoardGate/v1",
    status: "REVISE",
    shotCount: shotIds.length,
    targetShotIds: shotIds,
    hardFailures: [
      "all-34-best-effect-frames-required",
      "aspect-preserving-real-screen-presentation-required",
      "static-board-visual-approval-required-before-motion",
    ],
    requiredChecks: [
      "all source media preserves native aspect ratio",
      "screen crops are explicit and semantically anchored",
      "no text or primary actor is clipped in review preview",
      "all 34 selected frames show the intended final composition",
      "adjacent shots have distinct silhouettes and causal handoffs",
    ],
    pausedAt: now,
  };
  next.production.filmVisualRepair = {
    ...(next.production.filmVisualRepair || {}),
    contract: "A1FilmVisualRepairRun/v1",
    status: "full-board-best-effect-refinement",
    targetShotIds: shotIds,
    hardFailures: next.production.maturityLoop.bestEffectBoard.hardFailures,
    nextAction: "refine-and-audit-all-34-static-best-effect-frames",
    appliedAt: now,
  };

  const event = createProductionEvent({
    workspace: current,
    action: "motion-and-render-paused-for-best-effect-static-board",
    targetId: current.workspaceSha256,
    payload: {shotIds, hardFailures: next.production.maturityLoop.bestEffectBoard.hardFailures},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event, files: {"best-effect-static-board-gate-v1.json": next.production.maturityLoop.bestEffectBoard}});
  return recalculated;
});

console.log(JSON.stringify({
  status: "PAUSED_FOR_BEST_EFFECT_STATIC_BOARD",
  shotCount: updated.production.maturityLoop.bestEffectBoard.shotCount,
  acceptedShotIr: updated.production.acceptedShotIr.status,
  motion: updated.production.motion.status,
  review540p: updated.production.release.review540p.status,
  nextAction: updated.production.filmVisualRepair.nextAction,
  workspaceSha256: updated.workspaceSha256,
}, null, 2));
