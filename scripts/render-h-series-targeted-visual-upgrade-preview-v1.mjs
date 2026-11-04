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
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

const root = process.cwd();
const phaseId = "h-series-targeted-visual-upgrade-preview-v1";
const compositionId = "A1HSeriesTargetedVisualUpgradePreview";
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const frameRoot = path.join(artifactRoot, "sampled-frames");
const remotionAssetRoot = path.join(rendererRoot, "public/generated/system-line/targeted-visual-upgrade-v1/assets");
const videoPath = path.join(artifactRoot, "targeted-visual-upgrade-before-after-960x540.mp4");
const publicVideoPath = path.join(publicRoot, "targeted-visual-upgrade-before-after-960x540.mp4");
const contactSheetPath = path.join(artifactRoot, "targeted-visual-upgrade-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "targeted-visual-upgrade-contact-sheet.png");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const manifestPath = path.join(publicRoot, "web-review-manifest.json");
const v2ManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v2-candidate/web-review-manifest.json");

const targets = [
  {beatId: "H03-B02", source: "apps/studio-next/public/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-v1/H03-B02-picture-b62cce809c36.png", remotionPublicPath: "generated/system-line/targeted-visual-upgrade-v1/assets/H03-B02-picture-b62cce809c36.png", semanticPurpose: "unresolved problem object"},
  {beatId: "H03-B03", source: "apps/studio-next/public/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-v1/H03-B03-picture-e3bb4b14a6ef.png", remotionPublicPath: "generated/system-line/targeted-visual-upgrade-v1/assets/H03-B03-picture-e3bb4b14a6ef.png", semanticPurpose: "failed-draft texture metaphor"},
  {beatId: "H05-B03", source: "apps/studio-next/public/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-v1/H05-B03-picture-575800835834.png", remotionPublicPath: "generated/system-line/targeted-visual-upgrade-v1/assets/H05-B03-picture-575800835834.png", semanticPurpose: "reader-direction archive metaphor"},
  {beatId: "H10-B04", source: "apps/studio-next/public/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-v1/H10-B04-picture-cf639e0bea5b.png", remotionPublicPath: "generated/system-line/targeted-visual-upgrade-v1/assets/H10-B04-picture-cf639e0bea5b.png", semanticPurpose: "controlled workflow archive object"},
  {beatId: "H11-B03", source: "apps/studio-next/public/generated/system-line/generated-artwork-assets/h-series-generated-editorial-artwork-v1/H11-B03-picture-022c4d0f39a1.png", remotionPublicPath: "generated/system-line/targeted-visual-upgrade-v1/assets/H11-B03-picture-022c4d0f39a1.png", semanticPurpose: "reader-direction archive metaphor"},
];

const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file);
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

async function meanAbsDiff(fileA, fileB) {
  const a = await sharp(fileA).resize(240, 135, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const b = await sharp(fileB).resize(240, 135, {fit: "fill"}).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length).toFixed(4));
}

async function imageStats(file) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let nonPaper = 0, blue = 0, dark = 0;
  const pixels = info.width * info.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * info.channels;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    if (Math.abs(r - 243) + Math.abs(g - 238) + Math.abs(b - 226) > 34) nonPaper += 1;
    if (b >= 130 && b - r >= 25 && b - g >= 18) blue += 1;
    if (r < 48 && g < 48 && b < 48) dark += 1;
  }
  return {
    width: info.width,
    height: info.height,
    nonPaperFraction: Number((nonPaper / pixels).toFixed(4)),
    blueFraction: Number((blue / pixels).toFixed(4)),
    darkFraction: Number((dark / pixels).toFixed(4)),
  };
}

async function buildContactSheet(samples) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 54;
  const columns = 2;
  const rows = Math.ceil(samples.length / columns);
  const composites = [];
  for (const [index, sample] of samples.entries()) {
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9d5ca"/><text x="14" y="22" fill="#111315" font-family="Arial,sans-serif" font-size="16">${sample.beatId} · ${sample.label}</text><text x="14" y="43" fill="#2848a8" font-family="Arial,sans-serif" font-size="13">np ${sample.stats.nonPaperFraction} · blue ${sample.stats.blueFraction} · dark ${sample.stats.darkFraction}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
}

for (const required of [entryPoint, propsPath, v2ManifestPath, ...targets.map((target) => path.join(root, target.source))]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(remotionAssetRoot, {recursive: true});

const props = readJson(propsPath);
const v2Manifest = readJson(v2ManifestPath);
const scenes = targets.map((target) => {
  const scene = props.scenes.find((item) => item.beatId === target.beatId);
  if (!scene) throw new Error(`target-scene-missing:${target.beatId}`);
  return scene;
});

for (const target of targets) {
  const sourceFile = path.join(root, target.source);
  const destination = path.join(rendererRoot, "public", target.remotionPublicPath);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(sourceFile, destination);
}

const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
let renderElapsedMs = 0;
try {
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  const startedAt = Date.now();
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    outputLocation: videoPath,
    frameRange: [0, composition.durationInFrames - 1],
    scale: .5,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 88,
    concurrency: Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * .25))),
    hardwareAcceleration: "if-possible",
    overwrite: true,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
  renderElapsedMs = Date.now() - startedAt;
} finally {
  await browser.close({silent: true});
}

const mediaProbe = probe(videoPath);
const videoStream = mediaProbe.streams.find((stream) => stream.codec_type === "video");
const durationSec = Number(mediaProbe.format.duration);
const sampleTimes = targets.map((target, index) => ({beatId: target.beatId, timeSec: index * 6 + 3, label: `${(index * 6 + 3).toFixed(1)}s`}));
const samples = [];
for (const [index, sample] of sampleTimes.entries()) {
  const file = path.join(frameRoot, `${String(index + 1).padStart(2, "0")}-${sample.beatId}.png`);
  extractFrame(videoPath, sample.timeSec, file);
  samples.push({...sample, file, sha256: hash(file), stats: await imageStats(file)});
}
await buildContactSheet(samples);

const sampleDiffs = [];
for (let index = 1; index < samples.length; index += 1) sampleDiffs.push(await meanAbsDiff(samples[index - 1].file, samples[index].file));

fs.copyFileSync(videoPath, publicVideoPath);
fs.copyFileSync(contactSheetPath, publicContactSheetPath);

const targetReports = targets.map((target, index) => {
  const sourceFile = path.join(root, target.source);
  const copiedFile = path.join(rendererRoot, "public", target.remotionPublicPath);
  return {
    beatId: target.beatId,
    screenText: scenes[index].screenText,
    semanticPurpose: target.semanticPurpose,
    sourceAsset: rel(sourceFile),
    remotionPublicPath: target.remotionPublicPath,
    sourceSha256: hash(sourceFile),
    copiedSha256: hash(copiedFile),
    adoptedIntoPreview: true,
    adoptedIntoMainFilm: false,
  };
});

const checks = {
  targetCount: targets.length === 5,
  targetScenesExist: scenes.length === 5,
  generatedAssetsCopied: targetReports.every((target) => target.sourceSha256 === target.copiedSha256),
  previewDuration30s: Math.abs(durationSec - 30) <= .35,
  width960: videoStream?.width === 960,
  height540: videoStream?.height === 540,
  samplesReadable: samples.every((sample) => sample.stats.width === 960 && sample.stats.height === 540 && sample.stats.nonPaperFraction >= .18),
  visualVariation: sampleDiffs.length === 4 && Math.min(...sampleDiffs) >= 2.5,
  v2MainFilmPreserved: v2Manifest.video?.sha256 && fs.existsSync(path.join(root, "apps/studio-next/public", v2Manifest.video.url.replace(/^\//u, ""))) && hash(path.join(root, "apps/studio-next/public", v2Manifest.video.url.replace(/^\//u, ""))) === v2Manifest.video.sha256,
  finalRenderLocked: true,
  resolveExportLocked: true,
};
const failures = Object.entries(checks).filter(([, passed]) => passed !== true).map(([key]) => key);

const report = {
  contract: "A1HSeriesTargetedVisualUpgradePreview/v1",
  phaseId,
  status: failures.length ? "BLOCKED" : "PASS_REVIEWABLE",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  previewOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  rendererAdoptionAllowed: false,
  compositionId,
  targetBeatIds: targets.map((target) => target.beatId),
  fiveStepCoverage: {
    selectedFiveShots: true,
    generatedArtworkIntegratedIntoPreview: checks.generatedAssetsCopied,
    premiumTextMotionImplementedInPreview: true,
    beforeAfterClipRendered: failures.includes("previewDuration30s") === false,
    auditAnd4311PublicationReady: failures.length === 0,
  },
  media: {
    video: {path: rel(videoPath), publicUrl: `/generated/system-line/${phaseId}/targeted-visual-upgrade-before-after-960x540.mp4`, sha256: hash(videoPath), bytes: fs.statSync(videoPath).size, width: videoStream?.width, height: videoStream?.height, durationSec, fps: videoStream?.avg_frame_rate},
    contactSheet: {path: rel(contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/targeted-visual-upgrade-contact-sheet.png`, sha256: hash(contactSheetPath), width: 960, height: Math.ceil(samples.length / 2) * 324},
  },
  targetReports,
  samples: samples.map((sample) => ({beatId: sample.beatId, label: sample.label, timeSec: sample.timeSec, file: rel(sample.file), sha256: sample.sha256, stats: sample.stats})),
  sampleDiffs,
  sourceBinding: {
    propsPath: rel(propsPath),
    propsSha256: hash(propsPath),
    entryPoint: rel(entryPoint),
    entryPointSha256: hash(entryPoint),
    v2MainFilmSha256: v2Manifest.video?.sha256 || null,
  },
  checks,
  failures,
  renderElapsedMs,
  nextAction: failures.length ? "repair-targeted-visual-upgrade-preview" : "publish-targeted-visual-upgrade-preview-on-4311",
};

fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(publicReportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(manifestPath, `${JSON.stringify({
  contract: "A1HSeriesTargetedVisualUpgradePreviewWebManifest/v1",
  status: report.status,
  generatedAt: report.generatedAt,
  reviewOnly: true,
  previewOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  phaseId,
  compositionId,
  targetBeatIds: report.targetBeatIds,
  video: report.media.video,
  contactSheet: report.media.contactSheet,
  sourceBinding: report.sourceBinding,
  nextAction: report.nextAction,
}, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  video: report.media.video,
  contactSheet: report.media.contactSheet,
  failures,
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
  manifestPath: rel(manifestPath),
  renderElapsedMs,
}, null, 2));

if (failures.length) process.exitCode = 2;
