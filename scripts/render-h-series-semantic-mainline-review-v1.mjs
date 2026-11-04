#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

const root = process.cwd();
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const materialManifestPath = path.join(rendererRoot, "src/generated/hSeriesMaterialManifest.json");
const continuityManifestPath = path.join(rendererRoot, "src/generated/hSeriesContinuityManifest.json");
const directorPlanPath = path.join(rendererRoot, "src/hSeriesSemanticDirectorPlan.json");
const directedRendererPath = path.join(rendererRoot, "src/HSeriesSemanticDirectedStage.tsx");
const audioPath = "/Users/a1/Documents/Codex/声音/outputs/voice_clone_july1/july1_full_16k_mono.wav";
const phaseId = process.env.A1_SEMANTIC_MAINLINE_PHASE || "h-series-semantic-directed-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const silentPath = path.join(artifactRoot, "review-silent-960x540.mp4");
const videoPath = path.join(artifactRoot, "review-960x540-with-source-audio.mp4");
const contactSheetPath = path.join(artifactRoot, "semantic-mainline-contact-sheet.png");
const reportPath = path.join(artifactRoot, "report.json");
const publicVideoPath = path.join(publicRoot, "review-960x540-with-source-audio.mp4");
const publicContactSheetPath = path.join(publicRoot, "semantic-mainline-contact-sheet.png");
const publicReportPath = path.join(publicRoot, "report.json");
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => { const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024}); if (result.status !== 0) throw new Error(`${path.basename(command)}:${result.stderr || result.stdout || result.status}`); return result.stdout; };
const probe = (file) => JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const extract = (time, output) => run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", String(time.toFixed(3)), "-i", videoPath, "-frames:v", "1", output]);

for (const file of [entryPoint, propsPath, directorPlanPath, directedRendererPath, audioPath]) if (!fs.existsSync(file)) throw new Error(`missing:${file}`);
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
const props = read(propsPath);
const directorPlan = read(directorPlanPath);
const materialManifest = read(path.join(rendererRoot, "src/generated/hSeriesMaterialManifest.json"));
const continuityManifest = read(path.join(rendererRoot, "src/generated/hSeriesContinuityManifest.json"));
const directedItems = Object.values(directorPlan.macroDesigns || {}).flat();
const sourceBinding = {entryPoint: path.relative(root, entryPoint), entryPointSha256: hash(entryPoint), propsPath: path.relative(root, propsPath), propsSha256: hash(propsPath), directorPlanPath: path.relative(root, directorPlanPath), directorPlanSha256: hash(directorPlanPath), directedRendererPath: path.relative(root, directedRendererPath), directedRendererSha256: hash(directedRendererPath), materialManifestPath: path.relative(root, materialManifestPath), materialManifestSha256: hash(materialManifestPath), continuityManifestPath: path.relative(root, continuityManifestPath), continuityManifestSha256: hash(continuityManifestPath), audioPath, audioSha256: hash(audioPath), sourceVariationHash: props.sourceVariationHash, sceneCount: props.scenes.length};
const macroIntervals = props.scenes.reduce((all, scene) => {
  const current = all.at(-1);
  const endFrame = scene.startFrame + scene.durationInFrames;
  if (current?.macroId === scene.macroId) current.endFrame = Math.max(current.endFrame, endFrame);
  else all.push({macroId: scene.macroId, startFrame: scene.startFrame, endFrame});
  return all;
}, []);
const chapterOverlapFailures = macroIntervals.slice(1).flatMap((item, index) => item.startFrame < macroIntervals[index].endFrame ? [{outgoing: macroIntervals[index].macroId, incoming: item.macroId, overlapFrames: macroIntervals[index].endFrame - item.startFrame}] : []);

const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
try {
  const composition = await selectComposition({serveUrl, id: "A1SystemLineHFullTimelineReview", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  await renderMedia({serveUrl, composition, inputProps: props, frameRange: [0, composition.durationInFrames - 1], scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 84, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn", outputLocation: silentPath});
} finally {
  await browser.close({silent: true});
}

const silentProbe = probe(silentPath);
const sourceAudio = probe(audioPath);
const silentDuration = Number(silentProbe.format.duration);
const sourceDuration = Number(sourceAudio.format.duration);
const tailPad = Math.max(0, Number((sourceDuration - silentDuration + .05).toFixed(3)));
run(ffmpegPath, ["-loglevel", "error", "-y", "-i", silentPath, "-i", audioPath, "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${tailPad}[v]`, "-map", "[v]", "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", videoPath]);

const finalProbe = probe(videoPath);
const videoStream = finalProbe.streams.find((stream) => stream.codec_type === "video");
const audioStream = finalProbe.streams.find((stream) => stream.codec_type === "audio");
const durationSec = Number(finalProbe.format.duration);
const sampleTimes = [2, 24, 58, 104, 156, Math.max(1, durationSec - 1)];
const samples = [];
for (const [index, timeSec] of sampleTimes.entries()) {
  const file = path.join(artifactRoot, `frame-${String(index + 1).padStart(2, "0")}.png`);
  extract(timeSec, file);
  samples.push({timeSec, file, sha256: hash(file)});
}
const tileWidth = 480;
const tileHeight = 270;
const labelHeight = 42;
const composites = [];
for (const [index, sample] of samples.entries()) {
  const image = await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9d5ca"/><text x="14" y="27" fill="#111315" font-family="Arial,sans-serif" font-size="17">${sample.timeSec.toFixed(1)}s · semantic mainline</text></svg>`);
  const left = (index % 3) * tileWidth;
  const top = Math.floor(index / 3) * (tileHeight + labelHeight);
  composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
}
await sharp({create: {width: 3 * tileWidth, height: 2 * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
fs.copyFileSync(videoPath, publicVideoPath);
fs.copyFileSync(contactSheetPath, publicContactSheetPath);

const report = {
  contract: "A1HSeriesSemanticDirectedReview/v1",
  status: videoStream?.width === 960 && videoStream?.height === 540 && videoStream?.avg_frame_rate === "30/1" && audioStream?.codec_name === "aac" && directedItems.length === 47 && chapterOverlapFailures.length === 0 ? "READY_FOR_DIRECT_REVIEW" : "BLOCKED",
  reviewOnly: true,
  candidateOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  sourceBinding,
  media: {video: {publicUrl: `/generated/system-line/${phaseId}/review-960x540-with-source-audio.mp4`, sha256: hash(videoPath), durationSec, width: videoStream?.width, height: videoStream?.height, fps: videoStream?.avg_frame_rate, audioCodec: audioStream?.codec_name || null}, contactSheet: {publicUrl: `/generated/system-line/${phaseId}/semantic-mainline-contact-sheet.png`, sha256: hash(contactSheetPath), sampleCount: samples.length}},
  samples: samples.map((sample) => ({timeSec: sample.timeSec, sha256: sample.sha256})),
  director: {contract: directorPlan.contract, sceneCount: directedItems.length, macroCount: Object.keys(directorPlan.macroDesigns || {}).length, routeCounts: materialManifest.summary?.routeCounts},
  continuityProof: {macroIntervals, chapterOverlapFrames: chapterOverlapFailures.reduce((sum, item) => sum + item.overlapFrames, 0), chapterOverlapFailures},
  packaging: {materialManifest: {contract: materialManifest.contract, routeCounts: materialManifest.summary?.routeCounts, rendererBoundCount: materialManifest.summary?.rendererBoundCount, uniqueArtworkAssetCount: materialManifest.summary?.uniqueArtworkAssetCount, deterministicRenderedCount: materialManifest.summary?.deterministicRenderedCount, pendingVisualReviewCount: materialManifest.summary?.pendingVisualReviewCount}, continuityManifest: {contract: continuityManifest.contract, motifCount: continuityManifest.motifs?.length, transitionCount: continuityManifest.summary?.transitionCount, sameMotifCarryCount: continuityManifest.summary?.sameMotifCarryCount}},
  nextAction: "watch-full-semantic-mainline-review-before-adoption",
};
for (const output of [reportPath, publicReportPath]) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
