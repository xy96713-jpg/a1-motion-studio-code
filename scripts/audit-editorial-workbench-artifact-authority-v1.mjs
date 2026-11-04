#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {isShotCandidateSetReviewable, selectedShotCandidateSetSha256} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1");
const publicWorkspacePath = path.join(publicRoot, "workspace.json");
const artifactWorkspacePath = path.join(artifactRoot, "workspace.json");
const pagePath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/page.tsx");
const clientPath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx");
const legacyReviewPagePath = path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx");
const gitignorePath = path.join(root, ".gitignore");
const reportRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-workbench-artifact-authority-v1");
const publicReportRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-workbench-artifact-authority-v1");
const phasePrefix = "/generated/system-line/editorial-asset-workbench-v1/";
const residueNames = [
  "reference-pixel-parity-v1",
  "article-pixel-typography-imagegen-v1",
  "article-pixel-typography-imagegen-v2",
  "ui-proof-34-shot-demands.png",
  "ui-proof-real-sources.png",
  "ui-proof-visual-bible.png",
];
const legacyReadMarkers = [
  "scene-graph-motion-preview-v1-all-selected-atlas",
  "scene-graph-motion-preview-v1-causal-screen",
  "scene-graph-motion-preview-v1-reference-mix",
  "scene-graph-motion-preview-v1-research-proof",
  "reference-pixel-parity-v1/report.json",
  'fetch("/generated/system-line/editorial-asset-workbench-v1/all-shot-selected-review-v1/report.json"',
];

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const checks = [];
const check = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});

if (!fs.existsSync(publicWorkspacePath) || !fs.existsSync(artifactWorkspacePath)) throw new Error("workbench-workspace-pair-required");
const workspace = readJson(publicWorkspacePath);
const pageSource = fs.readFileSync(pagePath, "utf8");
const clientSource = fs.readFileSync(clientPath, "utf8");
const legacyReviewPageSource = fs.readFileSync(legacyReviewPagePath, "utf8");
const gitignoreSource = fs.readFileSync(gitignorePath, "utf8");
const policySha256 = workspace.visualBible?.visualGenerationPolicy?.sha256;
const activeShotAssets = workspace.library.assets.filter((asset) => asset.route === "shot-composition"
  && asset.shotDemand
  && isShotCandidateSetReviewable(asset)
  && asset.candidates.every((candidate) => candidate.sceneGraph?.visualPolicy?.sha256 === policySha256));
const activeShotIds = activeShotAssets.map((asset) => asset.shotDemand.shotId).sort();
const activeShotIdSet = new Set(activeShotIds);
const causalMotionProofReady = workspace.production?.motion?.previewArtifact?.contract === "A1CausalMotionProofArtifact/v1"
  && workspace.production.motion.previewArtifact.reviewOnly === true
  && workspace.production.motion.status === "review-only-causal-proof-ready";
const resolveLayoutHandoffReady = workspace.production?.resolveLayoutHandoffs?.["ED-01"]?.contract === "A1ResolveLayoutHandoff/v1"
  && workspace.production.resolveLayoutHandoffs["ED-01"].status === "layout-ready-mask-pending"
  && workspace.production.resolveLayoutHandoffs["ED-01"].reviewOnly === true;
const shotReports = workspace.production.maturityLoop?.shotReports || {};
const operationReports = workspace.production.maturityLoop?.operationReports || {};
const shotReportIds = Object.keys(shotReports).sort();
const staleShotReports = shotReportIds.filter((shotId) => {
  const asset = activeShotAssets.find((item) => item.shotDemand.shotId === shotId);
  const report = shotReports[shotId];
  return !asset?.visualCritic
    || !report
    || report.reportSha256 !== asset.visualCritic.reportSha256
    || report.sourceRenderSha256 !== asset.visualCritic.sourceRenderSha256;
});
const operation = workspace.production?.operationOrchestration;
const packagingKitReviewActive = workspace.production?.articlePackagingKit?.contract === "A1ArticlePackagingKit/v1"
  && workspace.production.articlePackagingKit.review?.status !== "approved"
  && workspace.gates?.shotCompositionAllowed === false;
const backgroundLibraryReviewActive = workspace.production?.articleAssetProductionAuthority?.contract === "A1ArticleAssetProductionAuthority/v1"
  && workspace.production.articleAssetProductionAuthority.status === "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW"
  && workspace.production.articleAssetProductionAuthority.authorization?.requiresUser === true
  && workspace.production.articleAssetProductionAuthority.boundaries?.motionAllowed === false
  && workspace.production.articleAssetProductionAuthority.boundaries?.productionAdmitted === false;
const semanticPilotActive = String(workspace.production?.shotIntelligence?.status || "").startsWith("SEMANTIC_PILOT")
  && workspace.production?.shotIntelligence?.semanticPilot?.recommendation == null
  && workspace.production?.shotIntelligence?.semanticPilot?.selected == null
  && (workspace.production?.shotIntelligence?.semanticPilot?.currentAssembly || []).length === 0;
const wholeFilmPackagingActive = workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.nextUserGate === "WHOLE_FILM_STATIC_BOARD";
const wholeFilmReconciliationActive = workspace.production?.authority?.currentStage === "film-look-master-semantic-reconciliation-required"
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === true
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.nextUserGate === null
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false;
const wholeFilmExceptionRepairActive = workspace.production?.authority?.currentStage === "film-look-master-exception-repair-required"
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === false
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.layerReconstructionAllowed === false;
const storyboardProjection = workspace.production?.storyboardProductionProjection;
const packagingLifecycle = workspace.production?.packagingLifecycleProjection;
const wholeFilmStaticBoard = workspace.production?.shotIntelligence?.wholeFilmStaticBoard;
const canonicalPackageCount = (workspace.production?.canonicalCreatorPackagingSequence?.decisions || [])
  .filter((decision) => decision.packageDecision === "PACKAGE").length;
const canonicalShotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
const wholeFilmStaticBoardReviewActive = workspace.production?.authority?.currentStage === "whole-film-static-board-review"
  && workspace.production?.authority?.nextAction?.id === "review-whole-film-static-board"
  && workspace.status === "PACKAGING_LANE_WHOLE_FILM_STATIC_BOARD_READY"
  && packagingLifecycle?.contract === "A1PackagingLifecycleProjection/v1"
  && packagingLifecycle.status === "WHOLE_FILM_STATIC_BOARD_READY"
  && packagingLifecycle.approvalAllowed === true
  && packagingLifecycle.layerReconstructionAllowed === false
  && packagingLifecycle.motionAllowed === false
  && wholeFilmStaticBoard?.contract === "A1WholeFilmStaticBoard/v1"
  && wholeFilmStaticBoard.status === "PENDING_USER_APPROVAL"
  && wholeFilmStaticBoard.itemCount === canonicalPackageCount
  && wholeFilmStaticBoard.timelineBoard?.itemCount === canonicalShotCount
  && workspace.production?.userVisualApprovalGate?.userVisualApproval === "NOT_APPROVED"
  && workspace.production?.assembly?.status === "locked-awaiting-whole-film-static-board-user-approval"
  && workspace.production?.assembly?.assemblyCreated === false
  && workspace.production?.assembly?.currentAssemblyCount === 0;
const currentVisualRepairAuthorization = ["AUTHORIZE_TASTE_BOUND_BOUNDED_CANARY", "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY"].includes(packagingLifecycle?.nextActionId);
const tasteBoundVisualRepairActive = workspace.production?.authority?.currentStage === "visual-repair-required"
  && workspace.status === "PACKAGING_LANE_VISUAL_REPAIR_REQUIRED"
  && packagingLifecycle?.contract === "A1PackagingLifecycleProjection/v1"
  && packagingLifecycle.status === "VISUAL_REPAIR_REQUIRED"
  && currentVisualRepairAuthorization
  && packagingLifecycle.userVisualApproval === "NOT_APPROVED"
  && packagingLifecycle.motionAllowed === false
  && packagingLifecycle.finalFilm === false
  && storyboardProjection?.contract === "A1StoryboardProductionProjection/v1"
  && storyboardProjection.status === "TASTE_BOUND_LEGACY_PIXELS_REJECTED"
  && storyboardProjection.counts?.package > 0
  && storyboardProjection.counts?.tasteBound === storyboardProjection.counts?.package
  && storyboardProjection.counts?.tasteUnbound === 0
  && storyboardProjection.counts?.temporalPlanPass === storyboardProjection.counts?.package
  && storyboardProjection.counts?.temporalUnbound === 0
  && storyboardProjection.gate?.generationFrozen === true
  && storyboardProjection.gate?.imageGenerationAllowed === false
  && storyboardProjection.gate?.automaticDispatchAllowed === false
  && storyboardProjection.gate?.userVisualApproval === "NOT_APPROVED"
  && storyboardProjection.gate?.machinePassCannotApprove === true
  && storyboardProjection.gate?.motionAllowed === false
  && storyboardProjection.gate?.finalRenderAllowed === false;
const currentOperationReport = operationReports[operation?.currentShotId];
const operationReportCurrent = Boolean(
  operation?.currentShotId
  && activeShotIdSet.has(operation.currentShotId)
  && operation?.preview?.sha256
  && operation?.visualReview?.sourceProofSha256 === operation.preview.sha256
  && currentOperationReport?.sourceProofSha256 === operation.preview.sha256
  && currentOperationReport?.reportSha256 === operation.visualReview.reportSha256
);
const operationAuthorityInactive = Boolean(
  operation?.status === "locked-upstream-revision"
  && !operation?.preview
  && !operation?.visualReview
  && Object.keys(operationReports).length === 0
);
const reviewRounds = (workspace.production.maturityLoop?.rounds || []).filter((round) => String(round.targetType || "").startsWith("shot-frame") || round.targetType === "screen-operation-sequence" || round.targetType === "representative-motion");
const latestRoundByTarget = new Map();
for (const round of reviewRounds) {
  const authoritySlot = String(round.targetType || "").startsWith("shot-frame") || round.targetType === "screen-operation-sequence"
    ? `shot:${round.targetId}`
    : `representative-motion:${round.targetId}`;
  latestRoundByTarget.set(authoritySlot, round);
}
const staleRounds = [...latestRoundByTarget.values()].filter((round) => {
  if (round.targetType === "screen-operation-sequence") {
    const report = operationReports[round.targetId];
    return !operationReportCurrent || !report || report.reportSha256 !== round.reportSha256 || report.sourceProofSha256 !== round.sourceProofSha256;
  }
  if (round.targetType === "representative-motion") {
    return workspace.production.maturityLoop?.representativeMotionReport?.reportSha256 !== round.reportSha256;
  }
  const report = shotReports[round.targetId];
  if (!report) return false;
  return !activeShotIdSet.has(round.targetId) || !report || report.reportSha256 !== round.reportSha256;
});
const activeResidue = residueNames.flatMap((name) => [path.join(publicRoot, name), path.join(artifactRoot, name)]).filter((file) => fs.existsSync(file));
const acceptedIrActive = workspace.production.acceptedShotIr.status === "compiled-review-only";
const acceptedIrPath = path.join(publicRoot, "accepted-shot-ir-v2.json");
const motionIrPath = path.join(publicRoot, "motion-ir-v2.json");
const acceptedIr = acceptedIrActive && fs.existsSync(acceptedIrPath) ? readJson(acceptedIrPath) : null;
const motionIr = acceptedIrActive && fs.existsSync(motionIrPath) ? readJson(motionIrPath) : null;

const authorityUrls = [];
function collectAuthorityUrls(value, trail = []) {
  if (Array.isArray(value)) return value.forEach((item, index) => collectAuthorityUrls(item, [...trail, String(index)]));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (["publicUrl", "assetUri", "contactSheetPublicUrl", "reportPublicUrl", "localPublicPath"].includes(key) && typeof item === "string") {
      authorityUrls.push({trail: [...trail, key].join("."), url: item});
    }
    collectAuthorityUrls(item, [...trail, key]);
  }
}
collectAuthorityUrls(workspace);
const referenceSequenceCorpus = workspace.candidateAdmission?.referenceSequenceCorpus;
const visualReferencePack = workspace.visualBible?.visualReferencePack;
const visualReferencePackIsHashBound = Boolean(
  visualReferencePack?.contract
  && visualReferencePack.referenceOnly === true
  && visualReferencePack.productionAssetAllowed === false
  && visualReferencePack.manifestSha256
  && Array.isArray(visualReferencePack.sources)
  && visualReferencePack.sources.length > 0
  && visualReferencePack.sources.every((source) => source?.publicUrl && source?.sha256)
);
const approvedReferenceOnlyUrls = new Set([
  ...(referenceSequenceCorpus?.contract === "A1ReferenceSequenceCorpus/v2"
  && referenceSequenceCorpus.runtimeAssetAllowed === false
  ? [
    referenceSequenceCorpus.publicUrl,
    referenceSequenceCorpus.referenceWallPublicUrl,
    "/generated/system-line/reference-sequence-corpus-v1/sources/hupo.jpg",
    "/generated/system-line/reference-sequence-corpus-v1/sources/magnates-media.jpg",
    "/generated/system-line/reference-sequence-corpus-v1/frames/hupo/hupo-proof-scan-02.jpg",
    "/generated/system-line/reference-sequence-corpus-v1/frames/hupo/hupo-black-verdict-01.jpg",
    "/generated/system-line/reference-sequence-corpus-v1/frames/magnates-media/magnates-cold-open-02.jpg",
    "/generated/system-line/reference-sequence-corpus-v1/frames/magnates-media/magnates-archive-build-02.jpg",
  ].filter(Boolean)
  : []),
  ...(visualReferencePackIsHashBound
    ? visualReferencePack.sources.map((source) => source.publicUrl)
    : []),
  ...(visualReferencePackIsHashBound
    && Array.isArray(visualReferencePack.historyReadOnlySources)
    && visualReferencePack.historyReadOnlySources.every((source) => source?.publicUrl
      && source?.sha256
      && source.historyReadOnly === true
      && source.status === "HISTORY_READ_ONLY")
    ? visualReferencePack.historyReadOnlySources.map((source) => source.publicUrl)
    : []),
]);
// Formal project fonts are production support inputs, not a second artifact
// phase.  They intentionally live under the app's local font root rather than
// the generated workbench phase and must not be mistaken for legacy output.
const approvedProductionSupportPrefixes = [
  "/a1-editorial-fonts/",
  "/generated/system-line/web-source-packaging-pilot-v1/sources/",
];
const packagingReviewAssetCandidates = workspace.production?.packagingReviewAssetCandidates;
const packagingReviewAssetCandidateSetIsBound = packagingReviewAssetCandidates?.contract === "A1PackagingReviewAssetCandidateSet/v1"
  && packagingReviewAssetCandidates.status === "REVIEW_ASSET_CANDIDATE_ONLY"
  && packagingReviewAssetCandidates.productionAdmissionAllowed === false
  && packagingReviewAssetCandidates.writerExecutionAllowed === false
  && packagingReviewAssetCandidates.reviewOnly === true
  && packagingReviewAssetCandidates.sourceLineageVerified === true
  && Boolean(packagingReviewAssetCandidates.manifestSha256)
  && Array.isArray(packagingReviewAssetCandidates.candidates)
  && packagingReviewAssetCandidates.candidates.length > 0
  && packagingReviewAssetCandidates.candidates.every((candidate) => candidate?.contract === "A1PackagingReviewAssetCandidate/v1"
    && candidate.status === "REVIEW_ASSET_CANDIDATE"
    && candidate.reviewOnly === true
    && candidate.productionAdmissionAllowed === false
    && Boolean(candidate.publicUrl)
    && Boolean(candidate.sha256));
const approvedReviewOnlyUrls = new Set(packagingReviewAssetCandidateSetIsBound
  ? packagingReviewAssetCandidates.candidates.map((candidate) => candidate.publicUrl)
  : []);
const crossArticleProof = workspace.production?.release?.crossArticleProof;
const crossArticleReportFile = typeof crossArticleProof?.reportPublicUrl === "string"
  ? path.join(root, "apps/studio-next/public", crossArticleProof.reportPublicUrl.replace(/^\//u, ""))
  : "";
const crossArticleContactSheetFile = typeof crossArticleProof?.contactSheetPublicUrl === "string"
  ? path.join(root, "apps/studio-next/public", crossArticleProof.contactSheetPublicUrl.replace(/^\//u, ""))
  : "";
const crossArticleReport = crossArticleReportFile && fs.existsSync(crossArticleReportFile)
  ? readJson(crossArticleReportFile)
  : null;
const crossArticleProofIsHashBound = Boolean(
  crossArticleProof?.contract === "A1CrossArticleVisualProof/v1"
  && crossArticleProof.status === "pass"
  && crossArticleProof.pipeline?.route === "A1VisualDirectorProject/v1"
  && crossArticleProof.pipeline?.qualifiesForMaturity === true
  && crossArticleReport?.contract === "A1UnseenRealArticleE2E/v1"
  && crossArticleReport.status === "FULL_E2E_PASS"
  && crossArticleReport.sourceSha256 === crossArticleProof.sourceSha256
  && crossArticleReport.directVisualReview?.status === "DIRECT_VISUAL_REVIEW_PASS"
  && sha256(crossArticleReportFile) === crossArticleProof.reportSha256
  && crossArticleContactSheetFile
  && fs.existsSync(crossArticleContactSheetFile)
  && sha256(crossArticleContactSheetFile) === crossArticleReport.contactSheet?.sha256
  && workspace.production?.userVisualApprovalGate?.userVisualApproval === "NOT_APPROVED"
);
const approvedCrossArticleProofUrls = new Set(crossArticleProofIsHashBound
  ? [crossArticleProof.reportPublicUrl, crossArticleProof.contactSheetPublicUrl]
  : []);
const foreignProductionUrls = authorityUrls.filter((item) => item.url.startsWith("/")
  && !item.url.startsWith(phasePrefix)
  && !approvedReferenceOnlyUrls.has(item.url)
  && !approvedReviewOnlyUrls.has(item.url)
  && !approvedCrossArticleProofUrls.has(item.url)
  && !approvedProductionSupportPrefixes.some((prefix) => item.url.startsWith(prefix)));
const allShotSelectedReview = workspace.production.maturityLoop?.allShotSelectedReview || null;
const allShotSelectedReviewCurrent = !allShotSelectedReview
  || (allShotSelectedReview.contract === "A1AllShotSelectedVisualAudit/v1"
    && allShotSelectedReview.selectedCandidateSetSha256 === selectedShotCandidateSetSha256(workspace));

check("workspace-public-artifact-parity", sha256(publicWorkspacePath) === sha256(artifactWorkspacePath), {publicSha256: sha256(publicWorkspacePath), artifactSha256: sha256(artifactWorkspacePath)});
check("server-page-defers-authoritative-workspace-to-client-snapshot-api", !legacyReadMarkers.some((marker) => pageSource.includes(marker))
  && !pageSource.includes("workspace.json")
  && pageSource.includes("<VisualAssetWorkbenchClient initialWorkspace={null}/>")
  && clientSource.includes("editorial-asset-workbench?mode=client"), {legacyMarkers: legacyReadMarkers.filter((marker) => pageSource.includes(marker))});
check("client-global-audit-is-ledger-bound", !legacyReadMarkers.some((marker) => clientSource.includes(marker))
  && clientSource.includes("review.reportPublicUrl")
  && /value\.selectedCandidateSetSha256\s*===\s*review\.selectedCandidateSetSha256/u.test(clientSource), {legacyMarkers: legacyReadMarkers.filter((marker) => clientSource.includes(marker))});
check("legacy-review-runtime-retired", legacyReviewPageSource.includes('redirect("/system-line-visual-workbench")') && !legacyReviewPageSource.includes("generated/system-line/"), {redirectTarget: "/system-line-visual-workbench"});
check("regenerable-output-caches-ignored", [
  "public/assets/generated-artwork/",
  "apps/studio-next/public/generated-artwork/",
  "remotion-renderer/public/generated-artwork/",
  "remotion-renderer/public/assets/generated-artwork/",
  "hyperframes/**/snapshots/",
].every((pattern) => gitignoreSource.includes(pattern)), {gitignore: rel(gitignorePath)});
check("active-shot-report-scope-current", wholeFilmStaticBoardReviewActive || semanticPilotActive || packagingKitReviewActive || wholeFilmPackagingActive || wholeFilmReconciliationActive || wholeFilmExceptionRepairActive || tasteBoundVisualRepairActive || (staleShotReports.length === 0 && shotReportIds.every((shotId) => activeShotIdSet.has(shotId))), {wholeFilmStaticBoardReviewActive, semanticPilotActive, packagingKitReviewActive, wholeFilmPackagingActive, wholeFilmReconciliationActive, wholeFilmExceptionRepairActive, tasteBoundVisualRepairActive, activeShotIds, shotReportIds, staleShotReports});
check("active-operation-report-current", packagingKitReviewActive || operationReportCurrent || operationAuthorityInactive, {packagingKitReviewActive, operationAuthorityInactive, shotId: operation?.currentShotId || null, reportSha256: currentOperationReport?.reportSha256 || null, sourceProofSha256: currentOperationReport?.sourceProofSha256 || null});
check("active-maturity-rounds-current", wholeFilmStaticBoardReviewActive || semanticPilotActive || packagingKitReviewActive || wholeFilmPackagingActive || wholeFilmReconciliationActive || wholeFilmExceptionRepairActive || tasteBoundVisualRepairActive || staleRounds.length === 0, {wholeFilmStaticBoardReviewActive, semanticPilotActive, packagingKitReviewActive, wholeFilmPackagingActive, wholeFilmReconciliationActive, wholeFilmExceptionRepairActive, tasteBoundVisualRepairActive, roundCount: workspace.production.maturityLoop?.rounds?.length || 0, staleRoundCount: staleRounds.length});
check("downstream-pointers-match-current-production-stage", acceptedIrActive
  ? acceptedIr?.contract === "A1AcceptedShotIRSet/v2"
    && acceptedIr.sha256 === workspace.production.acceptedShotIr.sha256
    && acceptedIr.sourceWorkspaceSha256 === workspace.production.acceptedShotIr.sourceWorkspaceSha256
    && motionIr?.contract === "A1MotionIRSet/v2"
    && motionIr.acceptedShotIrSha256 === acceptedIr.sha256
  : (workspace.production.motion.previewArtifact === null
      || causalMotionProofReady
      || ((wholeFilmStaticBoardReviewActive || tasteBoundVisualRepairActive || backgroundLibraryReviewActive)
        && workspace.production.motion.current === false
        && workspace.production.motion.authorityScope === "HISTORY_READ_ONLY"
        && workspace.production.motion.fullMotionAllowed === false
        && workspace.production.motion.motionApproved === false))
    && !workspace.production.maturityLoop?.representativeMotionReport
    && (!workspace.production.maturityLoop?.mediumRhythmRevision
      || (workspace.production.acceptedShotIr?.status === "locked-upstream-revision"
        && workspace.production.motion?.status === "locked-upstream-revision"))
    && allShotSelectedReviewCurrent, {
  acceptedShotIr: workspace.production.acceptedShotIr.status,
  acceptedIrSha256: acceptedIr?.sha256 || null,
  motionIrSha256: motionIr?.sha256 || null,
  motionPreview: workspace.production.motion.previewArtifact?.publicUrl || null,
  representativeMotionReport: workspace.production.maturityLoop?.representativeMotionReport?.reportPublicUrl || null,
  mediumRhythmRevision: workspace.production.maturityLoop?.mediumRhythmRevision?.reportPublicUrl || null,
  allShotSelectedReview: workspace.production.maturityLoop?.allShotSelectedReview?.reportPublicUrl || null,
});
check("legacy-runtime-residue-quarantined", activeResidue.length === 0, {activeResidue: activeResidue.map(rel)});
check("workspace-production-urls-stay-in-current-phase", foreignProductionUrls.length === 0, {urlCount: authorityUrls.length, approvedReferenceOnlyUrls: [...approvedReferenceOnlyUrls], approvedReviewOnlyUrls: [...approvedReviewOnlyUrls], approvedCrossArticleProofUrls: [...approvedCrossArticleProofUrls], crossArticleProofIsHashBound, approvedProductionSupportPrefixes, foreignProductionUrls});
check("automatic-production-gates-are-stage-coherent", workspace.production?.automationPolicy?.intermediateUserApprovalRequired === false
  && workspace.production?.automationPolicy?.calibrationUserApprovalRequired === false
  && workspace.production?.automationPolicy?.finalReleaseApprovalRequired === true
  && (!workspace.gates.motionPrototypeAllowed || workspace.gates.acceptedShotIrAllowed)
  && (!workspace.gates.finalRenderAllowed || workspace.production.motion.fullMotionAllowed)
  && workspace.gates.finalRenderAllowed === (workspace.production.release.review540p.status === "approved"), {gates: workspace.gates, motionStatus: workspace.production.motion.status, review540p: workspace.production.release.review540p.status});

const failures = checks.filter((item) => item.status === "FAIL");
const ed01 = activeShotAssets.find((asset) => asset.shotDemand.shotId === "ED-01");
const ed01ReferenceMature = Boolean(
  ed01?.visualCritic?.verdict === "PASS"
  && ed01.visualCritic.totalScore >= 22
  && ed01.visualCritic.referenceMaturity === true
);
const operationShot = activeShotAssets.find((asset) => asset.candidates?.some((candidate) => candidate.sceneGraph?.operationTraceBinding));
const report = {
  contract: "A1EditorialWorkbenchArtifactAuthorityAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  workspaceSha256: workspace.workspaceSha256,
  policySha256,
  activeShotIds,
  checks,
  failures: failures.map((item) => item.id),
  nextAction: failures.length ? "repair-active-workbench-artifact-authority" : workspace.production?.authority?.nextAction?.id || "review-current-visual-gates",
};
fs.mkdirSync(reportRoot, {recursive: true});
fs.mkdirSync(publicReportRoot, {recursive: true});
fs.writeFileSync(path.join(reportRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(publicReportRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, failures: report.failures, activeShotIds, reportPath: rel(path.join(reportRoot, "report.json")), nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 1;
