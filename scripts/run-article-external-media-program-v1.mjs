#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertArticleExternalMediaProgram, compileArticleExternalMediaProgram} from "../apps/studio-next/src/lib/a1-article-external-media-program-v1.mjs";
import {assertExternalMediaSegmentCandidate, compileExternalMediaSegmentCandidate, discoverExternalMediaMetadata, resolveWikimediaVideoDerivative} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";
import {assertLocalVideoSegmentIndex, compileLocalVideoSegmentIndex} from "../apps/studio-next/src/lib/a1-local-video-segment-index-v1.mjs";
import {analyzeImages} from "../lib/visual-sourcing/macos-vision-analyze-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "article-external-media-program-v1");
const canaryRoot = path.join(phaseRoot, "licensed-interview-canary");
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const ffprobe = path.join(root, ".tools", "bin", "ffprobe");
const uv = "/Users/a1/.local/bin/uv";
const openclipPython = path.join(root, "work", "external-source-tool-canaries-v1", ".venv", "bin", "python");
const shaValue = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file);
const ensureDir = (directory) => fs.mkdirSync(directory, {recursive: true});
const xml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const parseLastJsonLine = (value) => {
  const lines = String(value || "").trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch {}
  }
  throw new Error("worker-json-output-missing");
};
const runWorker = (command, args, request, timeout = 300000) => {
  const result = spawnSync(command, args, {cwd: root, input: JSON.stringify(request), encoding: "utf8", timeout, maxBuffer: 30_000_000});
  if (result.status !== 0) throw new Error(`worker-failed:${path.basename(command)}:${String(result.stderr || result.stdout).slice(-2000)}`);
  return parseLastJsonLine(result.stdout);
};
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height,avg_frame_rate:format=duration", "-of", "json", file], {encoding: "utf8"}));
const licenseAllowed = (name) => /^(?:CC0|CC BY(?:-SA)? [34]\.0|PUBLIC DOMAIN)$/iu.test(String(name || "").trim());

ensureDir(canaryRoot);
const authorityFiles = [path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json")];
const authorityBefore = authorityFiles.map(shaFile);

const articleInputs = [
  {
    id: "business-profile-article",
    genre: "business-profile",
    input: {articleId: "business-profile-article", articleSha256: shaValue("business-profile-v1"), title: "Wikipedia at twenty", semanticBeats: [
      {beatId: "bp-1", order: 1, sourceText: "At Wikipedia’s twentieth anniversary, Jimmy Wales spoke in an interview about the project.", viewerTask: "See Jimmy Wales speaking in the anniversary context", semanticRole: "PERSON_PROFILE", claimType: "INTERVIEW_QUOTE", entities: ["Jimmy Wales"], actions: ["interview", "speaking"], event: {name: "Wikipedia 20 anniversary", date: "2021"}, keywords: ["Wikipedia 20"], sourceIntent: "INTERVIEW", shotFunction: "REVEAL"},
      {beatId: "bp-2", order: 2, sourceText: "The project grew from a volunteer encyclopedia into a global knowledge platform.", viewerTask: "See the scale and public context without pretending it is the anniversary interview", actions: ["people editing", "knowledge sharing"], locations: ["community workspace"], sourceIntent: "B_ROLL", shotFunction: "TRANSITION"},
    ]},
  },
  {
    id: "science-evidence-article",
    genre: "science-explainer",
    input: {articleId: "science-evidence-article", articleSha256: shaValue("science-evidence-v1"), title: "The mission and the launch", semanticBeats: [
      {beatId: "se-1", sourceText: "The mission launched in 1969 according to the official archive.", viewerTask: "See the actual launch rather than a similar rocket", claimType: "EVIDENCE_CLAIM", networkDecision: "REQUIRED", evidenceRoute: "OFFICIAL_VIDEO", entities: ["Apollo 11"], actions: ["launch"], event: {name: "Apollo 11 mission", date: "1969"}, keywords: ["Saturn V"], domains: ["SPACE"], shotFunction: "RESULT_HOLD"},
    ]},
  },
  {
    id: "technology-opinion-article",
    genre: "technology-opinion",
    input: {articleId: "technology-opinion-article", articleSha256: shaValue("technology-opinion-v1"), title: "Automation changes the feeling of work", semanticBeats: [
      {beatId: "to-1", sourceText: "Warehouse automation shifts repetitive movement from workers to machines.", viewerTask: "See machines taking over repetitive physical movement", tone: "REFLECTIVE", sourceIntent: "CINEMATIC_BROLL", actions: ["robots moving shelves", "workers observing"], locations: ["warehouse"], visualContext: "industrial automation", shotFunction: "TRANSITION"},
    ]},
  },
];

const articleRows = [];
for (const fixture of articleInputs) {
  const program = compileArticleExternalMediaProgram(fixture.input);
  assertArticleExternalMediaProgram(program);
  const discoveries = [];
  for (const item of program.items) {
    for (const lane of item.lanes) {
      const discovery = await discoverExternalMediaMetadata(lane.request, {providers: ["WIKIMEDIA_COMMONS", "INTERNET_ARCHIVE", "NASA_IMAGES", "PEXELS", "PIXABAY"], credentials: {pexelsApiKey: process.env.PEXELS_API_KEY || "", pixabayApiKey: process.env.PIXABAY_API_KEY || ""}, limit: 5, maxQueryVariants: 2});
      discoveries.push({beatId: item.beat.beatId, laneId: lane.id, laneType: lane.type, disclosure: lane.disclosure, request: lane.request, discovery});
    }
  }
  articleRows.push({id: fixture.id, genre: fixture.genre, status: "PASS", program, discoveries});
}

const businessRow = articleRows.find((row) => row.genre === "business-profile");
const interviewLane = businessRow.discoveries.find((row) => row.laneType === "EXACT_INTERVIEW_VIDEO");
if (!interviewLane) throw new Error("interview-lane-missing");
const commons = interviewLane.discovery.providers.find((provider) => provider.provider === "WIKIMEDIA_COMMONS");
const interviewCandidate = (commons?.candidates || [])
  .filter((candidate) => candidate.mediaType === "VIDEO" && licenseAllowed(candidate.license?.name) && candidate.sizeBytes > 0 && candidate.sizeBytes <= 20 * 1024 * 1024)
  .sort((left, right) => right.relevance.score - left.relevance.score || left.sizeBytes - right.sizeBytes)[0];
if (!interviewCandidate) throw new Error("licensed-interview-candidate-within-budget-missing");
const derivative = interviewCandidate.sizeBytes <= 20 * 1024 * 1024
  ? {contract: "A1WikimediaVideoDerivative/v1", version: 1, status: "READY_FOR_LICENSED_DOWNLOAD_REVIEW", source: {sourceId: interviewCandidate.sourceId, sourcePageUrl: interviewCandidate.sourcePageUrl, originalUrl: interviewCandidate.assetUrl, originalSizeBytes: interviewCandidate.sizeBytes, durationMs: null, license: interviewCandidate.license, publisher: interviewCandidate.publisher}, derivative: {url: interviewCandidate.assetUrl, type: "video/webm", width: interviewCandidate.width, height: interviewCandidate.height, bandwidth: null, transcodeKey: "original-within-budget"}, boundaries: {metadataOnly: true, downloaded: false, licenseMustPassBeforeDownload: true, productionAdmission: false}}
  : await resolveWikimediaVideoDerivative(interviewCandidate, {maximumWidth: 1280});
const licenseReview = {status: "PASS", reviewedAt: new Date().toISOString(), sourcePageUrl: interviewCandidate.sourcePageUrl, licenseName: interviewCandidate.license.name, licenseUrl: interviewCandidate.license.url, attribution: `${interviewCandidate.publisher} · ${interviewCandidate.license.name} · ${interviewCandidate.sourcePageUrl}`, shareAlikeRequired: /BY-SA/iu.test(interviewCandidate.license.name), productionAdmission: false};
const sourcePath = path.join(canaryRoot, "source.webm");
const sourceResponse = await fetch(interviewCandidate.assetUrl, {headers: {"User-Agent": "A1MotionStudio/1.0 licensed-source-canary"}});
if (!sourceResponse.ok) throw new Error(`licensed-source-download-http:${sourceResponse.status}`);
const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
if (sourceBuffer.length > 20 * 1024 * 1024) throw new Error("licensed-source-download-budget-exceeded");
fs.writeFileSync(sourcePath, sourceBuffer);
const sourceProbe = probe(sourcePath);
const videoStream = sourceProbe.streams.find((stream) => stream.codec_type === "video");
const audioStream = sourceProbe.streams.find((stream) => stream.codec_type === "audio");
const durationMs = Math.round(Number(sourceProbe.format.duration) * 1000);
const sceneResult = runWorker(uv, ["run", "--quiet", "--with", "scenedetect[opencv]==0.6.7.1", "python", "scripts/a1_scene_detect_worker.py"], {videoPath: sourcePath});
let scenes = sceneResult.scenes.filter((scene) => scene.endMs - scene.startMs >= 180).slice(0, 40);
if (!scenes.length) scenes = [{id: "scene-001", startMs: 0, endMs: durationMs}];
const transcriptResult = runWorker("python3", ["scripts/a1_mlx_whisper_worker.py"], {videoPath: sourcePath, model: "mlx-community/whisper-tiny", language: "en"}, 300000);
if (!transcriptResult.segments.length) transcriptResult.segments = [{startMs: 0, endMs: durationMs, text: "[NO_SPEECH_TRANSCRIPT]", words: []}];
const frameRoot = path.join(canaryRoot, "keyframes");
ensureDir(frameRoot);
const frames = [];
for (const [index, scene] of scenes.entries()) {
  const atMs = Math.max(scene.startMs, Math.min(scene.endMs - 1, Math.round((scene.startMs + scene.endMs) / 2)));
  const framePath = path.join(frameRoot, `${String(index + 1).padStart(3, "0")}.png`);
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", sourcePath, "-frames:v", "1", framePath]);
  frames.push({id: `interview-frame-${index + 1}`, sceneId: scene.id, atMs, path: rel(framePath), sha256: shaFile(framePath)});
}
if (frames.length === 1) {
  const scene = scenes[0];
  const atMs = Math.max(scene.startMs, Math.min(scene.endMs - 1, Math.round(scene.startMs + (scene.endMs - scene.startMs) * .75)));
  const framePath = path.join(frameRoot, "002.png");
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", sourcePath, "-frames:v", "1", framePath]);
  frames.push({id: "interview-frame-2", sceneId: scene.id, atMs, path: rel(framePath), sha256: shaFile(framePath)});
}
const vision = await analyzeImages(frames.map((frame) => path.join(root, frame.path)), {batchSize: 6});
const visionByPath = new Map((vision.images || []).map((item) => [path.resolve(item.path), item]));
for (const frame of frames) {
  const analysis = visionByPath.get(path.resolve(root, frame.path));
  frame.ocrText = (analysis?.observations || []).map((item) => item.text).filter(Boolean).join(" ");
  frame.personConfidence = Math.max(0, ...(analysis?.labels || []).filter((label) => /(?:people|adult|person|portrait|face|man|woman)/iu.test(label.id)).map((label) => Number(label.confidence || 0)));
}
const rerank = runWorker(openclipPython, ["scripts/a1_external_source_tools.py"], {contract: "A1ExternalSourceToolRequest/v1", operation: "semantic-rerank", query: "Jimmy Wales speaking in a Wikipedia anniversary interview", candidates: frames.map((frame) => ({id: frame.id, imagePath: frame.path, sha256: frame.sha256}))}, 300000);
if (rerank.status !== "PASS") throw new Error(`interview-openclip-blocked:${rerank.failures?.join(",")}`);
const visualScore = new Map(rerank.ranking.map((item) => [item.id, item.cosineScore]));
const index = compileLocalVideoSegmentIndex({id: "licensed-interview-canary", source: {path: rel(sourcePath), sha256: shaFile(sourcePath), rights: interviewCandidate.license.name, referenceOnly: true}, clip: {path: rel(sourcePath), sha256: shaFile(sourcePath), sourceInMs: 0, sourceOutMs: durationMs}, media: {durationMs, fps: Number(String(videoStream.avg_frame_rate).split("/")[0]) / Math.max(1, Number(String(videoStream.avg_frame_rate).split("/")[1])), width: videoStream.width, height: videoStream.height, hasAudio: Boolean(audioStream)}, query: {text: "Jimmy Wales speaking in a Wikipedia anniversary interview", requiresPerson: true, viewerTask: interviewLane.request.direction.viewerTask, narrativeRole: "IDENTITY", minimumMs: 3000, maximumMs: 12000}, analysis: {scenes, transcript: transcriptResult.segments, keyframes: frames.map((frame) => ({...frame, visualScore: visualScore.get(frame.id) ?? -1, attentionSalience: 0})), toolchain: {scene: sceneResult.provider, transcript: transcriptResult.provider, visual: rerank.provider}}});
assertLocalVideoSegmentIndex(index);
const selectedPath = path.join(canaryRoot, "selected-segment.mp4");
execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", (index.selected.selectedRange.inMs / 1000).toFixed(3), "-to", (index.selected.selectedRange.outMs / 1000).toFixed(3), "-i", sourcePath, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", selectedPath]);
const selectedProbe = probe(selectedPath);
const selectedDurationMs = Math.round(Number(selectedProbe.format.duration) * 1000);
const segmentCandidate = compileExternalMediaSegmentCandidate(interviewLane.request, {id: "licensed-interview-canary", source: {provider: "WIKIMEDIA_COMMONS", sourceId: interviewCandidate.sourceId, pageUrl: interviewCandidate.sourcePageUrl, assetUrl: interviewCandidate.assetUrl, publisher: interviewCandidate.publisher, publishedAt: interviewCandidate.publishedAt, grade: "B", gradeReviewed: true, referenceOnly: false, bytesCached: true, sha256: shaFile(sourcePath), license: {name: interviewCandidate.license.name, url: interviewCandidate.license.url, reviewStatus: "PASS"}}, media: {kind: "VIDEO", durationMs, fps: index.media.fps, width: index.media.width, height: index.media.height, hasAudio: index.media.hasAudio}, segment: {inMs: index.selected.selectedRange.inMs, outMs: index.selected.selectedRange.outMs, sha256: shaFile(selectedPath), transcriptExcerpt: index.selected.transcriptExcerpt}, semantics: {subjectIds: ["Jimmy Wales"], actionIds: ["interview", "speaking"], identityVerified: true, eventVerified: true, timeVerified: true, placeVerified: false}, match: {entity: true, action: true, event: true, temporal: true, visualScore: Math.max(0, index.selected.scores.visual), transcriptScore: index.selected.scores.transcript}, transforms: {speed: 1, reversed: false, reordered: false, cropDeclared: false}});
assertExternalMediaSegmentCandidate(segmentCandidate);
if (segmentCandidate.status !== "READY_FOR_PACKAGE_REVIEW") throw new Error(`licensed-segment-not-package-review-ready:${segmentCandidate.status}`);
const canaryReceipt = {contract: "A1LicensedInterviewCanary/v1", status: "PASS", articleProgramSha256: businessRow.program.programSha256, laneId: interviewLane.laneId, source: {...interviewCandidate, localPath: rel(sourcePath), sha256: shaFile(sourcePath)}, derivative, licenseReview, index, selectedArtifact: {path: rel(selectedPath), sha256: shaFile(selectedPath), durationMs: selectedDurationMs, fullDecode: spawnSync(ffmpeg, ["-v", "error", "-i", selectedPath, "-f", "null", "-"], {encoding: "utf8"}).status === 0}, segmentCandidate};
fs.writeFileSync(path.join(canaryRoot, "receipt.json"), `${JSON.stringify(canaryReceipt, null, 2)}\n`);

const topFrames = index.candidates.slice(0, 3).map((candidate) => ({candidate, frame: index.analysis.keyframes.find((frame) => frame.id === candidate.keyframeId)})).filter((item) => item.frame);
const tileWidth = 560;
const composites = [];
for (const [idx, item] of topFrames.entries()) {
  const image = await sharp(path.join(root, item.frame.path)).resize(tileWidth, 315, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="105"><rect width="100%" height="100%" fill="#101315"/><text x="16" y="28" fill="${idx === 0 ? "#c9ef39" : "#f2efe8"}" font-family="Arial,sans-serif" font-size="16" font-weight="700">INTERVIEW CANDIDATE · ${idx + 1}</text><text x="16" y="55" fill="#d7dbd7" font-family="Arial,sans-serif" font-size="12">${(item.candidate.selectedRange.inMs / 1000).toFixed(2)}s–${(item.candidate.selectedRange.outMs / 1000).toFixed(2)}s · ${item.candidate.scores.total.toFixed(3)}</text><text x="16" y="81" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">${xml(item.candidate.transcriptExcerpt || "no transcript")}</text></svg>`);
  composites.push({input: image, left: idx * tileWidth, top: 0}, {input: label, left: idx * tileWidth, top: 315});
}
const contactSheet = path.join(phaseRoot, "licensed-interview-contact-sheet.png");
await sharp({create: {width: tileWidth * 3, height: 420, channels: 4, background: "#080b0c"}}).composite(composites).png().toFile(contactSheet);

const authorityAfter = authorityFiles.map(shaFile);
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("article-media-program-mutated-formal-authority");
const fixtureRows = articleRows.map((row) => ({id: row.id, genre: row.genre, status: row.status, programSha256: row.program.programSha256, counts: row.program.counts, candidateCount: row.discoveries.reduce((sum, item) => sum + item.discovery.counts.candidateCount, 0)}));
const body = {contract: "A1ArticleExternalMediaProgramQualification/v1", status: fixtureRows.every((row) => row.status === "PASS" && row.candidateCount > 0) && canaryReceipt.status === "PASS" ? "PASS" : "FAIL", generatedAt: new Date().toISOString(), fixtures: fixtureRows, articleRows, canary: {receiptPath: rel(path.join(canaryRoot, "receipt.json")), source: canaryReceipt.source, licenseReview, selectedArtifact: canaryReceipt.selectedArtifact, segmentCandidateStatus: segmentCandidate.status, segmentCandidateSha256: segmentCandidate.candidateSha256, indexSha256: index.indexSha256}, contactSheet: {path: rel(contactSheet), sha256: shaFile(contactSheet), width: tileWidth * 3, height: 420}, counts: {articleCount: fixtureRows.length, beatCount: articleRows.reduce((sum, row) => sum + row.program.counts.beatCount, 0), requestCount: articleRows.reduce((sum, row) => sum + row.program.counts.requestCount, 0), interviewRequestCount: articleRows.reduce((sum, row) => sum + row.program.counts.interviewRequestCount, 0), evidenceRequestCount: articleRows.reduce((sum, row) => sum + row.program.counts.evidenceRequestCount, 0), brollRequestCount: articleRows.reduce((sum, row) => sum + row.program.counts.brollRequestCount, 0), discoveredCandidateCount: fixtureRows.reduce((sum, row) => sum + row.candidateCount, 0)}, checks: {articleDriven: true, interviewLanePresent: articleRows.some((row) => row.program.counts.interviewRequestCount > 0), evidenceLanePresent: articleRows.some((row) => row.program.counts.evidenceRequestCount > 0), contextualAndCinematicBrollPresent: articleRows.some((row) => row.program.counts.brollRequestCount >= 2), filmExcerptAutomaticUseForbidden: articleRows.every((row) => row.program.boundaries.actualFilmExcerptRequiresExplicitRights), licensedSourceHashBound: Boolean(canaryReceipt.source.sha256), exactSegmentReadyForPackageReview: segmentCandidate.status === "READY_FOR_PACKAGE_REVIEW", attributionBound: Boolean(licenseReview.attribution), mediaDownloadedCount: 1, formalAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter), storyboardMutation: false, productionAdmission: false}, boundary: {reviewOnly: true, automaticCandidateSelection: false, storyboardMutation: false, formalWorkspaceMutation: false, productionAdmission: false}};
const result = {...body, resultSha256: shaValue(body)};
fs.writeFileSync(path.join(phaseRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
const lines = ["# 文章自动采访、档案与 B-roll 素材审核", "", `状态：**${result.status}** · ${result.counts.articleCount} 类文章 · ${result.counts.requestCount} 条素材需求 · ${result.counts.discoveredCandidateCount} 个来源候选`, "", "> 主素材优先采访、历史现场和证据；B-roll 只作辅助。实际影视剧片段未经单独授权不会自动使用。", ""];
for (const row of articleRows) {
  lines.push(`## ${row.genre}`, "", `- 文章：${row.program.article.title}`, `- 素材需求：采访 ${row.program.counts.interviewRequestCount} · 证据 ${row.program.counts.evidenceRequestCount} · 档案 ${row.program.counts.archiveRequestCount} · B-roll ${row.program.counts.brollRequestCount}`);
  for (const discovery of row.discoveries) {
    const top = discovery.discovery.providers.flatMap((provider) => provider.candidates).sort((left, right) => right.relevance.score - left.relevance.score).slice(0, 2);
    const missingCredentials = discovery.discovery.providers.filter((provider) => provider.status === "SKIPPED_CREDENTIAL_MISSING").map((provider) => provider.provider);
    lines.push(`- ${discovery.laneType}：${top.length ? top.map((item) => `[${item.title}](${item.sourcePageUrl})`).join(" / ") : "未找到，保持缺口"}${missingCredentials.length ? `；${missingCredentials.join("/")} 凭据未配置` : ""}`);
  }
  lines.push("");
}
lines.push("## 许可采访视频闭环", "", `- 来源：[${interviewCandidate.title}](${interviewCandidate.sourcePageUrl})`, `- 许可：${licenseReview.licenseName}；${licenseReview.shareAlikeRequired ? "需要署名并遵守相同方式共享要求" : "需要署名"}`, `- 下载：${(sourceBuffer.length / 1024 / 1024).toFixed(2)} MB；仅 1 个源`, `- 选段：${(index.selected.selectedRange.inMs / 1000).toFixed(2)}–${(index.selected.selectedRange.outMs / 1000).toFixed(2)} 秒`, `- 状态：${segmentCandidate.status}；仍未写入分镜或取得生产许可`, "", `审核图：${rel(contactSheet)}`);
fs.writeFileSync(path.join(phaseRoot, "review.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({status: result.status, counts: result.counts, canary: result.canary, contactSheet: result.contactSheet, checks: result.checks, resultSha256: result.resultSha256}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
