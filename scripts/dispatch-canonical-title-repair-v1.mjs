#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {queuePackageLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {
  buildRepairManifest,
  compileGenerationDispatchWithAuthoritativeBuilder,
  writeRepairManifestSidecarAtomic,
} from "../apps/studio-next/src/lib/a1-incremental-repair-executor-v1.mjs";
import {canonicalTitleRepairRawBindingIsAdmissible} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const sidecarPath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json");
const canonicalScope = ["ED-07", "ED-08", "ED-13", "ED-19"];
const retryPromptByShot = {
  "ED-08": "HARD RETRY CONTRACT: output a true transparent PNG overlay. The hold frame must never be baked into the output; every pixel outside the single headline actor must be alpha=0. No opaque white/black/camera/background plate, no checkerboard, no room, no person pixels. Render only the exact actor AI 常常不说人话 in one or two large, solid, high-contrast lines. Use orthodox readable simplified-Chinese glyphs, preserve every character exactly, and do not invent pseudo-Chinese or ornamental substitutions. Keep the phrase legible for three seconds and make it the primary visual layer. If transparency or exact readable copy cannot be maintained, the attempt is invalid.",
  "ED-13": "HARD RETRY CONTRACT: render exactly two short visible Chinese actors, 更顺一些 and 没解决, as two deliberate large clusters. Do not render the longer protected source phrases, the spoken sentence, any English/Latin/UI labels, or filler. Use at most two headline lines/clusters and make both readable in three seconds.",
  "ED-19": "HARD RETRY CONTRACT: render the exact editable identity line Codex 在后台 plus four large Chinese verbs 整理、编排、读取、检查. Keep these five phrases as the sole visible copy; no article paragraph, tiny captions, labels, numbers, icons with text, UI chrome or filler. The identity line is a compact setup rail and each verb remains a primary actor with glyph height suitable for three-second reading.",
};
let targetIds = [];
let dispatchTargetIds = [];
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const jsonFileSha256 = (value) => crypto.createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`, "utf8").digest("hex");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const targetManifest = runtime.canonicalDirectorTargetRepairManifest;
  const authority = runtime.canonicalDirectorAuthority;
  targetIds = [...(targetManifest?.generationEligibleShotIds || [])];
  const canaryShotId = process.env.A1_CANARY_SHOT_ID || null;
  dispatchTargetIds = canaryShotId ? targetIds.filter((shotId) => shotId === canaryShotId) : [...targetIds];
  if (canaryShotId && dispatchTargetIds.length !== 1) throw new Error(`canonical-title-repair-canary-shot-invalid:${canaryShotId}`);
  if (authority?.status !== "PASS" || targetManifest?.authoritySha256 !== authority.authoritySha256 || !targetIds.length || targetIds.some((shotId) => !canonicalScope.includes(shotId)) || targetManifest?.boardRebuilt !== false) throw new Error("canonical-title-repair-dispatch-authority-invalid");
  const candidateRecords = [
    ...(current.production.generation.jobs || []).map((job) => ({
      shotId: job.shotId || null,
      lookMasterPlanSha256: job.lookMasterPlanSha256 || null,
      prompt: job.prompt || null,
      promptSha256: job.promptSha256 || null,
      directionFingerprint: job.candidateDirection?.fingerprint || null,
      attempts: job.attempts || 0,
      output: job.output || null,
    })),
    ...(runtime.lookMasterRawReferences || []).map((raw) => ({...raw, artifact: raw.artifact || null, attempts: raw.artifact?.attempts || 1})),
  ];
  const auditRecords = (runtime.lookMasterRawReferences || []).map((raw) => ({
    ...raw,
    artifactSha256: raw.artifact?.sha256 || raw.artifactSha256 || null,
    planSha256: raw.planSha256 || raw.lookMasterPlanSha256 || null,
    status: raw.status,
    actualPixelEvidence: raw.semanticPixelAudit || raw.pixelAudit || null,
    footageCompatibility: raw.pixelAudit?.footageCompatibility || null,
    semanticEvidence: raw.semanticPixelAudit || null,
    semanticEvidenceStatus: raw.semanticPixelAudit?.status || null,
  }));
  const previousManifest = fs.existsSync(sidecarPath) ? JSON.parse(fs.readFileSync(sidecarPath, "utf8")) : null;
  const rawManifest = buildRepairManifest({workspace: current, candidateRecords, auditRecords, previousManifest, mode: "canonical-title-repair-production"});
  const scope = new Set(dispatchTargetIds);
  const scopedManifest = {
    ...rawManifest,
    canonicalRepairBinding: {
      ...(rawManifest.canonicalRepairBinding || {}),
      authoritySha256: authority.authoritySha256,
      manifestSha256: targetManifest.manifestSha256,
      sourceRevisionHash: targetManifest.sourceRevisionHash,
      targetShotIds: targetIds,
    },
    entries: rawManifest.entries.map((entry) => entry.reasonCodes?.includes("PACKAGE_ROUTE") && !scope.has(entry.shotId)
      ? {...entry, status: "OUTSIDE_CANONICAL_REPAIR_SCOPE", generationState: "BLOCKED", nextAction: {action: "NONE"}}
      : entry),
  };
  const dispatch = compileGenerationDispatchWithAuthoritativeBuilder(scopedManifest, {
    workspace: current,
    automaticDispatchAllowed: true,
    workerStatus: "starting",
    runningCount: current.production.generation.summary?.running || 0,
    maxConcurrency: 2,
    queueAllReady: true,
    queueBuilder: (workspace, dispatchJob) => queuePackageLookMasterGenerationJobs(workspace, dispatchJob.shotId, {
      candidateIndices: [dispatchJob.candidateIndex || dispatchJob.entry?.candidateIndex || 1],
      // This dispatcher is scoped to the current canonical title-repair
      // authority.  A stale manifest action such as SWITCH_PRIMITIVE must not
      // route the job into the legacy exception-repair gate.
      generationMode: "LOOK_MASTER_REPAIR",
      canonicalRepairBinding: scopedManifest.canonicalRepairBinding,
      primitiveId: dispatchJob.primitiveId || dispatchJob.entry?.primitiveId || null,
      repairAttempt: dispatchJob.attempt || dispatchJob.entry?.attempt || 0,
      repairPrompt: retryPromptByShot[dispatchJob.shotId] || null,
    }),
  });
  const createdJobs = dispatch.createdJobs || [];
  const dispatchedShotIds = new Set((dispatch.dispatch.jobs || []).map((job) => job.shotId).filter(Boolean));
  const alreadySatisfiedShotIds = new Set((scopedManifest.entries || [])
    .filter((entry) => ["AUDIT_PASS", "CACHED_PASS"].includes(entry.status) || entry.auditStatus === "PASS_CACHED")
    .map((entry) => entry.shotId));
  // A pass can be freshly committed by the pixel-audit writer after the
  // manifest compile.  Preserve that target as satisfied for a partial retry
  // wave instead of treating it as a silently dropped canonical shot.
  for (const raw of current.production.shotIntelligence.lookMasterRawReferences || []) {
    const currentPlan = current.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === raw.shotId);
    if (raw.current === true
      && raw.recommendationEligible === true
      && raw.selectionEligible === true
      && raw.semanticPixelAudit?.status === "PASS"
      && raw.pixelAudit?.admissionAllowed === true
      && canonicalTitleRepairRawBindingIsAdmissible(currentPlan, raw)
      && targetIds.includes(raw.shotId)) {
      alreadySatisfiedShotIds.add(raw.shotId);
    }
  }
  const missingTargetIds = dispatchTargetIds.filter((shotId) => !dispatchedShotIds.has(shotId) && !alreadySatisfiedShotIds.has(shotId));
  // Canonical repair is an atomic bounded wave. A partial queue would make
  // the authority say "generating" while silently dropping another target.
  if (missingTargetIds.length) throw new Error(`canonical-title-repair-preflight-incomplete:${missingTargetIds.join(",")}`);
  if (!createdJobs.length && !dispatch.dispatch.jobs.length) throw new Error("canonical-title-repair-no-jobs-dispatched");
  const next = structuredClone(dispatch.workspace);
  const nextRuntime = next.production.shotIntelligence;
  const dispatchedManifestBase = {
    ...structuredClone(targetManifest),
    canaryOnly: Boolean(canaryShotId),
    canaryShotId: canaryShotId || null,
    checkpoint: "CANONICAL_TITLE_REPAIR_GENERATING",
    generationDispatched: true,
    imageGenCalls: targetManifest.imageGenCalls || createdJobs.length,
    dispatchBatchId: sha256({authoritySha256: authority.authoritySha256, manifestSha256: targetManifest.manifestSha256, createdJobIds: createdJobs.map((job) => job.id)}).slice(0, 24),
    dispatchedShotIds: dispatchTargetIds,
    boardRebuilt: false,
    assemblyStarted: false,
    generatedAt: new Date().toISOString(),
  };
  const dispatchedManifest = {...dispatchedManifestBase, manifestSha256: sha256({...dispatchedManifestBase, manifestSha256: undefined})};
  nextRuntime.canonicalDirectorTargetRepairManifest = dispatchedManifest;
  next.production.semanticAuthorityConvergence = {
    ...(next.production.semanticAuthorityConvergence || {}),
    checkpoint: "CANONICAL_TITLE_REPAIR_GENERATING",
    authoritySha256: authority.authoritySha256,
    manifestSha256: dispatchedManifest.manifestSha256,
    generationDispatched: true,
    imageGenCalls: createdJobs.length,
    boardRebuilt: false,
  };
  next.production.generation.automaticDispatchAllowed = true;
  next.production.generation.workerStatus = "starting";
  const manifestForMirrorBase = dispatch.dispatch.manifest || scopedManifest;
  const manifestForMirror = {
    ...manifestForMirrorBase,
    authorityState: "CURRENT",
    current: true,
    historyReadOnly: false,
  };
  manifestForMirror.manifestSha256 = sha256({...manifestForMirror, manifestSha256: undefined});
  next.production.incrementalRepairManifestAuthority = {
    ...(next.production.incrementalRepairManifestAuthority || {}),
    contract: "A1IncrementalRepairManifestAuthority/v1",
    status: "CURRENT",
    manifestSha256: manifestForMirror.manifestSha256,
    manifestFileSha256: jsonFileSha256(manifestForMirror),
    manifestFileShaAlgorithm: "SHA-256(UTF-8-JSON-BYTES)",
    currentRepairStatus: manifestForMirror.status,
    packageCount: manifestForMirror.summary.packageCount,
    noPackageCount: manifestForMirror.summary.noPackageCount,
    readyForGenerationCount: manifestForMirror.summary.readyForGenerationCount,
    artifactPath: ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    publicPath: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/incremental-repair-executor-v1/repair-manifest.json",
    mirrorStatus: "IN_SYNC",
  };
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  // The sidecar is mutated inside the same project transaction and is bound
  // to the workspace CAS below; explicitly allow this current-authority
  // transition rather than treating it as an out-of-band writer.
  writeRepairManifestSidecarAtomic({manifestPath: sidecarPath, manifest: manifestForMirror, allowCurrentAuthorityMutation: true});
  const event = createProductionEvent({workspace: current, action: "canonical-title-repair-dispatched", targetId: dispatchTargetIds.join(","), payload: {authoritySha256: authority.authoritySha256, sourceRevisionHash: authority.sourceRevisionHash, previousManifestSha256: targetManifest.manifestSha256, dispatchedManifestSha256: dispatchedManifest.manifestSha256, createdJobIds: createdJobs.map((job) => job.id), hardConcurrency: 2, canaryShotId: canaryShotId || null}});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "semantic-authority-convergence-v1/dispatch-report.json": {
        contract: "A1CanonicalTitleRepairDispatchReport/v1",
        status: "PASS",
        authoritySha256: authority.authoritySha256,
        sourceRevisionHash: authority.sourceRevisionHash,
        previousManifestSha256: targetManifest.manifestSha256,
        dispatchedManifestSha256: dispatchedManifest.manifestSha256,
        targetShotIds: dispatchTargetIds,
        createdJobIds: createdJobs.map((job) => job.id),
        allJobs: dispatch.dispatch.jobs.map((job) => ({shotId: job.shotId, jobKey: job.jobKey, existingJobId: job.existingJobId, dependencyHash: job.dependencyHash, planSha256: job.planSha256, promptHash: job.promptHash, primitiveId: job.primitiveId, attempt: job.attempt})),
        hardConcurrency: 2,
        queue: recalculated.production.generation.summary,
      },
      // Keep the artifact and public repair manifests on the same CAS-bound
      // revision. A current sidecar that is only updated under .codex-
      // artifacts would make the browser authority mirror stale.
      "incremental-repair-executor-v1/repair-manifest.json": manifestForMirror,
    },
  });
  return {workspace: recalculated, dispatchedManifest, createdJobs, dispatch};
});

console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "CANONICAL_TITLE_REPAIR_GENERATING",
  workspaceSha256: result.workspace.workspaceSha256,
  authoritySha256: result.dispatchedManifest.authoritySha256,
  manifestSha256: result.dispatchedManifest.manifestSha256,
  targetShotIds: dispatchTargetIds,
  createdJobs: result.createdJobs.map((job) => ({id: job.id, shotId: job.shotId, planSha256: job.lookMasterPlanSha256, promptSha256: job.promptSha256, primitiveId: job.canonicalPrimitiveId, binding: job.canonicalRepairBinding})),
  queue: result.workspace.production.generation.summary,
  workerStatus: result.workspace.production.generation.workerStatus,
  assemblyCount: result.workspace.production.shotIntelligence.currentAssembly?.length || 0,
  assemblyCreationAllowed: false,
}, null, 2));
