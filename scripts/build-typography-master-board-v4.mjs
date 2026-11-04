#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v4");
const frameRoot = path.join(outputRoot, "frames");
const baseRoot = path.join(outputRoot, "bases");
const briefRoot = path.join(root, "work/style-research/typography-master-board-v4/briefs");
const publicRoot = path.join(root, "apps/studio-next/public");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const appFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const palette = {
  ink: "#101315",
  coolWhite: "#eef2f3",
  blue: "#2452ff",
  acid: "#dfff68",
  charcoal: "#16191c",
  paleBlue: "#b8c9ff",
};

const fontSpecs = {
  pixel: {
    assetId: "type-pixel-correction",
    family: "A1 Fusion Pixel",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf"),
    expectedSha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32",
  },
  slanted: {
    assetId: "type-slanted-display",
    family: "A1 Smiley Sans",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/font-cache/SmileySans-Oblique.otf"),
    expectedSha256: "93d1dac7c3752acce1b959d6e7460eb88c4acb325cc9e9f5f42e61c29216a758",
  },
};

const sourceSpecs = {
  document: {
    assetId: "source-documentary-document-surface",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/source-cache/document-surface.png"),
    expectedSha256: "a7410a5a460375f048a40990f9b0896dc036221e05d4ac2794fec8eae5307ac9",
    evidenceBoundary: "real article document surface; visible only inside renderer-bound glyph mask",
  },
  selection: {
    assetId: "source-documentary-selection-action",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/source-cache/causal-writing-workbench-v1/03-real-candidates.png"),
    expectedSha256: "c406df93ca29ef1c57c5ba5fcca6ef9eea9b93bc97f86ec0d43a961955486ed5",
    evidenceBoundary: "real deterministic selection surface supporting the stated model roles; not presented as live remote-model evidence",
  },
};

const backgroundSpecs = {
  light: {
    assetId: "background-cool-halftone-quiet-field-v1",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-cool-halftone-quiet-field-v1.png"),
    expectedSha256: "42cac181ab6f5ee545353f319222e97ee93c0450a03b804d0181456b6915a5eb",
  },
  dark: {
    assetId: "background-charcoal-contour-quiet-field-v1",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-charcoal-contour-quiet-field-v1.png"),
    expectedSha256: "4c79e95c8b6a458cc709cd0544faf213add376edc5e4edddc4287cdb395b91b9",
  },
};

function bindFile(spec, label) {
  if (!fs.existsSync(spec.file)) throw new Error(`${label}-missing:${spec.file}`);
  const actualSha256 = fileSha256(spec.file);
  if (actualSha256 !== spec.expectedSha256) throw new Error(`${label}-sha-mismatch:${actualSha256}`);
  return {...spec, actualSha256};
}

const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([key, spec]) => {
  const bound = bindFile(spec, `font-${key}`);
  const bytes = fs.readFileSync(bound.file);
  return [key, {...bound, bytes, font: fontkit.create(bytes)}];
}));
const sources = Object.fromEntries(Object.entries(sourceSpecs).map(([key, spec]) => [key, bindFile(spec, `source-${key}`)]));
const backgrounds = Object.fromEntries(Object.entries(backgroundSpecs).map(([key, spec]) => [key, bindFile(spec, `background-${key}`)]));

const briefFiles = [
  "01-glyph-monument.json",
  "02-semantic-fracture.json",
  "03-source-cut-through.json",
  "04-script-collision.json",
];
const briefs = briefFiles.map((file) => ({file: path.join(briefRoot, file), value: readJson(path.join(briefRoot, file))}));
for (const {file, value} of briefs) {
  if (value.contract !== "A1RetroPixelEditorialStyleBrief/v1") throw new Error(`style-brief-contract-invalid:${file}`);
  const variation = value.variation || {};
  const expected = [variation.primaryFamily, variation.surfaceLogic, variation.dominantActor, variation.composition, variation.palette].join("|");
  if (value.fingerprint !== expected) throw new Error(`style-brief-fingerprint-invalid:${file}`);
}

function glyphLine({id, fontKey, text, x, y, size, tracking = 0, scaleX = 1, color, role, language, contrastClass = "large", deliberateCrop = false, renderMode = "solid", dominant = false}) {
  const fontSpec = fonts[fontKey];
  const font = fontSpec.font;
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`missing-glyph:${fontSpec.family}:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    const bbox = glyph.bbox;
    if (bbox && bbox.maxX > bbox.minX && bbox.maxY > bbox.minY) {
      minX = Math.min(minX, cursor + bbox.minX * scale * scaleX);
      maxX = Math.max(maxX, cursor + bbox.maxX * scale * scaleX);
      minY = Math.min(minY, y - bbox.maxY * scale);
      maxY = Math.max(maxY, y - bbox.minY * scale);
    }
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  const bounds = Number.isFinite(minX)
    ? {x: Number(minX.toFixed(2)), y: Number(minY.toFixed(2)), width: Number((maxX - minX).toFixed(2)), height: Number((maxY - minY).toFixed(2))}
    : {x, y: y - size, width: Math.max(0, cursor - x), height: size};
  return {
    markup: `<g fill="${color}">${paths.join("")}</g>`,
    spec: {
      id,
      text,
      role,
      language,
      fontAssetId: fontSpec.assetId,
      fontFamily: fontSpec.family,
      fontSha256: fontSpec.actualSha256,
      geometry: {x, y, size, tracking, scaleX},
      bounds,
      color,
      contrastClass,
      deliberateCrop,
      renderMode,
      dominant,
      glyphCount: glyphIds.length,
      glyphIds,
      editable: true,
      generated: false,
    },
  };
}

function area(bounds) {
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

function hierarchy(nodes) {
  const entries = nodes.map((node) => ({id: node.spec.id, area: area(node.spec.bounds), dominant: node.spec.dominant}));
  const total = entries.reduce((sum, item) => sum + item.area, 0);
  const dominantArea = entries.filter((item) => item.dominant).reduce((sum, item) => sum + item.area, 0);
  return {entries, totalArea: total, dominantArea, concentration: Number((dominantArea / total).toFixed(4))};
}

async function svgPixels(markup) {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${markup}</svg>`)).png().toBuffer();
}

async function backgroundPixels(spec) {
  return sharp(spec.file).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
}

async function plainPixels(color) {
  return sharp({create: {width: 1920, height: 1080, channels: 4, background: color}}).png().toBuffer();
}

async function saveBase(id, pixels) {
  const file = path.join(baseRoot, `${id}.png`);
  await sharp(pixels).png({compressionLevel: 9}).toFile(file);
  return file;
}

async function buildFrame01() {
  const id = "01-glyph-monument";
  const basePixels = await plainPixels(palette.coolWhite);
  const nodes = [
    glyphLine({id: "monument-premise", fontKey: "slanted", text: "完成度很高的", x: 118, y: 240, size: 132, tracking: -3, scaleX: .96, color: palette.ink, role: "premise", language: "zh"}),
    glyphLine({id: "monument-verdict", fontKey: "pixel", text: "废稿", x: -92, y: 1082, size: 870, tracking: -40, scaleX: 1.06, color: palette.blue, role: "verdict-monument", language: "zh", deliberateCrop: true, dominant: true}),
  ];
  return renderFrame({
    id,
    label: "字形纪念碑",
    brief: briefs[0],
    basePixels,
    nodes,
    languageMode: "CHINESE_ONLY",
    semanticCopy: "完成度很高的废稿",
    composition: "off-canvas-glyph-monument",
    primaryFamily: "pixel-type-actor",
    interaction: {kind: "deliberate-edge-crop", target: "monument-verdict", necessary: true},
  });
}

async function buildFrame02() {
  const id = "02-semantic-fracture";
  const basePixels = await plainPixels(palette.coolWhite);
  const nodes = [
    glyphLine({id: "fracture-switch", fontKey: "slanted", text: "换了", x: 92, y: 292, size: 258, tracking: -8, scaleX: .96, color: palette.ink, role: "cause-fragment", language: "zh"}),
    glyphLine({id: "fracture-model", fontKey: "slanted", text: "模型", x: 1080, y: 270, size: 238, tracking: -4, scaleX: .98, color: palette.ink, role: "cause-fragment", language: "zh"}),
    glyphLine({id: "fracture-problem", fontKey: "pixel", text: "问题", x: 650, y: 620, size: 210, tracking: -2, scaleX: .94, color: palette.blue, role: "causal-pivot", language: "zh"}),
    glyphLine({id: "fracture-persists", fontKey: "slanted", text: "没有消失", x: -72, y: 1116, size: 392, tracking: -16, scaleX: .96, color: palette.ink, role: "conclusion-monument", language: "zh", deliberateCrop: true, dominant: true}),
  ];
  return renderFrame({
    id,
    label: "语义断裂",
    brief: briefs[1],
    basePixels,
    nodes,
    languageMode: "CHINESE_ONLY",
    semanticCopy: "换了模型，问题没有消失",
    composition: "semantic-fragments-descend-into-cropped-conclusion",
    primaryFamily: "scanline-crt-signal",
    interaction: {kind: "semantic-fracture-and-crop", target: "fracture-persists", necessary: true},
  });
}

async function buildFrame03() {
  const id = "03-source-cut-through";
  const darkPixels = await backgroundPixels(backgrounds.dark);
  const maskNode = glyphLine({id: "source-question-glyph", fontKey: "slanted", text: "问题", x: 24, y: 1050, size: 840, tracking: -24, scaleX: .96, color: "#ffffff", role: "source-window-glyph", language: "zh", deliberateCrop: true, renderMode: "source-mask", dominant: true});
  const maskPixels = await svgPixels(maskNode.markup);
  const sourceField = await sharp(sources.document.file)
    .extract({left: 30, top: 300, width: 820, height: 950})
    .resize(1920, 1080, {fit: "cover", position: "top"})
    .ensureAlpha()
    .png()
    .toBuffer();
  const clippedSource = await sharp(sourceField).composite([{input: maskPixels, blend: "dest-in"}]).png().toBuffer();
  const basePixels = await sharp(darkPixels).composite([{input: clippedSource, left: 0, top: 0}]).png().toBuffer();
  const nodes = [
    maskNode,
    glyphLine({id: "source-premise", fontKey: "pixel", text: "换了模型", x: 1280, y: 220, size: 84, tracking: 0, scaleX: .96, color: palette.coolWhite, role: "premise", language: "zh"}),
    glyphLine({id: "source-conclusion", fontKey: "slanted", text: "没有消失", x: 1320, y: 928, size: 112, tracking: -2, scaleX: .94, color: palette.acid, role: "conclusion", language: "zh"}),
  ];
  return renderFrame({
    id,
    label: "来源穿透",
    brief: briefs[2],
    basePixels,
    nodes,
    overlayNodes: nodes.slice(1),
    languageMode: "CHINESE_PRIMARY_SOURCE_PIXELS",
    semanticCopy: "换了模型，问题没有消失",
    composition: "real-article-pixels-inside-giant-question-glyph",
    primaryFamily: "retro-computer-window",
    interaction: {kind: "verified-source-cut-through", target: "source-question-glyph", necessary: true, maskCoverageRole: "dominant-glyph"},
    sourceBindings: [{
      assetId: sources.document.assetId,
      file: path.relative(root, sources.document.file),
      sha256: sources.document.actualSha256,
      evidenceBoundary: sources.document.evidenceBoundary,
      crop: {left: 30, top: 300, width: 820, height: 950},
      placement: {left: 0, top: 0, width: 1920, height: 1080, maskTextNodeId: "source-question-glyph"},
      visible: true,
    }],
  });
}

async function buildFrame04() {
  const id = "04-script-collision";
  const basePixels = await plainPixels(palette.charcoal);
  const nodes = [
    glyphLine({id: "collision-title", fontKey: "pixel", text: "职责", x: 92, y: 208, size: 132, tracking: -4, scaleX: .94, color: palette.blue, role: "premise", language: "zh"}),
    glyphLine({id: "collision-actor", fontKey: "slanted", text: "拆", x: 500, y: 1060, size: 900, tracking: 0, scaleX: .98, color: palette.coolWhite, role: "dominant-action-glyph", language: "zh", deliberateCrop: true, dominant: true}),
    glyphLine({id: "collision-codex", fontKey: "slanted", text: "Codex", x: 236, y: 492, size: 158, tracking: -1, scaleX: .96, color: palette.acid, role: "proper-noun", language: "en-proper"}),
    glyphLine({id: "collision-codex-role", fontKey: "pixel", text: "整理材料与主线", x: 250, y: 558, size: 42, tracking: 0, scaleX: .94, color: palette.coolWhite, role: "role-description", language: "zh", contrastClass: "body"}),
    glyphLine({id: "collision-kimi", fontKey: "slanted", text: "Kimi", x: 1110, y: 360, size: 146, tracking: -1, scaleX: .96, color: palette.blue, role: "proper-noun", language: "en-proper"}),
    glyphLine({id: "collision-kimi-role", fontKey: "pixel", text: "完成中文初稿", x: 1350, y: 425, size: 42, tracking: 0, scaleX: .94, color: palette.coolWhite, role: "role-description", language: "zh", contrastClass: "body"}),
    glyphLine({id: "collision-deepseek", fontKey: "slanted", text: "DeepSeek", x: 1130, y: 842, size: 142, tracking: -1, scaleX: .96, color: palette.acid, role: "proper-noun", language: "en-proper"}),
    glyphLine({id: "collision-deepseek-role", fontKey: "pixel", text: "只改选中的局部", x: 1210, y: 910, size: 42, tracking: 0, scaleX: .94, color: palette.coolWhite, role: "role-description", language: "zh", contrastClass: "body"}),
  ];
  return renderFrame({
    id,
    label: "中英字面碰撞",
    brief: briefs[3],
    basePixels,
    nodes,
    languageMode: "SEMANTIC_SCRIPT_COLLISION",
    semanticCopy: "职责拆开：Codex 整理材料与主线；Kimi 完成中文初稿；DeepSeek 只改选中的局部",
    composition: "proper-nouns-collide-with-one-chinese-action-glyph",
    primaryFamily: "modular-pixel-infographic",
    interaction: {kind: "script-collision", target: "collision-actor", necessary: true, collisionNodeIds: ["collision-codex", "collision-kimi", "collision-deepseek"]},
    allowedLatinTokens: ["Codex", "Kimi", "DeepSeek"],
    sourceBindings: [{
      assetId: sources.selection.assetId,
      file: path.relative(root, sources.selection.file),
      sha256: sources.selection.actualSha256,
      evidenceBoundary: sources.selection.evidenceBoundary,
      visible: false,
      supportsTextNodeIds: ["collision-codex-role", "collision-kimi-role", "collision-deepseek-role"],
    }],
  });
}

async function renderFrame({id, label, brief, basePixels, nodes, overlayNodes = nodes, languageMode, semanticCopy, composition, primaryFamily, interaction, sourceBindings = [], allowedLatinTokens = []}) {
  const baseFile = await saveBase(id, basePixels);
  const overlay = await svgPixels(overlayNodes.map((node) => node.markup).join(""));
  const frameFile = path.join(frameRoot, `${id}.png`);
  await sharp(basePixels).composite([{input: overlay, left: 0, top: 0}]).png({compressionLevel: 9}).toFile(frameFile);
  const metadata = await sharp(frameFile).metadata();
  return {
    id,
    label,
    status: "READY_FOR_OBJECTIVE_AUDIT",
    brief: {file: path.relative(root, brief.file), sha256: fileSha256(brief.file), fingerprint: brief.value.fingerprint},
    primaryFamily,
    composition,
    languageMode,
    semanticCopy,
    allowedLatinTokens,
    interaction,
    hierarchy: hierarchy(nodes),
    frame: {file: path.relative(root, frameFile), sha256: fileSha256(frameFile), width: metadata.width, height: metadata.height, mimeType: "image/png"},
    base: {file: path.relative(root, baseFile), sha256: fileSha256(baseFile)},
    textNodes: nodes.map((node) => node.spec),
    sourceBindings,
    formalOverlay: {renderer: "fontkit-svg-paths-over-sharp", cssUsed: false, htmlUsed: false, decorativeGeometryCount: 0, allowedSvgElements: ["svg", "g", "path"]},
    generatedFormalText: false,
    editableText: true,
    productionAdmitted: false,
  };
}

async function main() {
  fs.mkdirSync(frameRoot, {recursive: true});
  fs.mkdirSync(baseRoot, {recursive: true});
  const frames = [await buildFrame01(), await buildFrame02(), await buildFrame03(), await buildFrame04()];

  const tileWidth = 960;
  const tileHeight = 540;
  const gap = 18;
  const sheetWidth = tileWidth * 2 + gap * 3;
  const sheetHeight = tileHeight * 2 + gap * 3;
  const tileInputs = await Promise.all(frames.map((item) => sharp(path.join(root, item.frame.file)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
  const sheetFile = path.join(outputRoot, "typography-master-board-v4.png");
  await sharp({create: {width: sheetWidth, height: sheetHeight, channels: 4, background: "#090c0e"}})
    .composite(tileInputs.map((input, index) => ({input, left: gap + (index % 2) * (tileWidth + gap), top: gap + Math.floor(index / 2) * (tileHeight + gap)})))
    .png({compressionLevel: 9})
    .toFile(sheetFile);

  const manifestBody = {
    contract: "A1TypographyMasterBoard/v4",
    status: "READY_FOR_OBJECTIVE_AUDIT",
    visualThesis: "一个主字形事件生成画面；次级信息只依附其边缘、字腔、裁切或来源交互。",
    researchBinding: {file: "work/style-research/pinterest-editorial-typography-deep-audit-2026-08-14.md", sha256: fileSha256(path.join(root, "work/style-research/pinterest-editorial-typography-deep-audit-2026-08-14.md"))},
    fontLicenseEvidence: {file: "work/style-research/typography-master-board-v4/font-license-evidence.md", sha256: fileSha256(path.join(root, "work/style-research/typography-master-board-v4/font-license-evidence.md"))},
    supersedesRejectedBoard: ".codex-artifacts/system-progress-system-line/typography-master-board-v3/",
    currentAuthorityUntouched: true,
    productionAdmitted: false,
    userVisualApproval: "NOT_REVIEWED",
    fonts: Object.values(fonts).map((font) => ({assetId: font.assetId, family: font.family, file: path.relative(root, font.file), sha256: font.actualSha256})),
    backgrounds: Object.values(backgrounds).map((background) => ({assetId: background.assetId, file: path.relative(root, background.file), sha256: background.actualSha256})),
    frames,
    reviewSheet: {file: path.relative(root, sheetFile), sha256: fileSha256(sheetFile), width: sheetWidth, height: sheetHeight},
    generatedAt: new Date().toISOString(),
  };
  const manifest = {...manifestBody, manifestSha256: sha256(Buffer.from(JSON.stringify(manifestBody)))};
  const manifestFile = path.join(outputRoot, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: manifest.status, frames: frames.length, reviewSheet: path.relative(root, sheetFile), manifest: path.relative(root, manifestFile), productionAdmitted: false}, null, 2));
}

await main();
