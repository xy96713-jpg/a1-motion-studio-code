#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const publicRelative = "generated/system-line/editorial-asset-workbench-v1/operation-traces/ED-02";
const sourceRoot = path.join(appRoot, "public", publicRelative);
const rendererSourceRoot = path.join(rendererRoot, "public", publicRelative);
const outputPath = path.join(sourceRoot, "operation-packaging-proof.mp4");
const contactPath = path.join(sourceRoot, "operation-packaging-proof-contact-sheet.png");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/operation-traces/ED-02");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");

async function main() {
  const trace = JSON.parse(fs.readFileSync(path.join(sourceRoot, "interaction-trace.json"), "utf8"));
  const performance = JSON.parse(fs.readFileSync(path.join(sourceRoot, "screen-performance-ir.json"), "utf8"));
  const fps = 30;
  const operationStartMs = Math.max(0, trace.timeline.startMs || 0);
  const operationEndMs = Math.max(operationStartMs + 1, trace.timeline.endMs || trace.source.durationMs);
  const operationDurationMs = operationEndMs - operationStartMs;
  const durationInFrames = Math.max(1, Math.ceil(operationDurationMs / 1000 * fps));
  const playbackRate = operationDurationMs / Math.max(1, durationInFrames / fps * 1000);
  const props = {trace, performance, width: 1920, height: 1080, fps, durationInFrames};
  fs.mkdirSync(sourceRoot, {recursive: true});
  fs.mkdirSync(rendererSourceRoot, {recursive: true});
  for (const directory of [sourceRoot, rendererSourceRoot]) {
    for (const name of fs.readdirSync(directory)) if (/^operation-proof-\d+\.png$/u.test(name)) fs.unlinkSync(path.join(directory, name));
  }
  const rendererTracePath = path.join(rendererSourceRoot, "interaction-trace.json");
  const rendererPerformancePath = path.join(rendererSourceRoot, "screen-performance-ir.json");
  fs.copyFileSync(path.join(sourceRoot, "interaction-trace.json"), rendererTracePath);
  fs.copyFileSync(path.join(sourceRoot, "screen-performance-ir.json"), rendererPerformancePath);
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: "A1OperationPackagingProofV1", inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
    await renderMedia({serveUrl, composition, inputProps: props, outputLocation: outputPath, codec: "h264", crf: 18, imageFormat: "jpeg", concurrency: 2, muted: true, hardwareAcceleration: "disable", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const sampleProgress = {drag: .7, submit: .65, click: .35, type: .72, "result-commit": .62};
    const sampleTimesMs = trace.events.map((event) => event.startMs + (event.endMs - event.startMs) * (sampleProgress[event.eventType] ?? .65));
    const stillFrames = sampleTimesMs.map((sampleMs) => Math.min(durationInFrames - 1, Math.max(0, Math.round((sampleMs - operationStartMs) / operationDurationMs * (durationInFrames - 1)))));
    const stills = [];
    for (const [index, frame] of stillFrames.entries()) {
      const stillPath = path.join(sourceRoot, `operation-proof-${String(frame).padStart(3, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps: props, frame, output: stillPath, imageFormat: "png", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      stills.push({file: stillPath, frame, eventType: trace.events[index].eventType, targetId: trace.events[index].target.id});
    }
    const images = await Promise.all(stills.map(({file}) => sharp(file).resize(640, 360, {fit: "cover"}).png().toBuffer()));
    await sharp({create: {width: 1920, height: 720, channels: 3, background: "#090b0c"}}).composite(images.map((input, index) => ({input, left: (index % 3) * 640, top: Math.floor(index / 3) * 360}))).png().toFile(contactPath);
    props.reviewFrames = stills.map(({file, frame, eventType, targetId}) => ({eventType, targetId, frame, publicUrl: `/${publicRelative}/${path.basename(file)}`, sha256: sha256File(file)}));
  } finally {
    await browser.close({silent: true});
  }
  const outputRelativeUrl = `/${publicRelative}/operation-packaging-proof.mp4`;
  const contactRelativeUrl = `/${publicRelative}/operation-packaging-proof-contact-sheet.png`;
  const now = new Date().toISOString();
  const proof = {
    contract: "A1OperationPackagingProofArtifact/v1",
    status: "review-only",
    shotId: "ED-02",
    renderer: "remotion",
    sourceTraceSha256: trace.sha256,
    sourcePerformanceSha256: performance.sha256,
    publicUrl: outputRelativeUrl,
    sha256: sha256File(outputPath),
    contactSheetPublicUrl: contactRelativeUrl,
    contactSheetSha256: sha256File(contactPath),
    width: 1920,
    height: 1080,
    fps,
    durationInFrames,
    durationMs: Math.round(durationInFrames / fps * 1000),
    sourcePlayback: {
      mode: "direct-real-recording",
      sourcePublicUrl: trace.source.captureEvidenceUri,
      sourceSha256: trace.source.captureEvidenceSha256,
      trimStartMs: operationStartMs,
      trimEndMs: operationEndMs,
      playbackRate,
    },
    fakeUiUsed: false,
    screenshotCrossfadeUsed: false,
    explanatoryOverlayUsed: false,
    sourceBoundOperationOverlayUsed: true,
    reviewFrames: props.reviewFrames,
    visibleCapturePointerUsed: (performance.pointer?.length || 0) > 0,
    contenteditableTypingUsed: (performance.textInput?.length || 0) > 0,
    pointerBeatCount: performance.pointer?.length || 0,
    typingBeatCount: performance.textInput?.length || 0,
    reviewOnly: true,
    acceptedShotIrAllowed: false,
    renderAllowed: false,
    renderedAt: now,
  };
  fs.copyFileSync(outputPath, path.join(rendererSourceRoot, path.basename(outputPath)));
  fs.copyFileSync(contactPath, path.join(rendererSourceRoot, path.basename(contactPath)));
  writeJson(path.join(sourceRoot, "operation-packaging-proof.json"), proof);
  writeJson(path.join(rendererSourceRoot, "operation-packaging-proof.json"), proof);
  const orchestrationPath = path.join(sourceRoot, "operation-orchestration.json");
  const orchestration = JSON.parse(fs.readFileSync(orchestrationPath, "utf8"));
  const orchestrationWithoutHash = {...orchestration, preview: proof};
  delete orchestrationWithoutHash.sha256;
  const orchestrationWithPreview = {...orchestrationWithoutHash, sha256: sha256Value(orchestrationWithoutHash)};
  writeJson(orchestrationPath, orchestrationWithPreview);
  writeJson(path.join(artifactRoot, "operation-orchestration.json"), orchestrationWithPreview);
  const updated = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const next = structuredClone(current);
    if (!next.production.operationOrchestration || next.production.operationOrchestration.trace.sha256 !== trace.sha256) throw new Error("operation-proof-trace-stale-against-workspace");
    next.production.operationOrchestration = orchestrationWithPreview;
    next.production.eventLedger.eventCount += 1;
    const event = createProductionEvent({workspace: current, action: "operation-packaging-proof-rendered", targetId: "ED-02", payload: {proofSha256: proof.sha256, sourceTraceSha256: trace.sha256, reviewOnly: true}, now});
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = recalculateEditorialAssetWorkbench(next, now);
    persistProjectState(appRoot, recalculated, {event});
    return recalculated;
  });
  console.log(JSON.stringify({status: proof.status, shotId: proof.shotId, publicUrl: proof.publicUrl, contactSheetPublicUrl: proof.contactSheetPublicUrl, sha256: proof.sha256, workspaceSha256: updated.workspaceSha256, acceptedShotIrAllowed: proof.acceptedShotIrAllowed}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
