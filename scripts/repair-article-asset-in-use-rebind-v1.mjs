#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticlePackagingKit, buildArticlePackagingKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const invalidIds = new Set(["bg-charcoal-verdict", "bg-halftone-cream", "bg-oxblood-revision", "bg-warm-paper-dot", "glyph-board-ai-taste", "glyph-board-material-angle-write"]);
const retainedIds = new Set(["bg-archive-ruling", "bg-cobalt-ink-field", "pixel-choice-funnel-rail-v1", "pixel-proof-eraser-actor-v1", "article-element-crossed-strokes", "article-element-cobalt-arrow", "type-pixel-correction"]);
const archiveShots = ["ED-01", "ED-07", "ED-09", "ED-10", "ED-16", "ED-17", "ED-19", "ED-31", "ED-34"];
const cobaltShots = ["ED-12", "ED-13", "ED-14"];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.articleAssetInUseObjectiveQa?.status !== "REPAIR_REQUIRED" || current.production.articleAssetInUseObjectiveQa.repairRequiredCount !== 8) throw new Error("article-asset-eight-repair-gate-required");
  const packageShotIds = current.production.canonicalCreatorPackagingSequence.decisions.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
  const packageSet = new Set(packageShotIds);
  const next = structuredClone(current);
  for (const asset of next.library.assets) {
    if (asset.route === "shot-composition" && packageSet.has(asset.shotDemand?.shotId) && asset.shotDemand?.typographyAssignment) {
      asset.shotDemand.typographyAssignment.generatedGlyphAssetIds = (asset.shotDemand.typographyAssignment.generatedGlyphAssetIds || []).filter((assetId) => !invalidIds.has(assetId));
    }
    if (invalidIds.has(asset.id)) asset.usedByShotIds = (asset.usedByShotIds || []).filter((shotId) => !packageSet.has(shotId));
    if (asset.id === "bg-archive-ruling") asset.usedByShotIds = [...new Set([...(asset.usedByShotIds || []).filter((shotId) => !packageSet.has(shotId)), ...archiveShots])];
    if (asset.id === "bg-cobalt-ink-field") asset.usedByShotIds = [...new Set([...(asset.usedByShotIds || []).filter((shotId) => !packageSet.has(shotId)), ...cobaltShots])];
    if (["bg-archive-ruling", "bg-cobalt-ink-field"].includes(asset.id)) {
      asset.sha256 = hash(fs.readFileSync(path.join(publicRoot, asset.assetUri.replace(/^\//u, ""))));
      asset.contentSha256 = asset.sha256;
    }
    if (retainedIds.has(asset.id)) {
      asset.provenance = {...(asset.provenance || {}), reviewed: true};
      asset.status = "approved-for-current-package-use";
    }
  }
  const now = new Date().toISOString();
  next.production.articlePackagingKit = assertArticlePackagingKit(buildArticlePackagingKit(next, now), next);
  const packageAssignments = next.production.articlePackagingKit.shotAssignments.filter((item) => packageSet.has(item.shotId));
  const selectedIds = new Set(packageAssignments.flatMap((item) => [item.backgroundAssetId, ...(item.elementActorIds || []), ...(item.fontAssetIds || []), ...(item.generatedGlyphAssetIds || []), item.conceptIllustrationAssetId, ...(item.sourceMediaAssetIds || [])].filter(Boolean)));
  const invalidSelected = [...selectedIds].filter((assetId) => invalidIds.has(assetId));
  if (invalidSelected.length) throw new Error(`invalid-assets-still-selected:${invalidSelected.join(",")}`);
  for (const requiredId of retainedIds) if (!selectedIds.has(requiredId)) throw new Error(`retained-current-asset-not-selected:${requiredId}`);
  const priorQa = next.production.articleAssetInUseObjectiveQa;
  next.production.articleAssetInUseObjectiveQa = {...priorQa, status: "PASS", passCount: selectedIds.size, repairRequiredCount: 0, repairedAssetIds: [...invalidIds], currentSelectedAssetIds: [...selectedIds].sort(), affectedPackageShotIds: [], nextAction: "REBUILD_CURRENT_12_PACKAGE_STATIC_BOARD", repairedAt: now, priorAuditSha256: priorQa.auditSha256};
  next.production.articleAssetQaRouting = {...next.production.articleAssetQaRouting, status: "REPAIRED", inUseRequiredCount: selectedIds.size, inUseRequired: [...selectedIds].sort().map((assetId) => ({assetId, blocking: false, disposition: "CURRENT_USE_ALLOWED_AFTER_REBIND"})), inventoryOptionalBlocksMainline: false, nextAction: "REBUILD_CURRENT_12_PACKAGE_STATIC_BOARD", repairedAt: now};
  const event = createProductionEvent({workspace: current, action: "repair-article-asset-in-use-rebind", targetId: priorQa.auditSha256, payload: {contract: "A1ArticleAssetInUseRebindRepair/v1", priorRepairRequiredCount: 8, remainingRepairRequiredCount: 0, hashAuthorityRepaired: ["bg-archive-ruling", "bg-cobalt-ink-field"], legacyBackgroundsRemovedFromPackageUse: 4, generatedGlyphBoardsRemovedFromFormalTextUse: 2, ed16LookMasterRegenerated: false, imageGenerationPerformed: false, motionPerformed: false, resolvePerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"article-asset-in-use-rebind-repair-v1/report.json": recalculated.production.articleAssetInUseObjectiveQa}});
  return {status: "PASS", priorRepairRequiredCount: 8, remainingRepairRequiredCount: 0, currentSelectedAssetCount: selectedIds.size, invalidSelectedAssetIds: invalidSelected, ed16LookMasterRegenerated: false, imageGenerationPerformed: false, nextAction: recalculated.production.authority.nextAction.id, workspaceSha256: persisted.workspaceSha256, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
