#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertShotPresentationSystem} from "../apps/studio-next/src/lib/a1-shot-presentation-system-v1.mjs";
import {canonicalTitleRepairCheckpoint, derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/workspace.json");
const source = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const workspace = assertShotPresentationSystem(recalculateEditorialAssetWorkbench(structuredClone(source), "2026-08-04T03:30:00.000Z"));
const decisions = workspace.production.presentationDecisions;
const manifest = workspace.production.materialManifestV2;
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(decisions.status === "compiled-layout-preflight-passed", "presentation-decision-set-not-ready");
check(decisions.items.length === 34, `presentation-decision-count:${decisions.items.length}`);
check(decisions.items.every((item) => item.layoutApproved && item.whyThisChoice && item.whyNotAlternatives.length), "presentation-decision-explanation-or-preflight-missing");
check(decisions.sequenceAudit.genericTitleExecutorCount === 0, "generic-title-executor-present");
check(decisions.sequenceAudit.ordinaryExplanationTypePrimaryCount === 0, "ordinary-explanation-promoted-to-type-primary");
check(new Set(decisions.items.map((item) => item.rendererExecutor)).size >= 5, "renderer-executor-family-diversity-insufficient");

for (const [first, last] of [["ED-02", "ED-06"], ["ED-24", "ED-30"]]) {
  const firstOrder = decisions.items.find((item) => item.shotId === first)?.order || 0;
  const lastOrder = decisions.items.find((item) => item.shotId === last)?.order || 0;
  const run = decisions.items.filter((item) => item.order >= firstOrder && item.order <= lastOrder);
  check(run.every((item) => item.informationOwner === "real-screen"), `${first}-${last}-not-real-screen-owned`);
  check(new Set(run.map((item) => item.frameOccupation)).size >= 3, `${first}-${last}-sequence-layout-variation-insufficient`);
}

check(manifest.contract === "A1MaterialManifest/v2", "material-manifest-v2-missing");
check(manifest.items.length === workspace.assetRequirementGraph.requirements.length, "material-manifest-slot-coverage-incomplete");
check(manifest.summary.nonGeneratableCount >= 54, `non-generatable-source-boundary-too-low:${manifest.summary.nonGeneratableCount}`);
check(manifest.items.filter((item) => /(?:source|type|deterministic)/u.test(item.route)).every((item) => item.generatable === false), "source-or-local-route-marked-generatable");
check(manifest.items.every((item) => !item.dispatchAllowed || (item.generatable && item.layoutDependency.layoutApproved && item.admissionScope !== "family-locked")), "material-dispatch-predicate-bypassed");
check(manifest.generationEntries.every((item) => !item.dispatchAllowed || (item.generatable && item.outputRequired && item.layoutApproved && item.admissionScope !== "family-locked")), "asset-generation-dispatch-predicate-bypassed");
check(manifest.policy.blindFullFilmGenerationAllowed === false && manifest.policy.maximumGenerationConcurrency === 2, "blind-generation-or-concurrency-policy-invalid");
check(workspace.gates.exactAssetBindingsComplete === false, "candidate-library-bindings-misreported-as-exact");
const currentArticleAssetAuthority = workspace.production.articleAssetProductionAuthority?.current === true
  ? workspace.production.articleAssetProductionAuthority
  : null;
const lifecycleProjection = derivePackagingLifecycleProjection(workspace);
const currentLifecycleAuthorityAligned = lifecycleProjection.authorityStage === workspace.production.authority?.currentStage
  && lifecycleProjection.nextActionId === workspace.production.authority?.nextAction?.id;
const currentLifecycleUserGateActive = currentLifecycleAuthorityAligned
  && lifecycleProjection.requiresExplicitApproval === true
  && workspace.production.authority?.nextAction?.requiresUser === true;
const wholeFilmStaticBoardReviewActive = lifecycleProjection.status === "WHOLE_FILM_STATIC_BOARD_READY"
  && lifecycleProjection.nextActionId === "review-whole-film-static-board";
const canonicalRepairPending = canonicalTitleRepairCheckpoint(workspace);
const canonicalTitleRepairBindingRequired = lifecycleProjection.status === "CANONICAL_TITLE_REPAIR_BINDING_REQUIRED";
const creatorPaletteLifecycleActive = [
  "CREATOR_PACKAGING_PALETTE_REVIEW",
  "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_MISSING_LANE_C",
  "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_LANE_C_TARGET_UNRESOLVED",
  "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED",
  "CREATOR_PACKAGING_PALETTE_APPROVED_PREFLIGHT_REQUIRED",
  "CREATOR_PACKAGING_PALETTE_SYSTEM_APPROVED_PREFLIGHT_REQUIRED",
].includes(lifecycleProjection.status);
const consolidatedArticleQaStage = workspace.production.authority?.currentStage === "article-assets"
  && workspace.production.authority?.nextAction?.id === "automatic-article-packaging-qa";
const currentArticleAssetBoundaryClosed = consolidatedArticleQaStage
  || currentArticleAssetAuthority?.boundaries?.wholeFilmExpansionAllowed === false;
// `shotCompositionAllowed` belongs to the superseded whole-film/presenter
// pipeline.  The current faceless asset lane deliberately keeps that gate
// closed while it builds independently reviewable static supplies.
check(currentArticleAssetAuthority || consolidatedArticleQaStage
  ? workspace.gates.shotCompositionAllowed === false
    && currentArticleAssetBoundaryClosed
  : currentLifecycleUserGateActive
    ? workspace.gates.shotCompositionAllowed === false
      && workspace.gates.packagingDeliveryGates?.layerReconstructionAllowed === false
      && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
  : wholeFilmStaticBoardReviewActive
    ? workspace.gates.shotCompositionAllowed === false
      && workspace.gates.packagingDeliveryGates?.layerReconstructionAllowed === false
      && workspace.gates.packagingDeliveryGates?.assemblyCreationAllowed === false
    : canonicalRepairPending
      ? workspace.gates.shotCompositionAllowed === false
        && workspace.gates.packagingDeliveryGates?.layerReconstructionAllowed === false
        && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
    : canonicalTitleRepairBindingRequired
      ? workspace.gates.shotCompositionAllowed === false
        && workspace.gates.packagingDeliveryGates?.layerReconstructionAllowed === false
        && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
    : creatorPaletteLifecycleActive
      ? workspace.gates.shotCompositionAllowed === false
        && workspace.gates.packagingDeliveryGates?.layerReconstructionAllowed === false
        && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
    : workspace.gates.shotCompositionAllowed === true,
"shot-composition-gate-not-aligned-with-current-lane");
const packagingActive = workspace.production.packagingBeatPlan?.contract === "A1PackagingBeatPlan/v1";
const deliveryGate = workspace.gates.packagingDeliveryGates || {};
if (currentArticleAssetAuthority) {
  const grammar = currentArticleAssetAuthority.compositionGrammar;
  const supply = currentArticleAssetAuthority.backgroundSupplyPlan;
  const varietyBatch = currentArticleAssetAuthority.nextBackgroundVarietyBatchPlan;
  const currentNextAction = workspace.production.authority?.nextAction;
  check(currentArticleAssetAuthority.status === "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW", "current-article-asset-authority-status-invalid");
  check(grammar?.contract === "A1EditorialVideoCompositionGrammar/v1"
    && grammar.referenceBoundary?.purpose === "VIDEO_CONSTRUCTION_AND_PACKAGING_SCHEDULING_ONLY"
    && grammar.referenceBoundary?.aestheticReferenceAllowed === false
    && grammar.referenceBoundary?.currentStyleAuthority === "pinterest-retro-pixel-v1"
    && grammar.currentFilm?.shotCount === 34
    && grammar.currentFilm?.shotSchedule?.length === 34,
  "current-video-composition-grammar-invalid");
  check(grammar.currentFilm.shotSchedule.every((item) => item.aestheticAuthority === "pinterest-retro-pixel-v1"), "current-shot-schedule-aesthetic-authority-drifted");
  check(supply?.contract === "A1BackgroundSupplyPlan/v1"
    && supply.status === "OPEN_LIBRARY_EXPANSION_ACTIVE"
    && supply.countPolicy?.maximumCount === null
    && supply.countPolicy?.floorIsProductionCap === false
    && supply.coverage?.laneComplete === false,
  "current-open-background-supply-invalid");
  check(varietyBatch?.contract === "A1BackgroundVarietyBatchPlan/v1"
    && varietyBatch.structureReferenceUse === "STRUCTURE_ONLY_NOT_AESTHETICS"
    && varietyBatch.batch?.imageGenerationPerformed === false,
  "current-background-variety-batch-invalid");
  check(currentNextAction?.id === currentArticleAssetAuthority.authorization?.nextAction
    && currentNextAction?.id === "REVIEW_DEFAULT_LIBRARY_BACKGROUND_WAVE"
    && currentNextAction?.requiresUser === true
    && workspace.production.generation?.automaticDispatchAllowed === false
    && workspace.production.generation?.workerStatus === "frozen",
  "current-article-asset-next-action-or-freeze-invalid");
} else if (creatorPaletteLifecycleActive) {
  const laneCTargetStillUnresolved = [
    "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_MISSING_LANE_C",
    "CREATOR_PACKAGING_PALETTE_REVIEW_BLOCKED_LANE_C_TARGET_UNRESOLVED",
  ].includes(lifecycleProjection.status);
  const currentPaletteBindingRepair = lifecycleProjection.status === "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED";
  const canonicalSequence = workspace.production.canonicalCreatorPackagingSequence;
  const currentPackageCount = canonicalSequence?.decisions?.filter((item) => item.packageDecision === "PACKAGE").length || 0;
  const currentNoPackageCount = canonicalSequence?.decisions?.filter((item) => item.packageDecision === "NO_PACKAGE").length || 0;
  const currentBindingBlockers = workspace.production.creatorPaletteShotBindingManifest?.blockers || [];
  check(workspace.gates.acceptedShotIrAllowed === false
    && (laneCTargetStillUnresolved
      ? deliveryGate.blockers?.includes("LANE_C_TARGET_UNRESOLVED")
      : currentPaletteBindingRepair
      ? JSON.stringify(deliveryGate.blockers || []) === JSON.stringify(currentBindingBlockers)
        || currentBindingBlockers.every((blocker) => (deliveryGate.blockers || []).includes(blocker))
          && deliveryGate.packageEventCount === currentPackageCount
          && deliveryGate.noPackageCount === currentNoPackageCount
        : false)
    && deliveryGate.legacyWholeFilmBlockers?.includes("all-shot-material-slots-must-be-exact-before-full-accepted-ir"), "creator-palette-delivery-gate-projection-invalid");
} else if (canonicalTitleRepairBindingRequired) {
  check(workspace.gates.acceptedShotIrAllowed === false
    && deliveryGate.blockers?.some((blocker) => String(blocker).startsWith("CANONICAL_TITLE_REPAIR_PIXEL_PASS_NOT_BOUND_TO_CURRENT_PLAN:"))
    && deliveryGate.legacyWholeFilmBlockers?.includes("all-shot-material-slots-must-be-exact-before-full-accepted-ir"), "canonical-repair-binding-delivery-gate-projection-invalid");
} else {
  check(workspace.gates.acceptedShotIrAllowed === false && deliveryGate.blockers?.length === 0 && deliveryGate.legacyWholeFilmBlockers?.includes("all-shot-material-slots-must-be-exact-before-full-accepted-ir"), "packaging-lane-still-blocked-by-whole-film-gate");
}

if (currentArticleAssetAuthority) {
  check(workspace.gates.acceptedShotIrAllowed === false
    && deliveryGate.legacyWholeFilmBlockers?.includes("all-shot-material-slots-must-be-exact-before-full-accepted-ir"),
  "current-article-asset-delivery-freeze-invalid");
} else if (creatorPaletteLifecycleActive) {
  const expectedTargetShotIds = [...(lifecycleProjection.targetShotIds || [])].sort();
  const actualTargetShotIds = [...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort();
  check(workspace.production.packagingLifecycleProjection?.status === lifecycleProjection.status, "creator-palette-lifecycle-projection-invalid");
  check(workspace.production.authority?.currentStage === lifecycleProjection.authorityStage, "creator-palette-authority-stage-not-aligned");
  check(workspace.production.authority?.nextAction?.id === lifecycleProjection.nextActionId
    && workspace.production.authority?.nextAction?.requiresUser === lifecycleProjection.requiresExplicitApproval
    && JSON.stringify(actualTargetShotIds) === JSON.stringify(expectedTargetShotIds), "creator-palette-authority-next-action-not-aligned");
  check(workspace.production.packagingLifecycleProjection?.reviewActionDisabled === lifecycleProjection.reviewActionDisabled, "creator-palette-review-action-projection-invalid");
  check(workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false, "creator-palette-assembly-not-locked");
  check(workspace.production.generation?.automaticDispatchAllowed === false && workspace.production.generation?.workerStatus === "frozen", "creator-palette-generation-not-frozen");
} else if (canonicalTitleRepairBindingRequired) {
  check(workspace.production.packagingLifecycleProjection?.status === lifecycleProjection.status, "canonical-repair-binding-lifecycle-projection-invalid");
  check(workspace.production.authority?.currentStage === lifecycleProjection.authorityStage, "canonical-repair-binding-authority-stage-not-aligned");
  check(workspace.production.authority?.nextAction?.id === lifecycleProjection.nextActionId
    && workspace.production.authority?.nextAction?.requiresUser === false
    && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify([...(lifecycleProjection.targetShotIds || [])].sort()), "canonical-repair-binding-next-action-not-aligned");
  check(workspace.production.packagingLifecycleProjection?.reviewActionDisabled === true, "canonical-repair-binding-review-action-not-disabled");
} else if (canonicalRepairPending) {
  const authority = workspace.production.shotIntelligence.canonicalDirectorAuthority;
  const targetManifest = workspace.production.shotIntelligence.canonicalDirectorTargetRepairManifest;
  const ed32 = authority.decisions.find((item) => item.shotId === "ED-32");
  check(targetManifest.targetRepairShotIds.join(",") === "ED-07,ED-08,ED-13,ED-19", "canonical-repair-scope-invalid");
  check(ed32?.canonicalMedium === "presenter-clean" && ed32?.canonicalPackageDecision === "NO_PACKAGE" && ed32?.canonicalTypographyVisualRole === "NONE" && ed32?.generationAllowed === false, "canonical-ed32-no-generation-ruling-invalid");
  check(workspace.production.packagingLifecycleProjection?.status === "CANONICAL_TITLE_REPAIR_PENDING", "canonical-repair-lifecycle-projection-invalid");
  const eligibleCanonicalRepairShotIds = [...(targetManifest.generationEligibleShotIds || [])].sort();
  check(workspace.production.authority?.nextAction?.id === "dispatch-canonical-title-repair"
    && workspace.production.authority?.nextAction?.requiresUser === false
    && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify(eligibleCanonicalRepairShotIds), "authority-next-action-not-aligned-with-canonical-repair");
  check(workspace.production.packagingLifecycleProjection?.reviewActionDisabled === true, "canonical-repair-review-action-not-disabled");
} else if (packagingActive) {
  const plan = workspace.production.packagingBeatPlan;
  check(plan.semanticBeatCount === workspace.article.shotCount, "packaging-semantic-beat-coverage-incomplete");
  check(plan.packagingEventCount < plan.semanticBeatCount && plan.noPackageCount > plan.packagingEventCount, "packaging-plan-not-sparse");
  for (const shotId of ["ED-02", "ED-03", "ED-32"]) {
    const item = plan.items.find((entry) => entry.beatId === shotId);
    check((item?.sequenceReview?.finalPackageDecision || item?.packageDecision) === "NO_PACKAGE", `${shotId}-must-be-no-package`);
    check(!workspace.production.authority?.exceptionQueue?.items?.some((entry) => entry.shotId === shotId), `${shotId}-still-active-visual-exception`);
  }
  check(workspace.production.presentationRendererProof?.status === "SUPERSEDED", "legacy-static-proof-not-superseded");
  check(workspace.production.presentationDecisions?.advisoryOnly === true && workspace.production.materialManifestV2?.advisoryOnly === true, "legacy-presentation-authority-not-advisory");
  const authorityByRuntimeStatus = {
    LOOK_MASTER_PLANS_READY: {id: "generate-package-look-master-candidates", requiresUser: false},
    LOOK_MASTER_CANDIDATES_READY: {id: "audit-and-rank-package-look-masters", requiresUser: false},
    LOOK_MASTER_REVIEW_REQUIRED: {id: "review-recommended-package-look-master", requiresUser: true},
    LAYER_RECONSTRUCTION_READY: {id: "reconstruct-approved-look-master-layers", requiresUser: false},
    LAYER_RECONSTRUCTION_IN_PROGRESS: {id: "continue-integrated-presenter-package-extraction", requiresUser: false},
    ASSEMBLY_PARITY_REVIEW_REQUIRED: {id: "verify-reconstructed-assembly-parity", requiresUser: false},
    // The active packaging lane auto-selects the winning Look Master and only
    // stops for the user at the recommended Assembly.  Keep the old
    // LOOK_MASTER_REVIEW_REQUIRED entry above for history fixtures, but never
    // require that intermediate approval in the live lane.
    ASSEMBLY_REVIEW_REQUIRED: {id: "review-recommended-package-assembly", requiresUser: true},
    MOTION_READY: {id: "build-package-motion-ir", requiresUser: false},
  };
  const expectedAuthority = authorityByRuntimeStatus[workspace.production.shotIntelligence?.status];
  const wholeFilmDirectionActive = workspace.production.wholeFilmPackagingDirection?.contract === "A1WholeFilmPackagingDirection/v1";
  const wholeFilmReconciliationActive = workspace.production.authority?.currentStage === "film-look-master-semantic-reconciliation-required"
    && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === true;
  const wholeFilmExceptionRepairActive = workspace.production.authority?.currentStage === "film-look-master-exception-repair-required"
    && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.reconciliationRequired === false;
  const currentExceptionShotIds = [...new Set((workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.exceptions || [])
    .map((item) => item?.shotId)
    .filter(Boolean))].sort();
  const semanticPilotActive = String(workspace.production.shotIntelligence?.status || "").startsWith("SEMANTIC_PILOT");
  const layerReconstructionActive = ["LAYER_RECONSTRUCTION_READY", "LAYER_RECONSTRUCTION_IN_PROGRESS"].includes(String(workspace.production.shotIntelligence?.status || ""));
  const authorityNextAction = typeof workspace.production.authority?.nextAction === "string"
    ? workspace.production.authority.nextAction
    : workspace.production.authority?.nextAction?.id;
  const semanticPilotAuthorityIds = new Set([
    "review-whole-film-look-master-semantics",
    "run-semantic-pilot-single-images",
    "semantic-pilot-review-required",
  ]);
  const maturityAuthority = workspace.production.goldenFilmVisualSystemMaturity;
  const maturityStaticBoardActive = maturityAuthority?.current === true
    && maturityAuthority.status === "WHOLE_FILM_STATIC_BOARD"
    && maturityAuthority.nextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD";
  const representativeMotionReviewActive = lifecycleProjection.status === "REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW";
  const packageExportAuthorizationActive = lifecycleProjection.status === "PACKAGE_EXPORT_AUTHORIZATION_REQUIRED";
  const visualRepairActive = lifecycleProjection.status === "VISUAL_REPAIR_REQUIRED";
  const consolidatedArticleQaActive = workspace.production.authority?.currentStage === "article-assets"
    && authorityNextAction === "automatic-article-packaging-qa"
    && workspace.production.authority?.nextAction?.requiresUser === false;
  const staticPackageReviewAuthorizationActive = lifecycleProjection.status === "PACKAGING_DELIVERY_ARCHITECTURE_READY_EXTERNAL_GATES_BLOCKED"
    && lifecycleProjection.nextActionId === "AUTHORIZE_PACKAGE_STATIC_REVIEW"
    && workspace.production.authority?.currentStage === lifecycleProjection.authorityStage;
  check(consolidatedArticleQaActive
    ? authorityNextAction === "automatic-article-packaging-qa"
      && workspace.production.authority?.currentStage === "article-assets"
      && workspace.production.authority?.nextAction?.requiresUser === false
      && workspace.production.authority?.nextAction?.reviewGate == null
    : packageExportAuthorizationActive
    ? authorityNextAction === "AUTHORIZE_PACKAGE_EXPORT"
      && workspace.production.authority?.nextAction?.requiresUser === true
      && workspace.production.authority?.nextAction?.reviewGate === "PACKAGE_EXPORT_AUTHORIZATION"
    : representativeMotionReviewActive
    ? authorityNextAction === lifecycleProjection.nextActionId
      && workspace.production.authority?.nextAction?.requiresUser === lifecycleProjection.requiresExplicitApproval
      && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify([...(lifecycleProjection.targetShotIds || [])].sort())
    : staticPackageReviewAuthorizationActive
    ? authorityNextAction === "AUTHORIZE_PACKAGE_STATIC_REVIEW"
      && workspace.production.authority?.nextAction?.requiresUser === true
      && workspace.production.authority?.nextAction?.reviewGate === "DELEGATED_OBJECTIVE_VISUAL_GATE"
    : visualRepairActive
    ? authorityNextAction === lifecycleProjection.nextActionId
      && workspace.production.authority?.currentStage === lifecycleProjection.authorityStage
      && workspace.production.authority?.nextAction?.requiresUser === lifecycleProjection.requiresExplicitApproval
      && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify([...(lifecycleProjection.targetShotIds || [])].sort())
      && workspace.production.authority?.nextAction?.reviewGate === lifecycleProjection.nextUserGate
    : canonicalTitleRepairBindingRequired
    ? authorityNextAction === lifecycleProjection.nextActionId
      && workspace.production.authority?.currentStage === lifecycleProjection.authorityStage
      && workspace.production.authority?.nextAction?.requiresUser === false
      && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify([...(lifecycleProjection.targetShotIds || [])].sort())
      && workspace.production.authority?.nextAction?.reviewGate === lifecycleProjection.nextUserGate
    : wholeFilmStaticBoardReviewActive
    ? authorityNextAction === "review-whole-film-static-board"
      && workspace.production.authority?.currentStage === "whole-film-static-board-review"
      && workspace.production.authority?.nextAction?.requiresUser === true
      && workspace.production.authority?.nextAction?.reviewGate === "WHOLE_FILM_STATIC_BOARD"
      && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify([])
      && lifecycleProjection.approvalAllowed === true
      && lifecycleProjection.reviewActionDisabled === false
    : maturityStaticBoardActive
    ? authorityNextAction === "CONFIRM_WHOLE_FILM_STATIC_BOARD"
      && workspace.production.authority?.nextAction?.requiresUser === true
    : semanticPilotActive
    ? semanticPilotAuthorityIds.has(authorityNextAction)
    : layerReconstructionActive
    ? Boolean(expectedAuthority)
      && authorityNextAction === expectedAuthority.id
      && workspace.production.authority?.nextAction?.requiresUser === expectedAuthority.requiresUser
    : currentLifecycleUserGateActive
    ? authorityNextAction === lifecycleProjection.nextActionId
      && workspace.production.authority?.currentStage === lifecycleProjection.authorityStage
      && workspace.production.authority?.nextAction?.requiresUser === lifecycleProjection.requiresExplicitApproval
      && workspace.production.authority?.nextAction?.reviewGate === lifecycleProjection.nextUserGate
    : wholeFilmDirectionActive
      ? wholeFilmReconciliationActive
        ? authorityNextAction === "reconcile-current-look-master-bindings"
          && workspace.production.authority?.nextAction?.requiresUser === false
          && workspace.production.authority?.nextAction?.reviewGate === null
        : wholeFilmExceptionRepairActive
        ? authorityNextAction === "repair-look-master-exceptions"
          && currentExceptionShotIds.length > 0
          && JSON.stringify([...(workspace.production.authority?.nextAction?.targetShotIds || [])].sort()) === JSON.stringify(currentExceptionShotIds)
          && workspace.production.authority?.nextAction?.requiresUser === false
          && workspace.production.authority?.nextAction?.reviewGate === null
        : authorityNextAction === "rank-whole-film-look-master-candidates"
        && workspace.production.authority?.nextAction?.requiresUser === false
        && workspace.production.authority?.nextAction?.reviewGate === "WHOLE_FILM_STATIC_BOARD"
    : Boolean(expectedAuthority)
      && authorityNextAction === expectedAuthority.id
      && workspace.production.authority?.nextAction?.requiresUser === expectedAuthority.requiresUser,
  "authority-next-action-not-aligned-with-packaging-runtime-or-whole-film-direction");
} else {
  const ed03Bundle = manifest.evidenceBundles.find((bundle) => bundle.shotIds.includes("ED-03"));
  const ed32Bundle = manifest.evidenceBundles.find((bundle) => bundle.shotIds.includes("ED-32"));
  const ed32Shot = workspace.library.assets.find((asset) => asset.shotDemand?.shotId === "ED-32");
  const ed32Decision = decisions.items.find((item) => item.shotId === "ED-32");
  check(ed03Bundle?.status === "source-insufficient", "ed03-source-insufficiency-not-preserved");
  check(ed32Bundle?.status === "registered-exact", `ed32-source-not-exact:${ed32Bundle?.status}`);
  check(!ed32Shot?.automationBlock && ed32Shot?.shotDemand?.presenterSourceBoundary?.status === "registered-current-source-sufficient", "ed32-stale-desk-hands-block-not-cleared");
  check(ed32Decision?.informationOwner === "presenter" && ed32Decision?.frameOccupation === "quiet-field" && ed32Decision?.typographyDuty === "none" && ed32Decision?.generationAllowed === false, "ed32-presentation-decision-invalid");
  const ed32Calibration = workspace.production.authority?.designCalibrationBatch?.items?.find((item) => item.shotId === "ED-32");
  check(ed32Calibration?.sourceOnlyReady === true && ed32Calibration?.renderReady === true, "ed32-source-only-render-readiness-invalid");
  check(!(workspace.production.authority?.exceptionQueue?.items || []).some((item) => item.shotId === "ED-32" && ["candidates-missing", "candidate-render-missing", "source-evidence-blocked"].includes(item.code)), "ed32-stale-candidate-or-source-missing-exception");
}
check(workspace.production.automationPolicy?.maximumRevisionRounds === 2 && workspace.production.automationPolicy?.legacyMaximumRevisionRounds === 4 && workspace.production.automationPolicy?.legacyMaximumRevisionRoundsAdvisoryOnly === true, "revision-round-policy-not-migrated");
if (!packagingActive) check(workspace.production.authority?.nextAction?.id === "connect-presentation-renderer-and-build-static-proof" || workspace.production.authority?.nextAction?.id === "review-presentation-renderer-static-proof", "authority-next-action-not-renderer-proof");

console.log(JSON.stringify({
  status: failures.length ? "FAIL" : "PASS",
  decisionSetSha256: decisions.sha256,
  materialManifestV2Sha256: manifest.sha256,
  decisionCount: decisions.items.length,
  materialSummary: manifest.summary,
  executorFamilies: [...new Set(decisions.items.map((item) => item.rendererExecutor))],
  scope: currentArticleAssetAuthority ? "current-faceless-article-asset-supply" : packagingActive ? "packaging-events-only" : "legacy-shot-presentation",
  failures,
}, null, 2));
if (failures.length) process.exitCode = 1;
