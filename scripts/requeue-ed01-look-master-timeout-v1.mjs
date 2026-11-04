#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
const targetJobId = "look-master-ed-01-c01-8e3cb696e80e";
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("requeue-ed01-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`requeue-ed01-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("requeue-ed01-generation-not-idle");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("requeue-ed01-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("requeue-ed01-assembly-already-created");
  const next = structuredClone(current);
  const job = next.production.generation.jobs.find((item) => item.id === targetJobId);
  if (!job || job.targetKind !== "package-look-master" || job.shotId !== "ED-01") throw new Error("requeue-ed01-target-job-missing");
  if (job.status !== "failed" || job.error !== "subscription-image-generation-timeout:360000ms" || job.output) throw new Error("requeue-ed01-target-not-single-timeout-failure");
  if (Number(job.telemetry?.retryCount || 0) !== 1) throw new Error("requeue-ed01-timeout-already-retried");
  job.status = "queued";
  job.error = null;
  job.completedAt = null;
  job.startedAt = null;
  job.durationMs = null;
  job.telemetry = {...job.telemetry, completedAt: null, startedAt: null, retryCount: 1, requeuedAt: new Date().toISOString()};
  next.production.generation.workerStatus = "starting";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 1};
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: current, action: "requeue-ed01-look-master-timeout-once", targetId: targetJobId, payload: {contract: "A1LookMasterExceptionRepairRetry/v1", shotId: "ED-01", candidateIndex: 1, generationInputHash: job.generationInputHash, priorError: "subscription-image-generation-timeout:360000ms", retryLimit: 1, noNewSha: true, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const committed = persistProjectState(appRoot, persisted, {event, files: {"look-master-exception-repair-v2/retry.json": {contract: "A1LookMasterExceptionRepairRetryReport/v1", status: "QUEUED", targetJobId, generationInputHash: job.generationInputHash, workspaceSha256Before: current.workspaceSha256, retryLimit: 1, noNewSha: true, queuedAt: now}}, expectedWorkspaceSha256: current.workspaceSha256, commitId: `look-master-exception-repair-ed01-retry-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", targetJobId, generationInputHash: job.generationInputHash, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, queue: persisted.production.generation.summary, worker: persisted.production.generation.workerStatus, assembly: persisted.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
