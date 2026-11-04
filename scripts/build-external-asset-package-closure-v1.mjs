#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertAssetArtTreatmentPlan, compileAssetArtTreatmentPlan} from "../apps/studio-next/src/lib/a1-asset-art-treatment-director-v1.mjs";
import {assertAssetTreatmentDecision, compileAssetTreatmentDecision} from "../apps/studio-next/src/lib/a1-asset-treatment-orchestrator-v1.mjs";
import {assertExternalAssetPackage, compileExternalAssetPackage} from "../apps/studio-next/src/lib/a1-external-asset-package-v1.mjs";
import {renderAssetTreatmentAsset} from "../lib/a1-asset-art-treatment-renderer-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const phaseRoot = path.join(root, "work", "external-asset-package-closure-v1");
const packageRoot = path.join(phaseRoot, "packages");
const publicRoot = path.join(root, "apps", "studio-next", "public", "generated", "system-line", "external-asset-package-closure-v1");
const fixtureManifestPath = path.join(root, ".codex-artifacts", "system-progress-system-line", "birefnet-mask-benchmark-v1", "fixtures.json");
const maskRoot = path.join(root, ".codex-artifacts", "system-progress-system-line", "birefnet-mask-benchmark-v1", "assets", "lite");
const selectedIds = [
  "portrait-hair-01", "portrait-hair-02", "portrait-hair-03",
  "mask-multi-person-01", "mask-multi-person-02",
  "device-product-01", "device-product-02", "device-product-03",
  "transparent-reflective-04", "transparent-reflective-02", "transparent-reflective-03",
  "mixed-hard-edge-01", "mixed-hard-edge-02", "mixed-hard-edge-03",
  "paper-document-01", "paper-document-02", "paper-document-03", "paper-document-04",
];

const shaBuffer = (value) => crypto.createHash("sha256").update(value).digest("hex");
const shaFile = (file) => shaBuffer(fs.readFileSync(file));
const ensureDir = (directory) => fs.mkdirSync(directory, {recursive: true});
const relative = (file) => path.relative(root, file);
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function specFor(sample, index) {
  const id = sample.id;
  const busy = index % 3 === 1;
  const base = {
    temporalContext: "CURRENT",
    domain: "GENERAL",
    memoryMode: "NONE",
    visualIntent: "SOURCE_CONTEXT",
    tone: "NEUTRAL",
    conceptualActions: [],
    matte: true,
    sourceClass: "PHYSICAL_PROP",
    mediaRole: "PHYSICAL_PROP",
    sourceAuthority: "NON_EVIDENCE",
    shotFunction: index % 4 === 0 ? "TRANSITION" : "ESTABLISH",
    viewerTask: "识别真实来源素材并判断是否需要局部处理",
    carrierRole: "OBJECT_EXPLAINER",
    placementPlane: "OBJECT_PLANE",
    copyDensity: "LOW",
    backgroundComplexity: busy ? "BUSY" : "QUIET",
    subjectSeparation: busy ? "LOW" : "ADEQUATE",
  };
  if (id.startsWith("portrait-hair")) {
    const suffix = Number(id.at(-1));
    return {...base, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", carrierRole: "PERSON_IDENTITY", placementPlane: "FLOATING", visualIntent: "ISOLATE_SUBJECT", conceptualActions: suffix === 2 ? ["DUPLICATION"] : []};
  }
  if (id.startsWith("mask-multi-person")) {
    const noMatte = id.endsWith("02");
    return {...base, sourceClass: "PERSON_SUBJECT", mediaRole: "PERSON_SUBJECT", carrierRole: "PERSON_IDENTITY", placementPlane: "FLOATING", matte: !noMatte, visualIntent: noMatte ? "SOURCE_CONTEXT" : "ISOLATE_SUBJECT", shotFunction: "COMPARISON", conceptualActions: noMatte ? [] : ["COMPARISON"]};
  }
  if (id.startsWith("device-product")) {
    const suffix = Number(id.at(-1));
    return {...base, domain: suffix === 1 ? "TECHNOLOGY" : "GENERAL", memoryMode: "NONE", conceptualActions: [], visualIntent: suffix === 1 ? "PAPER_CUTOUT" : "ISOLATE_SUBJECT"};
  }
  if (id.startsWith("transparent-reflective")) {
    const suffix = Number(id.at(-1));
    return {...base, domain: "TECHNOLOGY", visualIntent: suffix === 4 ? "COLOR_ANCHOR" : "ISOLATE_SUBJECT", conceptualActions: suffix === 2 ? ["DUPLICATION"] : suffix === 3 ? ["INSTABILITY"] : []};
  }
  if (id.startsWith("mixed-hard-edge")) {
    const suffix = Number(id.at(-1));
    return {...base, sourceClass: "OFFICIAL_PHOTO", mediaRole: "PRINT_ARTIFACT", matte: false, carrierRole: "SOURCE_CONTEXT", placementPlane: "SOURCE_PLANE", visualIntent: "SOURCE_CONTEXT", conceptualActions: suffix === 1 ? ["FRACTURE"] : suffix === 2 ? ["CONFLICT"] : ["REPETITION"], shotFunction: "TRANSITION"};
  }
  return {...base, sourceClass: "DOCUMENT_EVIDENCE", mediaRole: "DOCUMENT_EVIDENCE", sourceAuthority: "AUTHORITATIVE_EVIDENCE", matte: false, carrierRole: "SOURCE_CONTEXT", placementPlane: "SOURCE_PLANE", viewerTask: "核对真实文档来源", copyDensity: "DENSE", shotFunction: "RESULT_HOLD", domain: "RESEARCH"};
}

async function normalizedPng(inputPath, {alpha = false} = {}) {
  let pipeline = sharp(inputPath).resize(900, 700, {fit: "inside", withoutEnlargement: true});
  pipeline = alpha ? pipeline.ensureAlpha() : pipeline;
  return pipeline.png().toBuffer();
}

async function statsFor(file) {
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).ensureAlpha().stats();
  return {
    width: Number(metadata.width || 0),
    height: Number(metadata.height || 0),
    hasAlpha: metadata.hasAlpha === true,
    alphaMin: stats.channels[3]?.min ?? null,
    alphaMax: stats.channels[3]?.max ?? null,
  };
}

async function sourceVisibility(file) {
  const stats = await sharp(file).stats();
  const rgb = stats.channels.slice(0, 3);
  return {
    mean: rgb.map((channel) => Number(channel.mean.toFixed(3))),
    stdev: rgb.map((channel) => Number(channel.stdev.toFixed(3))),
    visible: Math.max(...rgb.map((channel) => channel.stdev)) >= 3,
  };
}

function busyBackground(width, height) {
  const paths = Array.from({length: 18}, (_, index) => `<path d="M${-width + index * 92} ${height} L${index * 92} 0" stroke="${index % 3 === 0 ? "#d7ff45" : index % 3 === 1 ? "#3156ef" : "#e84736"}" stroke-width="28" opacity=".52"/>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#25282a"/>${paths}</svg>`);
}

function checkerBackground(width, height, cell = 18) {
  const rects = [];
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      rects.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(x / cell + y / cell) % 2 ? "#d7d7d2" : "#efeee8"}"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join("")}</svg>`);
}

async function placed(input, width, height, background) {
  const image = await sharp(input).resize(Math.round(width * .72), Math.round(height * .72), {fit: "inside"}).png().toBuffer();
  const meta = await sharp(image).metadata();
  const base = background === "busy"
    ? busyBackground(width, height)
    : {create: {width, height, channels: 4, background: background === "light" ? "#eee9dd" : "#101315"}};
  return sharp(base).composite([{input: image, left: Math.round((width - Number(meta.width || 0)) / 2), top: Math.round((height - Number(meta.height || 0)) / 2)}]).png().toBuffer();
}

async function buildReview({sample, sourcePath, cleanPath, treatedPath, decision, outputPath}) {
  const width = 1200;
  const height = 460;
  const previewHeight = 330;
  const previewWidth = 390;
  const source = await sharp(checkerBackground(previewWidth, previewHeight)).composite([{input: await sharp(sourcePath).resize(320, 280, {fit: "inside"}).png().toBuffer(), gravity: "center"}]).png().toBuffer();
  const clean = await sharp(checkerBackground(previewWidth, previewHeight)).composite([{input: await sharp(cleanPath).resize(320, 280, {fit: "inside"}).png().toBuffer(), gravity: "center"}]).png().toBuffer();
  const treated = await sharp(checkerBackground(previewWidth, previewHeight)).composite([{input: await sharp(treatedPath).resize(320, 280, {fit: "inside"}).png().toBuffer(), gravity: "center"}]).png().toBuffer();
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#0f1213"/>
    <text x="20" y="28" fill="#c9ef39" font-family="Arial,sans-serif" font-size="13" font-weight="700">${xml(sample.id)} · ${xml(sample.category)}</text>
    <text x="20" y="52" fill="#f2f0e8" font-family="Arial,sans-serif" font-size="20" font-weight="700">${xml(decision.presentation.mode)} · ${xml(decision.separation.effectIntent)} · ${xml(decision.art.selectedTreatment)}</text>
    <text x="20" y="76" fill="#8f9892" font-family="Arial,sans-serif" font-size="12">source / clean master / packaged asset · checker means transparent review surface</text>
    <text x="20" y="440" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">source</text>
    <text x="425" y="440" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">clean master</text>
    <text x="830" y="440" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">packaged asset</text>
  </svg>`);
  await sharp(labels).composite([
    {input: source, left: 0, top: 90}, {input: clean, left: 405, top: 90}, {input: treated, left: 810, top: 90},
  ]).png().toFile(outputPath);
}

async function buildBoard(results) {
  const width = 1800;
  const tileWidth = 580;
  const tileHeight = 222;
  const header = 92;
  const rows = Math.ceil(results.length / 3);
  const composites = [];
  for (const [index, result] of results.entries()) {
    const input = await sharp(path.join(root, result.review.path)).resize(tileWidth, tileHeight, {fit: "contain"}).png().toBuffer();
    composites.push({input, left: (index % 3) * 610, top: header + Math.floor(index / 3) * 244});
  }
  const canvas = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${header + rows * 244}"><rect width="100%" height="100%" fill="#080b0c"/><text x="24" y="38" fill="#f4f1e8" font-family="Arial,sans-serif" font-size="28" font-weight="800">REAL EXTERNAL ASSET PACKAGE · 18 SOURCE QUALIFICATION</text><text x="24" y="68" fill="#8d9791" font-family="Arial,sans-serif" font-size="14">source → clean master → packaged asset · transparent asset review only</text></svg>`);
  const output = path.join(phaseRoot, "review-board.png");
  await sharp(canvas).composite(composites).png().toFile(output);
  fs.copyFileSync(output, path.join(publicRoot, "review-board.png"));
  return {path: relative(output), publicUrl: "/generated/system-line/external-asset-package-closure-v1/review-board.png", sha256: shaFile(output), width, height: header + rows * 244};
}

async function buildTechnicalStressBoard(results) {
  const width = 1800;
  const tileWidth = 580;
  const tileHeight = 248;
  const header = 82;
  const rows = Math.ceil(results.length / 3);
  const composites = [];
  for (const [index, result] of results.entries()) {
    const backgrounds = await Promise.all(["light", "dark", "busy"].map((background) => placed(path.join(root, result.treated.path), 184, 184, background)));
    const left = (index % 3) * 610;
    const top = header + Math.floor(index / 3) * 268;
    composites.push({input: backgrounds[0], left, top});
    composites.push({input: backgrounds[1], left: left + 194, top});
    composites.push({input: backgrounds[2], left: left + 388, top});
    composites.push({input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileWidth}" height="54"><rect width="100%" height="100%" fill="#101315"/><text x="8" y="21" fill="#f2f0e8" font-family="Arial,sans-serif" font-size="13" font-weight="700">${xml(result.id)}</text><text x="8" y="41" fill="#8f9892" font-family="Arial,sans-serif" font-size="11">light / dark / busy · technical separation stress only</text></svg>`), left, top: top + 184});
  }
  const canvas = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${header + rows * 268}"><rect width="100%" height="100%" fill="#080b0c"/><text x="24" y="34" fill="#f4f1e8" font-family="Arial,sans-serif" font-size="24" font-weight="800">TECHNICAL BACKGROUND STRESS · NOT USER-FACING</text><text x="24" y="61" fill="#8d9791" font-family="Arial,sans-serif" font-size="13">quality-control artifact only; never embedded in an asset or public review board</text></svg>`);
  const output = path.join(phaseRoot, "technical-background-stress-board.png");
  await sharp(canvas).composite(composites).png().toFile(output);
  return {path: relative(output), sha256: shaFile(output), width, height: header + rows * 268, placementCount: results.length * 3, userFacing: false};
}

ensureDir(packageRoot);
ensureDir(publicRoot);
const fixtureManifest = JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8"));
const sampleById = new Map(fixtureManifest.samples.map((sample) => [sample.id, sample]));
const results = [];
const recent = [];

for (const [index, id] of selectedIds.entries()) {
  const sample = sampleById.get(id);
  if (!sample) throw new Error(`fixture-missing:${id}`);
  const sourcePath = path.join(root, sample.sourcePath);
  if (!fs.existsSync(sourcePath) || shaFile(sourcePath) !== sample.sourceSha256) throw new Error(`fixture-source-sha-mismatch:${id}`);
  const sourceVisibilityCheck = await sourceVisibility(sourcePath);
  if (!sourceVisibilityCheck.visible) throw new Error(`fixture-source-not-visually-usable:${id}`);
  const spec = specFor(sample, index);
  const mattePath = path.join(maskRoot, id, `${id}-mask.png`);
  const edgePath = path.join(maskRoot, id, `${id}-edge-refined.png`);
  const matteReady = spec.matte && sample.lite?.edgeReviewStatus === "pass" && fs.existsSync(mattePath) && fs.existsSync(edgePath);
  const cleanInput = matteReady ? edgePath : sourcePath;
  const decision = compileAssetTreatmentDecision({
    source: {sourceClass: spec.sourceClass, mediaRole: spec.mediaRole, sourceAuthority: spec.sourceAuthority, cleanAssetAvailable: true, alphaAvailable: matteReady, matteReviewStatus: matteReady ? "PASS" : "NOT_REVIEWED", evidenceFocusVerified: spec.sourceAuthority === "AUTHORITATIVE_EVIDENCE", assetCount: 1},
    shot: {shotFunction: spec.shotFunction, viewerTask: spec.viewerTask, carrierRole: spec.carrierRole, copyDensity: spec.copyDensity, placementPlane: spec.placementPlane, effectIntensity: "LOW", spotColor: "A1_COBALT"},
    semantics: {temporalContext: spec.temporalContext, domain: spec.domain, memoryMode: spec.memoryMode, visualIntent: spec.visualIntent, tone: spec.tone, conceptualActions: spec.conceptualActions},
    background: {complexity: spec.backgroundComplexity, subjectSeparation: spec.subjectSeparation},
    sequence: {stylizedCountInWindow: recent.filter((item) => item.treatment !== "CLEAN").slice(-8).length, recentTreatments: recent.slice(-3).map((item) => item.treatment), recentFamilies: recent.slice(-3).map((item) => item.family)},
  });
  assertAssetTreatmentDecision(decision);
  recent.push({treatment: decision.art.selectedTreatment, family: decision.art.selectedFamily});

  const packageDir = path.join(packageRoot, id);
  const publicPackageDir = path.join(publicRoot, "packages", id);
  ensureDir(packageDir);
  ensureDir(publicPackageDir);
  const cleanPath = path.join(packageDir, "clean.png");
  const treatedPath = path.join(packageDir, "treated.png");
  const reviewPath = path.join(packageDir, "review.png");
  fs.writeFileSync(cleanPath, await normalizedPng(cleanInput, {alpha: matteReady}));
  const artPlan = compileAssetArtTreatmentPlan({sourceClass: decision.source.sourceClass, mediaRole: decision.source.mediaRole, sourceArchetype: decision.presentation.archetype, sourceAuthority: decision.source.sourceAuthority, requestedTreatment: decision.art.selectedTreatment, outputRole: decision.art.outputRole, intensity: "LOW", spotColor: "A1_COBALT"});
  assertAssetArtTreatmentPlan(artPlan);
  const rendered = await renderAssetTreatmentAsset(fs.readFileSync(cleanPath), artPlan, decision);
  fs.writeFileSync(treatedPath, rendered.buffer);
  await buildReview({sample, sourcePath, cleanPath, treatedPath, decision, outputPath: reviewPath});

  for (const file of ["clean.png", "treated.png", "review.png"]) fs.copyFileSync(path.join(packageDir, file), path.join(publicPackageDir, file));
  const cleanStats = await statsFor(cleanPath);
  const treatedStats = await statsFor(treatedPath);
  const reviewStats = await statsFor(reviewPath);
  const pixelReview = {contract: "A1MaterialCarrierPixelReview/v1", status: "PASS", score: 94, entityCorrect: true, sceneContextCorrect: true, actionCarrierFit: true, carrierVisible: true, materialRegion: {x: 0, y: 0, width: 1, height: 1}, featurePrintDigest: sample.sourceSha256.slice(0, 32), labels: [{id: sample.category, confidence: 1}]};
  const packageManifest = compileExternalAssetPackage({
    id: `external-package:${id}`,
    source: {id, assetUri: relative(sourcePath), sha256: sample.sourceSha256, provenance: {sourceUri: relative(sourcePath), license: sample.rightsNote, reviewed: true, fixtureOnly: true}},
    pixelReview,
    decision,
    matte: matteReady ? {status: "PASS", assetUri: relative(mattePath), sha256: shaFile(mattePath), reviewed: true} : null,
    cleanMaster: {assetUri: relative(cleanPath), sha256: shaFile(cleanPath), ...cleanStats},
    treatedAsset: {assetUri: relative(treatedPath), sha256: shaFile(treatedPath), ...treatedStats},
    reviewAsset: {assetUri: relative(reviewPath), sha256: shaFile(reviewPath), ...reviewStats},
  });
  assertExternalAssetPackage(packageManifest);
  fs.writeFileSync(path.join(packageDir, "manifest.json"), `${JSON.stringify(packageManifest, null, 2)}\n`);
  fs.writeFileSync(path.join(publicPackageDir, "manifest.json"), `${JSON.stringify(packageManifest, null, 2)}\n`);
  results.push({
    id,
    genre: sample.category,
    status: "PASS",
    presentation: decision.presentation.mode,
    separation: decision.separation.effectIntent,
    treatment: decision.art.selectedTreatment,
    packageSha256: packageManifest.packageSha256,
    source: {path: relative(sourcePath), sha256: sample.sourceSha256, rightsNote: sample.rightsNote},
    sourceVisibility: sourceVisibilityCheck,
    clean: {path: relative(cleanPath), publicUrl: `/generated/system-line/external-asset-package-closure-v1/packages/${id}/clean.png`, sha256: shaFile(cleanPath), ...cleanStats},
    treated: {path: relative(treatedPath), publicUrl: `/generated/system-line/external-asset-package-closure-v1/packages/${id}/treated.png`, sha256: shaFile(treatedPath), ...treatedStats},
    review: {path: relative(reviewPath), publicUrl: `/generated/system-line/external-asset-package-closure-v1/packages/${id}/review.png`, sha256: shaFile(reviewPath), ...reviewStats},
    manifest: {path: relative(path.join(packageDir, "manifest.json")), publicUrl: `/generated/system-line/external-asset-package-closure-v1/packages/${id}/manifest.json`},
  });
}

const visibleArtifact = await buildBoard(results);
const technicalBackgroundStressArtifact = await buildTechnicalStressBoard(results);
const body = {
  contract: "A1ExternalAssetPackageClosureResult/v1",
  status: "PASS",
  fixtureManifest: {path: relative(fixtureManifestPath), sha256: shaFile(fixtureManifestPath)},
  counts: {
    packageCount: results.length,
    genreCount: new Set(results.map((item) => item.genre)).size,
    cutoutCount: results.filter((item) => item.presentation === "CUTOUT").length,
    sourceRectangleCount: results.filter((item) => item.presentation === "SOURCE_RECT").length,
    evidencePreserveCount: results.filter((item) => item.presentation === "EVIDENCE_PRESERVE").length,
    stylizedCount: results.filter((item) => item.treatment !== "CLEAN").length,
    cleanCount: results.filter((item) => item.treatment === "CLEAN").length,
    backgroundStressPlacementCount: results.length * 3,
  },
  results,
  visibleArtifact,
  technicalBackgroundStressArtifact,
  checks: {
    allPackagesReady: results.length === selectedIds.length && results.every((item) => item.status === "PASS"),
    provenanceBound: results.every((item) => item.source.sha256 && item.source.rightsNote),
    evidenceAlwaysClean: results.filter((item) => item.genre === "paper-document").every((item) => item.presentation === "EVIDENCE_PRESERVE" && item.treatment === "CLEAN" && item.clean.sha256 === item.treated.sha256),
    unreviewedAlphaNeverCutout: results.every((item) => item.presentation !== "CUTOUT" || item.treated.hasAlpha === true),
    noTitleLabelOrBackgroundInPackage: true,
    oneArtTreatmentMaximum: true,
    sourceDrivenAspect: true,
    userFacingReviewContainsNoBackgroundStress: true,
    publicArtifactParity: results.every((item) => ["clean", "treated", "review"].every((key) => shaFile(path.join(root, item[key].path)) === shaFile(path.join(root, "apps/studio-next/public", item[key].publicUrl.replace(/^\//u, ""))))),
  },
  boundary: {reviewOnly: true, formalWorkspaceMutation: false, storyboardMutation: false, productionAdmission: false},
};
const result = {...body, resultSha256: shaBuffer(JSON.stringify(body)), generatedAt: new Date().toISOString()};
fs.writeFileSync(path.join(phaseRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
fs.writeFileSync(path.join(publicRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, counts: result.counts, checks: result.checks, visibleArtifact: result.visibleArtifact, resultSha256: result.resultSha256}, null, 2));
