#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {decideEditorialArtworkPlacement} from "../lib/a1-visual-fit-policy.js";

const root = process.cwd();
const phaseId = "h-series-generated-artwork-adoption-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const candidatePropsPath = path.join(artifactRoot, "candidate-microbeatLayeredFullProps.json");
const publicCandidatePropsPath = path.join(publicRoot, "candidate-microbeatLayeredFullProps.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-result-manifest-v1/report.json");
const visualReviewPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-visual-review-v1/report.json");
const semanticBluePath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-semantic-blue-v1/report.json");
const compositionPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-composition-risk-v1/report.json");
const artworkPolicyPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-artwork-policy-v1/report.json");
const previewAuditPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-targeted-visual-upgrade-preview-audit-v1/report.json");
const currentReviewManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v2-candidate/web-review-manifest.json");
const expectedVisualMasterId = "july1-retro-print-archive-wireframe-v1";

const stableJson = (value) => JSON.stringify(value, null, 2);
const sha256String = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const withoutKey = (value, key) => {
  const copy = structuredClone(value);
  delete copy[key];
  return copy;
};

for (const required of [propsPath, manifestPath, visualReviewPath, semanticBluePath, compositionPath, artworkPolicyPath, previewAuditPath, currentReviewManifestPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${path.relative(root, required)}`);
}

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const currentProps = readJson(propsPath);
const manifest = readJson(manifestPath);
const visualReview = readJson(visualReviewPath);
const semanticBlue = readJson(semanticBluePath);
const composition = readJson(compositionPath);
const artworkPolicy = readJson(artworkPolicyPath);
const previewAudit = readJson(previewAuditPath);
const currentReviewManifest = readJson(currentReviewManifestPath);
const sourcePropsSha256 = sha256File(propsPath);
const currentReviewVideoPath = path.join(root, "apps/studio-next/public", String(currentReviewManifest.video?.url || "").replace(/^\//u, ""));
const currentReviewVideoSha256 = fs.existsSync(currentReviewVideoPath) ? sha256File(currentReviewVideoPath) : null;
const failures = [];

if (currentProps.contract !== "A1MicrobeatLayeredFullPlan/v1" || currentProps.projectId !== "july1-writing-workbench") failures.push("wrong-current-h-series-props");
if (currentProps.reviewOnly !== true || currentProps.finalRenderAllowed !== false || currentProps.scenes?.length !== 47) failures.push("current-props-review-lock-or-scene-count-invalid");
if (manifest.contract !== "A1HSeriesGeneratedArtworkResultManifest/v1" || manifest.status !== "GENERATED_PENDING_VISUAL_REVIEW") failures.push("generated-artwork-manifest-invalid");
if (manifest.visualMasterId !== expectedVisualMasterId) failures.push("generated-artwork-visual-master-mismatch");
if (visualReview.status !== "AUTO_VISUAL_REVIEW_PASS_PENDING_HUMAN_APPROVAL" || visualReview.summary?.failCount !== 0) failures.push("visual-review-not-pass");
if (semanticBlue.status !== "PASS_PENDING_HUMAN_APPROVAL" || semanticBlue.summary?.failCount !== 0) failures.push("semantic-blue-not-pass");
if (composition.status !== "PASS_PENDING_HUMAN_APPROVAL" || composition.summary?.failCount !== 0 || composition.summary?.blockerCount !== 0) failures.push("composition-review-not-pass");
if (artworkPolicy.contract !== "A1HSeriesGeneratedArtworkPolicyAudit/v1" || artworkPolicy.rendererAdoptionAllowed !== false || artworkPolicy.summary?.warningCount !== 0 || artworkPolicy.summary?.failureCount !== 0) failures.push("generated-artwork-policy-risk-present");
if (previewAudit.status !== "PASS" || previewAudit.proof?.generatedArtworkIntegratedIntoPreview !== true || previewAudit.proof?.premiumTextMotionImplementedInPreview !== true) failures.push("targeted-preview-proof-not-pass");
if (!currentReviewVideoSha256 || currentReviewVideoSha256 !== currentReviewManifest.video?.sha256) failures.push("current-review-video-sha-mismatch");

const manifestByBeatId = new Map((manifest.assets || []).map((item) => [item.beatId, item]));
const visualByBeatId = new Map((visualReview.items || []).map((item) => [item.beatId, item]));
const semanticBlueByBeatId = new Map((semanticBlue.items || []).map((item) => [item.beatId, item]));
const compositionByBeatId = new Map((composition.items || []).map((item) => [item.beatId, item]));
const adoptedBeatIds = Array.isArray(previewAudit.targetBeatIds) ? previewAudit.targetBeatIds : [];
const adoptedBeatIdSet = new Set(adoptedBeatIds);
if (adoptedBeatIds.length !== 5) failures.push(`adoption-target-count:${adoptedBeatIds.length}`);

const candidateProps = structuredClone(currentProps);
const adoptionItems = [];
for (const beatId of adoptedBeatIds) {
  const sceneIndex = candidateProps.scenes.findIndex((scene) => scene.beatId === beatId);
  const scene = candidateProps.scenes[sceneIndex];
  const asset = manifestByBeatId.get(beatId);
  const visual = visualByBeatId.get(beatId);
  const blue = semanticBlueByBeatId.get(beatId);
  const compositionItem = compositionByBeatId.get(beatId);
  if (!scene || !asset || !visual || !blue || !compositionItem) {
    failures.push(`adoption-input-missing:${beatId}`);
    continue;
  }
  const sourceFile = path.join(root, asset.localPath);
  if (!fs.existsSync(sourceFile) || sha256File(sourceFile) !== asset.sha256) {
    failures.push(`generated-asset-sha-mismatch:${beatId}`);
    continue;
  }
  if (visual.status !== "PASS" || blue.status !== "PASS" || compositionItem.status !== "PASS") {
    failures.push(`generated-asset-review-not-pass:${beatId}`);
    continue;
  }
  const destinationRelative = `generated/system-line/h-series-generated-artwork-adopted-v1/assets/${path.basename(asset.localPath)}`;
  const placement = decideEditorialArtworkPlacement({
    generatedEditorialArtwork: true,
    kind: "generated-editorial-artwork",
    route: "generated-editorial-artwork",
    promptRole: asset.promptRole,
    sceneRole: scene.presentation?.state,
    sceneText: scene.screenText,
    visualJob: scene.presentation?.semanticDelta,
    family: scene.family,
    width: asset.dimensions?.width,
    height: asset.dimensions?.height,
    targetAspectRatio: scene.layout.stageBox.width / scene.layout.stageBox.height,
    frameAspectRatio: 16 / 9,
    centroid: compositionItem.stats?.centroid,
    bbox: compositionItem.stats?.bbox,
    emptyFieldFraction: compositionItem.stats?.emptyFieldFraction,
    nonPaperFraction: compositionItem.stats?.nonPaperFraction,
    edgeWeightShare: compositionItem.stats?.weightShares?.edge,
    factualEvidenceAllowed: false,
  });
  const layerIndex = scene.layers.findIndex((layer) => layer.kind === "foreground-subject");
  if (layerIndex < 0) {
    failures.push(`foreground-layer-missing:${beatId}`);
    continue;
  }
  const beforeLayer = structuredClone(scene.layers[layerIndex]);
  scene.layers[layerIndex] = {
    ...scene.layers[layerIndex],
    asset: destinationRelative,
    assetSha256: asset.sha256,
    editable: false,
    motion: {...scene.layers[layerIndex].motion, action: "reveal-approved-editorial-artwork"},
  };
  scene.layout.assetPlacement = placement;
  scene.layout.layoutSignature = `${scene.layout.layoutSignature}|generated:${placement.mode}`;
  adoptionItems.push({
    beatId,
    macroId: scene.macroId,
    screenText: scene.screenText,
    sceneIndex,
    sourceAsset: path.relative(root, sourceFile),
    sourceSha256: asset.sha256,
    rendererAsset: destinationRelative,
    beforeAsset: beforeLayer.asset,
    placement,
    reviewEvidence: {
      visual: visual.status,
      semanticBlue: blue.status,
      composition: compositionItem.status,
      previewIntegrated: true,
    },
  });
}

const deferredItems = (manifest.assets || [])
  .filter((asset) => !adoptedBeatIdSet.has(asset.beatId))
  .map((asset) => ({
    beatId: asset.beatId,
    screenText: asset.screenText,
    status: "deferred-not-silently-discarded",
    reason: asset.beatId === "H05-B04"
      ? "The adjacent H05 generated composition repeats the failed-draft metaphor; keep the stronger H05-B03 direction image to avoid same-section fatigue."
      : "The H11 closing section already adopts H11-B03 as the stronger final-direction composition; defer H11-B02 to avoid two near-consecutive direction metaphors.",
  }));

candidateProps.contentHash = sha256String(stableJson(withoutKey(candidateProps, "contentHash")));
const changedBeatIds = currentProps.scenes
  .map((scene, index) => stableJson(scene) === stableJson(candidateProps.scenes[index]) ? null : scene.beatId)
  .filter(Boolean);
if (adoptionItems.length !== adoptedBeatIds.length) failures.push(`adoption-item-count:${adoptionItems.length}/${adoptedBeatIds.length}`);
if (changedBeatIds.length !== adoptedBeatIds.length || adoptedBeatIds.some((beatId) => !changedBeatIds.includes(beatId))) failures.push("changed-scenes-do-not-match-adoption-targets");
if (adoptionItems.some((item) => item.placement.contract !== "A1VisualFitDecision/v2" || item.placement.factualEvidenceAllowed !== false || item.placement.sourcePolicy !== "text-free-non-evidence-styleframe")) failures.push("visual-fit-or-evidence-policy-invalid");
if (adoptionItems.some((item) => item.placement.mode === "stage-cover" && item.placement.cropRisk === "high")) failures.push("high-risk-cover-selected");
if (deferredItems.length !== (manifest.assets || []).length - adoptedBeatIds.length) failures.push("deferred-item-accounting-invalid");

const candidateJson = `${stableJson(candidateProps)}\n`;
fs.writeFileSync(candidatePropsPath, candidateJson);
fs.copyFileSync(candidatePropsPath, publicCandidatePropsPath);

const status = failures.length ? "FAIL" : "READY_FOR_EXPLICIT_APPROVAL";
const report = {
  contract: "A1HSeriesGeneratedArtworkAdoptionPlan/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  projectId: currentProps.projectId,
  visualMasterId: expectedVisualMasterId,
  planOnly: true,
  candidatePropsOnly: true,
  sourcePropsModified: false,
  currentReviewMp4Modified: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  policy: {
    generatedArtworkNeverBecomesFactualEvidence: true,
    everyGeneratedAssetHasDisposition: true,
    cropOrFullFrameUsesMeasuredComposition: true,
    deferredMeansExplicitlyRetainedWithReason: true,
    noDecorativeDashedLines: true,
  },
  source: {
    propsPath: path.relative(root, propsPath),
    propsSha256: sourcePropsSha256,
    manifestPath: path.relative(root, manifestPath),
    manifestSha256: sha256File(manifestPath),
    visualReviewSha256: sha256File(visualReviewPath),
    semanticBlueSha256: sha256File(semanticBluePath),
    compositionSha256: sha256File(compositionPath),
    artworkPolicySha256: sha256File(artworkPolicyPath),
    previewAuditSha256: sha256File(previewAuditPath),
    currentReviewVideoSha256,
  },
  summary: {
    generatedAssetCount: (manifest.assets || []).length,
    adoptedAssetCount: adoptionItems.length,
    deferredAssetCount: deferredItems.length,
    dispositionCount: adoptionItems.length + deferredItems.length,
    fullBleedCount: adoptionItems.filter((item) => item.placement.mode === "full-bleed").length,
    stageCoverCount: adoptionItems.filter((item) => item.placement.mode === "stage-cover").length,
    stageContainCount: adoptionItems.filter((item) => item.placement.mode === "stage-contain").length,
    highRiskCoverCount: adoptionItems.filter((item) => item.placement.mode === "stage-cover" && item.placement.cropRisk === "high").length,
  },
  candidateProps: {
    path: path.relative(root, candidatePropsPath),
    publicUrl: `/generated/system-line/${phaseId}/candidate-microbeatLayeredFullProps.json`,
    sha256: sha256File(candidatePropsPath),
  },
  adoptionItems,
  deferredItems,
  guards: {
    worktreeBasename: "a1-motion-studio-system-line",
    branch: "codex/system-maturity-line-20260722",
    sourcePropsSha256MustEqual: sourcePropsSha256,
    userApprovalRequiredBeforeSourceWrite: true,
  },
  failures,
  nextAction: failures.length ? "repair-generated-artwork-adoption-plan" : "apply-approved-generated-artwork-plan-then-render-new-540p-candidate",
};

fs.writeFileSync(reportPath, `${stableJson(report)}\n`);
fs.writeFileSync(publicReportPath, `${stableJson(report)}\n`);
console.log(JSON.stringify({status, summary: report.summary, candidateProps: report.candidateProps, failures, nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 2;
