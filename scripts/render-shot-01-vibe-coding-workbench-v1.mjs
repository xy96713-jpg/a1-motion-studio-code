#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "shot-01-vibe-coding-workbench-v1";
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const planPath = path.join(publicDir, "render-plan.json");
const authorityPath = path.join(rendererRoot, "src/generated/editorialDocumentaryPilotProps.json");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const inputProps = {plan};
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const proofStates = [
  {id: "spoken-entry", frame: 5, label: "01 / HI · SPOKEN ENTRY"},
  {id: "vibe-word", frame: 18, label: "02 / VIBE · MATERIAL TYPE"},
  {id: "coding-word", frame: 32, label: "03 / CODING · STAGGER"},
  {id: "mask-open", frame: 48, label: "04 / TYPE MASK OPENS"},
  {id: "workbench-lock", frame: 70, label: "05 / REAL WORKBENCH LOCK"},
  {id: "sentence-handoff", frame: 94, label: "06 / SENTENCE HANDOFF"},
];
const reviewFrames = [0, 7, 14, 21, 28, 35, 42, 49, 56, 64, 72, 80, 90, 100];

async function main() {
  fs.mkdirSync(publicDir, {recursive: true});
  fs.mkdirSync(artifactDir, {recursive: true});
  const framesDir = path.join(publicDir, "proof-frames");
  const reviewDir = path.join(publicDir, "review-strip-frames");
  fs.mkdirSync(framesDir, {recursive: true});
  fs.mkdirSync(reviewDir, {recursive: true});
  const authorityBefore = shaFile(authorityPath);
  const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/system-line-h-frame-index.tsx"), publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: "A1Shot01VibeCodingWorkbenchV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const frames = [];
    for (const state of proofStates) {
      const output = path.join(framesDir, `${state.id}.png`);
      await renderStill({serveUrl, composition, inputProps, frame: state.frame, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      frames.push({...state, publicUrl: `/generated/system-line/${phaseId}/proof-frames/${state.id}.png`, sha256: shaFile(output)});
    }
    const videoPath = path.join(publicDir, "shot-01-vibe-coding-workbench-v1-review.mp4");
    await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 90, crf: 20, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const tileWidth = 480, tileHeight = 270, labelHeight = 38;
    const tiles = [];
    for (const state of proofStates) {
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0e11"/><text x="12" y="25" fill="#f3f0e8" font-family="monospace" font-size="13">${state.label} · F${state.frame}</text></svg>`);
      tiles.push(await sharp(path.join(framesDir, `${state.id}.png`)).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0b0e11"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const contactSheetPath = path.join(publicDir, "shot-01-vibe-coding-workbench-v1-contact-sheet.png");
    await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * 2, channels: 4, background: "#0b0e11"}}).composite(tiles.map((input, index) => ({input, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (tileHeight + labelHeight)}))).png().toFile(contactSheetPath);

    const reviewTileWidth = 320, reviewTileHeight = 180, reviewLabelHeight = 27;
    const reviewTiles = [];
    for (const frame of reviewFrames) {
      const output = path.join(reviewDir, `f${String(frame).padStart(3, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const label = Buffer.from(`<svg width="${reviewTileWidth}" height="${reviewLabelHeight}"><rect width="100%" height="100%" fill="#0b0e11"/><text x="9" y="18" fill="#d9dde0" font-family="monospace" font-size="11">F${frame} · ${(frame / plan.fps).toFixed(2)}s</text></svg>`);
      reviewTiles.push(await sharp(output).resize(reviewTileWidth, reviewTileHeight).extend({top: reviewLabelHeight, bottom: 0, left: 0, right: 0, background: "#0b0e11"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const columns = 7;
    const reviewStripPath = path.join(publicDir, "shot-01-vibe-coding-workbench-v1-review-strip.png");
    await sharp({create: {width: reviewTileWidth * columns, height: (reviewTileHeight + reviewLabelHeight) * 2, channels: 4, background: "#0b0e11"}}).composite(reviewTiles.map((input, index) => ({input, left: index % columns * reviewTileWidth, top: Math.floor(index / columns) * (reviewTileHeight + reviewLabelHeight)}))).png().toFile(reviewStripPath);
    const authorityAfter = shaFile(authorityPath);
    const report = {
      contract: "A1Shot01VibeCodingWorkbenchRenderReport/v1",
      phaseId,
      status: "READY_FOR_USER_SHOT01_REVIEW",
      sourcePlan: {path: path.relative(root, planPath), sha256: shaFile(planPath)},
      remotion: {compositionId: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: composition.width, height: composition.height},
      video: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(videoPath)}`, sha256: shaFile(videoPath), bytes: fs.statSync(videoPath).size, durationSec: composition.durationInFrames / composition.fps, resolution: "960x540", audioIncluded: true},
      proofFrames: frames,
      contactSheet: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(contactSheetPath)}`, sha256: shaFile(contactSheetPath)},
      reviewStrip: {publicUrl: `/generated/system-line/${phaseId}/${path.basename(reviewStripPath)}`, sha256: shaFile(reviewStripPath), sampledFrames: reviewFrames},
      currentAuthority: {sha256Before: authorityBefore, sha256After: authorityAfter, unchanged: authorityBefore === authorityAfter},
      gates: {userShot01Approval: "PENDING", shot02DesignAllowed: false, familyAbstractionAllowed: false, rendererAdoptionAllowed: false, h47ExpansionAllowed: false},
    };
    writeJson(path.join(publicDir, "render-report.json"), report);
    writeJson(path.join(artifactDir, "render-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
