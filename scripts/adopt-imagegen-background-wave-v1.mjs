#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {
  buildEffectPrimitiveVisualDisposition,
  buildImagegenBackgroundContinuation,
  buildImagegenBackgroundWaveReview,
} from "../apps/studio-next/src/lib/a1-imagegen-background-library-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const libraryRoot = "default-design-asset-library-v1/imagegen-background-wave-v1";
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const effectReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/effect-primitives-v1/review.json");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const definitions = [
  {candidateId: "background-cool-minimal-halftone-corner-imagegen-v1", roleId: "QUIET_CHAPTER_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "EDGE_WEIGHTED_QUIET_LANDING", note: "near-white tactile paper; tiny lower-left blue halftone trace; roughly ninety percent quiet"},
  {candidateId: "background-charcoal-minimal-halftone-corner-imagegen-v1", roleId: "OBJECT_STAGE_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "EDGE_WEIGHTED_QUIET_LANDING", note: "charcoal tactile field; restrained lower-right cobalt halftone trace; broad type-safe landing"},
  {candidateId: "background-cool-uniform-micro-dot-imagegen-v1", roleId: "QUIET_CHAPTER_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "FULL_BLEED_UNIFORM_FIELD", note: "full-frame pale micro-dot field; low-contrast print irregularity without a focal subject"},
  {candidateId: "background-charcoal-uniform-micro-cross-imagegen-v1", roleId: "OBJECT_STAGE_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "FULL_BLEED_UNIFORM_FIELD", motifConfusable: true, note: "full-frame charcoal micro-cross field; evenly distributed and quiet enough for titles and objects"},
  {candidateId: "background-charcoal-subtle-crt-material-imagegen-v1", roleId: "TRANSITION_SIGNAL_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A_MINUS", spatialMode: "FULL_BLEED_MATERIAL_FIELD", note: "restrained CRT phosphor density and vignette; material state rather than a glitch event"},
  {candidateId: "background-blue-white-halftone-emphasis-imagegen-v1", roleId: "SOURCE_EVIDENCE_BED", libraryTier: "EMPHASIS", visualGrade: "B", spatialMode: "ASYMMETRIC_EMPHASIS_FIELD", userPreferenceSignal: "USER_SAID_2_IS_OKAY", note: "blue-black halftone mass holds the lower-left; useful right-side landing but too active for a universal base"},
  {candidateId: "background-one-bit-memory-dissolve-imagegen-v1", roleId: "TRANSITION_SIGNAL_FIELD", libraryTier: "EMPHASIS", visualGrade: "B", spatialMode: "ASYMMETRIC_EMPHASIS_FIELD", note: "one-bit erosion mass concentrates at lower-right; suitable for chapter turns and memory or revision beats"},
];

const sourcePaths = process.argv.slice(2);
if (sourcePaths.length !== definitions.length || sourcePaths.some((file) => !path.isAbsolute(file) || !fs.existsSync(file))) throw new Error("imagegen-background-wave-seven-absolute-source-paths-required");

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`imagegen-background-wave-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  if (authority.status !== "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW") throw new Error(`imagegen-background-wave-current-review-required:${authority.status}`);
  const now = new Date().toISOString();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-imagegen-background-wave-"));
  const binaryFiles = {};
  const candidates = [];
  const thumbnails = [];
  const thumbWidth = 600;
  const thumbHeight = 338;
  const lefts = [24, 660, 1296];
  for (const [index, definition] of definitions.entries()) {
    const sourceBytes = fs.readFileSync(sourcePaths[index]);
    const pixels = await sharp(sourceBytes).resize(1920, 1080, {fit: "cover", position: "centre"}).png().toBuffer();
    const temporaryFile = path.join(temporaryRoot, `${definition.candidateId}.png`);
    fs.writeFileSync(temporaryFile, pixels);
    const metadata = await sharp(pixels).metadata();
    const ocr = runVision("run-local-vision-ocr-v1.swift", temporaryFile);
    const human = runVision("run-local-vision-human-presence-v1.swift", temporaryFile);
    const rawOcrText = String(ocr.text || "").trim();
    const motifConfusableOnly = definition.motifConfusable === true && rawOcrText.length > 0 && rawOcrText.replace(/[十+\s]/gu, "") === "";
    const readableTextDetected = !motifConfusableOnly && /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(rawOcrText);
    const machinePass = metadata.width === 1920 && metadata.height === 1080 && metadata.format === "png" && ocr.status === "PASS" && !readableTextDetected && human.status === "PASS" && Number(human.faceCount || 0) === 0 && Number(human.humanRectCount || 0) === 0;
    if (!machinePass) throw new Error(`imagegen-background-wave-machine-gate-failed:${definition.candidateId}:${rawOcrText || "no-ocr"}`);
    const relativePath = `${libraryRoot}/${definition.candidateId}.png`;
    binaryFiles[relativePath] = pixels;
    const candidate = {
      ...definition,
      publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`,
      sha256: sha256(pixels),
      sourceOriginalSha256: sha256(sourceBytes),
      width: metadata.width,
      height: metadata.height,
      mimeType: "image/png",
      textFree: true,
      peopleFree: true,
      machineStatus: "PASS",
      visualReviewStatus: "READY_FOR_USER_REVIEW",
      currentDirectionApproved: false,
      productionAdmitted: false,
      machine: {dimensions: {status: "PASS", width: metadata.width, height: metadata.height, format: metadata.format}, ocr: {...ocr, readableTextDetected, motifConfusableSuppressed: motifConfusableOnly}, human},
      visualAssessment: {status: "READY_FOR_USER_REVIEW", actualFullFrameInspected: true, boardScaleInspectionRequired: true, note: definition.note},
      generation: {provider: "codex-built-in-imagegen", executionId: path.basename(sourcePaths[index], ".png"), originalPathRetained: true},
    };
    candidates.push(candidate);
    const row = Math.floor(index / 3);
    thumbnails.push({input: await sharp(pixels).resize(thumbWidth, thumbHeight, {fit: "cover"}).png().toBuffer(), left: lefts[index % 3], top: 70 + row * 414});
  }
  const sheetHeight = 1310;
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${sheetHeight}"><rect width="1920" height="${sheetHeight}" fill="#0b1015"/><text x="24" y="38" fill="#dfff68" font-family="monospace" font-size="20">IMAGEGEN BACKGROUND LIBRARY · 5 UNIVERSAL + 2 EMPHASIS · USER REVIEW REQUIRED</text>${candidates.map((candidate, index) => { const row = Math.floor(index / 3); const x = lefts[index % 3]; const y = 70 + row * 414 + thumbHeight + 22; return `<text x="${x}" y="${y}" fill="#e9edf0" font-family="monospace" font-size="13">${escapeXml(candidate.candidateId)}</text><text x="${x}" y="${y + 21}" fill="#8fa6b8" font-family="monospace" font-size="12">${candidate.visualGrade} · ${candidate.libraryTier} · MACHINE PASS · NOT APPROVED</text>`; }).join("")}</svg>`);
  const reviewSheet = await sharp(labels).composite(thumbnails).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const manifestBytes = fs.readFileSync(referenceManifestPath);
  const referenceManifest = JSON.parse(manifestBytes.toString("utf8"));
  const review = buildImagegenBackgroundWaveReview({candidates, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: sheetHeight}, sourceReferencePackId: referenceManifest.packId || referenceManifest.id || "pinterest-retro-pixel-v1", sourceReferenceManifestSha256: sha256(manifestBytes), createdAt: now});
  const continuation = buildImagegenBackgroundContinuation({review, userDirective: "继续吧", createdAt: now});
  const effectReview = JSON.parse(fs.readFileSync(effectReviewPath, "utf8"));
  const disposition = buildEffectPrimitiveVisualDisposition({candidateIds: effectReview.candidates.map((candidate) => candidate.candidateId), sourceReviewSha256: effectReview.reviewSha256, userFeedback: "谁让你用破线做这个东西啊；要求改为你自己生成", createdAt: now});
  const next = structuredClone(current);
  const nextAuthority = structuredClone(authority);
  delete nextAuthority.authoritySha256;
  nextAuthority.imagegenBackgroundContinuation = continuation;
  nextAuthority.effectPrimitiveVisualDisposition = disposition;
  nextAuthority.lanes.backgrounds = {...nextAuthority.lanes.backgrounds, supplementalPendingReviewCandidateCount: review.candidateCount, imagegenUniversalCandidateCount: review.universalCandidateCount, imagegenEmphasisCandidateCount: review.emphasisCandidateCount};
  nextAuthority.updatedAt = now;
  nextAuthority.authoritySha256 = sha256(nextAuthority);
  next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "imagegen-background-library-wave-ready-for-user-review", targetId: continuation.continuationSha256, payload: {candidateCount: review.candidateCount, universalCandidateCount: review.universalCandidateCount, emphasisCandidateCount: review.emphasisCandidateCount, effectPrimitiveDisposition: disposition.status, userVisualApproval: "NOT_APPROVED", motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `imagegen-background-wave-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation, ["default-design-asset-library-v1/effect-primitives-v1/visual-disposition.json"]: disposition}, binaryFiles});
  return {review, continuation, disposition, persisted};
});

console.log(JSON.stringify({status: result.review.status, candidateCount: result.review.candidateCount, universalCandidateCount: result.review.universalCandidateCount, emphasisCandidateCount: result.review.emphasisCandidateCount, reviewSha256: result.review.reviewSha256, continuationSha256: result.continuation.continuationSha256, effectPrimitiveDisposition: result.disposition.status, reviewSheet: result.review.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
