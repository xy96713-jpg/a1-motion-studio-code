#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v5");
const frameRoot = path.join(outputRoot, "frames");
const baseRoot = path.join(outputRoot, "bases");
const briefRoot = path.join(root, "work/style-research/typography-master-board-v5/briefs");
const publicRoot = path.join(root, "apps/studio-next/public");
const workbenchRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const appFile = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const palette = {ink: "#101315", coolWhite: "#eef2f3", blue: "#2452ff", acid: "#dfff68", charcoal: "#16191c"};

const fontSpecs = {
  pixel: {assetId: "type-pixel-correction", family: "A1 Fusion Pixel", file: path.join(workbenchRoot, "font-cache/fusion-pixel.ttf"), expectedSha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"},
  slanted: {assetId: "type-slanted-display", family: "A1 Smiley Sans", file: path.join(workbenchRoot, "font-cache/SmileySans-Oblique.otf"), expectedSha256: "93d1dac7c3752acce1b959d6e7460eb88c4acb325cc9e9f5f42e61c29216a758"},
};

const sourceSpecs = {
  document: {assetId: "source-documentary-document-surface", file: path.join(workbenchRoot, "source-cache/document-surface.png"), expectedSha256: "a7410a5a460375f048a40990f9b0896dc036221e05d4ac2794fec8eae5307ac9", evidenceBoundary: "real article document surface; visible only inside renderer-bound glyph mask"},
  openai: {assetId: "source-entity-openai", identity: "GPT / OpenAI", file: path.join(workbenchRoot, "source-cache/openai.svg"), expectedSha256: "84d4b7045808f20b6e26255f9cfe7f191fd623c56b5b036fd632bf72618f379c"},
  claude: {assetId: "source-entity-claude", identity: "Claude", file: path.join(workbenchRoot, "source-cache/claude.svg"), expectedSha256: "9f8b9b2255698ce54168d596502d5787b8413afb85beac35d85555b6fe7df58a"},
  kimi: {assetId: "source-entity-kimi", identity: "Kimi", file: path.join(workbenchRoot, "source-cache/kimi.svg"), expectedSha256: "f443e0ca26b43e6d8e08854e45d80ce72599d9f1a96513cccfbfb36de8c62f7e"},
  deepseek: {assetId: "source-entity-deepseek", identity: "DeepSeek", file: path.join(workbenchRoot, "source-cache/deepseek.svg"), expectedSha256: "3c6c62a4fd73090c76c025f0ef5fbe17cd53d6999803c3f2519673febcbcc6a7"},
  zhipu: {assetId: "source-network-zhipu-official-mark", identity: "智谱", file: path.join(workbenchRoot, "source-cache/zhipu-bigmodel-white-logo.png"), expectedSha256: "19e520d11f87dd46c6b1b828d1b109fe4b837dc0f1d07ec4c343e54567ba05d7"},
  entityPlate: {assetId: "official-named-entity-source-plate-ed12", file: path.join(workbenchRoot, "source-cache/semantic-source-plates-v1/named-models-ed12.png"), expectedSha256: "eddcc3e363f5568192b4897025845bd7b9bbe7b8bb06d32e83a1cdd20929aa74"},
};

const backgroundSpecs = {
  dark: {assetId: "background-charcoal-contour-quiet-field-v1", file: path.join(workbenchRoot, "article-asset-background-lane-v1/candidates/background-charcoal-contour-quiet-field-v1.png"), expectedSha256: "4c79e95c8b6a458cc709cd0544faf213add376edc5e4edddc4287cdb395b91b9"},
};

function bindFile(spec, label) {
  if (!fs.existsSync(spec.file)) throw new Error(`${label}-missing:${spec.file}`);
  const actualSha256 = fileSha256(spec.file);
  if (actualSha256 !== spec.expectedSha256) throw new Error(`${label}-sha-mismatch:${actualSha256}`);
  return {...spec, actualSha256};
}

const fonts = Object.fromEntries(Object.entries(fontSpecs).map(([key, spec]) => {
  const bound = bindFile(spec, `font-${key}`);
  const bytes = fs.readFileSync(bound.file);
  return [key, {...bound, bytes, font: fontkit.create(bytes)}];
}));
const sources = Object.fromEntries(Object.entries(sourceSpecs).map(([key, spec]) => [key, bindFile(spec, `source-${key}`)]));
const backgrounds = Object.fromEntries(Object.entries(backgroundSpecs).map(([key, spec]) => [key, bindFile(spec, `background-${key}`)]));

const briefFiles = ["01-contained-verdict.json", "02-baseline-cascade.json", "03-source-cut-through.json", "04-official-entity-constellation.json"];
const briefs = briefFiles.map((file) => ({file: path.join(briefRoot, file), value: readJson(path.join(briefRoot, file))}));
for (const {file, value} of briefs) {
  if (value.contract !== "A1RetroPixelEditorialStyleBrief/v1") throw new Error(`style-brief-contract-invalid:${file}`);
  const variation = value.variation || {};
  const expected = [variation.primaryFamily, variation.surfaceLogic, variation.dominantActor, variation.composition, variation.palette].join("|");
  if (value.fingerprint !== expected) throw new Error(`style-brief-fingerprint-invalid:${file}`);
}

function glyphLine({id, fontKey, text, x, y, size, tracking = 0, scaleX = 1, color, role, language, contrastClass = "large", deliberateCrop = false, renderMode = "solid", dominant = false}) {
  const fontSpec = fonts[fontKey];
  const font = fontSpec.font;
  const scale = size / font.unitsPerEm;
  let cursor = x;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const paths = [];
  const glyphIds = [];
  for (const character of [...text]) {
    const run = font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`missing-glyph:${fontSpec.family}:${character}`);
    glyphIds.push(glyph.id);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${(scale * scaleX).toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    const bbox = glyph.bbox;
    if (bbox && bbox.maxX > bbox.minX && bbox.maxY > bbox.minY) {
      minX = Math.min(minX, cursor + bbox.minX * scale * scaleX);
      maxX = Math.max(maxX, cursor + bbox.maxX * scale * scaleX);
      minY = Math.min(minY, y - bbox.maxY * scale);
      maxY = Math.max(maxY, y - bbox.minY * scale);
    }
    cursor += position.xAdvance * scale * scaleX + tracking;
  }
  const bounds = Number.isFinite(minX) ? {x: Number(minX.toFixed(2)), y: Number(minY.toFixed(2)), width: Number((maxX - minX).toFixed(2)), height: Number((maxY - minY).toFixed(2))} : {x, y: y - size, width: Math.max(0, cursor - x), height: size};
  return {markup: `<g fill="${color}">${paths.join("")}</g>`, spec: {id, text, role, language, fontAssetId: fontSpec.assetId, fontFamily: fontSpec.family, fontSha256: fontSpec.actualSha256, geometry: {x, y, size, tracking, scaleX}, bounds, color, contrastClass, deliberateCrop, renderMode, dominant, glyphCount: glyphIds.length, glyphIds, editable: true, generated: false}};
}

const area = (bounds) => Math.max(0, bounds.width) * Math.max(0, bounds.height);
function hierarchy(nodes) {
  const entries = nodes.map((node) => ({id: node.spec.id, area: area(node.spec.bounds), dominant: node.spec.dominant}));
  const totalArea = entries.reduce((sum, item) => sum + item.area, 0);
  const dominantArea = entries.filter((item) => item.dominant).reduce((sum, item) => sum + item.area, 0);
  return {entries, totalArea, dominantArea, concentration: Number((dominantArea / totalArea).toFixed(4))};
}

async function svgPixels(markup) { return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${markup}</svg>`)).png().toBuffer(); }
async function plainPixels(color) { return sharp({create: {width: 1920, height: 1080, channels: 4, background: color}}).png().toBuffer(); }
async function backgroundPixels(spec) { return sharp(spec.file).resize(1920, 1080, {fit: "cover"}).png().toBuffer(); }
async function saveBase(id, pixels) { const file = path.join(baseRoot, `${id}.png`); await sharp(pixels).png({compressionLevel: 9}).toFile(file); return file; }

async function officialMarkPixels(key, width, height) {
  const source = sources[key];
  if (path.extname(source.file).toLowerCase() !== ".svg") return sharp(source.file).resize(width, height, {fit: "contain"}).png().toBuffer();
  let svg = fs.readFileSync(source.file, "utf8");
  if (key === "openai") svg = svg.replaceAll("currentColor", palette.coolWhite);
  if (key === "kimi") svg = svg.replaceAll('fill="black"', `fill="${palette.coolWhite}"`).replaceAll('fill="white"', `fill="${palette.charcoal}"`);
  return sharp(Buffer.from(svg)).resize(width, height, {fit: "contain"}).png().toBuffer();
}

async function buildFrame01() {
  const nodes = [
    glyphLine({id: "contained-premise", fontKey: "slanted", text: "完成度很高的", x: 116, y: 222, size: 128, tracking: -2, scaleX: .96, color: palette.ink, role: "premise", language: "zh"}),
    glyphLine({id: "contained-verdict", fontKey: "pixel", text: "废稿", x: 280, y: 900, size: 650, tracking: 20, scaleX: .96, color: palette.blue, role: "verdict", language: "zh", dominant: true}),
  ];
  return renderFrame({id: "01-contained-verdict", label: "完整结论", brief: briefs[0], basePixels: await plainPixels(palette.coolWhite), nodes, languageMode: "CHINESE_ONLY", semanticCopy: "完成度很高的废稿", composition: "contained-verdict-with-attached-premise", primaryFamily: "pixel-type-actor", boundaryMode: "SAFE_CONTAINED", interaction: {kind: "scale-weight-without-crop", target: "contained-verdict", necessary: true}});
}

async function buildFrame02() {
  const nodes = [
    glyphLine({id: "cascade-switch", fontKey: "slanted", text: "换了", x: 100, y: 250, size: 210, tracking: 2, scaleX: .96, color: palette.ink, role: "cause", language: "zh"}),
    glyphLine({id: "cascade-model", fontKey: "slanted", text: "模型", x: 430, y: 430, size: 245, tracking: 2, scaleX: .96, color: palette.ink, role: "object", language: "zh"}),
    glyphLine({id: "cascade-problem", fontKey: "pixel", text: "问题", x: 900, y: 710, size: 390, tracking: 4, scaleX: .94, color: palette.blue, role: "causal-pivot", language: "zh", dominant: true}),
    glyphLine({id: "cascade-persists", fontKey: "slanted", text: "没有消失", x: 770, y: 1000, size: 215, tracking: 2, scaleX: .94, color: palette.ink, role: "conclusion", language: "zh"}),
  ];
  return renderFrame({id: "02-baseline-cascade", label: "基线下沉", brief: briefs[1], basePixels: await plainPixels(palette.coolWhite), nodes, languageMode: "CHINESE_ONLY", semanticCopy: "换了模型，问题没有消失", composition: "four-level-contained-baseline-cascade", primaryFamily: "scanline-crt-signal", boundaryMode: "BASELINE_CASCADE", interaction: {kind: "semantic-baseline-cascade", target: "cascade-problem", necessary: true}});
}

async function buildFrame03() {
  const darkPixels = await backgroundPixels(backgrounds.dark);
  const maskNode = glyphLine({id: "source-question-glyph", fontKey: "slanted", text: "问题", x: -42, y: 1048, size: 820, tracking: -12, scaleX: .95, color: "#ffffff", role: "source-window-glyph", language: "zh", deliberateCrop: true, renderMode: "source-mask", dominant: true});
  const sourceField = await sharp(sources.document.file).extract({left: 30, top: 300, width: 820, height: 950}).resize(1920, 1080, {fit: "cover", position: "top"}).ensureAlpha().png().toBuffer();
  const clippedSource = await sharp(sourceField).composite([{input: await svgPixels(maskNode.markup), blend: "dest-in"}]).png().toBuffer();
  const basePixels = await sharp(darkPixels).composite([{input: clippedSource, left: 0, top: 0}]).png().toBuffer();
  const nodes = [
    maskNode,
    glyphLine({id: "source-premise", fontKey: "pixel", text: "换了模型", x: 1280, y: 220, size: 84, scaleX: .96, color: palette.coolWhite, role: "premise", language: "zh"}),
    glyphLine({id: "source-conclusion", fontKey: "slanted", text: "没有消失", x: 1260, y: 920, size: 118, tracking: 1, scaleX: .94, color: palette.acid, role: "conclusion", language: "zh"}),
  ];
  return renderFrame({id: "03-source-cut-through", label: "唯一裁切", brief: briefs[2], basePixels, nodes, overlayNodes: nodes.slice(1), languageMode: "CHINESE_PRIMARY_SOURCE_PIXELS", semanticCopy: "换了模型，问题没有消失", composition: "single-licensed-crop-with-contained-conclusion", primaryFamily: "retro-computer-window", boundaryMode: "ONE_PURPOSEFUL_CROP", interaction: {kind: "verified-source-cut-through", target: "source-question-glyph", necessary: true}, sourceBindings: [{assetId: sources.document.assetId, file: path.relative(root, sources.document.file), sha256: sources.document.actualSha256, evidenceBoundary: sources.document.evidenceBoundary, visible: true, crop: {left: 30, top: 300, width: 820, height: 950}, placement: {maskTextNodeId: "source-question-glyph"}}]});
}

async function buildFrame04() {
  const placements = [
    {key: "openai", left: 980, top: 115, width: 138, height: 138, treatment: "neutral-white-currentColor"},
    {key: "claude", left: 1220, top: 250, width: 132, height: 132, treatment: "official-color"},
    {key: "kimi", left: 1480, top: 105, width: 150, height: 150, treatment: "neutral-invert"},
    {key: "deepseek", left: 1570, top: 410, width: 142, height: 142, treatment: "official-color"},
    {key: "zhipu", left: 1190, top: 570, width: 300, height: 62, treatment: "official-white-wordmark"},
  ];
  const composites = [];
  const assetNodes = [];
  for (const placement of placements) {
    const source = sources[placement.key];
    composites.push({input: await officialMarkPixels(placement.key, placement.width, placement.height), left: placement.left, top: placement.top});
    assetNodes.push({id: `official-mark-${placement.key}`, assetId: source.assetId, identity: source.identity, file: path.relative(root, source.file), sha256: source.actualSha256, geometry: {x: placement.left, y: placement.top, width: placement.width, height: placement.height}, treatment: placement.treatment, visible: true, generated: false, provenanceReviewed: true});
  }
  const basePixels = await sharp(await plainPixels(palette.charcoal)).composite(composites).png().toBuffer();
  const nodes = [
    glyphLine({id: "entity-premise", fontKey: "slanted", text: "我试了", x: 110, y: 205, size: 132, tracking: 2, scaleX: .96, color: palette.coolWhite, role: "premise", language: "zh"}),
    glyphLine({id: "entity-count", fontKey: "slanted", text: "五个", x: 110, y: 900, size: 560, tracking: 6, scaleX: .94, color: palette.coolWhite, role: "evidence-count", language: "zh", dominant: true}),
    glyphLine({id: "entity-object", fontKey: "pixel", text: "模型", x: 860, y: 880, size: 260, tracking: 8, scaleX: .94, color: palette.blue, role: "evidence-object", language: "zh"}),
  ];
  return renderFrame({id: "04-official-entity-constellation", label: "官方实体星座", brief: briefs[3], basePixels, nodes, languageMode: "SOURCE_BOUND_ENTITY_ATLAS", semanticCopy: "我试了 GPT、Claude、Kimi、DeepSeek，还有智谱。", composition: "asymmetric-mark-constellation-around-contained-count", primaryFamily: "icon-atlas-interface-language", boundaryMode: "SOURCE_ENTITY_CONSTELLATION", interaction: {kind: "source-bound-identity-imprints", target: "entity-count", necessary: true}, sourceBindings: [...assetNodes, {assetId: sources.entityPlate.assetId, file: path.relative(root, sources.entityPlate.file), sha256: sources.entityPlate.actualSha256, visible: false, role: "identity-reference-only-exact-rebind"}], assetNodes, storyboardBinding: {shotId: "ED-12", decisionHash: "df496b3cc560861560bd9f22343664f970dec14a157e5d5b0872e67071f63ae6", packageDecision: "PACKAGE", assemblyMode: "FULLSCREEN", sourceText: "我试了 GPT、Claude、 Kimi、DeepSeek，还有智谱。", entities: ["GPT", "Claude", "Kimi", "DeepSeek", "智谱"], semanticBriefSha256: "e709bc82a2d269ef20c2921bf81f7d89eac04bf95ea5c7a95ce0c084c873bc69"}});
}

async function renderFrame({id, label, brief, basePixels, nodes, overlayNodes = nodes, languageMode, semanticCopy, composition, primaryFamily, boundaryMode, interaction, sourceBindings = [], assetNodes = [], storyboardBinding = null}) {
  const baseFile = await saveBase(id, basePixels);
  const overlay = await svgPixels(overlayNodes.map((node) => node.markup).join(""));
  const frameFile = path.join(frameRoot, `${id}.png`);
  await sharp(basePixels).composite([{input: overlay, left: 0, top: 0}]).png({compressionLevel: 9}).toFile(frameFile);
  const metadata = await sharp(frameFile).metadata();
  return {id, label, status: "READY_FOR_OBJECTIVE_AUDIT", brief: {file: path.relative(root, brief.file), sha256: fileSha256(brief.file), fingerprint: brief.value.fingerprint}, primaryFamily, composition, boundaryMode, languageMode, semanticCopy, interaction, hierarchy: hierarchy(nodes), frame: {file: path.relative(root, frameFile), sha256: fileSha256(frameFile), width: metadata.width, height: metadata.height, mimeType: "image/png"}, base: {file: path.relative(root, baseFile), sha256: fileSha256(baseFile)}, textNodes: nodes.map((node) => node.spec), assetNodes, sourceBindings, storyboardBinding, formalOverlay: {renderer: "fontkit-svg-paths-over-sharp", cssUsed: false, htmlUsed: false, decorativeGeometryCount: 0, allowedSvgElements: ["svg", "g", "path"]}, generatedFormalText: false, editableText: true, productionAdmitted: false};
}

async function main() {
  fs.mkdirSync(frameRoot, {recursive: true});
  fs.mkdirSync(baseRoot, {recursive: true});
  const frames = [await buildFrame01(), await buildFrame02(), await buildFrame03(), await buildFrame04()];
  const tileWidth = 960;
  const tileHeight = 540;
  const gap = 18;
  const sheetWidth = tileWidth * 2 + gap * 3;
  const sheetHeight = tileHeight * 2 + gap * 3;
  const tileInputs = await Promise.all(frames.map((item) => sharp(path.join(root, item.frame.file)).resize(tileWidth, tileHeight, {fit: "cover"}).png().toBuffer()));
  const sheetFile = path.join(outputRoot, "typography-master-board-v5.png");
  await sharp({create: {width: sheetWidth, height: sheetHeight, channels: 4, background: "#090c0e"}}).composite(tileInputs.map((input, index) => ({input, left: gap + (index % 2) * (tileWidth + gap), top: gap + Math.floor(index / 2) * (tileHeight + gap)}))).png({compressionLevel: 9}).toFile(sheetFile);

  const licenseFile = path.join(root, "work/style-research/typography-master-board-v5/font-license-evidence.md");
  const manifestBody = {contract: "A1TypographyMasterBoard/v5", status: "READY_FOR_OBJECTIVE_AUDIT", visualThesis: "只有来源穿字镜允许一次语义裁切；其余镜头用完整字形、基线节奏和官方实体证据建立差异。", correctionOf: ".codex-artifacts/system-progress-system-line/typography-master-board-v4/", v4Diagnosis: "manual typography study bypassed ED-12 shot-intelligence entityEvidence and repeated edge-crop as a default fingerprint", smartStoryboardStatus: {activatedForED12: true, decision: "PACKAGE", assemblyMode: "FULLSCREEN", experimentalBoardV4UsedIt: false, v5ReboundToDecision: true}, researchBinding: {file: "work/style-research/pinterest-editorial-typography-deep-audit-2026-08-14.md", sha256: fileSha256(path.join(root, "work/style-research/pinterest-editorial-typography-deep-audit-2026-08-14.md"))}, fontLicenseEvidence: {file: path.relative(root, licenseFile), sha256: fileSha256(licenseFile)}, currentAuthorityUntouched: true, productionAdmitted: false, userVisualApproval: "NOT_REVIEWED", cropPolicy: {maximumDeliberateCropFrames: 1, actualDeliberateCropFrames: frames.filter((frame) => frame.textNodes.some((node) => node.deliberateCrop)).length}, fonts: Object.values(fonts).map((font) => ({assetId: font.assetId, family: font.family, file: path.relative(root, font.file), sha256: font.actualSha256})), backgrounds: Object.values(backgrounds).map((background) => ({assetId: background.assetId, file: path.relative(root, background.file), sha256: background.actualSha256})), frames, reviewSheet: {file: path.relative(root, sheetFile), sha256: fileSha256(sheetFile), width: sheetWidth, height: sheetHeight}, generatedAt: new Date().toISOString()};
  const manifest = {...manifestBody, manifestSha256: sha256(Buffer.from(JSON.stringify(manifestBody)))};
  const manifestFile = path.join(outputRoot, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: manifest.status, frames: frames.length, cropFrames: manifest.cropPolicy.actualDeliberateCropFrames, officialMarks: frames[3].assetNodes.length, reviewSheet: path.relative(root, sheetFile), manifest: path.relative(root, manifestFile), productionAdmitted: false}, null, 2));
}

await main();
