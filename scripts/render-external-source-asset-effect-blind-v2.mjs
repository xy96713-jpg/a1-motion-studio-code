#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertExternalSourceAssetEffectGrammar} from "../apps/studio-next/src/lib/a1-external-source-asset-effect-grammar-v2.mjs";
import {assertExternalSourceAssetEffectPlan, compileExternalSourceAssetEffectPlan} from "../apps/studio-next/src/lib/a1-external-source-asset-effect-v1.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "work/external-source-asset-effect-grammar-v2/blind-test");
const assetRoot = path.join(outputRoot, "assets");
const grammar = JSON.parse(fs.readFileSync(path.join(root, "work/external-source-asset-effect-grammar-v2/grammar.json"), "utf8"));
assertExternalSourceAssetEffectGrammar(grammar);
const size = 720;
const inset = 50;
const inner = size - inset * 2;
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ensureDir = (dir) => fs.mkdirSync(dir, {recursive: true});

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

function checkerSvg(width, height, cell = 24) {
  const marks = [];
  for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) marks.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(x / cell + y / cell) % 2 ? "#d6d6d3" : "#f2f1ed"}"/>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${marks.join("")}</svg>`);
}

function busySvg(width, height) {
  const lines = Array.from({length: 22}, (_, index) => `<path d="M${-width + index * 58} ${height} L${index * 58} 0" stroke="${index % 3 === 0 ? "#d7ff45" : index % 3 === 1 ? "#3156ef" : "#f2efe7"}" stroke-width="18" opacity=".72"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#202326"/>${lines}</svg>`);
}

function textSvg(width, height, title, subtitle) {
  const clean = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111315"/><text x="20" y="25" fill="#d7ff45" font-family="Arial,sans-serif" font-size="16" font-weight="700">${clean(title)}</text><text x="20" y="47" fill="#f3efe4" font-family="Arial,sans-serif" font-size="13">${clean(subtitle)}</text></svg>`);
}

async function alphaLayer(mask, color) {
  const alpha = Number(color.alpha ?? 1);
  const alphaMask = await sharp(mask).grayscale().linear(alpha).png().toBuffer();
  return sharp({create: {width: inner, height: inner, channels: 3, background: {r: color.r, g: color.g, b: color.b}}}).joinChannel(alphaMask).png().toBuffer();
}

async function renderFixture(fixture, plan) {
  const sourcePath = path.join(root, fixture.source);
  const preparedPath = fixture.prepared ? path.join(root, fixture.prepared) : sourcePath;
  if (!fs.existsSync(sourcePath) || !fs.existsSync(preparedPath)) throw new Error(`blind-source-missing:${fixture.id}`);
  let primary = await sharp(preparedPath).resize(inner, inner, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).ensureAlpha().png().toBuffer();
  const composites = [];
  if (plan.effectStack.includes("PAPER_EDGE")) {
    primary = await sharp(sourcePath).resize(inner - 28, inner - 28, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).ensureAlpha().extend({top: 14, bottom: 14, left: 14, right: 14, background: "#eee6d3"}).png().toBuffer();
  }
  if (plan.effectStack.includes("CONTRAST_STROKE")) {
    const alpha = await sharp(primary).ensureAlpha().extractChannel("alpha").blur(3.2).threshold(22).png().toBuffer();
    const stroke = await alphaLayer(alpha, {r: 245, g: 242, b: 231, alpha: 1});
    composites.push({input: stroke, left: inset, top: inset});
  }
  composites.push({input: primary, left: inset, top: inset});
  const buffer = await sharp({create: {width: size, height: size, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite(composites).png().toBuffer();
  return {buffer, sourcePath};
}

async function previewPanel(fixture, assetBuffer, plan) {
  const panelWidth = 960;
  const panelHeight = 620;
  const segmentWidth = 320;
  const previewSize = 280;
  const preview = await sharp(assetBuffer).resize(previewSize, previewSize, {fit: "contain"}).png().toBuffer();
  const light = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="540"><rect width="100%" height="100%" fill="#f2efe7"/><text x="12" y="24" font-family="Arial" font-size="13" fill="#222">LIGHT</text></svg>`);
  const dark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="540"><rect width="100%" height="100%" fill="#151719"/><text x="12" y="24" font-family="Arial" font-size="13" fill="#eee">DARK</text></svg>`);
  const busy = await sharp(busySvg(320, 540)).composite([{input: textSvg(320, 34, "BUSY", ""), left: 0, top: 0}]).png().toBuffer();
  return sharp({create: {width: panelWidth, height: panelHeight, channels: 3, background: "#111315"}}).composite([
    {input: light, left: 0, top: 0},
    {input: dark, left: segmentWidth, top: 0},
    {input: busy, left: segmentWidth * 2, top: 0},
    {input: preview, left: 20, top: 110},
    {input: preview, left: segmentWidth + 20, top: 110},
    {input: preview, left: segmentWidth * 2 + 20, top: 110},
    {input: textSvg(panelWidth, 80, fixture.id, plan.effectStack.join(" + ")), left: 0, top: 540},
  ]).jpeg({quality: 91}).toBuffer();
}

async function alphaStats(file) {
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).stats();
  const alpha = stats.channels[3];
  return {width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha === true, alphaMin: alpha?.min ?? null, alphaMax: alpha?.max ?? null};
}

async function main() {
  ensureDir(assetRoot);
  const initialAuthority = {
    workspace: shaFile(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json")),
    phase: shaFile(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json")),
  };
  const rows = [];
  const panels = [];
  for (const fixture of fixtures) {
    const plan = compileExternalSourceAssetEffectPlan({route: fixture.route, mediaRole: fixture.mediaRole, effectIntent: fixture.effectIntent, matteAvailable: fixture.mediaRole === "PERSON_SUBJECT" ? true : undefined});
    assertExternalSourceAssetEffectPlan(plan);
    const rendered = await renderFixture(fixture, plan);
    const file = path.join(assetRoot, `${fixture.id}.png`);
    fs.writeFileSync(file, rendered.buffer);
    const stats = await alphaStats(file);
    if (!stats.hasAlpha || stats.alphaMin !== 0 || stats.alphaMax !== 255) throw new Error(`blind-alpha-contract:${fixture.id}`);
    panels.push(await previewPanel(fixture, rendered.buffer, plan));
    rows.push({
      id: fixture.id,
      genre: fixture.genre,
      sourceClass: fixture.sourceClass,
      source: {path: fixture.source, sha256: shaFile(rendered.sourcePath), ...fixture.provenance},
      planSha256: plan.planSha256,
      effectStack: plan.effectStack,
      artifact: {path: path.relative(root, file), sha256: shaFile(file), ...stats},
      fullFrameBackground: false,
      visibleCopy: false,
      productionAdmission: false,
    });
  }
  const sheet = path.join(outputRoot, "blind-test-contact-sheet.jpg");
  await sharp({create: {width: 2880, height: 1240, channels: 3, background: "#090b0c"}}).composite(panels.map((input, index) => ({input, left: (index % 3) * 960, top: Math.floor(index / 3) * 620}))).jpeg({quality: 90}).toFile(sheet);
  const finalAuthority = {
    workspace: shaFile(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json")),
    phase: shaFile(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json")),
  };
  if (JSON.stringify(initialAuthority) !== JSON.stringify(finalAuthority)) throw new Error("blind-test-mutated-formal-authority");
  const result = {
    contract: "A1ExternalSourceAssetEffectBlindTest/v2",
    status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
    grammarSha256: grammar.grammarSha256,
    fixtureCount: rows.length,
    genres: [...new Set(rows.map((row) => row.genre))],
    results: rows,
    visibleArtifact: {path: path.relative(root, sheet), sha256: shaFile(sheet), width: 2880, height: 1240},
    boundary: {reviewOnly: true, productionAdmission: false, storyboardMutationPerformed: false, authorityUnchanged: true, authoritySnapshot: finalAuthority},
  };
  fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({status: result.status, fixtureCount: result.fixtureCount, genres: result.genres, visibleArtifact: result.visibleArtifact, effects: rows.map((row) => ({id: row.id, effectStack: row.effectStack, alpha: [row.artifact.alphaMin, row.artifact.alphaMax]})), boundary: result.boundary}, null, 2));
}

await main();
