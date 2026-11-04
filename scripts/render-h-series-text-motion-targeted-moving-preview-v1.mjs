#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

const root = process.cwd();
const phaseId = "h-series-text-motion-targeted-moving-preview-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const frameRoot = path.join(artifactRoot, "frames");
const publicFrameRoot = path.join(publicRoot, "frames");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const currentVideoPath = path.join(artifactRoot, "current-targeted-motion-960x540.mp4");
const projectedVideoPath = path.join(artifactRoot, "projected-targeted-motion-960x540.mp4");
const comparisonVideoPath = path.join(artifactRoot, "comparison-targeted-motion-1920x540.mp4");
const publicCurrentVideoPath = path.join(publicRoot, "current-targeted-motion-960x540.mp4");
const publicProjectedVideoPath = path.join(publicRoot, "projected-targeted-motion-960x540.mp4");
const publicComparisonVideoPath = path.join(publicRoot, "comparison-targeted-motion-1920x540.mp4");
const contactSheetPath = path.join(artifactRoot, "moving-preview-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "moving-preview-contact-sheet.png");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const entryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const targetedProofPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-proof-v1/report.json");
const stillProofPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-still-proof-v1/report.json");
const patchPlanPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-targeted-proof-v1/projected-motion-patches.json");
const mainMp4Path = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/review-960x540-with-source-audio.mp4");
const mainManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json");
const compositionId = "A1SystemLineHFrameReview";
const sceneFrames = 90;
const fps = 30;
const expectedVisualMasterId = "july1-retro-print-archive-wireframe-v1";
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * 0.25)));
const motionSampleFrames = [10, 20, 32, 44, 58, 72];

const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function run(command, args) {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout || `exit-${result.status}`}`);
  }
  return result.stdout;
}

function probe(file) {
  return JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
}

function extractFrame(input, frameIndex, output) {
  const timeSec = frameIndex / fps;
  run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", timeSec.toFixed(4), "-i", input, "-frames:v", "1", output]);
}

async function meanAbsDiff(aFile, bFile) {
  const a = await sharp(aFile).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const b = await sharp(bFile).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  if (a.info.width !== b.info.width || a.info.height !== b.info.height || a.info.channels !== b.info.channels) {
    throw new Error(`diff-size-mismatch:${aFile}:${bFile}`);
  }
  let sum = 0;
  let active = 0;
  const channels = a.info.channels;
  const pixels = a.info.width * a.info.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * channels;
    const diff = (Math.abs(a.data[offset] - b.data[offset]) + Math.abs(a.data[offset + 1] - b.data[offset + 1]) + Math.abs(a.data[offset + 2] - b.data[offset + 2])) / 3;
    sum += diff;
    if (diff > 8) active += 1;
  }
  return {
    meanAbsDiff: Number((sum / pixels).toFixed(4)),
    activeDiffFraction: Number((active / pixels).toFixed(4)),
  };
}

async function imageStats(file) {
  const {data, info} = await sharp(file).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let nearBlack = 0;
  let cobalt = 0;
  let nonPaper = 0;
  const pixels = info.width * info.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (r < 48 && g < 48 && b < 48) nearBlack += 1;
    if (b >= 130 && b - r >= 25 && b - g >= 18) cobalt += 1;
    if (Math.abs(r - 243) + Math.abs(g - 238) + Math.abs(b - 226) > 34) nonPaper += 1;
  }
  return {
    nearBlackFraction: Number((nearBlack / pixels).toFixed(4)),
    cobaltFraction: Number((cobalt / pixels).toFixed(4)),
    nonPaperFraction: Number((nonPaper / pixels).toFixed(4)),
  };
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

async function buildContactSheet(items, outputPath) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 62;
  const columns = 2;
  const width = columns * tileWidth;
  const height = 120 + items.length * (tileHeight + labelHeight + 28);
  const composites = [];
  const header = Buffer.from(`<svg width="${width}" height="120" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f2efe7"/>
    <text x="24" y="42" fill="#111315" font-family="Arial,sans-serif" font-size="28" font-weight="900">H-series targeted text-motion moving preview</text>
    <text x="24" y="78" fill="#555" font-family="Arial,sans-serif" font-size="15">left=current, right=projected. Bounded proof-only preview; current 540p MP4 and source props stay unchanged.</text>
  </svg>`);
  composites.push({input: header, left: 0, top: 0});
  for (const [row, item] of items.entries()) {
    const top = 120 + row * (tileHeight + labelHeight + 28);
    const label = Buffer.from(`<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#d9d5ca"/>
      <text x="18" y="25" fill="#111315" font-family="Arial,sans-serif" font-size="18" font-weight="800">${escapeXml(item.beatId)} · ${escapeXml(item.screenText)}</text>
      <text x="18" y="50" fill="#2848a8" font-family="Arial,sans-serif" font-size="13">${escapeXml(item.currentSignature)} → ${escapeXml(item.proposedSignature)} · projected motion ${item.projectedMotionMeanAbsDiff}</text>
    </svg>`);
    composites.push({input: label, left: 0, top});
    for (const [col, frame] of [item.currentHoldFrame, item.projectedHoldFrame].entries()) {
      const image = await sharp(frame.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
      const tag = Buffer.from(`<svg width="${tileWidth}" height="28" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${col === 0 ? "#111315" : "#2848a8"}"/>
        <text x="12" y="19" fill="#f2efe7" font-family="Arial,sans-serif" font-size="13">${col === 0 ? "current" : "projected"} · hold frame</text>
      </svg>`);
      composites.push({input: image, left: col * tileWidth, top: top + labelHeight});
      composites.push({input: tag, left: col * tileWidth, top: top + labelHeight + tileHeight - 28});
    }
  }
  await sharp({create: {width, height, channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(outputPath);
  return {width, height};
}

for (const required of [propsPath, entryPoint, targetedProofPath, stillProofPath, patchPlanPath, mainMp4Path, mainManifestPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

const props = readJson(propsPath);
const targetedProof = readJson(targetedProofPath);
const stillProof = readJson(stillProofPath);
const patchPlan = readJson(patchPlanPath);
const mainManifest = readJson(mainManifestPath);
const selectedBeatIds = (targetedProof.proofItems || []).map((item) => item.beatId);
const patchByBeatId = new Map((patchPlan.patches || []).map((patch) => [patch.beatId, patch]));
const selectedScenes = selectedBeatIds.map((beatId) => props.scenes.find((scene) => scene.beatId === beatId)).filter(Boolean);
const projectedScenes = props.scenes.map((scene) => {
  const patch = patchByBeatId.get(scene.beatId);
  if (!patch) return scene;
  return {...scene, motionPlan: patch.projectedMotionPlan};
});
const currentProps = {...props, reviewBeatIds: selectedBeatIds};
const projectedProps = {...props, scenes: projectedScenes, reviewBeatIds: selectedBeatIds};
const frameRange = [0, selectedBeatIds.length * sceneFrames - 1];

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(publicFrameRoot, {recursive: true});

const failures = [];
if (props.contract !== "A1MicrobeatLayeredFullPlan/v1") failures.push("invalid-current-props-contract");
if (props.reviewOnly !== true || props.finalRenderAllowed !== false) failures.push("current-props-not-review-locked");
if (targetedProof.contract !== "A1HSeriesTextMotionTargetedProof/v1" || targetedProof.status !== "READY_FOR_BOUNDED_PREVIEW_REVIEW") failures.push("targeted-proof-not-ready");
if (stillProof.contract !== "A1HSeriesTextMotionTargetedStillProof/v1" || stillProof.status !== "PASS") failures.push("still-proof-not-pass");
if (targetedProof.visualMasterId !== expectedVisualMasterId || stillProof.visualMasterId !== expectedVisualMasterId) failures.push("visual-master-mismatch");
if (patchPlan.contract !== "A1HSeriesProjectedMotionPatches/v1" || patchPlan.proofOnly !== true || patchPlan.rendererPatchAllowed !== false || patchPlan.fullMp4RenderAllowed !== false || patchPlan.finalRenderAllowed !== false || patchPlan.resolveExportAllowed !== false) failures.push("projected-patch-plan-locks-invalid");
if (selectedBeatIds.length < 10 || selectedScenes.length !== selectedBeatIds.length) failures.push(`selected-scenes-invalid:${selectedScenes.length}/${selectedBeatIds.length}`);
if (sha256(mainMp4Path) !== mainManifest.video?.sha256) failures.push("current-main-mp4-sha-mismatch-before-preview");

let browser;
let renderElapsedMs = 0;
const startedAt = Date.now();
try {
  const serveUrl = await bundle({entryPoint, publicDir: path.join(root, "remotion-renderer/public"), rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
  browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const currentComposition = await selectComposition({serveUrl, id: compositionId, inputProps: currentProps, puppeteerInstance: browser, logLevel: "warn"});
  const projectedComposition = await selectComposition({serveUrl, id: compositionId, inputProps: projectedProps, puppeteerInstance: browser, logLevel: "warn"});
  for (const [composition, inputProps, outputLocation] of [
    [currentComposition, currentProps, currentVideoPath],
    [projectedComposition, projectedProps, projectedVideoPath],
  ]) {
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      outputLocation,
      frameRange,
      scale: 0.5,
      codec: "h264",
      pixelFormat: "yuv420p",
      imageFormat: "jpeg",
      jpegQuality: 84,
      concurrency,
      hardwareAcceleration: "if-possible",
      overwrite: true,
      puppeteerInstance: browser,
      logLevel: "warn",
    });
  }
  renderElapsedMs = Date.now() - startedAt;
} catch (error) {
  failures.push(`render-moving-preview:${error?.message || String(error)}`);
} finally {
  if (browser) await browser.close({silent: true});
}

let comparisonProbe = null;
let currentProbe = null;
let projectedProbe = null;
const motionItems = [];
let contactSheet = null;

try {
  if (fs.existsSync(currentVideoPath) && fs.existsSync(projectedVideoPath)) {
    run(ffmpegPath, [
      "-loglevel", "error",
      "-y",
      "-i", currentVideoPath,
      "-i", projectedVideoPath,
      "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]",
      "-map", "[v]",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      comparisonVideoPath,
    ]);
    currentProbe = probe(currentVideoPath);
    projectedProbe = probe(projectedVideoPath);
    comparisonProbe = probe(comparisonVideoPath);
    fs.copyFileSync(currentVideoPath, publicCurrentVideoPath);
    fs.copyFileSync(projectedVideoPath, publicProjectedVideoPath);
    fs.copyFileSync(comparisonVideoPath, publicComparisonVideoPath);
  }
} catch (error) {
  failures.push(`build-comparison-video:${error?.message || String(error)}`);
}

try {
  if (fs.existsSync(currentVideoPath) && fs.existsSync(projectedVideoPath)) {
    for (const [sceneIndex, scene] of selectedScenes.entries()) {
      const patch = patchByBeatId.get(scene.beatId);
      const frameBase = sceneIndex * sceneFrames;
      const projectedFrames = [];
      const currentHoldFile = path.join(frameRoot, `${scene.beatId.toLowerCase()}-current-hold.png`);
      const projectedHoldFile = path.join(frameRoot, `${scene.beatId.toLowerCase()}-projected-hold.png`);
      extractFrame(currentVideoPath, frameBase + 58, currentHoldFile);
      extractFrame(projectedVideoPath, frameBase + 58, projectedHoldFile);
      fs.copyFileSync(currentHoldFile, path.join(publicFrameRoot, path.basename(currentHoldFile)));
      fs.copyFileSync(projectedHoldFile, path.join(publicFrameRoot, path.basename(projectedHoldFile)));
      for (const localFrame of motionSampleFrames) {
        const file = path.join(frameRoot, `${scene.beatId.toLowerCase()}-${String(localFrame).padStart(2, "0")}-projected.png`);
        extractFrame(projectedVideoPath, frameBase + localFrame, file);
        projectedFrames.push({localFrame, file, stats: await imageStats(file)});
      }
      const temporalDiffs = [];
      for (let index = 1; index < projectedFrames.length; index += 1) {
        temporalDiffs.push({from: projectedFrames[index - 1].localFrame, to: projectedFrames[index].localFrame, ...(await meanAbsDiff(projectedFrames[index - 1].file, projectedFrames[index].file))});
      }
      const currentProjectedHoldDiff = await meanAbsDiff(currentHoldFile, projectedHoldFile);
      const projectedMotionMeanAbsDiff = Number((temporalDiffs.reduce((sum, item) => sum + item.meanAbsDiff, 0) / Math.max(1, temporalDiffs.length)).toFixed(4));
      const projectedMotionActiveFraction = Number((temporalDiffs.reduce((sum, item) => sum + item.activeDiffFraction, 0) / Math.max(1, temporalDiffs.length)).toFixed(4));
      motionItems.push({
        beatId: scene.beatId,
        macroId: scene.macroId,
        screenText: scene.screenText,
        currentSignature: patch.currentSignature,
        proposedSignature: patch.proposedSignature,
        projectedMotionStyle: patch.projectedMotionPlan.motionStyle,
        projectedPrimaryCurve: patch.projectedMotionPlan.primaryCurve,
        projectedMotionMeanAbsDiff,
        projectedMotionActiveFraction,
        currentProjectedHoldDiff,
        temporalDiffs,
        frameStats: projectedFrames.map((item) => ({localFrame: item.localFrame, ...item.stats})),
        currentHoldFrame: {
          file: path.relative(root, currentHoldFile),
          publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(currentHoldFile)}`,
          sha256: sha256(currentHoldFile),
        },
        projectedHoldFrame: {
          file: path.relative(root, projectedHoldFile),
          publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(projectedHoldFile)}`,
          sha256: sha256(projectedHoldFile),
        },
      });
    }
    contactSheet = await buildContactSheet(motionItems.map((item) => ({
      ...item,
      currentHoldFrame: {...item.currentHoldFrame, file: path.join(root, item.currentHoldFrame.file)},
      projectedHoldFrame: {...item.projectedHoldFrame, file: path.join(root, item.projectedHoldFrame.file)},
    })), contactSheetPath);
    fs.copyFileSync(contactSheetPath, publicContactSheetPath);
  }
} catch (error) {
  failures.push(`audit-moving-preview:${error?.message || String(error)}`);
}

const currentVideoStream = currentProbe?.streams?.find((stream) => stream.codec_type === "video") || {};
const projectedVideoStream = projectedProbe?.streams?.find((stream) => stream.codec_type === "video") || {};
const comparisonVideoStream = comparisonProbe?.streams?.find((stream) => stream.codec_type === "video") || {};
const lowMotionItems = motionItems.filter((item) => item.projectedMotionMeanAbsDiff < 0.65 || item.projectedMotionActiveFraction < 0.006);
const lowHoldDiffItems = motionItems.filter((item) => item.currentProjectedHoldDiff.meanAbsDiff < 0.65 || item.currentProjectedHoldDiff.activeDiffFraction < 0.006);

if (currentVideoStream.width !== 960 || currentVideoStream.height !== 540) failures.push("current-video-shape-invalid");
if (projectedVideoStream.width !== 960 || projectedVideoStream.height !== 540) failures.push("projected-video-shape-invalid");
if (comparisonVideoStream.width !== 1920 || comparisonVideoStream.height !== 540) failures.push("comparison-video-shape-invalid");
if (Number(currentProbe?.format?.duration || 0) < 29.5 || Number(projectedProbe?.format?.duration || 0) < 29.5) failures.push("moving-preview-duration-too-short");
if (motionItems.length !== selectedBeatIds.length) failures.push(`motion-item-count:${motionItems.length}/${selectedBeatIds.length}`);
if (lowMotionItems.length > 1) failures.push(`too-many-low-motion-items:${lowMotionItems.map((item) => item.beatId).join(",")}`);
if (lowHoldDiffItems.length > 1) failures.push(`too-many-low-current-proposed-hold-diff-items:${lowHoldDiffItems.map((item) => item.beatId).join(",")}`);
if (sha256(mainMp4Path) !== mainManifest.video?.sha256) failures.push("current-main-mp4-sha-mismatch-after-preview");

const status = failures.length ? "FAIL" : "PASS";
const report = {
  contract: "A1HSeriesTextMotionTargetedMovingPreview/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  visualMasterId: expectedVisualMasterId,
  proofOnly: true,
  dryRunOnly: true,
  rendererSourcePropsModified: false,
  currentMainMp4Modified: false,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: path.relative(root, propsPath),
    propsSha256: sha256(propsPath),
    targetedProofPath: path.relative(root, targetedProofPath),
    targetedProofSha256: sha256(targetedProofPath),
    stillProofPath: path.relative(root, stillProofPath),
    stillProofSha256: sha256(stillProofPath),
    patchPlanPath: path.relative(root, patchPlanPath),
    patchPlanSha256: sha256(patchPlanPath),
    currentMainMp4Path: path.relative(root, mainMp4Path),
    currentMainMp4Sha256: sha256(mainMp4Path),
  },
  renderProfile: {
    compositionId,
    frameRange,
    fps,
    scale: 0.5,
    width: 960,
    height: 540,
    comparisonWidth: 1920,
    comparisonHeight: 540,
    concurrency,
    renderElapsedMs,
  },
  summary: {
    selectedBeatCount: selectedBeatIds.length,
    movingPreviewItemCount: motionItems.length,
    durationSec: Number(comparisonProbe?.format?.duration || 0),
    lowMotionItemCount: lowMotionItems.length,
    lowHoldDiffItemCount: lowHoldDiffItems.length,
    minProjectedMotionMeanAbsDiff: motionItems.length ? Number(Math.min(...motionItems.map((item) => item.projectedMotionMeanAbsDiff)).toFixed(4)) : 0,
    averageProjectedMotionMeanAbsDiff: motionItems.length ? Number((motionItems.reduce((sum, item) => sum + item.projectedMotionMeanAbsDiff, 0) / motionItems.length).toFixed(4)) : 0,
    minCurrentProjectedHoldDiff: motionItems.length ? Number(Math.min(...motionItems.map((item) => item.currentProjectedHoldDiff.meanAbsDiff)).toFixed(4)) : 0,
    averageCurrentProjectedHoldDiff: motionItems.length ? Number((motionItems.reduce((sum, item) => sum + item.currentProjectedHoldDiff.meanAbsDiff, 0) / motionItems.length).toFixed(4)) : 0,
    uniqueProjectedMotionStyles: [...new Set(motionItems.map((item) => item.projectedMotionStyle))],
    currentMainMp4Unchanged: true,
  },
  videos: {
    current: fs.existsSync(currentVideoPath) ? {
      path: path.relative(root, currentVideoPath),
      publicUrl: `/generated/system-line/${phaseId}/current-targeted-motion-960x540.mp4`,
      sha256: sha256(currentVideoPath),
      bytes: fs.statSync(currentVideoPath).size,
      width: currentVideoStream.width,
      height: currentVideoStream.height,
      durationSec: Number(currentProbe.format.duration),
    } : null,
    projected: fs.existsSync(projectedVideoPath) ? {
      path: path.relative(root, projectedVideoPath),
      publicUrl: `/generated/system-line/${phaseId}/projected-targeted-motion-960x540.mp4`,
      sha256: sha256(projectedVideoPath),
      bytes: fs.statSync(projectedVideoPath).size,
      width: projectedVideoStream.width,
      height: projectedVideoStream.height,
      durationSec: Number(projectedProbe.format.duration),
    } : null,
    comparison: fs.existsSync(comparisonVideoPath) ? {
      path: path.relative(root, comparisonVideoPath),
      publicUrl: `/generated/system-line/${phaseId}/comparison-targeted-motion-1920x540.mp4`,
      sha256: sha256(comparisonVideoPath),
      bytes: fs.statSync(comparisonVideoPath).size,
      width: comparisonVideoStream.width,
      height: comparisonVideoStream.height,
      durationSec: Number(comparisonProbe.format.duration),
    } : null,
  },
  contactSheet: contactSheet ? {
    path: path.relative(root, contactSheetPath),
    publicUrl: `/generated/system-line/${phaseId}/moving-preview-contact-sheet.png`,
    sha256: sha256(contactSheetPath),
    ...contactSheet,
  } : null,
  selectedBeatIds,
  motionItems,
  lowMotionItems: lowMotionItems.map((item) => ({beatId: item.beatId, projectedMotionMeanAbsDiff: item.projectedMotionMeanAbsDiff, projectedMotionActiveFraction: item.projectedMotionActiveFraction})),
  lowHoldDiffItems: lowHoldDiffItems.map((item) => ({beatId: item.beatId, meanAbsDiff: item.currentProjectedHoldDiff.meanAbsDiff, activeDiffFraction: item.currentProjectedHoldDiff.activeDiffFraction})),
  failures,
  knownLimit: "This is a bounded side-by-side moving preview from projected in-memory props. It does not adopt renderer source props, refresh the current 540p authority MP4, render final 1080p, or export Resolve assets.",
  nextAction: failures.length ? "repair-targeted-moving-preview-before-adoption" : "review-bounded-moving-preview-before-any-renderer-source-adoption",
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status,
  summary: report.summary,
  failures,
  lowMotionItems: report.lowMotionItems,
  lowHoldDiffItems: report.lowHoldDiffItems,
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  comparisonVideo: report.videos.comparison?.path || null,
  contactSheet: report.contactSheet?.path || null,
  nextAction: report.nextAction,
}, null, 2));

if (status !== "PASS") process.exitCode = 2;
