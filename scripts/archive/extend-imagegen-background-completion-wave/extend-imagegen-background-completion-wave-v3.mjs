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
const priorReviewPath = path.join(phaseRoot, "default-design-asset-library-v1/imagegen-background-completion-wave-v3/review.json");
const libraryRoot = "default-design-asset-library-v1/imagegen-background-final-wave-v4";
const referenceManifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const additions = [
  {candidateId: "background-cool-uniform-polka-dot-imagegen-v4", roleId: "QUIET_UNIVERSAL_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "FULL_FRAME_POLKA_DOT", note: "near-white full-frame small circular dot field with restrained paper pressure"},
  {candidateId: "background-charcoal-uniform-plus-cross-imagegen-v4", roleId: "QUIET_DARK_UNIVERSAL_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "FULL_FRAME_PLUS_CROSS", note: "charcoal full-frame tiny plus-cross field with low contrast and no focal event"},
  {candidateId: "background-cool-uniform-short-dash-imagegen-v4", roleId: "QUIET_UNIVERSAL_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A_MINUS", spatialMode: "FULL_FRAME_SHORT_DASH", note: "cool-white uniformly distributed short dash rows for quiet editorial layering"},
  {candidateId: "background-cobalt-uniform-micro-dot-imagegen-v4", roleId: "QUIET_COBALT_UNIVERSAL_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "FULL_FRAME_COBALT_MICRO_DOT", note: "deep cobalt full-frame micro-dot field with subtle print variation"},
  {candidateId: "background-cool-uniform-square-dot-imagegen-v4", roleId: "QUIET_UNIVERSAL_FIELD", libraryTier: "UNIVERSAL", visualGrade: "A", spatialMode: "FULL_FRAME_SQUARE_DOT", note: "cool light-gray full-frame tiny square-dot grid with extremely low hierarchy"},
];

const sourcePaths = process.argv.slice(2);
if (sourcePaths.length !== additions.length || sourcePaths.some((file) => !path.isAbsolute(file) || !fs.existsSync(file))) throw new Error("imagegen-background-final-wave-five-absolute-source-paths-required");

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`imagegen-background-completion-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  const priorReview = JSON.parse(fs.readFileSync(priorReviewPath, "utf8"));
  if (authority.imagegenBackgroundContinuation?.review?.reviewSha256 !== priorReview.reviewSha256 && authority.imagegenBackgroundContinuation?.review?.candidateCount !== 24) throw new Error("imagegen-background-completion-prior-review-not-current");
  const now = new Date().toISOString();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-imagegen-background-completion-"));
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
    if (!machinePass) throw new Error(`imagegen-background-completion-machine-gate-failed:${definition.candidateId}:${rawOcrText || "no-ocr"}`);
    const relativePath = `${libraryRoot}/${definition.candidateId}.png`;
    binaryFiles[relativePath] = pixels;
    newCandidates.push({...definition, publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`, sha256: sha256(pixels), sourceOriginalSha256: sha256(sourceBytes), width: 1920, height: 1080, mimeType: "image/png", textFree: true, peopleFree: true, machineStatus: "PASS", visualReviewStatus: "READY_FOR_USER_REVIEW", currentDirectionApproved: false, productionAdmitted: false, machine: {dimensions: {status: "PASS", width: 1920, height: 1080, format: "png"}, ocr: {...ocr, readableTextDetected}, human}, visualAssessment: {status: "READY_FOR_USER_REVIEW", actualFullFrameInspected: true, boardScaleInspectionRequired: true, note: definition.note}, generation: {provider: "codex-built-in-imagegen", executionId: path.basename(sourcePaths[index], ".png"), originalPathRetained: true}});
  }
  const candidates = [...priorReview.candidates, ...newCandidates];
  const columns = 4; const thumbWidth = 450; const thumbHeight = 253; const rowHeight = 326; const lefts = [20, 500, 980, 1460];
  const sheetHeight = 64 + Math.ceil(candidates.length / columns) * rowHeight;
  const thumbnails = await Promise.all(candidates.map(async (candidate, index) => {
    const file = path.join(appRoot, "public", candidate.publicUrl.replace(/^\//u, ""));
    const input = fs.existsSync(file) ? fs.readFileSync(file) : binaryFiles[candidate.publicUrl.split("/editorial-asset-workbench-v1/").at(-1)];
    return {input: await sharp(input).resize(thumbWidth, thumbHeight, {fit: "cover"}).png().toBuffer(), left: lefts[index % columns], top: 64 + Math.floor(index / columns) * rowHeight};
  }));
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${sheetHeight}"><rect width="1920" height="${sheetHeight}" fill="#0b1015"/><text x="20" y="38" fill="#dfff68" font-family="monospace" font-size="20">IMAGEGEN BACKGROUND LIBRARY FINAL V4 · ${candidates.length} RETAINED · ACTUAL PIXEL REVIEW REQUIRED</text>${candidates.map((candidate, index) => { const x = lefts[index % columns]; const y = 64 + Math.floor(index / columns) * rowHeight + thumbHeight + 19; return `<text x="${x}" y="${y}" fill="#e9edf0" font-family="monospace" font-size="11">${escapeXml(candidate.candidateId)}</text><text x="${x}" y="${y + 17}" fill="#8fa6b8" font-family="monospace" font-size="10">${escapeXml(candidate.visualGrade)} · ${escapeXml(candidate.roleId)} · PASS · NOT APPROVED</text>`; }).join("")}</svg>`);
  const reviewSheet = await sharp(labels).composite(thumbnails).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`; binaryFiles[reviewSheetPath] = reviewSheet;
  const referenceManifestBytes = fs.readFileSync(referenceManifestPath); const referenceManifest = JSON.parse(referenceManifestBytes.toString("utf8"));
  const review = buildImagegenBackgroundWaveReview({candidates, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: sheetHeight}, sourceReferencePackId: referenceManifest.packId || referenceManifest.id || "pinterest-retro-pixel-v1", sourceReferenceManifestSha256: sha256(referenceManifestBytes), createdAt: now});
  const continuation = buildImagegenBackgroundContinuation({review, userDirective: "继续吧；保留安静可叠加背景，淘汰横线过重候选", createdAt: now});
  const next = structuredClone(current); const nextAuthority = structuredClone(authority); delete nextAuthority.authoritySha256;
  nextAuthority.imagegenBackgroundContinuation = continuation;
  const rejectedCandidates = [...(nextAuthority.imagegenBackgroundRejectedCandidates || []), {sourceOriginalSha256: sha256(fs.readFileSync("/Users/a1/.codex/generated_images/019ffa65-37e4-7be0-b373-3b4f8b9fd425/exec-64e22aa0-4ad4-421a-be2c-d5a3ca895fee.png")), reason: "ring-dot-clusters-became-focal-pattern", productionAdmitted: false}, {sourceOriginalSha256: sha256(fs.readFileSync("/Users/a1/.codex/generated_images/019ffa65-37e4-7be0-b373-3b4f8b9fd425/exec-7840adf0-6bb3-4777-98ff-d3ee4b965352.png")), reason: "vertical-registration-band-broke-uniformity", productionAdmitted: false}];
  nextAuthority.imagegenBackgroundRejectedCandidates = [...new Map(rejectedCandidates.map((item) => [item.sourceOriginalSha256, item])).values()];
  nextAuthority.lanes.backgrounds = {...nextAuthority.lanes.backgrounds, supplementalPendingReviewCandidateCount: review.candidateCount, imagegenUniversalCandidateCount: review.universalCandidateCount, imagegenEmphasisCandidateCount: review.emphasisCandidateCount, imagegenRoleSpecificCandidateCount: review.candidates.filter((candidate) => candidate.libraryTier === "ROLE_SPECIFIC").length};
  nextAuthority.updatedAt = now; nextAuthority.authoritySha256 = sha256(nextAuthority); next.production.articleAssetProductionAuthority = assertArticleAssetProductionAuthority(nextAuthority);
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "extend-imagegen-background-final-wave-v4", targetId: continuation.continuationSha256, payload: {priorCandidateCount: priorReview.candidateCount, generatedCandidateCount: 7, rejectedCandidateCount: 2, retainedCandidateCount: newCandidates.length, totalCandidateCount: review.candidateCount, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass); eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1; eventBound.production.eventLedger.lastEventId = event.eventId; eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `imagegen-background-final-wave-v4-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation}, binaryFiles});
  return {review, continuation, persisted};
});

console.log(JSON.stringify({status: result.review.status, candidateCount: result.review.candidateCount, universalCandidateCount: result.review.universalCandidateCount, emphasisCandidateCount: result.review.emphasisCandidateCount, roleSpecificCandidateCount: result.review.candidates.filter((candidate) => candidate.libraryTier === "ROLE_SPECIFIC").length, rejectedInWave: 2, reviewSheet: result.review.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
