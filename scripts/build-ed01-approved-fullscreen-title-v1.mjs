#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const fontCollection = fontkit.openSync("/System/Library/Fonts/Supplemental/Songti.ttc");
const font = fontCollection.fonts.find((item) => item.postscriptName === "STSongti-SC-Black");
if (!font) throw new Error("songti-sc-black-missing");
const outRoot = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-approved-fullscreen-title-v1");
const outFile = path.join(outRoot, "ED-01-fullscreen-title.png");
const reportFile = path.join(outRoot, "report.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function glyphPath(text, {x, baseline, size, scaleX = 1, tracking = 0}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    if (!glyph || glyph.id === 0) throw new Error(`missing-glyph:${character}`);
    glyphIds.push(glyph.id);
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(2)} ${baseline.toFixed(2)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += run.positions[0].xAdvance * scale * scaleX + tracking;
  }
  return {paths: paths.join(""), glyphIds, width: cursor - x};
}

function cross(x, y, size = 22) {
  return `<g stroke="#a7463e" stroke-width="2" opacity=".75"><path d="M${x-size} ${y}H${x+size}"/><path d="M${x} ${y-size}V${y+size}"/></g>`;
}

fs.mkdirSync(outRoot, {recursive: true});
const title = glyphPath("智能写作工作台", {x: 118, baseline: 680, size: 362, scaleX: 0.65, tracking: 5});
if (title.width > 1700) throw new Error(`title-width-overflow:${title.width}`);
const micro = glyphPath("智能写作工作台", {x: 300, baseline: 910, size: 34, scaleX: 0.85, tracking: 30});
const surface = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
  <defs>
    <filter id="paper"><feTurbulence baseFrequency=".42" numOctaves="3" seed="19"/><feColorMatrix values=".08 0 0 0 .88 0 .08 0 0 .86 0 0 .08 0 .80 0 0 0 .10 0"/></filter>
  </defs>
  <rect width="1920" height="1080" fill="#f0ede5"/>
  <rect width="1920" height="980" filter="url(#paper)" opacity=".23"/>
  ${cross(108,186)}${cross(930,152)}${cross(1810,185)}${cross(110,730)}${cross(930,760)}${cross(1810,730)}
  <g fill="#151515">${title.paths}</g>
  <g stroke="#a7463e" stroke-width="1.5" opacity=".42"><path d="M118 724H1800"/><path d="M118 738H1800"/></g>
  <text x="118" y="875" fill="#a7463e" font-family="monospace" font-size="18" font-weight="700">部件</text>
  <text x="118" y="915" fill="#a7463e" font-family="monospace" font-size="18" font-weight="700">横</text>
  <text x="118" y="952" fill="#a7463e" font-family="monospace" font-size="18" font-weight="700">竖</text>
  <g fill="#2b2927" opacity=".82">${micro.paths}</g>
  <g stroke="#2b2927" stroke-width="2" opacity=".55">${Array.from({length: 22}, (_, i) => `<path d="M${290+i*66} 925h42M${290+i*66} 958h28"/>`).join("")}</g>
  <rect y="980" width="1920" height="100" fill="#080b0f"/>
  <rect x="0" y="980" width="12" height="100" fill="#315cff"/>
  <text x="34" y="1022" fill="#f4f2eb" font-family="monospace" font-size="22" font-weight="700" letter-spacing="3">A · FULLSCREEN TITLE</text>
  <text x="34" y="1055" fill="#8f989f" font-family="monospace" font-size="16">身份建立 · 本地字形正式绑定 · 生成模型不负责中文</text>
</svg>`);
const pixels = await sharp(surface).png({compressionLevel: 9}).toBuffer();
fs.writeFileSync(outFile, pixels);
const metadata = await sharp(pixels).metadata();
const report = {
  contract: "A1Ed01ApprovedFullscreenTitleCandidate/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
  shotId: "ED-01",
  sourceAuthority: "full-static-storyboard-rework-v4/ED-01.png",
  preservedGrammar: ["cream-paper", "overscale-high-contrast-glyph", "red-registration-cross", "component-grid", "black-footer-strip"],
  exactCopy: ["智能写作工作台"],
  font: {family: font.familyName, postscriptName: font.postscriptName, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", glyphIds: title.glyphIds},
  layout: {fullFrameTakeover: true, titleWidth: title.width, width: metadata.width, height: metadata.height},
  output: {file: path.relative(root, outFile), sha256: sha256(pixels), width: metadata.width, height: metadata.height},
  userVisualApproval: "NOT_APPROVED",
  productionAdmitted: false,
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
