import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  projectDirs,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  auditRecordFromRawReference,
  buildRepairManifest,
  compileGenerationDispatchWithAuthoritativeBuilder,
  writeRepairManifestSidecarAtomic,
} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const manifestPath = path.join(artifactDir, "incremental-repair-executor-v1", "repair-manifest.json");
const targetShotIds = ["ED-07", "ED-08"];
const targetSet = new Set(targetShotIds);
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function candidateRecords(workspace) {
  const runtime = workspace.production.shotIntelligence;
  return [
    ...(workspace.production.generation.jobs || []).map((job) => ({
      shotId: job.shotId || null,
      lookMasterPlanSha256: job.lookMasterPlanSha256 || null,
      prompt: job.prompt || null,
      promptSha256: job.promptSha256 || null,
      directionFingerprint: job.candidateDirection?.fingerprint || null,
      attempts: job.attempts || 0,
      output: job.output || null,
      canonicalPrimitiveId: job.canonicalPrimitiveId || null,
    })),
    ...(runtime.lookMasterRawReferences || []).filter((raw) => raw.current !== false).map((raw) => ({
      ...raw,
      isRawReference: true,
      artifact: raw.artifact || null,
      output: raw.output || raw.artifact || null,
      lookMasterPlanSha256: raw.lookMasterPlanSha256 || raw.planSha256 || raw.artifact?.planSha256 || null,
      prompt: raw.prompt || raw.artifact?.prompt || null,
      promptSha256: raw.promptSha256 || raw.artifact?.promptSha256 || null,
      attempts: raw.artifact?.attempts || 1,
    })),
  ];
}

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const authority = runtime.canonicalDirectorAuthority;
  const canonical = runtime.canonicalDirectorTargetRepairManifest;
  if (authority?.status !== "PASS" || canonical?.boardRebuilt !== false || canonical?.generationEligibleShotIds?.length !== 4) throw new Error("canonical-title-repair-retry-authority-invalid");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("canonical-title-repair-retry-wave-requires-idle-queue");
  const previousManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
  const baseManifest = buildRepairManifest({
    workspace: current,
    candidateRecords: candidateRecords(current),
    auditRecords: (runtime.lookMasterRawReferences || []).map(auditRecordFromRawReference).filter(Boolean),
    previousManifest,
    mode: "production-controller",
  });
  const manifest = {
    ...baseManifest,
    entries: baseManifest.entries.map((entry) => targetSet.has(entry.shotId)
      ? entry
      : {...entry, status: "OUTSIDE_CANONICAL_RETRY_WAVE", generationState: "BLOCKED", nextAction: {action: "NONE"}}),
  };
  manifest.manifestSha256 = sha256({...manifest, manifestSha256: undefined});
  const canonicalRepairBinding = {
    contract: "A1CanonicalTitleRepairDispatchBinding/v1",
    authoritySha256: authority.authoritySha256,
    manifestSha256: canonical.manifestSha256,
    sourceRevisionHash: canonical.sourceRevisionHash,
    targetShotIds: canonical.targetRepairShotIds,
  };
  const compiled = compileGenerationDispatchWithAuthoritativeBuilder(manifest, {
    workspace: current,
    automaticDispatchAllowed: true,
    workerStatus: "idle",
    runningCount: 0,
    maxConcurrency: 2,
    queueBuilder: (workspace, dispatchJob) => queuePackageLookMasterGenerationJobs(workspace, dispatchJob.shotId, {
      candidateIndices: [dispatchJob.candidateIndex || 1],
      generationMode: dispatchJob.entry?.nextAction?.action === "SWITCH_PRIMITIVE" ? "PRIMITIVE_SWITCH" : "LOOK_MASTER_REPAIR",
      canonicalRepairBinding,
      primitiveId: dispatchJob.primitiveId || dispatchJob.entry?.primitiveId || null,
      repairAttempt: dispatchJob.attempt || dispatchJob.entry?.attempt || 0,
    }),
  });
  if (compiled.createdJobs.length !== targetShotIds.length || compiled.createdJobs.some((job) => !targetSet.has(job.shotId))) throw new Error("canonical-title-retry-wave-job-scope-invalid");
  const event = createProductionEvent({workspace: current, action: "canonical-title-repair-retry-wave-dispatched", targetId: targetShotIds.join(","), payload: {authoritySha256: authority.authoritySha256, manifestSha256: canonical.manifestSha256, shotIds: targetShotIds, hardConcurrency: 2}});
  const next = recalculateEditorialAssetWorkbench(structuredClone(compiled.workspace), new Date().toISOString());
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const saved = persistProjectState(appRoot, next, {expectedWorkspaceSha256: current.workspaceSha256, event});
  const sidecar = {
    ...compiled.dispatch.manifest,
    generationDispatched: true,
    boardRebuilt: false,
    canonicalRepairBinding,
    dispatchBatchId: `canonical-title-retry-${Date.now()}`,
    dispatchedShotIds: targetShotIds,
  };
  writeRepairManifestSidecarAtomic({manifestPath, manifest: sidecar, expectedManifestSha256: previousManifest?.manifestSha256});
  return {status: "PASS", createdJobs: compiled.createdJobs.map((job) => ({id: job.id, shotId: job.shotId, primitiveId: job.canonicalPrimitiveId, attempt: job.canonicalRepairAttempt})), workspaceSha256: saved.workspaceSha256, manifestSha256: sidecar.manifestSha256};
});

console.log(JSON.stringify(result, null, 2));
