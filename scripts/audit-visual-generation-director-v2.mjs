#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {isArticlePackagingProductionActive} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {assertVisualGenerationDirector} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = assertEditorialAssetWorkbench(JSON.parse(fs.readFileSync(workspacePath, "utf8")));
const director = assertVisualGenerationDirector(workspace.production.visualDirector, workspace);
const source = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const uiSource = source("apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx");
const packagingUiSource = source("apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx");
const apiSource = source("apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts");
const compositorSource = source("scripts/render-generated-visual-composite-v2.mjs");
const workerSource = source("scripts/run-editorial-asset-workbench-jobs-v2.mjs");
const maturityLoopSource = source("scripts/run-visual-maturity-loop-v1.mjs");
const motionCriticSource = source("scripts/run-representative-motion-critic-v1.mjs");
const visualCriticSource = source("apps/studio-next/src/lib/a1-visual-maturity-critic-v1.mjs");
const productionSource = source("apps/studio-next/src/lib/editorial-production/index.mjs");
const rendererSource = source("remotion-renderer/src/AcceptedEditorialSequenceV2.tsx");
const authoritySource = source("apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs");
const packagingBoundaryActive = workspace.production.packagingBeatPlan?.contract === "A1PackagingBeatPlan/v1"
  && workspace.production.packagingBoundary?.contract === "A1EditorialPackagingBoundary/v1";
const packagingActive = packagingBoundaryActive && isArticlePackagingProductionActive(workspace);

const checks = {
  eightTreatmentPacks: director.treatmentLibrary.length === 8
    && director.treatmentLibrary.some((pack) => pack.id === "newtro-pixel-pop" && pack.materials.includes("8-bit-sprite")),
  pixelPopTypographySystem: (() => {
    const pack = director.treatmentLibrary.find((item) => item.id === "newtro-pixel-pop");
    return pack?.typographySystem?.contract === "A1PixelPopTypography/v1"
      && pack.typographySystem.displayFamily?.label === "Noto Sans Hans Black"
      && pack.typographySystem.supportFamily?.label === "Source Han Sans CN Regular"
      && pack.typographySystem.frameRules?.maxTextRoles === 3
      && pack.typographySystem.frameRules?.negativeSpaceRatio?.min >= 0.35
      && pack.typographySystem.layout?.gridColumns === 12
      && pack.typographySystem.layout?.headlineZone === "assigned-by-shot-composition-plan"
      && pack.typographySystem.layout?.archetypeDriven === true
      && pack.typographySystem.layout?.forbidUniversalSplit === true;
  })(),
  monochromeEditorialDirection: (() => {
    const pack = director.treatmentLibrary.find((item) => item.id === "newtro-pixel-pop");
    const direction = director.treatmentDirections.find((item) => item.treatmentId === "newtro-pixel-pop");
    return pack?.monochromeDirectionContract === "A1MonochromeEditorialDirection/v1"
      && pack.monochromeDirection?.palette?.ink === "#0B0B0B"
      && pack.monochromeDirection?.palette?.paper === "#F3F0E8"
      && pack.monochromeDirection?.elements?.maxVisibleObjects === 2
      && pack.monochromeDirection?.layout?.fixedSplitForbidden === true
      && direction?.anchorBriefs?.some((brief) => brief.prompt.includes("A1MonochromeEditorialDirection/v1"));
  })(),
  semanticCompositionSystem: (() => {
    const archetypeCount = new Set(director.shotBriefs.map((brief) => brief.compositionPlan?.archetypeId)).size;
    const threeShotCollapse = director.shotBriefs.some((_, index) => index >= 2
      && new Set(director.shotBriefs.slice(index - 2, index + 1).map((brief) => brief.compositionPlan?.silhouetteFamily)).size === 1);
    return archetypeCount >= 5
      && !threeShotCollapse
      && director.shotBriefs.every((brief) => brief.compositionPlan?.contract === "A1VisualCompositionSystem/v1"
        && brief.visualProposition?.contract === "A1ShotVisualProposition/v1"
        && brief.compositionPlan.fixedLeftRightSplitForbidden === true
        && brief.prompt.includes("A1VisualCompositionSystem/v1")
        && brief.automaticChecks?.includes("composition-archetype-match")
        && brief.automaticChecks?.includes("template-smell-clear"))
      && visualCriticSource.includes("仍退回左侧物件、右侧标题")
      && visualCriticSource.includes("必须把附图的真实轮廓、裁切、尺度、遮挡和动作关系与之逐项对照");
  })(),
  cleanRoomReferenceGrammar: (() => {
    const pack = director.treatmentLibrary.find((item) => item.id === "newtro-pixel-pop");
    const direction = director.treatmentDirections.find((item) => item.treatmentId === "newtro-pixel-pop");
    return pack?.referenceGrammarContract === "A1VisualReferenceGrammar/v1"
      && Array.isArray(pack.referenceGrammarSources)
      && pack.referenceGrammarSources.length >= 5
      && direction?.anchorBriefs?.some((brief) => brief.prompt.includes("A1VisualReferenceGrammar/v1"));
  })(),
  creatorPackagingGrammar: director.creatorPackaging?.contract === "A1CreatorPackagingGrammar/v1"
    && director.creatorPackaging.requestedProfileIds.join(",") === "gawx-art,xiaolin-says,hupo,dai-lao-ban"
    && director.creatorPackaging.inspirationProfileIds.join(",") === "mina-le,dan-mace-cartel,ignacio-osorio-odd,yere-studio"
    && director.creatorPackaging.exactReferenceGate.requireExactForProduction === true
    && director.creatorPackaging.rankedProfiles.some((profile) => profile.id === "gawx-art" && profile.sourceUrls?.includes("https://www.youtube.com/@gawxart"))
    && director.shotBriefs.every((brief) => brief.creatorPackagingProfileIds?.length === 4 && brief.creatorInspirationProfileIds?.length === 4 && brief.creatorPackagingGrammar?.grammar?.length > 0),
  creatorReferenceStudy: director.referenceStudy?.contract === "A1CreatorReferenceStudy/v1"
    && director.referenceStudy.status === "exact-sequence-import-required"
    && director.referenceStudy.qualityGate?.sourceWallIsEvidenceOnly === true
    && director.shotBriefs.every((brief) => brief.creatorReferenceStudyContract === "A1CreatorReferenceStudy/v1"
      && (brief.generationDecision === "article-packaging-kit" || brief.prompt.includes("Reference study contract A1CreatorReferenceStudy/v1"))),
  topThreeDirections: director.rankedTreatmentIds.length === 3,
  sixComparableAnchors: director.treatmentDirections.length === 3 && director.treatmentDirections.every((direction) => direction.anchorBriefs.length === 2),
  allShotsRouted: director.shotBriefs.length === 34 && new Set(director.shotBriefs.map((brief) => brief.shotId)).size === 34,
  lockedPinterestPromptPolicy: director.promptPolicy?.contract === "A1VisualPromptPolicyBinding/v1"
    && director.promptPolicy.status === "current"
    && director.promptPolicy.visualReferencePackId === "pinterest-retro-pixel-v1"
    && director.promptPolicy.compiledShotBriefCount === 34
    && director.shotBriefs.every((brief) => brief.promptCompiler === "A1VisualGenerationPromptCompiler/v3"
      && brief.visualPolicySha256 === director.promptPolicy.visualPolicySha256
      && brief.visualReferencePack?.id === "pinterest-retro-pixel-v1"
      && brief.prompt.includes("pinterest-retro-pixel-v1")
      && brief.prompt.includes("pixel-grid-is-the-surface-logic-not-a-filter")
      && !brief.prompt.includes("tactile creator cinema")
      && brief.automaticChecks.includes("visual-policy-current")
      && brief.automaticChecks.includes("visual-reference-pack-lock")),
  generatedTypographyRoute: director.shotBriefs.filter((brief) => ["ED-10", "ED-17"].includes(brief.shotId)).every((brief) => brief.generationDecision === "generated-type-treatment" && brief.generationAllowed === true && brief.productionBindingAllowed === true && brief.generatedTextAllowed === true && brief.editableShadowRequired === true && brief.ocrRequired === true && brief.automaticChecks.includes("ocr-exact-text")),
  articlePackagingRoute: !packagingActive || director.shotBriefs.every((brief) => brief.assignedPackagingAssetIds?.length > 0),
  generatedLayerProductionAuthority: !packagingActive || director.summary.generatedLayerCount === 15 && director.summary.generatedTypographyCount === 2 && director.summary.productionBindableBriefCount === 17,
  noPerShotFullSceneBinding: !packagingActive || director.shotBriefs.filter((brief) => brief.productionBindingAllowed).every((brief) => brief.layerId !== "packaging-composite" && brief.prompt.includes("shot-specific semantic actor")),
  progressiveFamilyAdmission: workspace.production.authority?.designCalibrationBatch?.progressiveAdmission?.contract === "A1ProgressiveShotFamilyAdmission/v1"
    && workspace.production.authority.designCalibrationBatch.progressiveAdmission.policy === "passed-family-expands-isolated-shot-stays-local",
  oneRetryThenStrategySwitch: workspace.production.maturityLoop.maxRoundsPerTarget === 2
    && workspace.production.maturityLoop.sameStrategyRetryLimit === 1
    && workspace.production.maturityLoop.strategySwitchRequiredAfterRound === 2
    && workspace.production.maturityLoop.maxVisualStrategyCycles === 2,
  threeCreativeReviews: director.creativeReviews.reviewCount === 3 && director.creativeReviews.gates.length === 3,
  exactShotLayerBinding: productionSource.includes("asset.shotLayerBinding.shotId === shotAsset.shotDemand.shotId") && productionSource.includes("productionBinding: anchorSurfaceAsset.shotLayerBinding || null"),
  oneBundleOneBrowserComposite: compositorSource.indexOf("await bundle(") > -1 && compositorSource.indexOf("await openBrowser(") > compositorSource.indexOf("await bundle(") && compositorSource.includes("for (const {group"),
  compositeReviewUsesCurrentBriefAndRetriesWriteLock: compositorSource.includes("candidate.briefHash === brief.briefHash")
    && compositorSource.includes("candidate.treatmentHash === brief.treatmentHash")
    && compositorSource.includes("withProjectLockRetry")
    && compositorSource.includes('production-state-write-in-progress')
    && compositorSource.includes("staleReviewedComposite")
    && compositorSource.includes("compositeUsesCurrentRenderer"),
  cobaltSemanticWordDoesNotBecomeQuestionCard: rendererSource.includes("const questionStripBackground = !questionStrip")
    && !rendererSource.includes("questionStripIndex >= 3 || node.paletteRole === \"cobalt\""),
  exhaustedVisualStrategyStopsGeneration: authoritySource.includes("visual-anchor-strategy-switch-required")
    && apiSource.includes("visual-anchor-strategy-switch-required")
    && uiSource.includes("已停止：需要换视觉原语")
    && uiSource.includes("strategySwitchRequired"),
  structuredRevisionLoop: compositorSource.includes("reviseVisualGenerationBrief") && compositorSource.includes("parentGenerationId: revisionTarget.id") && compositorSource.includes("structuredPatchOnly: true") && compositorSource.includes("revisionRound < 2"),
  automaticAnchorSuiteAfterFirstReview: maturityLoopSource.includes("adoptVisualTreatmentAutomatically") && maturityLoopSource.includes("prepare-six-shot-calibration-automatically"),
  designCalibrationQueuesLockedStyleFirst: uiSource.includes('onAction("queue-visual-anchor-suite-generation")')
    && uiSource.includes("pendingAnchorVisualBriefs")
    && apiSource.includes('body.action === "queue-visual-anchor-suite-generation"')
    && apiSource.includes('next.production.generation.automaticDispatchAllowed = true')
    && apiSource.includes('next.production.maturityLoop.currentStage = "anchor-suite"'),
  targetedAnchorMaturityLoop: maturityLoopSource.includes("anchorScopeShotIds") && maturityLoopSource.includes("VISUAL_ANCHOR_SUITE_AUTO_ADOPTED") && maturityLoopSource.includes("adoptVisualAnchorSuiteAutomatically"),
  automaticFullBatchAfterSecondReview: apiSource.includes("queueRemainingVisualGeneration(next)"),
  motionSampleStopsAtThirdReview: motionCriticSource.includes("registerMotionSample") && productionSource.includes('approvedBy: "system-visual-critic"') && productionSource.includes('review540p.status = automaticallyAdmit ? "ready-to-render"'),
  providerLocked: director.providers.automatic.id === "codex-imagegen" && director.providers.manualFallback.id === "chatgpt-web-conversation" && director.providers.disabled.includes("comfyui-core"),
  providerAuditInWorker: workerSource.includes("generationId") && workerSource.includes("briefHash") && workerSource.includes("treatmentHash"),
  cacheAndBenchmarkPolicy: director.cachePolicy.exactRepeatLocalTargetMs === 3000 && director.queuePolicy.concurrencyCandidates.join(",") === "1,2" && director.queuePolicy.activeConcurrency <= 2 && director.queuePolicy.policy === "shared-browser-safe-max-2",
  uiDirectorSurface: uiSource.includes("VisualGenerationDirectorPanel")
    && uiSource.includes("PackagingWorkbenchLoaded")
    && uiSource.indexOf('workspace.production.packagingBoundary?.contract ===') < uiSource.indexOf('workspace.production.articleAssetProductionAuthority?.current === true')
    && packagingUiSource.includes('data-a1-whole-film-static-board-review="true"')
    && packagingUiSource.includes('aria-label={`${currentPackageCount} 个 PACKAGE 全片静态板`}')
    && packagingUiSource.includes('aria-label={`${currentBeatCount} beat 全片时间线路线`}')
    && packagingUiSource.includes('USER_VISUAL_APPROVED=false')
    && packagingUiSource.includes('disabled={busy || !authorityAligned}'),
  uiSeparatesPolicyPendingAndBlocks: uiSource.includes("SAFETY RULES · {forbiddenRuleCount}")
    && uiSource.includes("PENDING SHOTS · {pendingShotCount}")
    && uiSource.includes("SHOT BLOCKS · {activeShotBlockCount}")
    && !uiSource.includes("HARD BLOCK · {forbiddenRuleCount}"),
  realEvidenceBoundary: director.shotBriefs.filter((brief) => ["real-source", "template"].includes(brief.generationDecision)).every((brief) => brief.productionBindingAllowed === false),
  threeReviewApprovalContract: workspace.production.automationPolicy?.intermediateUserApprovalRequired === false
    && workspace.production.automationPolicy?.calibrationUserApprovalRequired === false
    && workspace.production.automationPolicy?.finalReleaseApprovalRequired === true,
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const report = {contract: "A1VisualGenerationDirectorAudit/v1", status: failures.length ? "FAIL" : "PASS", checks, failures, workspaceSha256: workspace.workspaceSha256, auditedAt: new Date().toISOString()};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
