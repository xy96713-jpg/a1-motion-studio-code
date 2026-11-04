#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const root = process.cwd();
const phaseId = "editorial-evidence-kinetic-system-v1";
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/index.ts");
const propsPath = path.join(rendererRoot, "src/generated/editorialEvidenceKineticSystemProofProps.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const framesRoot = path.join(artifactRoot, "frames");
const publicFramesRoot = path.join(publicRoot, "frames");
const outputs = {
  video: path.join(artifactRoot, "editorial-evidence-kinetic-system-proof.mp4"),
  poster: path.join(artifactRoot, "editorial-evidence-kinetic-system-poster.png"),
  contactSheet: path.join(artifactRoot, "editorial-evidence-kinetic-system-contact-sheet.png"),
  report: path.join(artifactRoot, "report.json"),
};
const publicOutputs = Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, key === "report" ? path.join(publicRoot, "report.json") : path.join(publicRoot, path.basename(value))]));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * 0.25)));
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed:${result.stderr || result.stdout || result.error?.message || result.status}`);
  return result.stdout;
};
const escapeXml = (value) => String(value).replace(/[<>&'"]/gu, (character) => ({"<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"})[character]);

function momentsFor(props) {
  let frameStart = 0;
  return props.items.map((item) => {
    const duration = Math.max(1, Math.round(Number(item.durationSec) * Number(props.fps)));
    const role = item.templateProps?.aestheticDirection?.sceneRole || "shot";
    const record = {id: item.id, frame: frameStart + Math.min(duration - 1, Math.round(duration * 0.62)), label: `${item.id} · ${role}`};
    frameStart += duration;
    return record;
  });
}

async function buildContactSheet(frameRecords, durationSec) {
  const tileWidth = 320;
  const tileHeight = 180;
  const labelHeight = 36;
  const columns = 4;
  const rows = Math.ceil(frameRecords.length / columns);
  const width = columns * tileWidth;
  const headerHeight = 88;
  const height = headerHeight + rows * (tileHeight + labelHeight);
  const layers = [{input: Buffer.from(`<svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#F1EEE3"/><text x="18" y="36" fill="#101113" font-family="Arial,sans-serif" font-size="25" font-weight="900">System aesthetic proof · ${durationSec.toFixed(1)} sec</text><text x="18" y="65" fill="#625f58" font-family="Arial,sans-serif" font-size="13">8 shots · semantic five-layer direction · NASA verified source · review only</text></svg>`), left: 0, top: 0}];
  for (const [index, item] of frameRecords.entries()) {
    const left = index % columns * tileWidth;
    const top = headerHeight + Math.floor(index / columns) * (tileHeight + labelHeight);
    layers.push({input: await sharp(item.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    layers.push({input: Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101113"/><text x="12" y="24" fill="#F8F5EA" font-family="Arial,sans-serif" font-size="12" font-weight="700">${escapeXml(item.label)} · ${item.frame}</text></svg>`), left, top: top + tileHeight});
  }
  await sharp({create: {width, height, channels: 4, background: "#F1EEE3"}}).composite(layers).png().toFile(outputs.contactSheet);
  return {width, height};
}

async function main() {
  for (const file of [entryPoint, propsPath, outputs.report]) if (!fs.existsSync(file)) throw new Error(`aesthetic-system-required-file-missing:${file}`);
  for (const dir of [artifactRoot, publicRoot, framesRoot, publicFramesRoot]) fs.mkdirSync(dir, {recursive: true});
  const props = readJson(propsPath);
  const report = readJson(outputs.report);
  const moments = momentsFor(props);
  const frameRecords = [];
  const failures = [];
  const startedAt = Date.now();
  let browser;
  let probe;
  let audioTrackPresent = false;
  try {
    const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
    browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
    const composition = await selectComposition({serveUrl, id: "ArticleTemplateTimeline", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    for (const moment of moments) {
      const framePath = path.join(framesRoot, `${moment.id}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame: moment.frame, output: framePath, imageFormat: "png", scale: 0.5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const publicPath = path.join(publicFramesRoot, path.basename(framePath));
      fs.copyFileSync(framePath, publicPath);
      frameRecords.push({...moment, path: framePath, publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(framePath)}`, sha256: sha256(framePath)});
    }
    fs.copyFileSync(frameRecords[0].path, outputs.poster);
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputs.video, frameRange: [0, composition.durationInFrames - 1], scale: 0.5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 88, concurrency, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    probe = JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", outputs.video]));
  } catch (error) {
    failures.push(error?.message || String(error));
  } finally {
    if (browser) await browser.close({silent: true});
  }

  let sheet = null;
  if (!failures.length) {
    const durationSec = Number(probe.format?.duration || 0);
    const stream = probe.streams.find((item) => item.codec_type === "video");
    const audio = probe.streams.find((item) => item.codec_type === "audio");
    audioTrackPresent = Boolean(audio);
    if (stream?.width !== 960 || stream?.height !== 540) failures.push("aesthetic-system-video-dimensions-invalid");
    if (Math.abs(durationSec - props.items.reduce((sum, item) => sum + Number(item.durationSec), 0)) > 0.3) failures.push("aesthetic-system-video-duration-mismatch");
    sheet = await buildContactSheet(frameRecords, durationSec);
    for (const key of ["video", "poster", "contactSheet"]) fs.copyFileSync(outputs[key], publicOutputs[key]);
  }

  const finalReport = {
    ...report,
    status: failures.length ? "BLOCKED" : "READY_FOR_DIRECT_VISUAL_REVIEW",
    pilot: {
      ...report.pilot,
      video: failures.length ? {...report.pilot.video, status: "render-failed"} : {publicUrl: report.pilot.video.publicUrl, status: "rendered", sha256: sha256(outputs.video), width: 960, height: 540, durationSec: Number(Number(probe.format.duration).toFixed(3)), audioMode: props.audioMode, containerAudioTrackPresent: audioTrackPresent},
      poster: failures.length ? {...report.pilot.poster, status: "render-failed"} : {publicUrl: report.pilot.poster.publicUrl, status: "rendered", sha256: sha256(outputs.poster), width: 960, height: 540},
      contactSheet: failures.length ? {...report.pilot.contactSheet, status: "render-failed"} : {publicUrl: report.pilot.contactSheet.publicUrl, status: "rendered", sha256: sha256(outputs.contactSheet), ...sheet},
    },
    frames: frameRecords,
    renderProfile: {compositionId: "ArticleTemplateTimeline", fps: props.fps, width: 960, height: 540, concurrency, elapsedMs: Date.now() - startedAt},
    failures,
    nextAction: failures.length ? "repair-system-aesthetic-proof" : "direct-review-system-aesthetic-proof-before-promoting-profile",
  };
  for (const output of [outputs.report, publicOutputs.report]) fs.writeFileSync(output, `${JSON.stringify(finalReport, null, 2)}\n`);
  console.log(JSON.stringify({status: finalReport.status, failures, summary: finalReport.summary, video: finalReport.pilot.video, contactSheet: finalReport.pilot.contactSheet, elapsedMs: finalReport.renderProfile.elapsedMs}, null, 2));
  if (failures.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
