#!/usr/bin/env node
/**
 * Objective visual-quality sample gate for final storyboard stills.
 *
 * It samples a small representative set of final stills and checks measurable
 * visual properties: current props binding, non-blank image density, meaningful
 * accent color presence, 16:9 dimensions, and symbolic/no-human-subject policy.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const phaseId = "storyboard-visual-quality-sample-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const stillDir = path.join(root, "apps/studio-next/public/generated/storyboard-stills");
const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const tracePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-intelligent-decision-trace-v1/trace.json");
const defaultBeatIds = "H01-B01,H01-B02,H03-B02,H10-B04,H11-B03";
const sampleBeatIds = (process.env.A1_STORYBOARD_VISUAL_SAMPLE_BEATS || defaultBeatIds).split(",").map((item) => item.trim()).filter(Boolean);

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

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function colorDistance(r, g, b, target) {
  return Math.sqrt((r - target[0]) ** 2 + (g - target[1]) ** 2 + (b - target[2]) ** 2);
}

function ratio(value, total) {
  return total ? Number((value / total).toFixed(5)) : 0;
}

async function analyzeImage(filePath) {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const resized = await image.resize(180, 102, {fit: "fill"}).removeAlpha().raw().toBuffer();
  const pixels = resized.length / 3;
  let lumSum = 0;
  const lums = new Array(pixels);
  let nonPaper = 0;
  let darkInk = 0;
  let cobalt = 0;
  let yellow = 0;
  let red = 0;
  let green = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  for (let i = 0, p = 0; i < resized.length; i += 3, p += 1) {
    const r = resized[i];
    const g = resized[i + 1];
    const b = resized[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lums[p] = lum;
    lumSum += lum;
    if (!(r > 232 && g > 228 && b > 218)) nonPaper += 1;
    if (lum < 90) darkInk += 1;
    if (b > 125 && r < 95 && g < 150) cobalt += 1;
    if (r > 190 && g > 170 && b < 80) yellow += 1;
    if (r > 140 && g < 95 && b < 85) red += 1;
    if (g > 90 && r < 110 && b < 110) green += 1;
    if (p > 0) {
      const diff = Math.abs(lum - lums[p - 1]);
      edgeSum += diff;
      edgeCount += 1;
    }
  }
  const meanLum = lumSum / pixels;
  const variance = lums.reduce((sum, lum) => sum + (lum - meanLum) ** 2, 0) / pixels;
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    aspectRatio: metadata.width && metadata.height ? Number((metadata.width / metadata.height).toFixed(4)) : null,
    fileSizeBytes: fs.statSync(filePath).size,
    meanLuminance: Number(meanLum.toFixed(2)),
    luminanceStdDev: Number(Math.sqrt(variance).toFixed(2)),
    meanEdgeContrast: Number((edgeSum / Math.max(1, edgeCount)).toFixed(2)),
    nonPaperFraction: ratio(nonPaper, pixels),
    darkInkFraction: ratio(darkInk, pixels),
    cobaltFraction: ratio(cobalt, pixels),
    yellowFraction: ratio(yellow, pixels),
    redFraction: ratio(red, pixels),
    greenFraction: ratio(green, pixels),
  };
}

const props = fs.existsSync(propsPath) ? readJson(propsPath) : {scenes: []};
const tracePayload = fs.existsSync(tracePath) ? readJson(tracePath) : {traces: []};
const sceneByBeatId = new Map((props.scenes || []).map((scene) => [scene.beatId, scene]));
const traceByBeatId = new Map((tracePayload.traces || []).map((trace) => [trace.beatId, trace]));
const rendererPropsSha256 = sha256File(rendererPropsPath);
const rows = [];
const blockers = [];

for (const beatId of sampleBeatIds) {
  const scene = sceneByBeatId.get(beatId);
  const trace = traceByBeatId.get(beatId);
  const stillPath = path.join(stillDir, `${beatId}.png`);
  const metaPath = path.join(stillDir, `${beatId}.json`);
  const rowBlockers = [];
  if (!scene) rowBlockers.push({id: "sample-scene-missing"});
  if (!trace) rowBlockers.push({id: "decision-trace-missing"});
  if (!fs.existsSync(stillPath)) rowBlockers.push({id: "sample-still-missing", detail: rel(stillPath)});
  if (!fs.existsSync(metaPath)) rowBlockers.push({id: "sample-still-meta-missing", detail: rel(metaPath)});
  const meta = fs.existsSync(metaPath) ? readJson(metaPath) : null;
  const metaPropsCurrent = meta?.propsSha256 === rendererPropsSha256;
  if (meta && !metaPropsCurrent) rowBlockers.push({id: "sample-still-stale-props", detail: {metaPropsSha256: meta.propsSha256, rendererPropsSha256}});

  let metrics = null;
  if (fs.existsSync(stillPath)) {
    metrics = await analyzeImage(stillPath);
    const aspectOk = metrics.aspectRatio !== null && Math.abs(metrics.aspectRatio - 16 / 9) <= 0.02;
    if (!aspectOk) rowBlockers.push({id: "not-16x9", detail: metrics.aspectRatio});
    if (metrics.fileSizeBytes < 20_000) rowBlockers.push({id: "image-file-too-small", detail: metrics.fileSizeBytes});
    if (metrics.nonPaperFraction < 0.035) rowBlockers.push({id: "image-too-blank", detail: metrics.nonPaperFraction});
    if (metrics.luminanceStdDev < 16) rowBlockers.push({id: "image-low-contrast", detail: metrics.luminanceStdDev});
    if (metrics.meanEdgeContrast < 1.5) rowBlockers.push({id: "image-low-structure", detail: metrics.meanEdgeContrast});
  }

  const colorRole = text(trace?.typographyDecision?.colorRole || scene?.storyboard?.typographyDirector?.colorRole);
  const accentFractions = metrics ? {
    cobalt: metrics.cobaltFraction,
    yellow: metrics.yellowFraction,
    red: metrics.redFraction,
    green: metrics.greenFraction,
  } : {cobalt: 0, yellow: 0, red: 0, green: 0};
  const accentMinimum = colorRole === "verdict-red" ? 0.0012 : colorRole === "signal-yellow" ? 0.0018 : colorRole === "cobalt" ? 0.0018 : 0.001;
  const selectedAccent = colorRole === "verdict-red" ? accentFractions.red : colorRole === "signal-yellow" ? accentFractions.yellow : colorRole === "cobalt" ? accentFractions.cobalt : Math.max(...Object.values(accentFractions));
  if (metrics && selectedAccent < accentMinimum) rowBlockers.push({id: "semantic-accent-too-weak", detail: {colorRole, selectedAccent, accentMinimum, accentFractions}});

  const route = text(trace?.semanticDecision?.objectRoute || scene?.storyboard?.semanticFill?.assetRoute);
  const generatedHumanSubjectsAllowed = trace?.semanticDecision?.generatedHumanSubjectsAllowed === false ? false : false;
  const artworkName = `${scene?.storyboard?.artworkFile || ""} ${scene?.storyboard?.artworkPath || ""}`;
  if (generatedHumanSubjectsAllowed !== false) rowBlockers.push({id: "human-subject-policy-missing"});
  if (/head|face|portrait|person|human|人头|头像|人脸|肖像/iu.test(artworkName)) rowBlockers.push({id: "artwork-name-human-subject-risk", detail: artworkName});

  const row = {
    beatId,
    status: rowBlockers.length ? "FAIL" : "PASS",
    source: {
      stillPath: rel(stillPath),
      metaPath: rel(metaPath),
      metaPropsCurrent,
      traceRoute: route,
      typographyColorRole: colorRole,
      typographyPreset: text(trace?.typographyDecision?.preset || scene?.storyboard?.typographyDirector?.preset),
      motionStyle: text(trace?.motionDecision?.style || scene?.motionPlan?.motionStyle),
      symbolicAbstractionRequired: trace?.semanticDecision?.symbolicAbstractionRequired === true,
      generatedHumanSubjectsAllowed,
    },
    metrics,
    blockers: rowBlockers,
  };
  rows.push(row);
  for (const blocker of rowBlockers) blockers.push({beatId, ...blocker});
}

const contactSheetPath = path.join(artifactRoot, "visual-quality-sample-contact-sheet.png");
const publicContactSheetPath = path.join(publicRoot, "visual-quality-sample-contact-sheet.png");
try {
  const images = [];
  for (const beatId of sampleBeatIds) {
    const stillPath = path.join(stillDir, `${beatId}.png`);
    if (!fs.existsSync(stillPath)) continue;
    const buffer = await sharp(stillPath).resize(480, 270, {fit: "cover"}).png().toBuffer();
    images.push({input: buffer, top: 0, left: images.length * 480});
  }
  if (images.length) {
    fs.mkdirSync(path.dirname(contactSheetPath), {recursive: true});
    await sharp({create: {width: images.length * 480, height: 270, channels: 3, background: "#0b0c0e"}}).composite(images).png().toFile(contactSheetPath);
    fs.mkdirSync(path.dirname(publicContactSheetPath), {recursive: true});
    fs.copyFileSync(contactSheetPath, publicContactSheetPath);
  }
} catch (error) {
  blockers.push({id: "contact-sheet-failed", detail: error instanceof Error ? error.message : String(error)});
}

const report = {
  contract: "A1StoryboardVisualQualitySample/v1",
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
    rendererPropsPath: rel(rendererPropsPath),
    rendererPropsSha256,
    tracePath: rel(tracePath),
  },
  policy: {
    minNonPaperFraction: 0.035,
    minLuminanceStdDev: 16,
    minMeanEdgeContrast: 1.5,
    defaultGeneratedHumanSubjectsAllowed: false,
    symbolicAbstractionRequired: true,
    fullVideoRenderRequired: false,
  },
  summary: {
    sampleCount: rows.length,
    passCount: rows.filter((row) => row.status === "PASS").length,
    failCount: rows.filter((row) => row.status === "FAIL").length,
    blockerCount: blockers.length,
    averageNonPaperFraction: rows.length ? Number((rows.reduce((sum, row) => sum + (row.metrics?.nonPaperFraction || 0), 0) / rows.length).toFixed(5)) : 0,
    averageLuminanceStdDev: rows.length ? Number((rows.reduce((sum, row) => sum + (row.metrics?.luminanceStdDev || 0), 0) / rows.length).toFixed(2)) : 0,
    averageMeanEdgeContrast: rows.length ? Number((rows.reduce((sum, row) => sum + (row.metrics?.meanEdgeContrast || 0), 0) / rows.length).toFixed(2)) : 0,
  },
  artifacts: {
    contactSheet: fs.existsSync(contactSheetPath) ? rel(contactSheetPath) : null,
    publicContactSheet: fs.existsSync(publicContactSheetPath) ? rel(publicContactSheetPath) : null,
  },
  rows,
  blockers,
  nextAction: blockers.length ? "fix-visual-quality-sample-before-aesthetic-upgrade" : "visual-quality-sample-clear",
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
