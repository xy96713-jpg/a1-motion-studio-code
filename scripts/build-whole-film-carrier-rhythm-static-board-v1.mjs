#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const sourceRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(sourceRoot, "whole-film-carrier-rhythm-static-board-v1");
const workspacePath = path.join(sourceRoot, "workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const openingPath = path.join(sourceRoot, "opening-nine-carrier-rhythm-canary-v1/manifest.json");
const midfilmPath = path.join(sourceRoot, "midfilm-eleven-carrier-rhythm-canary-v1/manifest.json");
const carrierPlanPath = path.join(sourceRoot, "whole-film-carrier-rhythm-candidate-v1/plan.json");
const mediaReportPath = path.join(sourceRoot, "imported-film-media-v1/film-media-discovery-v1-latest.json");
const brightBackgroundPath = path.join(root, ".codex-artifacts/system-progress-system-line/background-library-review-v1/01-cool-halftone-quiet-field.png");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const boardPath = path.join(outputRoot, "whole-film-carrier-rhythm-board.png");
const manifestPath = path.join(outputRoot, "manifest.json");
const normalizedFrameRoot = path.join(outputRoot, "normalized-current-frames");
const presenterFrameRoot = path.join(outputRoot, "timeline-presenter-frames");
const width = 960;
const height = 540;

const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const relative = (filePath) => path.relative(root, filePath);
const publicUrl = (filePath) => `/${path.relative(publicRoot, filePath)}`;
const atomicWriteJson = (filePath, value) => {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
};
const resolvePublicUrl = (url) => path.join(publicRoot, url.replace(/^\//u, ""));
for (const filePath of [workspacePath, phasePath, openingPath, midfilmPath, carrierPlanPath, mediaReportPath, brightBackgroundPath]) {
  if (!fs.existsSync(filePath)) throw new Error(`whole-film-carrier-board-input-missing:${relative(filePath)}`);
}
const authorityBefore = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const opening = JSON.parse(fs.readFileSync(openingPath, "utf8"));
const midfilm = JSON.parse(fs.readFileSync(midfilmPath, "utf8"));
const carrierPlan = JSON.parse(fs.readFileSync(carrierPlanPath, "utf8"));
const mediaReport = JSON.parse(fs.readFileSync(mediaReportPath, "utf8"));
if (carrierPlan.status !== "SYSTEM_DIRECTION_PLAN_READY_CANDIDATE_ONLY") throw new Error("whole-film-carrier-plan-not-ready");
const timelineItems = workspace.production.shotIntelligence.wholeFilmStaticBoard.timelineBoard.items;
if (timelineItems.length !== 34) throw new Error(`whole-film-carrier-board-shot-count:${timelineItems.length}`);
const candidateEntryByShotId = new Map([...opening.entries, ...midfilm.entries].map((entry) => [entry.shotId, entry]));
const carrierByShotId = new Map(carrierPlan.plans.map((plan) => [plan.shotId, plan]));
fs.mkdirSync(normalizedFrameRoot, {recursive: true});
fs.mkdirSync(presenterFrameRoot, {recursive: true});
const presenterVideoPath = resolvePublicUrl(mediaReport.imported.presenter.publicUrl);
if (!fs.existsSync(presenterVideoPath) || sha256File(presenterVideoPath) !== mediaReport.imported.presenter.sha256) throw new Error("whole-film-carrier-board-presenter-video-invalid");
const presenterBaseShotIds = carrierPlan.plans.filter((plan) => plan.candidateCarrier === "PRESENTER_BASE").map((plan) => plan.shotId);
const presenterCardShotIds = new Set(["ED-11", "ED-18", "ED-32"]);
const brightBackgroundMetadata = await sharp(brightBackgroundPath).metadata();
const brightTexture = await sharp(brightBackgroundPath)
  .extract({left: Math.floor((brightBackgroundMetadata.width || 1920) * 0.5), top: 0, width: Math.ceil((brightBackgroundMetadata.width || 1920) * 0.5), height: brightBackgroundMetadata.height || 1080})
  .resize(width, height, {fit: "cover"})
  .modulate({brightness: 1.02, saturation: 0.58})
  .png()
  .toBuffer();
const timelinePresenterFrameByShotId = new Map();
for (const shotId of presenterBaseShotIds) {
  const item = timelineItems.find((candidate) => candidate.shotId === shotId);
  const atMs = Math.round((item.timeRange.startMs + item.timeRange.endMs) / 2);
  const rawPath = path.join(presenterFrameRoot, `${shotId}-raw.png`);
  run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", presenterVideoPath, "-frames:v", "1", "-vf", "scale=960:540:force_original_aspect_ratio=increase,crop=960:540", rawPath]);
  let framePath = rawPath;
  if (presenterCardShotIds.has(shotId)) {
    const cardImage = await sharp(rawPath).resize(806, 453, {fit: "cover"}).png().toBuffer();
    const card = await sharp({create: {width: 822, height: 469, channels: 4, background: "#111617"}}).composite([{input: cardImage, left: 8, top: 8}]).png().toBuffer();
    framePath = path.join(presenterFrameRoot, `${shotId}.png`);
    await sharp(brightTexture).composite([{input: card, left: 69, top: 36}]).png().toFile(framePath);
  }
  timelinePresenterFrameByShotId.set(shotId, {framePath, rawPath, atMs});
}

const dHash = async (filePath) => {
  const pixels = await sharp(filePath).grayscale().resize(9, 8, {fit: "fill"}).raw().toBuffer();
  let value = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      value = (value << 1n) | BigInt(pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
    }
  }
  return value.toString(16).padStart(16, "0");
};
const hamming = (left, right) => {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
};
const entries = [];
for (const item of timelineItems) {
  const canaryEntry = candidateEntryByShotId.get(item.shotId);
  const presenterOverride = timelinePresenterFrameByShotId.get(item.shotId);
  const sourceFramePath = canaryEntry ? path.join(root, canaryEntry.candidateFrame.path) : presenterOverride ? presenterOverride.framePath : resolvePublicUrl(item.previewPublicUrl);
  if (!fs.existsSync(sourceFramePath)) throw new Error(`whole-film-carrier-board-frame-missing:${item.shotId}`);
  const expectedSha256 = canaryEntry?.candidateFrame?.sha256 || (presenterOverride ? sha256File(presenterOverride.framePath) : item.preview?.sha256 || item.artifactSha256 || null);
  const sourceMeasuredSha256 = sha256File(sourceFramePath);
  if (expectedSha256 && sourceMeasuredSha256 !== expectedSha256) throw new Error(`whole-film-carrier-board-frame-sha:${item.shotId}`);
  if (!expectedSha256 && !presenterOverride && item.preview?.kind !== "VERIFIED_SCREEN_SOURCE") throw new Error(`whole-film-carrier-board-frame-unbound:${item.shotId}`);
  const sourceMetadata = await sharp(sourceFramePath).metadata();
  let framePath = sourceFramePath;
  if (sourceMetadata.width !== width || sourceMetadata.height !== height) {
    framePath = path.join(normalizedFrameRoot, `${item.shotId}.png`);
    await sharp(sourceFramePath).resize(width, height, {fit: "cover"}).png().toFile(framePath);
  }
  const measuredSha256 = sha256File(framePath);
  const stats = await sharp(framePath).stats();
  const means = stats.channels.slice(0, 3).map((channel) => channel.mean);
  const luminance = Number((0.2126 * means[0] + 0.7152 * means[1] + 0.0722 * means[2]).toFixed(2));
  const luminanceBucket = luminance < 85 ? "DARK" : luminance > 175 ? "LIGHT" : "MID";
  const carrier = carrierByShotId.get(item.shotId);
  entries.push({
    shotId: item.shotId,
    timeRange: item.timeRange,
    sourceText: item.sourceText,
    semanticRoute: carrier.semanticRoute,
    candidateCarrier: carrier.candidateCarrier,
    carrierFamily: carrier.carrierFamily,
    evidencePreserved: carrier.evidencePreserved,
    frameOrigin: canaryEntry ? (opening.entries.some((entry) => entry.shotId === item.shotId) ? "OPENING_NINE_CANARY" : "MIDFILM_ELEVEN_CANARY") : presenterOverride ? (presenterCardShotIds.has(item.shotId) ? "TIMELINE_EXACT_PRESENTER_CARD" : "TIMELINE_EXACT_PRESENTER_FRAME") : "CURRENT_CANONICAL_FRAME_UNCHANGED",
    presenterTimelineBinding: presenterOverride ? {atMs: presenterOverride.atMs, rawFramePath: relative(presenterOverride.rawPath), rawFrameSha256: sha256File(presenterOverride.rawPath), presenterVideoSha256: mediaReport.imported.presenter.sha256} : null,
    sourceFrame: {path: relative(sourceFramePath), sha256: sourceMeasuredSha256, width: sourceMetadata.width, height: sourceMetadata.height},
    frame: {path: relative(framePath), publicUrl: publicUrl(framePath), sha256: measuredSha256, width, height},
    pixelMetrics: {luminance, luminanceBucket, dHash: await dHash(framePath)},
  });
}
const duplicatePairs = [];
for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
    const distance = hamming(entries[leftIndex].pixelMetrics.dHash, entries[rightIndex].pixelMetrics.dHash);
    if (distance <= 4) duplicatePairs.push({leftShotId: entries[leftIndex].shotId, rightShotId: entries[rightIndex].shotId, distance});
  }
}
const luminanceRuns = [];
for (const entry of entries) {
  const previous = luminanceRuns.at(-1);
  if (previous?.bucket === entry.pixelMetrics.luminanceBucket) previous.shotIds.push(entry.shotId);
  else luminanceRuns.push({bucket: entry.pixelMetrics.luminanceBucket, shotIds: [entry.shotId]});
}
const longestLuminanceRun = Math.max(...luminanceRuns.map((run) => run.shotIds.length));

fs.mkdirSync(outputRoot, {recursive: true});
const tileWidth = 480;
const imageHeight = 270;
const labelHeight = 58;
const columns = 4;
const composites = [];
for (const [index, entry] of entries.entries()) {
  const image = await sharp(path.join(root, entry.frame.path)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0e10"/><rect width="5" height="100%" fill="#315dff"/><text x="16" y="20" fill="#f2efe4" font-size="14" font-weight="700" font-family="monospace">${entry.shotId} · ${(entry.timeRange.startMs / 1000).toFixed(1)}–${(entry.timeRange.endMs / 1000).toFixed(1)}s</text><text x="16" y="40" fill="#8ea0ff" font-size="10" font-family="monospace">${entry.candidateCarrier}</text><text x="410" y="40" fill="${entry.pixelMetrics.luminanceBucket === "DARK" ? "#78827c" : "#dfff68"}" font-size="10" font-family="monospace">${entry.pixelMetrics.luminanceBucket}</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 3, background: "#0b0e10"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
  composites.push({input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (imageHeight + labelHeight)});
}
const rows = Math.ceil(entries.length / columns);
await sharp({create: {width: columns * tileWidth, height: rows * (imageHeight + labelHeight), channels: 3, background: "#0b0e10"}}).composite(composites).png().toFile(boardPath);

const summary = {
  shotCount: entries.length,
    canaryFrameCount: entries.filter((entry) => entry.frameOrigin.includes("CANARY")).length,
    timelineExactPresenterFrameCount: entries.filter((entry) => entry.frameOrigin.startsWith("TIMELINE_EXACT_PRESENTER")).length,
    presenterCardCount: entries.filter((entry) => entry.frameOrigin === "TIMELINE_EXACT_PRESENTER_CARD").length,
  unchangedCurrentFrameCount: entries.filter((entry) => entry.frameOrigin === "CURRENT_CANONICAL_FRAME_UNCHANGED").length,
  carrierMix: carrierPlan.summary,
  luminanceCounts: Object.fromEntries(["DARK", "MID", "LIGHT"].map((bucket) => [bucket, entries.filter((entry) => entry.pixelMetrics.luminanceBucket === bucket).length])),
  longestSameLuminanceBucketRun: longestLuminanceRun,
  nearDuplicatePairCount: duplicatePairs.length,
};
const authorityAfter = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("whole-film-carrier-board-mutated-current-authority");
const manifestBody = {
  contract: "A1WholeFilmCarrierRhythmStaticBoard/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY",
  sourceBindings: {
    workspace: {path: relative(workspacePath), sha256: authorityBefore.workspaceSha256},
    phase: {path: relative(phasePath), sha256: authorityBefore.phaseSha256},
    openingCanary: {path: relative(openingPath), sha256: sha256File(openingPath)},
    midfilmCanary: {path: relative(midfilmPath), sha256: sha256File(midfilmPath)},
    carrierPlan: {path: relative(carrierPlanPath), sha256: sha256File(carrierPlanPath), reportSha256: carrierPlan.reportSha256},
  },
  output: {path: relative(boardPath), publicUrl: publicUrl(boardPath), sha256: sha256File(boardPath), width: columns * tileWidth, height: rows * (imageHeight + labelHeight)},
  summary,
  luminanceRuns,
  duplicatePairs,
  entries,
  checks: {
    exactThirtyFourShotOrder: entries.every((entry, index) => entry.shotId === `ED-${String(index + 1).padStart(2, "0")}`),
    exactCurrentSemanticWindows: entries.every((entry, index) => entry.timeRange.startMs === timelineItems[index].timeRange.startMs && entry.timeRange.endMs === timelineItems[index].timeRange.endMs),
    allScreenEvidencePreserved: entries.filter((entry) => entry.semanticRoute === "SCREEN_EVIDENCE").every((entry) => entry.evidencePreserved),
    allFramesActual960x540: entries.every((entry) => entry.frame.width === width && entry.frame.height === height),
    longestCarrierFamilyRunAtMostTwo: carrierPlan.summary.longestSameCarrierFamilyRun <= 2,
    generatedFormalTextAdded: false,
    presenterFaceRegenerated: false,
    currentAuthorityMutated: false,
  },
  visualReviewBoundary: {
    machineMetricsDoNotEqualTasteApproval: true,
    duplicatePairsAreReviewSignalsNotAutomaticFailures: true,
    luminanceMixDoesNotProveCompositionQuality: true,
  },
  boundary: {candidateOnly: true, canonicalSelectionMutated: false, currentAuthorityMutated: false, motionProduced: false, resolveWritten: false, finalRender: false, userVisualApproval: "NOT_APPROVED"},
};
const manifest = {...manifestBody, manifestSha256: sha256Value(manifestBody)};
atomicWriteJson(manifestPath, manifest);
console.log(JSON.stringify({status: manifest.status, outputPath: manifest.output.path, outputSha256: manifest.output.sha256, summary, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
