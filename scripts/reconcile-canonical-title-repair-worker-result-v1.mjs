#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const manifest = runtime.canonicalDirectorTargetRepairManifest;
  if (!manifest || manifest.boardRebuilt !== false) throw new Error("canonical-title-repair-manifest-current-required");
  const authoritySha256 = manifest.authoritySha256;
  // Queue jobs are stamped just before the manifest is persisted; allow a
  // small clock/order skew while excluding earlier historical attempts.
  const dispatchStartedAt = Math.max(0, (Date.parse(manifest.generatedAt || "") || 0) - 60_000);
  const scopedJobs = current.production.generation.jobs.filter((job) => job.canonicalRepairBinding?.authoritySha256 === authoritySha256
    && (Date.parse(job.createdAt || "") || 0) >= dispatchStartedAt);
  const failedShotIds = [...new Set(scopedJobs.filter((job) => job.status === "failed").map((job) => job.shotId).filter(Boolean))];
  const activeShotIds = [...new Set(scopedJobs.filter((job) => ["queued", "running"].includes(job.status)).map((job) => job.shotId).filter(Boolean))];
  if (!failedShotIds.length) throw new Error("canonical-title-repair-worker-failure-not-found");
  if (activeShotIds.length) throw new Error("canonical-title-repair-active-jobs-remain");
  const next = structuredClone(current);
  const nextManifest = next.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  nextManifest.checkpoint = "CANONICAL_TITLE_REPAIR_PENDING";
  nextManifest.generationDispatched = false;
  nextManifest.retryRequiredShotIds = failedShotIds;
  nextManifest.updatedAt = new Date().toISOString();
  const manifestHashInput = structuredClone(nextManifest);
  delete manifestHashInput.manifestSha256;
  nextManifest.manifestSha256 = sha256(manifestHashInput);
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
    authoritySha256,
    manifestSha256: nextManifest.manifestSha256,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
  };
  next.production.generation.automaticDispatchAllowed = false;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  const event = createProductionEvent({workspace: current, action: "canonical-title-repair-worker-result-reconciled", targetId: failedShotIds.join(","), payload: {failedShotIds, authoritySha256, previousManifestSha256: manifest.manifestSha256, manifestSha256: nextManifest.manifestSha256}});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "semantic-authority-convergence-v1/worker-result-reconcile-report.json": {
        contract: "A1CanonicalTitleRepairWorkerResultReconcileReport/v1",
        status: "PASS",
        failedShotIds,
        previousManifestSha256: manifest.manifestSha256,
        manifestSha256: nextManifest.manifestSha256,
        queue: recalculated.production.generation.summary,
        workerStatus: recalculated.production.generation.workerStatus,
        assemblyCount: recalculated.production.shotIntelligence.currentAssembly?.length || 0,
        assemblyCreationAllowed: false,
      },
    },
  });
  return {workspace: recalculated, failedShotIds, previousManifestSha256: manifest.manifestSha256, manifestSha256: nextManifest.manifestSha256};
});

console.log(JSON.stringify({status: "PASS", checkpoint: "CANONICAL_TITLE_REPAIR_PENDING", failedShotIds: result.failedShotIds, previousManifestSha256: result.previousManifestSha256, manifestSha256: result.manifestSha256, workspaceSha256: result.workspace.workspaceSha256, nextAction: result.workspace.production.authority.nextAction?.id, queue: result.workspace.production.generation.summary, workerStatus: result.workspace.production.generation.workerStatus, assemblyCreationAllowed: false}, null, 2));
