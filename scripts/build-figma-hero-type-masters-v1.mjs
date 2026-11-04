#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fitCjkLine} from "../apps/studio-next/src/lib/a1-optical-cjk-spacing-v1.mjs";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sharp = require("sharp");
const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "work/figma-hero-type-masters-v1");
fs.mkdirSync(out, {recursive: true});

const W = 1920;
const H = 1080;
const COPY = "会写不等于会判断";
const fontRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/font-cache");
const fontSpecs = {
  sans: {id: "source-han-sans-heavy", file: path.join(fontRoot, "SourceHanSansCN-Heavy.otf")},
  serif: {id: "source-han-serif-heavy", file: path.join(fontRoot, "SourceHanSerifCN-Heavy.otf")},
};
const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([key, spec]) => {
  const bytes = fs.readFileSync(spec.file);
  return [key, {...spec, bytes, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), font: fontkit.create(bytes)}];
}));
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : fs.readFileSync(value)).digest("hex");

function glyphRun(fontRecord, text) {
  return [...text].map((character) => {
    const run = fontRecord.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`figma-hero-type-missing-glyph:${fontRecord.id}:${character}`);
    const box = glyph.path.bbox;
    return {character, glyphId: glyph.id, pathData: glyph.path.toSVG(), advance: position.xAdvance, bounds: {minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY}};
  });
}

function layoutText({fontRecord, text, profileScaleX, preferredSize, maxWidth, centerX, baseline, opticalGapEm, transforms}) {
  const glyphs = glyphRun(fontRecord, text);
  const resolvedTransforms = transforms || glyphs.map(() => ({scaleX: 1, scaleY: 1, rotate: 0, skew: 0, yOffset: 0}));
  return fitCjkLine({mode: "optical", glyphs, unitsPerEm: fontRecord.font.unitsPerEm, preferredSize, minimumSize: 100, maxWidth, profileScaleX, profileScaleY: 1, transforms: resolvedTransforms, centerX, baseline, baseGapEm: opticalGapEm});
}

function glyphPath(glyph, fontRecord, profileScaleX, fill) {
  const scale = glyph.size / fontRecord.font.unitsPerEm;
  const t = glyph.transform;
  return `<path data-character="${glyph.character}" data-glyph-id="${glyph.glyphId}" d="${glyph.pathData}" transform="translate(${glyph.x.toFixed(3)} ${glyph.y.toFixed(3)}) rotate(${t.rotate.toFixed(3)}) skewX(${t.skew.toFixed(3)}) scale(${(scale * profileScaleX * t.scaleX).toFixed(7)} ${(-scale * t.scaleY).toFixed(7)})" fill="${fill}"/>`;
}

function renderGlyphs(layout, fontRecord, profileScaleX, fillFor) {
  return layout.glyphs.map((glyph, index) => glyphPath(glyph, fontRecord, profileScaleX, fillFor(glyph, index))).join("");
}

function layoutInkBounds(layout) {
  const left = Math.min(...layout.glyphs.map((glyph) => glyph.inkBounds.left));
  const right = Math.max(...layout.glyphs.map((glyph) => glyph.inkBounds.right));
  const top = Math.min(...layout.glyphs.map((glyph) => glyph.y + glyph.localInkBounds.minY));
  const bottom = Math.max(...layout.glyphs.map((glyph) => glyph.y + glyph.localInkBounds.maxY));
  return {left, right, top, bottom, width: right - left, height: bottom - top};
}

function assertSeparatedGroups(groups, minimumGapPx, masterId) {
  const bounds = groups.map(layoutInkBounds);
  const verticalGaps = bounds.slice(1).map((current, index) => current.top - bounds[index].bottom);
  if (verticalGaps.some((gap) => gap < minimumGapPx)) throw new Error(`figma-hero-type-group-collision:${masterId}:${verticalGaps.join(",")}`);
  return {minimumRequiredGapPx: minimumGapPx, verticalGaps, bounds};
}

function svgDocument({name, background, defs = "", content}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-a1-contract="A1FigmaHeroTypeMaster/v1" data-a1-name="${name}" data-copy="${COPY}"><defs>${defs}</defs><rect id="Background" width="${W}" height="${H}" fill="${background}"/>${content}</svg>`;
}

const masters = [];

{
  const font = fonts.serif;
  const upper = layoutText({fontRecord: font, text: "会写", profileScaleX: 0.72, preferredSize: 330, maxWidth: 650, centerX: 410, baseline: 385, opticalGapEm: 0.036});
  const lower = layoutText({fontRecord: font, text: "不等于会判断", profileScaleX: 0.68, preferredSize: 520, maxWidth: 1600, centerX: 1030, baseline: 825, opticalGapEm: 0.034});
  const separation = assertSeparatedGroups([upper, lower], 48, "01-editorial-mincho");
  const content = `<g id="Hero-Editorial-Mincho"><g id="Context">${renderGlyphs(upper, font, 0.72, () => "#111315")}</g><g id="Verdict">${renderGlyphs(lower, font, 0.68, (_glyph, index) => index >= lower.glyphs.length - 2 ? "#2954D6" : "#111315")}</g></g>`;
  masters.push({id: "01-editorial-mincho", label: "编辑宋体／语义层级", fontId: font.id, fontSha256: font.sha256, svg: svgDocument({name: "Editorial Mincho Semantic Hierarchy", background: "#F2EFE7", content}), checks: {lineCount: 2, randomTransformCount: 0, circleCount: 0, gradientCount: 0, separation}});
}

{
  const font = fonts.sans;
  const first = layoutText({fontRecord: font, text: "会写", profileScaleX: 0.96, preferredSize: 345, maxWidth: 620, centerX: 390, baseline: 347, opticalGapEm: 0.026});
  const bridge = layoutText({fontRecord: font, text: "不等于", profileScaleX: 0.92, preferredSize: 255, maxWidth: 650, centerX: 930, baseline: 640, opticalGapEm: 0.024});
  const verdict = layoutText({fontRecord: font, text: "会判断", profileScaleX: 0.96, preferredSize: 430, maxWidth: 900, centerX: 1420, baseline: 996, opticalGapEm: 0.028});
  const separation = assertSeparatedGroups([first, bridge, verdict], 48, "02-asymmetric-grid");
  const content = `<g id="Hero-Asymmetric-Grid"><g id="Premise">${renderGlyphs(first, font, 0.96, () => "#F2EFE7")}</g><g id="Relation">${renderGlyphs(bridge, font, 0.92, () => "#9A9DA5")}</g><g id="Judgement">${renderGlyphs(verdict, font, 0.96, () => "#4E76F2")}</g></g>`;
  masters.push({id: "02-asymmetric-grid", label: "非对称网格／语义分组", fontId: font.id, fontSha256: font.sha256, svg: svgDocument({name: "Asymmetric Semantic Grid", background: "#101216", content}), checks: {lineCount: 3, randomTransformCount: 0, circleCount: 0, gradientCount: 0, separation}});
}

{
  const font = fonts.serif;
  const upper = layoutText({fontRecord: font, text: "会写不等于", profileScaleX: 0.78, preferredSize: 255, maxWidth: 1220, centerX: 960, baseline: 320, opticalGapEm: 0.035});
  const lower = layoutText({fontRecord: font, text: "会判断", profileScaleX: 0.72, preferredSize: 560, maxWidth: 1320, centerX: 960, baseline: 888, opticalGapEm: 0.038});
  const separation = assertSeparatedGroups([upper, lower], 48, "03-controlled-material");
  const defs = `<linearGradient id="JudgementGradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#263DD4"/><stop offset="0.55" stop-color="#267FCF"/><stop offset="1" stop-color="#24B9B0"/></linearGradient>`;
  const upperPaths = renderGlyphs(upper, font, 0.78, () => "#111315");
  const shadowPaths = lower.glyphs.map((glyph) => glyphPath({...glyph, x: glyph.x + 9, y: glyph.y + 12}, font, 0.72, "#111315")).join("");
  const lowerPaths = renderGlyphs(lower, font, 0.72, () => "url(#JudgementGradient)");
  const content = `<g id="Hero-Controlled-Material"><g id="Context">${upperPaths}</g><g id="Judgement-Underprint">${shadowPaths}</g><g id="Judgement-Gradient">${lowerPaths}</g></g>`;
  masters.push({id: "03-controlled-material", label: "克制材质／渐变只给判断", fontId: font.id, fontSha256: font.sha256, svg: svgDocument({name: "Controlled Material Hierarchy", background: "#F2EFE7", defs, content}), checks: {lineCount: 2, randomTransformCount: 0, circleCount: 0, gradientCount: 1, separation}});
}

const rendered = [];
for (const master of masters) {
  const svgFile = path.join(out, `${master.id}.svg`);
  const pngFile = path.join(out, `${master.id}.png`);
  fs.writeFileSync(svgFile, `${master.svg}\n`);
  const png = await sharp(Buffer.from(master.svg)).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(pngFile, png);
  rendered.push({...master, svgPath: path.relative(root, svgFile), svgSha256: sha256(Buffer.from(master.svg)), pngPath: path.relative(root, pngFile), pngSha256: sha256(png)});
}

const tiles = await Promise.all(rendered.map(async (master, index) => ({input: await sharp(path.join(root, master.pngPath)).resize(640, 360).png().toBuffer(), left: index * 640, top: 0})));
const sheet = await sharp({create: {width: 1920, height: 360, channels: 4, background: "#111315"}}).composite(tiles).png({compressionLevel: 9}).toBuffer();
const sheetFile = path.join(out, "figma-hero-type-masters-contact-sheet.png");
fs.writeFileSync(sheetFile, sheet);

const report = {
  contract: "A1FigmaHeroTypeMasterSet/v1",
  status: "PASS",
  exactCopy: COPY,
  masterCount: rendered.length,
  masters: rendered.map(({svg, ...master}) => master),
  visibleArtifact: {path: path.relative(root, sheetFile), sha256: sha256(sheet), width: 1920, height: 360},
  boundary: {reviewOnly: true, currentWorkspaceMutated: false, currentBoardMutated: false, productionAdmission: false, motionAdmission: false},
};
fs.writeFileSync(path.join(out, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({contract: report.contract, status: report.status, masterCount: report.masterCount, visibleArtifact: report.visibleArtifact, masters: report.masters.map(({id, label, svgPath, pngPath, checks}) => ({id, label, svgPath, pngPath, checks})), boundary: report.boundary}, null, 2));
