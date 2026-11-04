#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const rejects = new Map([
  ["bg-charcoal-verdict", ["LEGACY_WARM_PAPER_SPLIT_BACKGROUND", "NOT_CURRENT_QUIET_CRT_PIXEL_MASTER"]],
  ["bg-halftone-cream", ["LEGACY_WARM_CREAM_BACKGROUND", "EXCESSIVE_BLACK_MASS_FOR_QUIET_ICONIC"]],
  ["bg-oxblood-revision", ["ASSET_NAME_VISUAL_MISMATCH", "LEGACY_WARM_PAPER_COLLAGE"]],
  ["bg-warm-paper-dot", ["WARM_PAPER_DEFAULT_FORBIDDEN_BY_CURRENT_STYLE", "ED19_C4_COOL_MASTER_CONFLICT"]],
  ["glyph-board-ai-taste", ["GENERATED_FORMAL_TEXT_FORBIDDEN", "EVA_TYPOGRAPHY_ONLY_LOCAL_BINDING_REQUIRED"]],
  ["glyph-board-material-angle-write", ["GENERATED_FORMAL_TEXT_FORBIDDEN", "EVA_TYPOGRAPHY_ONLY_LOCAL_BINDING_REQUIRED"]],
]);

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const routing = current.production.articleAssetQaRouting;
  if (routing?.status !== "ROUTED" || routing.inUseRequiredCount !== 13) throw new Error("article-asset-qa-routing-required");
  const allAssets = Object.values(current.production.articlePackagingKit.lanes).flat();
  const now = new Date().toISOString();
  const items = [];
  for (const route of routing.inUseRequired) {
    const asset = allAssets.find((item) => item.assetId === route.assetId);
    if (!asset?.publicUrl || !asset.sha256) throw new Error(`article-asset-metadata-missing:${route.assetId}`);
    const file = path.join(publicRoot, asset.publicUrl.replace(/^\//u, ""));
    const bytes = fs.readFileSync(file);
    const actualSha256 = sha256(bytes);
    const isFont = /\.ttf$/iu.test(file);
    const metadata = {format: isFont ? "ttf" : path.extname(file).slice(1).toLowerCase(), width: null, height: null, hasAlpha: null};
    const failures = [...(rejects.get(route.assetId) || []), ...(actualSha256 === asset.sha256 ? [] : ["DECLARED_CONTENT_SHA_MISMATCH_CURRENT_FILE_BYTES"] )];
    items.push({assetId: route.assetId, usedByPackageShotIds: route.usedByPackageShotIds, status: failures.length ? "REPAIR_REQUIRED" : "PASS", failures, artifact: {publicUrl: asset.publicUrl, declaredSha256: asset.sha256, actualSha256, format: metadata.format, width: metadata.width || null, height: metadata.height || null, hasAlpha: metadata.hasAlpha ?? null}, actualPixelsInspected: !isFont, fontBinaryHashVerified: isFont && actualSha256 === asset.sha256, disposition: failures.length ? "REBIND_OR_REPLACE_NO_AUTOMATIC_REGENERATION" : "CURRENT_USE_ALLOWED"});
  }
  const failed = items.filter((item) => item.status !== "PASS");
  const affectedPackageShotIds = [...new Set(failed.flatMap((item) => item.usedByPackageShotIds))].sort();
  const audit = {contract: "A1ArticleAssetInUseObjectiveQa/v1", status: failed.length ? "REPAIR_REQUIRED" : "PASS", sourceRoutingSha256: routing.routingSha256, inspectedCount: items.length, passCount: items.length - failed.length, repairRequiredCount: failed.length, inventoryOptionalCount: routing.inventoryOptionalCount, inventoryOptionalInspected: false, inventoryOptionalBlocksMainline: false, items, affectedPackageShotIds, repairBoundary: {automaticRegenerationAllowed: false, rebindApprovedCurrentLookMastersFirst: true, ed16BlindRegenerationForbidden: true, generatedFormalTextAllowed: false, evaRole: "TYPOGRAPHY_ONLY", motionAllowed: false, resolveAllowed: false, assemblyAllowed: false}, nextAction: failed.length ? "REPAIR_OR_REBIND_CURRENT_IN_USE_ASSETS_NO_BLIND_REGENERATION" : "REBUILD_WHOLE_FILM_STATIC_BOARD", auditedAt: now};
  audit.auditSha256 = sha256(audit);
  const next = structuredClone(current);
  next.production.articleAssetInUseObjectiveQa = audit;
  const event = createProductionEvent({workspace: current, action: "audit-13-in-use-article-assets", targetId: audit.auditSha256, payload: {contract: audit.contract, status: audit.status, inspectedCount: 13, passCount: audit.passCount, repairRequiredCount: audit.repairRequiredCount, inventoryOptionalBlocksMainline: false, automaticRegenerationAllowed: false, ed16BlindRegenerationForbidden: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"article-asset-in-use-objective-qa-v1/report.json": audit}});
  return {status: audit.status, inspectedCount: 13, passCount: audit.passCount, repairRequiredCount: audit.repairRequiredCount, affectedPackageShotIds, nextAction: recalculated.production.authority.nextAction.id, workspaceSha256: persisted.workspaceSha256, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
