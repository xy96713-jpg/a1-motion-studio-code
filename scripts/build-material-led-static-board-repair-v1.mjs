#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const generatedRoot = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1");
const sourceRoot = path.join(generatedRoot, "style-lineage-static-board-v1");
const outputRoot = path.join(generatedRoot, "material-led-static-board-repair-v2");
const frameRoot = path.join(outputRoot, "frames");
const substrateRoot = path.join(outputRoot, "substrates");
const elementRoot = path.join(outputRoot, "elements");
const briefRoot = path.join(outputRoot, "style-briefs");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/material-led-static-board-repair-v2");
const requestPackFile = path.join(artifactRoot, "request-pack.json");
const workspaceFile = path.join(generatedRoot, "workspace.json");
const typographyFile = path.join(root, ".codex-artifacts/system-progress-system-line/dual-font-typography-layout-masters-v6/manifest.json");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const fontkit = require("fontkit");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicUrlFor = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const publicFile = (publicUrl) => path.join(publicRoot, String(publicUrl).replace(/^\//u, ""));
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

for (const folder of [frameRoot, substrateRoot, elementRoot, briefRoot]) fs.mkdirSync(folder, {recursive: true});

const workspace = readJson(workspaceFile);
const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const sourceManifest = readJson(path.join(sourceRoot, "manifest.json"));
const requestPack = readJson(requestPackFile);
const typography = readJson(typographyFile);
const sourceItemByShot = new Map(board.items.map((item) => [item.shotId, item]));
const requestByShot = new Map(requestPack.requests.map((item) => [item.shotId, item]));

const fontSpecs = {
  editorial: typography.fonts.find((font) => font.assetId === "type-frex-sans-gb-bold-review"),
  pixel: typography.fonts.find((font) => font.assetId === "type-boutique-9x9-bold-review"),
};
for (const spec of Object.values(fontSpecs)) {
  if (!spec) throw new Error("material-led-font-missing");
  spec.absoluteFile = path.join(root, spec.file);
  if (!fs.existsSync(spec.absoluteFile) || fileSha256(spec.absoluteFile) !== spec.sha256) throw new Error(`material-led-font-sha-mismatch:${spec.assetId}`);
  spec.font = fontkit.create(fs.readFileSync(spec.absoluteFile));
}

function glyphLine({fontKey = "editorial", text, x, y, size, tracking = 2, fill = "#11151a"}, index = 0) {
  const spec = fontSpecs[fontKey];
  const scale = size / spec.font.unitsPerEm;
  let cursor = x;
  const paths = [];
  for (const character of [...text]) {
    const run = spec.font.layout(character);
    const glyph = run.glyphs[0];
    const position = run.positions[0];
    if (!glyph || glyph.id === 0) throw new Error(`material-led-missing-glyph:${spec.family}:${character}`);
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${cursor.toFixed(3)} ${y.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    cursor += position.xAdvance * scale + tracking;
  }
  return {
    markup: `<g fill="${fill}">${paths.join("")}</g>`,
    spec: {id: `type-${index + 1}`, text, fontAssetId: spec.assetId, fontFamily: spec.family, fontSha256: spec.sha256, x, y, size, tracking, fill, editable: true, generated: false},
  };
}

const imageShotSpecs = {
  "ED-07": {nodes: [{fontKey: "editorial", text: "直接写完全文？", x: 108, y: 142, size: 76, tracking: 3, fill: "#8faeff"}]},
  "ED-08": {nodes: [{fontKey: "pixel", text: "不说人话", x: 1235, y: 166, size: 92, tracking: 7, fill: "#2452ff"}]},
  "ED-09": {nodes: [{fontKey: "editorial", text: "中文，却看不懂", x: 95, y: 148, size: 72, tracking: 2, fill: "#15191d"}]},
  "ED-19": {nodes: [{fontKey: "editorial", text: "Codex 在后台", x: 92, y: 146, size: 82, tracking: 3, fill: "#8faeff"}]},
};

const elementSvgs = {
  "ED-16": {
    "material-reservoir": `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135" shape-rendering="crispEdges"><path d="M14 43h58v61H14zM18 47h50v53H18z" fill="#15191d" fill-rule="evenodd"/><path d="M22 86h42v10H22zM23 74h18v7H23zM45 77h17v5H45z" fill="#2452ff"/><path d="M23 55h35v4H23zM23 64h29v4H23z" fill="#a8aaa5"/></svg>`,
    "angle-lens": `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135" shape-rendering="crispEdges"><path d="M96 45h28v4h8v8h4v28h-4v8h-8v4H96v-4h-8v-8h-4V57h4v-8h8z" fill="#15191d"/><path d="M98 51h24v4h6v6h4v20h-4v6h-6v4H98v-4h-6v-6h-4V61h4v-6h6z" fill="#dce4ea"/><path d="M126 91l22 25h-8l-20-21zM90 69h40v5H90z" fill="#2452ff"/></svg>`,
    "flat-output": `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135" shape-rendering="crispEdges"><path d="M166 39h49l9 9v58h-58z" fill="#15191d"/><path d="M171 44h40l8 8v49h-48z" fill="#f1f1eb"/><path d="M178 60h34v4h-34zM178 70h34v4h-34zM178 80h34v4h-34zM178 90h25v4h-25z" fill="#8c918e"/></svg>`,
  },
  "ED-17": {
    "material-folder": `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135" shape-rendering="crispEdges"><path d="M13 52h22l7-9h32v55H13z" fill="#15191d"/><path d="M18 57h51v36H18z" fill="#e9e8e0"/><path d="M24 65h37v5H24zM24 76h30v5H24zM24 87h34v4H24z" fill="#2452ff"/></svg>`,
    "angle-prism": `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135" shape-rendering="crispEdges"><path d="M111 40l36 61H77z" fill="#15191d"/><path d="M111 49l28 47H84z" fill="#dce4ea"/><path d="M73 69h26v5H73zM123 69h28v5h-28zM99 69l19-17v34z" fill="#2452ff"/></svg>`,
    "writing-pen": `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135" shape-rendering="crispEdges"><path d="M174 91l17-45 35 15-18 45z" fill="#15191d"/><path d="M181 88l13-34 24 10-14 34z" fill="#e8e8e2"/><path d="M194 54l12 27 12-17-24-10zM166 108h63v5h-63z" fill="#2452ff"/></svg>`,
  },
};

function writeElementAssets(shotId) {
  return Object.entries(elementSvgs[shotId]).map(([id, svg]) => {
    const file = path.join(elementRoot, `${shotId}-${id}.svg`);
    fs.writeFileSync(file, `${svg}\n`);
    return {assetId: `${shotId.toLowerCase()}-${id}-v1`, kind: "EDITABLE_VECTOR_ELEMENT", publicUrl: publicUrlFor(file), sha256: fileSha256(file), generated: false, formalTextEmbedded: false};
  });
}

async function renderImageLed(shotId) {
  const request = requestByShot.get(shotId);
  const sourceImage = path.join(root, request.outputPath);
  if (!fs.existsSync(sourceImage)) throw new Error(`material-led-substrate-missing:${shotId}`);
  const substrateFile = path.join(substrateRoot, `${shotId}.png`);
  const sourceGenerationSha256 = fileSha256(sourceImage);
  const normalized = await sharp(sourceImage).resize(240, 135, {fit: "cover", kernel: sharp.kernel.nearest}).resize(1920, 1080, {kernel: sharp.kernel.nearest}).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(substrateFile, normalized);
  const substrateSha256 = sha256(normalized);
  const nodes = imageShotSpecs[shotId].nodes.map(glyphLine);
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${nodes.map((node) => node.markup).join("")}</svg>`);
  const outputFile = path.join(frameRoot, `${shotId}.png`);
  const pixels = await sharp(substrateFile).composite([{input: overlay}]).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  const sourceBriefFile = path.join(root, request.styleBriefPath);
  const sourceAuditFile = path.join(root, request.styleBriefAuditPath);
  fs.copyFileSync(sourceBriefFile, path.join(briefRoot, `${shotId}.json`));
  fs.copyFileSync(sourceAuditFile, path.join(briefRoot, `${shotId}.audit.json`));
  return {outputFile, pixels, textNodes: nodes.map((node) => node.spec), illustrationBinding: {assetId: `${shotId.toLowerCase()}-textless-imagegen-pixel-substrate-v2`, kind: "TEXTLESS_IMAGEGEN_PIXEL_ILLUSTRATION", publicUrl: publicUrlFor(substrateFile), sha256: substrateSha256, sourceGenerationSha256, styleBriefSha256: request.styleBriefSha256, masterGrid: "240x135", scaleMethod: "nearest-neighbor", generatedFormalText: false}};
}

async function renderElementLed(shotId) {
  const bindings = writeElementAssets(shotId);
  const bg = shotId === "ED-17" ? "#d8dadd" : "#e4e3dd";
  const nodes = shotId === "ED-16"
    ? [
        {fontKey: "editorial", text: "材料不够", x: 110, y: 150, size: 64, fill: "#15191d"},
        {fontKey: "editorial", text: "角度不清", x: 720, y: 150, size: 64, fill: "#2452ff"},
        {fontKey: "editorial", text: "泛泛而谈", x: 1325, y: 930, size: 72, tracking: 3, fill: "#2452ff"},
      ]
    : [
        {fontKey: "editorial", text: "先给材料", x: 105, y: 150, size: 58, fill: "#15191d"},
        {fontKey: "editorial", text: "再找角度", x: 730, y: 150, size: 58, fill: "#15191d"},
        {fontKey: "editorial", text: "最后让 AI 动笔", x: 1275, y: 150, size: 54, fill: "#2452ff"},
      ];
  const renderedNodes = nodes.map(glyphLine);
  const logicalBase = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135" shape-rendering="crispEdges"><rect width="240" height="135" fill="${bg}"/><path d="M70 72h16M140 72h19" stroke="#2452ff" stroke-width="4" stroke-dasharray="5 3"/><path d="M83 68l6 4-6 4M156 68l6 4-6 4" fill="none" stroke="#2452ff" stroke-width="3"/></svg>`);
  const logical = await sharp(logicalBase).composite(bindings.map((binding) => ({input: publicFile(binding.publicUrl)}))).png().toBuffer();
  const pixelStage = await sharp(logical).resize(1920, 1080, {kernel: sharp.kernel.nearest}).png().toBuffer();
  const typeOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${renderedNodes.map((node) => node.markup).join("")}</svg>`);
  const outputFile = path.join(frameRoot, `${shotId}.png`);
  const pixels = await sharp(pixelStage).composite([{input: typeOverlay}]).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {outputFile, pixels, textNodes: renderedNodes.map((node) => node.spec), elementBindings: bindings};
}

const routeByShot = new Map([
  ["ED-01", "PRESENTER_INTEGRATED"], ["ED-07", "ILLUSTRATION_LED"], ["ED-08", "ILLUSTRATION_LED"], ["ED-09", "ILLUSTRATION_LED"],
  ["ED-10", "TYPOGRAPHY_DOMINANT"], ["ED-12", "SOURCE_EVIDENCE"], ["ED-13", "PRESENTER_INTEGRATED"], ["ED-14", "SOURCE_EVIDENCE"],
  ["ED-16", "ELEMENT_EXPLAINER"], ["ED-17", "ELEMENT_EXPLAINER"], ["ED-19", "ILLUSTRATION_LED"], ["ED-31", "PRESENTER_INTEGRATED"],
  ["ED-33", "PRESERVED_ILLUSTRATION_MASTER"], ["ED-34", "PRESERVED_ILLUSTRATION_MASTER"],
]);
const repairedShotIds = new Set(["ED-07", "ED-08", "ED-09", "ED-16", "ED-17", "ED-19"]);
const results = new Map();
for (const shotId of repairedShotIds) results.set(shotId, ["ED-16", "ED-17"].includes(shotId) ? await renderElementLed(shotId) : await renderImageLed(shotId));

function sourceEvidenceBinding(item) {
  return {assetId: `${item.shotId.toLowerCase()}-integrated-source-evidence-master`, publicUrl: item.artifactPublicUrl, sha256: item.artifactSha256, integratedMaster: true, fakeEvidenceForbidden: true};
}

const items = board.items.map((source) => {
  const route = routeByShot.get(source.shotId);
  const result = results.get(source.shotId);
  const artifactSha256 = result ? sha256(result.pixels) : source.artifactSha256;
  const artifactPublicUrl = result ? publicUrlFor(result.outputFile) : source.artifactPublicUrl;
  const styleLineage = {
    ...source.styleLineage,
    styleSystemId: "a1-material-led-multi-background-editorial-v1",
    styleSystemSha256: null,
    compositeSha256: artifactSha256,
    sourceArtifactSha256: source.styleLineage.sourceArtifactSha256,
    priorCompositeSha256: result ? source.artifactSha256 : null,
    compositionMethod: result ? "MATERIAL_LED_FULL_LOOK_MASTER_WITH_LOCAL_HASH_BOUND_TYPOGRAPHY" : source.styleLineage.compositionMethod,
    pixelTreatment: result ? "RECOMPOSED" : source.styleLineage.pixelTreatment,
    pixelRecomposed: result ? true : source.styleLineage.pixelRecomposed,
    visualMaterialRoute: route,
    illustrationBinding: result?.illustrationBinding || (route === "PRESERVED_ILLUSTRATION_MASTER" ? {assetId: `${source.shotId.toLowerCase()}-preserved-integrated-illustration`, publicUrl: artifactPublicUrl, sha256: artifactSha256, integratedMaster: true} : null),
    elementBindings: result?.elementBindings || [],
    sourceEvidenceBinding: route === "SOURCE_EVIDENCE" ? sourceEvidenceBinding(source) : null,
    typographyJustification: route === "TYPOGRAPHY_DOMINANT" ? "THE_VERDICT_WORD_ITSELF_IS_THE_SEMANTIC_ACTOR_AND_THIS_ROUTE_IS_NOT_USED_FOR_EXPLANATION" : null,
    compositeVisualAudit: {contract: "A1StaticBoardCompositeVisualAudit/v1", status: "PENDING_AGENT_ACTUAL_PIXEL_REVIEW", compositeSha256: artifactSha256, semanticAgreement: "PENDING", visualActorDominant: null, formalTextRendererBound: true, generatedFormalText: false, actualPixelsViewed: false},
  };
  return {
    ...source,
    artifactSha256,
    artifactPublicUrl,
    previewPublicUrl: artifactPublicUrl,
    previewSha256: artifactSha256,
    compositeSha256: artifactSha256,
    textNodes: result?.textNodes || source.textNodes || [],
    styleBrief: result && requestByShot.has(source.shotId) ? {publicUrl: publicUrlFor(path.join(briefRoot, `${source.shotId}.json`)), sha256: requestByShot.get(source.shotId).styleBriefSha256} : source.styleBrief,
    styleLineage,
    status: "READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW",
    productionAdmitted: false,
    userVisualApproval: "NOT_APPROVED",
  };
});

const styleSystemInput = {contract: "A1AppliedEditorialStyleSystem/v1", id: "a1-fusion-pixel-material-led-editorial-v2", sourceStyleSystemSha256: sourceManifest.styleSystem.sha256, requestPackSha256: requestPack.requestPackSha256, rules: ["shared-240x135-logical-pixel-grid", "nearest-neighbor-pixel-construction", "paper-noise-or-halftone-alone-cannot-prove-pixel-style", "shot-semantic-job-selects-visual-medium", "non-text-visual-actor-required-for-explanation", "formal-chinese-local-hash-bound", "textless-imagegen-substrate-only", "one-primary-actor-one-semantic-action", "actual-composite-pixels-not-source-candidate-must-pass"]};
const styleSystem = {...styleSystemInput, sha256: sha256(styleSystemInput)};
for (const item of items) {
  item.styleLineage.styleSystemId = styleSystem.id;
  item.styleLineage.styleSystemSha256 = styleSystem.sha256;
}

async function buildBoard(boardItems, outputFile) {
  const tileWidth = 480, imageHeight = 270, labelHeight = 58, tileHeight = imageHeight + labelHeight, columns = 3;
  const tiles = await Promise.all(boardItems.map(async (item) => {
    const image = await sharp(publicFile(item.previewPublicUrl)).resize(tileWidth, imageHeight, {fit: "cover"}).png().toBuffer();
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#0b0f13"/><rect width="7" height="100%" fill="#8faeff"/><text x="20" y="23" fill="#f3f5f2" font-family="Arial" font-size="15" font-weight="700">${escapeXml(item.shotId)} · ${escapeXml(item.presentationMode)}</text><text x="20" y="45" fill="#8faeff" font-family="Arial" font-size="10">${escapeXml(item.styleLineage.visualMaterialRoute)} · ${item.artifactSha256.slice(0, 12)}</text></svg>`);
    return sharp({create: {width: tileWidth, height: tileHeight, channels: 4, background: "#0b0f13"}}).composite([{input: image}, {input: label, top: imageHeight, left: 0}]).png().toBuffer();
  }));
  const rows = Math.ceil(boardItems.length / columns);
  const pixels = await sharp({create: {width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#070909"}}).composite(tiles.map((input, index) => ({input, left: index % columns * tileWidth, top: Math.floor(index / columns) * tileHeight}))).png({compressionLevel: 9}).toBuffer();
  fs.writeFileSync(outputFile, pixels);
  return {publicUrl: publicUrlFor(outputFile), sha256: sha256(pixels), width: columns * tileWidth, height: rows * tileHeight, bytes: pixels};
}

const packageBoard = await buildBoard(items, path.join(outputRoot, "whole-film-package-board.png"));
const packageBoardReference = {publicUrl: packageBoard.publicUrl, sha256: packageBoard.sha256, width: packageBoard.width, height: packageBoard.height};
const manifestBase = {contract: "A1MaterialLedStaticBoardRepair/v2", status: "READY_FOR_AGENT_ACTUAL_PIXEL_REVIEW", current: false, reviewOnly: true, productionAdmitted: false, userVisualApproval: "NOT_APPROVED", sourceBoardSha256: board.sha256, requestPackSha256: requestPack.requestPackSha256, styleSystem, priorAttemptDisposition: requestPack.priorAttemptDisposition, targetShotIds: [...repairedShotIds], packageBoard: packageBoardReference, counts: {itemCount: items.length, repairedCount: repairedShotIds.size, imagegenSubstrateCount: 4, deterministicElementShotCount: 2, typographyDominantCount: items.filter((item) => item.styleLineage.visualMaterialRoute === "TYPOGRAPHY_DOMINANT").length, illustrationLedCount: items.filter((item) => ["ILLUSTRATION_LED", "PRESERVED_ILLUSTRATION_MASTER"].includes(item.styleLineage.visualMaterialRoute)).length, presenterIntegratedCount: items.filter((item) => item.styleLineage.visualMaterialRoute === "PRESENTER_INTEGRATED").length, sourceEvidenceCount: items.filter((item) => item.styleLineage.visualMaterialRoute === "SOURCE_EVIDENCE").length}, items, boundaries: {userVisualApproval: "NOT_APPROVED", assemblyCreated: false, layerExtractionPerformed: false, motionPerformed: false, resolveUsed: false, finalRenderUsed: false}, generatedAt: new Date().toISOString()};
const manifest = {...manifestBase, manifestSha256: sha256(manifestBase)};
fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({status: manifest.status, manifestSha256: manifest.manifestSha256, packageBoard: packageBoardReference, counts: manifest.counts}, null, 2)}\n`);
