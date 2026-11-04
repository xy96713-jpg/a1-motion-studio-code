#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {compileExternalMaterialRequest, discoverExternalMediaMetadata} from "../apps/studio-next/src/lib/a1-external-media-discovery-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work", "external-media-segment-candidate-v1");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceFiles = [
  path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"),
  path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json"),
];
const before = sourceFiles.map(shaFile);

const fixtures = [
  {
    genre: "historical-person",
    request: compileExternalMaterialRequest({id: "historical-interview", viewerTask: "辨认同一人物在历史采访中的身份与当时语境", shotFunction: "REVEAL", narrativeRole: "HISTORICAL_CONTEXT", entities: ["Steve Jobs"], actions: ["keynote", "interview"], event: {name: "iPhone introduction", date: "2007"}, keywords: ["Apple"], preferredMedia: ["VIDEO", "IMAGE"], duration: {minimumMs: 3000, maximumMs: 12000}}),
    providers: ["WIKIMEDIA_COMMONS", "INTERNET_ARCHIVE"],
  },
  {
    genre: "science-evidence",
    request: compileExternalMaterialRequest({id: "science-event-evidence", viewerTask: "看到该历史事件本身而不是相似发射画面", shotFunction: "RESULT_HOLD", narrativeRole: "EVIDENCE", exactClaim: "Apollo 11 launched in 1969", entities: ["Apollo 11"], actions: ["launch"], event: {name: "Apollo 11 mission", date: "1969"}, keywords: ["Saturn V"], domains: ["SPACE"], preferredMedia: ["VIDEO", "IMAGE"], duration: {minimumMs: 3000, maximumMs: 12000}}),
    providers: ["WIKIMEDIA_COMMONS", "INTERNET_ARCHIVE", "NASA_IMAGES"],
  },
  {
    genre: "generic-broll",
    request: compileExternalMaterialRequest({id: "logistics-broll", viewerTask: "表现货物装载和航空运输动作但不冒充具体事件", shotFunction: "ACTION", narrativeRole: "B_ROLL", actions: ["cargo loading", "air freight"], locations: ["airport"], keywords: ["logistics"], preferredMedia: ["VIDEO", "IMAGE"], duration: {minimumMs: 3000, maximumMs: 9000}}),
    providers: ["WIKIMEDIA_COMMONS", "INTERNET_ARCHIVE"],
  },
];

const rows = [];
for (const fixture of fixtures) {
  const discovery = await discoverExternalMediaMetadata(fixture.request, {providers: fixture.providers, limit: 5});
  rows.push({genre: fixture.genre, request: fixture.request, discovery});
}

const after = sourceFiles.map(shaFile);
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("external-media-discovery-mutated-formal-authority");
const candidateCount = rows.reduce((sum, row) => sum + row.discovery.counts.candidateCount, 0);
const body = {
  contract: "A1ExternalMediaDiscoveryQualification/v1",
  status: rows.every((row) => row.request.status === "READY_FOR_DISCOVERY") && rows.filter((row) => row.discovery.counts.candidateCount > 0).length >= 2 ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  rows,
  fixtures: rows.map((row) => ({id: row.request.id, genre: row.genre, status: row.discovery.counts.candidateCount > 0 ? "PASS" : "FAIL", candidateCount: row.discovery.counts.candidateCount, discoverySha256: row.discovery.discoverySha256})),
  counts: {
    requestCount: rows.length,
    genreCount: new Set(rows.map((row) => row.genre)).size,
    providerAttemptCount: rows.reduce((sum, row) => sum + row.discovery.counts.providerCount, 0),
    candidateCount,
    genresWithCandidates: rows.filter((row) => row.discovery.counts.candidateCount > 0).length,
  },
  checks: {
    requestContractsReady: rows.every((row) => row.request.status === "READY_FOR_DISCOVERY"),
    metadataOnly: rows.every((row) => row.discovery.boundary.metadataOnly && row.discovery.boundary.mediaDownloaded === false),
    discoveryNeverAdmitsEvidence: rows.every((row) => row.discovery.boundary.evidenceAdmission === false),
    formalAuthorityUnchanged: JSON.stringify(before) === JSON.stringify(after),
  },
  boundary: {reviewOnly: true, mediaDownloaded: false, storyboardMutation: false, formalWorkspaceMutation: false, productionAdmission: false},
};
const result = {...body, resultSha256: crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex")};
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

const lines = [
  "# 外部图片与视频素材检索审核",
  "",
  `状态：**${result.status}** · ${result.counts.requestCount} 个需求 · ${result.counts.candidateCount} 个元数据候选`,
  "",
  "> 此报告只证明能找到来源候选；没有下载媒体，没有把候选认作证据，也没有写入分镜。",
  "",
];
for (const row of rows) {
  lines.push(`## ${row.genre} · ${row.request.id}`);
  lines.push("");
  lines.push(`- 观众任务：${row.request.direction.viewerTask}`);
  lines.push(`- 叙事职责：${row.request.direction.narrativeRole}`);
  lines.push(`- 来源等级要求：${row.request.authority.requiredGrades.join(" / ")}`);
  lines.push(`- 检索：${row.discovery.providers.map((provider) => `${provider.provider} ${provider.candidateCount}`).join(" · ") || "无可用提供方"}`);
  const candidates = row.discovery.providers.flatMap((provider) => provider.candidates).sort((left, right) => right.relevance.score - left.relevance.score || left.title.localeCompare(right.title)).slice(0, 5);
  if (!candidates.length) lines.push("- 候选：未找到；保持缺口，不用相似素材冒充。", "");
  else {
    lines.push("", "| 类型 | 标题 | 来源 | 相关分 | 许可状态 |", "|---|---|---|---:|---|");
    for (const candidate of candidates) lines.push(`| ${candidate.mediaType} | [${String(candidate.title || candidate.sourceId).replaceAll("|", " ").replaceAll("[", "").replaceAll("]", "")}](${candidate.sourcePageUrl}) | ${candidate.provider} | ${candidate.relevance.score} | ${candidate.license.reviewStatus} |`);
    lines.push("");
  }
}
fs.writeFileSync(path.join(outputRoot, "review.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({status: result.status, counts: result.counts, checks: result.checks, resultSha256: result.resultSha256, reviewPath: path.relative(root, path.join(outputRoot, "review.md"))}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
