#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  createProductionEvent,
  updateGenerationJob,
} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  projectDirs,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  advancePackageRuntimeWithLookMasterCandidate,
  assertPackageLookMasterRuntime,
  buildPackageLookMasterCandidate,
  queuePackageLookMasterGenerationJobs,
} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {canonicalFormalTypographyStyleModeForPlan, canonicalFormalTypographyStyleModeForBinding} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {buildPackageLookMasterPixelAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageLookMasterVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const defaultManifest = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/package-look-masters/ed-10/operator-20260804/operator-import-manifest.json");
const manifestArg = process.argv.find((value) => value.startsWith("--manifest="));
const manifestPath = path.resolve(manifestArg ? manifestArg.slice("--manifest=".length) : defaultManifest);
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

function resolvePublicFile(publicUrl) {
  if (!String(publicUrl || "").startsWith("/generated/system-line/")) throw new Error("operator-look-master-public-url-invalid");
  const file = path.resolve(publicRoot, publicUrl.replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("operator-look-master-public-url-escape");
  return file;
}

async function perceptualHashForImage(file) {
  const {data} = await sharp(file).resize(16, 16, {fit: "fill"}).grayscale().raw().toBuffer({resolveWithObject: true});
  const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
  let bits = "";
  for (const value of data) bits += value >= average ? "1" : "0";
  return bits.match(/.{1,4}/gu).map((nibble) => Number.parseInt(nibble.padEnd(4, "0"), 2).toString(16)).join("");
}

async function mapConcurrent(items, limit, task) {
  const output = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, () => worker()));
  return output;
}

if (!fs.existsSync(manifestPath)) throw new Error("operator-look-master-import-manifest-missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.contract !== "A1OperatorPackageLookMasterImportManifest/v1" || !manifest.shotId || !Array.isArray(manifest.items)) throw new Error("operator-look-master-import-manifest-invalid");

const sourceWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sourcePlan = sourceWorkspace.production.shotIntelligence?.packageLookMasterPlans?.find((item) => item.shotId === manifest.shotId);
if (!sourcePlan || sourcePlan.planSha256 !== manifest.lookMasterPlanSha256 || sourcePlan.styleBriefSha256 !== manifest.styleBriefSha256) throw new Error("operator-look-master-import-plan-stale");
const expectedFormalStyle = canonicalFormalTypographyStyleModeForPlan(sourcePlan);
const manifestFormalBinding = manifest.formalTypographyBinding || null;
const manifestFormalStyle = canonicalFormalTypographyStyleModeForBinding(manifestFormalBinding) || manifest.heroTitleStyleMode || null;
if (expectedFormalStyle && manifestFormalStyle !== expectedFormalStyle) throw new Error("operator-look-master-import-eva-style-binding-required");
if (manifest.items.length !== sourcePlan.candidateBudget || new Set(manifest.items.map((item) => item.candidateIndex)).size !== manifest.items.length) throw new Error("operator-look-master-import-budget-invalid");
if (sourcePlan.candidates.length || (sourceWorkspace.production.shotIntelligence.lookMasterRawReferences || []).some((item) => item.shotId === manifest.shotId)) throw new Error("operator-look-master-import-target-not-empty");

const queued = queuePackageLookMasterGenerationJobs(sourceWorkspace, manifest.shotId, {now: new Date().toISOString()});
const jobsByIndex = new Map(queued.jobs.map((job) => [job.candidateIndex, job]));
const baseFrameFile = resolvePublicFile(sourcePlan.videoContext.baseFrame?.publicUrl);
if (!fs.existsSync(baseFrameFile) || sha256(fs.readFileSync(baseFrameFile)) !== sourcePlan.videoContext.baseFrame.sha256) throw new Error("operator-look-master-base-frame-binding-invalid");
const referenceImages = sourcePlan.referenceInputs.map((reference) => {
  const file = resolvePublicFile(reference.publicUrl);
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== reference.sha256) throw new Error(`operator-look-master-reference-binding-invalid:${reference.id}`);
  return {id: reference.id, path: file, sha256: reference.sha256};
});

const prepared = [];
for (const item of [...manifest.items].sort((left, right) => left.candidateIndex - right.candidateIndex)) {
  const job = jobsByIndex.get(item.candidateIndex);
  if (!job || job.candidateDirection?.directionId !== item.directionId) throw new Error(`operator-look-master-direction-binding-invalid:${item.candidateIndex}`);
  const file = resolvePublicFile(item.publicUrl);
  if (!fs.existsSync(file)) throw new Error(`operator-look-master-file-missing:${item.candidateIndex}`);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== item.sha256) throw new Error(`operator-look-master-sha-mismatch:${item.candidateIndex}`);
  const metadata = await sharp(file).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`operator-look-master-dimensions-invalid:${item.candidateIndex}`);
  const formalTypographyBinding = item.formalTypographyBinding || manifestFormalBinding;
  const itemFormalStyle = canonicalFormalTypographyStyleModeForBinding(formalTypographyBinding) || item.heroTitleStyleMode || manifestFormalStyle;
  if (expectedFormalStyle && itemFormalStyle !== expectedFormalStyle) throw new Error(`operator-look-master-eva-style-binding-required:${item.candidateIndex}`);
  const artifact = {
    contract: "A1GeneratedEditorialAssetCache/v1",
    targetKind: "package-look-master",
    briefId: job.briefId,
    briefHash: job.briefHash,
    shotId: job.shotId,
    provider: manifest.provider,
    model: manifest.model,
    prompt: job.prompt,
    promptSha256: job.promptSha256,
    cacheKey: job.cacheKey,
    generationInputHash: job.generationInputHash,
    sha256: item.sha256,
    publicUrl: item.publicUrl,
    mimeType: "image/png",
    generationId: item.generationId || null,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha === true,
    cacheHit: false,
    durationMs: null,
    providerTimingStatus: manifest.providerTimingStatus || "missing",
    generationMode: "operator-led-codex-built-in-imagegen",
    workspaceImported: true,
    importedAt: new Date().toISOString(),
    ...(formalTypographyBinding ? {formalTypographyBinding: structuredClone(formalTypographyBinding)} : {}),
  };
  const perceptualHash = await perceptualHashForImage(file);
  const rawReference = {
    contract: "A1PackageLookMasterRaw/v1",
    referenceId: `look-master-raw-${job.id}`,
    shotId: job.shotId,
    eventId: job.eventId,
    planSha256: job.lookMasterPlanSha256,
    styleBriefSha256: job.styleBriefSha256,
    candidateDirectionId: job.candidateDirection.directionId,
    directionFingerprint: job.candidateDirection.fingerprint,
    artifact: {...artifact, perceptualHash},
    ...(formalTypographyBinding ? {formalTypographyBinding: structuredClone(formalTypographyBinding)} : {}),
  };
  const preliminaryAudit = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", now: new Date().toISOString()});
  prepared.push({item, job, file, artifact, perceptualHash, rawReference, preliminaryAudit, formalTypographyBinding});
}

const priorPerceptualHashes = (sourceWorkspace.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.artifact?.perceptualHash).filter(Boolean);
const reviewed = await mapConcurrent(prepared, 2, async (entry) => {
  let assessment = null;
  let reviewError = null;
  let audit = entry.preliminaryAudit;
  if (audit.footageCompatibility?.status === "PASS" && audit.compositePreview?.publicUrl) {
    try {
      assessment = await runPackageLookMasterVisualReview({
        plan: sourcePlan,
        rawReference: entry.rawReference,
        preliminaryAudit: audit,
        candidateImage: entry.file,
        baseFrameImage: baseFrameFile,
        compositeImage: resolvePublicFile(audit.compositePreview.publicUrl),
        referenceImages,
        recentPerceptualHashes: priorPerceptualHashes,
        cacheDir: path.join(artifactDir, "package-look-master-visual-review-cache-v1"),
        now: new Date().toISOString(),
      });
      audit = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference: entry.rawReference, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", trustedAssessment: assessment, now: new Date().toISOString()});
    } catch (error) {
      reviewError = error instanceof Error ? error.message : String(error);
    }
  }
  return {...entry, assessment, audit, reviewError};
});

const report = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentPlan = current.production.shotIntelligence?.packageLookMasterPlans?.find((item) => item.shotId === manifest.shotId);
  if (!currentPlan || currentPlan.planSha256 !== manifest.lookMasterPlanSha256 || currentPlan.candidates.length || (current.production.shotIntelligence.lookMasterRawReferences || []).some((item) => item.shotId === manifest.shotId)) throw new Error("operator-look-master-import-target-changed-during-review");
  let next = queuePackageLookMasterGenerationJobs(current, manifest.shotId, {now: new Date().toISOString()}).workspace;
  let runtime = structuredClone(next.production.shotIntelligence);
  const rawReferences = runtime.lookMasterRawReferences || [];
  const files = {};
  const results = [];
  for (const entry of reviewed) {
    const completedAt = new Date().toISOString();
    next = updateGenerationJob(next, entry.job.id, {
      status: "complete",
      attempts: 1,
      startedAt: null,
      completedAt,
      durationMs: null,
      cacheHit: false,
      outputRelativePath: entry.item.publicUrl.replace(/^\//u, ""),
      output: entry.artifact,
      error: null,
      telemetry: {...entry.job.telemetry, firstPreviewAt: completedAt, completedAt, providerTimingStatus: entry.artifact.providerTimingStatus, importMode: entry.artifact.generationMode},
    }, completedAt);
    const raw = {
      ...entry.rawReference,
      classification: "INTEGRATED_PACKAGE_CONCEPT",
      status: "LOOK_MASTER_RAW",
      provenance: {
        generationJobContract: entry.job.contract,
        generationJobId: entry.job.id,
        generationInputHash: entry.job.generationInputHash,
        provider: entry.artifact.provider,
        model: entry.artifact.model,
        generationId: entry.artifact.generationId,
        operatorImported: true,
        timingStatus: entry.artifact.providerTimingStatus,
      },
      pixelAudit: entry.audit,
      pixelAuditPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/look-master-audits/${entry.job.shotId}/${entry.audit.auditSha256}.json`,
      serverVisualAssessment: entry.assessment,
      serverVisualAssessmentPublicUrl: entry.assessment ? `/generated/system-line/editorial-asset-workbench-v1/look-master-reviews/${entry.job.shotId}/${entry.assessment.assessmentSha256}.json` : null,
      serverVisualReviewError: entry.reviewError,
      candidateAdmissionRequired: true,
      note: "Operator-led 完整正片视觉包装母版；已绑定当前 plan、真实正片帧、Pinterest 参考与统一 generation job provenance。它不是四层资产。",
      createdAt: completedAt,
    };
    rawReferences.push(raw);
    files[`look-master-audits/${entry.job.shotId}/${entry.audit.auditSha256}.json`] = entry.audit;
    if (entry.assessment) files[`look-master-reviews/${entry.job.shotId}/${entry.assessment.assessmentSha256}.json`] = entry.assessment;
    files[`package-look-masters/${entry.job.shotId.toLowerCase()}/operator-20260804/${path.basename(entry.file)}.manifest.json`] = entry.artifact;
    let admittedCandidateId = null;
    if (entry.audit.status === "PASS") {
      const candidate = buildPackageLookMasterCandidate(currentPlan, {
        candidateId: `look-master-${entry.job.shotId.toLowerCase()}-${entry.job.candidateDirection.directionId}`,
        classification: "INTEGRATED_PACKAGE_CONCEPT",
        artifact: entry.rawReference.artifact,
        provenance: raw.provenance,
        auditArtifact: entry.audit,
      }, {now: completedAt});
      if (candidate.admission.status === "PASS") {
        runtime = advancePackageRuntimeWithLookMasterCandidate(runtime, candidate, {now: completedAt}).runtime;
        admittedCandidateId = candidate.candidateId;
      }
    }
    results.push({
      candidateIndex: entry.job.candidateIndex,
      directionId: entry.job.candidateDirection.directionId,
      artifactSha256: entry.artifact.sha256,
      perceptualHash: entry.perceptualHash,
      auditStatus: entry.audit.status,
      visualReviewStatus: entry.assessment?.status || "SERVICE_BLOCKED",
      totalScore: entry.assessment?.totalScore ?? null,
      assessmentSha256: entry.assessment?.assessmentSha256 || null,
      admittedCandidateId,
      reviewError: entry.reviewError,
    });
  }
  runtime.lookMasterRawReferences = rawReferences;
  runtime.updatedAt = new Date().toISOString();
  delete runtime.sha256;
  runtime.sha256 = sha256(runtime);
  assertPackageLookMasterRuntime(runtime);
  next.production.shotIntelligence = runtime;
  next.production.generation.automaticDispatchAllowed = false;
  if (next.production.generation.summary.queued === 0 && next.production.generation.summary.running === 0) next.production.generation.workerStatus = "frozen";
  const event = createProductionEvent({workspace: current, action: "import-and-audit-operator-package-look-masters", targetId: manifest.shotId, payload: {manifestSha256: sha256(manifest), planSha256: manifest.lookMasterPlanSha256, resultCount: results.length, admittedCount: results.filter((item) => item.admittedCandidateId).length, imagegenPerformedByImport: false}, now: new Date().toISOString()});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = recalculateEditorialAssetWorkbench(next);
  const finalPlan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
  const finalReport = {
    contract: "A1OperatorPackageLookMasterImportReport/v1",
    status: finalPlan.status === "LOOK_MASTER_REVIEW_REQUIRED" ? "READY_FOR_USER_REVIEW" : "PARTIAL_OR_BLOCKED",
    shotId: manifest.shotId,
    sourceWorkspaceSha256: current.workspaceSha256,
    workspaceSha256: next.workspaceSha256,
    planSha256: finalPlan.planSha256,
    rawReferenceCount: rawReferences.filter((item) => item.shotId === manifest.shotId).length,
    admittedCandidateCount: finalPlan.candidates.length,
    recommendation: finalPlan.recommendation,
    results,
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
    imagegenPerformedByImport: false,
    criticPerformed: false,
    motionPerformed: false,
    renderedFilm: false,
    completedAt: event.createdAt,
  };
  files["package-look-masters/ed-10/operator-20260804/import-report.json"] = finalReport;
  persistProjectState(appRoot, assertEditorialAssetWorkbench(next), {event, files});
  return finalReport;
});

console.log(JSON.stringify(report, null, 2));
