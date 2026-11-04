#!/usr/bin/env node
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const queued = queuePackageLookMasterGenerationJobs(current, "ED-10", {now});
  const event = createProductionEvent({
    workspace: current,
    action: "ed10-look-master-fast-discovery-queued",
    targetId: "ED-10",
    payload: {
      jobCount: queued.jobs.length,
      generationMode: "FAST_CANDIDATE_DISCOVERY",
      holdFrameReference: queued.jobs[0]?.referenceInputs?.[0] || null,
      remoteCritic: false,
    },
    now,
  });
  queued.workspace.production.eventLedger.eventCount += 1;
  queued.workspace.production.eventLedger.lastEventId = event.eventId;
  queued.workspace.production.eventLedger.lastEventAt = event.createdAt;
  const next = recalculateEditorialAssetWorkbench(queued.workspace, now);
  persistProjectState(appRoot, next, {event});
  console.log(JSON.stringify({
    status: "PASS",
    workspaceSha256: next.workspaceSha256,
    jobCount: queued.jobs.length,
    jobs: queued.jobs.map((job) => ({
      id: job.id,
      generationMode: job.generationMode,
      inputHash: job.generationInputHash,
      references: job.referenceInputs.map((item) => ({id: item.id, role: item.role, sha256: item.sha256})),
    })),
    queue: next.production.generation.summary,
  }, null, 2));
});
