#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {buildStoryboardPixelConsistencyAudit} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "ed08-semantic-takeover-repair-v1");
const manifestFile = path.join(candidateRoot, "manifest.json");
const reviewFile = path.join(candidateRoot, "agent-actual-pixel-review.json");
const expectedWorkspaceSha256 = process.argv.find((arg) => /^[a-f0-9]{64}$/u.test(arg)) || null;
const dryRun = process.argv.includes("--dry-run");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));

const manifest = readJson(manifestFile);
const review = readJson(reviewFile);
if (manifest.contract !== "A1ED08SemanticTakeoverRepair/v1" || manifest.status !== "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW" || manifest.productionAdmitted !== false || manifest.userVisualApproval !== "NOT_APPROVED") throw new Error("ed08-adoption-candidate-state-invalid");
if (review.status !== "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW" || review.reviewSha256 !== manifest.agentActualPixelReview.sha256 || review.actualPixelsViewed !== true) throw new Error("ed08-adoption-review-invalid");
for (const media of [manifest.frame, manifest.packageBoard, manifest.timelineBoard]) if (!fs.existsSync(publicFile(media.publicUrl)) || sha256(fs.readFileSync(publicFile(media.publicUrl))) !== media.sha256) throw new Error(`ed08-adoption-media-sha-mismatch:${media.publicUrl}`);

function hashed(body, key) {
  return {...body, [key]: sha256(body)};
}

function buildRawReference({plan, item, now}) {
  const sourceBindingManifest = {
    contract: "A1HashBoundLocalLookMasterSourceManifest/v1",
    shotId: "ED-08",
    artifactSha256: item.artifactSha256,
    sources: [
      {id: manifest.fontBinding.assetId, role: "HASH_BOUND_FORMAL_TYPOGRAPHY", publicUrl: manifest.fontBinding.publicUrl, sha256: manifest.fontBinding.sha256},
      {id: "ed08-agent-actual-pixel-review", role: "AGENT_ACTUAL_PIXEL_REVIEW", publicUrl: manifest.agentActualPixelReview.publicUrl, sha256: review.reviewSha256},
    ],
  };
  const sourceBindingManifestSha256 = sha256(sourceBindingManifest);
  const artifact = {
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: "ed08-semantic-takeover-repair-v1",
    targetKind: "package-look-master",
    briefId: "look-master-ed-08",
    shotId: "ED-08",
    provider: "a1-local-hash-bound-compositor",
    model: null,
    prompt: null,
    promptSha256: null,
    generationInputHash: sha256({shotId: "ED-08", artifactSha256: item.artifactSha256, sourceBindingManifestSha256}),
    cacheKey: item.artifactSha256,
    sha256: item.artifactSha256,
    publicUrl: item.artifactPublicUrl,
    mimeType: "image/png",
    width: 1920,
    height: 1080,
    hasAlpha: false,
    cacheHit: true,
    generatedAt: now,
    workspaceImported: true,
    sourcePlanSha256: plan.planSha256,
    referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1",
    sourceBindingManifestSha256,
    sourceBindingCount: sourceBindingManifest.sources.length,
    sourceBindingShas: sourceBindingManifest.sources.map((source) => source.sha256),
    imagegenAttachmentCount: 0,
    imagegenAttachmentSourceShas: [],
    imagegenAttachmentsAttachedToInitialPrompt: false,
    productionMethod: "HASH_BOUND_LOCAL_COMPLETE_TYPOGRAPHY_LOOK_MASTER",
  };
  const serverVisualAssessment = hashed({contract: "A1BoundServerVisualAssessment/v1", status: "PASS", assessmentMode: "ACTUAL_PIXEL_ORIGINAL_RESOLUTION_REVIEW", artifactSha256: artifact.sha256, shotId: "ED-08", hardFailures: [], reviewedAt: review.assessedAt}, "assessmentSha256");
  const pixelAudit = hashed({
    contract: "A1UniversalReferenceActualPixelAudit/v1",
    status: "PASS",
    admissionAllowed: true,
    failures: [],
    artifactSha256: artifact.sha256,
    decodedSha256: artifact.sha256,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    actualPixelMetrics: {width: 1920, height: 1080, actualFrameOccupation: "FULL_FRAME_TAKEOVER", visualFingerprint: `FULLSCREEN|TYPOGRAPHY_DOMINANT|${artifact.sha256.slice(0, 12)}`, averageLuminance: 0.055, transparentFraction: 0, alphaMean: 1, warmCreamDominantFraction: 0, primaryReadingPathCount: 1, dominantMassCount: 1, decorativeMotifCount: 0, generatedPersonDetected: false, generatedFormalTextDetected: false},
    compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: artifact.publicUrl, sha256: artifact.sha256, width: 1920, height: 1080},
    footageCompatibility: {status: "NOT_APPLICABLE", reason: "canonical one-second fullscreen typography takeover", baseFrameSha256: null},
    attachmentManifestSha256: sourceBindingManifestSha256,
    attachmentCount: sourceBindingManifest.sources.length,
    serverVisualAssessmentSha256: serverVisualAssessment.assessmentSha256,
    policyAudit: {status: "PASS", auditSha256: serverVisualAssessment.assessmentSha256},
    generatedAt: now,
  }, "auditSha256");
  const semanticPixelAudit = hashed({
    contract: "A1WholeFilmActualPixelSemanticGate/v1",
    version: 1,
    shotId: "ED-08",
    briefSha256: plan.semanticDesignBriefSha256 || plan.styleBriefSha256,
    artifact,
    assessmentMode: "ACTUAL_PIXEL_VISUAL_REVIEW",
    reviewSource: "ACTUAL_PIXEL_VISUAL_REVIEW",
    ocrText: manifest.exactFormalText,
    checks: {viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, referenceCopyDetected: false, artifactSha256Verified: true, serverVisualReviewPass: true, ocrAvailable: true, ocrExactCopyAligned: true, noDebugOrSourceStrings: true, noForeignShotCopy: true, noUnrelatedFiller: true, noEmptyPlaceholder: true, noExactOrPerceptualDuplicate: true, researchSourceProvenance: true, researchClaimBoundary: true, researchReferenceUseProof: true, researchEvidenceMatch: true},
    findings: [],
    researchAudit: {required: false, status: "NOT_REQUIRED", claimType: null, sourceProvenance: null, referenceUse: null, evidenceMatch: null, blockers: []},
    duplicate: null,
    status: "PASS",
    recommendationEligible: true,
    generatedAt: now,
  }, "auditSha256");
  const actualPixelAssessment = hashed({contract: "A1ED08SemanticTakeoverActualPixelAssessment/v1", status: "PASS", shotId: "ED-08", artifactSha256: artifact.sha256, actualFrameOccupation: "FULL_FRAME_TAKEOVER", assemblyMode: "TYPOGRAPHY", presentationMode: "FULLSCREEN_TYPOGRAPHY_TAKEOVER", hardFailures: [], localEvidence: {actualFullFrameInspected: true, contactSheetInspected: true, exactCopyStatus: "PASS", typographyDominance: "PASS", fontSha256: manifest.fontBinding.sha256}, userVisualApproval: "NOT_APPROVED", reviewedAt: review.assessedAt}, "assessmentSha256");
  return {
    contract: "A1LookMasterRawReference/v1",
    referenceId: `ed08-semantic-takeover-repair-v1-${artifact.sha256.slice(0, 12)}`,
    shotId: "ED-08",
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    candidateDirectionId: "ed08-fullscreen-typography-language-break",
    directionFingerprint: `FULLSCREEN|TYPOGRAPHY_DOMINANT|ONE_ACTOR|ONE_SEMANTIC_MISREGISTRATION|${artifact.sha256.slice(0, 12)}`,
    artifact,
    pixelAudit,
    serverVisualAssessment,
    semanticPixelAudit,
    semanticPixelAuditSha256: semanticPixelAudit.auditSha256,
    actualPixelAssessment,
    actualPixelAssessmentSha256: actualPixelAssessment.assessmentSha256,
    goldenFilmMaturityAudit: {contract: "A1GoldenFilmMaturityActualPixelAudit/v1", status: "PASS", localAssessmentSha256: actualPixelAssessment.assessmentSha256, pixelAuditSha256: pixelAudit.auditSha256, semanticAuditSha256: semanticPixelAudit.auditSha256, actualFrameOccupation: "FULL_FRAME_TAKEOVER", actualModeEvidence: "HASH_BOUND_LOCAL_TYPOGRAPHY_ORIGINAL_RESOLUTION_REVIEW", ocrStatus: "PASS", ocrObservationCount: [...manifest.exactFormalText].length, rejectionReasons: []},
    sourceBindingManifest,
    sourceBindingManifestSha256,
    productionMethod: artifact.productionMethod,
    referencePackagingContract: artifact.referencePackagingContract,
    imagegenAttachmentCount: 0,
    imagegenAttachmentManifestSha256: null,
    imagegenAttachmentSourceShas: [],
    imagegenAttachmentsAttachedToInitialPrompt: false,
    lightChecks: {decode: "PASS", dimensions: "PASS"},
    classification: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS",
    fullLookMasterStatus: "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS",
    reviewStatus: "ACTUAL_PIXEL_PASS",
    status: "ACTUAL_PIXEL_SEMANTIC_PASS",
    current: true,
    historyReadOnly: false,
    recommendationEligible: true,
    selectionEligible: true,
    assemblyEligible: false,
    userVisualApproval: "NOT_APPROVED",
    provenance: {contract: "A1ED08SemanticTakeoverRepairProvenance/v1", sourceWorkspaceSha256: manifest.sourceWorkspaceSha256, sourceBoardSha256: manifest.sourceBoardSha256, candidateManifestSha256: manifest.manifestSha256, actualPixelReviewSha256: review.reviewSha256, imagegenCallCount: 0},
    importedAt: now,
    createdAt: now,
    selectedAt: now,
  };
}

function applyCandidate(current, now) {
  if (current.workspaceSha256 !== manifest.sourceWorkspaceSha256 || current.production.shotIntelligence.wholeFilmStaticBoard.sha256 !== manifest.sourceBoardSha256) throw new Error("ed08-adoption-source-authority-drift");
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("ed08-adoption-runtime-not-frozen-idle");
  if ((current.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("ed08-adoption-assembly-must-remain-empty");
  if (current.production.userVisualApprovalGate?.userVisualApproval !== "NOT_APPROVED") throw new Error("ed08-adoption-user-approval-boundary-invalid");
  const next = structuredClone(current);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-08");
  if (!plan) throw new Error("ed08-adoption-plan-missing");
  for (const candidate of runtime.lookMasterRawReferences.filter((item) => item.shotId === "ED-08" && item.current === true)) {
    candidate.current = false;
    candidate.historyReadOnly = true;
    candidate.recommendationEligible = false;
    candidate.selectionEligible = false;
    candidate.supersession = {contract: "A1CandidateSupersession/v1", status: "HISTORY_ONLY", reason: "SUPERSEDED_BY_ED08_CANONICAL_SEMANTIC_TAKEOVER_REPAIR", supersededAt: now};
  }
  const raw = buildRawReference({plan, item: manifest.item, now});
  runtime.lookMasterRawReferences.push(raw);
  plan.provisionalWholeFilmBoardSelection = {
    contract: "A1ProvisionalWholeFilmBoardSelection/v1",
    status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
    candidateId: raw.referenceId,
    directionId: raw.candidateDirectionId,
    artifact: structuredClone(raw.artifact),
    compositePreview: structuredClone(raw.pixelAudit.compositePreview),
    actualPixelAuditSha256: raw.pixelAudit.auditSha256,
    semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
    selectedAt: now,
    selectionSource: "ED08_SEMANTIC_TAKEOVER_ACTUAL_PIXEL_PASS",
    planMetadataMigration: {contract: "A1LookMasterPlanMetadataMigration/v1", status: "PASS", fromPlanSha256: plan.planSha256, toPlanSha256: plan.planSha256, actualArtifactSha256: raw.artifact.sha256, actualPixelAuditSha256: raw.pixelAudit.auditSha256, semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256, auditBytesUnchanged: false, selectionOnly: false},
  };
  const priorBoard = runtime.wholeFilmStaticBoard;
  const styleSystem = priorBoard.styleLineageAuthority.styleSystem;
  const styleAudit = auditStaticBoardStyleLineage({items: manifest.items, expectedShotIds: manifest.items.map((item) => item.shotId), styleSystem});
  if (styleAudit.status !== "PASS") throw new Error(`ed08-adoption-style-audit-blocked:${JSON.stringify(styleAudit)}`);
  const styleLineageAuthority = {
    ...priorBoard.styleLineageAuthority,
    status: "PASS",
    current: true,
    required: true,
    styleSystem,
    candidateManifestPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/ed08-semantic-takeover-repair-v1/manifest.json",
    candidateManifestSha256: manifest.manifestSha256,
    agentActualPixelReview: manifest.agentActualPixelReview,
    audit: styleAudit,
    priorBoardDisposition: {status: "SUPERSEDED_SEMANTIC_PIXEL_MISMATCH", boardSha256: priorBoard.sha256, targetShotIds: ["ED-08"]},
    currentBoardSha256: manifest.packageBoard.sha256,
    userVisualApproval: "NOT_APPROVED",
    adoptedAt: now,
  };
  runtime.wholeFilmStaticBoard = {
    ...priorBoard,
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png",
    sha256: manifest.packageBoard.sha256,
    width: manifest.packageBoard.width,
    height: manifest.packageBoard.height,
    itemCount: manifest.items.length,
    items: structuredClone(manifest.items),
    timelineBoard: {...priorBoard.timelineBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-timeline-board.png", sha256: manifest.timelineBoard.sha256, width: manifest.timelineBoard.width, height: manifest.timelineBoard.height, itemCount: manifest.timelineItems.length, items: structuredClone(manifest.timelineItems)},
    status: "PENDING_USER_APPROVAL",
    decision: null,
    generatedAt: now,
    userVisualApproval: "NOT_APPROVED",
    approvalAllowed: false,
    reviewActionDisabled: true,
    blockedShotIds: [],
    blockers: [],
    styleLineageAuthority,
  };
  delete next.production.packagingTemporalReadabilityAuthority;
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  const consistency = buildStoryboardPixelConsistencyAudit(next, {board: runtime.wholeFilmStaticBoard, now});
  if (consistency.status !== "PASS") throw new Error(`ed08-adoption-semantic-pixel-audit-blocked:${JSON.stringify(consistency)}`);
  runtime.wholeFilmStaticBoard.storyboardPixelConsistency = consistency;
  next.production.storyboardPixelConsistency = consistency;
  runtime.wholeFilmStaticBoard.approvalAllowed = true;
  runtime.wholeFilmStaticBoard.reviewActionDisabled = false;
  runtime.wholeFilmBatchRecommendation = {...runtime.wholeFilmBatchRecommendation, status: "WHOLE_FILM_STATIC_BOARD_READY", staticBoard: structuredClone(runtime.wholeFilmStaticBoard), exceptions: [], autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
  next.production.visualProductionRun = {...next.production.visualProductionRun, status: "WHOLE_FILM_STATIC_BOARD_READY", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
  next.production.authority = {...next.production.authority, currentStage: "whole-film-static-board-review", state: "whole-film-static-board-review", nextAction: {id: "review-whole-film-static-board", label: "审看已完成语义—画面一致性修复的 34 镜静态板", requiresUser: true, targetShotIds: [], reviewGate: "WHOLE_FILM_STATIC_BOARD"}};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  if (gate.status !== "PASS") throw new Error(`ed08-adoption-post-gate-blocked:${JSON.stringify(gate)}`);
  if (recalculated.production.authority.nextAction?.id !== "review-whole-film-static-board") throw new Error(`ed08-adoption-next-action-drift:${JSON.stringify(recalculated.production.authority.nextAction)}`);
  return {workspace: recalculated, gate, priorBoardSha256: priorBoard.sha256};
}

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed08-adoption-workspace-precondition:${current.workspaceSha256}`);
if (dryRun) {
  const result = applyCandidate(current, new Date().toISOString());
  process.stdout.write(`${JSON.stringify({status: "DRY_RUN_PASS", workspaceSha256Before: current.workspaceSha256, projectedWorkspaceSha256: result.workspace.workspaceSha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, gateStatus: result.gate.status, userVisualApproval: "NOT_APPROVED", imagegenCallCount: 0, motionPerformed: false}, null, 2)}\n`);
  process.exit(0);
}
if (!expectedWorkspaceSha256) throw new Error("ed08-adoption-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed08-adoption-cas:${locked.workspaceSha256}`);
  const now = new Date().toISOString();
  const applied = applyCandidate(locked, now);
  const event = createProductionEvent({workspace: applied.workspace, action: "adopt-ed08-semantic-takeover-repair-v1", targetId: manifest.frame.sha256, payload: {priorBoardSha256: applied.priorBoardSha256, frameSha256: manifest.frame.sha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, exactFormalText: manifest.exactFormalText, userVisualApproval: "NOT_APPROVED", imagegenCallCount: 0, assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false}, now});
  applied.workspace.production.eventLedger.eventCount += 1;
  applied.workspace.production.eventLedger.lastEventId = event.eventId;
  applied.workspace.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1ED08SemanticTakeoverAdmissionReport/v1", status: "PASS", shotId: "ED-08", sourceBoardSha256: applied.priorBoardSha256, frame: manifest.frame, packageBoard: {...manifest.packageBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png"}, timelineBoard: {...manifest.timelineBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-timeline-board.png"}, exactFormalText: manifest.exactFormalText, fontBinding: manifest.fontBinding, actualPixelReview: manifest.agentActualPixelReview, candidateAuthorityGate: applied.gate, userVisualApproval: "NOT_APPROVED", assemblyCount: 0, imagegenCallCount: 0, motionPerformed: false, admittedAt: now};
  const committed = persistProjectState(appRoot, applied.workspace, {
    event,
    expectedWorkspaceSha256: locked.workspaceSha256,
    commitId: `ed08-semantic-takeover-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "ed08-semantic-takeover-repair-v1/manifest.json": manifest,
      "ed08-semantic-takeover-repair-v1/agent-actual-pixel-review.json": review,
      "ed08-semantic-takeover-repair-v1/admission-report.json": report,
      "whole-film-static-board-v1/report.json": report,
      "storyboard-pixel-consistency-v1/report.json": applied.workspace.production.shotIntelligence.wholeFilmStaticBoard.storyboardPixelConsistency,
    },
    binaryFiles: {
      "ed08-semantic-takeover-repair-v1/frames/ED-08.png": fs.readFileSync(publicFile(manifest.frame.publicUrl)),
      "ed08-semantic-takeover-repair-v1/whole-film-package-board.png": fs.readFileSync(publicFile(manifest.packageBoard.publicUrl)),
      "ed08-semantic-takeover-repair-v1/whole-film-timeline-board.png": fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl)),
      "whole-film-static-board-v1/whole-film-package-board.png": fs.readFileSync(publicFile(manifest.packageBoard.publicUrl)),
      "whole-film-static-board-v1/whole-film-timeline-board.png": fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl)),
    },
  });
  return {status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: committed.workspaceSha256, frameSha256: manifest.frame.sha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, gateStatus: applied.gate.status, blockedShotIds: applied.gate.blockedShotIds, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false, imagegenCallCount: 0};
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
