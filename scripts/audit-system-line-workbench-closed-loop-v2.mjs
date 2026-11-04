#!/usr/bin/env node

import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {auditPackageLookMasterTopologyDiversity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";

const root = process.cwd();
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line");
const workbenchRoot = path.join(publicRoot, "editorial-asset-workbench-v1");
const reportArtifactRoot = path.join(artifactRoot, "system-line-workbench-closed-loop-v2");
const reportPublicRoot = path.join(publicRoot, "system-line-workbench-closed-loop-v2");
const currentPhasePath = path.join(artifactRoot, "current-phase.json");
const authorityAuditPath = path.join(artifactRoot, "system-line-current-authority-v2/audit-report.json");
const workspacePath = path.join(workbenchRoot, "workspace.json");
const quarantineReportPath = path.join(workbenchRoot, "stale-artifact-quarantine-v1-latest.json");
const artifactAuthorityPath = path.join(artifactRoot, "editorial-workbench-artifact-authority-v1/report.json");

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const sha256 = (file) => fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const checks = [];
const check = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});
const command = (name, args) => spawnSync(name, args, {cwd: root, encoding: "utf8"});
const fetchLocalWithRetry = async (url, attempts = 3) => {
  let last = {status: 0, body: "", attempts: 0, error: null};
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {cache: "no-store"});
      const body = await response.text();
      last = {status: response.status, body, attempts: attempt, error: null};
      if (response.status < 500) return last;
    } catch (error) {
      last = {status: 0, body: "", attempts: attempt, error: error instanceof Error ? error.message : String(error)};
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return last;
};

const currentPhase = readJson(currentPhasePath) || {};
const authorityAudit = readJson(authorityAuditPath) || {};
const workspace = readJson(workspacePath) || {};
const quarantine = readJson(quarantineReportPath) || {};
const artifactAuthority = readJson(artifactAuthorityPath) || {};
const playableParagraphContractTest = command(process.execPath, [path.join(root, "scripts/test-packaging-paragraph-playable-render-v1.mjs")]);
const executionStatusResponse = await fetchLocalWithRetry("http://127.0.0.1:4311/api/system-line/execution-status");
const executionStatus = executionStatusResponse.status === 200 && executionStatusResponse.body ? JSON.parse(executionStatusResponse.body)?.status : null;
const staleDownstreamNames = [
  "accepted-shot-ir-v2.json",
  "motion-ir-v2.json",
  "representative-motion-plan-v1.json",
  "representative-motion",
  "representative-motion-render-report-v1.json",
  "representative-motion-critic-v1-latest.json",
  "full-film",
];
const acceptedIrActive = workspace.production?.acceptedShotIr?.status === "compiled-review-only";
const downstreamArtifactsSafe = acceptedIrActive
  ? ["accepted-shot-ir-v2.json", "motion-ir-v2.json"].every((name) => fs.existsSync(path.join(workbenchRoot, name)))
  : quarantine.contract === "A1StaleEditorialArtifactQuarantine/v1"
    && quarantine.status === "QUARANTINED_RECOVERABLE"
    && quarantine.deleted === false
    && quarantine.activeVisualPolicySha256 === workspace.visualBible?.visualGenerationPolicy?.sha256
    && staleDownstreamNames.every((name) => !fs.existsSync(path.join(workbenchRoot, name)));
const ed01 = workspace.library?.assets?.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === "ED-01") || null;
const operationShot = workspace.library?.assets?.find((asset) => asset.route === "shot-composition" && asset.candidates?.some((candidate) => candidate.sceneGraph?.operationTraceBinding)) || null;
const operationCandidateReviewReady = Boolean(operationShot && operationShot.candidates?.length === 3 && operationShot.visualCritic?.verdict === "BLOCK");
const ed01CandidatesReady = Boolean(
  ed01
  && ed01.candidates?.length >= 4
  && ed01.candidates.length <= 8
  && ed01.candidates.every((candidate) => candidate.sceneGraph?.visualPolicy?.sha256 === workspace.visualBible?.visualGenerationPolicy?.sha256)
  && ed01.candidateRender?.contact?.publicUrl
  && ed01.candidateSetAudit?.status === "PASS"
);
const ed01VisualReviewReady = Boolean(
  ed01CandidatesReady
  && ed01.visualCritic?.verdict === "PASS"
  && ed01.visualCritic?.totalScore >= 22
  && ed01.visualCritic?.referenceMaturity === true
  && ed01.visualCritic?.selectedCandidateId
);
const causalMotionProofReady = workspace.production?.motion?.previewArtifact?.contract === "A1CausalMotionProofArtifact/v1"
  && workspace.production.motion.previewArtifact.reviewOnly === true
  && workspace.production.motion.status === "review-only-causal-proof-ready";
const resolveLayoutHandoffReady = workspace.production?.resolveLayoutHandoffs?.["ED-01"]?.contract === "A1ResolveLayoutHandoff/v1"
  && workspace.production.resolveLayoutHandoffs["ED-01"].status === "layout-ready-mask-pending"
  && workspace.production.resolveLayoutHandoffs["ED-01"].reviewOnly === true;
const shotCandidateRoot = path.join(workbenchRoot, "shot-candidates");
const activeShotCandidateDirs = fs.existsSync(shotCandidateRoot)
  ? fs.readdirSync(shotCandidateRoot, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  : [];
const expectedNextActionId = workspace.production?.authority?.nextAction?.id || null;
const canonicalPackageShotIds = (workspace.production?.canonicalCreatorPackagingSequence?.decisions || [])
  .filter((decision) => decision.packageDecision === "PACKAGE")
  .map((decision) => decision.shotId);
const canonicalPackageShotIdKey = canonicalPackageShotIds.join(",");
const calibrationShotIds = workspace.production?.designCalibrationBatch?.items?.map((item) => item.shotId) || [];
const automaticCalibrationEvidenceTracked = workspace.production?.automationPolicy?.contract === "A1FinalReleaseOnlyAutomation/v1"
  && workspace.production?.designCalibrationBatch?.items?.every((item) => item.candidateCount < 1
    || (item.contactSheetPublicUrl && item.contactSheetSha256)
    || item.exceptions?.some((exception) => exception.code === "candidate-render-missing"));
const presentationRendererProofReady = workspace.production?.presentationRendererProof?.contract === "A1PresentationRendererStaticProof/v1"
  && workspace.production.presentationRendererProof.status === "READY_FOR_REVIEW"
  && workspace.production.presentationRendererProof.staticOnly === true
  && workspace.production.presentationRendererProof.generationPerformed === false
  && workspace.production.presentationRendererProof.criticPerformed === false
  && workspace.production.presentationRendererProof.fullFilmRenderPerformed === false
  && workspace.production.presentationRendererProof.shotIds?.join(",") === "ED-01,ED-02,ED-03,ED-10,ED-14,ED-32"
  && workspace.production.presentationRendererProof.rendererExecutorCoverage?.mappedShotCount === workspace.article?.shotCount
  && workspace.production.presentationRendererProof.rendererExecutorCoverage?.totalShotCount === workspace.article?.shotCount
  && workspace.production.presentationRendererProof.rendererExecutorCoverage?.genericFallbackCount === 0
  && workspace.production.presentationRendererProof.contactSheetPublicUrl;
const ed03SourceBlocked = workspace.production?.designCalibrationBatch?.items?.find((item) => item.shotId === "ED-03")?.exceptions?.some((exception) => exception.code === "source-evidence-blocked");
const ed32SourceReady = workspace.production?.designCalibrationBatch?.items?.find((item) => item.shotId === "ED-32")?.sourceOnlyReady === true
  && workspace.production?.designCalibrationBatch?.items?.find((item) => item.shotId === "ED-32")?.renderReady === true;
const packagingPlan = workspace.production?.packagingBeatPlan;
const packagingRuntime = workspace.production?.shotIntelligence;
const persistedTopologyAudit = packagingRuntime?.crossEventTopologyAudit || null;
const recomputedTopologyAudit = persistedTopologyAudit ? auditPackageLookMasterTopologyDiversity(packagingRuntime.packageLookMasterPlans || []) : null;
const topologyAuditBound = persistedTopologyAudit
  ? persistedTopologyAudit.contract === "A1PackageLookMasterCrossEventDiversityAudit/v1"
    // REVIEW_REQUIRED is a valid bound audit for the packaging-only lane:
    // it records cross-event duplicate topology as an advisory follow-up and
    // must not be confused with a visual approval or a layer-production pass.
    && ["PASS", "REVIEW_REQUIRED"].includes(persistedTopologyAudit.status)
    && recomputedTopologyAudit?.status === persistedTopologyAudit.status
    && persistedTopologyAudit.representativeCount === recomputedTopologyAudit.representativeCount
    && persistedTopologyAudit.uniqueTopologyCount === recomputedTopologyAudit.uniqueTopologyCount
    && JSON.stringify(persistedTopologyAudit.duplicateGroups || []) === JSON.stringify(recomputedTopologyAudit.duplicateGroups || [])
  : ["assembly-review-required", "assembly-parity-review-required", "motion-ready", "delivered"].includes(workspace.production?.authority?.currentStage);
const packagingIds = new Set((packagingPlan?.packagingEvents || []).flatMap((event) => event.sourceBeatIds || []));
const packagingEventIds = new Set((packagingPlan?.packagingEvents || []).map((event) => event.eventId));
const packagingAnchorProofReady = ["A1PackagingAnchorStaticProof/v1", "A1ReferenceConditionedPackagingAnchorProof/v1"].includes(workspace.production?.packagingAnchorProof?.contract)
  && workspace.production.packagingAnchorProof.status === "READY_FOR_REVIEW"
  && workspace.production.packagingAnchorProof.staticOnly === true
  && (workspace.production.packagingAnchorProof.contract === "A1ReferenceConditionedPackagingAnchorProof/v1"
    ? workspace.production.packagingAnchorProof.generationPerformed === true
      && workspace.production.packagingAnchorProof.route === "reference-conditioned-imagegen-plus-editable-compositor"
    : workspace.production.packagingAnchorProof.generationPerformed === false)
  && workspace.production.packagingAnchorProof.criticPerformed === false
  && workspace.production.packagingAnchorProof.motionPreviewPerformed === false
  && workspace.production.packagingAnchorProof.fullFilmRenderPerformed === false
  && workspace.production.packagingAnchorProof.samplingContract === "A1PackagingAnchorSampling/v1"
  && workspace.production.packagingAnchorProof.maxAnchors === 3
  && workspace.production.packagingAnchorProof.anchorSampleLimit === 3
  && workspace.production.packagingAnchorProof.eventIds?.length > 0
  && workspace.production.packagingAnchorProof.eventIds?.length <= 3
  && workspace.production.packagingAnchorProof.eventIds.every((eventId) => packagingEventIds.has(eventId))
  && (workspace.production.packagingAnchorProof.comparisonProofPublicUrl || workspace.production.packagingAnchorProof.contactSheetPublicUrl);

const portResult = command("lsof", ["-tiTCP:4311", "-sTCP:LISTEN"]);
const portPids = portResult.status === 0 ? portResult.stdout.trim().split(/\s+/u).filter(Boolean) : [];
const portCwds = portPids.map((pid) => {
  const cwdResult = command("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const cwdLine = cwdResult.stdout.split(/\r?\n/u).find((line) => line.startsWith("n"));
  return {pid, cwd: cwdLine ? cwdLine.slice(1) : null};
});
const rootPrefix = `${root}${path.sep}`;
const portOwned = portCwds.length > 0 && portCwds.every((item) => item.cwd === root || item.cwd?.startsWith(rootPrefix));

let pageStatus = 0;
let pageHtml = "";
let apiStatus = 0;
let apiPayload = null;
let pageFetch = {attempts: 0, error: null};
let apiFetch = {attempts: 0, error: null};
let clientSnapshotStatus = 0;
let clientSnapshotPayload = null;
let clientSnapshotFetch = {attempts: 0, error: null};
try {
  const result = await fetchLocalWithRetry("http://127.0.0.1:4311/system-line-visual-workbench");
  pageFetch = {attempts: result.attempts, error: result.error};
  pageStatus = result.status;
  pageHtml = result.body;
} catch (error) {
  pageFetch = {attempts: 0, error: error instanceof Error ? error.message : String(error)};
}
try {
  const result = await fetchLocalWithRetry("http://127.0.0.1:4311/api/system-line/editorial-asset-workbench?mode=bootstrap");
  apiFetch = {attempts: result.attempts, error: result.error};
  apiStatus = result.status;
  apiPayload = result.body ? JSON.parse(result.body) : null;
} catch (error) {
  apiFetch = {attempts: apiFetch.attempts, error: error instanceof Error ? error.message : String(error)};
  apiPayload = null;
}
try {
  const result = await fetchLocalWithRetry("http://127.0.0.1:4311/api/system-line/editorial-asset-workbench?mode=client");
  clientSnapshotFetch = {attempts: result.attempts, error: result.error};
  clientSnapshotStatus = result.status;
  clientSnapshotPayload = result.body ? JSON.parse(result.body) : null;
} catch (error) {
  clientSnapshotFetch = {attempts: clientSnapshotFetch.attempts, error: error instanceof Error ? error.message : String(error)};
  clientSnapshotPayload = null;
}

check("current-authority-audit-pass", authorityAudit.status === "PASS", {status: authorityAudit.status || null, path: rel(authorityAuditPath)});
check("packaging-paragraph-playable-auto-review-contract-pass", playableParagraphContractTest.status === 0 && /"status": "PASS"/u.test(playableParagraphContractTest.stdout), {exitCode: playableParagraphContractTest.status, stdout: playableParagraphContractTest.stdout.slice(-2000), stderr: playableParagraphContractTest.stderr.slice(-2000)});
check("effective-review-authority-is-current", executionStatus?.effectiveAuthority?.contract === "A1EffectiveReviewAuthority/v1" && executionStatus.status === executionStatus.effectiveAuthority.status && executionStatus.nextAction?.id === executionStatus.effectiveAuthority.nextAction?.id && executionStatus.persistedStatus === currentPhase.status && executionStatus.effectiveAuthority.boundary?.userVisualApproval === "NOT_APPROVED" && executionStatus.effectiveAuthority.boundary?.fullFilmVisualApproval === false && executionStatus.effectiveAuthority.boundary?.motionAllowed === false && executionStatus.effectiveAuthority.boundary?.resolveAllowed === false && executionStatus.effectiveAuthority.boundary?.finalRenderAllowed === false, {httpStatus: executionStatusResponse.status, effectiveStatus: executionStatus?.status || null, persistedStatus: executionStatus?.persistedStatus || null, effectiveNextAction: executionStatus?.nextAction?.id || null, persistedNextAction: expectedNextActionId});
check("current-phase-is-workbench-v2", currentPhase.contract === "A1SystemLineCurrentPhase/v2" && currentPhase.phaseId === "editorial-asset-workbench-v1", {contract: currentPhase.contract || null, phaseId: currentPhase.phaseId || null});
check("workspace-policy-hash-current", currentPhase.authority?.workspaceSha256 === workspace.workspaceSha256 && currentPhase.authority?.policySha256 === workspace.visualBible?.visualGenerationPolicy?.sha256, {phaseWorkspace: currentPhase.authority?.workspaceSha256 || null, workspace: workspace.workspaceSha256 || null, phasePolicy: currentPhase.authority?.policySha256 || null, policy: workspace.visualBible?.visualGenerationPolicy?.sha256 || null});
check("downstream-artifacts-match-current-stage", downstreamArtifactsSafe, {acceptedIrActive, report: rel(quarantineReportPath), movedEntryCount: quarantine.movedEntryCount || 0, movedBytes: quarantine.movedBytes || 0, remaining: staleDownstreamNames.filter((name) => fs.existsSync(path.join(workbenchRoot, name)))});
check("active-artifact-authority-pass-or-automatic-write-transient", artifactAuthority.contract === "A1EditorialWorkbenchArtifactAuthorityAudit/v1" && artifactAuthority.status === "PASS" && (artifactAuthority.workspaceSha256 === workspace.workspaceSha256 || workspace.production?.automationPolicy?.status === "running"), {report: rel(artifactAuthorityPath), status: artifactAuthority.status || null, reportWorkspaceSha256: artifactAuthority.workspaceSha256 || null, workspaceSha256: workspace.workspaceSha256 || null, automation: workspace.production?.automationPolicy?.status || null});
const currentArticleAssetAuthority = workspace.production?.articleAssetProductionAuthority?.current === true
  ? workspace.production.articleAssetProductionAuthority
  : null;
const currentBackgroundAuthorityStatuses = new Set(["BACKGROUND_LIBRARY_EXPANSION_ACTIVE", "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW"]);
const currentBackgroundNextActions = new Set(["GENERATE_NEXT_BACKGROUND_VARIETY_BATCH", "REVIEW_DEFAULT_LIBRARY_BACKGROUND_WAVE"]);
const currentStaticBoardNextActions = new Set(["review-whole-film-static-board", "CONFIRM_WHOLE_FILM_STATIC_BOARD"]);
const calibrationScopeCurrent = currentArticleAssetAuthority
  ? currentBackgroundAuthorityStatuses.has(currentArticleAssetAuthority.status)
    && currentArticleAssetAuthority.compositionGrammar?.contract === "A1EditorialVideoCompositionGrammar/v1"
    && currentArticleAssetAuthority.compositionGrammar?.currentFilm?.shotSchedule?.length === workspace.article?.shotCount
    && currentArticleAssetAuthority.backgroundSupplyPlan?.status === "OPEN_LIBRARY_EXPANSION_ACTIVE"
    && currentArticleAssetAuthority.backgroundSupplyPlan?.countPolicy?.maximumCount === null
    && currentArticleAssetAuthority.backgroundSupplyPlan?.countPolicy?.floorIsProductionCap === false
    && currentArticleAssetAuthority.nextBackgroundVarietyBatchPlan?.batch?.imageGenerationPerformed === false
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
  : workspace.production?.authority?.currentStage === "canonical-title-repair-pending"
  ? calibrationShotIds.length === 6
    && workspace.production?.designCalibrationBatch?.status === "candidates-required"
    && automaticCalibrationEvidenceTracked
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
  : workspace.production?.authority?.currentStage === "whole-film-540p-motion-review"
  ? workspace.production?.shotIntelligence?.approvedMasterRasterSliceMotionCandidate?.status === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW"
    && workspace.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate.completeness?.authorizedTechnicalScope === "PASS"
    && workspace.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate.typography?.canonicalEditableLayerReadyCount === 13
    && workspace.production.shotIntelligence.approvedMasterRasterSliceMotionCandidate.typography?.postApprovalRebuildCount === 0
    && workspace.production?.release?.review540p?.status === "ready-for-review"
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
    : workspace.production?.authority?.currentStage === "article-assets"
  ? workspace.production?.articlePackagingKit?.contract === "A1ArticlePackagingKit/v1"
    && workspace.production.articlePackagingKit.shotAssignments?.length === workspace.article?.shotCount
    && workspace.production.articlePackagingKit.review?.status !== "approved"
    && workspace.gates?.articlePackagingKitApproved === false
    && workspace.gates?.shotCompositionAllowed === false
  : workspace.production?.authority?.currentStage === "visual-treatment"
  ? workspace.production?.visualDirector?.contract === "A1VisualGenerationDirector/v2"
    && !workspace.production.visualDirector.treatmentHash
    && workspace.production.visualDirector.creativeReviews?.gates?.find((gate) => gate.id === "treatment")?.status === "pending"
    && workspace.production.visualDirector.treatmentDirections?.flatMap((direction) => direction.anchorBriefs || []).length === 6
    && workspace.production.visualDirector.limits?.fullBatchLockedUntilAnchorReview === true
  : workspace.production?.authority?.currentStage === "whole-film-static-board-prebuild"
  ? workspace.production?.goldenFilmVisualSystemMaturity?.status === "READY_FOR_STATIC_BOARD_BUILD"
    && workspace.production?.goldenFilmVisualSystemMaturity?.nextAction === "REBUILD_WHOLE_FILM_STATIC_BOARD"
    && workspace.production?.canonicalCreatorPackagingSequence?.decisions?.length === 34
    && workspace.production?.canonicalCreatorPackagingSequence?.decisions?.filter((decision) => decision.packageDecision === "PACKAGE").length === 13
    && workspace.production?.canonicalCreatorPackagingSequence?.decisions?.filter((decision) => decision.packageDecision !== "PACKAGE").length === 21
    && workspace.production?.creatorPaletteShotBindingManifest?.status === "PASS"
    && workspace.production?.incrementalRepairManifestAuthority?.currentRepairStatus === "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_CLOSED"
    && workspace.production?.incrementalRepairManifestAuthority?.readyForGenerationCount === 0
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
    && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.status === "SUPERSEDED_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED"
  : workspace.production?.authority?.currentStage === "whole-film-static-board-review"
  ? currentStaticBoardNextActions.has(workspace.production?.authority?.nextAction?.id)
    && workspace.production?.authority?.nextAction?.requiresUser === true
    && ["WHOLE_FILM_STATIC_BOARD", "GOLDEN_FILM_VISUAL_SYSTEM_MATURITY_V1"].includes(workspace.production?.authority?.nextAction?.reviewGate)
    && JSON.stringify(workspace.production?.authority?.nextAction?.targetShotIds || []) === JSON.stringify([])
    && workspace.production?.canonicalCreatorPackagingSequence?.decisions?.length === 34
    && workspace.production?.canonicalCreatorPackagingSequence?.decisions
      ?.filter((decision) => decision.packageDecision === "PACKAGE")
      .map((decision) => decision.shotId)
      .join(",") === canonicalPackageShotIdKey
    && workspace.production?.canonicalCreatorPackagingSequence?.decisions?.filter((decision) => decision.packageDecision !== "PACKAGE").length === workspace.article.shotCount - canonicalPackageShotIds.length
    && workspace.production?.creatorPaletteShotBindingManifest?.status === "PASS"
    && workspace.production?.creatorPaletteShotBindingManifest?.packageShotCount === canonicalPackageShotIds.length
    && workspace.production?.creatorPaletteShotBindingManifest?.passCount === canonicalPackageShotIds.length
    && workspace.production?.creatorPaletteShotBindingManifest?.blockedShotIds?.length === 0
    && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.status === "PENDING_USER_APPROVAL"
    && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.itemCount === canonicalPackageShotIds.length
    && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.itemCount === 34
    && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.storyboardPixelConsistency?.status === "PASS"
    && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.storyboardPixelConsistency?.blockedShotIds?.length === 0
    && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.candidateAuthorityAudit?.status === "PASS"
    && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.candidateAuthorityAudit?.blockedShotIds?.length === 0
    && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.finalizedShotIds?.length === canonicalPackageShotIds.length
    && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.outputDeduplication?.currentFinalizedShotCount === canonicalPackageShotIds.length
    && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
    && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.layerReconstructionAllowed === false
    && (workspace.production?.shotIntelligence?.currentAssembly || []).length === 0
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
  : workspace.production?.authority?.currentStage === "resolve-timeline-binding"
  ? workspace.production?.authority?.nextAction?.id === "OPEN_RESOLVE_AND_BIND_TIMELINE"
    && workspace.production?.authority?.nextAction?.requiresUser === true
    && workspace.production?.authority?.nextAction?.reviewGate === "LIVE_RESOLVE_TIMELINE_REQUIRED"
    && workspace.production?.canonicalPackageExport?.contract === "A1CanonicalPackageExportRecord/v1"
    && workspace.production?.canonicalPackageExport?.status === "EXPORTED"
    && workspace.production?.canonicalPackageExport?.current === true
    && workspace.production?.canonicalPackageExport?.outputCount === 13
    && workspace.production?.canonicalPackageExport?.overlayCount === 6
    && workspace.production?.canonicalPackageExport?.fullscreenCount === 7
    && workspace.production?.canonicalPackageExport?.resolveHandoff?.status === "UNBOUND_TIMELINE_PLAN"
    && workspace.production?.canonicalPackageExport?.packageExportAuthorized === true
    && workspace.production?.canonicalPackageExport?.resolveInsertAuthorized === false
    && workspace.production?.canonicalPackageExport?.productionWired === false
    && workspace.production?.canonicalPackageExport?.finalFilm === false
    && workspace.production?.canonicalPackageExport?.containsBaseFootage === false
    && workspace.production?.canonicalPackageExport?.containsPresenterPixels === false
    && workspace.production?.canonicalPackageExport?.containsAudio === false
    && workspace.production?.canonicalPackageExport?.containsCaptions === false
    && workspace.production?.packagingAuthorization?.receipts?.PACKAGE_EXPORT?.status === "CONSUMED"
    && workspace.production?.packagingAuthorization?.receipts?.PACKAGE_EXPORT?.receiptSha256 === workspace.production?.canonicalPackageExport?.authorizationReceiptSha256
    && workspace.production?.staticPackageReview?.status === "SYSTEM_VISUAL_APPROVED_DELEGATED"
    && workspace.production?.staticPackageReview?.current === true
    && workspace.production?.packagingDeliverySourceProjection?.productionReadyShotCount === 13
    && workspace.production?.formalPackagingTypographyAdmission?.actualPixelCoverage?.coveredNodeCount === 28
    && workspace.production?.mediaEntrypointRegistry?.activeProductionWriterCount === 1
    && workspace.production?.assembly?.status === "NOT_CREATED"
    && workspace.production?.assembly?.productionWired === false
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
  : workspace.production?.authority?.currentStage === "package-export-authorization"
  ? workspace.production?.authority?.nextAction?.id === "AUTHORIZE_PACKAGE_EXPORT"
    && workspace.production?.authority?.nextAction?.requiresUser === true
    && workspace.production?.packagingAuthorization?.receipts?.PACKAGE_EXPORT == null
    && workspace.production?.staticPackageReview?.status === "SYSTEM_VISUAL_APPROVED_DELEGATED"
    && workspace.production?.staticPackageReview?.current === true
    && workspace.production?.packagingDeliverySourceProjection?.productionReadyShotCount === 13
    && workspace.production?.formalPackagingTypographyAdmission?.actualPixelCoverage?.coveredNodeCount === 28
    && workspace.production?.mediaEntrypointRegistry?.activeProductionWriterCount === 1
    && workspace.production?.resolvePackagingHandoffPlan?.events?.filter((event) => event.route !== "NO_PACKAGE").length === 13
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
  : workspace.production?.authority?.currentStage === "package-static-asset-proof-authorization"
  ? workspace.production?.authority?.nextAction?.id === "AUTHORIZE_PACKAGE_STATIC_REVIEW"
    && workspace.production?.authority?.nextAction?.requiresUser === true
    && workspace.production?.packagingAuthorization?.receipts?.STATIC_REVIEW == null
    && ((workspace.production?.staticPackageReview?.status === "REVIEW_ONLY_REJECTED_V2"
      && workspace.production?.staticPackageReview?.successor === "STATIC_PACKAGE_REVIEW_V3_NOT_RENDERED")
      || (workspace.production?.staticPackageReview?.status === "REVIEW_ONLY_REVISE_OVERLAY"
        && workspace.production?.staticPackageReview?.successor === "STATIC_PACKAGE_REVIEW_V4_NOT_RENDERED"
        && JSON.stringify(workspace.production?.staticPackageReview?.overlayRevisionShotIds || []) === JSON.stringify(["ED-08", "ED-09", "ED-13", "ED-34"]))
      || (workspace.production?.staticPackageReview?.status === "REVIEW_ONLY_REVISE_OVERLAY_ACCESSORY"
        && workspace.production?.staticPackageReview?.successor === "STATIC_PACKAGE_REVIEW_V5_NOT_RENDERED"
        && JSON.stringify(workspace.production?.staticPackageReview?.overlayRevisionShotIds || []) === JSON.stringify(["ED-08", "ED-09", "ED-13", "ED-34"])))
      || (workspace.production?.staticPackageReview?.status === "REVIEW_ONLY_REVISE_OVERLAY_SOURCE_ROI_RESIDUE"
        && workspace.production?.staticPackageReview?.successor === "STATIC_PACKAGE_REVIEW_V6_NOT_RENDERED"
        && JSON.stringify(workspace.production?.staticPackageReview?.overlayRevisionShotIds || []) === JSON.stringify(["ED-08", "ED-09", "ED-13", "ED-34"]))
      || (workspace.production?.staticPackageReview?.status === "REVIEW_ONLY_RENDER_BLOCKED_ALPHA_COMPONENT_GATE"
        && workspace.production?.staticPackageReview?.successor === "STATIC_PACKAGE_REVIEW_V7_NOT_RENDERED")
    && workspace.production?.resolvePackagingHandoffPlan?.events?.filter((event) => event.route !== "NO_PACKAGE").length === 13
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
  : [
    "creator-packaging-palette-review",
    "creator-packaging-palette-blocked-missing-lane-c",
    "creator-packaging-palette-blocked-lane-c-target-unresolved",
    "creator-packaging-palette-binding-blocked",
    "creator-packaging-palette-binding-repair-required",
    "creator-packaging-palette-approved-preflight-required",
  ].includes(workspace.production?.authority?.currentStage)
  ? workspace.production?.canonicalCreatorPackagingSequence?.contract === "A1CanonicalCreatorPackagingSequence/v1"
    && [
      "CREATOR_PACKAGING_PALETTE_REVIEW",
      "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_MISSING_LANE_C",
      "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_LANE_C_TARGET_UNRESOLVED",
      "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED",
      "CREATOR_PACKAGING_PALETTE_BOUND_REPAIR_REQUIRED",
      "CREATOR_PACKAGING_PALETTE_APPROVED_PREFLIGHT_REQUIRED",
      "CREATOR_PACKAGING_PALETTE_SYSTEM_APPROVED_PREFLIGHT_REQUIRED",
      "SYSTEM_APPROVED_CREATOR_PACKAGING_PALETTE",
    ].includes(workspace.production?.creatorPackagingPaletteRegistry?.status)
    && workspace.production?.creatorPaletteShotBindingManifest?.contract === "A1CreatorPaletteShotBindingManifest/v1"
    && workspace.production?.creatorPaletteShotBindingManifest?.status === "BLOCKED"
    && workspace.production?.creatorPackagingPaletteRegistry?.current !== false
    && workspace.production?.generation?.summary?.queued === 0
    && workspace.production?.generation?.summary?.running === 0
    && workspace.production?.generation?.workerStatus === "frozen"
  : ["anchor-suite", "design-calibration"].includes(workspace.production?.authority?.currentStage)
  ? calibrationShotIds.length === 6
    && workspace.production.designCalibrationBatch.items.filter((item) => item.renderReady).every((item) => activeShotCandidateDirs.includes(item.shotId))
    && (workspace.production.designCalibrationBatch?.contactSheet?.publicUrl || automaticCalibrationEvidenceTracked)
  : workspace.production?.authority?.currentStage === "visual-repair-required"
    ? workspace.production?.maturityLoop?.legacyAdvisoryOnly === true
      && workspace.production?.maturityLoop?.currentStage === "visual-repair-required"
      && workspace.production?.maturityLoop?.nextAction === expectedNextActionId
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
      && workspace.production?.generation?.workerStatus === "frozen"
  : ["film-look-master-semantic-review-required", "semantic-pilot", "semantic-pilot-review", "semantic-pilot-review-required"].includes(workspace.production?.authority?.currentStage)
    ? String(packagingRuntime?.status || "").startsWith("SEMANTIC_PILOT")
      && packagingRuntime?.semanticPilot?.targetShotIds?.length === 3
      && packagingRuntime?.semanticPilot?.skippedShot?.shotId === "ED-23"
      && packagingRuntime?.semanticPilot?.skippedShot?.route === "SCREEN_EVIDENCE"
      && packagingRuntime?.semanticPilot?.recommendation == null
      && packagingRuntime?.semanticPilot?.selected == null
      && (packagingRuntime?.semanticPilot?.currentAssembly || []).length === 0
      && workspace.production?.generation?.summary?.running <= 2
      && workspace.production?.generation?.summary?.queued <= 3
  : ["film-generation-inputs-partial", "film-visual-production"].includes(workspace.production?.authority?.currentStage)
    ? packagingPlan?.contract === "A1PackagingBeatPlan/v1"
      && packagingPlan.semanticBeatCount === workspace.article?.shotCount
      && packagingPlan.packagingEventCount === 12
      && packagingPlan.noPackageMajority === true
      && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
      && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.nextUserGate === "WHOLE_FILM_STATIC_BOARD"
      && workspace.production?.shotIntelligence?.packageLookMasterPlans?.length === 12
      && workspace.production?.shotIntelligence?.packageAssetKitPlans?.every((plan) => plan.current === false && plan.authorityScope === "HISTORY_READ_ONLY")
      && workspace.production?.packagingStyleBriefAudit?.status === "PASS"
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
      && workspace.production?.packagingAutomation?.status === "GENERATION_INPUTS_PARTIAL"
      && workspace.production?.packagingAutomation?.legacyGlobalPolicyStatus === "HISTORY_READ_ONLY"
      && topologyAuditBound
  : ["film-look-master-semantic-reconciliation-required", "film-look-master-exception-repair-required"].includes(workspace.production?.authority?.currentStage)
    ? packagingPlan?.contract === "A1PackagingBeatPlan/v1"
      && packagingPlan.semanticBeatCount === workspace.article?.shotCount
      && packagingPlan.packagingEventCount === workspace.production?.shotIntelligence?.decisionSet?.summary?.packageCount
      && packagingPlan.noPackageMajority === true
      && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
      && (workspace.production?.authority?.currentStage === "film-look-master-semantic-reconciliation-required"
        ? workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === true
          && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.nextUserGate === null
        : workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === false
          && (workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.exceptions || []).length > 0
          && JSON.stringify([...(workspace.production?.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify([...(workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.exceptions || []).map((item) => item.shotId)].sort())
          && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.nextUserGate === "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED")
      && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
      && workspace.production?.shotIntelligence?.packageAssetKitPlans?.length > 0
      && workspace.production?.shotIntelligence?.packageAssetKitPlans?.every((plan) => plan.current === false && plan.authorityScope === "HISTORY_READ_ONLY")
      && workspace.production?.shotIntelligence?.packageLookMasterPlans?.length === packagingPlan.packagingEventCount
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
      && topologyAuditBound
  : workspace.production?.authority?.currentStage === "film-look-master-auto-selection"
    ? packagingPlan?.contract === "A1PackagingBeatPlan/v1"
      && packagingPlan.semanticBeatCount === workspace.article?.shotCount
      && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.status === "PARTIAL_WITH_EXCEPTIONS"
      && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.nextUserGate === "WHOLE_FILM_STATIC_BOARD"
      // Layer kits are deliberately history-only until the whole-film static
      // board is approved. The current lane is represented by look-master
      // plans, not by a fabricated 12-shot layer-kit set.
      && workspace.production?.shotIntelligence?.packageAssetKitPlans?.length > 0
      && workspace.production?.shotIntelligence?.packageAssetKitPlans?.every((plan) => plan.current === false && plan.authorityScope === "HISTORY_READ_ONLY")
      && workspace.production?.shotIntelligence?.packageLookMasterPlans?.length === 12
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
      && topologyAuditBound
  : ["canonical-title-repair-pending", "canonical-title-repair-generating"].includes(workspace.production?.authority?.currentStage)
    ? workspace.production?.shotIntelligence?.canonicalDirectorAuthority?.status === "PASS"
      && workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.authoritySha256 === workspace.production?.shotIntelligence?.canonicalDirectorAuthority?.authoritySha256
      && JSON.stringify(workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest.targetRepairShotIds || []) === JSON.stringify(["ED-07", "ED-08", "ED-13", "ED-19"])
      && JSON.stringify(workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest.generationEligibleShotIds || []) === JSON.stringify(["ED-07", "ED-08", "ED-13", "ED-19"])
      && workspace.production?.shotIntelligence?.packageLookMasterPlans?.length === workspace.production?.shotIntelligence?.decisionSet?.summary?.packageCount
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
      && workspace.production?.shotIntelligence?.currentAssembly?.length === 0
      && workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.boardRebuilt === false
      && topologyAuditBound
  : ["look-master-plans-ready", "look-master-candidates-ready", "look-master-review-required", "layer-reconstruction-ready", "layer-reconstruction-in-progress", "assembly-parity-review-required", "assembly-review-required", "motion-ready"].includes(workspace.production?.authority?.currentStage)
    ? packagingPlan?.contract === "A1PackagingBeatPlan/v1"
      && packagingPlan.semanticBeatCount === workspace.article?.shotCount
      && packagingPlan.packagingEventCount < packagingPlan.semanticBeatCount
      && packagingPlan.noPackageMajority === true
      && workspace.production?.shotIntelligence?.packageAssetKitPlans?.length === packagingPlan.packagingEventCount
      && workspace.production?.shotIntelligence?.packageLookMasterPlans?.length === packagingPlan.packagingEventCount
      && workspace.production?.packagingStyleBriefAudit?.status === "PASS"
      && workspace.production?.packagingStyleBriefAudit?.briefCount === packagingPlan.packagingEventCount
      && workspace.gates?.packagingDeliveryGates?.blockers?.length === 0
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
      && topologyAuditBound
    : ["packaging-map-review", "packaging-anchor-review", "packaging-production-ready"].includes(workspace.production?.authority?.currentStage)
    ? packagingPlan?.contract === "A1PackagingBeatPlan/v1"
      && packagingPlan.semanticBeatCount === workspace.article?.shotCount
      && packagingPlan.packagingEventCount < packagingPlan.semanticBeatCount
      && packagingPlan.noPackageMajority === true
      && packagingIds.size === workspace.production?.designCalibrationBatch?.items?.length
      && workspace.production?.designCalibrationBatch?.items?.every((item) => packagingIds.has(item.shotId))
      && packagingAnchorProofReady
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
    : workspace.production?.authority?.currentStage === "presentation-renderer-review"
    ? calibrationShotIds.length === 6
      && presentationRendererProofReady
      && ed03SourceBlocked
      && ed32SourceReady
      && workspace.production?.automationPolicy?.intermediateUserApprovalRequired === false
      && workspace.production?.automationPolicy?.calibrationUserApprovalRequired === false
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
    : workspace.production?.authority?.currentStage === "full-film-review"
    ? calibrationShotIds.length === 6
      && workspace.production?.automationPolicy?.intermediateUserApprovalRequired === false
      // The unattended renderer writes the release status to `rendering`
      // before the MP4 exists and advances it to `ready-for-review` only
      // after completion. Both are valid transient states for this stage;
      // treating `rendering` as stale incorrectly fails the closed-loop audit
      // while the current production job is actively making the review film.
      && ["rendering", "ready-for-review"].includes(workspace.production?.release?.review540p?.status)
      && workspace.library?.assets?.filter((asset) => asset.route === "shot-composition" && asset.review?.status === "approved" && asset.selectedCandidateId).length === workspace.article?.shotCount
    : ["shot-candidates", "accepted-shot-ir", "representative-motion", "representative-motion-objective-pass-awaiting-user-visual-review"].includes(workspace.production?.authority?.currentStage)
      ? calibrationShotIds.length === 6
        && workspace.production?.automationPolicy?.intermediateUserApprovalRequired === false
        && automaticCalibrationEvidenceTracked
    : calibrationShotIds.length === 6 && workspace.production?.designCalibrationBatch?.status === "approved";
check("calibration-scope-is-current-for-production-stage", calibrationScopeCurrent, {authorityStage: workspace.production?.authority?.currentStage || null, calibrationStatus: workspace.production?.designCalibrationBatch?.status || null, calibrationShotIds, activeShotCandidateDirs, contactSheet: workspace.production?.designCalibrationBatch?.contactSheet?.publicUrl || null, automaticCalibrationEvidenceTracked});
const packagingReview = workspace.production?.packagingReview;
const packagingApprovalFlagsConsistent = ["LOOK_MASTER_REVIEW_REQUIRED", "ASSEMBLY_REVIEW_REQUIRED"].includes(packagingReview?.status)
  ? packagingReview.intermediateApprovalRequired === false && packagingReview.requiresExplicitApproval === true
  : packagingReview?.intermediateApprovalRequired === false && packagingReview?.requiresExplicitApproval === false;
check("automatic-gates-do-not-bypass-final-release", (workspace.production?.packagingBoundary?.contract === "A1EditorialPackagingBoundary/v1"
  ? packagingApprovalFlagsConsistent && packagingReview?.finalReleaseApprovalRequired === true
  : workspace.production?.automationPolicy?.intermediateUserApprovalRequired === false)
  && workspace.production?.automationPolicy?.calibrationUserApprovalRequired === false
  && workspace.production?.automationPolicy?.finalReleaseApprovalRequired === true
  && workspace.gates?.finalRenderAllowed === (workspace.production?.release?.review540p?.status === "approved")
  && currentPhase.reviewDecision?.acceptedShotIrAllowed === (workspace.gates?.acceptedShotIrAllowed === true)
  && currentPhase.reviewDecision?.motionPrototypeAllowed === (workspace.gates?.motionPrototypeAllowed === true)
  && currentPhase.reviewDecision?.finalRenderAllowed === (workspace.gates?.finalRenderAllowed === true), {gates: workspace.gates || null, phaseReview: currentPhase.reviewDecision || null, review540p: workspace.production?.release?.review540p?.status || null});
check("next-action-is-current-review-target", currentPhase.next?.recommended?.id === expectedNextActionId && currentPhase.authority?.productionAuthoritySha256 === workspace.production?.authority?.sha256 && workspace.production?.maturityLoop?.legacyAdvisoryOnly === true && workspace.production?.maturityLoop?.currentStage === workspace.production?.authority?.currentStage && workspace.production?.maturityLoop?.nextAction === expectedNextActionId, {expectedNextActionId, authorityStage: workspace.production?.authority?.currentStage || null, phase: currentPhase.next?.recommended || null, workspace: workspace.production?.maturityLoop?.nextAction || null});
check("package-look-master-topology-audit-bound", topologyAuditBound, {
  persisted: Boolean(persistedTopologyAudit),
  status: persistedTopologyAudit?.status || "HISTORY_READ_ONLY_LEGACY_RUNTIME",
  representativeCount: persistedTopologyAudit?.representativeCount || recomputedTopologyAudit?.representativeCount || 0,
  uniqueTopologyCount: persistedTopologyAudit?.uniqueTopologyCount || recomputedTopologyAudit?.uniqueTopologyCount || 0,
});
check("4311-owned-by-system-line-worktree", portOwned, {pids: portCwds});
check("http-workbench-200", pageStatus === 200, {status: pageStatus, ...pageFetch});
const liveWorkspace = apiPayload?.workspace || workspace;
const clientSnapshotText = clientSnapshotPayload ? JSON.stringify(clientSnapshotPayload) : "";
const automaticWriterActive = workspace.production?.automationPolicy?.status === "running";
const liveArticleAssetAuthority = liveWorkspace.production?.articleAssetProductionAuthority;
const currentArticleAssetSurfaceActive = liveArticleAssetAuthority?.current === true
  && currentBackgroundAuthorityStatuses.has(liveArticleAssetAuthority.status);
const consolidatedArticleQaSurfaceActive = (liveWorkspace.production?.authority?.currentStage === "article-assets"
  || liveWorkspace.production?.packagingLifecycleProjection?.authorityStage === "article-assets")
  && (liveWorkspace.production?.authority?.nextAction?.id === "automatic-article-packaging-qa"
    || liveWorkspace.production?.packagingLifecycleProjection?.nextActionId === "automatic-article-packaging-qa");
const semanticPilotSurfaceActive = String(liveWorkspace.production?.shotIntelligence?.status || "").startsWith("SEMANTIC_PILOT");
const currentStaticBoardSurfaceActive = liveWorkspace.production?.packagingLifecycleProjection?.status === "WHOLE_FILM_STATIC_BOARD_READY";
const currentMotionReviewSurfaceActive = liveWorkspace.production?.packagingLifecycleProjection?.status === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW";
const canonicalTitleRepairSurfaceActive = ["CANONICAL_TITLE_REPAIR_PENDING", "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED", "CANONICAL_TITLE_REPAIR_GENERATING"].includes(liveWorkspace.production?.packagingLifecycleProjection?.status);
const paletteBindingSurfaceActive = liveWorkspace.production?.packagingLifecycleProjection?.status === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED"
  || liveWorkspace.production?.authority?.currentStage === "creator-packaging-palette-binding-repair-required";
const liveStoryboardProjection = liveWorkspace.production?.storyboardProductionProjection;
const tasteBoundStoryboardSurfaceActive = liveWorkspace.status === "PACKAGING_LANE_VISUAL_REPAIR_REQUIRED"
  && ["AUTHORIZE_TASTE_BOUND_BOUNDED_CANARY", "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY"].includes(liveWorkspace.production?.authority?.nextAction?.id)
  && liveStoryboardProjection?.contract === "A1StoryboardProductionProjection/v1"
  && liveStoryboardProjection.status === "TASTE_BOUND_LEGACY_PIXELS_REJECTED";
const workbenchPolicyMarkersPresent = currentStaticBoardSurfaceActive
  ? liveWorkspace.contract === "A1EditorialAssetWorkbench/v2"
    && (pageHtml + clientSnapshotText).includes('data-a1-editorial-asset-workbench="loading"')
    && clientSnapshotStatus === 200
    && liveWorkspace.production?.authority?.currentStage === "whole-film-static-board-review"
    && currentStaticBoardNextActions.has(liveWorkspace.production?.authority?.nextAction?.id)
    && liveWorkspace.production?.shotIntelligence?.wholeFilmStaticBoard?.status === "PENDING_USER_APPROVAL"
    && liveWorkspace.production?.shotIntelligence?.wholeFilmStaticBoard?.itemCount === canonicalPackageShotIds.length
    && liveWorkspace.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.itemCount === 34
    && liveWorkspace.production?.shotIntelligence?.wholeFilmStaticBoard?.storyboardPixelConsistency?.status === "PASS"
    && liveWorkspace.production?.shotIntelligence?.wholeFilmStaticBoard?.storyboardPixelConsistency?.blockedShotIds?.length === 0
    && liveWorkspace.production?.packagingLifecycleProjection?.blockers?.length === 0
    && liveWorkspace.production?.packagingLifecycleProjection?.approvalAllowed === true
    && liveWorkspace.production?.packagingLifecycleProjection?.reviewActionDisabled === false
    && liveWorkspace.production?.packagingLifecycleProjection?.requiresExplicitApproval === true
    && (pageHtml + clientSnapshotText).includes(liveWorkspace.production.shotIntelligence.wholeFilmStaticBoard.publicUrl)
    && (pageHtml + clientSnapshotText).includes(liveWorkspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.publicUrl)
  : currentMotionReviewSurfaceActive
  ? liveWorkspace.production?.shotIntelligence?.approvedMasterRasterSliceMotionCandidate?.typography?.canonicalEditableLayerReadyCount === 13
    && liveWorkspace.production?.shotIntelligence?.approvedMasterRasterSliceMotionCandidate?.completeness?.authorizedTechnicalScope === "PASS"
    && (pageHtml + clientSnapshotText).includes("WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW")
    && (pageHtml + clientSnapshotText).includes("whole-film-candidate-960x540.mp4")
  : paletteBindingSurfaceActive
  ? liveWorkspace.contract === "A1EditorialAssetWorkbench/v2"
    && clientSnapshotStatus === 200
    && (pageHtml + clientSnapshotText).includes("creator-packaging-palette-binding-repair-required")
    && (pageHtml + clientSnapshotText).includes("compile-creator-packaging-palette-bound-repair")
    && (pageHtml + clientSnapshotText).includes("CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED")
    && (pageHtml + clientSnapshotText).includes("pinterest-retro-pixel-v1")
    && (pageHtml + clientSnapshotText).includes(liveWorkspace.workspaceSha256 || "__missing-workspace-sha__")
    && executionStatus?.queue?.queued === 0
    && executionStatus?.queue?.running === 0
    && executionStatus?.queue?.workerStatus === "frozen"
    && liveWorkspace.production?.packagingLifecycleProjection?.reviewActionDisabled === true
  : canonicalTitleRepairSurfaceActive
  ? liveWorkspace.contract === "A1EditorialAssetWorkbench/v2"
    && (pageHtml + clientSnapshotText).includes('data-a1-editorial-asset-workbench="loading"')
    && (pageHtml + clientSnapshotText).includes("dispatch-canonical-title-repair")
    && (pageHtml + clientSnapshotText).includes("EVA_MECHANISM_CJK")
    && (pageHtml + clientSnapshotText).includes("标题视觉返修")
    && workspace.production?.generation?.automaticDispatchAllowed === false
    && workspace.production?.generation?.workerStatus === "frozen"
  : consolidatedArticleQaSurfaceActive
  ? liveWorkspace.contract === "A1EditorialAssetWorkbench/v2"
    && clientSnapshotStatus === 200
    && clientSnapshotText.includes('"currentStage":"article-assets"')
    && clientSnapshotText.includes('"id":"automatic-article-packaging-qa"')
    && clientSnapshotText.includes("A1EditorialAssetWorkbench/v2")
    && liveWorkspace.production?.packagingLifecycleProjection?.status === "ACTIVE_REVIEW_GATED"
    && liveWorkspace.production?.packagingLifecycleProjection?.authorityStage === "article-assets"
    && liveWorkspace.production?.packagingLifecycleProjection?.nextActionId === "automatic-article-packaging-qa"
    && liveWorkspace.production?.packagingLifecycleProjection?.reviewActionDisabled === true
    && liveWorkspace.production?.assembly?.status !== "APPROVED"
  : currentArticleAssetSurfaceActive
  ? liveWorkspace.contract === "A1EditorialAssetWorkbench/v2"
    && (pageHtml + clientSnapshotText).includes('data-a1-editorial-asset-workbench="loading"')
    && liveArticleAssetAuthority.compositionGrammar?.referenceBoundary?.purpose === "VIDEO_CONSTRUCTION_AND_PACKAGING_SCHEDULING_ONLY"
    && liveArticleAssetAuthority.compositionGrammar?.referenceBoundary?.aestheticReferenceAllowed === false
    && liveArticleAssetAuthority.compositionGrammar?.referenceBoundary?.currentStyleAuthority === "pinterest-retro-pixel-v1"
    && liveArticleAssetAuthority.compositionGrammar?.currentFilm?.shotSchedule?.length === 34
    && liveArticleAssetAuthority.backgroundSupplyPlan?.countPolicy?.maximumCount === null
    && liveArticleAssetAuthority.backgroundSupplyPlan?.countPolicy?.floorIsProductionCap === false
    && liveArticleAssetAuthority.nextBackgroundVarietyBatchPlan?.structureReferenceUse === "STRUCTURE_ONLY_NOT_AESTHETICS"
    && liveArticleAssetAuthority.nextBackgroundVarietyBatchPlan?.batch?.imageGenerationPerformed === false
    && currentBackgroundNextActions.has(liveArticleAssetAuthority.authorization?.nextAction)
  : semanticPilotSurfaceActive
  ? (pageHtml + clientSnapshotText).includes('data-a1-packaging-user-surface="true"')
    && (pageHtml + clientSnapshotText).includes('data-a1-semantic-review="true"')
    && ((pageHtml + clientSnapshotText).includes("旧探索图不代表文章包装方案") || (pageHtml + clientSnapshotText).includes("画风更简洁了，但语义还没过关") || (pageHtml + clientSnapshotText).includes("参考图定义审美，不锁定画风") || (pageHtml + clientSnapshotText).includes("三种实际画法") || (pageHtml + clientSnapshotText).includes("3 张实际小样已生成"))
    && ((pageHtml + clientSnapshotText).includes("通过后系统自动扩展，不逐镜让你确认") || (pageHtml + clientSnapshotText).includes("系统没有扩展全片") || (pageHtml + clientSnapshotText).includes("尚未重新生成") || (pageHtml + clientSnapshotText).includes("不会自动扩全片"))
  : workspace.production?.authority?.currentStage === "canonical-title-repair-pending"
    ? calibrationShotIds.length === 6
      && workspace.production?.designCalibrationBatch?.status === "candidates-required"
      && automaticCalibrationEvidenceTracked
      && workspace.production?.generation?.summary?.queued === 0
      && workspace.production?.generation?.summary?.running === 0
      && workspace.production?.generation?.workerStatus === "frozen"
  : tasteBoundStoryboardSurfaceActive
    ? liveWorkspace.contract === "A1EditorialAssetWorkbench/v2"
      && (pageHtml + clientSnapshotText).includes('data-a1-editorial-asset-workbench="loading"')
      && liveStoryboardProjection.counts?.package > 0
      && liveStoryboardProjection.counts?.tasteBound === liveStoryboardProjection.counts?.package
      && liveStoryboardProjection.counts?.tasteUnbound === 0
      && liveStoryboardProjection.counts?.temporalPlanPass === liveStoryboardProjection.counts?.package
      && liveStoryboardProjection.counts?.temporalUnbound === 0
      && liveStoryboardProjection.sourceAuthority?.tasteProfileId === "a1-retro-digital-editorial-taste-v2"
      && Boolean(liveStoryboardProjection.sourceAuthority?.tasteAuthoritySha256)
      && Boolean(liveStoryboardProjection.sourceAuthority?.temporalReadabilityAuthoritySha256)
      && liveStoryboardProjection.gate?.generationFrozen === true
      && liveStoryboardProjection.gate?.imageGenerationAllowed === false
      && liveStoryboardProjection.gate?.automaticDispatchAllowed === false
      && liveStoryboardProjection.gate?.userVisualApproval === "NOT_APPROVED"
      && liveStoryboardProjection.gate?.machinePassCannotApprove === true
      && liveStoryboardProjection.gate?.motionAllowed === false
      && liveStoryboardProjection.gate?.finalRenderAllowed === false
    : liveWorkspace.contract === "A1EditorialAssetWorkbench/v2"
    && (pageHtml + clientSnapshotText).includes("A1EditorialAssetWorkbench/v2")
    && (pageHtml + clientSnapshotText).includes("A1ProductionAuthority/v1")
    && (pageHtml + clientSnapshotText).includes(liveWorkspace.production?.authority?.currentStage || "__missing-stage__")
    && (pageHtml + clientSnapshotText).includes(liveWorkspace.production?.authority?.nextAction?.id || "__missing-next-action__")
    && (pageHtml + clientSnapshotText).includes("pinterest-retro-pixel-v1")
    && (pageHtml + clientSnapshotText).includes(liveWorkspace.workspaceSha256 || "__missing-workspace-sha__")
    && (pageHtml + clientSnapshotText).includes("WHOLE_FILM_STATIC_BOARD");
check("http-workbench-policy-markers", workbenchPolicyMarkersPresent, {status: pageStatus, clientSnapshotStatus, workspaceSha256: liveWorkspace.workspaceSha256 || null, authority: liveWorkspace.production?.authority?.sha256 || null, automaticWriterActive, currentStaticBoardSurfaceActive, currentMotionReviewSurfaceActive, currentArticleAssetSurfaceActive, semanticPilotSurfaceActive, tasteBoundStoryboardSurfaceActive, paletteBindingSurfaceActive});
check("http-client-snapshot-200", clientSnapshotStatus === 200 && clientSnapshotPayload?.ok === true && clientSnapshotPayload?.mode === "client" && clientSnapshotPayload?.workspace?.contract === workspace.contract, {status: clientSnapshotStatus, ...clientSnapshotFetch});
check("http-api-current-workspace", apiStatus === 200 && apiPayload?.ok === true && apiPayload?.workspace?.contract === workspace.contract && Boolean(apiPayload?.workspace?.workspaceSha256) && (apiPayload.workspace.workspaceSha256 === workspace.workspaceSha256 || automaticWriterActive), {status: apiStatus, ...apiFetch, apiWorkspaceSha256: apiPayload?.workspace?.workspaceSha256 || null, fileWorkspaceSha256: workspace.workspaceSha256 || null, automaticWriterActive});
check("public-authority-report-exists", sha256(path.join(publicRoot, "system-line-current-authority-v2/report.json")) !== null && sha256(path.join(publicRoot, "system-line-current-authority-v2/audit-report.json")) !== null, {report: rel(path.join(publicRoot, "system-line-current-authority-v2/report.json")), audit: rel(path.join(publicRoot, "system-line-current-authority-v2/audit-report.json"))});

const failures = checks.filter((item) => item.status === "FAIL");
const report = {
  contract: "A1SystemLineWorkbenchClosedLoop/v2",
  status: failures.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  authorityPhaseId: currentPhase.phaseId || null,
  workspaceSha256: workspace.workspaceSha256 || null,
  policySha256: workspace.visualBible?.visualGenerationPolicy?.sha256 || null,
  currentStage: workspace.production?.authority?.currentStage || null,
  productionMaturity: workspace.production?.release?.maturityStatus || "NOT_MATURE",
  effectiveAuthority: executionStatus ? {
    status: executionStatus.status,
    nextAction: executionStatus.nextAction,
    authoritySha256: executionStatus.effectiveAuthority?.authoritySha256 || null,
  } : null,
  persistedAuthority: {
    status: currentPhase.status || null,
    nextAction: expectedNextActionId,
  },
  checks,
  failures: failures.map((item) => item.id),
  nextAction: failures.length ? "repair-workbench-closed-loop" : executionStatus?.nextAction?.id || expectedNextActionId,
};
fs.mkdirSync(reportArtifactRoot, {recursive: true});
fs.mkdirSync(reportPublicRoot, {recursive: true});
fs.writeFileSync(path.join(reportArtifactRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(reportPublicRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, failures: report.failures, reportPath: rel(path.join(reportArtifactRoot, "report.json")), nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 1;
