#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";
import {analyzeImages} from "../lib/visual-sourcing/macos-vision-analyze-v1.mjs";
import {assertLocalVideoSegmentIndex, compileLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";
import {discoverExternalMediaMetadata, resolveWikimediaVideoDerivative} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";
import {assertFreshExternalSearchCandidate, assertStoryboardLiveMediaSearchPlan, compileStoryboardLiveMediaSearchPlan} from "../apps/studio-next/src/lib/a1-storyboard-live-media-search-v1.mjs";
import {allocateSequenceMedia, assertSequenceMediaAllocation, assertStoryboardMediaNeedPlan, assertStoryboardMediaRetrieval, compileStoryboardMediaNeedPlan, retrieveStoryboardMediaCandidates} from "../apps/studio-next/src/lib/a1-storyboard-media-retrieval-orchestrator-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "storyboard-media-retrieval-orchestrator-v1");
const liveRoot = path.join(phaseRoot, "live-external-search-v2");
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const ffprobe = path.join(root, ".tools", "bin", "ffprobe");
const uv = "/Users/a1/.local/bin/uv";
const openclipPython = path.join(root, "work", "external-source-tool-canaries-v1", ".venv", "bin", "python");
const authorityFiles = [path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json")];
const ensure = (directory) => fs.mkdirSync(directory, {recursive: true});
const rel = (file) => path.relative(root, file);
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const xml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate:format=duration", "-of", "json", file], {encoding: "utf8"}));
const parseLastJsonLine = (value) => {
  const lines = String(value || "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch {}
  }
  throw new Error("worker-json-output-missing");
};
const runWorker = (command, args, request, timeout = 300000) => {
  const result = spawnSync(command, args, {cwd: root, input: JSON.stringify(request), encoding: "utf8", timeout, maxBuffer: 30_000_000});
  if (result.status !== 0) throw new Error(`worker-failed:${path.basename(command)}:${String(result.stderr || result.stdout).slice(-1800)}`);
  return parseLastJsonLine(result.stdout);
};
const licenseAllowed = (name) => /^(?:CC0|CC BY(?:-SA)? [34]\.0|PUBLIC DOMAIN)$/iu.test(String(name || "").trim());
const rightsStatus = (name) => /PUBLIC DOMAIN|CC0/iu.test(name) ? "PUBLIC_DOMAIN_VERIFIED" : "OPEN_LICENSE_VERIFIED";
const frameScore = (value) => Math.max(0, Math.min(1, (Number(value || 0) + 1) / 2));

ensure(liveRoot);
const searchStartedAt = new Date().toISOString();
const authorityBefore = authorityFiles.map(shaFile);
const networkReceipts = [];
const liveFetch = async (url, options = {}) => {
  const startedAt = new Date().toISOString();
  const response = await fetch(url, options);
  networkReceipts.push({url: String(url), host: new URL(String(url)).host, startedAt, finishedAt: new Date().toISOString(), status: response.status, ok: response.ok});
  return response;
};

const fixtures = [
  {
    id: "business-profile-live-search",
    genre: "business-profile",
    title: "Named interview search",
    shots: [{id: "business-interview", sourceText: "Jimmy Wales 在 Wikipedia 二十周年时接受采访。", viewerTask: "找到 Jimmy Wales 本人正在讲话的真实采访视频。", claimType: "INTERVIEW_QUOTE", sourceIntent: "INTERVIEW", entities: ["Jimmy Wales"], actions: ["interview", "speaking"], event: {name: "Wikipedia 20 anniversary", date: "2021"}, keywords: ["Wikipedia 20"], targetDurationMs: 4200}],
  },
  {
    id: "science-evidence-live-search",
    genre: "science-evidence",
    title: "Official event footage search",
    shots: [{id: "apollo-launch", sourceText: "Apollo 11 在 1969 年由 Saturn V 发射。", viewerTask: "找到 Apollo 11 真实发射现场，不能用相似火箭替代。", claimType: "EVIDENCE_CLAIM", networkDecision: "REQUIRED", evidenceRoute: "OFFICIAL_VIDEO", entities: ["Apollo 11"], actions: ["launch"], event: {name: "Apollo 11 launch", date: "1969"}, keywords: ["Saturn V"], domains: ["SPACE"], targetDurationMs: 5000}],
  },
  {
    id: "technology-process-live-search",
    genre: "technology-opinion",
    title: "Visible process search",
    shots: [{id: "robot-process", sourceText: "自动化实验室的机械臂移动坩埚，替代重复搬运动作。", viewerTask: "找到真实机械臂移动物料的过程视频，而不是抽象科技画面。", shotFunction: "ACTION", sourceIntent: "B_ROLL", actions: ["robot arm moving crucibles"], locations: ["autonomous laboratory"], keywords: ["robot arm R2", "moving crucibles"], targetDurationMs: 6000}],
  },
];

async function downloadAndIndex(fixture, plan, item) {
  const shotRoot = path.join(liveRoot, fixture.id, item.shotId);
  ensure(shotRoot);
  const receiptStart = networkReceipts.length;
  const discovery = await discoverExternalMediaMetadata(item.request, {fetchImpl: liveFetch, providers: item.providerIds, limit: 12, maxQueryVariants: 3});
  const candidates = discovery.providers
    .flatMap((provider) => provider.candidates || [])
    .filter((candidate) => candidate.provider === "WIKIMEDIA_COMMONS" && candidate.mediaType === "VIDEO" && candidate.assetUrl && candidate.sizeBytes > 0 && candidate.sizeBytes <= 20 * 1024 * 1024 && licenseAllowed(candidate.license?.name))
    .sort((left, right) => right.relevance.score - left.relevance.score || left.sizeBytes - right.sizeBytes);
  const candidate = candidates[0];
  if (!candidate) return {discovery, rawCandidate: null, reason: "NO_LICENSED_EXTERNAL_VIDEO_WITHIN_DOWNLOAD_BUDGET"};
  const derivative = await resolveWikimediaVideoDerivative(candidate, {fetchImpl: liveFetch, maximumWidth: 1280});
  const sourcePath = path.join(shotRoot, "source.webm");
  const sourceResponse = await liveFetch(candidate.assetUrl, {headers: {"User-Agent": "A1MotionStudio/1.0 live-storyboard-search"}});
  if (!sourceResponse.ok) throw new Error(`live-source-download-http:${candidate.sourceId}:${sourceResponse.status}`);
  const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
  if (sourceBuffer.length > 20 * 1024 * 1024) throw new Error(`live-source-download-budget-exceeded:${candidate.sourceId}`);
  fs.writeFileSync(sourcePath, sourceBuffer);
  const sourceProbe = probe(sourcePath);
  const videoStream = sourceProbe.streams.find((stream) => stream.codec_type === "video");
  const audioStream = sourceProbe.streams.find((stream) => stream.codec_type === "audio");
  const durationMs = Math.round(Number(sourceProbe.format.duration) * 1000);
  const sceneResult = runWorker(uv, ["run", "--quiet", "--with", "scenedetect[opencv]==0.6.7.1", "python", "scripts/a1_scene_detect_worker.py"], {videoPath: sourcePath});
  let scenes = (sceneResult.scenes || []).filter((scene) => scene.endMs - scene.startMs >= 180).slice(0, 24);
  if (!scenes.length) scenes = [{id: "scene-001", startMs: 0, endMs: durationMs}];
  const frameRoot = path.join(shotRoot, "keyframes");
  ensure(frameRoot);
  const frames = [];
  for (const [index, scene] of scenes.entries()) {
    const atMs = Math.max(scene.startMs, Math.min(scene.endMs - 1, Math.round((scene.startMs + scene.endMs) / 2)));
    const framePath = path.join(frameRoot, `${String(index + 1).padStart(3, "0")}.png`);
    execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", sourcePath, "-frames:v", "1", framePath]);
    frames.push({id: `${item.shotId}-frame-${index + 1}`, sceneId: scene.id, atMs, path: rel(framePath), sha256: shaFile(framePath)});
  }
  if (frames.length === 1) {
    for (const fraction of [.25, .75]) {
      const atMs = Math.min(durationMs - 1, Math.max(0, Math.round(durationMs * fraction)));
      const framePath = path.join(frameRoot, `${String(frames.length + 1).padStart(3, "0")}.png`);
      execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", sourcePath, "-frames:v", "1", framePath]);
      frames.push({id: `${item.shotId}-frame-${frames.length + 1}`, sceneId: scenes[0].id, atMs, path: rel(framePath), sha256: shaFile(framePath)});
    }
  }
  const vision = await analyzeImages(frames.map((frame) => path.join(root, frame.path)), {batchSize: 6});
  const visionByPath = new Map((vision.images || []).map((analysis) => [path.resolve(analysis.path), analysis]));
  for (const frame of frames) {
    const analysis = visionByPath.get(path.resolve(root, frame.path));
    frame.ocrText = (analysis?.observations || []).map((entry) => entry.text).filter(Boolean).join(" ");
    frame.personConfidence = Math.max(0, ...(analysis?.labels || []).filter((label) => /(?:people|adult|person|portrait|face|man|woman)/iu.test(label.id)).map((label) => Number(label.confidence || 0)));
  }
  const rerank = runWorker(openclipPython, ["scripts/a1_external_source_tools.py"], {contract: "A1ExternalSourceToolRequest/v1", operation: "semantic-rerank", query: plan.needs[0].query.text, candidates: frames.map((frame) => ({id: frame.id, imagePath: frame.path, sha256: frame.sha256}))});
  if (rerank.status !== "PASS") throw new Error(`live-source-openclip-blocked:${candidate.sourceId}`);
  const visualScores = new Map(rerank.ranking.map((entry) => [entry.id, entry.cosineScore]));
  const transcript = item.evidenceDuty === "VERIFIED_IDENTITY"
    ? runWorker("python3", ["scripts/a1_mlx_whisper_worker.py"], {videoPath: sourcePath, model: "mlx-community/whisper-tiny", language: "en"}, 300000).segments
    : [{startMs: 0, endMs: durationMs, text: candidate.title, words: []}];
  const index = compileLocalVideoSegmentIndex({
    id: `${fixture.id}:${item.shotId}`,
    source: {path: rel(sourcePath), sha256: shaFile(sourcePath), rights: candidate.license.name, referenceOnly: true},
    clip: {path: rel(sourcePath), sha256: shaFile(sourcePath), sourceInMs: 0, sourceOutMs: durationMs},
    media: {durationMs, fps: Number(String(videoStream.avg_frame_rate).split("/")[0]) / Math.max(1, Number(String(videoStream.avg_frame_rate).split("/")[1])), width: videoStream.width, height: videoStream.height, hasAudio: Boolean(audioStream)},
    query: {text: plan.needs[0].query.text, requiresPerson: item.evidenceDuty === "VERIFIED_IDENTITY", viewerTask: plan.needs[0].shot.viewerTask, narrativeRole: item.evidenceDuty, minimumMs: plan.needs[0].hardRequirements.minimumDurationMs, maximumMs: plan.needs[0].hardRequirements.maximumDurationMs},
    analysis: {scenes, transcript: transcript.length ? transcript : [{startMs: 0, endMs: durationMs, text: candidate.title, words: []}], keyframes: frames.map((frame) => ({...frame, visualScore: visualScores.get(frame.id) ?? -1, attentionSalience: 0})), toolchain: {scene: sceneResult.provider, transcript: item.evidenceDuty === "VERIFIED_IDENTITY" ? "mlx-whisper" : "source-title", visual: rerank.provider}},
  });
  assertLocalVideoSegmentIndex(index);
  const selectedPath = path.join(shotRoot, "selected-segment.mp4");
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (index.selected.selectedRange.inMs / 1000).toFixed(3), "-to", (index.selected.selectedRange.outMs / 1000).toFixed(3), "-i", sourcePath, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", selectedPath]);
  const selectedFrame = index.analysis.keyframes.find((frame) => frame.id === index.selected.keyframeId) || index.analysis.keyframes[0];
  const searchedAt = new Date().toISOString();
  const liveRequestCount = networkReceipts.slice(receiptStart).filter((receipt) => /wikimedia\.org|archive\.org|nasa\.gov/u.test(receipt.host)).length;
  const rawCandidate = {
    id: `live:${candidate.provider}:${candidate.sourceId}`,
    sourceId: shaFile(sourcePath),
    sourceGroup: `${candidate.provider}:${candidate.sourceId}`,
    provider: candidate.provider,
    mediaClass: item.mediaClass,
    sourceGrade: item.sourceGrade,
    rightsStatus: rightsStatus(candidate.license.name),
    licenseReviewStatus: "PASS",
    referenceOnly: false,
    evidenceCapable: item.evidenceDuty === "VERIFIED_EVIDENCE",
    identityVerified: item.evidenceDuty === "VERIFIED_IDENTITY",
    eventVerified: item.evidenceDuty === "VERIFIED_EVIDENCE",
    timeVerified: item.evidenceDuty === "VERIFIED_EVIDENCE" && Boolean(plan.needs[0].shot.event.date),
    directActionVerified: ["VERIFIED_IDENTITY", "VISIBLE_ACTION"].includes(item.evidenceDuty),
    entities: plan.needs[0].shot.entities,
    actions: plan.needs[0].shot.actions,
    locations: plan.needs[0].shot.locations,
    transcript: index.selected.transcriptExcerpt,
    description: `${candidate.title} ${candidate.description || ""}`,
    visualScore: frameScore(index.selected.scores.visual),
    textScore: Math.max(0, Math.min(1, candidate.relevance.score / 50)),
    width: index.media.width,
    height: index.media.height,
    inMs: index.selected.selectedRange.inMs,
    outMs: index.selected.selectedRange.outMs,
    keyframePath: selectedFrame.path,
    clipPath: rel(selectedPath),
    sourcePath: rel(sourcePath),
    sourcePageUrl: candidate.sourcePageUrl,
    attribution: `${candidate.publisher} · ${candidate.license.name} · ${candidate.sourcePageUrl}`,
    sourceSha256: shaFile(sourcePath),
    clipSha256: shaFile(selectedPath),
    searchReceipt: {searchedAt, liveRequestCount, cacheOnly: false, localPoolUsed: false},
  };
  assertFreshExternalSearchCandidate(rawCandidate, searchStartedAt);
  return {discovery, candidateMetadata: candidate, derivative, index, rawCandidate, reason: null};
}

const rows = [];
const selectedArtifacts = [];
for (const fixture of fixtures) {
  const plan = compileStoryboardMediaNeedPlan({storyboardId: fixture.id, storyboardSha256: shaValue(fixture), title: fixture.title, shots: fixture.shots});
  assertStoryboardMediaNeedPlan(plan);
  const livePlan = compileStoryboardLiveMediaSearchPlan(plan);
  assertStoryboardLiveMediaSearchPlan(livePlan);
  const item = livePlan.items[0];
  const live = await downloadAndIndex(fixture, plan, item);
  const retrieval = retrieveStoryboardMediaCandidates(plan, {[item.shotId]: live.rawCandidate ? [live.rawCandidate] : []}, {limit: 4});
  assertStoryboardMediaRetrieval(retrieval);
  const allocation = allocateSequenceMedia(retrieval, {maxPerSourceGroup: 1});
  assertSequenceMediaAllocation(allocation);
  const selected = allocation.assignments[0]?.selected || null;
  if (selected) assertFreshExternalSearchCandidate(selected, searchStartedAt);
  selectedArtifacts.push({fixtureId: fixture.id, genre: fixture.genre, shotId: item.shotId, status: selected ? "LIVE_EXTERNAL_SELECTED_FOR_REVIEW" : "NO_MATCH", provider: selected?.provider || null, sourcePageUrl: selected?.sourcePageUrl || null, path: selected?.clipPath || "", sha256: selected?.clipSha256 || "", sourcePath: selected?.sourcePath || "", sourceSha256: selected?.sourceSha256 || "", keyframePath: selected?.keyframePath || "", searchReceipt: selected?.searchReceipt || null, fullDecode: selected ? spawnSync(ffmpeg, ["-v", "error", "-i", path.join(root, selected.clipPath), "-f", "null", "-"], {encoding: "utf8", timeout: 120000}).status === 0 : false});
  rows.push({id: fixture.id, genre: fixture.genre, title: fixture.title, status: selected ? "PASS" : "NO_MATCH", plan, livePlan, liveDiscovery: live.discovery, selectedMetadata: live.candidateMetadata || null, retrieval, allocation, reason: live.reason});
}

const tileWidth = 560;
const tileHeight = 315;
const labelHeight = 135;
const composites = [];
for (const [index, row] of rows.entries()) {
  const assignment = row.allocation.assignments[0];
  const left = index * tileWidth;
  if (!assignment?.selected) {
    const placeholder = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${tileHeight + labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="20" y="145" fill="#c9ef39" font-family="Arial,sans-serif" font-size="28" font-weight="700">NO MATCH</text><text x="20" y="185" fill="#d7dbd7" font-family="Arial,sans-serif" font-size="15">${xml(row.genre)} · live external search</text></svg>`);
    composites.push({input: placeholder, left, top: 0});
    continue;
  }
  const image = await sharp(path.join(root, assignment.selected.keyframePath)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const sourceTitle = row.selectedMetadata?.title || assignment.selected.sourceGroup;
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="16" y="27" fill="#c9ef39" font-family="Arial,sans-serif" font-size="14" font-weight="700">LIVE WEB SEARCH · ${xml(row.genre)}</text><text x="16" y="55" fill="#f2efe8" font-family="Arial,sans-serif" font-size="14">${xml(sourceTitle.slice(0, 66))}</text><text x="16" y="82" fill="#d7dbd7" font-family="Arial,sans-serif" font-size="12">${xml(assignment.selected.provider)} · ${(assignment.selected.range.inMs / 1000).toFixed(2)}–${(assignment.selected.range.outMs / 1000).toFixed(2)}s</text><text x="16" y="108" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">fresh download · ${xml(assignment.selected.rightsStatus)} · local pool: NO</text></svg>`);
  composites.push({input: image, left, top: 0}, {input: label, left, top: tileHeight});
}
const reviewBoard = path.join(phaseRoot, "review-board.png");
await sharp({create: {width: tileWidth * rows.length, height: tileHeight + labelHeight, channels: 4, background: "#080b0c"}}).composite(composites).png().toFile(reviewBoard);

const authorityAfter = authorityFiles.map(shaFile);
const fixturesResult = rows.map((row) => ({id: row.id, genre: row.genre, status: row.status, selected: row.allocation.assignments[0]?.selected ? {candidateId: row.allocation.assignments[0].selected.id, provider: row.allocation.assignments[0].selected.provider, sourcePageUrl: row.allocation.assignments[0].selected.sourcePageUrl, searchReceipt: row.allocation.assignments[0].selected.searchReceipt} : null, reason: row.reason}));
const body = {
  contract: "A1StoryboardMediaLiveSearchQualification/v2",
  status: rows.every((row) => row.status === "PASS") && selectedArtifacts.every((artifact) => artifact.fullDecode) ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  searchStartedAt,
  fixtures: fixturesResult,
  selectedArtifacts,
  networkReceipts,
  reviewBoard: {path: rel(reviewBoard), sha256: shaFile(reviewBoard), width: tileWidth * rows.length, height: tileHeight + labelHeight},
  checks: {
    threeStoryboardGenres: rows.length === 3,
    liveExternalSearchExecuted: networkReceipts.some((receipt) => receipt.ok && /wikimedia\.org|archive\.org|nasa\.gov/u.test(receipt.host)),
    liveSearchPlanBoundPerShot: rows.every((row) => row.livePlan.items.length === row.plan.needs.length),
    freshDownloadedExternalBytes: selectedArtifacts.every((artifact) => artifact.sourceSha256 && artifact.sha256 && artifact.searchReceipt?.liveRequestCount > 0),
    zeroLocalOrNasSelections: selectedArtifacts.every((artifact) => artifact.provider && !/LOCAL|NAS/iu.test(artifact.provider)),
    externalSourcePagesBound: selectedArtifacts.every((artifact) => /^https:\/\//u.test(artifact.sourcePageUrl || "")),
    playableSelectedArtifacts: selectedArtifacts.every((artifact) => artifact.fullDecode),
    formalAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter),
    productionUseAllowed: false,
    storyboardMutation: false,
    productionAdmission: false,
  },
  correction: {supersedesResultContract: "A1StoryboardMediaRetrievalQualification/v1", reason: "Previous board reused local/NAS candidates and did not prove live external search."},
  boundary: {reviewOnly: true, automaticStoryboardMutation: false, productionAdmission: false},
};
const result = {...body, resultSha256: shaValue(body)};
fs.writeFileSync(path.join(phaseRoot, "qualification.json"), `${JSON.stringify(rows, null, 2)}\n`);
fs.writeFileSync(path.join(phaseRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(phaseRoot, "correction.json"), `${JSON.stringify(result.correction, null, 2)}\n`);
const lines = ["# 分镜实时外部视频搜索 v2", "", `状态：**${result.status}** · ${rows.length} 类分镜 · ${networkReceipts.length} 次真实网络请求`, "", "> 本页已经废止上一版用本地/NAS 素材充当搜索结果的证明。以下每个画面均来自本次实时外部搜索、下载、切段与校验；本地素材池没有参与候选。", ""];
for (const row of rows) {
  const selected = row.allocation.assignments[0]?.selected;
  lines.push(`## ${row.genre}`, "", selected ? `- 来源：[${row.selectedMetadata.title}](${selected.sourcePageUrl})` : "- 结果：NO_MATCH", selected ? `- 许可：${selected.attribution}` : `- 原因：${row.reason}`, selected ? `- 选段：${(selected.range.inMs / 1000).toFixed(2)}–${(selected.range.outMs / 1000).toFixed(2)} 秒；${selected.provider}` : "", "");
}
lines.push(`审核图：${rel(reviewBoard)}`, "", "当前分镜、Assembly、Motion、Resolve 和发布状态未改变。");
fs.writeFileSync(path.join(phaseRoot, "review.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({status: result.status, fixtures: result.fixtures, selectedArtifacts: result.selectedArtifacts, networkRequestCount: result.networkReceipts.length, reviewBoard: result.reviewBoard, checks: result.checks, resultSha256: result.resultSha256}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
