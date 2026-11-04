#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {writeRepairManifestSidecarAtomic} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sidecarPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
const canonicalScope = new Set(["ED-07", "ED-08", "ED-13", "ED-19"]);
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const authority = runtime.canonicalDirectorAuthority;
  const currentManifest = runtime.canonicalDirectorTargetRepairManifest;
  if (currentManifest?.checkpoint !== "CANONICAL_TITLE_REPAIR_GENERATING") throw new Error("canonical-title-repair-rollback-requires-generating-checkpoint");
  const queued = (current.production.generation.jobs || []).filter((job) => ["queued", "running"].includes(job.status) && job.canonicalRepairBinding?.authoritySha256 === authority?.authoritySha256);
  if (!queued.length) throw new Error("canonical-title-repair-rollback-no-active-jobs");
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const nextRuntime = next.production.shotIntelligence;
  const targetIds = [...(currentManifest.targetRepairShotIds || [])];
  const generationEligibleIds = [...(currentManifest.generationEligibleShotIds || [])];
  const manifestBase = {
    ...structuredClone(currentManifest),
    checkpoint: "CODE_ONLY_CANONICAL_AUTHORITY_PASS",
    generationDispatched: false,
    imageGenCalls: 0,
    dispatchBatchId: null,
    dispatchedShotIds: [],
    boardRebuilt: false,
    assemblyStarted: false,
    generatedAt: now,
    entries: (currentManifest.entries || []).map((entry) => {
      if (!generationEligibleIds.includes(entry.shotId)) return entry;
      const reset = {...entry, status: "TARGET_REPAIR_GENERATION_ELIGIBLE", generationAllowed: true, generationState: "ELIGIBLE", nextAction: {action: "DISPATCH"}};
      for (const key of ["jobKey", "queuedAt", "finalSha", "auditSha", "auditSha256", "actualAuditBinding", "dispatchBatchId"]) delete reset[key];
      return reset;
    }),
  };
  const manifest = {...manifestBase, manifestSha256: sha256({...manifestBase, manifestSha256: undefined})};
  nextRuntime.canonicalDirectorTargetRepairManifest = manifest;
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "CODE_ONLY_CANONICAL_AUTHORITY_PASS",
    manifestSha256: manifest.manifestSha256,
    generationDispatched: false,
    imageGenCalls: 0,
    boardRebuilt: false,
  };
  const cancelled = [];
  next.production.generation.jobs = next.production.generation.jobs.map((job) => {
    if (!queued.some((item) => item.id === job.id)) return job;
    const updated = {...job, status: "cancelled", error: "canonical-title-repair-dispatch-rolled-back-preflight-incomplete", cancelReason: "atomic-wave-preflight-incomplete", cancelledAt: now, startedAt: null};
    cancelled.push({id: updated.id, shotId: updated.shotId, previousStatus: job.status});
    return updated;
  });
  next.production.generation.summary = {
    queued: next.production.generation.jobs.filter((job) => job.status === "queued").length,
    running: next.production.generation.jobs.filter((job) => job.status === "running").length,
    complete: next.production.generation.jobs.filter((job) => job.status === "complete").length,
    failed: next.production.generation.jobs.filter((job) => job.status === "failed").length,
    stale: next.production.generation.jobs.filter((job) => job.status === "stale").length,
    cancelled: next.production.generation.jobs.filter((job) => job.status === "cancelled").length,
    total: next.production.generation.jobs.length,
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "canonical-title-repair-dispatch-rolled-back", targetId: targetIds.join(","), payload: {authoritySha256: authority.authoritySha256, previousManifestSha256: currentManifest.manifestSha256, manifestSha256: manifest.manifestSha256, cancelled, reason: "atomic-wave-preflight-incomplete"}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  writeRepairManifestSidecarAtomic({manifestPath: sidecarPath, manifest, allowCurrentAuthorityMutation: true});
  persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"semantic-authority-convergence-v1/target-repair-manifest.json": manifest, "semantic-authority-convergence-v1/dispatch-rollback.json": {contract: "A1CanonicalTitleRepairDispatchRollback/v1", status: "PASS", previousManifestSha256: currentManifest.manifestSha256, manifestSha256: manifest.manifestSha256, cancelled, targetShotIds: targetIds, generationEligibleShotIds: generationEligibleIds, rolledBackAt: now}}});
  return {workspace: recalculated, manifest, cancelled};
});

console.log(JSON.stringify({status: "PASS", checkpoint: result.workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest.checkpoint, workspaceSha256: result.workspace.workspaceSha256, manifestSha256: result.manifest.manifestSha256, cancelled: result.cancelled, queue: result.workspace.production.generation.summary, workerStatus: result.workspace.production.generation.workerStatus, nextAction: result.workspace.production.authority.nextAction}, null, 2));
