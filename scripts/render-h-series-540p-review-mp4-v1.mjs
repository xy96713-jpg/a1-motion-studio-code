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
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const audioPath = "/Users/a1/Documents/Codex/声音/outputs/voice_clone_july1/july1_full_16k_mono.wav";
const phaseId = "h-series-540p-review-mp4-v1";
const phaseRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const frameRoot = path.join(phaseRoot, "sampled-mp4-frames");
const silentVideoPath = path.join(phaseRoot, "review-silent-960x540.mp4");
const reviewVideoPath = path.join(phaseRoot, "review-960x540-with-source-audio.mp4");
const reportPath = path.join(phaseRoot, "report.json");
const contactSheetPath = path.join(phaseRoot, "mp4-sample-contact-sheet.png");
const currentPhasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const compositionId = "A1SystemLineHFullTimelineReview";
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * .25)));

const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function run(command, args) {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout || `exit-${result.status}`}`);
  return result.stdout;
}

function probe(file) {
  return JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
}

async function imageStats(file) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let dark = 0;
  let blue = 0;
  let nonPaper = 0;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * info.channels;
    const r = data[offset], g = data[offset + 1], b = data[offset + 2];
    if (r < 48 && g < 48 && b < 48) dark += 1;
    if (b >= 130 && b - r >= 25 && b - g >= 18) blue += 1;
    if (Math.abs(r - 243) + Math.abs(g - 238) + Math.abs(b - 226) > 34) nonPaper += 1;
  }
  const pixels = info.width * info.height;
  return {
    width: info.width,
    height: info.height,
    darkFraction: Number((dark / pixels).toFixed(4)),
    blueFraction: Number((blue / pixels).toFixed(4)),
    nonPaperFraction: Number((nonPaper / pixels).toFixed(4)),
  };
}

async function meanAbsoluteDifference(fileA, fileB) {
  const a = await sharp(fileA).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const b = await sharp(fileB).resize(192, 108, {fit: "fill"}).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length).toFixed(4));
}

function extractFrame(input, timeSec, output) {
  run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", String(timeSec.toFixed(3)), "-i", input, "-frames:v", "1", output]);
}

async function buildContactSheet(samples) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 44;
  const columns = 3;
  const rows = Math.ceil(samples.length / columns);
  const composites = [];
  for (const [index, sample] of samples.entries()) {
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#d9d5ca"/><text x="16" y="29" fill="#111315" font-family="Arial,sans-serif" font-size="18">${sample.label}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
}

for (const required of [entryPoint, propsPath, audioPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}
fs.mkdirSync(phaseRoot, {recursive: true});
fs.mkdirSync(frameRoot, {recursive: true});

const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const priorPhase = fs.existsSync(currentPhasePath) ? JSON.parse(fs.readFileSync(currentPhasePath, "utf8")) : {};
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
    outputLocation: silentVideoPath,
    frameRange: [0, composition.durationInFrames - 1],
    scale: .5,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 82,
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

const silentProbe = probe(silentVideoPath);
const audioProbe = probe(audioPath);
const silentVideoStream = silentProbe.streams.find((stream) => stream.codec_type === "video");
const sourceAudioStream = audioProbe.streams.find((stream) => stream.codec_type === "audio");
const silentDurationSec = Number(silentProbe.format.duration);
const sourceAudioDurationSec = Number(audioProbe.format.duration);
const tailPadSec = Math.max(0, Number((sourceAudioDurationSec - silentDurationSec + .05).toFixed(3)));

run(ffmpegPath, [
  "-loglevel", "error",
  "-y",
  "-i", silentVideoPath,
  "-i", audioPath,
  "-filter_complex", `[0:v]tpad=stop_mode=clone:stop_duration=${tailPadSec}[v]`,
  "-map", "[v]",
  "-map", "1:a:0",
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  "-b:a", "128k",
  "-shortest",
  reviewVideoPath,
]);

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
  width: finalVideoStream?.width === 960,
  height: finalVideoStream?.height === 540,
  fps: finalVideoStream?.avg_frame_rate === "30/1",
  audioPresent: Boolean(finalAudioStream),
  audioCodec: finalAudioStream?.codec_name === "aac",
  durationMatchesAudioTail: Math.abs(finalDurationSec - sourceAudioDurationSec) <= .25,
  tailHandledByFreezeFrame: tailPadSec >= Math.max(0, sourceAudioDurationSec - silentDurationSec),
  samplesReadable: samples.every((sample) => sample.stats.width === 960 && sample.stats.height === 540 && sample.stats.nonPaperFraction >= .035 && sample.stats.darkFraction <= .32),
  sampledMotionVaries: Math.max(...sampleDiffs) >= .55,
};
const failures = Object.entries(checks).filter(([, passed]) => passed !== true).map(([key]) => key);
const report = {
  contract: "A1HSeries540pReviewMp4/v1",
  status: failures.length ? "BLOCKED" : "PASS",
  reviewOnly: true,
  finalRenderAllowed: false,
  compositionId,
  sourceBinding: {
    entryPoint: path.relative(root, entryPoint),
    entryPointSha256: hash(entryPoint),
    propsPath: path.relative(root, propsPath),
    propsSha256: hash(propsPath),
    audioPath,
    audioSha256: hash(audioPath),
  },
  renderProfile: {
    width: 960,
    height: 540,
    fps: 30,
    scale: .5,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 82,
    concurrency,
    frameRange: [0, props.durationInFrames ? props.durationInFrames - 1 : null],
    tailPadSec,
  },
  media: {
    silentVideo: {path: path.relative(root, silentVideoPath), sha256: hash(silentVideoPath), durationSec: silentDurationSec, width: silentVideoStream?.width, height: silentVideoStream?.height},
    reviewVideo: {path: path.relative(root, reviewVideoPath), sha256: hash(reviewVideoPath), bytes: fs.statSync(reviewVideoPath).size, durationSec: finalDurationSec, width: finalVideoStream?.width, height: finalVideoStream?.height, fps: finalVideoStream?.avg_frame_rate, audioCodec: finalAudioStream?.codec_name || null, audioChannels: finalAudioStream?.channels || null},
    sourceAudio: {durationSec: sourceAudioDurationSec, codec: sourceAudioStream?.codec_name || null, channels: sourceAudioStream?.channels || null},
    contactSheet: {path: path.relative(root, contactSheetPath), sha256: hash(contactSheetPath), width: 1440, height: 628},
  },
  samples: samples.map((sample) => ({label: sample.label, timeSec: sample.timeSec, file: path.relative(root, sample.file), sha256: sample.sha256, stats: sample.stats})),
  sampleDiffs,
  checks,
  failures,
  renderElapsedMs,
  nextAction: failures.length ? "repair-review-mp4" : "human-review-540p-mp4-before-resolve-export",
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (report.status === "PASS") {
  const currentPhase = {
    contract: "A1SystemProgressPhase/v1",
    phaseId,
    status: "complete",
    startedAt: new Date(Date.now() - renderElapsedMs).toISOString(),
    completedAt: new Date().toISOString(),
    systemCapability: {
      id: "h-series-540p-review-mp4-refresh",
      layer: "review-render",
      reusableDelta: "Refresh the H-series 540p review MP4 after entity-evidence renderer support so the live review movie matches the current renderer and official-asset patch.",
      userVisibleOutcome: "The 4311 system-line review page points at a refreshed H-series 540p MP4 with source audio.",
    },
    workspaceIsolation: priorPhase.workspaceIsolation || {
      worktree: root,
      branch: "codex/system-maturity-line-20260722",
      frontendPort: 4311,
      phaseRoot: ".codex-artifacts/system-progress-system-line",
      publicRoot: "apps/studio-next/public/generated/system-line",
      mainLinePortForbidden: 4310,
    },
    visualMaster: priorPhase.visualMaster || {
      id: "july1-retro-print-archive-wireframe-v1",
      referenceMode: "current H-series visual baseline",
    },
    proof: {
      reviewUrl: "http://127.0.0.1:4311/system-line-review",
      mp4ReportPath: path.relative(root, reportPath),
      videoPath: report.media.reviewVideo.path,
      videoSha256: report.media.reviewVideo.sha256,
      contactSheetPath: report.media.contactSheet.path,
      contactSheetSha256: report.media.contactSheet.sha256,
      sourcePropsSha256: report.sourceBinding.propsSha256,
      sourceAudioSha256: report.sourceBinding.audioSha256,
      checks: {
        reviewOnly: true,
        finalRenderBlocked: true,
        refreshedAfterEntityFrameProof: true,
        sourceAudioPresent: report.checks.audioPresent,
      },
      knownVerificationLimit: "This refresh proves the 540p review MP4 was rendered after the entity/motion frame proof. Visual aesthetic and per-scene review gates must be rerun after publishing.",
    },
    next: {
      recommended: {
        id: "rerun-h-series-visual-aesthetic-and-review-queue-after-mp4-refresh-v1",
        reason: "The review MP4 was refreshed. Next run the visual aesthetic audit, motion/audio audit, and 47-scene review queue against this refreshed artifact.",
        requiresExplicitApproval: false,
        riskTags: [
          "automatic-system-hardening",
          "review-render-only",
          "no-final-render-yet",
          "no-resolve-export-yet",
        ],
      },
    },
  };
  fs.writeFileSync(currentPhasePath, `${JSON.stringify(currentPhase, null, 2)}\n`);
}
console.log(JSON.stringify({
  ok: report.status === "PASS",
  status: report.status,
  video: report.media.reviewVideo,
  contactSheet: report.media.contactSheet,
  checks,
  failures,
  renderElapsedMs,
}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
