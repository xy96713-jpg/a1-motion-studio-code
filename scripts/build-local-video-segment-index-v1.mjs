#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertLocalVideoSegmentIndex, compileLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";
import {analyzeImages} from "../lib/visual-sourcing/macos-vision-analyze-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "external-media-local-segment-indexer-v1");
const sourcePath = path.join(root, "work", "reference-study-BV11Ren6REA4", "source-direct-360p.mp4");
const sourceManifestPath = path.join(root, "work", "reference-study-BV11Ren6REA4", "evidence-manifest.json");
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const ffprobe = path.join(root, ".tools", "bin", "ffprobe");
const uv = process.env.A1_UV_PATH || "/Users/a1/.local/bin/uv";
const openclipPython = path.join(root, "work", "external-source-tool-canaries-v1", ".venv", "bin", "python");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ensureDir = (directory) => fs.mkdirSync(directory, {recursive: true});
const rel = (file) => path.relative(root, file);
const xml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const parseLastJsonLine = (value) => {
  const lines = String(value || "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch {}
  }
  throw new Error("worker-json-output-missing");
};
const runWorker = (command, args, request, timeout = 180000) => {
  const result = spawnSync(command, args, {cwd: root, input: JSON.stringify(request), encoding: "utf8", timeout, maxBuffer: 20_000_000});
  if (result.status !== 0) throw new Error(`worker-failed:${path.basename(command)}:${String(result.stderr || result.stdout).slice(-2000)}`);
  return parseLastJsonLine(result.stdout);
};
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate:format=duration", "-of", "json", file], {encoding: "utf8"}));
const attentionSalience = async (file) => {
  const {data, info} = await sharp(file).resize(160, 90, {fit: "fill"}).removeAlpha().raw().toBuffer({resolveWithObject: true});
  let accented = 0;
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    if (maximum >= 120 && maximum - minimum >= 62 && (maximum - minimum) / Math.max(1, maximum) >= .42) accented += 1;
  }
  return Math.min(1, accented / Math.max(1, info.width * info.height * .12));
};

const fixtures = [
  {id: "identity-anchor-clip", genre: "person-identity", sourceInMs: 7680, sourceOutMs: 22560, query: "same older businessman portrait company logo investment timeline", ocrTerms: [], viewerTask: "保持同一人物身份并找到公司阶段切换", narrativeRole: "IDENTITY"},
  {id: "object-causal-clip", genre: "object-process", sourceInMs: 317680, sourceOutMs: 333520, query: "arcade machines debt note airplane map money bags logistics cash flow", ocrTerms: [], viewerTask: "找到物件复制运输和资金回流的因果状态", narrativeRole: "PROCESS_OBJECT"},
  {id: "document-anchor-clip", genre: "document-context", sourceInMs: 1016680, sourceOutMs: 1031560, query: "businessman life plan document highlighted age goals", ocrTerms: ["人生规划", "20岁", "30岁", "40岁", "50岁", "60岁"], viewerTask: "保持人生规划文档并定位高亮逐行迁移", narrativeRole: "DOCUMENT_EVIDENCE"},
];

ensureDir(phaseRoot);
if (!fs.existsSync(sourcePath)) throw new Error("reference-source-missing");
const sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
if (shaFile(sourcePath) !== sourceManifest.sourceSha256) throw new Error("reference-source-sha-mismatch");
const authorityFiles = [path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json")];
const authorityBefore = authorityFiles.map(shaFile);
const rows = [];

for (const fixture of fixtures) {
  const fixtureRoot = path.join(phaseRoot, "fixtures", fixture.id);
  const frameRoot = path.join(fixtureRoot, "keyframes");
  ensureDir(frameRoot);
  const clipPath = path.join(fixtureRoot, "clip.mp4");
  const clipDurationMs = fixture.sourceOutMs - fixture.sourceInMs;
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (fixture.sourceInMs / 1000).toFixed(3), "-to", (fixture.sourceOutMs / 1000).toFixed(3), "-i", sourcePath, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", clipPath]);
  const clipProbe = probe(clipPath);
  const videoStream = clipProbe.streams.find((stream) => stream.codec_type === "video");
  const audioStream = clipProbe.streams.find((stream) => stream.codec_type === "audio");
  const actualDurationMs = Math.round(Number(clipProbe.format.duration) * 1000);
  if (Math.abs(actualDurationMs - clipDurationMs) > 180) throw new Error(`clip-duration-drift:${fixture.id}:${actualDurationMs}`);

  const sceneResult = runWorker(uv, ["run", "--quiet", "--with", "scenedetect[opencv]==0.6.7.1", "python", "scripts/a1_scene_detect_worker.py"], {videoPath: clipPath});
  let scenes = sceneResult.scenes.filter((scene) => scene.endMs - scene.startMs >= 180).slice(0, 40);
  if (!scenes.length) scenes = [{id: "scene-001", startMs: 0, endMs: actualDurationMs}];
  const transcriptResult = runWorker("python3", ["scripts/a1_mlx_whisper_worker.py"], {videoPath: clipPath, model: "mlx-community/whisper-tiny", language: "zh"}, 300000);
  if (!transcriptResult.segments.length) transcriptResult.segments = [{startMs: 0, endMs: actualDurationMs, text: "[NO_SPEECH_TRANSCRIPT]", words: []}];

  const frames = [];
  for (const [index, scene] of scenes.entries()) {
    const atMs = Math.max(scene.startMs, Math.min(scene.endMs - 1, Math.round((scene.startMs + scene.endMs) / 2)));
    const framePath = path.join(frameRoot, `${String(index + 1).padStart(3, "0")}.png`);
    execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", clipPath, "-frames:v", "1", framePath]);
    frames.push({id: `${fixture.id}-frame-${index + 1}`, sceneId: scene.id, atMs, path: rel(framePath), sha256: shaFile(framePath), attentionSalience: await attentionSalience(framePath)});
  }
  if (frames.length === 1) {
    const scene = scenes[0];
    const atMs = Math.max(scene.startMs, Math.min(scene.endMs - 1, Math.round(scene.startMs + (scene.endMs - scene.startMs) * .75)));
    const framePath = path.join(frameRoot, "002.png");
    execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", clipPath, "-frames:v", "1", framePath]);
    frames.push({id: `${fixture.id}-frame-2`, sceneId: scene.id, atMs, path: rel(framePath), sha256: shaFile(framePath), attentionSalience: await attentionSalience(framePath)});
  }
  const vision = await analyzeImages(frames.map((frame) => path.join(root, frame.path)), {batchSize: 6});
  const visionByPath = new Map((vision.images || []).map((item) => [path.resolve(item.path), item]));
  for (const frame of frames) {
    const analysis = visionByPath.get(path.resolve(root, frame.path));
    frame.ocrText = (analysis?.observations || []).map((observation) => observation.text).filter(Boolean).join(" ");
  }
  const rerank = runWorker(openclipPython, ["scripts/a1_external_source_tools.py"], {contract: "A1ExternalSourceToolRequest/v1", operation: "semantic-rerank", query: fixture.query, candidates: frames.map((frame) => ({id: frame.id, imagePath: frame.path, sha256: frame.sha256}))}, 300000);
  if (rerank.status !== "PASS") throw new Error(`openclip-rerank-blocked:${fixture.id}:${rerank.failures?.join(",")}`);
  const visualScore = new Map(rerank.ranking.map((item) => [item.id, item.cosineScore]));
  const index = compileLocalVideoSegmentIndex({
    id: fixture.id,
    source: {path: rel(sourcePath), sha256: sourceManifest.sourceSha256, rights: sourceManifest.rights, referenceOnly: true},
    clip: {path: rel(clipPath), sha256: shaFile(clipPath), sourceInMs: fixture.sourceInMs, sourceOutMs: fixture.sourceOutMs},
    media: {durationMs: actualDurationMs, fps: Number(String(videoStream.avg_frame_rate).split("/")[0]) / Math.max(1, Number(String(videoStream.avg_frame_rate).split("/")[1])), width: videoStream.width, height: videoStream.height, hasAudio: Boolean(audioStream)},
    query: {text: fixture.query, ocrTerms: fixture.ocrTerms, viewerTask: fixture.viewerTask, narrativeRole: fixture.narrativeRole, minimumMs: 3000, maximumMs: 9000},
    analysis: {scenes, transcript: transcriptResult.segments, keyframes: frames.map((frame) => ({...frame, visualScore: visualScore.get(frame.id) ?? -1})), toolchain: {scene: sceneResult.provider, transcript: transcriptResult.provider, visual: rerank.provider}},
  });
  assertLocalVideoSegmentIndex(index);
  const selectedPath = path.join(fixtureRoot, "selected-segment.mp4");
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (index.selected.selectedRange.inMs / 1000).toFixed(3), "-to", (index.selected.selectedRange.outMs / 1000).toFixed(3), "-i", clipPath, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", selectedPath]);
  const selectedProbe = probe(selectedPath);
  const selectedDurationMs = Math.round(Number(selectedProbe.format.duration) * 1000);
  const receipt = {...index, selectedArtifact: {path: rel(selectedPath), sha256: shaFile(selectedPath), durationMs: selectedDurationMs, fullDecode: spawnSync(ffmpeg, ["-v", "error", "-i", selectedPath, "-f", "null", "-"], {encoding: "utf8"}).status === 0}};
  fs.writeFileSync(path.join(fixtureRoot, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  rows.push({id: fixture.id, genre: fixture.genre, status: "PASS", receiptPath: rel(path.join(fixtureRoot, "receipt.json")), receipt, topCandidates: index.candidates.slice(0, 3)});
}

const tileWidth = 540;
const tileHeight = 350;
const columns = 3;
const composites = [];
for (const [rowIndex, row] of rows.entries()) {
  const framesById = new Map(row.receipt.analysis.keyframes.map((frame) => [frame.id, frame]));
  for (const [candidateIndex, candidate] of row.topCandidates.entries()) {
    const frame = framesById.get(candidate.keyframeId);
    if (!frame) continue;
    const image = await sharp(path.join(root, frame.path)).resize(tileWidth, 250, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="100"><rect width="100%" height="100%" fill="#101315"/><text x="16" y="28" fill="${candidateIndex === 0 ? "#c9ef39" : "#f0ede5"}" font-family="Arial,sans-serif" font-size="16" font-weight="700">${xml(row.id)} · ${candidateIndex + 1}</text><text x="16" y="53" fill="#d6d9d6" font-family="Arial,sans-serif" font-size="12">${(candidate.selectedRange.absoluteSourceInMs / 1000).toFixed(2)}s–${(candidate.selectedRange.absoluteSourceOutMs / 1000).toFixed(2)}s · score ${candidate.scores.total.toFixed(3)}</text><text x="16" y="78" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">${xml(candidate.transcriptExcerpt || "no transcript text")}</text></svg>`);
    composites.push({input: image, left: candidateIndex * tileWidth, top: rowIndex * tileHeight});
    composites.push({input: label, left: candidateIndex * tileWidth, top: rowIndex * tileHeight + 250});
  }
}
const contactSheet = path.join(phaseRoot, "contact-sheet.png");
await sharp({create: {width: tileWidth * columns, height: tileHeight * rows.length, channels: 4, background: "#080b0c"}}).composite(composites).png().toFile(contactSheet);
const authorityAfter = authorityFiles.map(shaFile);
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("local-video-index-mutated-formal-authority");
const body = {
  contract: "A1LocalVideoSegmentIndexQualification/v1",
  status: rows.every((row) => row.status === "PASS" && row.receipt.selectedArtifact.fullDecode) ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  fixtures: rows.map((row) => ({
    id: row.id,
    genre: row.genre,
    status: row.status,
    receiptPath: row.receiptPath,
    indexSha256: row.receipt.indexSha256,
    selectedArtifact: row.receipt.selectedArtifact,
  })),
  counts: {
    fixtureCount: rows.length,
    sceneCount: rows.reduce((sum, row) => sum + row.receipt.analysis.scenes.length, 0),
    transcriptSegmentCount: rows.reduce((sum, row) => sum + row.receipt.analysis.transcript.length, 0),
    keyframeCount: rows.reduce((sum, row) => sum + row.receipt.analysis.keyframes.length, 0),
  },
  contactSheet: {
    path: rel(contactSheet),
    sha256: shaFile(contactSheet),
    width: tileWidth * columns,
    height: tileHeight * rows.length,
  },
  checks: {
    sceneDetectionBound: rows.every((row) => row.receipt.analysis.toolchain.scene?.id === "PySceneDetect"),
    wordTimestampsBound: rows.every((row) => row.receipt.analysis.toolchain.transcript?.wordTimestamps === true),
    openclipRevisionBound: rows.every((row) => Boolean(row.receipt.analysis.toolchain.visual?.revision)),
    exactSourceRangesBound: rows.every((row) => row.receipt.selected.selectedRange.absoluteSourceInMs >= row.receipt.clip.sourceInMs && row.receipt.selected.selectedRange.absoluteSourceOutMs <= row.receipt.clip.sourceOutMs),
    sourceOrderPreserved: rows.every((row) => row.receipt.boundaries.sourceOrderPreserved && row.receipt.boundaries.speed === 1),
    referenceOnly: rows.every((row) => row.receipt.source.referenceOnly),
    formalAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter),
    productionAdmission: false,
  },
  boundary: {
    reviewOnly: true,
    sourceRights: sourceManifest.rights,
    storyboardMutation: false,
    formalWorkspaceMutation: false,
    productionAdmission: false,
  },
};
const result = {...body, resultSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(phaseRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, counts: result.counts, contactSheet: result.contactSheet, checks: result.checks, resultSha256: result.resultSha256}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
