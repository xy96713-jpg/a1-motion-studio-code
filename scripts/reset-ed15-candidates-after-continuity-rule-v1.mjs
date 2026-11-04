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
  const shot = current.library.assets.find((asset) => asset.shotDemand?.shotId === "ED-15");
  if (!shot) throw new Error("ED-15-not-found");
  shot.candidates = [];
  shot.candidateRender = null;
  shot.candidateSetAudit = null;
  shot.visualCritic = null;
  shot.selectedCandidateId = null;
  shot.automationBlock = null;
  shot.status = "brief-ready";
  shot.review = {status: "pending", note: "同一批准材料世界保留两种明显裁切/层级读法，自动继续生产。", reviewedAt: now, reviewedBy: "system-material-continuity-rule", approvedContentSha256: null};
  current.production.maturityLoop.status = "running";
  current.production.maturityLoop.currentStage = "shot-candidates";
  current.production.maturityLoop.nextAction = "regenerate-ED-15-material-continuity-candidates";
  const event = createProductionEvent({workspace: current, action: "ed15-candidates-reset-after-material-continuity-rule", payload: {shotId: "ED-15", minimumRasterDistinct: 2}, now});
  current.production.eventLedger.eventCount += 1;
  current.production.eventLedger.lastEventId = event.eventId;
  current.production.eventLedger.lastEventAt = event.createdAt;
  const next = recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, next, {event});
  console.log(JSON.stringify({status: "ED15_RESET", shotId: "ED-15"}, null, 2));
});
