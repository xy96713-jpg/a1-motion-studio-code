#!/usr/bin/env node

import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {buildCanonicalStaticBoardScope} from "../apps/studio-next/src/lib/a1-canonical-static-board-authority-v1.mjs";
import {assertEffectiveReviewAuthority} from "../apps/studio-next/src/lib/a1-effective-review-authority-v1.mjs";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {assertArticleAssetProductionAuthority, assertBackgroundLaneRequestPack} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {assertProjectWriterLease} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const writeReport = process.argv.includes("--write");
if (writeReport) assertProjectWriterLease(appRoot);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line");
const reportArtifactRoot = path.join(artifactRoot, "system-line-current-authority-v2");
const reportPublicRoot = path.join(publicRoot, "system-line-current-authority-v2");
const currentPhasePath = path.join(artifactRoot, "current-phase.json");
const workspacePublicPath = path.join(publicRoot, "editorial-asset-workbench-v1/workspace.json");
const workspaceArtifactPath = path.join(artifactRoot, "editorial-asset-workbench-v1/workspace.json");
const authorityPublicPath = path.join(reportPublicRoot, "report.json");
const pageSourcePath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx");
const presentationPanelSourcePath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PresentationSystemPanel.tsx");
const redirectSourcePath = path.join(root, "apps/studio-next/src/app/system-line-review/VisualDirectorStudioRedirect.tsx");
const agentRulesPath = path.join(root, "AGENTS.md");
const staticBoardRoot = path.join(publicRoot, "editorial-asset-workbench-v1/whole-film-static-board-v1");
const staticBoardReportPath = path.join(staticBoardRoot, "report.json");
const staticBoardManifestPath = path.join(staticBoardRoot, "board-manifest.json");

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const sha256 = (file) => fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const checks = [];
const check = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});

const currentPhase = readJson(currentPhasePath) || {};
const workspace = readJson(workspacePublicPath) || {};
const authority = readJson(authorityPublicPath) || {};
const staticBoardReport = readJson(staticBoardReportPath) || {};
const staticBoardManifest = readJson(staticBoardManifestPath) || {};
const executionStatus = readExecutionStatus(appRoot);
const effectiveReviewAuthority = assertEffectiveReviewAuthority(executionStatus.effectiveAuthority);
const effectiveLifecycle = executionStatus.latestVisualBoardReview || executionStatus.packagingParagraphLifecycle;
const pageSource = fs.existsSync(pageSourcePath) ? fs.readFileSync(pageSourcePath, "utf8") : "";
const presentationPanelSource = fs.existsSync(presentationPanelSourcePath) ? fs.readFileSync(presentationPanelSourcePath, "utf8") : "";
const redirectSource = fs.existsSync(redirectSourcePath) ? fs.readFileSync(redirectSourcePath, "utf8") : "";
const agentRules = fs.existsSync(agentRulesPath) ? fs.readFileSync(agentRulesPath, "utf8") : "";
const branch = execFileSync("git", ["branch", "--show-current"], {cwd: root, encoding: "utf8"}).trim();
const presentationDecisions = workspace.production?.presentationDecisions || {};
const materialManifestV2 = workspace.production?.materialManifestV2 || {};
const articleAssetAuthority = workspace.production?.articleAssetProductionAuthority || null;
const articleAssetAuthorityCurrent = articleAssetAuthority?.contract === "A1ArticleAssetProductionAuthority/v1" && articleAssetAuthority.current === true;
const currentArticleAssetControlPlane = workspace.production?.authority?.currentStage === "article-assets";
const currentTypographyFontAssets = (workspace.library?.assets || []).filter((asset) => asset.route === "project-font" && asset.current !== false);
const currentTypographyGlyphAssets = (workspace.library?.assets || []).filter((asset) => asset.route === "generated-glyph" && asset.current !== false);
const currentTypographyAssignmentFontIds = new Set((workspace.typographySystem?.shotAssignments || []).flatMap((assignment) => [assignment.pixelFontAssetId, assignment.supportFontAssetId, ...(assignment.primaryFontAssetIds || [])].filter(Boolean)));
const currentStoryboardTypographyIds = new Set((articleAssetAuthority?.storyboardDefaultLibraryBinding?.assignments || []).map((assignment) => assignment.typographyTemplateId).filter(Boolean));
const backgroundLanePublicRoot = path.join(publicRoot, "editorial-asset-workbench-v1/article-asset-background-lane-v1");
const backgroundRequestPack = readJson(path.join(backgroundLanePublicRoot, "request-pack.json"));
const backgroundStyleDna = readJson(path.join(backgroundLanePublicRoot, "style-dna.json"));
const backgroundStyleBriefSet = readJson(path.join(backgroundLanePublicRoot, "style-briefs.json"));
let articleAssetContractAudit = {status: "NOT_CURRENT", error: null};
if (articleAssetAuthorityCurrent) {
  try {
    assertArticleAssetProductionAuthority(articleAssetAuthority);
    assertBackgroundLaneRequestPack(backgroundRequestPack, {appRoot, styleDna: backgroundStyleDna, styleBriefs: backgroundStyleBriefSet?.briefs || []});
    articleAssetContractAudit = {status: "PASS", error: null};
  } catch (error) {
    articleAssetContractAudit = {status: "FAIL", error: error instanceof Error ? error.message : String(error)};
  }
}
const packagingPlan = workspace.production?.packagingBeatPlan || null;
const packagingActive = packagingPlan?.contract === "A1PackagingBeatPlan/v1"
  && packagingPlan.current !== false
  && packagingPlan.authorityScope !== "HISTORY_READ_ONLY"
  && workspace.production?.packagingBoundary?.contract === "A1EditorialPackagingBoundary/v1";
const visualCoveragePlan = workspace.production?.shotVisualCoveragePlan?.contract === "A1ShotVisualCoveragePlan/v1"
  ? workspace.production.shotVisualCoveragePlan
  : null;
const ed32Asset = (workspace.library?.assets || []).find((asset) => asset.shotDemand?.shotId === "ED-32");
const ed32Coverage = visualCoveragePlan?.shotPlans?.find((item) => item.shotId === "ED-32") || null;
const ed32Packaging = packagingPlan?.items?.find((item) => item.beatId === "ED-32") || null;
const ed03EvidenceBundle = (materialManifestV2.evidenceBundles || []).find((bundle) => bundle.bundleId === "screen-evidence-ED-03");
const expectedReleaseState = workspace.production?.release?.final1080p?.status === "complete"
  && workspace.production?.release?.davinciPackage?.status === "complete"
  ? "DELIVERY_COMPLETE"
  : workspace.production?.release?.review540p?.status === "ready-for-review"
    ? workspace.production?.release?.visualQualityReview?.status === "passed"
      ? "FINAL_RELEASE_DECISION_REQUIRED"
      : "AUTOMATIC_VISUAL_QC_REQUIRED"
    : workspace.gates?.acceptedShotIrAllowed === true
      ? "ACTIVE_AUTOMATIC_PRODUCTION"
      : "ACTIVE_REVIEW_GATED";
const canonicalRepairScope = ["ED-07", "ED-08", "ED-13", "ED-19"];
const generationEligibleShotIds = workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.generationEligibleShotIds || [];
const lifecycleProjection = derivePackagingLifecycleProjection(workspace);
const threeAnchorVisualRepairReviewCurrent = lifecycleProjection.status === "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED"
  && currentPhase.authority?.currentStage === "three-anchor-visual-repair-review"
  && currentPhase.authority?.nextAction?.id === "review-three-anchor-visual-repair";
const maturityAuthority = workspace.production?.goldenFilmVisualSystemMaturity?.current === true
  ? workspace.production.goldenFilmVisualSystemMaturity
  : null;
const maturityAuthorityCurrent = Boolean(maturityAuthority?.status && maturityAuthority?.nextAction);
const shotIntelligenceStatus = String(workspace.production?.shotIntelligence?.status || "");
const layerReconstructionActive = ["LAYER_RECONSTRUCTION_READY", "LAYER_RECONSTRUCTION_IN_PROGRESS"].includes(shotIntelligenceStatus);
const goldenAnchorReviewPending = lifecycleProjection.status === "GOLDEN_ANCHOR_REVIEW";
const canonicalStaticBoardInputBlocked = lifecycleProjection.status === "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS";
const canonicalTitleRepairPending = workspace.production?.shotIntelligence?.canonicalDirectorAuthority?.status === "PASS"
  && workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.authoritySha256 === workspace.production?.shotIntelligence?.canonicalDirectorAuthority?.authoritySha256
  && workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.sourceRevisionHash === workspace.production?.shotIntelligence?.canonicalDirectorAuthority?.sourceRevisionHash
  && generationEligibleShotIds.length > 0
  && generationEligibleShotIds.every((shotId) => canonicalRepairScope.includes(shotId))
  && lifecycleProjection.status !== "WHOLE_FILM_STATIC_BOARD_READY"
  && workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.status !== "HISTORY_READ_ONLY"
  && !canonicalStaticBoardInputBlocked
  && workspace.production?.shotIntelligence?.canonicalDirectorTargetRepairManifest?.boardRebuilt === false;
const currentShotDesignReviewCurrent = lifecycleProjection.nextActionId === "review-current-shot-design-candidates";
const lifecycleAuthorityCurrent = ["WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED", "MOTION_READY", "FULL_STATIC_STORYBOARD_LEDGER_REQUIRED", "FULL_STATIC_STORYBOARD_REWORK_REQUIRED", "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED", "VISUAL_REPAIR_REQUIRED", "VISUAL_EXPANSION_REQUIRED", "READY_FOR_ACTUAL_PIXEL_REVIEW", "REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW", "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW", "PACKAGING_DELIVERY_ARCHITECTURE_READY_EXTERNAL_GATES_BLOCKED", "PACKAGE_EXPORT_AUTHORIZATION_REQUIRED", "CANONICAL_PACKAGE_EXPORTED_AWAITING_RESOLVE_TIMELINE", "CODE_ARCHITECTURE_BLOCKED", "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED", "CREATOR_PACKAGING_PALETTE_APPROVED_PREFLIGHT_REQUIRED", "CREATOR_PACKAGING_PALETTE_SYSTEM_APPROVED_PREFLIGHT_REQUIRED", "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED", "CANONICAL_TITLE_REPAIR_PENDING", "CANONICAL_TITLE_REPAIR_GENERATING"].includes(lifecycleProjection.status);
const representativeMotionReviewCurrent = ["REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW", "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW", "PACKAGING_DELIVERY_ARCHITECTURE_READY_EXTERNAL_GATES_BLOCKED", "PACKAGE_EXPORT_AUTHORIZATION_REQUIRED", "CANONICAL_PACKAGE_EXPORTED_AWAITING_RESOLVE_TIMELINE", "CODE_ARCHITECTURE_BLOCKED"].includes(lifecycleProjection.status);
const representativeCanaryReviewCurrent = (workspace.production?.motion?.representativeCanary?.status === "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW"
  && workspace.production?.authority?.nextAction?.id === "review-representative-motion-canary")
  || (workspace.production?.motion?.actionStoryboard?.status === "READY_FOR_USER_ACTION_STORYBOARD_REVIEW"
    && workspace.production?.authority?.nextAction?.id === "review-representative-motion-action-storyboard")
  || (workspace.production?.staticStoryboardRework?.status === "READY_FOR_FULL_STATIC_STORYBOARD_REVIEW"
    && workspace.production?.authority?.nextAction?.id === "review-full-static-storyboard-rework");
const ed10ReplacementReviewCurrent = workspace.production?.shotIntelligence?.visualReplacement?.contract === "A1ED10LookMasterVisualReplacement/v1"
  && workspace.production.shotIntelligence.visualReplacement.scope === "ED-10"
  && workspace.production.shotIntelligence.visualReplacement.reason === "user-rejected-old-version"
  && ["ed10-look-master-replacement-review", "ed10-editable-typography-rebuild", "ed10-editable-typography-proof-review", "ed10-proof-reviewed-static-board-rebuild"].includes(currentPhase.authority?.currentStage);
const expectedCurrentPhaseState = articleAssetAuthorityCurrent
  ? articleAssetAuthority.status
  : ed10ReplacementReviewCurrent
  ? "ACTIVE_REVIEW_GATED"
  : threeAnchorVisualRepairReviewCurrent
  ? lifecycleProjection.status
  : lifecycleAuthorityCurrent
  ? lifecycleProjection.status
  : maturityAuthorityCurrent
  ? maturityAuthority.status
  : goldenAnchorReviewPending || canonicalStaticBoardInputBlocked
  ? lifecycleProjection.status
  : canonicalTitleRepairPending
    ? lifecycleProjection.status
    : layerReconstructionActive
      ? shotIntelligenceStatus
    : expectedReleaseState;
const motionStageAuthorizationCurrent = maturityAuthorityCurrent
  && !representativeMotionReviewCurrent
  && maturityAuthority.status === "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS"
  && maturityAuthority.nextAction === "AWAIT_MOTION_STAGE_AUTHORIZATION";
const automaticRepairGateActive = canonicalStaticBoardInputBlocked || canonicalTitleRepairPending;

check("system-line-worktree-branch", branch === "codex/system-maturity-line-20260722", {branch});
check("current-phase-v2-workbench-authority", currentPhase.contract === "A1SystemLineCurrentPhase/v2" && currentPhase.phaseId === "editorial-asset-workbench-v1" && currentPhase.authority?.kind === "visual-director-workbench", currentPhase.authority || null);
check("single-production-entry", currentPhase.authority?.pageUrl === "/system-line-visual-workbench" && authority.singleProductionEntry === "/system-line-visual-workbench", {phase: currentPhase.authority?.pageUrl || null, report: authority.singleProductionEntry || null});
check("workspace-public-artifact-parity", sha256(workspacePublicPath) !== null && sha256(workspacePublicPath) === sha256(workspaceArtifactPath), {public: sha256(workspacePublicPath), artifact: sha256(workspaceArtifactPath)});
check("workspace-authority-hash-bound", workspace.contract === "A1EditorialAssetWorkbench/v2" && workspace.production?.authority?.contract === "A1ProductionAuthority/v1" && currentPhase.authority?.workspaceSha256 === workspace.workspaceSha256 && authority.authority?.workspaceSha256 === workspace.workspaceSha256 && currentPhase.authority?.productionAuthoritySha256 === workspace.production.authority.sha256 && authority.authority?.productionAuthoritySha256 === workspace.production.authority.sha256, {workspace: workspace.workspaceSha256 || null, productionAuthority: workspace.production?.authority?.sha256 || null, phase: currentPhase.authority?.workspaceSha256 || null, phaseProductionAuthority: currentPhase.authority?.productionAuthoritySha256 || null, report: authority.authority?.workspaceSha256 || null});
check("article-asset-production-authority-contract", !articleAssetAuthorityCurrent || (articleAssetContractAudit.status === "PASS"
  && currentPhase.authority?.articleAssetProductionAuthority?.authoritySha256 === articleAssetAuthority.authoritySha256
  && authority.authority?.articleAssetProductionAuthority?.authoritySha256 === articleAssetAuthority.authoritySha256
  && currentPhase.authority?.nextAction?.requestPackSha256 === backgroundRequestPack?.requestPackSha256), {articleAssetContractAudit, authoritySha256: articleAssetAuthority?.authoritySha256 || null, requestPackSha256: backgroundRequestPack?.requestPackSha256 || null});
check("article-asset-two-background-preflight", !articleAssetAuthorityCurrent || (backgroundRequestPack?.status === "READY_AWAITING_EXPLICIT_HASH_AUTHORIZATION"
  && backgroundRequestPack?.requests?.length === 2
  && backgroundRequestPack.requests.every((request) => request.referenceAttachments?.length >= 2 && request.referenceAttachments.length <= 4 && request.preflight?.noPeople === true && request.preflight?.noFormalText === true && request.dispatch?.authorized === false && request.dispatch?.dispatched === false)
  && backgroundStyleDna?.subjectPolicy?.peopleAllowedByDefault === false
  && backgroundStyleDna?.typography?.generatedFormalTextAllowed === false), {requestCount: backgroundRequestPack?.requests?.length || 0, styleDnaSha256: backgroundStyleDna?.styleDnaSha256 || null});
check("article-packaging-kit-system-review-not-user-approval", !articleAssetAuthorityCurrent || (workspace.production?.articlePackagingKit?.gates?.userVisualApproval !== "APPROVED"
  && workspace.production?.articlePackagingKit?.review?.reviewedBy !== "system-visual-critic"
  && workspace.production?.articlePackagingKit?.legacySystemReview?.status === "HISTORY_ONLY"), {review: workspace.production?.articlePackagingKit?.review || null, gates: workspace.production?.articlePackagingKit?.gates || null, legacySystemReview: workspace.production?.articlePackagingKit?.legacySystemReview || null});
check("current-visual-direction-is-no-person", !articleAssetAuthorityCurrent || (executionStatus.visualDirectionAuthority?.counts?.characterRequired === 0
  && executionStatus.visualDirectionAuthority?.counts?.characterPreferred === 0
  && executionStatus.visualDirectionAuthority?.userVisualInvariants?.characterPolicy?.specificHumanOrMascotDefault === "FORBIDDEN"
  && executionStatus.visualDirectionAuthorityError == null), {directionAuthoritySha256: executionStatus.visualDirectionAuthority?.directionEnvelopeSha256 || null, counts: executionStatus.visualDirectionAuthority?.counts || null, error: executionStatus.visualDirectionAuthorityError || null});
check("visual-policy-authority-hash-bound", workspace.visualBible?.visualGenerationPolicy?.contract === "A1EditorialVisualGenerationPolicy/v1" && currentPhase.authority?.policySha256 === workspace.visualBible?.visualGenerationPolicy?.sha256 && authority.authority?.policySha256 === workspace.visualBible?.visualGenerationPolicy?.sha256, {policy: workspace.visualBible?.visualGenerationPolicy?.sha256 || null, phase: currentPhase.authority?.policySha256 || null});
check("current-single-font-typography-authority", workspace.typographySystem?.authorityScope === "CURRENT_SINGLE_FONT"
  && workspace.typographySystem?.current === true
  && workspace.typographySystem?.policy?.singleFontAssetId === "type-pixel-correction"
  && workspace.typographySystem?.policy?.singleFontFamily === "A1 Fusion Pixel"
  && workspace.typographySystem?.policy?.maximumFontRolesPerShot === 1
  && workspace.typographySystem?.policy?.requiredGeneratedGlyphBoardIds?.length === 0
  && currentTypographyFontAssets.length === 1
  && currentTypographyFontAssets[0]?.id === "type-pixel-correction"
  && currentTypographyGlyphAssets.length === 0
  && [...currentTypographyAssignmentFontIds].every((fontId) => fontId === "type-pixel-correction")
  && [...currentStoryboardTypographyIds].every((templateId) => templateId === "pixel-correction-anchor")
  && workspace.production?.typographyFoundry?.current === false,
{currentFontAssets: currentTypographyFontAssets.map((asset) => asset.id), currentGlyphAssets: currentTypographyGlyphAssets.map((asset) => asset.id), assignmentFontIds: [...currentTypographyAssignmentFontIds], storyboardTypographyIds: [...currentStoryboardTypographyIds], foundryCurrent: workspace.production?.typographyFoundry?.current ?? null});
check("shot-presentation-decisions-cover-current-article", presentationDecisions.contract === "A1ShotPresentationDecisionSet/v1"
  && presentationDecisions.status === "compiled-layout-preflight-passed"
  && presentationDecisions.items?.length === workspace.article?.shotCount
  && (!packagingActive || (presentationDecisions.advisoryOnly === true && presentationDecisions.authorityScope === "legacy-advisory"))
  && presentationDecisions.sequenceAudit?.genericTitleExecutorCount === 0
  && presentationDecisions.sequenceAudit?.ordinaryExplanationTypePrimaryCount === 0
  && presentationDecisions.sequenceAudit?.longScreenRunsPass === true,
{contract: presentationDecisions.contract || null, status: presentationDecisions.status || null, decisionCount: presentationDecisions.items?.length || 0, shotCount: workspace.article?.shotCount || 0, sequenceAudit: presentationDecisions.sequenceAudit || null});
check("material-manifest-v2-covers-slots-and-blocks-blind-generation", materialManifestV2.contract === "A1MaterialManifest/v2"
  && materialManifestV2.status === "manifest-ready-generation-gated"
  && (!packagingActive || (materialManifestV2.advisoryOnly === true && materialManifestV2.authorityScope === "legacy-advisory"))
  && materialManifestV2.items?.length === workspace.assetRequirementGraph?.requirements?.length
  && materialManifestV2.policy?.blindFullFilmGenerationAllowed === false
  && materialManifestV2.policy?.maximumGenerationConcurrency === 2
  && !(materialManifestV2.items || []).some((item) => item.dispatchAllowed && (!item.generatable || !item.layoutDependency?.layoutApproved)),
{contract: materialManifestV2.contract || null, status: materialManifestV2.status || null, summary: materialManifestV2.summary || null, policy: materialManifestV2.policy || null});
check("ed03-remains-honest-source-insufficient", visualCoveragePlan
  ? visualCoveragePlan.shotPlans?.find((item) => item.shotId === "ED-03")?.route === "SCREEN_EVIDENCE"
    && visualCoveragePlan.shotPlans?.find((item) => item.shotId === "ED-03")?.actualVisualReady === true
    && !(workspace.production?.authority?.exceptionQueue?.items || []).some((item) => item.shotId === "ED-03")
  : packagingActive
    ? packagingPlan.items?.find((item) => item.beatId === "ED-03")?.itemType === "NO_PACKAGE"
    && !(workspace.production?.authority?.exceptionQueue?.items || []).some((item) => item.shotId === "ED-03")
  : ed03EvidenceBundle?.status === "source-insufficient" && ed03EvidenceBundle?.generatable === false,
visualCoveragePlan ? visualCoveragePlan.shotPlans?.find((item) => item.shotId === "ED-03") || null : packagingActive ? packagingPlan.items?.find((item) => item.beatId === "ED-03") || null : ed03EvidenceBundle || null);
check("ed32-uses-current-presenter-source-without-invented-blocker", visualCoveragePlan
  ? (ed32Coverage?.route === "PRESENTER_BASE"
      && ed32Coverage?.actualVisualReady === true
      && !(workspace.production?.authority?.exceptionQueue?.items || []).some((item) => item.shotId === "ED-32"))
    || (ed32Coverage?.route === "PACKAGE_LOOK_MASTER"
      && ed32Coverage?.baseVisualCarrier === "PRESENTER_BASE"
      && ed32Packaging?.selectionStatus === "selected"
      && ed32Packaging?.generationAllowed === true
      && ed32Packaging?.typographyTreatment
      && ed32Packaging?.itemType === "OVERLAY_PACKAGE")
  : packagingActive
    ? ed32Packaging?.selectionStatus === "selected"
    && ed32Packaging?.generationAllowed === true
  : ed32Asset?.automationBlock == null
  && ed32Asset?.shotDemand?.primaryMaterialId === "presenter-ch09-limitations-take"
  && ed32Asset?.shotDemand?.presenterSourceBoundary?.status === "registered-current-source-sufficient"
  && ["face-continuity", "mouth-movement", "ending-pause", "direct-gaze"].every((criterion) => ed32Asset?.shotDemand?.presenterSourceBoundary?.reviewCriteria?.includes(criterion)),
visualCoveragePlan ? visualCoveragePlan.shotPlans?.find((item) => item.shotId === "ED-32") || null : packagingActive ? packagingPlan.items?.find((item) => item.beatId === "ED-32") || null : {automationBlock: ed32Asset?.automationBlock || null, primaryMaterialId: ed32Asset?.shotDemand?.primaryMaterialId || null, presenterSourceBoundary: ed32Asset?.shotDemand?.presenterSourceBoundary || null});
const wholeFilmStaticBoardApprovalPending = workspace.production?.visualProductionRun?.status === "WHOLE_FILM_STATIC_BOARD_READY"
  && workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.nextUserGate === "WHOLE_FILM_STATIC_BOARD"
  && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.status === "PENDING_USER_APPROVAL"
  && workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.decision == null;
const canonicalStaticBoardScope = workspace.production?.shotIntelligence?.canonicalDirectorAuthority?.status === "PASS"
  ? buildCanonicalStaticBoardScope(workspace, {boardItems: workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.items || []})
  : null;
const creatorPackagingSequenceLive = workspace.production?.canonicalCreatorPackagingSequence?.contract === "A1CanonicalCreatorPackagingSequence/v1"
  && workspace.production.canonicalCreatorPackagingSequence.current === true
  && workspace.production.canonicalCreatorPackagingSequence.authorityScope !== "HISTORY_READ_ONLY"
  && workspace.production?.currentVisualDecisionLedger?.current !== true;
const creatorPackagingScope = creatorPackagingSequenceLive
  ? buildCanonicalStaticBoardScope(workspace)
  : null;
const creatorPaletteBinding = workspace.production?.creatorPaletteShotBindingManifest;
const ed10RetiredBindingResolvedOnCurrentBoard = creatorPackagingScope?.status === "PASS"
  && JSON.stringify([...(creatorPaletteBinding?.blockedShotIds || [])].sort()) === JSON.stringify(["ED-10"]);
const creatorPaletteIsBlocked = [
  "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_LANE_C_TARGET_UNRESOLVED",
  "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_MISSING_LANE_C",
].includes(workspace.production?.creatorPackagingPaletteRegistry?.status)
  || lifecycleProjection.status === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED"
  || lifecycleProjection.status === "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED"
  || lifecycleProjection.status === "CANONICAL_TITLE_REPAIR_PENDING"
  || lifecycleProjection.status === "CANONICAL_TITLE_REPAIR_GENERATING"
  || (!ed10RetiredBindingResolvedOnCurrentBoard && creatorPaletteBinding?.status !== "PASS")
  || (!ed10RetiredBindingResolvedOnCurrentBoard && (creatorPaletteBinding?.blockedShotIds || []).length > 0);
const creatorPackagingScopeExpected = creatorPaletteIsBlocked ? "BLOCKED" : "PASS";
const candidateBlockedShotIds = workspace.production?.shotIntelligence?.wholeFilmBatchRecommendation?.candidateAuthorityAudit?.blockedShotIds || [];
const canonicalBoardMembershipPass = canonicalStaticBoardScope?.status === "PASS"
  || ((canonicalStaticBoardScope?.missingBoardShotIds || []).length === 0
    && (canonicalStaticBoardScope?.extraBoardShotIds || []).length === 0
    && (canonicalStaticBoardScope?.modeCompatibilityFailures || []).length === 0
    && JSON.stringify([...(canonicalStaticBoardScope?.selectionMissingShotIds || [])].sort()) === JSON.stringify([...candidateBlockedShotIds].sort()));
check("whole-film-static-board-matches-current-canonical-authority", !wholeFilmStaticBoardApprovalPending || canonicalBoardMembershipPass, canonicalStaticBoardScope);
const currentBoard = workspace.production?.shotIntelligence?.wholeFilmStaticBoard || {};
const packageBoardFile = staticBoardReport.board?.publicUrl ? path.join(appRoot, "public", staticBoardReport.board.publicUrl.replace(/^\//u, "")) : "";
const timelineBoardFile = staticBoardReport.timelineBoard?.publicUrl ? path.join(appRoot, "public", staticBoardReport.timelineBoard.publicUrl.replace(/^\//u, "")) : "";
const staticBoardManifestIsCurrent = staticBoardManifest.contract === "A1WholeFilmStaticBoardCurrentAuthorityManifest/v2"
  && staticBoardManifest.current === true
  && staticBoardManifest.authorityScope === "CURRENT";
const staticBoardManifestIsPendingApproval = staticBoardManifest.contract === "A1WholeFilmStaticBoardPendingUserApprovalBuild/v1"
  && staticBoardManifest.status === "PENDING_USER_APPROVAL"
  && staticBoardManifest.userApprovalRequired === true;
check("current-static-board-authority-hashes-converged", !wholeFilmStaticBoardApprovalPending || (
  (staticBoardManifestIsCurrent || staticBoardManifestIsPendingApproval)
  && staticBoardManifest.packageBoard?.sha256 === staticBoardReport.board?.sha256
  && staticBoardManifest.timelineBoard?.sha256 === staticBoardReport.timelineBoard?.sha256
  && currentBoard.sha256 === staticBoardReport.board?.sha256
  && currentBoard.timelineBoard?.sha256 === staticBoardReport.timelineBoard?.sha256
  && currentPhase.boardReview?.packageBoardSha256 === staticBoardReport.board?.sha256
  && currentPhase.boardReview?.timelineBoardSha256 === staticBoardReport.timelineBoard?.sha256
  && sha256(packageBoardFile) === staticBoardReport.board?.sha256
  && sha256(timelineBoardFile) === staticBoardReport.timelineBoard?.sha256
  && !JSON.stringify(staticBoardManifest).includes('"buffer"')
), {manifest: staticBoardManifestPath ? rel(staticBoardManifestPath) : null, packageBoardSha256: staticBoardReport.board?.sha256 || null, timelineBoardSha256: staticBoardReport.timelineBoard?.sha256 || null, phaseBoardReview: currentPhase.boardReview || null});
check("historical-maturity-authority-is-explicitly-read-only", !currentPhase.goldenFilmVisualSystemMaturity || currentPhase.goldenFilmVisualSystemMaturity.current === true || (
  currentPhase.goldenFilmVisualSystemMaturity.current === false
  && currentPhase.goldenFilmVisualSystemMaturity.authorityScope === "HISTORY_READ_ONLY"
), currentPhase.goldenFilmVisualSystemMaturity || null);
check("creator-packaging-live-scope-is-fail-closed", !creatorPackagingScope || creatorPackagingScope.status === creatorPackagingScopeExpected, {
  expected: creatorPackagingScopeExpected,
  actual: creatorPackagingScope?.status || null,
  bindingManifestSha256: workspace.production?.creatorPaletteShotBindingManifest?.manifestSha256 || null,
  modeCompatibilityFailures: creatorPackagingScope?.modeCompatibilityFailures || [],
  bindingManifestFailures: creatorPackagingScope?.bindingManifestFailures || [],
});
check("automatic-gates-and-final-release-state-current", currentPhase.status === expectedCurrentPhaseState
  && authority.status === expectedCurrentPhaseState
  && currentPhase.reviewDecision?.intermediateApprovalRequired === (currentShotDesignReviewCurrent ? true : ed10ReplacementReviewCurrent ? workspace.production?.authority?.nextAction?.requiresUser === true : lifecycleAuthorityCurrent ? lifecycleProjection.requiresExplicitApproval === true : ["review-screen-storyboard-wave-15", "review-screen-motion-maturity-masters", "review-semantic-screen-wave15"].includes(workspace.production?.authority?.nextAction?.id) ? false : articleAssetAuthorityCurrent ? articleAssetAuthority.authorization?.requiresUser === true : threeAnchorVisualRepairReviewCurrent ? true : maturityAuthorityCurrent ? false : goldenAnchorReviewPending || automaticRepairGateActive ? false : wholeFilmStaticBoardApprovalPending || (packagingActive ? workspace.production?.packagingReview?.intermediateApprovalRequired === true : false))
  && currentPhase.reviewDecision?.requiresExplicitApproval === (["review-screen-storyboard-wave-15", "review-screen-motion-maturity-masters", "review-semantic-screen-wave15"].includes(workspace.production?.authority?.nextAction?.id) ? true : articleAssetAuthorityCurrent ? articleAssetAuthority.authorization?.requiresUser === true : ed10ReplacementReviewCurrent ? workspace.production?.authority?.nextAction?.requiresUser === true : threeAnchorVisualRepairReviewCurrent ? true : lifecycleAuthorityCurrent ? lifecycleProjection.requiresExplicitApproval === true : motionStageAuthorizationCurrent ? true : maturityAuthorityCurrent ? maturityAuthority.nextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD" : goldenAnchorReviewPending ? true : automaticRepairGateActive ? false : wholeFilmStaticBoardApprovalPending || (packagingActive ? workspace.production?.packagingReview?.requiresExplicitApproval === true : false))
  && currentPhase.reviewDecision?.acceptedShotIrAllowed === (articleAssetAuthorityCurrent ? false : workspace.gates?.acceptedShotIrAllowed === true)
  && currentPhase.reviewDecision?.motionPrototypeAllowed === (articleAssetAuthorityCurrent ? false : workspace.gates?.motionPrototypeAllowed === true)
  && currentPhase.reviewDecision?.finalRenderAllowed === (articleAssetAuthorityCurrent ? false : workspace.gates?.finalRenderAllowed === true)
  && currentPhase.next?.recommended?.requiresExplicitApproval === (["review-screen-storyboard-wave-15", "review-screen-motion-maturity-masters", "review-semantic-screen-wave15"].includes(workspace.production?.authority?.nextAction?.id) ? true : articleAssetAuthorityCurrent ? articleAssetAuthority.authorization?.requiresUser === true : ed10ReplacementReviewCurrent ? workspace.production?.authority?.nextAction?.requiresUser === true : threeAnchorVisualRepairReviewCurrent ? true : representativeCanaryReviewCurrent ? true : lifecycleAuthorityCurrent ? lifecycleProjection.requiresExplicitApproval === true : motionStageAuthorizationCurrent ? true : maturityAuthorityCurrent ? maturityAuthority.nextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD" : workspace.production?.authority?.nextAction?.requiresUser === true), {expectedReleaseState: expectedCurrentPhaseState, articleAssetAuthorityCurrent, ed10ReplacementReviewCurrent, threeAnchorVisualRepairReviewCurrent, representativeCanaryReviewCurrent, lifecycleAuthorityCurrent, representativeMotionReviewCurrent, maturityAuthorityCurrent, motionStageAuthorizationCurrent, goldenAnchorReviewPending, canonicalStaticBoardInputBlocked, canonicalTitleRepairPending, workspaceGates: workspace.gates || null, phaseReview: currentPhase.reviewDecision || null, next: currentPhase.next?.recommended || null});
const effectiveParagraphStatus = executionStatus.latestVisualBoardReview?.status || executionStatus.packagingParagraphPlayableUserDecision?.status || executionStatus.packagingParagraphPlayableRender?.state?.status || executionStatus.packagingParagraphPlayablePlan?.status || executionStatus.packagingParagraphUserDecision?.status || executionStatus.packagingParagraphLifecycle?.status;
const effectiveParagraphNextAction = executionStatus.latestVisualBoardReview?.nextAction?.id || executionStatus.packagingParagraphPlayableUserDecision?.outcome?.nextAction?.id || executionStatus.packagingParagraphPlayableRender?.state?.nextAction?.id || executionStatus.packagingParagraphPlayablePlan?.nextAction?.id || executionStatus.packagingParagraphUserDecision?.outcome?.nextAction?.id || executionStatus.packagingParagraphLifecycle?.nextAction?.id;
check("effective-review-authority-over-persisted-base", articleAssetAuthorityCurrent
  || currentArticleAssetControlPlane
  || ed10ReplacementReviewCurrent
  || wholeFilmStaticBoardApprovalPending
  || lifecycleProjection.status === "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED"
  || lifecycleProjection.status === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW"
  || lifecycleProjection.status === "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED"
  || currentPhase.authority?.currentStage === "motion-ready"
  || canonicalTitleRepairPending
  ? effectiveReviewAuthority.status === currentPhase.status
    && effectiveReviewAuthority.nextAction?.id === currentPhase.next?.recommended?.id
    && effectiveReviewAuthority.source?.mode === "PERSISTED_BASE_ONLY"
    && effectiveReviewAuthority.source?.lifecycleSha256 === null
    && effectiveReviewAuthority.persistedBaseAuthority?.retainedAsHistoricalDecision === false
    && executionStatus.packagingParagraphLifecycle === null
    && executionStatus.latestVisualBoardReview === null
  : effectiveReviewAuthority.status === effectiveParagraphStatus
  && effectiveReviewAuthority.nextAction?.id === effectiveParagraphNextAction
  && effectiveReviewAuthority.source?.lifecycleSha256 === effectiveLifecycle?.lifecycleSha256
  && effectiveReviewAuthority.source?.userDecisionSha256 === (executionStatus.latestVisualBoardReview ? null : executionStatus.packagingParagraphUserDecision?.decisionSha256 || null)
  && effectiveReviewAuthority.source?.continuationPlanSha256 === (executionStatus.latestVisualBoardReview ? null : executionStatus.packagingParagraphPlayablePlan?.planSha256 || null)
  && effectiveReviewAuthority.source?.playableRenderAuthorizationSha256 === (executionStatus.latestVisualBoardReview ? null : executionStatus.packagingParagraphPlayableRender?.authorization?.authorizationSha256 || null)
  && effectiveReviewAuthority.source?.playableRenderStateSha256 === (executionStatus.latestVisualBoardReview ? null : executionStatus.packagingParagraphPlayableRender?.state?.stateSha256 || null)
  && effectiveReviewAuthority.source?.playableUserDecisionSha256 === (executionStatus.latestVisualBoardReview ? null : executionStatus.packagingParagraphPlayableUserDecision?.decisionSha256 || null)
  && effectiveReviewAuthority.persistedBaseAuthority?.status === currentPhase.status
  && effectiveReviewAuthority.persistedBaseAuthority?.nextAction?.id === currentPhase.next?.recommended?.id
  && effectiveReviewAuthority.persistedBaseAuthority?.retainedAsHistoricalDecision === true
  && effectiveReviewAuthority.boundary?.userVisualApproval === "NOT_APPROVED"
  && effectiveReviewAuthority.boundary?.fullFilmVisualApproval === false
  && effectiveReviewAuthority.boundary?.productionAdmitted === false
  && effectiveReviewAuthority.boundary?.motionAllowed === false
  && effectiveReviewAuthority.boundary?.resolveAllowed === false
  && effectiveReviewAuthority.boundary?.finalRenderAllowed === false
  && effectiveReviewAuthority.workspaceMutationPerformed === false,
{effectiveReviewAuthority, persistedPhaseStatus: currentPhase.status, persistedPhaseNextAction: currentPhase.next?.recommended || null});
check("latest-visual-board-review-precedes-generation", !executionStatus.latestVisualBoardReview || (
  effectiveReviewAuthority.status === executionStatus.latestVisualBoardReview.status
  && effectiveReviewAuthority.nextAction?.id === executionStatus.latestVisualBoardReview.nextAction.id
  && effectiveReviewAuthority.nextAction?.requiresExplicitApproval === executionStatus.latestVisualBoardReview.nextAction.requiresUser
  && effectiveReviewAuthority.source?.lifecycleSha256 === executionStatus.latestVisualBoardReview.lifecycleSha256
  && effectiveReviewAuthority.boundary?.productionAdmitted === false
  && effectiveReviewAuthority.boundary?.motionAllowed === false
), {latestVisualBoardReview: executionStatus.latestVisualBoardReview || null, effectiveReviewAuthority});
check("workspace-and-phase-worker-projection-match", workspace.production?.generation?.workerStatus === currentPhase.authority?.packagingAutomation?.generationFreeze?.workerStatus
  && workspace.production?.generation?.summary?.queued === currentPhase.authority?.generationQueueProjection?.queued
  && workspace.production?.generation?.summary?.running === currentPhase.authority?.generationQueueProjection?.running
  && workspace.production?.generation?.workerStatus === currentPhase.authority?.generationQueueProjection?.workerStatus,
{workspaceWorker: workspace.production?.generation?.workerStatus || null, phaseWorker: currentPhase.authority?.packagingAutomation?.generationFreeze?.workerStatus || null, workspaceQueue: workspace.production?.generation?.summary || null, phaseQueue: currentPhase.authority?.generationQueueProjection || null});
check("workspace-and-phase-dispatch-projection-match", workspace.production?.generation?.automaticDispatchAllowed === currentPhase.authority?.packagingAutomation?.generationFreeze?.automaticDispatchAllowed
  && currentPhase.authority?.packagingAutomation?.generationFreeze?.frozen === (workspace.production?.generation?.automaticDispatchAllowed !== true)
  && currentPhase.authority?.packagingAutomation?.generationFreeze?.imageGenerationAllowed === (workspace.production?.generation?.automaticDispatchAllowed === true),
{workspaceAutomaticDispatchAllowed: workspace.production?.generation?.automaticDispatchAllowed, phaseGenerationFreeze: currentPhase.authority?.packagingAutomation?.generationFreeze || null});
const universalReferenceGate = workspace.production?.universalReferencePackagingGate;
const currentUserVisualApprovalGate = workspace.production?.userVisualApprovalGate;
check("current-static-board-downstream-locks-converged", !wholeFilmStaticBoardApprovalPending || (
  universalReferenceGate?.current === true
  && universalReferenceGate?.status === "WHOLE_FILM_STATIC_BOARD_PREAPPROVAL_LOCKED"
  && universalReferenceGate?.nextAction === "review-whole-film-static-board"
  && universalReferenceGate?.assemblyCreationAllowed === false
  && universalReferenceGate?.layerReconstructionAllowed === false
  && universalReferenceGate?.criticAllowed === false
  && universalReferenceGate?.motionAllowed === false
  && currentPhase.universalReferencePackaging?.nextAction === "review-whole-film-static-board"
  && currentPhase.universalReferencePackaging?.layerReconstructionAllowed === false
), {workspaceGate: universalReferenceGate || null, phaseGate: currentPhase.universalReferencePackaging || null});
check("current-static-board-user-approval-gate-converged", !wholeFilmStaticBoardApprovalPending || (
  currentUserVisualApprovalGate?.current === true
  && currentUserVisualApprovalGate?.status === "WHOLE_FILM_STATIC_BOARD_APPROVAL_REQUIRED"
  && currentUserVisualApprovalGate?.authorityScope === "CURRENT"
  && currentUserVisualApprovalGate?.userVisualApproval === "NOT_APPROVED"
  && currentUserVisualApprovalGate?.blocksInternalCanary === true
  && currentUserVisualApprovalGate?.blocksAssemblyAndLayers === true
  && currentUserVisualApprovalGate?.blocksExternalRelease === true
  && currentUserVisualApprovalGate?.nextAction === "review-whole-film-static-board"
), {userVisualApprovalGate: currentUserVisualApprovalGate || null});
check("legacy-h-series-is-read-only", currentPhase.legacyAuthorities?.some((item) => item.id === "h-series-semantic-directed-v1" && item.status === "HISTORY_READ_ONLY" && item.finalRenderAllowed === false), currentPhase.legacyAuthorities || []);
check("workbench-exposes-policy-and-single-line", pageSource.includes("data-a1-visual-generation-policy") && pageSource.includes("data-a1-visual-policy-lock") && pageSource.includes("data-a1-production-authority-stage") && pageSource.includes("data-a1-design-calibration-status") && pageSource.includes("唯一生产线"), rel(pageSourcePath));
check("workbench-exposes-presentation-and-material-truth", pageSource.includes("PresentationSystemPanel")
  && presentationPanelSource.includes("data-a1-presentation-decision-count")
  && presentationPanelSource.includes("data-a1-material-slot-count")
  && presentationPanelSource.includes('data-a1-blind-full-film-generation="false"')
  && presentationPanelSource.includes("候选绑定待核验"),
{client: rel(pageSourcePath), panel: rel(presentationPanelSourcePath)});
check("legacy-review-default-redirects-to-workbench", redirectSource.includes('window.location.replace("/system-line-visual-workbench")') && redirectSource.includes('params.get("history") === "1"'), rel(redirectSourcePath));
check("project-rules-lock-single-production-authority", [
  "sole active production entry",
  "A1EditorialAssetWorkbench/v2",
  "current pointer",
  "HISTORY_READ_ONLY",
  "npm run verify:system-line-workbench",
].every((marker) => agentRules.includes(marker)), {rules: rel(agentRulesPath)});

const failures = checks.filter((item) => item.status === "FAIL");
const report = {
  contract: "A1SystemLineCurrentAuthorityAudit/v2",
  phaseId: "system-line-current-authority-v2",
  status: failures.length ? "BLOCKED" : "PASS",
  generatedAt: new Date().toISOString(),
  authority: {
    currentPhase: rel(currentPhasePath),
    workspace: rel(workspacePublicPath),
    workspaceSha256: workspace.workspaceSha256 || null,
    policySha256: workspace.visualBible?.visualGenerationPolicy?.sha256 || null,
    singleProductionEntry: "/system-line-visual-workbench",
  },
  effectiveReviewAuthority,
  checks,
  failures: failures.map((item) => item.id),
  creatorPackagingScope: creatorPackagingScope ? {
    status: creatorPackagingScope.status,
    expectedStatus: creatorPackagingScopeExpected,
    auditSha256: creatorPackagingScope.auditSha256,
    requiredPackageBoardShotIds: creatorPackagingScope.requiredPackageBoardShotIds,
    selectionMissingShotIds: creatorPackagingScope.selectionMissingShotIds,
    modeCompatibilityFailures: creatorPackagingScope.modeCompatibilityFailures,
    bindingManifestFailures: creatorPackagingScope.bindingManifestFailures,
  } : null,
  nextAction: failures.length ? "repair-workbench-current-authority" : effectiveReviewAuthority.nextAction.id,
};

if (writeReport) {
  fs.mkdirSync(reportArtifactRoot, {recursive: true});
  fs.mkdirSync(reportPublicRoot, {recursive: true});
  fs.writeFileSync(path.join(reportArtifactRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(reportPublicRoot, "audit-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({status: report.status, failures: report.failures, reportPath: writeReport ? rel(path.join(reportArtifactRoot, "audit-report.json")) : null, writePerformed: writeReport, nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 1;
