#!/usr/bin/env node
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-preproduction-motion-candidate-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "audit.json");
const publicReportPath = path.join(publicRoot, "audit.json");
const candidatePropsPath = path.join(artifactRoot, "candidate-props.json");
const sourcePropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const materialManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesMaterialManifest.json");
const continuityManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesContinuityManifest.json");
const staticPlanPath = path.join(artifactRoot.replace(phaseId, "h-series-preproduction-director-v1"), "director-plan.json");
const candidateVideoPath = path.join(publicRoot, "motion-preview-12-shot-36s.mp4");
const contactSheetPath = path.join(publicRoot, "motion-preview-contact-sheet.png");
const allContactSheetPath = path.join(publicRoot, "motion-preview-all-47-stills-contact-sheet.png");
const stillsReportPath = path.join(publicRoot, "stills-report.json");
const reviewDecisionLedgerPath = path.join(publicRoot, "review-decisions.json");
const reviewPagePath = path.join(root, "apps/studio-next/src/app/system-line-review/page.tsx");
const reviewDecisionRoutePath = path.join(root, "apps/studio-next/src/app/api/system-line/h-series-review/route.ts");
const reviewDecisionControlPath = path.join(root, "apps/studio-next/src/app/system-line-review/HSeriesReviewControl.tsx");
const generatedArtworkReviewControlPath = path.join(root, "apps/studio-next/src/app/system-line-review/HSeriesGeneratedArtworkReviewControl.tsx");
const generatedArtworkReviewModulePath = path.join(root, "apps/studio-next/src/lib/a1-h-series-generated-artwork-review.mjs");
const generatedArtworkReviewTestPath = path.join(root, "scripts/test-h-series-generated-artwork-review-ledger-v1.mjs");
const generatedArtworkRepairAdoptionModulePath = path.join(root, "apps/studio-next/src/lib/a1-h-series-generated-artwork-repair-adoption.mjs");
const generatedArtworkRepairAdoptionTestPath = path.join(root, "scripts/test-h-series-generated-artwork-repair-adoption-v1.mjs");
const generatedArtworkRepairAdoptionBuildPath = path.join(root, "scripts/build-h-series-generated-artwork-repair-adoption-plan-v1.mjs");
const generatedArtworkRepairAdoptionReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-artwork-repair-adoption-v1/report.json");
const reviewApiIsolationTestPath = path.join(root, "scripts/test-h-series-review-api-isolation-v1.mjs");
const reviewFullFlowTestPath = path.join(root, "scripts/test-h-series-review-full-flow-v1.mjs");
const artworkGenerationScriptPath = path.join(root, "scripts/generate-artwork-via-chatgpt.mjs");
const reviewFlowControllerPath = path.join(root, "apps/studio-next/src/app/system-line-review/HSeriesReviewFlowController.tsx");
const adoptionApprovalControlPath = path.join(root, "apps/studio-next/src/app/system-line-review/HSeriesAdoptionApprovalControl.tsx");
const targetedRevisionRendererPath = path.join(root, "scripts/render-h-series-targeted-revision-v1.mjs");
const previewRendererPath = path.join(root, "scripts/render-h-series-preproduction-motion-candidate-preview-v1.mjs");
const shotDirectorRendererPath = path.join(root, "remotion-renderer/src/shot-director-stage.tsx");
const motionRendererSourcePath = path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx");
const fontBindingSourcePath = path.join(root, "remotion-renderer/src/experimentalEditorialFonts.ts");
const generatedArtworkManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-result-manifest-v1/report.json");
const currentTaskPath = path.join(root, "CURRENT_TASK.md");
const handoffPath = path.join(root, "HANDOFF.md");
const authorityVideoPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/review-960x540-with-source-audio.mp4");
const authorityVideoSha256 = "fe0cd7559db3a56235be9637eafe93a2e490dc46b4566e24374d45d4816b5d7c";

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const exists = (file) => fs.existsSync(file) && fs.statSync(file).size > 0;
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file);
const check = (checks, name, pass, detail = null) => { checks[name] = Boolean(pass); if (!pass) failures.push({name, detail}); };
const failures = [];
const warnings = [];
const warn = (name, detail = null) => warnings.push({name, detail});
const checks = {};

for (const [name, file] of Object.entries({candidatePropsPath, sourcePropsPath, materialManifestPath, continuityManifestPath, staticPlanPath, candidateVideoPath, contactSheetPath, allContactSheetPath, stillsReportPath, reviewPagePath, reviewDecisionRoutePath, reviewDecisionControlPath, generatedArtworkReviewControlPath, generatedArtworkReviewModulePath, generatedArtworkReviewTestPath, generatedArtworkRepairAdoptionModulePath, generatedArtworkRepairAdoptionTestPath, generatedArtworkRepairAdoptionBuildPath, generatedArtworkRepairAdoptionReportPath, reviewApiIsolationTestPath, reviewFullFlowTestPath, artworkGenerationScriptPath, reviewFlowControllerPath, adoptionApprovalControlPath, targetedRevisionRendererPath, previewRendererPath, shotDirectorRendererPath, motionRendererSourcePath, fontBindingSourcePath, generatedArtworkManifestPath, currentTaskPath, handoffPath, authorityVideoPath})) {
  check(checks, `file:${name}`, exists(file), rel(file));
}

let candidate = null;
let source = null;
let staticPlan = null;
let materialManifest = null;
let continuityManifest = null;
let generatedArtworkManifest = null;
let candidateReport = null;
let stillsReport = null;
let previewRenderer = "";
let currentTask = "";
let handoff = "";
if (!failures.length) {
  candidate = readJson(candidatePropsPath);
  source = readJson(sourcePropsPath);
  staticPlan = readJson(staticPlanPath);
  materialManifest = readJson(materialManifestPath);
  continuityManifest = readJson(continuityManifestPath);
  generatedArtworkManifest = readJson(generatedArtworkManifestPath);
  currentTask = fs.readFileSync(currentTaskPath, "utf8");
  handoff = fs.readFileSync(handoffPath, "utf8");
  candidateReport = readJson(path.join(artifactRoot, "report.json"));
  stillsReport = readJson(stillsReportPath);
  previewRenderer = fs.readFileSync(previewRendererPath, "utf8");
}

if (candidateReport) {
  check(checks, "report:contract", candidateReport.contract === "A1HSeriesPreproductionMotionPreview/v1");
  check(checks, "report:status", candidateReport.status === "PASS");
  check(checks, "report:review-only", candidateReport.reviewOnly === true && candidateReport.proofOnly === true);
  check(checks, "report:all-locks", candidateReport.currentAuthorityMutated === false && candidateReport.rendererAdoptionAllowed === false && candidateReport.fullMp4RenderAllowed === false && candidateReport.finalRenderAllowed === false && candidateReport.resolveExportAllowed === false && candidateReport.userApprovalStatus === "not-approved");
  check(checks, "report:current-props-unchanged", candidateReport.checks?.currentPropsUnchanged === true);
  check(checks, "report:no-full-film-render", candidateReport.checks?.noFullFilmRender === true);
  const currentShotDirectorRendererSha256 = sha256(shotDirectorRendererPath);
  const snapshotRendererSourceSha256 = candidateReport.sourceBinding?.rendererSource?.sha256;
  const rendererSourceSnapshotBound = candidateReport.sourceBinding?.rendererSource?.path === rel(shotDirectorRendererPath)
    && /^[0-9a-f]{64}$/u.test(snapshotRendererSourceSha256 || "")
    && candidateReport.typographyBinding?.rendererProfileSourceSha256 === snapshotRendererSourceSha256;
  check(checks, "report:renderer-source-bound", rendererSourceSnapshotBound, {
    bindingMode: "immutable-candidate-snapshot",
    reportRendererSourceSha256: snapshotRendererSourceSha256 || null,
    currentRendererSourceSha256: currentShotDirectorRendererSha256,
  });
  if (rendererSourceSnapshotBound && snapshotRendererSourceSha256 !== currentShotDirectorRendererSha256) {
    warn("report:renderer-source-snapshot-is-stale", {
      bindingMode: "immutable-candidate-snapshot",
      reportRendererSourceSha256: snapshotRendererSourceSha256,
      currentRendererSourceSha256: currentShotDirectorRendererSha256,
      nextAction: "create-a-new-candidate-snapshot-before-reusing-this-report",
    });
  }
  check(checks, "report:motion-renderer-source-bound", candidateReport.sourceBinding?.motionRendererSource?.path === rel(motionRendererSourcePath) && candidateReport.sourceBinding?.motionRendererSource?.sha256 === sha256(motionRendererSourcePath));
  check(checks, "report:stable-candidate-reuse-guard", previewRenderer.includes("canReusePreviewVideo") && previewRenderer.includes("currentInputIdentity") && previewRenderer.includes("previousInputIdentity") && previewRenderer.includes("stableJson"), {reason: "a no-op candidate rerun must not churn the report binding and invalidate visual decisions"});
  check(checks, "report:typography-family-binding", candidateReport.typographyBinding?.contract === "A1HSeriesTypographyRendererBinding/v1" && candidateReport.typographyBinding?.rendererProfileFunction === "headlineProfileFor" && candidateReport.typographyBinding?.rendererProfileSourceSha256 === candidateReport.sourceBinding?.rendererSource?.sha256 && candidateReport.typographyBinding?.allSceneFamiliesBound === true && Object.values(candidateReport.typographyBinding?.familyCounts || {}).reduce((sum, count) => sum + Number(count || 0), 0) === 47);
  const fontAssets = Array.isArray(candidateReport.sourceBinding?.fontAssets) ? candidateReport.sourceBinding.fontAssets : [];
  const fontAssetsBound = fontAssets.length > 0 && fontAssets.every((asset) => {
    const file = path.join(root, asset.path || "");
    return Boolean(asset.path) && fs.existsSync(file) && asset.sha256 === sha256(file);
  });
  check(checks, "report:font-assets-bound", candidateReport.sourceBinding?.fontBindingSource?.path === rel(fontBindingSourcePath) && candidateReport.sourceBinding?.fontBindingSource?.sha256 === sha256(fontBindingSourcePath) && Boolean(candidateReport.sourceBinding?.fontAssetsSha256) && candidateReport.typographyBinding?.fontAssetCount === fontAssets.length && candidateReport.typographyBinding?.fontAssetsAllPresent === true && fontAssetsBound && candidateReport.checks?.typographyFontAssetsPresent === true, {fontAssetCount: fontAssets.length, fontAssetsBound});
  const currentGeneratedArtworkManifestSha256 = sha256(generatedArtworkManifestPath);
  const snapshotGeneratedArtworkManifestSha256 = candidateReport.sourceBinding?.generatedArtworkManifestSha256;
  const snapshotGeneratedArtworkReview = candidateReport.generatedArtworkReview;
  const generatedArtworkSnapshotBound = candidateReport.sourceBinding?.generatedArtworkManifestPath === rel(generatedArtworkManifestPath)
    && /^[0-9a-f]{64}$/u.test(snapshotGeneratedArtworkManifestSha256 || "")
    && snapshotGeneratedArtworkReview?.sourceManifestPath === rel(generatedArtworkManifestPath)
    && snapshotGeneratedArtworkReview?.sourceManifestSha256 === snapshotGeneratedArtworkManifestSha256
    && generatedArtworkManifest?.contract === "A1HSeriesGeneratedArtworkResultManifest/v1"
    && generatedArtworkManifest?.summary?.expectedCount === 7
    && generatedArtworkManifest?.summary?.generatedCount === 7
    && generatedArtworkManifest?.summary?.pendingVisualReviewCount === 7
    && snapshotGeneratedArtworkReview?.contract === "A1HSeriesGeneratedArtworkResultManifest/v1"
    && snapshotGeneratedArtworkReview?.expectedCount === 7
    && snapshotGeneratedArtworkReview?.generatedCount === 7
    && snapshotGeneratedArtworkReview?.pendingVisualReviewCount === 7
    && snapshotGeneratedArtworkReview?.candidateArtworkCount === 7
    && snapshotGeneratedArtworkReview?.candidateGeneratedAssetCount === 5
    && snapshotGeneratedArtworkReview?.candidateLegacyAssetCount === 2
    && snapshotGeneratedArtworkReview?.candidateGeneratedArtworkHashesMatch === true
    && snapshotGeneratedArtworkReview?.allAssetsLocalToSystemLine === true
    && snapshotGeneratedArtworkReview?.allAssetsPromptBound === true
    && snapshotGeneratedArtworkReview?.allAssetsNonEvidence === true
    && snapshotGeneratedArtworkReview?.rendererAdoptionAllowed === false
    && snapshotGeneratedArtworkReview?.finalRenderAllowed === false
    && candidateReport.checks?.generatedArtworkManifestBound === true;
  check(checks, "report:generated-artwork-review-bound", generatedArtworkSnapshotBound, {
    bindingMode: "immutable-candidate-snapshot",
    reportManifestSha256: snapshotGeneratedArtworkManifestSha256 || null,
    currentManifestSha256: currentGeneratedArtworkManifestSha256,
    generatedArtworkReview: snapshotGeneratedArtworkReview,
    generatedArtworkSummary: generatedArtworkManifest?.summary,
  });
  if (generatedArtworkSnapshotBound && snapshotGeneratedArtworkManifestSha256 !== currentGeneratedArtworkManifestSha256) {
    warn("report:generated-artwork-snapshot-is-stale", {
      bindingMode: "immutable-candidate-snapshot",
      reportManifestSha256: snapshotGeneratedArtworkManifestSha256,
      currentManifestSha256: currentGeneratedArtworkManifestSha256,
      nextAction: "review-current-generated-artwork-candidates-before-adoption",
    });
  }
  check(checks, "report:material-manifest-bound", candidateReport.sourceBinding?.materialManifestSha256 === sha256(materialManifestPath));
  check(checks, "report:continuity-manifest-bound", candidateReport.sourceBinding?.continuityManifestPath === rel(continuityManifestPath) && candidateReport.sourceBinding?.continuityManifestSha256 === sha256(continuityManifestPath));
  check(checks, "continuity:full-coverage-record", candidateReport.continuityCoverage?.sceneCount === 47 && candidateReport.continuityCoverage?.transitionCount === 46 && candidateReport.continuityCoverage?.allScenesBound === true && candidateReport.continuityCoverage?.allBoundariesDeclared === true && candidateReport.continuityCoverage?.ordered === true && candidateReport.continuityCoverage?.fieldsBound === true && candidateReport.continuityCoverage?.sourcePropsBound === true && candidateReport.checks?.continuityManifestSceneCount === true && candidateReport.checks?.continuityManifestAllBound === true && candidateReport.checks?.continuityManifestAllTransitions === true && candidateReport.checks?.continuityManifestOrdered === true && candidateReport.checks?.continuityManifestSourcePropsBound === true, candidateReport.continuityCoverage);
  check(checks, "continuity:manifest-contract", continuityManifest?.contract === "A1ContinuityManifest/v1" && continuityManifest?.status === "REVIEW_ONLY" && continuityManifest?.reviewOnly === true && continuityManifest?.finalRenderAllowed === false && continuityManifest?.policy?.singleFilmLine === true && continuityManifest?.policy?.transitionsMustDeclareRelation === true);
  check(checks, "report:review-ledger-locked", candidateReport.reviewLedger?.contract === "A1HSeriesVisualReviewLedger/v1" && candidateReport.reviewLedger?.status === "PENDING_USER_VISUAL_REVIEW" && candidateReport.reviewLedger?.decisionRequired === true && candidateReport.reviewLedger?.pendingCount === 47 && candidateReport.reviewLedger?.reviewedCount === 0 && candidateReport.reviewLedger?.approvedCount === 0 && candidateReport.reviewLedger?.rejectedCount === 0 && candidateReport.checks?.reviewLedgerComplete === true);
  const candidateReportSha = sha256(path.join(artifactRoot, "report.json"));
  const candidatePropsSha = candidateReport.sourceBinding?.candidateProps?.sha256;
  check(checks, "docs:current-task-pointer-bound", currentTask.includes("h-series-preproduction-motion-candidate-v1") && currentTask.includes(candidatePropsSha) && currentTask.includes(candidateReportSha) && currentTask.includes(authorityVideoSha256) && currentTask.includes("PENDING_USER_VISUAL_REVIEW") && currentTask.includes("rendererAdoptionAllowed=false") && currentTask.includes("finalRenderAllowed=false"), {candidatePropsSha, candidateReportSha});
  check(checks, "docs:handoff-pointer-bound", handoff.includes("h-series-preproduction-motion-candidate-v1") && handoff.includes(candidatePropsSha) && handoff.includes(candidateReportSha) && handoff.includes(authorityVideoSha256) && handoff.includes("PENDING_USER_VISUAL_REVIEW") && handoff.includes("rendererAdoptionAllowed=false") && handoff.includes("finalRenderAllowed=false"), {candidatePropsSha, candidateReportSha});
}

if (candidate && source && staticPlan && candidateReport && stillsReport) {
  const candidateSha = sha256(candidatePropsPath);
  const sourceSha = sha256(sourcePropsPath);
  const staticScenes = Array.isArray(staticPlan.scenes) ? staticPlan.scenes : [];
  const candidateScenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];
  const staticIds = staticScenes.map((scene) => scene.beatId);
  const candidateIds = candidateScenes.map((scene) => scene.beatId);
  const candidateById = new Map(candidateScenes.map((scene) => [scene.beatId, scene]));
  const staticById = new Map(staticScenes.map((scene) => [scene.beatId, scene]));
  const parityFailures = staticIds.filter((beatId, index) => candidateIds[index] !== beatId || !candidateById.has(beatId));
  const titleDrift = staticIds.filter((beatId) => JSON.stringify(candidateById.get(beatId)?.titleLines) !== JSON.stringify(staticById.get(beatId)?.source.lockedHeadlineLines));
  const layoutHeadlineDrift = staticIds.filter((beatId) => {
    const scene = candidateById.get(beatId);
    const expected = scene?.storyboard?.shotDirector?.text?.headlineLines || [];
    const actual = scene?.layout?.typography?.lines || [];
    return JSON.stringify(actual) !== JSON.stringify(expected);
  });
  const genericElementLabels = staticIds.flatMap((beatId) => {
    const staticElements = staticById.get(beatId)?.elements || [];
    const candidateElements = candidateById.get(beatId)?.storyboard?.shotDirector?.elements || [];
    return staticElements.filter((element, index) => candidateElements[index]?.label === element.semanticJob).map((element) => `${beatId}:${element.kind}`);
  });
  const typographyDrift = staticIds.filter((beatId) => {
    const candidateTypography = candidateById.get(beatId)?.storyboard?.shotDirector?.typography;
    const staticTypography = staticById.get(beatId)?.typography;
    return !candidateTypography || candidateTypography.family !== staticTypography?.family || candidateTypography.layout !== staticTypography?.layout || candidateTypography.emphasisStyle !== staticTypography?.emphasisStyle || JSON.stringify(candidateTypography.lineScale) !== JSON.stringify(staticTypography?.lineScale) || JSON.stringify(candidateTypography.lineIndent) !== JSON.stringify(staticTypography?.lineIndent) || candidateTypography.supportStyle !== staticTypography?.supportStyle || candidateTypography.motion !== staticTypography?.motion;
  });
  const transitionEnumDrift = staticIds.filter((beatId) => {
    const candidateMotion = candidateById.get(beatId)?.storyboard?.shotDirector?.motion;
    const continuity = continuityManifest?.items?.find((item) => item.beatId === beatId);
    return !continuity || candidateMotion?.transitionIn !== continuity.transitionIn || candidateMotion?.transitionOut !== continuity.transitionOut;
  });
  const stage3Count = candidateScenes.filter((scene) => scene.storyboard?.stage3DirectorPriority === true && scene.storyboard?.shotDirector?.contract === "A1HSeriesShotDirectorPlan/v1").length;
  const candidateRoutes = candidateScenes.filter((scene) => scene.storyboard?.shotDirector?.asset?.route).length;
  const h09GapPlan = candidateById.get("H09-B03")?.storyboard?.shotDirector;
  const h09GapElement = h09GapPlan?.elements?.find((element) => /(?:gap|缺|补|missing|insert)/iu.test(`${element.kind} ${element.role} ${element.label}`));
  const h09GapBinding = Boolean(h09GapPlan && h09GapElement && h09GapElement.label === h09GapPlan.text.emphasis && h09GapElement.highlighted === false);
  const unboundRealEvidence = candidateScenes.filter((scene) => scene.route === "real-evidence" && !(scene.entityEvidence || []).some((item) => item.asset && item.assetSha256)).map((scene) => scene.beatId);
  const unboundEditorialArtwork = candidateScenes.filter((scene) => scene.route === "editorial-artwork" && !(scene.layers || []).some((layer) => layer.kind === "foreground-subject" && layer.asset && layer.assetSha256)).map((scene) => scene.beatId);
  const missingSourceStatuses = candidateScenes.filter((scene) => scene.storyboard?.shotDirector?.asset?.status === "missing-source").map((scene) => scene.beatId);
  const semanticDecisionFailures = candidateScenes.filter((scene) => {
    const director = scene.storyboard?.shotDirector;
    return !director
      || !Array.isArray(director.text?.headlineLines) || director.text.headlineLines.length === 0
      || !director.typography?.family || !director.typography?.layout || !director.typography?.emphasisStyle
      || !director.background?.mode || !director.background?.rationale
      || !director.composition?.mode || !director.composition?.rationale
      || !Array.isArray(director.elements) || director.elements.length === 0
      || !director.asset?.route || !director.asset?.status
      || !director.motion?.primary || !director.motion?.transitionIn || !director.motion?.transitionOut
      || !director.continuity?.carryIn || !director.continuity?.carryOut || !director.continuity?.transitionLogic;
  }).map((scene) => scene.beatId);
  const backgroundVariantFailures = candidateScenes.filter((scene) => {
    const director = scene.storyboard?.shotDirector;
    const source = staticById.get(scene.beatId)?.background?.mode;
    return !director?.background?.variant || director.background.variant !== source;
  }).map((scene) => scene.beatId);
  const boundLayerAssets = candidateScenes.flatMap((scene) => (scene.layers || []).filter((layer) => typeof layer.asset === "string" && layer.asset).map((layer) => ({beatId: scene.beatId, asset: layer.asset})));
  const missingBoundLayerAssets = boundLayerAssets.filter(({asset}) => !fs.existsSync(path.join(root, "remotion-renderer/public", asset.replace(/^\//u, ""))));
  const manifestByBeatId = new Map((materialManifest?.items || []).map((item) => [item.beatId, item]));
  const reuseSourceMismatches = staticScenes.flatMap((scene) => {
    if (scene.material?.status !== "reuse-source-evidence") return [];
    const expected = (manifestByBeatId.get(scene.beatId)?.sources || []).map((item) => item.path || item.asset).filter(Boolean).sort();
    const actual = (candidateById.get(scene.beatId)?.entityEvidence || []).map((item) => item.asset).filter(Boolean).sort();
    const status = candidateById.get(scene.beatId)?.storyboard?.shotDirector?.asset?.status;
    return status === "bound" && expected.every((asset) => actual.includes(asset)) ? [] : [scene.beatId];
  });
  const selectedIds = Array.isArray(candidateReport.selectedBeatIds) ? candidateReport.selectedBeatIds : [];
  const continuityItems = Array.isArray(continuityManifest?.items) ? continuityManifest.items : [];
  const continuityOrdered = continuityItems.length === candidateScenes.length && continuityItems.every((item, index) => item.beatId === candidateIds[index] && (index === 0 ? item.previousBeatId === null : item.previousBeatId === candidateIds[index - 1]));
  const continuityFieldsBound = continuityItems.length === 47 && continuityItems.every((item) => item.transitionIn && item.transitionOut && item.carryIn && item.carryOut && item.motifId);
  const continuityBoundariesDeclared = continuityItems.length === 47 && continuityItems.slice(1).every((item, index) => item.relation && item.transitionIn && continuityItems[index]?.transitionOut);
  check(checks, "coverage:47-static", staticScenes.length === 47 && candidateScenes.length === 47 && candidateReport.checks?.candidateSceneCount === true);
  check(checks, "coverage:ordered-parity", parityFailures.length === 0, parityFailures.slice(0, 10));
  check(checks, "coverage:title-lines-parity", titleDrift.length === 0, titleDrift.slice(0, 10));
  check(checks, "coverage:layout-headline-authority-parity", layoutHeadlineDrift.length === 0, layoutHeadlineDrift.slice(0, 10));
  check(checks, "coverage:continuity-transition-enum-parity", transitionEnumDrift.length === 0, transitionEnumDrift.slice(0, 10));
  check(checks, "coverage:element-labels-are-display-copy", genericElementLabels.length === 0, genericElementLabels.slice(0, 20));
  check(checks, "coverage:typography-parity", typographyDrift.length === 0, typographyDrift.slice(0, 10));
  check(checks, "coverage:stage3-director-injected", stage3Count === 47, {stage3Count});
  check(checks, "coverage:material-route-injected", candidateRoutes === 47, {candidateRoutes});
  check(checks, "coverage:per-shot-semantic-decision-complete", semanticDecisionFailures.length === 0, semanticDecisionFailures);
  check(checks, "coverage:per-shot-background-variant-bound", backgroundVariantFailures.length === 0, backgroundVariantFailures, {reason: "each renderer background must retain the authored per-shot background intent instead of only a collapsed family"});
  check(checks, "coverage:h09-semantic-gap-binding", h09GapBinding, {gapElement: h09GapElement || null, emphasis: h09GapPlan?.text?.emphasis || null});
  check(checks, "coverage:real-evidence-assets-bound", unboundRealEvidence.length === 0, unboundRealEvidence);
  check(checks, "coverage:editorial-artwork-assets-bound", unboundEditorialArtwork.length === 0, unboundEditorialArtwork);
  check(checks, "coverage:material-status-bound", candidateReport.summary?.missingSourceCount === 0 && missingSourceStatuses.length === 0, {missingSourceStatuses, reportMissingSourceCount: candidateReport.summary?.missingSourceCount});
  check(checks, "coverage:bound-layer-assets-exist", missingBoundLayerAssets.length === 0, {boundLayerAssetCount: boundLayerAssets.length, missing: missingBoundLayerAssets.slice(0, 20)});
  check(checks, "coverage:reuse-sources-use-manifest-authority", reuseSourceMismatches.length === 0, reuseSourceMismatches);
  check(checks, "coverage:selected-12", selectedIds.length === 12 && selectedIds.every((beatId) => candidateById.has(beatId)) && candidateReport.holdFrames?.count === 12 && candidateReport.holdFrames?.expectedCount === 12);
  check(checks, "continuity:six-adjacent-pairs", candidateReport.continuityProof?.pairCount === 6 && candidateReport.continuityProof?.adjacentPairCount === 6 && candidateReport.continuityProof?.rendererBound === true && candidateReport.checks?.adjacentContinuityPairs === true && candidateReport.checks?.continuityRendererBound === true, candidateReport.continuityProof);
  check(checks, "continuity:manifest-items-parity", continuityItems.length === 47 && continuityOrdered, {itemCount: continuityItems.length, candidateCount: candidateScenes.length, ordered: continuityOrdered});
  check(checks, "continuity:manifest-fields-bound", continuityFieldsBound, {itemCount: continuityItems.length});
  check(checks, "continuity:manifest-boundaries-declared", continuityManifest?.summary?.transitionCount === 46 && continuityBoundariesDeclared, {transitionCount: continuityManifest?.summary?.transitionCount, boundariesDeclared: continuityBoundariesDeclared});
  check(checks, "continuity:manifest-source-props-bound", continuityManifest?.sourceBinding?.propsSha256 === sourceSha && candidateReport.continuityCoverage?.sourcePropsBound === true, {manifestPropsSha256: continuityManifest?.sourceBinding?.propsSha256, sourceSha});
  check(checks, "coverage:all-47-hold-frames", candidateReport.allHoldFrames?.count === 47 && candidateReport.allHoldFrames?.expectedCount === 47 && candidateReport.checks?.allStillCount === true);
  check(checks, "props:sha-bound", candidateReport.sourceBinding?.candidateProps?.sha256 === candidateSha && candidateReport.sourceBinding?.sourceProps?.sha256 === sourceSha);
  check(checks, "props:source-unchanged", candidateReport.checks?.currentPropsUnchanged === true && sourceSha === sha256(sourcePropsPath));
  check(checks, "stills:47-pass", stillsReport.status === "PASS" && stillsReport.output?.fullSceneCount === 47 && stillsReport.output?.renderedCount === 47 && stillsReport.output?.missingCount === 0);
  check(checks, "video:metadata", candidateReport.video?.width === 960 && candidateReport.video?.height === 540 && candidateReport.video?.fps === 30 && candidateReport.video?.durationFrames === 1080 && candidateReport.video?.audioBound === false);
  check(checks, "video:hash-bound", candidateReport.video?.sha256 === sha256(candidateVideoPath));
  check(checks, "contact-sheet:hash-bound", candidateReport.contactSheet?.sha256 === sha256(contactSheetPath));
  check(checks, "all-contact-sheet:hash-bound", candidateReport.allContactSheet?.sha256 === sha256(allContactSheetPath) && candidateReport.allContactSheet?.columns === 5 && candidateReport.allContactSheet?.rows === 10);
  check(checks, "authority:unchanged", sha256(authorityVideoPath) === authorityVideoSha256);
  const page = fs.readFileSync(reviewPagePath, "utf8");
  const shotDirectorRenderer = fs.readFileSync(shotDirectorRendererPath, "utf8");
  check(checks, "page:candidate-marker", page.includes('data-a1-preproduction-motion-candidate="ready-for-review"'));
  check(checks, "page:candidate-lock-markers", page.includes('data-a1-preproduction-motion-candidate-renderer-adoption="false"') && page.includes('data-a1-preproduction-motion-candidate-full-mp4="false"'));
  check(checks, "page:all-stills-marker", page.includes('data-a1-preproduction-motion-candidate-all-still-count={preproductionMotionCandidate.allHoldFrames.count}') && page.includes('data-a1-preproduction-motion-candidate-all-stills="47-shot-motion-stills"'));
  check(checks, "page:continuity-marker", page.includes('data-a1-preproduction-motion-candidate-continuity-pairs={preproductionMotionCandidate.continuityProof.adjacentPairCount}') && page.includes('data-a1-preproduction-motion-candidate-full-continuity="47-scenes-46-boundaries"') && page.includes("CONTINUITY CORRIDORS") && page.includes("全片连续性"));
  check(checks, "page:single-linear-workflow", page.includes('data-a1-current-workflow="single-linear-packaging-line"') && page.includes('data-a1-current-workflow-stage="preproduction-motion-candidate"') && page.includes('data-a1-current-workflow-stage="source-adoption"') && page.includes('href="#shot-decision-ledger"') && !page.includes('href="/storyboard"'));
  check(checks, "page:review-ledger-marker", page.includes("data-a1-preproduction-motion-candidate-review-ledger={preproductionMotionCandidate.reviewLedger.status}") && page.includes("data-a1-preproduction-motion-candidate-pending-review-count={preproductionMotionCandidate.reviewLedger.pendingCount}"));
  check(checks, "page:typography-binding-marker", page.includes("data-a1-preproduction-typography-binding={preproductionMotionCandidate.typographyBinding.allSceneFamiliesBound ? \"pass\" : \"blocked\"}") && page.includes("data-a1-preproduction-typography-font-assets={preproductionMotionCandidate.typographyBinding.fontAssetsAllPresent ? \"pass\" : \"blocked\"}") && page.includes("TYPE PROFILES / ACTUAL FONT BINDING") && page.includes("实际字体文件"));
  check(checks, "page:generated-artwork-review-marker", page.includes("data-a1-preproduction-motion-candidate-generated-artwork-review={preproductionMotionCandidate.generatedArtworkReview?.status || \"missing\"}") && page.includes("data-a1-preproduction-motion-candidate-generated-artwork-pending={preproductionMotionCandidate.generatedArtworkReview?.pendingVisualReviewCount ?? \"missing\"}") && page.includes("data-a1-preproduction-generated-artwork-binding") && page.includes("GENERATED ARTWORK / REVIEW BOUND") && page.includes("生成配图"));
  check(checks, "page:adoption-readiness-marker", page.includes("data-a1-preproduction-motion-candidate-adoption-readiness={adoptionReadiness}") && page.includes("awaiting-explicit-adoption-approval") && page.includes("revision-required"));
  check(checks, "page:review-decision-channel", page.includes("HSeriesReviewControl") && page.includes('data-a1-preproduction-motion-candidate-decision-entry="review-only"') && page.includes("currentReviewDecisionLedger"));
  const reviewDecisionRoute = fs.readFileSync(reviewDecisionRoutePath, "utf8");
  const reviewDecisionControl = fs.readFileSync(reviewDecisionControlPath, "utf8");
  const generatedArtworkReviewControl = fs.readFileSync(generatedArtworkReviewControlPath, "utf8");
  const generatedArtworkReviewModule = fs.readFileSync(generatedArtworkReviewModulePath, "utf8");
  const generatedArtworkReviewTest = fs.readFileSync(generatedArtworkReviewTestPath, "utf8");
  const generatedArtworkRepairAdoptionModule = fs.readFileSync(generatedArtworkRepairAdoptionModulePath, "utf8");
  const generatedArtworkRepairAdoptionTest = fs.readFileSync(generatedArtworkRepairAdoptionTestPath, "utf8");
  const generatedArtworkRepairAdoptionBuild = fs.readFileSync(generatedArtworkRepairAdoptionBuildPath, "utf8");
  const generatedArtworkRepairAdoptionReport = readJson(generatedArtworkRepairAdoptionReportPath);
  const reviewApiIsolationTest = fs.readFileSync(reviewApiIsolationTestPath, "utf8");
  const reviewFullFlowTest = fs.readFileSync(reviewFullFlowTestPath, "utf8");
  const artworkGenerationScript = fs.readFileSync(artworkGenerationScriptPath, "utf8");
  const reviewFlowController = fs.readFileSync(reviewFlowControllerPath, "utf8");
  const adoptionApprovalControl = fs.readFileSync(adoptionApprovalControlPath, "utf8");
  const targetedRevisionRenderer = fs.readFileSync(targetedRevisionRendererPath, "utf8");
  check(checks, "review-channel:separate-ledger", reviewDecisionRoute.includes('A1HSeriesVisualReviewDecisionLedger/v1') && reviewDecisionRoute.includes("review-decisions.json") && reviewDecisionRoute.includes("rendererAdoptionAllowed: false") && reviewDecisionRoute.includes("finalRenderAllowed: false") && reviewDecisionRoute.includes("resolveExportAllowed: false"));
  check(checks, "review-channel:artwork-execution-plan-refresh", reviewDecisionRoute.includes("refreshArtworkExecutionPlan") && reviewDecisionRoute.includes("build-h-series-generated-artwork-execution-plan-v1.mjs") && reviewDecisionRoute.includes("artworkExecutionPlanRefresh"));
  check(checks, "artwork-generation:plan-bound-16-9-output", artworkGenerationScript.includes("generationDispatchAllowed") && artworkGenerationScript.includes("outputName") && artworkGenerationScript.includes("h-series-generated-editorial-artwork-repair-v1") && artworkGenerationScript.includes("1536x864") && artworkGenerationScript.includes("naturalWidth >= 1200") && !artworkGenerationScript.includes("naturalWidth === imgs[i].naturalHeight"));
  check(checks, "review-channel:explicit-version-binding", reviewDecisionRoute.includes("candidate version changed; reload the review page") && reviewDecisionRoute.includes("submittedCandidatePropsSha256 !== candidatePropsSha256"));
  check(checks, "review-channel:controls-review-only", reviewDecisionControl.includes("/api/system-line/h-series-review") && reviewDecisionControl.includes("画面通过") && reviewDecisionControl.includes("需要修改") && reviewDecisionControl.includes('data-a1-review-no-auto-adoption="true"') && reviewDecisionControl.includes('data-a1-review-approval-blocked') && reviewDecisionControl.includes("approvalBlocked") && reviewDecisionControl.includes('method="post"') && reviewDecisionControl.includes('data-a1-review-native-fallback="form-post"'));
  check(checks, "review-channel:risky-artwork-cannot-be-approved", reviewDecisionRoute.includes("readArtworkPolicyRisk") && reviewDecisionRoute.includes("命中配图政策风险") && reviewDecisionRoute.includes('decision === "approve"') && page.includes("approvalBlocked={Boolean(artworkPolicy?.visualRisk)}"));
  check(checks, "review-channel:linear-flow-controller", page.includes("HSeriesReviewFlowController") && reviewFlowController.includes('data-a1-review-flow-controller="linear-47-shot"') && reviewFlowController.includes('data-a1-review-flow-progress') && reviewFlowController.includes('data-a1-review-current-beat') && reviewFlowController.includes('data-a1-review-focus-mode') && reviewFlowController.includes('data-a1-review-current') && reviewFlowController.includes('data-a1-review-secondary') && reviewFlowController.includes('aria-current') && reviewFlowController.includes('data-a1-review-flow-native-fallback="anchors"') && reviewFlowController.includes('data-a1-review-flow-hash-initial-sync="true"') && reviewFlowController.includes('useSyncExternalStore') && reviewFlowController.includes('beatIndexFromLocation(reviewHash, beatIds)') && page.includes('id={`review-${shot.beatId}`}') && page.includes('data-[a1-review-current=true]:bg-[#f7f8ff]') && page.includes('data-[a1-review-secondary=true]:opacity-50') && reviewFlowController.includes("scrollIntoView") && reviewFlowController.includes("href={`#review-${nextBeatId}`}") && reviewFlowController.includes("a1-h-series-review-updated"));
  check(checks, "review-channel:progressive-write-path", reviewDecisionRoute.includes("readRequestBody") && reviewDecisionRoute.includes("request.formData()") && reviewDecisionRoute.includes("respondToReviewRequest") && reviewDecisionRoute.includes("NextResponse.redirect") && reviewDecisionRoute.includes("redirectTo"));
  check(checks, "review-channel:targeted-revision-queue", reviewDecisionRoute.includes('A1HSeriesReviewRevisionQueue/v1') && reviewDecisionRoute.includes("revision-queue.json") && reviewDecisionRoute.includes("writeRevisionQueue") && reviewDecisionRoute.includes("targeted-shot-repair-and-rerender") && page.includes('data-a1-review-revision-queue="open"') && page.includes("revisionQueue.candidateReportSha256 === currentReviewDecisionLedger?.candidateReportSha256") && page.includes("只处理被标记的镜头"));
  check(checks, "review-channel:page-binds-review-to-report-hash", page.includes("reviewDecisionLedger.candidateReportSha256 === candidateReportSha256") && page.includes("adoptionApprovalLedger.candidateReportSha256 === candidateReportSha256"));
  check(checks, "review-channel:targeted-revision-executor", targetedRevisionRenderer.includes('A1HSeriesReviewRevisionQueue/v1') && targetedRevisionRenderer.includes('A1HSeriesTargetedRevisionRender/v1') && targetedRevisionRenderer.includes('--revised-props') && targetedRevisionRenderer.includes("revised-props-required") && targetedRevisionRenderer.includes("stale-revision-queue") && targetedRevisionRenderer.includes("non-target-scenes-changed") && targetedRevisionRenderer.includes('"--only"') && targetedRevisionRenderer.includes('fullMp4Rendered: false') && targetedRevisionRenderer.includes('rendererAdoptionAllowed: false'));
  check(checks, "review-channel:explicit-adoption-gate", reviewDecisionRoute.includes('A1HSeriesExplicitAdoptionApproval/v1') && reviewDecisionRoute.includes('action === "approve-adoption"') && reviewDecisionRoute.includes("reviewDecisionDigestSha256") && reviewDecisionRoute.includes("applyAllowed: false") && reviewDecisionRoute.includes("readArtworkAdoptionGate") && reviewDecisionRoute.includes("artworkAdoptionGate.blocked") && adoptionApprovalControl.includes('data-a1-explicit-adoption-approval="review-gated"') && adoptionApprovalControl.includes('data-a1-explicit-adoption-native-form="true"') && adoptionApprovalControl.includes('data-a1-explicit-adoption-artwork-gate') && adoptionApprovalControl.includes('method="post"') && adoptionApprovalControl.includes('action: "approve-adoption"') && adoptionApprovalControl.includes("仍需单独执行采用"));
  check(checks, "review-channel:generated-artwork-review-ledger", reviewDecisionRoute.includes('A1HSeriesGeneratedArtworkReviewLedger/v1') && reviewDecisionRoute.includes('action === "review-generated-artwork"') && reviewDecisionRoute.includes("generated-artwork-repair-result-v1/review-decisions.json") && reviewDecisionRoute.includes("executionPlanSha256") && reviewDecisionRoute.includes("不会自动采用"));
  check(checks, "review-channel:generated-artwork-repair-adoption-refresh", reviewDecisionRoute.includes("build-h-series-generated-artwork-repair-adoption-plan-v1.mjs") && reviewDecisionRoute.includes("refreshArtworkRepairAdoptionPlan") && reviewDecisionRoute.includes("repairAdoptionPlanRefresh") && reviewDecisionRoute.includes("generatedArtworkRepairAdoptionPlan"));
  check(checks, "review-channel:api-isolation-regression", reviewDecisionRoute.includes("A1_H_SERIES_REVIEW_ROOT") && reviewApiIsolationTest.includes("candidateLedgerAndArtworkLedgerAreSeparate") && reviewApiIsolationTest.includes("A1_H_SERIES_REVIEW_ROOT") && reviewApiIsolationTest.includes("candidateLedgerRelative") && reviewApiIsolationTest.includes("artworkLedgerRelative"));
  check(checks, "review-channel:full-flow-regression", reviewDecisionRoute.includes("pendingCandidateArtworkReviewCount") && reviewDecisionRoute.includes("pendingRepairArtworkReviewCount") && reviewFullFlowTest.includes("all47CandidateDecisionsReachArtworkGate") && reviewFullFlowTest.includes("repairArtworkPendingBlocksAdoption") && reviewFullFlowTest.includes("explicitAdoptionCompletes"));
  check(checks, "review-channel:generated-artwork-review-control", page.includes("HSeriesGeneratedArtworkReviewControl") && generatedArtworkReviewControl.includes('data-a1-generated-artwork-review-control') && generatedArtworkReviewControl.includes('生成图通过') && generatedArtworkReviewControl.includes('生成图返修') && generatedArtworkReviewControl.includes('review-generated-artwork') && generatedArtworkReviewControl.includes('data-a1-generated-artwork-review-no-auto-adoption="true"'));
  check(checks, "review-channel:generated-artwork-review-state-machine", generatedArtworkReviewModule.includes("normalizeA1HSeriesGeneratedArtworkReviewLedger") && generatedArtworkReviewModule.includes("resultManifestSha256") && generatedArtworkReviewModule.includes("executionPlanSha256") && generatedArtworkReviewTest.includes("all-approved-result-review-must-open-explicit-adoption-gate") && generatedArtworkReviewTest.includes("stale-result-manifest-must-clear-decisions"));
  check(checks, "review-channel:generated-artwork-repair-adoption-state-machine", generatedArtworkRepairAdoptionModule.includes("A1_H_SERIES_GENERATED_ARTWORK_REPAIR_ADOPTION_CONTRACT") && generatedArtworkRepairAdoptionModule.includes("WAITING_FOR_GENERATED_ARTWORK_RESULT") && generatedArtworkRepairAdoptionModule.includes("READY_FOR_EXPLICIT_APPROVAL") && generatedArtworkRepairAdoptionTest.includes("all-approved-result-review-must-build-plan-only-candidate") && generatedArtworkRepairAdoptionTest.includes("stale-result-review-must-block") && generatedArtworkRepairAdoptionTest.includes("earliest-generation-gate") && generatedArtworkRepairAdoptionBuild.includes("buildA1HSeriesGeneratedArtworkRepairAdoptionPlan") && generatedArtworkRepairAdoptionReport?.contract === "A1HSeriesGeneratedArtworkRepairAdoptionPlan/v1" && generatedArtworkRepairAdoptionReport?.status === "WAITING_FOR_GENERATED_ARTWORK_RESULT" && generatedArtworkRepairAdoptionReport?.sourcePropsModified === false && generatedArtworkRepairAdoptionReport?.finalRenderAllowed === false);
  if (exists(reviewDecisionLedgerPath)) {
    const reviewDecisionLedger = readJson(reviewDecisionLedgerPath);
    const candidateBeatIds = (candidateReport.reviewLedger?.items || []).map((item) => item.beatId);
    const decisions = Array.isArray(reviewDecisionLedger?.decisions) ? reviewDecisionLedger.decisions : [];
    const uniqueBeatIds = new Set(decisions.map((item) => item.beatId));
    const validDecisions = decisions.every((item) => candidateBeatIds.includes(item.beatId) && ["approve", "revise"].includes(item.decision) && typeof item.note === "string" && item.note.length <= 500);
    check(checks, "review-channel:ledger-contract", reviewDecisionLedger?.contract === "A1HSeriesVisualReviewDecisionLedger/v1" && reviewDecisionLedger?.reviewOnly === true && reviewDecisionLedger?.rendererAdoptionAllowed === false && reviewDecisionLedger?.finalRenderAllowed === false && reviewDecisionLedger?.resolveExportAllowed === false);
    check(checks, "review-channel:ledger-bound", reviewDecisionLedger?.candidatePropsSha256 === candidateReport.sourceBinding?.candidateProps?.sha256 && reviewDecisionLedger?.candidateReportSha256 === sha256(path.join(publicRoot, "report.json")));
    check(checks, "review-channel:ledger-decisions-valid", uniqueBeatIds.size === decisions.length && validDecisions, {decisionCount: decisions.length});
  }
  check(checks, "page:shot-ledger-binds-real-stills", page.includes('data-a1-preproduction-shot-ledger="47-complete-decisions"') && page.includes('data-a1-preproduction-shot-row={shot.beatId}') && page.includes('data-a1-preproduction-shot-still={shot.beatId}') && page.includes('shotStillUrl'));
  check(checks, "page:shot-ledger-exposes-material-binding", page.includes("data-a1-shot-material-binding={shot.beatId}") && page.includes("data-a1-review-material-binding={shot.beatId}") && page.includes("绑定：{boundMaterial ||"));
  check(checks, "page:shot-ledger-exposes-artwork-provenance", page.includes("candidateArtworkReviewByBeat") && page.includes("data-a1-review-artwork-source={shot.beatId}") && page.includes("配图来源：") && page.includes("哈希匹配") && page.includes("生成清单哈希不一致"));
  check(checks, "page:shot-ledger-exposes-artwork-policy-risk", page.includes("GeneratedArtworkPolicyAudit") && page.includes("candidateArtworkPolicyByBeat") && page.includes("data-a1-review-artwork-policy={shot.beatId}") && page.includes("data-a1-generated-artwork-policy-warning=\"forbidden-line-primitive\"") && page.includes("疑似装饰性破线/线框"));
  check(checks, "page:shot-ledger-exposes-artwork-repair-brief", page.includes("GeneratedArtworkRepairBrief") && page.includes("candidateArtworkRepairBriefByBeat") && page.includes("data-a1-generated-artwork-repair-brief") && page.includes("data-a1-review-artwork-repair-brief={shot.beatId}") && page.includes("逐镜返修 brief") && page.includes("未决定前不生成"));
  check(checks, "page:shot-ledger-exposes-artwork-generation-gate", page.includes("GeneratedArtworkExecutionPlan") && page.includes("generatedArtworkExecutionPlan") && page.includes("data-a1-generated-artwork-execution-plan") && page.includes("data-a1-generated-artwork-dispatch") && page.includes("等待 47 镜逐镜决定"));
  check(checks, "page:shot-ledger-exposes-repair-result-slot", page.includes("GeneratedArtworkRepairResult") && page.includes("generatedArtworkRepairResultByBeat") && page.includes("data-a1-review-artwork-repair-result={shot.beatId}") && page.includes("新返修配图"));
  check(checks, "page:shot-ledger-exposes-repair-result-review-state", page.includes("GeneratedArtworkReviewLedger") && page.includes("currentGeneratedArtworkRepairResultReview") && page.includes("data-a1-generated-artwork-repair-review") && generatedArtworkReviewControl.includes("生成图通过"));
  check(checks, "page:shot-ledger-exposes-repair-adoption-plan-state", page.includes("GeneratedArtworkRepairAdoptionPlan") && page.includes("generatedArtworkRepairAdoptionPlan") && page.includes("data-a1-generated-artwork-repair-adoption-plan") && page.includes("返修采用计划"));
  check(checks, "page:shot-ledger-exposes-motion-binding", page.includes("data-a1-review-motion-binding={shot.beatId}") && page.includes("候选动效缺失") && page.includes("进场：") && page.includes("出场："));
  check(checks, "page:shot-ledger-exposes-transition-labels", page.includes("function transitionLabelFor") && page.includes("纸页翻转") && page.includes("沿用上一镜母题") && page.includes("选区回收"));
  check(checks, "page:shot-ledger-exposes-motion-proof-map", page.includes("data-a1-review-motion-proof={shot.beatId}") && page.includes("运动证明") && page.includes("本镜暂未进入 12 镜运动片段"));
  check(checks, "page:shot-ledger-exposes-semantic-basis", page.includes("data-a1-review-semantic-basis={shot.beatId}") && page.includes("为什么存在："));
  check(checks, "page:shot-ledger-exposes-background-variant", page.includes("candidateShotBackgroundByBeat") && page.includes("data-a1-review-background-variant={shot.beatId}") && page.includes("renderer 意图："), {reason: "the review surface must expose the authored background intent that the candidate renderer consumes"});
  check(checks, "page:shot-ledger-exposes-prior-visual-fix", page.includes("candidateVisualFixByBeat") && page.includes("data-a1-review-prior-visual-fix={shot.beatId}") && page.includes("已有审片提示：") && page.includes("非阻塞，不自动采用") && page.includes("source.propsSha256 === preproductionMotionCandidate?.sourceBinding.sourceProps.sha256"));
  check(checks, "page:shot-ledger-exposes-review-focus", page.includes("function shotReviewFocus(shot: PreproductionShotDecision)") && page.includes("data-a1-review-focus={shot.beatId}") && page.includes("本镜审片焦点："));
  check(checks, "page:current-candidate-binding-strip", page.includes('data-a1-current-candidate-binding="props-report-authority"') && page.includes("data-a1-current-candidate-props-sha256={candidatePropsSha256 || \"missing\"}") && page.includes("data-a1-current-candidate-report-sha256={candidateReportSha256 || \"missing\"}") && page.includes('data-a1-current-candidate-authority="unchanged"') && page.includes("REPORT SHA256"));
  const renderer = fs.readFileSync(path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx"), "utf8");
  const mappedTypographyFamilies = ["editorial-serif", "compressed-editorial", "narrow-judgement", "progress-sans", "neutral-grotesk", "neutral-body", "human-note"];
  check(checks, "renderer:typography-bound", shotDirectorRenderer.includes("data-a1-director-typography-family") && shotDirectorRenderer.includes("headlineProfileFor(typography.family)") && shotDirectorRenderer.includes("data-a1-director-typography-font-family") && mappedTypographyFamilies.every((family) => shotDirectorRenderer.includes(`case \"${family}\"`)) && /function VerdictStage[\s\S]*Headline plan=\{plan\}/u.test(shotDirectorRenderer));
  check(checks, "renderer:headline-scale-aware-fit", shotDirectorRenderer.includes("longestScaledLine") && shotDirectorRenderer.includes("lineScale[index] ?? plan.typography.lineScale.at(-1)") && shotDirectorRenderer.includes("Math.max(56"), {reason: "headline sizing must account for authored per-line scale so long emphasized lines cannot be clipped by narrow compositions"});
  check(checks, "renderer:background-variant-routed", shotDirectorRenderer.includes("backgroundFamilyFor") && shotDirectorRenderer.includes("data-a1-shot-director-background-variant={plan.background.variant}") && shotDirectorRenderer.includes("data-a1-shot-director-background-family={backgroundFamily}") && shotDirectorRenderer.includes("<DirectorBackground mode={plan.background.mode} variant={plan.background.variant} frame={frame}/>") , {reason: "the authored per-shot background intent must reach a visible renderer family and remain inspectable"});
  check(checks, "renderer:background-variant-precedence", shotDirectorRenderer.indexOf('if (/(?:tangled|knot|crushed|xerox)/u.test(value)) return "xerox";') < shotDirectorRenderer.indexOf('if (/(?:question|hollow-problem|residue-field|human-boundary|ink-reversal)/u.test(value)) return "negative-space";') && shotDirectorRenderer.includes('const dark = backgroundFamily === "negative-space";'), {reason: "distinctive per-shot variants must win over the stable mode and determine the readable ink/paper contrast"});
  check(checks, "renderer:shot-director-transition-bound", renderer.includes('data-a1-shot-director-transition="renderer-bound"') && /if\(stage3DirectorPriority\)[\s\S]*TransitionLayer actorExit=\{actorExit\}/u.test(renderer));
  check(checks, "renderer:shot-director-continuity-carry-bound", renderer.includes('data-a1-shot-director-continuity="renderer-bound"') && renderer.includes('previousScene={previousScene}') && shotDirectorRenderer.includes('data-a1-director-continuity-carry-bound') && shotDirectorRenderer.includes('data-a1-director-continuity-carry="true"') && shotDirectorRenderer.includes('data-a1-director-transition-in={plan.motion.transitionIn}') && shotDirectorRenderer.includes('data-a1-director-continuity-carry-in={plan.continuity.carryIn}'), {reason: "adjacent motion proof must visibly carry the prior shot into the next shot"});
  check(checks, "renderer:verdict-artwork-bound", shotDirectorRenderer.includes("function VerdictStage({scene, plan") && shotDirectorRenderer.includes("foregroundAsset(scene)") && shotDirectorRenderer.includes('data-a1-director-artwork="verdict-bound"'));
  check(checks, "renderer:process-artwork-bound", shotDirectorRenderer.includes("function ProcessStage({scene, plan") && shotDirectorRenderer.includes('data-a1-director-artwork="process-bound"'));
  check(checks, "renderer:comparison-evidence-bound", shotDirectorRenderer.includes("function ComparisonStage({scene, plan") && shotDirectorRenderer.includes('data-a1-director-evidence-strip="comparison-source-bound"') && shotDirectorRenderer.includes("scene.entityEvidence.filter"));
  check(checks, "renderer:manifesto-evidence-bound", shotDirectorRenderer.includes('data-a1-director-evidence="manifesto-source-bound"') && shotDirectorRenderer.includes('plan.asset.route === "real-evidence"') && shotDirectorRenderer.includes("scene.entityEvidence.find"), {reason: "real-evidence manifesto shots must render the bound official mark inside the authored composition"});
  check(checks, "renderer:question-foreground-readable", shotDirectorRenderer.includes("<Headline plan={plan} dark={false} frame={frame} left={110} top={170} width={870}/>") );
  check(checks, "renderer:gap-uses-semantic-element", shotDirectorRenderer.includes("data-a1-gap-element") && shotDirectorRenderer.includes("gapElement?.label||plan.text.emphasis"));
  check(checks, "renderer:question-watermark-binds-to-emphasis", shotDirectorRenderer.includes('data-a1-question-watermark="emphasis-bound"') && !shotDirectorRenderer.includes(">？</div>"), {reason: "question scenes must use the shot's semantic emphasis instead of a generic giant question mark"});
  check(checks, "renderer:artwork-role-label-suppressed", shotDirectorRenderer.includes('item.role!=="editorial-artwork"'), {reason: "editorial artwork remains a visual role, not helper copy rendered as 概念图"});
  check(checks, "renderer:helper-labels-suppressed", shotDirectorRenderer.includes("nonDisplaySupportLabels") && shotDirectorRenderer.includes("displayElementLabel") && shotDirectorRenderer.includes("authoredPlan.elements.map") && shotDirectorRenderer.includes("processStepLabelsFor") && !shotDirectorRenderer.includes('index===0?"输入":index===1?"判断":"输出"'), {reason: "ordinary support shapes must not render filler helper labels such as 材料、判断、正文 or 工作流"});
  check(checks, "renderer:process-sequence-relation-path", shotDirectorRenderer.includes('data-a1-process-sequence-connector="solid"') && shotDirectorRenderer.includes('data-blue-role="verified-process-or-direction-path"') && shotDirectorRenderer.includes('scale:`${progress(frame,18,48)} 1`'), {reason: "the three-step process must show an attached semantic relation path, not three disconnected labels"});
  check(checks, "renderer:motion-primary-routed", shotDirectorRenderer.includes("const motionRevealFor") && shotDirectorRenderer.includes("const elementMotionRevealFor") && shotDirectorRenderer.includes("MotionPrimaryContext") && shotDirectorRenderer.includes('data-a1-director-motion-primary={plan.motion.primary || typography.motion}') && shotDirectorRenderer.includes('data-a1-director-element-motion-primary={motionPrimary}') && ["cut-in", "tracking-settle", "scale-lock"].every((motion) => shotDirectorRenderer.includes(`primary === "${motion}"`)), {reason: "each shot's motion.primary must alter both headline and semantic-element entrances instead of remaining metadata-only"});
  check(checks, "renderer:transition-in-out-routed", shotDirectorRenderer.includes("function ShotDirectorTransitionIn") && shotDirectorRenderer.includes("function ShotDirectorTransitionOut") && shotDirectorRenderer.includes('data-a1-shot-director-transition-in="opening-establish"') && shotDirectorRenderer.includes('data-a1-shot-director-transition-in="paper-match"') && shotDirectorRenderer.includes('data-a1-shot-director-transition-out="paper-turn"') && shotDirectorRenderer.includes("plan.motion.transitionIn") && shotDirectorRenderer.includes("plan.motion.transitionOut"), {reason: "shotDirector transitionIn/transitionOut must produce a visible semantic transition, not only data attributes"});
  const directorBackgroundStart = shotDirectorRenderer.indexOf("function DirectorBackground");
  const directorHeadlineStart = shotDirectorRenderer.indexOf("function Headline", directorBackgroundStart);
  const directorBackgroundSource = directorBackgroundStart >= 0 && directorHeadlineStart > directorBackgroundStart ? shotDirectorRenderer.slice(directorBackgroundStart, directorHeadlineStart) : "";
  check(checks, "renderer:background-no-floating-diamond", !directorBackgroundSource.includes('rotate:"45deg"') && !directorBackgroundSource.includes("rotate: `45deg`"), {reason: "background accents must come from semantic objects, not repeated corner decoration"});
  check(checks, "renderer:no-broken-line-connectors", shotDirectorRenderer.includes('function FlowConnector') && shotDirectorRenderer.includes('data-a1-flow-connector="solid"') && shotDirectorRenderer.includes('data-a1-process-spine="solid"') && !shotDirectorRenderer.includes("strokeDasharray") && !shotDirectorRenderer.includes("FlowArrow") && !shotDirectorRenderer.includes("dashed"), {reason: "candidate visuals must use solid semantic marks and connectors, not broken-line doodles"});
  check(checks, "renderer:highlight-no-card-fill", !shotDirectorRenderer.includes('background:item.highlighted?cobalt:"transparent",padding:item.highlighted?"12px 20px 14px":"0"') && !shotDirectorRenderer.includes('background:item.highlighted?cobalt:"transparent",padding:item.highlighted?"12px 18px":"0"'), {reason: "process and candidate highlights use attached rules instead of cobalt slabs"});
}

let ffprobe = null;
if (exists(candidateVideoPath)) {
  try {
    const ffprobeBinary = path.join(root, "remotion-renderer/node_modules/@remotion/compositor-darwin-arm64/ffprobe");
    const compositorDir = path.dirname(ffprobeBinary);
    ffprobe = JSON.parse(execFileSync(ffprobeBinary, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "json", candidateVideoPath], {cwd: root, encoding: "utf8", env: {...process.env, DYLD_LIBRARY_PATH: `${compositorDir}${process.env.DYLD_LIBRARY_PATH ? `:${process.env.DYLD_LIBRARY_PATH}` : ""}`}}));
    const stream = ffprobe.streams?.[0];
    check(checks, "video:ffprobe", stream?.width === 960 && stream?.height === 540 && stream?.r_frame_rate === "30/1" && stream?.nb_frames === "1080", stream);
  } catch (error) {
    check(checks, "video:ffprobe", false, String(error));
  }
}

const pass = failures.length === 0 && Object.values(checks).every(Boolean);
const report = {
  contract: "A1HSeriesPreproductionMotionCandidateAudit/v1",
  phaseId,
  generatedAt: new Date().toISOString(),
  status: pass ? (warnings.length ? "PASS_WITH_SNAPSHOT_WARNINGS" : "PASS") : "FAIL",
  reviewOnly: true,
  proofOnly: true,
  currentAuthorityMutated: false,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  summary: {staticSceneCount: staticPlan?.scenes?.length ?? 0, candidateSceneCount: candidate?.scenes?.length ?? 0, stage3DirectorCount: candidate?.scenes?.filter((scene) => scene.storyboard?.stage3DirectorPriority === true).length ?? 0, selectedSceneCount: candidateReport?.selectedBeatIds?.length ?? 0, renderedStillCount: stillsReport?.output?.renderedCount ?? 0},
  sourceBinding: {candidatePropsSha256: exists(candidatePropsPath) ? sha256(candidatePropsPath) : null, sourcePropsSha256: exists(sourcePropsPath) ? sha256(sourcePropsPath) : null, authorityVideoSha256: exists(authorityVideoPath) ? sha256(authorityVideoPath) : null},
  checks,
  failures,
  warnings,
  ffprobe,
  nextAction: pass ? "review-47-shot-ledger-then-explicitly-approve-adoption" : "fix-candidate-bridge-and-rerun-audit",
};
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, summary: report.summary, failedChecks: failures.map((failure) => failure.name), warnings: warnings.map((warning) => warning.name), nextAction: report.nextAction}, null, 2));
if (!pass) process.exitCode = 1;
