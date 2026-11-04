#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, registerRepresentativeMotionArtifact} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/index.ts");
const phaseDir = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/representative-motion");
const outputDir = path.join(phaseDir, "representative-motion");
const acceptedPath = path.join(phaseDir, "accepted-shot-ir-v2.json");
const motionPath = path.join(phaseDir, "motion-ir-v2.json");
const planPath = path.join(phaseDir, "representative-motion-plan-v1.json");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
let statefulRenderStarted = false;
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); };

async function main() {
  if (!fs.existsSync(acceptedPath) || !fs.existsSync(motionPath) || !fs.existsSync(planPath)) throw new Error("accepted-shot-ir-motion-ir-and-representative-plan-required");
  const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const acceptedSet = JSON.parse(fs.readFileSync(acceptedPath, "utf8"));
  const motionSet = JSON.parse(fs.readFileSync(motionPath, "utf8"));
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  if (acceptedSet.contract !== "A1AcceptedShotIRSet/v2" || plan.contract !== "A1RepresentativeMotionPlan/v1" || plan.acceptedShotIrSha256 !== acceptedSet.sha256) throw new Error("representative-render-input-contract-mismatch");
  if (motionSet.contract !== "A1MotionIRSet/v2" || motionSet.acceptedShotIrSha256 !== acceptedSet.sha256 || plan.shotIds.some((shotId) => !motionSet.scenes.some((scene) => scene.sceneId === shotId))) throw new Error("representative-render-motion-ir-missing-or-stale");
  if (workspace.production.acceptedShotIr?.status !== "compiled-review-only" || workspace.production.acceptedShotIr?.sha256 !== acceptedSet.sha256 || workspace.production.acceptedShotIr?.sourceWorkspaceSha256 !== acceptedSet.sourceWorkspaceSha256) throw new Error("representative-render-accepted-ir-stale-against-current-workspace");
  if (workspace.production.motion?.representativePlan?.sha256 !== plan.sha256 || workspace.production.motion?.representativePlan?.acceptedShotIrSha256 !== acceptedSet.sha256) throw new Error("representative-render-plan-stale-against-current-workspace");
  const inputProps = {acceptedSet, motionSet, plan};
  statefulRenderStarted = true;
  fs.mkdirSync(outputDir, {recursive: true});
  fs.mkdirSync(artifactDir, {recursive: true});
  const serveUrl = await bundle({entryPoint, publicDir: path.join(appRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  try {
    const composition = await selectComposition({serveUrl, id: "A1AcceptedEditorialSequenceV2", inputProps, puppeteerInstance: browser, logLevel: "warn"});
    const videoPath = path.join(outputDir, "representative-motion-960x540.mp4");
    await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 86, crf: 23, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    const frameDir = path.join(outputDir, "review-frames");
    fs.mkdirSync(frameDir, {recursive: true});
    const sampleFrames = Array.from({length: 8}, (_, index) => Math.min(composition.durationInFrames - 1, Math.round(index * (composition.durationInFrames - 1) / 7)));
    const tileWidth = 480, tileHeight = 270, labelHeight = 34;
    const tiles = [];
    for (const frame of sampleFrames) {
      const stillPath = path.join(frameDir, `f${String(frame).padStart(4, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output: stillPath, imageFormat: "png", scale: .25, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0d0f10"/><text x="12" y="23" fill="#dfff68" font-family="monospace" font-size="12">F${frame} · ${(frame / 30).toFixed(2)}s</text></svg>`);
      tiles.push(await sharp(stillPath).resize(tileWidth, tileHeight).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0d0f10"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
    }
    const sheetPath = path.join(outputDir, "representative-motion-contact-sheet.png");
    await sharp({create: {width: tileWidth * 4, height: (tileHeight + labelHeight) * 2, channels: 4, background: "#0d0f10"}}).composite(tiles.map((input, index) => ({input, left: index % 4 * tileWidth, top: Math.floor(index / 4) * (tileHeight + labelHeight)}))).png().toFile(sheetPath);
    const artifact = {
      publicUrl: "/generated/system-line/editorial-asset-workbench-v1/representative-motion/representative-motion-960x540.mp4",
      sha256: shaFile(videoPath),
      contactSheetPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/representative-motion/representative-motion-contact-sheet.png",
      contactSheetSha256: shaFile(sheetPath),
      durationMs: Math.round(composition.durationInFrames / composition.fps * 1000),
      width: 960,
      height: 540,
      planSha256: plan.sha256,
    };
    const report = {contract: "A1RepresentativeMotionRenderReport/v1", status: "STRUCTURAL_PASS_VISUAL_PENDING", renderedAt: new Date().toISOString(), acceptedShotIrSha256: acceptedSet.sha256, motionIrSha256: motionSet.sha256, planSha256: plan.sha256, composition: {id: composition.id, durationInFrames: composition.durationInFrames, fps: composition.fps, width: 960, height: 540}, artifact, review: {score: null, maxScore: 24, hardFailures: [], humanVisualApproval: "PENDING"}, gates: {fullMotionAllowed: false, review540pAllowed: false, final1080pAllowed: false}};
    writeJson(path.join(outputDir, "render-report.json"), report);
    writeJson(path.join(artifactDir, "render-report.json"), report);
    withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const event = createProductionEvent({workspace: current, action: "representative-motion-rendered", targetId: plan.sha256, payload: artifact});
      let next = registerRepresentativeMotionArtifact(current, artifact);
      next.production.eventLedger.eventCount += 1;
      next.production.eventLedger.lastEventId = event.eventId;
      next.production.eventLedger.lastEventAt = event.createdAt;
      next = recalculateEditorialAssetWorkbench(next);
      persistProjectState(appRoot, next, {event, files: {"representative-motion-render-report-v1.json": report}});
    });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({silent: true});
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (!statefulRenderStarted) {
    console.error(error);
    process.exitCode = 1;
    return;
  }
  try {
    withProjectLock(appRoot, () => {
      const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
      const event = createProductionEvent({workspace: current, action: "representative-motion-render-failed", targetId: current.production.motion.representativePlan?.sha256 || null, payload: {error: message}});
      const next = structuredClone(current);
      next.production.motion.status = "render-failed";
      next.production.motion.review = {...next.production.motion.review, status: "blocked", hardFailures: [message]};
      next.production.eventLedger.eventCount += 1;
      next.production.eventLedger.lastEventId = event.eventId;
      next.production.eventLedger.lastEventAt = event.createdAt;
      persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next), {event});
    });
  } catch (persistError) {
    console.error(persistError);
  }
  console.error(error);
  process.exitCode = 1;
});
