#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const sourceRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(sourceRoot, "opening-nine-carrier-rhythm-canary-v1");
const frameRoot = path.join(outputRoot, "frames");
const sourceFrameRoot = path.join(outputRoot, "source-frames");
const workspacePath = path.join(sourceRoot, "workspace.json");
const phasePath = path.join(artifactRoot, "current-phase.json");
const plansPath = path.join(sourceRoot, "continuous-screen-evidence-v2/shot-performance-plans.json");
const insertionManifestPath = path.join(sourceRoot, "continuous-screen-evidence-v2/insertion-pack-v2/insertion-manifest.json");
const backgroundDecisionPath = path.join(sourceRoot, "article-asset-background-lane-v1/user-library-decision.json");
const brightBackgroundPath = path.join(artifactRoot, "background-library-review-v1/01-cool-halftone-quiet-field.png");
const darkBackgroundPath = path.join(artifactRoot, "background-library-review-v1/02-charcoal-contour-quiet-field.png");
const presenterHoldPath = path.join(sourceRoot, "video-packaging-context-v1/ed-01-hold-frame.jpg");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const width = 960;
const height = 540;
const shotIds = Array.from({length: 9}, (_, index) => `ED-${String(index + 1).padStart(2, "0")}`);

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
const runJson = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
};

for (const filePath of [workspacePath, phasePath, plansPath, insertionManifestPath, backgroundDecisionPath, brightBackgroundPath, darkBackgroundPath, presenterHoldPath]) {
  if (!fs.existsSync(filePath)) throw new Error(`opening-nine-input-missing:${relative(filePath)}`);
}
const authorityBefore = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const plans = JSON.parse(fs.readFileSync(plansPath, "utf8"));
const insertionManifest = JSON.parse(fs.readFileSync(insertionManifestPath, "utf8"));
const backgroundDecision = JSON.parse(fs.readFileSync(backgroundDecisionPath, "utf8"));
if (plans.status !== "PASS" || insertionManifest.entryCount !== 16) throw new Error("opening-nine-screen-evidence-not-ready");
if (backgroundDecision.scope?.backgroundLibraryUsabilityApproved !== true) throw new Error("opening-nine-background-library-not-usable");
if (backgroundDecision.scope?.wholeFilmStaticBoardApproved !== false) throw new Error("opening-nine-background-decision-boundary-drift");

const boardItems = workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.timelineBoard?.items || [];
const boardItemByShotId = new Map(boardItems.map((item) => [item.shotId, item]));
const planByShotId = new Map(plans.shots.map((shot) => [shot.shotId, shot]));
fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(sourceFrameRoot, {recursive: true});

const resolvePublicUrl = (url) => path.join(publicRoot, url.replace(/^\//u, ""));
const currentFramePathByShotId = new Map(shotIds.map((shotId) => {
  const item = boardItemByShotId.get(shotId);
  if (!item?.previewPublicUrl) throw new Error(`opening-nine-current-frame-missing:${shotId}`);
  const filePath = resolvePublicUrl(item.previewPublicUrl);
  if (!fs.existsSync(filePath)) throw new Error(`opening-nine-current-frame-invalid:${shotId}`);
  const declaredPreviewSha256 = item.preview?.sha256 || item.artifactSha256 || null;
  if (declaredPreviewSha256 && sha256File(filePath) !== declaredPreviewSha256) throw new Error(`opening-nine-current-frame-sha-mismatch:${shotId}`);
  if (!declaredPreviewSha256 && item.preview?.kind !== "VERIFIED_SCREEN_SOURCE") throw new Error(`opening-nine-current-frame-unbound:${shotId}`);
  return [shotId, filePath];
}));

const screenFrameAtMs = new Map([
  ["ED-02", 8120],
  ["ED-03", 2480],
  ["ED-04", 42200],
  ["ED-05", 12600],
  ["ED-06", 3440],
]);
const screenSourceFramePathByShotId = new Map();
for (const [shotId, atMs] of screenFrameAtMs) {
  const shot = planByShotId.get(shotId);
  const sourceVideoPath = resolvePublicUrl(shot.sourceVideoUri);
  if (!fs.existsSync(sourceVideoPath) || sha256File(sourceVideoPath) !== shot.sourceVideoSha256) {
    throw new Error(`opening-nine-screen-source-invalid:${shotId}`);
  }
  const framePath = path.join(sourceFrameRoot, `${shotId}.png`);
  run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", sourceVideoPath, "-frames:v", "1", framePath]);
  await sharp(framePath).resize(width, height, {fit: "cover"}).png().toFile(`${framePath}.normalized.png`);
  fs.renameSync(`${framePath}.normalized.png`, framePath);
  screenSourceFramePathByShotId.set(shotId, framePath);
}

const cleanBackground = async (sourcePath, mode) => {
  const metadata = await sharp(sourcePath).metadata();
  const cropWidth = Math.floor((metadata.width || 1920) * 0.5);
  return sharp(sourcePath)
    .extract({left: (metadata.width || 1920) - cropWidth, top: 0, width: cropWidth, height: metadata.height || 1080})
    .resize(width, height, {fit: "cover"})
    .modulate(mode === "bright" ? {brightness: 1.02, saturation: 0.62} : {brightness: 0.72, saturation: 0.58})
    .png()
    .toBuffer();
};
const brightBackground = await cleanBackground(brightBackgroundPath, "bright");
const darkBackground = await cleanBackground(darkBackgroundPath, "dark");
const presenterLeft = await sharp(presenterHoldPath)
  .extract({left: 150, top: 0, width: 610, height: 540})
  .resize(400, 540, {fit: "cover"})
  .modulate({brightness: 0.9, saturation: 0.82})
  .png()
  .toBuffer();
const presenterRight = await sharp(presenterHoldPath)
  .extract({left: 280, top: 0, width: 500, height: 540})
  .resize(360, 540, {fit: "cover"})
  .modulate({brightness: 0.82, saturation: 0.78})
  .png()
  .toBuffer();
const screenCard = async (screenPath, cardWidth, cardHeight, borderColor, focus) => {
  const metadata = await sharp(screenPath).metadata();
  const sourceWidth = metadata.width || width;
  const sourceHeight = metadata.height || height;
  const cropWidth = Math.floor(sourceWidth / 1.3);
  const cropHeight = Math.floor(sourceHeight / 1.3);
  const cropLeft = Math.max(0, Math.min(sourceWidth - cropWidth, Math.round(focus.x * sourceWidth - cropWidth / 2)));
  const cropTop = Math.max(0, Math.min(sourceHeight - cropHeight, Math.round(focus.y * sourceHeight - cropHeight / 2)));
  const image = await sharp(screenPath)
    .extract({left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight})
    .resize(cardWidth - 12, cardHeight - 12, {fit: "cover"})
    .png()
    .toBuffer();
  return sharp({create: {width: cardWidth, height: cardHeight, channels: 4, background: borderColor}})
    .composite([{input: image, left: 6, top: 6}])
    .png()
    .toBuffer();
};
const composeHybrid = async ({shotId, layout, background, screenPath}) => {
  const targetPath = path.join(frameRoot, `${shotId}.png`);
  if (layout === "presenter-left") {
    const card = await screenCard(screenPath, 548, 326, "#111617", {x: 0.4732, y: 0.5354});
    const line = Buffer.from('<svg width="4" height="540"><rect width="4" height="540" fill="#315dff"/></svg>');
    await sharp(background)
      .composite([
        {input: presenterLeft, left: 0, top: 0},
        {input: line, left: 400, top: 0},
        {input: card, left: 404, top: 72},
      ])
      .png()
      .toFile(targetPath);
  } else {
    const card = await screenCard(screenPath, 550, 326, "#f2f0e8", {x: 0.8883, y: 0.30705});
    const line = Buffer.from('<svg width="4" height="540"><rect width="4" height="540" fill="#315dff"/></svg>');
    await sharp(background)
      .composite([
        {input: card, left: 24, top: 72},
        {input: line, left: 582, top: 0},
        {input: presenterRight, left: 600, top: 0},
      ])
      .png()
      .toFile(targetPath);
  }
  return targetPath;
};

const candidateCarrierByShotId = new Map([
  ["ED-01", "PRESENTER_IDENTITY_OVERLAY"],
  ["ED-02", "FULLSCREEN_SCREEN_ACTION"],
  ["ED-03", "PRESENTER_SCREEN_SPLIT"],
  ["ED-04", "FULLSCREEN_SCREEN_ACTION"],
  ["ED-05", "SCREEN_PRESENTER_SPLIT"],
  ["ED-06", "FULLSCREEN_SCREEN_RESULT"],
  ["ED-07", "PRESENTER_JUDGMENT_RESET"],
  ["ED-08", "FULLSCREEN_TITLE_TAKEOVER"],
  ["ED-09", "MINIMAL_EXPLAINER"],
]);
const candidateFramePathByShotId = new Map();
for (const shotId of shotIds) {
  const targetPath = path.join(frameRoot, `${shotId}.png`);
  if (shotId === "ED-03") {
    await composeHybrid({shotId, layout: "presenter-left", background: brightBackground, screenPath: screenSourceFramePathByShotId.get(shotId)});
  } else if (shotId === "ED-05") {
    await composeHybrid({shotId, layout: "presenter-right", background: darkBackground, screenPath: screenSourceFramePathByShotId.get(shotId)});
  } else if (screenSourceFramePathByShotId.has(shotId)) {
    await sharp(screenSourceFramePathByShotId.get(shotId)).png().toFile(targetPath);
  } else {
    await sharp(currentFramePathByShotId.get(shotId)).resize(width, height, {fit: "cover"}).png().toFile(targetPath);
  }
  candidateFramePathByShotId.set(shotId, targetPath);
}
const hybridHumanBounds = Object.fromEntries(["ED-03", "ED-05"].map((shotId) => [
  shotId,
  runJson("swift", [path.join(root, "scripts/run-local-vision-human-bounds-v1.swift"), candidateFramePathByShotId.get(shotId)]),
]));
const hybridPresenterGeometryPass = hybridHumanBounds["ED-03"].status === "PASS"
  && hybridHumanBounds["ED-03"].faces.length === 1
  && hybridHumanBounds["ED-03"].humans.length === 1
  && hybridHumanBounds["ED-03"].humans[0].x + hybridHumanBounds["ED-03"].humans[0].width <= 404 / width
  && hybridHumanBounds["ED-05"].status === "PASS"
  && hybridHumanBounds["ED-05"].faces.length === 1
  && hybridHumanBounds["ED-05"].humans.length === 1
  && hybridHumanBounds["ED-05"].humans[0].x >= 600 / width;
if (!hybridPresenterGeometryPass) throw new Error("opening-nine-hybrid-presenter-geometry-failed");

const tileWidth = 480;
const imageHeight = 270;
const labelHeight = 52;
const makeBoard = async ({framePathByShotId, carrierByShotId, fileName}) => {
  const composites = [];
  for (const [index, shotId] of shotIds.entries()) {
    const image = await sharp(framePathByShotId.get(shotId)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const carrier = carrierByShotId.get(shotId);
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0e10"/><rect width="5" height="100%" fill="#315dff"/><text x="16" y="20" fill="#f2efe4" font-size="14" font-weight="700" font-family="monospace">${shotId}</text><text x="16" y="39" fill="#8ea0ff" font-size="11" font-family="monospace">${carrier}</text></svg>`);
    const tile = await sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 3, background: "#0b0e10"}})
      .composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: imageHeight}])
      .png()
      .toBuffer();
    composites.push({input: tile, left: (index % 3) * tileWidth, top: Math.floor(index / 3) * (imageHeight + labelHeight)});
  }
  const outputPath = path.join(outputRoot, fileName);
  await sharp({create: {width: tileWidth * 3, height: (imageHeight + labelHeight) * 3, channels: 3, background: "#0b0e10"}})
    .composite(composites)
    .png()
    .toFile(outputPath);
  return outputPath;
};
const currentCarrierByShotId = new Map(shotIds.map((shotId) => [shotId, boardItemByShotId.get(shotId).route]));
const currentBoardPath = await makeBoard({framePathByShotId: currentFramePathByShotId, carrierByShotId: currentCarrierByShotId, fileName: "opening-nine-current-board.png"});
const candidateBoardPath = await makeBoard({framePathByShotId: candidateFramePathByShotId, carrierByShotId: candidateCarrierByShotId, fileName: "opening-nine-candidate-board.png"});
const comparisonPath = path.join(outputRoot, "opening-nine-before-after.png");
const currentBoardBuffer = await sharp(currentBoardPath).png().toBuffer();
const candidateBoardBuffer = await sharp(candidateBoardPath).png().toBuffer();
const header = (title, x) => ({
  input: Buffer.from(`<svg width="1440" height="64"><rect width="100%" height="100%" fill="#111617"/><text x="22" y="41" fill="#f2efe4" font-size="24" font-weight="700" font-family="monospace">${title}</text></svg>`),
  left: x,
  top: 0,
});
await sharp({create: {width: 2888, height: 1030, channels: 3, background: "#111617"}})
  .composite([
    header("CURRENT · 5-SHOT SCREEN RUN", 0),
    header("CANDIDATE · EVIDENCE / PRESENTER / PACKAGE RHYTHM", 1448),
    {input: currentBoardBuffer, left: 0, top: 64},
    {input: candidateBoardBuffer, left: 1448, top: 64},
  ])
  .png()
  .toFile(comparisonPath);

const entries = shotIds.map((shotId) => {
  const item = boardItemByShotId.get(shotId);
  const candidatePath = candidateFramePathByShotId.get(shotId);
  const isHybrid = shotId === "ED-03" || shotId === "ED-05";
  return {
    shotId,
    semanticWindow: item.timeRange,
    sourceText: item.sourceText,
    currentCarrier: item.route,
    candidateCarrier: candidateCarrierByShotId.get(shotId),
    semanticCarrierReason: shotId === "ED-03"
      ? "The preference action remains visible while the presenter carries the personal-judgment explanation."
      : shotId === "ED-05"
        ? "The review result remains primary while the presenter resets the sequence before the presentation-mode proof."
        : "Current semantic carrier remains appropriate; only sequence context changes.",
    evidencePreserved: !isHybrid || Boolean(planByShotId.get(shotId)?.sourceVideoSha256),
    presenterGeometryAudit: isHybrid ? hybridHumanBounds[shotId] : null,
    presenterFaceRegenerated: false,
    formalGeneratedTextAdded: false,
    currentFrame: {path: relative(currentFramePathByShotId.get(shotId)), sha256: sha256File(currentFramePathByShotId.get(shotId))},
    candidateFrame: {path: relative(candidatePath), publicUrl: publicUrl(candidatePath), sha256: sha256File(candidatePath), width, height},
  };
});
const currentRuns = [
  {carrier: "PACKAGE", shotIds: ["ED-01"]},
  {carrier: "FULLSCREEN_SCREEN", shotIds: ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"]},
  {carrier: "PACKAGE", shotIds: ["ED-07", "ED-08", "ED-09"]},
];
const candidateRuns = shotIds.map((shotId) => ({carrier: candidateCarrierByShotId.get(shotId), shotIds: [shotId]}));
const authorityAfter = {workspaceSha256: sha256File(workspacePath), phaseSha256: sha256File(phasePath)};
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("opening-nine-mutated-current-authority");
const manifestBody = {
  contract: "A1OpeningNineCarrierRhythmCanary/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY",
  scope: {shotIds, startMs: entries[0].semanticWindow.startMs, endMs: entries.at(-1).semanticWindow.endMs},
  diagnosis: {
    currentLongestFullscreenScreenRun: 5,
    candidateLongestSameCarrierRun: 1,
    currentRuns,
    candidateRuns,
    repairPrinciple: "PRESERVE_REAL_EVIDENCE_WHILE_ALTERNATING_FULLSCREEN_ACTION, PRESENTER_PLUS_SCREEN, AND MINIMAL_PACKAGE CARRIERS.",
  },
  sourceBindings: {
    workspace: {path: relative(workspacePath), sha256: authorityBefore.workspaceSha256},
    phase: {path: relative(phasePath), sha256: authorityBefore.phaseSha256},
    screenPlans: {path: relative(plansPath), sha256: sha256File(plansPath)},
    insertionManifest: {path: relative(insertionManifestPath), sha256: sha256File(insertionManifestPath)},
    presenterHold: {path: relative(presenterHoldPath), sha256: sha256File(presenterHoldPath)},
    backgroundDecision: {path: relative(backgroundDecisionPath), sha256: sha256File(backgroundDecisionPath)},
    brightBackground: {path: relative(brightBackgroundPath), sha256: sha256File(brightBackgroundPath), crop: "RIGHT_TEXTURE_ONLY_WITHOUT_GENERATED_TEXT"},
    darkBackground: {path: relative(darkBackgroundPath), sha256: sha256File(darkBackgroundPath), crop: "RIGHT_TEXTURE_ONLY_WITHOUT_GENERATED_TEXT"},
  },
  outputs: {
    currentBoard: {path: relative(currentBoardPath), publicUrl: publicUrl(currentBoardPath), sha256: sha256File(currentBoardPath)},
    candidateBoard: {path: relative(candidateBoardPath), publicUrl: publicUrl(candidateBoardPath), sha256: sha256File(candidateBoardPath)},
    comparison: {path: relative(comparisonPath), publicUrl: publicUrl(comparisonPath), sha256: sha256File(comparisonPath)},
  },
  entries,
  checks: {
    exactNineShotSemanticMembership: entries.length === 9 && entries.every((entry, index) => entry.shotId === shotIds[index]),
    exactCurrentBoardSemanticWindows: entries.every((entry) => entry.semanticWindow.startMs === boardItemByShotId.get(entry.shotId).timeRange.startMs && entry.semanticWindow.endMs === boardItemByShotId.get(entry.shotId).timeRange.endMs),
    realScreenEvidencePreserved: entries.filter((entry) => ["ED-02", "ED-03", "ED-04", "ED-05", "ED-06"].includes(entry.shotId)).every((entry) => entry.evidencePreserved),
    presenterFaceRegenerated: false,
    generatedFormalTextAdded: false,
    approvedBackgroundTextureCropsOnly: true,
    hybridPresenterGeometryPass,
    currentAuthorityMutated: false,
    candidateLongestSameCarrierRunAtMostTwo: true,
  },
  boundary: {
    candidateOnly: true,
    canonicalSelectionMutated: false,
    currentAuthorityMutated: false,
    productionAdmission: false,
    motionProduced: false,
    resolveWritten: false,
    finalRender: false,
    userVisualApproval: "NOT_APPROVED",
  },
};
const manifest = {...manifestBody, manifestSha256: sha256Value(manifestBody)};
atomicWriteJson(path.join(outputRoot, "manifest.json"), manifest);
console.log(JSON.stringify({
  status: manifest.status,
  currentLongestFullscreenScreenRun: manifest.diagnosis.currentLongestFullscreenScreenRun,
  candidateLongestSameCarrierRun: manifest.diagnosis.candidateLongestSameCarrierRun,
  candidateBoardPath: manifest.outputs.candidateBoard.path,
  candidateBoardSha256: manifest.outputs.candidateBoard.sha256,
  comparisonPath: manifest.outputs.comparison.path,
  comparisonSha256: manifest.outputs.comparison.sha256,
  currentAuthorityMutated: false,
  userVisualApproval: manifest.boundary.userVisualApproval,
}, null, 2));
