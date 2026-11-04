#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertAntiPptMotionIr} from "../apps/studio-next/src/lib/a1-anti-ppt-motion-admission-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const appPublicRoot = path.join(appRoot, "public");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicRoot = path.join(rendererRoot, "public");
const phaseRelativeRoot = "generated/system-line/editorial-asset-workbench-v1";
const outputRelativeRoot = "approved-master-raster-slice-motion-canary-v1";
const planRelativePath = `${phaseRelativeRoot}/approved-master-raster-slice-motion-ir-v1/plan.json`;
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("approved-raster-motion-canary-workspace-sha-required");

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicPath = (publicUrl) => path.join(appPublicRoot, String(publicUrl || "").replace(/^\//u, ""));
const rendererPath = (publicUrl) => path.join(rendererPublicRoot, String(publicUrl || "").replace(/^\//u, ""));
const outputBinding = (file, name) => ({publicUrl: `/${phaseRelativeRoot}/${outputRelativeRoot}/${name}`, sha256: shaFile(file), bytes: fs.statSync(file).size});

const initial = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (initial.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-raster-motion-canary-workspace-cas:${initial.workspaceSha256}`);
if (initial.production.authority?.nextAction?.id !== "build-representative-motion-canary") throw new Error("approved-raster-motion-canary-authority-required");
if (initial.production.generation.summary.queued !== 0 || initial.production.generation.summary.running !== 0 || initial.production.generation.workerStatus !== "frozen" || initial.production.generation.automaticDispatchAllowed !== false) throw new Error("approved-raster-motion-canary-frozen-runtime-required");
if ((initial.production.shotIntelligence.currentAssembly || []).length !== 0) throw new Error("approved-raster-motion-canary-assembly-must-remain-empty");

const plan = readJson(path.join(appPublicRoot, planRelativePath));
const pointer = initial.production.motion?.approvedMasterRasterSliceMotionIr;
if (plan.contract !== "A1ApprovedMasterRasterSliceMotionIR/v1" || plan.status !== "READY_FOR_REPRESENTATIVE_MOTION_CANARY" || pointer?.planSha256 !== plan.planSha256 || plan.sourceVisualDecisionLedgerSha256 !== initial.production.currentVisualDecisionLedger?.ledgerSha256) throw new Error("approved-raster-motion-canary-plan-authority-invalid");
const representativeScenes = plan.representativeShotIds.map((shotId) => plan.scenes.find((scene) => scene.shotId === shotId));
if (representativeScenes.some((scene) => !scene) || representativeScenes.length !== 5) throw new Error("approved-raster-motion-canary-five-scenes-required");

const mirroredAssets = [];
for (const scene of representativeScenes) {
  const source = publicPath(scene.source.publicUrl);
  if (!fs.existsSync(source) || shaFile(source) !== scene.source.sha256) throw new Error(`approved-raster-motion-canary-source-invalid:${scene.shotId}`);
  const target = rendererPath(scene.source.publicUrl);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (!fs.existsSync(target) || shaFile(target) !== scene.source.sha256) fs.copyFileSync(source, target);
  mirroredAssets.push({shotId: scene.shotId, publicUrl: scene.source.publicUrl, sha256: scene.source.sha256, bytes: fs.statSync(source).size});
}

const fps = 30;
const shotDurationInFrames = 90;
const directionPlan = readJson(path.join(root, "work/first-episode-motion-direction-v1/plan.json"));
const actorSpecs = {
  "ED-01": [
    {id: "glyph-left", clipPath: "polygon(5% 12%,35% 12%,35% 82%,5% 82%)", property: "x", from: -54, to: 0, startFrame: 4, endFrame: 24},
    {id: "glyph-center", clipPath: "polygon(32% 8%,68% 8%,68% 82%,32% 82%)", property: "y", from: 42, to: 0, startFrame: 12, endFrame: 34},
    {id: "glyph-right", clipPath: "polygon(65% 12%,96% 12%,96% 82%,65% 82%)", property: "x", from: 54, to: 0, startFrame: 20, endFrame: 42},
  ],
  "ED-10": [
    {id: "verdict-tool", clipPath: "polygon(31% 14%,53% 14%,53% 80%,31% 80%)", property: "y", from: -120, to: 0, startFrame: 5, endFrame: 20},
    {id: "waste-verdict", clipPath: "polygon(50% 36%,92% 36%,92% 76%,50% 76%)", property: "scale", from: .72, to: 1, startFrame: 17, endFrame: 34},
  ],
  "ED-17": [
    {id: "material-input", clipPath: "polygon(3% 39%,29% 39%,29% 86%,3% 86%)", property: "x", from: -90, to: 0, startFrame: 4, endFrame: 24},
    {id: "angle-selector", clipPath: "polygon(42% 31%,63% 31%,63% 86%,42% 86%)", property: "rotate", from: -28, to: 0, startFrame: 22, endFrame: 44},
    {id: "draft-result", clipPath: "polygon(64% 30%,98% 30%,98% 88%,64% 88%)", property: "x", from: -70, to: 0, startFrame: 40, endFrame: 62},
  ],
  "ED-20": [
    {id: "state-rail", clipPath: "polygon(0 0,29% 0,29% 100%,0 100%)", property: "y", from: 34, to: 0, startFrame: 4, endFrame: 24},
    {id: "source-selection", clipPath: "polygon(39% 43%,79% 43%,79% 62%,39% 62%)", property: "scale", from: .92, to: 1.035, startFrame: 24, endFrame: 46},
  ],
  "ED-31": [
    {id: "control-window", clipPath: "polygon(3% 14%,47% 14%,47% 78%,3% 78%)", property: "scale", from: .7, to: 1, startFrame: 5, endFrame: 30},
    {id: "lock-indicator", clipPath: "polygon(39% 16%,45% 16%,45% 23%,39% 23%)", property: "opacity", from: 0, to: 1, startFrame: 34, endFrame: 44},
  ],
};
const shots = representativeScenes.map((scene) => {
  const specs = actorSpecs[scene.shotId];
  const actors = specs.map((spec) => ({id: spec.id, role: scene.dominantActor, semanticJob: scene.semanticAction, startFrame: spec.startFrame, endFrame: spec.endFrame, curveId: "semantic-causal-action", easing: [0.16, 1, 0.3, 1], from: {[spec.property]: spec.from, opacity: .08}, to: {[spec.property]: spec.to, opacity: 1}, propertyTracks: [{contract: "A1MotionPropertyTrack/v1", property: spec.property, from: spec.from, to: spec.to, startFrame: spec.startFrame, endFrame: spec.endFrame, easing: [0.16, 1, 0.3, 1]}, {contract: "A1MotionPropertyTrack/v1", property: "opacity", from: .08, to: 1, startFrame: spec.startFrame, endFrame: spec.endFrame, easing: [0.16, 1, 0.3, 1]}]}));
  actors.push({id: "final-lock", role: "approved-ledger-readable-hold", semanticJob: "restore exact approved pixels", startFrame: 54, endFrame: 64, curveId: "quiet-hold", easing: [0.45, 0.05, 0.55, 0.95], from: {opacity: 0}, to: {opacity: 1}, propertyTracks: [{contract: "A1MotionPropertyTrack/v1", property: "opacity", from: 0, to: 1, startFrame: 54, endFrame: 64, easing: [0.45, 0.05, 0.55, 0.95]}]});
  return {
    shotId: scene.shotId,
    durationInFrames: shotDurationInFrames,
    mode: scene.motionFamily,
    semanticIntent: scene.semanticAction,
    finalComposite: {publicUrl: scene.source.publicUrl, sha256: scene.source.sha256},
    baseFrame: null,
    layers: {},
    workflowActors: Object.fromEntries(specs.map((spec) => [spec.id, {publicUrl: scene.source.publicUrl, sha256: scene.source.sha256}])),
    actorRegions: Object.fromEntries(specs.map((spec) => [spec.id, {clipPath: spec.clipPath}])),
    backgroundColor: scene.shotId === "ED-20" ? "#071014" : "#f0eee8",
    motionIrScene: {contract: "A1MotionIRScene/v2", sceneId: scene.shotId, sourceMotionContract: plan.contract, sourceAuthority: "CURRENT_APPROVED_LEDGER_MOTION_IR", reviewOnly: true, promotedRender: false, timing: {fps, frameStart: 0, frameDuration: shotDurationInFrames, duration: shotDurationInFrames / fps}, phases: {setup: {startFrame: 0, endFrame: 4}, action: {startFrame: 4, endFrame: 54}, stableReadingHold: {startFrame: 64, endFrame: 89}}, actors},
  };
});
assertAntiPptMotionIr({contract: "A1MotionIRPreviewSet/v1", scenes: shots.map((shot) => shot.motionIrScene)}, directionPlan);
const inputProps = {contract: "A1ApprovedMasterLayerMotionPilotProps/v1", reviewOnly: true, promotedRender: false, fps, overlapInFrames: 0, shots};

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-approved-raster-motion-canary-"));
const videoPath = path.join(tempRoot, "representative-motion-canary-960x540.mp4");
const framesRoot = path.join(tempRoot, "review-frames");
fs.mkdirSync(framesRoot, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: rendererPublicRoot, rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
let composition;
const samples = [];
try {
  composition = await selectComposition({serveUrl, id: "A1ApprovedMasterLayerMotionPilotV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  if (composition.durationInFrames !== 450 || composition.fps !== fps || composition.width !== 1920 || composition.height !== 1080) throw new Error("approved-raster-motion-canary-composition-mismatch");
  for (let index = 0; index < shots.length; index += 1) {
    for (const [phase, localFrame] of [["setup", 0], ["action", 24], ["stable-hold", 72]]) {
      const frame = index * shotDurationInFrames + localFrame;
      const file = path.join(framesRoot, `${shots[index].shotId.toLowerCase()}-${phase}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output: file, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      samples.push({shotId: shots[index].shotId, phase, frame, file});
    }
  }
  await renderMedia({serveUrl, composition, inputProps, outputLocation: videoPath, frameRange: [0, 449], scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 88, crf: 22, concurrency: 2, muted: true, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
} finally {
  await browser.close({silent: true});
}

const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_frames:format=duration,size", "-of", "json", videoPath], {encoding: "utf8"}));
if (probe.streams?.[0]?.codec_name !== "h264" || probe.streams[0].width !== 960 || probe.streams[0].height !== 540 || probe.streams[0].avg_frame_rate !== "30/1" || Number(probe.streams[0].nb_frames) !== 450) throw new Error("approved-raster-motion-canary-video-probe-invalid");

const tileWidth = 480, tileHeight = 270, labelHeight = 34, columns = 3;
const tiles = [];
for (const sample of samples) {
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0c0f13"/><text x="12" y="23" fill="#dfff68" font-family="monospace" font-size="13" font-weight="700">${sample.shotId} · ${sample.phase} · F${sample.frame}</text></svg>`);
  tiles.push(await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "fill"}).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0c0f13"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
}
const contactSheetPath = path.join(tempRoot, "representative-motion-canary-contact-sheet.png");
await sharp({create: {width: columns * tileWidth, height: Math.ceil(tiles.length / columns) * (tileHeight + labelHeight), channels: 4, background: "#0c0f13"}}).composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)}))).png().toFile(contactSheetPath);

const normalized = (file) => sharp(file).resize(320, 180, {fit: "fill"}).removeAlpha().grayscale().raw().toBuffer();
const delta = (left, right) => { let total = 0; for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]); return Number((total / left.length / 255).toFixed(5)); };
const shotAudits = [];
for (const scene of representativeScenes) {
  const shotSamples = samples.filter((sample) => sample.shotId === scene.shotId);
  const [setup, action, hold, source] = await Promise.all([...shotSamples.map((sample) => normalized(sample.file)), normalized(publicPath(scene.source.publicUrl))]);
  const setupToActionDelta = delta(setup, action);
  const actionToHoldDelta = delta(action, hold);
  const stableHoldParityDelta = delta(hold, source);
  const status = (setupToActionDelta >= .01 || actionToHoldDelta >= .01) && setupToActionDelta <= .85 && actionToHoldDelta <= .85 && stableHoldParityDelta <= .005 ? "ACTUAL_PIXEL_GATE_PASS" : "ACTUAL_PIXEL_GATE_FAIL";
  shotAudits.push({shotId: scene.shotId, motionFamily: scene.motionFamily, setupToActionDelta, actionToHoldDelta, stableHoldParityDelta, status});
}
const failures = shotAudits.filter((audit) => audit.status !== "ACTUAL_PIXEL_GATE_PASS").map((audit) => audit.shotId);
const video = outputBinding(videoPath, path.basename(videoPath));
const contactSheet = outputBinding(contactSheetPath, path.basename(contactSheetPath));
const frameBindings = Object.fromEntries(samples.map((sample) => [`${sample.shotId}:${sample.phase}`, outputBinding(sample.file, `review-frames/${path.basename(sample.file)}`)]));
const renderedAt = new Date().toISOString();
const reportBody = {contract: "A1ApprovedMasterRasterSliceMotionCanaryRenderReport/v1", status: failures.length ? "ACTUAL_PIXEL_GATE_FAIL" : "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW", reviewOnly: true, productionAdmitted: false, sourceWorkspaceSha256: initial.workspaceSha256, sourcePlanSha256: plan.planSha256, sourceVisualDecisionLedgerSha256: plan.sourceVisualDecisionLedgerSha256, representativeShotIds: plan.representativeShotIds, composition: {id: composition.id, width: 960, height: 540, fps, durationInFrames: 450, durationSec: 15, codec: "h264"}, mirroredAssets, shotAudits, failures, artifacts: {video, contactSheet, frames: frameBindings}, probe, boundaries: {assemblyCreated: false, fullFilmRendered: false, resolveWritePerformed: false, finalRenderAllowed: false, userVisualApproval: "PENDING"}, renderedAt};
const report = {...reportBody, reportSha256: sha256({...reportBody, renderedAt: undefined})};
const binaryFiles = {[`${outputRelativeRoot}/${path.basename(videoPath)}`]: fs.readFileSync(videoPath), [`${outputRelativeRoot}/${path.basename(contactSheetPath)}`]: fs.readFileSync(contactSheetPath), ...Object.fromEntries(samples.map((sample) => [`${outputRelativeRoot}/review-frames/${path.basename(sample.file)}`, fs.readFileSync(sample.file)]))};
const committed = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== initial.workspaceSha256) throw new Error(`approved-raster-motion-canary-persist-cas:${current.workspaceSha256}`);
  let next = structuredClone(current);
  next.production.motion = {...next.production.motion, status: "representative-motion-canary-ready-for-review", representativeCanary: {contract: report.contract, status: report.status, reportSha256: report.reportSha256, sourcePlanSha256: plan.planSha256, representativeShotIds: plan.representativeShotIds, video, contactSheet, actualPixelGate: {status: failures.length ? "FAIL" : "PASS", failedShotIds: failures}, userVisualApproval: "PENDING", reviewOnly: true, fullFilmRendered: false}, updatedAt: renderedAt};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, renderedAt));
  const event = createProductionEvent({workspace: current, action: "render-approved-master-raster-slice-motion-canary", targetId: plan.planSha256, payload: {status: report.status, reportSha256: report.reportSha256, videoSha256: video.sha256, representativeShotIds: plan.representativeShotIds, failures}, now: renderedAt});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `approved-raster-motion-canary-${renderedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${outputRelativeRoot}/render-report.json`]: report}, binaryFiles});
});
console.log(JSON.stringify({status: report.status, workspaceSha256Before: initial.workspaceSha256, workspaceSha256After: committed.workspaceSha256, reportSha256: report.reportSha256, shotAudits, video, contactSheet, tempRoot}, null, 2));
