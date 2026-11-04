#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sourceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg");
const fontFile = path.join(root, ".codex-artifacts/system-progress-system-line/display-font-scout-v2/fonts/frex-sans-gb-bold.ttf");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/ed01-large-title-packaging-v1");
const outputFile = path.join(outputRoot, "ED-01-large-title-review.png");
const reportFile = path.join(outputRoot, "report.json");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function glyphPath(font, text, {x, baseline, size, tracking = 0, scaleX = 1}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    if (!glyph || glyph.id === 0) throw new Error(`ed01-title-font-missing-glyph:${character}`);
    glyphIds.push(glyph.id);
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(2)} ${baseline.toFixed(2)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += run.positions[0].xAdvance * scale * scaleX + tracking;
  }
  return {paths: paths.join(""), glyphIds, width: cursor - x};
}

async function main() {
  if (!fs.existsSync(sourceFile) || !fs.existsSync(fontFile)) throw new Error("ed01-title-source-or-font-missing");
  fs.mkdirSync(outputRoot, {recursive: true});
  const font = fontkit.openSync(fontFile);
  const source = await sharp(sourceFile).resize(1920, 1080, {fit: "cover"}).png().toBuffer();
  const line1 = glyphPath(font, "智能写作", {x: 82, baseline: 246, size: 126, tracking: -5, scaleX: 0.96});
  const line2 = glyphPath(font, "工作台", {x: 82, baseline: 402, size: 174, tracking: -8, scaleX: 0.98});
  const shadow1 = glyphPath(font, "智能写作", {x: 91, baseline: 257, size: 126, tracking: -5, scaleX: 0.96});
  const shadow2 = glyphPath(font, "工作台", {x: 91, baseline: 413, size: 174, tracking: -8, scaleX: 0.98});
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <rect x="70" y="88" width="610" height="342" fill="#080c10" fill-opacity="0.28"/>
    <text x="82" y="115" fill="#b9c9ff" font-family="monospace" font-size="25" font-weight="700">用 vibe coding 做的</text>
    <g fill="#05070a" fill-opacity="0.9">${shadow1.paths}${shadow2.paths}</g>
    <g fill="#f4f2eb">${line1.paths}</g>
    <g fill="#f4f2eb">${line2.paths}</g>
    <path d="M82 432H600" stroke="#315cff" stroke-width="9"/>
    <path d="M600 432H668V397" fill="none" stroke="#315cff" stroke-width="4"/>
    <rect x="650" y="378" width="18" height="18" fill="#315cff"/>
  </svg>`);
  const pixels = await sharp(source).composite([{input: svg}]).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  const metadata = await sharp(pixels).metadata();
  const body = {
    contract: "A1ED01LargeTitlePackagingCandidate/v1",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    shotId: "ED-01",
    presentationMode: "PRESENTER_NEGATIVE_SPACE_OVERLAY",
    source: {file: path.relative(root, sourceFile), sha256: sha256(fs.readFileSync(sourceFile))},
    font: {file: path.relative(root, fontFile), family: font.familyName, sha256: sha256(fs.readFileSync(fontFile)), renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES"},
    exactCopy: ["用 vibe coding 做的", "智能写作", "工作台"],
    glyphProof: {智能写作: line1.glyphIds, 工作台: line2.glyphIds},
    layout: {safeRegion: {x: 70, y: 88, width: 610, height: 342}, faceOverlapAllowed: false, microphoneOverlapAllowed: false, fullFrameTakeover: false, titleCoverageBudget: 0.2},
    output: {file: path.relative(root, outputFile), sha256: sha256(pixels), width: metadata.width, height: metadata.height},
    styleMechanism: "CUT_GROTESK_EXACT_LOCAL_GLYPHS_WITH_SINGLE_COBALT_STRUCTURAL_RULE",
    productionAdmitted: false,
    currentAuthorityChanged: false,
    assemblyMotionRenderStarted: false,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(reportFile, `${JSON.stringify({...body, reportSha256: sha256(Buffer.from(JSON.stringify(body)))}, null, 2)}\n`);
  console.log(JSON.stringify({status: body.status, output: body.output, currentAuthorityChanged: false, productionAdmitted: false}, null, 2));
}

await main();
