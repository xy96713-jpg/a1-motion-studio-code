#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {compileOpenSourceTypographyStack} from "../apps/studio-next/src/lib/a1-open-source-typography-stack-v1.mjs";
import {fitCjkLine} from "../apps/studio-next/src/lib/a1-optical-cjk-spacing-v1.mjs";
import {glyphFontProfileCatalog} from "../apps/studio-next/src/lib/a1-glyph-font-profile-v1.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/open-source-typography-stack-v1");
const frameDir = path.join(out, "frames");
fs.mkdirSync(frameDir, {recursive: true});

const W = 1920;
const H = 1080;
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "test-fixtures/typography-art-direction-v1.json"), "utf8")).fixtures;
const profiles = glyphFontProfileCatalog();
const stack = compileOpenSourceTypographyStack();
const fontRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache");
const fontFiles = {
  "source-han-sans-heavy": path.join(fontRoot, "SourceHanSansCN-Heavy.otf"),
  "source-han-serif-heavy": path.join(fontRoot, "SourceHanSerifCN-Heavy.otf"),
};
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");
const fonts = Object.fromEntries(Object.entries(fontFiles).map(([id, file]) => {
  const bytes = fs.readFileSync(file);
  return [id, {id, file, sha256: sha256(bytes), font: fontkit.create(bytes)}];
}));

const genreMaterial = {
  "evidence-explainer": ["#1937D5", "#18A6E5", "#64D7D0"],
  "product-tutorial": ["#1D3CE5", "#8BCB26", "#E4EF38"],
  "personal-opinion": ["#D52A1D", "#F26824", "#F3B72D"],
};

function glyphRun(fontRecord, text) {
  return [...text].map((character) => {
    const run = fontRecord.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`open-source-type-missing-glyph:${fontRecord.id}:${character}`);
    const box = glyph.path.bbox;
    return {character, glyphId: glyph.id, pathData: glyph.path.toSVG(), advance: position.xAdvance, bounds: {minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY}};
  });
}

function materialTransforms(count) {
  return Array.from({length: count}, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return {
      scaleX: 0.84 + 0.34 * Math.sin(Math.PI * (0.1 + 0.8 * t)) ** 2,
      scaleY: 0.96 + 0.08 * Math.cos(Math.PI * t),
      rotate: -2.4 + 4.8 * t,
      skew: -2.2 + 4.4 * Math.sin(Math.PI * t),
      yOffset: 18 * Math.sin(t * Math.PI * 2),
    };
  });
}

function plainTransforms(count) {
  return Array.from({length: count}, () => ({scaleX: 1, scaleY: 1, rotate: 0, skew: 0, yOffset: 0}));
}

function glyphPath(spec, fontRecord, fill, {dx = 0, dy = 0, opacity = 1} = {}) {
  const scale = spec.size / fontRecord.font.unitsPerEm;
  const transform = spec.transform;
  return `<path d="${spec.pathData}" transform="translate(${(spec.x + dx).toFixed(3)} ${(spec.y + dy).toFixed(3)}) rotate(${transform.rotate.toFixed(3)}) skewX(${transform.skew.toFixed(3)}) scale(${(scale * spec.profileScaleX * transform.scaleX).toFixed(7)} ${(-scale * spec.profileScaleY * transform.scaleY).toFixed(7)})" fill="${fill}" opacity="${opacity}"/>`;
}

function titleMarkup({layout, fontRecord, profile, mode, colors}) {
  const glyphs = layout.glyphs.map((glyph) => ({...glyph, profileScaleX: profile.scaleX, profileScaleY: profile.scaleY}));
  if (mode === "OPTICAL_MATERIAL") {
    const shadow = glyphs.map((glyph) => glyphPath(glyph, fontRecord, "#111315", {dx: 10, dy: 12, opacity: 0.88})).join("");
    const front = glyphs.map((glyph) => glyphPath(glyph, fontRecord, "url(#titleGradient)")).join("");
    return `<g>${shadow}${front}</g>`;
  }
  return `<g>${glyphs.map((glyph) => glyphPath(glyph, fontRecord, "#111315")).join("")}</g>`;
}

function frameSvg({title, mode, profile, fixture}) {
  const fontRecord = fonts[profile.fontId];
  const glyphs = glyphRun(fontRecord, title);
  const transforms = mode === "OPTICAL_CLEAN" ? plainTransforms(glyphs.length) : materialTransforms(glyphs.length);
  const layout = fitCjkLine({
    mode: mode === "UNIFORM_DISTORTED" ? "advance" : "optical",
    glyphs,
    unitsPerEm: fontRecord.font.unitsPerEm,
    preferredSize: profile.id === "EVA_MINCHO" ? 455 : 390,
    minimumSize: 140,
    maxWidth: 1740,
    profileScaleX: profile.scaleX,
    profileScaleY: profile.scaleY,
    transforms,
    centerX: 960,
    baseline: 665,
    trackingEm: profile.preferredTrackingEm,
    baseGapEm: profile.opticalGapEm,
  });
  if (!layout.fits) throw new Error(`open-source-type-does-not-fit:${fixture.id}:${profile.id}:${mode}`);
  const colors = genreMaterial[fixture.genre];
  const markup = titleMarkup({layout, fontRecord, profile, mode, colors});
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F5F2EA"/><stop offset="1" stop-color="#EAE5D9"/></linearGradient><linearGradient id="titleGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${colors[0]}"/><stop offset="0.52" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#paper)"/>${markup}</svg>`;
  const auditSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="titleGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${colors[0]}"/><stop offset="0.52" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient></defs>${markup}</svg>`;
  if (/<circle\b/u.test(svg) || /<text\b/u.test(svg)) throw new Error("open-source-type-forbidden-circle-or-text");
  return {svg, auditSvg, layout, glyphs};
}

async function alphaBounds(svg) {
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
  if (right < left || bottom < top) throw new Error("open-source-type-empty-title");
  return {x: left, y: top, width: right - left + 1, height: bottom - top + 1, widthRatio: (right - left + 1) / W, heightRatio: (bottom - top + 1) / H, touchesBoundary: left < 18 || top < 18 || right > W - 19 || bottom > H - 19};
}

function rms(values) {
  return values.length ? Math.sqrt(values.reduce((sum, value) => sum + value ** 2, 0) / values.length) : 0;
}

function smallPathText(fontRecord, text, x, baseline, size, fill) {
  const scale = size / fontRecord.font.unitsPerEm;
  let cursor = x;
  return [...text].map((character) => {
    const run = fontRecord.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    const item = `<path d="${glyph.path.toSVG()}" transform="translate(${cursor.toFixed(2)} ${baseline.toFixed(2)}) scale(${scale.toFixed(7)} ${(-scale).toFixed(7)})" fill="${fill}"/>`;
    cursor += position.xAdvance * scale + size * 0.04;
    return item;
  }).join("");
}

const modes = [
  {id: "UNIFORM_DISTORTED", label: "旧算法＋字形变形"},
  {id: "OPTICAL_DISTORTED", label: "视觉字距＋字形变形"},
  {id: "OPTICAL_MATERIAL", label: "视觉字距＋字形材质"},
];
const results = [];
for (const fixture of fixtures) {
  for (const profile of profiles) {
    for (const mode of modes) {
      const rendered = frameSvg({title: fixture.title, mode: mode.id, profile, fixture});
      const bounds = await alphaBounds(rendered.auditSvg);
      const residuals = rendered.layout.visualGaps.map((gap, index) => gap - rendered.layout.targetGaps[index]);
      const gapResidualRmsPx = rms(residuals);
      if (bounds.touchesBoundary || bounds.widthRatio < 0.36 || bounds.widthRatio > 0.95 || bounds.heightRatio < 0.16 || bounds.heightRatio > 0.76) throw new Error(`open-source-type-bounds-failed:${fixture.id}:${profile.id}:${mode.id}:${JSON.stringify(bounds)}`);
      if (mode.id !== "UNIFORM_DISTORTED" && rendered.layout.maximumGapResidualPx > 0.01) throw new Error(`open-source-type-optical-residual:${fixture.id}:${profile.id}:${mode.id}:${rendered.layout.maximumGapResidualPx}`);
      const pixels = await sharp(Buffer.from(rendered.svg)).png({compressionLevel: 9}).toBuffer();
      const file = path.join(frameDir, `${fixture.id}--${profile.id}--${mode.id}.png`);
      fs.writeFileSync(file, pixels);
      results.push({
        id: fixture.id,
        genre: fixture.genre,
        exactCopy: fixture.title,
        profileId: profile.id,
        profileLabel: profile.label,
        mode: mode.id,
        fontId: profile.fontId,
        fontSha256: fonts[profile.fontId].sha256,
        scaleX: profile.scaleX,
        opticalGapEm: profile.opticalGapEm,
        titleBounds: bounds,
        fontSize: rendered.layout.fontSize,
        visualGaps: rendered.layout.visualGaps,
        targetGaps: rendered.layout.targetGaps,
        gapResidualRmsPx,
        maximumGapResidualPx: rendered.layout.maximumGapResidualPx,
        circleCount: 0,
        artifact: {path: path.relative(root, file), sha256: sha256(pixels), width: W, height: H},
        reviewBoundary: {reviewOnly: true, aestheticApproval: "NONE_USER_REVIEW_REQUIRED", productionAdmission: false, motionAdmission: false},
      });
    }
  }
}

for (const fixture of fixtures) {
  for (const profile of profiles) {
    const baseline = results.find((item) => item.id === fixture.id && item.profileId === profile.id && item.mode === "UNIFORM_DISTORTED");
    const optical = results.find((item) => item.id === fixture.id && item.profileId === profile.id && item.mode === "OPTICAL_DISTORTED");
    if (!(optical.gapResidualRmsPx < baseline.gapResidualRmsPx * 0.05)) throw new Error(`open-source-type-no-spacing-improvement:${fixture.id}:${profile.id}`);
  }
}

const thumbWidth = 640;
const thumbHeight = 360;
const headerHeight = 72;
const rowHeight = 390;
const rows = fixtures.length * profiles.length;
const sheetHeight = headerHeight + rows * rowHeight;
const labelFont = fonts["source-han-sans-heavy"];
const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${sheetHeight}" viewBox="0 0 1920 ${sheetHeight}"><rect width="1920" height="${sheetHeight}" fill="#111315"/>${modes.map((mode, index) => smallPathText(labelFont, mode.label, index * thumbWidth + 34, 48, 30, index === 2 ? "#9CD7FF" : "#F3EFE6")).join("")}</svg>`;
const composites = [];
let rowIndex = 0;
for (const fixture of fixtures) {
  for (const profile of profiles) {
    for (const [modeIndex, mode] of modes.entries()) {
      const result = results.find((item) => item.id === fixture.id && item.profileId === profile.id && item.mode === mode.id);
      const cell = await sharp(path.join(root, result.artifact.path)).resize(thumbWidth, thumbHeight).png().toBuffer();
      composites.push({input: cell, left: modeIndex * thumbWidth, top: headerHeight + rowIndex * rowHeight});
    }
    rowIndex += 1;
  }
}
const sheet = await sharp(Buffer.from(headerSvg)).composite(composites).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "open-source-typography-stack-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const baselineResiduals = results.filter((item) => item.mode === "UNIFORM_DISTORTED").map((item) => item.gapResidualRmsPx);
const opticalResiduals = results.filter((item) => item.mode !== "UNIFORM_DISTORTED").map((item) => item.gapResidualRmsPx);
const report = {
  contract: "A1OpenSourceTypographyStackProof/v1",
  status: "PASS",
  stack,
  fixtures: fixtures.map(({id, genre}) => ({id, genre})),
  profileCount: profiles.length,
  modeCount: modes.length,
  frameCount: results.length,
  summary: {
    averageBaselineGapResidualRmsPx: baselineResiduals.reduce((sum, value) => sum + value, 0) / baselineResiduals.length,
    maximumOpticalGapResidualRmsPx: Math.max(...opticalResiduals),
    circleCount: results.reduce((sum, item) => sum + item.circleCount, 0),
    directRuntimeDependenciesAdded: [],
    currentWorkspaceMutated: false,
    currentBoardMutated: false,
    productionAdmission: false,
    motionAdmission: false,
  },
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha256(sheet), width: 1920, height: sheetHeight},
  results,
};
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({contract: report.contract, status: report.status, frameCount: report.frameCount, visibleArtifact: report.visibleArtifact, summary: report.summary}, null, 2));
