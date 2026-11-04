#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {runWholeFilmAiDirector} from "../apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts";
import {buildProjectVisualBiblePack} from "../apps/studio-next/src/lib/a1-project-visual-bible-v1.mjs";
import {buildSystemLineResearchTaskViewV1} from "../apps/studio-next/src/lib/a1-system-line-task-view-v1.mjs";

process.env.A1_CODEX_DIRECTOR_TIMEOUT_MS ||= "120000";
process.env.A1_WHOLE_FILM_AI_DIRECTOR_TIMEOUT_MS ||= "180000";
process.env.A1_WHOLE_FILM_AI_DIRECTOR_DIAGNOSTICS ||= "true";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "work/cross-article-blind-production-canaries-v1");
const sha = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const shaBytes = (value) => crypto.createHash("sha256").update(value).digest("hex");
const xml = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const shotSchema = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-whole-film-shot-plan-output.schema.json"), "utf8"));
const schemaProblems = [];
function auditStrictSchema(value, location) {
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && value.type === "object" && value.properties) {
    const propertyNames = Object.keys(value.properties);
    const requiredNames = Array.isArray(value.required) ? value.required : [];
    if (value.additionalProperties !== false) schemaProblems.push(location + ":additionalProperties");
    for (const property of propertyNames) if (!requiredNames.includes(property)) schemaProblems.push(location + ":missing-required:" + property);
  }
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) child.forEach((item, index) => auditStrictSchema(item, location + "." + key + "[" + index + "]"));
    else if (child && typeof child === "object") auditStrictSchema(child, location + "." + key);
  }
}
auditStrictSchema(shotSchema, "shot-plan-schema");
const materialRequirementSchema = shotSchema.properties.shots.items.properties.materialRequirements.items;
assert.equal(materialRequirementSchema.properties.exactCopy.type.includes("null"), true);
assert.equal(materialRequirementSchema.properties.diagramSpec.type.includes("null"), true);
assert.deepEqual(schemaProblems, []);
const formatSrtTime = (ms) => {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":") + "," + String(millis).padStart(3, "0");
};
const directorImplementationSha256 = shaBytes(fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-whole-film-ai-director-v1.ts")));
const shotPlanSchemaSha256 = shaBytes(fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-whole-film-shot-plan-output.schema.json")));
const inputs = [
  {
    projectId: "canary-calendar-buffer-20260927",
    title: "给日程留一段空白，不是偷懒",
    genre: "personal-opinion",
    paragraphs: [
      "我以前把每一天排得很满，觉得空档就是浪费。可只要一件事稍微延迟，后面几项安排就会一起被推走。",
      "后来我发现，问题不是计划写得不够细，而是我把计划当成了不会变化的承诺。通勤、等待和临时确认，都会占掉原本没被算进去的时间。",
      "现在我先标出三件今天必须完成的事，再给它们之间留一段可以移动的空白。提前结束就休息，碰上延误就用空白吸收变化。",
      "这不是降低目标。变化是我不再假装每一分钟都已经确定，而是明确哪件事不能动、哪件事可以往后放。",
      "每周复盘时，我只看三个问题：什么必须固定，什么可以移动，意外发生时我最先保护哪一件事。",
      "一张有用的日程表不能保证所有事都做完。它至少应该让变更的代价早点出现，让人还能选。"
    ]
  },
  {
    projectId: "canary-entryway-reset-20260927",
    title: "玄关先有回位点，再买收纳盒",
    genre: "product-tutorial",
    paragraphs: [
      "我家玄关以前总是乱，钥匙、门卡和快递剪刀到处放。我的第一反应是再买几个收纳盒，结果盒子也变成了新的杂物堆。",
      "后来我先观察一周，记下每天进门后真正会拿放的东西。钥匙和门卡几乎每天都用，备用电池和说明书却很少碰。",
      "我把每天都会拿的物品放到门边伸手能到的位置，并给每样东西留一个固定回位点。出门时不用翻找，回家也能顺手放回去。",
      "接着我把偶尔使用的物品放进一个有标签的抽屉。标签写物品类别，不写抽屉编号，这样挪位置后也能找到。",
      "等回位点稳定一周，我才量尺寸买一个浅托盘。只买能解决现有物品边界的容器，不为可能出现的东西预留空间。",
      "整理不是把所有东西塞进去。先决定什么需要随手可取、回来放哪，再买容器，才不会把收纳本身变成新任务。"
    ]
  }
];

fs.mkdirSync(outDir, {recursive: true});
const packages = [];
for (const input of inputs) {
  const cues = input.paragraphs.map((sourceText, index) => ({cueId: index + 1, sourceStartMs: index * 10_000, sourceEndMs: (index + 1) * 10_000, sourceText}));
  const articleText = input.paragraphs.join("\n");
  const srtText = cues.map((cue, index) => (index + 1) + "\n" + formatSrtTime(cue.sourceStartMs) + " --> " + formatSrtTime(cue.sourceEndMs) + "\n" + cue.sourceText).join("\n\n") + "\n";
  const packageDir = path.join(outDir, input.projectId);
  fs.mkdirSync(packageDir, {recursive: true});
  const articlePath = path.join(packageDir, "article.md");
  const srtPath = path.join(packageDir, "script.srt");
  fs.writeFileSync(articlePath, input.paragraphs.join("\n\n") + "\n");
  fs.writeFileSync(srtPath, srtText);
  const inputManifest = {contract: "A1CrossArticleCanaryInput/v1", projectId: input.projectId, title: input.title, genre: input.genre,
    articlePath: path.relative(root, articlePath), articleSha256: sha(articleText), srtPath: path.relative(root, srtPath), srtSha256: sha(srtText),
    cueCount: cues.length, durationMs: cues.at(-1).sourceEndMs, directorImplementationSha256, shotPlanSchemaSha256, productionAdmission: false};
  let previousManifest = null;
  let previousRun = null;
  try { previousManifest = JSON.parse(fs.readFileSync(path.join(packageDir, "input-manifest.json"), "utf8")); } catch {}
  try { previousRun = JSON.parse(fs.readFileSync(path.join(packageDir, "director-run.json"), "utf8")); } catch {}
  const reuseValidatedPrefix = previousManifest?.articleSha256 === inputManifest.articleSha256
    && previousManifest?.srtSha256 === inputManifest.srtSha256
    && previousManifest?.directorImplementationSha256 === directorImplementationSha256
    && previousManifest?.shotPlanSchemaSha256 === shotPlanSchemaSha256
    && ["contextual-shot-design", "validation"].includes(previousRun?.blockedAt)
    && previousRun?.partial?.articleUnderstanding && previousRun?.partial?.strategy;
  const reuseCompletedDirectorRun = previousManifest?.articleSha256 === inputManifest.articleSha256
    && previousManifest?.srtSha256 === inputManifest.srtSha256
    && previousManifest?.directorImplementationSha256 === directorImplementationSha256
    && previousManifest?.shotPlanSchemaSha256 === shotPlanSchemaSha256
    && previousRun?.status === "completed" && previousRun?.plan;
  fs.writeFileSync(path.join(packageDir, "input-manifest.json"), JSON.stringify(inputManifest, null, 2) + "\n");
  console.log("director-start: " + input.projectId + " · " + cues.length + " exact time cues" + (reuseCompletedDirectorRun ? " · SHA-matched completed plan reused" : reuseValidatedPrefix ? " · SHA-matched article/strategy passes reused" : ""));
  const directorInput = {
    projectId: input.projectId,
    title: input.title,
    articleText,
    cues,
    timeline: {authority: "provided-time-cues", srtPath, srtSha256: sha(srtText)},
    mediaInventory: {presenterFootage: {status: "missing"}, screenRecording: {status: "missing"}, boundMaterialIds: []},
    ...(reuseValidatedPrefix ? {
      articleAnalysis: {analysis: previousRun.partial.articleUnderstanding},
      strategyCandidate: {strategy: previousRun.partial.strategy, provenance: {taskId: previousRun.traces.find((trace) => trace.pass === "whole-film-strategy")?.taskId || null}},
    } : {}),
  };
  const run = reuseCompletedDirectorRun ? previousRun : await runWholeFilmAiDirector({...directorInput});
  const runPath = path.join(packageDir, "director-run.json");
  fs.writeFileSync(runPath, JSON.stringify(run, null, 2) + "\n");
  if (run.status !== "completed" || !run.plan) {
    packages.push({id: input.projectId, title: input.title, genre: input.genre, status: run.status, blockedAt: run.blockedAt || null, reason: run.reason || null, traces: run.traces || [], productionAdmission: false});
    continue;
  }
  const plan = run.plan;
  const planPath = path.join(packageDir, "director-plan.json");
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2) + "\n");
  const planSha256 = sha(fs.readFileSync(planPath));
  const pack = buildProjectVisualBiblePack({plan, planSha256, approvedDirectorReviewSha256: null});
  const packPath = path.join(packageDir, "project-visual-bible-pack.json");
  fs.writeFileSync(packPath, JSON.stringify(pack, null, 2) + "\n");
  const packSha256 = sha(fs.readFileSync(packPath));
  const intake = {projectId: input.projectId, title: input.title, publicUrl: path.relative(root, articlePath), sha256: inputManifest.articleSha256,
    status: "DIRECTOR_PLAN_REVIEW_REQUIRED", cueCount: cues.length, durationMs: inputManifest.durationMs,
    directorStatus: "completed", directorPlanPublicUrl: path.relative(root, planPath), planSha256,
    visualBibleStatus: "pending", visualBiblePublicUrl: path.relative(root, packPath), visualBibleSha256: packSha256,
    visualQualityStatus: null, review540pStatus: null};
  const taskView = buildSystemLineResearchTaskViewV1({intake, directorPlan: plan, visualBiblePack: pack});
  const taskViewPath = path.join(packageDir, "task-view.json");
  fs.writeFileSync(taskViewPath, JSON.stringify(taskView, null, 2) + "\n");
  const routes = plan.shots.flatMap((shot) => (shot.materialRequirements || []).map((item) => item.duty));
  const routesSummary = Object.fromEntries([...new Set(routes)].map((route) => [route, routes.filter((item) => item === route).length]));
  const editModes = Object.fromEntries([...new Set(plan.shots.map((shot) => shot.editMode))].map((mode) => [mode, plan.shots.filter((shot) => shot.editMode === mode).length]));
  const presenterRequiredShotCount = plan.shots.filter((shot) => (shot.materialRequirements || []).some((item) => item.duty === "presenter-footage")).length;
  const generatedVisualCount = routesSummary["generated-visual"] || 0;
  const editableTypeCount = routesSummary["editable-type"] || 0;
  const blockedShotCount = taskView.shots.filter((shot) => shot.status === "BLOCKED").length;
  const missingMaterialCount = taskView.shots.reduce((sum, shot) => sum + shot.nodes.filter((node) => node.status === "BLOCKED").length, 0);
  const packagesStatus = blockedShotCount ? "PLAN_READY_ASSET_BLOCKED" : "PLAN_READY_FOR_NEXT_REVIEW";
  packages.push({id: input.projectId, title: input.title, genre: input.genre, status: packagesStatus, directorRunStatus: run.status, taskStatus: taskView.status, cachedValidatedPrefixReused: Boolean(reuseValidatedPrefix), articleSha256: inputManifest.articleSha256,
    srtSha256: inputManifest.srtSha256, cueCount: cues.length, durationMs: inputManifest.durationMs, cueCoverageExact: plan.coverage?.exact === true, editTimelineContinuous: plan.coverage?.editTimelineContinuous === true,
    planSha256, visualBiblePackSha256: packSha256, shotCount: plan.shots.length, chapterCount: plan.chapters.length,
    blockedShotCount, missingMaterialCount, presenterRequiredShotCount, presenterFootageAvailable: "missing", editableTypeCount, generatedVisualCount,
    averageMaterialRequirementsPerShot: Number((routes.length / Math.max(1, plan.shots.length)).toFixed(2)), editModes,
    routeCount: routes.length, routeDuties: routesSummary, sceneDirections: [...new Set(plan.shots.flatMap((shot) => shot.structureDirections || []))].length,
    taskViewSha256: taskView.sha256, taskViewShotCount: taskView.shots.length, nextAction: taskView.currentNode?.id || null,
    planPath: path.relative(root, planPath), packPath: path.relative(root, packPath), taskViewPath: path.relative(root, taskViewPath), traces: run.traces, productionAdmission: false});
}

const taskViewResult = JSON.parse(fs.readFileSync(path.join(root, "work/system-line-task-view-v1/result.json"), "utf8"));
const fixtureResults = taskViewResult.fixtures.map((item) => ({id: item.id, genre: item.genre, status: item.status, taskViewSha256: item.taskViewSha256}));
const successful = packages.length === 2 && packages.every((item) => item.directorRunStatus === "completed" && item.cueCoverageExact === true && item.editTimelineContinuous === true
  && item.taskStatus === "BLOCKED" && item.taskViewShotCount === item.shotCount && item.blockedShotCount === item.shotCount && item.missingMaterialCount > 0
  && item.presenterRequiredShotCount === 0 && item.editableTypeCount <= 2 * item.shotCount && item.generatedVisualCount <= item.shotCount);
const W = 620, H = 300, G = 18, cols = 2, boardW = cols * W + (cols + 1) * G, boardH = 64 + 2 * (H + G) + G;
const cardRows = packages.map((item, index) => {
  const x = G + index * (W + G), y = 64 + G;
  const routes = Object.entries(item.routeDuties || {}).map(([key, value]) => key + ":" + value).join(" · ") || "no route plan";
  const blocker = item.missingMaterialCount ? item.blockedShotCount + " shots · " + item.missingMaterialCount + " unbound material outputs" : "none";
  const card = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><rect width="100%" height="100%" rx="5" fill="#111617" stroke="#3e4b48"/><text x="20" y="32" fill="#8fd6dc" font-family="Arial" font-size="12">' + xml(item.genre) + " · " + xml(item.id) + '</text><text x="20" y="64" fill="#eee9dc" font-family="Arial" font-size="16">' + xml(item.title) + '</text><text x="20" y="98" fill="#8b9690" font-family="Arial" font-size="10">STATUS · ' + xml(item.status) + ' · CUES · ' + String(item.cueCount || 0) + '</text><text x="20" y="127" fill="#8b9690" font-family="Arial" font-size="10">INPUT SHA · ' + xml((item.articleSha256 || "").slice(0, 24)) + '</text><text x="20" y="157" fill="#b9c4bd" font-family="Arial" font-size="11">SHOTS ' + String(item.shotCount || 0) + ' · TEXT ' + String(item.editableTypeCount || 0) + ' · VISUAL ' + String(item.generatedVisualCount || 0) + '</text><text x="20" y="187" fill="#d7b579" font-family="Arial" font-size="10">PRESENTER REQUIRED ' + String(item.presenterRequiredShotCount || 0) + ' / FOOTAGE ' + xml(item.presenterFootageAvailable) + '</text><text x="20" y="216" fill="#8fd6dc" font-family="Arial" font-size="9">' + xml(routes.slice(0, 86)) + '</text><text x="20" y="244" fill="#d7b579" font-family="Arial" font-size="9">BLOCKER · ' + xml(blocker) + '</text><text x="20" y="276" fill="#8fd6dc" font-family="Arial" font-size="9">NEXT ' + xml(item.nextAction || "—") + ' · REVIEW ONLY · NO PRODUCTION ADMISSION</text></svg>';
  return {input: Buffer.from(card), left: x, top: y};
});
const header = '<svg xmlns="http://www.w3.org/2000/svg" width="' + boardW + '" height="64"><rect width="100%" height="100%" fill="#080a0b"/><text x="' + G + '" y="29" fill="#eee9dc" font-family="Arial" font-size="18">CROSS-ARTICLE DIRECTOR CANARIES · SAME GENERIC ROUTE</text><text x="' + G + '" y="50" fill="#8fd6dc" font-family="Arial" font-size="10">SYNTHETIC ARTICLE + TIME-CODED SCRIPT · ISOLATED DRY RUN</text></svg>';
const board = await sharp({create: {width: boardW, height: boardH, channels: 4, background: "#080a0b"}}).composite([{input: Buffer.from(header), left: 0, top: 0}, ...cardRows]).png().toBuffer();
const boardPath = path.join(outDir, "cross-article-task-board.png");
fs.writeFileSync(boardPath, board);
const result = {contract: "A1CrossArticleBlindProductionCanaryTest/v1", status: successful && fixtureResults.length === 6 ? "PASS" : "FAIL",
  packageCount: packages.length, fixtureCount: fixtureResults.length, genreCount: new Set([...fixtureResults.map((item) => item.genre), ...packages.map((item) => item.genre)]).size,
  packages, fixtures: fixtureResults, checks: {shotPlanSchemaCompatibleWithCodexStrictJson: schemaProblems.length === 0, optionalMaterialFieldsExplicitlyNullable: true,
    missingPresenterModeRejected: packages.every((item) => item.presenterRequiredShotCount === 0), editableTypeBudgetPassed: packages.every((item) => item.editableTypeCount <= 2 * item.shotCount), generatedVisualBudgetPassed: packages.every((item) => item.generatedVisualCount <= item.shotCount),
    materialTasksRemainExplicitlyBlockedUntilOutputsExist: packages.every((item) => item.blockedShotCount === item.shotCount && item.missingMaterialCount > 0), formalProductionWrites: 0, productionAdmission: false},
  visibleArtifact: path.relative(root, boardPath), visibleArtifactSha256: sha(board)};
const resultPath = path.join(outDir, "result.json");
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({status: result.status, packageCount: result.packageCount, fixtureCount: result.fixtureCount, genreCount: result.genreCount, packages: packages.map((item) => ({id: item.id, status: item.status, shotCount: item.shotCount || 0, nextAction: item.nextAction || null})), visibleArtifact: result.visibleArtifact}, null, 2));
assert.equal(result.status, "PASS", "both cross-article director runs must complete with exact, continuous cue coverage");
