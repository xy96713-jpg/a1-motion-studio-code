#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

const root = process.cwd();
const phaseId = "editorial-documentary-reset-v1";
const compositionId = "A1EditorialDocumentaryPilot";
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/index.ts");
const propsPath = path.join(rendererRoot, "src/generated/editorialDocumentaryPilotProps.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const framesRoot = path.join(artifactRoot, "frames");
const publicFramesRoot = path.join(publicRoot, "frames");
const videoPath = path.join(artifactRoot, "editorial-documentary-pilot.mp4");
const publicVideoPath = path.join(publicRoot, "editorial-documentary-pilot.mp4");
const posterPath = path.join(artifactRoot, "editorial-documentary-poster.png");
const publicPosterPath = path.join(publicRoot, "editorial-documentary-poster.png");
const contactSheetPath = path.join(artifactRoot, "editorial-documentary-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "editorial-documentary-contact-sheet.png");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const frameMoments = [
  {id: "document-entry", frame: 72, label: "真实文稿进入"},
  {id: "selection-memory", frame: 248, label: "划选与偏好"},
  {id: "paragraph-assist", frame: 430, label: "上下文补段"},
  {id: "presentation-question", frame: 842, label: "演示到质疑"},
  {id: "ai-taste", frame: 1115, label: "不说人话"},
  {id: "problem-remains", frame: 1260, label: "问题没有消失"},
];
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * 0.25)));

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout || result.error?.message || result.status}`);
  return result.stdout;
};

function buildLabel(label, frame) {
  return Buffer.from(`<svg width="480" height="44" xmlns="http://www.w3.org/2000/svg"><rect width="480" height="44" fill="#17191b"/><text x="16" y="28" fill="#f2f0e8" font-family="Arial,sans-serif" font-size="15" font-weight="700">${label} · frame ${frame}</text></svg>`);
}

async function buildContactSheet(frameRecords) {
  const tileWidth = 480;
  const tileHeight = 270;
  const labelHeight = 44;
  const columns = 2;
  const rows = Math.ceil(frameRecords.length / columns);
  const width = columns * tileWidth;
  const headerHeight = 92;
  const height = headerHeight + rows * (tileHeight + labelHeight);
  const composites = [{input: Buffer.from(`<svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f2f0e8"/><text x="20" y="38" fill="#17191b" font-family="Arial,sans-serif" font-size="26" font-weight="900">Editorial documentary pilot · 43.2 sec</text><text x="20" y="68" fill="#666" font-family="Arial,sans-serif" font-size="14">Real Gaotai runtime, real manuscript, original audio. No generated artwork, no card-wall route.</text></svg>`), left: 0, top: 0}];
  for (const [index, record] of frameRecords.entries()) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const left = col * tileWidth;
    const top = headerHeight + row * (tileHeight + labelHeight);
    composites.push({input: await sharp(record.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    composites.push({input: buildLabel(record.label, record.frame), left, top: top + tileHeight});
  }
  await sharp({create: {width, height, channels: 4, background: "#f2f0e8"}}).composite(composites).png().toFile(contactSheetPath);
  return {width, height};
}

async function main() {
  for (const required of [entryPoint, propsPath, reportPath]) {
    if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
  }
  fs.mkdirSync(framesRoot, {recursive: true});
  fs.mkdirSync(publicFramesRoot, {recursive: true});
  fs.mkdirSync(publicRoot, {recursive: true});
  const props = readJson(propsPath);
  const report = readJson(reportPath);
  const failures = [];
  let browser;
  const startedAt = Date.now();
  const frameRecords = [];
  let composition;

  try {
    const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
    browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
    composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    for (const moment of frameMoments) {
      const output = path.join(framesRoot, `${moment.id}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame: moment.frame, output, imageFormat: "png", scale: 0.5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const publicOutput = path.join(publicFramesRoot, path.basename(output));
      fs.copyFileSync(output, publicOutput);
      frameRecords.push({...moment, path: output, publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(output)}`, sha256: sha256(output)});
    }
    fs.copyFileSync(frameRecords[0].path, posterPath);
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      outputLocation: videoPath,
      frameRange: [0, props.durationInFrames - 1],
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
    });
  } catch (error) {
    failures.push(error?.message || String(error));
  } finally {
    if (browser) await browser.close({silent: true});
  }

  let contactSheet = null;
  let probe = null;
  if (!failures.length) {
    contactSheet = await buildContactSheet(frameRecords);
    fs.copyFileSync(videoPath, publicVideoPath);
    fs.copyFileSync(posterPath, publicPosterPath);
    fs.copyFileSync(contactSheetPath, publicContactSheetPath);
    probe = JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", videoPath]));
    const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
    const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
    if (!videoStream || videoStream.width !== 960 || videoStream.height !== 540) failures.push("rendered-video-dimensions-invalid");
    if (!audioStream) failures.push("rendered-video-audio-missing");
    if (Math.abs(Number(probe.format?.duration || 0) - props.durationInFrames / props.fps) > 0.25) failures.push("rendered-video-duration-mismatch");
  }

  const finalReport = {
    ...report,
    status: failures.length ? "BLOCKED" : "READY_FOR_DIRECT_REVIEW",
    pilot: {
      ...report.pilot,
      video: failures.length ? {...report.pilot.video, status: "render-failed"} : {publicUrl: `/generated/system-line/${phaseId}/editorial-documentary-pilot.mp4`, status: "rendered", sha256: sha256(videoPath), width: 960, height: 540, durationSec: Number(Number(probe.format.duration).toFixed(3)), hasAudio: true},
      poster: failures.length ? {...report.pilot.poster, status: "render-failed"} : {publicUrl: `/generated/system-line/${phaseId}/editorial-documentary-poster.png`, status: "rendered", sha256: sha256(posterPath), width: 960, height: 540},
      contactSheet: failures.length ? {...report.pilot.contactSheet, status: "render-failed"} : {publicUrl: `/generated/system-line/${phaseId}/editorial-documentary-contact-sheet.png`, status: "rendered", sha256: sha256(contactSheetPath), ...contactSheet},
    },
    frames: frameRecords,
    renderProfile: {compositionId, fps: props.fps, durationInFrames: props.durationInFrames, width: 960, height: 540, concurrency, elapsedMs: Date.now() - startedAt},
    failures,
    nextAction: failures.length ? "repair-editorial-documentary-pilot-render" : "direct-review-editorial-documentary-pilot-before-system-rebuild",
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`);
  fs.writeFileSync(publicReportPath, `${JSON.stringify(finalReport, null, 2)}\n`);
  console.log(JSON.stringify({status: finalReport.status, failures, video: finalReport.pilot.video, contactSheet: finalReport.pilot.contactSheet, elapsedMs: finalReport.renderProfile.elapsedMs}, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
