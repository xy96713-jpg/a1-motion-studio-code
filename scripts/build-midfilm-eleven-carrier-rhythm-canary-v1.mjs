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
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const outputRoot = path.join(sourceRoot, "midfilm-eleven-carrier-rhythm-canary-v1");
const frameRoot = path.join(outputRoot, "frames");
const sourceFrameRoot = path.join(outputRoot, "source-frames");
const workspacePath = path.join(sourceRoot, "workspace.json");
const phasePath = path.join(artifactRoot, "current-phase.json");
const plansPath = path.join(sourceRoot, "continuous-screen-evidence-v2/shot-performance-plans.json");
const mediaReportPath = path.join(sourceRoot, "imported-film-media-v1/film-media-discovery-v1-latest.json");
const backgroundDecisionPath = path.join(sourceRoot, "article-asset-background-lane-v1/user-library-decision.json");
const brightBackgroundPath = path.join(artifactRoot, "background-library-review-v1/01-cool-halftone-quiet-field.png");
const darkBackgroundPath = path.join(artifactRoot, "background-library-review-v1/02-charcoal-contour-quiet-field.png");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const visionPath = path.join(root, "scripts/run-local-vision-human-bounds-v1.swift");
const width = 960;
const height = 540;
const shotIds = Array.from({length: 11}, (_, index) => `ED-${String(index + 20).padStart(2, "0")}`);
const hybridShotIds = ["ED-21", "ED-25", "ED-29"];
const evidenceCardShotIds = ["ED-23", "ED-27"];

const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const relative = (filePath) => path.relative(root, filePath);
const publicUrl = (filePath) => `/${path.relative(publicRoot, filePath)}`;
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
};
const atomicWriteJson = (filePath, value) => {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
};
const resolvePublicUrl = (url) => path.join(publicRoot, url.replace(/^\//u, ""));

for (const filePath of [workspacePath, phasePath, plansPath, mediaReportPath, backgroundDecisionPath, brightBackgroundPath, darkBackgroundPath, visionPath]) {
  if (!fs.existsSync(filePath)) throw new Error(`midfilm-eleven-input-missing:${relative(filePath)}`);
}
const authorityBefore = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
const mediaReport = JSON.parse(fs.readFileSync(mediaReportPath, "utf8"));
const backgroundDecision = JSON.parse(fs.readFileSync(backgroundDecisionPath, "utf8"));
if (plans.status !== "PASS" || backgroundDecision.scope?.backgroundLibraryUsabilityApproved !== true) throw new Error("midfilm-eleven-source-authority-not-ready");
const presenterVideoPath = resolvePublicUrl(mediaReport.imported.presenter.publicUrl);
if (!fs.existsSync(presenterVideoPath) || sha256File(presenterVideoPath) !== mediaReport.imported.presenter.sha256) throw new Error("midfilm-eleven-presenter-video-invalid");

const boardItems = workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.items || [];
const boardItemByShotId = new Map(boardItems.map((item) => [item.shotId, item]));
const planByShotId = new Map(plans.shots.map((shot) => [shot.shotId, shot]));
fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(sourceFrameRoot, {recursive: true});

const currentFramePathByShotId = new Map(shotIds.map((shotId) => {
  const item = boardItemByShotId.get(shotId);
  const filePath = resolvePublicUrl(item?.previewPublicUrl || "");
  if (!item || !fs.existsSync(filePath) || item.preview?.kind !== "VERIFIED_SCREEN_SOURCE") throw new Error(`midfilm-eleven-current-frame-invalid:${shotId}`);
  return [shotId, filePath];
}));
const screenSourceFramePathByShotId = new Map();
for (const shotId of shotIds) {
  const shot = planByShotId.get(shotId);
  if (!shot) throw new Error(`midfilm-eleven-screen-plan-missing:${shotId}`);
  const sourceVideoPath = resolvePublicUrl(shot.sourceVideoUri);
  if (!fs.existsSync(sourceVideoPath) || sha256File(sourceVideoPath) !== shot.sourceVideoSha256) throw new Error(`midfilm-eleven-screen-source-invalid:${shotId}`);
  const atMs = shot.evidenceFrames.at(-1)?.matchedAtMs;
  if (!Number.isFinite(atMs)) throw new Error(`midfilm-eleven-evidence-time-missing:${shotId}`);
  const framePath = path.join(sourceFrameRoot, `${shotId}-screen.png`);
  run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", sourceVideoPath, "-frames:v", "1", "-vf", "scale=960:540:force_original_aspect_ratio=increase,crop=960:540", framePath]);
  screenSourceFramePathByShotId.set(shotId, framePath);
}

const presenterFramePathByShotId = new Map();
for (const shotId of hybridShotIds) {
  const item = boardItemByShotId.get(shotId);
  const atMs = Math.round((item.timeRange.startMs + item.timeRange.endMs) / 2);
  const framePath = path.join(sourceFrameRoot, `${shotId}-presenter.png`);
  run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", presenterVideoPath, "-frames:v", "1", "-vf", "scale=960:540:force_original_aspect_ratio=increase,crop=960:540", framePath]);
  presenterFramePathByShotId.set(shotId, framePath);
}

const cleanBackground = async (sourcePath, brightness) => {
  const metadata = await sharp(sourcePath).metadata();
  const cropWidth = Math.floor((metadata.width || 1920) * 0.5);
  return sharp(sourcePath)
    .extract({left: (metadata.width || 1920) - cropWidth, top: 0, width: cropWidth, height: metadata.height || 1080})
    .resize(width, height, {fit: "cover"})
    .modulate({brightness, saturation: 0.58})
    .png()
    .toBuffer();
};
const brightBackground = await cleanBackground(brightBackgroundPath, 1.02);
const darkBackground = await cleanBackground(darkBackgroundPath, 0.72);
const focusCrop = async (screenPath, cardWidth, cardHeight, borderColor, focus) => {
  const sourceWidth = 960;
  const sourceHeight = 540;
  const cropWidth = Math.floor(sourceWidth / 1.3);
  const cropHeight = Math.floor(sourceHeight / 1.3);
  const cropLeft = Math.max(0, Math.min(sourceWidth - cropWidth, Math.round(focus.x * sourceWidth - cropWidth / 2)));
  const cropTop = Math.max(0, Math.min(sourceHeight - cropHeight, Math.round(focus.y * sourceHeight - cropHeight / 2)));
  const image = await sharp(screenPath).extract({left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight}).resize(cardWidth - 12, cardHeight - 12, {fit: "cover"}).png().toBuffer();
  return sharp({create: {width: cardWidth, height: cardHeight, channels: 4, background: borderColor}}).composite([{input: image, left: 6, top: 6}]).png().toBuffer();
};
const presenterPanel = async (filePath, side) => sharp(filePath)
  .extract(side === "left" ? {left: 150, top: 0, width: 610, height: 540} : {left: 280, top: 0, width: 500, height: 540})
  .resize(side === "left" ? 400 : 360, 540, {fit: "cover"})
  .modulate({brightness: 0.86, saturation: 0.8})
  .png()
  .toBuffer();
const candidateCarrierByShotId = new Map([
  ["ED-20", "FULLSCREEN_SCREEN_EVIDENCE"],
  ["ED-21", "PRESENTER_SCREEN_SPLIT"],
  ["ED-22", "FULLSCREEN_SCREEN_ACTION"],
  ["ED-23", "SCREEN_EVIDENCE_CARD"],
  ["ED-24", "FULLSCREEN_SCREEN_ACTION"],
  ["ED-25", "SCREEN_PRESENTER_SPLIT"],
  ["ED-26", "FULLSCREEN_SCREEN_ACTION"],
  ["ED-27", "SCREEN_EVIDENCE_CARD"],
  ["ED-28", "FULLSCREEN_SCREEN_ACTION"],
  ["ED-29", "PRESENTER_SCREEN_SPLIT"],
  ["ED-30", "FULLSCREEN_SCREEN_RESULT"],
]);
const candidateFramePathByShotId = new Map();
for (const shotId of shotIds) {
  const targetPath = path.join(frameRoot, `${shotId}.png`);
  const screenPath = screenSourceFramePathByShotId.get(shotId);
  const focusPoint = planByShotId.get(shotId).cameraTrack?.[1] || {x: 0.5, y: 0.5};
  if (hybridShotIds.includes(shotId)) {
    const leftPresenter = shotId !== "ED-25";
    const background = leftPresenter ? brightBackground : darkBackground;
    const presenter = await presenterPanel(presenterFramePathByShotId.get(shotId), leftPresenter ? "left" : "right");
    const card = await focusCrop(screenPath, leftPresenter ? 548 : 550, 326, leftPresenter ? "#111617" : "#f2f0e8", focusPoint);
    const line = Buffer.from('<svg width="4" height="540"><rect width="4" height="540" fill="#315dff"/></svg>');
    await sharp(background).composite(leftPresenter ? [
      {input: presenter, left: 0, top: 0}, {input: line, left: 400, top: 0}, {input: card, left: 404, top: 72},
    ] : [
      {input: card, left: 24, top: 72}, {input: line, left: 582, top: 0}, {input: presenter, left: 600, top: 0},
    ]).png().toFile(targetPath);
  } else if (evidenceCardShotIds.includes(shotId)) {
    const background = shotId === "ED-23" ? brightBackground : darkBackground;
    const cardWidth = shotId === "ED-23" ? 842 : 700;
    const cardHeight = shotId === "ED-23" ? 474 : 394;
    const card = await focusCrop(screenPath, cardWidth, cardHeight, shotId === "ED-23" ? "#111617" : "#f2f0e8", focusPoint);
    await sharp(background).composite([{input: card, left: Math.round((width - cardWidth) / 2), top: Math.round((height - cardHeight) / 2)}]).png().toFile(targetPath);
  } else {
    if (shotId === "ED-30") {
      await sharp(screenPath).extract({left: 62, top: 35, width: 835, height: 470}).resize(width, height, {fit: "fill"}).png().toFile(targetPath);
    } else {
      await sharp(screenPath).png().toFile(targetPath);
    }
  }
  candidateFramePathByShotId.set(shotId, targetPath);
}

const humanBounds = Object.fromEntries(hybridShotIds.map((shotId) => [shotId, JSON.parse(run("swift", [visionPath, candidateFramePathByShotId.get(shotId)]).trim())]));
const presenterGeometryPass = hybridShotIds.every((shotId) => humanBounds[shotId].status === "PASS" && humanBounds[shotId].faces.length === 1 && humanBounds[shotId].humans.length === 1)
  && humanBounds["ED-21"].humans[0].x + humanBounds["ED-21"].humans[0].width <= 404 / width
  && humanBounds["ED-25"].humans[0].x >= 600 / width
  && humanBounds["ED-29"].humans[0].x + humanBounds["ED-29"].humans[0].width <= 404 / width;
if (!presenterGeometryPass) throw new Error("midfilm-eleven-presenter-geometry-failed");

const makeBoard = async ({frames, carriers, fileName}) => {
  const tileWidth = 480;
  const imageHeight = 270;
  const labelHeight = 52;
  const composites = [];
  for (const [index, shotId] of shotIds.entries()) {
    const image = await sharp(frames.get(shotId)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0e10"/><rect width="5" height="100%" fill="#315dff"/><text x="16" y="20" fill="#f2efe4" font-size="14" font-weight="700" font-family="monospace">${shotId}</text><text x="16" y="39" fill="#8ea0ff" font-size="11" font-family="monospace">${carriers.get(shotId)}</text></svg>`);
    const tile = await sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 3, background: "#0b0e10"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}]).png().toBuffer();
    composites.push({input: tile, left: (index % 4) * tileWidth, top: Math.floor(index / 4) * (imageHeight + labelHeight)});
  }
  const outputPath = path.join(outputRoot, fileName);
  await sharp({create: {width: tileWidth * 4, height: (imageHeight + labelHeight) * 3, channels: 3, background: "#0b0e10"}}).composite(composites).png().toFile(outputPath);
  return outputPath;
};
const currentCarrierByShotId = new Map(shotIds.map((shotId) => [shotId, "FULLSCREEN_SCREEN_EVIDENCE"]));
const currentBoardPath = await makeBoard({frames: currentFramePathByShotId, carriers: currentCarrierByShotId, fileName: "midfilm-eleven-current-board.png"});
const candidateBoardPath = await makeBoard({frames: candidateFramePathByShotId, carriers: candidateCarrierByShotId, fileName: "midfilm-eleven-candidate-board.png"});

const entries = shotIds.map((shotId) => ({
  shotId,
  semanticWindow: boardItemByShotId.get(shotId).timeRange,
  sourceText: boardItemByShotId.get(shotId).sourceText,
  currentCarrier: "FULLSCREEN_SCREEN_EVIDENCE",
  candidateCarrier: candidateCarrierByShotId.get(shotId),
  screenEvidence: {sourceVideoUri: planByShotId.get(shotId).sourceVideoUri, sourceVideoSha256: planByShotId.get(shotId).sourceVideoSha256, semanticSlice: planByShotId.get(shotId).semanticSlice},
  presenterFrame: hybridShotIds.includes(shotId) ? {path: relative(presenterFramePathByShotId.get(shotId)), sha256: sha256File(presenterFramePathByShotId.get(shotId)), atMs: Math.round((boardItemByShotId.get(shotId).timeRange.startMs + boardItemByShotId.get(shotId).timeRange.endMs) / 2)} : null,
  presenterGeometryAudit: humanBounds[shotId] || null,
  candidateFrame: {path: relative(candidateFramePathByShotId.get(shotId)), publicUrl: publicUrl(candidateFramePathByShotId.get(shotId)), sha256: sha256File(candidateFramePathByShotId.get(shotId)), width, height},
}));
const authorityAfter = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("midfilm-eleven-mutated-current-authority");
const manifestBody = {
  contract: "A1MidfilmElevenCarrierRhythmCanary/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY",
  scope: {
    shotIds,
    semanticStartMs: entries[0].semanticWindow.startMs,
    semanticEndMs: entries.at(-1).semanticWindow.endMs,
    semanticDurationMs: entries.at(-1).semanticWindow.endMs - entries[0].semanticWindow.startMs,
    editSlotStartMs: planByShotId.get("ED-20").editWindow.startMs,
    editSlotEndMs: planByShotId.get("ED-30").editWindow.endMs,
    editSlotDurationMs: planByShotId.get("ED-30").editWindow.endMs - planByShotId.get("ED-20").editWindow.startMs,
  },
  diagnosis: {currentLongestFullscreenScreenRun: 11, candidateLongestSameCarrierRun: 1, hybridShotIds, evidenceCardShotIds},
  sourceBindings: {
    workspace: {path: relative(workspacePath), sha256: authorityBefore.workspaceSha256},
    phase: {path: relative(phasePath), sha256: authorityBefore.phaseSha256},
    plans: {path: relative(plansPath), sha256: sha256File(plansPath)},
    presenterVideo: {path: relative(presenterVideoPath), sha256: mediaReport.imported.presenter.sha256},
    backgroundDecision: {path: relative(backgroundDecisionPath), sha256: sha256File(backgroundDecisionPath)},
  },
  outputs: {
    currentBoard: {path: relative(currentBoardPath), publicUrl: publicUrl(currentBoardPath), sha256: sha256File(currentBoardPath)},
    candidateBoard: {path: relative(candidateBoardPath), publicUrl: publicUrl(candidateBoardPath), sha256: sha256File(candidateBoardPath)},
  },
  entries,
  checks: {
    exactElevenShotSemanticMembership: true,
    exactCurrentBoardSemanticWindows: true,
    realScreenEvidencePreserved: true,
    exactTimelinePresenterFrames: true,
    presenterGeometryPass,
    presenterFaceRegenerated: false,
    generatedFormalTextAdded: false,
    approvedBackgroundTextureCropsOnly: true,
    currentAuthorityMutated: false,
    candidateLongestSameCarrierRunAtMostTwo: true,
  },
  boundary: {candidateOnly: true, canonicalSelectionMutated: false, currentAuthorityMutated: false, productionAdmission: false, motionProduced: false, resolveWritten: false, finalRender: false, userVisualApproval: "NOT_APPROVED"},
};
const manifest = {...manifestBody, manifestSha256: sha256Value(manifestBody)};
atomicWriteJson(path.join(outputRoot, "manifest.json"), manifest);
console.log(JSON.stringify({status: manifest.status, semanticDurationMs: manifest.scope.semanticDurationMs, editSlotDurationMs: manifest.scope.editSlotDurationMs, currentLongestFullscreenScreenRun: 11, candidateLongestSameCarrierRun: 1, candidateBoardPath: manifest.outputs.candidateBoard.path, candidateBoardSha256: manifest.outputs.candidateBoard.sha256, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
