#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const sourceFile = path.join(generatedRoot, "creator-packaging-candidate-decision-v1/ED-19-c4.png");
const outputDir = path.join(generatedRoot, "ed19-c4-editable-typography-v1");
const outputFile = path.join(outputDir, "ED-19-c4-typography-composite.png");
const manifestFile = path.join(outputDir, "manifest.json");
const fontFile = path.join(generatedRoot, "font-cache/fusion-pixel.ttf");
const fontSha256 = "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32";
const sourceSha256 = "9078b230502dbccb895fbc043570c50b78d7fa37f4ed09f8ecd28d19431d672a";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");
const font = fontkit.create(fs.readFileSync(fontFile));
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;

if (fileSha256(sourceFile) !== sourceSha256) throw new Error("ed19-c4-source-sha-mismatch");
if (fileSha256(fontFile) !== fontSha256) throw new Error("ed19-c4-font-sha-mismatch");

function glyphLine({id, text, x, y, size, tracking = 0, color, role}) {
  const scale = size / font.unitsPerEm;
  let cursor = x;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`ed19-c4-font-glyph-missing:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    markup: `<g fill="${color}">${paths.join("")}</g>`,
    spec: {id, text, role, fontAssetId: "type-pixel-correction", fontFamily: "A1 Fusion Pixel", fontSha256, renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", x, y, size, tracking, color, editable: true, generated: false, glyphIds},
  };
}

const nodes = [
  glyphLine({id: "ed19-identity", text: "Codex 在后台", x: 92, y: 154, size: 68, tracking: 2, color: "#f3f1e9", role: "identity-title"}),
  glyphLine({id: "ed19-step-01", text: "整理", x: 790, y: 150, size: 54, tracking: 2, color: "#2452ff", role: "sequence-step"}),
  glyphLine({id: "ed19-step-02", text: "编排", x: 1040, y: 150, size: 54, tracking: 2, color: "#f3f1e9", role: "sequence-step"}),
  glyphLine({id: "ed19-step-03", text: "读取", x: 1290, y: 150, size: 54, tracking: 2, color: "#f3f1e9", role: "sequence-step"}),
  glyphLine({id: "ed19-step-04", text: "检查", x: 1540, y: 150, size: 54, tracking: 2, color: "#2452ff", role: "sequence-step"}),
];
const connector = '<g fill="#2452ff"><rect x="735" y="119" width="20" height="8"/><rect x="985" y="119" width="20" height="8"/><rect x="1235" y="119" width="20" height="8"/><rect x="1485" y="119" width="20" height="8"/></g>';
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${connector}${nodes.map((node) => node.markup).join("")}</svg>`);
const source = await sharp(sourceFile).resize(1920, 1080, {fit: "fill"}).png().toBuffer();
const output = await sharp(source).composite([{input: svg}]).png({compressionLevel: 9}).toBuffer();
fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputFile, output);
const artifactSha256 = sha256(output);
const manifestBody = {
  contract: "A1ED19C4EditableTypographyComposite/v1",
  status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
  shotId: "ED-19",
  source: {publicUrl: publicUrl(sourceFile), sha256: sourceSha256},
  artifact: {publicUrl: publicUrl(outputFile), sha256: artifactSha256, width: 1920, height: 1080},
  semanticJob: "Codex 在后台沿一条路径完成整理、编排、读取与检查",
  route: "semantic-crt-explainer",
  semanticAction: "sequence",
  styleProfile: "minimal-retro-pixel-editorial-v2",
  primaryFamily: "one-bit-character-object",
  evaRole: "TYPOGRAPHY_ONLY",
  formalTypographyBinding: {contract: "A1FormalTypographyGlyphBinding/v1", renderer: "FONTKIT_DIRECT_GLYPH_OUTLINES", fontAssetId: "type-pixel-correction", fontFamily: "A1 Fusion Pixel", fontSha256, editableText: true, generatedFormalText: false, exactCopy: ["Codex 在后台", "整理", "编排", "读取", "检查"], textNodes: nodes.map((node) => node.spec)},
  boundaries: {imageGenerationPerformed: false, sourceLookMasterPreserved: true, motionPerformed: false, resolveUsed: false, assemblyCreated: false},
};
const manifest = {...manifestBody, manifestSha256: sha256(manifestBody), generatedAt: new Date().toISOString()};
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({status: manifest.status, artifact: manifest.artifact, manifestSha256: manifest.manifestSha256, textNodeCount: nodes.length, imageGenerationPerformed: false}, null, 2));
