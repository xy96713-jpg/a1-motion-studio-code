#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {compileSemanticGlyphSequence} from "../apps/studio-next/src/lib/a1-semantic-glyph-behavior-router-v1.mjs";
import {fitCjkLine} from "../apps/studio-next/src/lib/a1-optical-cjk-spacing-v1.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/semantic-glyph-behavior-router-v1");
const frameDir = path.join(out, "frames");
fs.mkdirSync(frameDir, {recursive: true});

const W = 1920;
const H = 1080;
const fixtureSource = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
const routeInputs = fixtureSource.map((fixture) => ({
  id: fixture.id,
  genre: fixture.genre,
  role: fixture.genre === "evidence-explainer" ? "EVIDENCE" : fixture.genre === "product-tutorial" ? "PROCESS" : "VERDICT",
  narrativeVerb: fixture.genre === "evidence-explainer" ? "verify" : fixture.genre === "product-tutorial" ? "transform" : "challenge",
  carrier: "FULLSCREEN_TYPE",
  copy: fixture.title,
}));
const plans = compileSemanticGlyphSequence(routeInputs);
const fontRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache");
const fontPaths = {"source-han-sans-heavy": path.join(fontRoot, "SourceHanSansCN-Heavy.otf"), "source-han-serif-heavy": path.join(fontRoot, "SourceHanSerifCN-Heavy.otf")};
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const fonts = Object.fromEntries(Object.entries(fontPaths).map(([id, file]) => {
  const bytes = fs.readFileSync(file);
  return [id, {font: fontkit.create(bytes), file, sha256: sha256(bytes)}];
}));

function glyphRun(fontRecord, text) {
  return [...text].map((character) => {
    const run = fontRecord.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`semantic-glyph-render-missing:${character}`);
    const box = glyph.path.bbox;
    return {character, glyphId: glyph.id, pathData: glyph.path.toSVG(), advance: position.xAdvance, bounds: {minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY}};
  });
}

function transformsFor(plan, count) {
  return Array.from({length: count}, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    if (plan.behaviorId === "AXIS_RESPONSIVE") return {scaleX: 0.82 + 0.38 * Math.sin(Math.PI * (0.08 + 0.84 * t)) ** 2, scaleY: 0.96 + 0.08 * Math.cos(Math.PI * t), rotate: -2.6 + 5.2 * t, skew: -2 + 4 * Math.sin(Math.PI * t), yOffset: 16 * Math.sin(t * Math.PI * 2)};
    if (plan.behaviorId === "PATH_FIELD") return {scaleX: 0.94, scaleY: 1, rotate: 11 * Math.cos(t * Math.PI * 2), skew: 0, yOffset: 120 * Math.sin(t * Math.PI * 2)};
    return {scaleX: 1, scaleY: 1, rotate: 0, skew: 0, yOffset: 0};
  });
}

function pathFor(spec, fontRecord, plan, fill, {dx = 0, dy = 0, opacity = 1} = {}) {
  const scale = spec.size / fontRecord.font.unitsPerEm;
  const t = spec.transform;
  return `<path d="${spec.pathData}" transform="translate(${(spec.x + dx).toFixed(3)} ${(spec.y + dy).toFixed(3)}) rotate(${t.rotate.toFixed(3)}) skewX(${t.skew.toFixed(3)}) scale(${(scale * plan.scaleX * t.scaleX).toFixed(7)} ${(-scale * plan.scaleY * t.scaleY).toFixed(7)})" fill="${fill}" opacity="${opacity}"/>`;
}

function basePaths(layout, fontRecord, plan, fill = "#111315", options = {}) {
  return layout.glyphs.map((glyph) => pathFor(glyph, fontRecord, plan, fill, options)).join("");
}

function behaviorMarkup(plan, layout, fontRecord) {
  const base = basePaths(layout, fontRecord, plan);
  if (plan.behaviorId === "PRINT_REGISTRATION") {
    return `<defs><mask id="damage"><rect width="1920" height="1080" fill="#fff"/><path d="M170 455L1760 390M140 690L1780 635" stroke="#000" stroke-width="12"/><g fill="#000">${Array.from({length: 34}, (_, index) => `<rect x="${180 + index * 47}" y="${410 + (index * 67) % 260}" width="${5 + index % 9}" height="${7 + index % 13}"/>`).join("")}</g></mask></defs><g transform="translate(-9 7)" opacity=".72">${basePaths(layout, fontRecord, plan, "#2B56DC")}</g><g transform="translate(10 -6)" opacity=".55">${basePaths(layout, fontRecord, plan, "#B8B2A8")}</g><g mask="url(#damage)">${base}</g>`;
  }
  if (plan.behaviorId === "SPLICE_REASSEMBLE") {
    return `<defs><clipPath id="top"><rect width="1920" height="470"/></clipPath><clipPath id="mid"><rect y="470" width="1920" height="155"/></clipPath><clipPath id="bottom"><rect y="625" width="1920" height="455"/></clipPath></defs><g clip-path="url(#top)" transform="translate(-22 0)">${base}</g><g clip-path="url(#mid)" transform="translate(32 -4)">${basePaths(layout, fontRecord, plan, "#2B56DC")}</g><g clip-path="url(#bottom)" transform="translate(-12 3)">${base}</g>`;
  }
  if (plan.behaviorId === "AXIS_RESPONSIVE") {
    return `<defs><linearGradient id="ink" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E94227"/><stop offset=".52" stop-color="#F2762B"/><stop offset="1" stop-color="#F0B72E"/></linearGradient></defs><g>${basePaths(layout, fontRecord, plan, "#111315", {dx: 10, dy: 12, opacity: .88})}${basePaths(layout, fontRecord, plan, "url(#ink)")}</g>`;
  }
  if (plan.behaviorId === "PATH_FIELD") return `<g>${base}</g>`;
  return `<g>${base}</g>`;
}

async function alphaBounds(markup) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${markup}</svg>`;
  const {data, info} = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] <= 16) continue;
    const pixel = (index - 3) / 4;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {x: left, y: top, width: right - left + 1, height: bottom - top + 1, widthRatio: (right - left + 1) / W, heightRatio: (bottom - top + 1) / H, touchesBoundary: left < 18 || top < 18 || right > W - 19 || bottom > H - 19};
}

function smallPathText(fontRecord, text, x, baseline, size, fill) {
  const scale = size / fontRecord.font.unitsPerEm;
  let cursor = x;
  return [...text].map((character) => {
    const run = fontRecord.font.layout(character);
    const glyph = run.glyphs[0];
    const item = `<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(2)} ${baseline.toFixed(2)}) scale(${scale.toFixed(7)} ${(-scale).toFixed(7)})" fill="${fill}"/>`;
    cursor += run.positions[0].xAdvance * scale + size * 0.04;
    return item;
  }).join("");
}

const results = [];
for (const plan of plans) {
  const fontRecord = fonts[plan.fontId];
  const glyphs = glyphRun(fontRecord, plan.exactCopy);
  const transforms = transformsFor(plan, glyphs.length);
  const layout = fitCjkLine({mode: "optical", glyphs, unitsPerEm: fontRecord.font.unitsPerEm, preferredSize: plan.profileId === "EVA_MINCHO" ? 470 : 400, minimumSize: 140, maxWidth: 1740, profileScaleX: plan.scaleX, profileScaleY: plan.scaleY, transforms, centerX: 960, baseline: 670, baseGapEm: plan.opticalGapEm});
  const markup = behaviorMarkup(plan, layout, fontRecord);
  const bounds = await alphaBounds(markup);
  if (/<circle\b/u.test(markup) || /<text\b/u.test(markup)) throw new Error(`semantic-glyph-render-forbidden-geometry:${plan.inputId}`);
  if (bounds.touchesBoundary || bounds.widthRatio < 0.36 || bounds.widthRatio > 0.95 || bounds.heightRatio < 0.16 || bounds.heightRatio > 0.76) throw new Error(`semantic-glyph-render-bounds:${plan.inputId}:${JSON.stringify(bounds)}`);
  if (layout.maximumGapResidualPx > 0.01) throw new Error(`semantic-glyph-render-spacing:${plan.inputId}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5F2EA"/><stop offset="1" stop-color="#EAE5D9"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#paper)"/>${markup}</svg>`;
  const pixels = await sharp(Buffer.from(svg)).png({compressionLevel: 9}).toBuffer();
  const file = path.join(frameDir, `${plan.inputId}--${plan.behaviorId}--${plan.profileId}.png`);
  fs.writeFileSync(file, pixels);
  results.push({...plan, titleBounds: bounds, spacingResidualPx: layout.maximumGapResidualPx, circleCount: 0, artifact: {path: path.relative(root, file), sha256: sha256(pixels), width: W, height: H}});
}

const tileWidth = 640;
const tileHeight = 360;
const headerHeight = 72;
const labelFont = fonts["source-han-sans-heavy"].font;
const header = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="432"><rect width="1920" height="432" fill="#111315"/>${results.map((result, index) => smallPathText({font: labelFont}, `${result.behaviorLabel} · ${result.profileId === "EVA_MINCHO" ? "EVA" : "粗黑"}`, index * tileWidth + 28, 48, 27, index === 2 ? "#FF9B66" : "#F3EFE6")).join("")}</svg>`;
const composites = [];
for (const [index, result] of results.entries()) {
  const cell = await sharp(path.join(root, result.artifact.path)).resize(tileWidth, tileHeight).png().toBuffer();
  composites.push({input: cell, left: index * tileWidth, top: headerHeight});
}
const sheet = await sharp(Buffer.from(header)).composite(composites).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "semantic-glyph-router-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const report = {
  contract: "A1SemanticGlyphBehaviorRouterProof/v1",
  status: "PASS",
  fixtures: routeInputs.map(({id, genre}) => ({id, genre})),
  results,
  summary: {routeCount: results.length, uniqueBehaviorCount: new Set(results.map((item) => item.behaviorId)).size, uniqueProfileCount: new Set(results.map((item) => item.profileId)).size, circleCount: 0, maximumSpacingResidualPx: Math.max(...results.map((item) => item.spacingResidualPx)), currentWorkspaceMutated: false, currentBoardMutated: false, productionAdmission: false, motionAdmission: false},
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha256(sheet), width: 1920, height: 432},
};
if (report.summary.uniqueBehaviorCount < 3 || report.summary.uniqueProfileCount < 2) throw new Error("semantic-glyph-router-insufficient-diversity");
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({contract: report.contract, status: report.status, visibleArtifact: report.visibleArtifact, summary: report.summary}, null, 2));
