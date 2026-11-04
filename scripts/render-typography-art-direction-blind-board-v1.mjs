#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {compileTypographyArtDirections} from "../apps/studio-next/src/lib/a1-typography-art-direction-v1.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/fullscreen-big-type-packaging-v1");
const frameDir = path.join(out, "frames");
const fixtureFile = path.join(root, "test-fixtures/typography-art-direction-v1.json");
const fixtures = JSON.parse(fs.readFileSync(fixtureFile, "utf8")).fixtures;
fs.mkdirSync(frameDir, {recursive: true});

const generatedRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const fontSpecs = {
  "source-han-sans-heavy": path.join(generatedRoot, "font-cache/SourceHanSansCN-Heavy.otf"),
  "source-han-serif-heavy": path.join(generatedRoot, "font-cache/SourceHanSerifCN-Heavy.otf"),
  "smiley-sans-oblique": path.join(generatedRoot, "font-cache/SmileySans-Oblique.otf"),
  "fusion-pixel": path.join(generatedRoot, "font-cache/fusion-pixel.ttf"),
};
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([id, file]) => {
  if (!fs.existsSync(file)) throw new Error(`typography-art-direction-font-missing:${id}`);
  const bytes = fs.readFileSync(file);
  return [id, {id, file, sha256: sha(bytes), font: fontkit.create(bytes)}];
}));

function measure(font, text, size, tracking = 0, scaleX = 1) {
  const run = font.layout(text);
  const scale = size / font.unitsPerEm;
  return Math.max(0, run.positions.reduce((sum, position) => sum + position.xAdvance * scale * scaleX, 0) + Math.max(0, run.glyphs.length - 1) * tracking);
}

function glyphPaths(fontRecord, text, x, baseline, size, {fill = "#fff", tracking = 0, scaleX = 1, opacity = 1} = {}) {
  const {font} = fontRecord;
  const run = font.layout(text);
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const glyphIds = [];
  const paths = [];
  for (let index = 0; index < run.glyphs.length; index += 1) {
    const glyph = run.glyphs[index];
    const position = run.positions[index];
    if (!glyph || glyph.id === 0) throw new Error(`typography-art-direction-missing-glyph:${fontRecord.id}:${[...text][index] || text}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    const gx = cursor + position.xOffset * scale * scaleX;
    const gy = baseline - position.yOffset * scale;
    if (d) paths.push(`<path d="${d}" transform="translate(${gx.toFixed(3)} ${gy.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  return {markup: `<g fill="${fill}" opacity="${opacity}">${paths.join("")}</g>`, glyphIds, width: cursor - x - (run.glyphs.length ? tracking : 0)};
}

function fitLine(fontRecord, text, preferredSize, maxWidth, options = {}) {
  let size = preferredSize;
  while (size > 54 && measure(fontRecord.font, text, size, options.tracking || 0, options.scaleX || 1) > maxWidth) size -= 2;
  return size;
}

function sharedDefs() {
  return `<defs>
    <linearGradient id="signalBlue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#284FEA"/><stop offset="1" stop-color="#1D36A9"/></linearGradient>
    <radialGradient id="cyanBloom" cx="0.2" cy="0.15" r="0.72"><stop offset="0" stop-color="#16D9FF" stop-opacity="0.58"/><stop offset="0.46" stop-color="#12365E" stop-opacity="0.18"/><stop offset="1" stop-color="#08090B" stop-opacity="0"/></radialGradient>
    <radialGradient id="magentaBloom" cx="0.82" cy="0.78" r="0.58"><stop offset="0" stop-color="#F64EB5" stop-opacity="0.34"/><stop offset="1" stop-color="#08090B" stop-opacity="0"/></radialGradient>
    <filter id="softBlur"><feGaussianBlur stdDeviation="52"/></filter>
    <filter id="paperNoise"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="17"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 0.16"/></feComponentTransfer></filter>
    <pattern id="halftone" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2.1" fill="#1B1713" opacity="0.34"/></pattern>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity="0.045"/></pattern>
  </defs>`;
}

function titleStack(plan, {tracking = 0, scaleX = 1, shadow = false, fill = plan.palette.ink} = {}) {
  const titleFont = fonts[plan.titleFontId];
  const nodes = [];
  const receipts = [];
  let baseline = plan.geometry.titleY + (plan.titleLines.length === 1 ? Number(plan.geometry.oneLineShift || 0) : 0);
  for (const line of plan.titleLines) {
    const size = fitLine(titleFont, line, plan.geometry.titleSize, plan.geometry.titleMaxWidth, {tracking, scaleX});
    if (shadow) nodes.push(glyphPaths(titleFont, line, plan.geometry.titleX + 16, baseline + 18, size, {fill: plan.palette.accent, tracking, scaleX, opacity: 0.34}).markup);
    const node = glyphPaths(titleFont, line, plan.geometry.titleX, baseline, size, {fill, tracking, scaleX});
    nodes.push(node.markup);
    receipts.push({role: "title", text: line, fontId: titleFont.id, glyphIds: node.glyphIds, size, scaleX});
    baseline += size + plan.geometry.lineGap;
  }
  return {markup: nodes.join(""), receipts};
}

function supportingType(plan, sizes) {
  const supportFont = fonts[plan.supportFontId];
  const kicker = glyphPaths(supportFont, plan.kickerCopy, sizes.kickerX, sizes.kickerY, sizes.kickerSize, {fill: sizes.kickerFill, tracking: sizes.kickerTracking});
  const support = glyphPaths(supportFont, plan.supportCopy, plan.geometry.supportX, plan.geometry.supportY, sizes.supportSize, {fill: sizes.supportFill, tracking: sizes.supportTracking});
  return {
    markup: `${kicker.markup}${support.markup}`,
    receipts: [
      {role: "kicker", text: plan.kickerCopy, fontId: supportFont.id, glyphIds: kicker.glyphIds, size: sizes.kickerSize},
      {role: "support", text: plan.supportCopy, fontId: supportFont.id, glyphIds: support.glyphIds, size: sizes.supportSize},
    ],
  };
}

function renderMonumental(plan) {
  const title = titleStack(plan, {tracking: -7, scaleX: 1.03});
  const supporting = supportingType(plan, {kickerX: 54, kickerY: 80, kickerSize: 34, kickerFill: plan.palette.paper, kickerTracking: 5, supportSize: 34, supportFill: plan.palette.ink, supportTracking: 2});
  return {markup: `${sharedDefs()}<rect width="1920" height="1080" fill="${plan.palette.paper}"/><rect x="0" y="0" width="1920" height="94" fill="url(#signalBlue)"/><rect x="0" y="844" width="1920" height="106" fill="${plan.palette.accent}"/><rect x="0" y="950" width="1920" height="130" fill="${plan.palette.paper}"/><circle cx="1740" cy="92" r="248" fill="none" stroke="${plan.palette.accent}" stroke-width="42"/><path d="M1448 -80 L1978 450" stroke="${plan.palette.support}" stroke-width="18" opacity="0.84"/>${supporting.markup}${title.markup}<rect x="54" y="1028" width="1812" height="4" fill="${plan.palette.ink}"/>`, titleMarkup: title.markup, receipts: [...title.receipts, ...supporting.receipts]};
}

function renderSerifCrop(plan) {
  const title = titleStack(plan, {tracking: -3});
  const supporting = supportingType(plan, {kickerX: 60, kickerY: 78, kickerSize: 32, kickerFill: plan.palette.accent, kickerTracking: 7, supportSize: 32, supportFill: plan.palette.support, supportTracking: 1});
  return {markup: `${sharedDefs()}<rect width="1920" height="1080" fill="${plan.palette.paper}"/><rect width="1920" height="1080" filter="url(#paperNoise)" opacity="0.38"/><rect x="1240" y="0" width="680" height="1080" fill="url(#halftone)"/><circle cx="1540" cy="528" r="440" fill="none" stroke="${plan.palette.ink}" stroke-width="2" opacity="0.34"/><circle cx="1540" cy="528" r="312" fill="#D6CAB2" opacity="0.72"/><path d="M1280 1080 L1940 160" stroke="${plan.palette.accent}" stroke-width="58" opacity="0.9"/>${supporting.markup}${title.markup}<rect x="60" y="1028" width="420" height="8" fill="${plan.palette.accent}"/>`, titleMarkup: title.markup, receipts: [...title.receipts, ...supporting.receipts]};
}

function renderGradientImpact(plan) {
  const title = titleStack(plan, {tracking: -8, scaleX: 0.96, shadow: true});
  const supporting = supportingType(plan, {kickerX: 38, kickerY: 76, kickerSize: 32, kickerFill: plan.palette.accent, kickerTracking: 4, supportSize: 34, supportFill: plan.palette.support, supportTracking: 2});
  return {markup: `${sharedDefs()}<rect width="1920" height="1080" fill="${plan.palette.paper}"/><rect x="-260" y="-240" width="1700" height="1120" fill="url(#cyanBloom)" filter="url(#softBlur)"/><rect x="720" y="180" width="1500" height="1120" fill="url(#magentaBloom)" filter="url(#softBlur)"/><path d="M0 120 H1920 M0 892 H1920" stroke="#E9FFF9" stroke-width="1" opacity="0.18"/><path d="M1640 0 V1080" stroke="#E9FFF9" stroke-width="1" opacity="0.18"/><rect width="1920" height="1080" fill="url(#scan)"/>${supporting.markup}${title.markup}<rect x="38" y="1028" width="1370" height="3" fill="${plan.palette.accent}"/><circle cx="1810" cy="90" r="54" fill="none" stroke="${plan.palette.ink}" stroke-width="9"/><circle cx="1810" cy="90" r="7" fill="${plan.palette.ink}"/>`, titleMarkup: title.markup, receipts: [...title.receipts, ...supporting.receipts]};
}

const renderers = {"monumental-stack": renderMonumental, "serif-crop": renderSerifCrop, "gradient-impact": renderGradientImpact};

async function measureTitleCoverage(titleMarkup) {
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${titleMarkup}</svg>`;
  const {data, info} = await sharp(Buffer.from(maskSvg)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  let inkPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] <= 16) continue;
    inkPixels += 1;
    const pixel = (index - 3) / 4;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  if (!inkPixels) throw new Error("fullscreen-big-type-empty-title-mask");
  const bounds = {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
  return {bounds, boundsWidthRatio: bounds.width / info.width, boundsHeightRatio: bounds.height / info.height, inkRatio: inkPixels / (info.width * info.height)};
}

const results = [];
for (const fixture of fixtures) {
  for (const plan of compileTypographyArtDirections(fixture)) {
    const rendered = renderers[plan.directionId](plan);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${rendered.markup}</svg>`;
    if (/<text\b/u.test(svg)) throw new Error(`typography-art-direction-svg-text-leak:${plan.fixtureId}:${plan.directionId}`);
    const pixels = await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toBuffer();
    const file = path.join(frameDir, `${fixture.id}--${plan.directionId}.png`);
    fs.writeFileSync(file, pixels);
    const metadata = await sharp(pixels).metadata();
    if (metadata.width !== 1920 || metadata.height !== 1080) throw new Error(`typography-art-direction-dimensions:${file}`);
    const titleCoverage = await measureTitleCoverage(rendered.titleMarkup);
    if (titleCoverage.boundsWidthRatio < plan.coverageIntent.minimumTitleBoundsWidthRatio) throw new Error(`fullscreen-big-type-width:${fixture.id}:${plan.directionId}:${titleCoverage.boundsWidthRatio.toFixed(4)}`);
    if (titleCoverage.inkRatio < plan.coverageIntent.minimumTitleInkRatio) throw new Error(`fullscreen-big-type-ink:${fixture.id}:${plan.directionId}:${titleCoverage.inkRatio.toFixed(4)}`);
    results.push({id: fixture.id, genre: fixture.genre, directionId: plan.directionId, directionLabel: plan.directionLabel, layoutFamily: plan.layoutFamily, materialFamily: plan.materialFamily, exactCopy: plan.exactCopy, supportCopy: plan.supportCopy, titleFontId: plan.titleFontId, supportFontId: plan.supportFontId, planSha256: plan.planSha256, titleCoverage, artifact: {path: path.relative(root, file), sha256: sha(pixels), width: metadata.width, height: metadata.height}, glyphReceipts: rendered.receipts, reviewBoundary: plan.reviewBoundary});
  }
}

const tileWidth = 640;
const tileHeight = 360;
const labelHeight = 44;
const columns = 3;
const sheetLayers = await Promise.all(results.map(async (item, index) => {
  const frame = await sharp(path.join(root, item.artifact.path)).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0A0B0D"/><text x="14" y="19" fill="#F3F0E8" font-family="Arial, sans-serif" font-size="14" font-weight="700">${item.directionLabel}</text><text x="14" y="36" fill="#8FA2A8" font-family="monospace" font-size="11">${item.genre} · READY FOR USER REVIEW</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#0A0B0D"}}).composite([{input: label, left: 0, top: 0}, {input: frame, left: 0, top: labelHeight}]).png().toBuffer();
  return {input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)};
}));
const sheet = await sharp({create: {width: columns * tileWidth, height: fixtures.length * (tileHeight + labelHeight), channels: 4, background: "#0A0B0D"}}).composite(sheetLayers).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "typography-art-direction-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const baselineFile = path.join(root, "work/typography-art-direction-blind-board-v1/typography-art-direction-contact-sheet.png");
const baseline = {contract: "A1FullscreenBigTypeBaseline/v1", status: "FAIL", source: path.relative(root, baselineFile), sourceSha256: fs.existsSync(baselineFile) ? sha(baselineFile) : null, userFinding: "The user requires fullscreen large-type packaging; the prior board remained editorial side-layout rather than a frame takeover.", observedFailures: ["title-does-not-own-full-frame", "side-layout-masquerades-as-packaging", "explanatory-type-scale", "insufficient-edge-crop", "insufficient-title-ink-coverage"]};
fs.writeFileSync(path.join(out, "baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);

const result = {
  contract: "A1FullscreenBigTypePackagingBlindBoard/v1",
  status: "PASS",
  fixtures: fixtures.map((fixture) => ({id: fixture.id, genre: fixture.genre, candidateCount: results.filter((item) => item.id === fixture.id).length})),
  directionCount: 3,
  frameCount: results.length,
  distinctLayoutFamilies: [...new Set(results.map((item) => item.layoutFamily))],
  distinctMaterialFamilies: [...new Set(results.map((item) => item.materialFamily))],
  distinctTitleFonts: [...new Set(results.map((item) => item.titleFontId))],
  fontBindings: Object.values(fonts).map(({id, file, sha256}) => ({id, path: path.relative(root, file), sha256})),
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha(sheet), width: columns * tileWidth, height: fixtures.length * (tileHeight + labelHeight)},
  results,
  boundary: {reviewOnly: true, aestheticApproval: "NONE_USER_REVIEW_REQUIRED", productionAdmission: false, currentWorkspaceMutated: false, currentBoardMutated: false, motionAllowed: false},
};
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtures.length, frameCount: result.frameCount, visibleArtifact: result.visibleArtifact, boundary: result.boundary}, null, 2));
