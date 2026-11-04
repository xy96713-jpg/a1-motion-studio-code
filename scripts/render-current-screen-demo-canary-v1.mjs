#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const operationRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const outputRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/current-screen-demo-lane-v1");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/current-screen-demo-lane-v1");
const sourcePath = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/source-cache/causal-writing-workbench-v1/causal-writing-workbench-real.mp4");
const outputPath = path.join(outputRoot, "ed-02-operation-canary-960x540.mp4");
const contactPath = path.join(outputRoot, "ed-02-operation-canary-contact-sheet.png");
const manifestPath = path.join(outputRoot, "ed-02-operation-canary.json");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function main() {
  fs.mkdirSync(outputRoot, {recursive: true});
  fs.mkdirSync(artifactRoot, {recursive: true});
  const trace = JSON.parse(fs.readFileSync(path.join(operationRoot, "interaction-trace.json"), "utf8"));
  const performance = JSON.parse(fs.readFileSync(path.join(operationRoot, "screen-performance-ir.json"), "utf8"));
  const sourceSha256 = sha256File(sourcePath);
  trace.source.captureEvidenceSha256 = sourceSha256;
  trace.source.durationMs = 9440;
  delete trace.sha256;
  trace.sha256 = sha256Value(trace);
  const fps = 30;
  const startMs = trace.timeline.startMs;
  const endMs = trace.timeline.endMs;
  const durationInFrames = Math.ceil((endMs - startMs) / 1000 * fps);
  const props = {trace, performance, width: 960, height: 540, fps, durationInFrames};
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const reviewFrames = [];
  try {
    const composition = await selectComposition({serveUrl, id: "A1OperationPackagingProofV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const sampleProgress = [.72, .64, .4, .72, .65];
    for (const [index, event] of trace.events.entries()) {
      const sampleMs = event.startMs + (event.endMs - event.startMs) * sampleProgress[index];
      const frame = Math.min(durationInFrames - 1, Math.max(0, Math.round((sampleMs - startMs) / (endMs - startMs) * (durationInFrames - 1))));
      const file = path.join(outputRoot, `ed-02-operation-canary-${String(frame).padStart(3, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: file, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      reviewFrames.push({eventType: event.eventType, targetId: event.target.id, frame, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/current-screen-demo-lane-v1/${path.basename(file)}`, sha256: sha256File(file)});
    }
  } finally {
    await browser.close({silent: true});
  }
  const thumbs = await Promise.all(reviewFrames.map((frame) => sharp(path.join(outputRoot, path.basename(frame.publicUrl))).resize(480, 270, {fit: "cover"}).png().toBuffer()));
  await sharp({create: {width: 1440, height: 540, channels: 3, background: "#090b0c"}}).composite(thumbs.map((input, index) => ({input, left: (index % 3) * 480, top: Math.floor(index / 3) * 270}))).png().toFile(contactPath);
  const manifest = {
    contract: "A1CurrentScreenDemoCanary/v1",
    status: "CANDIDATE_ONLY_READY_FOR_REVIEW",
    shotId: "ED-02",
    sourceMode: "DIRECT_VERIFIED_REAL_RECORDING",
    sourcePublicUrl: trace.source.captureEvidenceUri,
    sourceSha256,
    sourceTraceSha256: trace.sha256,
    sourcePerformanceSha256: performance.sha256,
    publicUrl: "/generated/system-line/editorial-asset-workbench-v1/current-screen-demo-lane-v1/ed-02-operation-canary-960x540.mp4",
    sha256: sha256File(outputPath),
    contactSheetPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/current-screen-demo-lane-v1/ed-02-operation-canary-contact-sheet.png",
    contactSheetSha256: sha256File(contactPath),
    width: 960,
    height: 540,
    fps,
    durationInFrames,
    durationMs: Math.round(durationInFrames / fps * 1000),
    cameraBeatCount: performance.camera.length,
    emphasisBeatCount: performance.emphasis.length,
    pointerBeatCount: performance.pointer?.length || 0,
    typingBeatCount: performance.textInput?.length || 0,
    sourceBoundOperationOverlayUsed: true,
    fakeUiUsed: false,
    reviewOnly: true,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    reviewFrames,
    renderedAt: new Date().toISOString(),
  };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(manifestPath, text);
  fs.writeFileSync(path.join(artifactRoot, path.basename(manifestPath)), text);
  console.log(JSON.stringify({status: manifest.status, publicUrl: manifest.publicUrl, sha256: manifest.sha256, contactSheetPublicUrl: manifest.contactSheetPublicUrl, sourceSha256, durationMs: manifest.durationMs}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
