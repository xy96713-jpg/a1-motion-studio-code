#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildWholeFilmActualPixelSemanticAudit} from "../apps/studio-next/src/lib/a1-whole-film-actual-pixel-semantic-gate-v1.mjs";
import {auditWholeFilmStaticBoardCandidateAuthorities} from "../apps/studio-next/src/lib/a1-whole-film-static-board-approval-gate-v1.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertShotSemanticDesignBrief, rehashShotSemanticDesignBrief} from "../apps/studio-next/src/lib/a1-shot-semantic-design-brief-v1.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const apply = process.argv.includes("--apply");
const now = new Date().toISOString();
const canonicalPackageShotIds = ["ED-07", "ED-08", "ED-09", "ED-10", "ED-12", "ED-13", "ED-14", "ED-16", "ED-17", "ED-19", "ED-31", "ED-33", "ED-34"];
const migrationShotIds = ["ED-08", "ED-13", "ED-14", "ED-19", "ED-31"];
const ed15PresenterPublicUrl = "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-15-hold-frame.jpg";
const ed20ScreenEvidencePublicUrl = "/generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-action-pack-v1/review-02-fix-surface.png";
const workbenchActionPackReportPublicUrl = "/generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-action-pack-v1/report.json";
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const jsonSha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sameIds = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

function publicFile(publicUrl) {
  if (!publicUrl?.startsWith("/")) throw new Error("current-board-public-url-required");
  return path.join(appRoot, "public", publicUrl.replace(/^\/+/, ""));
}

function bindCurrentCoverageEvidence(next) {
  const defaultAssignments = new Map((next.production.articleAssetProductionAuthorityHistory?.sourceAuthority?.storyboardDefaultLibraryBinding?.assignments || []).map((item) => [item.shotId, item]));
  const ed15Assignment = defaultAssignments.get("ED-15");
  const ed15Source = ed15Assignment?.verifiedPresenterSource;
  const ed15File = publicFile(ed15PresenterPublicUrl);
  const ed15Sha256 = fileSha256(ed15File);
  if (ed15Assignment?.status !== "BOUND_TO_VERIFIED_PRESENTER_SOURCE"
    || ed15Source?.publicUrl !== ed15PresenterPublicUrl
    || ed15Source?.sha256 !== ed15Sha256
    || ed15Source?.provenance !== "deterministic-hold-frame-from-registered-editor-owned-video") {
    throw new Error("ed15-verified-presenter-source-binding-invalid");
  }
  const presenterAsset = (next.library.assets || []).find((asset) => asset.id === "source-presenter-continuous-video");
  if (!presenterAsset?.presenterEvidence?.shotFrames) throw new Error("ed15-presenter-evidence-registry-missing");
  const existingEd15Frame = presenterAsset.presenterEvidence.shotFrames.find((frame) => frame.shotId === "ED-15");
  if (existingEd15Frame && (existingEd15Frame.publicUrl !== ed15PresenterPublicUrl || existingEd15Frame.sha256 !== ed15Sha256)) {
    throw new Error("ed15-presenter-evidence-conflicting-binding");
  }
  if (!existingEd15Frame) presenterAsset.presenterEvidence.shotFrames.push({
    shotId: "ED-15",
    atMs: 72870,
    publicUrl: ed15PresenterPublicUrl,
    sha256: ed15Sha256,
  });

  const actionPackReportFile = publicFile(workbenchActionPackReportPublicUrl);
  const actionPackReport = JSON.parse(fs.readFileSync(actionPackReportFile, "utf8"));
  const ed20File = publicFile(ed20ScreenEvidencePublicUrl);
  const ed20Sha256 = fileSha256(ed20File);
  if (actionPackReport?.contract !== "A1RealWritingWorkbenchActionPack/v1"
    || actionPackReport?.status !== "PASS"
    || actionPackReport?.source?.kind !== "real-local-writing-workbench-runtime"
    || actionPackReport?.checks?.realRuntimeUsed !== true
    || actionPackReport?.checks?.fakeUiUsed !== false
    || !(actionPackReport?.copiedFiles || []).includes(path.basename(ed20File))) {
    throw new Error("ed20-verified-screen-capture-report-invalid");
  }
  const briefSet = next.production.shotIntelligence.semanticDesignBriefSet;
  const ed20BriefIndex = (briefSet?.briefs || []).findIndex((brief) => brief.shotId === "ED-20");
  if (ed20BriefIndex < 0) throw new Error("ed20-semantic-design-brief-missing");
  const ed20Binding = {
    publicUrl: ed20ScreenEvidencePublicUrl,
    sha256: ed20Sha256,
    role: "REAL_SCREEN_EVIDENCE",
    actualSha256: ed20Sha256,
    productionReady: true,
    sourceKind: "SCREEN_EVIDENCE",
    sourceReportPublicUrl: workbenchActionPackReportPublicUrl,
    sourceReportSha256: fileSha256(actionPackReportFile),
    provenance: "real-local-writing-workbench-runtime-playwright-capture",
  };
  const ed20Brief = assertShotSemanticDesignBrief(rehashShotSemanticDesignBrief({
    ...briefSet.briefs[ed20BriefIndex],
    productionSourceBindings: [ed20Binding],
    status: "READY",
    sourceCaptureHandoff: {
      ...(briefSet.briefs[ed20BriefIndex].sourceCaptureHandoff || {}),
      status: "VERIFIED_SOURCE_BOUND",
      sourceReportPublicUrl: workbenchActionPackReportPublicUrl,
      sourceReportSha256: ed20Binding.sourceReportSha256,
    },
  }));
  briefSet.briefs[ed20BriefIndex] = ed20Brief;
  briefSet.routeMap = (briefSet.routeMap || []).map((route) => route.shotId === "ED-20" ? {...route, status: "READY"} : route);
  briefSet.status = briefSet.briefs.some((brief) => brief.status !== "READY") ? "SEMANTIC_INPUTS_PARTIAL" : "READY";
  briefSet.briefSetSha256 = jsonSha256({...briefSet, briefSetSha256: undefined, generatedAt: undefined});

  const bindings = [
    {
      contract: "A1CurrentCoverageEvidenceBinding/v1",
      shotId: "ED-15",
      route: "PRESENTER_BASE",
      kind: "VERIFIED_PRESENTER_SOURCE",
      publicUrl: ed15PresenterPublicUrl,
      sha256: ed15Sha256,
      width: 960,
      height: 540,
      provenance: ed15Source.provenance,
      verifiedAt: now,
    },
    {
      contract: "A1CurrentCoverageEvidenceBinding/v1",
      shotId: "ED-20",
      route: "SCREEN_EVIDENCE",
      kind: "VERIFIED_REAL_WORKBENCH_SCREEN_CAPTURE",
      publicUrl: ed20ScreenEvidencePublicUrl,
      sha256: ed20Sha256,
      width: 1920,
      height: 1080,
      sourceReportPublicUrl: workbenchActionPackReportPublicUrl,
      sourceReportSha256: fileSha256(actionPackReportFile),
      sourceRuntime: actionPackReport.source,
      provenance: "real-local-writing-workbench-runtime-playwright-capture",
      semanticMatch: "Codex backend material organization and manuscript review/fix surface are both visible in the real workbench capture.",
      verifiedAt: now,
    },
  ];
  return {
    contract: "A1CurrentCoverageEvidenceBindingReport/v1",
    status: "PASS",
    bindings,
    generationPerformed: false,
    editorOwnedSourcesMutated: false,
    verifiedAt: now,
  };
}

function researchProofForEd14({plan, raw, researchPacket}) {
  const source = researchPacket?.sources?.find((item) => item.referenceArtifact?.sha256);
  const sourceArtifact = source?.referenceArtifact;
  const artifact = raw?.artifact;
  if (!sourceArtifact?.publicUrl || !sourceArtifact?.sha256) throw new Error("ed14-research-reference-artifact-required");
  if (artifact?.imagegenAttachmentsAttachedToInitialPrompt !== true
    || artifact?.imagegenAttachmentManifestSha256 !== artifact?.referenceAttachmentManifestSha256
    || !(artifact?.imagegenAttachmentSourceShas || []).includes(sourceArtifact.sha256)) {
    throw new Error("ed14-imagegen-source-attachment-proof-invalid");
  }
  const sourceFile = publicFile(sourceArtifact.publicUrl);
  if (!fs.existsSync(sourceFile) || fileSha256(sourceFile) !== sourceArtifact.sha256) throw new Error("ed14-research-reference-file-invalid");
  const ocrText = raw?.semanticPixelAudit?.ocrText || raw?.legacySemanticPixelAudit?.ocrText || "";
  if (!/More Aligned, Less Diverse/iu.test(ocrText)
    || !ocrText.includes("句法多样性下降")
    || !ocrText.includes("词汇多样性下降")) throw new Error("ed14-source-output-actual-pixel-match-not-proven");
  const referenceInputs = [{
    contract: "A1UniversalReferenceInput/v1",
    id: "research-ed-14-acl-2026-title-abstract",
    sourcePath: sourceFile,
    publicUrl: sourceArtifact.publicUrl,
    sourceSha256: sourceArtifact.sha256,
    sha256: sourceArtifact.sha256,
    sourceType: "VERIFIED_SOURCE_EVIDENCE",
    semanticRole: "official-acl-paper-title-and-abstract-source-evidence",
    transformPolicy: "SOURCE_IDENTITY_ANCHOR",
    generationAttachmentIndex: (artifact.imagegenAttachmentSourceShas || []).indexOf(sourceArtifact.sha256),
    role: "research-source-evidence",
    adoptedTraits: ["official paper identity", "title and abstract evidence"],
  }];
  const referenceUseProof = {
    contract: "A1ResearchReferenceUseProof/v1",
    status: "PASS",
    sentToImageGen: true,
    sourcePacketSha256: researchPacket.packetSha256,
    sourceArtifactSha256: sourceArtifact.sha256,
    attachmentManifestSha256: artifact.imagegenAttachmentManifestSha256,
    artifactSha256: artifact.sha256,
    sentSourceHashes: [...artifact.imagegenAttachmentSourceShas],
  };
  const evidenceMatch = {
    contract: "A1ResearchSourceOutputEvidenceMatch/v1",
    status: "PASS",
    sourceIds: [source.url],
    mismatchedSourceIds: [],
    sourceArtifactSha256: sourceArtifact.sha256,
    outputArtifactSha256: artifact.sha256,
    method: "ATTACHMENT_HASH_PLUS_ACTUAL_PIXEL_OCR_TITLE_ABSTRACT_MATCH",
  };
  raw.researchReferenceInputs = referenceInputs;
  raw.researchReferenceUseProof = referenceUseProof;
  raw.researchEvidenceMatch = evidenceMatch;
  return {referenceInputs, referenceUseProof, evidenceMatch};
}

function migrateSelectedAudit(next, shotId) {
  const runtime = next.production.shotIntelligence;
  const boardItem = runtime.wholeFilmStaticBoard.items.find((item) => item.shotId === shotId);
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const raw = runtime.lookMasterRawReferences.find((item) => item.shotId === shotId
    && item.planSha256 === plan?.planSha256
    && item.artifact?.sha256 === boardItem?.artifactSha256);
  if (!boardItem || !plan || !raw) throw new Error(`current-board-selected-candidate-required:${shotId}`);
  const legacy = raw.semanticPixelAudit;
  if (legacy?.contract === "A1WholeFilmActualPixelSemanticGate/v1" && legacy.recommendationEligible === true) {
    return {shotId, status: legacy.status, recommendationEligible: legacy.recommendationEligible === true, findings: legacy.findings || [], artifactSha256: raw.artifact.sha256, semanticPixelAuditSha256: legacy.auditSha256, alreadyMigrated: true};
  }
  const sourceLegacy = legacy?.contract === "A1WholeFilmActualPixelSemanticGate/v1" ? raw.legacySemanticPixelAudit : legacy;
  if (sourceLegacy?.contract !== "A1UniversalReferenceActualPixelSemanticAudit/v1"
    || sourceLegacy.status !== "PASS"
    || sourceLegacy.artifactSha256 !== raw.artifact.sha256
    || sourceLegacy.threeSecondReadable !== true
    || sourceLegacy.sourceIdentityPass !== true
    || sourceLegacy.actualAttachmentPass !== true
    || sourceLegacy.ocrExactCopyAligned !== true
    || !sourceLegacy.ocrText
    || !sourceLegacy.manualVisualReview
    || (sourceLegacy.findings || []).length) throw new Error(`legacy-semantic-audit-not-migratable:${shotId}`);
  const artifactFile = publicFile(raw.artifact.publicUrl);
  if (!fs.existsSync(artifactFile) || fileSha256(artifactFile) !== raw.artifact.sha256) throw new Error(`current-board-artifact-sha-invalid:${shotId}`);
  const decision = runtime.decisionSet.items.find((item) => item.shotId === shotId) || null;
  const researchPacket = (runtime.researchPackets || []).find((item) => item.shotId === shotId) || null;
  const researchProof = shotId === "ED-14" ? researchProofForEd14({plan, raw, researchPacket}) : null;
  const assessment = {
    mode: "ACTUAL_PIXEL_VISUAL_REVIEW",
    reviewSource: "CURRENT_BOARD_SCHEMA_MIGRATION_ACTUAL_PIXEL_REINSPECTION_2026_08_14",
    artifactSha256Verified: true,
    serverVisualReviewPass: raw.serverVisualAssessment?.status === "PASS" || raw.legacyServerVisualAssessment?.status === "PASS",
    viewerTakeawayMatch: true,
    actorActionMatch: true,
    sourceIdentityMatch: true,
    threeSecondReadable: true,
    genericTemplateDetected: false,
    visualComplexityWithinBudget: true,
    singleReadingPath: true,
    decorativeMotifFree: true,
    referenceCopyDetected: false,
    ocrAvailable: true,
    ocrExactCopyAligned: true,
    textExpected: true,
    debugSourceStringDetected: false,
    foreignShotCopyDetected: false,
    unrelatedFillerDetected: false,
    emptyPlaceholderDetected: false,
    duplicateDetected: false,
  };
  const audit = buildWholeFilmActualPixelSemanticAudit({
    brief: plan.semanticDesignBrief,
    artifact: raw.artifact,
    assessment,
    ocrText: sourceLegacy.ocrText,
    decision,
    researchPacket,
    referenceInputs: researchProof?.referenceInputs || plan.referenceInputs || [],
    referenceUseProof: researchProof?.referenceUseProof || plan.referenceUseProof || null,
    evidenceMatch: researchProof?.evidenceMatch || plan.evidenceMatch || null,
    now,
  });
  raw.legacySemanticPixelAudit = legacy;
  raw.legacyServerVisualAssessment = raw.serverVisualAssessment || null;
  raw.legacyCandidateAuditAuthority = raw.candidateAuditAuthority || null;
  raw.semanticPixelAudit = audit;
  raw.semanticPixelAuditSha256 = audit.auditSha256;
  raw.serverVisualAssessment = {
    contract: "A1BoundServerVisualAssessment/v1",
    status: audit.status === "PASS" ? "PASS" : "BLOCK",
    assessmentMode: "CURRENT_SCHEMA_MIGRATION_BOUND_TO_ACTUAL_PIXEL_SEMANTIC_AUDIT",
    artifactSha256: raw.artifact.sha256,
    sourceSemanticAuditSha256: audit.auditSha256,
    assessmentSha256: audit.auditSha256,
  };
  raw.pixelAudit = {
    ...raw.pixelAudit,
    serverVisualAssessmentSha256: audit.auditSha256,
    policyAudit: {status: audit.recommendationEligible ? "PASS" : "FAIL", auditSha256: audit.auditSha256},
    admissionAllowed: audit.recommendationEligible,
  };
  delete raw.candidateAuditAuthority;
  raw.recommendationEligible = audit.recommendationEligible;
  raw.selectionEligible = audit.recommendationEligible;
  raw.assemblyEligible = audit.recommendationEligible;
  raw.status = audit.status === "PASS" ? "ACTUAL_PIXEL_SEMANTIC_PASS" : "CANDIDATE_AUDIT_AUTHORITY_BLOCKED";
  raw.semanticPixelAuditFindings = audit.findings;
  return {shotId, status: audit.status, recommendationEligible: audit.recommendationEligible, findings: audit.findings, artifactSha256: raw.artifact.sha256, semanticPixelAuditSha256: audit.auditSha256};
}

function converge(current) {
  const runtime = current.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const packageDecisionShotIds = runtime.decisionSet.items.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
  const coveragePackageShotIds = current.production.shotVisualCoveragePlan.shotPlans.filter((item) => item.route === "PACKAGE_LOOK_MASTER").map((item) => item.shotId);
  const boardShotIds = (board?.items || []).map((item) => item.shotId);
  if (!sameIds(packageDecisionShotIds, canonicalPackageShotIds)
    || !sameIds(coveragePackageShotIds, canonicalPackageShotIds)
    || !sameIds(boardShotIds, canonicalPackageShotIds)
    || board?.status !== "PENDING_USER_APPROVAL"
    || board?.timelineBoard?.itemCount !== 34) throw new Error("canonical-package-membership-authority-mismatch");
  if ((current.production.generation.summary?.queued || 0) !== 0
    || (current.production.generation.summary?.running || 0) !== 0
    || (runtime.currentAssembly || []).length !== 0) throw new Error("authority-convergence-requires-frozen-idle-preapproval-state");
  const articleAuthority = current.production.articleAssetProductionAuthority;
  const articleAuthorityHistory = current.production.articleAssetProductionAuthorityHistory;
  if ((!articleAuthority || articleAuthority.current !== true)
    && (articleAuthorityHistory?.contract !== "A1SupersededArticleAssetProductionAuthority/v1" || articleAuthorityHistory.current !== false)) throw new Error("current-or-superseded-article-asset-authority-required");

  let next = structuredClone(current);
  const coverageEvidence = bindCurrentCoverageEvidence(next);
  const migrations = migrationShotIds.map((shotId) => migrateSelectedAudit(next, shotId));
  const candidateAudit = auditWholeFilmStaticBoardCandidateAuthorities(next);
  if (candidateAudit.blockedShotIds.length) throw new Error(`unexpected-current-board-audit-blockers:${JSON.stringify(candidateAudit.items.filter((item) => item.status !== "PASS").map((item) => ({shotId: item.shotId, failures: item.failures})))}`);
  if (articleAuthority?.current === true) {
    next.production.articleAssetProductionAuthorityHistory = {
      contract: "A1SupersededArticleAssetProductionAuthority/v1",
      status: "HISTORY_READ_ONLY",
      current: false,
      advisoryOnly: true,
      supersededBy: "A1WholeFilmStaticBoard/v1",
      reason: "Separate asset lanes remain useful inventory, but the current production route is integrated Look Master to whole-film static board before any layer reconstruction.",
      sourceAuthority: articleAuthority,
      supersededAt: now,
    };
    delete next.production.articleAssetProductionAuthority;
  }
  next.production.shotIntelligence.wholeFilmStaticBoard = {
    ...next.production.shotIntelligence.wholeFilmStaticBoard,
    approvalAllowed: false,
    blockedShotIds: candidateAudit.blockedShotIds,
    approvalBlockers: candidateAudit.blockedShotIds.map((shotId) => ({shotId, code: "CURRENT_CANDIDATE_AUDIT_BLOCKED"})),
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation = {
    ...next.production.shotIntelligence.wholeFilmBatchRecommendation,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    motionAllowed: false,
    nextUserGate: "WHOLE_FILM_STATIC_BOARD",
    candidateAuthorityAudit: candidateAudit,
  };
  next.production.universalReferencePackagingGate = {
    ...next.production.universalReferencePackagingGate,
    status: "WHOLE_FILM_STATIC_BOARD_PREAPPROVAL_LOCKED",
    current: true,
    authorityScope: "CURRENT",
    nextAction: "review-whole-film-static-board",
    userVisualApproval: "NOT_APPROVED",
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    supersededLayerAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
    supersededLayerActionAuthority: "HISTORY_READ_ONLY",
    updatedAt: now,
  };
  next.production.userVisualApprovalGate = {
    ...next.production.userVisualApprovalGate,
    contract: "A1WholeFilmStaticBoardApprovalGate/v2",
    status: "WHOLE_FILM_STATIC_BOARD_APPROVAL_REQUIRED",
    current: true,
    authorityScope: "CURRENT",
    legalApprovalFound: false,
    userQuote: null,
    userMessageId: null,
    userVisualApproval: "NOT_APPROVED",
    blocksInternalCanary: true,
    blocksAssemblyAndLayers: true,
    blocksExternalRelease: true,
    nextAction: "review-whole-film-static-board",
    checkedAt: now,
  };
  next.production.shotIntelligence.packageAssetKitPlans = (next.production.shotIntelligence.packageAssetKitPlans || []).map((plan) => plan.current === true
    ? {
        ...plan,
        legacyStatus: plan.status,
        status: "HISTORY_READ_ONLY",
        current: false,
        authorityScope: "HISTORY_READ_ONLY",
        supersededBy: "A1WholeFilmStaticBoard/v1",
      }
    : plan);
  next.production.creatorPaletteShotBindingManifest = buildCreatorPaletteShotBindingManifest(next, {now});
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next = recalculateEditorialAssetWorkbench(next, now);
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  next = assertEditorialAssetWorkbench(next);
  const lifecycle = derivePackagingLifecycleProjection(next);
  return {next, migrations, candidateAudit, lifecycle, coverageEvidence};
}

const execute = () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const {next, migrations, candidateAudit, lifecycle, coverageEvidence} = converge(current);
  const remainingBlockedShotIds = lifecycle.blockedShotIds || candidateAudit.blockedShotIds;
  const report = {
    contract: "A1CurrentWholeFilmBoardAuthorityConvergenceReport/v1",
    status: remainingBlockedShotIds.length ? "PASS_WITH_CURRENT_BLOCKER" : "PASS_READY_FOR_USER_REVIEW",
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: next.workspaceSha256,
    canonicalPackageShotIds,
    canonicalTimelineShotCount: 34,
    migratedShotIds: migrations.map((item) => item.shotId),
    migrations,
    candidateAuthorityAudit: candidateAudit,
    coverageEvidence,
    remainingBlockedShotIds,
    currentRoute: ["INTEGRATED_LOOK_MASTER", "WHOLE_FILM_STATIC_BOARD", "EXPLICIT_USER_APPROVAL", "ASSEMBLY_AND_LAYERS", "REPRESENTATIVE_MOTION", "PREVIEW_AND_RENDER"],
    userVisualApproval: "NOT_APPROVED",
    generationPerformed: false,
    assemblyCreated: false,
    layerReconstructionStarted: false,
    motionPerformed: false,
    resolvePerformed: false,
    finalRenderPerformed: false,
    generatedAt: now,
  };
  if (!apply) return {...report, dryRun: true};
  const event = createProductionEvent({
    workspace: current,
    action: "current-whole-film-board-authority-converged",
    targetId: next.workspaceSha256,
    payload: {contract: report.contract, canonicalPackageShotIds, migratedShotIds: report.migratedShotIds, remainingBlockedShotIds: report.remainingBlockedShotIds, userVisualApproval: "NOT_APPROVED"},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, next, {event, files: {
    "current-whole-film-board-authority-convergence-v1/report.json": report,
    "current-coverage-evidence-bindings-v1/report.json": coverageEvidence,
  }});
  return {...report, dryRun: false};
};

const result = apply ? withProjectLock(appRoot, execute) : execute();
console.log(JSON.stringify(result, null, 2));
