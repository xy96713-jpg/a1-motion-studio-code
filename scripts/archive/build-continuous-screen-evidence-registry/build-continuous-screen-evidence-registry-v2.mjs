#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {
  inspectVideo,
  matchEvidenceFrames,
  normalizeFocus,
  publicPathToFile,
  sha256File,
  sha256Value,
} from "../apps/studio-next/src/lib/a1-continuous-screen-evidence-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const workspacePath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json");
const overridesPath = path.join(root, "apps/studio-next/src/data/system-line-screen-demo-overrides-v1.json");
const outputRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2");
const registryPath = path.join(outputRoot, "source-family-registry.json");
const boardPath = path.join(outputRoot, "source-family-evidence-board.png");
const presentationRecaptureReportPath = path.join(outputRoot, "presentation-recapture-v1/report.json");
const c5LocalTracksReportPath = path.join(outputRoot, "c5-local-action-tracks-v1/report.json");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const ffprobePath = path.join(root, "node_modules/@ffprobe-installer/darwin-arm64/ffprobe");

const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
const assetById = new Map((workspace.library?.assets || []).map((asset) => [asset.id, asset]));
const familyIds = [...new Set(overrides.entries.map((entry) => entry.sourceAssetId))];
const presentationRecapture = fs.existsSync(presentationRecaptureReportPath)
  ? JSON.parse(fs.readFileSync(presentationRecaptureReportPath, "utf8"))
  : null;
const c5LocalTracks = fs.existsSync(c5LocalTracksReportPath)
  ? JSON.parse(fs.readFileSync(c5LocalTracksReportPath, "utf8"))
  : null;

fs.mkdirSync(outputRoot, {recursive: true});

const families = [];
for (const sourceAssetId of familyIds) {
  const asset = assetById.get(sourceAssetId);
  const expectedActionId = overrides.entries.find((entry) => entry.sourceAssetId === sourceAssetId)?.expectedActionId || null;
  const c5Capture = c5LocalTracks?.status === "PASS"
    && c5LocalTracks?.admissionBoundary?.captureOnly === true
    ? c5LocalTracks.captures?.find((capture) => capture.actionId === expectedActionId)
    : null;
  const recapturedPresentation = sourceAssetId === "source-documentary-presentation-action"
    && !c5Capture
    && presentationRecapture?.status === "PASS"
    && presentationRecapture?.admissionBoundary?.captureOnly === true
    ? presentationRecapture.captures?.find((capture) => capture.actionId === "presentation")
    : null;
  const recapture = c5Capture || recapturedPresentation;
  const video = recapture ? {
    ...asset?.videoEvidence,
    publicUrl: recapture.videoPublicUrl,
    sha256: recapture.videoSha256,
    durationSeconds: recapture.durationSeconds,
    evidenceFrames: recapture.evidenceFrames,
    pointerTelemetry: {
      contract: "A1PointerTelemetry/v1",
      publicUrl: recapture.pointerTelemetryPublicUrl,
      sha256: recapture.pointerTelemetrySha256,
      eventCount: recapture.pointerTelemetryEventCount,
      source: "playwright-real-dom-event",
    },
  } : asset?.videoEvidence;
  if (!video?.publicUrl || !video?.sha256 || !Array.isArray(video.evidenceFrames) || video.evidenceFrames.length < 2) {
    throw new Error(`continuous-screen-source-family-incomplete:${sourceAssetId}`);
  }
  const videoPath = publicPathToFile(publicRoot, video.publicUrl);
  if (!fs.existsSync(videoPath)) throw new Error(`continuous-screen-video-missing:${sourceAssetId}`);
  const actualVideoSha256 = sha256File(videoPath);
  if (actualVideoSha256 !== video.sha256) throw new Error(`continuous-screen-video-sha-mismatch:${sourceAssetId}`);
  const evidence = video.evidenceFrames.map((frame, index) => {
    const filePath = publicPathToFile(publicRoot, frame.publicUrl);
    if (!fs.existsSync(filePath)) throw new Error(`continuous-screen-evidence-frame-missing:${sourceAssetId}:${index}`);
    return {
      index,
      beat: frame.beat || `state-${index + 1}`,
      publicUrl: frame.publicUrl,
      filePath,
      sha256: sha256File(filePath),
      focusRegion: frame.focusRegion || null,
    };
  });
  const metadata = inspectVideo({ffprobePath, filePath: videoPath});
  const matches = await matchEvidenceFrames({
    ffmpegPath,
    videoPath,
    evidence,
    sampleFps: Math.max(5, Math.min(25, Math.round(metadata.fps || 5))),
  });
  families.push({
    sourceAssetId,
    actionId: video.actionId || expectedActionId,
    sourceContract: video.contract,
    publicUrl: video.publicUrl,
    sha256: actualVideoSha256,
    metadata,
    evidenceBoundary: video.evidenceBoundary || null,
    sourceLineage: recapture
      ? {
          status: c5Capture ? "CANDIDATE_ONLY_C5_FOUR_TRACK_RECAPTURE" : "CANDIDATE_ONLY_RECAPTURE",
          reportPublicUrl: c5Capture
            ? "/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/c5-local-action-tracks-v1/report.json"
            : "/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/presentation-recapture-v1/report.json",
          workspaceMutated: false,
          productionAdmission: false,
        }
      : {status: "CURRENT_WORKSPACE_SOURCE", workspaceMutated: false},
    pointerProvenance: video.pointerTelemetry?.sha256
      ? "CAPTURED_POINTER_EVENT_AND_SOURCE_PIXELS"
      : "CAPTURED_IN_SOURCE_PIXELS_NO_SYNTHETIC_CURSOR",
    pointerTelemetry: video.pointerTelemetry || null,
    evidenceFrames: matches.map(({filePath, ...frame}) => ({
      ...frame,
      focus: normalizeFocus(frame.focusRegion),
      frameMatchStatus: frame.frameMatchMse <= 80 ? "PASS" : "REVIEW",
    })),
  });
}

const failures = families.flatMap((family) => family.evidenceFrames
  .filter((frame) => frame.frameMatchStatus !== "PASS")
  .map((frame) => `${family.sourceAssetId}:${frame.beat}:frame-match-mse-${frame.frameMatchMse}`));
const registryBase = {
  contract: "A1ContinuousScreenEvidenceRegistry/v2",
  projectId: workspace.projectId,
  status: failures.length === 0 ? "PASS" : "REVIEW",
  sourceFamilyCount: families.length,
  sourceFamilyIds: familyIds,
  productionBoundary: {
    candidateOnly: true,
    productionAdmission: false,
    userVisualApproval: "NOT_APPROVED",
    currentAuthorityMutated: false,
  },
  validation: {
    sourceShaExact: true,
    videoMetadataRead: true,
    evidenceFramesMatchedToContinuousVideo: true,
    frameMatchMsePassThreshold: 80,
    syntheticCursorAdded: false,
  },
  families,
  failures,
};
const registry = {...registryBase, sha256: sha256Value(registryBase)};
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

const tileWidth = 320;
const tileHeight = 198;
const columns = 4;
const evidenceTiles = families.flatMap((family) => family.evidenceFrames.map((frame) => ({family, frame})));
const rows = Math.ceil(evidenceTiles.length / columns);
const composites = [];
for (const [index, item] of evidenceTiles.entries()) {
  const screenshot = await sharp(publicPathToFile(publicRoot, item.frame.publicUrl))
    .resize(tileWidth, 180, {fit: "cover"})
    .png()
    .toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="18"><rect width="100%" height="100%" fill="#101416"/><text x="7" y="13" fill="#eef0e8" font-size="10" font-family="monospace">${item.family.actionId} · ${item.frame.beat} · ${item.frame.matchedAtMs}ms · mse ${item.frame.frameMatchMse}</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: tileHeight, channels: 3, background: "#101416"}})
    .composite([{input: screenshot, left: 0, top: 0}, {input: label, left: 0, top: 180}])
    .png()
    .toBuffer();
  composites.push({input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight});
}
await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: "#101416"}})
  .composite(composites)
  .png()
  .toFile(boardPath);

const summary = {
  status: registry.status,
  registryPath: path.relative(root, registryPath),
  registrySha256: sha256File(registryPath),
  boardPath: path.relative(root, boardPath),
  boardSha256: sha256File(boardPath),
  sourceFamilyCount: families.length,
  evidenceFrameCount: evidenceTiles.length,
  failures,
};
console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) process.exitCode = 1;
