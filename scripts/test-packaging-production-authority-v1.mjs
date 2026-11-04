#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {canonicalTitleRepairCheckpoint, derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const workspace = readProjectWorkspace(path.resolve("apps/studio-next"));
const production = workspace.production;
const plan = production.packagingBeatPlan;
const lifecycleProjection = derivePackagingLifecycleProjection(workspace);
const currentArticleAssetAuthority = production.articleAssetProductionAuthority?.current === true
  ? production.articleAssetProductionAuthority
  : null;
const consolidatedArticleQaActive = production.authority?.currentStage === "article-assets"
  && ["automatic-article-packaging-qa", "run-objective-qa-for-13-in-use-assets", "repair-or-rebind-current-in-use-assets-no-blind-regeneration", "rebuild-current-12-package-static-board"].includes(production.authority?.nextAction?.id);
const canonicalStaticBoardInputBlocked = lifecycleProjection.status === "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS";
const canonicalRepairPending = canonicalTitleRepairCheckpoint(workspace) && !canonicalStaticBoardInputBlocked;
const canonicalRepairScope = ["ED-07", "ED-08", "ED-13", "ED-19"];
// ED-19 is a target repair but remains blocked until presenter bounds and a
// fresh pixel-window/EVA candidate exist; only authority-eligible shots may
// enter the dispatch action.
const canonicalDispatchScope = ["ED-08", "ED-13"];
const activeIds = new Set((production.designCalibrationBatch?.items || []).map((item) => item.shotId));
const perShotRuntime = production.shotIntelligence?.contract === "A1ShotIntelligenceRuntime/v1";
const runtimeStatus = production.shotIntelligence?.status;
const ed10TrialBlocked = String(production.shotIntelligence?.ed10FourLayerTrial?.status || "").startsWith("BLOCKED_")
  && production.shotIntelligence?.packageAssemblyRecipes?.some((recipe) => recipe.shotId === "ED-10" && recipe.status === "HISTORY_READ_ONLY");
if (production.visualProductionRun?.contract === "A1VisualProductionRun/v1") {
  const currentShotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
  const semanticReviewRequired = production.shotIntelligence?.wholeFilmBatchRecommendation?.status === "SEMANTIC_REVIEW_REQUIRED";
  const semanticPilotReviewRequired = production.shotIntelligence?.status === "SEMANTIC_PILOT_REVIEW_REQUIRED";
  const semanticReconciliationRequired = production.authority?.currentStage === "film-look-master-semantic-reconciliation-required"
    && production.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === true;
  const exceptionRepairRequired = production.authority?.currentStage === "film-look-master-exception-repair-required"
    && production.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === false;
  const semanticTimelineReconciled = production.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationStatus === "SEMANTIC_TIMELINE_RECONCILED";
  const candidateSelectionPending = production.visualProductionRun?.status === "CANDIDATE_SELECTION_PENDING";
  const generationInputsPartial = production.visualProductionRun?.status === "GENERATION_INPUTS_PARTIAL";
  const staticBoardReviewRequired = production.visualProductionRun?.status === "WHOLE_FILM_STATIC_BOARD_READY";
  const ed10LookMasterReviewActive = production.authority?.currentStage === "ed10-look-master-replacement-review"
    && production.authority?.nextAction?.id === "confirm-ed10-direction-c-before-eva-rebuild";
  const layerReconstructionActive = ["LAYER_RECONSTRUCTION_READY", "LAYER_RECONSTRUCTION_IN_PROGRESS"].includes(runtimeStatus);
  const maturityStaticBoardActive = production.goldenFilmVisualSystemMaturity?.current === true
    && production.goldenFilmVisualSystemMaturity?.status === "WHOLE_FILM_STATIC_BOARD"
    && production.goldenFilmVisualSystemMaturity?.nextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD";
  const creatorPaletteLifecycleActive = [
    "CREATOR_PACKAGING_PALETTE_REVIEW",
    "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_MISSING_LANE_C",
    "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_LANE_C_TARGET_UNRESOLVED",
    "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED",
    "CREATOR_PACKAGING_PALETTE_APPROVED_PREFLIGHT_REQUIRED",
    "CREATOR_PACKAGING_PALETTE_SYSTEM_APPROVED_PREFLIGHT_REQUIRED",
  ].includes(lifecycleProjection.status);
  const representativeMotionReviewActive = ["REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW", "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW", "PACKAGING_DELIVERY_CONTRACT_REVIEW"].includes(lifecycleProjection.status);
  const visualReviewLifecycleActive = ["VISUAL_REPAIR_REQUIRED", "VISUAL_EXPANSION_REQUIRED", "READY_FOR_ACTUAL_PIXEL_REVIEW", "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED", "FULL_STATIC_STORYBOARD_LEDGER_REQUIRED", "FULL_STATIC_STORYBOARD_REWORK_REQUIRED", "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED"].includes(lifecycleProjection.status);
  const threeAnchorVisualRepairReviewActive = lifecycleProjection.status === "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED"
    && production.authority?.currentStage === "three-anchor-visual-repair-review"
    && production.authority?.nextAction?.id === "review-three-anchor-visual-repair"
    && production.threeAnchorVisualRepairReview?.status === "READY_FOR_USER_VISUAL_REVIEW";
  const packageExportAuthorizationActive = lifecycleProjection.status === "PACKAGE_EXPORT_AUTHORIZATION_REQUIRED";
  const staticPackageReviewAuthorizationActive = lifecycleProjection.status === "PACKAGING_DELIVERY_ARCHITECTURE_READY_EXTERNAL_GATES_BLOCKED"
    && lifecycleProjection.nextActionId === "AUTHORIZE_PACKAGE_STATIC_REVIEW"
    && production.authority?.currentStage === lifecycleProjection.authorityStage;
  const screenStoryboardReviewActive = production.authority?.currentStage === "motion-ready"
    && ["review-screen-storyboard-wave-15", "review-semantic-screen-wave15"].includes(production.authority?.nextAction?.id)
    && production.authority?.nextAction?.requiresUser === true;
  const screenStoryboardRejectionActive = production.authority?.currentStage === "motion-ready"
    && production.authority?.nextAction?.id === "rebuild-screen-storyboard-semantic-families"
    && production.shotIntelligence?.currentStoryboardAuthority?.screenStoryboardWave?.status === "USER_REJECTED_SYSTEM_GRAMMAR";
  const approvedStaticBoardCurrent = production.shotIntelligence?.wholeFilmStaticBoard?.status === "APPROVED"
    && production.shotIntelligence?.wholeFilmStaticBoardDecision?.decision === "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY"
    && production.shotIntelligence?.wholeFilmStaticBoardDecision?.approvalAuthority?.contract === "A1WholeFilmStaticBoardApprovalAuthority/v1"
    && production.motion?.approvedMasterRasterSliceMotionIr?.status === "READY_FOR_REPRESENTATIVE_MOTION_CANARY";
  const expectedVisualProductionStatus = consolidatedArticleQaActive
    ? production.visualProductionRun?.status
    : threeAnchorVisualRepairReviewActive ? production.visualProductionRun?.status : creatorPaletteLifecycleActive ? lifecycleProjection.status : canonicalStaticBoardInputBlocked ? "WHOLE_FILM_CANONICAL_BOARD_BLOCKED_INPUTS" : canonicalRepairPending ? "REPAIR_REQUIRED" : layerReconstructionActive ? runtimeStatus : semanticReviewRequired || candidateSelectionPending ? "CANDIDATE_SELECTION_PENDING" : staticBoardReviewRequired ? "WHOLE_FILM_STATIC_BOARD_READY" : generationInputsPartial ? "GENERATION_INPUTS_PARTIAL" : "GENERATION_EXECUTABLE";
  const expectedAuthorityStage = visualReviewLifecycleActive
    ? lifecycleProjection.authorityStage
    : representativeMotionReviewActive
    ? lifecycleProjection.authorityStage
    : screenStoryboardRejectionActive
    ? "motion-ready"
    : approvedStaticBoardCurrent
    ? "motion-ready"
    : threeAnchorVisualRepairReviewActive
    ? production.authority.currentStage
    : ed10LookMasterReviewActive
    ? production.authority.currentStage
    : consolidatedArticleQaActive
    ? "article-assets"
    : currentArticleAssetAuthority
    ? currentArticleAssetAuthority.status === "BACKGROUND_LIBRARY_EXPANSION_ACTIVE"
      ? "article-asset-background-open-library-expansion"
      : currentArticleAssetAuthority.status === "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW"
        ? "article-asset-background-wave-actual-pixel-review"
        : production.authority.currentStage
    : visualReviewLifecycleActive || packageExportAuthorizationActive || staticPackageReviewAuthorizationActive
    ? lifecycleProjection.authorityStage
    : representativeMotionReviewActive
    ? lifecycleProjection.authorityStage
    : creatorPaletteLifecycleActive
    ? lifecycleProjection.authorityStage
    : canonicalStaticBoardInputBlocked
    ? lifecycleProjection.authorityStage
    : canonicalRepairPending
    ? lifecycleProjection.authorityStage
    : layerReconstructionActive
    ? runtimeStatus.toLowerCase().replaceAll("_", "-")
    : semanticPilotReviewRequired ? "semantic-pilot-review-required" : semanticReviewRequired ? "film-look-master-semantic-review-required" : semanticReconciliationRequired ? "film-look-master-semantic-reconciliation-required" : exceptionRepairRequired ? "film-look-master-exception-repair-required" : candidateSelectionPending ? "film-look-master-auto-selection" : staticBoardReviewRequired ? "whole-film-static-board-review" : generationInputsPartial ? "film-generation-inputs-partial" : "film-generation-executable";
  const expectedApprovedMotionAction = production.release?.review540p?.status === "READY_FOR_USER_WHOLE_FILM_REVIEW"
    ? "review-current-whole-film-540p"
    : production.motion?.fullFilmMotionSpecPlan?.status === "BLOCKED_DIRTY_MOTION_ASSETS"
    ? "build-dirty-full-film-motion-assets"
    : production.motion?.fullFilmMotionSpecPlan?.status === "READY"
    ? "render-current-whole-film-540p"
    : production.motion?.representativeCanary?.status === "AGENT_OBJECTIVE_PASS"
    ? "compile-full-film-motion-specs"
    : production.motion?.representativeCanary?.status === "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW"
    ? "auto-admit-representative-motion-canary"
    : "build-representative-motion-canary";
  const expectedNextAction = visualReviewLifecycleActive
    ? lifecycleProjection.nextActionId
    : screenStoryboardReviewActive
    ? production.authority.nextAction.id
    : screenStoryboardRejectionActive
    ? production.authority.nextAction.id
    : approvedStaticBoardCurrent
    ? expectedApprovedMotionAction
    : threeAnchorVisualRepairReviewActive
    ? production.authority.nextAction.id
    : ed10LookMasterReviewActive
    ? production.authority.nextAction.id
    : consolidatedArticleQaActive
    ? production.authority.nextAction.id
    : currentArticleAssetAuthority
    ? currentArticleAssetAuthority.authorization.nextAction
    : visualReviewLifecycleActive || packageExportAuthorizationActive || staticPackageReviewAuthorizationActive
    ? lifecycleProjection.nextActionId
    : representativeMotionReviewActive
    ? lifecycleProjection.nextActionId
    : creatorPaletteLifecycleActive
    ? lifecycleProjection.nextActionId
    : canonicalStaticBoardInputBlocked
    ? lifecycleProjection.nextActionId
    : canonicalRepairPending
    ? lifecycleProjection.nextActionId
    : layerReconstructionActive
    ? "continue-integrated-presenter-package-extraction"
    : maturityStaticBoardActive
    ? "CONFIRM_WHOLE_FILM_STATIC_BOARD"
    : semanticPilotReviewRequired ? "semantic-pilot-review-required" : semanticReviewRequired ? "review-whole-film-look-master-semantics" : semanticReconciliationRequired ? "reconcile-current-look-master-bindings" : exceptionRepairRequired ? "repair-look-master-exceptions" : candidateSelectionPending ? "rank-whole-film-look-master-candidates" : staticBoardReviewRequired ? "review-whole-film-static-board" : generationInputsPartial ? "prepare-whole-film-generation-inputs" : "queue-whole-film-look-master-generation";
  assert.equal(production.filmArtDirection?.contract, "A1FilmArtDirection/v1");
  assert.equal(production.shotVisualCoveragePlan?.contract, "A1ShotVisualCoveragePlan/v1");
  assert.equal(production.shotVisualCoveragePlan.shotPlans.length, currentShotCount);
  assert.equal(production.visualProductionRun.tasks.length, currentShotCount);
  // The production run remains on the static-board checkpoint while the
  // higher-authority creator-palette preflight advances the control plane.
  // Both labels are intentional and must not be treated as drift.
  const visualStatusCompatible = production.visualProductionRun.status === expectedVisualProductionStatus
    || (creatorPaletteLifecycleActive && production.visualProductionRun.status === "WHOLE_FILM_STATIC_BOARD_READY");
  // The visual run reports input readiness; canonical title-repair lifecycle
  // remains the dispatch gate.  These are intentionally separate states.
  const canonicalRepairInputReady = canonicalRepairPending && production.visualProductionRun.status === "GENERATION_EXECUTABLE";
  assert.equal(visualStatusCompatible || canonicalRepairInputReady, true, `visual-production-status:${production.visualProductionRun.status}:${expectedVisualProductionStatus}`);
  assert.equal(production.visualProductionRun.userApprovalPolicy.perShotApprovalRequired, false);
  assert.equal(production.visualProductionRun.userApprovalPolicy.wholeFilmStaticBoardApprovalRequired, true);
  assert.equal(production.authority.currentStage, expectedAuthorityStage);
  assert.equal(production.authority.nextAction.id, expectedNextAction);
  assert.equal(production.authority.nextAction.requiresUser, visualReviewLifecycleActive
    ? lifecycleProjection.requiresExplicitApproval
    : representativeMotionReviewActive
    ? lifecycleProjection.requiresExplicitApproval
    : screenStoryboardReviewActive
    ? true
    : screenStoryboardRejectionActive
    ? false
    : approvedStaticBoardCurrent
    ? false
    : threeAnchorVisualRepairReviewActive
    ? true
    : ed10LookMasterReviewActive
    ? true
    : consolidatedArticleQaActive
    ? false
    : currentArticleAssetAuthority
    ? currentArticleAssetAuthority.authorization.requiresUser
    : visualReviewLifecycleActive || packageExportAuthorizationActive || staticPackageReviewAuthorizationActive || representativeMotionReviewActive ? lifecycleProjection.requiresExplicitApproval : maturityStaticBoardActive ? true : creatorPaletteLifecycleActive ? lifecycleProjection.requiresExplicitApproval : canonicalStaticBoardInputBlocked || canonicalRepairPending || layerReconstructionActive ? false : semanticPilotReviewRequired || semanticReviewRequired || staticBoardReviewRequired);
  if (consolidatedArticleQaActive) {
    assert.equal(production.generation.automaticDispatchAllowed, false);
    assert.equal(production.generation.workerStatus, "frozen");
    assert.ok(["NOT_CREATED", "locked-awaiting-whole-film-static-board-user-approval"].includes(production.assembly.status));
    assert.equal(production.assembly.productionWired, false);
    assert.equal(production.motion.fullMotionAllowed, false);
    assert.equal(workspace.gates?.finalRenderAllowed, false);
  } else if (currentArticleAssetAuthority) {
    assert.equal(currentArticleAssetAuthority.compositionGrammar.referenceBoundary.purpose, "VIDEO_CONSTRUCTION_AND_PACKAGING_SCHEDULING_ONLY");
    assert.equal(currentArticleAssetAuthority.compositionGrammar.referenceBoundary.aestheticReferenceAllowed, false);
    assert.equal(currentArticleAssetAuthority.compositionGrammar.referenceBoundary.currentStyleAuthority, "pinterest-retro-pixel-v1");
    assert.equal(currentArticleAssetAuthority.compositionGrammar.currentFilm.shotSchedule.length, 34);
    assert.equal(currentArticleAssetAuthority.backgroundSupplyPlan.countPolicy.maximumCount, null);
    assert.equal(currentArticleAssetAuthority.backgroundSupplyPlan.countPolicy.floorIsProductionCap, false);
    assert.equal(currentArticleAssetAuthority.boundaries.wholeFilmExpansionAllowed, false);
    assert.equal(production.generation.automaticDispatchAllowed, false);
  } else if (visualReviewLifecycleActive) {
    assert.deepEqual(production.authority.nextAction.targetShotIds || [], lifecycleProjection.targetShotIds || []);
    assert.ok(["NOT_CREATED", "locked-awaiting-whole-film-static-board-user-approval"].includes(production.assembly.status));
    assert.equal(production.assembly.productionWired, false);
    assert.equal(lifecycleProjection.motionAllowed, false);
    assert.equal(production.motion.fullMotionAllowed, false);
    assert.equal(Boolean(production.motion.aeLevelProven), false);
  } else if (representativeMotionReviewActive) {
    assert.deepEqual(production.authority.nextAction.targetShotIds || [], lifecycleProjection.targetShotIds || []);
    assert.ok(lifecycleProjection.status === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW" ? ["NOT_CREATED", "locked-awaiting-whole-film-static-board-user-approval"].includes(production.assembly.status) : production.assembly.status === "NOT_CREATED");
    assert.equal(production.assembly.productionWired, false);
    assert.equal(production.motion.status,lifecycleProjection.status === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW"?"full-film-motion-specs-ready":"preview-ready-for-review");
    assert.equal(production.motion.fullMotionAllowed,lifecycleProjection.status === "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW");
    assert.equal(Boolean(production.motion.aeLevelProven), false);
  } else if (semanticPilotReviewRequired) {
    assert.deepEqual(production.shotIntelligence.semanticPilot.targetShotIds, ["ED-12", "ED-17", "ED-09"]);
    assert.equal(production.shotIntelligence.semanticPilot.candidates.length, 3);
    assert.equal(production.shotIntelligence.semanticPilot.recommendation, null);
    assert.equal(production.shotIntelligence.semanticPilot.selected, null);
    assert.deepEqual(production.shotIntelligence.semanticPilot.currentAssembly, []);
  } else if (creatorPaletteLifecycleActive) {
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.criticAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.motionAllowed, false);
    assert.deepEqual(production.authority.nextAction.targetShotIds || [], lifecycleProjection.targetShotIds || []);
    assert.equal(production.generation.summary.queued, 0);
    assert.equal(production.generation.summary.running, 0);
    assert.equal(production.generation.workerStatus, "frozen");
  } else if (canonicalStaticBoardInputBlocked) {
    const inputReady = lifecycleProjection.inputReadinessStatus === "PASS";
    assert.deepEqual(lifecycleProjection.targetShotIds, ["ED-20"]);
    assert.equal(production.shotIntelligence.canonicalStaticBoardAuthority.status, "BLOCKED");
    assert.deepEqual(production.shotIntelligence.canonicalStaticBoardAuthority.selectionMissingShotIds, ["ED-20"]);
    assert.equal(production.shotIntelligence.wholeFilmStaticBoard.status, "SUPERSEDED_CANONICAL_INPUT_BLOCKED");
    assert.equal(production.shotIntelligence.wholeFilmStaticBoard.reviewActionDisabled, true);
    assert.equal(production.authority.nextAction.reviewGate, inputReady ? "CANONICAL_STATIC_BOARD_INPUT_GENERATION" : "CANONICAL_STATIC_BOARD_INPUTS");
    assert.equal(production.authority.nextAction.id, inputReady ? "dispatch-canonical-static-board-input-repair" : "resolve-canonical-static-board-inputs");
    assert.deepEqual(production.authority.nextAction.targetShotIds, ["ED-20"]);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.criticAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.motionAllowed, false);
  } else if (canonicalRepairPending) {
    const manifest = production.shotIntelligence.canonicalDirectorTargetRepairManifest;
    assert.equal(manifest.boardRebuilt, false);
    assert.deepEqual(manifest.targetRepairShotIds, canonicalRepairScope);
    assert.ok(manifest.generationEligibleShotIds.length > 0);
    assert.ok(manifest.generationEligibleShotIds.every((shotId) => canonicalRepairScope.includes(shotId)));
    assert.equal(manifest.generationDispatched, false);
    assert.equal(production.shotIntelligence.canonicalDirectorAuthority.status, "PASS");
    assert.deepEqual(production.authority.nextAction.targetShotIds, canonicalDispatchScope);
    assert.equal(production.packagingReview.current, false);
    assert.equal(production.generation.summary.queued, 0);
    assert.equal(production.generation.summary.running, 0);
    assert.equal(production.generation.workerStatus, "frozen");
    assert.equal(manifest.assemblyStarted, false);
    assert.deepEqual(production.shotIntelligence.wholeFilmBatchRecommendation.currentAssembly || [], []);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.criticAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.motionAllowed, false);
  } else if (semanticReviewRequired) {
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.explorationOnly, true);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.autoRecommendationAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.outputDeduplication.actualJobCount, 26);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.outputDeduplication.actualUniqueCandidateCount, 23);
    assert.equal(production.shotIntelligence.wholeFilmBatchRecommendation.outputDeduplication.duplicateCandidateCount, 3);
    assert.equal(production.shotIntelligence.packageLookMasterPlans.filter((item) => item.provisionalWholeFilmBoardSelection).length, 0);
  } else if (exceptionRepairRequired) {
    const batch = production.shotIntelligence.wholeFilmBatchRecommendation;
    assert.equal(batch.status, "PARTIAL_WITH_EXCEPTIONS");
    assert.equal(batch.reconciliationStatus, "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED");
    const exceptionShotIds = [...new Set(batch.exceptions.map((item) => item.shotId))].sort();
    assert.ok(exceptionShotIds.length > 0);
    assert.deepEqual([...(production.authority.nextAction.targetShotIds || [])].sort(), exceptionShotIds);
    assert.equal(batch.assemblyCreationAllowed, false);
    assert.equal(batch.layerReconstructionAllowed, false);
    assert.equal(batch.criticAllowed, false);
    assert.equal(batch.motionAllowed, false);
  } else if (semanticReconciliationRequired) {
    const batch = production.shotIntelligence.wholeFilmBatchRecommendation;
    assert.equal(batch.status, "PARTIAL_WITH_EXCEPTIONS");
    assert.equal(batch.nextUserGate, null);
    assert.equal(batch.reconciliationRequired, true);
    assert.equal(batch.assemblyCreationAllowed, false);
    assert.equal(batch.layerReconstructionAllowed, false);
    assert.equal(batch.currentAssembly.length, 0);
    assert.equal(batch.rebindRecords.length, 12);
    assert.equal(production.shotIntelligence.packageLookMasterPlans.length, 12);
    assert.equal(production.shotIntelligence.packageAssetKitPlans.every((item) => item.current === false && item.authorityScope === "HISTORY_READ_ONLY"), true);
  } else if (candidateSelectionPending) {
    const batch = production.shotIntelligence.wholeFilmBatchRecommendation;
    assert.equal(batch.status, "PARTIAL_WITH_EXCEPTIONS");
    assert.equal(batch.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
    assert.equal(batch.autoRecommendationAllowed, false);
    assert.equal(batch.assemblyCreationAllowed, false);
    assert.equal(batch.layerReconstructionAllowed, false);
    if (semanticTimelineReconciled) {
      assert.equal(production.shotIntelligence.decisionSet.summary.packageCount, 12);
      assert.equal(production.shotVisualCoveragePlan.shotPlans.find((item) => item.shotId === "ED-01")?.route, "PRESENTER_BASE");
      assert.equal((batch.exceptions || []).some((item) => item.shotId === "ED-01"), false);
    } else {
      assert.ok((batch.exceptions || []).length > 0);
    }
    assert.deepEqual(batch.currentAssembly || [], []);
  } else if (ed10LookMasterReviewActive) {
    const batch = production.shotIntelligence.wholeFilmBatchRecommendation;
    assert.equal(batch.status, "VISUAL_REPLACEMENT_REQUIRED");
    assert.equal(batch.nextUserGate, "ED10_LOOK_MASTER_REPLACEMENT");
    assert.equal(batch.autoRecommendationAllowed, false);
    assert.equal(batch.assemblyCreationAllowed, false);
    assert.equal(batch.layerReconstructionAllowed, false);
    assert.equal(batch.criticAllowed, false);
    assert.equal(batch.motionAllowed, false);
    assert.deepEqual(batch.currentAssembly || [], []);
  } else if (generationInputsPartial) {
    const batch = production.shotIntelligence.wholeFilmBatchRecommendation;
    assert.equal(batch.status, "PARTIAL_WITH_EXCEPTIONS");
    assert.equal(batch.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
    assert.equal(batch.autoRecommendationAllowed, false);
    assert.equal(batch.assemblyCreationAllowed, false);
    assert.ok((batch.exceptions || []).some((item) => item.code === "REQUIRED_RESEARCH_SOURCE_PACKET_BLOCKED"));
  } else if (screenStoryboardRejectionActive) {
    const wave = production.shotIntelligence.currentStoryboardAuthority.screenStoryboardWave;
    assert.equal(wave.userVisualApproval, "REJECTED");
    assert.equal(wave.revisionCount, 15);
    assert.equal(production.motion.fullMotionAllowed, false);
    assert.equal(workspace.gates?.finalRenderAllowed, false);
  } else if (approvedStaticBoardCurrent) {
    const batch = production.shotIntelligence.wholeFilmBatchRecommendation;
    assert.equal(batch.status, "WHOLE_FILM_STATIC_BOARD_APPROVED");
    assert.equal(batch.nextUserGate, "APPROVED_MASTER_RASTER_SLICE_MOTION_BUILD");
    assert.equal(batch.layerReconstructionAllowed, false);
    assert.equal(batch.assemblyCreationAllowed, false);
    assert.equal(batch.motionAllowed, false);
    assert.deepEqual(batch.currentAssembly || [], []);
  } else if (staticBoardReviewRequired) {
    const batch = production.shotIntelligence.wholeFilmBatchRecommendation;
    assert.equal(batch.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
    assert.equal(batch.layerReconstructionAllowed, false);
    const historicalGenerationJobCount = batch.outputDeduplication.historicalGenerationJobCount ?? batch.outputDeduplication.actualJobCount;
    const currentFinalizedShotCount = batch.outputDeduplication.currentFinalizedShotCount ?? batch.finalizedShotIds.length;
    assert.equal(historicalGenerationJobCount, batch.outputDeduplication.actualJobCount);
    assert.equal(currentFinalizedShotCount, batch.finalizedShotIds.length);
    if (batch.outputDeduplication.currentFinalizedShotIds) assert.deepEqual([...batch.outputDeduplication.currentFinalizedShotIds].sort(), [...batch.finalizedShotIds].sort());
    assert.ok(historicalGenerationJobCount >= currentFinalizedShotCount, "historical generation jobs may exceed current finalized shots");
    assert.equal(batch.outputDeduplication.actualUniqueCandidateCount + batch.outputDeduplication.duplicateCandidateCount, batch.outputDeduplication.actualJobCount);
    assert.ok(batch.outputDeduplication.duplicates.every((item) => item.scope === "SAME_SHOT"));
    assert.equal(new Set((batch.staticBoard?.items || []).map((item) => item.artifactSha256)).size, batch.finalizedShotIds.length);
  }
const packagingPlanAuthorityScope = plan.authorityScope || (plan.contract === "A1PackagingBeatPlan/v1" ? "HISTORY_READ_ONLY" : null);
assert.ok(["HISTORY_READ_ONLY", "DERIVED_FROM_SHOT_VISUAL_COVERAGE_PLAN"].includes(packagingPlanAuthorityScope));
assert.notEqual(plan.current, true);
  assert.equal(production.packagingReview.current, false);
  if (layerReconstructionActive) assert.ok(production.generation.summary.queued > 0);
  else assert.equal(production.generation.summary.queued, 0);
  assert.equal(production.generation.summary.running, 0);
  assert.equal(production.generation.workerStatus, "frozen");
  console.log(JSON.stringify({
    status: "PASS",
    scope: currentArticleAssetAuthority ? "CURRENT_FACELESS_ARTICLE_ASSET_PRODUCTION" : "ARTICLE_DRIVEN_FILM_VISUAL_PRODUCTION",
    currentStage: production.authority.currentStage,
    nextAction: production.authority.nextAction.id,
    articleDrivenShotCount: currentShotCount,
    productionReadyCount: production.visualProductionRun.counts.readyCount,
    queue: production.generation.summary,
    worker: production.generation.workerStatus,
  }, null, 2));
  process.exit(0);
}
const authorityByRuntimeStatus = {
  LOOK_MASTER_PLANS_READY: {stage: "look-master-plans-ready", action: "generate-package-look-master-candidates", requiresUser: false},
  LOOK_MASTER_CANDIDATES_READY: {stage: "look-master-candidates-ready", action: "audit-and-rank-package-look-masters", requiresUser: false},
  LOOK_MASTER_REVIEW_REQUIRED: {stage: "look-master-review-required", action: "review-user-screened-look-master-shortlist", requiresUser: true},
  LAYER_RECONSTRUCTION_READY: {stage: "layer-reconstruction-ready", action: "reconstruct-approved-look-master-layers", requiresUser: false},
  LAYER_RECONSTRUCTION_IN_PROGRESS: {stage: "layer-reconstruction-in-progress", action: "continue-look-master-layer-reconstruction", requiresUser: false},
  ASSEMBLY_PARITY_REVIEW_REQUIRED: {stage: "assembly-parity-review-required", action: "verify-reconstructed-assembly-parity", requiresUser: false},
  ASSEMBLY_REVIEW_REQUIRED: {stage: "assembly-review-required", action: "review-recommended-package-assembly", requiresUser: true},
  MOTION_READY: {stage: "motion-ready", action: "build-package-motion-ir", requiresUser: false},
};
const expectedAuthority = ed10TrialBlocked
  ? {stage: "package-assembly-recovery", action: "rebuild-ed10-four-layer-trial-after-ocr-block", requiresUser: false}
  : production.wholeFilmPackagingDirection?.contract === "A1WholeFilmPackagingDirection/v1"
  ? {stage: "film-visual-production-ready", action: "film-visual-production-ready", requiresUser: false}
  : perShotRuntime && authorityByRuntimeStatus[runtimeStatus]
  ? authorityByRuntimeStatus[runtimeStatus]
  : {stage: "packaging-map-review", action: "review-packaging-map-and-anchors", requiresUser: true};
assert.equal(production.authority.currentStage, expectedAuthority.stage);
assert.equal(production.authority.nextAction.id, expectedAuthority.action);
assert.equal(production.authority.nextAction.requiresUser, expectedAuthority.requiresUser);
if (!perShotRuntime) assert.deepEqual([...activeIds].sort(), plan.packagingEvents.map((event) => event.sourceBeatIds[0]).sort());
assert.equal(production.authority.exceptionQueue.items.some((item) => ["ED-02", "ED-03", "ED-32"].includes(item.shotId)), false);
assert.equal(production.designCalibrationBatch.items.some((item) => ["ED-03", "ED-32"].includes(item.shotId)), false);
const ed03 = workspace.library.assets.find((asset) => asset.shotDemand?.shotId === "ED-03");
assert.equal(Boolean(ed03?.automationBlock), false);
assert.equal(production.presentationRendererProof.status, "SUPERSEDED");
assert.equal(production.legacyVisualAuthority.status, "SUPERSEDED");
assert.equal(production.presentationDecisions.advisoryOnly, true);
assert.equal(production.materialManifestV2.advisoryOnly, true);
assert.equal(production.generation.summary.queued, 0);
assert.equal(production.generation.summary.running, 0);
assert.equal(production.generation.workerStatus, "frozen");
assert.equal(production.generation.automaticDispatchAllowed, false);
assert.equal(production.shotIntelligence.packageLookMasterPlans.length, production.shotIntelligence.decisionSet.summary.packageCount);
const activeLookMasterCount = (item) => Number(item.activeCandidateSet?.candidateCount || item.comparativeReviewBoard?.candidateCount || item.comparativeReview?.rankings?.length || item.fastCandidateDiscovery?.effectiveDirectionCount || 0);
const lookMasterCandidateCount = production.shotIntelligence.packageLookMasterPlans.reduce((sum, item) => sum + activeLookMasterCount(item), 0);
const lookMasterRawCount = (production.shotIntelligence.lookMasterRawReferences || []).length;
if (["LOOK_MASTER_REVIEW_REQUIRED", "LOOK_MASTER_CANDIDATES_READY"].includes(runtimeStatus)) {
  assert.ok(lookMasterCandidateCount >= 2);
  assert.ok(lookMasterRawCount >= lookMasterCandidateCount);
  assert.equal(production.shotIntelligence.packageLookMasterPlans.filter((item) => item.recommendation?.requiresUserConfirmation === true).length, workspace.production.packagingReview?.status === "LOOK_MASTER_REVIEW_REQUIRED" ? 0 : 1);
} else if (["ASSEMBLY_REVIEW_REQUIRED", "ASSEMBLY_PARITY_REVIEW_REQUIRED"].includes(runtimeStatus)) {
  // The live lane may have one auto-selected/reconstructed package while the
  // remaining package events stay plan-only.  The user gate is the Assembly,
  // never an intermediate Look Master approval.
  assert.ok(lookMasterCandidateCount >= 1);
  if (runtimeStatus === "ASSEMBLY_REVIEW_REQUIRED" && production.shotIntelligence.packageLookMasterPlans.some((item) => item.shotId === "ED-10")) {
    const ed10Plan = production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
    assert.equal(activeLookMasterCount(ed10Plan), 2, "active count is the user-screened C02/C04 shortlist");
    assert.equal(ed10Plan.explorationCandidates.length, 4, "all recovered candidate records remain available as history/evidence");
  }
  assert.ok(production.shotIntelligence.packageLookMasterPlans.some((item) => item.selectedLookMasterBinding?.status === "BATCH_RANKED_AUTO_SELECTED" || (item.selectedLookMasterBinding?.status === "VISUAL_APPROVED" && item.selectedLookMasterBinding?.selectedBy === "system")));
} else {
  assert.equal(lookMasterCandidateCount, 0);
  assert.equal(lookMasterRawCount, 0);
}
assert.ok(production.shotIntelligence.packageAssetKitPlans.every((item) => ["WAITING_FOR_LOOK_MASTER", "PLAN_READY", "RECONSTRUCTING", "ASSEMBLY_REVIEW_REQUIRED", "ASSEMBLY_PARITY_REVIEW_REQUIRED", "LAYER_RECONSTRUCTION_READY", "LAYER_RECONSTRUCTION_IN_PROGRESS", "GENERATION_PLAN_ONLY", "HISTORY_READ_ONLY"].includes(item.status)));
if (["ASSEMBLY_REVIEW_REQUIRED", "ASSEMBLY_PARITY_REVIEW_REQUIRED"].includes(runtimeStatus)) {
  const selectedKit = production.shotIntelligence.packageAssetKitPlans.find((item) => item.selectedLookMasterBinding?.status === "BATCH_RANKED_AUTO_SELECTED" || (item.selectedLookMasterBinding?.status === "VISUAL_APPROVED" && item.selectedLookMasterBinding?.selectedBy === "system"));
  assert.ok(selectedKit, "assembly review must retain the auto-selected master binding");
  assert.equal(selectedKit.selectedLookMasterBinding.userApprovalRequired, false);
}
assert.ok(plan.packagingEventCount >= 3);
assert.equal(production.packagingAnchorProof.status, "READY_FOR_REVIEW");
assert.equal(production.packagingAnchorProof.generationPerformed, true);
assert.equal(production.packagingAnchorProof.criticPerformed, false);
assert.equal(production.packagingAnchorProof.motionPreviewPerformed, false);
assert.equal(production.packagingAnchorProof.fullFilmRenderPerformed, false);
assert.equal(production.packagingAnchorProof.samplingContract, "A1PackagingAnchorSampling/v1");
assert.equal(production.packagingAnchorProof.maxAnchors, 3);
assert.equal(production.packagingAnchorProof.anchorSampleLimit, 3);
assert.ok(production.packagingAnchorProof.eventIds.length <= 3);
assert.ok(production.packagingAnchorProof.eventIds.every((eventId) => plan.packagingEvents.some((event) => event.eventId === eventId)));
console.log(JSON.stringify({status: "PASS", currentStage: production.authority.currentStage, nextAction: production.authority.nextAction.id, activePackagingEvents: [...activeIds].sort(), noPackageCount: plan.noPackageCount, oldSixShotProof: production.presentationRendererProof.status, queue: production.generation.summary, worker: production.generation.workerStatus}, null, 2));
