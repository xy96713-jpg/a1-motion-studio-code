#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {compileExternalMaterialRequest} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";
import {assertYouTubeReferenceDiscovery, discoverYouTubeReferenceMetadata} from "../apps/studio-next/src/lib/a1-youtube-reference-search-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "youtube-reference-search-v1");
const previewRoot = path.join(phaseRoot, "previews");
const ytDlpPath = process.env.A1_YTDLP_PATH || "/Users/a1/Documents/Codex/dj助手-runtime/venv312/bin/yt-dlp";
const ensure = (directory) => fs.mkdirSync(directory, {recursive: true});
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const shaValue = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rel = (file) => path.relative(root, file);
const xml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
ensure(previewRoot);

const versionResult = spawnSync(ytDlpPath, ["--version"], {encoding: "utf8", timeout: 10000});
if (versionResult.status !== 0) throw new Error("yt-dlp-runtime-unavailable");
const ytDlpVersion = versionResult.stdout.trim();
const fixtures = [
  {id: "education-child-study", genre: "education", title: "小孩学习", input: {id: "education-child-study", viewerTask: "看见小孩在真实环境中学习或共同阅读", shotFunction: "ACTION", narrativeRole: "B_ROLL", actions: ["children studying"], locations: ["classroom"], keywords: ["children reading", "education"], preferredMedia: ["VIDEO"]}},
  {id: "nature-grass-wind", genre: "nature", title: "风吹草地", input: {id: "nature-grass-wind", viewerTask: "看见风吹过绿色草地的真实自然空镜", shotFunction: "TRANSITION", narrativeRole: "ATMOSPHERE", actions: ["grass moving in wind"], locations: ["green field"], keywords: ["tall grass", "wind"], preferredMedia: ["VIDEO"]}},
  {id: "environment-ocean-waves", genre: "environment", title: "海洋波浪", input: {id: "environment-ocean-waves", viewerTask: "看见真实海面与近距离波浪运动", shotFunction: "ESTABLISH", narrativeRole: "B_ROLL", actions: ["ocean waves"], locations: ["sea"], keywords: ["close up waves", "water"], preferredMedia: ["VIDEO"]}},
];

const rows = [];
const thumbnailReceipts = [];
for (const fixture of fixtures) {
  const request = compileExternalMaterialRequest(fixture.input);
  const discovery = discoverYouTubeReferenceMetadata(request, {ytDlpPath, limit: 8, detailLimit: 8, timeoutMs: 45000});
  assertYouTubeReferenceDiscovery(discovery);
  const selected = discovery.candidates.find((candidate) => candidate.status === "CC_METADATA_FOUND_REVIEW_REQUIRED") || null;
  let preview = null;
  if (selected?.previewUrl) {
    const response = await fetch(selected.previewUrl, {headers: {"User-Agent": "A1MotionStudio/1.0 youtube-reference-preview"}});
    if (!response.ok) throw new Error(`youtube-preview-http:${fixture.id}:${response.status}`);
    const file = path.join(previewRoot, `${fixture.id}.jpg`);
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    preview = {path: rel(file), sha256: shaFile(file)};
    thumbnailReceipts.push({fixtureId: fixture.id, url: selected.previewUrl, status: response.status, path: preview.path, sha256: preview.sha256});
  }
  rows.push({id: fixture.id, genre: fixture.genre, title: fixture.title, status: selected && preview ? "PASS" : "NO_MATCH", request, discovery, selected, preview});
}

const tileWidth = 560;
const tileHeight = 315;
const labelHeight = 145;
const composites = [];
for (const [index, row] of rows.entries()) {
  const left = index * tileWidth;
  if (!row.selected || !row.preview) {
    const placeholder = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${tileHeight + labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="20" y="150" fill="#c9ef39" font-family="Arial,sans-serif" font-size="28" font-weight="700">NO CC MATCH</text><text x="20" y="190" fill="#d7dbd7" font-family="Arial,sans-serif" font-size="15">${xml(row.title)}</text></svg>`);
    composites.push({input: placeholder, left, top: 0});
    continue;
  }
  const image = await sharp(path.join(root, row.preview.path)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101315"/><text x="16" y="27" fill="#c9ef39" font-family="Arial,sans-serif" font-size="14" font-weight="700">YOUTUBE CC SEARCH · ${xml(row.title)}</text><text x="16" y="56" fill="#f2efe8" font-family="Arial,sans-serif" font-size="14">${xml(row.selected.title.slice(0, 66))}</text><text x="16" y="84" fill="#d7dbd7" font-family="Arial,sans-serif" font-size="12">${xml(row.selected.publisher)} · ${(row.selected.durationMs / 1000).toFixed(0)}s · ${row.selected.height || "?"}p</text><text x="16" y="111" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">Creative Commons metadata found · reference only · not downloaded</text></svg>`);
  composites.push({input: image, left, top: 0}, {input: label, left, top: tileHeight});
}
const reviewBoard = path.join(phaseRoot, "youtube-reference-board.png");
await sharp({create: {width: tileWidth * rows.length, height: tileHeight + labelHeight, channels: 4, background: "#080b0c"}}).composite(composites).png().toFile(reviewBoard);

const summaries = rows.map((row) => ({id: row.id, genre: row.genre, status: row.status, query: row.discovery.query, counts: row.discovery.counts, selected: row.selected ? {sourceId: row.selected.sourceId, title: row.selected.title, sourcePageUrl: row.selected.sourcePageUrl, publisher: row.selected.publisher, durationMs: row.selected.durationMs, license: row.selected.license, status: row.selected.status, referenceOnly: row.selected.boundaries.referenceOnly} : null, preview: row.preview}));
const body = {contract: "A1YouTubeReferenceSearchQualification/v1", status: rows.every((row) => row.status === "PASS") ? "PASS" : "FAIL", generatedAt: new Date().toISOString(), ytDlp: {version: ytDlpVersion, usedCookies: false, usedAccountLogin: false}, fixtures: summaries, thumbnailReceipts, reviewBoard: {path: rel(reviewBoard), sha256: shaFile(reviewBoard), width: tileWidth * rows.length, height: tileHeight + labelHeight}, checks: {threeGenres: rows.length === 3, liveYouTubeSearchExecuted: rows.every((row) => row.discovery.counts.searched > 0), creativeCommonsMetadataFound: rows.every((row) => row.discovery.counts.ccMetadataFound > 0), sourcePagesBound: rows.every((row) => /^https:\/\/www\.youtube\.com\/watch/u.test(row.selected?.sourcePageUrl || "")), previewPixelsCached: thumbnailReceipts.length === rows.length, allReferenceOnly: rows.every((row) => row.selected?.boundaries.referenceOnly === true), automaticDownload: false, storyboardMutation: false, productionAdmission: false}, boundary: {metadataAndPreviewOnly: true, videoBytesDownloaded: false, automaticCandidateAdoption: false, productionAdmission: false}};
const result = {...body, resultSha256: shaValue(body)};
fs.writeFileSync(path.join(phaseRoot, "qualification.json"), `${JSON.stringify(rows, null, 2)}\n`);
fs.writeFileSync(path.join(phaseRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
const lines = ["# YouTube 生活化 B-roll 实时搜索", "", `状态：**${result.status}** · ${rows.length} 类场景 · yt-dlp ${ytDlpVersion}`, "", "> YouTube 用作高召回参考库。本阶段只搜索、核验页面许可证元数据并缓存预览图，不下载视频，也不写入正式分镜。", ""];
for (const row of rows) lines.push(`## ${row.title}`, "", row.selected ? `- 候选：[${row.selected.title}](${row.selected.sourcePageUrl})` : "- 候选：NO MATCH", row.selected ? `- 频道：${row.selected.publisher}；许可：${row.selected.license.name}` : "", row.selected ? `- 状态：${row.selected.status}；仍是 reference-only` : "", "");
lines.push(`审核图：${rel(reviewBoard)}`);
fs.writeFileSync(path.join(phaseRoot, "review.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({status: result.status, ytDlp: result.ytDlp, fixtures: result.fixtures, reviewBoard: result.reviewBoard, checks: result.checks, resultSha256: result.resultSha256}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
