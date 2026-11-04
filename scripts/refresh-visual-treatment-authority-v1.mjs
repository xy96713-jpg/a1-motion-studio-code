#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const projected = recalculateEditorialAssetWorkbench(structuredClone(current), now);
  const previousStage = current.production.authority?.currentStage || null;
  const previousNextAction = current.production.authority?.nextAction?.id || null;
  const currentStage = projected.production.authority?.currentStage || null;
  const nextAction = projected.production.authority?.nextAction?.id || null;
  if (previousStage === currentStage && previousNextAction === nextAction) {
    return {status: "NOOP_ALREADY_CURRENT", workspace: current, event: null, previousStage, currentStage, nextAction};
  }
  const next = structuredClone(current);
  const event = createProductionEvent({
    workspace: current,
    action: "visual-treatment-authority-restored",
    targetId: current.production.project.projectId,
    payload: {previousStage, previousNextAction, currentStage, nextAction},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  return {status: "PASS", workspace: recalculated, event, previousStage, currentStage, nextAction};
});

console.log(JSON.stringify({
  contract: "A1VisualTreatmentAuthorityRefresh/v1",
  status: result.status,
  previousStage: result.previousStage,
  currentStage: result.currentStage,
  nextAction: result.nextAction,
  workspaceSha256: result.workspace.workspaceSha256,
  eventId: result.event?.eventId || null,
}, null, 2));
