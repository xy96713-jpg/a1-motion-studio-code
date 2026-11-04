#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {analyzeImages} from "../lib/visual-sourcing/macos-vision-analyze-v1.mjs";
import {assertNasSemanticSceneCatalog, assertNasSemanticSceneRetrieval, compileNasSemanticSceneCatalog, retrieveNasSemanticScenes} from "../apps/studio-next/src/lib/a1-nas-semantic-scene-index-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "nas-semantic-scene-index-v2");
const sourcePath = process.env.A1_NAS_SCENE_SOURCE || "/Volumes/personalfolder/03_录像/Telegram/精品酒店_原始批次/民宿酒店 2.mp4";
const analysisMaximumMs = Math.max(60_000, Math.trunc(Number(process.env.A1_NAS_SCENE_ANALYSIS_MAX_MS || 900_000)));
const proxyPath = path.join(phaseRoot, "analysis-proxy-720p.mp4");
const frameRoot = path.join(phaseRoot, "keyframes-v2");
const clipRoot = path.join(phaseRoot, "selected-clips-v2");
const dbPath = path.join(phaseRoot, "lancedb");
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const ffprobe = path.join(root, ".tools", "bin", "ffprobe");
const uv = process.env.A1_UV_PATH || "/Users/a1/.local/bin/uv";
const openclipPython = path.join(root, "work", "external-source-tool-canaries-v1", ".venv", "bin", "python");
const lancePython = path.join(phaseRoot, ".venv", "bin", "python");
const authorityFiles = [path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json")];
const ensure = (directory) => fs.mkdirSync(directory, {recursive: true});
const rel = (file) => path.relative(root, file);
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const shaFile = async (file) => new Promise((resolve, reject) => {
  const digest = crypto.createHash("sha256");
  fs.createReadStream(file).on("data", (chunk) => digest.update(chunk)).on("error", reject).on("end", () => resolve(digest.digest("hex")));
});
const shaFileSync = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const xml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function parseLastJsonLine(value) {
  const lines = String(value || "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch {}
  }
  throw new Error("worker-json-output-missing");
}

function runWorker(command, args, request, timeout = 600000) {
  const result = spawnSync(command, args, {cwd: root, input: JSON.stringify(request), encoding: "utf8", timeout, maxBuffer: 80_000_000});
  if (result.status !== 0) throw new Error(`worker-failed:${path.basename(command)}:${String(result.stderr || result.stdout).slice(-2000)}`);
  return parseLastJsonLine(result.stdout);
}

function probe(file) {
  const result = spawnSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,avg_frame_rate:format=duration,size", "-of", "json", file], {encoding: "utf8", timeout: 60_000});
  if (result.status !== 0) throw new Error(`probe-failed:${file}:${String(result.stderr).slice(-800)}`);
  return JSON.parse(result.stdout);
}

function mergeScenes(rows, durationMs) {
  const valid = rows.map((scene, index) => ({id: scene.id || `raw-${index + 1}`, startMs: Math.max(0, Math.trunc(scene.startMs)), endMs: Math.min(durationMs, Math.trunc(scene.endMs))})).filter((scene) => scene.endMs > scene.startMs).sort((left, right) => left.startMs - right.startMs);
  const split = [];
  for (const scene of valid) {
    let cursor = scene.startMs;
    while (cursor < scene.endMs) {
      let endMs = Math.min(scene.endMs, cursor + 12_000);
      if (scene.endMs - endMs > 0 && scene.endMs - endMs < 3_000) endMs = scene.endMs;
      split.push({id: scene.id, startMs: cursor, endMs});
      cursor = endMs;
    }
  }
  const merged = [];
  let pending = null;
  for (const scene of split) {
    if (!pending) pending = {...scene};
    else if (pending.endMs - pending.startMs < 3000 && scene.endMs - pending.startMs <= 15000) pending.endMs = scene.endMs;
    else { merged.push(pending); pending = {...scene}; }
  }
  if (pending) merged.push(pending);
  const normalized = merged.map((scene, index) => ({id: `scene-${String(index + 1).padStart(3, "0")}`, startMs: scene.startMs, endMs: scene.endMs}));
  if (normalized.length <= 48) return normalized;
  const selected = [];
  for (let index = 0; index < 48; index += 1) selected.push(normalized[Math.round(index * (normalized.length - 1) / 47)]);
  return [...new Map(selected.map((scene) => [scene.id, scene])).values()];
}

function overlaps(scene, segment) {
  return Math.max(scene.startMs, segment.startMs) < Math.min(scene.endMs, segment.endMs);
}

function rolesFor({transcript, ocrText, vlmDescription}) {
  const text = `${transcript} ${ocrText} ${vlmDescription}`.toLowerCase();
  const roles = [];
  if (transcript && transcript !== "[NO_SPEECH_TRANSCRIPT]") roles.push("NARRATION_PRESENT");
  if (ocrText) roles.push("TEXT_PRESENT");
  if (/(?:menu|settings|save|submit|input|button|step|process|workflow|dashboard|登录|保存|提交|设置|输入|按钮|步骤|流程|控制台|工作台)/iu.test(ocrText)) roles.push("SCREEN_ACTION", "MECHANISM", "PROCESS");
  if (/(?:person|man|woman|people|face|speaking|talking|人物|男人|女人|人像)/iu.test(text)) roles.push("PERSON");
  if (/(?:speaking to camera|talking to camera|interview|presenting|addressing the camera|面对镜头|采访|讲话)/iu.test(vlmDescription)) roles.push("VISIBLE_SPEAKING");
  if (/(?:screen|interface|document|menu|window|workflow|dashboard|步骤|界面|页面|文档|流程|工作台|控制台)/iu.test(vlmDescription)) roles.push("SCREEN_ACTION", "MECHANISM", "PROCESS");
  if (/(?:room|interior|landscape|street|quiet|atmospher|cinematic|空间|房间|环境|氛围)/iu.test(text)) roles.push("ATMOSPHERE", "ENVIRONMENT", "CINEMATIC_REFERENCE");
  return [...new Set(roles.length ? roles : ["ENVIRONMENT"])];
}

ensure(phaseRoot);
ensure(frameRoot);
ensure(clipRoot);
if (!fs.existsSync(sourcePath)) throw new Error(`source-missing:${sourcePath}`);
if (!fs.existsSync(openclipPython) || !fs.existsSync(lancePython)) throw new Error("analysis-environment-missing");
const authorityBefore = authorityFiles.map(shaFileSync);

console.error("[1/9] hashing selected NAS source");
const sourceStat = fs.statSync(sourcePath);
let sourceSha256 = "";
let cachedFullShaReused = false;
const previousResultPath = path.join(phaseRoot, "result.json");
if (fs.existsSync(previousResultPath)) {
  try {
    const previous = JSON.parse(fs.readFileSync(previousResultPath, "utf8"));
    const previousGeneratedAt = Date.parse(previous.generatedAt || "");
    if (previous.source?.path === sourcePath && previous.source?.bytes === sourceStat.size && /^[a-f0-9]{64}$/u.test(previous.source?.sha256 || "") && Number.isFinite(previousGeneratedAt) && sourceStat.mtimeMs <= previousGeneratedAt) {
      sourceSha256 = previous.source.sha256;
      cachedFullShaReused = true;
    }
  } catch {}
}
if (!sourceSha256) sourceSha256 = await shaFile(sourcePath);
const sourceProbe = probe(sourcePath);
const sourceVideo = sourceProbe.streams.find((stream) => stream.codec_type === "video");
const sourceAudio = sourceProbe.streams.find((stream) => stream.codec_type === "audio");
const sourceDurationMs = Math.round(Number(sourceProbe.format.duration) * 1000);

console.error("[2/9] building 720p analysis proxy");
if (!fs.existsSync(proxyPath)) {
  const temporary = `${proxyPath}.partial-${process.pid}.mp4`;
  const proxyResult = spawnSync(ffmpeg, ["-v", "error", "-y", "-i", sourcePath, "-t", (analysisMaximumMs / 1000).toFixed(3), "-vf", "scale=-2:720", "-c:v", "h264_videotoolbox", "-b:v", "4M", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", temporary], {encoding: "utf8", timeout: 1_200_000, maxBuffer: 8_000_000});
  if (proxyResult.status !== 0) throw new Error(`proxy-render-failed:${String(proxyResult.stderr).slice(-1600)}`);
  fs.renameSync(temporary, proxyPath);
}
const proxyProbe = probe(proxyPath);
const proxyVideo = proxyProbe.streams.find((stream) => stream.codec_type === "video");
const proxySha256 = await shaFile(proxyPath);
const analysisDurationMs = Math.round(Number(proxyProbe.format.duration) * 1000);
if (spawnSync(ffmpeg, ["-v", "error", "-i", proxyPath, "-f", "null", "-"], {encoding: "utf8", timeout: 600_000}).status !== 0) throw new Error("proxy-full-decode-failed");

console.error("[3/9] detecting scenes and transcribing");
const sceneResult = runWorker(uv, ["run", "--quiet", "--with", "scenedetect[opencv]==0.6.7.1", "python", "scripts/a1_scene_detect_worker.py"], {videoPath: proxyPath}, 900_000);
let scenes = mergeScenes(sceneResult.scenes || [], analysisDurationMs);
if (!scenes.length) scenes = [{id: "scene-001", startMs: 0, endMs: analysisDurationMs}];
const transcriptResult = runWorker("python3", ["scripts/a1_mlx_whisper_worker.py"], {videoPath: proxyPath, model: "mlx-community/whisper-tiny", language: "zh"}, 900_000);
const transcript = transcriptResult.segments?.length ? transcriptResult.segments : [{startMs: 0, endMs: analysisDurationMs, text: "[NO_SPEECH_TRANSCRIPT]"}];

console.error(`[4/9] extracting ${scenes.length} keyframes and OCR`);
const frames = [];
for (const [index, scene] of scenes.entries()) {
  const atMs = Math.max(scene.startMs, Math.min(scene.endMs - 1, Math.round((scene.startMs + scene.endMs) / 2)));
  const framePath = path.join(frameRoot, `${String(index + 1).padStart(3, "0")}.png`);
  if (!fs.existsSync(framePath)) {
    const frameResult = spawnSync(ffmpeg, ["-v", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", proxyPath, "-frames:v", "1", framePath], {encoding: "utf8", timeout: 60_000});
    if (frameResult.status !== 0) throw new Error(`keyframe-failed:${scene.id}`);
  }
  frames.push({id: `frame-${String(index + 1).padStart(3, "0")}`, sceneId: scene.id, atMs, path: rel(framePath), sha256: shaFileSync(framePath)});
}
const vision = await analyzeImages(frames.map((frame) => path.join(root, frame.path)), {batchSize: 8});
const visionByPath = new Map((vision.images || []).map((item) => [path.resolve(item.path), item]));
for (const frame of frames) frame.ocrText = (visionByPath.get(path.resolve(root, frame.path))?.observations || []).map((observation) => observation.text).filter(Boolean).join(" ");

const queryDefinitions = [
  {id: "person-testimony-query", genre: "business-profile", text: "person speaking to camera interview explanation", viewerTask: "找到人物面对镜头解释或表达观点的片段", narrativeRole: "IDENTITY_OR_TESTIMONY"},
  {id: "mechanism-process-query", genre: "science-evidence", text: "software workflow steps interface process mechanism", viewerTask: "找到可读界面中的步骤、流程或机制变化", narrativeRole: "PROCESS_OR_SYSTEM"},
  {id: "cinematic-analogy-query", genre: "technology-opinion", text: "quiet atmospheric visual space cinematic transition", viewerTask: "找到可作情绪类比或转场的安静空间画面", narrativeRole: "ATMOSPHERE_OR_EMOTION"},
];

console.error("[5/9] embedding frames and queries with OpenCLIP");
const embeddingResult = runWorker(openclipPython, ["scripts/a1_external_source_tools.py"], {contract: "A1ExternalSourceToolRequest/v1", operation: "embed-batch", images: frames.map((frame) => ({id: frame.id, imagePath: frame.path, sha256: frame.sha256})), texts: queryDefinitions.map((query) => ({id: query.id, text: `${query.text}. ${query.viewerTask}`}))}, 900_000);
if (embeddingResult.status !== "PASS") throw new Error(`embedding-blocked:${embeddingResult.failures?.join(",")}`);
const imageVectorById = new Map(embeddingResult.imageVectors.map((item) => [item.id, item.vector]));
const queryVectorById = new Map(embeddingResult.textVectors.map((item) => [item.id, item.vector]));

const baseSceneRows = scenes.map((scene, index) => {
  const frame = frames.find((item) => item.sceneId === scene.id);
  const sceneTranscript = transcript.filter((segment) => overlaps(scene, segment)).map((segment) => segment.text).join(" ");
  return {...scene, keyframe: {path: frame.path, sha256: frame.sha256, atMs: frame.atMs}, transcript: sceneTranscript, ocrText: frame.ocrText, vlmDescription: "", roles: rolesFor({transcript: sceneTranscript, ocrText: frame.ocrText, vlmDescription: ""}), embedding: imageVectorById.get(frame.id)};
});
let catalog = compileNasSemanticSceneCatalog({source: {path: sourcePath, sha256: sourceSha256, durationMs: analysisDurationMs, rightsStatus: "REFERENCE_ONLY", referenceOnly: true}, analysisProxy: {path: rel(proxyPath), sha256: proxySha256, width: proxyVideo.width, height: proxyVideo.height}, provider: {scene: sceneResult.provider, transcript: transcriptResult.provider, visual: embeddingResult.provider, ocr: {id: "macOS Vision"}, store: {id: "LanceDB", version: "0.27.1"}}, scenes: baseSceneRows});
assertNasSemanticSceneCatalog(catalog);
const preliminary = queryDefinitions.map((query) => retrieveNasSemanticScenes(catalog, {...query, narrativeRole: "", embedding: queryVectorById.get(query.id), minimumMs: 3000, maximumMs: 15000}, {allowReferenceOnly: true, limit: 3}));
const reviewSceneIds = [...new Set(preliminary.flatMap((retrieval) => retrieval.topCandidates.slice(0, 2).map((candidate) => candidate.sceneId)))].slice(0, 6);

console.error(`[6/9] reviewing ${reviewSceneIds.length} top frames with local MLX-VLM`);
const vlmResult = runWorker("python3", ["scripts/a1_mlx_vlm_frame_review_worker.py"], {contract: "A1MlxVlmFrameReviewRequest/v1", frames: reviewSceneIds.map((sceneId) => ({id: sceneId, path: catalog.scenes.find((scene) => scene.id === sceneId).keyframe.path}))}, 600_000);
if (vlmResult.status !== "PASS") throw new Error(`vlm-review-blocked:${vlmResult.failures?.join(",")}`);
const vlmByScene = new Map(vlmResult.reviews.map((item) => [item.id, item.description]));
catalog = compileNasSemanticSceneCatalog({source: catalog.source, analysisProxy: catalog.analysisProxy, provider: {...catalog.provider, vlm: vlmResult.provider}, scenes: catalog.scenes.map((scene) => ({...scene, vlmDescription: vlmByScene.get(scene.id) || "", roles: rolesFor({...scene, vlmDescription: vlmByScene.get(scene.id) || ""})}))});
assertNasSemanticSceneCatalog(catalog);

console.error("[7/9] writing LanceDB and running hybrid retrieval");
const lanceRows = catalog.scenes.map((scene) => ({id: scene.id, vector: scene.embedding, startMs: scene.startMs, endMs: scene.endMs, keyframePath: scene.keyframe.path, transcript: scene.transcript, ocrText: scene.ocrText, vlmDescription: scene.vlmDescription, roles: scene.roles.join(","), rightsStatus: catalog.source.rightsStatus, sourcePath: catalog.source.path, sourceSha256: catalog.source.sha256}));
const lanceWrite = runWorker(lancePython, ["scripts/a1_lancedb_scene_worker.py"], {contract: "A1LanceDbSceneWorkerRequest/v1", operation: "write-index", dbPath: rel(dbPath), tableName: "scenes", rows: lanceRows}, 300_000);
const retrievals = [];
for (const query of queryDefinitions) {
  const vector = queryVectorById.get(query.id);
  const lance = runWorker(lancePython, ["scripts/a1_lancedb_scene_worker.py"], {contract: "A1LanceDbSceneWorkerRequest/v1", operation: "search-index", dbPath: rel(dbPath), tableName: "scenes", vector, limit: 10}, 120_000);
  const retrieval = retrieveNasSemanticScenes(catalog, {...query, embedding: vector, minimumMs: 3000, maximumMs: 15000}, {allowReferenceOnly: true, limit: 3});
  assertNasSemanticSceneRetrieval(retrieval);
  retrievals.push({...retrieval, lanceResults: lance.results});
}

console.error("[8/9] extracting exact review clips and contact sheet");
const selectedArtifacts = [];
for (const retrieval of retrievals) {
  const selected = retrieval.topCandidates[0];
  if (!selected) continue;
  const output = path.join(clipRoot, `${retrieval.query.id}-${selected.sceneId}.mp4`);
  if (!fs.existsSync(output)) {
    const clipResult = spawnSync(ffmpeg, ["-v", "error", "-y", "-ss", (selected.range.inMs / 1000).toFixed(3), "-to", (selected.range.outMs / 1000).toFixed(3), "-i", sourcePath, "-vf", "scale=-2:720", "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output], {encoding: "utf8", timeout: 300_000});
    if (clipResult.status !== 0) throw new Error(`selected-clip-failed:${retrieval.query.id}`);
  }
  selectedArtifacts.push({queryId: retrieval.query.id, sceneId: selected.sceneId, path: rel(output), sha256: shaFileSync(output), range: selected.range, fullDecode: spawnSync(ffmpeg, ["-v", "error", "-i", output, "-f", "null", "-"], {encoding: "utf8", timeout: 120_000}).status === 0});
}
const tileWidth = 540;
const tileHeight = 304;
const labelHeight = 116;
const composites = [];
for (const [rowIndex, retrieval] of retrievals.entries()) {
  if (!retrieval.topCandidates.length) {
    const placeholder = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth * 3}" height="${tileHeight + labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="32" y="150" fill="#c9ef39" font-family="Arial,sans-serif" font-size="28" font-weight="700">NO SEMANTIC MATCH</text><text x="32" y="198" fill="#d7dbd7" font-family="Arial,sans-serif" font-size="18">${xml(retrieval.query.id)} · direct scene evidence missing</text><text x="32" y="238" fill="#8f9892" font-family="Arial,sans-serif" font-size="14">The system refuses to substitute a merely similar image.</text></svg>`);
    composites.push({input: placeholder, left: 0, top: rowIndex * (tileHeight + labelHeight)});
    continue;
  }
  for (const [columnIndex, candidate] of retrieval.topCandidates.slice(0, 3).entries()) {
    const image = await sharp(path.join(root, candidate.keyframe.path)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const description = (candidate.vlmDescription || candidate.transcript || candidate.ocrText || "visual match only").slice(0, 76);
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="16" y="28" fill="${columnIndex === 0 ? "#c9ef39" : "#f2efe8"}" font-family="Arial,sans-serif" font-size="15" font-weight="700">${xml(retrieval.query.id)} · ${columnIndex + 1}</text><text x="16" y="55" fill="#d7dbd7" font-family="Arial,sans-serif" font-size="12">${(candidate.range.inMs / 1000).toFixed(2)}s–${(candidate.range.outMs / 1000).toFixed(2)}s · ${candidate.scores.total.toFixed(3)} · REFERENCE ONLY</text><text x="16" y="83" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">${xml(description)}</text></svg>`);
    composites.push({input: image, left: columnIndex * tileWidth, top: rowIndex * (tileHeight + labelHeight)}, {input: label, left: columnIndex * tileWidth, top: rowIndex * (tileHeight + labelHeight) + tileHeight});
  }
}
const contactSheet = path.join(phaseRoot, "semantic-scene-review-v2.png");
await sharp({create: {width: tileWidth * 3, height: (tileHeight + labelHeight) * retrievals.length, channels: 4, background: "#080b0c"}}).composite(composites).png().toFile(contactSheet);

console.error("[9/9] writing qualification artifacts");
fs.writeFileSync(path.join(phaseRoot, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(path.join(phaseRoot, "retrievals.json"), `${JSON.stringify(retrievals, null, 2)}\n`);
const authorityAfter = authorityFiles.map(shaFileSync);
const fixtures = retrievals.map((retrieval) => ({id: retrieval.query.id, genre: queryDefinitions.find((query) => query.id === retrieval.query.id).genre, status: (retrieval.status === "NO_SEMANTIC_MATCH" || retrieval.topCandidates.length >= 3) && retrieval.topCandidates.every((candidate) => candidate.productionUseAllowed === false) ? "PASS" : "FAIL", retrievalStatus: retrieval.status, topSceneId: retrieval.topCandidates[0]?.sceneId || null, topScore: retrieval.topCandidates[0]?.scores.total ?? null, lanceTopSceneId: retrieval.lanceResults[0]?.id || null}));
const selectedRangeBound = retrievals.every((retrieval) => retrieval.topCandidates.every((candidate) => candidate.range.outMs - candidate.range.inMs <= 15_000));
const body = {contract: "A1NasSemanticSceneIndexQualification/v2", status: fixtures.every((fixture) => fixture.status === "PASS") && selectedArtifacts.every((artifact) => artifact.fullDecode) && selectedRangeBound ? "PASS" : "FAIL", generatedAt: new Date().toISOString(), source: {path: sourcePath, sha256: sourceSha256, bytes: Number(sourceProbe.format.size), modifiedAt: sourceStat.mtime.toISOString(), fullDurationMs: sourceDurationMs, analysisRange: {inMs: 0, outMs: analysisDurationMs}, width: sourceVideo.width, height: sourceVideo.height, videoCodec: sourceVideo.codec_name, audioCodec: sourceAudio?.codec_name || "", rightsStatus: "REFERENCE_ONLY"}, proxy: {path: rel(proxyPath), sha256: proxySha256, bytes: Number(proxyProbe.format.size), durationMs: analysisDurationMs, width: proxyVideo.width, height: proxyVideo.height, fullDecode: true}, catalog: {path: rel(path.join(phaseRoot, "catalog.json")), sha256: catalog.catalogSha256, counts: catalog.counts}, lancedb: {path: rel(dbPath), provider: lanceWrite.provider, rowCount: lanceWrite.rowCount, dimension: lanceWrite.dimension}, fixtures, retrievals: retrievals.map((retrieval) => ({query: retrieval.query, retrievalSha256: retrieval.retrievalSha256, topCandidates: retrieval.topCandidates, lanceTopIds: retrieval.lanceResults.slice(0, 3).map((row) => row.id)})), selectedArtifacts, contactSheet: {path: rel(contactSheet), sha256: shaFileSync(contactSheet), width: tileWidth * 3, height: (tileHeight + labelHeight) * retrievals.length}, providers: {scene: sceneResult.provider, transcript: transcriptResult.provider, visual: embeddingResult.provider, vlm: vlmResult.provider, store: lanceWrite.provider}, checks: {singleSourceFullSha: true, cachedFullShaReused, boundedAnalysisRange: analysisDurationMs <= analysisMaximumMs + 250, sourceReferenceOnly: true, sceneDetectionBound: scenes.length > 0, transcriptBound: transcript.length > 0, ocrAnalyzed: (vision.images || []).length === frames.length, ocrTextDetected: frames.some((frame) => frame.ocrText), embeddingDimension: embeddingResult.dimension, vlmTopKOnly: vlmResult.reviews.length <= 6, lanceRowParity: lanceWrite.rowCount === catalog.scenes.length, threeGenreQueries: fixtures.length === 3, selectedRangeBound, exactSelectedRangesDecoded: selectedArtifacts.every((artifact) => artifact.fullDecode), rightsFilteredBeforeRanking: retrievals.every((retrieval) => retrieval.boundaries.rightsFilteredBeforeRanking), noProductionUse: retrievals.every((retrieval) => retrieval.topCandidates.every((candidate) => candidate.productionUseAllowed === false)), wholeNasScan: false, formalAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter), storyboardMutation: false, productionAdmission: false}, boundary: {reviewOnly: true, wholeNasScan: false, storyboardMutation: false, productionAdmission: false}};
const result = {...body, resultSha256: shaValue(body)};
fs.writeFileSync(path.join(phaseRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
const lines = ["# NAS 场景级语义索引 v2 审核", "", `状态：**${result.status}** · ${catalog.counts.sceneCount} 个场景 · ${embeddingResult.dimension} 维 OpenCLIP · LanceDB ${lanceWrite.provider.version}`, "", `源文件：${sourcePath}`, `权利状态：REFERENCE_ONLY（仅本地分析，不自动进入生产）`, ""];
for (const retrieval of retrievals) {
  const definition = queryDefinitions.find((query) => query.id === retrieval.query.id);
  lines.push(`## ${definition.genre} · ${definition.viewerTask}`, "");
  if (!retrieval.topCandidates.length) lines.push("- `NO_SEMANTIC_MATCH`：没有直接场景证据，拒绝用仅仅相似的画面凑数。");
  for (const [index, candidate] of retrieval.topCandidates.entries()) lines.push(`- ${index + 1}. ${candidate.sceneId} · ${(candidate.range.inMs / 1000).toFixed(2)}–${(candidate.range.outMs / 1000).toFixed(2)} 秒 · ${candidate.scores.total.toFixed(3)} · ${candidate.vlmDescription || candidate.transcript || candidate.ocrText || "仅视觉向量命中"}`);
  lines.push("");
}
lines.push(`审核图：${rel(contactSheet)}`, "", "本阶段没有修改分镜、Assembly、Motion、Resolve 或发布权限。");
fs.writeFileSync(path.join(phaseRoot, "review.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({status: result.status, source: result.source, proxy: result.proxy, catalog: result.catalog, lancedb: result.lancedb, fixtures: result.fixtures, selectedArtifacts: result.selectedArtifacts, contactSheet: result.contactSheet, checks: result.checks, resultSha256: result.resultSha256}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
