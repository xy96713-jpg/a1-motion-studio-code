#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {buildFontGlyphOutlineRun, glyphOutlineRunToSvgPaths} from "../apps/studio-next/src/lib/a1-font-glyph-outline-v1.mjs";
import {A1_TYPOGRAPHY_ROLE_AUTHORITY} from "../apps/studio-next/src/lib/a1-typography-role-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(generatedRoot, "typography-role-bound-whole-film-board-v1");
const frameRoot = path.join(outputRoot, "frames");
const glyphRoot = path.join(outputRoot, "generated-glyphs");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/typography-role-bound-whole-film-board-v1");
const sourceManifestFile = path.join(generatedRoot, "presenter-light-overlay-system-v2/manifest.json");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const sourceManifest = readJson(sourceManifestFile);
const workspace = readJson(workspaceFile);
const heavyFont = path.join(publicRoot, "a1-editorial-fonts/SourceHanSansCN-Heavy.otf");
const pixelFont = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const fontBindings = {
  heavy: {assetId: "type-editorial-heavy", family: "A1 Source Han Heavy", file: heavyFont, sha256: sha256(fs.readFileSync(heavyFont))},
  pixel: {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", file: pixelFont, sha256: sha256(fs.readFileSync(pixelFont))},
};
const exactHeroCopy = {
  "ED-01": "智能写作工作台", "ED-07": "直接写完全文？", "ED-09": "中文，却看不懂", "ED-10": "完成度很高的废稿",
  "ED-19": "Codex 在后台", "ED-31": "可控的工作流", "ED-34": "真正写出自己的风格",
};
const presenterBases = {
  "ED-07": "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-07.jpg",
  "ED-19": "/generated/system-line/editorial-asset-workbench-v1/video-packaging-context-v1/ed-19-hold-frame.jpg",
  "ED-31": "/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-31.jpg",
};

fs.mkdirSync(frameRoot, {recursive: true});

function fontPaths({font = "heavy", text, x, baseline, size, fill, anchor = "start"}) {
  return glyphOutlineRunToSvgPaths(buildFontGlyphOutlineRun({fontPath: fontBindings[font].file, text}), {x, baseline, fontSize: size, fill, anchor});
}

async function saveFrame(shotId, pixels) {
  const file = path.join(frameRoot, `${shotId}.png`);
  await sharp(pixels).resize(1920, 1080, {fit: "cover"}).png({compressionLevel: 9}).toFile(file);
  return {file, publicUrl: publicUrl(file), sha256: sha256(fs.readFileSync(file))};
}

async function heroFrame(shotId) {
  if (shotId === "ED-01") return saveFrame(shotId, publicFile("/generated/system-line/editorial-asset-workbench-v1/ed01-masked-eva-imagegen-candidate-v1/ED-01-masked-eva-imagegen-composite.png"));
  if (["ED-09", "ED-10"].includes(shotId)) return saveFrame(shotId, path.join(glyphRoot, `${shotId}.png`));
  const glyph = path.join(glyphRoot, `${shotId}.png`);
  if (shotId === "ED-34") {
    const actor = await sharp(glyph).resize({width: 1560, withoutEnlargement: false}).png().toBuffer();
    const base = await sharp({create: {width: 1920, height: 1080, channels: 4, background: "#15191d"}}).png().toBuffer();
    return saveFrame(shotId, await sharp(base).composite([{input: actor, left: 170, top: 80}]).png().toBuffer());
  }
  const base = await sharp(publicFile(presenterBases[shotId])).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const widths = {"ED-07": 1050, "ED-19": 980, "ED-31": 1000};
  const tops = {"ED-07": 85, "ED-19": 80, "ED-31": 70};
  const actor = await sharp(glyph).resize({width: widths[shotId], withoutEnlargement: false}).png().toBuffer();
  return saveFrame(shotId, await sharp(base).composite([{input: actor, left: 45, top: tops[shotId]}]).png().toBuffer());
}

async function localRoleFrame(shotId, sourceItem) {
  const base = await sharp(publicFile(sourceItem.previewPublicUrl || sourceItem.artifactPublicUrl)).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  let overlay;
  let composites = [];
  if (shotId === "ED-12") {
    overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1040" height="1080" fill="#15191d"/>${fontPaths({text: "我试了", x: 110, baseline: 210, size: 112, fill: "#eef2f3"})}${fontPaths({text: "五个", x: 100, baseline: 850, size: 470, fill: "#eef2f3"})}${fontPaths({font: "pixel", text: "模型", x: 650, baseline: 910, size: 230, fill: "#2452ff"})}</svg>`);
  } else if (shotId === "ED-14") {
    overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="1330" width="590" height="1080" fill="#eef2f3"/><rect x="1330" width="8" height="1080" fill="#2452ff"/>${fontPaths({text: "句法多样性下降", x: 1400, baseline: 290, size: 58, fill: "#15191d"})}${fontPaths({text: "词汇多样性下降", x: 1400, baseline: 520, size: 58, fill: "#2452ff"})}${fontPaths({text: "表达范围可能变窄", x: 1400, baseline: 790, size: 50, fill: "#15191d"})}</svg>`);
  } else if (shotId === "ED-16") {
    overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="170" y="650" width="1580" height="210" fill="#222b30" fill-opacity=".97"/>${fontPaths({text: "材料不够", x: 270, baseline: 770, size: 64, fill: "#eef2f3"})}${fontPaths({text: "角度不清", x: 790, baseline: 770, size: 64, fill: "#6f8cff"})}${fontPaths({font: "pixel", text: "泛泛而谈", x: 1320, baseline: 770, size: 66, fill: "#eef2f3"})}<path d="M270 812H1660" stroke="#6f8cff" stroke-width="3" stroke-dasharray="12 14" opacity=".58"/></svg>`);
  } else {
    overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="190" fill="#eef2f3"/>${fontPaths({text: "先给材料", x: 100, baseline: 125, size: 58, fill: "#15191d"})}${fontPaths({text: "再找角度", x: 690, baseline: 125, size: 58, fill: "#15191d"})}${fontPaths({font: "pixel", text: "最后再让 AI 动笔", x: 1240, baseline: 125, size: 45, fill: "#2452ff"})}</svg>`);
  }
  composites.push({input: overlay, left: 0, top: 0});
  return saveFrame(shotId, await sharp(base).composite(composites).png().toBuffer());
}

const rendered = new Map();
for (const item of sourceManifest.packageItems) {
  const role = exactHeroCopy[item.shotId] ? "HERO_GENERATED_TYPE" : ["ED-12", "ED-14"].includes(item.shotId) ? "FORMAL_COPY" : "PIXEL_DETAIL_TYPE";
  const frame = exactHeroCopy[item.shotId] ? await heroFrame(item.shotId) : await localRoleFrame(item.shotId, item);
  rendered.set(item.shotId, {
    ...structuredClone(item), artifactPublicUrl: frame.publicUrl, previewPublicUrl: frame.publicUrl, artifactSha256: frame.sha256, previewSha256: frame.sha256, compositeSha256: frame.sha256,
    typographyRole: role, typographyMode: role === "HERO_GENERATED_TYPE" ? "IMAGEGEN_EVA_MECHANISM_CJK" : "LOCAL_RENDERER_ROLE_SPLIT",
    copyMode: role === "HERO_GENERATED_TYPE" ? "AGENT_CHARACTER_REVIEW_PASS_USER_CONFIRMATION_REQUIRED" : "EXACT_RENDERER_BOUND",
    generatedGlyphBinding: role === "HERO_GENERATED_TYPE" ? {exactText: exactHeroCopy[item.shotId], sourcePublicUrl: item.shotId === "ED-01" ? "/generated/system-line/editorial-asset-workbench-v1/ed01-masked-eva-imagegen-candidate-v1/ED-01-masked-eva-imagegen-composite.png" : publicUrl(path.join(glyphRoot, `${item.shotId}.png`)), sourceSha256: sha256(fs.readFileSync(item.shotId === "ED-01" ? publicFile("/generated/system-line/editorial-asset-workbench-v1/ed01-masked-eva-imagegen-candidate-v1/ED-01-masked-eva-imagegen-composite.png") : path.join(glyphRoot, `${item.shotId}.png`))), userCharacterConfirmation: "NOT_CONFIRMED"} : null,
    fontBindings: role === "HERO_GENERATED_TYPE" ? [fontBindings.heavy, fontBindings.pixel].map(({file, ...font}) => font) : [fontBindings.heavy, fontBindings.pixel].map(({file, ...font}) => font),
    productionAdmitted: false, userVisualApproval: "NOT_APPROVED",
  });
}

function labelSvg(width, height, item, timeline = false) {
  const title = `${item.shotId} · ${timeline ? item.route : item.typographyRole || item.presentationMode}`;
  const subtitle = timeline ? String(item.sourceText || "").slice(0, 42) : `${item.typographyMode} · ${item.copyMode}`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#090d11"/><rect width="6" height="100%" fill="#ff147f"/><text x="18" y="25" fill="#f1f3f2" font-family="sans-serif" font-size="15" font-weight="700">${title}</text><text x="18" y="49" fill="#9ca9a5" font-family="sans-serif" font-size="11">${subtitle.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</text></svg>`);
}

async function contactSheet(items, {timeline = false, columns = 4, tileWidth = 480, imageHeight = 270, labelHeight = 62} = {}) {
  const tiles = await Promise.all(items.map(async (item) => {
    const file = timeline ? publicFile(item.preview.publicUrl) : publicFile(item.previewPublicUrl);
    const image = await sharp(file).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    return sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 4, background: "#080b0e"}}).composite([{input: image}, {input: labelSvg(tileWidth, labelHeight, item, timeline), top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(items.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * (imageHeight + labelHeight), channels: 4, background: "#050708"}}).composite(tiles.map((input, index) => ({input, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (imageHeight + labelHeight)}))).png({compressionLevel: 9}).toBuffer();
  return {pixels, width: columns * tileWidth, height: rows * (imageHeight + labelHeight), sha256: sha256(pixels)};
}

const packageItems = sourceManifest.packageItems.map((item) => rendered.get(item.shotId));
const timelineItems = sourceManifest.timelineItems.map((item) => {
  const replacement = rendered.get(item.shotId);
  return replacement ? {...structuredClone(item), preview: {publicUrl: replacement.previewPublicUrl, sha256: replacement.previewSha256, provenance: "TYPOGRAPHY_ROLE_BOUND_REVIEW_ONLY"}} : structuredClone(item);
});
const packageBoard = await contactSheet(packageItems);
const timelineBoard = await contactSheet(timelineItems, {timeline: true});
const packageBoardFile = path.join(outputRoot, "whole-film-package-board.png");
const timelineBoardFile = path.join(outputRoot, "whole-film-timeline-board.png");
fs.writeFileSync(packageBoardFile, packageBoard.pixels);
fs.writeFileSync(timelineBoardFile, timelineBoard.pixels);
const manifestBody = {
  contract: "A1TypographyRoleBoundWholeFilmBoard/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_AND_CHARACTER_REVIEW", current: true, reviewOnly: true, productionAdmitted: false, userVisualApproval: "NOT_APPROVED",
  sourceWorkspaceSha256: workspace.workspaceSha256, sourceBoardManifestSha256: sourceManifest.manifestSha256, typographyAuthoritySha256: A1_TYPOGRAPHY_ROLE_AUTHORITY.authoritySha256,
  styleSystem: sourceManifest.styleSystem, semanticTimelinePolicy: sourceManifest.semanticTimelinePolicy, storyboardRevisionSha256: sourceManifest.storyboardRevisionSha256,
  packageItems, timelineItems,
  packageBoard: {publicUrl: publicUrl(packageBoardFile), sha256: packageBoard.sha256, width: packageBoard.width, height: packageBoard.height},
  timelineBoard: {publicUrl: publicUrl(timelineBoardFile), sha256: timelineBoard.sha256, width: timelineBoard.width, height: timelineBoard.height},
  typographyContract: {heroOwner: "IMAGEGEN_EVA_MECHANISM_CJK", formalCopyOwner: "LOCAL_FONTKIT_SOURCE_HAN", pixelDetailOwner: "LOCAL_FONTKIT_FUSION_PIXEL", systemFallbackForbidden: true, perShotRoleRequired: true, heroUserCharacterConfirmationRequired: true},
  boundaries: {assemblyCreated: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}, generatedAt: new Date().toISOString(),
};
const manifest = {...manifestBody, manifestSha256: sha256(manifestBody)};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.mkdirSync(artifactRoot, {recursive: true});
fs.cpSync(outputRoot, artifactRoot, {recursive: true, force: true});
console.log(JSON.stringify({status: manifest.status, contract: manifest.contract, packageCount: packageItems.length, timelineCount: timelineItems.length, packageBoard: manifest.packageBoard, timelineBoard: manifest.timelineBoard, manifestSha256: manifest.manifestSha256, productionAdmitted: false}, null, 2));
