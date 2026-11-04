#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = "f13e463d2826c6ef059c219abd39efd39b804d270e41223ad1f658e09a219793";
const batchCreatedAt = "2026-08-05T23:31:51.174Z";
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const now = new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error("stale-batch-abort-workspace-sha-changed");
  const next = structuredClone(current);
  const aborted = [];
  next.production.generation.jobs = next.production.generation.jobs.map((job) => {
    if (job.targetKind !== "package-look-master" || job.createdAt !== batchCreatedAt || !["queued", "running"].includes(job.status)) return job;
    const status = job.status === "running" ? "stale" : "cancelled";
    const updated = {
      ...job,
      status,
      error: "aborted-stale-plan-before-semantic-brief-recompile",
      staleReason: status === "stale" ? "stale-plan-legacy-semantic-prompt" : undefined,
      cancelledAt: status === "cancelled" ? now : undefined,
      startedAt: status === "stale" ? job.startedAt : null,
    };
    aborted.push({id: job.id, shotId: job.shotId, previousStatus: job.status, status});
    return updated;
  });
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.visualProductionRun = {
    ...(next.production.visualProductionRun || {}),
    status: "REPAIR_REQUIRED",
    repairReason: "legacy-look-master-plans-were-queued-before-current-semantic-brief-recompile",
    abortedStalePlanJobCount: aborted.length,
    updatedAt: now,
  };
  const event = createProductionEvent({
    workspace: current,
    action: "stale-whole-film-look-master-batch-aborted-before-semantic-recompile",
    targetId: "whole-film-look-master-batch-2026-08-05T23:31:51.174Z",
    payload: {aborted, preservedCompletedArtifacts: true, imageGenerationPerformed: true, semanticPlanInvalidated: true, singleWriterTaskId},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "current-project-visual-contract-upgrade-v1/stale-batch-abort.json": {
        contract: "A1StaleWholeFilmBatchAbort/v1",
        workspaceSha256Before: current.workspaceSha256,
        workspaceSha256After: recalculated.workspaceSha256,
        batchCreatedAt,
        aborted,
        preservedCompletedArtifacts: true,
        reason: "legacy-look-master-plans-were-queued-before-current-semantic-brief-recompile",
        singleWriterTaskId,
        generatedAt: now,
      },
    },
  });
  return {workspaceSha256: recalculated.workspaceSha256, aborted, generationSummary: recalculated.production.generation.summary};
});

console.log(JSON.stringify({status: "STALE_WHOLE_FILM_BATCH_ABORTED", ...result, singleWriterTaskId}, null, 2));
