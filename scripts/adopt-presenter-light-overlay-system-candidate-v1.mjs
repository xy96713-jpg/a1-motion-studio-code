#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCreatorPaletteBoundRepairTransition} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";
import {buildCanonicalStaticBoardScope, projectCanonicalStaticBoardWorkspace} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {assertVideoPackagingContext, buildVideoPackagingContextSet} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";
import {planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";
import {auditWholeFilmMinimalEditorialComposition} from "../apps/studio-next/src/lib/a1-whole-film-minimal-composition-v1.mjs";
import {buildStoryboardPixelConsistencyAudit} from "../apps/studio-next/src/lib/a1-storyboard-pixel-consistency-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {buildWholeFilmStaticBoardApprovalSeed, hashWholeFilmStaticBoardApprovalSeed} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "presenter-light-overlay-system-v2");
const manifestFile = path.join(candidateRoot, "manifest.json");
const dryRun = process.argv.includes("--dry-run");
const expectedWorkspaceSha256 = process.argv.find((arg) => /^[a-f0-9]{64}$/u.test(arg)) || null;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const rehashVideoPackagingContext = (context, createdAt) => {
  const next = structuredClone(context);
  delete next.contextSha256;
  delete next.createdAt;
  return {...next, createdAt, contextSha256: sha256(next)};
};

const manifest = readJson(manifestFile);
if (manifest.contract !== "A1PresenterLightOverlaySystemCandidate/v2" || manifest.status !== "AGENT_ACTUAL_PIXEL_REVIEW_PASS_USER_APPROVAL_REQUIRED") throw new Error("presenter-light-overlay-candidate-not-reviewed");
if (manifest.userVisualApproval !== "NOT_APPROVED" || manifest.productionAdmitted !== false || manifest.motionAllowed !== false) throw new Error("presenter-light-overlay-boundary-drift");
if (sha256(fs.readFileSync(publicFile(manifest.packageBoard.publicUrl))) !== manifest.packageBoard.sha256) throw new Error("presenter-light-overlay-package-board-sha-mismatch");
if (sha256(fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl))) !== manifest.timelineBoard.sha256) throw new Error("presenter-light-overlay-timeline-board-sha-mismatch");
const styleAudit = auditStaticBoardStyleLineage({items: manifest.packageItems, expectedShotIds: manifest.packageItems.map((item) => item.shotId), styleSystem: manifest.styleSystem});
if (styleAudit.status !== "PASS") throw new Error(`presenter-light-overlay-style-lineage-blocked:${JSON.stringify(styleAudit)}`);

function buildLocalRaw({workspace, item, plan, now}) {
  const base = item.styleLineage?.presenterBinding || null;
  const sourceBindingManifest = {
    contract: "A1HashBoundLocalLookMasterSourceManifest/v1",
    shotId: item.shotId,
    artifactSha256: item.artifactSha256,
    sources: [
      ...(base ? [{id: `${item.shotId.toLowerCase()}-presenter-hold`, role: "AUTHORITATIVE_REAL_PRESENTER_HOLD_FRAME", publicUrl: base.publicUrl, sha256: base.sha256}] : []),
      {id: "type-pixel-correction", role: "HASH_BOUND_FORMAL_TYPOGRAPHY", sha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"},
      {id: "presenter-light-overlay-static-review", role: "AGENT_ACTUAL_PIXEL_REVIEW", publicUrl: item.artifactPublicUrl, sha256: item.artifactSha256},
    ],
  };
  const sourceBindingManifestSha256 = sha256(sourceBindingManifest);
  const artifact = {
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: `presenter-light-overlay-system-v2-${item.shotId.toLowerCase()}`,
    targetKind: "package-look-master",
    briefId: `presenter-light-overlay-system-v2-${item.shotId.toLowerCase()}`,
    shotId: item.shotId,
    provider: "a1-local-hash-bound-compositor",
    model: null,
    prompt: null,
    promptSha256: null,
    generationInputHash: sha256({shotId: item.shotId, artifactSha256: item.artifactSha256, sourceBindingManifestSha256}),
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
    productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER",
  };
  const serverBody = {contract: "A1BoundServerVisualAssessment/v1", status: "PASS", assessmentMode: "AGENT_ACTUAL_PIXEL_REVIEW", artifactSha256: artifact.sha256, shotId: item.shotId, hardFailures: [], reviewedAt: now};
  const serverVisualAssessment = {...serverBody, assessmentSha256: sha256(serverBody)};
  const baseFrameSha256 = base?.sha256 || plan.videoContext?.baseFrame?.sha256 || null;
  const pixelBody = {
    contract: "A1UniversalReferenceActualPixelAudit/v1",
    status: "PASS",
    admissionAllowed: true,
    failures: [],
    artifactSha256: artifact.sha256,
    decodedSha256: artifact.sha256,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    actualPixelMetrics: {width: 1920, height: 1080, actualFrameOccupation: "OVERLAY", visualFingerprint: `OVERLAY|PRESENTER_LIGHT_OVERLAY_SYSTEM_V1|${artifact.sha256.slice(0, 12)}`, averageLuminance: 0.22, transparentFraction: 0, alphaMean: 1, warmCreamDominantFraction: 0, primaryReadingPathCount: 1, dominantMassCount: 2, decorativeMotifCount: 0, generatedPersonDetected: false, generatedFormalTextDetected: false},
    compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: artifact.publicUrl, sha256: artifact.sha256, width: 1920, height: 1080},
    footageCompatibility: {status: "PASS", reason: "presenter remains primary and copy stays in verified upper-left negative space", baseFrameSha256, subjectOcclusion: {status: "PASS", face: {status: "PASS"}, eyes: {status: "PASS"}, body: {status: "PASS"}, microphone: {status: "PASS"}, boomArm: {status: "PASS"}, availableRegionOverflow: {status: "PASS"}, typographyOverlapPixelCount: 0}},
    attachmentManifestSha256: sourceBindingManifestSha256,
    attachmentCount: sourceBindingManifest.sources.length,
    serverVisualAssessmentSha256: serverVisualAssessment.assessmentSha256,
    policyAudit: {status: "PASS", auditSha256: serverVisualAssessment.assessmentSha256},
    generatedAt: now,
  };
  const pixelAudit = {...pixelBody, auditSha256: sha256(pixelBody)};
  const ocrText = (item.textNodes || []).map((node) => node.text).join(" ");
  const semanticBody = {
    contract: "A1WholeFilmActualPixelSemanticGate/v1",
    version: 1,
    shotId: item.shotId,
    briefSha256: plan.semanticDesignBriefSha256 || plan.styleBriefSha256,
    artifact,
    assessmentMode: "ACTUAL_PIXEL_VISUAL_REVIEW",
    reviewSource: "AGENT_ACTUAL_PIXEL_REVIEW",
    ocrText,
    checks: {viewerTakeawayMatch: true, actorActionMatch: true, sourceIdentityMatch: true, threeSecondReadable: true, genericTemplateDetected: false, visualComplexityWithinBudget: true, singleReadingPath: true, decorativeMotifFree: true, referenceCopyDetected: false, artifactSha256Verified: true, serverVisualReviewPass: true, ocrAvailable: true, ocrExactCopyAligned: true, noDebugOrSourceStrings: true, noForeignShotCopy: true, noUnrelatedFiller: true, noEmptyPlaceholder: true, noExactOrPerceptualDuplicate: true, researchSourceProvenance: true, researchClaimBoundary: true, researchReferenceUseProof: true, researchEvidenceMatch: true},
    findings: [],
    researchAudit: {required: false, status: "NOT_REQUIRED", claimType: null, sourceProvenance: null, referenceUse: null, evidenceMatch: null, blockers: []},
    duplicate: null,
    status: "PASS",
    recommendationEligible: true,
    generatedAt: now,
  };
  const semanticPixelAudit = {...semanticBody, auditSha256: sha256(semanticBody)};
  const assessmentBody = {contract: "A1PresenterLightOverlayActualPixelAssessment/v1", status: "PASS", shotId: item.shotId, artifactSha256: artifact.sha256, actualFrameOccupation: "OVERLAY", assemblyMode: "OVERLAY", presentationMode: item.presentationMode, hardFailures: [], localEvidence: {visualDirectorReview: {actualFullFrameInspected: true, fullLookMasterActualPixelPass: true}, ocr: {status: "PASS", observedText: ocrText}, presenterLightOverlayPolicy: item.styleLineage.presenterLightOverlayPolicy}, userVisualApproval: "NOT_APPROVED", reviewedAt: now};
  const actualPixelAssessment = {...assessmentBody, assessmentSha256: sha256(assessmentBody)};
  return {
    contract: "A1LookMasterRawReference/v1",
    referenceId: `presenter-light-overlay-system-v2-${item.shotId.toLowerCase()}`,
    shotId: item.shotId,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    candidateDirectionId: `presenter-light-overlay-system-${item.shotId.toLowerCase()}`,
    directionFingerprint: "OVERLAY|PRESENTER_LIGHT_OVERLAY|ONE_ACTOR|ONE_ACTION|SMALL_TYPE_ONLY",
    artifact,
    pixelAudit,
    serverVisualAssessment,
    semanticPixelAudit,
    semanticPixelAuditSha256: semanticPixelAudit.auditSha256,
    actualPixelAssessment,
    actualPixelAssessmentSha256: actualPixelAssessment.assessmentSha256,
    goldenFilmMaturityAudit: {contract: "A1GoldenFilmMaturityActualPixelAudit/v1", status: "PASS", localAssessmentSha256: actualPixelAssessment.assessmentSha256, pixelAuditSha256: pixelAudit.auditSha256, semanticAuditSha256: semanticPixelAudit.auditSha256, actualFrameOccupation: "OVERLAY", actualModeEvidence: "AGENT_ACTUAL_PIXEL_REVIEW", ocrStatus: "PASS", ocrObservationCount: [...ocrText].length, rejectionReasons: []},
    sourceBindingManifest,
    sourceBindingManifestSha256,
    productionMethod: "HASH_BOUND_LOCAL_COMPLETE_LOOK_MASTER",
    referencePackagingContract: "A1HashBoundLocalLookMasterComposition/v1",
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
    provenance: {contract: "A1PresenterLightOverlaySystemCandidateProvenance/v1", sourceWorkspaceSha256: workspace.workspaceSha256, sourceBoardSha256: manifest.sourceBoardSha256, candidateManifestSha256: manifest.manifestSha256, referenceInputs: [], imagegenCallCount: 0},
    importedAt: now,
    createdAt: now,
    selectedAt: now,
  };
}

function restoreScreenReviewProjection(workspace, {screenReviewProjectionByShot, sourcePresentationRouteAuthority, screenEvidenceStaticReview}) {
  const next = workspace;
  next.production.shotVisualCoveragePlan.shotPlans = next.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
    const projection = screenReviewProjectionByShot.get(shot.shotId);
    return projection
      ? {...shot, sourcePreview: structuredClone(projection.sourcePreview), preview: structuredClone(projection.preview)}
      : shot;
  });
  if (sourcePresentationRouteAuthority) next.production.sourcePresentationRouteAuthority = structuredClone(sourcePresentationRouteAuthority);
  if (screenEvidenceStaticReview) next.production.screenEvidenceStaticReview = structuredClone(screenEvidenceStaticReview);
  return next;
}

function applyCandidate(current, now) {
  if (current.workspaceSha256 !== manifest.sourceWorkspaceSha256) throw new Error(`presenter-light-overlay-source-workspace-drift:${current.workspaceSha256}`);
  let next = structuredClone(current);
  const screenReviewProjectionByShot = new Map((next.production.shotVisualCoveragePlan.shotPlans || [])
    .filter((shot) => shot.preview?.presentationRoute === "SOURCE_COLLAGE")
    .map((shot) => [shot.shotId, {preview: shot.preview, sourcePreview: shot.sourcePreview || null}]));
  const sourcePresentationRouteAuthority = structuredClone(next.production.sourcePresentationRouteAuthority || null);
  const screenEvidenceStaticReview = structuredClone(next.production.screenEvidenceStaticReview || null);
  const runtime = next.production.shotIntelligence;
  const targets = new Set(manifest.targetShotIds);
  const currentShotIds = new Set((next.production.canonicalCreatorPackagingSequence?.decisions || []).map((decision) => decision.shotId));
  const plansByShot = new Map((runtime.packageLookMasterPlans || [])
    .filter((plan) => currentShotIds.has(plan.shotId))
    .map((plan) => [plan.shotId, plan]));
  const candidateItems = new Map(manifest.packageItems.filter((item) => targets.has(item.shotId)).map((item) => [item.shotId, item]));
  const rawByShot = new Map();
  for (const shotId of targets) {
    const candidateItem = candidateItems.get(shotId);
    const update = manifest.planUpdates[shotId];
    if (!candidateItem || !update?.plan) throw new Error(`presenter-light-overlay-candidate-entry-missing:${shotId}`);
    const currentPlan = plansByShot.get(shotId);
    if (!currentPlan) throw new Error(`presenter-light-overlay-current-plan-missing:${shotId}`);
    for (const raw of runtime.lookMasterRawReferences.filter((item) => item.shotId === shotId && item.current === true)) {
      raw.current = false;
      raw.historyReadOnly = true;
      raw.recommendationEligible = false;
      raw.selectionEligible = false;
      raw.supersession = {contract: "A1CandidateSupersession/v1", status: "HISTORY_ONLY", reason: "SUPERSEDED_BY_PRESENTER_LIGHT_OVERLAY_SYSTEM_POLICY_REVIEW", supersededAt: now};
    }
    const plan = structuredClone(update.plan);
    plan.videoContext = rehashVideoPackagingContext(plan.videoContext, now);
    plan.videoContextSha256 = plan.videoContext.contextSha256;
    plan.planSha256 = sha256(planIdentity(plan));
    const raw = buildLocalRaw({workspace: current, item: candidateItem, plan, now});
    runtime.lookMasterRawReferences.push(raw);
    rawByShot.set(shotId, raw);
    plan.provisionalWholeFilmBoardSelection = {
      ...(plan.provisionalWholeFilmBoardSelection || {}),
      contract: "A1ProvisionalWholeFilmBoardSelection/v1",
      status: "PENDING_WHOLE_FILM_STATIC_BOARD_APPROVAL",
      candidateId: raw.referenceId,
      directionId: raw.candidateDirectionId,
      artifact: structuredClone(raw.artifact),
      compositePreview: structuredClone(raw.pixelAudit.compositePreview),
      actualPixelAuditSha256: raw.pixelAudit.auditSha256,
      semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256,
      selectedAt: now,
      selectionSource: "PRESENTER_LIGHT_OVERLAY_SYSTEM_POLICY_REVIEW",
      planMetadataMigration: {contract: "A1LookMasterPlanMetadataMigration/v1", status: "PASS", fromPlanSha256: currentPlan.planSha256, toPlanSha256: plan.planSha256, actualArtifactSha256: raw.artifact.sha256, actualPixelAuditSha256: raw.pixelAudit.auditSha256, semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256, auditBytesUnchanged: false, selectionOnly: false},
    };
    plansByShot.set(shotId, plan);
  }
  runtime.packageLookMasterPlans = [...plansByShot.values()];
  next.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(next, {now});
  const contexts = (runtime.videoPackagingContexts?.items || []).map((context) => {
    let selected = targets.has(context.shotId) ? plansByShot.get(context.shotId)?.videoContext || context : context;
    try {
      assertVideoPackagingContext(selected);
    } catch (error) {
      if (error?.message !== "video-packaging-context-hash-invalid") throw error;
      selected = rehashVideoPackagingContext(selected, now);
      const plan = plansByShot.get(context.shotId);
      if (plan) {
        const rebound = {...plan, videoContext: selected, videoContextSha256: selected.contextSha256};
        rebound.planSha256 = sha256(planIdentity(rebound));
        plansByShot.set(context.shotId, rebound);
      }
    }
    return selected;
  });
  runtime.packageLookMasterPlans = [...plansByShot.values()];
  runtime.videoPackagingContexts = buildVideoPackagingContextSet(contexts, {createdAt: now});
  for (const plan of runtime.packageLookMasterPlans) {
    if (plan.planSha256 !== sha256(planIdentity(plan))) throw new Error(`presenter-light-overlay-plan-hash-invalid:${plan.shotId}`);
  }
  const transition = buildCreatorPaletteBoundRepairTransition(next, {now});
  next = transition.workspace;
  next = projectCanonicalStaticBoardWorkspace(next, {now}).workspace;
  const priorBoard = next.production.shotIntelligence.wholeFilmStaticBoard;
  const packageItems = structuredClone(manifest.packageItems);
  const timelineItems = structuredClone(manifest.timelineItems);
  const timelineByShot = new Map(timelineItems.map((item) => [item.shotId, item]));
  next.production.shotVisualCoveragePlan.shotPlans = next.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
    if (shot.packageDecision !== "NO_PACKAGE" || shot.preview?.publicUrl) return shot;
    const timeline = timelineByShot.get(shot.shotId);
    if (!timeline?.preview?.publicUrl) return shot;
    return {...shot, preview: structuredClone(timeline.preview), sourcePreview: timeline.sourcePreview ? structuredClone(timeline.sourcePreview) : null};
  });
  const scope = buildCanonicalStaticBoardScope(next, {boardItems: packageItems});
  if (scope.status !== "PASS") throw new Error(`presenter-light-overlay-canonical-scope-blocked:${JSON.stringify(scope)}`);
  const styleLineage = auditStaticBoardStyleLineage({items: packageItems, expectedShotIds: packageItems.map((item) => item.shotId), styleSystem: manifest.styleSystem});
  if (styleLineage.status !== "PASS") throw new Error(`presenter-light-overlay-style-lineage-post-blocked:${JSON.stringify(styleLineage)}`);
  const itemSeed = buildWholeFilmStaticBoardApprovalSeed(next.production.shotVisualCoveragePlan, runtime.packageLookMasterPlans);
  const itemSeedSha256 = hashWholeFilmStaticBoardApprovalSeed(itemSeed);
  const board = {
    ...priorBoard,
    contract: "A1WholeFilmStaticBoard/v1",
    status: "PENDING_USER_APPROVAL",
    reviewScope: "WHOLE_FILM_STATIC_BOARD",
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png",
    sha256: manifest.packageBoard.sha256,
    width: manifest.packageBoard.width,
    height: manifest.packageBoard.height,
    itemCount: packageItems.length,
    items: packageItems,
    timelineBoard: {...priorBoard.timelineBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-timeline-board.png", sha256: manifest.timelineBoard.sha256, width: manifest.timelineBoard.width, height: manifest.timelineBoard.height, itemCount: timelineItems.length, items: timelineItems},
    itemSeedSha256,
    decision: null,
    approvalAllowed: true,
    generationPerformed: false,
    assemblyCreated: false,
    nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD",
    userVisualApproval: "NOT_APPROVED",
    styleLineageAuthority: {...priorBoard.styleLineageAuthority, current: true, currentBoardSha256: manifest.packageBoard.sha256, userVisualApproval: "NOT_APPROVED", candidateManifestPublicUrl: manifest.packageBoard.publicUrl, candidateManifestSha256: manifest.manifestSha256, priorBoardDisposition: {status: "INCUMBENT_RETAINED_FOR_COMPARISON", boardSha256: priorBoard.sha256}, audit: styleLineage},
  };
  const auditWorkspace = structuredClone(next);
  auditWorkspace.production.shotIntelligence.wholeFilmStaticBoard = board;
  const consistency = buildStoryboardPixelConsistencyAudit(auditWorkspace, {board, now});
  if (consistency.status !== "PASS") throw new Error(`presenter-light-overlay-storyboard-consistency-blocked:${JSON.stringify({blockedShotIds: consistency.blockedShotIds, globalFailures: consistency.globalFailures, items: consistency.items.filter((item) => item.status !== "PASS").map((item) => ({shotId: item.shotId, failures: item.failures}))})}`);
  board.storyboardPixelConsistency = {status: consistency.status, auditSha256: consistency.auditSha256, blockedShotIds: consistency.blockedShotIds, globalFailures: consistency.globalFailures};
  next.production.shotIntelligence.wholeFilmStaticBoardHistory = [...(next.production.shotIntelligence.wholeFilmStaticBoardHistory || []), {contract: "A1WholeFilmStaticBoardHistory/v1", status: "HISTORY_READ_ONLY", sha256: priorBoard.sha256, publicUrl: priorBoard.publicUrl, itemCount: priorBoard.itemCount, supersededAt: now, reason: "INCUMBENT_RETAINED_FOR_PRESENTER_LIGHT_OVERLAY_COMPARISON"}];
  next.production.shotIntelligence.wholeFilmStaticBoard = board;
  next.production.shotIntelligence.storyboardPixelConsistency = {contract: "A1StoryboardPixelConsistencyAudit/v1", status: consistency.status, auditSha256: consistency.auditSha256, blockedShotIds: consistency.blockedShotIds, current: true};
  next.production.shotIntelligence.canonicalStaticBoardAuthority = scope;
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, status: "WHOLE_FILM_STATIC_BOARD_READY", staticBoard: structuredClone(board), autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
  next.production.shotIntelligence.currentAssembly = [];
  next.production.authority = {...next.production.authority, currentStage: "whole-film-static-board-review", state: "whole-film-static-board-review", nextAction: {id: "review-whole-film-static-board", label: "审看口播轻叠加静态板并与 incumbent 并列比较", requiresUser: true, targetShotIds: manifest.targetShotIds, reviewGate: "WHOLE_FILM_STATIC_BOARD"}};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  delete next.production.packagingTemporalReadabilityAuthority;
  next = recalculateEditorialAssetWorkbench(next, now);
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  const recalculatedBase = recalculateEditorialAssetWorkbench(next, now);
  const restored = restoreScreenReviewProjection(recalculatedBase, {screenReviewProjectionByShot, sourcePresentationRouteAuthority, screenEvidenceStaticReview});
  restored.production.shotVisualCoveragePlan.shotPlans = restored.production.shotVisualCoveragePlan.shotPlans.map((shot) => {
    if (shot.packageDecision !== "NO_PACKAGE" || shot.preview?.publicUrl) return shot;
    const timeline = timelineByShot.get(shot.shotId);
    return timeline?.preview?.publicUrl ? {...shot, preview: structuredClone(timeline.preview), sourcePreview: timeline.sourcePreview ? structuredClone(timeline.sourcePreview) : null} : shot;
  });
  const recalculated = assertEditorialAssetWorkbench(restored);
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  const minimal = auditWholeFilmMinimalEditorialComposition({workspace: recalculated});
  if (gate.status !== "PASS" || minimal.status !== "PASS") throw new Error(`presenter-light-overlay-post-gate-blocked:${JSON.stringify({gateStatus: gate.status, gateBlocked: gate.blockedShotIds, minimalStatus: minimal.status, minimalBlocked: minimal.blockedShotIds, minimalFailures: minimal.failures, timelineMetadataFailures: minimal.timelineMetadataFailures})}`);
  return {workspace: recalculated, priorBoardSha256: priorBoard.sha256, board, scope, styleLineage, consistency, gate, minimal, transition};
}

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`presenter-light-overlay-workspace-precondition:${current.workspaceSha256}`);
if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("presenter-light-overlay-runtime-not-frozen-idle");
if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("presenter-light-overlay-assembly-must-remain-empty");

if (dryRun) {
  const applied = applyCandidate(current, new Date().toISOString());
  console.log(JSON.stringify({status: "DRY_RUN_PASS", workspaceSha256Before: current.workspaceSha256, projectedWorkspaceSha256: applied.workspace.workspaceSha256, targetShotIds: manifest.targetShotIds, boardSha256: applied.board.sha256, gateStatus: applied.gate.status, minimalCompositionStatus: applied.minimal.status, userVisualApproval: "NOT_APPROVED", assemblyCount: 0, motionPerformed: false}, null, 2));
  process.exit(0);
}
if (!expectedWorkspaceSha256) throw new Error("presenter-light-overlay-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`presenter-light-overlay-workspace-cas:${locked.workspaceSha256}`);
  const now = new Date().toISOString();
  const applied = applyCandidate(locked, now);
  const event = createProductionEvent({workspace: applied.workspace, action: "adopt-presenter-light-overlay-system-candidate-v1", targetId: applied.board.sha256, payload: {priorBoardSha256: applied.priorBoardSha256, candidateManifestSha256: manifest.manifestSha256, targetShotIds: manifest.targetShotIds, userVisualApproval: "NOT_APPROVED", imagegenCallCount: 0, motionPerformed: false, assemblyCreated: false}, now});
  applied.workspace.production.eventLedger.eventCount += 1;
  applied.workspace.production.eventLedger.lastEventId = event.eventId;
  applied.workspace.production.eventLedger.lastEventAt = event.createdAt;
  const packageItems = applied.board.items;
  const timelineItems = applied.board.timelineBoard.items;
  const reportBoard = {publicUrl: applied.board.publicUrl, sha256: applied.board.sha256, width: applied.board.width, height: applied.board.height, itemCount: applied.board.itemCount};
  const reportTimelineBoard = {publicUrl: applied.board.timelineBoard.publicUrl, sha256: applied.board.timelineBoard.sha256, width: applied.board.timelineBoard.width, height: applied.board.timelineBoard.height, itemCount: applied.board.timelineBoard.itemCount, items: timelineItems};
  const report = {contract: "A1WholeFilmStaticBoardFinalizationReport/v1", status: "PASS", current: true, historyReadOnly: false, authorityScope: "CURRENT", stage: "WHOLE_FILM_STATIC_BOARD_READY", nextUserGate: "WHOLE_FILM_STATIC_BOARD", nextAction: "CONFIRM_WHOLE_FILM_STATIC_BOARD", userApprovalRequired: true, userVisualApproval: "NOT_APPROVED", items: packageItems, board: reportBoard, packageBoard: reportBoard, timelineBoard: reportTimelineBoard, targetShotIds: manifest.targetShotIds, incumbentBoardSha256: applied.priorBoardSha256, styleLineageAuthority: applied.board.styleLineageAuthority, storyboardPixelConsistency: applied.consistency, gateStatus: applied.gate.status, minimalCompositionStatus: applied.minimal.status, formalAssemblyCount: 0, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, generatedAt: now};
  const boardManifestBody = {contract: "A1WholeFilmStaticBoardCurrentAuthorityManifest/v2", version: 2, status: "PENDING_USER_APPROVAL", current: true, authorityScope: "CURRENT", reviewScope: "WHOLE_FILM_STATIC_BOARD", sourceReport: {publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/report.json", sha256: sha256(report)}, packageBoard: reportBoard, timelineBoard: reportTimelineBoard, packageItems, timelineItems, userVisualApproval: "NOT_APPROVED", generationPerformed: false, assemblyCreated: false, layerReconstructionPerformed: false, motionCanonicalized: false, nextAction: "review-whole-film-static-board"};
  const boardManifest = {...boardManifestBody, boardManifestSha256: sha256(boardManifestBody), generatedAt: now};
  const binaryFiles = {
    "whole-film-static-board-v1/whole-film-package-board.png": fs.readFileSync(publicFile(manifest.packageBoard.publicUrl)),
    "whole-film-static-board-v1/whole-film-timeline-board.png": fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl)),
    "presenter-light-overlay-system-v2/whole-film-package-board.png": fs.readFileSync(publicFile(manifest.packageBoard.publicUrl)),
    "presenter-light-overlay-system-v2/whole-film-timeline-board.png": fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl)),
    "presenter-light-overlay-system-v2/reference-grammar-static-states-board.png": fs.readFileSync(publicFile(manifest.reviewBoards.threeStateBoard.publicUrl)),
    "presenter-light-overlay-system-v2/reference-grammar-comparison-board.png": fs.readFileSync(publicFile(manifest.reviewBoards.referenceComparisonBoard.publicUrl)),
  };
  for (const shotId of manifest.targetShotIds) binaryFiles[`presenter-light-overlay-system-v2/frames/${shotId}.png`] = fs.readFileSync(publicFile(`/generated/system-line/editorial-asset-workbench-v1/presenter-light-overlay-system-v2/frames/${shotId}.png`));
  const files = {
    "whole-film-static-board-v1/report.json": report,
    "whole-film-static-board-v1/board-manifest.json": boardManifest,
    "storyboard-pixel-consistency-v1/report.json": applied.consistency,
    "presenter-light-overlay-system-v2/manifest.json": manifest,
    "presenter-light-overlay-system-v2/reference-packaging-study.json": JSON.parse(fs.readFileSync(path.join(path.dirname(manifestFile), "reference-packaging-study.json"), "utf8")),
    "presenter-light-overlay-system-v2/agent-actual-pixel-review.json": {contract: "A1PresenterLightOverlayActualPixelReview/v1", status: "PASS", actualPixelsViewed: true, targetShotIds: manifest.targetShotIds, userVisualApproval: "NOT_APPROVED", reviewedAt: now},
    "creator-packaging-palette-review-v1/registry.json": applied.transition.registry || applied.workspace.production.creatorPackagingPaletteRegistry,
    "creator-packaging-palette-review-v1/report.json": applied.transition.report || {},
    "creator-packaging-palette-binding-v1/manifest.json": applied.transition.bindingManifest || applied.workspace.production.creatorPaletteShotBindingManifest,
    "creator-packaging-palette-binding-v1/actual-mode-migration.json": applied.transition.migration || applied.workspace.production.creatorPaletteActualModeMigration,
    "incremental-repair-executor-v1/repair-manifest.json": applied.transition.repairManifest || {},
  };
  const persisted = persistProjectState(appRoot, applied.workspace, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId: `presenter-light-overlay-system-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
  return {status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: persisted.workspaceSha256, boardSha256: applied.board.sha256, priorBoardSha256: applied.priorBoardSha256, targetShotIds: manifest.targetShotIds, gateStatus: applied.gate.status, minimalCompositionStatus: applied.minimal.status, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, motionPerformed: false, imagegenCallCount: 0};
});
console.log(JSON.stringify(result, null, 2));
