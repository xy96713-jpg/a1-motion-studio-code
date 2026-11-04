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
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};
const expectedWorkspaceSha256 = valueAfter("--expected-workspace-sha");
const assetIds = String(valueAfter("--asset-ids") || "").split(",").map((value) => value.trim()).filter(Boolean);
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const selectedAssetIds = (workspace) => new Set((workspace.production.articlePackagingKit?.shotAssignments || []).flatMap((item) => [
  item.backgroundAssetId,
  ...(item.elementActorIds || []),
  ...(item.fontAssetIds || []),
  ...(item.generatedGlyphAssetIds || []),
  item.conceptIllustrationAssetId,
  ...(item.sourceMediaAssetIds || []),
].filter(Boolean)));

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("asset-byte-sha-repair-expected-workspace-sha-required");
if (!assetIds.length || new Set(assetIds).size !== assetIds.length) throw new Error("asset-byte-sha-repair-unique-asset-ids-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`asset-byte-sha-repair-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("asset-byte-sha-repair-requires-frozen-empty-queue");
  const selected = selectedAssetIds(current);
  const selectedBefore = [...selected].sort();
  const next = structuredClone(current);
  const repairs = assetIds.map((assetId) => {
    const asset = next.library.assets.find((item) => item.id === assetId);
    if (!asset) throw new Error(`asset-byte-sha-repair-asset-missing:${assetId}`);
    if (asset.review?.status !== "pending" || asset.review?.approvedContentSha256) throw new Error(`asset-byte-sha-repair-pending-unapproved-required:${assetId}`);
    if (!String(asset.assetUri || "").startsWith("/generated/")) throw new Error(`asset-byte-sha-repair-public-generated-uri-required:${assetId}`);
    const file = path.resolve(publicRoot, asset.assetUri.replace(/^\//u, ""));
    if (!file.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(file)) throw new Error(`asset-byte-sha-repair-file-missing:${assetId}`);
    const actualSha256 = sha256File(file);
    if (actualSha256 === asset.sha256) throw new Error(`asset-byte-sha-repair-no-drift:${assetId}`);
    const repair = {assetId, assetUri: asset.assetUri, previousSha256: asset.sha256, actualSha256, reviewStatus: asset.review.status, selectedByCurrentPackage: selected.has(assetId)};
    asset.sha256 = actualSha256;
    return repair;
  });
  const now = new Date().toISOString();
  const event = dryRun ? null : createProductionEvent({workspace: current, action: "repair-asset-byte-sha-drift", targetId: assetIds.join(","), payload: {contract: "A1AssetByteShaDriftRepair/v1", repairs, reviewStatusesPreserved: true, currentPackageBindingsChanged: false, generationPerformed: false, assemblyStarted: false}, now});
  if (event) {
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
  }
  const beforeGate = JSON.stringify({currentStage: current.production.authority.currentStage, nextAction: current.production.authority.nextAction});
  const beforeQueue = JSON.stringify(current.production.generation.summary);
  const beforeAssemblyCount = current.production.shotIntelligence.currentAssembly.length;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  if (JSON.stringify([...selectedAssetIds(recalculated)].sort()) !== JSON.stringify(selectedBefore)) throw new Error("asset-byte-sha-repair-current-package-bindings-mutated");
  if (JSON.stringify({currentStage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction}) !== beforeGate) throw new Error("asset-byte-sha-repair-gate-mutated");
  if (JSON.stringify(recalculated.production.generation.summary) !== beforeQueue || recalculated.production.generation.workerStatus !== "frozen") throw new Error("asset-byte-sha-repair-queue-mutated");
  if (recalculated.production.shotIntelligence.currentAssembly.length !== beforeAssemblyCount) throw new Error("asset-byte-sha-repair-assembly-mutated");
  const report = {
    contract: "A1AssetByteShaDriftRepair/v1",
    status: dryRun ? "DRY_RUN_PASS" : "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: recalculated.workspaceSha256,
    repairs,
    authority: {currentStage: recalculated.production.authority.currentStage, nextAction: recalculated.production.authority.nextAction},
    generation: {summary: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus},
    assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length,
    generatedAt: now,
  };
  if (dryRun) return report;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `asset-byte-sha-drift-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"asset-byte-sha-drift-repair-v1/report.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256};
});

console.log(JSON.stringify(result, null, 2));
