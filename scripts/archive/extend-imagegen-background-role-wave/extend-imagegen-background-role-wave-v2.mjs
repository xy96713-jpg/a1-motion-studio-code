#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {assertArticleAssetProductionAuthority} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {buildImagegenBackgroundContinuation, buildImagegenBackgroundWaveReview} from "../apps/studio-next/src/lib/a1-imagegen-background-library-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const priorReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-background-wave-v1/review.json");
const libraryRoot = "default-design-asset-library-v1/imagegen-background-role-wave-v2";
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const additions = [
  {candidateId: "background-source-evidence-registration-bed-imagegen-v2", roleId: "SOURCE_EVIDENCE_BED", libraryTier: "ROLE_SPECIFIC", visualGrade: "A_MINUS", spatialMode: "ASYMMETRIC_EVIDENCE_LANDING", note: "cool white evidence bed with broad calm center, lower-left halftone trace and a narrow registration rail at the far right"},
  {candidateId: "background-cobalt-verdict-mass-field-imagegen-v2", roleId: "VERDICT_TYPE_FIELD", libraryTier: "ROLE_SPECIFIC", visualGrade: "A_MINUS", spatialMode: "EDGE_CROP_VERDICT_MASS", note: "charcoal verdict field with one oversized cobalt pixel-halftone mass on the left and a quiet right-side type landing"},
  {candidateId: "background-diagonal-process-contour-field-imagegen-v2", roleId: "PROCESS_CONTOUR_FIELD", libraryTier: "ROLE_SPECIFIC", visualGrade: "A_MINUS", spatialMode: "DIAGONAL_PROCESS_PATH", note: "cool white process field with a restrained lower-left to upper-right node-and-step contour"},
  {candidateId: "background-cobalt-phosphor-transition-field-imagegen-v2", roleId: "TRANSITION_SIGNAL_FIELD", libraryTier: "EMPHASIS", visualGrade: "A_MINUS", spatialMode: "DIAGONAL_SIGNAL_BLOOM", note: "near-black transition field with one cobalt phosphor-halftone bloom and large quiet regions"},
];

const sourcePaths = process.argv.slice(2);
if (sourcePaths.length !== additions.length || sourcePaths.some((file) => !path.isAbsolute(file) || !fs.existsSync(file))) throw new Error("imagegen-background-role-wave-four-absolute-source-paths-required");

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`imagegen-background-role-wave-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  const priorReview = JSON.parse(fs.readFileSync(priorReviewPath, "utf8"));
  if (authority.imagegenBackgroundContinuation?.review?.reviewSha256 !== priorReview.reviewSha256) throw new Error("imagegen-background-role-wave-prior-review-not-current");
  const now = new Date().toISOString();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-imagegen-background-role-wave-"));
  const binaryFiles = {};
  const newCandidates = [];
  for (const [index, definition] of additions.entries()) {
    const sourceBytes = fs.readFileSync(sourcePaths[index]);
    const pixels = await sharp(sourceBytes).resize(1920, 1080, {fit: "cover", position: "centre"}).png().toBuffer();
    const temporaryFile = path.join(temporaryRoot, `${definition.candidateId}.png`);
    fs.writeFileSync(temporaryFile, pixels);
    const metadata = await sharp(pixels).metadata();
    const ocr = runVision("run-local-vision-ocr-v1.swift", temporaryFile);
    const human = runVision("run-local-vision-human-presence-v1.swift", temporaryFile);
    const rawOcrText = String(ocr.text || "").trim();
    const readableTextDetected = /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(rawOcrText);
    const machinePass = metadata.width === 1920 && metadata.height === 1080 && metadata.format === "png" && ocr.status === "PASS" && !readableTextDetected && human.status === "PASS" && Number(human.faceCount || 0) === 0 && Number(human.humanRectCount || 0) === 0;
    if (!machinePass) throw new Error(`imagegen-background-role-wave-machine-gate-failed:${definition.candidateId}:${rawOcrText || "no-ocr"}`);
    const relativePath = `${libraryRoot}/${definition.candidateId}.png`;
    binaryFiles[relativePath] = pixels;
    newCandidates.push({...definition, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: sha256(pixels), sourceOriginalSha256: sha256(sourceBytes), width: 1920, height: 1080, mimeType: "image/png", textFree: true, peopleFree: true, machineStatus: "PASS", visualReviewStatus: "READY_FOR_USER_REVIEW", currentDirectionApproved: false, productionAdmitted: false, machine: {dimensions: {status: "PASS", width: 1920, height: 1080, format: "png"}, ocr: {...ocr, readableTextDetected}, human}, visualAssessment: {status: "READY_FOR_USER_REVIEW", actualFullFrameInspected: true, boardScaleInspectionRequired: true, note: definition.note}, generation: {provider: "codex-built-in-imagegen", executionId: path.basename(sourcePaths[index], ".png"), originalPathRetained: true}});
  }
  const candidates = [...priorReview.candidates, ...newCandidates];
  const columns = 3;
  const thumbWidth = 600;
  const thumbHeight = 338;
  const rowHeight = 414;
  const lefts = [24, 660, 1296];
  const sheetHeight = 70 + Math.ceil(candidates.length / columns) * rowHeight;
  const thumbnails = await Promise.all(candidates.map(async (candidate, index) => {
    const file = path.join(appRoot, "public", candidate.publicUrl.replace(/^\//u, ""));
    const input = fs.existsSync(file) ? fs.readFileSync(file) : binaryFiles[candidate.publicUrl.split("/editorial-asset-workbench-v1/").at(-1)];
    return {input: await sharp(input).resize(thumbWidth, thumbHeight, {fit: "cover"}).png().toBuffer(), left: lefts[index % columns], top: 70 + Math.floor(index / columns) * rowHeight};
  }));
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${sheetHeight}"><rect width="1920" height="${sheetHeight}" fill="#0b1015"/><text x="24" y="38" fill="#dfff68" font-family="monospace" font-size="20">IMAGEGEN BACKGROUND LIBRARY V2 · ${candidates.length} CANDIDATES · ROLE BALANCED · USER REVIEW REQUIRED</text>${candidates.map((candidate, index) => { const x = lefts[index % columns]; const y = 70 + Math.floor(index / columns) * rowHeight + thumbHeight + 22; return `<text x="${x}" y="${y}" fill="#e9edf0" font-family="monospace" font-size="13">${escapeXml(candidate.candidateId)}</text><text x="${x}" y="${y + 21}" fill="#8fa6b8" font-family="monospace" font-size="12">${escapeXml(candidate.visualGrade)} · ${escapeXml(candidate.roleId)} · MACHINE PASS · NOT APPROVED</text>`; }).join("")}</svg>`);
  const reviewSheet = await sharp(labels).composite(thumbnails).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const referenceManifestBytes = fs.readFileSync(referenceManifestPath);
  const referenceManifest = JSON.parse(referenceManifestBytes.toString("utf8"));
  const review = buildImagegenBackgroundWaveReview({candidates, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: sheetHeight}, sourceReferencePackId: referenceManifest.packId || referenceManifest.id || "pinterest-retro-pixel-v1", sourceReferenceManifestSha256: sha256(referenceManifestBytes), createdAt: now});
  const continuation = buildImagegenBackgroundContinuation({review, userDirective: "继续吧；按镜头角色补齐", createdAt: now});
  const next = structuredClone(current);
  const nextAuthority = structuredClone(authority);
  delete nextAuthority.authoritySha256;
  nextAuthority.imagegenBackgroundContinuation = continuation;
  nextAuthority.lanes.backgrounds = {...nextAuthority.lanes.backgrounds, supplementalPendingReviewCandidateCount: review.candidateCount, imagegenUniversalCandidateCount: review.universalCandidateCount, imagegenEmphasisCandidateCount: review.emphasisCandidateCount, imagegenRoleSpecificCandidateCount: review.candidates.filter((candidate) => candidate.libraryTier === "ROLE_SPECIFIC").length};
  nextAuthority.updatedAt = now;
  nextAuthority.authoritySha256 = sha256(nextAuthority);
  next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "extend-imagegen-background-role-wave-v2", targetId: continuation.continuationSha256, payload: {priorCandidateCount: priorReview.candidateCount, addedCandidateCount: newCandidates.length, totalCandidateCount: review.candidateCount, roleIds: additions.map((item) => item.roleId), userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `imagegen-background-role-wave-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation}, binaryFiles});
  return {review, continuation, persisted};
});

console.log(JSON.stringify({status: result.review.status, candidateCount: result.review.candidateCount, universalCandidateCount: result.review.universalCandidateCount, emphasisCandidateCount: result.review.emphasisCandidateCount, roleSpecificCandidateCount: result.review.candidates.filter((candidate) => candidate.libraryTier === "ROLE_SPECIFIC").length, reviewSha256: result.review.reviewSha256, continuationSha256: result.continuation.continuationSha256, reviewSheet: result.review.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
