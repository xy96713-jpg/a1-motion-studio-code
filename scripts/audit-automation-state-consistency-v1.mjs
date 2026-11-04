#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildVisualGenerationFreeze, buildVisualTreatmentAudit} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const workspace = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(readProjectWorkspace(appRoot)));
const lifecycleProjection = derivePackagingLifecycleProjection(workspace);
const director = workspace.production.visualDirector;
const treatmentAudit = buildVisualTreatmentAudit(director);
const freeze = buildVisualGenerationFreeze(director);
const policy = workspace.production.automationPolicy;
const autopilot = workspace.production.autopilot;
const activeVisualJobs = workspace.production.generation.jobs.filter((job) => job.targetKind === "visual-layer" && ["queued", "running"].includes(job.status));
const currentProductionGenerationFreeze = {
  contract: "A1CurrentProductionGenerationFreeze/v1",
  authorityScope: "CURRENT_STORYBOARD_PRODUCTION",
  frozen: workspace.production.generation?.workerStatus === "frozen"
    && workspace.production.generation?.automaticDispatchAllowed === false
    && activeVisualJobs.length === 0,
  workerStatus: workspace.production.generation?.workerStatus || null,
  automaticDispatchAllowed: workspace.production.generation?.automaticDispatchAllowed === true,
  queuedOrRunningVisualJobCount: activeVisualJobs.length,
  nextAction: workspace.production.authority?.nextAction?.id || null,
};
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const uiSource = source("apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx");
const compositorSource = source("scripts/render-generated-visual-composite-v2.mjs");
const maturitySource = source("scripts/run-visual-maturity-loop-v1.mjs");
const productionSource = source("apps/studio-next/src/lib/editorial-production/index.mjs");
const checks = [];
const check = (id, pass, detail) => checks.push({id, status: pass ? "PASS" : "FAIL", detail});

check("final-release-only-policy", policy.mode === "automatic-production-final-release-only"
  && policy.intermediateUserApprovalRequired === false
  && policy.calibrationUserApprovalRequired === false
  && policy.automaticCandidateAdmission === true
  && policy.automaticMotionAdmission === true
  && policy.finalReleaseApprovalRequired === true, policy);
check("one-automatic-admission-predicate", autopilot?.gates?.automaticApprovalAllowed === true
  && autopilot?.critic?.automaticApprovalAllowed === true
  && Number(autopilot?.critic?.scoreThreshold) === 22
  && String(autopilot?.critic?.automaticAdmissionPredicate || "").includes("hardFailures.length===0"), autopilot?.critic || null);
const freezeRequired = treatmentAudit.unavailableCount > 0
  || (treatmentAudit.missingCount === 0
    && (treatmentAudit.compositorRewriteRequired || (treatmentAudit.averageScore != null && Number(treatmentAudit.averageScore) < 18)));
check("generation-freeze-derived-from-visual-treatment", !freezeRequired || (freeze.frozen === true
  && freeze.scope === "all-image-generation"
  && workspace.production.generation.automaticDispatchAllowed === false
  && activeVisualJobs.length === 0), {freezeRequired, freeze, activeVisualJobs: activeVisualJobs.map((job) => job.id)});
check("batch-review-trace-content-addressed", !director.treatmentBatchReview || (/^[a-f0-9]{64}$/u.test(String(director.treatmentBatchReview.trace?.batchHash || ""))
  && director.treatmentBatchReview.mode === "single-model-request"
  && Number(director.treatmentBatchReview.modelRequestCount) <= 1), director.treatmentBatchReview || null);
check("critic-unavailable-is-not-a-visual-score", treatmentAudit.unavailableCount === 0 || (treatmentAudit.status === "UNAVAILABLE"
  && treatmentAudit.averageScore == null
  && treatmentAudit.championTreatmentId == null
  && director.treatmentBatchReview?.status === "UNAVAILABLE"
  && director.treatmentBatchProgress?.status === "failed"
  && workspace.production.authority.nextAction.id === "restore-visual-treatment-critic"), {
  treatmentAudit: {status: treatmentAudit.status, unavailableCount: treatmentAudit.unavailableCount, averageScore: treatmentAudit.averageScore, championTreatmentId: treatmentAudit.championTreatmentId},
  batchReviewStatus: director.treatmentBatchReview?.status || null,
  progressStatus: director.treatmentBatchProgress?.status || null,
  nextAction: workspace.production.authority.nextAction,
});
check("structural-pass-never-unlocks-visual-production", treatmentAudit.status === "PASS" || (workspace.gates.acceptedShotIrAllowed === false
  && workspace.gates.motionPrototypeAllowed === false
  && workspace.gates.h47ExpansionAllowed === false
  && workspace.gates.finalRenderAllowed === false
  && String(workspace.production.release.final1080p.status || "").startsWith("locked")), {treatmentStatus: treatmentAudit.status, gates: workspace.gates, final1080p: workspace.production.release.final1080p.status});
check("compositor-one-bundle-one-browser-one-batch-critic", (compositorSource.match(/await bundle\(/gu) || []).length === 1
  && (compositorSource.match(/await openBrowser\(/gu) || []).length === 1
  && compositorSource.includes("runTreatmentBatchCritic")
  && compositorSource.includes("renderAndCriticizeTreatmentBatch")
  && compositorSource.includes("timeoutInMilliseconds: renderStageTimeoutMs")
  && compositorSource.includes("TREATMENT_BATCH_PROGRESS"), null);
check("no-intermediate-approval-controls", uiSource.includes('data-a1-intermediate-approval-required="false"')
  && !uiSource.includes('runAction("approve-visual-treatment"')
  && !uiSource.includes('runAction("approve-visual-creative-review"')
  && !uiSource.includes("确认六镜")
  && !uiSource.includes("确认运动语言"), null);
check("final-master-cannot-auto-dispatch", !maturitySource.includes("requestAutomaticFinalRenderAndDavinciRelease")
  && productionSource.includes('throw new Error("final-release-user-approval-required")'), null);
// A renderer static-proof handoff is a read-only review surface, not an
// intermediate approval gate. It may require the user's eyes before the line
// advances, while final-release approval remains the only publish boundary.
const staticProofReview = workspace.production.authority.nextAction.id === "review-presentation-renderer-static-proof"
  && workspace.production.presentationRendererProof?.contract === "A1PresentationRendererStaticProof/v1"
  && workspace.production.presentationRendererProof?.status === "READY_FOR_REVIEW"
  && workspace.production.presentationRendererProof?.staticOnly === true;
const packagingMapReview = workspace.production.authority.nextAction.id === "review-packaging-map-and-anchors"
  && workspace.production.packagingBeatPlan?.contract === "A1PackagingBeatPlan/v1"
  && workspace.production.packagingBeatPlan.noPackageMajority === true
  && ["A1PackagingAnchorStaticProof/v1", "A1ReferenceConditionedPackagingAnchorProof/v1"].includes(workspace.production.packagingAnchorProof?.contract)
  && workspace.production.packagingAnchorProof.status === "READY_FOR_REVIEW"
  && workspace.production.packagingAnchorProof.staticOnly === true;
const recommendedLookMasterReview = workspace.production.authority.nextAction.id === "review-recommended-package-look-master"
  && workspace.production.shotIntelligence?.status === "LOOK_MASTER_REVIEW_REQUIRED"
  && workspace.production.shotIntelligence.packageLookMasterPlans?.some((plan) => plan.recommendation?.requiresUserConfirmation === true
    && plan.candidates?.some((candidate) => candidate.candidateId === plan.recommendation.candidateId && candidate.admission?.status === "PASS"));
const recommendedAssemblyReview = workspace.production.authority.nextAction.id === "review-recommended-package-assembly"
  && workspace.production.shotIntelligence?.status === "ASSEMBLY_REVIEW_REQUIRED"
  && workspace.production.shotIntelligence.packageAssetKitPlans?.some((plan) => plan.status === "ASSEMBLY_REVIEW_REQUIRED"
    && plan.selectedLookMasterBinding?.status === "BATCH_RANKED_AUTO_SELECTED")
  && workspace.production.packagingReview?.finalReleaseApprovalRequired === true;
const canonicalPackageCount = (workspace.production.canonicalCreatorPackagingSequence?.decisions || [])
  .filter((decision) => decision.packageDecision === "PACKAGE").length;
const canonicalShotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
const semanticPilotReview = ["review-whole-film-look-master-semantics", "semantic-pilot-review-required"].includes(workspace.production.authority.nextAction.id)
  && String(workspace.production.shotIntelligence?.status || "").startsWith("SEMANTIC_PILOT")
  && workspace.production.shotIntelligence?.semanticPilot?.recommendation == null
  && workspace.production.shotIntelligence?.semanticPilot?.selected == null
  && (workspace.production.shotIntelligence?.semanticPilot?.currentAssembly || []).length === 0
  && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
  && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.layerReconstructionAllowed === false;
const wholeFilmStaticBoardReview = workspace.production.authority.nextAction.id === "review-whole-film-static-board"
  && workspace.production.authority.currentStage === "whole-film-static-board-review"
  && lifecycleProjection.status === "WHOLE_FILM_STATIC_BOARD_READY"
  && lifecycleProjection.nextUserGate === "WHOLE_FILM_STATIC_BOARD"
  && lifecycleProjection.requiresExplicitApproval === true
  && lifecycleProjection.approvalAllowed === true
  && lifecycleProjection.reviewActionDisabled === false
  && JSON.stringify(lifecycleProjection.blockedShotIds || []) === JSON.stringify([])
  && workspace.production.shotIntelligence?.wholeFilmStaticBoard?.status === "PENDING_USER_APPROVAL"
  && workspace.production.shotIntelligence?.wholeFilmStaticBoard?.itemCount === canonicalPackageCount
  && workspace.production.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.itemCount === canonicalShotCount
  && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed === false
  && workspace.production.shotIntelligence?.wholeFilmBatchRecommendation?.layerReconstructionAllowed === false
  && (workspace.production.shotIntelligence?.currentAssembly || []).length === 0;
const representativeMotionReview = workspace.production.authority.nextAction.id === lifecycleProjection.nextActionId
  && lifecycleProjection.status === "REPRESENTATIVE_MOTION_OBJECTIVE_PASS_AWAITING_USER_VISUAL_REVIEW"
  && lifecycleProjection.requiresExplicitApproval === true
  && workspace.production.motion?.status === "preview-ready-for-review"
  && workspace.production.motion?.review?.status === "objective-pass-awaiting-user-visual-review"
  && /^[a-f0-9]{64}$/u.test(String(workspace.production.motion?.previewArtifact?.sha256 || ""))
  && workspace.production.motion?.fullMotionAllowed === false
  && workspace.production.motion?.aeLevelProven === false
  && workspace.production.assembly?.status === "NOT_CREATED"
  && workspace.production.assembly?.productionWired === false
  && workspace.gates.finalRenderAllowed === false;
const staticPackageReviewAuthorization = workspace.production.authority.nextAction.id === "AUTHORIZE_PACKAGE_STATIC_REVIEW"
  && lifecycleProjection.status === "PACKAGING_DELIVERY_ARCHITECTURE_READY_EXTERNAL_GATES_BLOCKED"
  && lifecycleProjection.requiresExplicitApproval === true
  && workspace.production.authority.currentStage === lifecycleProjection.authorityStage
  && workspace.production.packagingAuthorization?.receipts?.STATIC_REVIEW == null
  && workspace.production.assembly?.status === "NOT_CREATED"
  && workspace.production.assembly?.productionWired === false
  && workspace.gates.finalRenderAllowed === false;
const tasteBoundCanaryAuthorization = workspace.production.authority.nextAction.id === "AUTHORIZE_TASTE_BOUND_BOUNDED_CANARY"
  && lifecycleProjection.status === "VISUAL_REPAIR_REQUIRED"
  && lifecycleProjection.nextUserGate === "TASTE_BOUND_BOUNDED_GENERATION_AUTHORIZATION"
  && lifecycleProjection.requiresExplicitApproval === true
  && workspace.production.authority.nextAction.reviewGate === lifecycleProjection.nextUserGate
  && JSON.stringify([...(workspace.production.authority.nextAction.targetShotIds || [])].sort()) === JSON.stringify([...(lifecycleProjection.targetShotIds || [])].sort())
  && workspace.production.storyboardProductionProjection?.counts?.tasteBound === 13
  && workspace.production.storyboardProductionProjection?.counts?.temporalPlanPass === 13
  && workspace.production.generation?.automaticDispatchAllowed === false
  && workspace.production.generation?.workerStatus === "frozen"
  && workspace.production.storyboardProductionProjection?.gate?.userVisualApproval === "NOT_APPROVED"
  && workspace.production.storyboardProductionProjection?.gate?.motionAllowed === false
  && workspace.production.storyboardProductionProjection?.gate?.finalRenderAllowed === false;
const paragraphCanaryAuthorization = workspace.production.authority.nextAction.id === "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY"
  && lifecycleProjection.status === "VISUAL_REPAIR_REQUIRED"
  && lifecycleProjection.nextUserGate === "PACKAGING_PARAGRAPH_CANARY_AUTHORIZATION"
  && lifecycleProjection.requiresExplicitApproval === true
  && workspace.production.authority.nextAction.reviewGate === lifecycleProjection.nextUserGate
  && JSON.stringify(workspace.production.authority.nextAction.targetShotIds || []) === JSON.stringify(["ED-12", "ED-13", "ED-14"])
  && JSON.stringify(lifecycleProjection.targetShotIds || []) === JSON.stringify(["ED-12", "ED-13", "ED-14"])
  && workspace.production.staticPackageReview?.tasteMigration?.packagingParagraphCanary?.imageGenerationPerformed === false
  && workspace.production.generation?.automaticDispatchAllowed === false
  && workspace.production.generation?.workerStatus === "frozen"
  && workspace.production.storyboardProductionProjection?.gate?.userVisualApproval === "NOT_APPROVED"
  && workspace.production.storyboardProductionProjection?.gate?.motionAllowed === false
  && workspace.production.storyboardProductionProjection?.gate?.finalRenderAllowed === false;
const articleAssetBackgroundWaveReview = workspace.production.authority.nextAction.id === "REVIEW_DEFAULT_LIBRARY_BACKGROUND_WAVE"
  && workspace.production.authority.nextAction.requiresUser === true
  && workspace.production.authority.currentStage === "article-asset-background-wave-actual-pixel-review"
  && workspace.production.articleAssetProductionAuthority?.current === true
  && workspace.production.articleAssetProductionAuthority.status === "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW"
  && workspace.production.articleAssetProductionAuthority.authorization?.userVisualApproval === "NOT_APPROVED"
  && workspace.production.articleAssetProductionAuthority.boundaries?.motionAllowed === false
  && workspace.production.articleAssetProductionAuthority.boundaries?.resolveAllowed === false
  && workspace.production.articleAssetProductionAuthority.boundaries?.finalRenderAllowed === false
  && workspace.production.generation?.workerStatus === "frozen"
  && workspace.production.generation?.automaticDispatchAllowed === false
  && activeVisualJobs.length === 0;
check("authority-user-boundary-is-explicit-review-or-final-release", workspace.production.authority.nextAction.requiresUser !== true
  || workspace.production.authority.nextAction.id === "final-release-approval-required"
  || staticProofReview
  || packagingMapReview
  || semanticPilotReview
  || wholeFilmStaticBoardReview
  || representativeMotionReview
  || staticPackageReviewAuthorization
  || tasteBoundCanaryAuthorization
  || paragraphCanaryAuthorization
  || articleAssetBackgroundWaveReview
  || recommendedLookMasterReview
  || recommendedAssemblyReview, workspace.production.authority.nextAction);

const failures = checks.filter((item) => item.status === "FAIL");
const report = {
  contract: "A1AutomationStateConsistencyAudit/v1",
  status: failures.length ? "BLOCK" : "PASS",
  generatedAt: new Date().toISOString(),
  workspaceSha256: workspace.workspaceSha256,
  treatmentAudit: {status: treatmentAudit.status, averageScore: treatmentAudit.averageScore, unavailableCount: treatmentAudit.unavailableCount, compositorRewriteRequired: treatmentAudit.compositorRewriteRequired},
  legacyTreatmentLaneFreeze: {...freeze, authorityScope: "LEGACY_TREATMENT_LANE_ADVISORY"},
  currentProductionGenerationFreeze,
  checks,
  failures: failures.map((item) => item.id),
};
const outputDir = path.join(artifactDir, "automation-state-consistency-v1");
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, failures: report.failures, treatmentAudit: report.treatmentAudit, currentProductionGenerationFreeze: report.currentProductionGenerationFreeze, legacyTreatmentLaneFreeze: report.legacyTreatmentLaneFreeze, reportPath: path.relative(root, path.join(outputDir, "report.json"))}, null, 2));
if (failures.length) process.exitCode = 1;
