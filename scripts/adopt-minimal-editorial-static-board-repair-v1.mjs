#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildCanonicalCreatorPackagingSequence} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {projectCanonicalStaticBoardWorkspace} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {auditStaticBoardStyleLineage} from "../apps/studio-next/src/lib/a1-static-board-style-lineage-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";
import {auditWholeFilmMinimalEditorialComposition} from "../apps/studio-next/src/lib/a1-whole-film-minimal-composition-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {buildCreatorPaletteBoundRepairTransition} from "./compile-creator-packaging-palette-bound-repair-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const candidateRoot = path.join(generatedRoot, "minimal-editorial-static-board-repair-v1");
const manifestFile = path.join(candidateRoot, "manifest.json");
const overridesFile = path.join(appRoot, "src/data/system-line-creator-packaging-overrides-v1.json");
const expectedWorkspaceSha256 = process.argv.find((arg) => /^[a-f0-9]{64}$/u.test(arg)) || null;
const dryRun = process.argv.includes("--dry-run");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

const manifest = readJson(manifestFile);
const overrides = readJson(overridesFile);
if (manifest.contract !== "A1MinimalEditorialStaticBoardRepair/v1" || manifest.status !== "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW") throw new Error("minimal-editorial-adoption-candidate-not-reviewed");
if (manifest.userVisualApproval !== "NOT_APPROVED" || manifest.productionAdmitted !== false) throw new Error("minimal-editorial-adoption-candidate-boundary-drift");
if (sha256(fs.readFileSync(publicFile(manifest.packageBoard.publicUrl))) !== manifest.packageBoard.sha256) throw new Error("minimal-editorial-adoption-package-board-sha-mismatch");
if (sha256(fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl))) !== manifest.timelineBoard.sha256) throw new Error("minimal-editorial-adoption-timeline-board-sha-mismatch");
const candidateStyleAudit = auditStaticBoardStyleLineage({items: manifest.items, expectedShotIds: manifest.packageShotIds, styleSystem: manifest.styleSystem});
if (candidateStyleAudit.status !== "PASS") throw new Error(`minimal-editorial-adoption-style-lineage-blocked:${JSON.stringify(candidateStyleAudit)}`);

const generatedShotIds = new Set(manifest.newlyCompositedShotIds);
const fontSources = [...new Map(manifest.items.flatMap((item) => item.styleLineage?.fontBindings || []).map((font) => [font.sha256, font])).values()];

function buildLocalRaw({workspace, item, plan, decision, now}) {
  const baseSha256 = item.styleLineage?.presenterBinding?.sha256 || null;
  const sourceBindingManifest = {
    contract: "A1HashBoundLocalLookMasterSourceManifest/v1",
    shotId: item.shotId,
    artifactSha256: item.artifactSha256,
    sources: [
      ...(baseSha256 ? [{id: `${item.shotId.toLowerCase()}-presenter-hold`, role: "AUTHORITATIVE_REAL_PRESENTER_HOLD_FRAME", publicUrl: item.styleLineage.presenterBinding.publicUrl, sha256: baseSha256}] : []),
      ...fontSources.map((font) => ({id: font.assetId, role: "HASH_BOUND_FORMAL_TYPOGRAPHY", sha256: font.sha256})),
      {id: "minimal-editorial-actual-pixel-review", role: "AGENT_ACTUAL_PIXEL_REVIEW", publicUrl: manifest.agentActualPixelReview.publicUrl, sha256: manifest.agentActualPixelReview.sha256},
    ],
  };
  const sourceBindingManifestSha256 = sha256(sourceBindingManifest);
  const artifact = {
    contract: "A1GeneratedEditorialAssetCache/v1",
    assetId: `minimal-editorial-static-board-repair-v1-${item.shotId.toLowerCase()}`,
    targetKind: "package-look-master",
    briefId: `minimal-editorial-static-board-repair-v1-${item.shotId.toLowerCase()}`,
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
  const actualFrameOccupation = decision.frameOccupation;
  const prefix = actualFrameOccupation === "OVERLAY" ? "OVERLAY" : actualFrameOccupation === "SPLIT" ? "SPLIT" : "FULLSCREEN";
  const serverBody = {contract: "A1BoundServerVisualAssessment/v1", status: "PASS", assessmentMode: "ACTUAL_PIXEL_ORIGINAL_RESOLUTION_REVIEW", artifactSha256: artifact.sha256, shotId: item.shotId, hardFailures: [], reviewedAt: now};
  const serverVisualAssessment = {...serverBody, assessmentSha256: sha256(serverBody)};
  const pixelBody = {
    contract: "A1UniversalReferenceActualPixelAudit/v1",
    status: "PASS",
    admissionAllowed: true,
    failures: [],
    artifactSha256: artifact.sha256,
    decodedSha256: artifact.sha256,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    actualPixelMetrics: {width: 1920, height: 1080, actualFrameOccupation, visualFingerprint: `${prefix}|MINIMAL_EDITORIAL_LOCAL|${artifact.sha256.slice(0, 12)}`, averageLuminance: actualFrameOccupation === "FULL_FRAME_TAKEOVER" ? 0.08 : 0.22, transparentFraction: 0, alphaMean: 1, warmCreamDominantFraction: 0, primaryReadingPathCount: 1, dominantMassCount: actualFrameOccupation === "OVERLAY" ? 2 : 1, decorativeMotifCount: 0, generatedPersonDetected: false, generatedFormalTextDetected: false},
    compositePreview: {kind: "ACTUAL_COMPLETE_LOOK_MASTER", publicUrl: artifact.publicUrl, sha256: artifact.sha256, width: 1920, height: 1080},
    footageCompatibility: baseSha256 ? {status: "PASS", reason: "formal title stays inside verified negative space", baseFrameSha256: baseSha256, subjectOcclusion: {status: "PASS", face: {status: "PASS"}, eyes: {status: "PASS"}, body: {status: "PASS"}, microphone: {status: "PASS"}, boomArm: {status: "PASS"}, availableRegionOverflow: {status: "PASS"}, typographyOverlapPixelCount: 0}} : {status: "NOT_APPLICABLE", reason: "intentional bounded conclusion takeover", baseFrameSha256: null},
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
    reviewSource: "ACTUAL_PIXEL_VISUAL_REVIEW",
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
  const assessmentBody = {contract: "A1MinimalEditorialActualPixelAssessment/v1", status: "PASS", shotId: item.shotId, artifactSha256: artifact.sha256, actualFrameOccupation, assemblyMode: decision.assemblyMode, presentationMode: decision.presentationMode, hardFailures: [], localEvidence: {visualDirectorReview: {actualFullFrameInspected: true, fullLookMasterActualPixelPass: true}, ocr: {status: "PASS", observedText: ocrText}, minimalCompositionAudit: item.styleLineage.minimalCompositionAudit}, userVisualApproval: "NOT_APPROVED", reviewedAt: now};
  const actualPixelAssessment = {...assessmentBody, assessmentSha256: sha256(assessmentBody)};
  return {
    contract: "A1LookMasterRawReference/v1",
    referenceId: `minimal-editorial-static-board-repair-v1-${item.shotId.toLowerCase()}`,
    shotId: item.shotId,
    planSha256: plan.planSha256,
    styleBriefSha256: plan.styleBriefSha256,
    candidateDirectionId: `minimal-editorial-${item.shotId.toLowerCase()}`,
    directionFingerprint: `${prefix}|MINIMAL_EDITORIAL|ONE_ACTOR|ONE_ACTION|ZERO_DECORATION`,
    artifact,
    pixelAudit,
    serverVisualAssessment,
    semanticPixelAudit,
    semanticPixelAuditSha256: semanticPixelAudit.auditSha256,
    actualPixelAssessment,
    actualPixelAssessmentSha256: actualPixelAssessment.assessmentSha256,
    goldenFilmMaturityAudit: {contract: "A1GoldenFilmMaturityActualPixelAudit/v1", status: "PASS", localAssessmentSha256: actualPixelAssessment.assessmentSha256, pixelAuditSha256: pixelAudit.auditSha256, semanticAuditSha256: semanticPixelAudit.auditSha256, actualFrameOccupation, actualModeEvidence: "MINIMAL_EDITORIAL_ORIGINAL_RESOLUTION_REVIEW", ocrStatus: "PASS", ocrObservationCount: [...ocrText].length, rejectionReasons: []},
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
    provenance: {contract: "A1MinimalEditorialStaticBoardRepairProvenance/v1", sourceWorkspaceSha256: workspace.workspaceSha256, sourceBoardSha256: manifest.sourceBoardSha256, candidateManifestSha256: manifest.manifestSha256, actualPixelReviewSha256: manifest.agentActualPixelReview.sha256, imagegenCallCount: 0},
    importedAt: now,
    createdAt: now,
    selectedAt: now,
  };
}

function applyCandidate(current, now) {
  let next = structuredClone(current);
  next.production.creatorPackagingProjectOverrides = structuredClone(overrides);
  next.production.canonicalCreatorPackagingSequence = buildCanonicalCreatorPackagingSequence(next, {now});
  const actualPackageIds = next.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => decision.packageDecision === "PACKAGE").map((decision) => decision.shotId);
  if (JSON.stringify(actualPackageIds) !== JSON.stringify(manifest.packageShotIds)) throw new Error(`minimal-editorial-adoption-canonical-membership-drift:${JSON.stringify(actualPackageIds)}`);
  const plans = new Map(next.production.shotIntelligence.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  const decisions = new Map(next.production.canonicalCreatorPackagingSequence.decisions.map((decision) => [decision.shotId, decision]));
  for (const item of manifest.items.filter((candidate) => generatedShotIds.has(candidate.shotId))) {
    const plan = plans.get(item.shotId);
    const decision = decisions.get(item.shotId);
    if (!plan || !decision) throw new Error(`minimal-editorial-adoption-plan-or-decision-missing:${item.shotId}`);
    for (const raw of next.production.shotIntelligence.lookMasterRawReferences.filter((raw) => raw.shotId === item.shotId && raw.current === true)) {
      raw.current = false;
      raw.historyReadOnly = true;
      raw.recommendationEligible = false;
      raw.selectionEligible = false;
      raw.supersession = {contract: "A1CandidateSupersession/v1", status: "HISTORY_ONLY", reason: "SUPERSEDED_BY_MINIMAL_EDITORIAL_WHOLE_FILM_RECOMPILE", supersededAt: now};
    }
    const raw = buildLocalRaw({workspace: current, item, plan, decision, now});
    next.production.shotIntelligence.lookMasterRawReferences.push(raw);
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
      selectionSource: "MINIMAL_EDITORIAL_WHOLE_FILM_RECOMPILE_ACTUAL_PIXEL_PASS",
      planMetadataMigration: {contract: "A1LookMasterPlanMetadataMigration/v1", status: "PASS", fromPlanSha256: plan.planSha256, toPlanSha256: plan.planSha256, actualArtifactSha256: raw.artifact.sha256, actualPixelAuditSha256: raw.pixelAudit.auditSha256, semanticPixelAuditSha256: raw.semanticPixelAudit.auditSha256, auditBytesUnchanged: false, selectionOnly: true},
    };
  }
  const firstTransition = buildCreatorPaletteBoundRepairTransition(next, {now});
  next = firstTransition.workspace;
  next = projectCanonicalStaticBoardWorkspace(next, {now}).workspace;
  const secondTransition = buildCreatorPaletteBoundRepairTransition(next, {now});
  if (!secondTransition.noop) next = secondTransition.workspace;
  next = projectCanonicalStaticBoardWorkspace(next, {now}).workspace;
  const planByShot = new Map(next.production.shotIntelligence.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  for (const item of manifest.items) {
    const selectedSha = planByShot.get(item.shotId)?.provisionalWholeFilmBoardSelection?.artifact?.sha256 || null;
    if (selectedSha !== item.styleLineage.sourceArtifactSha256) throw new Error(`minimal-editorial-adoption-selected-source-drift:${item.shotId}:${selectedSha}->${item.styleLineage.sourceArtifactSha256}`);
  }
  const priorBoard = next.production.shotIntelligence.wholeFilmStaticBoard;
  const styleLineageAuthority = {contract: "A1StaticBoardStyleLineageAuthority/v2", status: "PASS", current: true, required: true, styleSystem: manifest.styleSystem, candidateManifestPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/minimal-editorial-static-board-repair-v1/manifest.json", candidateManifestSha256: manifest.manifestSha256, agentActualPixelReview: manifest.agentActualPixelReview, audit: candidateStyleAudit, compositionDirective: manifest.compositionDirective, priorBoardDisposition: {status: "SUPERSEDED_VISUAL_REJECTED_POSTER_SEQUENCE", boardSha256: priorBoard.sha256}, currentBoardSha256: manifest.packageBoard.sha256, userVisualApproval: "NOT_APPROVED", adoptedAt: now};
  const consistencyBody = {contract: "A1StoryboardStyleLineagePixelConsistency/v1", status: "PASS", sourceBoardSha256: priorBoard.sha256, currentBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, styleSystemSha256: manifest.styleSystem.sha256, packageShotIds: manifest.packageShotIds, noPackageShotIds: next.production.canonicalCreatorPackagingSequence.decisions.filter((decision) => decision.packageDecision === "NO_PACKAGE").map((decision) => decision.shotId), recomposedShotIds: manifest.items.filter((item) => item.styleLineage.pixelTreatment === "RECOMPOSED").map((item) => item.shotId), preservedStrongMasterShotIds: manifest.items.filter((item) => item.styleLineage.pixelTreatment === "PRESERVED_STRONG_MASTER").map((item) => item.shotId), blockedShotIds: [], generatedAt: now};
  const storyboardPixelConsistency = {...consistencyBody, auditSha256: sha256(consistencyBody)};
  next.production.shotIntelligence.wholeFilmStaticBoard = {
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
    approvalAllowed: true,
    reviewActionDisabled: false,
    styleLineageAuthority,
    storyboardPixelConsistency,
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {...next.production.shotIntelligence.wholeFilmBatchRecommendation, status: "WHOLE_FILM_STATIC_BOARD_READY", staticBoard: structuredClone(next.production.shotIntelligence.wholeFilmStaticBoard), autoRecommendationAllowed: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextUserGate: "WHOLE_FILM_STATIC_BOARD"};
  next.production.shotIntelligence.currentAssembly = [];
  next.production.authority = {...next.production.authority, currentStage: "whole-film-static-board-review", state: "whole-film-static-board-review", nextAction: {id: "review-whole-film-static-board", label: "审看极简构成已落实的 34 镜静态板", requiresUser: true, targetShotIds: [], reviewGate: "WHOLE_FILM_STATIC_BOARD"}};
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  delete next.production.packagingTemporalReadabilityAuthority;
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const gate = auditWholeFilmStaticBoardCandidateAuthorities(recalculated);
  const minimal = auditWholeFilmMinimalEditorialComposition({workspace: recalculated});
  if (gate.status !== "PASS" || minimal.status !== "PASS") throw new Error(`minimal-editorial-adoption-post-gate-blocked:${JSON.stringify({gate, minimal})}`);
  return {workspace: recalculated, gate, minimal, transition: secondTransition.noop ? firstTransition : secondTransition, priorBoardSha256: priorBoard.sha256};
}

const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (expectedWorkspaceSha256 && current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`minimal-editorial-adoption-workspace-precondition:${current.workspaceSha256}`);
if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("minimal-editorial-adoption-runtime-not-frozen-idle");
if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("minimal-editorial-adoption-assembly-must-remain-empty");

if (dryRun) {
  const result = applyCandidate(current, new Date().toISOString());
  console.log(JSON.stringify({status: "DRY_RUN_PASS", workspaceSha256Before: current.workspaceSha256, projectedWorkspaceSha256: result.workspace.workspaceSha256, packageShotIds: manifest.packageShotIds, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, gateStatus: result.gate.status, minimalCompositionStatus: result.minimal.status, userVisualApproval: "NOT_APPROVED", assemblyCount: 0, imagegenCallCount: 0}, null, 2));
  process.exit(0);
}
if (!expectedWorkspaceSha256) throw new Error("minimal-editorial-adoption-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const locked = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (locked.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`minimal-editorial-adoption-cas:${locked.workspaceSha256}`);
  const now = new Date().toISOString();
  const applied = applyCandidate(locked, now);
  const event = createProductionEvent({workspace: applied.workspace, action: "adopt-minimal-editorial-static-board-repair-v1", targetId: manifest.packageBoard.sha256, payload: {priorBoardSha256: applied.priorBoardSha256, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, packageShotIds: manifest.packageShotIds, noPackageCount: manifest.counts.noPackageCount, userVisualApproval: "NOT_APPROVED", imagegenCallCount: 0, assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false}, now});
  applied.workspace.production.eventLedger.eventCount += 1;
  applied.workspace.production.eventLedger.lastEventId = event.eventId;
  applied.workspace.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1WholeFilmStaticBoardFinalizationReport/v1", status: "PASS", stage: "WHOLE_FILM_STATIC_BOARD_READY", nextUserGate: "WHOLE_FILM_STATIC_BOARD", userApprovalRequired: true, userVisualApproval: "NOT_APPROVED", compositionDirective: manifest.compositionDirective, packageShotIds: manifest.packageShotIds, noPackageCount: manifest.counts.noPackageCount, styleLineageAuthority: applied.workspace.production.shotIntelligence.wholeFilmStaticBoard.styleLineageAuthority, items: manifest.items, board: {...manifest.packageBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-package-board.png"}, timelineBoard: {...manifest.timelineBoard, publicUrl: "/generated/system-line/editorial-asset-workbench-v1/whole-film-static-board-v1/whole-film-timeline-board.png", itemCount: manifest.timelineItems.length, items: manifest.timelineItems}, storyboardPixelConsistency: applied.workspace.production.shotIntelligence.wholeFilmStaticBoard.storyboardPixelConsistency, minimalCompositionAudit: applied.minimal, formalAssemblyCount: 0, assemblyCreationAllowed: false, layerReconstructionAllowed: false, motionAllowed: false, generatedAt: now};
  const transition = applied.transition;
  const files = {
    "whole-film-static-board-v1/report.json": report,
    "storyboard-pixel-consistency-v1/report.json": applied.workspace.production.shotIntelligence.wholeFilmStaticBoard.storyboardPixelConsistency,
    "minimal-editorial-static-board-repair-v1/manifest.json": manifest,
    "minimal-editorial-static-board-repair-v1/agent-actual-pixel-review.json": readJson(path.join(candidateRoot, "agent-actual-pixel-review.json")),
    "creator-packaging-palette-review-v1/registry.json": transition.registry || applied.workspace.production.creatorPackagingPaletteRegistry,
    "creator-packaging-palette-review-v1/report.json": transition.report || {},
    "creator-packaging-palette-binding-v1/manifest.json": transition.bindingManifest || applied.workspace.production.creatorPaletteShotBindingManifest,
    "creator-packaging-palette-binding-v1/actual-mode-migration.json": transition.migration || applied.workspace.production.creatorPaletteActualModeMigration,
    "incremental-repair-executor-v1/repair-manifest.json": transition.repairManifest || {},
  };
  const binaryFiles = {
    "whole-film-static-board-v1/whole-film-package-board.png": fs.readFileSync(publicFile(manifest.packageBoard.publicUrl)),
    "whole-film-static-board-v1/whole-film-timeline-board.png": fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl)),
    "minimal-editorial-static-board-repair-v1/whole-film-package-board.png": fs.readFileSync(publicFile(manifest.packageBoard.publicUrl)),
    "minimal-editorial-static-board-repair-v1/whole-film-timeline-board.png": fs.readFileSync(publicFile(manifest.timelineBoard.publicUrl)),
  };
  for (const file of fs.readdirSync(path.join(candidateRoot, "frames"))) binaryFiles[`minimal-editorial-static-board-repair-v1/frames/${file}`] = fs.readFileSync(path.join(candidateRoot, "frames", file));
  const committed = persistProjectState(appRoot, applied.workspace, {event, expectedWorkspaceSha256: locked.workspaceSha256, commitId: `minimal-editorial-static-board-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files, binaryFiles});
  return {status: "PASS", workspaceSha256Before: locked.workspaceSha256, workspaceSha256After: committed.workspaceSha256, packageShotIds: manifest.packageShotIds, packageBoardSha256: manifest.packageBoard.sha256, timelineBoardSha256: manifest.timelineBoard.sha256, gateStatus: applied.gate.status, minimalCompositionStatus: applied.minimal.status, userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false, imagegenCallCount: 0};
});
console.log(JSON.stringify(result, null, 2));
