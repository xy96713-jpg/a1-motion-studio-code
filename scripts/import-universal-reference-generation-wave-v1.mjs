#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildUniversalReferenceAttachmentManifest, assertUniversalReferenceAttachmentManifest, A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, UNIVERSAL_REFERENCE_PRODUCTION_METHOD} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const waveRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-generation-wave-v1/manifest.json";
const reportRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-generation-wave-v1/import-report.json";
const now = new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const resolvePublicFile = (relativePath) => {
  const normalized = String(relativePath || "").replace(/^\//u, "");
  if (!normalized.startsWith("generated/system-line/")) throw new Error("universal-reference-wave-output-path-invalid");
  const file = path.resolve(publicRoot, normalized);
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("universal-reference-wave-output-path-escape");
  return file;
};

function explicitNoReferenceManifest(jobId) {
  return {
    contract: "A1UniversalReferenceAttachmentManifest/v1",
    packagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
    productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
    jobId,
    stage: "NOT_REQUIRED_EXPLICIT_NO_REFERENCE_GENERATIVE",
    requireAttached: false,
    fileCount: 0,
    sourceSha256s: [],
    attachments: [],
    reason: "classifier-explicit-abstract-editing-operation-no-reference-information-gain",
    manifestSha256: sha256({
      contract: "A1UniversalReferenceAttachmentManifest/v1",
      packagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      jobId,
      stage: "NOT_REQUIRED_EXPLICIT_NO_REFERENCE_GENERATIVE",
      requireAttached: false,
      fileCount: 0,
      sourceSha256s: [],
      attachments: [],
      reason: "classifier-explicit-abstract-editing-operation-no-reference-information-gain",
    }),
  };
}

function artifactFor({job, plan, file, metadata, bytes, generatedAt}) {
  return {
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: `look-master-wave-v1-${job.shotId.toLowerCase()}-c${job.candidateIndex}`,
    targetKind: "package-look-master",
    briefId: `look-master-${job.shotId.toLowerCase()}`,
    briefHash: null,
    treatmentHash: null,
    shotId: job.shotId,
    layerId: null,
    provider: "codex-built-in-imagegen",
    model: "gpt-image-2",
    prompt: job.prompt,
    promptSha256: job.promptSha256,
    generationInputHash: job.generationInputHash,
    cacheKey: job.generationInputHash,
    sha256: sha256(bytes),
    publicUrl: `/${job.outputRelativePath}`,
    mimeType: "image/png",
    generationId: `codex-imagegen:${job.jobId}`,
    generationJobId: job.jobId,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha === true,
    cacheHit: false,
    durationMs: null,
    generatedAt,
    workspaceImported: true,
    sourcePlanSha256: plan.planSha256,
  };
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.running !== 0 || current.production.generation.summary.queued !== 0) throw new Error("universal-reference-wave-import-active-queue");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("universal-reference-wave-import-assembly-forbidden");
  const wave = readJson(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1", waveRelativePath));
  if (wave.status !== "PREFLIGHT_PASS_READY_FOR_MANUAL_IMAGEGEN" || wave.jobCount === 0) throw new Error(`universal-reference-wave-manifest-invalid:${wave.status}`);
  const runtime = current.production.shotIntelligence;
  const existingJobIds = new Set((current.production.generation.jobs || []).map((job) => job.id));
  const existingArtifactShas = new Set((runtime.lookMasterRawReferences || []).map((raw) => raw.artifact?.sha256).filter(Boolean));
  const prepared = [];
  for (const job of wave.jobs) {
    const file = resolvePublicFile(job.outputRelativePath);
    if (!fs.existsSync(file)) throw new Error(`universal-reference-wave-output-missing:${job.jobId}`);
    const bytes = fs.readFileSync(file);
    const artifactSha256 = sha256(bytes);
    const metadata = await sharp(file).metadata();
    if (metadata.format !== "png" || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height)) throw new Error(`universal-reference-wave-output-decode-invalid:${job.jobId}`);
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === job.shotId && item.planSha256 === job.planSha256);
    if (!plan) throw new Error(`universal-reference-wave-plan-stale:${job.jobId}`);
    if (existingArtifactShas.has(artifactSha256) && !existingJobIds.has(job.jobId)) throw new Error(`universal-reference-wave-duplicate-artifact-sha:${job.jobId}`);
    const referenceInputs = job.references.map((reference, index) => ({
      id: reference.id,
      sourcePath: reference.sourcePath,
      sourceSha256: reference.sourceSha256,
      sourceType: reference.sourceType,
      semanticRole: reference.semanticRole || reference.role || reference.id,
      transformPolicy: reference.transformPolicy,
      generationAttachmentIndex: index,
    }));
    const referenceAttachmentManifest = referenceInputs.length
      ? buildUniversalReferenceAttachmentManifest({jobId: job.jobId, referenceInputs, attachedImagePaths: referenceInputs.map((reference) => reference.sourcePath), stage: "ATTACHED_TO_CODEX_INITIAL_PROMPT"})
      : explicitNoReferenceManifest(job.jobId);
    if (referenceInputs.length) assertUniversalReferenceAttachmentManifest(referenceAttachmentManifest, {requireAttached: true});
    prepared.push({job, file, bytes, metadata, plan, artifactSha256, referenceInputs, referenceAttachmentManifest});
  }

  const next = structuredClone(current);
  const imported = [];
  for (const item of prepared) {
    const {job, bytes, metadata, plan, artifactSha256, referenceInputs, referenceAttachmentManifest} = item;
    if (existingJobIds.has(job.jobId)) continue;
    const generatedAt = now;
    const artifact = artifactFor({job, plan, file: item.file, metadata, bytes, generatedAt});
    const generationJob = {
      contract: "A1AssetGenerationJob/v2",
      id: job.jobId,
      projectId: "july1-writing-workbench",
      assetId: artifact.assetId,
      targetKind: "package-look-master",
      shotId: job.shotId,
      route: "manual-codex-built-in-imagegen-wave-v1",
      provider: "codex-built-in-imagegen",
      providerMode: "subscription-zero-extra-cost",
      model: "gpt-image-2",
      status: "complete",
      prompt: job.prompt,
      promptSha256: job.promptSha256,
      cacheKey: job.generationInputHash,
      sourceHash: plan.sourceHash || null,
      planSha256: job.planSha256,
      lookMasterPlanSha256: job.planSha256,
      candidateDirection: {directionId: job.directionId, fingerprint: job.directionFingerprint},
      candidateIndex: job.candidateIndex,
      generationInputHash: job.generationInputHash,
      referenceDecision: job.referenceDecision,
      referenceInputs,
      referenceAttachmentManifest,
      referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      imagegenAttachmentCount: referenceInputs.length,
      imagegenAttachmentSourceShas: referenceInputs.map((reference) => reference.sourceSha256),
      imagegenAttachmentsAttachedToInitialPrompt: referenceInputs.length > 0,
      attempts: 1,
      createdAt: generatedAt,
      startedAt: generatedAt,
      completedAt: generatedAt,
      durationMs: null,
      cacheHit: false,
      output: artifact,
      error: null,
      telemetry: {completedAt: generatedAt, firstPreviewAt: generatedAt},
      goldenFilmMaturityWaveManifestSha256: wave.manifestSha256,
    };
    next.production.generation.jobs.push(generationJob);
    const raw = {
      contract: "A1PackageLookMasterRaw/v1",
      referenceId: `look-master-raw-${job.jobId}`,
      shotId: job.shotId,
      planSha256: job.planSha256,
      styleBriefSha256: plan.styleBriefSha256 || null,
      candidateDirectionId: job.directionId,
      directionFingerprint: job.directionFingerprint,
      classification: "FULL_LOOK_MASTER_GENERATED_WITH_ACTUAL_REFERENCE_ATTACHMENTS",
      fullLookMasterStatus: "PENDING_ACTUAL_PIXEL_AUDIT",
      status: "LOOK_MASTER_RAW",
      artifact: {
        ...artifact,
        referenceAttachmentManifestSha256: referenceAttachmentManifest.manifestSha256,
        imagegenAttachmentManifestSha256: referenceAttachmentManifest.manifestSha256,
        imagegenAttachmentCount: referenceInputs.length,
        imagegenAttachmentSourceShas: referenceInputs.map((reference) => reference.sourceSha256),
        imagegenAttachmentsAttachedToInitialPrompt: referenceInputs.length > 0,
      },
      provenance: {
        generationJobContract: generationJob.contract,
        generationJobId: generationJob.id,
        generationInputHash: job.generationInputHash,
        provider: artifact.provider,
        model: artifact.model,
        referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
        productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
        referenceAttachmentManifestSha256: referenceAttachmentManifest.manifestSha256,
        referenceInputs: structuredClone(referenceInputs),
        holdFrameSha256: referenceInputs.find((reference) => reference.sourceType === "REAL_HOLD_FRAME")?.sourceSha256 || null,
        sourceEvidenceInputs: referenceInputs.filter((reference) => reference.sourceType === "RESEARCH_EVIDENCE").map((reference) => structuredClone(reference)),
      },
      referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      imagegenAttachmentManifestSha256: referenceAttachmentManifest.manifestSha256,
      imagegenAttachmentCount: referenceInputs.length,
      imagegenAttachmentSourceShas: referenceInputs.map((reference) => reference.sourceSha256),
      imagegenAttachmentsAttachedToInitialPrompt: referenceInputs.length > 0,
      pixelAudit: null,
      semanticPixelAudit: null,
      serverVisualAssessment: null,
      candidateAdmissionRequired: true,
      recommendationEligible: false,
      selectionEligible: false,
      assemblyEligible: false,
      current: true,
      reviewDeferredTo: "ACTUAL_PIXEL_SEMANTIC_AUDIT",
      createdAt: generatedAt,
    };
    next.production.shotIntelligence.lookMasterRawReferences.push(raw);
    imported.push({jobId: job.jobId, shotId: job.shotId, artifactSha256, referenceAttachmentManifestSha256: referenceAttachmentManifest.manifestSha256, referenceAttachmentCount: referenceInputs.length, referenceAttachmentSourceShas: referenceInputs.map((reference) => reference.sourceSha256), fullLookMasterStatus: raw.fullLookMasterStatus});
  }
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  const event = createProductionEvent({workspace: current, action: "import-universal-reference-generation-wave", targetId: wave.manifestSha256, payload: {contract: "A1UniversalReferenceGenerationWaveImport/v1", waveManifestSha256: wave.manifestSha256, attemptedGeneratedCount: wave.jobs.length, importedCount: imported.length, adoptedGeneratedCount: 0, rejectedGeneratedCount: 0, imported, actualPixelAuditPending: true, assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(recalculated.production.generation.summary.queued, 0);
  assert.equal(recalculated.production.generation.summary.running, 0);
  assert.equal(recalculated.production.generation.workerStatus, "frozen");
  const report = {
    contract: "A1UniversalReferenceGenerationWaveImportReport/v1",
    status: "PASS",
    waveManifestSha256: wave.manifestSha256,
    attemptedGeneratedCount: wave.jobs.length,
    adoptedGeneratedCount: 0,
    rejectedGeneratedCount: 0,
    importedCount: imported.length,
    candidateShas: imported.map((item) => item.artifactSha256).sort(),
    imported,
    attachmentReadyShotIds: ["ED-08", "ED-13", "ED-14", "ED-31"],
    noReferenceGenerativeShotIds: ["ED-19"],
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCreationAllowed: false,
    nextAction: "ACTUAL_PIXEL_AUDIT_UNIVERSAL_REFERENCE_GENERATION_WAVE",
    generatedAt: now,
  };
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `universal-reference-wave-import-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[reportRelativePath]: report}});
  return {...report, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId};
});

console.log(JSON.stringify(result, null, 2));
