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
  const targets = current.library.assets.filter((asset) => asset.route === "shot-composition"
    && (asset.shotDemand?.editMode === "screen-demo")
    && (asset.visualCritic?.hardFailures || []).some((failure) => [
      "screen-candidates-lack-context-and-action-close-options",
      "no-candidate-clears-local-scene-graph-preflight",
      "candidate-variants-visually-duplicate",
    ].includes(failure)));
  for (const shot of targets) {
    shot.candidates = [];
    shot.candidateRender = null;
    shot.candidateSetAudit = null;
    shot.visualCritic = null;
    shot.selectedCandidateId = null;
    shot.automationBlock = null;
    shot.status = "brief-ready";
    shot.review = {
      status: "pending",
      note: "真实录屏候选已按因果双视图规则自动重建：上下文建立 → 操作近景 → 结果确认。",
      reviewedAt: now,
      reviewedBy: "system-causal-layout-rebuild",
      approvedContentSha256: null,
    };
    if (current.production.maturityLoop.shotReports) delete current.production.maturityLoop.shotReports[shot.shotDemand.shotId];
  }
  current.production.maturityLoop.status = "running";
  current.production.maturityLoop.currentStage = "shot-candidates";
  current.production.maturityLoop.nextAction = "regenerate-screen-causal-candidates";
  const event = createProductionEvent({
    workspace: current,
    action: "screen-shot-candidates-reset-after-causal-layout-fix",
    payload: {shotIds: targets.map((shot) => shot.shotDemand.shotId), layoutRule: "alternating-context-and-action-close"},
    now,
  });
  current.production.eventLedger.eventCount += 1;
  current.production.eventLedger.lastEventId = event.eventId;
  current.production.eventLedger.lastEventAt = event.createdAt;
  const next = recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, next, {event});
  return {shotIds: targets.map((shot) => shot.shotDemand.shotId), workspace: next};
});

console.log(JSON.stringify({status: "SCREEN_CANDIDATES_RESET", shotIds: updated.shotIds}, null, 2));
