#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {A1_REFERENCE_SEQUENCE_CORPUS_V2_CONTRACT, a1ReferenceSequenceCorpusV2} from "../apps/studio-next/src/lib/a1-reference-sequence-corpus-v2.ts";
import {assertReferenceSourceEligible} from "../apps/studio-next/src/lib/a1-reference-source-exclusions-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phaseId = "reference-sequence-corpus-v2";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rawDir = path.join(artifactDir, "raw");
const hupoVideo = "/Users/a1/Documents/Codex/写作项目/outputs/BV18RKb6SEp9_非人物画面_v2/source-video.mp4";
const covacutStableVideo = path.join(rawDir, "covacut-DYyLlraBk7p-q90.mp4");
const covacutIncomingVideo = process.env.A1_COVACUT_REFERENCE_VIDEO || "";
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffprobePath = require("@ffprobe-installer/ffprobe").path;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, typeof value === "string" || Buffer.isBuffer(value) ? value : jsonText(value));
  fs.renameSync(temporary, file);
}

function svgText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function sourceVideo(sourceId) {
  return sourceId === "hupo" ? hupoVideo : covacutStableVideo;
}

function probeVideo(file) {
  return JSON.parse(execFileSync(ffprobePath, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,avg_frame_rate", "-of", "json", file], {encoding: "utf8"}));
}

function extractFrame(video, seconds) {
  return execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", video, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"], {encoding: null, maxBuffer: 24 * 1024 * 1024});
}

async function normalizedFrame(sourceId, buffer, width, height) {
  const background = sourceId === "covacut" ? "#050607" : "#121415";
  return sharp(buffer).resize(width, height, {fit: "contain", background, kernel: sharp.kernel.lanczos3}).jpeg({quality: 90, chromaSubsampling: "4:4:4"}).toBuffer();
}

async function buildSequenceSheet(source, sequence, frames) {
  const portrait = source.id === "covacut";
  const frameWidth = portrait ? 200 : 300;
  const frameHeight = portrait ? 356 : 169;
  const gap = 10;
  const margin = 24;
  const headerHeight = 122;
  const width = margin * 2 + frames.length * frameWidth + (frames.length - 1) * gap;
  const height = headerHeight + frameHeight + margin;
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#111315"/><text x="${margin}" y="34" fill="#d7ff45" font-family="Arial,sans-serif" font-size="16" font-weight="700">${svgText(sequence.id)} · ${svgText(sequence.label)}</text><text x="${margin}" y="66" fill="#f3efe4" font-family="Arial,sans-serif" font-size="22" font-weight="700">${svgText(sequence.motionPhrase)}</text><text x="${margin}" y="96" fill="#8f9792" font-family="Arial,sans-serif" font-size="14">${svgText(sequence.stateSequence.join("  →  "))}</text></svg>`);
  const composites = [{input: header, left: 0, top: 0}];
  for (let index = 0; index < frames.length; index += 1) {
    composites.push({input: await normalizedFrame(source.id, frames[index].buffer, frameWidth, frameHeight), left: margin + index * (frameWidth + gap), top: headerHeight});
  }
  return sharp({create: {width, height, channels: 4, background: "#111315"}}).composite(composites).jpeg({quality: 91}).toBuffer();
}

async function buildSourceWall(source, sequences) {
  const width = 960;
  const height = 1080;
  const headerHeight = 104;
  const columns = 2;
  const rows = Math.ceil(sequences.length / columns);
  const gap = 12;
  const margin = 18;
  const cardWidth = Math.floor((width - margin * 2 - gap) / columns);
  const cardHeight = Math.floor((height - headerHeight - margin - gap * (rows - 1)) / rows);
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#e9e1d2"/><text x="24" y="39" fill="#111315" font-family="Arial,sans-serif" font-size="30" font-weight="800">${svgText(source.creator)} / ${svgText(source.visualRole)}</text><text x="24" y="72" fill="#525956" font-family="Arial,sans-serif" font-size="15">${source.sequences.length} sequences · median shot ${source.rhythm.medianShotSeconds}s · reference only</text></svg>`);
  const composites = [{input: header, left: 0, top: 0}];
  for (let index = 0; index < sequences.length; index += 1) {
    const left = margin + (index % columns) * (cardWidth + gap);
    const top = headerHeight + Math.floor(index / columns) * (cardHeight + gap);
    const sequence = sequences[index];
    const thumb = await sharp(sequence.sheetBuffer).resize(cardWidth, cardHeight, {fit: "cover", position: "top", kernel: sharp.kernel.lanczos3}).toBuffer();
    composites.push({input: thumb, left, top});
  }
  return sharp({create: {width, height, channels: 4, background: "#0b0d0e"}}).composite(composites).jpeg({quality: 90}).toBuffer();
}

async function main() {
  assertReferenceSourceEligible("covacut");
  fs.mkdirSync(rawDir, {recursive: true});
  fs.mkdirSync(publicDir, {recursive: true});
  if (!fs.existsSync(hupoVideo)) throw new Error(`hupo-reference-video-missing:${hupoVideo}`);
  if (!fs.existsSync(covacutStableVideo) && covacutIncomingVideo) {
    if (!fs.existsSync(covacutIncomingVideo)) throw new Error(`covacut-reference-input-missing:${covacutIncomingVideo}`);
    fs.copyFileSync(covacutIncomingVideo, covacutStableVideo);
  }
  if (!fs.existsSync(covacutStableVideo)) throw new Error(`covacut-reference-video-missing:${covacutStableVideo}; set A1_COVACUT_REFERENCE_VIDEO once`);

  const sourceRecords = [];
  for (const source of a1ReferenceSequenceCorpusV2.sources) {
    const video = sourceVideo(source.id);
    const probe = probeVideo(video);
    const sequenceRecords = [];
    for (const sequence of source.sequences) {
      const frames = [];
      for (let index = 0; index < sequence.frameTimes.length; index += 1) {
        const timeSeconds = sequence.frameTimes[index];
        const buffer = extractFrame(video, timeSeconds);
        const frameDir = path.join(publicDir, "frames", source.id, sequence.id);
        const fileName = `${String(index + 1).padStart(2, "0")}-${String(timeSeconds).replace(".", "p")}s.jpg`;
        const frameFile = path.join(frameDir, fileName);
        fs.mkdirSync(frameDir, {recursive: true});
        const publicBuffer = await sharp(buffer).jpeg({quality: 90, chromaSubsampling: "4:4:4"}).toBuffer();
        writeAtomic(frameFile, publicBuffer);
        frames.push({
          index,
          timeSeconds,
          buffer: publicBuffer,
          publicUrl: `/generated/system-line/${phaseId}/frames/${source.id}/${sequence.id}/${fileName}`,
          sha256: sha256(publicBuffer),
        });
      }
      const sheetBuffer = await buildSequenceSheet(source, sequence, frames);
      const sheetFile = path.join(publicDir, "sequences", source.id, `${sequence.id}.jpg`);
      writeAtomic(sheetFile, sheetBuffer);
      sequenceRecords.push({
        ...sequence,
        frameCount: frames.length,
        frames: frames.map(({buffer, ...frame}) => frame),
        sheetBuffer,
        sheetPublicUrl: `/generated/system-line/${phaseId}/sequences/${source.id}/${sequence.id}.jpg`,
        sheetSha256: sha256(sheetBuffer),
      });
    }
    const wallBuffer = await buildSourceWall(source, sequenceRecords);
    const wallFile = path.join(publicDir, "sources", `${source.id}.jpg`);
    writeAtomic(wallFile, wallBuffer);
    sourceRecords.push({
      ...source,
      observed: true,
      videoEvidence: {
        sha256: shaFile(video),
        probe,
        artifactOnly: true,
        runtimeAssetAllowed: false,
      },
      sequences: sequenceRecords.map(({sheetBuffer, ...sequence}) => sequence),
      sourceWallPublicUrl: `/generated/system-line/${phaseId}/sources/${source.id}.jpg`,
      sourceWallSha256: sha256(wallBuffer),
      wallBuffer,
    });
  }

  const referenceWallBuffer = await sharp({create: {width: 1920, height: 1080, channels: 4, background: "#090b0c"}}).composite([
    {input: sourceRecords[0].wallBuffer, left: 0, top: 0},
    {input: sourceRecords[1].wallBuffer, left: 960, top: 0},
  ]).jpeg({quality: 91}).toBuffer();
  const referenceWallFile = path.join(publicDir, "reference-wall.jpg");
  writeAtomic(referenceWallFile, referenceWallBuffer);

  const cleanSources = sourceRecords.map(({wallBuffer, ...source}) => source);
  const report = {
    contract: A1_REFERENCE_SEQUENCE_CORPUS_V2_CONTRACT,
    id: a1ReferenceSequenceCorpusV2.id,
    status: "REFERENCE_SEQUENCE_CORPUS_V2_OBSERVED",
    use: a1ReferenceSequenceCorpusV2.use,
    analysisRule: a1ReferenceSequenceCorpusV2.analysisRule,
    productionAssetsForbidden: true,
    directorRules: a1ReferenceSequenceCorpusV2.directorRules,
    sourceCount: cleanSources.length,
    sequenceCount: cleanSources.reduce((sum, source) => sum + source.sequences.length, 0),
    frameCount: cleanSources.reduce((sum, source) => sum + source.sequences.reduce((inner, sequence) => inner + sequence.frames.length, 0), 0),
    allSourcesObserved: cleanSources.every((source) => source.observed),
    allRuntimeAssetsForbidden: cleanSources.every((source) => source.runtimeAssetAllowed === false),
    sources: cleanSources,
    referenceWall: {
      publicUrl: `/generated/system-line/${phaseId}/reference-wall.jpg`,
      sha256: sha256(referenceWallBuffer),
      width: 1920,
      height: 1080,
    },
    nextAction: "bind-every-shot-to-medium-intent-reference-grammar-and-forbidden-primitives",
  };
  writeAtomic(path.join(artifactDir, "corpus.json"), report);
  writeAtomic(path.join(publicDir, "corpus.json"), report);
  console.log(jsonText({status: report.status, sourceCount: report.sourceCount, sequenceCount: report.sequenceCount, frameCount: report.frameCount, referenceWall: report.referenceWall.publicUrl}));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
