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
import {applyLookMasterPortfolioAudit, buildLookMasterPortfolioAudit, packagingIntentForDirection} from "../apps/studio-next/src/lib/a1-look-master-portfolio-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const manifestFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/package-look-masters/ed-10/operator-20260804/direction-05-structural-revision-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

function resolvePublicFile(publicUrl) {
  if (!String(publicUrl || "").startsWith("/generated/system-line/") && !String(publicUrl || "").startsWith("/a1-editorial-fonts/")) throw new Error("ed10-reconcile-public-url-invalid");
  const file = path.resolve(publicRoot, String(publicUrl).replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("ed10-reconcile-public-url-escape");
  return file;
}

async function perceptualHash(file) {
  const pixels = await sharp(file).resize(16, 16, {fit: "fill"}).grayscale().raw().toBuffer();
  const average = pixels.reduce((sum, value) => sum + value, 0) / Math.max(1, pixels.length);
  return [...pixels].map((value) => value >= average ? "1" : "0").join("").match(/.{1,4}/gu).map((nibble) => Number.parseInt(nibble, 2).toString(16)).join("");
}

function generationSummary(jobs) {
  const summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: jobs.length};
  for (const job of jobs) if (Object.hasOwn(summary, job.status)) summary[job.status] += 1;
  return summary;
}

async function mapConcurrent(items, limit, task) {
  const output = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, () => worker()));
  return output;
}

if (manifest.contract !== "A1LookMasterStructuralRevisionImportManifest/v1" || manifest.shotId !== "ED-10" || manifest.directionId !== "direction-05" || manifest.revisionNumber !== 1) throw new Error("ed10-revision-manifest-invalid");
const sourceWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sourceRuntime = sourceWorkspace.production.shotIntelligence;
const sourcePlan = sourceRuntime.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
if (!sourcePlan || sourcePlan.planSha256 !== manifest.planSha256 || sourcePlan.styleBriefSha256 !== manifest.styleBriefSha256) throw new Error("ed10-revision-plan-binding-invalid");
if (sourceWorkspace.production.generation.summary.queued !== 0 || sourceWorkspace.production.generation.summary.running !== 0 || sourceWorkspace.production.generation.workerStatus !== "frozen") throw new Error("ed10-revision-queue-not-frozen");
const directions = [...sourcePlan.candidateDirections, ...(sourcePlan.supplementalCandidateDirections || [])];
const direction04 = directions.find((item) => item.directionId === "direction-04");
const direction05 = directions.find((item) => item.directionId === "direction-05");
const raw04 = sourceRuntime.lookMasterRawReferences.find((item) => item.shotId === manifest.shotId && item.candidateDirectionId === "direction-04" && item.status !== "SUPERSEDED_BY_POLICY_REVIEW");
const oldRaw05 = sourceRuntime.lookMasterRawReferences.find((item) => item.referenceId === manifest.supersedesRawReferenceId);
if (!direction04 || !direction05 || !raw04 || !oldRaw05) throw new Error("ed10-revision-source-records-missing");

const baseFrameFile = resolvePublicFile(sourcePlan.videoContext.baseFrame.publicUrl);
const referenceImages = sourcePlan.referenceInputs.map((reference) => ({id: reference.id, path: resolvePublicFile(reference.publicUrl), sha256: reference.sha256}));
for (const binding of [{file: baseFrameFile, sha256: sourcePlan.videoContext.baseFrame.sha256}, ...referenceImages.map((item) => ({file: item.path, sha256: item.sha256}))]) {
  if (!fs.existsSync(binding.file) || sha256(fs.readFileSync(binding.file)) !== binding.sha256) throw new Error("ed10-revision-source-binding-invalid");
}

const revisionFile = resolvePublicFile(manifest.publicUrl);
const editableSpecFile = resolvePublicFile(manifest.editableTextSpecPublicUrl);
if (!fs.existsSync(revisionFile) || sha256(fs.readFileSync(revisionFile)) !== manifest.sha256) throw new Error("ed10-revision-artifact-invalid");
if (!fs.existsSync(editableSpecFile) || sha256(fs.readFileSync(editableSpecFile)) !== manifest.editableTextSpecSha256) throw new Error("ed10-revision-editable-text-spec-invalid");
const editableTextSpec = JSON.parse(fs.readFileSync(editableSpecFile, "utf8"));
if (editableTextSpec.contract !== "A1LookMasterEditableTypographyShadow/v1" || editableTextSpec.artifactSha256 !== manifest.sha256 || editableTextSpec.fontSha256 !== sha256(fs.readFileSync(path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf")))) throw new Error("ed10-revision-editable-text-binding-invalid");

const metadata = await sharp(revisionFile).metadata();
const generationInputHash = sha256({targetKind: "package-look-master", planSha256: sourcePlan.planSha256, directionFingerprint: direction05.fingerprint, prompt: manifest.generationPrompt, referenceInputs: [{kind: "prior-look-master", sha256: oldRaw05.artifact.sha256}, {kind: "actual-base-frame", sha256: sourcePlan.videoContext.baseFrame.sha256}, ...sourcePlan.referenceInputs.map(({id, sha256: sourceSha}) => ({id, sha256: sourceSha}))], variantNonce: manifest.variantNonce});
if (sourceWorkspace.production.generation.jobs.some((job) => job.generationInputHash === generationInputHash)) throw new Error("ed10-revision-identical-generation-input-exists");
const jobId = `look-master-ed-10-direction-05-r1-${generationInputHash.slice(0, 12)}`;
const artifact = {
  contract: "A1GeneratedEditorialAssetCache/v1",
  targetKind: "package-look-master",
  briefId: "look-master-ed-10-direction-05-structural-revision-01",
  briefHash: sha256({planSha256: sourcePlan.planSha256, prompt: manifest.generationPrompt, variantNonce: manifest.variantNonce}),
  shotId: manifest.shotId,
  provider: manifest.provider,
  model: manifest.model,
  prompt: manifest.generationPrompt,
  promptSha256: sha256(manifest.generationPrompt),
  cacheKey: generationInputHash,
  generationInputHash,
  sha256: manifest.sha256,
  publicUrl: manifest.publicUrl,
  mimeType: "image/png",
  generationId: manifest.generationId,
  width: metadata.width,
  height: metadata.height,
  hasAlpha: metadata.hasAlpha === true,
  cacheHit: false,
  durationMs: manifest.durationMs,
  providerTimingStatus: manifest.durationMs == null ? "not-exposed-by-built-in-tool" : "measured",
  generationMode: "operator-led-codex-built-in-imagegen-structural-revision",
  workspaceImported: true,
  importedAt: manifest.generatedAt,
  sourceGeneratedArtifact: manifest.sourceGeneratedArtifact,
  editableTextSpec: {publicUrl: manifest.editableTextSpecPublicUrl, sha256: manifest.editableTextSpecSha256, contractSha256: manifest.editableTextSpecContractSha256, fontAssetId: editableTextSpec.fontAssetId, fontSha256: editableTextSpec.fontSha256},
};
const job = {
  contract: "A1AssetGenerationJob/v2",
  id: jobId,
  jobIdentity: "package-look-master:ED-10:direction-05:structural-revision-01",
  generationInputHash,
  variantNonce: manifest.variantNonce,
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
  candidateDirection: direction05,
  generationRole: "structural-revision-integrated-package-look-master-candidate",
  mode: "generate",
  referenceInputs: [{kind: "prior-look-master", publicUrl: oldRaw05.artifact.publicUrl, sha256: oldRaw05.artifact.sha256}, {kind: "actual-base-frame", publicUrl: sourcePlan.videoContext.baseFrame.publicUrl, sha256: sourcePlan.videoContext.baseFrame.sha256}, ...sourcePlan.referenceInputs],
  capabilitySnapshot: {finishedCompositionAllowed: true, crossLayerCompositeAllowed: true, authoritativeText: false, editableTextShadowBound: true, layerReconstructionRequiredAfterApproval: true},
  qualityTier: "anchor",
  route: "subscription-image-generation",
  provider: manifest.provider,
  providerMode: "subscription-zero-extra-cost",
  model: manifest.model,
  status: "complete",
  prompt: manifest.generationPrompt,
  promptSha256: artifact.promptSha256,
  cacheKey: generationInputHash,
  priority: "package-look-master-structural-revision",
  outputRelativePath: manifest.publicUrl.replace(/^\//u, ""),
  attempts: 1,
  cacheHit: false,
  error: null,
  telemetry: {queuedAt: manifest.generatedAt, firstPreviewAt: manifest.generatedAt, completedAt: manifest.generatedAt, retryCount: 0, operatorLed: true},
  createdAt: manifest.generatedAt,
  startedAt: null,
  completedAt: manifest.generatedAt,
  durationMs: manifest.durationMs,
  output: artifact,
};
const revisionRaw = {
  contract: "A1PackageLookMasterRaw/v1",
  referenceId: `look-master-raw-${jobId}`,
  shotId: manifest.shotId,
  eventId: sourcePlan.eventId,
  planSha256: sourcePlan.planSha256,
  styleBriefSha256: sourcePlan.styleBriefSha256,
  candidateDirectionId: direction05.directionId,
  directionFingerprint: direction05.fingerprint,
  artifact: {...artifact, perceptualHash: await perceptualHash(revisionFile)},
  classification: "INTEGRATED_PACKAGE_CONCEPT",
  status: "LOOK_MASTER_RAW",
  revision: {revisionNumber: 1, kind: "STRUCTURAL_REVISION", supersedesRawReferenceId: oldRaw05.referenceId, reason: manifest.revisionReason},
  provenance: {generationJobContract: job.contract, generationJobId: job.id, generationInputHash, provider: artifact.provider, model: artifact.model, generationId: artifact.generationId, operatorImported: true, timingStatus: artifact.providerTimingStatus},
  packagingIntent: packagingIntentForDirection(sourcePlan, direction05),
  editableTextSpec: artifact.editableTextSpec,
  note: "方向 05 唯一结构返修：弱化入口词组、显式压缩/脱落轨迹、强化单一废稿判定；保留真实主体与字幕禁区。",
  createdAt: manifest.generatedAt,
};

const activePriorPerceptualHashes = sourceRuntime.lookMasterRawReferences.filter((raw) => ![raw04.referenceId, oldRaw05.referenceId].includes(raw.referenceId) && !String(raw.status).startsWith("SUPERSEDED_")).map((raw) => raw.artifact?.perceptualHash).filter(Boolean);
const reviewInputs = [
  {kind: "POLICY_REVIEW", direction: direction04, raw: raw04, file: resolvePublicFile(raw04.artifact.publicUrl), now: "2026-08-04T16:24:00.000Z"},
  {kind: "STRUCTURAL_REVISION", direction: direction05, raw: revisionRaw, file: revisionFile, now: manifest.generatedAt},
];
const reviewed = await mapConcurrent(reviewInputs, 2, async (entry) => {
  const preliminary = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference: entry.raw, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", now: entry.now});
  const assessment = await runPackageLookMasterVisualReview({plan: sourcePlan, rawReference: entry.raw, preliminaryAudit: preliminary, candidateImage: entry.file, baseFrameImage: baseFrameFile, compositeImage: resolvePublicFile(preliminary.compositePreview.publicUrl), referenceImages, recentPerceptualHashes: activePriorPerceptualHashes, cacheDir: path.join(artifactDir, "package-look-master-visual-review-cache-v1"), now: entry.now});
  const audit = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference: entry.raw, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", trustedAssessment: assessment, now: entry.now});
  return {...entry, assessment, audit};
});

const prepared = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== sourceWorkspace.workspaceSha256) throw new Error("ed10-revision-workspace-changed-during-review");
  let next = structuredClone(current);
  let runtime = structuredClone(next.production.shotIntelligence);
  const files = {};
  next.production.generation.jobs.push(job);
  next.production.generation.summary = generationSummary(next.production.generation.jobs);
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  const runtimeRaw04 = runtime.lookMasterRawReferences.find((item) => item.referenceId === raw04.referenceId);
  runtimeRaw04.serverVisualAssessmentHistory = [...(runtimeRaw04.serverVisualAssessmentHistory || []), {...runtimeRaw04.serverVisualAssessment, status: runtimeRaw04.serverVisualAssessment?.status || "UNKNOWN", supersededReason: "review-policy-v2-two-visible-references-suffice", supersededAt: reviewed[0].now}];
  runtimeRaw04.serverVisualAssessment = reviewed[0].assessment;
  runtimeRaw04.serverVisualAssessmentPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/look-master-reviews/ED-10/${reviewed[0].assessment.assessmentSha256}.json`;
  runtimeRaw04.pixelAudit = reviewed[0].audit;
  runtimeRaw04.pixelAuditPublicUrl = `/generated/system-line/editorial-asset-workbench-v1/look-master-audits/ED-10/${reviewed[0].audit.auditSha256}.json`;
  runtimeRaw04.status = "LOOK_MASTER_RAW";
  const runtimeOldRaw05 = runtime.lookMasterRawReferences.find((item) => item.referenceId === oldRaw05.referenceId);
  runtimeOldRaw05.status = "SUPERSEDED_BY_STRUCTURAL_REVISION";
  runtimeOldRaw05.supersededByRawReferenceId = revisionRaw.referenceId;
  runtimeOldRaw05.supersededAt = manifest.generatedAt;
  runtime.lookMasterRawReferences.push({...revisionRaw, serverVisualAssessment: reviewed[1].assessment, serverVisualAssessmentPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/look-master-reviews/ED-10/${reviewed[1].assessment.assessmentSha256}.json`, pixelAudit: reviewed[1].audit, pixelAuditPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/look-master-audits/ED-10/${reviewed[1].audit.auditSha256}.json`, candidateAdmissionRequired: true, reviewedAt: manifest.generatedAt});
  for (const entry of reviewed) {
    files[`look-master-audits/ED-10/${entry.audit.auditSha256}.json`] = entry.audit;
    files[`look-master-reviews/ED-10/${entry.assessment.assessmentSha256}.json`] = entry.assessment;
    if (entry.audit.status !== "PASS") continue;
    const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
    const candidate = buildPackageLookMasterCandidate(plan, {candidateId: `look-master-ed-10-${entry.direction.directionId}`, classification: "INTEGRATED_PACKAGE_CONCEPT", artifact: entry.raw.artifact, provenance: entry.raw.provenance, auditArtifact: entry.audit}, {now: entry.now});
    if (candidate.admission.status === "PASS") runtime = advancePackageRuntimeWithLookMasterCandidate(runtime, candidate, {now: entry.now}).runtime;
  }
  runtime.updatedAt = manifest.generatedAt;
  delete runtime.sha256;
  runtime.sha256 = sha256(runtime);
  next.production.shotIntelligence = runtime;
  const event = createProductionEvent({workspace: current, action: "reconcile-ed10-look-master-portfolio", targetId: manifest.shotId, payload: {reviewPolicyVersion: 2, policyRereviewDirectionIds: ["direction-04"], structuralRevisionDirectionIds: ["direction-05"], imagegenPerformedByReconcile: false, generationJobId: job.id}, now: manifest.generatedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = recalculateEditorialAssetWorkbench(next);
  return {next, files, event};
});

const currentPlan = prepared.next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
const portfolioAudit = await buildLookMasterPortfolioAudit({plan: currentPlan, rawReferences: prepared.next.production.shotIntelligence.lookMasterRawReferences, publicRoot, now: manifest.generatedAt});
const final = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== sourceWorkspace.workspaceSha256) throw new Error("ed10-revision-workspace-changed-before-persist");
  let next = structuredClone(prepared.next);
  next.production.shotIntelligence = applyLookMasterPortfolioAudit(next.production.shotIntelligence, portfolioAudit, {now: manifest.generatedAt}).runtime;
  if (next.production.packagingReview) {
    const activeBatchPolicy = next.production.packagingPolicy?.lookMasterFlow === "BATCH_RANKED_AUTO_SELECTED";
    if (activeBatchPolicy) {
      next.production.packagingReview.legacyStatusReadOnly = true;
      next.production.packagingReview.legacyPolicy = {status: "HISTORY_READ_ONLY", reason: "reconcile-ed10-look-master-portfolio-is-legacy"};
    } else {
      next.production.packagingReview.status = portfolioAudit.status === "PASS" ? "LOOK_MASTER_REVIEW_REQUIRED" : "LOOK_MASTER_CANDIDATES_READY";
      next.production.packagingReview.intermediateApprovalRequired = false;
      next.production.packagingReview.requiresExplicitApproval = portfolioAudit.status === "PASS";
      next.production.packagingReview.userApprovalStatus = portfolioAudit.status === "PASS" ? "RECOMMENDED_LOOK_MASTER_CONFIRMATION_REQUIRED" : "NOT_REQUIRED_DURING_CANDIDATE_DISCOVERY";
      next.production.packagingReview.nextAction = portfolioAudit.status === "PASS" ? "review-recommended-package-look-master" : "generate-distinct-supplemental-look-master-directions";
      next.production.packagingReview.updatedAt = manifest.generatedAt;
    }
  }
  next = recalculateEditorialAssetWorkbench(next);
  assertPackageLookMasterRuntime(next.production.shotIntelligence);
  const finalPlan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === manifest.shotId);
  const result = {
    contract: "A1ED10LookMasterPortfolioReconcileReport/v1",
    status: finalPlan.status === "LOOK_MASTER_REVIEW_REQUIRED" ? "READY_FOR_USER_REVIEW" : "PARTIAL_OR_BLOCKED",
    shotId: manifest.shotId,
    sourceWorkspaceSha256: sourceWorkspace.workspaceSha256,
    workspaceSha256: next.workspaceSha256,
    reviewPolicyVersion: 2,
    rawCandidateCount: portfolioAudit.rawCandidateCount,
    effectiveDirectionCount: portfolioAudit.effectiveDirectionCount,
    requiredEffectiveDirectionCount: portfolioAudit.requiredEffectiveDirectionCount,
    duplicateDirectionIds: portfolioAudit.duplicateDirectionIds,
    effectiveDirectionIds: portfolioAudit.effectiveDirectionIds,
    recommendation: finalPlan.recommendation,
    reviews: reviewed.map((entry) => ({directionId: entry.direction.directionId, kind: entry.kind, artifactSha256: entry.raw.artifact.sha256, visualReviewStatus: entry.assessment.status, totalScore: entry.assessment.totalScore, pixelAuditStatus: entry.audit.status, assessmentSha256: entry.assessment.assessmentSha256})),
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
    structuralRevisionImagegenCount: 1,
    fourLayerReconstructionPerformed: false,
    motionPerformed: false,
    renderedFilm: false,
    completedAt: manifest.generatedAt,
  };
  const files = {...prepared.files, [`look-master-portfolios/ED-10/${portfolioAudit.auditSha256}.json`]: portfolioAudit, "look-master-portfolios/ED-10/latest-report.json": result};
  persistProjectState(appRoot, next, {event: prepared.event, files});
  return result;
});

console.log(JSON.stringify(final, null, 2));
