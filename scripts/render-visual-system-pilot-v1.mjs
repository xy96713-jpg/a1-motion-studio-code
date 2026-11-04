#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "visual-system-pilot-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicDir = path.join(rendererRoot, "public");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

async function main() {
  const planPath = path.join(publicDir, "render-plan.json");
  const plan = readJson(planPath);
  const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
  const authorityBefore = shaFile(authorityPath);
  const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const composition = await selectComposition({serveUrl, id: "A1VisualProductionSystemPilot", inputProps: plan, puppeteerInstance: browser, logLevel: "warn"});
  const framesDir = path.join(publicDir, "frames");
  fs.mkdirSync(framesDir, {recursive: true});
  const eventFrames = [];
  let offset = 0;
  try {
    for (const scene of plan.scenes) {
      for (const state of ["enter", "emphasize", "hold"]) {
        const frame = offset + scene.eventFrames[state];
        const output = path.join(framesDir, `${scene.sceneId}-${state}.png`);
        await renderStill({serveUrl, composition, inputProps: plan, frame, output, imageFormat: "png", scale: .42, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        eventFrames.push({sceneId: scene.sceneId, familyId: scene.familyId, state, frame, publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(output)}`, sha256: shaFile(output)});
      }
      offset += scene.durationInFrames;
    }
    const videoPath = path.join(publicDir, "visual-system-pilot.mp4");
    await renderMedia({serveUrl, composition, inputProps: plan, frameRange: [0, composition.durationInFrames - 1], outputLocation: videoPath, scale: .42, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 86, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const holdFrames = eventFrames.filter((item) => item.state === "hold");
    const columns = 4;
    const tileWidth = 480;
    const tileHeight = 270;
    const labelHeight = 42;
    const rows = Math.ceil(holdFrames.length / columns);
    const tiles = [];
    for (const frame of holdFrames) {
      const file = path.join(framesDir, `${frame.sceneId}-hold.png`);
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="${tileWidth}" height="${labelHeight}" fill="#111315"/><text x="14" y="27" fill="#f2eadc" font-family="monospace" font-size="15">${frame.sceneId} · ${frame.familyId}</text></svg>`);
      tiles.push(await sharp(file).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#111315"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const contactSheet = path.join(publicDir, "visual-system-pilot-contact-sheet.png");
    await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#111315"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)}))).png().toFile(contactSheet);
    const report = {
      contract: "A1VisualSystemPilotRenderReport/v1",
      phaseId,
      status: "PASS",
      sourcePlanSha256: shaFile(planPath),
      remotion: {entryPoint: path.relative(root, entryPoint), compositionId: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: composition.width, height: composition.height, video: {publicUrl: `/generated/system-line/${phaseId}/visual-system-pilot.mp4`, sha256: shaFile(videoPath), durationSec: Number((composition.durationInFrames / composition.fps).toFixed(3))}},
      eventFrames,
      contactSheet: {publicUrl: `/generated/system-line/${phaseId}/visual-system-pilot-contact-sheet.png`, sha256: shaFile(contactSheet), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)},
      currentAuthority: {propsSha256Before: authorityBefore, propsSha256After: shaFile(authorityPath), unchanged: authorityBefore === shaFile(authorityPath)},
      gates: {remotionRendered: "PASS", twelveShotPilotRendered: true, eventFramesRendered: true, currentAuthorityUntouched: authorityBefore === shaFile(authorityPath), humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false},
    };
    writeJson(path.join(artifactDir, "render-report.json"), report);
    writeJson(path.join(publicDir, "render-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
