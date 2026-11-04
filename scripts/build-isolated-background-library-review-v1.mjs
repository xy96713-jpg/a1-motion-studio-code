#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/background-library-review-v1");
const fontFile = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const backgrounds = [
  {id: "cool-halftone-quiet-field", label: "浅冷纸面 · 安静", role: "quiet-field", tone: "light", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-cool-halftone-quiet-field-v1.png"},
  {id: "charcoal-contour-quiet-field", label: "炭黑轮廓 · 判断", role: "verdict-field", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-charcoal-contour-quiet-field-v1.png"},
  {id: "cool-newsprint-evidence-bed", label: "冷新闻纸 · 证据", role: "source-evidence-bed", tone: "light", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/backgrounds/background-cool-newsprint-evidence-bed-v1.png"},
  {id: "cobalt-crop-typography-field", label: "钴蓝裁切 · 标题", role: "verdict-type-field", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/backgrounds/background-cobalt-crop-typography-field-v1.png"},
  {id: "charcoal-small-cross-field", label: "炭黑小十字 · 过渡", role: "transition-field", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/backgrounds/background-charcoal-small-cross-field-v1.png"},
  {id: "cool-uniform-dot-grid", label: "冷色点阵 · 节奏", role: "rhythm-field", tone: "light", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/backgrounds/background-cool-uniform-dot-grid-v1.png"},
  {id: "cobalt-uniform-cross-grid", label: "钴蓝十字格 · 机制", role: "mechanism-field", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/backgrounds/background-cobalt-uniform-cross-grid-v1.png"},
  {id: "source-evidence-registration-bed", label: "登记台 · 材料", role: "source-evidence-bed", tone: "light", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-role-wave-v2/background-source-evidence-registration-bed-imagegen-v2.png"},
  {id: "cobalt-verdict-mass-field", label: "钴蓝质量场 · 结论", role: "verdict-field", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-role-wave-v2/background-cobalt-verdict-mass-field-imagegen-v2.png"},
  {id: "cobalt-dash-textile", label: "钴蓝织物 · 过程", role: "process-field", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-completion-wave-v3/background-cobalt-dash-textile-imagegen-v3.png"},
];

function makeTextPath(font, text, {x, y, size, tracking = 0, scaleX = 1}) {
  let cursor = x;
  const scale = size / font.unitsPerEm;
  const paths = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`font-missing-glyph:${character}`);
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  return paths.join("");
}

function buildTypography(font, tone) {
  const color = tone === "light" ? "#111315" : "#f4f2eb";
  const accent = tone === "light" ? "#2452ff" : "#9bc7ff";
  return `<g fill="${color}">${makeTextPath(font, "完成度很高", {x: 120, y: 210, size: 210, tracking: -8, scaleX: 0.78})}${makeTextPath(font, "的废稿", {x: 300, y: 455, size: 290, tracking: -12, scaleX: 0.82})}</g><g fill="${accent}">${makeTextPath(font, "HIGH POLISH / LOW VALUE", {x: 125, y: 570, size: 29, tracking: 3})}</g>`;
}

async function renderBackground(font, item, index) {
  const source = path.join(root, item.file);
  if (!fs.existsSync(source)) throw new Error(`background-file-missing:${source}`);
  const base = await sharp(source).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${buildTypography(font, item.tone)}</svg>`;
  const pixels = await sharp(base).composite([{input: Buffer.from(svg), left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
  const file = path.join(outputRoot, `${String(index + 1).padStart(2, "0")}-${item.id}.png`);
  fs.writeFileSync(file, pixels);
  return {id: item.id, label: item.label, role: item.role, sourceFile: item.file, file: path.relative(root, file), sha256: sha256(pixels)};
}

async function main() {
  fs.mkdirSync(outputRoot, {recursive: true});
  const font = fontkit.openSync(fontFile);
  const rendered = [];
  for (const [index, item] of backgrounds.entries()) rendered.push(await renderBackground(font, item, index));

  const tileWidth = 470;
  const tileHeight = 264;
  const columns = 2;
  const rows = Math.ceil(rendered.length / columns);
  const width = columns * tileWidth + 54;
  const height = 90 + rows * (tileHeight + 64);
  const layers = [];
  const labels = [`<text x="18" y="34" fill="#f2eee4" font-family="Arial, sans-serif" font-size="22" font-weight="700">A1 BACKGROUND LIBRARY · 10 CANDIDATES · TEXTLESS SOURCE + EDITABLE TYPE STRESS TEST</text>`];
  for (const [index, item] of rendered.entries()) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const left = 18 + column * (tileWidth + 18);
    const top = 70 + row * (tileHeight + 64);
    layers.push({input: await sharp(path.join(root, item.file)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    labels.push(`<text x="${left}" y="${top + tileHeight + 20}" fill="#dfff68" font-family="Arial, sans-serif" font-size="15">${item.label} · ${item.role}</text>`);
  }
  const sheet = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b1015"/>${labels.join("")}</svg>`);
  const sheetPixels = await sharp(sheet).composite(layers).png({compressionLevel: 9}).toBuffer();
  const sheetFile = path.join(outputRoot, "background-library-review-sheet.png");
  fs.writeFileSync(sheetFile, sheetPixels);
  const manifest = {
    contract: "A1IsolatedBackgroundLibraryReview/v1",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    currentAuthorityUntouched: true,
    productionAdmitted: false,
    generatedFormalTextAllowed: false,
    textStressTest: "renderer-bound-current-fusion-pixel",
    sourceCandidateCount: rendered.length,
    rendered,
    reviewSheet: {file: path.relative(root, sheetFile), sha256: sha256(sheetPixels), width, height},
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify({...manifest, manifestSha256: sha256(Buffer.from(JSON.stringify(manifest)))}, null, 2));
  console.log(JSON.stringify({status: manifest.status, currentAuthorityUntouched: true, candidateCount: rendered.length, reviewSheet: path.relative(root, sheetFile)}, null, 2));
}

await main();
