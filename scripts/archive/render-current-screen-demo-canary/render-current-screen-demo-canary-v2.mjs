#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const traceRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const outputRoot = path.join(root, "work/current-screen-demo-v2-canary");
const sourcePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/source-cache/causal-writing-workbench-v1/causal-writing-workbench-real.mp4");
const oldPath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-screen-demo-lane-v1/ed-02-operation-canary-960x540.mp4");
const outputPath = path.join(outputRoot, "ed-02-operation-v2-960x540.mp4");
const comparisonPath = path.join(outputRoot, "ed-02-operation-v1-v2-comparison.mp4");
const contactPath = path.join(outputRoot, "ed-02-operation-v2-hold-contact-sheet.png");
const manifestPath = path.join(outputRoot, "manifest.json");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  fs.mkdirSync(outputRoot, {recursive: true});
  const trace = JSON.parse(fs.readFileSync(path.join(traceRoot, "interaction-trace.json"), "utf8"));
  const sourceSha256 = sha256File(sourcePath);
  trace.source.captureEvidenceSha256 = sourceSha256;
  trace.source.durationMs = 9440;
  delete trace.sha256;
  trace.sha256 = sha256Value(trace);
  const fps = 30;
  const startMs = trace.timeline.startMs;
  const endMs = trace.timeline.endMs;
  const durationInFrames = Math.ceil(((endMs - startMs) / 1000) * fps);
  const props = {trace, width: 960, height: 540, fps, durationInFrames};
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const reviewFrames = [];
  try {
    const composition = await selectComposition({serveUrl, id: "A1OperationPackagingProofV2", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const stableSamples = [
      {state: "sentence-hold", sourceMs: Math.min(trace.events[0].endMs - 700, trace.events[0].startMs + 1350)},
      {state: "panel-hold", sourceMs: trace.events[2].startMs + 240},
      {state: "result-hold", sourceMs: trace.events[4].startMs + 520},
    ];
    for (const sample of stableSamples) {
      const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round((sample.sourceMs - startMs) / (endMs - startMs) * (durationInFrames - 1))));
      const file = path.join(outputRoot, `${sample.state}-${String(frame).padStart(3, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      reviewFrames.push({...sample, frame, file: path.basename(file), sha256: sha256File(file)});
    }
  } finally {
    await browser.close({silent: true});
  }
  const thumbs = await Promise.all(reviewFrames.map((item) => sharp(path.join(outputRoot, item.file)).resize(480, 270, {fit: "cover"}).png().toBuffer()));
  await sharp({create: {width: 1440, height: 270, channels: 3, background: "#090b0c"}}).composite(thumbs.map((input, index) => ({input, left: index * 480, top: 0}))).png().toFile(contactPath);
  execFileSync(ffmpegPath, ["-y", "-i", oldPath, "-i", outputPath, "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]", "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", comparisonPath], {stdio: "pipe"});
  const manifest = {
    contract: "A1CurrentScreenDemoCanaryV2/v1",
    status: "PROOF_ONLY_READY_FOR_ACTUAL_PIXEL_REVIEW",
    shotId: "ED-02",
    source: {publicUrl: trace.source.captureEvidenceUri, sha256: sourceSha256, traceSha256: trace.sha256, cursor: "CAPTURE_SYNCHRONIZED_DOM_POINTER"},
    motion: {cameraMoveCount: 3, maxScale: 1.18, settledHoldStates: 3, syntheticCursorAdded: false, exactPressedTargetFeedback: true, annotationCount: 1, annotationRole: "accepted-result-only"},
    output: {path: path.relative(root, outputPath), sha256: sha256File(outputPath), width: 960, height: 540, fps, durationInFrames, durationMs: Math.round((durationInFrames / fps) * 1000)},
    comparison: {left: "v1-ghosty-baseline", right: "v2-settled-camera", path: path.relative(root, comparisonPath), sha256: sha256File(comparisonPath)},
    contactSheet: {path: path.relative(root, contactPath), sha256: sha256File(contactPath), samples: reviewFrames},
    boundary: {proofOnly: true, reviewOnly: true, productionAdmission: false, userVisualApproval: "NOT_APPROVED", workspaceMutationPerformed: false, currentPhaseMutationPerformed: false},
    renderedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: manifest.status, output: manifest.output, comparison: manifest.comparison, contactSheet: manifest.contactSheet, boundary: manifest.boundary}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
