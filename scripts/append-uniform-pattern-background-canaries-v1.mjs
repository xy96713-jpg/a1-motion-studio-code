#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  advanceBackgroundLibraryWaveToUserReview,
  assertDefaultLibraryBackgroundWaveReview,
} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const libraryRoot = "default-design-asset-library-v1";
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const recipes = [
  {
    candidateId: "background-cool-uniform-dot-grid-v1",
    roleId: "QUIET_CHAPTER_FIELD",
    motifId: "ordinary-dot-field",
    patternRecipe: {contract: "A1UniformPatternBackgroundRecipe/v1", spatialMode: "FULL_BLEED_UNIFORM_GRID", canvas: {width: 1920, height: 1080}, base: "#f2f5f4", tile: {width: 44, height: 44}, mark: {kind: "dot", radius: 2.35, color: "#2558c7", opacity: 0.24}},
  },
  {
    candidateId: "background-cobalt-uniform-cross-grid-v1",
    roleId: "OBJECT_STAGE_FIELD",
    motifId: "small-cross-field",
    patternRecipe: {contract: "A1UniformPatternBackgroundRecipe/v1", spatialMode: "FULL_BLEED_UNIFORM_GRID", canvas: {width: 1920, height: 1080}, base: "#111925", tile: {width: 56, height: 56}, mark: {kind: "cross", armLength: 5.5, strokeWidth: 1.35, color: "#83a5dc", opacity: 0.3}},
  },
];

function renderSvg(recipe) {
  const {canvas, base, tile, mark} = recipe;
  const markSvg = mark.kind === "dot"
    ? `<circle cx="${tile.width / 2}" cy="${tile.height / 2}" r="${mark.radius}" fill="${mark.color}" fill-opacity="${mark.opacity}"/>`
    : `<path d="M ${tile.width / 2 - mark.armLength} ${tile.height / 2} H ${tile.width / 2 + mark.armLength} M ${tile.width / 2} ${tile.height / 2 - mark.armLength} V ${tile.height / 2 + mark.armLength}" fill="none" stroke="${mark.color}" stroke-opacity="${mark.opacity}" stroke-width="${mark.strokeWidth}" stroke-linecap="square"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><defs><pattern id="p" width="${tile.width}" height="${tile.height}" patternUnits="userSpaceOnUse">${markSvg}</pattern><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="19"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .025 0"/></filter></defs><rect width="100%" height="100%" fill="${base}"/><rect width="100%" height="100%" fill="url(#p)"/><rect width="100%" height="100%" filter="url(#grain)" opacity="0.45"/></svg>`);
}

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`uniform-pattern-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = current.production.articleAssetProductionAuthority;
  if (authority?.status !== "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW") throw new Error(`uniform-pattern-current-review-state-required:${authority?.status || "missing"}`);
  const priorReview = assertDefaultLibraryBackgroundWaveReview(authority.nextBackgroundVarietyBatchReview, {batchPlanSha256: authority.nextBackgroundVarietyBatchPlan.batchPlanSha256});
  if (priorReview.candidateCount !== 4) throw new Error(`uniform-pattern-prior-four-candidate-review-required:${priorReview.candidateCount}`);
  const now = new Date().toISOString();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-uniform-pattern-canaries-"));
  const binaryFiles = {};
  const newCandidates = [];
  const recipeFiles = {};
  for (const recipe of recipes) {
    const pixels = await sharp(renderSvg(recipe.patternRecipe)).png().toBuffer();
    const tempFile = path.join(tempRoot, `${recipe.candidateId}.png`);
    fs.writeFileSync(tempFile, pixels);
    const metadata = await sharp(pixels).metadata();
    const ocr = runVision("run-local-vision-ocr-v1.swift", tempFile);
    const human = runVision("run-local-vision-human-presence-v1.swift", tempFile);
    const rawOcrText = String(ocr.text || "").trim();
    const crossMotifConfusableOnly = recipe.motifId === "small-cross-field" && rawOcrText.length > 0 && rawOcrText.replace(/[十\s]/gu, "") === "";
    const readableTextDetected = !crossMotifConfusableOnly && /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(rawOcrText);
    if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.format !== "png" || ocr.status !== "PASS" || readableTextDetected || human.status !== "PASS" || Number(human.faceCount || 0) !== 0 || Number(human.humanRectCount || 0) !== 0) throw new Error(`uniform-pattern-machine-gate-failed:${recipe.candidateId}:${rawOcrText || "no-ocr"}`);
    const relativePath = `${libraryRoot}/backgrounds/${recipe.candidateId}.png`;
    binaryFiles[relativePath] = pixels;
    recipeFiles[`${libraryRoot}/backgrounds/${recipe.candidateId}.recipe.json`] = recipe.patternRecipe;
    newCandidates.push({
      candidateId: recipe.candidateId,
      roleId: recipe.roleId,
      sourceKind: "DETERMINISTIC_PINTEREST_RESEARCH_DIRECTIVE",
      motifId: recipe.motifId,
      spatialMode: "FULL_BLEED_UNIFORM_GRID",
      publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`,
      sha256: sha256(pixels),
      width: metadata.width,
      height: metadata.height,
      mimeType: "image/png",
      requestSha256: null,
      textFree: true,
      peopleFree: true,
      machineStatus: "PASS",
      visualReviewStatus: "READY_FOR_USER_REVIEW",
      currentDirectionApproved: false,
      machine: {dimensions: {status: "PASS", width: metadata.width, height: metadata.height, format: metadata.format}, ocr: {...ocr, readableTextDetected, motifConfusableSuppressed: crossMotifConfusableOnly, motifConfusableReason: crossMotifConfusableOnly ? "uniform-small-cross-grid-read-as-Chinese-ten" : null}, human},
      visualAssessment: {status: "READY_FOR_USER_REVIEW", actualFullFrameInspected: true, boardScaleInspectionRequired: true, note: "full-bleed uniform repeat reaches every edge; usability comes from low mark contrast rather than a blank center"},
      generation: {provider: "deterministic-svg-pattern-renderer", actualImageGenerationPerformed: false, recipe: recipe.patternRecipe},
    });
  }

  const candidates = [...priorReview.candidates, ...newCandidates];
  const thumbWidth = 600;
  const thumbHeight = 338;
  const lefts = [24, 660, 1296];
  const composites = [];
  for (const [index, candidate] of candidates.entries()) {
    const file = path.join(appRoot, "public", candidate.publicUrl.replace(/^\//u, ""));
    const pixels = binaryFiles[`${libraryRoot}/backgrounds/${candidate.candidateId}.png`] || fs.readFileSync(file);
    composites.push({input: await sharp(pixels).resize(thumbWidth, thumbHeight, {fit: "cover"}).png().toBuffer(), left: lefts[index % 3], top: index < 3 ? 68 : 480});
  }
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="896"><rect width="1920" height="896" fill="#0b1015"/><text x="24" y="36" fill="#dfff68" font-family="monospace" font-size="20">DEFAULT BACKGROUND LIBRARY · 6 CANARIES · EDGE-WEIGHTED + FULL-BLEED UNIFORM</text>${candidates.map((candidate, index) => `<text x="${lefts[index % 3]}" y="${index < 3 ? 430 : 842}" fill="#e9edf0" font-family="monospace" font-size="13">${escapeXml(candidate.candidateId)}</text><text x="${lefts[index % 3]}" y="${index < 3 ? 452 : 864}" fill="#8fa6b8" font-family="monospace" font-size="12">${escapeXml(candidate.spatialMode || "EDGE_WEIGHTED_QUIET_LANDING")} · NOT APPROVED</text>`).join("")}</svg>`);
  const reviewSheet = await sharp(labels).composite(composites).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/backgrounds/review-sheet-v2.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const reviewBody = {
    ...priorReview,
    supersedesReviewSha256: priorReview.reviewSha256,
    sourceLibraryPlanSha256: authority.nextBackgroundVarietyBatchReview.sourceLibraryPlanSha256,
    candidateCount: candidates.length,
    readyForReviewCount: candidates.length,
    reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: 896},
    candidates,
    designPolicy: {quietFoundationsAreFirstClass: true, supportedSpatialModes: ["EDGE_WEIGHTED_QUIET_LANDING", "FULL_BLEED_UNIFORM_GRID"], fullBleedUniformMaximumMarkContrast: 0.2, userDirectedMotifs: ["ordinary-dot-field", "small-cross-field"]},
    createdAt: now,
  };
  delete reviewBody.reviewSha256;
  const review = assertDefaultLibraryBackgroundWaveReview({...reviewBody, reviewSha256: sha256(reviewBody)}, {batchPlanSha256: authority.nextBackgroundVarietyBatchPlan.batchPlanSha256});
  const nextAuthority = advanceBackgroundLibraryWaveToUserReview(authority, {waveReview: review, now});
  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = nextAuthority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "append-full-bleed-uniform-pattern-background-canaries", targetId: review.reviewSha256, payload: {previousCandidateCount: priorReview.candidateCount, candidateCount: review.candidateCount, appendedCandidateIds: newCandidates.map((item) => item.candidateId), spatialMode: "FULL_BLEED_UNIFORM_GRID", userVisualApproval: "NOT_APPROVED"}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `uniform-pattern-canaries-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {...recipeFiles, [`${libraryRoot}/backgrounds/review-v2.json`]: review}, binaryFiles});
  return {review, persisted, newCandidates};
});

console.log(JSON.stringify({status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", candidateCount: result.review.candidateCount, appended: result.newCandidates.map(({candidateId, sha256, publicUrl, spatialMode, machineStatus}) => ({candidateId, sha256, publicUrl, spatialMode, machineStatus})), reviewSha256: result.review.reviewSha256, reviewSheet: result.review.reviewSheet.publicUrl, workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED"}, null, 2));
