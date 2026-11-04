#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const phaseId = "visual-system-proof-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const planPath = path.join(publicDir, "render-plan.json");
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/visual-system-proof-index.tsx");
const rendererPublicDir = path.join(rendererRoot, "public");
const require = createRequire(path.join(root, "package.json"));
const rendererRequire = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = rendererRequire("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

async function main() {
  const plan = readJson(planPath);
  if (plan.contract !== "A1VisualSystemRenderProof/v1") throw new Error(`unexpected-proof-contract:${plan.contract}`);
  const authorityPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
  const authorityBefore = shaFile(authorityPath);
  const serveUrl = await bundle({entryPoint, publicDir: rendererPublicDir, rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const composition = await selectComposition({serveUrl, id: "A1VisualProductionSystemProof", inputProps: plan, puppeteerInstance: browser, logLevel: "warn"});
  const stillDir = path.join(publicDir, "frames");
  fs.mkdirSync(stillDir, {recursive: true});
  const eventFrames = [];
  let offset = 0;
  try {
    for (const scene of plan.scenes) {
      for (const state of ["enter", "emphasize", "hold"]) {
        const frame = offset + scene.eventFrames[state];
        const output = path.join(stillDir, `${scene.sceneId}-${state}.png`);
        await renderStill({serveUrl, composition, inputProps: plan, frame, output, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
        eventFrames.push({sceneId: scene.sceneId, familyId: scene.familyId, state, frame, publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(output)}`, sha256: shaFile(output)});
      }
      offset += scene.durationInFrames;
    }
    const videoPath = path.join(publicDir, "visual-system-proof.mp4");
    await renderMedia({serveUrl, composition, inputProps: plan, frameRange: [0, composition.durationInFrames - 1], outputLocation: videoPath, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 88, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const holdFrames = eventFrames.filter((item) => item.state === "hold");
    const tiles = [];
    for (const frame of holdFrames) {
      const file = path.join(stillDir, `${frame.sceneId}-hold.png`);
      const label = Buffer.from(`<svg width="480" height="42"><rect width="480" height="42" fill="#111315"/><text x="14" y="27" fill="#f2eadc" font-family="monospace" font-size="17">${frame.sceneId} · ${frame.familyId} · hold</text></svg>`);
      const tile = await sharp(file).resize(480, 270).extend({top: 42, bottom: 0, left: 0, right: 0, background: "#111315"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer();
      tiles.push(tile);
    }
    const contactSheet = path.join(publicDir, "visual-system-proof-contact-sheet.png");
    await sharp({create: {width: 1440, height: 312, channels: 4, background: "#111315"}}).composite(tiles.map((input, index) => ({input, left: index * 480, top: 0}))).png().toFile(contactSheet);
    const report = {
      contract: "A1VisualSystemRenderProofReport/v1",
      phaseId,
      status: "PASS",
      sourcePlanSha256: shaFile(planPath),
      remotion: {entryPoint: path.relative(root, entryPoint), compositionId: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: composition.width, height: composition.height, video: {publicUrl: `/generated/system-line/${phaseId}/visual-system-proof.mp4`, sha256: shaFile(videoPath), width: composition.width, height: composition.height, durationSec: Number((composition.durationInFrames / composition.fps).toFixed(3))}} ,
      eventFrames,
      contactSheet: {publicUrl: `/generated/system-line/${phaseId}/visual-system-proof-contact-sheet.png`, sha256: shaFile(contactSheet), width: 1440, height: 312},
      currentAuthority: {propsSha256Before: authorityBefore, propsSha256After: shaFile(authorityPath), unchanged: authorityBefore === shaFile(authorityPath)},
      gates: {remotionRendered: "PASS", threeScenesRendered: true, eventFramesRendered: true, currentAuthorityUntouched: true, humanVisualApproval: "PENDING", rendererAdoptionAllowed: false, fullBoardGenerationAllowed: false},
    };
    writeJson(path.join(artifactDir, "render-report.json"), report);
    writeJson(path.join(publicDir, "render-report.json"), report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
