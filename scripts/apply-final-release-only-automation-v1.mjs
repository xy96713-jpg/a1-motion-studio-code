#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const updated = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  let next = ensureProductionState(current, now);
  next.production.automationPolicy.status = "running";
  next.production.automationPolicy.updatedAt = now;
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = "resume-automatic-production";
  const event = createProductionEvent({
    workspace: current,
    action: "quality-gated-unattended-automation-enabled",
    payload: {
      intermediateUserApprovalRequired: false,
      calibrationUserApprovalRequired: false,
      automaticCandidateAdmission: true,
      automaticMotionAdmission: true,
      automatic540pReviewRender: true,
      finalReleaseApprovalRequired: true,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, next, {event});
  return next;
});

console.log(JSON.stringify({
  status: "QUALITY_GATED_UNATTENDED_AUTOMATION_ENABLED",
  contract: updated.production.automationPolicy.contract,
  authorityStage: updated.production.authority.currentStage,
  nextAction: updated.production.authority.nextAction,
  approvedShots: updated.production.authority.progress.shots.approvedCount,
  referenceMatureShots: updated.production.authority.progress.shots.referenceMatureCount,
  finalReleaseApprovalRequired: updated.production.automationPolicy.finalReleaseApprovalRequired,
}, null, 2));
