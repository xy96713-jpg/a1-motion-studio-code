#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v3");
const frameRoot = path.join(outputRoot, "frames");
const baseRoot = path.join(outputRoot, "bases");
const briefRoot = path.join(root, "work/style-research/typography-master-board-v3/briefs");
const publicRoot = path.join(root, "apps/studio-next/public");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const appFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const palette = {
  ink: "#101315",
  paper: "#f4f1e9",
  coolWhite: "#eef2f3",
  blue: "#2452ff",
  acid: "#dfff68",
  charcoal: "#16191c",
  coolGray: "#dfe4e8",
};

const fontSpecs = {
  pixel: {
    assetId: "type-pixel-correction",
    family: "A1 Fusion Pixel",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf"),
    expectedSha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32",
  },
  heavy: {
    assetId: "type-editorial-heavy",
    family: "A1 Source Han Heavy",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/font-cache/SourceHanSansCN-Heavy.otf"),
    expectedSha256: "f178cae1188a31e7f5bdb268da9253b32c893aec56e0977118371aaf4cfc90f6",
  },
};

const sourceSpecs = {
  document: {
    assetId: "source-documentary-document-surface",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/source-cache/document-surface.png"),
    expectedSha256: "a7410a5a460375f048a40990f9b0896dc036221e05d4ac2794fec8eae5307ac9",
    evidenceBoundary: "real article document surface; source-bound crop and grade only",
  },
  selection: {
    assetId: "source-documentary-selection-action",
    file: appFile("/generated/system-line/editorial-asset-workbench-v1/source-cache/causal-writing-workbench-v1/03-real-candidates.png"),
    expectedSha256: "c406df93ca29ef1c57c5ba5fcca6ef9eea9b93bc97f86ec0d43a961955486ed5",
    evidenceBoundary: "real product interaction and deterministic local rewrite; not represented as a live remote-model response",
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

function assertBoundFile(spec, label) {
  if (!fs.existsSync(spec.file)) throw new Error(`${label}-missing:${spec.file}`);
  const actualSha256 = fileSha256(spec.file);
  if (actualSha256 !== spec.expectedSha256) throw new Error(`${label}-sha-mismatch:${actualSha256}`);
  return {...spec, actualSha256};
}

const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([key, spec]) => {
  const bound = assertBoundFile(spec, `font-${key}`);
  const bytes = fs.readFileSync(bound.file);
  return [key, {...bound, bytes, font: fontkit.create(bytes)}];
}));
const sources = Object.fromEntries(Object.entries(sourceSpecs).map(([key, spec]) => [key, assertBoundFile(spec, `source-${key}`)]));
const backgrounds = Object.fromEntries(Object.entries(backgroundSpecs).map(([key, spec]) => [key, assertBoundFile(spec, `background-${key}`)]));

const briefFiles = [
  "01-chinese-verdict.json",
  "02-bilingual-parity.json",
  "03-source-led-evidence.json",
  "04-semantic-code-switch.json",
];
const briefs = briefFiles.map((file) => ({file: path.join(briefRoot, file), value: readJson(path.join(briefRoot, file))}));
for (const {file, value} of briefs) {
  if (value.contract !== "A1RetroPixelEditorialStyleBrief/v1") throw new Error(`style-brief-contract-invalid:${file}`);
  const variation = value.variation || {};
  const expected = [variation.primaryFamily, variation.surfaceLogic, variation.dominantActor, variation.composition, variation.palette].join("|");
  if (value.fingerprint !== expected) throw new Error(`style-brief-fingerprint-invalid:${file}`);
}

function glyphLine({id, fontKey, text, x, y, size, tracking = 0, scaleX = 1, color, role, language, contrastClass = "large", deliberateCrop = false}) {
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
      glyphCount: glyphIds.length,
      glyphIds,
      editable: true,
      generated: false,
    },
  };
}

function boundsFor(nodes) {
  const minX = Math.min(...nodes.map((node) => node.spec.bounds.x));
  const minY = Math.min(...nodes.map((node) => node.spec.bounds.y));
  const maxX = Math.max(...nodes.map((node) => node.spec.bounds.x + node.spec.bounds.width));
  const maxY = Math.max(...nodes.map((node) => node.spec.bounds.y + node.spec.bounds.height));
  return {x: minX, y: minY, width: maxX - minX, height: maxY - minY, area: (maxX - minX) * (maxY - minY)};
}

async function saveBase(id, pixels) {
  const file = path.join(baseRoot, `${id}.png`);
  await sharp(pixels).png({compressionLevel: 9}).toFile(file);
  return file;
}

async function baseFromBackground(spec) {
  return sharp(spec.file).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
}

async function buildFrame01() {
  const id = "01-chinese-verdict";
  const basePixels = await baseFromBackground(backgrounds.light);
  const nodes = [
    glyphLine({id: "verdict-premise", fontKey: "heavy", text: "完成度很高的", x: 130, y: 325, size: 178, tracking: -3, scaleX: .96, color: palette.ink, role: "premise", language: "zh"}),
    glyphLine({id: "verdict-object", fontKey: "pixel", text: "废稿", x: 780, y: 780, size: 420, tracking: -12, scaleX: .96, color: palette.blue, role: "verdict", language: "zh"}),
  ];
  return renderFrame({id, label: "中文单语结论", brief: briefs[0], basePixels, nodes, languageMode: "CHINESE_ONLY", semanticCopy: "完成度很高的废稿", sourceBindings: [], composition: "premise-top-left-verdict-lower-right", primaryFamily: "pixel-type-actor"});
}

async function buildFrame02() {
  const id = "02-bilingual-parity";
  const basePixels = await baseFromBackground(backgrounds.dark);
  const nodes = [
    glyphLine({id: "parity-zh-1", fontKey: "heavy", text: "换了不同 AI 模型", x: 120, y: 230, size: 118, tracking: -2, scaleX: .94, color: palette.coolWhite, role: "equal-title-zh", language: "zh-Latn"}),
    glyphLine({id: "parity-zh-2", fontKey: "heavy", text: "文章为什么", x: 120, y: 380, size: 118, tracking: -2, scaleX: .94, color: palette.coolWhite, role: "equal-title-zh", language: "zh"}),
    glyphLine({id: "parity-zh-3", fontKey: "heavy", text: "还是有 AI 味", x: 120, y: 530, size: 118, tracking: -2, scaleX: .94, color: palette.coolWhite, role: "equal-title-zh", language: "zh-Latn"}),
    glyphLine({id: "parity-en-1", fontKey: "heavy", text: "WHY DOES THE WRITING", x: 860, y: 660, size: 76, tracking: 1, scaleX: .9, color: palette.acid, role: "equal-title-en", language: "en"}),
    glyphLine({id: "parity-en-2", fontKey: "heavy", text: "STILL SOUND LIKE AI", x: 860, y: 760, size: 76, tracking: 1, scaleX: .9, color: palette.acid, role: "equal-title-en", language: "en"}),
    glyphLine({id: "parity-en-3", fontKey: "heavy", text: "AFTER SWITCHING MODELS?", x: 860, y: 860, size: 76, tracking: 1, scaleX: .9, color: palette.acid, role: "equal-title-en", language: "en"}),
  ];
  const zhBounds = boundsFor(nodes.slice(0, 3));
  const enBounds = boundsFor(nodes.slice(3));
  return renderFrame({id, label: "中英平权标题", brief: briefs[1], basePixels, nodes, languageMode: "BILINGUAL_PARITY", semanticCopy: "换了不同 AI 模型，文章为什么还是有 AI 味 / WHY DOES THE WRITING STILL SOUND LIKE AI AFTER SWITCHING MODELS?", sourceBindings: [], composition: "opposed-equal-language-masses", primaryFamily: "dithered-editorial-poster", parity: {zhBounds, enBounds, opticalAreaRatio: Number((zhBounds.area / enBounds.area).toFixed(4)), translationReviewed: true}});
}

async function buildFrame03() {
  const id = "03-source-led-evidence";
  const background = await baseFromBackground(backgrounds.light);
  const sourceCrop = await sharp(sources.document.file)
    .extract({left: 30, top: 300, width: 820, height: 950})
    .resize(1040, 900, {fit: "cover", position: "top"})
    .png()
    .toBuffer();
  const basePixels = await sharp(background).composite([{input: sourceCrop, left: 820, top: 90}]).png().toBuffer();
  const nodes = [
    glyphLine({id: "evidence-claim-1", fontKey: "heavy", text: "换了模型", x: 105, y: 300, size: 138, tracking: -2, scaleX: .96, color: palette.ink, role: "judgement", language: "zh"}),
    glyphLine({id: "evidence-claim-2", fontKey: "heavy", text: "问题没有消失", x: 220, y: 540, size: 104, tracking: -2, scaleX: .96, color: palette.blue, role: "judgement", language: "zh"}),
  ];
  return renderFrame({id, label: "中文判断＋真实来源", brief: briefs[2], basePixels, nodes, languageMode: "CHINESE_PRIMARY_SOURCE_LANGUAGE", semanticCopy: "换了模型，问题没有消失", sourceBindings: [{...sources.document, crop: {left: 30, top: 300, width: 820, height: 950}, placement: {left: 820, top: 90, width: 1040, height: 900}, visibleSourceTerms: ["GPT", "Claude", "DeepSeek", "Kimi", "智谱"]}], composition: "judgement-left-source-crop-right", primaryFamily: "retro-computer-window"});
}

async function buildFrame04() {
  const id = "04-semantic-code-switch";
  const sourceCrop = await sharp(sources.selection.file)
    .extract({left: 500, top: 40, width: 1380, height: 1000})
    .resize(1120, 812, {fit: "cover", position: "centre"})
    .png()
    .toBuffer();
  const basePixels = await sharp({create: {width: 1920, height: 1080, channels: 4, background: palette.charcoal}})
    .composite([{input: sourceCrop, left: 55, top: 134}])
    .png()
    .toBuffer();
  const nodes = [
    glyphLine({id: "roles-title", fontKey: "pixel", text: "职责拆开", x: 1250, y: 190, size: 100, tracking: -3, scaleX: .9, color: palette.coolWhite, role: "explainer-title", language: "zh"}),
    glyphLine({id: "role-codex-name", fontKey: "heavy", text: "Codex", x: 1250, y: 360, size: 64, tracking: 0, scaleX: .96, color: palette.acid, role: "proper-noun", language: "en-proper"}),
    glyphLine({id: "role-codex-job", fontKey: "heavy", text: "整理材料与主线", x: 1250, y: 425, size: 38, tracking: 0, scaleX: .96, color: palette.coolWhite, role: "role-description", language: "zh", contrastClass: "body"}),
    glyphLine({id: "role-kimi-name", fontKey: "heavy", text: "Kimi", x: 1250, y: 570, size: 64, tracking: 0, scaleX: .96, color: palette.acid, role: "proper-noun", language: "en-proper"}),
    glyphLine({id: "role-kimi-job", fontKey: "heavy", text: "完成中文初稿", x: 1250, y: 635, size: 38, tracking: 0, scaleX: .96, color: palette.coolWhite, role: "role-description", language: "zh", contrastClass: "body"}),
    glyphLine({id: "role-deepseek-name", fontKey: "heavy", text: "DeepSeek", x: 1250, y: 780, size: 64, tracking: 0, scaleX: .96, color: palette.acid, role: "proper-noun", language: "en-proper"}),
    glyphLine({id: "role-deepseek-job", fontKey: "heavy", text: "只改选中的局部", x: 1250, y: 845, size: 38, tracking: 0, scaleX: .96, color: palette.coolWhite, role: "role-description", language: "zh", contrastClass: "body"}),
  ];
  return renderFrame({id, label: "真实操作＋语义混排", brief: briefs[3], basePixels, nodes, languageMode: "SEMANTIC_CODE_SWITCH", semanticCopy: "职责拆开：Codex 整理材料与主线；Kimi 完成中文初稿；DeepSeek 只改选中的局部", sourceBindings: [{...sources.selection, crop: {left: 500, top: 40, width: 1380, height: 1000}, placement: {left: 55, top: 134, width: 1120, height: 812}, visibleSourceTerms: ["候选 1", "候选 2", "候选 3", "接受", "记住改法"]}], composition: "verified-source-left-role-stack-right", primaryFamily: "modular-pixel-infographic", allowedLatinTokens: ["Codex", "Kimi", "DeepSeek"]});
}

async function renderFrame({id, label, brief, basePixels, nodes, languageMode, semanticCopy, sourceBindings, composition, primaryFamily, parity = null, allowedLatinTokens = []}) {
  const baseFile = await saveBase(id, basePixels);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${nodes.map((node) => node.markup).join("")}</svg>`);
  const frameFile = path.join(frameRoot, `${id}.png`);
  await sharp(basePixels).composite([{input: overlay, left: 0, top: 0}]).png({compressionLevel: 9}).toFile(frameFile);
  const metadata = await sharp(frameFile).metadata();
  return {
    id,
    label,
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    brief: {file: path.relative(root, brief.file), sha256: fileSha256(brief.file), fingerprint: brief.value.fingerprint},
    primaryFamily,
    composition,
    languageMode,
    semanticCopy,
    allowedLatinTokens,
    frame: {file: path.relative(root, frameFile), sha256: fileSha256(frameFile), width: metadata.width, height: metadata.height, mimeType: "image/png"},
    base: {file: path.relative(root, baseFile), sha256: fileSha256(baseFile)},
    textNodes: nodes.map((node) => node.spec),
    sourceBindings: sourceBindings.map((binding) => ({assetId: binding.assetId, file: path.relative(root, binding.file), sha256: binding.actualSha256, evidenceBoundary: binding.evidenceBoundary, crop: binding.crop, placement: binding.placement, visibleSourceTerms: binding.visibleSourceTerms})),
    parity,
    formalOverlay: {renderer: "fontkit-svg-paths-over-sharp", cssUsed: false, htmlUsed: false, decorativeGeometryCount: 0, allowedSvgElements: ["svg", "g", "path"]},
    generatedFormalText: false,
    editableText: true,
    productionAdmitted: false,
  };
}

async function main() {
  fs.mkdirSync(frameRoot, {recursive: true});
  fs.mkdirSync(baseRoot, {recursive: true});
  const frames = [];
  frames.push(await buildFrame01());
  frames.push(await buildFrame02());
  frames.push(await buildFrame03());
  frames.push(await buildFrame04());

  const tileWidth = 960;
  const tileHeight = 540;
  const labelHeight = 54;
  const headerHeight = 70;
  const rowHeight = tileHeight + labelHeight;
  const sheetWidth = 1920;
  const sheetHeight = headerHeight + rowHeight * 2;
  const tileInputs = await Promise.all(frames.map((item) => sharp(path.join(root, item.frame.file)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
  const labelMarkup = frames.map((item, index) => {
    const x = (index % 2) * tileWidth + 18;
    const y = headerHeight + Math.floor(index / 2) * rowHeight + tileHeight + 34;
    return `<text x="${x}" y="${y}" fill="#f4f1e9" font-family="monospace" font-size="19">${item.label} · ${item.languageMode}</text>`;
  }).join("");
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}"><rect width="100%" height="100%" fill="#090c0e"/><text x="18" y="39" fill="#dfff68" font-family="monospace" font-size="21">A1 TYPOGRAPHY MASTER BOARD V3 · CONTENT-BOUND BILINGUAL SYSTEM · REVIEW ONLY</text>${labelMarkup}</svg>`);
  const sheetFile = path.join(outputRoot, "typography-master-board-v3.png");
  await sharp(sheetSvg).composite(tileInputs.map((input, index) => ({input, left: (index % 2) * tileWidth, top: headerHeight + Math.floor(index / 2) * rowHeight}))).png({compressionLevel: 9}).toFile(sheetFile);

  const manifestBody = {
    contract: "A1TypographyMasterBoard/v3",
    status: "READY_FOR_OBJECTIVE_AUDIT",
    visualThesis: "中文负责叙事，英文只承担平权翻译、真实来源或不可替换的专有名词；像素字只在关键判断中成为演员。",
    researchBinding: {file: "work/style-research/bilingual-editorial-typography-2026-08-14.md", sha256: fileSha256(path.join(root, "work/style-research/bilingual-editorial-typography-2026-08-14.md"))},
    currentAuthorityUntouched: true,
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
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
