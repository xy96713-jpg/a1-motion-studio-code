#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

const root = process.cwd();
const phaseId = "h-series-semantic-directed-macro-review-index-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const frameRoot = path.join(artifactRoot, "frames");
const reportPath = path.join(artifactRoot, "report.json");
const contactSheetPath = path.join(artifactRoot, "h-series-macro-index-contact-sheet.png");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const publicReportPath = path.join(publicRoot, "report.json");
const publicContactSheetPath = path.join(publicRoot, "h-series-macro-index-contact-sheet.png");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const semanticReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json");
const videoPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/review-960x540-with-source-audio.mp4");
const expectedMacroIds = Array.from({length: 11}, (_, index) => `H${String(index + 1).padStart(2, "0")}`);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.stderr || result.stdout || result.status}`);
  return result.stdout;
};
const extractFrame = (timeSec, output) => run(ffmpegPath, ["-loglevel", "error", "-y", "-ss", timeSec.toFixed(3), "-i", videoPath, "-frames:v", "1", output]);
const xml = (value) => String(value ?? "").replace(/[<>&'"]/gu, (char) => ({"<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"})[char]);

async function frameStats(file) {
  const {data, info} = await sharp(file).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let nearBlack = 0;
  let blue = 0;
  let nonPaper = 0;
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const luma = .2126 * r + .7152 * g + .0722 * b;
    if (luma < 24) nearBlack += 1;
    if (b >= 130 && b - r >= 25 && b - g >= 18) blue += 1;
    if (Math.abs(r - 243) + Math.abs(g - 238) + Math.abs(b - 226) > 40) nonPaper += 1;
  }
  const pixels = info.width * info.height;
  return {width: info.width, height: info.height, nearBlackFraction: Number((nearBlack / pixels).toFixed(4)), blueFraction: Number((blue / pixels).toFixed(4)), nonPaperFraction: Number((nonPaper / pixels).toFixed(4))};
}

async function buildContactSheet(items) {
  const tileWidth = 384;
  const tileHeight = 216;
  const labelHeight = 104;
  const columns = 4;
  const rows = Math.ceil(items.length / columns);
  const composites = [];
  for (const [index, item] of items.entries()) {
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(item.framePath).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ded9ce"/><text x="12" y="23" fill="#111315" font-family="Arial,sans-serif" font-size="15" font-weight="800">${xml(item.macroId)} · ${item.sceneCount} 镜 · ${item.startSec.toFixed(1)}-${item.endSec.toFixed(1)}s</text><text x="12" y="50" fill="#244fc4" font-family="Arial,sans-serif" font-size="12">${xml(item.representativeBeatId)} · ${xml(item.frameStats.nonPaperFraction)} non-paper</text><text x="12" y="77" fill="#111315" font-family="Arial,sans-serif" font-size="12">${xml(item.representativeTitle).slice(0, 42)}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
}

for (const file of [propsPath, semanticReportPath, videoPath]) if (!fs.existsSync(file)) throw new Error(`required-file-missing:${path.relative(root, file)}`);
const props = readJson(propsPath);
const semanticReport = readJson(semanticReportPath);
const fps = Number(props.fps || 30);
const scenesByMacro = new Map();
for (const scene of props.scenes || []) {
  const list = scenesByMacro.get(scene.macroId) || [];
  list.push(scene);
  scenesByMacro.set(scene.macroId, list);
}
const macroIntervals = semanticReport.continuityProof?.macroIntervals?.length
  ? semanticReport.continuityProof.macroIntervals
  : expectedMacroIds.map((macroId) => {
    const scenes = scenesByMacro.get(macroId) || [];
    return {macroId, startFrame: scenes[0]?.startFrame || 0, endFrame: scenes.at(-1) ? scenes.at(-1).startFrame + scenes.at(-1).durationInFrames : 0};
  });

fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(artifactRoot, {recursive: true});
const macros = [];
for (const interval of macroIntervals) {
  const scenes = scenesByMacro.get(interval.macroId) || [];
  if (!scenes.length) continue;
  const scene = scenes[Math.floor(scenes.length / 2)];
  const hold = scene.motionPlan?.phases?.hold || {startFrame: Math.round(scene.durationInFrames * .55), endFrame: Math.round(scene.durationInFrames * .82)};
  const localFrame = Math.max(0, Math.min(scene.durationInFrames - 1, Math.round((hold.startFrame + hold.endFrame) / 2)));
  const representativeFrame = scene.startFrame + localFrame;
  const timeSec = representativeFrame / fps;
  const framePath = path.join(frameRoot, `${interval.macroId.toLowerCase()}-${scene.beatId.toLowerCase()}-hold.png`);
  extractFrame(timeSec, framePath);
  macros.push({macroId: interval.macroId, sceneCount: scenes.length, startSec: Number((interval.startFrame / fps).toFixed(3)), endSec: Number((interval.endFrame / fps).toFixed(3)), durationSec: Number(((interval.endFrame - interval.startFrame) / fps).toFixed(3)), representativeBeatId: scene.beatId, representativeTitle: (scene.titleLines || []).join(" / "), beatIds: scenes.map((item) => item.beatId), representativeFrame, framePath, frameStats: await frameStats(framePath)});
}
await buildContactSheet(macros);
const videoSha256 = sha256(videoPath);
const checks = {
  currentAuthorityReport: semanticReport.status === "READY_FOR_DIRECT_REVIEW" && semanticReport.reviewOnly === true && semanticReport.finalRenderAllowed === false,
  videoHashMatchesAuthorityReport: videoSha256 === semanticReport.media?.video?.sha256,
  elevenMacroSectionsPresent: macros.length === 11 && expectedMacroIds.every((id, index) => macros[index]?.macroId === id),
  sceneCountMatchesCurrentHSeries: macros.reduce((sum, item) => sum + item.sceneCount, 0) === 47,
  macroTimelineContinuous: macros.every((item, index) => index === 0 || Math.abs(item.startSec - macros[index - 1].endSec) < (1 / fps) + 0.001),
  representativeFramesNotSparse: macros.every((item) => item.frameStats.nonPaperFraction >= .08),
  representativeFramesNotBlack: macros.every((item) => item.frameStats.nearBlackFraction <= .18),
  reviewOnlyBoundary: semanticReport.finalRenderAllowed === false && semanticReport.resolveExportAllowed === false,
};
const failures = Object.entries(checks).filter(([, pass]) => pass !== true).map(([id]) => id);
const report = {
  contract: "A1HSeriesSemanticDirectedMacroReviewIndex/v1",
  phaseId,
  status: failures.length ? "BLOCKED" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  visualMasterId: semanticReport.sourceBinding?.directorPlanSha256 || null,
  sourceBinding: {videoPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/review-960x540-with-source-audio.mp4", videoSha256, propsPath: "remotion-renderer/src/generated/microbeatLayeredFullProps.json", propsSha256: sha256(propsPath), reportPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json", reportSha256: sha256(semanticReportPath)},
  sourceVideo: {url: semanticReport.media.video.publicUrl, sha256: videoSha256, durationSec: semanticReport.media.video.durationSec, width: semanticReport.media.video.width, height: semanticReport.media.video.height, fps: semanticReport.media.video.fps || `${fps}/1`},
  summary: {macroCount: macros.length, totalSceneCount: macros.reduce((sum, item) => sum + item.sceneCount, 0), minNonPaperFraction: Number(Math.min(...macros.map((item) => item.frameStats.nonPaperFraction)).toFixed(4)), maxNearBlackFraction: Number(Math.max(...macros.map((item) => item.frameStats.nearBlackFraction)).toFixed(4))},
  checks,
  failures,
  macros: macros.map((item) => ({macroId: item.macroId, sceneCount: item.sceneCount, startSec: item.startSec, endSec: item.endSec, durationSec: item.durationSec, representativeBeatId: item.representativeBeatId, representativeTitle: item.representativeTitle, beatIds: item.beatIds, representativeFrame: item.representativeFrame, representativeFramePublicUrl: `/generated/system-line/h-series-semantic-directed-v1/stills/${item.representativeBeatId}.png`, frameStats: item.frameStats})),
  contactSheet: {path: path.relative(root, contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/h-series-macro-index-contact-sheet.png`, sha256: sha256(contactSheetPath), width: 1536, height: Math.ceil(macros.length / 4) * 320},
  nextAction: failures.length ? "repair-current-macro-review-index" : "await-explicit-user-approval-or-targeted-fix-list",
};
for (const output of [reportPath, publicReportPath]) { fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); }
fs.copyFileSync(contactSheetPath, publicContactSheetPath);
console.log(JSON.stringify({status: report.status, failures, summary: report.summary, reportPath: path.relative(root, reportPath), publicReportPath: path.relative(root, publicReportPath), contactSheet: report.contactSheet.publicUrl, nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 2;
