#!/usr/bin/env node
/**
 * Render a bounded typography-motion sample sheet for the current storyboard.
 * This is proof-only: no full MP4 render, no props mutation, no adoption.
 */
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const rendererRequire = createRequire(path.join(process.cwd(), "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");
const sharp = require("sharp");

const root = process.cwd();
const phaseId = "storyboard-typography-motion-sample-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const frameRoot = path.join(artifactRoot, "frames");
const publicFrameRoot = path.join(publicRoot, "frames");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const contactSheetPath = path.join(artifactRoot, "typography-motion-sample-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "typography-motion-sample-contact-sheet.png");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const entryPoint = path.join(root, "remotion-renderer/src/system-line-h-frame-index.tsx");
const renderContractPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-typography-render-contract-v1/report.json");
const compositionId = "A1SystemLineHFullTimelineReview";
const requiredPresets = ["poster-slam", "cinema-condensed", "keyword-mask", "archive-label", "quiet-subtitle"];
const expressivePresets = new Set(["poster-slam", "cinema-condensed", "keyword-mask", "archive-label"]);
const localFrameFractions = [0.1, 0.2, 0.34, 0.48];
const concurrency = Math.max(1, Math.min(2, Math.floor((os.cpus().length || 2) * 0.25)));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function localFrames(scene) {
  const duration = Math.max(1, Number(scene.durationInFrames || 1));
  const safeEnd = Math.max(0, duration - 6);
  return localFrameFractions.map((fraction) => Math.max(0, Math.min(safeEnd, Math.round(duration * fraction))));
}

function sampleScenesByPreset(scenes) {
  const selected = [];
  const used = new Set();
  for (const preset of requiredPresets) {
    const scene = scenes.find((candidate) => candidate.storyboard?.typographyDirector?.preset === preset);
    if (!scene) continue;
    selected.push(scene);
    used.add(scene.beatId);
  }
  for (const scene of scenes) {
    if (selected.length >= 8) break;
    const preset = scene.storyboard?.typographyDirector?.preset;
    if (!requiredPresets.includes(preset) || used.has(scene.beatId)) continue;
    selected.push(scene);
    used.add(scene.beatId);
  }
  return selected;
}

async function meanAbsDiff(aFile, bFile) {
  const a = await sharp(aFile).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const b = await sharp(bFile).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  if (a.info.width !== b.info.width || a.info.height !== b.info.height || a.info.channels !== b.info.channels) {
    throw new Error(`diff-size-mismatch:${aFile}:${bFile}`);
  }
  let sum = 0;
  let active = 0;
  const pixels = a.info.width * a.info.height;
  const channels = a.info.channels;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * channels;
    const diff = (Math.abs(a.data[offset] - b.data[offset]) + Math.abs(a.data[offset + 1] - b.data[offset + 1]) + Math.abs(a.data[offset + 2] - b.data[offset + 2])) / 3;
    sum += diff;
    if (diff > 8) active += 1;
  }
  return {
    meanAbsDiff: Number((sum / pixels).toFixed(4)),
    activeDiffFraction: Number((active / pixels).toFixed(4)),
  };
}

async function imageStats(filePath) {
  const {data, info} = await sharp(filePath).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let nearBlack = 0;
  let paper = 0;
  let cobalt = 0;
  let red = 0;
  let yellow = 0;
  const pixels = info.width * info.height;
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    if (r < 42 && g < 42 && b < 42) nearBlack += 1;
    if (r > 210 && g > 202 && b > 185) paper += 1;
    if (b >= 125 && b - r >= 22 && b - g >= 15) cobalt += 1;
    if (r > 185 && g < 80 && b < 70) red += 1;
    if (r > 205 && g > 175 && b < 70) yellow += 1;
  }
  return {
    nearBlackFraction: Number((nearBlack / pixels).toFixed(4)),
    paperFraction: Number((paper / pixels).toFixed(4)),
    cobaltFraction: Number((cobalt / pixels).toFixed(4)),
    redFraction: Number((red / pixels).toFixed(4)),
    yellowFraction: Number((yellow / pixels).toFixed(4)),
  };
}

async function buildContactSheet(items, outputPath) {
  const tileWidth = 420;
  const tileHeight = 236;
  const labelHeight = 86;
  const gap = 26;
  const columns = localFrameFractions.length;
  const width = tileWidth * columns;
  const height = 118 + items.length * (labelHeight + tileHeight + gap);
  const composites = [];
  const header = Buffer.from(`<svg width="${width}" height="118" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#f2efe7"/>
    <text x="24" y="42" fill="#111315" font-family="Arial,sans-serif" font-size="30" font-weight="900">Storyboard typography motion sample</text>
    <text x="24" y="76" fill="#555" font-family="Arial,sans-serif" font-size="15">Five typography presets sampled over time. Proof-only still strip; no full MP4 render and no props mutation.</text>
  </svg>`);
  composites.push({input: header, left: 0, top: 0});
  for (const [row, item] of items.entries()) {
    const top = 118 + row * (labelHeight + tileHeight + gap);
    const label = Buffer.from(`<svg width="${width}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#d9d5ca"/>
      <text x="18" y="28" fill="#111315" font-family="Arial,sans-serif" font-size="20" font-weight="900">${escapeXml(item.beatId)} · ${escapeXml(item.preset)} · ${escapeXml(item.displayText)}</text>
      <text x="18" y="56" fill="#2848a8" font-family="Arial,sans-serif" font-size="13">avg diff ${item.averageTemporalMeanAbsDiff} · active ${item.averageTemporalActiveFraction} · ${escapeXml(item.motion)}</text>
    </svg>`);
    composites.push({input: label, left: 0, top});
    for (const [col, frame] of item.frames.entries()) {
      const image = await sharp(frame.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
      const tag = Buffer.from(`<svg width="${tileWidth}" height="28" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#111315"/>
        <text x="10" y="19" fill="#f2efe7" font-family="Arial,sans-serif" font-size="13">frame ${frame.frame} · local ${frame.localFrame}</text>
      </svg>`);
      composites.push({input: image, left: col * tileWidth, top: top + labelHeight});
      composites.push({input: tag, left: col * tileWidth, top: top + labelHeight + tileHeight - 28});
    }
  }
  await sharp({create: {width, height, channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(outputPath);
  return {width, height};
}

for (const required of [propsPath, entryPoint]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(publicFrameRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const props = readJson(propsPath);
const renderContract = fs.existsSync(renderContractPath) ? readJson(renderContractPath) : null;
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const selectedScenes = sampleScenesByPreset(scenes);
const selectedPresetSet = new Set(selectedScenes.map((scene) => scene.storyboard?.typographyDirector?.preset));
const failures = [];

if (props.contract !== "A1MicrobeatLayeredFullPlan/v1") failures.push("invalid-renderer-props-contract");
if (props.reviewOnly !== true || props.finalRenderAllowed === true || props.resolveExportAllowed === true) failures.push("renderer-props-not-review-locked");
if (!renderContract) failures.push("typography-render-contract-report-missing");
if (renderContract && renderContract.status !== "PASS") failures.push(`typography-render-contract-not-pass:${renderContract.status}`);
for (const preset of requiredPresets) {
  if (!selectedPresetSet.has(preset)) failures.push(`missing-preset-sample:${preset}`);
}

let browser;
let contactSheet = null;
const proofItems = [];
const startedAt = Date.now();
try {
  const serveUrl = await bundle({entryPoint, publicDir: path.join(root, "remotion-renderer/public"), rootDir: path.join(root, "remotion-renderer"), enableCaching: true});
  browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  for (const scene of selectedScenes) {
    const director = scene.storyboard?.typographyDirector || {};
    const frames = [];
    const locals = localFrames(scene);
    for (const localFrame of locals) {
      const frame = Number(scene.startFrame || 0) + localFrame;
      const file = path.join(frameRoot, `${scene.beatId.toLowerCase()}-${String(localFrame).padStart(3, "0")}.png`);
      await renderStill({
        serveUrl,
        composition,
        inputProps: props,
        frame,
        output: file,
        imageFormat: "png",
        scale: 0.5,
        overwrite: true,
        puppeteerInstance: browser,
        logLevel: "warn",
        concurrency,
      });
      fs.copyFileSync(file, path.join(publicFrameRoot, path.basename(file)));
      frames.push({
        beatId: scene.beatId,
        localFrame,
        frame,
        file: rel(file),
        publicUrl: `/generated/system-line/${phaseId}/frames/${path.basename(file)}`,
        sha256: sha256(file),
        stats: await imageStats(file),
      });
    }
    const temporalDiffs = [];
    for (let index = 1; index < frames.length; index += 1) {
      temporalDiffs.push({
        fromLocalFrame: frames[index - 1].localFrame,
        toLocalFrame: frames[index].localFrame,
        ...(await meanAbsDiff(path.join(root, frames[index - 1].file), path.join(root, frames[index].file))),
      });
    }
    const averageTemporalMeanAbsDiff = Number((temporalDiffs.reduce((sum, item) => sum + item.meanAbsDiff, 0) / Math.max(1, temporalDiffs.length)).toFixed(4));
    const averageTemporalActiveFraction = Number((temporalDiffs.reduce((sum, item) => sum + item.activeDiffFraction, 0) / Math.max(1, temporalDiffs.length)).toFixed(4));
    proofItems.push({
      beatId: scene.beatId,
      macroId: scene.macroId,
      preset: director.preset || "unknown",
      displayText: director.displayText || scene.screenText || "",
      latinText: director.latinText || null,
      colorRole: director.colorRole || null,
      layoutRole: director.layoutRole || null,
      motion: director.motion || null,
      screenText: scene.screenText,
      startFrame: scene.startFrame,
      durationInFrames: scene.durationInFrames,
      averageTemporalMeanAbsDiff,
      averageTemporalActiveFraction,
      temporalDiffs,
      frames,
    });
  }
  contactSheet = await buildContactSheet(proofItems.map((item) => ({
    ...item,
    frames: item.frames.map((frame) => ({...frame, file: path.join(root, frame.file)})),
  })), contactSheetPath);
  fs.copyFileSync(contactSheetPath, publicContactSheetPath);
} catch (error) {
  failures.push(`render-typography-motion-sample:${error?.message || String(error)}`);
} finally {
  if (browser) await browser.close({silent: true});
}

for (const item of proofItems) {
  const expressive = expressivePresets.has(item.preset);
  const minDiff = expressive ? 0.18 : 0.03;
  if (item.averageTemporalMeanAbsDiff < minDiff) failures.push(`low-temporal-motion:${item.beatId}:${item.preset}:${item.averageTemporalMeanAbsDiff}`);
}
if (proofItems.length < requiredPresets.length) failures.push(`proof-item-count-too-low:${proofItems.length}`);

const status = failures.length ? "FAIL" : "PASS";
const report = {
  contract: "A1StoryboardTypographyMotionSample/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  proofOnly: true,
  fullMp4Rendered: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  rendererSourcePropsModified: false,
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256(propsPath),
    renderContractPath: rel(renderContractPath),
    renderContractStatus: renderContract?.status || "missing",
    entryPoint: rel(entryPoint),
    compositionId,
  },
  renderProfile: {
    scale: 0.5,
    fps: 30,
    concurrency,
    elapsedMs: Date.now() - startedAt,
    framesPerScene: localFrameFractions.length,
  },
  summary: {
    sceneCount: scenes.length,
    requiredPresetCount: requiredPresets.length,
    sampledSceneCount: proofItems.length,
    renderedFrameCount: proofItems.reduce((sum, item) => sum + item.frames.length, 0),
    byPreset: Object.fromEntries(requiredPresets.map((preset) => [preset, proofItems.filter((item) => item.preset === preset).length])),
    minTemporalMeanAbsDiff: proofItems.length ? Number(Math.min(...proofItems.map((item) => item.averageTemporalMeanAbsDiff)).toFixed(4)) : 0,
    averageTemporalMeanAbsDiff: proofItems.length ? Number((proofItems.reduce((sum, item) => sum + item.averageTemporalMeanAbsDiff, 0) / proofItems.length).toFixed(4)) : 0,
  },
  contactSheet: contactSheet ? {
    path: rel(contactSheetPath),
    publicUrl: `/generated/system-line/${phaseId}/typography-motion-sample-contact-sheet.png`,
    sha256: sha256(contactSheetPath),
    ...contactSheet,
  } : null,
  proofItems,
  failures,
  nextAction: status === "PASS" ? "review-typography-motion-sample-contact-sheet" : "repair-typography-motion-before-visual-upgrade",
};

for (const file of [reportPath, publicReportPath]) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  status,
  summary: report.summary,
  failures,
  reportPath: rel(reportPath),
  publicReportPath: rel(publicReportPath),
  contactSheet: report.contactSheet?.path || null,
  nextAction: report.nextAction,
}, null, 2));

if (status !== "PASS") process.exitCode = 2;
