#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-master-layer-canary-expected-workspace-sha-required");

const result = await withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-master-layer-canary-workspace-cas-failed:${current.workspaceSha256}`);
  const pilot = current.production.shotIntelligence.approvedMasterLayerPilot;
  if (pilot?.status !== "READY_FROZEN" || pilot.allowedJobCount !== pilot.allowedJobIds?.length || current.production.generation.workerStatus !== "frozen" || current.production.generation.summary.running !== 0) throw new Error("approved-master-layer-canary-ready-frozen-pilot-required");
  const queued = current.production.generation.jobs.filter((job) => job.targetKind === "package-layer" && job.status === "queued" && pilot.allowedJobIds.includes(job.id));
  const typography = queued.find((job) => job.shotId === "ED-08" && job.packageLayerKind === "TYPOGRAPHY");
  const background = queued.find((job) => job.shotId === "ED-14" && job.packageLayerKind === "BACKGROUND");
  if (!typography || !background) throw new Error("approved-master-layer-canary-targets-missing");
  const dispatchJobIds = [typography.id, background.id];
  let next = structuredClone(current);
  next.production.shotIntelligence.approvedMasterLayerPilot = {...pilot, status: "DISPATCH_ALLOWED", dispatchWave: "CANARY_ALPHA_AND_BACKGROUND", dispatchJobIds, dispatchShotIds: ["ED-08", "ED-14"], dispatchStartedAt: null};
  next.production.generation.automaticDispatchAllowed = true;
  next.production.generation.workerStatus = "idle";
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, new Date().toISOString()));
  assert.equal(next.production.generation.automaticDispatchAllowed, true);
  assert.equal(next.production.generation.workerStatus, "idle");
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: current, action: "enable-approved-master-layer-canary", targetId: dispatchJobIds.join(","), payload: {pilotSha256: pilot.pilotSha256, dispatchWave: "CANARY_ALPHA_AND_BACKGROUND", dispatchJobIds, concurrencyHardMax: 2}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `approved-master-layer-canary-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/canary-dispatch.json": {contract: "A1ApprovedMasterLayerCanaryDispatch/v1", status: "DISPATCH_ALLOWED", pilotSha256: pilot.pilotSha256, dispatchJobIds, alphaJobId: typography.id, backgroundJobId: background.id, concurrencyHardMax: 2, workerStatus: "idle", dispatchedAt: now}}});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, dispatchJobIds, workerStatus: next.production.generation.workerStatus, automaticDispatchAllowed: next.production.generation.automaticDispatchAllowed};
});

console.log(JSON.stringify(result, null, 2));
