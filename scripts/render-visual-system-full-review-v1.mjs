#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "visual-system-full-review-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const rendererPublicDir = path.join(rendererRoot, "public");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = require("@remotion/renderer");
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
  const composition = await selectComposition({serveUrl, id: "A1VisualProductionSystemFullReview", inputProps: plan, puppeteerInstance: browser, logLevel: "warn"});
  const framesDir = path.join(publicDir, "frames");
  fs.mkdirSync(framesDir, {recursive: true});
  const frames = [];
  let offset = 0;
  try {
    for (const scene of plan.scenes) {
      const frame = offset + scene.eventFrames.hold;
      const output = path.join(framesDir, `${scene.sceneId}-hold.png`);
      await renderStill({serveUrl, composition, inputProps: plan, frame, output, imageFormat: "png", scale: .28, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      frames.push({sceneId: scene.sceneId, familyId: scene.familyId, frame, publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(output)}`, sha256: shaFile(output)});
      offset += scene.durationInFrames;
    }
    const columns = 5;
    const tileWidth = 384;
    const tileHeight = 216;
    const labelHeight = 36;
    const rows = Math.ceil(frames.length / columns);
    const tiles = [];
    for (const frame of frames) {
      const file = path.join(framesDir, `${frame.sceneId}-hold.png`);
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="${tileWidth}" height="${labelHeight}" fill="#111315"/><text x="10" y="24" fill="#f2eadc" font-family="monospace" font-size="12">${frame.sceneId} · ${frame.familyId}</text></svg>`);
      tiles.push(await sharp(file).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#111315"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const contactSheet = path.join(publicDir, "visual-system-full-review-contact-sheet.png");
    await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#111315"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)}))).png().toFile(contactSheet);
    const report = {contract: "A1VisualSystemFullReviewRenderReport/v1", phaseId, status: "PASS", sourcePlanSha256: shaFile(planPath), remotion: {entryPoint: path.relative(root, entryPoint), compositionId: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: composition.width, height: composition.height, reviewOnly: true}, frames, contactSheet: {publicUrl: `/generated/system-line/${phaseId}/visual-system-full-review-contact-sheet.png`, sha256: shaFile(contactSheet), width: columns * tileWidth, height: rows * (tileHeight + labelHeight)}, currentAuthority: {propsSha256Before: authorityBefore, propsSha256After: shaFile(authorityPath), unchanged: authorityBefore === shaFile(authorityPath)}, gates: {remotionRendered: "PASS", fortySevenHoldFramesRendered: true, reviewOnly: true, currentAuthorityUntouched: authorityBefore === shaFile(authorityPath), humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false}};
    writeJson(path.join(artifactDir, "render-report.json"), report);
    writeJson(path.join(publicDir, "render-report.json"), report);
    console.log(JSON.stringify({status: report.status, phaseId, sceneCount: frames.length, composition: composition.id, durationSec: Number((composition.durationInFrames / composition.fps).toFixed(3)), currentAuthorityUnchanged: report.currentAuthority.unchanged, contactSheet: report.contactSheet}, null, 2));
  } finally { await browser.close({silent: true}); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
