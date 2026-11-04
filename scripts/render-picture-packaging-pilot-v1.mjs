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
const phaseId = "picture-packaging-pilot-v1";
const compositionId = "A1PicturePackagingPilot";
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/index.ts");
const propsPath = path.join(rendererRoot, "src/generated/picturePackagingPilotProps.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const framesRoot = path.join(artifactRoot, "frames");
const publicFramesRoot = path.join(publicRoot, "frames");
const outputs = {
  video: path.join(artifactRoot, "picture-packaging-pilot.mp4"),
  poster: path.join(artifactRoot, "picture-packaging-poster.png"),
  contactSheet: path.join(artifactRoot, "picture-packaging-contact-sheet.png"),
  report: path.join(artifactRoot, "report.json"),
};
const publicOutputs = {
  video: path.join(publicRoot, path.basename(outputs.video)),
  poster: path.join(publicRoot, path.basename(outputs.poster)),
  contactSheet: path.join(publicRoot, path.basename(outputs.contactSheet)),
  report: path.join(publicRoot, "report.json"),
};
const moments = [
  {id: "question", frame: 72, label: "质疑进入排版场"},
  {id: "language-break", frame: 205, label: "语言判断断裂"},
  {id: "unequal-progress", frame: 330, label: "能力与表达分叉"},
  {id: "lost-meaning", frame: 440, label: "中文失去重点"},
  {id: "rejected-draft", frame: 548, label: "完成度被人工否决"},
];
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * 0.25)));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed:${result.stderr || result.stdout || result.error?.message || result.status}`);
  return result.stdout;
};

const labelSvg = (label, frame) => Buffer.from(`<svg width="320" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="40" fill="#17191b"/><text x="13" y="26" fill="#f1efe6" font-family="Arial,sans-serif" font-size="13" font-weight="700">${label} · ${frame}</text></svg>`);

async function contactSheet(frameRecords) {
  const tileWidth = 320;
  const tileHeight = 180;
  const labelHeight = 40;
  const columns = 3;
  const rows = Math.ceil(frameRecords.length / columns);
  const width = columns * tileWidth;
  const headerHeight = 88;
  const height = headerHeight + rows * (tileHeight + labelHeight);
  const layers = [{input: Buffer.from(`<svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f1efe6"/><text x="18" y="36" fill="#17191b" font-family="Arial,sans-serif" font-size="25" font-weight="900">Picture packaging pilot · 19.3 sec</text><text x="18" y="65" fill="#666" font-family="Arial,sans-serif" font-size="13">Unplaced full-frame insert. User owns host, recording and cut timing.</text></svg>`), left: 0, top: 0}];
  for (const [index, item] of frameRecords.entries()) {
    const left = (index % columns) * tileWidth;
    const top = headerHeight + Math.floor(index / columns) * (tileHeight + labelHeight);
    layers.push({input: await sharp(item.path).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    layers.push({input: labelSvg(item.label, item.frame), left, top: top + tileHeight});
  }
  await sharp({create: {width, height, channels: 4, background: "#f1efe6"}}).composite(layers).png().toFile(outputs.contactSheet);
  return {width, height};
}

async function main() {
  for (const file of [entryPoint, propsPath, outputs.report]) if (!fs.existsSync(file)) throw new Error(`picture-packaging-required-file-missing:${file}`);
  for (const dir of [artifactRoot, publicRoot, framesRoot, publicFramesRoot]) fs.mkdirSync(dir, {recursive: true});
  const props = readJson(propsPath);
  const report = readJson(outputs.report);
  const frameRecords = [];
  const failures = [];
  let browser;
  let composition;
  const startedAt = Date.now();
  try {
    const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
    browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
    composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    for (const moment of moments) {
      const framePath = path.join(framesRoot, `${moment.id}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame: moment.frame, output: framePath, imageFormat: "png", scale: 0.5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const publicPath = path.join(publicFramesRoot, path.basename(framePath));
      fs.copyFileSync(framePath, publicPath);
      frameRecords.push({...moment, path: framePath, publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(framePath)}`, sha256: sha256(framePath)});
    }
    fs.copyFileSync(frameRecords[0].path, outputs.poster);
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputs.video, frameRange: [0, props.durationInFrames - 1], scale: 0.5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 88, concurrency, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  } catch (error) {
    failures.push(error?.message || String(error));
  } finally {
    if (browser) await browser.close({silent: true});
  }

  let sheet = null;
  let probe = null;
  if (!failures.length) {
    sheet = await contactSheet(frameRecords);
    for (const key of ["video", "poster", "contactSheet"]) fs.copyFileSync(outputs[key], publicOutputs[key]);
    probe = JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", outputs.video]));
    const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
    const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
    if (videoStream?.width !== 960 || videoStream?.height !== 540) failures.push("picture-packaging-video-dimensions-invalid");
    if (!audioStream) failures.push("picture-packaging-video-audio-missing");
    if (Math.abs(Number(probe.format?.duration || 0) - props.durationInFrames / props.fps) > 0.25) failures.push("picture-packaging-video-duration-mismatch");
  }

  const finalReport = {
    ...report,
    status: failures.length ? "BLOCKED" : "READY_FOR_DIRECT_REVIEW",
    pilot: {
      ...report.pilot,
      video: failures.length ? {...report.pilot.video, status: "render-failed"} : {publicUrl: `/generated/system-line/${phaseId}/picture-packaging-pilot.mp4`, status: "rendered", sha256: sha256(outputs.video), width: 960, height: 540, durationSec: Number(Number(probe.format.duration).toFixed(3)), hasAudio: true},
      poster: failures.length ? {...report.pilot.poster, status: "render-failed"} : {publicUrl: `/generated/system-line/${phaseId}/picture-packaging-poster.png`, status: "rendered", sha256: sha256(outputs.poster), width: 960, height: 540},
      contactSheet: failures.length ? {...report.pilot.contactSheet, status: "render-failed"} : {publicUrl: `/generated/system-line/${phaseId}/picture-packaging-contact-sheet.png`, status: "rendered", sha256: sha256(outputs.contactSheet), ...sheet},
    },
    frames: frameRecords,
    renderProfile: {compositionId, fps: props.fps, durationInFrames: props.durationInFrames, width: 960, height: 540, concurrency, elapsedMs: Date.now() - startedAt},
    failures,
    nextAction: failures.length ? "repair-picture-packaging-pilot" : "direct-review-picture-packaging-pilot-before-any-timeline-placement",
  };
  for (const output of [outputs.report, publicOutputs.report]) fs.writeFileSync(output, `${JSON.stringify(finalReport, null, 2)}\n`);
  console.log(JSON.stringify({status: finalReport.status, failures, video: finalReport.pilot.video, contactSheet: finalReport.pilot.contactSheet, elapsedMs: finalReport.renderProfile.elapsedMs}, null, 2));
  if (failures.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
