#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {A1_REFERENCE_SEQUENCE_CORPUS_CONTRACT, a1ReferenceSequenceCorpus} from "../apps/studio-next/src/lib/a1-reference-sequence-corpus-v1.ts";

const root = process.cwd();
const phaseId = "reference-sequence-corpus-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const rawDir = path.join(artifactDir, "raw");
const localHupoVideo = "/Users/a1/Documents/Codex/写作项目/outputs/BV18RKb6SEp9_非人物画面_v2/source-video.mp4";
const incomingMhtmlDir = process.env.A1_REFERENCE_MHTML_DIR || "/tmp/a1-reference-downloads";
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => sha256(fs.readFileSync(file));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

function parseHeaders(value) {
  return Object.fromEntries(value.split(/\r?\n/u).map((line) => {
    const colon = line.indexOf(":");
    return colon > 0 ? [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()] : null;
  }).filter(Boolean));
}

function parseMhtmlStoryboards(file) {
  const buffer = fs.readFileSync(file);
  const firstHeaderEnd = buffer.indexOf(Buffer.from("\r\n\r\n"));
  if (firstHeaderEnd < 0) throw new Error(`mhtml-header-missing:${file}`);
  const mainHeaders = parseHeaders(buffer.subarray(0, firstHeaderEnd).toString("utf8"));
  const boundaryMatch = String(mainHeaders["content-type"] || "").match(/boundary="?([^";]+)"?/iu);
  if (!boundaryMatch) throw new Error(`mhtml-boundary-missing:${file}`);
  const marker = Buffer.from(`--${boundaryMatch[1]}`);
  const frames = [];
  let cursor = firstHeaderEnd + 4;
  while (cursor < buffer.length) {
    const markerStart = buffer.indexOf(marker, cursor);
    if (markerStart < 0) break;
    let partStart = markerStart + marker.length;
    if (buffer.subarray(partStart, partStart + 2).toString() === "--") break;
    if (buffer.subarray(partStart, partStart + 2).toString() === "\r\n") partStart += 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), partStart);
    if (headerEnd < 0) break;
    const headers = parseHeaders(buffer.subarray(partStart, headerEnd).toString("utf8"));
    const contentLength = Number(headers["content-length"] || 0);
    const payloadStart = headerEnd + 4;
    if (String(headers["content-type"] || "").startsWith("image/") && contentLength > 0) {
      frames.push({
        buffer: buffer.subarray(payloadStart, payloadStart + contentLength),
        durationSeconds: Number(headers["x.yt-dlp.duration"] || 0),
        contentType: headers["content-type"],
      });
    }
    cursor = payloadStart + Math.max(contentLength, 1);
  }
  if (!frames.length) throw new Error(`mhtml-storyboards-missing:${file}`);
  return frames;
}

async function externalFrameAt(storyboards, seconds) {
  let elapsed = 0;
  let selected = storyboards.at(-1);
  let localSeconds = Math.max(0, seconds - storyboards.slice(0, -1).reduce((sum, item) => sum + item.durationSeconds, 0));
  for (const storyboard of storyboards) {
    if (seconds < elapsed + storyboard.durationSeconds) {
      selected = storyboard;
      localSeconds = seconds - elapsed;
      break;
    }
    elapsed += storyboard.durationSeconds;
  }
  const metadata = await sharp(selected.buffer).metadata();
  const columns = 10;
  const rows = 10;
  const cellWidth = Math.floor(Number(metadata.width || 0) / columns);
  const cellHeight = Math.floor(Number(metadata.height || 0) / rows);
  if (!cellWidth || !cellHeight) throw new Error("invalid-storyboard-grid");
  const interval = selected.durationSeconds / (columns * rows);
  const index = Math.max(0, Math.min(columns * rows - 1, Math.floor(localSeconds / interval)));
  return sharp(selected.buffer)
    .extract({left: (index % columns) * cellWidth, top: Math.floor(index / columns) * cellHeight, width: cellWidth, height: cellHeight})
    .resize(640, 360, {fit: "cover", kernel: sharp.kernel.lanczos3})
    .jpeg({quality: 88, chromaSubsampling: "4:4:4"})
    .toBuffer();
}

function hupoFrameAt(seconds) {
  return execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-ss", String(seconds), "-i", localHupoVideo, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"], {encoding: null, maxBuffer: 12 * 1024 * 1024});
}

function svgText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function buildSequenceSheet(source, sequence, frames) {
  const width = 1280;
  const headerHeight = 92;
  const imageHeight = 180;
  const label = `${source.creator} · ${sequence.id} · ${sequence.transitionVerb}`;
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#111315"/><text x="24" y="36" fill="#f3efe4" font-family="Arial,sans-serif" font-size="23" font-weight="700">${svgText(label)}</text><text x="24" y="68" fill="#aeb4b0" font-family="Arial,sans-serif" font-size="16">${svgText(sequence.stateSequence.join(" → "))}</text></svg>`);
  const inputs = [{input: header, left: 0, top: 0}];
  for (let index = 0; index < frames.length; index += 1) {
    inputs.push({input: await sharp(frames[index].buffer).resize(320, imageHeight, {fit: "cover"}).toBuffer(), left: index * 320, top: headerHeight});
  }
  return sharp({create: {width, height: headerHeight + imageHeight, channels: 4, background: "#111315"}}).composite(inputs).jpeg({quality: 90}).toBuffer();
}

async function buildSourceSheet(source, sequences) {
  const width = 1280;
  const sourceHeaderHeight = 112;
  const rowHeight = 272;
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${sourceHeaderHeight}"><rect width="100%" height="100%" fill="#e7dfcf"/><text x="30" y="44" fill="#111315" font-family="Arial,sans-serif" font-size="30" font-weight="800">${svgText(source.creator)}</text><text x="30" y="78" fill="#555b58" font-family="Arial,sans-serif" font-size="17">${svgText(source.title)} · 仅作连续镜头语法对照</text></svg>`);
  const inputs = [{input: header, left: 0, top: 0}];
  for (let index = 0; index < sequences.length; index += 1) inputs.push({input: sequences[index].sheet, left: 0, top: sourceHeaderHeight + index * rowHeight});
  return sharp({create: {width, height: sourceHeaderHeight + sequences.length * rowHeight, channels: 4, background: "#111315"}}).composite(inputs).jpeg({quality: 90}).toBuffer();
}

async function buildWall(sourceRecords) {
  const width = 1920;
  const height = 1080;
  const headerHeight = 92;
  const cardWidth = 620;
  const cardHeight = 470;
  const gap = 20;
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}"><rect width="100%" height="100%" fill="#0d0f10"/><text x="36" y="40" fill="#f3efe4" font-family="Arial,sans-serif" font-size="28" font-weight="800">A1 REFERENCE SEQUENCE CORPUS / 5 SOURCES · 20 SEQUENCES · 80 FRAMES</text><text x="36" y="70" fill="#9fa6a2" font-family="Arial,sans-serif" font-size="16">连续状态用于抽象构图和运动语法；所有参考画面均禁止进入正式成片</text></svg>`);
  const inputs = [{input: header, left: 0, top: 0}];
  for (let sourceIndex = 0; sourceIndex < sourceRecords.length; sourceIndex += 1) {
    const record = sourceRecords[sourceIndex];
    const left = 20 + (sourceIndex % 3) * (cardWidth + gap);
    const top = headerHeight + 15 + Math.floor(sourceIndex / 3) * (cardHeight + 15);
    const cardHeader = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cardWidth}" height="70"><rect width="100%" height="100%" fill="#e7dfcf"/><text x="20" y="31" fill="#111315" font-family="Arial,sans-serif" font-size="24" font-weight="800">${svgText(record.creator)}</text><text x="20" y="55" fill="#5c615e" font-family="Arial,sans-serif" font-size="14">4 continuous sequences / 16 sampled frames</text></svg>`);
    inputs.push({input: cardHeader, left, top});
    for (let sequenceIndex = 0; sequenceIndex < record.sequences.length; sequenceIndex += 1) {
      const sequence = record.sequences[sequenceIndex];
      const y = top + 70 + sequenceIndex * 98;
      for (let frameIndex = 0; frameIndex < sequence.frames.length; frameIndex += 1) {
        inputs.push({input: await sharp(sequence.frames[frameIndex].buffer).resize(150, 84, {fit: "cover"}).toBuffer(), left: left + frameIndex * 155, top: y});
      }
    }
  }
  return sharp({create: {width, height, channels: 4, background: "#0d0f10"}}).composite(inputs).jpeg({quality: 90}).toBuffer();
}

async function main() {
  fs.mkdirSync(artifactDir, {recursive: true});
  fs.mkdirSync(publicDir, {recursive: true});
  fs.mkdirSync(rawDir, {recursive: true});
  const sourceRecords = [];
  for (const source of a1ReferenceSequenceCorpus.sources) {
    let storyboards = null;
    let rawMhtml = null;
    if (source.sourceMode === "youtube-storyboard") {
      const stableRaw = path.join(rawDir, `${source.videoId}.mhtml`);
      const incoming = path.join(incomingMhtmlDir, `${source.videoId}.mhtml`);
      if (!fs.existsSync(stableRaw) && fs.existsSync(incoming)) fs.copyFileSync(incoming, stableRaw);
      if (!fs.existsSync(stableRaw)) throw new Error(`reference-storyboard-missing:${source.videoId}; set A1_REFERENCE_MHTML_DIR`);
      rawMhtml = stableRaw;
      storyboards = parseMhtmlStoryboards(stableRaw);
    }
    const sequenceRecords = [];
    for (const sequence of source.sequences) {
      const frames = [];
      for (let index = 0; index < 4; index += 1) {
        const timeSeconds = sequence.startSeconds + index * sequence.frameStepSeconds;
        const buffer = source.sourceMode === "local-one-fps-frames"
          ? await sharp(hupoFrameAt(timeSeconds)).resize(640, 360, {fit: "cover"}).jpeg({quality: 88}).toBuffer()
          : await externalFrameAt(storyboards, timeSeconds);
        const frameDir = path.join(publicDir, "frames", source.id);
        fs.mkdirSync(frameDir, {recursive: true});
        const fileName = `${sequence.id}-${String(index + 1).padStart(2, "0")}.jpg`;
        const file = path.join(frameDir, fileName);
        fs.writeFileSync(file, buffer);
        frames.push({
          index,
          timeSeconds,
          buffer,
          publicUrl: `/generated/system-line/${phaseId}/frames/${source.id}/${fileName}`,
          sha256: sha256(buffer),
        });
      }
      const sheetBuffer = await buildSequenceSheet(source, sequence, frames);
      const sheetDir = path.join(publicDir, "sequences", source.id);
      fs.mkdirSync(sheetDir, {recursive: true});
      const sheetFile = path.join(sheetDir, `${sequence.id}.jpg`);
      fs.writeFileSync(sheetFile, sheetBuffer);
      sequenceRecords.push({
        ...sequence,
        observed: true,
        frameCount: frames.length,
        frames,
        sheet: sheetBuffer,
        sheetPublicUrl: `/generated/system-line/${phaseId}/sequences/${source.id}/${sequence.id}.jpg`,
        sheetSha256: sha256(sheetBuffer),
      });
    }
    const sourceSheetBuffer = await buildSourceSheet(source, sequenceRecords);
    const sourceSheetFile = path.join(publicDir, "sources", `${source.id}.jpg`);
    fs.mkdirSync(path.dirname(sourceSheetFile), {recursive: true});
    fs.writeFileSync(sourceSheetFile, sourceSheetBuffer);
    sourceRecords.push({
      ...source,
      observed: true,
      rawReference: rawMhtml ? {kind: "youtube-storyboard-mhtml", sha256: shaFile(rawMhtml), artifactOnly: true} : {kind: "local-one-fps-frames", artifactOnly: true},
      sequences: sequenceRecords,
      sourceSheetPublicUrl: `/generated/system-line/${phaseId}/sources/${source.id}.jpg`,
      sourceSheetSha256: sha256(sourceSheetBuffer),
    });
  }
  const wallBuffer = await buildWall(sourceRecords);
  const wallFile = path.join(publicDir, "reference-wall.jpg");
  fs.writeFileSync(wallFile, wallBuffer);
  const cleanSources = sourceRecords.map((source) => ({...source, sequences: source.sequences.map((sequence) => ({...sequence, frames: sequence.frames.map(({buffer, ...frame}) => frame), sheet: undefined}))}));
  const report = {
    contract: A1_REFERENCE_SEQUENCE_CORPUS_CONTRACT,
    id: a1ReferenceSequenceCorpus.id,
    status: "REFERENCE_CORPUS_OBSERVED",
    use: a1ReferenceSequenceCorpus.use,
    sourceCount: cleanSources.length,
    sequenceCount: cleanSources.reduce((sum, source) => sum + source.sequences.length, 0),
    frameCount: cleanSources.reduce((sum, source) => sum + source.sequences.reduce((inner, sequence) => inner + sequence.frames.length, 0), 0),
    allRuntimeAssetsForbidden: cleanSources.every((source) => source.runtimeAssetAllowed === false),
    sources: cleanSources,
    referenceWall: {publicUrl: `/generated/system-line/${phaseId}/reference-wall.jpg`, sha256: sha256(wallBuffer), width: 1920, height: 1080},
  };
  writeJson(path.join(artifactDir, "corpus.json"), report);
  writeJson(path.join(publicDir, "corpus.json"), report);
  console.log(JSON.stringify({status: report.status, sourceCount: report.sourceCount, sequenceCount: report.sequenceCount, frameCount: report.frameCount, referenceWall: report.referenceWall.publicUrl}, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
