#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {compileGlyphEffectPrograms} from "../apps/studio-next/src/lib/a1-glyph-effect-program-v1.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/fullscreen-glyph-effect-program-v1");
const frameDir = path.join(out, "frames");
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
fs.mkdirSync(frameDir, {recursive: true});

const W = 1920;
const H = 1080;
const generatedRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache");
const fontFiles = {
  "source-han-sans-heavy": path.join(generatedRoot, "SourceHanSansCN-Heavy.otf"),
  "smiley-sans-oblique": path.join(generatedRoot, "SmileySans-Oblique.otf"),
};
const sha = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const fonts = Object.fromEntries(Object.entries(fontFiles).map(([id, file]) => {
  if (!fs.existsSync(file)) throw new Error(`glyph-effect-font-missing:${id}`);
  const bytes = fs.readFileSync(file);
  return [id, {id, file, sha256: sha(bytes), font: fontkit.create(bytes)}];
}));

const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const hashInt = (value) => Number.parseInt(crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8), 16);

function splitTitle(copy, max = 6) {
  const chars = [...copy];
  if (chars.length <= max) return [copy];
  const punctuation = new Set(["，", "。", "：", "？", "！", "、", ",", ":", "?", "!"]);
  const candidates = chars.map((char, index) => punctuation.has(char) ? index + 1 : -1).filter((index) => index > 1 && index < chars.length - 1);
  const midpoint = chars.length / 2;
  candidates.sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint));
  const splitAt = candidates[0] || Math.ceil(chars.length / 2);
  return [chars.slice(0, splitAt).join(""), chars.slice(splitAt).join("")];
}

function glyphFor(fontRecord, char) {
  const run = fontRecord.font.layout(char);
  const glyph = run.glyphs[0];
  const position = run.positions[0];
  if (!glyph || glyph.id === 0) throw new Error(`glyph-effect-missing-glyph:${fontRecord.id}:${char}`);
  return {glyph, position, pathData: glyph.path.toSVG()};
}

function measureLinear(fontRecord, text, size, transformFor, tracking) {
  let width = 0;
  [...text].forEach((char, index) => {
    const {position} = glyphFor(fontRecord, char);
    const t = transformFor(index, [...text].length);
    width += position.xAdvance * (size / fontRecord.font.unitsPerEm) * t.scaleX + tracking;
  });
  return Math.max(0, width - tracking);
}

function fitSize(fontRecord, lines, preferred, maxWidth, transformFor, tracking) {
  let size = preferred;
  while (size > 96 && Math.max(...lines.map((line) => measureLinear(fontRecord, line, size, transformFor, tracking))) > maxWidth) size -= 2;
  return size;
}

function linearGlyphMarkup({fontRecord, lines, preferredSize, maxWidth, tracking, transformFor, fill, stroke, strokeWidth, shadow, startY, lineGap, groupAttributes = ""}) {
  const size = fitSize(fontRecord, lines, preferredSize, maxWidth, transformFor, tracking);
  const glyphReceipts = [];
  const clean = [];
  const effect = [];
  lines.forEach((line, lineIndex) => {
    const cleanTransform = () => ({scaleX: 1, scaleY: 1, rotate: 0, skew: 0, yOffset: 0, xOffset: 0});
    const effectWidth = measureLinear(fontRecord, line, size, transformFor, tracking);
    const cleanWidth = measureLinear(fontRecord, line, size, cleanTransform, tracking);
    let effectX = (W - effectWidth) / 2;
    let cleanX = (W - cleanWidth) / 2;
    const baseline = startY + lineIndex * (size + lineGap);
    [...line].forEach((char, index) => {
      const {glyph, position, pathData} = glyphFor(fontRecord, char);
      const t = transformFor(index, [...line].length);
      const scale = size / fontRecord.font.unitsPerEm;
      const cleanScale = size / fontRecord.font.unitsPerEm;
      const transform = `translate(${(effectX + t.xOffset).toFixed(2)} ${(baseline + t.yOffset).toFixed(2)}) rotate(${t.rotate.toFixed(2)}) skewX(${t.skew.toFixed(2)}) scale(${(scale * t.scaleX).toFixed(6)} ${(-scale * t.scaleY).toFixed(6)})`;
      const cleanTransformValue = `translate(${cleanX.toFixed(2)} ${baseline.toFixed(2)}) scale(${cleanScale.toFixed(6)} ${(-cleanScale).toFixed(6)})`;
      if (shadow) effect.push(`<path d="${pathData}" transform="translate(${shadow.x} ${shadow.y}) ${transform}" fill="${shadow.color}" opacity="${shadow.opacity}"/>`);
      effect.push(`<path d="${pathData}" transform="${transform}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" paint-order="stroke fill" stroke-linejoin="miter"/>`);
      clean.push(`<path d="${pathData}" transform="${cleanTransformValue}" fill="#fff"/>`);
      glyphReceipts.push({char, glyphId: glyph.id, lineIndex, index, transform: t, size});
      effectX += position.xAdvance * scale * t.scaleX + tracking;
      cleanX += position.xAdvance * cleanScale + tracking;
    });
  });
  return {effectMarkup: `<g ${groupAttributes}>${effect.join("")}</g>`, cleanMarkup: `<g>${clean.join("")}</g>`, glyphReceipts, size};
}

function smallCopy(fontRecord, text, x, y, size, fill) {
  let cursor = x;
  const paths = [];
  for (const char of [...text]) {
    const {position, pathData} = glyphFor(fontRecord, char);
    const scale = size / fontRecord.font.unitsPerEm;
    paths.push(`<path d="${pathData}" transform="translate(${cursor.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})" fill="${fill}"/>`);
    cursor += position.xAdvance * scale + 2;
  }
  return paths.join("");
}

function sharedDefs() {
  return `<defs>
    <linearGradient id="neon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5FF4A"/><stop offset="0.48" stop-color="#A8FA00"/><stop offset="1" stop-color="#34C764"/></linearGradient>
    <linearGradient id="archiveInk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EFFF45"/><stop offset="0.55" stop-color="#B7F700"/><stop offset="1" stop-color="#6FBF00"/></linearGradient>
    <radialGradient id="orbitalInk" cx="42%" cy="32%" r="76%"><stop offset="0" stop-color="#F5FF5A"/><stop offset="0.58" stop-color="#A6ED18"/><stop offset="1" stop-color="#4E9C11"/></radialGradient>
    <radialGradient id="glass" cx="38%" cy="28%" r="78%"><stop offset="0" stop-color="#AEEAFF" stop-opacity="0.25"/><stop offset="0.55" stop-color="#17282C" stop-opacity="0.52"/><stop offset="1" stop-color="#050708" stop-opacity="0.95"/></radialGradient>
    <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#fff" opacity="0.04"/></pattern>
    <pattern id="dots" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.8" fill="#111" opacity="0.32"/></pattern>
    <filter id="roughWarp" x="-10%" y="-15%" width="120%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.018 0.11" numOctaves="2" seed="29" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G"/></filter>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="sliceA"><rect x="0" y="290" width="1920" height="82"/></clipPath>
    <clipPath id="sliceB"><rect x="0" y="590" width="1920" height="96"/></clipPath>
  </defs>`;
}

function damageMask(seed) {
  const marks = [];
  for (let index = 0; index < 108; index += 1) {
    const h = hashInt(`${seed}:${index}`);
    const x = h % W;
    const y = (h >>> 7) % H;
    const width = 5 + ((h >>> 13) % 54);
    const height = 3 + ((h >>> 19) % 18);
    const rotate = -18 + ((h >>> 24) % 37);
    marks.push(index % 3 === 0
      ? `<circle cx="${x}" cy="${y}" r="${Math.max(3, Math.round(width / 4))}" fill="#000"/>`
      : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#000" transform="rotate(${rotate} ${x} ${y})"/>`);
  }
  return `<mask id="damageMask"><rect width="1920" height="1080" fill="#fff"/>${marks.join("")}</mask>`;
}

function neonFrame(program, fixture) {
  const fontRecord = fonts[program.titleFontId];
  const lines = splitTitle(fixture.title, 6);
  const transformFor = (index, count) => ({
    scaleX: 0.78 + 0.15 * Math.sin((index + 1) * 1.37) + (count <= 6 ? 0.09 : 0),
    scaleY: 1.02 + 0.07 * Math.cos(index * 1.11),
    rotate: -2.4 + 4.6 * (index / Math.max(1, count - 1)),
    skew: -4 + 7 * Math.sin(index * 0.83),
    yOffset: 18 * Math.sin(index * 1.2),
    xOffset: 0,
  });
  const title = linearGlyphMarkup({fontRecord, lines, preferredSize: lines.length === 1 ? 330 : 282, maxWidth: 1810, tracking: -12, transformFor, fill: "url(#neon)", stroke: program.edgeProgram.stroke, strokeWidth: program.edgeProgram.strokeWidth, shadow: program.edgeProgram.offsetShadow, startY: lines.length === 1 ? 650 : 430, lineGap: -34});
  const support = smallCopy(fonts["source-han-sans-heavy"], fixture.kicker, 54, 82, 34, "#E9FF44");
  return {
    frameMarkup: `${sharedDefs()}<rect width="1920" height="1080" fill="#090B0A"/><rect x="0" y="0" width="1920" height="1080" fill="url(#scan)"/><path d="M0 162 H1920 M0 910 H1920" stroke="#DFFF5A" opacity="0.16"/><circle cx="1780" cy="122" r="66" fill="none" stroke="#DFFF5A" stroke-width="10"/>${support}<g filter="url(#softGlow)">${title.effectMarkup}</g>`,
    effectTitleMarkup: `${sharedDefs()}${title.effectMarkup}`,
    cleanTitleMarkup: title.cleanMarkup,
    glyphReceipts: title.glyphReceipts,
  };
}

function distressedFrame(program, fixture) {
  const fontRecord = fonts[program.titleFontId];
  const lines = splitTitle(fixture.title, 6);
  const transformFor = (index, count) => ({scaleX: 0.93 + 0.05 * Math.sin(index * 1.9), scaleY: 1, rotate: -1.8 + (index % 3) * 1.7, skew: -2 + (index % 2) * 3.2, yOffset: (index % 2 ? 8 : -6), xOffset: 0});
  const title = linearGlyphMarkup({fontRecord, lines, preferredSize: lines.length === 1 ? 318 : 272, maxWidth: 1790, tracking: -10, transformFor, fill: "url(#archiveInk)", stroke: program.edgeProgram.stroke, strokeWidth: program.edgeProgram.strokeWidth, shadow: program.edgeProgram.offsetShadow, startY: lines.length === 1 ? 650 : 420, lineGap: -30, groupAttributes: `filter="url(#roughWarp)" mask="url(#damageMask)"`});
  const support = smallCopy(fonts["source-han-sans-heavy"], fixture.kicker, 58, 82, 32, "#111411");
  return {
    frameMarkup: `${sharedDefs()}<defs>${damageMask(fixture.id)}</defs><rect width="1920" height="1080" fill="#D7D0C1"/><rect width="1920" height="1080" fill="url(#dots)" opacity="0.34"/><path d="M-80 180 L2010 98 M-120 900 L1970 760" stroke="#F3EFE5" stroke-width="70" opacity="0.78"/><rect x="0" y="0" width="1920" height="1080" fill="none" stroke="#1A1D18" stroke-width="28" opacity="0.68"/>${support}${title.effectMarkup}<g clip-path="url(#sliceA)" transform="translate(22 -4)" opacity="0.72">${title.effectMarkup}</g><g clip-path="url(#sliceB)" transform="translate(-18 6)" opacity="0.64">${title.effectMarkup}</g>`,
    effectTitleMarkup: `${sharedDefs()}<defs>${damageMask(fixture.id)}</defs>${title.effectMarkup}<g clip-path="url(#sliceA)" transform="translate(22 -4)" opacity="0.72">${title.effectMarkup}</g><g clip-path="url(#sliceB)" transform="translate(-18 6)" opacity="0.64">${title.effectMarkup}</g>`,
    cleanTitleMarkup: title.cleanMarkup,
    glyphReceipts: title.glyphReceipts,
  };
}

function orbitalFrame(program, fixture) {
  const fontRecord = fonts[program.titleFontId];
  const groups = splitTitle(fixture.title, 5);
  const arcChars = [...groups[0]];
  const centerChars = [...groups.slice(1).join("")];
  const arcSize = arcChars.length <= 3 ? 214 : 184;
  const centerSize = centerChars.length <= 4 ? 250 : 206;
  const glyphs = [];
  const cleanGlyphs = [];
  const glyphReceipts = [];
  arcChars.forEach((char, index) => {
    const {glyph, pathData} = glyphFor(fontRecord, char);
    const t = arcChars.length === 1 ? 0 : -1 + 2 * (index / (arcChars.length - 1));
    const x = 960 + t * 430;
    const y = 300 + 138 * t * t;
    const rotate = t * 28;
    const scale = arcSize / fontRecord.font.unitsPerEm;
    const scaleX = 0.9 + 0.08 * (1 - Math.abs(t));
    const scaleY = 1 + 0.06 * Math.cos(t * Math.PI);
    const transform = `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotate.toFixed(2)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale * scaleY).toFixed(6)})`;
    glyphs.push(`<path d="${pathData}" transform="translate(14 20) ${transform}" fill="${program.edgeProgram.offsetShadow.color}" opacity="${program.edgeProgram.offsetShadow.opacity}"/>`);
    glyphs.push(`<path d="${pathData}" transform="${transform}" fill="url(#orbitalInk)" stroke="${program.edgeProgram.stroke}" stroke-width="${program.edgeProgram.strokeWidth}" vector-effect="non-scaling-stroke" paint-order="stroke fill"/>`);
    const cleanX = 180 + index * Math.min(180, 1540 / Math.max(1, fixture.title.length));
    cleanGlyphs.push(`<path d="${pathData}" transform="translate(${cleanX.toFixed(2)} 610) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})" fill="#fff"/>`);
    glyphReceipts.push({char, glyphId: glyph.id, group: "arc", index, x, y, rotate, scaleX, scaleY, size: arcSize});
  });
  const centerScale = centerSize / fontRecord.font.unitsPerEm;
  const centerAdvances = centerChars.map((char) => glyphFor(fontRecord, char).position.xAdvance * centerScale * 0.9);
  let centerX = 960 - centerAdvances.reduce((sum, width) => sum + width, 0) / 2;
  centerChars.forEach((char, index) => {
    const {glyph, pathData} = glyphFor(fontRecord, char);
    const scaleX = 0.86 + 0.06 * Math.sin(index * 1.2);
    const scaleY = 1.05 - 0.05 * Math.cos(index * 1.4);
    const y = 690 + 10 * Math.sin(index * 1.1);
    const transform = `translate(${centerX.toFixed(2)} ${y.toFixed(2)}) skewX(-5) scale(${(centerScale * scaleX).toFixed(6)} ${(-centerScale * scaleY).toFixed(6)})`;
    glyphs.push(`<path d="${pathData}" transform="translate(14 20) ${transform}" fill="${program.edgeProgram.offsetShadow.color}" opacity="${program.edgeProgram.offsetShadow.opacity}"/>`);
    glyphs.push(`<path d="${pathData}" transform="${transform}" fill="url(#orbitalInk)" stroke="${program.edgeProgram.stroke}" stroke-width="${program.edgeProgram.strokeWidth}" vector-effect="non-scaling-stroke" paint-order="stroke fill"/>`);
    const cleanIndex = arcChars.length + index;
    const cleanX = 180 + cleanIndex * Math.min(180, 1540 / Math.max(1, fixture.title.length));
    cleanGlyphs.push(`<path d="${pathData}" transform="translate(${cleanX.toFixed(2)} 610) scale(${centerScale.toFixed(6)} ${(-centerScale).toFixed(6)})" fill="#fff"/>`);
    glyphReceipts.push({char, glyphId: glyph.id, group: "center-settle", index, x: centerX, y, rotate: 0, scaleX, scaleY, size: centerSize});
    centerX += centerAdvances[index];
  });
  const titleMarkup = `<g>${glyphs.join("")}</g>`;
  const support = smallCopy(fonts["source-han-sans-heavy"], fixture.kicker, 58, 82, 32, "#B7F428");
  return {
    frameMarkup: `${sharedDefs()}<rect width="1920" height="1080" fill="#070908"/><circle cx="960" cy="540" r="430" fill="#111715" stroke="#53615B" stroke-width="34"/><circle cx="960" cy="540" r="360" fill="url(#glass)" stroke="#97A8A0" stroke-width="5"/><circle cx="830" cy="400" r="170" fill="#C8F5FF" opacity="0.06"/><path d="M520 425 Q960 80 1400 425" fill="none" stroke="#DFFF47" stroke-width="5" opacity="0.34"/>${support}${titleMarkup}<circle cx="960" cy="540" r="358" fill="url(#scan)" opacity="0.32"/>`,
    effectTitleMarkup: `${sharedDefs()}${titleMarkup}`,
    cleanTitleMarkup: `<g>${cleanGlyphs.join("")}</g>`,
    glyphReceipts,
  };
}

const renderers = {NEON_INK_HERO: neonFrame, DISTRESSED_ARCHIVE: distressedFrame, ORBITAL_SURFACE_TYPE: orbitalFrame};

async function rasterize(markup, background = "rgba(0,0,0,0)") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${background}"/>${markup}</svg>`;
  if (/<text\b/u.test(svg)) throw new Error("glyph-effect-svg-text-leak");
  return sharp(Buffer.from(svg)).png({compressionLevel: 9}).toBuffer();
}

async function effectMetrics(effectMarkup, cleanMarkup) {
  const effect = await sharp(await rasterize(effectMarkup)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const clean = await sharp(await rasterize(cleanMarkup)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let effectInk = 0;
  let cleanInk = 0;
  let union = 0;
  let difference = 0;
  const colors = new Set();
  for (let index = 0; index < effect.data.length; index += 4) {
    const ea = effect.data[index + 3];
    const ca = clean.data[index + 3];
    if (ea > 16) {
      effectInk += 1;
      colors.add(`${effect.data[index] >> 4}:${effect.data[index + 1] >> 4}:${effect.data[index + 2] >> 4}`);
    }
    if (ca > 16) cleanInk += 1;
    if (ea > 16 || ca > 16) union += 1;
    if (Math.abs(ea - ca) > 32) difference += 1;
  }
  return {effectInkRatio: effectInk / (W * H), cleanInkRatio: cleanInk / (W * H), alphaDifferenceRatio: difference / Math.max(1, union), surfaceColorBucketCount: colors.size};
}

const results = [];
for (const fixture of fixtures) {
  for (const program of compileGlyphEffectPrograms(fixture)) {
    const rendered = renderers[program.programId](program, fixture);
    const pixels = await rasterize(rendered.frameMarkup, "#090A09");
    const metrics = await effectMetrics(rendered.effectTitleMarkup, rendered.cleanTitleMarkup);
    if (metrics.alphaDifferenceRatio < 0.08) throw new Error(`glyph-effect-insufficient-alpha-delta:${fixture.id}:${program.programId}:${metrics.alphaDifferenceRatio.toFixed(4)}`);
    if (metrics.surfaceColorBucketCount < 5) throw new Error(`glyph-effect-insufficient-surface-color:${fixture.id}:${program.programId}:${metrics.surfaceColorBucketCount}`);
    const file = path.join(frameDir, `${fixture.id}--${program.programId}.png`);
    fs.writeFileSync(file, pixels);
    const metadata = await sharp(pixels).metadata();
    results.push({
      id: fixture.id,
      genre: fixture.genre,
      programId: program.programId,
      label: program.label,
      exactCopy: fixture.title,
      programSha256: program.programSha256,
      titleFontId: program.titleFontId,
      glyphGeometryOperators: program.glyphGeometryOperators,
      fillProgram: program.fillProgram,
      edgeProgram: program.edgeProgram,
      damageProgram: program.damageProgram,
      metrics,
      glyphReceipts: rendered.glyphReceipts,
      artifact: {path: path.relative(root, file), sha256: sha(pixels), width: metadata.width, height: metadata.height},
      reviewBoundary: program.reviewBoundary,
    });
  }
}

const tileWidth = 640;
const tileHeight = 360;
const labelHeight = 46;
const columns = 3;
const tileLayers = await Promise.all(results.map(async (result, index) => {
  const frame = await sharp(path.join(root, result.artifact.path)).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#090B0B"/><text x="14" y="19" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="#F4F1E8">${escapeXml(result.label)}</text><text x="14" y="37" font-family="monospace" font-size="11" fill="#91A5A7">${escapeXml(result.genre)} · glyph delta ${(result.metrics.alphaDifferenceRatio * 100).toFixed(1)}%</text></svg>`);
  const tile = await sharp({create: {width: tileWidth, height: tileHeight + labelHeight, channels: 4, background: "#090B0B"}}).composite([{input: label, left: 0, top: 0}, {input: frame, left: 0, top: labelHeight}]).png().toBuffer();
  return {input: tile, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * (tileHeight + labelHeight)};
}));
const sheet = await sharp({create: {width: columns * tileWidth, height: fixtures.length * (tileHeight + labelHeight), channels: 4, background: "#090B0B"}}).composite(tileLayers).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "glyph-effect-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const baselineFile = path.join(root, "work/fullscreen-big-type-packaging-v1/typography-art-direction-contact-sheet.png");
const baseline = {
  contract: "A1GlyphEffectProgramBaseline/v1",
  status: "FAIL",
  source: path.relative(root, baselineFile),
  sourceSha256: fs.existsSync(baselineFile) ? sha(baselineFile) : null,
  userFinding: "The previous board changed backgrounds and font families but did not directly design glyph geometry or glyph surfaces.",
  observedFailures: ["background-carries-visual-interest", "no-applied-glyph-displacement", "no-glyph-alpha-damage", "no-path-based-glyph-layout", "gradient-is-not-a-complete-effect-program"],
};
fs.writeFileSync(path.join(out, "baseline.json"), `${JSON.stringify(baseline, null, 2)}\n`);

const result = {
  contract: "A1GlyphEffectProgramBlindBoard/v1",
  status: "PASS",
  fixtures: fixtures.map((fixture) => ({id: fixture.id, genre: fixture.genre, candidateCount: results.filter((result) => result.id === fixture.id).length})),
  programCount: 3,
  frameCount: results.length,
  programs: [...new Set(results.map((result) => result.programId))],
  fontBindings: Object.values(fonts).map(({id, file, sha256}) => ({id, path: path.relative(root, file), sha256})),
  researchNote: "work/style-research/fullscreen-glyph-effects-2026-09-16.md",
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha(sheet), width: columns * tileWidth, height: fixtures.length * (tileHeight + labelHeight)},
  results,
  boundary: {reviewOnly: true, aestheticApproval: "NONE_USER_REVIEW_REQUIRED", userVisualApproval: "NOT_APPROVED", productionAdmission: false, currentWorkspaceMutated: false, currentBoardMutated: false, motionAdmission: false},
};
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtures.length, frameCount: result.frameCount, programs: result.programs, visibleArtifact: result.visibleArtifact, boundary: result.boundary}, null, 2));
