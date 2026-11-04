#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const manifestFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/presenter-light-overlay-system-v2/manifest.json");
const openingFile = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-opening-title-three-state-v1/state-a-fullscreen-title.png");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/first-episode-visual-storyboard-v1");
const outputFile = path.join(outputRoot, "first-episode-visual-storyboard.png");
const reportFile = path.join(outputRoot, "report.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const generatedHeroIds = new Set(["ED-01", "ED-10", "ED-34"]);
const packageIds = new Set(["ED-01", "ED-07", "ED-09", "ED-10", "ED-12", "ED-14", "ED-16", "ED-17", "ED-19", "ED-31", "ED-34"]);

function sourceFile(item) {
  if (item.shotId === "ED-01") return openingFile;
  const publicUrl = item.preview?.publicUrl;
  if (!publicUrl?.startsWith("/generated/system-line/")) throw new Error(`visual-storyboard-preview-invalid:${item.shotId}`);
  return path.join(publicRoot, publicUrl.replace(/^\//u, ""));
}

function visualRoute(item) {
  if (item.shotId === "ED-01") return "FULLSCREEN TITLE → PRESENTER";
  if (item.shotId === "ED-10") return "FULLSCREEN VERDICT";
  if (item.shotId === "ED-34") return "FULLSCREEN CONCLUSION";
  if (["ED-07", "ED-19", "ED-31"].includes(item.shotId)) return "PRESENTER OVERLAY";
  if (["ED-09", "ED-12", "ED-14", "ED-16", "ED-17"].includes(item.shotId)) return "EXPLAINER / EVIDENCE";
  if (item.route === "SCREEN_EVIDENCE") return "REAL SCREEN DEMO";
  return "CLEAN PRESENTER";
}

async function tile(item, index) {
  const file = sourceFile(item);
  if (!fs.existsSync(file)) throw new Error(`visual-storyboard-preview-missing:${item.shotId}`);
  const image = await sharp(file).resize(480, 270, {fit: "cover"}).png().toBuffer();
  const accent = generatedHeroIds.has(item.shotId) ? "#315cff" : packageIds.has(item.shotId) ? "#c84f38" : "#63777e";
  const status = item.shotId === "ED-01" ? "TITLE CLEANUP + EXACT COPY REQUIRED" : packageIds.has(item.shotId) ? "PACKAGE REVIEW" : "SOURCE / BREATHING";
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="92"><rect width="480" height="92" fill="#080d0f"/><rect width="8" height="92" fill="${accent}"/><text x="20" y="27" fill="#f4f2eb" font-family="monospace" font-size="17" font-weight="700">${esc(item.shotId)} · ${esc(visualRoute(item))}</text><text x="20" y="52" fill="${accent}" font-family="monospace" font-size="11" font-weight="700">${esc(status)}</text><text x="20" y="76" fill="#9aa8aa" font-family="PingFang SC, sans-serif" font-size="12">${esc(String(item.sourceText || "").slice(0, 30))}</text></svg>`);
  return sharp({create: {width: 480, height: 362, channels: 4, background: "#080d0f"}}).composite([{input: image, left: 0, top: 0}, {input: label, left: 0, top: 270}]).png().toBuffer();
}

async function main() {
  if (manifest.timelineItems?.length !== 34) throw new Error(`visual-storyboard-timeline-count:${manifest.timelineItems?.length}`);
  fs.mkdirSync(outputRoot, {recursive: true});
  const items = [...manifest.timelineItems].sort((a, b) => Number(a.order) - Number(b.order));
  const tiles = await Promise.all(items.map(tile));
  const columns = 4;
  const rows = Math.ceil(tiles.length / columns);
  const headerHeight = 116;
  const width = 1920;
  const height = headerHeight + rows * 362;
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="116"><rect width="1920" height="116" fill="#111719"/><text x="30" y="47" fill="#f4f2eb" font-family="PingFang SC, sans-serif" font-size="31" font-weight="700">第一期最终视觉分镜板 · 34 镜真实画面</text><text x="30" y="82" fill="#becdca" font-family="PingFang SC, sans-serif" font-size="17">蓝色＝生成字形主场 · 红色＝包装节点 · 灰色＝真实来源/呼吸镜头 · ED-01 仍需清理字体样张并绑定准确汉字</text><text x="1510" y="82" fill="#8ea7ff" font-family="monospace" font-size="14">REVIEW ONLY · AUTHORITY UNCHANGED</text></svg>`);
  const board = await sharp({create: {width, height, channels: 4, background: "#05080b"}}).composite([{input: header, left: 0, top: 0}, ...tiles.map((input, index) => ({input, left: (index % columns) * 480, top: headerHeight + Math.floor(index / columns) * 362}))]).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, board);
  const report = {
    contract: "A1FirstEpisodeVisualStoryboard/v1",
    status: "READY_FOR_USER_VISUAL_STORYBOARD_REVIEW",
    sourceManifestSha256: manifest.manifestSha256,
    shotCount: items.length,
    allPreviewFilesExist: true,
    generatedHeroShotIds: [...generatedHeroIds],
    packageShotIds: [...packageIds],
    repairRequiredShotIds: ["ED-01"],
    output: {file: path.relative(root, outputFile), sha256: sha256(board), width, height},
    boundaries: {reviewOnly: true, currentAuthorityChanged: false, productionAdmitted: false, motionRendered: false},
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(reportFile, `${JSON.stringify({...report, reportSha256: sha256(Buffer.from(JSON.stringify(report)))}, null, 2)}\n`);
  console.log(JSON.stringify({status: report.status, shotCount: report.shotCount, output: report.output, repairRequiredShotIds: report.repairRequiredShotIds}, null, 2));
}

await main();
