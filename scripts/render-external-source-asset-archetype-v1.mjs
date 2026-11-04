#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertExternalSourceAssetArchetypePlan, compileExternalSourceAssetArchetypePlan} from "../apps/studio-next/src/lib/a1-external-source-asset-archetype-v1.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "work/external-source-asset-archetype-v1");
const assetRoot = path.join(outputRoot, "assets");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const clean = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const ensureDir = (directory) => fs.mkdirSync(directory, {recursive: true});

const sources = {
  portraitOriginal: ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/fixtures/portrait-hair-01.jpg",
  portraitCutout: ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/assets/lite/portrait-hair-01/portrait-hair-01-edge-refined.png",
  objectOriginal: ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/fixtures/device-product-01.jpg",
  objectCutout: ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/assets/lite/device-product-01/device-product-01-edge-refined.png",
  archive: "work/live-external-source-packaging-canary-v1/staging/live-source-a/01.img",
  sceneA: "work/live-external-source-packaging-canary-v1/staging/live-source-b/02.img",
  sceneB: "work/live-external-source-packaging-canary-v1/staging/live-source-b/03.img",
  newspaper: "work/live-external-source-packaging-canary-v1/staging/live-source-a/02.img",
  poster: "work/live-external-source-packaging-canary-v1/staging/live-source-c/01.img",
};

const referenceEvidence = [
  {id: "cutout-and-prop", creatorId: "atest", eventId: "atest:prop-and-legal-income", frame: "work/bv1xzmu6te1x-typography-study-20260915/motion-sequences/prop-and-legal-income/frame-003.jpg", learned: ["TIGHT_CUTOUT", "CUTOUT_CONTRAST_STROKE"]},
  {id: "document-evidence", creatorId: "atest", eventId: "atest:first-evidence-rhythm", frame: "work/bv1xzmu6te1x-typography-study-20260915/motion-sequences/first-evidence-rhythm/frame-006.jpg", learned: ["DOCUMENT_EVIDENCE_PRESERVE"]},
  {id: "archive-comparison", creatorId: "chapingjun", eventId: "chaping:chaping-rare-earth-historical-comparison", frame: "work/external-source-asset-effect-grammar-v2/chaping-sequences/chaping-rare-earth-historical-comparison/03-195p5s.jpg", learned: ["ARCHIVE_PRINT_EDGE", "PHOTO_DIPTYCH"]},
  {id: "official-photo", creatorId: "chapingjun", eventId: "chaping:chaping-chip-official-photo-wafer", frame: "work/external-source-asset-effect-grammar-v2/chaping-sequences/chaping-chip-official-photo-wafer/03-495p5s.jpg", learned: ["SOURCE_RECT_CLEAN"]},
  {id: "foreground-object", creatorId: "hupo", eventId: "hupo:H-R10", frame: "apps/studio-next/public/generated/system-line/reference-sequence-corpus-v2/frames/hupo/H-R10/03-225p4s.jpg", learned: ["TIGHT_CUTOUT", "HALFTONE_ECHO"]},
];

function checkerSvg(width, height, cell = 24) {
  const marks = [];
  for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) marks.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(x / cell + y / cell) % 2 ? "#d7d6d1" : "#f2f0e9"}"/>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${marks.join("")}</svg>`);
}

function labelSvg(width, height, title, subtitle = "", {background = "#111315", foreground = "#f2efe7"} = {}) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/><text x="18" y="28" font-family="Arial,sans-serif" font-size="16" font-weight="700" fill="${foreground}">${clean(title)}</text>${subtitle ? `<text x="18" y="51" font-family="Arial,sans-serif" font-size="12" fill="${foreground}" opacity=".72">${clean(subtitle)}</text>` : ""}</svg>`);
}

function busySvg(width, height) {
  const circles = Array.from({length: 28}, (_, index) => `<circle cx="${(index * 97) % width}" cy="${(index * 61) % height}" r="${24 + index % 5 * 8}" fill="${index % 3 === 0 ? "#d7ff45" : index % 3 === 1 ? "#3156ef" : "#e84736"}" opacity=".62"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#242628"/>${circles}</svg>`);
}

async function trimmedCutout(sourceFile) {
  return sharp(sourceFile, {failOn: "none"})
    .rotate()
    .ensureAlpha()
    .trim({background: {r: 0, g: 0, b: 0, alpha: 0}, threshold: 10})
    .resize({width: 620, height: 650, fit: "inside", withoutEnlargement: false})
    .png()
    .toBuffer();
}

async function alphaLayer(mask, width, height, color) {
  const alpha = await sharp(mask).grayscale().linear(Number(color.alpha ?? 1)).png().toBuffer();
  return sharp({create: {width, height, channels: 3, background: {r: color.r, g: color.g, b: color.b}}}).joinChannel(alpha).png().toBuffer();
}

async function addTransparentPadding(buffer, padding) {
  return sharp(buffer).extend({top: padding, bottom: padding, left: padding, right: padding, background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
}

async function renderTightCutout(sourceFile) {
  const cutout = await trimmedCutout(sourceFile);
  const metadata = await sharp(cutout).metadata();
  const padding = Math.max(8, Math.round(Math.min(Number(metadata.width || 1), Number(metadata.height || 1)) * .018));
  return addTransparentPadding(cutout, padding);
}

async function renderOutlinedCutout(sourceFile) {
  const cutout = await trimmedCutout(sourceFile);
  const metadata = await sharp(cutout).metadata();
  const padding = Math.max(12, Math.round(Math.min(Number(metadata.width || 1), Number(metadata.height || 1)) * .034));
  const primary = await addTransparentPadding(cutout, padding);
  const primaryMeta = await sharp(primary).metadata();
  const width = Number(primaryMeta.width || 1);
  const height = Number(primaryMeta.height || 1);
  const alpha = await sharp(primary).extractChannel("alpha").png().toBuffer();
  const outerMask = await sharp(alpha).blur(4.6).threshold(7).png().toBuffer();
  const paperMask = await sharp(alpha).blur(2.8).threshold(11).png().toBuffer();
  const outer = await alphaLayer(outerMask, width, height, {r: 18, g: 19, b: 18, alpha: .82});
  const paper = await alphaLayer(paperMask, width, height, {r: 244, g: 239, b: 225, alpha: 1});
  return sharp({create: {width, height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: outer}, {input: paper}, {input: primary}]).png().toBuffer();
}

async function halftoneLayer(input, cell = 10) {
  const metadata = await sharp(input).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const sampleWidth = Math.max(1, Math.ceil(width / cell));
  const sampleHeight = Math.max(1, Math.ceil(height / cell));
  const {data, info} = await sharp(input).resize(sampleWidth, sampleHeight, {fit: "fill"}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const dots = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const alpha = data[offset + 3] / 255;
      if (alpha < .06) continue;
      const luminance = (data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722) / 255;
      const radius = Math.max(0, (1 - luminance) * cell * .55 * alpha);
      if (radius > .4) dots.push(`<circle cx="${(x + .5) * cell}" cy="${(y + .5) * cell}" r="${radius.toFixed(2)}"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="#111315" opacity=".72">${dots.join("")}</g></svg>`);
}

async function renderHalftoneEcho(sourceFile) {
  const cutout = await trimmedCutout(sourceFile);
  const mono = await sharp(cutout).grayscale().linear(1.08, -5).png().toBuffer();
  const dots = await halftoneLayer(cutout, 10);
  const metadata = await sharp(cutout).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const offset = Math.max(16, Math.round(width * .045));
  return sharp({create: {width: width + offset * 2, height: height + offset, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: dots, left: offset * 2, top: 0}, {input: mono, left: 0, top: offset}]).png().toBuffer();
}

async function renderArchivePrint(sourceFile) {
  const source = await sharp(sourceFile, {failOn: "none"}).rotate().resize({width: 620, height: 620, fit: "inside"}).grayscale().png().toBuffer();
  const metadata = await sharp(source).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const edge = Math.max(8, Math.round(Math.min(width, height) * .014));
  const paper = await sharp(source).extend({top: edge, bottom: edge + Math.round(edge * .35), left: edge, right: edge, background: "#eee8dc"}).png().toBuffer();
  const paperMeta = await sharp(paper).metadata();
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${paperMeta.width}" height="${paperMeta.height}"><rect x=".75" y=".75" width="${Number(paperMeta.width || 1) - 1.5}" height="${Number(paperMeta.height || 1) - 1.5}" fill="none" stroke="#171816" stroke-opacity=".58" stroke-width="1.5"/></svg>`);
  return sharp(paper).composite([{input: frame}]).png().toBuffer();
}

async function renderSourceRect(sourceFile, {width = 720, height = 540} = {}) {
  return sharp(sourceFile, {failOn: "none"}).rotate().resize({width, height, fit: "inside", withoutEnlargement: false}).png().toBuffer();
}

async function renderDiptych(leftFile, rightFile) {
  const height = 360;
  const gap = 14;
  const left = await sharp(leftFile, {failOn: "none"}).rotate().resize({height}).png().toBuffer();
  const right = await sharp(rightFile, {failOn: "none"}).rotate().resize({height}).png().toBuffer();
  const leftMeta = await sharp(left).metadata();
  const rightMeta = await sharp(right).metadata();
  const width = Number(leftMeta.width || 1) + gap + Number(rightMeta.width || 1);
  return sharp({create: {width, height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: left, left: 0, top: 0}, {input: right, left: Number(leftMeta.width || 1) + gap, top: 0}]).png().toBuffer();
}

async function statsFor(file) {
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).ensureAlpha().stats();
  return {width: Number(metadata.width || 0), height: Number(metadata.height || 0), hasAlpha: metadata.hasAlpha === true, alphaMin: stats.channels[3]?.min ?? null, alphaMax: stats.channels[3]?.max ?? null};
}

async function writeAsset({id, genre, sourceClass, mediaRole, planInput, sourcePaths, render, pixelTreatment}) {
  const plan = compileExternalSourceAssetArchetypePlan({sourceClass, mediaRole, ...planInput});
  assertExternalSourceAssetArchetypePlan(plan);
  const buffer = await render();
  const file = path.join(assetRoot, `${id}.png`);
  fs.writeFileSync(file, buffer);
  return {
    id,
    genre,
    archetype: plan.archetype,
    planSha256: plan.planSha256,
    geometry: plan.geometry,
    treatment: plan.treatment,
    sources: sourcePaths.map((sourcePath) => ({path: sourcePath, sha256: shaFile(path.join(root, sourcePath))})),
    artifact: {path: path.relative(root, file), sha256: shaFile(file), ...await statsFor(file)},
    pixelTreatment,
    visibleCopy: false,
    backgroundGenerated: false,
    fixedCardRatio: false,
    productionAdmission: false,
  };
}

async function buildAssetSheet(rows) {
  const tileWidth = 720;
  const tileHeight = 650;
  const cols = 3;
  const rowsCount = Math.ceil(rows.length / cols);
  const composites = [];
  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index];
    const col = index % cols;
    const row = Math.floor(index / cols);
    const left = col * tileWidth;
    const top = row * tileHeight;
    const preview = await sharp(path.join(root, item.artifact.path)).resize(640, 520, {fit: "inside"}).png().toBuffer();
    const meta = await sharp(preview).metadata();
    composites.push({input: checkerSvg(tileWidth, tileHeight - 74), left, top});
    composites.push({input: preview, left: left + Math.round((tileWidth - Number(meta.width || 1)) / 2), top: top + Math.round((tileHeight - 74 - Number(meta.height || 1)) / 2)});
    composites.push({input: labelSvg(tileWidth, 74, item.id, item.archetype), left, top: top + tileHeight - 74});
  }
  const file = path.join(outputRoot, "asset-only-archetype-sheet.png");
  await sharp({create: {width: cols * tileWidth, height: rowsCount * tileHeight, channels: 4, background: "#111315"}}).composite(composites).png().toFile(file);
  return file;
}

async function buildReferenceSheet(rows) {
  const width = 1920;
  const rowHeight = 330;
  const selected = [
    {evidence: referenceEvidence[0], assetId: "cutout-outline"},
    {evidence: referenceEvidence[1], assetId: "document-preserve"},
    {evidence: referenceEvidence[2], assetId: "archive-print"},
    {evidence: referenceEvidence[3], assetId: "scene-rect"},
    {evidence: referenceEvidence[4], assetId: "halftone-secondary"},
  ];
  const composites = [];
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    const asset = rows.find((row) => row.id === item.assetId);
    const reference = await sharp(path.join(root, item.evidence.frame)).resize(900, 260, {fit: "contain", background: "#ebe7dd"}).jpeg({quality: 90}).toBuffer();
    const output = await sharp(path.join(root, asset.artifact.path)).resize(900, 260, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
    const top = index * rowHeight;
    composites.push({input: labelSvg(960, 58, `REFERENCE · ${item.evidence.creatorId}`, item.evidence.eventId), left: 0, top});
    composites.push({input: labelSvg(960, 58, `A1 ASSET · ${asset.archetype}`, asset.id), left: 960, top});
    composites.push({input: reference, left: 30, top: top + 65});
    composites.push({input: checkerSvg(960, 272), left: 960, top: top + 58});
    composites.push({input: output, left: 990, top: top + 65});
  }
  const file = path.join(outputRoot, "reference-to-archetype-sheet.jpg");
  await sharp({create: {width, height: selected.length * rowHeight, channels: 3, background: "#e9e5dc"}}).composite(composites).jpeg({quality: 91}).toFile(file);
  return file;
}

async function buildTransparentStress(rows) {
  const selected = rows.filter((row) => ["cutout-clean", "cutout-outline", "halftone-secondary"].includes(row.id));
  const segmentWidth = 600;
  const rowHeight = 420;
  const backgrounds = [
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${segmentWidth}" height="${rowHeight}"><rect width="100%" height="100%" fill="#f0ede5"/></svg>`),
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${segmentWidth}" height="${rowHeight}"><rect width="100%" height="100%" fill="#151719"/></svg>`),
    busySvg(segmentWidth, rowHeight),
  ];
  const composites = [];
  for (let rowIndex = 0; rowIndex < selected.length; rowIndex += 1) {
    const asset = await sharp(path.join(root, selected[rowIndex].artifact.path)).resize(500, 340, {fit: "inside"}).png().toBuffer();
    const meta = await sharp(asset).metadata();
    for (let col = 0; col < backgrounds.length; col += 1) {
      const left = col * segmentWidth;
      const top = rowIndex * rowHeight;
      composites.push({input: backgrounds[col], left, top});
      composites.push({input: asset, left: left + Math.round((segmentWidth - Number(meta.width || 1)) / 2), top: top + Math.round((rowHeight - Number(meta.height || 1)) / 2)});
    }
  }
  const file = path.join(outputRoot, "transparent-edge-stress.png");
  await sharp({create: {width: segmentWidth * 3, height: rowHeight * selected.length, channels: 4, background: "#111315"}}).composite(composites).png().toFile(file);
  return file;
}

async function main() {
  ensureDir(assetRoot);
  for (const source of Object.values(sources)) if (!fs.existsSync(path.join(root, source))) throw new Error(`asset-archetype-source-missing:${source}`);
  for (const item of referenceEvidence) if (!fs.existsSync(path.join(root, item.frame))) throw new Error(`asset-archetype-reference-missing:${item.id}`);
  const authorityFiles = {
    workspace: path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),
    phase: path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"),
  };
  const initialAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  const rows = [];
  rows.push(await writeAsset({id: "cutout-clean", genre: "person", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", planInput: {matteAvailable: true}, sourcePaths: [sources.portraitOriginal, sources.portraitCutout], render: () => renderTightCutout(path.join(root, sources.portraitCutout)), pixelTreatment: "ALPHA_TRIM_AND_RESAMPLE"}));
  rows.push(await writeAsset({id: "cutout-outline", genre: "person", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", planInput: {matteAvailable: true, effectIntent: "OUTLINE"}, sourcePaths: [sources.portraitOriginal, sources.portraitCutout], render: () => renderOutlinedCutout(path.join(root, sources.portraitCutout)), pixelTreatment: "ALPHA_TRIM_PLUS_DUAL_CONTRAST_EDGE"}));
  rows.push(await writeAsset({id: "halftone-secondary", genre: "person", sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", planInput: {matteAvailable: true, effectIntent: "HALFTONE_ACCENT", outputRole: "SECONDARY"}, sourcePaths: [sources.portraitOriginal, sources.portraitCutout], render: () => renderHalftoneEcho(path.join(root, sources.portraitCutout)), pixelTreatment: "MONO_PRIMARY_PLUS_OFFSET_HALFTONE_SECONDARY"}));
  rows.push(await writeAsset({id: "object-cutout", genre: "object", sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", planInput: {matteAvailable: true}, sourcePaths: [sources.objectOriginal, sources.objectCutout], render: () => renderTightCutout(path.join(root, sources.objectCutout)), pixelTreatment: "ALPHA_TRIM_AND_RESAMPLE"}));
  rows.push(await writeAsset({id: "archive-print", genre: "archive", sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET", planInput: {}, sourcePaths: [sources.archive], render: () => renderArchivePrint(path.join(root, sources.archive)), pixelTreatment: "MONO_RESAMPLE_PLUS_NARROW_PRINT_EDGE"}));
  rows.push(await writeAsset({id: "scene-rect", genre: "scene", sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT", planInput: {}, sourcePaths: [sources.sceneA], render: () => renderSourceRect(path.join(root, sources.sceneA)), pixelTreatment: "RESAMPLE_ONLY"}));
  rows.push(await writeAsset({id: "photo-diptych", genre: "scene", sourceClass: "REAL_SCREEN_OR_SCENE", mediaRole: "PRINT_ARTIFACT", planInput: {assetCount: 2, comparisonIntent: true}, sourcePaths: [sources.sceneA, sources.sceneB], render: () => renderDiptych(path.join(root, sources.sceneA), path.join(root, sources.sceneB)), pixelTreatment: "TWO_SOURCE_RESAMPLE_AND_GROUP"}));
  rows.push(await writeAsset({id: "document-preserve", genre: "document", sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", planInput: {}, sourcePaths: [sources.newspaper], render: () => renderSourceRect(path.join(root, sources.newspaper), {width: 760, height: 560}), pixelTreatment: "RESAMPLE_ONLY"}));
  rows.push(await writeAsset({id: "poster-preserve", genre: "document", sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", planInput: {}, sourcePaths: [sources.poster], render: () => renderSourceRect(path.join(root, sources.poster), {width: 560, height: 680}), pixelTreatment: "RESAMPLE_ONLY"}));
  const assetSheet = await buildAssetSheet(rows);
  const referenceSheet = await buildReferenceSheet(rows);
  const stressSheet = await buildTransparentStress(rows);
  const finalAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  if (JSON.stringify(initialAuthority) !== JSON.stringify(finalAuthority)) throw new Error("asset-archetype-render-mutated-formal-authority");
  const evidence = referenceEvidence.map((item) => ({...item, frameSha256: shaFile(path.join(root, item.frame))}));
  const visibleArtifacts = {};
  for (const [key, file] of Object.entries({assetOnly: assetSheet, referenceComparison: referenceSheet, transparentStress: stressSheet})) {
    const metadata = await sharp(file).metadata();
    visibleArtifacts[key] = {path: path.relative(root, file), sha256: shaFile(file), width: Number(metadata.width || 0), height: Number(metadata.height || 0)};
  }
  const renderResult = {
    contract: "A1ExternalSourceAssetArchetypeRender/v1",
    status: "READY_FOR_ACTUAL_PIXEL_AUDIT",
    fixtures: rows,
    referenceEvidence: evidence,
    visibleArtifacts,
    boundary: {reviewOnly: true, productionAdmission: false, storyboardMutationPerformed: false, authorityUnchanged: true, authoritySnapshot: finalAuthority},
  };
  fs.writeFileSync(path.join(outputRoot, "render-result.json"), `${JSON.stringify(renderResult, null, 2)}\n`);
  console.log(JSON.stringify({status: renderResult.status, fixtures: rows.map((row) => ({id: row.id, archetype: row.archetype, dimensions: [row.artifact.width, row.artifact.height], alpha: [row.artifact.alphaMin, row.artifact.alphaMax]})), referenceCreators: [...new Set(evidence.map((item) => item.creatorId))], visibleArtifacts, boundary: renderResult.boundary}, null, 2));
}

await main();
