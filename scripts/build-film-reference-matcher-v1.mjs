#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertFilmReferenceBrief, assertFilmReferenceRanking, compileFilmReferenceBrief, rankFilmReferenceCandidates} from "../apps/studio-next/src/lib/a1-film-reference-matcher-v1.mjs";
import {FILM_REFERENCE_SCENE_CATALOG_V1} from "../apps/studio-next/src/lib/a1-film-reference-scene-catalog-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work", "article-film-reference-matcher-v1");
const shaValue = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const authorityFiles = [path.join(root, ".codex-artifacts", "system-progress-system-line", "current-phase.json"), path.join(root, ".codex-artifacts", "system-progress-system-line", "system-line-current-authority-v2", "audit-report.json")];
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const authorityBefore = authorityFiles.map(shaFile);

const catalog = FILM_REFERENCE_SCENE_CATALOG_V1;
const fixtures = [
  {id: "founder-momentum", genre: "business-profile", input: {beatId: "founder-momentum", sourceText: "A small team built the product overnight, and the network spread faster than the company could understand.", viewerTask: "Feel concentrated startup work turning into sudden scale", semanticRole: "SUPPORTING_EXPLANATION", shotFunction: "TRANSITION", tone: "URGENT", supportingTones: ["AMBITIOUS"], actions: ["coding", "building startup", "rapid expansion"], environments: ["dorm room", "startup office"], visualMotifs: ["screens", "night work", "network growth"], cameraEnergy: "HIGH", dialogueNeed: "LOW"}},
  {id: "mission-pressure", genre: "science-evidence", input: {beatId: "mission-pressure", sourceText: "The official record proves the event; the film reference should only communicate the pressure around the mission.", viewerTask: "Understand coordination pressure without replacing real mission evidence", claimType: "EVIDENCE_CLAIM", tone: "TENSE", actions: ["monitoring mission", "coordinating crisis", "calculating trajectory"], environments: ["mission control"], visualMotifs: ["status boards", "headsets"], cameraEnergy: "HIGH", dialogueNeed: "HIGH"}},
  {id: "automation-alienation", genre: "technology-opinion", input: {beatId: "automation-alienation", sourceText: "Automation removes repetitive motion but can also make the worker feel smaller than the system.", viewerTask: "Feel repetition, replacement and human alienation", semanticRole: "SUPPORTING_EXPLANATION", shotFunction: "TRANSITION", tone: "REFLECTIVE", supportingTones: ["ALIENATED"], actions: ["assembly line work", "repetitive movement", "machine replacement"], environments: ["factory"], visualMotifs: ["gears", "repetition"], cameraEnergy: "MEDIUM", dialogueNeed: "LOW"}},
];

const rows = fixtures.map((fixture) => {
  const brief = compileFilmReferenceBrief(fixture.input);
  assertFilmReferenceBrief(brief);
  const ranking = rankFilmReferenceCandidates(brief, catalog);
  assertFilmReferenceRanking(ranking);
  return {id: fixture.id, genre: fixture.genre, status: "PASS", brief, ranking};
});
const authorityAfter = authorityFiles.map(shaFile);
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("film-reference-matcher-mutated-formal-authority");
const intakeTemplate = {contract: "A1UserFilmReferenceIntake/v1", filmTitle: "", releaseYearOrEdition: "", localFilePath: "", rightsBasis: "USER_PROVIDED_REFERENCE", intendedUse: "REFERENCE_ANALYSIS_ONLY", subtitlePathOptional: "", note: "A local file permits local indexing only. Use USER_LICENSED_FOR_EDIT only when publication/editing rights are documented."};
fs.writeFileSync(path.join(outputRoot, "user-media-intake-template.json"), `${JSON.stringify(intakeTemplate, null, 2)}\n`);
const body = {contract: "A1FilmReferenceMatcherQualification/v1", status: rows.every((row) => row.status === "PASS" && row.ranking.topCandidates.length >= 1) ? "PASS" : "FAIL", generatedAt: new Date().toISOString(), fixtures: rows.map((row) => ({id: row.id, genre: row.genre, status: row.status, briefSha256: row.brief.briefSha256, rankingSha256: row.ranking.rankingSha256, topCandidates: row.ranking.topCandidates.map((candidate) => ({title: candidate.title, year: candidate.year, sceneId: candidate.sceneId, approximateMoment: candidate.approximateMoment, score: candidate.score, rightsStatus: candidate.rightsStatus, status: candidate.status}))})), rows, counts: {fixtureCount: rows.length, catalogFilmCount: catalog.length, catalogSceneCount: catalog.reduce((sum, film) => sum + film.scenes.length, 0), recommendationCount: rows.reduce((sum, row) => sum + row.ranking.topCandidates.length, 0)}, checks: {cinematicGrammarCompiled: true, evidenceNeverReplaced: rows.find((row) => row.id === "mission-pressure")?.brief.usage.mode === "REENACTMENT_REFERENCE_ONLY", userMediaRequired: rows.every((row) => row.ranking.userMediaRequest.required), filmProductionUseAutomatic: false, genericBrollFallbackPresent: rows.every((row) => Boolean(row.ranking.genericBrollFallback)), noForcedLowFitRecommendations: rows.every((row) => row.ranking.topCandidates.every((candidate) => candidate.semanticAnchorCount > 0)), mediaDownloaded: false, storyboardMutation: false, formalAuthorityUnchanged: JSON.stringify(authorityBefore) === JSON.stringify(authorityAfter), productionAdmission: false}, intakeTemplate: {path: "work/article-film-reference-matcher-v1/user-media-intake-template.json", sha256: shaFile(path.join(outputRoot, "user-media-intake-template.json"))}, boundary: {recommendationOnly: true, mediaDownloaded: false, automaticProductionUse: false, storyboardMutation: false, formalWorkspaceMutation: false, productionAdmission: false}};
const result = {...body, resultSha256: shaValue(body)};
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
const lines = ["# 文章到电影片段参考建议", "", `状态：**${result.status}** · ${result.counts.fixtureCount} 类文案 · ${result.counts.catalogFilmCount} 部参考电影`, "", "> 电影片段用于镜头语言和情绪参考；事实证据必须保留真实来源。你提供本地文件只授权本地分析，不自动取得发布权。", ""];
for (const row of rows) {
  lines.push(`## ${row.genre} · ${row.id}`, "", `- 文案任务：${row.brief.beat.viewerTask}`, `- 镜头语法：${row.brief.grammar.narrativeFunction} · ${row.brief.grammar.cameraEnergy} · 对白 ${row.brief.grammar.dialogueNeed}`, `- 通用 B-roll 备用查询：${row.ranking.genericBrollFallback}`, "", "| 排名 | 电影与场景 | 为什么适合 | 状态 |", "|---:|---|---|---|");
  row.ranking.topCandidates.forEach((candidate, index) => lines.push(`| ${index + 1} | **${candidate.title}** (${candidate.year}) · ${candidate.approximateMoment} | ${candidate.description}；${candidate.reasons.join("、")} | ${candidate.status} |`));
  lines.push("");
}
lines.push("## 你需要提供什么", "", "只要提供片名和本地视频路径即可，不必先剪。最好同时说明版本/年份、这段只做参考还是已有剪辑发布许可、可选字幕文件。系统随后会自动切镜、转录、看关键帧并返回精确时间段。", "", `填写模板：[user-media-intake-template.json](./user-media-intake-template.json)`);
fs.writeFileSync(path.join(outputRoot, "review.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({status: result.status, counts: result.counts, fixtures: result.fixtures, checks: result.checks, reviewPath: "work/article-film-reference-matcher-v1/review.md", resultSha256: result.resultSha256}, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
