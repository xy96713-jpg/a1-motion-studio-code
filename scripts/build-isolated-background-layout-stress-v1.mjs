#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/background-layout-stress-v1");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const fonts = {
  regular: fontkit.openSync(path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/font-cache/fusion-pixel.ttf")),
  bold: fontkit.openSync(path.join(root, ".codex-artifacts/system-progress-system-line/font-candidates-v1/fonts/fusion-bold-pixel/upstream-2026.08.11/fusion-bold-pixel-12px-proportional-zh_hans.ttf")),
};

const backgrounds = [
  {id: "cool-halftone-quiet-field", label: "浅冷纸面 · 安静", tone: "light", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-cool-halftone-quiet-field-v1.png"},
  {id: "charcoal-contour-quiet-field", label: "炭黑轮廓 · 判断", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1/candidates/background-charcoal-contour-quiet-field-v1.png"},
  {id: "cool-newsprint-evidence-bed", label: "冷新闻纸 · 证据", tone: "light", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/backgrounds/background-cool-newsprint-evidence-bed-v1.png"},
  {id: "charcoal-small-cross-field", label: "炭黑小十字 · 过渡", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/backgrounds/background-charcoal-small-cross-field-v1.png"},
  {id: "source-evidence-registration-bed", label: "登记台 · 材料", tone: "light", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-role-wave-v2/background-source-evidence-registration-bed-imagegen-v2.png"},
  {id: "cobalt-dash-textile", label: "钴蓝织物 · 过程", tone: "dark", file: "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-completion-wave-v3/background-cobalt-dash-textile-imagegen-v3.png"},
];

const treatments = [
  {id: "quiet-note", label: "A · 安静说明", font: "regular"},
  {id: "verdict-title", label: "B · 粗体结论", font: "bold"},
  {id: "primary-secondary", label: "C · 主副层级", font: "bold"},
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

function group(font, text, placement, color) {
  return `<g fill="${color}">${makeTextPath(font, text, placement)}</g>`;
}

function treatmentSvg(font, treatment, tone) {
  const ink = tone === "light" ? "#111315" : "#f4f2eb";
  const accent = tone === "light" ? "#2452ff" : "#9bc7ff";
  if (treatment.id === "quiet-note") {
    return `${group(font, "先给材料", {x: 150, y: 220, size: 130, tracking: -3}, ink)}${group(font, "再找角度", {x: 150, y: 390, size: 130, tracking: -3}, ink)}${group(font, "SOURCE / KEEP / EDIT", {x: 155, y: 530, size: 27, tracking: 3}, accent)}`;
  }
  if (treatment.id === "verdict-title") {
    return `${group(font, "完成度很高", {x: 130, y: 225, size: 215, tracking: -8, scaleX: 0.78}, ink)}${group(font, "的废稿", {x: 325, y: 480, size: 300, tracking: -13, scaleX: 0.82}, ink)}${group(font, "HIGH POLISH / LOW VALUE", {x: 140, y: 590, size: 29, tracking: 3}, accent)}`;
  }
  return `${group(font, "工作流", {x: 130, y: 280, size: 285, tracking: -10, scaleX: 0.84}, ink)}${group(fonts.regular, "先决定载体，再决定动效", {x: 145, y: 470, size: 48, tracking: 1, scaleX: 0.9}, ink)}${group(fonts.regular, "A1 / EDITORIAL CONTROL", {x: 150, y: 565, size: 27, tracking: 3}, accent)}`;
}

async function render(background, treatment) {
  const source = path.join(root, background.file);
  if (!fs.existsSync(source)) throw new Error(`background-file-missing:${source}`);
  const base = await sharp(source).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${treatmentSvg(fonts[treatment.font], treatment, background.tone)}</svg>`;
  return sharp(base).composite([{input: Buffer.from(svg), left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
}

async function main() {
  fs.mkdirSync(outputRoot, {recursive: true});
  const rendered = [];
  for (const background of backgrounds) {
    for (const treatment of treatments) {
      const pixels = await render(background, treatment);
      const file = path.join(outputRoot, `${background.id}-${treatment.id}.png`);
      fs.writeFileSync(file, pixels);
      rendered.push({background: background.id, treatment: treatment.id, file: path.relative(root, file), sha256: sha256(pixels)});
    }
  }

  const tileWidth = 560;
  const tileHeight = 315;
  const columns = 3;
  const rows = backgrounds.length;
  const width = columns * tileWidth + 72;
  const height = 92 + rows * (tileHeight + 66);
  const layers = [];
  const labels = [`<text x="18" y="34" fill="#f2eee4" font-family="Arial, sans-serif" font-size="22" font-weight="700">A1 BACKGROUND × LAYOUT STRESS TEST · 6 BACKGROUNDS × 3 VIDEO ROLES</text>`];
  for (let row = 0; row < rows; row += 1) {
    const background = backgrounds[row];
    for (let column = 0; column < columns; column += 1) {
      const treatment = treatments[column];
      const item = rendered.find((entry) => entry.background === background.id && entry.treatment === treatment.id);
      const left = 18 + column * (tileWidth + 18);
      const top = 70 + row * (tileHeight + 66);
      layers.push({input: await sharp(path.join(root, item.file)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
      labels.push(`<text x="${left}" y="${top + tileHeight + 20}" fill="#dfff68" font-family="Arial, sans-serif" font-size="15">${background.label} · ${treatment.label}</text>`);
    }
  }
  const sheet = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b1015"/>${labels.join("")}</svg>`);
  const sheetPixels = await sharp(sheet).composite(layers).png({compressionLevel: 9}).toBuffer();
  const sheetFile = path.join(outputRoot, "background-layout-stress-sheet.png");
  fs.writeFileSync(sheetFile, sheetPixels);
  const manifest = {
    contract: "A1IsolatedBackgroundLayoutStress/v1",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    currentAuthorityUntouched: true,
    productionAdmitted: false,
    sourceBackgroundCount: backgrounds.length,
    treatmentCount: treatments.length,
    treatments: treatments.map(({id, label, font}) => ({id, label, font})),
    rendered,
    reviewSheet: {file: path.relative(root, sheetFile), sha256: sha256(sheetPixels), width, height},
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify({...manifest, manifestSha256: sha256(Buffer.from(JSON.stringify(manifest)))}, null, 2));
  console.log(JSON.stringify({status: manifest.status, currentAuthorityUntouched: true, sourceBackgroundCount: backgrounds.length, treatmentCount: treatments.length, reviewSheet: path.relative(root, sheetFile)}, null, 2));
}

await main();
