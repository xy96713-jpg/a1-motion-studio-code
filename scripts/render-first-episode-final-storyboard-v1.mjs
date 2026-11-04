#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const workspaceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/first-episode-final-storyboard-v1");
const outputFile = path.join(outputRoot, "first-episode-final-storyboard.png");
const reportFile = path.join(outputRoot, "report.json");
const workspace = JSON.parse(fs.readFileSync(workspaceFile, "utf8"));
const decisions = [...workspace.production.canonicalCreatorPackagingSequence.decisions].sort((a, b) => a.order - b.order);
const semanticRoleByShot = new Map((workspace.production.storyboardProductionProjection?.items || []).map((item) => [item.shotId, item.semanticRole || "ordinary-narration"]));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function chapter(order) {
  if (order <= 6) return {id: "01", label: "产品先成立", fill: "#dce6ff"};
  if (order <= 10) return {id: "02", label: "AI 为什么不说人话", fill: "#ffe5db"};
  if (order <= 17) return {id: "03", label: "问题根因与证据", fill: "#eee8ff"};
  if (order <= 20) return {id: "04", label: "把方法固定成系统", fill: "#e4f1e7"};
  if (order <= 30) return {id: "05", label: "真实工作台演示", fill: "#e6eff2"};
  return {id: "06", label: "可控工作流与结论", fill: "#fff1cf"};
}

const generatedHeroIds = new Set(["ED-01", "ED-10", "ED-34"]);
const presenterOverlayIds = new Set(["ED-01", "ED-07", "ED-19", "ED-31"]);
const explainerIds = new Set(["ED-09", "ED-12", "ED-14", "ED-16", "ED-17"]);
const screenDemoIds = new Set(["ED-02", "ED-03", "ED-04", "ED-05", "ED-06", "ED-20", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"]);
const cleanPresenterIds = new Set(decisions.map((item) => item.shotId).filter((shotId) => !generatedHeroIds.has(shotId) && !presenterOverlayIds.has(shotId) && !explainerIds.has(shotId) && !screenDemoIds.has(shotId)));

function finalRoute(item) {
  if (item.shotId === "ED-01") return {visual: "全屏生成字形 → 口播", package: "HERO + OVERLAY", type: "GEN HERO / LOCAL COPY", status: "重点开篇"};
  if (item.shotId === "ED-10") return {visual: "全屏判断：完成度很高的废稿", package: "FULLSCREEN", type: "GEN HERO / LOCAL COPY", status: "中段重击"};
  if (item.shotId === "ED-34") return {visual: "全屏结论：自己的风格", package: "FULLSCREEN", type: "GEN HERO / LOCAL COPY", status: "结尾签名"};
  if (presenterOverlayIds.has(item.shotId)) return {visual: "真人口播 + 负空间轻包装", package: "OVERLAY", type: "LOCAL EDITABLE", status: "人物优先"};
  if (explainerIds.has(item.shotId)) return {visual: item.shotId === "ED-14" ? "真实论文证据 + 标注" : "像素编辑解释器 / 分屏", package: "SPLIT", type: "LOCAL FORMAL/PIXEL", status: "解释或证据"};
  if (screenDemoIds.has(item.shotId)) return {visual: "真实工作台操作画面", package: "NO PACKAGE", type: "SOURCE PIXELS", status: "不做装饰包装"};
  return {visual: "干净口播原画", package: "NO PACKAGE", type: "NONE", status: "节奏呼吸"};
}

const rows = decisions.map((item) => ({...item, semanticRole: semanticRoleByShot.get(item.shotId) || "ordinary-narration", chapter: chapter(item.order), final: finalRoute(item)}));
const width = 1920;
const headerHeight = 190;
const rowHeight = 46;
const height = headerHeight + rows.length * rowHeight + 78;
const cols = {shot: 36, chapter: 122, role: 310, visual: 510, package: 950, type: 1130, copy: 1430};
const text = (value, x, y, size, fill = "#15191b", weight = 500) => `<text x="${x}" y="${y}" font-family="PingFang SC, Hiragino Sans GB, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(value)}</text>`;

const renderedRows = rows.map((item, index) => {
  const y = headerHeight + index * rowHeight;
  const accent = generatedHeroIds.has(item.shotId) ? "#315cff" : item.packageDecision === "PACKAGE" ? "#a84232" : "#61747b";
  const bg = index % 2 ? "#f7f7f3" : "#ffffff";
  return `<rect x="24" y="${y}" width="1872" height="${rowHeight}" fill="${bg}"/>
    <rect x="24" y="${y}" width="8" height="${rowHeight}" fill="${accent}"/>
    ${text(item.shotId, cols.shot, y + 30, 18, accent, 700)}
    ${text(`${item.chapter.id} ${item.chapter.label}`, cols.chapter, y + 30, 15, "#4b5b60", 600)}
    ${text(item.semanticRole || "ordinary-narration", cols.role, y + 30, 15)}
    ${text(item.final.visual, cols.visual, y + 30, 16, "#182125", 600)}
    ${text(item.final.package, cols.package, y + 30, 15, accent, 700)}
    ${text(item.final.type, cols.type, y + 30, 14, "#4b5b60", 600)}
    ${text(String(item.sourceText || "").slice(0, 32), cols.copy, y + 30, 14, "#4b5b60")}`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#edf0ed"/>
  <rect x="24" y="24" width="1872" height="118" rx="12" fill="#111719"/>
  ${text("第一期最终建议分镜表 · 34 个语义镜头 / 11 个包装节点", 52, 70, 32, "#f4f2e9", 700)}
  ${text("生成字形主视觉仅 3 次：开篇 ED-01 · 判断 ED-10 · 结尾 ED-34；其余口播、证据与操作画面保持真实、克制。", 52, 108, 18, "#c4d0cf", 500)}
  ${text("REVIEW ONLY · 当前 authority 未改变 · 通过静态板确认后才进入动效", 1450, 108, 14, "#8ea7ff", 700)}
  ${text("SHOT", cols.shot, 174, 14, "#68777c", 700)}
  ${text("章节", cols.chapter, 174, 14, "#68777c", 700)}
  ${text("语义角色", cols.role, 174, 14, "#68777c", 700)}
  ${text("最终画面", cols.visual, 174, 14, "#68777c", 700)}
  ${text("包装", cols.package, 174, 14, "#68777c", 700)}
  ${text("文字所有权", cols.type, 174, 14, "#68777c", 700)}
  ${text("口播原文", cols.copy, 174, 14, "#68777c", 700)}
  ${renderedRows}
  <rect x="24" y="${height - 58}" width="1872" height="38" fill="#111719"/>
  ${text("客观收口：3 个生成标题主场 + 4 个 presenter 包装（ED-01 与开篇重叠）+ 5 个解释/证据节点 + 16 个真实屏幕演示 + 7 个干净口播呼吸镜头", 44, height - 32, 15, "#f4f2e9", 600)}
</svg>`;

fs.mkdirSync(outputRoot, {recursive: true});
await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toFile(outputFile);
const bytes = fs.readFileSync(outputFile);
const report = {
  contract: "A1FirstEpisodeFinalStoryboardProposal/v1",
  status: "READY_FOR_USER_STORYBOARD_REVIEW",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  semanticShotCount: rows.length,
  packageShotIds: rows.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId),
  generatedHeroShotIds: [...generatedHeroIds],
  presenterOverlayShotIds: [...presenterOverlayIds],
  explainerShotIds: [...explainerIds],
  screenDemoShotIds: [...screenDemoIds],
  cleanPresenterShotIds: [...cleanPresenterIds],
  output: {file: path.relative(root, outputFile), sha256: sha256(bytes), width, height},
  boundaries: {reviewOnly: true, currentAuthorityChanged: false, productionAdmitted: false, motionRendered: false},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(reportFile, `${JSON.stringify({...report, reportSha256: sha256(Buffer.from(JSON.stringify(report)))}, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, output: report.output, semanticShotCount: rows.length, packageCount: report.packageShotIds.length, generatedHeroShotIds: report.generatedHeroShotIds}, null, 2));
