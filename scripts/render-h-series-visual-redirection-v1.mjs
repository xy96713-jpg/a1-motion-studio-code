#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderMedia, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");
const ffprobePath = require("@ffprobe-installer/ffprobe").path;

const root = process.cwd();
const phaseId = "h-series-visual-redirection-v1";
const compositionId = "A1HSeriesVisualRedirectionPreview";
const currentCompositionId = "A1SystemLineHAllScenesFrameReview";
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "proof-only/visual-redirection-index.tsx");
const componentPath = path.join(rendererRoot, "proof-only/HSeriesVisualRedirectionPreview.tsx");
const propsPath = path.join(rendererRoot, "src/generated/microbeatLayeredFullProps.json");
const currentFilmManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/current-film/current-film-manifest.json");
const audioSourcePath = "/Users/a1/Documents/Codex/声音/outputs/voice_clone_july1/july1_full_16k_mono.wav";
const audioPublicRelative = "generated/system-line/visual-redirection-v1/source.wav";
const audioPublicPath = path.join(rendererRoot, "public", audioPublicRelative);
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const frameRoot = path.join(artifactRoot, "frames");
const publicFrameRoot = path.join(publicRoot, "frames");
const videoPath = path.join(artifactRoot, "visual-redirection-30s-960x540.mp4");
const publicVideoPath = path.join(publicRoot, "visual-redirection-30s-960x540.mp4");
const contactSheetPath = path.join(artifactRoot, "visual-redirection-12-frame-ab.png");
const publicContactSheetPath = path.join(publicRoot, "visual-redirection-12-frame-ab.png");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");

const moments = [
  {id: "opening-thesis", beatId: "H01-B01", frame: 62, anchor: "opening", correction: null},
  {id: "style-selection", beatId: "H01-B03", frame: 142, anchor: "opening", correction: null},
  {id: "style-memory", beatId: "H01-B03", frame: 226, anchor: "opening", correction: null},
  {id: "context-fill", beatId: "H01-B05", frame: 288, anchor: "opening", correction: null},
  {id: "model-roster", beatId: "H03-B04", frame: 346, anchor: "core", correction: "remove-mismatched-evidence-card"},
  {id: "model-routing", beatId: "H03-B04", frame: 424, anchor: "core", correction: "represent-five-model-claim-as-typographic-roster"},
  {id: "hard-check-gate", beatId: "H05-B04", frame: 484, anchor: "core", correction: null},
  {id: "api-relay", beatId: "H06-B01", frame: 562, anchor: "core", correction: "replace-thesis-card-with-causal-relay"},
  {id: "submit-draft", beatId: "H09-B04", frame: 630, anchor: "closing", correction: null},
  {id: "controlled-workflow", beatId: "H10-B03", frame: 690, anchor: "closing", correction: "remove-truncated-token-and-overflow"},
  {id: "human-proof", beatId: "H11-B01", frame: 752, anchor: "closing", correction: "replace-duplicate-process-node-with-human-proofreading"},
  {id: "own-style", beatId: "H11-B03", frame: 842, anchor: "closing", correction: null},
];

const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const rel = (file) => path.relative(root, file);

function run(command, args) {
  const result = spawnSync(command, args, {encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed: ${result.error?.message || result.stderr || result.stdout || `exit-${result.status}`}`);
  return result.stdout;
}

function probe(file) {
  return JSON.parse(run(ffprobePath, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
}

async function meanAbsDiff(fileA, fileB) {
  const a = await sharp(fileA).resize(240, 135, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const b = await sharp(fileB).resize(240, 135, {fit: "fill"}).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += Math.abs(a[index] - b[index]);
  return Number((sum / a.length).toFixed(4));
}

function labelSvg(width, height, moment, pairIndex) {
  const escape = (value) => String(value).replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#111315"/>
    <text x="14" y="22" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#faf8f1">${String(pairIndex + 1).padStart(2, "0")} · ${escape(moment.beatId)} · ${escape(moment.id)}</text>
    <text x="14" y="41" font-family="Arial,sans-serif" font-size="11" fill="#9fb4ff">CURRENT</text>
    <text x="${width / 2 + 14}" y="41" font-family="Arial,sans-serif" font-size="11" fill="#9fb4ff">REDIRECTED</text>
  </svg>`);
}

async function buildContactSheet(items) {
  const thumbWidth = 480;
  const thumbHeight = 270;
  const labelHeight = 48;
  const pairWidth = thumbWidth * 2;
  const pairHeight = labelHeight + thumbHeight;
  const columns = 2;
  const rows = Math.ceil(items.length / columns);
  const headerHeight = 86;
  const width = pairWidth * columns;
  const height = headerHeight + pairHeight * rows;
  const composites = [];
  const header = Buffer.from(`<svg width="${width}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f1eee4"/>
    <text x="26" y="38" font-family="Arial,sans-serif" font-size="28" font-weight="900" fill="#111315">H-series visual redirection · 3 anchors / 12 key states</text>
    <text x="26" y="66" font-family="Arial,sans-serif" font-size="16" fill="#53575a">Current film on the left; proposed visual language on the right. Preview-only. Main 218s film is unchanged.</text>
  </svg>`);
  composites.push({input: header, left: 0, top: 0});
  for (const [index, item] of items.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * pairWidth;
    const top = headerHeight + row * pairHeight;
    composites.push({input: labelSvg(pairWidth, labelHeight, item, index), left, top});
    const current = await sharp(item.currentFile).resize(thumbWidth, thumbHeight, {fit: "fill"}).png().toBuffer();
    const proposed = await sharp(item.proposedFile).resize(thumbWidth, thumbHeight, {fit: "fill"}).png().toBuffer();
    composites.push({input: current, left, top: top + labelHeight});
    composites.push({input: proposed, left: left + thumbWidth, top: top + labelHeight});
  }
  await sharp({create: {width, height, channels: 4, background: "#f1eee4"}}).composite(composites).png().toFile(contactSheetPath);
  return {width, height};
}

for (const file of [entryPoint, componentPath, propsPath, currentFilmManifestPath, audioSourcePath]) {
  if (!fs.existsSync(file)) throw new Error(`required-file-missing:${file}`);
}

const props = readJson(propsPath);
const currentFilmBefore = readJson(currentFilmManifestPath);
const currentFilmManifestShaBefore = hash(currentFilmManifestPath);
const currentFilmVideoPath = currentFilmBefore.activePreview?.video?.url
  ? path.join(root, "apps/studio-next/public", currentFilmBefore.activePreview.video.url.replace(/^\//u, ""))
  : null;
const currentFilmVideoShaBefore = currentFilmVideoPath && fs.existsSync(currentFilmVideoPath) ? hash(currentFilmVideoPath) : null;
const propsShaBefore = hash(propsPath);

for (const directory of [artifactRoot, publicRoot, frameRoot, publicFrameRoot, path.dirname(audioPublicPath)]) fs.mkdirSync(directory, {recursive: true});
fs.copyFileSync(audioSourcePath, audioPublicPath);

let browser;
let renderElapsedMs = 0;
const frameReports = [];
let contactSheet = null;
try {
  const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
  browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  const currentComposition = await selectComposition({serveUrl, id: currentCompositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  const startedAt = Date.now();
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    outputLocation: videoPath,
    frameRange: [0, composition.durationInFrames - 1],
    scale: .5,
    codec: "h264",
    pixelFormat: "yuv420p",
    imageFormat: "jpeg",
    jpegQuality: 90,
    concurrency: Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * .25))),
    hardwareAcceleration: "if-possible",
    overwrite: true,
    puppeteerInstance: browser,
    logLevel: "warn",
  });
  renderElapsedMs = Date.now() - startedAt;

  for (const [index, moment] of moments.entries()) {
    const sceneIndex = props.scenes.findIndex((scene) => scene.beatId === moment.beatId);
    if (sceneIndex < 0) throw new Error(`moment-scene-missing:${moment.beatId}`);
    const currentFrame = sceneIndex * 90 + 60;
    const currentFile = path.join(frameRoot, `${String(index + 1).padStart(2, "0")}-${moment.id}-current.png`);
    const proposedFile = path.join(frameRoot, `${String(index + 1).padStart(2, "0")}-${moment.id}-redirected.png`);
    await renderStill({serveUrl, composition: currentComposition, inputProps: props, frame: currentFrame, output: currentFile, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    await renderStill({serveUrl, composition, inputProps: props, frame: moment.frame, output: proposedFile, imageFormat: "png", scale: .5, overwrite: true, puppeteerInstance: browser, logLevel: "warn"});
    fs.copyFileSync(currentFile, path.join(publicFrameRoot, path.basename(currentFile)));
    fs.copyFileSync(proposedFile, path.join(publicFrameRoot, path.basename(proposedFile)));
    frameReports.push({
      ...moment,
      currentFrame,
      currentFile,
      proposedFile,
      currentSha256: hash(currentFile),
      proposedSha256: hash(proposedFile),
      currentProposedMeanAbsDiff: await meanAbsDiff(currentFile, proposedFile),
      currentPublicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(currentFile)}`,
      proposedPublicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(proposedFile)}`,
    });
  }
  contactSheet = await buildContactSheet(frameReports);
} finally {
  if (browser) await browser.close({silent: true});
}

fs.copyFileSync(videoPath, publicVideoPath);
fs.copyFileSync(contactSheetPath, publicContactSheetPath);

const media = probe(videoPath);
const videoStream = media.streams.find((stream) => stream.codec_type === "video");
const audioStream = media.streams.find((stream) => stream.codec_type === "audio");
const durationSec = Number(media.format.duration);
const adjacentProposedDiffs = [];
for (let index = 1; index < frameReports.length; index += 1) adjacentProposedDiffs.push(await meanAbsDiff(frameReports[index - 1].proposedFile, frameReports[index].proposedFile));

const currentFilmAfter = readJson(currentFilmManifestPath);
const checks = {
  currentFilmManifestPreserved: currentFilmManifestShaBefore === hash(currentFilmManifestPath),
  currentFilmVideoPreserved: Boolean(currentFilmVideoPath && currentFilmVideoShaBefore && hash(currentFilmVideoPath) === currentFilmVideoShaBefore),
  rendererPropsPreserved: propsShaBefore === hash(propsPath),
  previewOnly: true,
  anchorCount: new Set(moments.map((moment) => moment.anchor)).size === 3,
  keyStateCount: moments.length === 12 && frameReports.length === 12,
  explicitErrorCorrections: new Set(moments.filter((moment) => moment.correction).map((moment) => moment.beatId)).size === 4,
  duration30s: Math.abs(durationSec - 30) <= .08,
  width960: videoStream?.width === 960,
  height540: videoStream?.height === 540,
  fps30: videoStream?.avg_frame_rate === "30/1",
  audioPresent: Boolean(audioStream),
  audioSourceBound: hash(audioSourcePath) === hash(audioPublicPath),
  contactSheetExists: fs.existsSync(contactSheetPath) && frameReports.every((item) => fs.existsSync(item.currentFile) && fs.existsSync(item.proposedFile)),
  visualRedirectionVisible: frameReports.every((item) => item.currentProposedMeanAbsDiff >= 5),
  proposedStateVariation: adjacentProposedDiffs.length === 11 && Math.min(...adjacentProposedDiffs) >= 2,
  finalRenderLocked: currentFilmAfter.finalRenderAllowed === false,
  resolveExportLocked: currentFilmAfter.resolveExportAllowed === false,
};
const failures = Object.entries(checks).filter(([, pass]) => pass !== true).map(([id]) => id);
const report = {
  contract: "A1HSeriesVisualRedirectionPreview/v1",
  phaseId,
  status: failures.length ? "FAIL" : "PASS_REVIEWABLE",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  previewOnly: true,
  rendererAdoptionAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  visualThesis: "documentary writing operation plus editorial close-up plus sparse metaphor artwork",
  anchorStrategy: {count: 3, anchors: ["opening", "core", "closing"], keyStateCount: 12},
  correctedBeatIds: [...new Set(moments.filter((moment) => moment.correction).map((moment) => moment.beatId))],
  media: {
    video: {path: rel(videoPath), publicUrl: `/generated/system-line/${phaseId}/${path.basename(publicVideoPath)}`, sha256: hash(videoPath), bytes: fs.statSync(videoPath).size, width: videoStream?.width, height: videoStream?.height, fps: videoStream?.avg_frame_rate, durationSec, audioCodec: audioStream?.codec_name || null, audioChannels: audioStream?.channels || null},
    contactSheet: {path: rel(contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/${path.basename(publicContactSheetPath)}`, sha256: hash(contactSheetPath), width: contactSheet?.width, height: contactSheet?.height},
  },
  sourceBinding: {
    propsPath: rel(propsPath),
    propsSha256: propsShaBefore,
    componentPath: rel(componentPath),
    componentSha256: hash(componentPath),
    entryPoint: rel(entryPoint),
    audioPath: audioSourcePath,
    audioSha256: hash(audioSourcePath),
    currentFilmBuildId: currentFilmBefore.current?.buildId || null,
    currentFilmVideoSha256: currentFilmVideoShaBefore,
  },
  frameReports: frameReports.map((item) => ({...item, currentFile: rel(item.currentFile), proposedFile: rel(item.proposedFile)})),
  adjacentProposedDiffs,
  checks,
  failures,
  renderElapsedMs,
  nextAction: failures.length ? "repair-visual-redirection-preview" : "review-visual-redirection-preview-on-4311-before-main-renderer-adoption",
};

for (const output of [reportPath, publicReportPath]) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({status: report.status, video: report.media.video, contactSheet: report.media.contactSheet, correctedBeatIds: report.correctedBeatIds, failures, renderElapsedMs, reportPath: rel(reportPath)}, null, 2));
if (failures.length) process.exitCode = 2;
