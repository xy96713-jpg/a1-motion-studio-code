#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed01-c03-retry-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed01-c03-retry-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("ed01-c03-retry-generation-not-idle");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("ed01-c03-retry-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("ed01-c03-retry-assembly-already-created");
  const prior = current.production.generation.jobs.find((job) => job.id === "look-master-ed-01-c03-a978ade9063c");
  if (!prior || prior.status !== "failed" || prior.error !== "subscription-image-generation-timeout:360000ms" || prior.output || Number(prior.telemetry?.retryCount || 0) !== 1) throw new Error("ed01-c03-retry-target-not-single-timeout-failure");
  const next = structuredClone(current);
  const queued = queuePackageLookMasterGenerationJobs(next, "ED-01", {now: new Date().toISOString(), candidateIndices: [3], generationMode: "LOOK_MASTER_REPLACEMENT"});
  Object.assign(next, queued.workspace);
  if (queued.jobs.length !== 1) throw new Error("ed01-c03-retry-job-count-invalid");
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "starting";
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: next.production.generation.summary.queued};
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: current, action: "requeue-ed01-c03-look-master-timeout-once", targetId: prior.id, payload: {contract: "A1LookMasterExceptionRepairRetry/v2", shotId: "ED-01", candidateIndex: 3, priorJobId: prior.id, priorGenerationInputHash: prior.generationInputHash, newGenerationInputHash: queued.jobs[0].generationInputHash, retryLimit: 1, geometryContract: "TRUE_TRANSPARENT_PNG_LEFT_OF_SUBJECT_WITH_8_PERCENT_MARGIN", noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const files = {"look-master-exception-repair-v2/ed01-c03-retry.json": {contract: "A1LookMasterExceptionRepairRetryReport/v2", status: "QUEUED", workspaceSha256Before: current.workspaceSha256, priorJobId: prior.id, priorGenerationInputHash: prior.generationInputHash, newJobId: queued.jobs[0].id, newGenerationInputHash: queued.jobs[0].generationInputHash, retryLimit: 1, geometryContract: "TRUE_TRANSPARENT_PNG_LEFT_OF_SUBJECT_WITH_8_PERCENT_MARGIN", generatedAt: now}};
  const committed = persistProjectState(appRoot, persisted, {event, files, expectedWorkspaceSha256: current.workspaceSha256, commitId: `look-master-exception-repair-ed01-c03-retry-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, job: {id: queued.jobs[0].id, generationInputHash: queued.jobs[0].generationInputHash, outputRelativePath: queued.jobs[0].outputRelativePath}, queue: persisted.production.generation.summary, worker: persisted.production.generation.workerStatus, assembly: persisted.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
