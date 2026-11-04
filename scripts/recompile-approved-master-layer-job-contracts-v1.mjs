#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";

import {buildApprovedMasterLayerJobPreflight} from "../apps/studio-next/src/lib/a1-approved-master-layer-job-preflight-v1.mjs";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {queuePackageLayerGenerationJobs} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-master-layer-contracts-expected-workspace-sha-required");

const result = await withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-master-layer-contracts-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.workerStatus !== "frozen" || current.production.generation.summary.running !== 0) throw new Error("approved-master-layer-contracts-frozen-worker-required");
  const queuedBefore = current.production.generation.summary.queued;
  let next = structuredClone(current);
  const shotIds = next.production.shotIntelligence.packageAssetKitPlans.filter((plan) => plan.current === true && plan.authorityScope === "CURRENT").map((plan) => plan.shotId).sort();
  for (const shotId of shotIds) next = queuePackageLayerGenerationJobs(next, shotId, {now: new Date().toISOString()}).workspace;
  const now = new Date().toISOString();
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.generation.summary.queued, queuedBefore);
  assert.equal(next.production.generation.summary.running, 0);
  assert.equal(next.production.generation.workerStatus, "frozen");
  const preflight = buildApprovedMasterLayerJobPreflight(next, {publicRoot, now});
  assert.equal(preflight.status, "PASS");
  next.production.shotIntelligence.approvedMasterLayerJobPreflight = {contract: preflight.contract, status: preflight.status, manifestSha256: preflight.manifestSha256, queuedJobCount: preflight.queuedJobCount, blockedCount: preflight.blockedCount, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/approved-master-layer-reconstruction-v1/preflight.json", updatedAt: now};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "recompile-approved-master-layer-job-contracts", targetId: runtimeTarget(shotIds), payload: {preflightManifestSha256: preflight.manifestSha256, queuedJobCount: preflight.queuedJobCount, workerStatus: "frozen"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `approved-master-layer-contracts-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/preflight.json": preflight}});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, shotCount: shotIds.length, queuedJobCount: preflight.queuedJobCount, blockedJobCount: preflight.blockedCount, preflightManifestSha256: preflight.manifestSha256, workerStatus: next.production.generation.workerStatus, runningCount: next.production.generation.summary.running};
});

function runtimeTarget(shotIds) {
  return shotIds.join(",");
}

console.log(JSON.stringify(result, null, 2));
