#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, updateGenerationJob} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {canonicalFormalTypographyStyleModeForPlan, canonicalFormalTypographyStyleModeForBinding} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
const onlyArg = process.argv.find((value) => value.startsWith("--only="));
const onlyShotIds = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",").filter(Boolean)) : null;
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("look-master-job-import-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const resolvePublicFile = (relativePath) => {
  const normalized = String(relativePath || "");
  if (!normalized.startsWith("generated/system-line/")) throw new Error("look-master-job-import-public-path-invalid");
  const file = path.resolve(publicRoot, normalized);
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("look-master-job-import-public-path-escape");
  return file;
};

async function perceptualHashForImage(file) {
  const {data} = await sharp(file).resize(16, 16, {fit: "fill"}).grayscale().raw().toBuffer({resolveWithObject: true});
  const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
  let bits = "";
  for (const value of data) bits += value >= average ? "1" : "0";
  return bits.match(/.{1,4}/gu).map((nibble) => Number.parseInt(nibble.padEnd(4, "0"), 2).toString(16)).join("");
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`look-master-job-import-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("look-master-job-import-assembly-already-created");
  if (current.production.generation.summary.running !== 0) throw new Error("look-master-job-import-running-jobs-present");

  const jobs = current.production.generation.jobs.filter((job) => job.targetKind === "package-look-master" && job.status === "queued" && (!onlyShotIds || onlyShotIds.has(job.shotId)));
  if (!jobs.length) throw new Error("look-master-job-import-no-queued-target-jobs");
  if (onlyShotIds && new Set(jobs.map((job) => job.shotId)).size !== onlyShotIds.size) throw new Error("look-master-job-import-target-shot-mismatch");
  const otherQueued = current.production.generation.jobs.filter((job) => ["queued", "running"].includes(job.status) && !jobs.some((target) => target.id === job.id));
  if (otherQueued.length) throw new Error("look-master-job-import-other-active-jobs-present");

  const runtime = current.production.shotIntelligence;
  const existingArtifactShas = new Set((runtime.lookMasterRawReferences || []).map((item) => item.artifact?.sha256).filter(Boolean));
  // A multi-candidate wave is one review set.  Only candidates that were
  // current before this import may be superseded; do not supersede the first
  // candidate imported earlier in the same wave.
  const preImportCurrentReferenceIds = new Set((runtime.lookMasterRawReferences || []).filter((item) => item.current === true).map((item) => item.referenceId));
  const prepared = [];
  for (const job of jobs) {
    const file = resolvePublicFile(job.outputRelativePath);
    if (!fs.existsSync(file)) throw new Error(`look-master-job-import-output-missing:${job.id}`);
    const bytes = fs.readFileSync(file);
    const artifactSha256 = sha256(bytes);
    if (existingArtifactShas.has(artifactSha256)) throw new Error(`look-master-job-import-duplicate-artifact-sha:${job.id}`);
    const metadata = await sharp(file).metadata();
    if (metadata.format !== "png" || !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.hasAlpha !== true) throw new Error(`look-master-job-import-alpha-or-dimensions-invalid:${job.id}`);
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === job.shotId && item.planSha256 === job.lookMasterPlanSha256);
    if (!plan) throw new Error(`look-master-job-import-plan-stale:${job.id}`);
    if (!(current.production.authority.nextAction?.targetShotIds || []).includes(job.shotId)) throw new Error(`look-master-job-import-shot-not-current-exception:${job.shotId}`);
    const direction = plan.candidateDirections?.find((item) => item.directionId === job.candidateDirection?.directionId);
    if (!direction || direction.fingerprint !== job.candidateDirection?.fingerprint) throw new Error(`look-master-job-import-direction-stale:${job.id}`);
    const expectedFormalStyle = canonicalFormalTypographyStyleModeForPlan(plan);
    const jobFormalStyle = canonicalFormalTypographyStyleModeForBinding(job.formalTypographyBinding)
      || job.heroTitleStyleMode
      || null;
    if (expectedFormalStyle && jobFormalStyle !== expectedFormalStyle) throw new Error(`look-master-job-import-eva-style-binding-required:${job.id}`);
    const formalTypographyBinding = job.formalTypographyBinding ? structuredClone(job.formalTypographyBinding) : null;
    prepared.push({job, file, bytes, artifactSha256, metadata, perceptualHash: await perceptualHashForImage(file), plan, direction, formalTypographyBinding});
  }

  const now = new Date().toISOString();
  let next = structuredClone(current);
  const imported = [];
  for (const item of prepared) {
    const {job, artifactSha256, metadata, perceptualHash, plan, direction, formalTypographyBinding} = item;
    const researchReferenceUseProof = job.researchReferenceUseProof || {status: "NOT_REQUIRED", sentToImageGen: false, sourcePacketSha256: null, sourceIds: []};
    const artifact = {
      contract: "A1GeneratedEditorialAssetCache/v1",
      assetId: null,
      targetKind: job.targetKind,
      briefId: job.briefId || `look-master-${job.shotId.toLowerCase()}`,
      briefHash: job.briefHash || null,
      treatmentHash: null,
      shotId: job.shotId,
      layerId: null,
      provider: job.provider || "codex-imagegen",
      model: "gpt-image-2",
      prompt: job.prompt,
      promptSha256: job.promptSha256,
      generationInputHash: job.generationInputHash || job.cacheKey,
      cacheKey: job.cacheKey,
      sha256: artifactSha256,
      publicUrl: `/${job.outputRelativePath}`,
      mimeType: "image/png",
      generationId: `codex-imagegen:${job.id}`,
      generationJobId: job.id,
      width: metadata.width,
      height: metadata.height,
      hasAlpha: true,
      cacheHit: false,
      durationMs: null,
      generatedAt: now,
      perceptualHash,
      workspaceImported: true,
      ...(formalTypographyBinding ? {formalTypographyBinding} : {}),
    };
    next = updateGenerationJob(next, job.id, {
      status: "complete",
      attempts: Math.max(1, Number(job.attempts || 0)),
      completedAt: now,
      durationMs: null,
      cacheHit: false,
      output: artifact,
      error: null,
      telemetry: {...job.telemetry, firstPreviewAt: job.telemetry?.firstPreviewAt || now, completedAt: now},
    }, now);
    for (const existing of next.production.shotIntelligence.lookMasterRawReferences.filter((candidate) => candidate.shotId === job.shotId && candidate.current === true && preImportCurrentReferenceIds.has(candidate.referenceId))) {
      existing.current = false;
      existing.recommendationEligible = false;
      existing.selectionEligible = false;
      existing.assemblyEligible = false;
      existing.status = "HISTORY_READ_ONLY_SUPERSEDED_BY_NEW_JOB_RESULT";
      existing.supersededAt = now;
      existing.supersededByArtifactSha256 = artifactSha256;
    }
    const researchProof = structuredClone(researchReferenceUseProof);
    const raw = {
      contract: "A1PackageLookMasterRaw/v1",
      referenceId: `look-master-raw-${job.id}`,
      shotId: job.shotId,
      eventId: job.eventId,
      planSha256: job.lookMasterPlanSha256,
      styleBriefSha256: job.styleBriefSha256,
      candidateDirectionId: direction.directionId,
      directionFingerprint: direction.fingerprint,
      classification: "INTEGRATED_PACKAGE_CONCEPT",
      status: "LOOK_MASTER_RAW",
      artifact,
      ...(formalTypographyBinding ? {formalTypographyBinding} : {}),
      provenance: {
        generationJobContract: job.contract,
        generationJobId: job.id,
        generationInputHash: job.generationInputHash || job.cacheKey,
        provider: artifact.provider,
        model: artifact.model,
        cacheKey: job.cacheKey,
        sourceEvidenceInputs: structuredClone(job.sourceEvidenceInputs || []),
        researchReferenceUseProof: researchProof,
        holdFrameSha256: plan.videoContext?.baseFrame?.sha256 || null,
        subjectBounds: plan.videoContext?.subjectBounds || null,
      },
      sourceEvidenceInputs: structuredClone(job.sourceEvidenceInputs || []),
      researchReferenceUseProof: researchProof,
      pixelAudit: null,
      pixelAuditPublicUrl: null,
      semanticPixelAudit: null,
      serverVisualAssessment: null,
      serverVisualAssessmentPublicUrl: null,
      serverVisualReviewError: null,
      candidateAdmissionRequired: true,
      recommendationEligible: false,
      selectionEligible: false,
      assemblyEligible: false,
      current: true,
      reviewDeferredTo: "ACTUAL_PIXEL_SEMANTIC_AUDIT",
      note: "ImageGen worker 只提交不可推荐的 job result；actual-pixel、OCR、重复、语义与正片兼容门禁由 director/finalizer 后续纯审计消费。",
      createdAt: now,
    };
    next.production.shotIntelligence.lookMasterRawReferences.push(raw);
    imported.push({jobId: job.id, shotId: job.shotId, referenceId: raw.referenceId, artifactSha256, perceptualHash, planSha256: plan.planSha256, recommendationEligible: false});
  }
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const event = createProductionEvent({workspace: current, action: "import-generated-package-look-master-job-results", targetId: imported.map((item) => item.shotId).join(","), payload: {contract: "A1GeneratedLookMasterJobResultImport/v1", imported, workerOnlyResult: true, generatedPngCount: imported.length, recommendationEligibleCount: 0, assemblyCreated: false, layerReconstructionStarted: false, criticPerformed: false, motionPerformed: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  for (const item of imported) {
    const raw = recalculated.production.shotIntelligence.lookMasterRawReferences.find((candidate) => candidate.referenceId === item.referenceId);
    assert.equal(raw?.recommendationEligible, false);
    assert.equal(raw?.selectionEligible, false);
    assert.equal(raw?.assemblyEligible, false);
  }
  assert.equal(recalculated.production.generation.summary.queued, 0);
  assert.equal(recalculated.production.generation.summary.running, 0);
  assert.equal(recalculated.production.generation.workerStatus, "frozen");
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  const report = {contract: "A1GeneratedLookMasterJobResultImportReport/v1", status: "PASS", workspaceSha256Before: current.workspaceSha256, imported, generatedPngCount: imported.length, workerStatus: recalculated.production.generation.workerStatus, queue: recalculated.production.generation.summary, assemblyCount: 0, downstreamLocked: true, generatedAt: now};
  const commitId = `look-master-job-result-import-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId, files: {"look-master-job-results-v1/latest.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
