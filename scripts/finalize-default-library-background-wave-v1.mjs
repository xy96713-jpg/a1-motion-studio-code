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
import {assertDefaultDesignAssetLibraryPlan} from "../apps/studio-next/src/lib/a1-default-design-asset-library-v1.mjs";
import {assertBackgroundVarietyBatchPlan} from "../apps/studio-next/src/lib/a1-video-composition-background-supply-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicPhaseRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1");
const laneRoot = path.join(publicPhaseRoot, "article-asset-background-lane-v1");
const libraryRoot = "default-design-asset-library-v1";
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const definitions = [
  {candidateId: "background-cool-newsprint-evidence-bed-v1", roleId: "SOURCE_EVIDENCE_BED", sourceKind: "PLANNED_VARIETY_BATCH", promptSummary: "cool near-white newsprint evidence bed with local asymmetric dither and a broad unframed landing"},
  {candidateId: "background-cobalt-crop-typography-field-v1", roleId: "VERDICT_TYPE_FIELD", sourceKind: "PLANNED_VARIETY_BATCH", promptSummary: "deep cobalt and charcoal field with one oversized cropped dot-signal mass and a quiet type landing"},
  {candidateId: "background-cool-ordinary-dot-field-v1", roleId: "QUIET_CHAPTER_FIELD", sourceKind: "SUPPLEMENTAL_USER_DIRECTIVE", motifId: "ordinary-dot-field", promptSummary: "cool near-white paper with sparse ordinary cobalt and graphite dots at the edges and at least 70 percent quiet field"},
  {candidateId: "background-charcoal-small-cross-field-v1", roleId: "OBJECT_STAGE_FIELD", sourceKind: "SUPPLEMENTAL_USER_DIRECTIVE", motifId: "small-cross-field", promptSummary: "deep charcoal-cobalt paper with sparse tiny cool crosses at outer edges and a broad quiet object-and-title landing"},
];

const sourcePaths = process.argv.slice(2);
if (sourcePaths.length !== definitions.length || sourcePaths.some((file) => !path.isAbsolute(file) || !fs.existsSync(file))) throw new Error("default-library-background-wave-four-absolute-source-paths-required");

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`default-library-background-wave-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = current.production.articleAssetProductionAuthority;
  if (authority?.status !== "BACKGROUND_LIBRARY_EXPANSION_ACTIVE") throw new Error(`default-library-background-wave-state-invalid:${authority?.status || "missing"}`);
  const batchPlan = assertBackgroundVarietyBatchPlan(readJson(path.join(laneRoot, "next-variety-batch-plan.json")));
  const libraryPlan = assertDefaultDesignAssetLibraryPlan(readJson(path.join(publicPhaseRoot, libraryRoot, "plan.json")));
  if (libraryPlan.currentWave.sourceBatchPlanSha256 !== batchPlan.batchPlanSha256) throw new Error("default-library-background-wave-plan-binding-invalid");

  const now = new Date().toISOString();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-default-library-background-wave-"));
  const binaryFiles = {};
  const candidates = [];
  const thumbs = [];
  for (const [index, definition] of definitions.entries()) {
    const sourceBytes = fs.readFileSync(sourcePaths[index]);
    const pixels = await sharp(sourceBytes).resize(1920, 1080, {fit: "cover", position: "centre"}).png().toBuffer();
    const temporaryFile = path.join(temporaryRoot, `${definition.candidateId}.png`);
    fs.writeFileSync(temporaryFile, pixels);
    const metadata = await sharp(pixels).metadata();
    const ocr = runVision("run-local-vision-ocr-v1.swift", temporaryFile);
    const human = runVision("run-local-vision-human-presence-v1.swift", temporaryFile);
    const rawOcrText = String(ocr.text || "").trim();
    const crossMotifConfusableOnly = definition.motifId === "small-cross-field" && rawOcrText.length > 0 && rawOcrText.replace(/[十\s]/gu, "") === "";
    const readableTextDetected = !crossMotifConfusableOnly && /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(rawOcrText);
    const machinePass = metadata.width === 1920 && metadata.height === 1080 && metadata.format === "png" && ocr.status === "PASS" && !readableTextDetected && human.status === "PASS" && Number(human.faceCount || 0) === 0 && Number(human.humanRectCount || 0) === 0;
    if (!machinePass) throw new Error(`default-library-background-wave-machine-gate-failed:${definition.candidateId}:${ocr.text || "no-ocr"}`);
    const relativePath = `${libraryRoot}/backgrounds/${definition.candidateId}.png`;
    const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`;
    binaryFiles[relativePath] = pixels;
    const request = batchPlan.requests.find((item) => item.candidateId === definition.candidateId);
    const visualNotes = [
      "cool newsprint field; asymmetric edge mass and broad evidence landing remain visibly distinct from the two approved anchors",
      "cobalt field; oversized cropped signal mass stays on one side and preserves a quiet counterfield",
      "simple ordinary-dot foundation; broad cool-white landing remains primary and dots stay edge-weighted",
      "simple small-cross foundation; dark center stays calm and crosses remain sparse edge rhythm",
    ][index];
    candidates.push({
      ...definition,
      publicUrl,
      sha256: sha256(pixels),
      sourceOriginalSha256: sha256(sourceBytes),
      width: metadata.width,
      height: metadata.height,
      mimeType: "image/png",
      requestSha256: request?.requestSha256 || null,
      textFree: true,
      peopleFree: true,
      machineStatus: "PASS",
      visualReviewStatus: "READY_FOR_USER_REVIEW",
      currentDirectionApproved: false,
      machine: {dimensions: {status: "PASS", width: metadata.width, height: metadata.height, format: metadata.format}, ocr: {...ocr, readableTextDetected, motifConfusableSuppressed: crossMotifConfusableOnly, motifConfusableReason: crossMotifConfusableOnly ? "isolated-small-cross-marks-read-as-Chinese-ten" : null}, human},
      visualAssessment: {status: "READY_FOR_USER_REVIEW", actualFullFrameInspected: true, boardScaleInspectionRequired: true, note: visualNotes},
      generation: {provider: "codex-built-in-imagegen", originalPathRetained: true, executionId: path.basename(sourcePaths[index], ".png"), promptSummary: definition.promptSummary},
    });
    thumbs.push({input: await sharp(pixels).resize(900, 506, {fit: "cover"}).png().toBuffer(), left: index % 2 === 0 ? 30 : 990, top: index < 2 ? 72 : 648});
  }

  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1224"><rect width="1920" height="1224" fill="#0b1015"/><text x="30" y="38" fill="#dfff68" font-family="monospace" font-size="20">DEFAULT BACKGROUND LIBRARY · 4 CANARIES · USER ACTUAL-PIXEL REVIEW REQUIRED</text>${candidates.map((candidate, index) => `<text x="${index % 2 === 0 ? 30 : 990}" y="${index < 2 ? 610 : 1186}" fill="#e9edf0" font-family="monospace" font-size="15">${escapeXml(candidate.candidateId)}</text><text x="${index % 2 === 0 ? 30 : 990}" y="${index < 2 ? 632 : 1208}" fill="#8fa6b8" font-family="monospace" font-size="13">${escapeXml(candidate.roleId)} · MACHINE PASS · NOT APPROVED</text>`).join("")}</svg>`);
  const reviewSheet = await sharp(labels).composite(thumbs).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/backgrounds/review-sheet-v1.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const reviewBody = {
    contract: "A1DefaultLibraryBackgroundWaveReview/v1",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    sourceBatchPlanSha256: batchPlan.batchPlanSha256,
    sourceLibraryPlanSha256: libraryPlan.planSha256,
    candidateCount: candidates.length,
    readyForReviewCount: candidates.length,
    machinePassCannotApprove: true,
    userVisualApproval: "NOT_APPROVED",
    reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: 1224},
    candidates,
    designPolicy: {quietFoundationsAreFirstClass: true, userDirectedMotifs: ["ordinary-dot-field", "small-cross-field"], minimumQuietFieldRatioForSimpleMotifs: 0.7},
    frozenBoundaries: {motion: true, resolve: true, finalRender: true, wholeFilmExpansion: true},
    createdAt: now,
  };
  const review = assertDefaultLibraryBackgroundWaveReview({...reviewBody, reviewSha256: sha256(reviewBody)}, {batchPlanSha256: batchPlan.batchPlanSha256});
  const nextAuthority = advanceBackgroundLibraryWaveToUserReview(authority, {waveReview: review, now});
  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = nextAuthority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "default-library-background-wave-ready-for-user-review", targetId: review.reviewSha256, payload: {candidateCount: candidates.length, reviewSha256: review.reviewSha256, machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", motionAllowed: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `default-library-background-wave-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {[`${libraryRoot}/backgrounds/review.json`]: review},
    binaryFiles,
  });
  return {review, authority: nextAuthority, persisted};
});

console.log(JSON.stringify({status: result.authority.status, nextAction: result.authority.authorization.nextAction, requiresUser: result.authority.authorization.requiresUser, reviewSha256: result.review.reviewSha256, reviewSheet: result.review.reviewSheet.publicUrl, candidates: result.review.candidates.map(({candidateId, roleId, sha256, publicUrl, machineStatus, visualReviewStatus}) => ({candidateId, roleId, sha256, publicUrl, machineStatus, visualReviewStatus})), workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
