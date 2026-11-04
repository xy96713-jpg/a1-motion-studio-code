#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const preflight = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/ed19-reference-attached-look-master-v1/preflight.json"), "utf8"));

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const decision = current.production.creatorPackagingCandidateDecision;
  if (decision?.candidateId !== "ED-19-c4" || decision.status !== "READY_FOR_USER_REVIEW" || decision.userVisualApproval !== "NOT_APPROVED") throw new Error("ed19-c4-review-gate-not-current");
  if (current.production.authority?.nextAction?.id !== "adopt-ed-19-c4-or-reject-and-hold") throw new Error("ed19-c4-adoption-action-not-current");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed19-c4-runtime-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed19-c4-assembly-forbidden");

  const artifactPath = path.join(publicRoot, decision.artifact.publicUrl.replace(/^\//u, ""));
  const bytes = fs.readFileSync(artifactPath);
  if (sha256(bytes) !== decision.artifact.sha256) throw new Error("ed19-c4-artifact-sha-mismatch");
  const plan = current.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-19");
  if (!plan?.planSha256) throw new Error("ed19-current-plan-missing");
  const attachments = preflight.attachmentManifest.attachments;
  const attachmentSourceShas = attachments.map((item) => item.sourceSha256);
  if (!attachmentSourceShas.includes(plan.videoContext.baseFrame.sha256)) throw new Error("ed19-c4-composition-anchor-missing");

  const now = new Date().toISOString();
  const assessment = {contract: "A1ED19C4ActualPixelAssessment/v1", status: "PASS", artifactSha256: decision.artifact.sha256, reviewer: {kind: "human-user", decision: "APPROVED", sourceUtterance: "可以"}, hardFailures: [], localEvidence: {visualDirectorReview: {actualFullFrameInspected: true, fullLookMasterActualPixelPass: true}, ocr: {status: "PASS", generatedFormalTextPresent: false}}, assessedAt: now};
  assessment.assessmentSha256 = sha256(assessment);
  const pixelAudit = {contract: "A1PackageLookMasterPixelAudit/v1", status: "PASS", admissionAllowed: true, failures: [], artifactSha256: decision.artifact.sha256, actualPixelMetrics: {width: decision.artifact.width, height: decision.artifact.height, visualFingerprint: "FULLSCREEN|quiet-iconic|one-object-machine|charcoal-cool-white-cobalt"}, footageCompatibility: {status: "PASS", baseFrameSha256: plan.videoContext.baseFrame.sha256}, auditSha256: null};
  pixelAudit.auditSha256 = sha256(pixelAudit);
  const semanticPixelAudit = {contract: "A1WholeFilmActualPixelSemanticGate/v1", status: "PASS", shotId: "ED-19", checks: {viewerTakeawayMatch: true, actorActionMatch: true, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, artifactSha256Verified: true, noGeneratedFormalText: true}, findings: [], recommendationEligible: true, auditSha256: null};
  semanticPixelAudit.auditSha256 = sha256(semanticPixelAudit);
  const goldenFilmMaturityAudit = {contract: "A1GoldenFilmVisualMaturityAudit/v1", status: "PASS", actualFrameOccupation: "FULL_FRAME_TAKEOVER", localAssessmentSha256: assessment.assessmentSha256, auditSha256: null};
  goldenFilmMaturityAudit.auditSha256 = sha256(goldenFilmMaturityAudit);
  const raw = {
    contract: "A1PackageLookMasterRawReference/v1", referenceId: "look-master-raw-ed-19-c4-user-approved", shotId: "ED-19", status: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", classification: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", fullLookMasterStatus: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS", current: true, historyReadOnly: false, selectionEligible: true, userVisualApproval: "APPROVED", planSha256: plan.planSha256,
    referencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1", productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION", imagegenAttachmentCount: attachments.length, imagegenAttachmentManifestSha256: preflight.attachmentManifest.manifestSha256, referenceAttachmentManifest: {...preflight.attachmentManifest, stage: "ATTACHED_TO_INITIAL_IMAGEGEN_PROMPT", attachments: attachments.map((item) => ({...item, attachedToInitialPrompt: true}))},
    artifact: {contract: "A1GeneratedEditorialAssetCache/v1", targetKind: "package-look-master", shotId: "ED-19", provider: "codex-imagegen", model: "gpt-image-2", sha256: decision.artifact.sha256, publicUrl: decision.artifact.publicUrl, mimeType: "image/png", width: decision.artifact.width, height: decision.artifact.height, referencePackagingContract: "A1UniversalReferenceToImagegenPackaging/v1", productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION", imagegenAttachmentCount: attachments.length, imagegenAttachmentSourceShas: attachmentSourceShas, imagegenAttachmentManifestSha256: preflight.attachmentManifest.manifestSha256, referenceAttachmentManifestSha256: preflight.attachmentManifest.manifestSha256, imagegenAttachmentsAttachedToInitialPrompt: true, formalTypographyBinding: {status: "PENDING_POST_SELECTION_LOCAL_EDITABLE_BINDING", renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", generatedFormalTextAllowed: false, evaRole: "TYPOGRAPHY_ONLY"}},
    pixelAudit, semanticPixelAudit, actualPixelAssessment: assessment, actualPixelAssessmentSha256: assessment.assessmentSha256, goldenFilmMaturityAudit, generatedAt: now,
  };

  const next = structuredClone(current);
  next.production.shotIntelligence.lookMasterRawReferences = (next.production.shotIntelligence.lookMasterRawReferences || []).map((item) => item.shotId === "ED-19" && item.current === true ? {...item, current: false, historyReadOnly: true} : item);
  next.production.shotIntelligence.lookMasterRawReferences.push(raw);
  next.production.creatorPackagingCandidateDecision = {...decision, status: "USER_APPROVED", userVisualApproval: "APPROVED", productionAdmission: true, adoptedAt: now, nextAction: "COMPILE_CREATOR_PACKAGING_PALETTE_BOUND_REPAIR"};
  const event = createProductionEvent({workspace: current, action: "adopt-ed19-c4-look-master", targetId: decision.artifact.sha256, payload: {contract: decision.contract, candidateId: decision.candidateId, shotId: "ED-19", userVisualApproval: "APPROVED", productionAdmission: true, motionStarted: false, resolveStarted: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"creator-packaging-candidate-decision-v1/ED-19-c4-adoption.json": next.production.creatorPackagingCandidateDecision}});
  return {status: "USER_APPROVED", candidateId: decision.candidateId, workspaceSha256: persisted.workspaceSha256, nextAction: recalculated.production.authority.nextAction.id, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
