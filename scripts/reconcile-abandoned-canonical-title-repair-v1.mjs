#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const manifest = current.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  if (!manifest || manifest.boardRebuilt !== false || manifest.generationDispatched !== true) {
    throw new Error("abandoned-canonical-title-repair-current-dispatch-required");
  }

  const activeJobs = (current.production.generation.jobs || []).filter((job) => ["queued", "running"].includes(job.status));
  if (activeJobs.length > 0) throw new Error("abandoned-canonical-title-repair-active-jobs-remain");

  const targetShotIds = [...(manifest.generationEligibleShotIds || [])];
  if (targetShotIds.length === 0) throw new Error("abandoned-canonical-title-repair-targets-required");
  const currentWaveJobs = (current.production.generation.jobs || []).filter((job) => job.canonicalRepairBinding?.authoritySha256 === manifest.authoritySha256
    && job.canonicalRepairBinding?.manifestSha256 === manifest.manifestSha256);
  const latestCompleteJobByShot = new Map();
  for (const job of currentWaveJobs) {
    if (job.status !== "complete" || !targetShotIds.includes(job.shotId)) continue;
    const incumbent = latestCompleteJobByShot.get(job.shotId);
    if (!incumbent || String(job.completedAt || "") > String(incumbent.completedAt || "")) latestCompleteJobByShot.set(job.shotId, job);
  }
  const completedShotIds = targetShotIds.filter((shotId) => latestCompleteJobByShot.has(shotId));
  const retryRequiredShotIds = targetShotIds.filter((shotId) => !latestCompleteJobByShot.has(shotId));
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const nextManifest = next.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  nextManifest.checkpoint = "CANONICAL_TITLE_REPAIR_PENDING";
  nextManifest.generationDispatched = false;
  nextManifest.dispatchBatchId = null;
  nextManifest.dispatchedShotIds = [];
  nextManifest.retryRequiredShotIds = retryRequiredShotIds;
  nextManifest.updatedAt = now;
  nextManifest.entries = (nextManifest.entries || []).map((entry) => {
    if (!targetShotIds.includes(entry.shotId)) return entry;
    const completeJob = latestCompleteJobByShot.get(entry.shotId);
    if (completeJob) return {
      ...entry,
      status: "TARGET_REPAIR_GENERATED_AWAITING_PIXEL_AUDIT",
      generationAllowed: false,
      generationState: "COMPLETE",
      nextAction: {action: "ACTUAL_PIXEL_REVIEW"},
      jobKey: completeJob.id,
      completedAt: completeJob.completedAt || now,
      finalSha: completeJob.output?.sha256 || null,
    };
    const reset = {
      ...entry,
      status: "TARGET_REPAIR_GENERATION_ELIGIBLE",
      generationAllowed: true,
      generationState: "ELIGIBLE",
      nextAction: {action: "DISPATCH"},
    };
    for (const key of ["jobKey", "queuedAt", "completedAt", "finalSha", "auditSha", "auditSha256", "actualAuditBinding", "dispatchBatchId"]) delete reset[key];
    return reset;
  });
  const manifestHashInput = structuredClone(nextManifest);
  delete manifestHashInput.manifestSha256;
  nextManifest.manifestSha256 = sha256(manifestHashInput);

  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
    authoritySha256: nextManifest.authoritySha256,
    manifestSha256: nextManifest.manifestSha256,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
  };
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";

  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "abandoned-canonical-title-repair-reconciled",
    targetId: targetShotIds.join(","),
    payload: {
      contract: "A1AbandonedCanonicalTitleRepairReconciliation/v1",
      previousManifestSha256: manifest.manifestSha256,
      manifestSha256: nextManifest.manifestSha256,
      completedShotIds,
      retryRequiredShotIds,
      queue: recalculated.production.generation.summary,
      workerStatus: recalculated.production.generation.workerStatus,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      motionPerformed: false,
    },
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `abandoned-canonical-title-repair-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "semantic-authority-convergence-v1/abandoned-generation-reconcile-report.json": {
        contract: "A1AbandonedCanonicalTitleRepairReconciliation/v1",
        status: "PASS",
        previousManifestSha256: manifest.manifestSha256,
        manifestSha256: nextManifest.manifestSha256,
        completedShotIds,
        retryRequiredShotIds,
        queue: recalculated.production.generation.summary,
        workerStatus: recalculated.production.generation.workerStatus,
        automaticDispatchAllowed: recalculated.production.generation.automaticDispatchAllowed,
        reconciledAt: now,
      },
    },
  });
  return {
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: persisted.workspaceSha256,
    previousManifestSha256: manifest.manifestSha256,
    manifestSha256: nextManifest.manifestSha256,
    completedShotIds,
    retryRequiredShotIds,
    lifecycleStatus: recalculated.production.authority.currentStage,
    nextAction: recalculated.production.authority.nextAction?.id || null,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    automaticDispatchAllowed: recalculated.production.generation.automaticDispatchAllowed,
  };
});

console.log(JSON.stringify(result, null, 2));
