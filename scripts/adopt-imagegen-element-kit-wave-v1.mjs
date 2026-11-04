#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {buildImagegenElementKitContinuation, buildImagegenElementKitWaveReview} from "../apps/studio-next/src/lib/a1-imagegen-element-kit-library-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const libraryRoot = "default-design-asset-library-v1/imagegen-element-kit-wave-v1";
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const definitions = [
  {kitId: "source-proof-kit", sheetIndex: 0, semanticJobs: ["source", "evidence", "proof"], actors: [
    {candidateId: "article-element-charcoal-frame-imagegen-v1", conceptualActorId: "article-element-charcoal-frame", role: "evidence-frame"},
    {candidateId: "article-element-cobalt-crop-target-imagegen-v1", conceptualActorId: "article-element-cobalt-crop-marks", role: "crop-target", visualCaveat: "generated actor includes a central target crosshair; review as crop-target rather than pure crop marks"},
    {candidateId: "article-element-cobalt-arrow-imagegen-v1", conceptualActorId: "article-element-cobalt-arrow", role: "directional-proof-arrow"},
  ]},
  {kitId: "revision-kit", sheetIndex: 1, semanticJobs: ["correction", "rewrite", "contrast"], actors: [
    {candidateId: "article-element-pencil-circle-imagegen-v1", conceptualActorId: "article-element-pencil-circle", role: "correction-circle"},
    {candidateId: "article-element-crossed-strokes-imagegen-v1", conceptualActorId: "article-element-crossed-strokes", role: "rejection-cross", cellInset: {right: 0.13}},
    {candidateId: "article-element-torn-note-strip-imagegen-v1", conceptualActorId: "article-element-torn-note-strip", role: "revision-note-anchor"},
  ]},
  {kitId: "physical-editorial-kit", sheetIndex: 2, semanticJobs: ["material", "process", "authorship"], actors: [
    {candidateId: "article-element-torn-paper-strip-imagegen-v1", conceptualActorId: "article-element-torn-paper-strip", role: "paper-bridge"},
    {candidateId: "article-element-torn-paper-corner-imagegen-v1", conceptualActorId: "article-element-torn-paper-corner", role: "paper-corner-anchor"},
    {candidateId: "article-element-binder-clip-imagegen-v1", conceptualActorId: "article-element-binder-clip", role: "physical-attachment", cellInset: {left: 0.12}, keepLargestComponent: true},
  ]},
  {kitId: "signal-transition-kit", sheetIndex: 3, semanticJobs: ["chapter-change", "attention-reset", "transition"], actors: [
    {candidateId: "article-element-halftone-tear-imagegen-v1", conceptualActorId: "article-element-halftone-tear", role: "signal-interruption"},
    {candidateId: "article-element-charcoal-swatch-imagegen-v1", conceptualActorId: "article-element-charcoal-swatch", role: "contrast-swatch"},
    {candidateId: "article-element-folded-paper-imagegen-v1", conceptualActorId: "article-element-folded-paper", role: "chapter-fold"},
  ]},
];

const sourcePaths = process.argv.slice(2);
if (sourcePaths.length !== 4 || sourcePaths.some((file) => !path.isAbsolute(file) || !fs.existsSync(file))) throw new Error("imagegen-element-kit-four-absolute-alpha-sheet-paths-required");

async function keepLargestAlphaComponent(pixels) {
  const {data, info} = await sharp(pixels).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const pixelCount = info.width * info.height;
  const visited = new Uint8Array(pixelCount);
  let largest = [];
  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (visited[seed] || data[seed * 4 + 3] <= 8) continue;
    const queue = [seed];
    const component = [];
    visited[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; component.push(index);
      const x = index % info.width; const y = Math.floor(index / info.width);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const neighbor = ny * info.width + nx;
        if (!visited[neighbor] && data[neighbor * 4 + 3] > 8) { visited[neighbor] = 1; queue.push(neighbor); }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const keep = new Uint8Array(pixelCount);
  for (const index of largest) keep[index] = 1;
  for (let index = 0; index < pixelCount; index += 1) if (!keep[index]) data[index * 4 + 3] = 0;
  return sharp(data, {raw: {width: info.width, height: info.height, channels: 4}}).png().toBuffer();
}

async function normalizeActor(sheetBytes, actorIndex, cellInset = {}, keepLargestComponent = false) {
  const sheetMetadata = await sharp(sheetBytes).metadata();
  if (!sheetMetadata.hasAlpha || !sheetMetadata.width || !sheetMetadata.height) throw new Error("imagegen-element-kit-source-alpha-required");
  const left = Math.floor(actorIndex * sheetMetadata.width / 3);
  const right = Math.floor((actorIndex + 1) * sheetMetadata.width / 3);
  // Keep extract and trim in separate Sharp pipelines. libvips may otherwise
  // reorder the geometry operations and apply the source-sheet crop after the
  // cell has already been trimmed, which makes later cells appear out of range.
  const cellWidth = right - left;
  const insetLeft = Math.floor(cellWidth * Number(cellInset.left || 0));
  const insetRight = Math.floor(cellWidth * Number(cellInset.right || 0));
  let cell = await sharp(sheetBytes).extract({left: left + insetLeft, top: 0, width: cellWidth - insetLeft - insetRight, height: sheetMetadata.height}).png().toBuffer();
  if (keepLargestComponent) cell = await keepLargestAlphaComponent(cell);
  const extracted = await sharp(cell).trim({background: {r: 0, g: 0, b: 0, alpha: 0}, threshold: 4}).png().toBuffer();
  const fitted = await sharp(extracted).resize(520, 520, {fit: "inside", withoutEnlargement: false}).png().toBuffer();
  const fittedMetadata = await sharp(fitted).metadata();
  const leftPad = Math.floor((640 - fittedMetadata.width) / 2);
  const topPad = Math.floor((640 - fittedMetadata.height) / 2);
  return sharp({create: {width: 640, height: 640, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: fitted, left: leftPad, top: topPad}]).png({compressionLevel: 9}).toBuffer();
}

async function auditActor(pixels) {
  const metadata = await sharp(pixels).metadata();
  const {data, info} = await sharp(pixels).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let visible = 0;
  let partial = 0;
  let residualGreen = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  const cornerAlpha = [data[3], data[(info.width - 1) * 4 + 3], data[((info.height - 1) * info.width) * 4 + 3], data[(info.width * info.height - 1) * 4 + 3]];
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]; const g = data[index + 1]; const b = data[index + 2]; const a = data[index + 3];
    if (a > 8) {
      visible += 1;
      const pixel = index / 4; const x = pixel % info.width; const y = Math.floor(pixel / info.width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (g > 90 && g > r * 1.45 && g > b * 1.45) residualGreen += 1;
    }
    if (a > 8 && a < 247) partial += 1;
  }
  const pixelCount = info.width * info.height;
  const visibleRatio = visible / pixelCount;
  const residualGreenRatio = visible ? residualGreen / visible : 1;
  const safetyInset = Math.min(minX, minY, info.width - 1 - maxX, info.height - 1 - maxY);
  const pass = metadata.format === "png" && metadata.width === 640 && metadata.height === 640 && metadata.hasAlpha === true && visibleRatio >= 0.01 && visibleRatio <= 0.7 && cornerAlpha.every((alpha) => alpha <= 8) && safetyInset >= 40 && residualGreenRatio <= 0.005;
  return {status: pass ? "PASS" : "FAIL", width: metadata.width, height: metadata.height, format: metadata.format, hasAlpha: metadata.hasAlpha === true, visibleRatio: Number(visibleRatio.toFixed(6)), transparentRatio: Number((1 - visibleRatio).toFixed(6)), partialAlphaRatio: Number((partial / pixelCount).toFixed(6)), residualGreenRatio: Number(residualGreenRatio.toFixed(6)), cornerAlpha, visibleBounds: {minX, minY, maxX, maxY}, safetyInset};
}

function tileBackgroundSvg({width, height}) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width / 2}" height="${height}" fill="#edf0ef"/><rect x="${width / 2}" width="${width / 2}" height="${height}" fill="#15191d"/><path d="M${width / 2} 0V${height}" stroke="#5f6c74" stroke-width="1"/></svg>`);
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  if (authority.status !== "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW") throw new Error(`imagegen-element-kit-current-background-review-required:${authority.status}`);
  const now = new Date().toISOString();
  const binaryFiles = {};
  const kits = [];
  const reviewComposites = [];
  const tileWidth = 620;
  const tileHeight = 300;
  const imageHeight = 246;
  const gutter = 15;
  const lefts = [15, 650, 1285];
  for (const definition of definitions) {
    const sourceBytes = fs.readFileSync(sourcePaths[definition.sheetIndex]);
    const actors = [];
    for (const [actorIndex, actorDefinition] of definition.actors.entries()) {
      const pixels = await normalizeActor(sourceBytes, actorIndex, actorDefinition.cellInset, actorDefinition.keepLargestComponent === true);
      const machine = await auditActor(pixels);
      if (machine.status !== "PASS") throw new Error(`imagegen-element-kit-machine-gate-failed:${actorDefinition.candidateId}:${JSON.stringify(machine)}`);
      const relativePath = `${libraryRoot}/${actorDefinition.candidateId}.png`;
      binaryFiles[relativePath] = pixels;
      const actor = {
        ...actorDefinition,
        kitId: definition.kitId,
        publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`,
        sha256: sha256(pixels),
        sourceSheetSha256: sha256(sourceBytes),
        sourceCellIndex: actorIndex,
        width: 640,
        height: 640,
        mimeType: "image/png",
        transparent: true,
        textFree: true,
        machineStatus: "PASS",
        visualReviewStatus: "READY_FOR_USER_REVIEW",
        currentDirectionApproved: false,
        productionAdmitted: false,
        machine,
        generation: {provider: "codex-built-in-imagegen", executionId: path.basename(sourcePaths[definition.sheetIndex], ".png"), localPostprocess: "chroma-key-if-needed; horizontal-cell-extract; alpha-trim; 60px-safe-canvas"},
      };
      actors.push(actor);
      const row = definition.sheetIndex;
      const left = lefts[actorIndex];
      const top = 70 + row * (tileHeight + gutter);
      const background = await sharp(tileBackgroundSvg({width: tileWidth, height: imageHeight})).png().toBuffer();
      const actorPreview = await sharp(pixels).resize(430, 220, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
      const preview = await sharp(background).composite([{input: actorPreview, left: 95, top: 13}]).png().toBuffer();
      reviewComposites.push({input: preview, left, top});
    }
    kits.push({kitId: definition.kitId, semanticJobs: definition.semanticJobs, actorCount: actors.length, actors});
  }
  const sheetWidth = 1920;
  const sheetHeight = 1350;
  const labels = definitions.flatMap((definition, row) => definition.actors.map((actor, column) => {
    const x = lefts[column]; const y = 70 + row * (tileHeight + gutter) + imageHeight + 20;
    return `<text x="${x}" y="${y}" fill="#e8edf0" font-family="monospace" font-size="12">${escapeXml(actor.candidateId)}</text><text x="${x}" y="${y + 18}" fill="#92a7b5" font-family="monospace" font-size="11">${escapeXml(definition.kitId)} · ALPHA PASS · NOT APPROVED</text>`;
  })).join("");
  const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}"><rect width="${sheetWidth}" height="${sheetHeight}" fill="#0b1015"/><text x="15" y="38" fill="#dfff68" font-family="monospace" font-size="20">IMAGEGEN SEMANTIC ELEMENT KITS · 4 KITS / 12 ACTORS · USER REVIEW REQUIRED</text>${labels}</svg>`);
  const reviewSheet = await sharp(labelSvg).composite(reviewComposites).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const referenceManifestBytes = fs.readFileSync(referenceManifestPath);
  const referenceManifest = JSON.parse(referenceManifestBytes.toString("utf8"));
  const review = buildImagegenElementKitWaveReview({kits, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: sheetWidth, height: sheetHeight}, sourceReferencePackId: referenceManifest.packId || referenceManifest.id || "pinterest-retro-pixel-v1", sourceReferenceManifestSha256: sha256(referenceManifestBytes), createdAt: now});
  const continuation = buildImagegenElementKitContinuation({review, userDirective: "继续吧", createdAt: now});
  const next = structuredClone(current);
  const nextAuthority = structuredClone(authority);
  delete nextAuthority.authoritySha256;
  nextAuthority.imagegenElementKitContinuation = continuation;
  nextAuthority.lanes.elements = {...nextAuthority.lanes.elements, status: "IMAGEGEN_ELEMENT_KIT_WAVE_READY_FOR_USER_REVIEW", candidateKitCount: review.kitCount, pendingReviewActorCount: review.actorCount, approvedActorCount: 0, laneComplete: false};
  nextAuthority.updatedAt = now;
  nextAuthority.authoritySha256 = sha256(nextAuthority);
  next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "imagegen-element-kit-wave-ready-for-user-review", targetId: continuation.continuationSha256, payload: {kitCount: review.kitCount, actorCount: review.actorCount, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `imagegen-element-kit-wave-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation}, binaryFiles});
  return {review, continuation, persisted};
});

console.log(JSON.stringify({status: result.review.status, kitCount: result.review.kitCount, actorCount: result.review.actorCount, reviewSha256: result.review.reviewSha256, continuationSha256: result.continuation.continuationSha256, reviewSheet: result.review.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
