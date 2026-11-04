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
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const rendererComponentPath = path.join(rendererRoot, "src/MicrobeatLayeredFullReview.tsx");
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const audioPath = "/Users/a1/Documents/Codex/声音/outputs/voice_clone_july1/july1_full_16k_mono.wav";
const v1ManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json");
const v1RejectionPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-v1-visual-rejection-v1/report.json");
const phaseId = "h-series-1080p-review-mp4-v1";
const phaseRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const frameRoot = path.join(phaseRoot, "sampled-mp4-frames");
const silentVideoPath = path.join(phaseRoot, "review-silent-1920x1080.mp4");
const reviewVideoPath = path.join(phaseRoot, "review-1920x1080-with-source-audio.mp4");
const reportPath = path.join(phaseRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const contactSheetPath = path.join(phaseRoot, "mp4-sample-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "mp4-sample-contact-sheet.png");
const publicVideoPath = path.join(publicRoot, "review-1920x1080-with-source-audio.mp4");
const publicManifestPath = path.join(publicRoot, "web-review-manifest.json");
const compositionId = "A1SystemLineHFullTimelineReview";
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * .25)));

const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const hashValue = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function run(command, args) {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout || `exit-${result.status}`}`);
  return result.stdout;
}

function probe(file) {
  return JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
}

function extractFrame(input, timeSec, output) {
  run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", String(timeSec.toFixed(3)), "-i", input, "-frames:v", "1", output]);
}

async function imageStats(file) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let dark = 0, blue = 0, nonPaper = 0, warmPaper = 0, edge = 0;
  const pixels = info.width * info.height;
  const luma = new Float32Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * info.channels;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    const y = .2126 * r + .7152 * g + .0722 * b;
    luma[pixel] = y;
    if (r < 48 && g < 48 && b < 48) dark += 1;
    if (b >= 130 && b - r >= 25 && b - g >= 18) blue += 1;
    if (Math.abs(r - 243) + Math.abs(g - 238) + Math.abs(b - 226) > 34) nonPaper += 1;
    if (r > 210 && g > 202 && b > 180 && Math.abs(r - g) < 35 && r - b < 76) warmPaper += 1;
  }
  for (let y = 0; y < info.height - 1; y += 1) {
    for (let x = 0; x < info.width - 1; x += 1) {
      const index = y * info.width + x;
      if (Math.abs(luma[index] - luma[index + 1]) + Math.abs(luma[index] - luma[index + info.width]) > 34) edge += 1;
    }
  }
  const edgeDenominator = Math.max(1, (info.width - 1) * (info.height - 1));
  return {
    width: info.width,
    height: info.height,
    darkFraction: Number((dark / pixels).toFixed(4)),
    blueFraction: Number((blue / pixels).toFixed(4)),
    nonPaperFraction: Number((nonPaper / pixels).toFixed(4)),
    warmPaperFraction: Number((warmPaper / pixels).toFixed(4)),
    edgeDensity: Number((edge / edgeDenominator).toFixed(4)),
  };
}

async function meanAbsoluteDifference(fileA, fileB) {
  const a = await sharp(fileA).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const b = await sharp(fileB).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length).toFixed(4));
}

async function buildContactSheet(samples) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 54;
  const columns = 3;
  const rows = Math.ceil(samples.length / columns);
  const composites = [];
  for (const [index, sample] of samples.entries()) {
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9d5ca"/><text x="14" y="22" fill="#111315" font-family="Arial,sans-serif" font-size="16">${sample.label}</text><text x="14" y="43" fill="#2848a8" font-family="Arial,sans-serif" font-size="13">np ${sample.stats.nonPaperFraction} edge ${sample.stats.edgeDensity} blue ${sample.stats.blueFraction}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
}

for (const required of [entryPoint, rendererComponentPath, propsPath, audioPath, v1ManifestPath, v1RejectionPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}
fs.mkdirSync(phaseRoot, {recursive: true});
fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const props = readJson(propsPath);
const v1Manifest = readJson(v1ManifestPath);
const v1Rejection = readJson(v1RejectionPath);
if (v1Rejection.status !== "REJECTED_STALE_VISUAL") throw new Error("v1-not-marked-rejected");
const renderInputHash = hashValue(JSON.stringify({
  entryPointSha256: hash(entryPoint),
  rendererComponentSha256: hash(rendererComponentPath),
  propsSha256: hash(propsPath),
  audioSha256: hash(audioPath),
}));
const previousReport = fs.existsSync(reportPath) ? readJson(reportPath) : null;
const cachedRenderMatchesInputs = Boolean(
  fs.existsSync(reviewVideoPath)
  && fs.existsSync(silentVideoPath)
  && previousReport?.sourceBinding?.renderInputHash === renderInputHash,
);

let renderElapsedMs = 0;
if (!cachedRenderMatchesInputs) {
  const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    const startedAt = Date.now();
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      outputLocation: silentVideoPath,
      frameRange: [0, composition.durationInFrames - 1],
      scale: 1,
      codec: "h264",
      pixelFormat: "yuv420p",
      imageFormat: "jpeg",
      jpegQuality: 90,
      concurrency,
      hardwareAcceleration: "if-possible",
      overwrite: true,
      puppeteerInstance: browser,
      logLevel: "warn",
    });
    renderElapsedMs = Date.now() - startedAt;
  } finally {
    await browser.close({silent: true});
  }
}

const silentProbe = probe(silentVideoPath);
const audioProbe = probe(audioPath);
const silentVideoStream = silentProbe.streams.find((stream) => stream.codec_type === "video");
const sourceAudioStream = audioProbe.streams.find((stream) => stream.codec_type === "audio");
const silentDurationSec = Number(silentProbe.format.duration);
const sourceAudioDurationSec = Number(audioProbe.format.duration);
const tailPadSec = Math.max(0, Number((sourceAudioDurationSec - silentDurationSec + .05).toFixed(3)));

if (!cachedRenderMatchesInputs || !fs.existsSync(reviewVideoPath) || renderElapsedMs > 0) {
  run(ffmpegPath, [
    "-loglevel", "error", "-y",
    "-i", silentVideoPath,
    "-i", audioPath,
    "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${tailPadSec}[v]`,
    "-map", "[v]", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-shortest",
    reviewVideoPath,
  ]);
}

const finalProbe = probe(reviewVideoPath);
const finalVideoStream = finalProbe.streams.find((stream) => stream.codec_type === "video");
const finalAudioStream = finalProbe.streams.find((stream) => stream.codec_type === "audio");
const finalDurationSec = Number(finalProbe.format.duration);
const sampleTimes = [2, 24, 58, 104, 156, Math.max(1, Math.min(finalDurationSec - .25, finalDurationSec - 1))];
const samples = [];
for (const [index, timeSec] of sampleTimes.entries()) {
  const file = path.join(frameRoot, `${String(index + 1).padStart(2, "0")}-${String(Math.round(timeSec * 1000)).padStart(6, "0")}ms.png`);
  extractFrame(reviewVideoPath, timeSec, file);
  samples.push({label: `${timeSec.toFixed(1)}s`, timeSec, file, sha256: hash(file), stats: await imageStats(file)});
}
await buildContactSheet(samples);
const sampleDiffs = [];
for (let index = 1; index < samples.length; index += 1) sampleDiffs.push(await meanAbsoluteDifference(samples[index - 1].file, samples[index].file));

const checks = {
  v1PreservedAsPriorArtifact: fs.existsSync(path.join(root, "apps/studio-next/public", v1Manifest.video.url.replace(/^\//u, ""))) && hash(path.join(root, "apps/studio-next/public", v1Manifest.video.url.replace(/^\//u, ""))) === v1Manifest.video.sha256,
  width: finalVideoStream?.width === 1920,
  height: finalVideoStream?.height === 1080,
  fps: finalVideoStream?.avg_frame_rate === "30/1",
  audioPresent: Boolean(finalAudioStream),
  audioCodec: finalAudioStream?.codec_name === "aac",
  durationMatchesAudioTail: Math.abs(finalDurationSec - sourceAudioDurationSec) <= .25,
  samplesReadable: samples.every((sample) => sample.stats.width === 1920 && sample.stats.height === 1080 && sample.stats.nonPaperFraction >= .03 && sample.stats.darkFraction <= .28),
  sampledMotionVaries: Math.max(...sampleDiffs) >= .55,
  notSameAsV1: hash(reviewVideoPath) !== v1Manifest.video.sha256,
};
const failures = Object.entries(checks).filter(([, passed]) => passed !== true).map(([key]) => key);

fs.copyFileSync(reviewVideoPath, publicVideoPath);
fs.copyFileSync(contactSheetPath, publicContactSheetPath);

const report = {
  contract: "A1HSeries1080pReviewMp4V1/v1",
  status: failures.length ? "BLOCKED" : "PASS",
  reviewOnly: true,
  candidateOnly: false,
  candidateOnly: false,
  replacesCurrentV1: false,
  finalRenderAllowed: true,
  resolveExportAllowed: true,
  compositionId,
  sourceBinding: {
      entryPoint: path.relative(root, entryPoint),
      entryPointSha256: hash(entryPoint),
      rendererComponent: path.relative(root, rendererComponentPath),
      rendererComponentSha256: hash(rendererComponentPath),
      propsPath: path.relative(root, propsPath),
      propsSha256: hash(propsPath),
      audioPath,
      audioSha256: hash(audioPath),
      v1PriorVideoSha256: v1Manifest.video.sha256,
      renderInputHash,
      reusedCachedRender: cachedRenderMatchesInputs,
  },
  renderProfile: {width: 1920, height: 1080, fps: 30, scale: 1, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 90, concurrency, frameRange: [0, props.durationInFrames ? props.durationInFrames - 1 : null], tailPadSec},
  media: {
    reviewVideo: {path: path.relative(root, reviewVideoPath), publicUrl: `/generated/system-line/${phaseId}/review-1920x1080-with-source-audio.mp4`, sha256: hash(reviewVideoPath), bytes: fs.statSync(reviewVideoPath).size, durationSec: finalDurationSec, width: finalVideoStream?.width, height: finalVideoStream?.height, fps: finalVideoStream?.avg_frame_rate, audioCodec: finalAudioStream?.codec_name || null, audioChannels: finalAudioStream?.channels || null},
    contactSheet: {path: path.relative(root, contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/mp4-sample-contact-sheet.png`, sha256: hash(contactSheetPath), width: 1440, height: Math.ceil(samples.length / 3) * (270 + 54)},
    sourceAudio: {durationSec: sourceAudioDurationSec, codec: sourceAudioStream?.codec_name || null, channels: sourceAudioStream?.channels || null},
  },
  samples: samples.map((sample) => ({label: sample.label, timeSec: sample.timeSec, file: path.relative(root, sample.file), sha256: sample.sha256, stats: sample.stats})),
  sampleDiffs,
  checks,
  failures,
  renderElapsedMs,
  nextAction: failures.length ? "repair-1080p-render" : "1080p-render-complete-ready-for-review",
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);

const manifest = {
  contract: "A1SystemLineReviewWebManifest/v1-1080p",
  status: report.status === "PASS" ? "production-reviewable" : "blocked",
  reviewOnly: true,
  candidateOnly: false,
  candidateOnly: false,
  replacesCurrentV1: false,
  finalRenderAllowed: true,
  resolveExportAllowed: true,
  generatedAt: new Date().toISOString(),
  phaseId,
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
  compositionId,
  publicBaseUrl: `/generated/system-line/${phaseId}`,
  video: {url: report.media.reviewVideo.publicUrl, sha256: report.media.reviewVideo.sha256, bytes: report.media.reviewVideo.bytes, width: report.media.reviewVideo.width, height: report.media.reviewVideo.height, fps: report.media.reviewVideo.fps, durationSec: report.media.reviewVideo.durationSec, audioCodec: report.media.reviewVideo.audioCodec, audioChannels: report.media.reviewVideo.audioChannels},
  contactSheet: {url: report.media.contactSheet.publicUrl, sha256: report.media.contactSheet.sha256, width: report.media.contactSheet.width, height: report.media.contactSheet.height},
  sourceBinding: report.sourceBinding,
  checks,
  samples: report.samples,
  priorV1: {manifestUrl: "/generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json", videoUrl: v1Manifest.video.url, videoSha256: v1Manifest.video.sha256, visualStatus: "REJECTED_STALE_VISUAL"},
  nextAction: report.nextAction,
};
fs.writeFileSync(publicManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  video: report.media.reviewVideo,
  contactSheet: report.media.contactSheet,
  checks,
  failures,
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  manifestPath: path.relative(root, publicManifestPath),
  renderElapsedMs,
}, null, 2));
if (failures.length) process.exitCode = 2;
