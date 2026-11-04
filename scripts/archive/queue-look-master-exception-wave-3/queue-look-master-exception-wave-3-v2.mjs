#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("wave-3-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`wave-3-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("wave-3-generation-not-idle");
  if (current.production.generation.workerStatus !== "frozen") throw new Error("wave-3-worker-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("wave-3-assembly-already-created");
  const next = structuredClone(current);
  const queued = queuePackageLookMasterGenerationJobs(next, "ED-01", {now: new Date().toISOString(), candidateIndices: [2, 3], generationMode: "LOOK_MASTER_REPLACEMENT"});
  Object.assign(next, queued.workspace);
  if (queued.jobs.length !== 2 || new Set(queued.jobs.map((job) => job.generationInputHash)).size !== 2) throw new Error("wave-3-job-count-invalid");
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "starting";
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: next.production.generation.summary.queued};
  const now = new Date().toISOString();
  const event = createProductionEvent({workspace: current, action: "queue-look-master-exception-repair-wave-3", targetId: "ED-01", payload: {contract: "A1LookMasterExceptionRepairWave/v2", replacementCount: 2, targetShotIds: ["ED-01"], candidateIndices: {"ED-01": [2, 3]}, overlayOutputContract: "TRUE_TRANSPARENT_PNG_HOLD_FRAME_REFERENCE_ONLY", concurrencyHardMax: 2, noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const files = {"look-master-exception-repair-v2/wave-3.json": {contract: "A1LookMasterExceptionRepairWaveReport/v2", status: "WAVE_3_QUEUED", workspaceSha256Before: current.workspaceSha256, targetShotIds: ["ED-01"], jobs: queued.jobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, outputRelativePath: job.outputRelativePath})), overlayOutputContract: "TRUE_TRANSPARENT_PNG_HOLD_FRAME_REFERENCE_ONLY", noAssembly: true, noLayerReconstruction: true, noCritic: true, noMotion: true, generatedAt: now}};
  const committed = persistProjectState(appRoot, persisted, {event, files, expectedWorkspaceSha256: current.workspaceSha256, commitId: `look-master-exception-repair-wave-3-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {status: "PASS", workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, jobs: queued.jobs.map((job) => ({id: job.id, shotId: job.shotId, candidateIndex: job.candidateIndex, generationInputHash: job.generationInputHash, outputRelativePath: job.outputRelativePath})), queue: persisted.production.generation.summary, worker: persisted.production.generation.workerStatus, assembly: persisted.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
