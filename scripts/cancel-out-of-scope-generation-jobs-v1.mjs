#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = structuredClone(current);
  const cancelled = [];
  next.production.generation.jobs = next.production.generation.jobs.map((job) => {
    if (job.shotId !== "ED-07" || !["queued", "running"].includes(job.status)) return job;
    const updated = {
      ...job,
      status: "cancelled",
      error: "cancelled-out-of-scope-anchor-gate",
      cancelledAt: now,
      cancelReason: "progressive-shot-generation-is-locked-until-anchor-suite-approval",
      startedAt: null,
    };
    cancelled.push({id: job.id, shotId: job.shotId, previousStatus: job.status, status: updated.status});
    return updated;
  });
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "idle";
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.nextAction = "continue-anchor-suite-only";
  const event = createProductionEvent({
    workspace: current,
    action: "out-of-scope-progressive-generation-cancelled",
    targetId: "ED-07",
    payload: {cancelled, reason: "progressive-shot-generation-is-locked-until-anchor-suite-approval"},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  assertEditorialAssetWorkbench(recalculated);
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "anchor-suite-scheduler-fix-v1/cancelled-progressive-jobs.json": {
        contract: "A1OutOfScopeGenerationCancellation/v1",
        cancelledAt: now,
        cancelled,
        schedulerPolicy: "progressive-shot-generation-is-locked-until-anchor-suite-approval",
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  return {workspaceSha256: recalculated.workspaceSha256, cancelled, generationSummary: recalculated.production.generation.summary};
});

console.log(JSON.stringify({status: "OUT_OF_SCOPE_PROGRESSIVE_JOBS_CANCELLED", ...result}, null, 2));
