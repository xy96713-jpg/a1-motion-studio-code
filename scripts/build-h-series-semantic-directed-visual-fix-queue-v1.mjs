#!/usr/bin/env node
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const root = process.cwd();
const phaseId = "h-series-semantic-directed-visual-fix-queue-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const contactSheetPath = path.join(artifactRoot, "targeted-visual-fix-queue.png");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const publicReportPath = path.join(publicRoot, "report.json");
const publicContactSheetPath = path.join(publicRoot, "targeted-visual-fix-queue.png");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const semanticReportPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json");
const macroIndexPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-semantic-directed-macro-review-index-v1/report.json");
const stillRoot = path.join(root, "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/stills");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const xml = (value) => String(value ?? "").replace(/[<>&'"]/gu, (char) => ({"<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", "\"": "&quot;"})[char]);

function addIssue(issues, id, category, reason, recommendation, evidence) {
  issues.push({id, severity: "suggestion", category, reason, recommendation, evidence});
}

async function buildContactSheet(items) {
  const tileWidth = 384;
  const tileHeight = 216;
  const labelHeight = 118;
  const columns = 3;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const composites = [];
  for (const [index, item] of items.entries()) {
    const framePath = path.join(stillRoot, `${item.beatId}.png`);
    if (!fs.existsSync(framePath)) continue;
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(framePath).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer();
    const issueLine = item.issues.slice(0, 2).map((issue) => issue.id).join(" / ");
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ded9ce"/><text x="12" y="23" fill="#111315" font-family="Arial,sans-serif" font-size="15" font-weight="800">${xml(item.beatId)} · ${xml(item.macroId)}</text><text x="12" y="49" fill="#244fc4" font-family="Arial,sans-serif" font-size="12">${xml(issueLine)}</text><text x="12" y="76" fill="#111315" font-family="Arial,sans-serif" font-size="12">${xml(item.screenText).slice(0, 38)}</text><text x="12" y="101" fill="#5f5b50" font-family="Arial,sans-serif" font-size="11">${xml(item.recommendedNextAction)}</text></svg>`);
    composites.push({input: image, left, top}, {input: label, left, top: top + tileHeight});
  }
  await sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f2efe7"}}).composite(composites).png().toFile(contactSheetPath);
}

for (const file of [propsPath, semanticReportPath, macroIndexPath]) if (!fs.existsSync(file)) throw new Error(`required-file-missing:${path.relative(root, file)}`);
const props = readJson(propsPath);
const semanticReport = readJson(semanticReportPath);
const macroIndex = readJson(macroIndexPath);
const candidateFamilies = new Set(["editorial-metaphor", "insertion-flow", "annotation-judgement", "direction-convergence"]);
const items = [];
for (const [index, scene] of (props.scenes || []).entries()) {
  const issues = [];
  const fitRatio = Number(scene.layout?.typography?.fitRatio || 0);
  const fontSize = Number(scene.layout?.typography?.fontSize || 0);
  const evidenceCount = Array.isArray(scene.entityEvidence) ? scene.entityEvidence.length : 0;
  if (scene.animationTier === "formal-highlight" && evidenceCount === 0 && candidateFamilies.has(scene.family)) {
    addIssue(issues, "candidate-generated-editorial-artwork", "asset-generation", "这个抽象/判断镜头目前只有确定性排版或通用图形，可能适合一件无文字的编辑配图。", "如视觉审片同意，再生成并绑定无文字编辑对象；不得生成假截图、假证据或假品牌。", {route: scene.route, family: scene.family, animationTier: scene.animationTier});
  }
  if (fitRatio >= .70) {
    addIssue(issues, "title-fit-too-tight", "typography", "标题已经接近排版宽度上限，虽然未溢出，但会压缩字的呼吸。", "优先缩短展示文案或改构图，不继续缩小字体。", {fitRatio, fontSize, titleLines: scene.titleLines});
  }
  if (!issues.length) continue;
  const macro = (macroIndex.macros || []).find((item) => item.macroId === scene.macroId);
  items.push({index, beatId: scene.beatId, macroId: scene.macroId, macroTimeRangeSec: macro ? [macro.startSec, macro.endSec] : null, screenText: scene.screenText, titleLines: scene.titleLines || [], route: scene.route, family: scene.family, animationTier: scene.animationTier, issueScore: issues.length, categories: [...new Set(issues.map((issue) => issue.category))], recommendedNextAction: issues.some((issue) => issue.category === "typography") ? "review-display-copy-or-recompose" : "consider-text-free-generated-editorial-object", issues});
}
const topItems = items.slice(0, 12);
fs.mkdirSync(artifactRoot, {recursive: true});
await buildContactSheet(topItems);
const issueCounts = {};
const categoryCounts = {};
for (const item of items) for (const issue of item.issues) { issueCounts[issue.id] = (issueCounts[issue.id] || 0) + 1; categoryCounts[issue.category] = (categoryCounts[issue.category] || 0) + 1; }
const source = {propsPath: "remotion-renderer/src/generated/microbeatLayeredFullProps.json", propsSha256: sha256(propsPath), semanticReportPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-v1/report.json", semanticReportSha256: sha256(semanticReportPath), macroIndexPath: "apps/studio-next/public/generated/system-line/h-series-semantic-directed-macro-review-index-v1/report.json", macroIndexSha256: sha256(macroIndexPath)};
const checks = {currentPropsBound: source.propsSha256 === semanticReport.sourceBinding?.propsSha256, currentAuthorityReviewOnly: semanticReport.reviewOnly === true && semanticReport.finalRenderAllowed === false && semanticReport.resolveExportAllowed === false, macroIndexBound: macroIndex.sourceBinding?.propsSha256 === source.propsSha256, allItemsCurrent: items.every((item) => fs.existsSync(path.join(stillRoot, `${item.beatId}.png`)))};
const failures = Object.entries(checks).filter(([, pass]) => pass !== true).map(([id]) => id);
const report = {contract: "A1HSeriesSemanticDirectedVisualFixQueue/v1", phaseId, status: failures.length ? "BLOCKED" : "PASS", generatedAt: new Date().toISOString(), reviewOnly: true, finalRenderAllowed: false, resolveExportAllowed: false, intent: "把当前权威 H-series 中的非阻塞视觉机会变成可定位的 Hxx-Bxx 队列；只供人审，不自动生成或采用。", source, summary: {sceneCount: props.scenes.length, targetItemCount: items.length, topItemCount: topItems.length, blockerCount: 0, issueCounts, categoryCounts}, checks, failures, targetItems: items, contactSheet: {path: path.relative(root, contactSheetPath), publicUrl: `/generated/system-line/${phaseId}/targeted-visual-fix-queue.png`, sha256: sha256(contactSheetPath), width: 1152, height: Math.max(1, Math.ceil(topItems.length / 3)) * (216 + 118)}, nextAction: failures.length ? "repair-current-visual-fix-queue-binding" : items.length ? "review-top-targeted-visual-fixes-or-request-user-prioritization" : "await-explicit-user-approval"};
for (const output of [reportPath, publicReportPath]) { fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`); }
fs.copyFileSync(contactSheetPath, publicContactSheetPath);
console.log(JSON.stringify({status: report.status, failures, summary: report.summary, source, reportPath: path.relative(root, reportPath), publicReportPath: path.relative(root, publicReportPath), nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 2;
