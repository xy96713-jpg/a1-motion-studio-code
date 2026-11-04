#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  next.production.motion.status = "representative-preview-required";
  next.production.motion.previewArtifact = null;
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.currentStage = "representative-motion";
  next.production.maturityLoop.nextAction = "rerender-current-representative-motion-plan";
  const event = createProductionEvent({workspace: current, action: "representative-motion-render-state-recovered", payload: {planSha256: current.production.motion.representativePlan?.sha256 || null}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {event});
  console.log(JSON.stringify({status: "REPRESENTATIVE_MOTION_RENDER_STATE_RECOVERED", planSha256: next.production.motion.representativePlan?.sha256 || null}, null, 2));
});
