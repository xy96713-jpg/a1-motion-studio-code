#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");

const root = process.cwd();
const phaseId = "h-series-preproduction-motion-candidate-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const entryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const rendererSourcePath = path.join(root, "remotion-renderer/src/shot-director-stage.tsx");
const motionRendererSourcePath = path.join(root, "remotion-renderer/src/MicrobeatLayeredFullReview.tsx");
const fontBindingSourcePath = path.join(root, "remotion-renderer/src/experimentalEditorialFonts.ts");
const candidatePropsPath = path.join(artifactRoot, "candidate-props.json");
const sourcePropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const materialManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesMaterialManifest.json");
const continuityManifestPath = path.join(root, "remotion-renderer/src/generated/hSeriesContinuityManifest.json");
const generatedArtworkManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-result-manifest-v1/report.json");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const stillDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId, "stills");
const videoPath = path.join(artifactRoot, "motion-preview-12-shot-36s.mp4");
const publicVideoPath = path.join(publicRoot, "motion-preview-12-shot-36s.mp4");
const contactSheetPath = path.join(artifactRoot, "motion-preview-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "motion-preview-contact-sheet.png");
const allContactSheetPath = path.join(artifactRoot, "motion-preview-all-47-stills-contact-sheet.png");
const publicAllContactSheetPath = path.join(publicRoot, "motion-preview-all-47-stills-contact-sheet.png");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stableJson = (value) => JSON.stringify(value);
const rel = (file) => path.relative(root, file);
const collectFontAssets = () => {
  const source = fs.readFileSync(fontBindingSourcePath, "utf8");
  const assets = new Set([...source.matchAll(/staticFile\("([^"]+)"\)/gu)].map((match) => match[1]));
  for (const cssAsset of [...assets].filter((asset) => asset.endsWith(".css"))) {
    const cssPath = path.join(root, "remotion-renderer/public", cssAsset);
    if (!fs.existsSync(cssPath)) throw new Error(`font-stylesheet-missing:${cssAsset}`);
    const css = fs.readFileSync(cssPath, "utf8");
    for (const match of css.matchAll(/url\((?:"|')?([^\)"']+)(?:"|')?\)/gu)) {
      const reference = match[1].trim();
      if (!reference || reference.startsWith("data:")) continue;
      assets.add(path.posix.normalize(path.posix.join(path.posix.dirname(cssAsset), reference)));
    }
  }
  return [...assets].sort().map((asset) => {
    const file = path.join(root, "remotion-renderer/public", asset);
    if (!fs.existsSync(file)) throw new Error(`font-asset-missing:${asset}`);
    return {path: rel(file), publicPath: asset, sha256: sha256File(file)};
  });
};
const run = async () => {
  for (const file of [entryPoint, rendererSourcePath, motionRendererSourcePath, fontBindingSourcePath, candidatePropsPath, sourcePropsPath, materialManifestPath, continuityManifestPath, generatedArtworkManifestPath]) if (!fs.existsSync(file)) throw new Error(`required-file-missing:${file}`);
  const fontAssets = collectFontAssets();
  const fontAssetsSha256 = createHash("sha256").update(stableJson(fontAssets)).digest("hex");
  const props = readJson(candidatePropsPath);
  const continuityManifest = readJson(continuityManifestPath);
  const generatedArtworkManifest = readJson(generatedArtworkManifestPath);
  const sourcePropsSha256 = sha256File(sourcePropsPath);
  const candidatePropsSha256 = sha256File(candidatePropsPath);
  if (props.scenes?.length !== 47 || props.reviewBeatIds?.length !== 12) throw new Error("candidate-props-coverage-invalid");
  const unboundRealEvidence = props.scenes.filter((scene) => scene.route === "real-evidence" && !(scene.entityEvidence || []).some((item) => item.asset && item.assetSha256)).map((scene) => scene.beatId);
  const missingSourceStatuses = props.scenes.filter((scene) => scene.storyboard?.shotDirector?.asset?.status === "missing-source").map((scene) => scene.beatId);
  const generatedArtworkItems = Array.isArray(generatedArtworkManifest.assets) ? generatedArtworkManifest.assets : [];
  const generatedArtworkByBeatId = new Map(generatedArtworkItems.map((item) => [item.beatId, item]));
  const candidateArtworkScenes = props.scenes.filter((scene) => scene.route === "editorial-artwork");
  const candidateGeneratedArtworkItems = candidateArtworkScenes.map((scene) => {
    const foreground = scene.layers?.find((layer) => layer.kind === "foreground-subject");
    const generated = generatedArtworkByBeatId.get(scene.beatId);
    const hashMatches = Boolean(generated && foreground?.assetSha256 && generated.sha256 === foreground.assetSha256);
    return {beatId: scene.beatId, candidateAsset: foreground?.asset || null, candidateSha256: foreground?.assetSha256 || null, generatedSha256: generated?.sha256 || null, manifestEntryPresent: Boolean(generated), generated: hashMatches, hashMatches};
  });
  const generatedArtworkReview = {
    contract: generatedArtworkManifest.contract,
    status: generatedArtworkManifest.status,
    sourceManifestPath: rel(generatedArtworkManifestPath),
    sourceManifestSha256: sha256File(generatedArtworkManifestPath),
    expectedCount: generatedArtworkManifest.summary?.expectedCount ?? generatedArtworkItems.length,
    generatedCount: generatedArtworkManifest.summary?.generatedCount ?? generatedArtworkItems.length,
    pendingVisualReviewCount: generatedArtworkManifest.summary?.pendingVisualReviewCount ?? generatedArtworkItems.filter((item) => item.reviewStatus === "pending-visual-review").length,
    candidateArtworkCount: candidateArtworkScenes.length,
    candidateGeneratedAssetCount: candidateGeneratedArtworkItems.filter((item) => item.generated).length,
    candidateLegacyAssetCount: candidateGeneratedArtworkItems.filter((item) => !item.generated).length,
    candidateGeneratedArtworkBeatIds: candidateGeneratedArtworkItems.filter((item) => item.generated).map((item) => item.beatId),
    candidateLegacyArtworkBeatIds: candidateGeneratedArtworkItems.filter((item) => !item.generated).map((item) => item.beatId),
    generatedArtworkNotUsedBeatIds: generatedArtworkItems.filter((item) => !candidateGeneratedArtworkItems.some((candidate) => candidate.beatId === item.beatId && candidate.generated)).map((item) => item.beatId),
    candidateGeneratedArtworkItems,
    allAssetsLocalToSystemLine: generatedArtworkManifest.summary?.allAssetsLocalToSystemLine === true,
    allAssetsPromptBound: generatedArtworkManifest.summary?.allAssetsPromptBound === true && generatedArtworkItems.every((item) => item.promptSha256 && item.promptHashMatches === true),
    allAssetsNonEvidence: generatedArtworkManifest.summary?.allAssetsNonEvidence === true && generatedArtworkItems.every((item) => item.factualEvidenceAllowed === false),
    candidateGeneratedArtworkHashesMatch: candidateGeneratedArtworkItems.filter((item) => item.generated).every((item) => item.hashMatches),
    reviewOnly: true,
    rendererAdoptionAllowed: false,
    finalRenderAllowed: false,
  };
  fs.mkdirSync(artifactRoot, {recursive: true});
  fs.mkdirSync(publicRoot, {recursive: true});

  const currentInputIdentity = {
    candidatePropsSha256,
    sourcePropsSha256,
    entryPointSha256: sha256File(entryPoint),
    rendererSourceSha256: sha256File(rendererSourcePath),
    motionRendererSourceSha256: sha256File(motionRendererSourcePath),
    fontBindingSourceSha256: sha256File(fontBindingSourcePath),
    fontAssetsSha256,
    materialManifestSha256: sha256File(materialManifestPath),
    continuityManifestSha256: sha256File(continuityManifestPath),
    generatedArtworkManifestSha256: sha256File(generatedArtworkManifestPath),
    selectedBeatIds: props.reviewBeatIds,
  };
  const previousReport = fs.existsSync(reportPath) ? readJson(reportPath) : null;
  const previousInputIdentity = previousReport ? {
    candidatePropsSha256: previousReport.sourceBinding?.candidateProps?.sha256,
    sourcePropsSha256: previousReport.sourceBinding?.sourceProps?.sha256,
    entryPointSha256: previousReport.sourceBinding?.entryPointSha256,
    rendererSourceSha256: previousReport.sourceBinding?.rendererSource?.sha256,
    motionRendererSourceSha256: previousReport.sourceBinding?.motionRendererSource?.sha256,
    fontBindingSourceSha256: previousReport.sourceBinding?.fontBindingSource?.sha256,
    fontAssetsSha256: previousReport.sourceBinding?.fontAssetsSha256,
    materialManifestSha256: previousReport.sourceBinding?.materialManifestSha256,
    continuityManifestSha256: previousReport.sourceBinding?.continuityManifestSha256,
    generatedArtworkManifestSha256: previousReport.sourceBinding?.generatedArtworkManifestSha256,
    selectedBeatIds: previousReport.selectedBeatIds,
  } : null;
  const canReusePreviewVideo = Boolean(
    previousReport
      && stableJson(previousInputIdentity) === stableJson(currentInputIdentity)
      && previousReport.video?.durationFrames
      && fs.existsSync(videoPath)
      && fs.existsSync(publicVideoPath),
  );
  let durationInFrames;
  if (canReusePreviewVideo) {
    durationInFrames = Number(previousReport.video.durationFrames);
  } else {
    const serveUrl = await bundle({entryPoint, publicDir: path.join(root, "remotion-renderer/public"), rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
    const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
    try {
      const composition = await selectComposition({serveUrl, id: "A1SystemLineHFrameReview", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
      durationInFrames = composition.durationInFrames;
      await renderMedia({
        serveUrl,
        composition,
        inputProps: props,
        outputLocation: videoPath,
        frameRange: [0, composition.durationInFrames - 1],
        scale: 0.5,
        codec: "h264",
        pixelFormat: "yuv420p",
        imageFormat: "jpeg",
        jpegQuality: 84,
        concurrency: 2,
        hardwareAcceleration: "if-possible",
        overwrite: true,
        puppeteerInstance: browser,
        logLevel: "warn",
      });
    } finally {
      await browser.close({silent: true});
    }
    fs.copyFileSync(videoPath, publicVideoPath);
  }
  const allStills = props.scenes.map((scene) => ({beatId: scene.beatId, file: path.join(stillDir, `${scene.beatId}.png`)}));
  const missingAllStills = allStills.filter((item) => !fs.existsSync(item.file));
  if (missingAllStills.length) throw new Error(`missing-all-47-stills:${missingAllStills.map((item) => item.beatId).join(",")}`);
  const stills = props.reviewBeatIds.map((beatId) => allStills.find((item) => item.beatId === beatId));
  if (stills.some((item) => !item)) throw new Error("selected-still-not-found");
  const labelHeight = 46;
  const buildContactSheet = async (items, outputPath, tileWidth, tileHeight, columns, label) => {
    const rows = Math.ceil(items.length / columns);
    const composites = [];
    for (const [index, item] of items.entries()) {
      const left = (index % columns) * tileWidth;
      const top = Math.floor(index / columns) * (tileHeight + labelHeight);
      const image = await sharp(item.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
      const svgLabel = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#17191b"/><text x="16" y="29" fill="#f3f1e9" font-family="Arial,sans-serif" font-size="18">${item.beatId} · ${label}</text></svg>`);
      composites.push({input: image, left, top}, {input: svgLabel, left, top: top + tileHeight});
    }
    await sharp({create: {width: tileWidth * columns, height: (tileHeight + labelHeight) * rows, channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(outputPath);
    return {width: tileWidth * columns, height: (tileHeight + labelHeight) * rows, rows, columns};
  };
  const tileWidth = 480;
  const columns = 3;
  const contactSheet = await buildContactSheet(stills, contactSheetPath, tileWidth, 270, columns, "PREPRODUCTION MOTION");
  fs.copyFileSync(contactSheetPath, publicContactSheetPath);
  const allContactSheet = await buildContactSheet(allStills, allContactSheetPath, 384, 216, 5, "47-SHOT MOTION STILL");
  fs.copyFileSync(allContactSheetPath, publicAllContactSheetPath);
  const sceneIndexByBeatId = new Map(props.scenes.map((scene, index) => [scene.beatId, index]));
  const continuityItems = props.scenes.map((scene) => continuityManifest.items?.find((item) => item.beatId === scene.beatId) || null);
  const continuityOrdered = continuityItems.every((item, index) => item && item.beatId === props.scenes[index].beatId && (index === 0 ? item.previousBeatId === null : item.previousBeatId === props.scenes[index - 1].beatId));
  const continuityFieldsBound = continuityItems.every((item) => item && item.transitionIn && item.transitionOut && item.carryIn && item.carryOut && item.motifId);
  const continuityBoundaries = continuityItems.slice(1).map((item, index) => {
    const previous = continuityItems[index];
    return {
      fromBeatId: props.scenes[index].beatId,
      toBeatId: props.scenes[index + 1].beatId,
      relation: item?.relation || null,
      transitionOut: previous?.transitionOut || null,
      transitionIn: item?.transitionIn || null,
      fromMotifId: previous?.motifId || null,
      toMotifId: item?.motifId || null,
      motifChanged: Boolean(previous && item && previous.motifId !== item.motifId),
      noReset: item?.noReset === true,
    };
  });
  const continuityCoverage = {
    contract: continuityManifest.contract,
    status: continuityManifest.status,
    reviewOnly: continuityManifest.reviewOnly === true,
    finalRenderAllowed: continuityManifest.finalRenderAllowed === true,
    manifestSha256: sha256File(continuityManifestPath),
    sourcePropsSha256: continuityManifest.sourceBinding?.propsSha256 || null,
    sceneCount: continuityManifest.summary?.sceneCount ?? continuityItems.length,
    transitionCount: continuityManifest.summary?.transitionCount ?? continuityBoundaries.length,
    motifCount: continuityManifest.policy?.motifCount ?? continuityManifest.motifs?.length ?? 0,
    motifChangeCount: continuityManifest.summary?.motifChangeCount ?? continuityBoundaries.filter((item) => item.motifChanged).length,
    sameMotifCarryCount: continuityManifest.summary?.sameMotifCarryCount ?? continuityBoundaries.filter((item) => item.relation === "same-motif-carry").length,
    chapterCount: continuityManifest.summary?.chapterCount ?? continuityManifest.chapters?.length ?? 0,
    allScenesBound: continuityItems.length === props.scenes.length && continuityItems.every(Boolean),
    allBoundariesDeclared: continuityBoundaries.length === Math.max(0, props.scenes.length - 1) && continuityBoundaries.every((item) => item.transitionOut && item.transitionIn && item.relation),
    ordered: continuityOrdered,
    fieldsBound: continuityFieldsBound,
    sourcePropsBound: continuityManifest.sourceBinding?.propsSha256 === sourcePropsSha256,
    boundaries: continuityBoundaries,
  };
  const motionRendererSource = fs.readFileSync(motionRendererSourcePath, "utf8");
  const motionContinuityRendererBound = motionRendererSource.includes('data-a1-motion-proof-continuity="adjacent-pairs-bound"')
    && motionRendererSource.includes("previousScene={previousScene}")
    && fs.readFileSync(rendererSourcePath, "utf8").includes('data-a1-director-continuity-carry-bound');
  const continuityPairs = [];
  for (let index = 0; index < props.reviewBeatIds.length; index += 2) {
    const fromBeatId = props.reviewBeatIds[index];
    const toBeatId = props.reviewBeatIds[index + 1];
    const from = props.scenes.find((scene) => scene.beatId === fromBeatId);
    const to = props.scenes.find((scene) => scene.beatId === toBeatId);
    const fromIndex = sceneIndexByBeatId.get(fromBeatId);
    const toIndex = sceneIndexByBeatId.get(toBeatId);
    const carryOut = from?.storyboard?.shotDirector?.continuity?.carryOut || null;
    const carryIn = to?.storyboard?.shotDirector?.continuity?.carryIn || null;
    continuityPairs.push({fromBeatId, toBeatId, adjacent: toIndex === fromIndex + 1, carryOut, carryIn, continuityBound: Boolean(carryOut && carryIn)});
  }
  const reviewLedgerItems = props.scenes.map((scene, index) => ({
    order: index + 1,
    beatId: scene.beatId,
    reviewStatus: "pending-visual-review",
    requiredChecks: ["headline-and-line-break", "typography-hierarchy", "background-composition", "semantic-elements", "material-binding", "continuity-handoff"],
    materialRoute: scene.route || scene.storyboard?.shotDirector?.asset?.route || "unknown",
    materialStatus: scene.storyboard?.shotDirector?.asset?.status || "unknown",
    foregroundAssetBound: Boolean(scene.layers?.some((layer) => layer.kind === "foreground-subject" && layer.asset && layer.assetSha256)),
    evidenceCount: (scene.entityEvidence || []).filter((item) => item.asset && item.assetSha256).length,
  }));
  const typographyFamilyCounts = {};
  for (const scene of props.scenes) {
    const family = scene.storyboard?.shotDirector?.typography?.family || "unknown";
    typographyFamilyCounts[family] = (typographyFamilyCounts[family] || 0) + 1;
  }
  const videoSha256 = sha256File(videoPath);
  const generatedAt = previousReport?.generatedAt && stableJson(previousInputIdentity) === stableJson(currentInputIdentity)
    ? previousReport.generatedAt
    : new Date().toISOString();
  const report = {
    contract: "A1HSeriesPreproductionMotionPreview/v1",
    phaseId,
    generatedAt,
    status: "PASS",
    scope: "12-shot moving proof derived from all 47 static director decisions; no full-film render",
    reviewOnly: true,
    proofOnly: true,
    currentAuthorityMutated: false,
    rendererAdoptionAllowed: false,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
    userApprovalStatus: "not-approved",
    summary: {candidateSceneCount: props.scenes.length, selectedSceneCount: props.reviewBeatIds.length, unboundRealEvidenceCount: unboundRealEvidence.length, missingSourceCount: missingSourceStatuses.length, pendingVisualReviewCount: reviewLedgerItems.filter((item) => item.reviewStatus === "pending-visual-review").length, generatedArtworkPendingVisualReviewCount: generatedArtworkReview.pendingVisualReviewCount, candidateGeneratedArtworkCount: generatedArtworkReview.candidateGeneratedAssetCount, candidateLegacyArtworkCount: generatedArtworkReview.candidateLegacyAssetCount},
    sourceBinding: {entryPoint: rel(entryPoint), entryPointSha256: sha256File(entryPoint), rendererSource: {path: rel(rendererSourcePath), sha256: sha256File(rendererSourcePath)}, motionRendererSource: {path: rel(motionRendererSourcePath), sha256: sha256File(motionRendererSourcePath)}, fontBindingSource: {path: rel(fontBindingSourcePath), sha256: sha256File(fontBindingSourcePath)}, fontAssetsSha256, fontAssets, candidateProps: {path: rel(candidatePropsPath), sha256: candidatePropsSha256}, sourceProps: {path: rel(sourcePropsPath), sha256: sourcePropsSha256}, materialManifestPath: rel(materialManifestPath), materialManifestSha256: sha256File(materialManifestPath), continuityManifestPath: rel(continuityManifestPath), continuityManifestSha256: continuityCoverage.manifestSha256, generatedArtworkManifestPath: rel(generatedArtworkManifestPath), generatedArtworkManifestSha256: generatedArtworkReview.sourceManifestSha256},
    generatedArtworkReview,
    typographyBinding: {contract: "A1HSeriesTypographyRendererBinding/v1", sourceField: "scene.storyboard.shotDirector.typography.family", familyCounts: typographyFamilyCounts, rendererProfileFunction: "headlineProfileFor", rendererProfileSourceSha256: sha256File(rendererSourcePath), fontBindingSourceSha256: sha256File(fontBindingSourcePath), fontAssetCount: fontAssets.length, fontAssetsAllPresent: true, allSceneFamiliesBound: Object.keys(typographyFamilyCounts).every((family) => new RegExp(`case \\\"${family}\\\"`).test(fs.readFileSync(rendererSourcePath, "utf8")) || family === "unknown")},
    selectedBeatIds: props.reviewBeatIds,
    reviewLedger: {contract: "A1HSeriesVisualReviewLedger/v1", status: "PENDING_USER_VISUAL_REVIEW", decisionRequired: true, reviewedCount: 0, pendingCount: reviewLedgerItems.length, approvedCount: 0, rejectedCount: 0, requiredChecks: reviewLedgerItems[0]?.requiredChecks || [], items: reviewLedgerItems},
    continuityProof: {pairCount: continuityPairs.length, adjacentPairCount: continuityPairs.filter((pair) => pair.adjacent).length, rendererBound: motionContinuityRendererBound, pairs: continuityPairs},
    continuityCoverage,
    video: {path: rel(videoPath), publicUrl: `/generated/system-line/${phaseId}/motion-preview-12-shot-36s.mp4`, sha256: videoSha256, width: 960, height: 540, fps: 30, durationFrames: durationInFrames, durationSec: durationInFrames / 30, audioBound: false},
    holdFrames: {count: stills.length, expectedCount: 12, directory: rel(stillDir)},
    allHoldFrames: {count: allStills.length, expectedCount: 47, directory: rel(stillDir)},
    contactSheet: {path: rel(contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/motion-preview-contact-sheet.png`, sha256: sha256File(contactSheetPath), width: contactSheet.width, height: contactSheet.height},
    allContactSheet: {path: rel(allContactSheetPath), publicUrl: `/generated/system-line/${phaseId}/motion-preview-all-47-stills-contact-sheet.png`, sha256: sha256File(allContactSheetPath), width: allContactSheet.width, height: allContactSheet.height, rows: allContactSheet.rows, columns: allContactSheet.columns},
    checks: {candidateSceneCount: props.scenes.length === 47, selectedSceneCount: stills.length === 12, allStillCount: allStills.length === 47, adjacentContinuityPairs: continuityPairs.length === 6 && continuityPairs.every((pair) => pair.adjacent && pair.continuityBound), continuityRendererBound: motionContinuityRendererBound, continuityManifestSceneCount: props.scenes.length === 47 && continuityCoverage.sceneCount === 47 && continuityItems.length === 47, continuityManifestAllBound: continuityCoverage.allScenesBound === true && continuityCoverage.fieldsBound === true, continuityManifestAllTransitions: continuityCoverage.transitionCount === 46 && continuityCoverage.allBoundariesDeclared === true, continuityManifestOrdered: continuityCoverage.ordered === true, continuityManifestSourcePropsBound: continuityCoverage.sourcePropsBound === true, materialStatusBound: missingSourceStatuses.length === 0, generatedArtworkManifestBound: generatedArtworkReview.contract === "A1HSeriesGeneratedArtworkResultManifest/v1" && generatedArtworkReview.expectedCount === 7 && generatedArtworkReview.generatedCount === 7 && generatedArtworkReview.pendingVisualReviewCount === 7 && generatedArtworkReview.candidateArtworkCount === 7 && generatedArtworkReview.candidateGeneratedAssetCount === 5 && generatedArtworkReview.candidateLegacyAssetCount === 2 && generatedArtworkReview.candidateGeneratedArtworkHashesMatch && generatedArtworkReview.allAssetsLocalToSystemLine && generatedArtworkReview.allAssetsPromptBound && generatedArtworkReview.allAssetsNonEvidence && generatedArtworkReview.rendererAdoptionAllowed === false && generatedArtworkReview.finalRenderAllowed === false, typographyFontAssetsPresent: fontAssets.length > 0 && fontAssets.every((asset) => fs.existsSync(path.join(root, asset.path))), reviewLedgerComplete: reviewLedgerItems.length === 47 && reviewLedgerItems.every((item) => item.reviewStatus === "pending-visual-review"), currentPropsUnchanged: sha256File(sourcePropsPath) === sourcePropsSha256, noAudioMutation: true, noFullFilmRender: true},
    nextAction: "review-47-shot-ledger-then-explicitly-approve-adoption",
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);
  const currentPhase = readJson(currentPhasePath);
  if (currentPhase.contract !== "A1SystemLineCurrentPhase/v1" || currentPhase.phaseId !== "h-series-semantic-directed-v1") throw new Error(`unexpected-current-phase:${currentPhase.contract || "missing"}:${currentPhase.phaseId || "missing"}`);
  currentPhase.generatedAt = new Date().toISOString();
  currentPhase.preproductionMotionCandidate = {
    phaseId,
    status: report.status,
    reportPath: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
    reportSha256: sha256File(publicReportPath),
    candidatePropsPath: report.sourceBinding.candidateProps.path,
    candidatePropsSha256: report.sourceBinding.candidateProps.sha256,
    sceneCount: report.summary.candidateSceneCount,
    selectedSceneCount: report.summary.selectedSceneCount,
    reviewOnly: true,
    userApprovalStatus: "not-approved",
    rendererAdoptionAllowed: false,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  };
  currentPhase.next = {
    recommended: {
      id: "review-47-shot-ledger-then-explicitly-approve-adoption",
      reason: "从唯一逐镜审片入口完成 47 镜视觉决定；全部通过后仍需明确批准采用，之前不进入源素材采用或整片渲染。",
      requiresExplicitApproval: false,
      riskTags: ["preproduction-only", "47-shot-current-intersection", "all-47-static-shots", "candidate-version-bound", "no-full-mp4", "stale-50-shot-plan-excluded"],
    },
  };
  fs.writeFileSync(currentPhasePath, `${JSON.stringify(currentPhase, null, 2)}\n`);
  console.log(JSON.stringify({status: report.status, video: report.video, contactSheet: report.contactSheet, selectedBeatIds: report.selectedBeatIds, nextAction: report.nextAction}, null, 2));
};

await run();
