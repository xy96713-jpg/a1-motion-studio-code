#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const qaReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/article-packaging-automatic-qa-v1/report.json");
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const qa = JSON.parse(fs.readFileSync(qaReportPath, "utf8"));
  if (qa.status !== "WAITING_ON_OBJECTIVE_ASSET_QA" || qa.blockerCount !== 29) throw new Error("article-asset-qa-29-pending-required");
  if (current.production.creatorPaletteShotBindingManifest?.status !== "PASS") throw new Error("creator-palette-binding-pass-required");
  const packageShotIds = current.production.canonicalCreatorPackagingSequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
  const packageSet = new Set(packageShotIds);
  const selectedByAsset = new Map();
  for (const assignment of current.production.articlePackagingKit.shotAssignments.filter((item) => packageSet.has(item.shotId))) {
    const ids = [assignment.backgroundAssetId, ...(assignment.elementActorIds || []), ...(assignment.fontAssetIds || []), ...(assignment.generatedGlyphAssetIds || []), assignment.conceptIllustrationAssetId, ...(assignment.sourceMediaAssetIds || [])].filter(Boolean);
    for (const assetId of ids) selectedByAsset.set(assetId, [...new Set([...(selectedByAsset.get(assetId) || []), assignment.shotId])]);
  }
  const pendingIds = qa.blockers.map((blocker) => String(blocker).split(":")[0]);
  const required = pendingIds.filter((assetId) => selectedByAsset.has(assetId)).map((assetId) => ({assetId, usedByPackageShotIds: selectedByAsset.get(assetId), blocking: true, nextAction: "OBJECTIVE_ASSET_QA_REQUIRED"}));
  const optional = pendingIds.filter((assetId) => !selectedByAsset.has(assetId)).map((assetId) => ({assetId, usedByPackageShotIds: [], blocking: false, disposition: "INVENTORY_OPTIONAL_DEFERRED"}));
  if (required.length !== 13 || optional.length !== 16) throw new Error(`article-asset-qa-routing-count-drift:${required.length}:${optional.length}`);
  const now = new Date().toISOString();
  const routing = {contract: "A1ArticleAssetQaRouting/v1", status: "ROUTED", sourceQaAuditSha256: qa.auditSha256, packageShotIds, pendingCount: pendingIds.length, inUseRequiredCount: required.length, inventoryOptionalCount: optional.length, inUseRequired: required, inventoryOptional: optional, inventoryOptionalBlocksMainline: false, motionAllowed: false, resolveAllowed: false, assemblyAllowed: false, nextAction: "RUN_OBJECTIVE_QA_FOR_13_IN_USE_ASSETS", routedAt: now};
  routing.routingSha256 = sha256(routing);
  const next = structuredClone(current);
  next.production.articleAssetQaRouting = routing;
  const event = createProductionEvent({workspace: current, action: "route-article-asset-qa-in-use-vs-inventory", targetId: routing.routingSha256, payload: {contract: routing.contract, pendingCount: 29, inUseRequiredCount: 13, inventoryOptionalCount: 16, inventoryOptionalBlocksMainline: false, motionAllowed: false, resolveAllowed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"article-asset-qa-routing-v1/report.json": routing}});
  return {status: routing.status, pendingCount: 29, inUseRequiredCount: 13, inventoryOptionalCount: 16, nextAction: recalculated.production.authority.nextAction.id, workspaceSha256: persisted.workspaceSha256, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
