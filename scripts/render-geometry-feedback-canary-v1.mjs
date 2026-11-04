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
const reportPath = path.resolve(root, process.argv[2] || "");
const outputPath = path.resolve(root, process.argv[3] || "");
if (!reportPath || !outputPath || !fs.existsSync(reportPath)) throw new Error("usage: render-geometry-feedback-canary-v1 <capture-report.json> <output.mp4>");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report.contract !== "A1GenericBrowserScreenProof/v1" || report.geometryTruth?.status !== "PASS_REVIEW_ONLY") throw new Error("geometry-feedback-capture-report-invalid");
const sourcePath = path.resolve(root, report.output.path);
if (!fs.existsSync(sourcePath)) throw new Error("geometry-feedback-source-missing");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (sha256(sourcePath) !== report.output.sha256) throw new Error("geometry-feedback-source-sha-mismatch");
const publicRelative = "proof-only/geometry-feedback-v1/clean-source.mp4";
const publicVideoPath = path.join(publicRoot, publicRelative);
await fsp.mkdir(path.dirname(publicVideoPath), {recursive: true});
await fsp.copyFile(sourcePath, publicVideoPath);

const waypoints = report.cursorTelemetry.moves.map((item) => ({tMs: item.tMs, x: item.x, y: item.y}));
const sourceClicks = report.cursorTelemetry.clicks.filter((item) => item.down === true);
const clicks = sourceClicks.slice(-1).map((item) => ({atMs: item.tMs, x: item.x, y: item.y, kind: "press"}));
if (waypoints.length < 2 || !clicks.length) throw new Error("geometry-feedback-telemetry-required");
const nextNativeStateMs = report.events.find((item) => item.name === "result_hold")?.tMs ?? null;
const feedbackEndMs = Number.isFinite(nextNativeStateMs) ? Math.max(clicks[0].atMs + 100, nextNativeStateMs - 24) : clicks[0].atMs + 180;
const clickRippleDurationMs = Math.min(240, Math.max(100, feedbackEndMs - clicks[0].atMs));
const durationMs = report.output.durationMs;
const props = {
  contract: "A1PointerTelemetryCanaryRender/v1",
  sourceVideoUri: publicRelative,
  durationMs,
  telemetryLeadMs: 0,
  waypoints,
  clicks,
  cameraEnabled: false,
  cameraMode: "click-pulse",
  cameraPeakScale: 1,
  clickRippleColor: "rgba(89,125,255,.78)",
  clickRippleDurationMs,
  cursorPressScaleAmount: .06,
  showFrame: false,
};
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: publicRoot, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
const frameRecords = [];
try {
  const composition = await selectComposition({serveUrl, id: "A1PointerTelemetryCanaryV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  await fsp.mkdir(path.dirname(outputPath), {recursive: true});
  await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  for (const [index, localMs] of [0, 1700, 4_750, 4_900, 5_300].map((value, index) => [index, value])) {
    const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(localMs / 1000 * composition.fps)));
    const file = `${outputPath}.frame-${String(index).padStart(2, "0")}.png`;
    await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    frameRecords.push({localMs, frame, path: path.relative(root, file), sha256: sha256(file)});
  }
} finally {
  await browser.close({silent: true});
}
const manifest = {
  contract: "A1GeometryFeedbackCanary/v1",
  status: "PROOF_ONLY_PASS",
  source: {path: report.output.path, sha256: report.output.sha256, geometryTruthSha256: report.geometryTruth.geometryTruthSha256},
  output: {path: path.relative(root, outputPath), sha256: sha256(outputPath), width: 1920, height: 1080, fps: 60, durationMs},
  feedback: {source: "SAME_CAPTURE_TELEMETRY", sourceClickCount: sourceClicks.length, decisiveClickCount: clicks.length, cameraMode: "NONE", cameraPeakScale: props.cameraPeakScale, clickRippleDurationMs: props.clickRippleDurationMs, cursorPressScaleAmount: props.cursorPressScaleAmount, nextNativeStateMs, feedbackEndMs, timingBinding: "ENDS_BEFORE_NATIVE_STATE"},
  frames: frameRecords,
  boundary: {proofOnly: true, productionAdmission: false, currentStoryboardMutationPerformed: false},
};
manifest.manifestSha256 = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
await fsp.writeFile(`${outputPath}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
