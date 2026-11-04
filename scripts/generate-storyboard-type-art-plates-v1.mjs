#!/usr/bin/env node
/**
 * Generate per-shot editable SVG type-plate specs.
 *
 * This does not bake raster text. It creates deterministic art-direction specs
 * consumed by the Remotion renderer so each headline can have a dedicated
 * title-plate treatment while preserving editable source text metadata.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import {createRequire} from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const fontkit = require("fontkit");

const root = process.cwd();
const phaseId = "storyboard-type-art-plates-v1";
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const outPath = path.join(root, "remotion-renderer/src/generated/typeArtPlates.json");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const fontRoot = path.join(root, "remotion-renderer/public/style-guides/experimental-editorial-tech-v1/fonts");
const fontPathByStyle = {
  sans: path.join(fontRoot, "SourceHanSansCN-Heavy.otf"),
  serif: path.join(fontRoot, "SourceHanSerifCN", "SourceHanSerifCN-Heavy.otf"),
};
const fontCache = new Map();

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
function writeJson(filePath, value) { fs.mkdirSync(path.dirname(filePath), {recursive:true}); fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8"); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function hashText(value) { return crypto.createHash("sha1").update(value).digest("hex").slice(0, 8); }
function chars(value) { return Array.from(String(value || "")).length; }
function fontForStyle(styleId) {
  const kind = styleId.includes("serif") ? "serif" : "sans";
  if (!fontCache.has(kind)) fontCache.set(kind, fontkit.openSync(fontPathByStyle[kind]));
  return {kind, font: fontCache.get(kind)};
}

const props = readJson(propsPath);
const scenes = props.scenes || [];
const styleByPreset = {
  "poster-slam": ["acid-poster-slab", "serif-shock-cut", "archive-stencil-poster"],
  "cinema-condensed": ["red-cut-cinema", "optic-letterbox", "compressed-impact"],
  "keyword-mask": ["keyword-stencil", "archive-stencil-keyword", "serif-shock-cut"],
  "archive-label": ["archive-label-plate"],
  "quiet-subtitle": ["quiet-type-wrap"],
};
const paletteByStyle = {
  "acid-poster-slab": {primary:"#f7ff00", secondary:"#111315", paper:"#f5f6f1", accent:"#2448d8"},
  "serif-shock-cut": {primary:"#f7ff00", secondary:"#111315", paper:"#f5f6f1", accent:"#007a4d"},
  "archive-stencil-poster": {primary:"#2448d8", secondary:"#111315", paper:"#f5f6f1", accent:"#007a4d"},
  "red-cut-cinema": {primary:"#ff2600", secondary:"#111315", paper:"#f5f6f1", accent:"#2448d8"},
  "optic-letterbox": {primary:"#ff2600", secondary:"#111315", paper:"#f5f6f1", accent:"#007a4d"},
  "compressed-impact": {primary:"#ff2600", secondary:"#111315", paper:"#f5f6f1", accent:"#2448d8"},
  "keyword-stencil": {primary:"#2448d8", secondary:"#111315", paper:"#f5f6f1", accent:"#f7ff00"},
  "archive-stencil-keyword": {primary:"#007a4d", secondary:"#111315", paper:"#f5f6f1", accent:"#2448d8"},
  "archive-label-plate": {primary:"#007a4d", secondary:"#111315", paper:"#f5f6f1", accent:"#2448d8"},
  "quiet-type-wrap": {primary:"#111315", secondary:"#2448d8", paper:"#f5f6f1", accent:"#007a4d"},
};
function pickStyle(scene) {
  const preset = scene.storyboard?.typographyDirector?.preset || "keyword-mask";
  const role = scene.storyboard?.typographyDirector?.colorRole || "";
  if (preset === "poster-slam") return role === "archive-green" ? "archive-stencil-poster" : "acid-poster-slab";
  if (preset === "cinema-condensed") return "red-cut-cinema";
  if (preset === "keyword-mask") return role === "archive-green" ? "archive-stencil-keyword" : "keyword-stencil";
  if (preset === "archive-label") return "archive-label-plate";
  return "quiet-type-wrap";
}
function geometryFor(text, preset, styleId) {
  const c = chars(text);
  const width = Math.min(1760, Math.max(720, c * (preset === "cinema-condensed" ? 135 : preset === "poster-slam" ? 152 : 118)));
  const height = preset === "cinema-condensed" ? 460 : preset === "poster-slam" ? 520 : 330;
  const fontSize = Math.min(preset === "cinema-condensed" ? 230 : 270, Math.max(preset === "keyword-mask" ? 150 : 190, Math.round(width / Math.max(3.8, c * .76))));
  return {
    width,
    height,
    fontSize,
    textLength: Math.round(width * (preset === "cinema-condensed" ? .72 : preset === "poster-slam" ? .68 : .76)),
    x: 24,
    y: Math.round(height * (preset === "keyword-mask" ? .56 : .62)),
    scaleX: preset === "cinema-condensed" ? .62 : preset === "poster-slam" ? .7 : .82,
    scaleY: preset === "cinema-condensed" ? 1.58 : preset === "poster-slam" ? 1.32 : 1.12,
    skewDeg: styleId.includes("cut") ? -5 : styleId.includes("stencil") ? -2 : 0,
    cutCount: Math.min(5, Math.max(2, Math.ceil(c / 3))),
    blockCount: preset === "quiet-subtitle" ? 1 : 3,
  };
}
function glyphsFor(text, geometry, preset, styleId, beatId) {
  const list = Array.from(text);
  const seed = Number.parseInt(hashText(`${beatId}:${text}:${styleId}`).slice(0, 6), 16);
  const {kind, font} = fontForStyle(styleId);
  const step = geometry.fontSize * geometry.scaleX * 1.04;
  return list.map((char, index) => {
    const wave = ((seed >> (index % 12)) + index * 17) % 29;
    const tall = preset === "cinema-condensed" ? 1.18 : preset === "poster-slam" ? 1.12 : 1.04;
    const glyph = font.glyphForCodePoint(char.codePointAt(0));
    return {
      index,
      char,
      fontKind: kind,
      fontUnitsPerEm: font.unitsPerEm,
      advanceWidth: glyph.advanceWidth,
      pathData: glyph.path.toSVG(),
      x: Math.round(geometry.x + index * step + (index % 2 ? -4 : 4)),
      y: geometry.y,
      rotate: Number((styleId.includes("cut") ? -1.2 : 0).toFixed(2)),
      scaleX: Number((geometry.scaleX * (.98 + (wave % 3) * .01)).toFixed(3)),
      scaleY: Number((geometry.scaleY * tall * (.99 + (wave % 3) * .01)).toFixed(3)),
      skewDeg: Number(geometry.skewDeg.toFixed(2)),
      cutY: Number((.32 + (wave % 5) * .09).toFixed(2)),
      cutW: Number((.34 + (wave % 4) * .06).toFixed(2)),
      blockOffset: 0,
    };
  });
}

const plates = scenes.map((scene, index) => {
  const director = scene.storyboard?.typographyDirector || {};
  const text = director.displayText || scene.presentation?.primary || scene.titleLines?.join("") || scene.beatId;
  const preset = director.preset || "keyword-mask";
  const styleId = pickStyle(scene);
  const palette = {...(paletteByStyle[styleId] || paletteByStyle["keyword-stencil"])};
  if (director.colorRole === "signal-yellow") palette.primary = "#f7ff00";
  if (director.colorRole === "verdict-red") palette.primary = "#ff2600";
  if (director.colorRole === "archive-green" && preset !== "poster-slam" && preset !== "cinema-condensed") palette.primary = "#007a4d";
  const geometry = geometryFor(text, preset, styleId);
  return {
    contract: "A1EditableTypeArtPlate/v1",
    beatId: scene.beatId,
    order: index,
    text,
    latinText: director.latinText || null,
    preset,
    styleId,
    sourceTextSha1: hashText(text),
    editableTextLayer: true,
    imageBakedTextAllowed: false,
    generatedArtworkTextAllowed: false,
    palette,
    geometry,
    glyphs: glyphsFor(text, geometry, preset, styleId, scene.beatId),
    rationale: `Per-shot editable SVG type plate for ${preset}; style ${styleId}.`,
  };
});
const report = {
  contract: "A1StoryboardTypeArtPlates/v1",
  phaseId,
  status: plates.length === scenes.length && plates.length > 0 ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  source: {
    propsPath: path.relative(root, propsPath),
    propsSha256: sha256(fs.readFileSync(propsPath)),
    outPath: path.relative(root, outPath),
  },
  summary: {
    sceneCount: scenes.length,
    plateCount: plates.length,
    byStyleId: plates.reduce((acc, plate) => (acc[plate.styleId] = (acc[plate.styleId] || 0) + 1, acc), {}),
    byPreset: plates.reduce((acc, plate) => (acc[plate.preset] = (acc[plate.preset] || 0) + 1, acc), {}),
  },
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  nextAction: "renderer-consume-type-art-plates",
};
const payload = {contract:"A1StoryboardTypeArtPlateManifest/v1", generatedAt: report.generatedAt, sourcePropsSha256: report.source.propsSha256, plates};
writeJson(outPath, payload);
writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({status: report.status, summary: report.summary, outPath: path.relative(root, outPath), reportPath: path.relative(root, path.join(artifactRoot, "report.json")), publicReportPath: path.relative(root, path.join(publicRoot, "report.json"))}, null, 2));
if (report.status !== "PASS") process.exitCode = 2;
