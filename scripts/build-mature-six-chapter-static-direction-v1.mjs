#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const publicRoot = path.join(root, "apps/studio-next/public");
const sourceRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const outputRoot = path.join(sourceRoot, "mature-six-chapter-static-direction-v1");
const frameRoot = path.join(outputRoot, "frames");
const overlayRoot = path.join(outputRoot, "overlays");
const presenterRoot = path.join(outputRoot, "presenter-frames");
const carrierManifestPath = path.join(sourceRoot, "whole-film-carrier-rhythm-static-board-v1/manifest.json");
const mediaReportPath = path.join(sourceRoot, "imported-film-media-v1/film-media-discovery-v1-latest.json");
const workspacePath = path.join(sourceRoot, "workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const coolBackgroundPath = path.join(sourceRoot, "article-asset-background-lane-v1/candidates/background-cool-halftone-quiet-field-v1.png");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const manifestPath = path.join(outputRoot, "manifest.json");
const boardPath = path.join(outputRoot, "whole-film-mature-static-board.png");
const comparisonPath = path.join(outputRoot, "six-shot-before-after.png");
const width = 960;
const height = 540;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const relative = (file) => path.relative(root, file);
const publicUrl = (file) => `/${path.relative(publicRoot, file)}`;
const atomicWriteJson = (file, value) => {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
};
const run = (command, args) => {
  const result = spawnSync(command, args, {encoding: "utf8"});
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed:${result.stderr || result.stdout}`);
};
const resolvePublicUrl = (url) => path.join(publicRoot, String(url).replace(/^\//u, ""));
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

for (const file of [carrierManifestPath, mediaReportPath, workspacePath, phasePath, coolBackgroundPath, ffmpegPath]) {
  if (!fs.existsSync(file)) throw new Error(`mature-static-input-missing:${relative(file)}`);
}
fs.mkdirSync(frameRoot, {recursive: true});
fs.mkdirSync(overlayRoot, {recursive: true});
fs.mkdirSync(presenterRoot, {recursive: true});

const authorityBefore = {workspaceSha256: fileSha256(workspacePath), phaseSha256: fileSha256(phasePath)};
const carrier = JSON.parse(fs.readFileSync(carrierManifestPath, "utf8"));
const mediaReport = JSON.parse(fs.readFileSync(mediaReportPath, "utf8"));
if (carrier.summary?.shotCount !== 34) throw new Error("mature-static-carrier-not-34");
const currentByShotId = new Map(carrier.entries.map((entry) => [entry.shotId, entry]));
const presenterVideoPath = resolvePublicUrl(mediaReport.imported.presenter.publicUrl);
if (fileSha256(presenterVideoPath) !== mediaReport.imported.presenter.sha256) throw new Error("mature-static-presenter-source-sha");

const fontSpecs = {
  editorial: {
    assetId: "type-frex-sans-gb-bold-review",
    family: "Frex Sans GB Bold",
    file: path.join(root, ".codex-artifacts/system-progress-system-line/display-font-scout-v2/fonts/frex-sans-gb-bold.ttf"),
    sha256: "1f9ec1e4ad5f8ca731491a5eec7f4b1bb08ab4c43a3138e90776d3b0bc384055",
  },
  pixel: {
    assetId: "type-boutique-9x9-bold-review",
    family: "BoutiqueBitmap9x9 Bold",
    file: path.join(root, ".codex-artifacts/system-progress-system-line/pixel-font-scout-v3/fonts/boutique-9x9-bold.ttf"),
    sha256: "ba67f9138d43d5bc8ce6f59a74088d44973c99edeeadbebaf9541fc983bcb7ba",
  },
};
const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([key, spec]) => {
  if (!fs.existsSync(spec.file) || fileSha256(spec.file) !== spec.sha256) throw new Error(`mature-static-font-invalid:${key}`);
  return [key, {...spec, font: fontkit.create(fs.readFileSync(spec.file))}];
}));

const palette = {ink: "#10161a", paper: "#eef1ef", blue: "#84a4ff", cobalt: "#2853f5", muted: "#68737a"};

function glyphLine({id, fontKey, text, x, y, size, tracking = 0, scaleX = 1, fill, role}) {
  const fontSpec = fonts[fontKey];
  const scale = size / fontSpec.font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const character of [...text]) {
    const run = fontSpec.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`mature-static-missing-glyph:${fontSpec.family}:${character}`);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    glyphIds.push(glyph.id);
    const box = glyph.bbox;
    if (box && box.maxX > box.minX && box.maxY > box.minY) {
      minX = Math.min(minX, cursor + box.minX * scale * scaleX);
      maxX = Math.max(maxX, cursor + box.maxX * scale * scaleX);
      minY = Math.min(minY, y - box.maxY * scale);
      maxY = Math.max(maxY, y - box.minY * scale);
    }
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  return {
    markup: `<g fill="${fill}">${paths.join("")}</g>`,
    spec: {
      id,
      text,
      role,
      fontAssetId: fontSpec.assetId,
      fontFamily: fontSpec.family,
      fontSha256: fontSpec.sha256,
      geometry: {x, y, size, tracking, scaleX},
      bounds: {x: Number(minX.toFixed(2)), y: Number(minY.toFixed(2)), width: Number((maxX - minX).toFixed(2)), height: Number((maxY - minY).toFixed(2))},
      glyphIds,
      editable: true,
      generated: false,
    },
  };
}

const svg = (body, svgWidth = width, svgHeight = height) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">${body}</svg>`);
const darkTexture = await sharp(coolBackgroundPath).resize(width, height, {fit: "cover"}).grayscale().negate().tint("#111922").modulate({brightness: 0.78}).png().toBuffer();
const lightTexture = await sharp(coolBackgroundPath).resize(width, height, {fit: "cover"}).modulate({brightness: 1.05, saturation: 0.36}).png().toBuffer();
const lightTextureReverse = await sharp(coolBackgroundPath).resize(width, height, {fit: "cover"}).rotate(180).modulate({brightness: 1.02, saturation: 0.48}).png().toBuffer();

const presenterBindings = new Map();
for (const shotId of ["ED-13", "ED-19", "ED-31"]) {
  const entry = currentByShotId.get(shotId);
  const atMs = Math.round((entry.timeRange.startMs + entry.timeRange.endMs) / 2);
  const rawFile = path.join(presenterRoot, `${shotId}-raw.png`);
  run(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", "-ss", (atMs / 1000).toFixed(3), "-i", presenterVideoPath, "-frames:v", "1", "-vf", "scale=960:540:force_original_aspect_ratio=increase,crop=960:540", rawFile]);
  const base = await sharp(rawFile).modulate({brightness: shotId === "ED-13" ? 0.72 : 0.78, saturation: 0.74}).png().toBuffer();
  presenterBindings.set(shotId, {atMs, rawFile, rawSha256: fileSha256(rawFile), base});
}

const frameSpecs = [
  {
    shotId: "ED-08",
    topologyId: "ASYMMETRIC_DARK_VERDICT_WITH_PIXEL_FINAL_WORD",
    mode: "FULLSCREEN_TYPOGRAPHY",
    semanticJob: "AI 的问题不是不顺，而是不像人说话",
    base: darkTexture,
    geometry: "",
    semanticGeometry: [],
    nodes: [
      glyphLine({id: "premise", fontKey: "editorial", text: "AI 常常", x: 58, y: 86, size: 38, tracking: 1, fill: palette.blue, role: "editorial-premise"}),
      glyphLine({id: "verdict", fontKey: "editorial", text: "不说", x: 58, y: 275, size: 126, tracking: 0, fill: palette.paper, role: "editorial-verdict"}),
      glyphLine({id: "pixel-word", fontKey: "pixel", text: "人话", x: 525, y: 380, size: 168, tracking: 3, fill: palette.cobalt, role: "pixel-signature-keyword"}),
    ],
  },
  {
    shotId: "ED-13",
    topologyId: "PRESENTER_CENTER_TWO_SIDED_UNRESOLVED_CONTRAST",
    mode: "PRESENTER_OVERLAY",
    semanticJob: "国产模型中文更顺，但核心问题仍未解决",
    base: presenterBindings.get("ED-13").base,
    geometry: "",
    semanticGeometry: [],
    nodes: [
      glyphLine({id: "improvement", fontKey: "editorial", text: "中文确实顺了一些", x: 38, y: 74, size: 34, tracking: 0, fill: palette.blue, role: "qualified-improvement"}),
      glyphLine({id: "contrast", fontKey: "editorial", text: "但问题", x: 640, y: 92, size: 30, tracking: 0, fill: palette.paper, role: "editorial-contrast"}),
      glyphLine({id: "unresolved", fontKey: "pixel", text: "没解决", x: 620, y: 210, size: 90, tracking: 2, fill: palette.paper, role: "pixel-signature-keyword"}),
    ],
  },
  {
    shotId: "ED-17",
    topologyId: "THREE_COLUMN_METHOD_SEQUENCE",
    mode: "FULLSCREEN_PROCESS_EXPLAINER",
    semanticJob: "材料、角度、动笔是一条有先后关系的方法链",
    base: lightTexture,
    geometry: `<rect x="38" y="68" width="270" height="388" rx="2" fill="#f2f1ed" fill-opacity="0.62"/><rect x="345" y="68" width="270" height="388" rx="2" fill="#e8ecf6" fill-opacity="0.72"/><rect x="652" y="68" width="270" height="388" rx="2" fill="#dfe6fb" fill-opacity="0.82"/>`,
    semanticGeometry: [
      {id: "stage-material", role: "METHOD_STAGE_FIELD", attachedToTextIds: ["material-number", "material-prefix", "material"]},
      {id: "stage-angle", role: "METHOD_STAGE_FIELD", attachedToTextIds: ["angle-number", "angle-prefix", "angle"]},
      {id: "stage-write", role: "METHOD_STAGE_FIELD", attachedToTextIds: ["write-number", "last", "write"]},
    ],
    nodes: [
      glyphLine({id: "material-number", fontKey: "editorial", text: "01", x: 66, y: 126, size: 30, tracking: 2, fill: palette.blue, role: "method-stage-number"}),
      glyphLine({id: "material-prefix", fontKey: "editorial", text: "先给", x: 66, y: 226, size: 48, tracking: 0, fill: palette.ink, role: "method-stage-prefix"}),
      glyphLine({id: "material", fontKey: "editorial", text: "材料", x: 66, y: 322, size: 76, tracking: 0, fill: palette.ink, role: "method-stage-1"}),
      glyphLine({id: "angle-number", fontKey: "editorial", text: "02", x: 373, y: 126, size: 30, tracking: 2, fill: palette.blue, role: "method-stage-number"}),
      glyphLine({id: "angle-prefix", fontKey: "editorial", text: "再找", x: 373, y: 226, size: 48, tracking: 0, fill: palette.ink, role: "method-stage-prefix"}),
      glyphLine({id: "angle", fontKey: "editorial", text: "角度", x: 373, y: 322, size: 76, tracking: 0, fill: palette.cobalt, role: "method-stage-2"}),
      glyphLine({id: "write-number", fontKey: "editorial", text: "03", x: 680, y: 126, size: 30, tracking: 2, fill: palette.blue, role: "method-stage-number"}),
      glyphLine({id: "last", fontKey: "editorial", text: "最后", x: 680, y: 226, size: 48, tracking: 0, fill: palette.ink, role: "method-stage-3-prefix"}),
      glyphLine({id: "write", fontKey: "pixel", text: "动笔", x: 680, y: 334, size: 84, tracking: 2, fill: palette.cobalt, role: "pixel-signature-keyword"}),
    ],
  },
  {
    shotId: "ED-19",
    topologyId: "PRESENTER_LEFT_BACKSTAGE_PROCESS_LOCKUP",
    mode: "PRESENTER_PROCESS_OVERLAY",
    semanticJob: "Codex 承担后台编排，而不是替作者直接写完",
    base: presenterBindings.get("ED-19").base,
    geometry: "",
    semanticGeometry: [],
    nodes: [
      glyphLine({id: "actor", fontKey: "editorial", text: "Codex", x: 36, y: 62, size: 34, tracking: 1, fill: palette.blue, role: "process-actor"}),
      glyphLine({id: "location", fontKey: "editorial", text: "后台", x: 36, y: 146, size: 68, tracking: 0, fill: palette.paper, role: "process-location"}),
      glyphLine({id: "action", fontKey: "pixel", text: "编排", x: 262, y: 157, size: 78, tracking: 2, fill: palette.paper, role: "pixel-signature-keyword"}),
      glyphLine({id: "scope", fontKey: "editorial", text: "整理主线 · 读取偏好 · 检查收稿", x: 38, y: 205, size: 22, tracking: 0, fill: palette.blue, role: "process-scope"}),
    ],
  },
  {
    shotId: "ED-31",
    topologyId: "PRESENTER_RIGHT_CONCLUSION_STACK",
    mode: "PRESENTER_CONCLUSION_OVERLAY",
    semanticJob: "把真实写作不便转化成一套可控工作流",
    base: presenterBindings.get("ED-31").base,
    geometry: "",
    semanticGeometry: [],
    nodes: [
      glyphLine({id: "friction", fontKey: "editorial", text: "把不方便", x: 620, y: 80, size: 34, tracking: 0, fill: palette.blue, role: "source-friction"}),
      glyphLine({id: "transform", fontKey: "editorial", text: "变成", x: 620, y: 160, size: 64, tracking: 0, fill: palette.paper, role: "semantic-transform"}),
      glyphLine({id: "control", fontKey: "pixel", text: "可控", x: 615, y: 285, size: 88, tracking: 2, fill: palette.paper, role: "pixel-signature-keyword"}),
      glyphLine({id: "workflow", fontKey: "editorial", text: "工作流", x: 765, y: 280, size: 45, tracking: 0, fill: palette.blue, role: "result-object"}),
    ],
  },
  {
    shotId: "ED-34",
    topologyId: "LIGHT_EDITORIAL_CONCLUSION_WITH_PIXEL_DESTINATION",
    mode: "FULLSCREEN_CONCLUSION_TYPOGRAPHY",
    semanticJob: "长期偏好决定方向，最终写出作者自己的风格",
    base: lightTextureReverse,
    geometry: "",
    semanticGeometry: [],
    nodes: [
      glyphLine({id: "direction", fontKey: "editorial", text: "偏好决定方向", x: 58, y: 82, size: 40, tracking: 0, fill: palette.ink, role: "direction-premise"}),
      glyphLine({id: "write", fontKey: "editorial", text: "真正写出", x: 58, y: 205, size: 74, tracking: 0, fill: palette.cobalt, role: "conclusion-action"}),
      glyphLine({id: "own", fontKey: "editorial", text: "自己的", x: 58, y: 392, size: 116, tracking: 0, fill: palette.ink, role: "authorship"}),
      glyphLine({id: "style", fontKey: "pixel", text: "风格", x: 590, y: 430, size: 140, tracking: 3, fill: palette.cobalt, role: "pixel-signature-keyword"}),
    ],
  },
];

const targetByShotId = new Map();
for (const spec of frameSpecs) {
  const overlay = await sharp(svg(`${spec.geometry}${spec.nodes.map((node) => node.markup).join("")}`)).png().toBuffer();
  const frame = await sharp(spec.base).composite([{input: overlay}]).png({compressionLevel: 9}).toBuffer();
  const frameFile = path.join(frameRoot, `${spec.shotId}.png`);
  const overlayFile = path.join(overlayRoot, `${spec.shotId}.png`);
  fs.writeFileSync(frameFile, frame);
  fs.writeFileSync(overlayFile, overlay);
  const pixelCharacterCount = spec.nodes.filter((node) => node.spec.fontAssetId === fonts.pixel.assetId).reduce((sum, node) => sum + [...node.spec.text.replaceAll(" ", "")].length, 0);
  const totalCharacterCount = spec.nodes.reduce((sum, node) => sum + [...node.spec.text.replaceAll(" ", "")].length, 0);
  targetByShotId.set(spec.shotId, {
    shotId: spec.shotId,
    topologyId: spec.topologyId,
    mode: spec.mode,
    semanticJob: spec.semanticJob,
    frame: {path: relative(frameFile), publicUrl: publicUrl(frameFile), sha256: sha256(frame), width, height},
    overlay: {path: relative(overlayFile), publicUrl: publicUrl(overlayFile), sha256: sha256(overlay), transparent: true},
    textNodes: spec.nodes.map((node) => node.spec),
    semanticGeometry: spec.semanticGeometry,
    typographyMetrics: {pixelCharacterCount, totalCharacterCount, pixelCharacterRatio: Number((pixelCharacterCount / totalCharacterCount).toFixed(4))},
    presenterBinding: presenterBindings.has(spec.shotId) ? {
      atMs: presenterBindings.get(spec.shotId).atMs,
      rawFramePath: relative(presenterBindings.get(spec.shotId).rawFile),
      rawFrameSha256: presenterBindings.get(spec.shotId).rawSha256,
      presenterVideoSha256: mediaReport.imported.presenter.sha256,
      faceRegenerated: false,
    } : null,
  });
}

const chapters = [
  {chapterId: "CH-01", title: "工具身份与快速能力", shotIds: ["ED-01", "ED-02", "ED-03", "ED-04", "ED-05", "ED-06"], visualPromise: "人物身份建立后进入连续真实操作，不把每个功能做成独立海报。"},
  {chapterId: "CH-02", title: "为什么 AI 写作不好读", shotIds: ["ED-07", "ED-08", "ED-09", "ED-10"], visualPromise: "提问、判断、阅读断裂图解、人物停顿形成一次完整论证。"},
  {chapterId: "CH-03", title: "模型问题还是输入问题", shotIds: ["ED-11", "ED-12", "ED-13", "ED-14", "ED-15", "ED-16"], visualPromise: "模型试用、真实研究证据和因果解释逐步收紧，不靠连续标题替代论证。"},
  {chapterId: "CH-04", title: "材料、角度与流程方法", shotIds: ["ED-17", "ED-18", "ED-19"], visualPromise: "把全片核心方法升格为连续过程解释，再回到作者的后台编排。"},
  {chapterId: "CH-05", title: "完整工作台实操", shotIds: ["ED-20", "ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"], visualPromise: "一个连续产品演示章节内部切换操作状态，不把 11 个字幕 beat 误当 11 张独立海报。"},
  {chapterId: "CH-06", title: "局限、可控与个人风格", shotIds: ["ED-31", "ED-32", "ED-33", "ED-34"], visualPromise: "人物承认局限后收束到可控工作流，并以不同于问题判断的明亮片尾结束。"},
];
const chapterByShotId = new Map(chapters.flatMap((chapter) => chapter.shotIds.map((shotId) => [shotId, chapter])));

const dHash = async (file) => {
  const pixels = await sharp(file).grayscale().resize(9, 8, {fit: "fill"}).raw().toBuffer();
  let value = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) value = (value << 1n) | BigInt(pixels[y * 9 + x] > pixels[y * 9 + x + 1] ? 1 : 0);
  return value.toString(16).padStart(16, "0");
};
const hamming = (left, right) => {
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value > 0n) { count += Number(value & 1n); value >>= 1n; }
  return count;
};

const entries = [];
for (const current of carrier.entries) {
  const target = targetByShotId.get(current.shotId);
  const frame = target?.frame || current.frame;
  const file = path.join(root, frame.path);
  const stats = await sharp(file).stats();
  const means = stats.channels.slice(0, 3).map((channel) => channel.mean);
  const luminance = Number((0.2126 * means[0] + 0.7152 * means[1] + 0.0722 * means[2]).toFixed(2));
  entries.push({
    ...current,
    chapterId: chapterByShotId.get(current.shotId).chapterId,
    chapterTitle: chapterByShotId.get(current.shotId).title,
    frameOrigin: target ? "MATURE_SIX_CHAPTER_REPAIR_V1" : current.frameOrigin,
    frame,
    matureRepair: target || null,
    pixelMetrics: {luminance, luminanceBucket: luminance < 85 ? "DARK" : luminance > 175 ? "LIGHT" : "MID", dHash: await dHash(file)},
  });
}

const duplicatePairs = [];
for (let left = 0; left < entries.length; left += 1) for (let right = left + 1; right < entries.length; right += 1) {
  const distance = hamming(entries[left].pixelMetrics.dHash, entries[right].pixelMetrics.dHash);
  if (distance <= 4) duplicatePairs.push({leftShotId: entries[left].shotId, rightShotId: entries[right].shotId, distance});
}
const luminanceRuns = [];
for (const entry of entries) {
  const previous = luminanceRuns.at(-1);
  if (previous?.bucket === entry.pixelMetrics.luminanceBucket) previous.shotIds.push(entry.shotId);
  else luminanceRuns.push({bucket: entry.pixelMetrics.luminanceBucket, shotIds: [entry.shotId]});
}

const tileWidth = 480;
const imageHeight = 270;
const labelHeight = 58;
const columns = 4;
const boardComposites = [];
for (const [index, entry] of entries.entries()) {
  const image = await sharp(path.join(root, entry.frame.path)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
  const label = svg(`<rect width="480" height="58" fill="#0b0e10"/><rect width="5" height="58" fill="${entry.frameOrigin === "MATURE_SIX_CHAPTER_REPAIR_V1" ? "#dfff68" : "#315dff"}"/><text x="16" y="20" fill="#f2efe4" font-size="14" font-weight="700" font-family="monospace">${entry.shotId} · ${escapeXml(entry.chapterId)} · ${(entry.timeRange.startMs / 1000).toFixed(1)}–${(entry.timeRange.endMs / 1000).toFixed(1)}s</text><text x="16" y="41" fill="#8ea0ff" font-size="10" font-family="monospace">${escapeXml(entry.candidateCarrier)}</text>`, 480, 58);
  const tile = await sharp({create: {width: tileWidth, height: imageHeight + labelHeight, channels: 3, background: "#0b0e10"}}).composite([{input: image, top: 0, left: 0}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  boardComposites.push({input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (imageHeight + labelHeight)});
}
const rows = Math.ceil(entries.length / columns);
await sharp({create: {width: columns * tileWidth, height: rows * (imageHeight + labelHeight), channels: 3, background: "#0b0e10"}}).composite(boardComposites).png().toFile(boardPath);

const compareRowHeight = 328;
const compareComposites = [];
for (const [index, spec] of frameSpecs.entries()) {
  const before = await sharp(path.join(root, currentByShotId.get(spec.shotId).frame.path)).resize(480, 270, {fit: "cover"}).png().toBuffer();
  const after = await sharp(path.join(root, targetByShotId.get(spec.shotId).frame.path)).resize(480, 270, {fit: "cover"}).png().toBuffer();
  const label = svg(`<rect width="960" height="58" fill="#0b0e10"/><text x="16" y="22" fill="#dfff68" font-size="15" font-weight="700" font-family="monospace">${spec.shotId} · ${escapeXml(spec.semanticJob)}</text><text x="16" y="43" fill="#8ea0ff" font-size="10" font-family="monospace">BEFORE</text><text x="496" y="43" fill="#8ea0ff" font-size="10" font-family="monospace">MATURE CANDIDATE · ${escapeXml(spec.mode)}</text>`, 960, 58);
  compareComposites.push({input: before, left: 0, top: index * compareRowHeight});
  compareComposites.push({input: after, left: 480, top: index * compareRowHeight});
  compareComposites.push({input: label, left: 0, top: index * compareRowHeight + 270});
}
await sharp({create: {width: 960, height: frameSpecs.length * compareRowHeight, channels: 3, background: "#0b0e10"}}).composite(compareComposites).png().toFile(comparisonPath);

const repaired = [...targetByShotId.values()];
const typography = {
  editorialFont: {assetId: fonts.editorial.assetId, family: fonts.editorial.family, file: relative(fonts.editorial.file), sha256: fonts.editorial.sha256},
  pixelSignatureFont: {assetId: fonts.pixel.assetId, family: fonts.pixel.family, file: relative(fonts.pixel.file), sha256: fonts.pixel.sha256},
  sourceHanUsed: false,
  mainRule: "EDITORIAL_PRIMARY_PIXEL_KEYWORD_ONLY",
  maximumPixelCharactersPerFrame: Math.max(...repaired.map((item) => item.typographyMetrics.pixelCharacterCount)),
  aggregatePixelCharacterRatio: Number((repaired.reduce((sum, item) => sum + item.typographyMetrics.pixelCharacterCount, 0) / repaired.reduce((sum, item) => sum + item.typographyMetrics.totalCharacterCount, 0)).toFixed(4)),
  standaloneDecorativeLineCount: 0,
};
const authorityAfter = {workspaceSha256: fileSha256(workspacePath), phaseSha256: fileSha256(phasePath)};
if (JSON.stringify(authorityBefore) !== JSON.stringify(authorityAfter)) throw new Error("mature-static-current-authority-mutated");
const manifestBody = {
  contract: "A1MatureSixChapterStaticDirection/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW_CANDIDATE_ONLY",
  sourceBindings: {
    workspace: {path: relative(workspacePath), sha256: authorityBefore.workspaceSha256},
    phase: {path: relative(phasePath), sha256: authorityBefore.phaseSha256},
    carrierBoard: {path: relative(carrierManifestPath), sha256: fileSha256(carrierManifestPath), boardSha256: carrier.output.sha256},
    presenterVideo: {path: relative(presenterVideoPath), sha256: mediaReport.imported.presenter.sha256},
    coolBackground: {path: relative(coolBackgroundPath), sha256: fileSha256(coolBackgroundPath)},
  },
  chapters: chapters.map((chapter) => {
    const first = currentByShotId.get(chapter.shotIds[0]);
    const last = currentByShotId.get(chapter.shotIds.at(-1));
    return {...chapter, timeRange: {startMs: first.timeRange.startMs, endMs: last.timeRange.endMs, durationMs: last.timeRange.endMs - first.timeRange.startMs}};
  }),
  typography,
  repairedShotIds: frameSpecs.map((spec) => spec.shotId),
  repairedFrames: repaired,
  entries,
  outputs: {
    board: {path: relative(boardPath), publicUrl: publicUrl(boardPath), sha256: fileSha256(boardPath), width: columns * tileWidth, height: rows * (imageHeight + labelHeight)},
    comparison: {path: relative(comparisonPath), publicUrl: publicUrl(comparisonPath), sha256: fileSha256(comparisonPath), width: 960, height: frameSpecs.length * compareRowHeight},
  },
  summary: {
    shotCount: entries.length,
    chapterCount: chapters.length,
    repairedShotCount: repaired.length,
    longestSameLuminanceBucketRun: Math.max(...luminanceRuns.map((run) => run.shotIds.length)),
    nearDuplicatePairCount: duplicatePairs.length,
    uniqueRepairTopologyCount: new Set(repaired.map((item) => item.topologyId)).size,
  },
  luminanceRuns,
  duplicatePairs,
  checks: {
    exactThirtyFourShotOrder: entries.every((entry, index) => entry.shotId === `ED-${String(index + 1).padStart(2, "0")}`),
    sixSemanticChaptersCoverAllShotsOnce: new Set(chapters.flatMap((chapter) => chapter.shotIds)).size === 34,
    sixTargetedRepairsPresent: repaired.length === 6,
    sixDistinctRepairTopologies: new Set(repaired.map((item) => item.topologyId)).size === 6,
    editorialPrimaryPixelKeywordOnly: repaired.every((item) => item.textNodes.filter((node) => node.fontAssetId === fonts.pixel.assetId).every((node) => [...node.text.replaceAll(" ", "")].length <= 3)),
    noSourceHan: repaired.flatMap((item) => item.textNodes).every((node) => !/source han/u.test(node.fontFamily)),
    noStandaloneDecorativeLines: typography.standaloneDecorativeLineCount === 0,
    formalTextRendererBound: true,
    generatedFormalTextAdded: false,
    imageGenUsed: false,
    motionProduced: false,
    currentAuthorityMutated: false,
  },
  visualReviewBoundary: {
    actualPixelReviewRequired: true,
    machineMetricsDoNotEqualTasteApproval: true,
    presenterFaceAndMicrophoneGeometryReviewRequired: true,
  },
  boundary: {candidateOnly: true, canonicalSelectionMutated: false, productionAdmission: false, currentAuthorityMutated: false, motionProduced: false, resolveWritten: false, finalRender: false, userVisualApproval: "NOT_APPROVED"},
};
const manifest = {...manifestBody, manifestSha256: sha256(Buffer.from(JSON.stringify(manifestBody)))};
atomicWriteJson(manifestPath, manifest);
console.log(JSON.stringify({status: manifest.status, repairedShotIds: manifest.repairedShotIds, typography, summary: manifest.summary, outputs: manifest.outputs, currentAuthorityMutated: false, userVisualApproval: "NOT_APPROVED"}, null, 2));
