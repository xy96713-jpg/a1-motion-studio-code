#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const currentReportPath = path.join(generatedRoot, "all-shot-selected-review-v1/report.json");
const benchmarkJsonPath = process.argv.find((item) => item.startsWith("--benchmark="))?.split("=").slice(1).join("=")
  || "/Users/a1/.codex/visualizations/2026/07/30/019fb19f-8eed-7521-8278-3d25fc16e324/hubo-reference-sequence-red-team-v1.json";
const referenceContactPath = process.argv.find((item) => item.startsWith("--reference="))?.split("=").slice(1).join("=")
  || "/Users/a1/Documents/Codex/写作项目/outputs/BV18RKb6SEp9_非人物画面_v2/contact-sheet-curated.jpg";
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const round = (value, digits = 4) => Number(value.toFixed(digits));

if (!fs.existsSync(currentReportPath)) throw new Error("reference-parity-current-report-missing");
if (!fs.existsSync(benchmarkJsonPath)) throw new Error("reference-parity-benchmark-contract-missing");
if (!fs.existsSync(referenceContactPath)) throw new Error("reference-parity-contact-sheet-missing");

const currentReport = JSON.parse(fs.readFileSync(currentReportPath, "utf8"));
const benchmark = JSON.parse(fs.readFileSync(benchmarkJsonPath, "utf8"));
const currentShots = currentReport.shots.filter((shot) => !String(shot.editMode || "").startsWith("presenter-"));
if (!currentShots.length) throw new Error("reference-parity-no-comparable-current-shots");

function publicFile(publicUrl) {
  const resolved = path.resolve(publicRoot, String(publicUrl || "").replace(/^\/+/, ""));
  if (!resolved.startsWith(`${publicRoot}${path.sep}`)) throw new Error("reference-parity-public-path-escape");
  return resolved;
}

async function frameMetrics(input) {
  const {data, info} = await sharp(input).resize(160, 90, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const luminance = new Float32Array(info.width * info.height);
  let mean = 0;
  let chroma = 0;
  let dark = 0;
  let light = 0;
  const bins = new Uint32Array(16);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * info.channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const value = .2126 * red + .7152 * green + .0722 * blue;
    luminance[pixel] = value;
    mean += value;
    chroma += Math.max(red, green, blue) - Math.min(red, green, blue);
    if (value < 48) dark += 1;
    if (value > 208) light += 1;
    bins[Math.min(15, Math.floor(value / 16))] += 1;
  }
  mean /= luminance.length;
  let variance = 0;
  let edgeCount = 0;
  let edgeSamples = 0;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const index = y * info.width + x;
    variance += (luminance[index] - mean) ** 2;
    if (x + 1 < info.width) {
      if (Math.abs(luminance[index] - luminance[index + 1]) >= 24) edgeCount += 1;
      edgeSamples += 1;
    }
    if (y + 1 < info.height) {
      if (Math.abs(luminance[index] - luminance[index + info.width]) >= 24) edgeCount += 1;
      edgeSamples += 1;
    }
  }
  let entropy = 0;
  for (const count of bins) if (count) {
    const probability = count / luminance.length;
    entropy -= probability * Math.log2(probability);
  }
  const hashPixels = await sharp(input).resize(9, 8, {fit: "fill"}).grayscale().raw().toBuffer();
  let differenceHash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    if (hashPixels[y * 9 + x] > hashPixels[y * 9 + x + 1]) differenceHash |= 1n << bit;
    bit += 1n;
  }
  return {
    meanLuminance: round(mean / 255),
    luminanceContrast: round(Math.sqrt(variance / luminance.length) / 255),
    edgeDensity: round(edgeCount / Math.max(1, edgeSamples)),
    colorfulness: round(chroma / luminance.length / 255),
    darkRatio: round(dark / luminance.length),
    lightRatio: round(light / luminance.length),
    entropy: round(entropy / 4),
    differenceHash: differenceHash.toString(16).padStart(16, "0"),
  };
}

function hamming(left, right) {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count / 64;
}

function summarize(frames) {
  const metricIds = ["meanLuminance", "luminanceContrast", "edgeDensity", "colorfulness", "darkRatio", "lightRatio", "entropy"];
  const metrics = Object.fromEntries(metricIds.map((id) => {
    const values = frames.map((frame) => frame.metrics[id]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
    return [id, {mean: round(mean), spread: round(spread)}];
  }));
  const adjacentHashDistance = frames.slice(1).map((frame, index) => hamming(frames[index].metrics.differenceHash, frame.metrics.differenceHash));
  return {
    frameCount: frames.length,
    metrics,
    adjacentSilhouetteDistance: {
      mean: round(adjacentHashDistance.reduce((sum, value) => sum + value, 0) / Math.max(1, adjacentHashDistance.length)),
      minimum: round(Math.min(...adjacentHashDistance)),
    },
  };
}

async function referenceFrames() {
  const curatedDir = path.join(path.dirname(referenceContactPath), "curated");
  const curatedFiles = fs.existsSync(curatedDir)
    ? fs.readdirSync(curatedDir).filter((file) => /\.(?:png|jpe?g|webp)$/iu.test(file)).sort((left, right) => Number(left.match(/^(\d+)s_/u)?.[1] || 0) - Number(right.match(/^(\d+)s_/u)?.[1] || 0))
    : [];
  if (curatedFiles.length >= Number(benchmark.reference.curatedFrameCount || 32)) {
    const frames = [];
    for (const file of curatedFiles.slice(0, Number(benchmark.reference.curatedFrameCount || 32))) {
      const second = Number(file.match(/^(\d+)s_/u)?.[1] || 0);
      const family = benchmark.sequenceFamilies.find((item) => second >= item.range[0] && second <= item.range[1]);
      frames.push({id: `R-${String(second).padStart(3, "0")}`, second, familyId: family?.id || null, metrics: await frameMetrics(path.join(curatedDir, file))});
    }
    return frames;
  }
  const metadata = await sharp(referenceContactPath).metadata();
  const frameCount = Number(benchmark.reference.curatedFrameCount || 32);
  const columns = 5;
  const rows = Math.ceil(frameCount / columns);
  const cellWidth = Math.floor(metadata.width / columns);
  const rowHeight = Math.floor(metadata.height / rows);
  const frameHeight = Math.min(rowHeight, Math.round(cellWidth * 9 / 16));
  const frames = [];
  for (let index = 0; index < frameCount; index += 1) {
    const left = index % columns * cellWidth;
    const top = Math.floor(index / columns) * rowHeight;
    const width = Math.min(cellWidth, metadata.width - left);
    const height = Math.min(frameHeight, metadata.height - top);
    const buffer = await sharp(referenceContactPath).extract({left, top, width, height}).png().toBuffer();
    frames.push({id: `R-${String(index + 1).padStart(2, "0")}`, second: null, familyId: null, metrics: await frameMetrics(buffer)});
  }
  return frames;
}

const currentFrames = [];
for (const shot of currentShots) {
  const file = publicFile(shot.previewPublicUrl);
  if (!fs.existsSync(file)) throw new Error(`reference-parity-current-frame-missing:${shot.shotId}`);
  currentFrames.push({id: shot.shotId, editMode: shot.editMode, metrics: await frameMetrics(file)});
}
const referenceFrameMetrics = await referenceFrames();
const current = summarize(currentFrames);
const reference = summarize(referenceFrameMetrics);
const comparisonIds = ["meanLuminance", "luminanceContrast", "edgeDensity", "colorfulness", "lightRatio", "entropy"];
function compareSummaries(currentSummary, referenceSummary) {
  const symmetricMetrics = new Set(["meanLuminance", "lightRatio"]);
  const result = Object.fromEntries(comparisonIds.map((id) => {
    const currentValue = currentSummary.metrics[id].mean;
    const referenceValue = referenceSummary.metrics[id].mean;
    const ratio = currentValue / Math.max(.0001, referenceValue);
    return [id, {current: currentValue, reference: referenceValue, ratio: round(ratio), withinReferenceBand: ratio >= .72 && (!symmetricMetrics.has(id) || ratio <= 1.38)}];
  }));
  result.sequenceSilhouette = {
    current: currentSummary.adjacentSilhouetteDistance.mean,
    reference: referenceSummary.adjacentSilhouetteDistance.mean,
    ratio: round(currentSummary.adjacentSilhouetteDistance.mean / Math.max(.0001, referenceSummary.adjacentSilhouetteDistance.mean)),
    withinReferenceBand: currentSummary.adjacentSilhouetteDistance.mean >= referenceSummary.adjacentSilhouetteDistance.mean * .72,
  };
  return result;
}

const comparison = compareSummaries(current, reference);
const modeReferenceFamilies = {
  "screen-demo": ["R02"],
  "full-package": ["R03", "R04", "R05", "R06", "R08", "R10"],
  "type-only": ["R09"],
};
const familyComparisons = Object.fromEntries(Object.entries(modeReferenceFamilies).map(([mode, familyIds]) => {
  const currentModeFrames = currentFrames.filter((frame) => frame.editMode === mode);
  const referenceFamilyFrames = referenceFrameMetrics.filter((frame) => familyIds.includes(frame.familyId));
  const currentSummary = summarize(currentModeFrames);
  const referenceSummary = summarize(referenceFamilyFrames);
  const modeComparison = compareSummaries(currentSummary, referenceSummary);
  const gaps = Object.entries(modeComparison).filter(([, value]) => !value.withinReferenceBand).map(([id]) => id);
  return [mode, {familyIds, currentSummary, referenceSummary, comparison: modeComparison, gaps}];
}));
const failures = Object.entries(familyComparisons).flatMap(([mode, value]) => value.gaps.map((id) => `reference-family-gap:${mode}:${id}`));
const report = {
  contract: "A1ReferencePixelParityAudit/v1",
  status: failures.length ? "REVISE" : "PIXEL_BAND_PASS_VISUAL_JUDGMENT_PENDING",
  generatedAt: new Date().toISOString(),
  scope: "non-presenter-like-for-like-only",
  reference: {
    videoId: benchmark.reference.videoId,
    familyCount: benchmark.sequenceFamilies.length,
    contactSheetPath: referenceContactPath,
    contactSheetSha256: sha256(fs.readFileSync(referenceContactPath)),
    summary: reference,
  },
  current: {
    reportPublicUrl: "/generated/system-line/editorial-asset-workbench-v1/all-shot-selected-review-v1/report.json",
    reportSha256: sha256(fs.readFileSync(currentReportPath)),
    shotIds: currentFrames.map((frame) => frame.id),
    modeCounts: Object.fromEntries([...new Set(currentFrames.map((frame) => frame.editMode))].map((mode) => [mode, currentFrames.filter((frame) => frame.editMode === mode).length])),
    summary: current,
  },
  comparison,
  familyComparisons,
  failures,
  limitations: [
    "pixel statistics cannot certify typography taste, factual material specificity or editorial meaning",
    "reference contact crops are used only for local diagnostic comparison",
    "presenter shots are excluded because the supplied reference sheet contains non-presenter frames",
  ],
  gates: {referenceMaturityAllowed: false, acceptedShotIrAdoptionAllowed: false, fullFilmAllowed: false},
};
// This is a diagnostic report, not an authoritative workbench runtime asset.
// Keep it outside the active editorial phase so running the audit cannot make
// the artifact-authority gate fail on its own output.
const outputDir = path.join(publicRoot, "generated/system-line/reference-pixel-parity-v1");
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
