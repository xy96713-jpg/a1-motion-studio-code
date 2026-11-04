#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertAssetArtTreatmentPlan, compileAssetArtTreatmentPlan} from "../apps/studio-next/src/lib/a1-asset-art-treatment-director-v1.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "work/asset-art-treatment-v1");
const assetRoot = path.join(outputRoot, "assets");
const cleanRoot = path.join(root, "work/external-source-asset-archetype-v1/assets");
const styleDnaFile = path.join(root, "work/style-research/editorial-print-intervention-2026-09-17.md");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const ensureDir = (directory) => fs.mkdirSync(directory, {recursive: true});
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const cleanText = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const cleanAssets = {
  person: path.join(cleanRoot, "cutout-clean.png"),
  personColor: path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/assets/lite/mask-multi-person-01/mask-multi-person-01-edge-refined.png"),
  archive: path.join(cleanRoot, "archive-print.png"),
  object: path.join(cleanRoot, "object-cutout.png"),
  scene: path.join(cleanRoot, "scene-rect.png"),
  evidence: path.join(cleanRoot, "document-preserve.png"),
};

function noise01(x, y, seed = 17) {
  let value = Math.imul((x + 1) ^ seed, 374761393) ^ Math.imul((y + 1) ^ (seed * 31), 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function checkerSvg(width, height, cell = 22) {
  const rects = [];
  for (let y = 0; y < height; y += cell) for (let x = 0; x < width; x += cell) rects.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(x / cell + y / cell) % 2 ? "#d8d7d2" : "#f2f0ea"}"/>`);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join("")}</svg>`);
}

function labelSvg(width, height, title, subtitle = "") {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#111315"/><text x="18" y="27" fill="#f3efe5" font-family="Arial,sans-serif" font-size="15" font-weight="700">${cleanText(title)}</text>${subtitle ? `<text x="18" y="49" fill="#aaa79e" font-family="Arial,sans-serif" font-size="11">${cleanText(subtitle)}</text>` : ""}</svg>`);
}

function busySvg(width, height) {
  const paths = Array.from({length: 16}, (_, index) => `<path d="M${-width + index * 96} ${height}L${index * 96} 0" stroke="${index % 3 === 0 ? "#d7ff45" : index % 3 === 1 ? "#3156ef" : "#e84736"}" stroke-width="24" opacity=".58"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#242628"/>${paths}</svg>`);
}

async function renderInkMono(input) {
  return sharp(input).grayscale().linear(1.13, -8).gamma(1.04).png().toBuffer();
}

async function renderXeroxGrain(input) {
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const output = Buffer.alloc(data.length);
  const paper = [239, 234, 221];
  const ink = [21, 22, 20];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const luminance = (data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722) / 255;
      const noise = noise01(x, y, 43);
      let coverage = clamp(((1 - luminance) - .06) * 1.58 + (noise - .5) * .25, 0, 1);
      if (coverage < .16) coverage = 0;
      else if (coverage > .7) coverage = 1;
      else coverage *= .76;
      if (noise > .925 && coverage < .82) coverage *= .08;
      if (noise < .034 && coverage > .2) coverage = Math.min(1, coverage + .3);
      for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = Math.round(paper[channel] * (1 - coverage) + ink[channel] * coverage);
      output[offset + 3] = data[offset + 3];
    }
  }
  return sharp(output, {raw: {width: info.width, height: info.height, channels: 4}}).png().toBuffer();
}

async function halftoneSvg(input, cell, color) {
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
      if (alpha < .08) continue;
      const luminance = (data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722) / 255;
      const radius = Math.max(0, (1 - luminance) * cell * .58 * alpha);
      if (radius > .42) dots.push(`<circle cx="${(x + .5) * cell}" cy="${(y + .5) * cell}" r="${radius.toFixed(2)}"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="${color}" opacity=".76">${dots.join("")}</g></svg>`);
}

async function renderHalftoneEcho(input) {
  const main = await sharp(input).grayscale().linear(1.08, -5).png().toBuffer();
  const metadata = await sharp(main).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const cell = Math.max(7, Math.round(Math.min(width, height) * .015));
  const offset = Math.max(10, Math.round(Math.min(width, height) * .026));
  const dots = await halftoneSvg(input, cell, "#3156ef");
  return sharp({create: {width: width + offset * 2, height: height + offset, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: dots, left: offset * 2, top: 0}, {input: main, left: 0, top: offset}]).png().toBuffer();
}

async function renderDither1Bit(input) {
  const matrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const output = Buffer.alloc(data.length);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const luminance = data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722;
      const threshold = (matrix[y % 4][x % 4] + .5) / 16 * 255;
      const value = luminance >= threshold ? 239 : 18;
      output[offset] = value;
      output[offset + 1] = value;
      output[offset + 2] = value;
      output[offset + 3] = data[offset + 3];
    }
  }
  return sharp(output, {raw: {width: info.width, height: info.height, channels: 4}}).png().toBuffer();
}

function tornPolygon(width, height, depth) {
  const points = [];
  const step = Math.max(18, Math.round(Math.min(width, height) * .045));
  for (let x = 0; x <= width; x += step) points.push([Math.min(width, x), Math.round(depth * (.35 + noise01(x, 0, 79) * .65))]);
  points.push([width - Math.round(depth * .4), 0]);
  for (let y = step; y <= height; y += step) points.push([width - Math.round(depth * (.35 + noise01(width, y, 83) * .65)), Math.min(height, y)]);
  points.push([width, height - Math.round(depth * .4)]);
  for (let x = width - step; x >= 0; x -= step) points.push([Math.max(0, x), height - Math.round(depth * (.35 + noise01(x, height, 89) * .65))]);
  points.push([Math.round(depth * .4), height]);
  for (let y = height - step; y >= 0; y -= step) points.push([Math.round(depth * (.35 + noise01(0, y, 97) * .65)), Math.max(0, y)]);
  return points.map((point) => point.join(",")).join(" ");
}

async function renderTornPaperEdge(input) {
  const metadata = await sharp(input).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const depth = Math.max(8, Math.round(Math.min(width, height) * .024));
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon points="${tornPolygon(width, height, depth)}" fill="white"/></svg>`);
  return sharp(input).ensureAlpha().composite([{input: mask, blend: "dest-in"}]).png().toBuffer();
}

async function colorizePlate(input, color, contrast = 1.08) {
  const [red, green, blue] = color;
  const {data, info} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const output = Buffer.alloc(data.length);
  for (let offset = 0; offset < data.length; offset += 4) {
    const luminance = clamp((data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722) * contrast, 0, 255);
    const inkAmount = clamp(1 - luminance / 255, 0, 1);
    output[offset] = Math.round(255 * (1 - inkAmount) + red * inkAmount);
    output[offset + 1] = Math.round(255 * (1 - inkAmount) + green * inkAmount);
    output[offset + 2] = Math.round(255 * (1 - inkAmount) + blue * inkAmount);
    output[offset + 3] = data[offset + 3];
  }
  return sharp(output, {raw: {width: info.width, height: info.height, channels: 4}}).png().toBuffer();
}

async function renderPrintMisregister(input) {
  const metadata = await sharp(input).metadata();
  const width = Number(metadata.width || 1);
  const height = Number(metadata.height || 1);
  const offset = Math.max(3, Math.round(Math.min(width, height) * .012));
  const base = await colorizePlate(input, [17, 19, 19], 1.12);
  const spot = await colorizePlate(input, [49, 86, 239], 1.02);
  return sharp({create: {width: width + offset * 2, height: height + offset * 2, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: spot, left: offset * 2, top: 0}, {input: base, left: 0, top: offset * 2}]).png().toBuffer();
}

async function imageStats(file) {
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).ensureAlpha().stats();
  return {width: Number(metadata.width || 0), height: Number(metadata.height || 0), hasAlpha: metadata.hasAlpha === true, alphaMin: stats.channels[3]?.min ?? null, alphaMax: stats.channels[3]?.max ?? null};
}

async function writeTreatment({id, genre, cleanAsset, planInput, render}) {
  const plan = compileAssetArtTreatmentPlan(planInput);
  assertAssetArtTreatmentPlan(plan);
  const cleanSha256 = shaFile(cleanAsset);
  const output = await render(fs.readFileSync(cleanAsset));
  const file = path.join(assetRoot, `${id}.png`);
  fs.writeFileSync(file, output);
  return {
    id,
    genre,
    treatment: plan.routing.treatment,
    outputRole: plan.routing.outputRole,
    planSha256: plan.planSha256,
    parameters: plan.parameters,
    protection: plan.protection,
    boundaries: plan.boundaries,
    cleanAsset: {path: path.relative(root, cleanAsset), sha256: cleanSha256},
    artifact: {path: path.relative(root, file), sha256: shaFile(file), ...await imageStats(file)},
  };
}

async function makePreview(file, width, height) {
  return sharp(file).resize(width, height, {fit: "inside"}).png().toBuffer();
}

async function buildComparisonSheet(rows) {
  const width = 1800;
  const rowHeight = 360;
  const half = width / 2;
  const composites = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const top = index * rowHeight;
    const clean = await makePreview(path.join(root, row.cleanAsset.path), 790, 270);
    const treated = await makePreview(path.join(root, row.artifact.path), 790, 270);
    const cleanMeta = await sharp(clean).metadata();
    const treatedMeta = await sharp(treated).metadata();
    composites.push({input: checkerSvg(half, rowHeight - 62), left: 0, top});
    composites.push({input: checkerSvg(half, rowHeight - 62), left: half, top});
    composites.push({input: clean, left: Math.round((half - Number(cleanMeta.width || 1)) / 2), top: top + Math.round((rowHeight - 62 - Number(cleanMeta.height || 1)) / 2)});
    composites.push({input: treated, left: half + Math.round((half - Number(treatedMeta.width || 1)) / 2), top: top + Math.round((rowHeight - 62 - Number(treatedMeta.height || 1)) / 2)});
    composites.push({input: labelSvg(half, 62, `CLEAN · ${row.id}`, path.basename(row.cleanAsset.path)), left: 0, top: top + rowHeight - 62});
    composites.push({input: labelSvg(half, 62, `TREATMENT · ${row.treatment}`, `${row.outputRole} · effect budget 1`), left: half, top: top + rowHeight - 62});
  }
  const file = path.join(outputRoot, "art-treatment-comparison-sheet.png");
  await sharp({create: {width, height: rows.length * rowHeight, channels: 4, background: "#111315"}}).composite(composites).png().toFile(file);
  return file;
}

async function buildTreatmentGrid(rows) {
  const tileWidth = 720;
  const tileHeight = 620;
  const cols = 3;
  const composites = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const col = index % cols;
    const gridRow = Math.floor(index / cols);
    const left = col * tileWidth;
    const top = gridRow * tileHeight;
    const preview = await makePreview(path.join(root, row.artifact.path), 640, 500);
    const meta = await sharp(preview).metadata();
    composites.push({input: checkerSvg(tileWidth, tileHeight - 66), left, top});
    composites.push({input: preview, left: left + Math.round((tileWidth - Number(meta.width || 1)) / 2), top: top + Math.round((tileHeight - 66 - Number(meta.height || 1)) / 2)});
    composites.push({input: labelSvg(tileWidth, 66, row.treatment, `${row.genre} · ${row.outputRole}`), left, top: top + tileHeight - 66});
  }
  const file = path.join(outputRoot, "art-treatment-grid.png");
  await sharp({create: {width: cols * tileWidth, height: Math.ceil(rows.length / cols) * tileHeight, channels: 4, background: "#111315"}}).composite(composites).png().toFile(file);
  return file;
}

async function buildTransparentStress(rows) {
  const selected = rows.filter((row) => ["INK_MONO", "HALFTONE_ECHO", "DITHER_1BIT", "PRINT_MISREGISTER"].includes(row.treatment));
  const segmentWidth = 560;
  const rowHeight = 360;
  const backgrounds = [
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${segmentWidth}" height="${rowHeight}"><rect width="100%" height="100%" fill="#f0ece3"/></svg>`),
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${segmentWidth}" height="${rowHeight}"><rect width="100%" height="100%" fill="#151719"/></svg>`),
    busySvg(segmentWidth, rowHeight),
  ];
  const composites = [];
  for (let rowIndex = 0; rowIndex < selected.length; rowIndex += 1) {
    const preview = await makePreview(path.join(root, selected[rowIndex].artifact.path), 500, 310);
    const meta = await sharp(preview).metadata();
    for (let col = 0; col < backgrounds.length; col += 1) {
      const left = col * segmentWidth;
      const top = rowIndex * rowHeight;
      composites.push({input: backgrounds[col], left, top});
      composites.push({input: preview, left: left + Math.round((segmentWidth - Number(meta.width || 1)) / 2), top: top + Math.round((rowHeight - Number(meta.height || 1)) / 2)});
    }
  }
  const file = path.join(outputRoot, "art-treatment-transparent-stress.png");
  await sharp({create: {width: segmentWidth * 3, height: rowHeight * selected.length, channels: 4, background: "#111315"}}).composite(composites).png().toFile(file);
  return file;
}

async function main() {
  ensureDir(assetRoot);
  for (const file of [...Object.values(cleanAssets), styleDnaFile]) if (!fs.existsSync(file)) throw new Error(`asset-art-input-missing:${path.relative(root, file)}`);
  const authorityFiles = {
    workspace: path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"),
    phase: path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"),
  };
  const initialAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  const initialClean = Object.fromEntries(Object.entries(cleanAssets).map(([key, file]) => [key, shaFile(file)]));
  const rows = [];
  rows.push(await writeTreatment({id: "mono-person", genre: "person", cleanAsset: cleanAssets.personColor, planInput: {sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "INK_MONO", outputRole: "PRIMARY"}, render: renderInkMono}));
  rows.push(await writeTreatment({id: "xerox-archive", genre: "archive", cleanAsset: cleanAssets.archive, planInput: {sourceClass: "ARCHIVE_PHOTO", mediaRole: "ARCHIVE_SET", sourceArchetype: "ARCHIVE_PRINT_EDGE", requestedTreatment: "XEROX_GRAIN", outputRole: "SECONDARY"}, render: renderXeroxGrain}));
  rows.push(await writeTreatment({id: "halftone-person", genre: "person", cleanAsset: cleanAssets.person, planInput: {sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "HALFTONE_ECHO", outputRole: "SECONDARY"}, render: renderHalftoneEcho}));
  rows.push(await writeTreatment({id: "dither-object", genre: "object", cleanAsset: cleanAssets.object, planInput: {sourceClass: "PHYSICAL_PROP", mediaRole: "PHYSICAL_PROP", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "DITHER_1BIT", outputRole: "SECONDARY"}, render: renderDither1Bit}));
  rows.push(await writeTreatment({id: "torn-photo", genre: "scene", cleanAsset: cleanAssets.scene, planInput: {sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT", sourceArchetype: "SOURCE_RECT_CLEAN", requestedTreatment: "TORN_PAPER_EDGE", outputRole: "PRIMARY"}, render: renderTornPaperEdge}));
  rows.push(await writeTreatment({id: "misregister-person", genre: "person", cleanAsset: cleanAssets.personColor, planInput: {sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", sourceArchetype: "TIGHT_CUTOUT", requestedTreatment: "PRINT_MISREGISTER", outputRole: "SECONDARY"}, render: renderPrintMisregister}));
  rows.push(await writeTreatment({id: "clean-evidence", genre: "document", cleanAsset: cleanAssets.evidence, planInput: {sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceArchetype: "DOCUMENT_EVIDENCE_PRESERVE", sourceAuthority: "AUTHORITATIVE_EVIDENCE", requestedTreatment: "AUTO", outputRole: "PRIMARY"}, render: async (buffer) => buffer}));
  const finalClean = Object.fromEntries(Object.entries(cleanAssets).map(([key, file]) => [key, shaFile(file)]));
  if (JSON.stringify(initialClean) !== JSON.stringify(finalClean)) throw new Error("asset-art-treatment-mutated-clean-master");
  const comparison = await buildComparisonSheet(rows);
  const grid = await buildTreatmentGrid(rows);
  const stress = await buildTransparentStress(rows);
  const finalAuthority = Object.fromEntries(Object.entries(authorityFiles).map(([key, file]) => [key, shaFile(file)]));
  if (JSON.stringify(initialAuthority) !== JSON.stringify(finalAuthority)) throw new Error("asset-art-treatment-mutated-formal-authority");
  const authorityAudit = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/audit-report.json"), "utf8"));
  const workspaceIdentity = JSON.parse(fs.readFileSync(authorityFiles.workspace, "utf8")).workspaceSha256 || null;
  const currentAuthorityAuditFresh = authorityAudit?.authority?.workspaceSha256 === workspaceIdentity;
  const visibleArtifacts = {};
  for (const [key, file] of Object.entries({comparison, grid, transparentStress: stress})) {
    const metadata = await sharp(file).metadata();
    visibleArtifacts[key] = {path: path.relative(root, file), sha256: shaFile(file), width: Number(metadata.width || 0), height: Number(metadata.height || 0)};
  }
  const renderResult = {
    contract: "A1AssetArtTreatmentRender/v1",
    status: "READY_FOR_ACTUAL_PIXEL_AUDIT",
    styleDna: {id: "editorial-print-intervention-2026-09-17", path: path.relative(root, styleDnaFile), sha256: shaFile(styleDnaFile)},
    fixtures: rows,
    cleanMasterSnapshot: finalClean,
    visibleArtifacts,
    boundary: {reviewOnly: true, productionAdmission: false, storyboardMutationPerformed: false, workbenchBindingPerformed: false, authorityUnchanged: true, authoritySnapshot: finalAuthority, workspaceIdentitySha256: workspaceIdentity, currentAuthorityAuditFresh, projectedWorkspaceSha256: authorityAudit?.authority?.workspaceSha256 || null},
  };
  fs.writeFileSync(path.join(outputRoot, "render-result.json"), `${JSON.stringify(renderResult, null, 2)}\n`);
  console.log(JSON.stringify({status: renderResult.status, treatments: rows.map((row) => ({id: row.id, treatment: row.treatment, role: row.outputRole, dimensions: [row.artifact.width, row.artifact.height], alpha: [row.artifact.alphaMin, row.artifact.alphaMax]})), styleDna: renderResult.styleDna, visibleArtifacts, boundary: renderResult.boundary}, null, 2));
}

await main();
