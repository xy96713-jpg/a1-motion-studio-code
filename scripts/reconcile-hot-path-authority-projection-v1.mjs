#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const now = new Date().toISOString();
  const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  const event = createProductionEvent({
    workspace: next,
    action: "reconcile-hot-path-authority-projection-v1",
    targetId: next.production.authority.nextAction?.id || next.production.authority.currentStage,
    payload: {
      contract: "A1HotPathAuthorityProjectionReconciliation/v1",
      sourceWorkspaceSha256: current.workspaceSha256,
      previousStage: current.production.authority.currentStage,
      currentStage: next.production.authority.currentStage,
      previousNextAction: current.production.authority.nextAction?.id || null,
      currentNextAction: next.production.authority.nextAction?.id || null,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      motionPerformed: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `hot-path-authority-projection-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
  });
  return {
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: persisted.workspaceSha256,
    previousStage: current.production.authority.currentStage,
    currentStage: next.production.authority.currentStage,
    previousNextAction: current.production.authority.nextAction?.id || null,
    currentNextAction: next.production.authority.nextAction?.id || null,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    motionPerformed: false,
  };
});

console.log(JSON.stringify(result, null, 2));
