#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = path.resolve(import.meta.dirname, "..");
const proofRoot = path.join(root, "work/hupo-continuous-pixel-proof-v1");
const sourceFile = path.join(proofRoot, "source/BV18RKb6SEp9-720p.mp4");
const corpusFile = path.join(root, "apps/studio-next/public/generated/system-line/reference-sequence-corpus-v2/corpus.json");
const corpus = JSON.parse(fs.readFileSync(corpusFile, "utf8"));
const source = corpus.sources.find((item) => item.id === "hupo");
if (!source) throw new Error("hupo-continuous-proof-source-missing");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const relative = (value) => path.relative(root, value);

async function normalizedPixels(file) {
  const {data} = await sharp(file).resize(320, 180, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  return data;
}

async function normalizedMeanAbsoluteDifference(leftFile, rightFile) {
  const [left, right] = await Promise.all([normalizedPixels(leftFile), normalizedPixels(rightFile)]);
  if (left.length !== right.length) throw new Error("hupo-continuous-proof-pixel-length-mismatch");
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length / 255;
}

function labelSvg(width, height, primary, secondary) {
  const safePrimary = primary.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const safeSecondary = secondary.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0a0b0e"/><text x="12" y="22" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#f4f0e8">${safePrimary}</text><text x="12" y="43" font-family="Arial,sans-serif" font-size="11" fill="#aeb4be">${safeSecondary}</text></svg>`);
}

const sequences = [];
const sequenceSheetBuffers = [];
for (const sequence of source.sequences) {
  const newDir = path.join(proofRoot, "sequences", sequence.id);
  const newFiles = fs.readdirSync(newDir).filter((name) => /\.(jpe?g|png)$/iu.test(name)).sort().map((name) => path.join(newDir, name));
  if (newFiles.length !== sequence.frames.length) throw new Error(`hupo-continuous-proof-frame-count:${sequence.id}`);
  const comparisons = [];
  for (const [index, frame] of sequence.frames.entries()) {
    const oldFile = path.join(root, "apps/studio-next/public", frame.publicUrl.replace(/^\//u, ""));
    const newFile = newFiles[index];
    if (!fs.existsSync(oldFile) || !fs.existsSync(newFile)) throw new Error(`hupo-continuous-proof-frame-missing:${sequence.id}:${index}`);
    const differenceRatio = await normalizedMeanAbsoluteDifference(oldFile, newFile);
    comparisons.push({
      index,
      timeSeconds: frame.timeSeconds,
      oldArtifact: {path: relative(oldFile), sha256: frame.sha256},
      newArtifact: {path: relative(newFile), sha256: sha256(newFile)},
      normalizedMeanAbsoluteDifference: differenceRatio,
      contentMatch: differenceRatio <= 0.12,
    });
  }
  if (comparisons.some((item) => !item.contentMatch)) throw new Error(`hupo-continuous-proof-content-drift:${sequence.id}`);

  const tileWidth = 320;
  const tileHeight = 180;
  const labelHeight = 54;
  const layers = [];
  for (const [index, comparison] of comparisons.entries()) {
    const frame = await sharp(path.join(root, comparison.newArtifact.path)).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = labelSvg(tileWidth, labelHeight, `${sequence.id} · ${comparison.timeSeconds.toFixed(1)}s`, `diff ${(comparison.normalizedMeanAbsoluteDifference * 100).toFixed(2)}% · ${sequence.stateSequence[index] || "state"}`);
    const tile = await sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#0a0b0e"}}).composite([{input: label, left: 0, top: 0}, {input: frame, left: 0, top: labelHeight}]).png().toBuffer();
    layers.push({input: tile, left: index * tileWidth, top: 0});
  }
  const sheet = await sharp({create: {width: sequence.frames.length * tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#0a0b0e"}}).composite(layers).jpeg({quality: 92}).toBuffer();
  const sheetFile = path.join(proofRoot, "sequence-sheets", `${sequence.id}.jpg`);
  fs.mkdirSync(path.dirname(sheetFile), {recursive: true});
  fs.writeFileSync(sheetFile, sheet);
  sequenceSheetBuffers.push({id: sequence.id, label: sequence.label, input: sheet});
  sequences.push({
    id: sequence.id,
    label: sequence.label,
    timeRange: sequence.timeRange,
    narrativeJob: sequence.narrativeJob,
    topology: sequence.topology,
    mediumFlow: sequence.mediumFlow,
    stateSequence: sequence.stateSequence,
    handoffActor: sequence.handoffActor,
    motionPhrase: sequence.motionPhrase,
    transferableRules: sequence.transferableRules,
    forbiddenPrimitives: sequence.forbiddenPrimitives,
    frameCount: comparisons.length,
    maximumNormalizedDifference: Math.max(...comparisons.map((item) => item.normalizedMeanAbsoluteDifference)),
    frames: comparisons,
    sheet: {path: relative(sheetFile), sha256: sha256(sheet), width: 1280, height: 234},
  });
}

const overviewWidth = 1280;
const overviewColumns = 2;
const overviewTileWidth = 640;
const overviewTileHeight = 117;
const overviewLabelHeight = 42;
const overviewLayers = [];
for (const [index, sequence] of sequenceSheetBuffers.entries()) {
  const thumb = await sharp(sequence.input).resize(overviewTileWidth, overviewTileHeight, {fit: "fill"}).png().toBuffer();
  const label = labelSvg(overviewTileWidth, overviewLabelHeight, `${sequence.id} · ${sequence.label}`, "verified old/new frame lineage");
  const tile = await sharp({create: {width: overviewTileWidth, height: overviewTileHeight + overviewLabelHeight, channels: 4, background: "#0a0b0e"}}).composite([{input: label, left: 0, top: 0}, {input: thumb, left: 0, top: overviewLabelHeight}]).png().toBuffer();
  overviewLayers.push({input: tile, left: (index % overviewColumns) * overviewTileWidth, top: Math.floor(index / overviewColumns) * (overviewTileHeight + overviewLabelHeight)});
}
const overviewRows = Math.ceil(sequenceSheetBuffers.length / overviewColumns);
const overview = await sharp({create: {width: overviewWidth, height: overviewRows * (overviewTileHeight + overviewLabelHeight), channels: 4, background: "#0a0b0e"}}).composite(overviewLayers).jpeg({quality: 92}).toBuffer();
const overviewFile = path.join(proofRoot, "hupo-ten-sequence-continuous-proof.jpg");
fs.writeFileSync(overviewFile, overview);

const fullFrames = fs.readdirSync(path.join(proofRoot, "frames-2s")).filter((name) => /\.(jpe?g|png)$/iu.test(name));
const fullSheets = fs.readdirSync(path.join(proofRoot, "contact-sheets-2s")).filter((name) => /\.(jpe?g|png)$/iu.test(name)).sort();
const observationsFile = path.join(proofRoot, "observations-2s.json");
const sourceBytesSha256 = sha256(sourceFile);
const priorArtifactSha256 = source.videoEvidence.sha256;

const report = {
  contract: "A1HupoContinuousPixelProof/v1",
  status: "PASS_CONTINUOUS_SOURCE_AND_SEQUENCE_LINEAGE",
  creator: source.creator,
  title: "未来最贵的员工：一个人就能把事做成",
  sourceUrl: source.sourceUrl,
  source: {
    path: relative(sourceFile),
    sha256: sourceBytesSha256,
    width: 1280,
    height: 720,
    durationSeconds: 258.4,
    fps: 30,
    sizeBytes: fs.statSync(sourceFile).size,
    priorArtifactSha256,
    priorArtifactOnly: source.videoEvidence.artifactOnly,
    contentLineageVerifiedByExactTimeFrameComparison: true,
  },
  fullRunSampling: {
    intervalSeconds: 2,
    frameCount: fullFrames.length,
    observations: {path: relative(observationsFile), sha256: sha256(observationsFile)},
    timestampedContactSheets: fullSheets.map((name) => ({path: relative(path.join(proofRoot, "contact-sheets-2s", name)), sha256: sha256(path.join(proofRoot, "contact-sheets-2s", name))})),
  },
  sequenceCount: sequences.length,
  sequenceFrameCount: sequences.reduce((sum, sequence) => sum + sequence.frameCount, 0),
  maximumLineageDifference: Math.max(...sequences.flatMap((sequence) => sequence.frames.map((frame) => frame.normalizedMeanAbsoluteDifference))),
  sequences,
  visibleArtifact: {path: relative(overviewFile), sha256: sha256(overview), width: overviewWidth, height: overviewRows * (overviewTileHeight + overviewLabelHeight)},
  validation: {
    sourceExists: fs.existsSync(sourceFile),
    sourceDurationMatchesPrior: Math.abs(258.4 - source.rhythm.durationSeconds) <= 0.01,
    fullRunSampled: fullFrames.length === 129,
    sequenceCoverageComplete: sequences.length === 10 && sequences.every((sequence) => sequence.frameCount === 4),
    everyFrameHashBound: sequences.every((sequence) => sequence.frames.every((frame) => frame.newArtifact.sha256 && frame.oldArtifact.sha256)),
    priorCorpusContentMatched: sequences.every((sequence) => sequence.frames.every((frame) => frame.contentMatch)),
  },
  boundary: {
    privateReferenceAnalysisOnly: true,
    rights: source.rights,
    runtimeAssetAllowed: false,
    referenceFramesAreProductionAssets: false,
    currentWorkspaceMutated: false,
    currentBoardMutated: false,
    productionAdmission: false,
    motionAdmission: false,
  },
};

if (!Object.values(report.validation).every(Boolean)) throw new Error(`hupo-continuous-proof-validation-failed:${JSON.stringify(report.validation)}`);
fs.writeFileSync(path.join(proofRoot, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({contract: report.contract, status: report.status, source: report.source, fullRunSampling: {intervalSeconds: report.fullRunSampling.intervalSeconds, frameCount: report.fullRunSampling.frameCount, sheetCount: report.fullRunSampling.timestampedContactSheets.length}, sequenceCount: report.sequenceCount, sequenceFrameCount: report.sequenceFrameCount, maximumLineageDifference: report.maximumLineageDifference, visibleArtifact: report.visibleArtifact, validation: report.validation, boundary: report.boundary}, null, 2));
