#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const outputRoot = path.join(publicRoot, "generated/system-line/reference-sequence-corpus-v3");
const ffmpeg = "/tmp/a1-reference-tools.RoOySb/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const ensureDir = (dir) => fs.mkdirSync(dir, {recursive: true});

if (!fs.existsSync(ffmpeg)) throw new Error("reference-corpus-v3-ffmpeg-missing");

const legacy = readJson(path.join(publicRoot, "generated/system-line/reference-sequence-corpus-v1/corpus.json"));
const sourceVideoById = {
  fern: "/tmp/a1-reference-clips/fern-full.mp4",
  vox: "/tmp/a1-reference-clips/vox-full.webm",
  "cleo-abram": "/tmp/a1-reference-clips/cleo-full.mp4",
};
const sourceConfig = [
  {id: "fern", prefix: "F", corpus: legacy, mode: "high-res-local-source-video"},
  {id: "vox", prefix: "V", corpus: legacy, mode: "high-res-local-source-video"},
  {id: "cleo-abram", prefix: "A", corpus: legacy, mode: "high-res-local-source-video"},
];

function mediumFlowFor(sequence) {
  const mode = sequence.materialMode;
  if (Array.isArray(sequence.mediumFlow)) return sequence.mediumFlow;
  if (mode === "document") return ["document", "typography"];
  if (mode === "diagram") return ["diagram", "typography"];
  if (mode === "typography") return ["typography", "reset"];
  if (mode === "footage" || mode === "archive") return ["real-footage", "typography"];
  return ["real-footage", "typography"];
}

async function stripSheet(frames, destination) {
  const first = await sharp(frames[0].file).metadata();
  const vertical = Number(first.height || 0) > Number(first.width || 0);
  const tileWidth = vertical ? 270 : 480;
  const tileHeight = vertical ? 480 : 270;
  const tiles = await Promise.all(frames.map((frame) => sharp(frame.file).resize(tileWidth, tileHeight, {fit: "contain", background: "#090b0e"}).jpeg({quality: 96}).toBuffer()));
  const sheet = await sharp({create: {width: tileWidth * frames.length, height: tileHeight, channels: 3, background: "#090b0e"}}).composite(tiles.map((input, index) => ({input, left: index * tileWidth, top: 0}))).jpeg({quality: 96}).toBuffer();
  fs.writeFileSync(destination, sheet);
  return {publicUrl: publicUrl(destination), sha256: sha256(sheet), width: tileWidth * frames.length, height: tileHeight, frameAspect: vertical ? "VERTICAL" : "LANDSCAPE"};
}

function extractFrame(sourceVideo, seconds, destination) {
  ensureDir(path.dirname(destination));
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", sourceVideo, "-frames:v", "1", "-q:v", "2", "-y", destination]);
}

async function buildSource(config) {
  const source = config.corpus.sources.find((item) => item.id === config.id);
  if (!source) throw new Error(`reference-corpus-v3-source-missing:${config.id}`);
  const sourceVideo = sourceVideoById[config.id] || null;
  if (sourceVideo && !fs.existsSync(sourceVideo)) throw new Error(`reference-corpus-v3-source-video-missing:${config.id}`);
  const sourceRows = [];
  for (const [sequenceIndex, original] of source.sequences.entries()) {
    const sequenceId = `${config.prefix}-R${String(sequenceIndex + 1).padStart(2, "0")}`;
    const sequenceDir = path.join(outputRoot, "frames", config.id, sequenceId);
    ensureDir(sequenceDir);
    const originalFrames = original.frames;
    const frames = [];
    for (const [frameIndex, originalFrame] of originalFrames.entries()) {
      const timeSeconds = Number(originalFrame.timeSeconds ?? original.frameTimes?.[frameIndex] ?? original.startSeconds + frameIndex);
      const destination = path.join(sequenceDir, `${String(frameIndex + 1).padStart(2, "0")}-${String(timeSeconds).replaceAll(".", "p")}s.jpg`);
      if (sourceVideo) extractFrame(sourceVideo, timeSeconds, destination);
      else fs.copyFileSync(publicFile(originalFrame.publicUrl), destination);
      const metadata = await sharp(destination).metadata();
      frames.push({index: frameIndex, timeSeconds, publicUrl: publicUrl(destination), sha256: sha256(fs.readFileSync(destination)), width: metadata.width, height: metadata.height, file: destination});
    }
    const sheetFile = path.join(outputRoot, "sequences", config.id, `${sequenceId}.jpg`);
    ensureDir(path.dirname(sheetFile));
    const sheet = await stripSheet(frames, sheetFile);
    sourceRows.push({
      id: sequenceId,
      label: original.label || original.id,
      timeRange: [Number(original.timeRange?.[0] ?? original.startSeconds ?? frames[0].timeSeconds), Number(original.timeRange?.[1] ?? frames.at(-1).timeSeconds)],
      frameTimes: frames.map((frame) => frame.timeSeconds),
      narrativeJob: original.narrativeJob || `${original.semanticRole || "sequence"}：${original.transferableGrammar?.join("；") || "观察连续镜头关系"}`,
      mediumFlow: mediumFlowFor(original),
      topology: original.topology || original.layoutSilhouette || "observed-sequence",
      typeActors: original.typeActors || original.typeRoles || ["semantic-type"],
      objectActors: original.objectActors || original.focalPath || ["source-material"],
      motionPhrase: original.motionPhrase || original.transitionVerb || "cut-and-hold",
      stateSequence: original.stateSequence,
      handoffActor: original.handoffActor || original.focalPath?.at(-1) || "last-active-actor",
      transferableRules: original.transferableRules || original.transferableGrammar,
      forbiddenPrimitives: original.forbiddenPrimitives || original.forbiddenTransfer,
      frames: frames.map(({file, ...frame}) => frame),
      sheetPublicUrl: sheet.publicUrl,
      sheetSha256: sheet.sha256,
      sourceQuality: sourceVideo ? "VISUAL_REFERENCE_1080P_OR_BETTER" : "VISUAL_REFERENCE_1080P_VERTICAL",
      sourceRuntimeAssetAllowed: false,
      reviewOnly: true,
    });
  }
  return {
    id: config.id,
    creator: source.creator,
    title: source.title,
    sourceUrl: source.sourceUrl,
    sourceMode: config.mode,
    rights: "comparison-only-copyright-held-by-source",
    runtimeAssetAllowed: false,
    visualRole: source.visualRole || "editorial-sequence-master",
    sourceVideoSha256: sourceVideo ? sha256(fs.readFileSync(sourceVideo)) : null,
    sourceVideoResolution: sourceVideo ? (await sharp(sourceRows[0].frames[0].publicUrl ? publicFile(sourceRows[0].frames[0].publicUrl) : "").metadata().catch(() => ({}))) : null,
    sequenceCount: sourceRows.length,
    frameCount: sourceRows.reduce((sum, row) => sum + row.frames.length, 0),
    sequences: sourceRows,
    runtimeAssetBoundary: "FRAMES_ARE_REVIEW_ONLY_AND_CANNOT_ENTER_PRODUCTION",
  };
}

const sources = [];
for (const config of sourceConfig) sources.push(await buildSource(config));
const body = {
  contract: "A1ReferenceSequenceCorpus/v3",
  id: "multi-creator-high-resolution-sequence-director-v3",
  status: "REFERENCE_SEQUENCE_CORPUS_V3_HIGH_RES_OBSERVED",
  use: "cross-creator-continuous-sequence-grammar-and-visual-red-team-only",
  analysisRule: "high-resolution-raw-frames-first; low-resolution-storyboards-are-structure-only",
  productionAssetsForbidden: true,
  allRuntimeAssetsForbidden: true,
  sourceCount: sources.length,
  sequenceCount: sources.reduce((sum, source) => sum + source.sequenceCount, 0),
  frameCount: sources.reduce((sum, source) => sum + source.frameCount, 0),
  qualityGate: {minimumFormalVisualFrameWidth: 1000, minimumFormalVisualFrameHeight: 700, rawFramesRequired: true, storyboardOnlyEvidenceAllowed: false, runtimeAssetsAllowed: false},
  directorRules: {mediumBeforeDecoration: true, causalScreenOperationsStayFullFrame: true, typographyMustHaveSemanticJob: true, referenceReviewIsSequenceBased: true, crossCreatorComparisonRequired: true, sourceOrPresenterRemainsPrimary: true, persistentUiShellIsNotTheDefaultCarrier: true},
  sources,
};
const corpus = {...body, corpusSha256: sha256(body)};
ensureDir(outputRoot);
fs.writeFileSync(path.join(outputRoot, "corpus.json"), `${JSON.stringify(corpus, null, 2)}\n`);
console.log(JSON.stringify({status: corpus.status, outputRoot, sourceCount: corpus.sourceCount, sequenceCount: corpus.sequenceCount, frameCount: corpus.frameCount, corpusSha256: corpus.corpusSha256, sources: sources.map((source) => ({id: source.id, sourceMode: source.sourceMode, sequenceCount: source.sequenceCount, frameCount: source.frameCount}))}, null, 2));
