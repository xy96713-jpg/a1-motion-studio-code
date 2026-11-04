#!/usr/bin/env node
/**
 * Objective motion-temporal proof for storyboard samples.
 *
 * Renders a few frames inside representative shots and measures pixel deltas so
 * the system can prove the final storyboard has temporal motion, not only static
 * still quality. This is not a full video render.
 */
import {createRequire} from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const rendererRequire = createRequire(path.join(root, "remotion-renderer/package.json"));
const {bundle} = rendererRequire("@remotion/bundler");
const {openBrowser, renderStill, selectComposition} = rendererRequire("@remotion/renderer");

const phaseId = "storyboard-motion-temporal-proof-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rendererRoot = path.join(root, "remotion-renderer");
const entryPoint = path.join(rendererRoot, "src/system-line-h-frame-index.tsx");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const compositionId = process.env.A1_STORYBOARD_MOTION_COMPOSITION || "A1SystemLineHFullTimelineReview";
const sampleBeatIds = (process.env.A1_STORYBOARD_MOTION_SAMPLE_BEATS || "H01-B01,H01-B02,H03-B02,H10-B04,H11-B03").split(",").map((item) => item.trim()).filter(Boolean);
const frameRoot = path.join(artifactRoot, "frames");
const publicFrameRoot = path.join(publicRoot, "frames");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function clampFrame(frame, start, duration) {
  return Math.max(start, Math.min(start + Math.max(1, duration) - 1, frame));
}

function frameSet(scene) {
  const start = Number(scene.startFrame || 0);
  const duration = Math.max(1, Number(scene.durationInFrames || 1));
  const phases = scene.motionPlan?.phases || {};
  const rawLocals = [
    Math.max(2, Math.round(duration * 0.12)),
    Number.isFinite(Number(phases.establish?.endFrame)) ? Number(phases.establish.endFrame) : Math.round(duration * 0.36),
    Number.isFinite(Number(phases.emphasize?.endFrame)) ? Number(phases.emphasize.endFrame) : Math.round(duration * 0.62),
  ];
  const frames = rawLocals.map((local) => clampFrame(start + Math.max(0, Number(local)), start, duration));
  return [...new Set(frames)].slice(0, 3);
}

async function imageRaw(filePath) {
  const {data, info} = await sharp(filePath).resize(160, 90, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  return {data, info};
}

async function frameDelta(fileA, fileB) {
  const a = await imageRaw(fileA);
  const b = await imageRaw(fileB);
  const count = Math.min(a.data.length, b.data.length);
  let abs = 0;
  let changedPixels = 0;
  const pixelCount = count / 3;
  for (let i = 0; i < count; i += 3) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const pixel = (dr + dg + db) / (3 * 255);
    abs += pixel;
    if (pixel > 0.025) changedPixels += 1;
  }
  return {
    meanAbsDelta: Number((abs / Math.max(1, pixelCount)).toFixed(5)),
    changedPixelFraction: Number((changedPixels / Math.max(1, pixelCount)).toFixed(5)),
  };
}

for (const required of [entryPoint, propsPath]) {
  if (!fs.existsSync(required)) throw new Error(`required-file-missing:${required}`);
}

const props = readJson(propsPath);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const sceneByBeatId = new Map(scenes.map((scene) => [String(scene.beatId || scene.id || ""), scene]));
const propsSha256 = sha256File(propsPath);
const blockers = [];
const rows = [];

fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(publicFrameRoot, {recursive: true});
const serveUrl = await bundle({entryPoint, publicDir: path.join(rendererRoot, "public"), rootDir: rendererRoot, enableCaching: true});
const browser = await openBrowser("chrome", {chromeMode: "headless-shell", logLevel: "warn"});

try {
  const composition = await selectComposition({serveUrl, id: compositionId, inputProps: props, puppeteerInstance: browser, logLevel: "warn"});
  for (const beatId of sampleBeatIds) {
    const scene = sceneByBeatId.get(beatId);
    const rowBlockers = [];
    if (!scene) {
      rowBlockers.push({id: "sample-scene-missing"});
      rows.push({beatId, status: "FAIL", blockers: rowBlockers});
      continue;
    }
    const frames = frameSet(scene);
    const files = [];
    for (const frame of frames) {
      const file = path.join(frameRoot, `${beatId}-${frame}.png`);
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
      });
      const publicFile = path.join(publicFrameRoot, `${beatId}-${frame}.png`);
      fs.copyFileSync(file, publicFile);
      files.push({frame, file, publicFile, sha256: sha256File(file)});
    }
    const deltas = [];
    for (let index = 1; index < files.length; index += 1) {
      deltas.push({fromFrame: files[0].frame, toFrame: files[index].frame, ...(await frameDelta(files[0].file, files[index].file))});
    }
    const maxMeanAbsDelta = Math.max(0, ...deltas.map((delta) => delta.meanAbsDelta));
    const maxChangedPixelFraction = Math.max(0, ...deltas.map((delta) => delta.changedPixelFraction));
    if (files.length < 3) rowBlockers.push({id: "insufficient-motion-proof-frames", detail: files.map((file) => file.frame)});
    if (maxMeanAbsDelta < 0.012 && maxChangedPixelFraction < 0.08) rowBlockers.push({id: "temporal-motion-too-weak", detail: {maxMeanAbsDelta, maxChangedPixelFraction}});
    rows.push({
      beatId,
      status: rowBlockers.length ? "FAIL" : "PASS",
      source: {
        motionStyle: scene.motionPlan?.motionStyle || "missing",
        typographyPreset: scene.storyboard?.typographyDirector?.preset || "missing",
        colorRole: scene.storyboard?.typographyDirector?.colorRole || "missing",
      },
      frames: files.map((file) => ({frame: file.frame, file: rel(file.file), publicFile: rel(file.publicFile), sha256: file.sha256})),
      deltas,
      maxMeanAbsDelta,
      maxChangedPixelFraction,
      blockers: rowBlockers,
    });
  }
} finally {
  await browser.close({silent: true});
}

for (const row of rows) {
  for (const blocker of row.blockers || []) blockers.push({beatId: row.beatId, ...blocker});
}

const contactSheetPath = path.join(artifactRoot, "motion-temporal-proof-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "motion-temporal-proof-contact-sheet.png");
try {
  const composites = [];
  let rowIndex = 0;
  for (const row of rows) {
    let column = 0;
    for (const frame of row.frames || []) {
      const buffer = await sharp(path.join(root, frame.file)).resize(320, 180, {fit: "cover"}).png().toBuffer();
      composites.push({input: buffer, left: column * 320, top: rowIndex * 180});
      column += 1;
    }
    rowIndex += 1;
  }
  if (composites.length) {
    fs.mkdirSync(path.dirname(contactSheetPath), {recursive: true});
    await sharp({create: {width: 960, height: rows.length * 180, channels: 3, background: "#0b0c0e"}}).composite(composites).png().toFile(contactSheetPath);
    fs.mkdirSync(path.dirname(publicContactSheetPath), {recursive: true});
    fs.copyFileSync(contactSheetPath, publicContactSheetPath);
  }
} catch (error) {
  blockers.push({id: "contact-sheet-failed", detail: error instanceof Error ? error.message : String(error)});
}

const report = {
  contract: "A1StoryboardMotionTemporalProof/v1",
  phaseId,
  status: blockers.length ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    sampleBeatIds,
    propsPath: rel(propsPath),
    propsSha256,
    compositionId,
  },
  policy: {
    fullVideoRenderRequired: false,
    framesPerBeat: 3,
    minMeanAbsDelta: 0.012,
    minChangedPixelFraction: 0.08,
  },
  summary: {
    sampleCount: rows.length,
    passCount: rows.filter((row) => row.status === "PASS").length,
    failCount: rows.filter((row) => row.status === "FAIL").length,
    blockerCount: blockers.length,
    averageMaxMeanAbsDelta: rows.length ? Number((rows.reduce((sum, row) => sum + (row.maxMeanAbsDelta || 0), 0) / rows.length).toFixed(5)) : 0,
    averageMaxChangedPixelFraction: rows.length ? Number((rows.reduce((sum, row) => sum + (row.maxChangedPixelFraction || 0), 0) / rows.length).toFixed(5)) : 0,
  },
  artifacts: {
    contactSheet: fs.existsSync(contactSheetPath) ? rel(contactSheetPath) : null,
    publicContactSheet: fs.existsSync(publicContactSheetPath) ? rel(publicContactSheetPath) : null,
    frameDir: rel(frameRoot),
    publicFrameDir: rel(publicFrameRoot),
  },
  rows,
  blockers,
  nextAction: blockers.length ? "strengthen-motion-or-adjust-sampled-motion-proof" : "motion-temporal-proof-clear",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  contactSheet: report.artifacts.publicContactSheet,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
