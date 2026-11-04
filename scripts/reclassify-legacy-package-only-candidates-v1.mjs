#!/usr/bin/env node

import crypto from "node:crypto";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, UNIVERSAL_REFERENCE_PRODUCTION_METHOD} from "../apps/studio-next/src/lib/a1-universal-reference-to-imagegen-packaging-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const reportRelativePath = "golden-film-visual-system-maturity-v1/universal-reference-packaging-migration.json";
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const LEGACY_SHA_PREFIXES = Object.freeze(["9262be9", "af4ef8a", "be0ffdc", "41279fd", "0dcef52", "95bcb74"]);

export function reclassifyLegacyPackageOnlyCandidates({now = new Date().toISOString()} = {}) {
  return withProjectLock(appRoot, () => {
    const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const target = (value) => typeof value === "string" && LEGACY_SHA_PREFIXES.some((prefix) => value.startsWith(prefix));
    const next = structuredClone(before);
    const jobs = next.production.generation.jobs || [];
    const changedJobs = jobs.filter((job) => target(job.output?.sha256));
    for (const job of changedJobs) {
      job.productionMethod = "LEGACY_PACKAGE_ONLY";
      job.referencePackagingContract = A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT;
      job.referenceAttachmentEvidence = {
        contract: "A1ImagegenActualAttachmentEvidence/v1",
        status: "MISSING",
        hardBlock: true,
        reason: "独立 package 生成发生在 universal reference attachment contract 之前；旧 job 只有文本/路径声明，没有 --image 初始附件证据。",
        sourceSha256s: (job.referenceInputs || []).map((item) => item.sha256 || item.sourceSha256 || null),
      };
    }
    const rawReferences = next.production.shotIntelligence.lookMasterRawReferences || [];
    const changedRaw = rawReferences.filter((raw) => target(raw.artifact?.sha256));
    for (const raw of changedRaw) {
      raw.classification = "TECHNICAL_COMPOSITE_PROOF";
      raw.fullLookMasterStatus = "LEGACY_PACKAGE_ONLY";
      raw.userVisualApproval = "NOT_APPROVED";
      raw.selectionEligible = false;
      raw.recommendationEligible = false;
      raw.current = false;
      raw.historyReadOnly = true;
      raw.authorityScope = "HISTORY_READ_ONLY";
      raw.legacyClassificationReason = "NO_ACTUAL_IMAGE_ATTACHMENT_SHA_PROOF";
      raw.provenance = {
        ...(raw.provenance || {}),
        productionMethod: "LEGACY_PACKAGE_ONLY",
        referencePackagingContract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
        referenceAttachmentEvidence: {status: "MISSING", hardBlock: true, reason: "NO_ACTUAL_IMAGE_ATTACHMENT_SHA_PROOF"},
      };
    }
    const changedShotIds = [...new Set([...changedJobs, ...changedRaw].map((item) => item.shotId).filter(Boolean))].sort();
    const runtimeHashInput = structuredClone(next.production.shotIntelligence);
    delete runtimeHashInput.sha256;
    next.production.shotIntelligence.sha256 = sha256(runtimeHashInput);
    next.production.generation.automaticDispatchAllowed = false;
    next.production.generation.workerStatus = "frozen";
    next.production.generation.summary.queued = 0;
    next.production.generation.summary.running = 0;
    next.production.shotIntelligence.wholeFilmBatchRecommendation = {
      ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      universalReferencePackagingStatus: "BLOCKED_UNTIL_ACTUAL_IMAGE_ATTACHMENTS_AND_FULL_LOOK_MASTER_AUDIT",
      universalReferencePackagingNextAction: "PREPARE_REFERENCE_ATTACHED_FULL_LOOK_MASTER_WAVE",
    };
    const body = {
      contract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT,
      status: "PASS_LEGACY_OUTPUTS_CLASSIFIED",
      productionMethod: UNIVERSAL_REFERENCE_PRODUCTION_METHOD,
      changedShotIds,
      technicalCompositeProofs: changedRaw.map((raw) => ({shotId: raw.shotId, candidateSha256: raw.artifact?.sha256 || null, compositeSha256: raw.composite?.sha256 || raw.presenterComposite?.sha256 || null, classification: raw.classification, fullLookMasterStatus: raw.fullLookMasterStatus, userVisualApproval: raw.userVisualApproval})),
      legacyJobs: changedJobs.map((job) => ({jobId: job.id, shotId: job.shotId, candidateSha256: job.output?.sha256 || null, generationMode: job.generationMode, referenceAttachmentEvidence: job.referenceAttachmentEvidence})),
      goodPngShaChanged: false,
      imageGenerationPerformed: false,
      assemblyCreated: false,
      generatedAt: now,
    };
    const report = {...body, reportSha256: sha256({...body, reportSha256: undefined})};
    const event = createProductionEvent({workspace: next, action: "reclassify-legacy-package-only-candidates", targetId: report.reportSha256, payload: {contract: A1_UNIVERSAL_REFERENCE_PACKAGING_CONTRACT, changedShotIds, imageGenerationPerformed: false, assemblyCreated: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: before.workspaceSha256, files: {[reportRelativePath]: report}});
    return {workspace: committed, report, changedShotIds, changedJobs: changedJobs.length, changedRaw: changedRaw.length};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = reclassifyLegacyPackageOnlyCandidates();
  console.log(JSON.stringify({status: "PASS", workspaceSha256: result.workspace.workspaceSha256, changedShotIds: result.changedShotIds, changedJobs: result.changedJobs, changedRaw: result.changedRaw, reportSha256: result.report.reportSha256}, null, 2));
}
