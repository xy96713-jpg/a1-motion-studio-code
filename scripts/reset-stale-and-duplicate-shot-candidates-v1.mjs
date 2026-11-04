#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const targetIds = new Set(["ED-01", "ED-04", "ED-22"]);

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const targets = current.library.assets.filter((asset) => targetIds.has(asset.shotDemand?.shotId));
  for (const shot of targets) {
    shot.candidates = [];
    shot.candidateRender = null;
    shot.candidateSetAudit = null;
    shot.visualCritic = null;
    shot.selectedCandidateId = null;
    shot.automationBlock = null;
    shot.status = "brief-ready";
    shot.visualRevision = null;
    shot.review = {status: "pending", note: "系统检测到旧素材哈希或相邻重复，自动重建并换用新鲜候选。", reviewedAt: now, reviewedBy: "system-continuity-autopilot", approvedContentSha256: null};
  }
  current.production.maturityLoop.status = "running";
  current.production.maturityLoop.currentStage = "shot-candidates";
  current.production.maturityLoop.nextAction = "regenerate-stale-and-duplicate-shots";
  const event = createProductionEvent({workspace: current, action: "stale-and-duplicate-shot-candidates-reset", payload: {shotIds: [...targetIds], reason: "refresh-source-pack-and-avoid-exact-adjacent-still-duplicate"}, now});
  current.production.eventLedger.eventCount += 1;
  current.production.eventLedger.lastEventId = event.eventId;
  current.production.eventLedger.lastEventAt = event.createdAt;
  const next = recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, next, {event});
  console.log(JSON.stringify({status: "STALE_AND_DUPLICATE_SHOTS_RESET", shotIds: targets.map((shot) => shot.shotDemand.shotId)}, null, 2));
});
