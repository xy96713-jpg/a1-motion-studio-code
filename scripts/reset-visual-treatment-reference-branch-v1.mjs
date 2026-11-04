#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  ensureVisualGenerationDirector,
  queueTreatmentAnchorGeneration,
} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const previous = current.production.visualDirector;
  const archived = {
    contract: "A1VisualDirectorBranchArchive/v1",
    archivedAt: now,
    reason: "user-reported-photorealistic-reference-mismatch",
    selectedTreatmentId: previous?.selectedTreatmentId || null,
    treatmentHash: previous?.treatmentHash || null,
    candidateIds: (previous?.generatedCandidates || []).map((candidate) => candidate.id),
    compositeReviewCount: previous?.compositeReviews?.length || 0,
    status: previous?.status || null,
  };
  current.production.visualDirectorArchive = [
    ...(current.production.visualDirectorArchive || []).slice(-3),
    archived,
  ];

  let stopped = 0;
  for (const job of current.production.generation.jobs || []) {
    if (["queued", "running"].includes(job.status)) {
      Object.assign(job, {
        status: "failed",
        error: "stopped-for-reference-reset",
        completedAt: now,
        telemetry: {...(job.telemetry || {}), stoppedAt: now, stopReason: "reference-reset"},
      });
      stopped += 1;
    }
  }
  current.production.generation.workerStatus = "idle";
  current.production.generation.providerState = {
    ...(current.production.generation.providerState || {}),
    status: "reference-reset",
    lastResetAt: now,
    lastResetReason: "photorealistic-branch-archived-before-new-anchor-suite",
  };

  delete current.production.visualDirector;
  ensureVisualGenerationDirector(current, now);
  const ranked = current.production.visualDirector.rankedTreatmentIds;
  if (!ranked.includes("flat-editorial-evidence")) throw new Error("flat-editorial-treatment-not-ranked-top-three");
  const queued = queueTreatmentAnchorGeneration(current, now);
  const next = queued.workspace;
  next.production.generation.workerStatus = queued.jobs.some((job) => job.status === "queued") ? "starting" : "idle";
  next.production.visualDirector.status = "treatment-review-required";
  next.production.visualDirector.updatedAt = now;
  next.production.maturityLoop.status = "running";
  next.production.maturityLoop.currentStage = "visual-treatment-review";
  next.production.maturityLoop.nextAction = "review-flat-editorial-evidence-anchor-suite";

  const event = createProductionEvent({
    workspace: current,
    action: "visual-treatment-reference-branch-reset",
    payload: {
      stoppedRunningOrQueuedJobs: stopped,
      archivedTreatmentId: archived.selectedTreatmentId,
      rankedTreatmentIds: ranked,
      requestedReferenceSourceIds: ["hupo", "magnates-media"],
      queuedAnchorJobIds: queued.jobs.map((job) => job.id),
      fullBatchQueued: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  persistProjectState(appRoot, recalculated, {event});
  console.log(JSON.stringify({
    status: "VISUAL_TREATMENT_REFERENCE_BRANCH_RESET",
    stopped,
    rankedTreatmentIds: ranked,
    queuedAnchorJobs: queued.jobs.length,
    queuedAnchorBriefs: queued.jobs.map((job) => `${job.shotId}:${job.layerId}`),
    fullBatchQueued: false,
  }, null, 2));
});
