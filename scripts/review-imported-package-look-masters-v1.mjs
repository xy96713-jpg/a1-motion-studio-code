#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {advancePackageRuntimeWithLookMasterCandidate, assertPackageLookMasterRuntime, buildPackageLookMasterCandidate} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildPackageLookMasterPixelAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {runPackageLookMasterVisualReview} from "../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {artifactDir} = projectDirs(appRoot);
const shotId = process.argv.find((value) => value.startsWith("--shot="))?.slice("--shot=".length) || "ED-10";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

function resolvePublicFile(publicUrl) {
  if (!String(publicUrl || "").startsWith("/generated/system-line/")) throw new Error("look-master-review-public-url-invalid");
  const file = path.resolve(publicRoot, publicUrl.replace(/^\//u, ""));
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("look-master-review-public-url-escape");
  return file;
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

const sourceWorkspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const sourceRuntime = sourceWorkspace.production.shotIntelligence;
const sourcePlan = sourceRuntime.packageLookMasterPlans?.find((item) => item.shotId === shotId);
const sourceRawByDirection = new Map();
for (const item of (sourceRuntime.lookMasterRawReferences || []).filter((item) => item.shotId === shotId
  && (item.planSha256 === sourcePlan?.planSha256 || item.candidateAuditMigration?.targetPlanSha256 === sourcePlan?.planSha256))) {
  const existing = sourceRawByDirection.get(item.candidateDirectionId);
  if (!existing || String(item.createdAt || "") >= String(existing.createdAt || "")) sourceRawByDirection.set(item.candidateDirectionId, item);
}
// Revisions are immutable.  A legacy raw reference whose old path was
// overwritten by a pre-hardening worker is excluded from review and can never
// become eligible; the path-identity fix below prevents new occurrences.
const sourceRawReferences = [...sourceRawByDirection.values()].filter((item) => {
  try {
    const file = resolvePublicFile(item.artifact?.publicUrl);
    return fs.existsSync(file) && sha256(fs.readFileSync(file)) === item.artifact?.sha256;
  } catch {
    return false;
  }
});
// A generation slot is not a visual candidate: exact-SHA/perceptual duplicates
// are intentionally collapsed by the worker before director review.  The
// product contract asks for 2–4 distinct Look Masters, so review the available
// unique raw set once at least two survived discovery; do not force a duplicate
// or a timed-out slot back into the candidate set.
if (!sourcePlan || sourceRawReferences.length < Math.min(2, sourcePlan.candidateBudget)) throw new Error("look-master-review-imported-raw-parity-invalid");
if (!sourcePlan.videoContext?.baseFrame?.publicUrl) throw new Error("look-master-review-base-frame-required");
const baseFrameImage = resolvePublicFile(sourcePlan.videoContext.baseFrame.publicUrl);
const referenceImages = [
  ...sourcePlan.referenceInputs.map((reference) => ({id: reference.id, path: resolvePublicFile(reference.publicUrl), sha256: reference.sha256, kind: "STYLE_REFERENCE"})),
  ...(sourcePlan.sourceEvidenceInputs || []).map((reference) => ({id: reference.id, path: resolvePublicFile(reference.publicUrl), sha256: reference.sha256, kind: "REAL_EVIDENCE_REFERENCE"})),
];
const priorPerceptualHashes = (sourceRuntime.lookMasterRawReferences || []).filter((item) => item.shotId !== shotId).map((item) => item.artifact?.perceptualHash).filter(Boolean);

const reviewed = await mapConcurrent(sourceRawReferences, 2, async (rawReference) => {
  const preliminaryAudit = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", now: new Date().toISOString()});
  let assessment = null;
  let audit = preliminaryAudit;
  let reviewError = null;
  try {
    assessment = await runPackageLookMasterVisualReview({
      plan: sourcePlan,
      rawReference,
      preliminaryAudit,
      candidateImage: resolvePublicFile(rawReference.artifact.publicUrl),
      baseFrameImage,
      compositeImage: resolvePublicFile(preliminaryAudit.compositePreview.publicUrl),
      referenceImages,
      recentPerceptualHashes: priorPerceptualHashes,
      cacheDir: path.join(artifactDir, "package-look-master-visual-review-cache-v1"),
      now: new Date().toISOString(),
    });
    audit = await buildPackageLookMasterPixelAudit({plan: sourcePlan, rawReference, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/look-master-audits", trustedAssessment: assessment, now: new Date().toISOString()});
  } catch (error) {
    reviewError = error instanceof Error ? error.message : String(error);
  }
  return {rawReference, assessment, audit, reviewError};
});

const report = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentPlan = current.production.shotIntelligence.packageLookMasterPlans?.find((item) => item.shotId === shotId);
  if (!currentPlan || currentPlan.planSha256 !== sourcePlan.planSha256) throw new Error("look-master-review-plan-changed-during-review");
  let runtime = structuredClone(current.production.shotIntelligence);
  const files = {};
  const results = [];
  for (const entry of reviewed) {
    const rawIndex = runtime.lookMasterRawReferences.findIndex((item) => item.referenceId === entry.rawReference.referenceId && item.artifact.sha256 === entry.rawReference.artifact.sha256);
    if (rawIndex < 0) throw new Error("look-master-review-raw-changed-during-review");
    const raw = {
      ...runtime.lookMasterRawReferences[rawIndex],
      pixelAudit: entry.audit,
      pixelAuditPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/look-master-audits/${shotId}/${entry.audit.auditSha256}.json`,
      serverVisualAssessment: entry.assessment,
      serverVisualAssessmentPublicUrl: entry.assessment ? `/generated/system-line/editorial-asset-workbench-v1/look-master-reviews/${shotId}/${entry.assessment.assessmentSha256}.json` : null,
      serverVisualReviewError: entry.reviewError,
      reviewedAt: new Date().toISOString(),
    };
    runtime.lookMasterRawReferences[rawIndex] = raw;
    files[`look-master-audits/${shotId}/${entry.audit.auditSha256}.json`] = entry.audit;
    if (entry.assessment) files[`look-master-reviews/${shotId}/${entry.assessment.assessmentSha256}.json`] = entry.assessment;
    let admittedCandidateId = null;
    if (entry.audit.status === "PASS") {
      const direction = currentPlan.candidateDirections.find((item) => item.fingerprint === entry.audit.directionFingerprint);
      const candidate = buildPackageLookMasterCandidate(currentPlan, {
        candidateId: `look-master-${shotId.toLowerCase()}-${direction.directionId}`,
        classification: "INTEGRATED_PACKAGE_CONCEPT",
        artifact: entry.rawReference.artifact,
        provenance: raw.provenance,
        auditArtifact: entry.audit,
      }, {now: raw.reviewedAt});
      if (candidate.admission.status === "PASS") {
        runtime = advancePackageRuntimeWithLookMasterCandidate(runtime, candidate, {now: raw.reviewedAt}).runtime;
        admittedCandidateId = candidate.candidateId;
      }
    }
    results.push({
      rawReferenceId: raw.referenceId,
      directionId: raw.candidateDirectionId,
      artifactSha256: raw.artifact.sha256,
      assessmentStatus: entry.assessment?.status || "SERVICE_BLOCKED",
      totalScore: entry.assessment?.totalScore ?? null,
      hardFailures: entry.assessment?.hardFailures || [],
      auditStatus: entry.audit.status,
      admittedCandidateId,
      reviewError: entry.reviewError,
    });
  }
  runtime.updatedAt = new Date().toISOString();
  delete runtime.sha256;
  runtime.sha256 = sha256(runtime);
  assertPackageLookMasterRuntime(runtime);
  let next = structuredClone(current);
  next.production.shotIntelligence = runtime;
  next.production.generation.automaticDispatchAllowed = false;
  if (next.production.generation.summary.queued === 0 && next.production.generation.summary.running === 0) next.production.generation.workerStatus = "frozen";
  const event = createProductionEvent({workspace: current, action: "review-imported-package-look-masters", targetId: shotId, payload: {planSha256: currentPlan.planSha256, reviewCount: results.length, passCount: results.filter((item) => item.admittedCandidateId).length, imagegenPerformed: false}, now: new Date().toISOString()});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = recalculateEditorialAssetWorkbench(next);
  const finalPlan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const finalReport = {
    contract: "A1ImportedPackageLookMasterReviewReport/v1",
    status: finalPlan.status === "LOOK_MASTER_REVIEW_REQUIRED" ? "READY_FOR_USER_REVIEW" : "PARTIAL_OR_BLOCKED",
    shotId,
    sourceWorkspaceSha256: current.workspaceSha256,
    workspaceSha256: next.workspaceSha256,
    planSha256: finalPlan.planSha256,
    candidateCount: finalPlan.candidates.length,
    recommendation: finalPlan.recommendation,
    results,
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
    imagegenPerformed: false,
    criticPerformed: false,
    motionPerformed: false,
    renderedFilm: false,
    completedAt: event.createdAt,
  };
  files[`look-master-reviews/${shotId}/latest-report.json`] = finalReport;
  persistProjectState(appRoot, assertEditorialAssetWorkbench(next), {event, files});
  return finalReport;
});

console.log(JSON.stringify(report, null, 2));
