#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {verifyFontGlyphOutlineProof} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {enforceMediaEntrypointAuthorization, PACKAGING_AUTHORIZATION_STAGES} from "../apps/studio-next/src/lib/a1-packaging-authorization-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const appPublicRoot = path.join(appRoot, "public");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicRoot = path.join(rendererRoot, "public");
const phaseRelativeRoot = "generated/system-line/editorial-asset-workbench-v1";
const pilotRelativeRoot = "approved-master-layer-motion-pilot-v4";
const phasePublicRoot = path.join(appPublicRoot, phaseRelativeRoot);
const pilotRoot = path.join(phasePublicRoot, pilotRelativeRoot);
const expectedWorkspaceSha256 = process.argv[2];
const authorizationBinding = enforceMediaEntrypointAuthorization({
  appRoot,
  receiptPath: process.env.A1_MOTION_PREVIEW_AUTH_RECEIPT,
  stage: PACKAGING_AUTHORIZATION_STAGES.MOTION_PREVIEW,
  entrypointId: "representative-motion-v4-history-preview",
  targetId: "REPRESENTATIVE_MOTION_V4_HISTORY_COMPATIBILITY_PREVIEW",
  outputRoute: "COMPOSITE_COMPATIBILITY_PREVIEW",
});
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("representative-motion-v4-render-expected-workspace-sha-required");
if (authorizationBinding.workspaceSha256 !== expectedWorkspaceSha256) throw new Error("representative-motion-v4-authorization-workspace-argument-mismatch");
const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicPath = (publicUrl) => path.join(appPublicRoot, publicUrl.replace(/^\//u, ""));
const rendererPath = (publicUrl) => path.join(rendererPublicRoot, publicUrl.replace(/^\//u, ""));
const outputBinding = (file, name) => ({publicUrl: `/${phaseRelativeRoot}/${pilotRelativeRoot}/${name}`, sha256: shaFile(file), bytes: fs.statSync(file).size});
const assertHash = (value, key, dropGeneratedAt = false) => { const body = structuredClone(value); const expected = body[key]; delete body[key]; if (dropGeneratedAt) delete body.generatedAt; const actual = sha256(body); if (actual !== expected) throw new Error(`representative-motion-v4-${key}-mismatch:${expected}:${actual}`); };

const initial = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const fontProof = readJson(path.join(pilotRoot, "shot-assets/ED-31/actual-pixel-font-proof.json"));
verifyFontGlyphOutlineProof({proof: fontProof, fontPath: path.join(phasePublicRoot, "font-cache/fusion-pixel.ttf"), expectedFontSha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"});
if (initial.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`representative-motion-v4-render-workspace-cas-failed:${initial.workspaceSha256}`);
if (initial.production.generation.summary.queued !== 0 || initial.production.generation.summary.running !== 0 || initial.production.generation.workerStatus !== "frozen" || initial.production.generation.automaticDispatchAllowed !== false) throw new Error("representative-motion-v4-render-frozen-runtime-required");
const authority = initial.production.shotIntelligence.representativeApprovedMasterMotionPilot;
const stagedPlan = initial.production.shotIntelligence.representativeMotionV4StagedPlan;
if (!String(authority?.publicUrl || "").includes("approved-master-layer-motion-pilot-v2") || stagedPlan?.status !== "PLAN_READY_REVIEW_ONLY_STAGED_NOT_CURRENT" || stagedPlan.workbenchCurrent !== false) throw new Error("representative-motion-v4-render-staged-plan-required-with-v2-current");
const plan = readJson(path.join(pilotRoot, "plan.json"));
const inputProps = readJson(path.join(pilotRoot, "input-props.json"));
assertHash(plan, "planSha256", true);
assertHash(inputProps, "propsSha256");
if (plan.contract !== "A1RepresentativeMotionV4Plan/v1" || plan.planSha256 !== stagedPlan.planSha256 || inputProps.propsSha256 !== stagedPlan.propsSha256 || plan.changedShotIds.join(",") !== "ED-31" || plan.reusedShotIds.join(",") !== "ED-10,ED-13,ED-14,ED-17") throw new Error("representative-motion-v4-render-plan-pointer-invalid");
const v2Video = path.join(phasePublicRoot, "approved-master-layer-motion-pilot-v2/representative-motion-pilot-960x540.mp4");
const v2Report = readJson(path.join(phasePublicRoot, "approved-master-layer-motion-pilot-v2/render-report.json"));
if (shaFile(v2Video) !== "2091323026da9d823739b9b5777b83518b7aa0bad4eccb13d3db384908b2514e" || v2Report.status !== "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW" || v2Report.failures.length !== 0) throw new Error("representative-motion-v4-v2-reuse-source-invalid");
const priorV4Video = path.join(phasePublicRoot, "approved-master-layer-motion-pilot-v4/representative-motion-pilot-960x540.mp4");
const priorV4Report = readJson(path.join(phasePublicRoot, "approved-master-layer-motion-pilot-v4/render-report.json"));
if (!fs.existsSync(priorV4Video)) throw new Error("representative-motion-v4-ed13-reuse-video-missing");

const bindings = inputProps.shots.flatMap((shot) => [shot.baseFrame, shot.finalComposite, ...Object.values(shot.layers || {}), ...Object.values(shot.workflowActors || {})].filter(Boolean));
const mirrored = [];
for (const binding of new Map(bindings.map((item) => [item.publicUrl, item])).values()) {
  const source = publicPath(binding.publicUrl);
  if (!fs.existsSync(source) || shaFile(source) !== binding.sha256) throw new Error(`representative-motion-v4-binding-invalid:${binding.publicUrl}`);
  const target = rendererPath(binding.publicUrl);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (!fs.existsSync(target) || shaFile(target) !== binding.sha256) fs.copyFileSync(source, target);
  mirrored.push({publicUrl: binding.publicUrl, sha256: binding.sha256, bytes: fs.statSync(source).size});
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-representative-motion-v4-"));
const framesRoot = path.join(tempRoot, "frames");
fs.mkdirSync(framesRoot, {recursive: true});
const changedClips = [{shotId: "ED-31", start: 396, end: 500}];
const serveUrl = await bundle({entryPoint: path.join(rendererRoot, "src/index.ts"), publicDir: rendererPublicRoot, rootDir: rendererRoot, enableCaching: false});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
let composition;
try {
  composition = await selectComposition({serveUrl, id: "A1ApprovedMasterLayerMotionPilotV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  if (composition.durationInFrames !== 501 || composition.fps !== 30 || composition.width !== 1920 || composition.height !== 1080) throw new Error("representative-motion-v4-composition-mismatch");
  for (const clip of changedClips) {
    clip.file = path.join(tempRoot, `${clip.shotId.toLowerCase()}-changed.mp4`);
    await renderMedia({serveUrl, composition, inputProps, outputLocation: clip.file, frameRange: [clip.start, clip.end], scale: .5, codec: "h264", pixelFormat: "yuv420p", imageFormat: "jpeg", jpegQuality: 90, crf: 20, concurrency: 2, hardwareAcceleration: "if-possible", overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
  }
} finally {
  await browser.close({silent: true});
}

execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", v2Video, "-start_number", "0", path.join(framesRoot, "f%04d.png")]);
const priorV4FramesRoot = path.join(tempRoot, "prior-v4-frames");
fs.mkdirSync(priorV4FramesRoot, {recursive: true});
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", priorV4Video, "-start_number", "0", path.join(priorV4FramesRoot, "f%04d.png")]);
for (let frame = 99; frame <= 197; frame += 1) fs.copyFileSync(path.join(priorV4FramesRoot, `f${String(frame).padStart(4, "0")}.png`), path.join(framesRoot, `f${String(frame).padStart(4, "0")}.png`));
for (const clip of changedClips) execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", clip.file, "-start_number", String(clip.start), path.join(framesRoot, "f%04d.png")]);
const frameFiles = fs.readdirSync(framesRoot).filter((name) => /^f\d{4}\.png$/u.test(name)).sort();
if (frameFiles.length !== 501 || frameFiles[0] !== "f0000.png" || frameFiles.at(-1) !== "f0500.png") throw new Error(`representative-motion-v4-frame-set-invalid:${frameFiles.length}:${frameFiles[0]}:${frameFiles.at(-1)}`);
const videoPath = path.join(tempRoot, "representative-motion-pilot-960x540.mp4");
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-framerate", "30", "-start_number", "0", "-i", path.join(framesRoot, "f%04d.png"), "-frames:v", "501", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", videoPath]);
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_name,width,height,avg_frame_rate,nb_frames:format=duration,size", "-of", "json", videoPath], {encoding: "utf8"}));
if (probe.streams?.[0]?.codec_name !== "h264" || probe.streams[0].width !== 960 || probe.streams[0].height !== 540 || probe.streams[0].avg_frame_rate !== "30/1" || Number(probe.streams[0].nb_frames) !== 501) throw new Error("representative-motion-v4-output-probe-invalid");

const samples = [
  ["ED-10", 0, 34, 78], ["ED-13", 109, 133, 177], ["ED-14", 208, 232, 276], ["ED-17", 307, 331, 375], ["ED-31", 406, 430, 474],
].flatMap(([shotId, setup, action, hold]) => [["setup", setup], ["action", action], ["stable-hold", hold]].map(([phase, frame]) => ({shotId, phase, frame, file: path.join(framesRoot, `f${String(frame).padStart(4, "0")}.png`)})));
const reviewFrameBuffers = Object.fromEntries(samples.map((sample) => [`review-frames/${sample.shotId.toLowerCase()}-${sample.phase}-f${String(sample.frame).padStart(4, "0")}.png`, fs.readFileSync(sample.file)]));
const contactTileWidth = 480, contactTileHeight = 270, contactLabelHeight = 34;
const contactTiles = [];
for (const sample of samples) {
  const label = Buffer.from(`<svg width="${contactTileWidth}" height="${contactLabelHeight}"><rect width="100%" height="100%" fill="#0c0f13"/><text x="12" y="23" fill="#dfff68" font-family="monospace" font-size="13" font-weight="700">${sample.shotId} · ${sample.phase} · F${sample.frame}</text></svg>`);
  contactTiles.push(await sharp(sample.file).resize(contactTileWidth, contactTileHeight, {fit: "fill"}).extend({top: contactLabelHeight, bottom: 0, left: 0, right: 0, background: "#0c0f13"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
}
const contactSheetPath = path.join(tempRoot, "representative-motion-pilot-contact-sheet.png");
await sharp({create: {width: contactTileWidth * 3, height: (contactTileHeight + contactLabelHeight) * 5, channels: 4, background: "#0c0f13"}}).composite(contactTiles.map((input, index) => ({input, left: index % 3 * contactTileWidth, top: Math.floor(index / 3) * (contactTileHeight + contactLabelHeight)}))).png().toFile(contactSheetPath);

const timelineFrames = Array.from({length: 84}, (_, index) => Math.min(500, index * 6));
const timelineTileWidth = 240, timelineTileHeight = 135, timelineLabelHeight = 20, timelineColumns = 7;
const timelineTiles = [];
for (const frame of timelineFrames) {
  const label = Buffer.from(`<svg width="${timelineTileWidth}" height="${timelineLabelHeight}"><rect width="100%" height="100%" fill="#0c0f13"/><text x="7" y="14" fill="#dfff68" font-family="monospace" font-size="10">F${String(frame).padStart(4, "0")} · ${(frame / 30).toFixed(1)}s</text></svg>`);
  timelineTiles.push(await sharp(path.join(framesRoot, `f${String(frame).padStart(4, "0")}.png`)).resize(timelineTileWidth, timelineTileHeight, {fit: "fill"}).extend({top: timelineLabelHeight, bottom: 0, left: 0, right: 0, background: "#0c0f13"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer());
}
const timelineRows = Math.ceil(timelineTiles.length / timelineColumns);
const timelinePath = path.join(tempRoot, "representative-motion-pilot-timeline-5fps.png");
await sharp({create: {width: timelineColumns * timelineTileWidth, height: timelineRows * (timelineTileHeight + timelineLabelHeight), channels: 4, background: "#0c0f13"}}).composite(timelineTiles.map((input, index) => ({input, left: index % timelineColumns * timelineTileWidth, top: Math.floor(index / timelineColumns) * (timelineTileHeight + timelineLabelHeight)}))).png().toFile(timelinePath);

const normalized = (file) => sharp(file).resize(320, 180, {fit: "fill"}).removeAlpha().grayscale().raw().toBuffer();
const delta = (left, right) => { let total = 0; for (let i = 0; i < left.length; i += 1) total += Math.abs(left[i] - right[i]); return Math.round(total / left.length / 255 * 100000) / 100000; };
const changedAudits = [];
for (const shotId of [...plan.changedShotIds, "ED-13"]) {
  const shot = inputProps.shots.find((item) => item.shotId === shotId);
  const shotSamples = samples.filter((item) => item.shotId === shotId);
  const [setupPixels, actionPixels, holdPixels] = await Promise.all(shotSamples.map((sample) => normalized(sample.file)));
  const referencePixels = await normalized(publicPath(shot.finalComposite.publicUrl));
  const setupToActionDelta = delta(setupPixels, actionPixels);
  const actionToStableHoldDelta = delta(actionPixels, holdPixels);
  const stableHoldParityDelta = delta(holdPixels, referencePixels);
  const meaningfulMotionPass = setupToActionDelta >= .004 || actionToStableHoldDelta >= .004;
  const boundedMotionPass = setupToActionDelta <= .45 && actionToStableHoldDelta <= .45;
  const stableHoldParityPass = stableHoldParityDelta <= .04;
  changedAudits.push({shotId, mode: shot.mode, phaseFrames: Object.fromEntries(shotSamples.map((item) => [item.phase, item.frame])), setupToActionDelta, actionToStableHoldDelta, stableHoldParityDelta, meaningfulMotionPass, boundedMotionPass, stableHoldParityPass, status: meaningfulMotionPass && boundedMotionPass && stableHoldParityPass ? "ACTUAL_PIXEL_GATE_PASS" : "ACTUAL_PIXEL_GATE_FAIL", ...(shotId === "ED-13" ? {reuseEvidence: {sourceVideoSha256: shaFile(priorV4Video), sourceActualPixelStatus: "RECOMPUTED_FROM_DECODED_FRAMES", decodedFramesReused: true, reason: "ED13_UNCHANGED_DURING_PIXEL_FONT_REPAIR"}} : {})});
}
const reusedAudits = [
  ...v2Report.shotAudits.filter((item) => ["ED-10", "ED-14", "ED-17"].includes(item.shotId)).map((item) => ({...item, status: item.status, reuseEvidence: {sourceVideoSha256: shaFile(v2Video), sourceReportSha256: v2Report.reportSha256, sourceActualPixelStatus: item.status, decodedFramesReused: true}})),
];
const shotAudits = plan.shotIds.map((shotId) => changedAudits.find((item) => item.shotId === shotId) || reusedAudits.find((item) => item.shotId === shotId));
const failures = shotAudits.filter((item) => item.status !== "ACTUAL_PIXEL_GATE_PASS").map((item) => item.shotId);
const video = outputBinding(videoPath, path.basename(videoPath));
const contactSheet = outputBinding(contactSheetPath, path.basename(contactSheetPath));
const timeline = {...outputBinding(timelinePath, path.basename(timelinePath)), sampleRateFps: 5, frameCount: timelineFrames.length};
const frameBindings = Object.fromEntries(samples.map((sample) => [`${sample.shotId}:${sample.phase}`, outputBinding(sample.file, `review-frames/${sample.shotId.toLowerCase()}-${sample.phase}-f${String(sample.frame).padStart(4, "0")}.png`)]));
const renderedAt = new Date().toISOString();
const reportBody = {contract: "A1RepresentativeMotionV4RenderReport/v1", status: failures.length ? "ACTUAL_PIXEL_GATE_FAIL" : "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW_STAGED_NOT_CURRENT", reviewOnly: true, promotedRender: false, workbenchCurrent: false, sourceWorkspaceSha256: initial.workspaceSha256, sourcePlanSha256: plan.planSha256, sourcePropsSha256: inputProps.propsSha256, sourceV2VideoSha256: shaFile(v2Video), sourceV2ReportSha256: v2Report.reportSha256, sourcePriorV4VideoSha256: shaFile(priorV4Video), sourcePriorV4ReportSha256: null, priorV4ReportTrustedForAdmission: false, ed13ReuseValidation: "RECOMPUTED_FROM_DECODED_FRAMES_AGAINST_CURRENT_STABLE_COMPOSITE", rendererSourceSha256: sha256(["remotion-renderer/src/ApprovedMasterLayerMotionPilot.tsx", "remotion-renderer/src/Root.tsx", "lib/a1-motion-ir-parity-v1.js"].map((file) => ({file, sha256: shaFile(path.join(root, file))}))), reusePolicy: plan.reusePolicy, changedShotIds: plan.changedShotIds, reusedShotIds: plan.reusedShotIds, composition: {id: composition.id, durationInFrames: 501, durationMs: 16700, fps: 30, width: 960, height: 540, codec: "h264", pixelFormat: "yuv420p", crf: 20}, mirroredAssets: mirrored, shotAudits, failures, artifacts: {video, contactSheet, timeline, frames: frameBindings}, probe, gates: {representativeActualPixelGatePassed: failures.length === 0, actualVisualReviewPassed: false, workbenchCurrentAllowed: false, wholeFilmMotionAllowed: false, assemblyAllowed: false, finalRenderAllowed: false}, renderedAt};
const report = {...reportBody, reportSha256: sha256({...reportBody, renderedAt: undefined})};
const binaryFiles = {[`${pilotRelativeRoot}/${path.basename(videoPath)}`]: fs.readFileSync(videoPath), [`${pilotRelativeRoot}/${path.basename(contactSheetPath)}`]: fs.readFileSync(contactSheetPath), [`${pilotRelativeRoot}/${path.basename(timelinePath)}`]: fs.readFileSync(timelinePath), ...Object.fromEntries(Object.entries(reviewFrameBuffers).map(([name, buffer]) => [`${pilotRelativeRoot}/${name}`, buffer]))};
const committed = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== initial.workspaceSha256) throw new Error(`representative-motion-v4-render-persist-cas-failed:${current.workspaceSha256}`);
  const pilot = current.production.shotIntelligence.representativeApprovedMasterMotionPilot;
  const currentStagedPlan = current.production.shotIntelligence.representativeMotionV4StagedPlan;
  if (!String(pilot?.publicUrl || "").includes("approved-master-layer-motion-pilot-v2") || currentStagedPlan?.planSha256 !== plan.planSha256 || currentStagedPlan?.propsSha256 !== inputProps.propsSha256) throw new Error("representative-motion-v4-render-staged-plan-drift");
  let next = structuredClone(current);
  next.production.shotIntelligence.representativeMotionV4StagedPreview = {...currentStagedPlan, status: report.status, reportSha256: report.reportSha256, video, contactSheet, timelineContactSheet: timeline, actualPixelGate: {status: failures.length ? "FAIL" : "PASS", shotCount: shotAudits.length, failedShotIds: failures}, actualVisualReviewStatus: "PENDING", workbenchCurrent: false, updatedAt: renderedAt};
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, renderedAt));
  const event = createProductionEvent({workspace: current, action: "render-representative-motion-v4", targetId: plan.changedShotIds.join(","), payload: {status: report.status, reportSha256: report.reportSha256, videoSha256: video.sha256, changedShotIds: plan.changedShotIds, reusedShotIds: plan.reusedShotIds, failures}, now: renderedAt});
  next.production.eventLedger.eventCount += 1; next.production.eventLedger.lastEventId = event.eventId; next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `representative-motion-v4-render-${renderedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${pilotRelativeRoot}/render-report.json`]: report}, binaryFiles});
});
console.log(JSON.stringify({status: report.status, workspaceSha256Before: initial.workspaceSha256, workspaceSha256After: committed.workspaceSha256, transitionSha256: committed.transitionSha256, reportSha256: report.reportSha256, changedShotIds: plan.changedShotIds, reusedShotIds: plan.reusedShotIds, shotAudits, video, contactSheet, timeline, tempRoot}, null, 2));
