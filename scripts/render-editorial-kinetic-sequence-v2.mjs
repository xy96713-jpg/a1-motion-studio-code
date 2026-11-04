#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "editorial-kinetic-sequence-v2";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const authorityPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const planPath = path.join(publicDir, "render-plan.json");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const proofStates = [
  {id: "opening", frame: 70, label: "R02 / evidence hold"},
  {id: "impact", frame: 145, label: "R03 / number impact"},
  {id: "readable-hold", frame: 322, label: "R08 / shutter hold"},
  {id: "handoff", frame: 372, label: "R08 / gates to iris"},
  {id: "ending", frame: 532, label: "R10 / verdict hold"},
];

const reviewStates = [
  18, 55, 92, 118,
  138, 172, 212, 238,
  244, 258, 286, 322, 356, 382,
  398, 416, 426, 438, 452, 486, 532, 575,
].map((frame) => ({id: `f${String(frame).padStart(3, "0")}`, frame}));

async function main() {
  fs.mkdirSync(publicDir, {recursive: true});
  fs.mkdirSync(artifactDir, {recursive: true});
  const framesDir = path.join(publicDir, "proof-frames");
  fs.mkdirSync(framesDir, {recursive: true});
  const authorityBefore = shaFile(authorityPath);
  const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: "A1EditorialKineticSequenceV2", inputProps: plan, puppeteerInstance: browser, logLevel: "warn"});
    const renderedFrames = [];
    for (const state of proofStates) {
      const output = path.join(framesDir, `${state.id}.png`);
      await renderStill({serveUrl, composition, inputProps: plan, frame: state.frame, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      renderedFrames.push({...state, publicUrl: `/generated/system-line/${phaseId}/proof-frames/${state.id}.png`, sha256: shaFile(output)});
    }
    const videoPath = path.join(publicDir, "editorial-kinetic-sequence-v2-review.mp4");
    await renderMedia({serveUrl, composition, inputProps: plan, outputLocation: videoPath, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 82, crf: 25, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const tileWidth = 480, tileHeight = 270, labelHeight = 42;
    const tiles = [];
    for (const state of proofStates) {
      const file = path.join(framesDir, `${state.id}.png`);
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111214"/><text x="14" y="27" fill="#eee9dd" font-family="monospace" font-size="15">${state.label} · F${state.frame}</text></svg>`);
      tiles.push(await sharp(file).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#111214"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const sheetPath = path.join(publicDir, "editorial-kinetic-sequence-v2-contact-sheet.png");
    await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * 2, channels: 4, background: "#111214"}}).composite(tiles.map((input, index) => ({input, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (tileHeight + labelHeight)}))).png().toFile(sheetPath);
    const reviewDir = path.join(publicDir, "review-strip-frames");
    fs.mkdirSync(reviewDir, {recursive: true});
    const reviewTileWidth = 320, reviewTileHeight = 180, reviewLabelHeight = 30;
    const reviewTiles = [];
    for (const state of reviewStates) {
      const output = path.join(reviewDir, `${state.id}.png`);
      await renderStill({serveUrl, composition, inputProps: plan, frame: state.frame, output, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const label = Buffer.from(`<svg width="${reviewTileWidth}" height="${reviewLabelHeight}"><rect width="100%" height="100%" fill="#111214"/><text x="10" y="20" fill="#eee9dd" font-family="monospace" font-size="12">F${state.frame} · ${(state.frame / composition.fps).toFixed(2)}s</text></svg>`);
      reviewTiles.push(await sharp(output).resize(reviewTileWidth, reviewTileHeight).extend({top: reviewLabelHeight, bottom: 0, left: 0, right: 0, background: "#111214"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const reviewColumns = 6;
    const reviewRows = Math.ceil(reviewTiles.length / reviewColumns);
    const reviewSheetPath = path.join(publicDir, "editorial-kinetic-sequence-v2-review-strip.png");
    await sharp({create: {width: reviewTileWidth * reviewColumns, height: (reviewTileHeight + reviewLabelHeight) * reviewRows, channels: 4, background: "#111214"}}).composite(reviewTiles.map((input, index) => ({input, left: index % reviewColumns * reviewTileWidth, top: Math.floor(index / reviewColumns) * (reviewTileHeight + reviewLabelHeight)}))).png().toFile(reviewSheetPath);
    const authorityAfter = shaFile(authorityPath);
    const report = {
      contract: "A1EditorialKineticSequenceRenderReport/v2", phaseId, status: "PASS",
      sourcePlan: {path: path.relative(root, planPath), sha256: shaFile(planPath), sourceOfTruth: plan.sourceOfTruth},
      remotion: {compositionId: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: composition.width, height: composition.height, renderer: "formal-candidate-review-only"},
      proofFrames: renderedFrames,
      video: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(videoPath)}`, sha256: shaFile(videoPath), bytes: fs.statSync(videoPath).size, durationSec: composition.durationInFrames / composition.fps, resolution: "960x540"},
      contactSheet: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(sheetPath)}`, sha256: shaFile(sheetPath)},
      reviewStrip: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(reviewSheetPath)}`, sha256: shaFile(reviewSheetPath), sampledFrames: reviewStates.map(({frame}) => frame)},
      currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
      gates: {remotionRender: "PASS", completePreview: true, fiveProofStates: true, visualScore: "PENDING_RED_TEAM_VISUAL_SCORE", humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, h47ExpansionAllowed: false},
    };
    writeJson(path.join(artifactDir, "render-report.json"), report);
    writeJson(path.join(publicDir, "render-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
