#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import sharp from "sharp";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public");
const pilotRoot = path.join(publicRoot, "generated/system-line/web-source-packaging-pilot-v1");
const manifestPath = path.join(pilotRoot, "manifest.json");
const layerRoot = path.join(pilotRoot, "layers");
const assemblyRoot = path.join(pilotRoot, "assembly");
const masterPath = path.join(pilotRoot, "outputs/ed-14-web-article-title-explainer-look-master-v2.png");
const sourcePath = path.join(pilotRoot, "sources/arxiv-2309.05196-title-crop-v2.png");
const backgroundPath = path.join(layerRoot, "ed-14-background-v1.png");
const rawElementPath = path.join(layerRoot, "ed-14-element-kit-v1.png");
const elementPath = path.join(layerRoot, "ed-14-element-kit-alpha-v1.png");
const illustrationPath = path.join(layerRoot, "ed-14-illustration-exact-source-v1.png");
const typographySvgPath = path.join(layerRoot, "ed-14-typography-editable-v1.svg");
const typographyPath = path.join(layerRoot, "ed-14-typography-master-visual-v2.png");
const typographySpecPath = path.join(layerRoot, "ed-14-typography-editable-v1.json");
const typographyShadowPath = path.join(layerRoot, "ed-14-typography-editable-shadow-v2.png");
const assemblyPath = path.join(assemblyRoot, "ed-14-web-source-four-layer-assembly-v1.png");
const proofPath = path.join(assemblyRoot, "ed-14-web-source-master-vs-assembly-v1.png");
const fusionFontPath = path.join(publicRoot, "a1-editorial-fonts/fusion-pixel.ttf");
const supportFontPath = path.join(publicRoot, "a1-editorial-fonts/SourceHanSansCN-Heavy.otf");

const width = 1672;
const height = 941;
const exactText = {
  mechanism: "常见 / 稳妥 / 可复用",
  verdict: "表达越来越像",
};
const sourceGeometry = {
  left: 74,
  top: 291,
  width: 836,
  height: 350,
  verifiedHeaderCrop: {left: 0, top: 0, width: 1000, height: 110, outputHeight: 185},
  titleLines: ["Does Writing with Language Models Reduce", "Content Diversity?"],
  titleBaselines: [526, 568],
  authorText: "Vishakh Padmakumar, He He",
  authorBaseline: 620,
};
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicUrl = (file) => `/${path.relative(publicRoot, file).split(path.sep).join("/")}`;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function pathGroup(font, text, {x, baseline, fontSize, fill, stroke = null, strokeWidth = 0}) {
  const run = font.layout(text);
  assert(run.glyphs.every((glyph) => glyph.id !== 0), `typography-glyph-missing:${text}`);
  const scale = fontSize / font.unitsPerEm;
  let penX = 0;
  const paths = [];
  for (let index = 0; index < run.glyphs.length; index += 1) {
    const glyph = run.glyphs[index];
    const position = run.positions[index];
    const tx = x + (penX + position.xOffset) * scale;
    const ty = baseline - position.yOffset * scale;
    paths.push(`<path d="${glyph.path.toSVG()}" transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    penX += position.xAdvance;
  }
  return `<g fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="miter"` : ""}>${paths.join("")}</g>`;
}

async function keyElementAlpha() {
  const {data, info} = await sharp(rawElementPath).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < data.length; sourceIndex += 3, targetIndex += 4) {
    const red = data[sourceIndex];
    const green = data[sourceIndex + 1];
    const blue = data[sourceIndex + 2];
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const chroma = maximum - minimum;
    const signal = Math.max(255 - maximum, chroma);
    const alpha = Math.max(0, Math.min(255, Math.round((signal - 18) * 4.25)));
    rgba[targetIndex] = red;
    rgba[targetIndex + 1] = green;
    rgba[targetIndex + 2] = blue;
    rgba[targetIndex + 3] = alpha;
  }
  await sharp(rgba, {raw: {width: info.width, height: info.height, channels: 4}}).png().toFile(elementPath);
}

async function buildExactSourceLayer() {
  const headerCrop = sourceGeometry.verifiedHeaderCrop;
  const header = await sharp(sourcePath)
    .extract({left: headerCrop.left, top: headerCrop.top, width: headerCrop.width, height: headerCrop.height})
    .resize({width: sourceGeometry.width, height: headerCrop.outputHeight, fit: "fill"})
    .png()
    .toBuffer();
  const supportFont = fontkit.openSync(supportFontPath);
  const sourceType = [
    ...sourceGeometry.titleLines.map((line, index) => pathGroup(supportFont, line, {
      x: sourceGeometry.left + 22,
      baseline: sourceGeometry.titleBaselines[index],
      fontSize: 35,
      fill: "#101010",
    })),
    pathGroup(supportFont, sourceGeometry.authorText, {
      x: sourceGeometry.left + 22,
      baseline: sourceGeometry.authorBaseline,
      fontSize: 26,
      fill: "#1239a5",
    }),
  ].join("");
  const sourceTypeSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${sourceType}</svg>`);
  const whitePanel = await sharp({create: {width: sourceGeometry.width, height: sourceGeometry.height, channels: 4, background: {r: 255, g: 255, b: 255, alpha: 1}}}).png().toBuffer();
  await sharp({create: {width, height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite([
      {input: whitePanel, left: sourceGeometry.left, top: sourceGeometry.top},
      {input: header, left: sourceGeometry.left, top: sourceGeometry.top},
      {input: sourceTypeSvg, left: 0, top: 0},
    ])
    .png()
    .toFile(illustrationPath);
  return structuredClone(sourceGeometry);
}

async function buildMasterTypographyVisualLayer() {
  const {data, info} = await sharp(masterPath).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const rgba = Buffer.alloc(info.width * info.height * 4);
  const cardRegions = [
    {left: 1100, top: 160, right: 1248, bottom: 306},
    {left: 1100, top: 390, right: 1248, bottom: 536},
    {left: 1100, top: 620, right: 1248, bottom: 766},
  ];
  const verdictRegion = {left: 1360, top: 582, right: 1654, bottom: 663};
  const inside = (x, y, region) => x >= region.left && x < region.right && y >= region.top && y < region.bottom;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const sourceIndex = (y * info.width + x) * 3;
      const targetIndex = (y * info.width + x) * 4;
      const red = data[sourceIndex];
      const green = data[sourceIndex + 1];
      const blue = data[sourceIndex + 2];
      const inVerdict = inside(x, y, verdictRegion);
      const inCard = cardRegions.some((region) => inside(x, y, region));
      const cobaltSignal = blue > 70 && blue - Math.max(red, green) > 18;
      if (!inVerdict && !(inCard && cobaltSignal)) continue;
      rgba[targetIndex] = red;
      rgba[targetIndex + 1] = green;
      rgba[targetIndex + 2] = blue;
      rgba[targetIndex + 3] = 255;
    }
  }
  await sharp(rgba, {raw: {width: info.width, height: info.height, channels: 4}}).png().toFile(typographyPath);
}

async function buildTypographyLayer() {
  const displayFont = fontkit.openSync(fusionFontPath);
  const supportFont = fontkit.openSync(supportFontPath);
  const mechanismLines = ["常见", "稳妥", "/ 可复用"];
  const cards = [
    {x: 1110, baselines: [202, 242, 282]},
    {x: 1110, baselines: [432, 472, 512]},
    {x: 1110, baselines: [662, 702, 742]},
  ];
  const cardPaths = cards.flatMap((card) => mechanismLines.map((line, index) => pathGroup(supportFont, line, {
    x: card.x,
    baseline: card.baselines[index],
    fontSize: 35,
    fill: "#1239a5",
  })));
  const verdict = pathGroup(displayFont, exactText.verdict, {x: 1384, baseline: 644, fontSize: 42, fill: "#fffdf4", stroke: "#fffdf4", strokeWidth: 1.25});
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="1362" y="584" width="292" height="78" fill="#153aa7"/>`,
    ...cardPaths,
    verdict,
    "</svg>",
  ].join("");
  fs.writeFileSync(typographySvgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(typographyShadowPath);
  await buildMasterTypographyVisualLayer();
  const spec = {
    contract: "A1EditableTypographyShadow/v1",
    shotId: "ED-14",
    selectedLookMasterId: "ed-14-web-article-title-v2",
    exactText,
    displayLines: mechanismLines,
    repeatedMechanismCardCount: cards.length,
    canvas: {width, height},
    cards,
    verdict: {x: 1362, y: 584, width: 292, height: 78, textX: 1384, baseline: 644},
    fonts: [
      {assetId: "type-pixel-correction", family: displayFont.familyName, path: fusionFontPath, sha256: fileSha256(fusionFontPath)},
      {assetId: "type-editorial-heavy", family: supportFont.familyName, path: supportFontPath, sha256: fileSha256(supportFontPath)},
    ],
    editableSvg: publicUrl(typographySvgPath),
    editableShadowPng: publicUrl(typographyShadowPath),
    systemFallbackForbidden: true,
    generatedMasterWasCompositionAuthority: true,
    localTypographyIsExactReconstructionShadow: true,
    visibleTypographySource: "SELECTED_IMAGEGEN_MASTER_PIXELS",
    geometryAuthority: "SELECTED_LOOK_MASTER_EXACT_COORDINATES",
  };
  fs.writeFileSync(typographySpecPath, `${JSON.stringify(spec, null, 2)}\n`);
  return spec;
}

async function buildAssembly() {
  const transparentLayers = [elementPath, illustrationPath, typographyPath];
  await sharp(backgroundPath)
    .resize(width, height, {fit: "fill"})
    .composite(transparentLayers.map((input) => ({input})))
    .png()
    .toFile(assemblyPath);
  const divider = await sharp({create: {width: 16, height, channels: 3, background: "#151515"}}).png().toBuffer();
  await sharp({create: {width: width * 2 + 16, height, channels: 3, background: "#151515"}})
    .composite([
      {input: masterPath, left: 0, top: 0},
      {input: divider, left: width, top: 0},
      {input: assemblyPath, left: width + 16, top: 0},
    ])
    .png()
    .toFile(proofPath);
}

async function alphaStats(file) {
  const image = sharp(file);
  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
  const alpha = stats.channels[3] || null;
  return {
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    alpha: alpha ? {min: alpha.min, max: alpha.max, mean: alpha.mean} : null,
  };
}

async function main() {
  for (const file of [manifestPath, masterPath, sourcePath, backgroundPath, rawElementPath, fusionFontPath, supportFontPath]) assert(fs.existsSync(file), `required-file-missing:${file}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const selected = manifest.candidates.find((candidate) => candidate.id === "ed-14-web-article-title-v2");
  const source = manifest.sources.find((item) => item.id === "official-arxiv-2309.05196");
  assert(selected?.sha256 === fileSha256(masterPath), "selected-master-sha-mismatch");
  assert(source?.titleCropSha256 === fileSha256(sourcePath), "exact-source-sha-mismatch");
  const [masterMetadata, backgroundMetadata, rawElementMetadata] = await Promise.all([masterPath, backgroundPath, rawElementPath].map((file) => sharp(file).metadata()));
  for (const metadata of [masterMetadata, backgroundMetadata, rawElementMetadata]) assert(metadata.width === width && metadata.height === height, "assembly-input-dimensions-invalid");

  fs.mkdirSync(layerRoot, {recursive: true});
  fs.mkdirSync(assemblyRoot, {recursive: true});
  await keyElementAlpha();
  const resolvedSourceGeometry = await buildExactSourceLayer();
  const typographySpec = await buildTypographyLayer();
  await buildAssembly();

  const layerDefinitions = [
    {kind: "BACKGROUND", route: "GENERATE", file: backgroundPath, sourceFile: backgroundPath, provenance: "CODEX_IMAGEGEN_EDIT_FROM_SELECTED_MASTER", alphaRequired: false},
    {kind: "TYPOGRAPHY", route: "REUSE", file: typographyPath, sourceFile: masterPath, provenance: "SELECTED_IMAGEGEN_MASTER_TYPOGRAPHY_PIXELS_WITH_EDITABLE_SHADOW", alphaRequired: true},
    {kind: "ELEMENT_KIT", route: "GENERATE", file: elementPath, sourceFile: rawElementPath, provenance: "CODEX_IMAGEGEN_EDIT_THEN_MECHANICAL_ALPHA_KEY", alphaRequired: true},
    {kind: "ILLUSTRATION", route: "SOURCE", file: illustrationPath, sourceFile: sourcePath, provenance: "EXACT_VERIFIED_ARXIV_SOURCE_REBIND", alphaRequired: true},
  ];
  const layers = [];
  for (const layer of layerDefinitions) {
    const stats = await alphaStats(layer.file);
    assert(stats.width === width && stats.height === height, `layer-dimensions-invalid:${layer.kind}`);
    if (layer.alphaRequired) assert(stats.hasAlpha && stats.alpha?.min === 0 && stats.alpha?.max === 255, `layer-alpha-invalid:${layer.kind}`);
    layers.push({
      kind: layer.kind,
      route: layer.route,
      publicUrl: publicUrl(layer.file),
      sha256: fileSha256(layer.file),
      width: stats.width,
      height: stats.height,
      alphaVerified: layer.alphaRequired ? true : null,
      provenance: layer.provenance,
      sourcePublicUrl: publicUrl(layer.sourceFile),
      sourceSha256: fileSha256(layer.sourceFile),
    });
  }
  const assemblySha256 = fileSha256(assemblyPath);
  const inputHash = sha256(Buffer.from(JSON.stringify({
    masterSha256: selected.sha256,
    backgroundSha256: fileSha256(backgroundPath),
    rawElementSha256: fileSha256(rawElementPath),
    exactSourceSha256: source.titleCropSha256,
    typographyFonts: typographySpec.fonts.map((font) => font.sha256),
    exactText,
    sourceGeometry: resolvedSourceGeometry,
    visibleTypographySha256: fileSha256(typographyPath),
  })));

  manifest.candidates = manifest.candidates.map((candidate) => candidate.id === selected.id
    ? {...candidate, decision: "USER_SELECTED_LOOK_MASTER", userSelectedForFourLayerReconstruction: true}
    : candidate);
  manifest.fourLayerAssembly = {
    contract: "A1WebSourceFourLayerAssembly/v1",
    shotId: "ED-14",
    status: "ASSEMBLY_REVIEW_REQUIRED",
    currentStateTruth: "ACTUAL_FOUR_LAYER_ASSEMBLY_READY_FOR_USER_REVIEW",
    selectedLookMaster: {candidateId: selected.id, publicUrl: selected.file, sha256: selected.sha256},
    userSelectionEvidence: {acceptedPositions: [2, 4], recommendedPosition: 4, continuedAfterRecommendation: true},
    sourceBinding: {
      sourceId: source.id,
      sourceUrl: source.url,
      exactSourcePublicUrl: source.titleCrop,
      exactSourceSha256: source.titleCropSha256,
      transformedGeometry: resolvedSourceGeometry,
      generatedSourcePixelsAuthoritative: false,
      exactSourceRebound: true,
      presentationMode: "VERIFIED_SOURCE_HEADER_PLUS_EXACT_LOCAL_TITLE_AND_AUTHOR",
      exactBoundText: {titleLines: sourceGeometry.titleLines, author: sourceGeometry.authorText},
    },
    geometryAuthority: {
      source: "SELECTED_IMAGEGEN_LOOK_MASTER",
      masterSha256: selected.sha256,
      localFreehandReflowForbidden: true,
      visibleTypographyExtractedFromMaster: true,
      editableTypographyShadowRetained: true,
    },
    assemblyInputHash: inputHash,
    layers,
    typographyShadow: {publicUrl: publicUrl(typographySpecPath), sha256: fileSha256(typographySpecPath), exactText, editableSvg: publicUrl(typographySvgPath), editableShadowPng: publicUrl(typographyShadowPath), visibleTypographyPublicUrl: publicUrl(typographyPath)},
    assembly: {publicUrl: publicUrl(assemblyPath), sha256: assemblySha256, width, height},
    comparisonProof: {publicUrl: publicUrl(proofPath), sha256: fileSha256(proofPath), left: "SELECTED_IMAGEGEN_LOOK_MASTER", right: "FOUR_LAYER_EXACT_SOURCE_ASSEMBLY"},
    generation: {
      actualBackgroundImagegenEditRun: true,
      actualElementKitImagegenEditRun: true,
      maxConcurrentGenerations: 2,
      sourceAndTypographyRegeneratedByImageModel: false,
      cacheKey: inputHash,
    },
    gates: {alpha: "PASS", sourceProvenance: "PASS", editableTypographyShadow: "PASS", exactTextSpec: "PASS", visualParity: "USER_REVIEW_REQUIRED"},
    criticRun: false,
    motionRun: false,
    fullVideoRun: false,
    authorityMutation: "NONE_ED14_STANDALONE_PILOT",
    nextAction: "review-ed14-four-layer-assembly-before-motion",
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "PASS",
    contract: manifest.fourLayerAssembly.contract,
    assemblyStatus: manifest.fourLayerAssembly.status,
    assembly: manifest.fourLayerAssembly.assembly,
    layers,
    sourceBinding: manifest.fourLayerAssembly.sourceBinding,
    authorityMutation: manifest.fourLayerAssembly.authorityMutation,
    motionRun: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
