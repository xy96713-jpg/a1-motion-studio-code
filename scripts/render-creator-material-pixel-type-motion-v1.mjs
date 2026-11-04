#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "creator-material-pixel-type-motion-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const planPath = path.join(publicDir, "render-plan.json");
const authorityPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const proofStates = [
  {id: "material-arrival", frame: 8, label: "REAL MATERIAL ARRIVAL"},
  {id: "screen-settle", frame: 26, label: "SCREEN SETTLE"},
  {id: "selection-lock", frame: 41, label: "SELECTION LOCK"},
  {id: "word-lock", frame: 56, label: "WORD ACTORS LOCK"},
  {id: "evidence-push", frame: 86, label: "EVIDENCE PUSH"},
  {id: "reading-hold", frame: 108, label: "STABLE READING HOLD"},
];
const reviewFrames = [0, 10, 20, 30, 40, 50, 60, 72, 84, 96, 108, 119];

async function main() {
  fs.mkdirSync(publicDir, {recursive: true});
  fs.mkdirSync(artifactDir, {recursive: true});
  const framesDir = path.join(publicDir, "proof-frames");
  fs.mkdirSync(framesDir, {recursive: true});
  const reviewDir = path.join(publicDir, "review-strip-frames");
  fs.mkdirSync(reviewDir, {recursive: true});
  const authorityBefore = shaFile(authorityPath);
  const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const inputProps = {plan};
    const composition = await selectComposition({serveUrl, id: "A1CreatorMaterialPixelTypeMotionV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const renderedFrames = [];
    for (const state of proofStates) {
      const output = path.join(framesDir, `${state.id}.png`);
      await renderStill({serveUrl, composition, inputProps, frame: state.frame, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      renderedFrames.push({...state, publicUrl: `/generated/system-line/${phaseId}/proof-frames/${state.id}.png`, sha256: shaFile(output)});
    }
    const videoPath = path.join(publicDir, "creator-material-pixel-type-motion-v1-review.mp4");
    await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 86, crf: 23, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});

    const tileWidth = 480, tileHeight = 270, labelHeight = 40;
    const proofTiles = [];
    for (const state of proofStates) {
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#080b0d"/><text x="13" y="26" fill="#d7ff45" font-family="monospace" font-size="14">${state.label} · F${state.frame}</text></svg>`);
      proofTiles.push(await sharp(path.join(framesDir, `${state.id}.png`)).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#080b0d"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const contactSheetPath = path.join(publicDir, "creator-material-pixel-type-motion-v1-contact-sheet.png");
    await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * 2, channels: 4, background: "#080b0d"}}).composite(proofTiles.map((input, index) => ({input, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (tileHeight + labelHeight)}))).png().toFile(contactSheetPath);

    const reviewTileWidth = 320, reviewTileHeight = 180, reviewLabelHeight = 28;
    const reviewTiles = [];
    for (const frame of reviewFrames) {
      const output = path.join(reviewDir, `f${String(frame).padStart(3, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const label = Buffer.from(`<svg width="${reviewTileWidth}" height="${reviewLabelHeight}"><rect width="100%" height="100%" fill="#080b0d"/><text x="10" y="19" fill="#e9f1e7" font-family="monospace" font-size="11">F${frame} · ${(frame / plan.fps).toFixed(2)}s</text></svg>`);
      reviewTiles.push(await sharp(output).resize(reviewTileWidth, reviewTileHeight).extend({top: reviewLabelHeight, bottom: 0, left: 0, right: 0, background: "#080b0d"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const reviewStripPath = path.join(publicDir, "creator-material-pixel-type-motion-v1-review-strip.png");
    await sharp({create: {width: reviewTileWidth * 6, height: (reviewTileHeight + reviewLabelHeight) * 2, channels: 4, background: "#080b0d"}}).composite(reviewTiles.map((input, index) => ({input, left: index % 6 * reviewTileWidth, top: Math.floor(index / 6) * (reviewTileHeight + reviewLabelHeight)}))).png().toFile(reviewStripPath);
    const authorityAfter = shaFile(authorityPath);
    const report = {
      contract: "A1CreatorMaterialPixelTypeMotionRenderReport/v1",
      phaseId,
      status: "DYNAMIC_PROTOTYPE_RENDERED_VISUAL_PENDING",
      sourcePlan: {path: path.relative(root, planPath), sha256: shaFile(planPath), sourceOfTruth: plan.sourceOfTruth},
      remotion: {compositionId: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, sourceInterpreter: "evaluateMotionIrSceneAtFrame()", gsapRuntimeUsed: false},
      video: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(videoPath)}`, sha256: shaFile(videoPath), bytes: fs.statSync(videoPath).size, durationSec: composition.durationInFrames / composition.fps, resolution: "960x540"},
      proofFrames: renderedFrames,
      contactSheet: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(contactSheetPath)}`, sha256: shaFile(contactSheetPath)},
      reviewStrip: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(reviewStripPath)}`, sha256: shaFile(reviewStripPath), sampledFrames: reviewFrames},
      currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
      gates: {humanVisualApproval: "PENDING", familyAdoptionAllowed: false, rendererAdoptionAllowed: false, fullSequenceRenderAllowed: false, h47ExpansionAllowed: false},
    };
    writeJson(path.join(publicDir, "render-report.json"), report);
    writeJson(path.join(artifactDir, "render-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
