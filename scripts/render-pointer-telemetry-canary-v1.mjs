#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const workDir = path.join(root, "work/cursor-telemetry-capture-v1");
const sourceReportPath = path.join(workDir, "report.json");
const sourceTrackPath = path.join(workDir, "smoothed-cursor-track.json");
const sourceVideoPath = path.join(workDir, "actual-pointer-capture-trimmed.mp4");
const publicRelative = "proof-only/cursor-telemetry-capture-v1/actual-pointer-capture-trimmed.mp4";
const publicVideoPath = path.join(publicRoot, publicRelative);
const outputPath = path.join(workDir, "actual-telemetry-replayed-cursor.mp4");
const contactPath = path.join(workDir, "actual-telemetry-replayed-cursor-contact-sheet.png");
const manifestPath = path.join(workDir, "render-manifest.json");
const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const pointAt = (points, tMs) => {
  if (tMs <= points[0].tMs) return points[0];
  if (tMs >= points.at(-1).tMs) return points.at(-1);
  const index = points.findIndex((point) => point.tMs > tMs);
  const from = points[index - 1];
  const to = points[index];
  const progress = (tMs - from.tMs) / Math.max(1, to.tMs - from.tMs);
  return {x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress};
};

const auditCursorMotion = (track) => {
  let previous = pointAt(track.waypoints, 0);
  let previousStep = 0;
  let maxStep = 0;
  let maxAcceleration = 0;
  for (let tMs = 1000 / 60; tMs <= track.waypoints.at(-1).tMs; tMs += 1000 / 60) {
    const current = pointAt(track.waypoints, tMs);
    const step = Math.hypot(current.x - previous.x, current.y - previous.y);
    maxStep = Math.max(maxStep, step);
    maxAcceleration = Math.max(maxAcceleration, Math.abs(step - previousStep));
    previous = current;
    previousStep = step;
  }
  const maxClickDetach = Math.max(0, ...track.clicks.map((click) => {
    const point = pointAt(track.waypoints, click.atMs);
    return Math.hypot(point.x - click.x, point.y - click.y);
  }));
  if (maxStep > 0.035) throw new Error(`captured pointer max step too high:${maxStep}`);
  if (maxAcceleration > 0.018) throw new Error(`captured pointer acceleration too high:${maxAcceleration}`);
  if (maxClickDetach > 0.035) throw new Error(`captured pointer click detached:${maxClickDetach}`);
  return {status: "PASS", maxStep, maxAcceleration, maxClickDetach, thresholds: {maxStep: .035, maxAcceleration: .018, maxClickDetach: .035}};
};

async function main() {
  const sourceReport = JSON.parse(fs.readFileSync(sourceReportPath, "utf8"));
  const track = JSON.parse(fs.readFileSync(sourceTrackPath, "utf8"));
  if (sourceReport.status !== "PASS" || track.contract !== "A1SmoothedCursorTrack/v1") throw new Error("pointer telemetry source is not ready");
  if (sha256(sourceVideoPath) !== sourceReport.video.sha256) throw new Error("pointer telemetry source video SHA mismatch");
  if (sha256(sourceTrackPath) !== sourceReport.cursorTrack.sha256) throw new Error("pointer telemetry cursor track SHA mismatch");
  const motionAudit = auditCursorMotion(track);
  await fsp.mkdir(path.dirname(publicVideoPath), {recursive: true});
  await fsp.copyFile(sourceVideoPath, publicVideoPath);

  const durationMs = Math.round(sourceReport.video.durationSeconds * 1000);
  const props = {
    contract: "A1PointerTelemetryCanaryRender/v1",
    sourceVideoUri: publicRelative,
    durationMs,
    telemetryLeadMs: 450,
    waypoints: track.waypoints,
    clicks: track.clicks,
    clickSoundUri: "generated/system-line/ui-sfx/click-soft.wav",
  };
  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const frameRecords = [];
  try {
    const composition = await selectComposition({serveUrl, id: "A1PointerTelemetryCanaryV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: false, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const samples = [
      {label: "cursor-entry", localMs: 700},
      {label: "curved-approach", localMs: 1150},
      {label: "real-click", localMs: 1810},
      {label: "typed-request-hold", localMs: 3000},
    ];
    for (const sample of samples) {
      const frame = Math.min(composition.durationInFrames - 1, Math.round((sample.localMs / 1000) * composition.fps));
      const file = path.join(workDir, `${sample.label}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      frameRecords.push({...sample, frame, path: path.relative(root, file), sha256: sha256(file)});
    }
  } finally {
    await browser.close({silent: true});
  }

  const thumbnails = await Promise.all(frameRecords.map((item) => sharp(path.join(root, item.path)).resize(480, 270, {fit: "cover"}).png().toBuffer()));
  await sharp({create: {width: 1920, height: 270, channels: 3, background: "#dfe5e2"}})
    .composite(thumbnails.map((input, index) => ({input, left: index * 480, top: 0})))
    .png()
    .toFile(contactPath);

  const manifest = {
    contract: "A1PointerTelemetryCanaryRenderManifest/v1",
    status: "PROOF_ONLY_PASS",
    sourceTelemetry: {path: sourceReport.telemetry.path, sha256: sourceReport.telemetry.sha256, eventCount: sourceReport.telemetry.eventCount},
    sourceCursorTrack: {path: sourceReport.cursorTrack.path, sha256: sourceReport.cursorTrack.sha256, waypointCount: sourceReport.cursorTrack.waypointCount, clickCount: sourceReport.cursorTrack.clickCount},
    output: {path: path.relative(root, outputPath), sha256: sha256(outputPath), width: 1920, height: 1080, fps: 60, durationMs},
    contactSheet: {path: path.relative(root, contactPath), sha256: sha256(contactPath), frames: frameRecords},
    cursorProvenance: {mode: "CAPTURED_POINTER_EVENT", source: "playwright-real-dom-event", independentlyRendered: true},
    motionAudit,
    boundary: {proofOnly: true, externalModelCalls: 0, productionWorkspaceMutation: false, currentPhaseMutation: false, userVisualApproval: "NOT_APPROVED", productionAdmission: false},
  };
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({...manifest, manifestSha256: sha256(manifestPath)}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
