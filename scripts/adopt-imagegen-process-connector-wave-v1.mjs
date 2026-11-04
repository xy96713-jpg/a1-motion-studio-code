#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const libraryRoot = "default-design-asset-library-v1/imagegen-process-connector-wave-v1";
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const withSha = (body, key) => ({...body, [key]: sha256(body)});
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const definitions = [
  {candidateId: "article-element-cobalt-process-ribbon-imagegen-v1", conceptualActorId: "article-element-process-ribbon", role: "continuous-process-thread", semanticAction: "connect sequential stages without implying one-way automation"},
  {candidateId: "article-element-charcoal-sorting-loop-imagegen-v1", conceptualActorId: "article-element-sorting-loop", role: "constraint-and-convergence-aperture", semanticAction: "show materials entering and leaving a bounded sorting constraint"},
  {candidateId: "article-element-registration-trail-imagegen-v1", conceptualActorId: "article-element-registration-trail", role: "scattered-to-coherent-trail", semanticAction: "show fragments accumulating into a coherent state without an arrowhead"},
];

const sourcePath = process.argv[2];
if (!sourcePath || !path.isAbsolute(sourcePath) || !fs.existsSync(sourcePath)) throw new Error("imagegen-process-connector-alpha-sheet-absolute-path-required");

async function normalizeActor(sheetBytes, actorIndex) {
  const metadata = await sharp(sheetBytes).metadata();
  if (!metadata.hasAlpha || !metadata.width || !metadata.height) throw new Error("imagegen-process-connector-alpha-required");
  const left = Math.floor(actorIndex * metadata.width / 3);
  const right = Math.floor((actorIndex + 1) * metadata.width / 3);
  const cell = await sharp(sheetBytes).extract({left, top: 0, width: right - left, height: metadata.height}).png().toBuffer();
  const trimmed = await sharp(cell).trim({background: {r: 0, g: 0, b: 0, alpha: 0}, threshold: 4}).png().toBuffer();
  const fitted = await sharp(trimmed).resize(520, 520, {fit: "inside", withoutEnlargement: false}).png().toBuffer();
  const fittedMetadata = await sharp(fitted).metadata();
  return sharp({create: {width: 640, height: 640, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: fitted, left: Math.floor((640 - fittedMetadata.width) / 2), top: Math.floor((640 - fittedMetadata.height) / 2)}]).png({compressionLevel: 9}).toBuffer();
}

async function auditActor(pixels) {
  const metadata = await sharp(pixels).metadata();
  const {data, info} = await sharp(pixels).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let visible = 0; let partial = 0; let residualGreen = 0; let minX = info.width; let minY = info.height; let maxX = -1; let maxY = -1;
  const corners = [data[3], data[(info.width - 1) * 4 + 3], data[((info.height - 1) * info.width) * 4 + 3], data[(info.width * info.height - 1) * 4 + 3]];
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]; const g = data[index + 1]; const b = data[index + 2]; const a = data[index + 3];
    if (a > 8) { visible += 1; const pixel = index / 4; const x = pixel % info.width; const y = Math.floor(pixel / info.width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); if (g > 90 && g > r * 1.45 && g > b * 1.45) residualGreen += 1; }
    if (a > 8 && a < 247) partial += 1;
  }
  const pixelCount = info.width * info.height; const visibleRatio = visible / pixelCount; const safetyInset = Math.min(minX, minY, info.width - 1 - maxX, info.height - 1 - maxY); const residualGreenRatio = visible ? residualGreen / visible : 1;
  const pass = metadata.format === "png" && metadata.width === 640 && metadata.height === 640 && metadata.hasAlpha === true && visibleRatio >= 0.008 && visibleRatio <= 0.72 && corners.every((alpha) => alpha <= 8) && safetyInset >= 40 && residualGreenRatio <= 0.005;
  return {status: pass ? "PASS" : "FAIL", width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha === true, visibleRatio: Number(visibleRatio.toFixed(6)), transparentRatio: Number((1 - visibleRatio).toFixed(6)), partialAlphaRatio: Number((partial / pixelCount).toFixed(6)), residualGreenRatio: Number(residualGreenRatio.toFixed(6)), cornerAlpha: corners, visibleBounds: {minX, minY, maxX, maxY}, safetyInset};
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  const now = new Date().toISOString(); const sourceBytes = fs.readFileSync(sourcePath); const binaryFiles = {}; const actors = []; const composites = [];
  for (const [index, definition] of definitions.entries()) {
    const pixels = await normalizeActor(sourceBytes, index); const machine = await auditActor(pixels);
    if (machine.status !== "PASS") throw new Error(`imagegen-process-connector-machine-gate-failed:${definition.candidateId}:${JSON.stringify(machine)}`);
    const relativePath = `${libraryRoot}/${definition.candidateId}.png`; binaryFiles[relativePath] = pixels;
    actors.push({...definition, kitId: "process-connector-kit", publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: sha256(pixels), sourceSheetSha256: sha256(sourceBytes), sourceCellIndex: index, width: 640, height: 640, mimeType: "image/png", transparent: true, textFree: true, machineStatus: "PASS", visualReviewStatus: "READY_FOR_USER_REVIEW", currentDirectionApproved: false, productionAdmitted: false, machine, generation: {provider: "codex-built-in-imagegen", executionId: path.basename(sourcePath, ".png"), localPostprocess: "border-chroma-key; horizontal-cell-extract; alpha-trim; 60px-safe-canvas"}});
    const checker = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="350"><rect width="310" height="350" fill="#eef0ef"/><rect x="310" width="310" height="350" fill="#15191d"/></svg>`);
    const preview = await sharp(pixels).resize(480, 300, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}}).png().toBuffer();
    composites.push({input: await sharp(checker).composite([{input: preview, left: 70, top: 25}]).png().toBuffer(), left: 15 + index * 635, top: 64});
  }
  const labels = definitions.map((definition, index) => `<text x="${15 + index * 635}" y="438" fill="#e8edf0" font-family="monospace" font-size="13">${escapeXml(definition.candidateId)}</text><text x="${15 + index * 635}" y="459" fill="#91a7b6" font-family="monospace" font-size="11">ALPHA PASS · SEMANTIC CONNECTOR · NOT APPROVED</text>`).join("");
  const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="485"><rect width="1920" height="485" fill="#0b1015"/><text x="15" y="38" fill="#dfff68" font-family="monospace" font-size="20">IMAGEGEN PROCESS CONNECTOR KIT · NO ARROWHEADS · USER REVIEW REQUIRED</text>${labels}</svg>`);
  const reviewSheet = await sharp(labelSvg).composite(composites).png().toBuffer(); const reviewSheetPath = `${libraryRoot}/review-sheet.png`; binaryFiles[reviewSheetPath] = reviewSheet;
  const referenceManifestBytes = fs.readFileSync(referenceManifestPath); const referenceManifest = JSON.parse(referenceManifestBytes.toString("utf8"));
  const kit = {kitId: "process-connector-kit", semanticJobs: ["process", "sequence", "constraint", "convergence"], actorCount: actors.length, actors};
  const review = withSha({contract: "A1ImagegenProcessConnectorReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", sourceReferencePackId: referenceManifest.packId || referenceManifest.id || "pinterest-retro-pixel-v1", sourceReferenceManifestSha256: sha256(referenceManifestBytes), kitCount: 1, actorCount: actors.length, kits: [kit], reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: 485}, usagePolicy: {semanticActionRequired: true, oneConnectorPerFrameByDefault: true, arrowheadsForbidden: true, decorationOnlyUseForbidden: true}, machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, frozenBoundaries: {motion: true, resolve: true, finalRender: true, wholeFilmExpansion: true}, createdAt: now}, "reviewSha256");
  const continuation = withSha({contract: "A1ImagegenProcessConnectorContinuation/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", authorizationSource: "CURRENT_THREAD_CONTINUE_DIRECTIVE", generationMode: "CODEX_BUILT_IN_IMAGEGEN_WITH_LOCAL_ALPHA_EXTRACTION", review, productionAdmitted: false, createdAt: now}, "continuationSha256");
  const next = structuredClone(current); const nextAuthority = structuredClone(authority); delete nextAuthority.authoritySha256;
  nextAuthority.imagegenProcessConnectorContinuation = continuation;
  nextAuthority.lanes.elements = {...nextAuthority.lanes.elements, status: "IMAGEGEN_ELEMENT_AND_CONNECTOR_WAVES_READY_FOR_USER_REVIEW", candidateKitCount: Number(nextAuthority.imagegenElementKitContinuation?.review?.kitCount || 0) + 1, pendingReviewActorCount: Number(nextAuthority.imagegenElementKitContinuation?.review?.actorCount || 0) + actors.length, approvedActorCount: 0, laneComplete: false};
  nextAuthority.updatedAt = now; nextAuthority.authoritySha256 = sha256(nextAuthority); next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "imagegen-process-connector-wave-ready-for-user-review", targetId: continuation.continuationSha256, payload: {kitCount: 1, actorCount: actors.length, replacedGenericArrowCandidate: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass); eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1; eventBound.production.eventLedger.lastEventId = event.eventId; eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `imagegen-process-connector-wave-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation}, binaryFiles});
  return {review, persisted};
});

console.log(JSON.stringify({status: result.review.status, kitCount: result.review.kitCount, actorCount: result.review.actorCount, reviewSheet: result.review.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, null, 2));
