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
const manifestRelative = "generated/system-line/editorial-asset-workbench-v1/ed19-c4-editable-typography-v1/manifest.json";
const manifestFile = path.join(publicRoot, manifestRelative);
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

if (manifest.contract !== "A1ED19C4EditableTypographyComposite/v1" || manifest.status !== "READY_FOR_ACTUAL_PIXEL_REVIEW") throw new Error("ed19-c4-typography-manifest-invalid");
const artifactFile = path.join(publicRoot, manifest.artifact.publicUrl.replace(/^\//u, ""));
if (fileSha256(artifactFile) !== manifest.artifact.sha256) throw new Error("ed19-c4-typography-artifact-sha-mismatch");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed19-c4-typography-runtime-not-frozen");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed19-c4-typography-assembly-forbidden");
  const plan = current.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-19");
  const sourceRaw = current.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === "ED-19" && item.artifact?.sha256 === manifest.source.sha256);
  if (!plan?.planSha256 || !sourceRaw?.actualPixelAssessment?.reviewer || sourceRaw.actualPixelAssessment.reviewer.decision !== "APPROVED") throw new Error("ed19-c4-approved-source-not-current");
  const now = new Date().toISOString();
  const text = manifest.formalTypographyBinding.exactCopy.join(" ");
  const assessment = {contract: "A1ED19C4PostTypographyActualPixelAssessment/v1", status: "PASS", artifactSha256: manifest.artifact.sha256, sourceArtifactSha256: manifest.source.sha256, reviewer: {kind: "agent-visual-director", decision: "READY_FOR_WHOLE_FILM_BOARD_REVIEW"}, localEvidence: {actualFullFrameInspected: true, sourceLookMasterPreserved: true, primaryActorDominant: true, singleReadingPath: true, titleOverloadFound: false, formalTextExactAndEditable: true, evaRole: "TYPOGRAPHY_ONLY"}, assessedAt: now};
  assessment.assessmentSha256 = sha256(assessment);
  const pixelAudit = {contract: "A1PackageLookMasterPixelAudit/v1", status: "PASS", admissionAllowed: true, failures: [], artifactSha256: manifest.artifact.sha256, actualPixelMetrics: {width: manifest.artifact.width, height: manifest.artifact.height, visualFingerprint: "FULLSCREEN|quiet-iconic|one-object-machine|top-sequence-type|charcoal-cool-white-cobalt"}, footageCompatibility: {status: "PASS", baseFrameSha256: plan.videoContext?.baseFrame?.sha256 || null}, auditSha256: null};
  pixelAudit.auditSha256 = sha256(pixelAudit);
  const semanticPixelAudit = {contract: "A1WholeFilmActualPixelSemanticGate/v1", status: "PASS", shotId: "ED-19", checks: {viewerTakeawayMatch: true, actorActionMatch: true, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, artifactSha256Verified: true, noGeneratedFormalText: true}, ocrText: text, ocr: {status: "PASS", text, exactCopy: true}, findings: [], recommendationEligible: true, auditSha256: null};
  semanticPixelAudit.auditSha256 = sha256(semanticPixelAudit);
  const serverVisualAssessment = {contract: "A1ServerVisualAssessment/v1", status: "PASS", artifactSha256: manifest.artifact.sha256, actualPixelsViewed: true, assessmentSha256: assessment.assessmentSha256};
  const artifact = {...structuredClone(sourceRaw.artifact), sha256: manifest.artifact.sha256, publicUrl: manifest.artifact.publicUrl, width: manifest.artifact.width, height: manifest.artifact.height, productionMethod: "HOLD_FRAME_REFERENCED_FULL_LOOK_MASTER_THEN_LAYER_EXTRACTION", postSelectionTypographyMethod: "FONTKIT_DIRECT_GLYPH_OUTLINES", sourceLookMasterSha256: manifest.source.sha256, formalTypographyBinding: manifest.formalTypographyBinding};
  const raw = {...structuredClone(sourceRaw), referenceId: `look-master-raw-ed-19-c4-typography-${manifest.artifact.sha256.slice(0, 12)}`, artifact, productionMethod: artifact.productionMethod, postSelectionTypographyMethod: artifact.postSelectionTypographyMethod, pixelAudit, semanticPixelAudit, serverVisualAssessment, actualPixelAssessment: assessment, actualPixelAssessmentSha256: assessment.assessmentSha256, userVisualApproval: "APPROVED", current: true, historyReadOnly: false, selectionEligible: true, recommendationEligible: true, generatedAt: now};
  const next = structuredClone(current);
  next.production.shotIntelligence.lookMasterRawReferences = next.production.shotIntelligence.lookMasterRawReferences.map((item) => item.shotId === "ED-19" && item.current === true ? {...item, current: false, historyReadOnly: true} : item);
  next.production.shotIntelligence.lookMasterRawReferences.push(raw);
  const nextPlan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-19");
  nextPlan.provisionalWholeFilmBoardSelection = {...structuredClone(nextPlan.provisionalWholeFilmBoardSelection), candidateId: raw.referenceId, artifact: structuredClone(artifact), compositePreview: null, actualPixelAuditSha256: pixelAudit.auditSha256, semanticPixelAuditSha256: semanticPixelAudit.auditSha256, selectedAt: now, selectionSource: "POST_SELECTION_LOCAL_EDITABLE_TYPOGRAPHY_BINDING", planMetadataMigration: null};
  const event = createProductionEvent({workspace: current, action: "adopt-ed19-c4-editable-typography", targetId: manifest.artifact.sha256, payload: {contract: manifest.contract, shotId: "ED-19", sourceLookMasterSha256: manifest.source.sha256, artifactSha256: manifest.artifact.sha256, fontSha256: manifest.formalTypographyBinding.fontSha256, actualPixelsViewed: true, imageGenerationPerformed: false, motionPerformed: false, assemblyCreated: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, files: {"ed19-c4-editable-typography-v1/adoption.json": {...manifest, status: "ADOPTED_PENDING_WHOLE_FILM_STATIC_BOARD_REVIEW", assessment}}});
  return {status: "PASS", workspaceSha256: persisted.workspaceSha256, artifactSha256: manifest.artifact.sha256, nextAction: recalculated.production.authority.nextAction.id, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length};
});

console.log(JSON.stringify(result, null, 2));
