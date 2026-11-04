#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertAssetPresentationGeometryPlan, compileAssetPresentationGeometryPlan} from "../apps/studio-next/src/lib/a1-asset-presentation-geometry-v1.mjs";
import {assertExternalSourceAssetEffectPlan, compileExternalSourceAssetEffectPlan} from "../apps/studio-next/src/lib/a1-external-source-asset-effect-v1.mjs";
import {renderImageTreatmentCandidate} from "../lib/a1-four-treatment-image-factory.js";

const root = process.cwd();
const outputRoot = path.join(root, "work/external-source-asset-presentation-geometry-v1");
const assetRoot = path.join(outputRoot, "assets");
const ensureDir = (directory) => fs.mkdirSync(directory, {recursive: true});
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const clean = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const fixtures = [
  {
    id: "person-modern-outline",
    genre: "person",
    sourceClass: "PERSON_SUBJECT",
    route: "SUBJECT_ISOLATION",
    mediaRole: "PERSON_SUBJECT",
    effectIntent: "OUTLINE",
    source: "apps/studio-next/public/generated/system-line/web-source-packaging-pilot-v1/sources/dmitry-kobak-official-portrait.webp",
    prepared: "work/external-source-asset-effect-grammar-v2/blind-mattes/dmitry/dmitry-blind-edge-refined.png",
    provenance: {sourceUri: "https://kobak.net/", rightsBoundary: "official profile contextual review use"},
  },
  {
    id: "person-archive-preserve",
    genre: "person",
    sourceClass: "ARCHIVE_PHOTO",
    route: "ARCHIVE_COLLAGE",
    mediaRole: "ARCHIVE_SET",
    effectIntent: "PAPER_EDGE",
    source: "work/live-external-source-packaging-canary-v1/staging/live-source-a/01.img",
    provenance: {sourceUri: "https://commons.wikimedia.org/w/index.php?curid=128984098", license: "CC0"},
  },
  {
    id: "scene-control-room-a",
    genre: "scene",
    sourceClass: "REAL_SCREEN_OR_SCENE",
    route: "DISTRESSED_PRINT",
    mediaRole: "PRINT_ARTIFACT",
    effectIntent: "DEFAULT",
    source: "work/live-external-source-packaging-canary-v1/staging/live-source-b/02.img",
    provenance: {sourceUri: "https://www.rawpixel.com/image/440405/free-photo-image-control-room-datum-center-lsp", license: "CC0"},
  },
  {
    id: "scene-control-room-b",
    genre: "scene",
    sourceClass: "REAL_SCREEN_OR_SCENE",
    route: "DISTRESSED_PRINT",
    mediaRole: "PRINT_ARTIFACT",
    effectIntent: "DEFAULT",
    source: "work/live-external-source-packaging-canary-v1/staging/live-source-b/03.img",
    provenance: {sourceUri: "https://www.rawpixel.com/image/440441/free-photo-image-control-room-telemetry-lsp", license: "CC0"},
  },
  {
    id: "document-newspaper",
    genre: "document",
    sourceClass: "DOCUMENT_EVIDENCE",
    route: "EVIDENCE_HIGHLIGHT",
    mediaRole: "DOCUMENT_EVIDENCE",
    effectIntent: "DEFAULT",
    source: "work/live-external-source-packaging-canary-v1/staging/live-source-a/02.img",
    provenance: {sourceUri: "https://commons.wikimedia.org/w/index.php?curid=121583310", license: "CC BY-SA 4.0"},
  },
  {
    id: "document-public-health-poster",
    genre: "document",
    sourceClass: "DOCUMENT_EVIDENCE",
    route: "EVIDENCE_HIGHLIGHT",
    mediaRole: "DOCUMENT_EVIDENCE",
    effectIntent: "DEFAULT",
    source: "work/live-external-source-packaging-canary-v1/staging/live-source-c/01.img",
    provenance: {sourceUri: "https://www.flickr.com/photos/39735679@N00/443628643", license: "Public Domain Mark"},
  },
];

function labelSvg(width, height, primary, secondary = "", {background = "transparent", foreground = "#111315", align = "start"} = {}) {
  const x = align === "middle" ? width / 2 : 16;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/><text x="${x}" y="25" text-anchor="${align}" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="${foreground}">${clean(primary)}</text>${secondary ? `<text x="${x}" y="46" text-anchor="${align}" font-family="Arial,sans-serif" font-size="11" fill="${foreground}" opacity=".72">${clean(secondary)}</text>` : ""}</svg>`);
}

function busyBackground(width, height) {
  const lines = Array.from({length: 20}, (_, index) => `<path d="M${-width + index * 72} ${height} L${index * 72} 0" stroke="${index % 3 === 0 ? "#d7ff45" : index % 3 === 1 ? "#3156ef" : "#f2efe7"}" stroke-width="22" opacity=".64"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#202326"/>${lines}</svg>`);
}

async function addGeometryFrame(buffer, plan) {
  const metadata = await sharp(buffer).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const shortEdge = Math.min(width, height);
  if (plan.presentationFamily === "CUTOUT_ASSET") {
    const strokeWidth = Math.max(2, Math.round(shortEdge * plan.frame.strokeWidthRatio));
    const alpha = await sharp(buffer).ensureAlpha().extractChannel("alpha").blur(strokeWidth * .72).threshold(18).png().toBuffer();
    const stroke = await sharp({create: {width, height, channels: 3, background: "#f1eadb"}}).joinChannel(alpha).png().toBuffer();
    return sharp({create: {width, height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: stroke}, {input: buffer}]).png().toBuffer();
  }
  const borderWidth = Math.max(1, Math.round(shortEdge * plan.frame.strokeWidthRatio));
  const radius = Math.max(0, Math.round(shortEdge * plan.frame.cornerRatio));
  const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${borderWidth / 2}" y="${borderWidth / 2}" width="${width - borderWidth}" height="${height - borderWidth}" rx="${radius}" fill="none" stroke="#111315" stroke-opacity=".72" stroke-width="${borderWidth}"/></svg>`);
  return sharp(buffer).composite([{input: frame}]).png().toBuffer();
}

async function renderVariant(fixture, geometryPlan, effectPlan, ratioKey) {
  const dimensions = geometryPlan.ratio.outputs[ratioKey];
  const sourcePath = path.join(root, fixture.source);
  const preparedPath = fixture.prepared ? path.join(root, fixture.prepared) : sourcePath;
  const treatment = geometryPlan.crop.mode === "CONTAIN_TRANSPARENT"
    ? "contain-transparent"
    : geometryPlan.crop.mode === "SOURCE_PRESERVE_GRADIENT_PAD"
      ? "gradient-pad"
      : "subject-safe-cover";
  const candidate = await renderImageTreatmentCandidate({
    sourcePath: geometryPlan.presentationFamily === "CUTOUT_ASSET" ? preparedPath : sourcePath,
    width: dimensions.width,
    height: dimensions.height,
    treatment,
    paddingRatio: geometryPlan.frame.paddingRatio,
  });
  const buffer = await addGeometryFrame(candidate.buffer, geometryPlan, effectPlan);
  return {buffer, dimensions, treatment, candidate, sourcePath};
}

async function imageStats(file) {
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).ensureAlpha().stats();
  const alpha = stats.channels[3];
  return {width: Number(metadata.width || 0), height: Number(metadata.height || 0), hasAlpha: metadata.hasAlpha === true, alphaMin: alpha?.min ?? null, alphaMax: alpha?.max ?? null};
}

async function multiRatioPanel(row) {
  const width = 1000;
  const height = 650;
  const slotWidth = 320;
  const slotHeight = 550;
  const composites = [{input: labelSvg(width, 70, row.id, `${row.presentationFamily} · primary ${row.primaryRatio}`, {background: "#eeeae1"}), left: 0, top: 0}];
  for (let index = 0; index < row.variants.length; index += 1) {
    const variant = row.variants[index];
    const buffer = await sharp(path.join(root, variant.artifact.path)).resize(280, 470, {fit: "inside"}).png().toBuffer();
    const meta = await sharp(buffer).metadata();
    const left = index * slotWidth + Math.round((slotWidth - Number(meta.width || 1)) / 2);
    const top = 108 + Math.round((440 - Number(meta.height || 1)) / 2);
    composites.push({input: buffer, left, top});
    composites.push({input: labelSvg(slotWidth, 48, variant.ratio, `${variant.artifact.width}×${variant.artifact.height}`, {align: "middle"}), left: index * slotWidth, top: 590});
  }
  return sharp({create: {width, height, channels: 3, background: "#f6f2e9"}}).composite(composites).jpeg({quality: 92}).toBuffer();
}

async function stressPanel(row) {
  const width = 1000;
  const height = 650;
  const segmentWidth = Math.floor(width / 3);
  const primary = row.variants.find((variant) => variant.ratio === row.primaryRatio) || row.variants[0];
  const asset = await sharp(path.join(root, primary.artifact.path)).resize(280, 460, {fit: "inside"}).png().toBuffer();
  const assetMeta = await sharp(asset).metadata();
  const backgrounds = [
    {id: "LIGHT", buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${segmentWidth}" height="580"><rect width="100%" height="100%" fill="#f2efe7"/></svg>`)},
    {id: "DARK", buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${segmentWidth}" height="580"><rect width="100%" height="100%" fill="#151719"/></svg>`)},
    {id: "BUSY", buffer: busyBackground(segmentWidth, 580)},
  ];
  const composites = [{input: labelSvg(width, 70, row.id, `${row.primaryRatio} · ${row.cropMode}`, {background: "#111315", foreground: "#f2efe7"}), left: 0, top: 580}];
  for (let index = 0; index < backgrounds.length; index += 1) {
    const left = index * segmentWidth;
    composites.push({input: backgrounds[index].buffer, left, top: 0});
    composites.push({input: labelSvg(segmentWidth, 36, backgrounds[index].id, "", {foreground: index === 0 ? "#111315" : "#f2efe7"}), left, top: 0});
    composites.push({input: asset, left: left + Math.round((segmentWidth - Number(assetMeta.width || 1)) / 2), top: 72 + Math.round((460 - Number(assetMeta.height || 1)) / 2)});
  }
  return sharp({create: {width, height, channels: 3, background: "#111315"}}).composite(composites).jpeg({quality: 92}).toBuffer();
}

async function main() {
  ensureDir(assetRoot);
  const authorityFiles = {
    workspace: path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),
    phase: path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"),
  };
  const initialAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  const rows = [];
  for (const fixture of fixtures) {
    const sourcePath = path.join(root, fixture.source);
    const preparedPath = fixture.prepared ? path.join(root, fixture.prepared) : sourcePath;
    if (!fs.existsSync(sourcePath) || !fs.existsSync(preparedPath)) throw new Error(`presentation-source-missing:${fixture.id}`);
    const preparedMeta = await sharp(preparedPath, {failOn: "none"}).rotate().metadata();
    const preparedStats = await sharp(preparedPath, {failOn: "none"}).ensureAlpha().stats();
    const hasTransparentBackground = preparedStats.channels[3]?.min < 250;
    const geometryPlan = compileAssetPresentationGeometryPlan({
      sourceClass: fixture.sourceClass,
      mediaRole: fixture.mediaRole,
      sourceWidth: Number(preparedMeta.width || 0),
      sourceHeight: Number(preparedMeta.height || 0),
      hasTransparentBackground,
      matteAvailable: Boolean(fixture.prepared),
    });
    assertAssetPresentationGeometryPlan(geometryPlan);
    const effectPlan = compileExternalSourceAssetEffectPlan({route: fixture.route, mediaRole: fixture.mediaRole, effectIntent: fixture.effectIntent, matteAvailable: Boolean(fixture.prepared)});
    assertExternalSourceAssetEffectPlan(effectPlan);
    const variants = [];
    for (const ratio of geometryPlan.ratio.review) {
      const rendered = await renderVariant(fixture, geometryPlan, effectPlan, ratio);
      const file = path.join(assetRoot, `${fixture.id}-${ratio.replace(":", "x")}.png`);
      fs.writeFileSync(file, rendered.buffer);
      const stats = await imageStats(file);
      variants.push({
        ratio,
        primary: ratio === geometryPlan.ratio.primary,
        treatment: rendered.treatment,
        cropWindow: rendered.candidate.cropWindow,
        subjectCoverage: rendered.candidate.subjectCoverage ?? null,
        gradient: rendered.candidate.gradient,
        artifact: {path: path.relative(root, file), sha256: shaFile(file), ...stats},
      });
    }
    rows.push({
      id: fixture.id,
      genre: fixture.genre,
      sourceClass: fixture.sourceClass,
      source: {path: fixture.source, sha256: shaFile(sourcePath), ...fixture.provenance},
      geometryPlanSha256: geometryPlan.planSha256,
      effectPlanSha256: effectPlan.planSha256,
      presentationFamily: geometryPlan.presentationFamily,
      cropMode: geometryPlan.crop.mode,
      primaryRatio: geometryPlan.ratio.primary,
      reviewRatios: geometryPlan.ratio.review,
      variants,
      fullFrameBackground: false,
      visibleCopy: false,
      productionAdmission: false,
    });
  }
  const ratioPanels = await Promise.all(rows.map(multiRatioPanel));
  const ratioSheet = path.join(outputRoot, "multi-ratio-contact-sheet.jpg");
  await sharp({create: {width: 2000, height: 1950, channels: 3, background: "#0c0e0f"}}).composite(ratioPanels.map((input, index) => ({input, left: index % 2 * 1000, top: Math.floor(index / 2) * 650}))).jpeg({quality: 91}).toFile(ratioSheet);
  const stressPanels = await Promise.all(rows.map(stressPanel));
  const stressSheet = path.join(outputRoot, "background-stress-contact-sheet.jpg");
  await sharp({create: {width: 2000, height: 1950, channels: 3, background: "#0c0e0f"}}).composite(stressPanels.map((input, index) => ({input, left: index % 2 * 1000, top: Math.floor(index / 2) * 650}))).jpeg({quality: 91}).toFile(stressSheet);
  const finalAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  if (JSON.stringify(initialAuthority) !== JSON.stringify(finalAuthority)) throw new Error("asset-presentation-render-mutated-formal-authority");
  const renderResult = {
    contract: "A1AssetPresentationGeometryRender/v1",
    status: "READY_FOR_ACTUAL_PIXEL_AUDIT",
    fixtureCount: rows.length,
    genres: [...new Set(rows.map((row) => row.genre))],
    fixtures: rows,
    visibleArtifacts: {
      multiRatio: {path: path.relative(root, ratioSheet), sha256: shaFile(ratioSheet), width: 2000, height: 1950},
      backgroundStress: {path: path.relative(root, stressSheet), sha256: shaFile(stressSheet), width: 2000, height: 1950},
    },
    boundary: {reviewOnly: true, productionAdmission: false, storyboardMutationPerformed: false, authorityUnchanged: true, authoritySnapshot: finalAuthority},
  };
  fs.writeFileSync(path.join(outputRoot, "render-result.json"), `${JSON.stringify(renderResult, null, 2)}\n`);
  console.log(JSON.stringify({status: renderResult.status, fixtureCount: rows.length, ratioPrograms: rows.map((row) => ({id: row.id, family: row.presentationFamily, primary: row.primaryRatio, review: row.reviewRatios, cropMode: row.cropMode})), visibleArtifacts: renderResult.visibleArtifacts, boundary: renderResult.boundary}, null, 2));
}

await main();

