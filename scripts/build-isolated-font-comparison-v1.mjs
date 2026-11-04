#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const candidateRoot = path.join(root, ".codex-artifacts/system-progress-system-line/font-candidates-v1");
const outputRoot = path.join(candidateRoot, "comparison");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const fonts = [
  {id: "current-active-fusion-pixel", label: "当前 Fusion Pixel", license: "OFL-1.1", productionEligible: true, file: path.join(candidateRoot, "fonts/fusion-pixel/current-active-fusion-pixel.ttf")},
  {id: "fusion-pixel-upstream-2026-08-11", label: "Fusion Pixel 最新上游", license: "OFL-1.1", productionEligible: true, file: path.join(candidateRoot, "fonts/fusion-pixel/upstream-2026.08.11/fusion-pixel-12px-proportional-zh_hans.ttf")},
  {id: "fusion-bold-pixel-upstream-2026-08-11", label: "Fusion Bold Pixel · 同家族粗体", license: "OFL-1.1", productionEligible: true, file: path.join(candidateRoot, "fonts/fusion-bold-pixel/upstream-2026.08.11/fusion-bold-pixel-12px-proportional-zh_hans.ttf")},
  {id: "ark-pixel-upstream-2026-08-11", label: "Ark Pixel", license: "OFL-1.1", productionEligible: false, note: "官方提示仍缺少大量汉字", file: path.join(candidateRoot, "fonts/ark-pixel/upstream-2026.08.11/ark-pixel-12px-proportional-zh_cn.ttf")},
  {id: "zpix-reference-only", label: "Zpix（仅参考）", license: "商业授权需另购", productionEligible: false, note: "不进入生产候选", file: path.join(candidateRoot, "fonts/zpix-reference/zpix.ttf")},
];

const shots = [
  {
    id: "ED-10",
    base: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-role-wave-v2/background-cobalt-verdict-mass-field-imagegen-v2.png",
    element: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-element-kit-wave-v1/article-element-crossed-strokes-imagegen-v1.png",
    placement: {left: 1500, top: 700, width: 300, height: 300},
    text: (group) => `${group("完成度很高", {x: 785, y: 172, size: 230, tracking: -9, scaleX: .76}, "#f4f2eb")}${group("的废稿", {x: 1035, y: 430, size: 300, tracking: -13, scaleX: .8}, "#f4f2eb")}${group("HIGH POLISH / LOW VALUE", {x: 1110, y: 855, size: 33, tracking: 3}, "#2450ff")}`,
  },
  {
    id: "ED-17",
    base: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-background-completion-wave-v3/background-cobalt-dash-textile-imagegen-v3.png",
    element: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/imagegen-process-connector-wave-v1/article-element-charcoal-sorting-loop-imagegen-v1.png",
    placement: {left: 1430, top: 300, width: 260, height: 260},
    text: (group) => `${group("先给材料", {x: 260, y: 190, size: 170, tracking: -5}, "#f4f2eb")}${group("再找角度", {x: 520, y: 420, size: 170, tracking: -5}, "#f4f2eb")}${group("最后动笔", {x: 790, y: 650, size: 170, tracking: -5}, "#f4f2eb")}${group("PROCESS / NOT AUTO", {x: 130, y: 920, size: 28, tracking: 3}, "#9bc7ff")}`,
  },
  {
    id: "ED-31",
    base: "/generated/system-line/editorial-asset-workbench-v1/default-design-asset-library-v1/shot-specific-assets-v1/ed31-controllable-routing-object-imagegen-v1.png",
    text: (group) => `${group("一套可控的工作流", {x: 130, y: 235, size: 145, tracking: -4}, "#111315")}${group("CONTROL / NOT AUTO", {x: 135, y: 330, size: 28, tracking: 3}, "#2452ff")}`,
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

async function renderShot(font, shot) {
  const base = await sharp(localPath(shot.base)).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${shot.text((text, placement, color) => textGroup(font, text, placement, color))}</svg>`);
  const layers = [];
  if (shot.element) {
    layers.push({input: await sharp(localPath(shot.element)).resize(shot.placement.width, shot.placement.height, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer(), left: shot.placement.left, top: shot.placement.top});
  }
  layers.push({input: title, left: 0, top: 0});
  return sharp(base).composite(layers).png({compressionLevel: 9}).toBuffer();
}

async function main() {
  fs.mkdirSync(outputRoot, {recursive: true});
  const rendered = [];
  for (const candidate of fonts) {
    if (!fs.existsSync(candidate.file)) throw new Error(`font-file-missing:${candidate.file}`);
    const font = fontkit.openSync(candidate.file);
    const shotsForFont = [];
    for (const shot of shots) {
      const pixels = await renderShot(font, shot);
      const file = path.join(outputRoot, `${candidate.id}-${shot.id.toLowerCase()}.png`);
      fs.writeFileSync(file, pixels);
      shotsForFont.push({shotId: shot.id, file, sha256: sha256(pixels)});
    }
    rendered.push({candidate, font: {family: font.familyName, subfamily: font.subfamilyName, glyphCount: font.numGlyphs}, shots: shotsForFont});
  }

  const tileWidth = 460;
  const tileHeight = 259;
  const rowHeight = 330;
  const width = 1920;
  const height = 90 + rendered.length * rowHeight;
  const layers = [];
  const labels = [];
  for (const [rowIndex, item] of rendered.entries()) {
    const top = 70 + rowIndex * rowHeight;
    labels.push(`<text x="18" y="${top - 18}" fill="#dfff68" font-family="Arial, sans-serif" font-size="18">${item.candidate.label} · ${item.font.family} · ${item.candidate.license}${item.candidate.note ? ` · ${item.candidate.note}` : ""}</text>`);
    for (const [columnIndex, shot] of item.shots.entries()) {
      layers.push({input: await sharp(shot.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left: 18 + columnIndex * 475, top});
      labels.push(`<text x="${18 + columnIndex * 475}" y="${top + tileHeight + 20}" fill="#aeb7b2" font-family="Arial, sans-serif" font-size="13">${shot.shotId}</text>`);
    }
  }
  const sheet = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b1015"/><text x="18" y="34" fill="#f2eee4" font-family="Arial, sans-serif" font-size="22" font-weight="700">A1 FONT COMPARISON · ISOLATED CANDIDATES · NOT CURRENT AUTHORITY</text>${labels.join("")}</svg>`);
  const sheetPixels = await sharp(sheet).composite(layers).png({compressionLevel: 9}).toBuffer();
  const sheetFile = path.join(outputRoot, "font-comparison-sheet.png");
  fs.writeFileSync(sheetFile, sheetPixels);
  const manifest = {contract: "A1IsolatedFontComparison/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", currentAuthorityUntouched: true, productionAdmitted: false, candidates: rendered.map(({candidate, font, shots: records}) => ({...candidate, file: path.relative(root, candidate.file), sha256: sha256(fs.readFileSync(candidate.file)), font, shots: records.map((record) => ({shotId: record.shotId, file: path.relative(root, record.file), sha256: record.sha256}))})), reviewSheet: {file: path.relative(root, sheetFile), sha256: sha256(sheetPixels), width, height}, generatedAt: new Date().toISOString()};
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify({...manifest, manifestSha256: sha256(Buffer.from(JSON.stringify(manifest)))}, null, 2));
  console.log(JSON.stringify({status: manifest.status, currentAuthorityUntouched: true, reviewSheet: path.relative(root, sheetFile), candidates: manifest.candidates.map((candidate) => ({id: candidate.id, family: candidate.font.family, glyphCount: candidate.font.glyphCount, productionEligible: candidate.productionEligible, sha256: candidate.sha256}))}, null, 2));
}

await main();
