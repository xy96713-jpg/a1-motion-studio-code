#!/usr/bin/env node
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {buildCurrentFilmManifest, sha256File} from "../lib/current-film-manifest.js";

const root = process.cwd();
const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(root, "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const compositionId = "A1SystemLineHFullTimelineReview";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-film-v1/full-preview");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/current-film");
const silentVideoPath = path.join(artifactRoot, "current-preview-silent-960x540.mp4");
const reviewVideoPath = path.join(artifactRoot, "current-preview-960x540-with-source-audio.mp4");
const publicVideoPath = path.join(publicRoot, "current-preview-960x540-with-source-audio.mp4");
const contactSheetPath = path.join(artifactRoot, "current-preview-12-frame-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "current-preview-12-frame-contact-sheet.png");
const posterPath = path.join(artifactRoot, "current-preview-poster-960x540.png");
const publicPosterPath = path.join(publicRoot, "current-preview-poster-960x540.png");
const reportPath = path.join(artifactRoot, "report.json");
const renderBindingPath = path.join(artifactRoot, "render-input-binding.json");
const publicReportPath = path.join(publicRoot, "full-preview-report.json");
const previewManifestPath = path.join(publicRoot, "full-preview-manifest.json");
const visualMasterPath = path.join(root, "apps/studio-next/public/generated/system-line/current-12-frame-visual-master-v1/report.json");
const directVisualReviewPath = path.join(root, "apps/studio-next/public/generated/system-line/current-12-frame-visual-master-v1/direct-visual-review.json");
const typographyProofPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-large-typography-clean-contract-v1/report.json");
const selectedBeatIds = ["H01-B01", "H05-B02", "H01-B02", "H04-B02", "H10-B01", "H03-B02", "H10-B04", "H03-B03", "H05-B03", "H07-B01", "H11-B02", "H11-B03"];
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * 0.25)));

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const relative = (file) => path.relative(root, file);
function run(command, args) {
  const result = spawnSync(command, args, {cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout || `exit-${result.status}`}`);
  return result.stdout;
}
function probe(file) {
  return JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
}
function extractFrame(input, timeSec, output) {
  run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", timeSec.toFixed(3), "-i", input, "-frames:v", "1", output]);
}

async function imageStats(file) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const total = info.width * info.height;
  const rows = new Array(info.height).fill(0);
  let dark = 0, paper = 0, saturated = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const index = (y * info.width + x) * info.channels;
    const r = data[index], g = data[index + 1], b = data[index + 2];
    const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
    if (maximum < 70) { dark += 1; rows[y] += 1; }
    if (r > 225 && g > 225 && b > 218 && Math.abs(r - g) < 18 && Math.abs(g - b) < 22) paper += 1;
    if (maximum > 120 && maximum > 0 && (maximum - minimum) / maximum > 0.48) saturated += 1;
  }
  return {
    width: info.width,
    height: info.height,
    darkFraction: Number((dark / total).toFixed(6)),
    paperFraction: Number((paper / total).toFixed(6)),
    saturatedFraction: Number((saturated / total).toFixed(6)),
    maxDarkRowFraction: Number((Math.max(...rows) / info.width).toFixed(6)),
  };
}

async function meanAbsoluteDifference(fileA, fileB) {
  const a = await sharp(fileA).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const b = await sharp(fileB).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += Math.abs(a[index] - b[index]);
  return Number((total / a.length).toFixed(5));
}

for (const required of [entryPoint, propsPath, visualMasterPath, directVisualReviewPath, typographyProofPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-current-preview-input-missing:${relative(required)}`);
}
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const currentFilm = buildCurrentFilmManifest(root);
const props = readJson(propsPath);
const visualMaster = readJson(visualMasterPath);
const directVisualReview = readJson(directVisualReviewPath);
const typographyProof = readJson(typographyProofPath);
const sourceBinding = {
  propsSha256: currentFilm.current.rendererPropsSha256,
  rendererSourceSha256: currentFilm.current.rendererSourceSha256,
  assetManifestSha256: currentFilm.current.assetManifestSha256,
  audioSha256: currentFilm.current.audioSha256,
  buildId: currentFilm.current.buildId,
};
const timelineDurationSec = Math.max(...props.scenes.map((scene) => scene.startFrame + scene.durationInFrames)) / 30;
const prerequisiteFailures = [];
if (currentFilm.state !== "ASSET_READY" && currentFilm.state !== "CURRENT_PREVIEW_READY") prerequisiteFailures.push(`unexpected-current-state:${currentFilm.state}`);
if (!currentFilm.gates.board.pass) prerequisiteFailures.push("board-gate-not-cleared");
if (!currentFilm.gates.assets.pass) prerequisiteFailures.push("asset-gate-not-cleared");
if (visualMaster.status !== "PIXEL_PROOF_PASS" || visualMaster.sourceBinding?.buildId !== sourceBinding.buildId) prerequisiteFailures.push("visual-master-not-current");
if (directVisualReview.status !== "DIRECT_VISUAL_REVIEW_PASS" || directVisualReview.sourceBinding?.buildId !== sourceBinding.buildId) prerequisiteFailures.push("direct-visual-review-not-current");
if (typographyProof.status !== "PIXEL_PROOF_PASS" || typographyProof.sourceBinding?.buildId !== sourceBinding.buildId) prerequisiteFailures.push("typography-proof-not-current");
if (prerequisiteFailures.length) throw new Error(`current-preview-prerequisites-failed:${prerequisiteFailures.join(",")}`);

const prior = fs.existsSync(reportPath) ? readJson(reportPath) : null;
const priorRenderBinding = fs.existsSync(renderBindingPath) ? readJson(renderBindingPath) : null;
const cached = Boolean(
  fs.existsSync(silentVideoPath)
  && fs.existsSync(reviewVideoPath)
  && prior?.sourceBinding?.buildId === sourceBinding.buildId
  && prior?.media?.reviewVideo?.sha256 === sha256File(reviewVideoPath)
);
const existingSilentProbe = fs.existsSync(silentVideoPath) ? probe(silentVideoPath) : null;
const existingSilentVideo = existingSilentProbe?.streams?.find((stream) => stream.codec_type === "video");
const existingSilentMatchesProfile = Boolean(
  existingSilentVideo?.width === 960
  && existingSilentVideo?.height === 540
  && existingSilentVideo?.avg_frame_rate === "30/1"
  && Number(existingSilentProbe?.format?.duration || 0) + 0.25 >= timelineDurationSec
);
const bindingMatchesCurrent = priorRenderBinding?.sourceBinding?.buildId === sourceBinding.buildId
  && priorRenderBinding?.silentVideoSha256 === (fs.existsSync(silentVideoPath) ? sha256File(silentVideoPath) : null);
const recoveredCurrentSilent = process.env.A1_RECOVER_CURRENT_SILENT === "1" && existingSilentMatchesProfile;
const reuseSilent = cached || bindingMatchesCurrent || recoveredCurrentSilent;
let renderElapsedMs = 0;
if (!reuseSilent) {
  const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    let announced = -1;
    const startedAt = Date.now();
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      outputLocation: silentVideoPath,
      frameRange: [0, composition.durationInFrames - 1],
      scale: 0.5,
      codec: "h264",
      pixelFormat: "yuv420p",
      imageFormat: "jpeg",
      jpegQuality: 86,
      concurrency,
      hardwareAcceleration: "if-possible",
      overwrite: true,
      puppeteerInstance: browser,
      logLevel: "warn",
      onProgress: ({progress}) => {
        const bucket = Math.floor(progress * 10) * 10;
        if (bucket > announced) { announced = bucket; process.stdout.write(`[current-540p] ${Math.min(100, bucket)}%\n`); }
      },
    });
    renderElapsedMs = Date.now() - startedAt;
    writeJson(renderBindingPath, {
      contract: "A1CurrentFilmRenderInputBinding/v1",
      generatedAt: new Date().toISOString(),
      sourceBinding,
      silentVideoSha256: sha256File(silentVideoPath),
      recoveryValidated: false,
    });
  } finally {
    await browser.close({silent: true});
  }
}

if (recoveredCurrentSilent && !bindingMatchesCurrent) {
  writeJson(renderBindingPath, {
    contract: "A1CurrentFilmRenderInputBinding/v1",
    generatedAt: new Date().toISOString(),
    sourceBinding,
    silentVideoSha256: sha256File(silentVideoPath),
    recoveryValidated: true,
    recoveryChecks: {
      width: existingSilentVideo?.width === 960,
      height: existingSilentVideo?.height === 540,
      fps: existingSilentVideo?.avg_frame_rate === "30/1",
      durationCoversTimeline: Number(existingSilentProbe?.format?.duration || 0) + 0.25 >= timelineDurationSec,
    },
  });
}

const silentProbe = probe(silentVideoPath);
const audioProbe = probe(currentFilm.current.audioPath);
const silentDurationSec = Number(silentProbe.format.duration);
const audioDurationSec = Number(audioProbe.format.duration);
const videoPadSec = Math.max(0, Number((audioDurationSec - silentDurationSec + 0.05).toFixed(3)));
const audioPadSec = Math.max(0, Number((silentDurationSec - audioDurationSec + 0.05).toFixed(3)));
if (!cached || !fs.existsSync(reviewVideoPath)) {
  run(ffmpegPath, [
    "-loglevel", "error", "-y", "-i", silentVideoPath, "-i", currentFilm.current.audioPath,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", reviewVideoPath,
  ]);
}

const finalProbe = probe(reviewVideoPath);
const videoStream = finalProbe.streams.find((stream) => stream.codec_type === "video");
const audioStream = finalProbe.streams.find((stream) => stream.codec_type === "audio");
const finalDurationSec = Number(finalProbe.format.duration);
const selectedScenes = selectedBeatIds.map((beatId) => props.scenes.find((scene) => scene.beatId === beatId)).filter(Boolean);
if (selectedScenes.length !== selectedBeatIds.length) throw new Error("current-preview-sample-scene-missing");
const frameRoot = path.join(artifactRoot, "sampled-current-mp4-frames");
fs.mkdirSync(frameRoot, {recursive: true});
const samples = [];
for (const [index, scene] of selectedScenes.entries()) {
  const localFrame = Math.min(scene.durationInFrames - 8, Math.max(12, Math.round(scene.durationInFrames * 0.52)));
  const frame = scene.startFrame + localFrame;
  const timeSec = frame / 30;
  const file = path.join(frameRoot, `${String(index + 1).padStart(2, "0")}-${scene.beatId}.png`);
  extractFrame(reviewVideoPath, timeSec, file);
  samples.push({beatId: scene.beatId, archetypeId: scene.storyboard?.visualArchetype?.id || null, frame, timeSec, file, sha256: sha256File(file), stats: await imageStats(file)});
}

const temporalProof = [];
for (const scene of selectedScenes.filter((item) => ["H01-B01", "H01-B02", "H03-B02", "H03-B03", "H05-B03", "H11-B02"].includes(item.beatId))) {
  const earlyFrame = scene.startFrame + Math.min(scene.durationInFrames - 2, 7);
  const laterFrame = scene.startFrame + Math.min(scene.durationInFrames - 2, 20);
  const earlyFile = path.join(frameRoot, `motion-${scene.beatId}-early.png`);
  const laterFile = path.join(frameRoot, `motion-${scene.beatId}-later.png`);
  extractFrame(reviewVideoPath, earlyFrame / 30, earlyFile);
  extractFrame(reviewVideoPath, laterFrame / 30, laterFile);
  temporalProof.push({beatId: scene.beatId, earlyFrame, laterFrame, meanAbsoluteDifference: await meanAbsoluteDifference(earlyFile, laterFile)});
}

const tileWidth = 480, tileHeight = 270, gutter = 10, columns = 4, rows = 3;
const tiles = await Promise.all(samples.map((sample) => sharp(sample.file).resize(tileWidth, tileHeight).png().toBuffer()));
const contactSheet = await sharp({create: {width: columns * tileWidth + (columns - 1) * gutter, height: rows * tileHeight + (rows - 1) * gutter, channels: 3, background: "#dfe2dd"}})
  .composite(tiles.map((input, index) => ({input, left: (index % columns) * (tileWidth + gutter), top: Math.floor(index / columns) * (tileHeight + gutter)})))
  .png().toBuffer();
fs.writeFileSync(contactSheetPath, contactSheet);
fs.copyFileSync(contactSheetPath, publicContactSheetPath);
fs.copyFileSync(samples[0].file, posterPath);
fs.copyFileSync(posterPath, publicPosterPath);
fs.copyFileSync(reviewVideoPath, publicVideoPath);

const checks = {
  sourceBindingStillCurrent: buildCurrentFilmManifest(root).current.buildId === sourceBinding.buildId,
  width: videoStream?.width === 960,
  height: videoStream?.height === 540,
  fps: videoStream?.avg_frame_rate === "30/1",
  audioPresent: Boolean(audioStream),
  audioCodec: audioStream?.codec_name === "aac",
  durationCoversTimelineAndAudio: finalDurationSec + 0.25 >= Math.max(timelineDurationSec, audioDurationSec),
  videoDurationCoversTimeline: Number(videoStream?.duration || 0) + 0.25 >= timelineDurationSec,
  sampledFrameCount: samples.length === 12,
  sixArchetypesCovered: new Set(samples.map((sample) => sample.archetypeId)).size === 6,
  samplesReadable: samples.every((sample) => sample.stats.width === 960 && sample.stats.height === 540 && sample.stats.paperFraction >= 0.25 && sample.stats.darkFraction < 0.18 && sample.stats.saturatedFraction < 0.16 && sample.stats.maxDarkRowFraction < 0.55),
  temporalMotionObserved: temporalProof.every((item) => item.meanAbsoluteDifference >= 0.12),
  reviewOnly: props.reviewOnly === true && props.finalRenderAllowed === false,
};
const failures = Object.entries(checks).filter(([, pass]) => !pass).map(([id]) => id);
const report = {
  contract: "A1CurrentFilm540pPreview/v1",
  status: failures.length ? "BLOCKED" : "CURRENT_PREVIEW_RENDERED",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  compositionId,
  sourceBinding,
  renderProfile: {width: 960, height: 540, fps: 30, scale: 0.5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 86, concurrency, timelineDurationSec, audioDurationSec, finalDurationSec, videoPadSec, audioPadSec},
  media: {
    silentVideo: {path: relative(silentVideoPath), sha256: sha256File(silentVideoPath), durationSec: silentDurationSec},
    reviewVideo: {path: relative(reviewVideoPath), publicUrl: "/generated/system-line/current-film/current-preview-960x540-with-source-audio.mp4", sha256: sha256File(reviewVideoPath), bytes: fs.statSync(reviewVideoPath).size, durationSec: finalDurationSec, width: videoStream?.width, height: videoStream?.height, fps: videoStream?.avg_frame_rate, audioCodec: audioStream?.codec_name || null, audioChannels: audioStream?.channels || null},
    contactSheet: {path: relative(contactSheetPath), publicUrl: "/generated/system-line/current-film/current-preview-12-frame-contact-sheet.png", sha256: sha256File(contactSheetPath), width: columns * tileWidth + (columns - 1) * gutter, height: rows * tileHeight + (rows - 1) * gutter},
    poster: {path: relative(posterPath), publicUrl: "/generated/system-line/current-film/current-preview-poster-960x540.png", sha256: sha256File(posterPath), width: 960, height: 540, sourceBeatId: samples[0].beatId},
  },
  samples: samples.map((sample) => ({...sample, file: relative(sample.file)})),
  temporalProof,
  checks,
  failures,
  renderElapsedMs,
  reusedCachedRender: cached,
  reusedCurrentSilent: reuseSilent,
  recoveredCurrentSilent,
  nextAction: failures.length ? "repair-current-full-preview" : "open-current-preview-on-4311-and-perform-human-review",
};
writeJson(reportPath, report);
writeJson(publicReportPath, report);

const previewManifest = {
  contract: "A1CurrentFilmFullPreviewManifest/v1",
  status: failures.length ? "blocked" : "current-preview-ready",
  generatedAt: report.generatedAt,
  reviewOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  compositionId,
  sourceBinding,
  video: {url: report.media.reviewVideo.publicUrl, sha256: report.media.reviewVideo.sha256, bytes: report.media.reviewVideo.bytes, width: report.media.reviewVideo.width, height: report.media.reviewVideo.height, fps: report.media.reviewVideo.fps, durationSec: report.media.reviewVideo.durationSec, audioCodec: report.media.reviewVideo.audioCodec, audioChannels: report.media.reviewVideo.audioChannels},
  contactSheet: {url: report.media.contactSheet.publicUrl, sha256: report.media.contactSheet.sha256, width: report.media.contactSheet.width, height: report.media.contactSheet.height},
  poster: {url: report.media.poster.publicUrl, sha256: report.media.poster.sha256, width: report.media.poster.width, height: report.media.poster.height, sourceBeatId: report.media.poster.sourceBeatId},
  checks,
  failures,
  nextAction: report.nextAction,
};
writeJson(previewManifestPath, previewManifest);
run(process.execPath, [path.join(root, "scripts/build-current-film-manifest-v1.mjs")]);
const refreshedCurrentFilm = readJson(path.join(publicRoot, "current-film-manifest.json"));
console.log(JSON.stringify({status: report.status, currentFilmState: refreshedCurrentFilm.state, video: report.media.reviewVideo, contactSheet: report.media.contactSheet, checks, failures, temporalProof, renderElapsedMs, reusedCachedRender: cached, reusedCurrentSilent: reuseSilent, recoveredCurrentSilent, reportPath: relative(reportPath), previewManifestPath: relative(previewManifestPath)}, null, 2));
if (failures.length || refreshedCurrentFilm.state !== "CURRENT_PREVIEW_READY") process.exitCode = 2;
