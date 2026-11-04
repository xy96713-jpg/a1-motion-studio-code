#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const outputPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/current-storyboard-table-v1.png");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const projection = workspace.production.storyboardProductionProjection;
const rows = projection.items;
const width = 2200;
const rowHeight = 48;
const headerHeight = 196;
const height = headerHeight + (rows.length + 1) * rowHeight + 32;
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const text = (value, x, y, size = 22, fill = "#15191b", weight = 500) => `<text x="${x}" y="${y}" font-family="PingFang SC, Hiragino Sans GB, Arial, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${fill}">${esc(value)}</text>`;
const col = {shot: 42, role: 132, decision: 322, mode: 492, style: 690, copy: 1840};
const row = (item, index) => {
  const y = headerHeight + (index + 1) * rowHeight;
  const isOld = ["ED-12", "ED-13", "ED-14"].includes(item.shotId);
  const bg = isOld ? "#fff0e9" : index % 2 ? "#f4f5f1" : "#ffffff";
  const decisionColor = item.packageDecision === "PACKAGE" ? "#b83a2f" : "#315c70";
  return `<rect x="24" y="${y - 35}" width="2152" height="${rowHeight}" fill="${bg}"/>${text(item.shotId, col.shot, y, 22, isOld ? "#b83a2f" : "#15191b", 700)}${text(item.semanticRole || "", col.role, y, 18)}${text(item.packageDecision || "", col.decision, y, 20, decisionColor, 700)}${text(item.presentationMode || item.assemblyMode || "—", col.mode, y, 18)}${text(item.tasteBinding?.fingerprint || "NOT_APPLICABLE", col.style, y, 15, isOld ? "#b83a2f" : "#38474b")}${text((item.sourceText || "").slice(0, 30), col.copy, y, 16, "#38474b")}`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#edf0ed"/><rect x="24" y="24" width="2152" height="132" rx="10" fill="#161b1d"/>${text("当前系统正在读取的 34 镜分镜表", 52, 68, 34, "#f4f2e9", 700)}${text("STATUS: CURRENT  |  revision: " + projection.storyboardRevisionSha256, 52, 104, 17, "#c8d5d0", 500)}${text("警告：ED-12 / ED-13 / ED-14 仍绑定旧 no-crt 风格投影，不能当作最新美学板", 52, 132, 18, "#ff917c", 700)}${text("SHOT", col.shot, headerHeight - 12, 16, "#657278", 700)}${text("ROLE", col.role, headerHeight - 12, 16, "#657278", 700)}${text("PACKAGE", col.decision, headerHeight - 12, 16, "#657278", 700)}${text("MODE", col.mode, headerHeight - 12, 16, "#657278", 700)}${text("TASTE BINDING", col.style, headerHeight - 12, 16, "#657278", 700)}${text("SOURCE COPY", col.copy, headerHeight - 12, 16, "#657278", 700)}${rows.map(row).join("")}<line x1="24" y1="${height - 18}" x2="2176" y2="${height - 18}" stroke="#b7c0bd"/>${text("红色背景 = 当前表中的旧风格字段；这张图是诊断表，不是已批准视觉板。", 42, height - 2, 15, "#8e3c32", 600)}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(outputPath);
console.log(JSON.stringify({status: "PASS", outputPath, storyboardRevisionSha256: projection.storyboardRevisionSha256, rowCount: rows.length, warningShotIds: ["ED-12", "ED-13", "ED-14"]}, null, 2));
