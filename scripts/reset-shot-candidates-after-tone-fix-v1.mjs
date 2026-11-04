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
  const targetIds = new Set(["ED-19"]);
  const targets = current.library.assets.filter((asset) => targetIds.has(asset.shotDemand?.shotId));
  for (const shot of targets) {
    shot.candidates = [];
    shot.candidateRender = null;
    shot.candidateSetAudit = null;
    shot.visualCritic = null;
    shot.selectedCandidateId = null;
    shot.automationBlock = null;
    shot.status = "brief-ready";
    shot.review = {status: "pending", note: "全文包装候选按真实文档页像素对比规则自动重建。", reviewedAt: now, reviewedBy: "system-contrast-rebuild", approvedContentSha256: null};
    shot.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: null, prompt: "真实文档页上的职责字词必须自动选择可读对比色。", createdAt: now};
  }
  current.production.maturityLoop.status = "running";
  current.production.maturityLoop.currentStage = "shot-candidates";
  current.production.maturityLoop.nextAction = "regenerate-full-package-contrast-candidates";
  const event = createProductionEvent({workspace: current, action: "full-package-candidates-reset-after-tone-fix", payload: {shotIds: [...targetIds], rule: "source-documentary-word-actors-use-dark-ink-on-page"}, now});
  current.production.eventLedger.eventCount += 1;
  current.production.eventLedger.lastEventId = event.eventId;
  current.production.eventLedger.lastEventAt = event.createdAt;
  const next = recalculateEditorialAssetWorkbench(current, now);
  persistProjectState(appRoot, next, {event});
  console.log(JSON.stringify({status: "FULL_PACKAGE_CANDIDATES_RESET", shotIds: targets.map((shot) => shot.shotDemand.shotId)}, null, 2));
});
