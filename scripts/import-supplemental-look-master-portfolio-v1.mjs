#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {advancePackageRuntimeWithLookMasterCandidate, assertPackageLookMasterRuntime, buildPackageLookMasterCandidate} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildPackageLookMasterPixelAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageLookMasterVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";
import {applyLookMasterPortfolioAudit, buildLookMasterPortfolioAudit, buildSupplementalLookMasterPrompt, packagingIntentForDirection} from "../apps/studio-next/src/lib/a1-look-master-portfolio-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const manifestPath = path.resolve(process.argv.find((value) => value.startsWith("--manifest="))?.slice("--manifest=".length) || path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/package-look-masters/ed-10/operator-20260804/supplemental-portfolio-manifest.json"));
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

function resolvePublicFile(publicUrl) {
  if (!String(publicUrl || "").startsWith("/generated/system-line/")) throw new Error("supplemental-look-master-public-url-invalid");
  const file = path.resolve(publicRoot, String(publicUrl).replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("supplemental-look-master-public-url-escape");
  return file;
}

async function perceptualHash(file) {
  const pixels = await sharp(file).resize(16, 16, {fit: "fill"}).grayscale().raw().toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / Math.max(1, pixels.length);
  return [...pixels].map((value) => value >= average ? "1" : "0").join("").match(/.{1,4}/gu).map((nibble) => Number.parseInt(nibble, 2).toString(16)).join("");
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

function generationSummary(jobs) {
  const summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: jobs.length};
  for (const job of jobs) if (Object.hasOwn(summary, job.status)) summary[job.status] += 1;
  return summary;
}

if (!fs.existsSync(manifestPath)) throw new Error("supplemental-look-master-manifest-missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.contract !== "A1SupplementalLookMasterPortfolioImportManifest/v1" || manifest.shotId !== "ED-10" || !Array.isArray(manifest.items) || manifest.items.length !== 2) throw new Error("supplemental-look-master-manifest-invalid");

const sourceWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sourceRuntime = sourceWorkspace.production.shotIntelligence;
const sourcePlan = sourceRuntime?.packageLookMasterPlans?.find((item) => item.shotId === manifest.shotId);
if (!sourcePlan || sourcePlan.planSha256 !== manifest.planSha256 || sourcePlan.reviewDecision?.status !== "REVIEW_REOPENED" || sourcePlan.portfolioAudit?.status !== "SUPPLEMENTAL_DIRECTIONS_REQUIRED") throw new Error("supplemental-look-master-plan-not-ready");
if (sourceWorkspace.production.generation.summary.queued !== 0 || sourceWorkspace.production.generation.summary.running !== 0 || sourceWorkspace.production.generation.workerStatus !== "frozen") throw new Error("supplemental-look-master-queue-not-frozen");
const supplementalById = new Map(sourcePlan.supplementalCandidateDirections.map((direction) => [direction.directionId, direction]));
if (new Set(manifest.items.map((item) => item.directionId)).size !== 2 || manifest.items.some((item) => !supplementalById.has(item.directionId))) throw new Error("supplemental-look-master-direction-invalid");
const baseFrameFile = resolvePublicFile(sourcePlan.videoContext.baseFrame.publicUrl);
if (sha256(fs.readFileSync(baseFrameFile)) !== sourcePlan.videoContext.baseFrame.sha256) throw new Error("supplemental-look-master-base-frame-sha-invalid");
const referenceImages = sourcePlan.referenceInputs.map((reference) => {
  const file = resolvePublicFile(reference.publicUrl);
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== reference.sha256) throw new Error(`supplemental-look-master-reference-invalid:${reference.id}`);
  return {id: reference.id, path: file, sha256: reference.sha256};
});

const prepared = [];
for (const item of manifest.items) {
  const direction = supplementalById.get(item.directionId);
  const file = resolvePublicFile(item.publicUrl);
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== item.sha256) throw new Error(`supplemental-look-master-artifact-invalid:${item.directionId}`);
  const metadata = await sharp(file).metadata();
  const prompt = buildSupplementalLookMasterPrompt(sourcePlan, direction);
  const promptSha256 = sha256(prompt);
  const generationInputHash = sha256({targetKind: "package-look-master", planSha256: sourcePlan.planSha256, directionFingerprint: direction.fingerprint, promptSha256, referenceInputs: sourcePlan.referenceInputs.map(({id, sha256: sourceSha}) => ({id, sha256: sourceSha})), baseFrameSha256: sourcePlan.videoContext.baseFrame.sha256});
  const jobId = `look-master-${manifest.shotId.toLowerCase()}-${item.directionId}-${generationInputHash.slice(0, 12)}`;
  if (sourceWorkspace.production.generation.jobs.some((job) => job.generationInputHash === generationInputHash && job.id !== jobId)) throw new Error(`supplemental-look-master-content-hash-already-exists:${item.directionId}`);
  if ((sourceRuntime.lookMasterRawReferences || []).some((raw) => raw.directionFingerprint === direction.fingerprint || raw.artifact?.sha256 === item.sha256)) throw new Error(`supplemental-look-master-identical-content-not-rescored:${item.directionId}`);
  const artifact = {
    contract: "A1GeneratedEditorialAssetCache/v1",
    targetKind: "package-look-master",
    briefId: `look-master-${manifest.shotId.toLowerCase()}`,
    briefHash: sha256({planSha256: sourcePlan.planSha256, promptSha256}),
    shotId: manifest.shotId,
    provider: manifest.provider,
    model: manifest.model,
    prompt,
    promptSha256,
    cacheKey: generationInputHash,
    generationInputHash,
    sha256: item.sha256,
    publicUrl: item.publicUrl,
    mimeType: "image/png",
    generationId: item.generationId || null,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha === true,
    cacheHit: false,
    durationMs: item.durationMs ?? null,
    providerTimingStatus: item.durationMs == null ? "not-exposed-by-built-in-tool" : "measured",
    generationMode: "operator-led-codex-built-in-imagegen",
    workspaceImported: true,
    importedAt: manifest.generatedAt,
    sourceGeneratedArtifact: item.sourceGeneratedArtifact || null,
  };
  const job = {
    contract: "A1AssetGenerationJob/v2",
    id: jobId,
    jobIdentity: `package-look-master:${manifest.shotId}:${item.directionId}`,
    generationInputHash,
    targetKind: "package-look-master",
    projectId: sourceWorkspace.production.project.projectId,
    sourceHash: sourcePlan.sourceHash,
    assetPackSha256: sourceWorkspace.library.assetPackSha256,
    assetId: null,
    briefId: artifact.briefId,
    briefHash: artifact.briefHash,
    shotId: manifest.shotId,
    eventId: sourcePlan.eventId,
    lookMasterPlanSha256: sourcePlan.planSha256,
    styleBriefSha256: sourcePlan.styleBriefSha256,
    candidateIndex: null,
    candidateDirection: direction,
    generationRole: "supplemental-integrated-package-look-master-candidate",
    mode: "generate",
    referenceInputs: [{kind: "actual-base-frame", publicUrl: sourcePlan.videoContext.baseFrame.publicUrl, sha256: sourcePlan.videoContext.baseFrame.sha256}, ...sourcePlan.referenceInputs],
    capabilitySnapshot: {finishedCompositionAllowed: true, crossLayerCompositeAllowed: true, authoritativeText: false, layerReconstructionRequiredAfterApproval: true},
    qualityTier: "anchor",
    route: "subscription-image-generation",
    provider: manifest.provider,
    providerMode: "subscription-zero-extra-cost",
    model: manifest.model,
    status: "complete",
    prompt,
    promptSha256,
    cacheKey: generationInputHash,
    priority: "package-look-master",
    outputRelativePath: item.publicUrl.replace(/^\//u, ""),
    attempts: 1,
    cacheHit: false,
    error: null,
    telemetry: {queuedAt: manifest.generatedAt, firstPreviewAt: manifest.generatedAt, completedAt: manifest.generatedAt, retryCount: 0, operatorLed: true},
    createdAt: manifest.generatedAt,
    startedAt: null,
    completedAt: manifest.generatedAt,
    durationMs: item.durationMs ?? null,
    output: artifact,
  };
  const rawReference = {
    contract: "A1PackageLookMasterRaw/v1",
    referenceId: `look-master-raw-${jobId}`,
    shotId: manifest.shotId,
    eventId: sourcePlan.eventId,
    planSha256: sourcePlan.planSha256,
    styleBriefSha256: sourcePlan.styleBriefSha256,
    candidateDirectionId: direction.directionId,
    directionFingerprint: direction.fingerprint,
    artifact: {...artifact, perceptualHash: await perceptualHash(file)},
    classification: "INTEGRATED_PACKAGE_CONCEPT",
    status: "LOOK_MASTER_RAW",
    provenance: {generationJobContract: job.contract, generationJobId: job.id, generationInputHash, provider: artifact.provider, model: artifact.model, generationId: artifact.generationId, operatorImported: true, timingStatus: artifact.providerTimingStatus},
    packagingIntent: packagingIntentForDirection(sourcePlan, direction),
    note: "受控补充方向；绑定真实正片帧与实际 Pinterest 文件。完整母版不是四层资产。",
    createdAt: manifest.generatedAt,
  };
  const preliminaryAudit = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", now: manifest.generatedAt});
  prepared.push({item, direction, file, artifact, job, rawReference, preliminaryAudit});
}

const priorPerceptualHashes = (sourceRuntime.lookMasterRawReferences || []).map((raw) => raw.artifact?.perceptualHash).filter(Boolean);
const reviewed = await mapConcurrent(prepared, 2, async (entry) => {
  let assessment = null;
  let audit = entry.preliminaryAudit;
  let error = null;
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
      now: manifest.generatedAt,
    });
    audit = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference: entry.rawReference, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", trustedAssessment: assessment, now: manifest.generatedAt});
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  return {...entry, assessment, audit, reviewError: error};
});

const report = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== sourceWorkspace.workspaceSha256) throw new Error("supplemental-look-master-workspace-changed-during-review");
  let next = structuredClone(current);
  let runtime = structuredClone(next.production.shotIntelligence);
  const files = {};
  const results = [];
  for (const entry of reviewed) {
    next.production.generation.jobs.push(entry.job);
    const raw = {...entry.rawReference, pixelAudit: entry.audit, pixelAuditPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/look-master-audits/${manifest.shotId}/${entry.audit.auditSha256}.json`, serverVisualAssessment: entry.assessment, serverVisualAssessmentPublicUrl: entry.assessment ? `/generated/system-line/editorial-asset-workbench-v1/look-master-reviews/${manifest.shotId}/${entry.assessment.assessmentSha256}.json` : null, serverVisualReviewError: entry.reviewError, candidateAdmissionRequired: true, reviewedAt: manifest.generatedAt};
    runtime.lookMasterRawReferences.push(raw);
    files[`look-master-audits/${manifest.shotId}/${entry.audit.auditSha256}.json`] = entry.audit;
    if (entry.assessment) files[`look-master-reviews/${manifest.shotId}/${entry.assessment.assessmentSha256}.json`] = entry.assessment;
    let admittedCandidateId = null;
    if (entry.audit.status === "PASS") {
      const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
      const candidate = buildPackageLookMasterCandidate(plan, {candidateId: `look-master-${manifest.shotId.toLowerCase()}-${entry.direction.directionId}`, classification: "INTEGRATED_PACKAGE_CONCEPT", artifact: raw.artifact, provenance: raw.provenance, auditArtifact: entry.audit}, {now: manifest.generatedAt});
      if (candidate.admission.status === "PASS") {
        runtime = advancePackageRuntimeWithLookMasterCandidate(runtime, candidate, {now: manifest.generatedAt}).runtime;
        admittedCandidateId = candidate.candidateId;
      }
    }
    results.push({directionId: entry.direction.directionId, artifactSha256: entry.artifact.sha256, auditStatus: entry.audit.status, visualReviewStatus: entry.assessment?.status || "SERVICE_BLOCKED", totalScore: entry.assessment?.totalScore ?? null, admittedCandidateId, reviewError: entry.reviewError});
  }
  const currentPlan = runtime.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
  const portfolioAudit = fs.existsSync(resolvePublicFile(reviewed[0].item.publicUrl))
    ? null
    : null;
  next.production.generation.summary = generationSummary(next.production.generation.jobs);
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  runtime.updatedAt = manifest.generatedAt;
  delete runtime.sha256;
  runtime.sha256 = sha256(runtime);
  next.production.shotIntelligence = runtime;
  const event = createProductionEvent({workspace: current, action: "import-supplemental-look-master-portfolio", targetId: manifest.shotId, payload: {manifestSha256: sha256(manifest), directionIds: manifest.items.map((item) => item.directionId), resultCount: results.length, imagegenPerformedByImport: false}, now: manifest.generatedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = recalculateEditorialAssetWorkbench(next);
  return {next, event, files, results, currentPlan, portfolioAudit};
});

const portfolioAudit = await buildLookMasterPortfolioAudit({plan: report.next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId), rawReferences: report.next.production.shotIntelligence.lookMasterRawReferences, publicRoot, now: manifest.generatedAt});
const final = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== sourceWorkspace.workspaceSha256) throw new Error("supplemental-look-master-workspace-changed-before-portfolio-persist");
  let next = structuredClone(report.next);
  next.production.shotIntelligence = applyLookMasterPortfolioAudit(next.production.shotIntelligence, portfolioAudit, {now: manifest.generatedAt}).runtime;
  if (next.production.packagingReview) {
    next.production.packagingReview.status = portfolioAudit.status === "PASS" ? "LOOK_MASTER_REVIEW_REQUIRED" : "LOOK_MASTER_CANDIDATES_READY";
    next.production.packagingReview.intermediateApprovalRequired = false;
    next.production.packagingReview.requiresExplicitApproval = portfolioAudit.status === "PASS";
    next.production.packagingReview.userApprovalStatus = portfolioAudit.status === "PASS" ? "RECOMMENDED_LOOK_MASTER_CONFIRMATION_REQUIRED" : "NOT_REQUIRED_DURING_CANDIDATE_DISCOVERY";
    next.production.packagingReview.nextAction = portfolioAudit.status === "PASS" ? "review-recommended-package-look-master" : "generate-distinct-supplemental-look-master-directions";
    next.production.packagingReview.updatedAt = manifest.generatedAt;
  }
  next = recalculateEditorialAssetWorkbench(next);
  assertPackageLookMasterRuntime(next.production.shotIntelligence);
  const finalPlan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
  const finalReport = {contract: "A1SupplementalLookMasterPortfolioImportReport/v1", status: finalPlan.status === "LOOK_MASTER_REVIEW_REQUIRED" ? "READY_FOR_USER_REVIEW" : "PARTIAL_OR_BLOCKED", shotId: manifest.shotId, sourceWorkspaceSha256: sourceWorkspace.workspaceSha256, workspaceSha256: next.workspaceSha256, planSha256: finalPlan.planSha256, rawCandidateCount: portfolioAudit.rawCandidateCount, effectiveDirectionCount: portfolioAudit.effectiveDirectionCount, requiredEffectiveDirectionCount: portfolioAudit.requiredEffectiveDirectionCount, duplicateDirectionIds: portfolioAudit.duplicateDirectionIds, recommendation: finalPlan.recommendation, results: report.results, queue: next.production.generation.summary, workerStatus: next.production.generation.workerStatus, imagegenPerformedByImport: false, criticPerformed: false, motionPerformed: false, renderedFilm: false, completedAt: manifest.generatedAt};
  const files = {...report.files, [`look-master-portfolios/${manifest.shotId}/${portfolioAudit.auditSha256}.json`]: portfolioAudit, [`look-master-portfolios/${manifest.shotId}/latest-report.json`]: finalReport};
  persistProjectState(appRoot, next, {event: report.event, files});
  return finalReport;
});

console.log(JSON.stringify(final, null, 2));
