#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const appPublicRoot = path.join(appRoot, "public");
const rendererRoot = path.join(root, "remotion-renderer");
const rendererPublicRoot = path.join(rendererRoot, "public");
const phaseRelativeRoot = "generated/system-line/editorial-asset-workbench-v1";
const pilotRelativeRoot = "approved-master-layer-motion-pilot-v2";
const phasePublicRoot = path.join(appPublicRoot, phaseRelativeRoot);
const planPath = path.join(phasePublicRoot, pilotRelativeRoot, "plan.json");
const propsPath = path.join(phasePublicRoot, pilotRelativeRoot, "input-props.json");
const rendererSourcePaths = [
  path.join(rendererRoot, "src/ApprovedMasterLayerMotionPilot.tsx"),
  path.join(rendererRoot, "src/Root.tsx"),
  path.join(root, "lib/a1-motion-ir-parity-v1.js"),
];
const expectedWorkspaceSha256 = process.argv[2];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) {
  throw new Error("approved-master-motion-render-expected-workspace-sha-required");
}

const require = createRequire(path.join(rendererRoot, "package.json"));
const {bundle} = require("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = require("@remotion/renderer");
const sharp = require("sharp");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicPath = (publicUrl) => path.join(appPublicRoot, String(publicUrl).replace(/^\//u, ""));
const rendererPath = (publicUrl) => path.join(rendererPublicRoot, String(publicUrl).replace(/^\//u, ""));
const clampFrame = (value, duration) => Math.max(0, Math.min(duration - 1, value));

function assertSemanticHash(value, key, mode = "body") {
  const expected = value[key];
  const body = structuredClone(value);
  delete body[key];
  if (mode === "plan") delete body.generatedAt;
  const actual = sha256(body);
  if (expected !== actual) throw new Error(`approved-master-motion-${key}-mismatch:${expected}:${actual}`);
}

function bindingsForShot(shot) {
  return [shot.baseFrame, shot.finalComposite, ...Object.values(shot.layers || {}), ...Object.values(shot.workflowActors || {}), ...Object.values(shot.cutouts || {})].filter(Boolean);
}

async function stableReferenceForShot(shot, tempRoot) {
  if (shot.stableReferenceMode === "APPROVED_FINAL_COMPOSITE" || !shot.stableReferenceMode) {
    if (!shot.finalComposite) throw new Error(`approved-master-motion-final-composite-required:${shot.shotId}`);
    return publicPath(shot.finalComposite.publicUrl);
  }
  const output = path.join(tempRoot, `${shot.shotId.toLowerCase()}-stable-reference.png`);
  const base = shot.baseFrame
    ? sharp(publicPath(shot.baseFrame.publicUrl)).resize(960, 540, {fit: "fill"})
    : sharp({create: {width: 960, height: 540, channels: 4, background: "#11161c"}});
  const layerOrder = [shot.layers?.BACKGROUND, shot.layers?.ILLUSTRATION, shot.layers?.ELEMENT_KIT, shot.layers?.TYPOGRAPHY, ...Object.values(shot.workflowActors || {})].filter(Boolean);
  const overlays = [];
  for (const binding of layerOrder) overlays.push({input: await sharp(publicPath(binding.publicUrl)).resize(960, 540, {fit: "fill"}).png().toBuffer(), top: 0, left: 0});
  await base.composite(overlays).png().toFile(output);
  return output;
}

function mirrorAndVerifyAssets(props) {
  const bindings = props.shots.flatMap(bindingsForShot);
  const byUrl = new Map();
  for (const binding of bindings) {
    if (!binding.publicUrl || !/^[a-f0-9]{64}$/u.test(String(binding.sha256 || ""))) throw new Error(`approved-master-motion-invalid-binding:${JSON.stringify(binding)}`);
    const previous = byUrl.get(binding.publicUrl);
    if (previous && previous !== binding.sha256) throw new Error(`approved-master-motion-binding-sha-conflict:${binding.publicUrl}`);
    byUrl.set(binding.publicUrl, binding.sha256);
  }
  const mirrored = [];
  for (const [publicUrl, expectedSha256] of byUrl) {
    const source = publicPath(publicUrl);
    if (!fs.existsSync(source)) throw new Error(`approved-master-motion-source-missing:${publicUrl}`);
    const sourceSha256 = shaFile(source);
    if (sourceSha256 !== expectedSha256) throw new Error(`approved-master-motion-source-sha-mismatch:${publicUrl}:${expectedSha256}:${sourceSha256}`);
    const target = rendererPath(publicUrl);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (!fs.existsSync(target) || shaFile(target) !== sourceSha256) fs.copyFileSync(source, target);
    mirrored.push({publicUrl, sha256: sourceSha256, bytes: fs.statSync(source).size});
  }
  return mirrored;
}

async function normalizedPixels(file, {width = 320, height = 180, grayscale = true} = {}) {
  let image = sharp(file).resize(width, height, {fit: "fill"}).removeAlpha();
  if (grayscale) image = image.grayscale();
  return image.raw().toBuffer();
}

function meanAbsolutePixelDelta(left, right) {
  if (left.length !== right.length) throw new Error(`pixel-buffer-length-mismatch:${left.length}:${right.length}`);
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return Math.round(total / Math.max(1, left.length) / 255 * 100_000) / 100_000;
}

function outputBinding(file, name) {
  return {
    publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${pilotRelativeRoot}/${name}`,
    sha256: shaFile(file),
    bytes: fs.statSync(file).size,
  };
}

const initial = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
if (initial.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`approved-master-motion-render-workspace-cas-failed:${initial.workspaceSha256}`);
if (initial.production.generation.summary.queued !== 0 || initial.production.generation.summary.running !== 0 || initial.production.generation.workerStatus !== "frozen" || initial.production.generation.automaticDispatchAllowed !== false) {
  throw new Error("approved-master-motion-render-frozen-runtime-required");
}

const authority = initial.production.shotIntelligence.representativeApprovedMasterMotionPilot;
const rerenderableStatus = authority?.status === "PLAN_READY_REVIEW_ONLY"
  || (authority?.status === "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW" && authority?.actualVisualReviewStatus === "PENDING");
if (!rerenderableStatus || authority.reviewOnly !== true || authority.promotedRender !== false || authority.wholeFilmMotionAllowed !== false) {
  throw new Error(`approved-master-motion-render-plan-authority-invalid:${authority?.status || "missing"}`);
}

const plan = readJson(planPath);
const inputProps = readJson(propsPath);
assertSemanticHash(plan, "planSha256", "plan");
assertSemanticHash(inputProps, "propsSha256");
if (plan.planSha256 !== authority.planSha256 || plan.propsSha256 !== authority.propsSha256 || inputProps.propsSha256 !== authority.propsSha256) throw new Error("approved-master-motion-render-pointer-mismatch");
if (plan.status !== "PLAN_READY_REVIEW_ONLY" || plan.gates?.representativeRenderAllowed !== true || plan.gates?.wholeFilmMotionAllowed !== false || plan.gates?.finalRenderAllowed !== false) throw new Error("approved-master-motion-render-gate-invalid");
if (inputProps.reviewOnly !== true || inputProps.promotedRender !== false || inputProps.shots.length !== 5) throw new Error("approved-master-motion-render-props-invalid");

const mirroredAssets = mirrorAndVerifyAssets(inputProps);
const rendererSourceSha256 = sha256(rendererSourcePaths.map((file) => ({file: path.relative(root, file), sha256: shaFile(file)})));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-approved-master-motion-pilot-"));
const frameRoot = path.join(tempRoot, "review-frames");
fs.mkdirSync(frameRoot, {recursive: true});
const videoPath = path.join(tempRoot, "representative-motion-pilot-960x540.mp4");
const sheetPath = path.join(tempRoot, "representative-motion-pilot-contact-sheet.png");
const samples = [];
const offsets = [];
let offset = 0;
for (const shot of inputProps.shots) {
  offsets.push({shot, offset});
  offset += shot.durationInFrames - inputProps.overlapInFrames;
}

const serveUrl = await bundle({
  entryPoint: path.join(rendererRoot, "src/index.ts"),
  publicDir: rendererPublicRoot,
  rootDir: rendererRoot,
  enableCaching: false,
});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
let composition;
try {
  composition = await selectComposition({serveUrl, id: "A1ApprovedMasterLayerMotionPilotV1", inputProps, puppeteerInstance: browser, logLevel: "warn"});
  if (composition.durationInFrames !== plan.durationInFrames || composition.fps !== plan.fps || composition.width !== 1920 || composition.height !== 1080) {
    throw new Error(`approved-master-motion-render-composition-mismatch:${composition.durationInFrames}:${composition.fps}:${composition.width}x${composition.height}`);
  }
  for (const {shot, offset: shotOffset} of offsets) {
    const phaseFrames = [
      {phase: "setup", localFrame: shotOffset === 0 ? 0 : 10},
      {phase: "action", localFrame: 34},
      {phase: "stable-hold", localFrame: 78},
    ];
    for (const sample of phaseFrames) {
      const frame = clampFrame(shotOffset + sample.localFrame, composition.durationInFrames);
      const file = path.join(frameRoot, `${shot.shotId.toLowerCase()}-${sample.phase}-f${String(frame).padStart(4, "0")}.png`);
      await renderStill({serveUrl, composition, inputProps, frame, output: file, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
      samples.push({...sample, shotId: shot.shotId, frame, file});
    }
  }
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    outputLocation: videoPath,
    frameRange: [0, composition.durationInFrames - 1],
    scale: .5,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 88,
    crf: 22,
    concurrency: 2,
    hardwareAcceleration: "if-possible",
    overwrite: true,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
} finally {
  await browser.close({silent: true});
}

const tileWidth = 480;
const tileHeight = 270;
const labelHeight = 34;
const tiles = [];
for (const sample of samples) {
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0c0f13"/><text x="12" y="23" fill="#dfff68" font-family="monospace" font-size="13" font-weight="700">${sample.shotId} · ${sample.phase} · F${sample.frame}</text></svg>`);
  const tile = await sharp(sample.file).resize(tileWidth, tileHeight, {fit: "fill"}).extend({top: labelHeight, bottom: 0, left: 0, right: 0, background: "#0c0f13"}).composite([{input: label, top: 0, left: 0}]).png().toBuffer();
  tiles.push(tile);
}
await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * 5, channels: 4, background: "#0c0f13"}}).composite(tiles.map((input, index) => ({input, left: index % 3 * tileWidth, top: Math.floor(index / 3) * (tileHeight + labelHeight)}))).png().toFile(sheetPath);

const minimumMeaningfulDelta = 0.004;
const maximumAllowedPhaseDelta = 0.45;
const maximumStableParityDelta = 0.03;
const shotAudits = [];
for (const {shot} of offsets) {
  const shotSamples = samples.filter((sample) => sample.shotId === shot.shotId);
  const pixels = await Promise.all(shotSamples.map((sample) => normalizedPixels(sample.file)));
  const setupToAction = meanAbsolutePixelDelta(pixels[0], pixels[1]);
  const actionToHold = meanAbsolutePixelDelta(pixels[1], pixels[2]);
  const stableReferencePath = await stableReferenceForShot(shot, tempRoot);
  const finalMasterPixels = await normalizedPixels(stableReferencePath);
  const stableHoldParityDelta = meanAbsolutePixelDelta(pixels[2], finalMasterPixels);
  const meaningfulMotionPass = setupToAction >= minimumMeaningfulDelta || actionToHold >= minimumMeaningfulDelta;
  const boundedMotionPass = setupToAction <= maximumAllowedPhaseDelta && actionToHold <= maximumAllowedPhaseDelta;
  const stableHoldParityPass = stableHoldParityDelta <= maximumStableParityDelta;
  shotAudits.push({
    shotId: shot.shotId,
    mode: shot.mode,
    semanticIntent: shot.semanticIntent,
    phaseFrames: Object.fromEntries(shotSamples.map((sample) => [sample.phase, sample.frame])),
    setupToActionDelta: setupToAction,
    actionToStableHoldDelta: actionToHold,
    meaningfulMotionPass,
    boundedMotionPass,
    stableHoldParityDelta,
    stableHoldParityPass,
    stableReferenceMode: shot.stableReferenceMode || "APPROVED_FINAL_COMPOSITE",
    status: meaningfulMotionPass && boundedMotionPass && stableHoldParityPass ? "ACTUAL_PIXEL_GATE_PASS" : "ACTUAL_PIXEL_GATE_FAIL",
  });
}

const failures = shotAudits.filter((item) => item.status !== "ACTUAL_PIXEL_GATE_PASS").map((item) => item.shotId);
const video = outputBinding(videoPath, path.basename(videoPath));
const contactSheet = outputBinding(sheetPath, path.basename(sheetPath));
const frameBindings = Object.fromEntries(samples.map((sample) => {
  const name = `review-frames/${path.basename(sample.file)}`;
  return [`${sample.shotId}:${sample.phase}`, outputBinding(sample.file, name)];
}));
const renderedAt = new Date().toISOString();
const reportBody = {
  contract: "A1ApprovedMasterLayerMotionPilotRenderReport/v1",
  status: failures.length ? "ACTUAL_PIXEL_GATE_FAIL" : "PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW",
  reviewOnly: true,
  promotedRender: false,
  sourceWorkspaceSha256: initial.workspaceSha256,
  sourcePlanSha256: plan.planSha256,
  sourcePropsSha256: inputProps.propsSha256,
  rendererSourceSha256,
  representativeEditPolicy: "NONCONTIGUOUS_SHOTS_HARD_CUT_AT_OVERLAP_START",
  composition: {id: composition.id, durationInFrames: composition.durationInFrames, durationMs: Math.round(composition.durationInFrames / composition.fps * 1000), fps: composition.fps, width: 960, height: 540, codec: "h264", pixelFormat: "yuv420p", crf: 22},
  mirroredAssetCount: mirroredAssets.length,
  mirroredAssets,
  thresholds: {minimumMeaningfulDelta, maximumAllowedPhaseDelta, maximumStableParityDelta},
  shotAudits,
  failures,
  artifacts: {video, contactSheet, frames: frameBindings},
  gates: {representativeActualPixelGatePassed: failures.length === 0, actualVisualReviewPassed: false, wholeFilmMotionAllowed: false, assemblyAllowed: false, finalRenderAllowed: false},
  renderedAt,
};
const report = {...reportBody, reportSha256: sha256({...reportBody, renderedAt: undefined})};

const binaryFiles = {
  [`${pilotRelativeRoot}/${path.basename(videoPath)}`]: fs.readFileSync(videoPath),
  [`${pilotRelativeRoot}/${path.basename(sheetPath)}`]: fs.readFileSync(sheetPath),
};
for (const sample of samples) binaryFiles[`${pilotRelativeRoot}/review-frames/${path.basename(sample.file)}`] = fs.readFileSync(sample.file);

const committed = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== initial.workspaceSha256) throw new Error(`approved-master-motion-render-persist-cas-failed:${current.workspaceSha256}`);
  const currentPilot = current.production.shotIntelligence.representativeApprovedMasterMotionPilot;
  if (currentPilot?.planSha256 !== plan.planSha256 || currentPilot?.propsSha256 !== inputProps.propsSha256) throw new Error("approved-master-motion-render-current-plan-drift");
  let next = structuredClone(current);
  next.production.shotIntelligence.representativeApprovedMasterMotionPilot = {
    ...currentPilot,
    status: report.status,
    reportSha256: report.reportSha256,
    video,
    contactSheet,
    actualPixelGate: {status: failures.length ? "FAIL" : "PASS", shotCount: shotAudits.length, failedShotIds: failures, thresholds: report.thresholds},
    actualVisualReviewStatus: "PENDING",
    wholeFilmMotionAllowed: false,
    updatedAt: renderedAt,
  };
  next.production.shotIntelligence.approvedMasterLayerPilot = {
    ...next.production.shotIntelligence.approvedMasterLayerPilot,
    status: failures.length ? "REPRESENTATIVE_MOTION_PIXEL_GATE_FAIL" : "REPRESENTATIVE_MOTION_PREVIEW_READY_FOR_ACTUAL_PIXEL_REVIEW",
    representativeMotionRenderReportSha256: report.reportSha256,
    wholeFilmExpansionAllowed: false,
  };
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, renderedAt));
  const event = createProductionEvent({workspace: current, action: "render-approved-master-layer-motion-pilot", targetId: plan.shotIds.join(","), payload: {status: report.status, reportSha256: report.reportSha256, videoSha256: video.sha256, contactSheetSha256: contactSheet.sha256, failedShotIds: failures, reviewOnly: true}, now: renderedAt});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `approved-master-motion-render-${renderedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {[`${pilotRelativeRoot}/render-report.json`]: report},
    binaryFiles,
  });
});

console.log(JSON.stringify({
  status: report.status,
  workspaceSha256Before: initial.workspaceSha256,
  workspaceSha256After: committed.workspaceSha256,
  reportSha256: report.reportSha256,
  shotAudits,
  video,
  contactSheet,
  tempRoot,
  wholeFilmMotionAllowed: false,
}, null, 2));
