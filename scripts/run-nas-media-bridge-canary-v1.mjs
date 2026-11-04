#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {assertArticleNasMediaRequests, assertNasMediaBridgePlan, assertNasMediaClipReceipt, compileArticleNasMediaRequests, compileNasMediaBridgePlan, compileNasMediaClipReceipt} from "../apps/studio-next/src/lib/a1-nas-media-bridge-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const valueAfter = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
};
const requestedMount = path.resolve(valueAfter("--mount") || process.env.A1_NAS_MOUNT_ROOT || "");
const requestedLibrary = path.resolve(valueAfter("--library") || process.env.A1_NAS_MEDIA_ROOT || "");
const scanRoot = path.resolve(valueAfter("--scan-root") || path.join(requestedMount, "03_录像"));
const phaseRoot = path.join(root, "work", "nas-media-bridge-v1");
const canaryReceiptPath = path.join(root, "work", "article-external-media-program-v1", "licensed-interview-canary", "receipt.json");
const articleProgramResultPath = path.join(root, "work", "article-external-media-program-v1", "result.json");
const ffmpeg = path.join(root, ".tools", "bin", "ffmpeg");
const ffprobe = path.join(root, ".tools", "bin", "ffprobe");
const authorityFiles = [
  path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"),
  path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"),
];
const videoExtensions = new Set([".3gp", ".avi", ".m2ts", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".ts", ".vob", ".webm", ".wmv"]);
const ensure = (directory) => fs.mkdirSync(directory, {recursive: true});
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const relative = (file) => path.relative(root, file);
const writeJsonAtomic = (file, value) => {
  ensure(path.dirname(file));
  const temporary = `${file}.partial-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function copyImmutable(source, destination) {
  const sourceSha256 = shaFile(source);
  if (fs.existsSync(destination)) {
    if (shaFile(destination) !== sourceSha256) throw new Error(`immutable-target-conflict:${destination}`);
    return {path: destination, sha256: sourceSha256, reused: true};
  }
  ensure(path.dirname(destination));
  const temporary = `${destination}.partial-${process.pid}`;
  fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
  if (shaFile(temporary) !== sourceSha256) throw new Error(`copy-sha-mismatch:${destination}`);
  fs.renameSync(temporary, destination);
  return {path: destination, sha256: sourceSha256, reused: false};
}

function probeVideo(file) {
  const result = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate", "-of", "json", file], {encoding: "utf8", timeout: 20_000, maxBuffer: 2_000_000});
  if (result.status !== 0) return {status: "UNREADABLE", error: String(result.stderr || result.stdout).trim().slice(0, 400)};
  const payload = JSON.parse(result.stdout);
  const video = payload.streams?.find((stream) => stream.codec_type === "video") || {};
  const audio = payload.streams?.find((stream) => stream.codec_type === "audio") || {};
  return {status: "READABLE", durationMs: Math.round(Number(payload.format?.duration || 0) * 1000), format: payload.format?.format_name || "", videoCodec: video.codec_name || "", audioCodec: audio.codec_name || "", width: Number(video.width || 0), height: Number(video.height || 0), fps: video.avg_frame_rate || ""};
}

function collectVideoFiles(directory, maximum = 50, depth = 2) {
  const rows = [];
  const visit = (current, remaining) => {
    if (rows.length >= maximum || remaining < 0 || !fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, {withFileTypes: true}).sort((left, right) => left.name.localeCompare(right.name))) {
      if (rows.length >= maximum) break;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) visit(target, remaining - 1);
      else if (entry.isFile() && videoExtensions.has(path.extname(entry.name).toLowerCase())) rows.push(target);
    }
  };
  visit(directory, depth);
  return rows;
}

if (!requestedMount || requestedMount === path.parse(requestedMount).root) fail("--mount must identify the mounted NAS share, not a filesystem root");
if (!requestedLibrary || requestedLibrary === path.parse(requestedLibrary).root) fail("--library must identify one scoped NAS media-library directory");
if (!fs.existsSync(requestedMount) || !fs.statSync(requestedMount).isDirectory()) fail(`NAS mount unavailable: ${requestedMount}`);
const resolvedMount = fs.realpathSync(requestedMount);
const resolvedLibraryCandidate = path.resolve(requestedLibrary);
const libraryRelative = path.relative(resolvedMount, resolvedLibraryCandidate);
if (libraryRelative.startsWith("..") || path.isAbsolute(libraryRelative)) fail(`NAS library is outside the mounted share: ${requestedLibrary}`);
ensure(resolvedLibraryCandidate);
fs.accessSync(resolvedLibraryCandidate, fs.constants.R_OK | fs.constants.W_OK);
const resolvedLibrary = fs.realpathSync(resolvedLibraryCandidate);
const directories = {
  licensedSources: path.join(resolvedLibrary, "sources", "licensed"),
  reviewClips: path.join(resolvedLibrary, "clips", "review"),
  indexes: path.join(resolvedLibrary, "indexes"),
  receipts: path.join(resolvedLibrary, "receipts"),
};
Object.values(directories).forEach(ensure);
ensure(phaseRoot);

const authorityBefore = authorityFiles.map(shaFile);
const statfs = fs.statfsSync(resolvedMount);
const freeBytes = Number(statfs.bavail) * Number(statfs.bsize);
const canary = JSON.parse(fs.readFileSync(canaryReceiptPath, "utf8"));
const articleProgramResult = JSON.parse(fs.readFileSync(articleProgramResultPath, "utf8"));
if (canary.licenseReview?.status !== "PASS" || canary.selectedArtifact?.fullDecode !== true) fail("Licensed interview canary is not admission-ready");
const localCanarySource = path.join(root, canary.source.localPath);
if (!fs.existsSync(localCanarySource) || shaFile(localCanarySource) !== canary.source.sha256) fail("Licensed interview source SHA mismatch");
const sourceName = `wikipedia-20-jimmy-${canary.source.sha256.slice(0, 12)}.webm`;
const nasSource = path.join(directories.licensedSources, sourceName);
const copiedSource = copyImmutable(localCanarySource, nasSource);

const selectedRange = canary.index.selected.selectedRange;
const outputName = `wikipedia-20-jimmy-${Math.round(selectedRange.inMs)}-${Math.round(selectedRange.outMs)}-${canary.source.sha256.slice(0, 12)}.mp4`;
const nasClip = path.join(directories.reviewClips, outputName);
let clipReused = false;
if (fs.existsSync(nasClip)) {
  clipReused = true;
} else {
  const temporary = `${nasClip}.partial-${process.pid}.mp4`;
  const result = spawnSync(ffmpeg, ["-v", "error", "-y", "-ss", (selectedRange.inMs / 1000).toFixed(3), "-to", (selectedRange.outMs / 1000).toFixed(3), "-i", nasSource, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", temporary], {encoding: "utf8", timeout: 120_000, maxBuffer: 4_000_000});
  if (result.status !== 0) fail(`NAS clip render failed: ${String(result.stderr || result.stdout).slice(-1200)}`);
  fs.renameSync(temporary, nasClip);
}
const clipProbe = probeVideo(nasClip);
const fullDecode = spawnSync(ffmpeg, ["-v", "error", "-i", nasClip, "-f", "null", "-"], {encoding: "utf8", timeout: 120_000}).status === 0;
const clipReceipt = compileNasMediaClipReceipt({
  source: {path: nasSource, sha256: copiedSource.sha256},
  output: {path: nasClip, sha256: shaFile(nasClip), bytes: fs.statSync(nasClip).size, durationMs: clipProbe.durationMs, fullDecode},
  range: {inMs: selectedRange.inMs, outMs: selectedRange.outMs},
  rights: {status: "OPEN_LICENSE_VERIFIED", licenseName: canary.licenseReview.licenseName, licenseUrl: canary.licenseReview.licenseUrl, attribution: canary.licenseReview.attribution},
  transform: {mode: "TRANSCODE", videoCodec: clipProbe.videoCodec, audioCodec: clipProbe.audioCodec},
});
assertNasMediaClipReceipt(clipReceipt);

const inventoryFiles = collectVideoFiles(scanRoot, 50, 2);
const inventoryEntries = inventoryFiles.map((file) => {
  const stat = fs.statSync(file);
  return {path: file, relativePath: path.relative(resolvedMount, file), bytes: stat.size, modifiedAt: stat.mtime.toISOString(), identityMode: "PATH_SIZE_MTIME", contentSha256: null, rightsStatus: "UNDECLARED_REFERENCE_ONLY", productionUseAllowed: false, probe: probeVideo(file)};
});
const inventoryBody = {contract: "A1NasMediaInventory/v1", version: 1, status: "PASS", generatedAt: new Date().toISOString(), mount: {requestedRoot: requestedMount, resolvedRoot: resolvedMount}, scan: {root: scanRoot, maximumEntries: 50, maximumDepth: 2, recursiveWholeNasScan: false}, entries: inventoryEntries, counts: {videoCount: inventoryEntries.length, readableCount: inventoryEntries.filter((entry) => entry.probe.status === "READABLE").length, totalBytes: inventoryEntries.reduce((sum, entry) => sum + entry.bytes, 0)}, boundaries: {inventoryDoesNotGrantRights: true, contentHashDeferredUntilSelection: true, productionAdmission: false}};
const inventory = {...inventoryBody, inventorySha256: shaValue(inventoryBody)};

const businessArticle = articleProgramResult.articleRows.find((row) => row.id === "business-profile-article")?.program;
const interviewLane = businessArticle?.items?.flatMap((item) => item.lanes || []).find((lane) => lane.type === "EXACT_INTERVIEW_VIDEO");
const articleRequestSet = compileArticleNasMediaRequests({articleProgram: businessArticle, selections: [{laneId: interviewLane?.id, candidate: canary.source, licenseReview: canary.licenseReview}]});
assertArticleNasMediaRequests(articleRequestSet);

const plan = compileNasMediaBridgePlan({
  mount: {requestedRoot: requestedMount, resolvedRoot: resolvedMount, libraryRoot: resolvedLibrary, online: true, writable: true, freeBytes},
  requests: [
    {id: "licensed-interview-cache", kind: "LICENSED_DOWNLOAD", title: canary.source.title, sourceUrl: canary.source.assetUrl, rightsStatus: "OPEN_LICENSE_VERIFIED", license: {...canary.source.license, attribution: canary.licenseReview.attribution, reviewStatus: "PASS"}},
    {id: "licensed-interview-clip", kind: "LOCAL_FILM_REFERENCE", title: canary.source.title, localPath: nasSource, localPathResolved: fs.realpathSync(nasSource), rightsStatus: "OPEN_LICENSE_VERIFIED", license: {...canary.source.license, attribution: canary.licenseReview.attribution, reviewStatus: "PASS"}, requestedRange: {inMs: selectedRange.inMs, outMs: selectedRange.outMs}},
    ...(inventoryEntries[0] ? [{id: "existing-nas-video-reference", kind: "LOCAL_FILM_REFERENCE", title: path.basename(inventoryEntries[0].path), localPath: inventoryEntries[0].path, localPathResolved: fs.realpathSync(inventoryEntries[0].path), rightsStatus: "UNKNOWN"}] : []),
    {id: "commercial-stream-boundary", kind: "AUTHORIZED_STREAM", title: "Commercial streaming reference", rightsStatus: "COMMERCIAL_REFERENCE_ONLY", drmStatus: "PROTECTED"},
  ],
});
assertNasMediaBridgePlan(plan);
const expectedActions = new Set(plan.decisions.map((decision) => decision.action));
for (const action of ["CACHE_LICENSED_SOURCE_TO_NAS", "DIRECT_CLIP_FROM_NAS", "REFERENCE_ONLY_FIND_ALTERNATIVE"]) if (!expectedActions.has(action)) fail(`NAS bridge action missing: ${action}`);

const receiptFile = path.join(directories.receipts, `${outputName}.receipt.json`);
const inventoryFile = path.join(directories.indexes, "local-video-inventory-v1.json");
const planFile = path.join(directories.indexes, "nas-media-bridge-plan-v1.json");
writeJsonAtomic(receiptFile, clipReceipt);
writeJsonAtomic(inventoryFile, inventory);
writeJsonAtomic(planFile, plan);

const authorityAfter = authorityFiles.map(shaFile);
const resultBody = {
  contract: "A1NasMediaBridgeCanary/v1",
  status: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter) && fullDecode ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  mount: {requestedRoot: requestedMount, resolvedRoot: resolvedMount, libraryRoot: resolvedLibrary, freeBytes},
  source: {...copiedSource, bytes: fs.statSync(nasSource).size, title: canary.source.title, sourcePageUrl: canary.source.sourcePageUrl, license: canary.licenseReview},
  clip: {...clipReceipt.output, range: clipReceipt.range, receiptPath: receiptFile, reused: clipReused},
  inventory: {path: inventoryFile, sha256: inventory.inventorySha256, counts: inventory.counts},
  plan: {path: planFile, sha256: plan.planSha256, actions: plan.decisions.map((decision) => ({id: decision.request.id, action: decision.action, status: decision.status}))},
  articleRouting: {requestSetSha256: articleRequestSet.requestSetSha256, counts: articleRequestSet.counts, sourceProgramSha256: articleRequestSet.article.programSha256},
  fixtures: [
    {id: "licensed-interview", genre: "business-profile", status: articleRequestSet.counts.licensedDownloadCount === 1 && fullDecode ? "PASS" : "FAIL", proof: clipReceipt.receiptSha256},
    {id: "local-film-process", genre: "technology-opinion", status: plan.decisions.some((decision) => decision.action === "INDEX_LOCAL_MEDIA_REFERENCE_ONLY") ? "PASS" : "FAIL", proof: inventory.inventorySha256},
    {id: "verified-archive", genre: "science-evidence", status: plan.boundaries.downloadRequiresReviewedOpenLicense && plan.boundaries.drmCaptureForbidden ? "PASS" : "FAIL", proof: plan.planSha256},
  ],
  checks: {mountOnline: true, mountWritable: true, licensedSourceHashBound: copiedSource.sha256 === canary.source.sha256, clipFullDecode: fullDecode, attributionBound: Boolean(clipReceipt.rights.attribution), existingNasMediaIndexed: inventoryEntries.length > 0, articleCandidateAutomaticallyRouted: articleRequestSet.counts.licensedDownloadCount === 1, contentHashDeferredUntilSelection: true, drmCaptureForbidden: plan.boundaries.drmCaptureForbidden, formalAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter), storyboardMutation: false, productionAdmission: false},
};
const result = {...resultBody, resultSha256: shaValue(resultBody)};
fs.writeFileSync(path.join(phaseRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(phaseRoot, "review.md"), `# NAS 素材桥实测\n\n状态：**${result.status}**\n\n- NAS：${resolvedMount}\n- 素材库：${resolvedLibrary}\n- 开放许可来源：${canary.source.title}\n- 来源许可：${canary.licenseReview.licenseName}\n- 选段：${(clipReceipt.range.inMs / 1000).toFixed(2)}–${(clipReceipt.range.outMs / 1000).toFixed(2)} 秒\n- 输出：${nasClip}\n- 现有 NAS 视频索引：${inventory.counts.videoCount} 个；扫描深度 2；未遍历整个 NAS\n- 版权不明的本地视频只进入参考索引，不自动进入生产\n- DRM/商业流媒体只作参考，不录制、不下载\n- 当前分镜与生产授权未改变\n`);
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
