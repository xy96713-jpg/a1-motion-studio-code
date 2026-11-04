#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRoot = path.join(rendererRoot, "public");
const sourceRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/clean-studio-three-action-v1");
const outputRoot = path.join(root, "work/clean-writing-workbench-three-action-canary-v1");
const publicRelativeRoot = "proof-only/clean-writing-workbench-three-action-canary-v1";
const reportPath = path.join(sourceRoot, "report.json");
const actions = ["historyIsolation", "preferenceIntercept", "negativePreferenceRecord"];
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};

const trackFromTelemetry = (telemetry) => {
  const moves = telemetry.events.filter((event) => event.type === "pointermove" && Number.isFinite(event.x) && Number.isFinite(event.y));
  const clicks = telemetry.events.filter((event) => event.type === "click" && Number.isFinite(event.x) && Number.isFinite(event.y));
  if (!moves.length || !clicks.length) throw new Error(`telemetry incomplete:${telemetry.actionId}`);
  return {
    waypoints: moves.map(({tMs, x, y}) => ({tMs, x, y})),
    clicks: clicks.map(({tMs, x, y}) => ({atMs: tMs, x, y, kind: "press"})),
  };
};

async function main() {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.status !== "PASS" || report.admissionBoundary?.captureOnly !== true || report.admissionBoundary?.workspaceMutated !== false) {
    throw new Error("clean writing-workbench capture report is not capture-only PASS");
  }
  await Promise.all([
    fsp.mkdir(outputRoot, {recursive: true}),
    fsp.mkdir(path.join(publicRoot, publicRelativeRoot), {recursive: true}),
  ]);
  await Promise.all(actions.map((actionId) => fsp.copyFile(
    path.join(sourceRoot, `${actionId}.mp4`),
    path.join(publicRoot, publicRelativeRoot, `${actionId}.mp4`),
  )));

  const require = createRequire(path.join(rendererRoot, "package.json"));
  const {bundle} = require("@remotion/bundler");
  const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const rendered = [];
  try {
    for (const actionId of actions) {
      const capture = report.captures.find((item) => item.actionId === actionId);
      if (!capture) throw new Error(`capture missing:${actionId}`);
      const sourceVideo = path.join(sourceRoot, `${actionId}.mp4`);
      const telemetryPath = path.join(sourceRoot, `${actionId}-pointer-telemetry.json`);
      const telemetry = JSON.parse(fs.readFileSync(telemetryPath, "utf8"));
      const track = trackFromTelemetry(telemetry);
      const publicRelativeVideo = `${publicRelativeRoot}/${actionId}.mp4`;
      const durationMs = Math.round(capture.durationSeconds * 1000);
      const props = {
        contract: "A1PointerTelemetryCanaryRender/v1",
        sourceVideoUri: publicRelativeVideo,
        durationMs,
        telemetryLeadMs: Math.max(600, Math.round((durationMs - telemetry.durationMs) / 2)),
        waypoints: track.waypoints,
        clicks: track.clicks,
        clickSoundUri: "generated/system-line/ui-sfx/click-soft.wav",
        cameraEnabled: actionId !== "historyIsolation",
      };
      const composition = await selectComposition({serveUrl, id: "A1PointerTelemetryCanaryV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
      const output = path.join(outputRoot, `${actionId}-animated.mp4`);
      await renderMedia({serveUrl, composition, inputProps: props, outputLocation: output, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: false, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const still = path.join(outputRoot, `${actionId}-hold.png`);
      const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(composition.durationInFrames * .72)));
      await renderStill({serveUrl, composition, inputProps: props, frame, output: still, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      rendered.push({actionId, output, still, durationMs, telemetryLeadMs: props.telemetryLeadMs, waypointCount: track.waypoints.length, clickCount: track.clicks.length, sourceVideoSha256: sha256(sourceVideo), telemetrySha256: sha256(telemetryPath)});
    }
  } finally {
    await browser.close({silent: true});
  }

  const concatList = path.join(outputRoot, "concat.txt");
  await fsp.writeFile(concatList, `${rendered.map(({output}) => `file '${output.replaceAll("'", "'\\''")}'`).join("\n")}\n`);
  const combined = path.join(outputRoot, "clean-writing-workbench-three-action-animated-canary.mp4");
  run(path.join(root, ".tools/bin/ffmpeg"), ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c", "copy", combined]);

  const thumbs = await Promise.all(rendered.map(({still}) => sharp(still).resize(640, 360, {fit: "cover"}).png().toBuffer()));
  const contactSheet = path.join(outputRoot, "clean-writing-workbench-three-action-contact-sheet.png");
  await sharp({create: {width: 1920, height: 360, channels: 3, background: "#dfe5e2"}})
    .composite(thumbs.map((input, index) => ({input, left: index * 640, top: 0})))
    .png()
    .toFile(contactSheet);

  const manifest = {
    contract: "A1CleanWritingWorkbenchThreeActionCanary/v1",
    status: "PROOF_ONLY_PASS",
    sourceReport: {path: path.relative(root, reportPath), sha256: sha256(reportPath)},
    actions: rendered.map((item) => ({...item, output: path.relative(root, item.output), outputSha256: sha256(item.output), still: path.relative(root, item.still), stillSha256: sha256(item.still)})),
    output: {path: path.relative(root, combined), sha256: sha256(combined)},
    contactSheet: {path: path.relative(root, contactSheet), sha256: sha256(contactSheet)},
    boundary: {proofOnly: true, productionWorkspaceMutation: false, currentPhaseMutation: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
  };
  const manifestPath = path.join(outputRoot, "manifest.json");
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({...manifest, manifestSha256: sha256(manifestPath)}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
