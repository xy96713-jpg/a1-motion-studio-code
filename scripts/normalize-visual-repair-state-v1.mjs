#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {normalizeShotVisualRepairState} from "../apps/studio-next/src/lib/a1-visual-repair-policy-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const requestedShotId = process.argv.find((item) => item.startsWith("--shot="))?.slice("--shot=".length) || "ED-01";

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const target = current.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === requestedShotId);
  if (!target) throw new Error(`shot-composition-asset-not-found:${requestedShotId}`);
  const policy = normalizeShotVisualRepairState({
    reviewStatus: target.review?.status,
    hasVisualCritic: Boolean(target.visualCritic),
    referenceMaturity: target.visualCritic?.referenceMaturity,
    revisionRound: target.visualRevision?.round,
    strategyCycle: target.visualStrategyCycle,
    maxRoundsPerTarget: current.production.maturityLoop.maxRoundsPerTarget,
    maxVisualStrategyCycles: current.production.maturityLoop.maxVisualStrategyCycles,
  });
  if (!policy.normalizationRequired) return {status: "NO_NORMALIZATION_REQUIRED", shotId: requestedShotId, policy, workspaceSha256: current.workspaceSha256};
  const previousCycle = Number(target.visualStrategyCycle || 0);
  const next = structuredClone(current);
  const nextTarget = next.library.assets.find((asset) => asset.id === target.id);
  nextTarget.visualStrategyCycle = policy.normalizedStrategyCycle;
  nextTarget.revisionHistory ||= [];
  nextTarget.revisionHistory.push({
    contract: "A1VisualRepairCycleNormalization/v1",
    round: nextTarget.visualRevision?.round || 0,
    strategyCycle: previousCycle,
    reason: policy.normalizationReason,
    normalizedStrategyCycle: policy.normalizedStrategyCycle,
    archivedAt: new Date().toISOString(),
  });
  const event = createProductionEvent({
    workspace: current,
    action: "visual-repair-strategy-cycle-normalized",
    targetId: target.id,
    payload: {shotId: requestedShotId, previousCycle, normalizedCycle: policy.normalizedStrategyCycle, reason: policy.normalizationReason},
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, event.createdAt);
  persistProjectState(appRoot, recalculated, {event});
  return {status: "NORMALIZED", shotId: requestedShotId, previousCycle, normalizedCycle: policy.normalizedStrategyCycle, workspaceSha256: recalculated.workspaceSha256, eventId: event.eventId};
});

console.log(JSON.stringify(result, null, 2));
