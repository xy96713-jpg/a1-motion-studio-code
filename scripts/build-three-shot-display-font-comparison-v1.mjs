#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const outRoot = path.join(root, ".codex-artifacts/system-progress-system-line/display-font-scout-v3");
const fontRoot = path.join(root, ".codex-artifacts/system-progress-system-line/display-font-scout-v2/fonts");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const candidates = [
  {id: "douyin-sans-bold", label: "Douyin Sans Bold", file: path.join(fontRoot, "douyin-sans-bold.ttf"), color: "#f4f2eb"},
  {id: "frex-sans-gb-bold", label: "Frex Sans GB Bold", file: path.join(fontRoot, "frex-sans-gb-bold.ttf"), color: "#b9c9ff"},
];
const shots = [
  {
    shotId: "ED-01",
    source: path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg"),
    copy: "智能写作工作台",
    support: "用 vibe coding 做的",
    background: "#0b0e12",
  },
  {
    shotId: "ED-19",
    source: path.join(root, "work/style-research/ed19-a1-tait-fusion-canary-v1/ED-19.png"),
    copy: "完成度很高的废稿",
    support: "先把材料整理清楚",
    background: "#0b0e12",
  },
  {
    shotId: "ED-31",
    source: path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-31.jpg"),
    copy: "可控的工作流",
    support: "把不方便变成流程力",
    background: "#0b0e12",
  },
];

function escapeXml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"}[character]));
}

function glyphPath(font, text, {x, baseline, size, tracking = 0, scaleX = 1}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const paths = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    if (!glyph || glyph.id === 0) throw new Error(`font-missing-glyph:${font.familyName}:${character}`);
    const advance = run.positions[0].xAdvance * scale * scaleX + tracking;
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(2)} ${baseline.toFixed(2)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += advance;
  }
  return paths.join("");
}

async function renderShot(shot, candidate, font) {
  const base = await sharp(shot.source).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const isPresenter = shot.shotId !== "ED-19";
  const titleSize = shot.shotId === "ED-31" ? 192 : shot.shotId === "ED-19" ? 184 : 172;
  const titleX = 78;
  const titleBaseline = shot.shotId === "ED-31" ? 820 : shot.shotId === "ED-19" ? 890 : 260;
  const supportBaseline = shot.shotId === "ED-31" ? 160 : shot.shotId === "ED-19" ? 150 : 105;
  const shadow = glyphPath(font, shot.copy, {x: titleX + 10, baseline: titleBaseline + 12, size: titleSize, tracking: -3, scaleX: 0.96});
  const title = glyphPath(font, shot.copy, {x: titleX, baseline: titleBaseline, size: titleSize, tracking: -3, scaleX: 0.96});
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect x="28" y="34" width="${isPresenter ? 690 : 810}" height="54" fill="#0b0e12" fill-opacity="0.82"/><text x="54" y="70" fill="#dfff68" font-family="monospace" font-size="20">${escapeXml(shot.shotId)} · ${escapeXml(candidate.label)} · REVIEW ONLY</text><text x="${titleX}" y="${supportBaseline}" fill="#b9c9ff" font-family="sans-serif" font-size="42" font-weight="700">${escapeXml(shot.support)}</text><g fill="#05070a" fill-opacity="0.88">${shadow}</g><g fill="${candidate.color}">${title}</g></svg>`);
  return sharp(base).composite([{input: svg}]).png({compressionLevel: 9}).toBuffer();
}

async function main() {
  fs.mkdirSync(outRoot, {recursive: true});
  const prepared = candidates.map((candidate) => {
    if (!fs.existsSync(candidate.file)) throw new Error(`font-file-missing:${candidate.file}`);
    return {...candidate, font: fontkit.openSync(candidate.file), fontSha256: sha256(fs.readFileSync(candidate.file))};
  });
  const rendered = [];
  for (const shot of shots) {
    if (!fs.existsSync(shot.source)) throw new Error(`shot-source-missing:${shot.shotId}`);
    for (const candidate of prepared) {
      const pixels = await renderShot(shot, candidate, candidate.font);
      const file = path.join(outRoot, `${shot.shotId}-${candidate.id}.png`);
      fs.writeFileSync(file, pixels);
      rendered.push({shotId: shot.shotId, candidateId: candidate.id, label: candidate.label, file, sha256: sha256(pixels), fontSha256: candidate.fontSha256});
    }
  }
  const tileWidth = 920;
  const tileHeight = 518;
  const rowHeight = 580;
  const sheetWidth = 1920;
  const sheetHeight = 84 + rowHeight * 3;
  const composites = [];
  const labels = [];
  for (const [index, item] of rendered.entries()) {
    const row = Math.floor(index / 2);
    const column = index % 2;
    const left = 20 + column * 950;
    const top = 64 + row * rowHeight;
    composites.push({input: await sharp(item.file).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer(), left, top});
    labels.push(`<text x="${left}" y="${top + tileHeight + 24}" fill="#e8edf0" font-family="monospace" font-size="17">${item.shotId} · ${item.label}</text>`);
  }
  const sheetSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}"><rect width="100%" height="100%" fill="#0b1015"/><text x="20" y="36" fill="#dfff68" font-family="monospace" font-size="20">A1 THREE-SHOT DISPLAY FONT COMPARISON V1 · ACTUAL PIXELS · REVIEW ONLY</text>${labels.join("")}</svg>`);
  const sheet = await sharp(sheetSvg).composite(composites).png({compressionLevel: 9}).toBuffer();
  const sheetFile = path.join(outRoot, "three-shot-display-font-comparison.png");
  fs.writeFileSync(sheetFile, sheet);
  const report = {contract: "A1ThreeShotDisplayFontComparison/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", shots: shots.map(({shotId, copy, support}) => ({shotId, copy, support})), candidates: prepared.map(({id, label, file, fontSha256}) => ({id, label, file: path.relative(root, file), fontSha256})), outputs: rendered.map(({file, ...item}) => ({...item, file: path.relative(root, file)})), comparisonSheet: {file: path.relative(root, sheetFile), sha256: sha256(sheet), width: sheetWidth, height: sheetHeight}, currentAuthorityUntouched: true, productionAdmitted: false, defaultFontChanged: false, generatedAt: new Date().toISOString()};
  fs.writeFileSync(path.join(outRoot, "report.json"), JSON.stringify({...report, reportSha256: sha256(Buffer.from(JSON.stringify(report)))}, null, 2));
  console.log(JSON.stringify({status: report.status, comparisonSheet: report.comparisonSheet, currentAuthorityUntouched: true, productionAdmitted: false}, null, 2));
}

await main();
