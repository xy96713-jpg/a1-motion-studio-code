#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const candidateRoot = path.join(root, ".codex-artifacts/system-progress-system-line/font-candidates-v1");
const outputRoot = path.join(candidateRoot, "comparison", "typography-treatments");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const fonts = [
  {id: "regular", label: "Fusion Pixel · 常规", file: path.join(candidateRoot, "fonts/fusion-pixel/upstream-2026.08.11/fusion-pixel-12px-proportional-zh_hans.ttf")},
  {id: "bold", label: "Fusion Bold Pixel · 粗体", file: path.join(candidateRoot, "fonts/fusion-bold-pixel/upstream-2026.08.11/fusion-bold-pixel-12px-proportional-zh_hans.ttf")},
];

const treatments = [
  {
    id: "hero-stack",
    label: "01 · 标题堆叠 / Hero Stack",
    base: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-role-wave-v2/background-cobalt-verdict-mass-field-imagegen-v2.png",
    color: "#f4f2eb",
    accent: "#2450ff",
    text: (group) => `${group("完成度很高", {x: 810, y: 190, size: 210, tracking: -8, scaleX: 0.78})}${group("的废稿", {x: 1050, y: 445, size: 300, tracking: -13, scaleX: 0.82})}${group("HIGH POLISH / LOW VALUE", {x: 1110, y: 855, size: 33, tracking: 3}, {accent: true})}`,
  },
  {
    id: "rhythm-stair",
    label: "02 · 阶梯节奏 / Rhythm Stair",
    base: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-completion-wave-v3/background-cobalt-dash-textile-imagegen-v3.png",
    color: "#f4f2eb",
    accent: "#9bc7ff",
    text: (group) => `${group("先给材料", {x: 250, y: 190, size: 170, tracking: -5})}${group("再找角度", {x: 580, y: 430, size: 170, tracking: -5})}${group("最后动笔", {x: 910, y: 670, size: 170, tracking: -5})}${group("PROCESS / NOT AUTO", {x: 130, y: 920, size: 28, tracking: 3}, {accent: true})}`,
  },
  {
    id: "full-takeover",
    label: "03 · 整屏接管 / Full Takeover",
    base: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/shot-specific-assets-v1/ed31-controllable-routing-object-imagegen-v1.png",
    color: "#111315",
    accent: "#2452ff",
    text: (group) => `${group("一套可控的", {x: 130, y: 235, size: 145, tracking: -4})}${group("工作流", {x: 130, y: 475, size: 255, tracking: -8, scaleX: 0.84})}${group("CONTROL / NOT AUTO", {x: 135, y: 575, size: 28, tracking: 3}, {accent: true})}`,
  },
  {
    id: "primary-secondary",
    label: "04 · 主副层级 / Primary + Secondary",
    base: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/shot-specific-assets-v1/ed31-controllable-routing-object-imagegen-v1.png",
    color: "#111315",
    accent: "#2452ff",
    text: (group) => `${group("工作流", {x: 130, y: 300, size: 290, tracking: -10, scaleX: 0.86})}${group("先决定载体，再决定动效", {x: 140, y: 480, size: 48, tracking: 1, scaleX: 0.9})}${group("A1 / EDITORIAL CONTROL", {x: 140, y: 575, size: 28, tracking: 3}, {accent: true})}`,
  },
];

function localPath(publicUrl) {
  return path.join(appRoot, "public", publicUrl.replace(/^\//u, ""));
}

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

function textGroup(font, text, placement, color) {
  return `<g fill="${color}">${makeTextPath(font, text, placement)}</g>`;
}

async function render(font, treatment) {
  const base = await sharp(localPath(treatment.base)).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${treatment.text((text, placement, options = {}) => textGroup(font, text, placement, options.accent ? treatment.accent : treatment.color))}</svg>`;
  return sharp(base).composite([{input: Buffer.from(svg), left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
}

async function main() {
  fs.mkdirSync(outputRoot, {recursive: true});
  const rendered = [];
  for (const fontSpec of fonts) {
    const font = fontkit.openSync(fontSpec.file);
    for (const treatment of treatments) {
      const pixels = await render(font, treatment);
      const file = path.join(outputRoot, `${fontSpec.id}-${treatment.id}.png`);
      fs.writeFileSync(file, pixels);
      rendered.push({font: fontSpec, treatment, file, sha256: sha256(pixels)});
    }
  }

  const tileWidth = 560;
  const tileHeight = 315;
  const width = 2 * tileWidth + 54;
  const height = 90 + 2 * (tileHeight + 64) * 2;
  const layers = [];
  const labels = [];
  labels.push(`<text x="18" y="34" fill="#f2eee4" font-family="Arial, sans-serif" font-size="22" font-weight="700">A1 TYPOGRAPHY TREATMENTS · SAME FAMILY · ISOLATED REVIEW</text>`);
  for (const [index, item] of rendered.entries()) {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const left = 18 + column * (tileWidth + 18);
    const top = 70 + row * (tileHeight + 64);
    layers.push({input: await sharp(item.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    labels.push(`<text x="${left}" y="${top + tileHeight + 20}" fill="#dfff68" font-family="Arial, sans-serif" font-size="16">${item.font.label} · ${item.treatment.label}</text>`);
  }
  const sheet = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b1015"/>${labels.join("")}</svg>`);
  const sheetPixels = await sharp(sheet).composite(layers).png({compressionLevel: 9}).toBuffer();
  const sheetFile = path.join(outputRoot, "typography-treatments-sheet.png");
  fs.writeFileSync(sheetFile, sheetPixels);
  const manifest = {
    contract: "A1IsolatedTypographyTreatments/v1",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    currentAuthorityUntouched: true,
    productionAdmitted: false,
    principle: "one-family-with-controlled-weight-and-layout-treatments",
    rendered: rendered.map((item) => ({font: item.font.id, treatment: item.treatment.id, file: path.relative(root, item.file), sha256: item.sha256})),
    reviewSheet: {file: path.relative(root, sheetFile), sha256: sha256(sheetPixels), width, height},
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify({...manifest, manifestSha256: sha256(Buffer.from(JSON.stringify(manifest)))}, null, 2));
  console.log(JSON.stringify({status: manifest.status, currentAuthorityUntouched: true, reviewSheet: path.relative(root, sheetFile), treatments: treatments.map((treatment) => treatment.id)}, null, 2));
}

await main();
