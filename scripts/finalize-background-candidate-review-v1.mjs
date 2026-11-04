#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {
  advanceArticleAssetProductionAuthority,
  assertBackgroundCandidateExecutionPolicy,
  assertBackgroundLaneRequestPack,
} from "../apps/studio-next/src/lib/a1-article-asset-production-authority-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const laneRoot = path.join(appRoot, "public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1");
const inputPath = process.argv[2];
if (!inputPath || !path.isAbsolute(inputPath) || !fs.existsSync(inputPath)) throw new Error("background-candidate-review-input-required");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentAuthority = current.production.articleAssetProductionAuthority;
  if (currentAuthority?.status !== "BACKGROUND_CANDIDATE_GENERATING") throw new Error(`background-candidate-finalize-state-invalid:${currentAuthority?.status || "missing"}`);
  const styleDna = readJson(path.join(laneRoot, "style-dna.json"));
  const styleBriefs = readJson(path.join(laneRoot, "style-briefs.json"));
  const requestPack = assertBackgroundLaneRequestPack(readJson(path.join(laneRoot, "request-pack.json")), {appRoot, styleDna, styleBriefs: styleBriefs.briefs});
  const executionPolicy = assertBackgroundCandidateExecutionPolicy(readJson(path.join(laneRoot, "execution-policy.json")), {requestPackSha256: requestPack.requestPackSha256});
  const input = readJson(inputPath);
  if (input.requestPackSha256 !== requestPack.requestPackSha256 || !Array.isArray(input.candidates) || input.candidates.length !== 2) throw new Error("background-candidate-review-input-contract-invalid");
  const expectedIds = requestPack.requests.map((request) => request.candidateId);
  if (JSON.stringify(input.candidates.map((candidate) => candidate.candidateId)) !== JSON.stringify(expectedIds)) throw new Error("background-candidate-review-order-or-id-invalid");

  const now = new Date().toISOString();
  const binaryFiles = {};
  const candidates = [];
  const proofComposites = [];
  for (const [index, item] of input.candidates.entries()) {
    if (!path.isAbsolute(item.sourcePath) || !fs.existsSync(item.sourcePath)) throw new Error(`background-candidate-source-missing:${item.candidateId}`);
    const bytes = fs.readFileSync(item.sourcePath);
    const metadata = await sharp(bytes).metadata();
    const outputSha256 = sha256(bytes);
    const ocrText = String(item.machine?.ocr?.text || "").trim();
    const readableTextDetected = /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(ocrText);
    const humanCount = Number(item.machine?.human?.humanCount || 0);
    const faceCount = Number(item.machine?.human?.faceCount || 0);
    const machinePass = metadata.width === 1920 && metadata.height === 1080 && metadata.format === "png" && !readableTextDetected && humanCount === 0 && faceCount === 0;
    if (!machinePass) throw new Error(`background-candidate-machine-gate-failed:${item.candidateId}`);
    if (!["READY_FOR_USER_REVIEW", "VISUAL_REJECTED"].includes(item.visualAssessment?.status)) throw new Error(`background-candidate-visual-assessment-invalid:${item.candidateId}`);
    if (Number(item.repairRound || 0) > executionPolicy.executionScope.maximumRepairRoundsPerCandidate) throw new Error(`background-candidate-repair-budget-exceeded:${item.candidateId}`);
    const relativePath = `article-asset-background-lane-v1/candidates/${item.candidateId}.png`;
    binaryFiles[relativePath] = bytes;
    const publicUrl = `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`;
    candidates.push({
      candidateId: item.candidateId,
      assetId: item.candidateId,
      role: item.candidateId.includes("charcoal") ? "charcoal-contour-quiet-field" : "cool-halftone-quiet-field",
      publicUrl,
      sha256: outputSha256,
      width: metadata.width,
      height: metadata.height,
      mimeType: "image/png",
      textFree: true,
      peopleFree: true,
      currentDirectionApproved: false,
      machineStatus: "PASS",
      visualReviewStatus: item.visualAssessment.status,
      requestSha256: requestPack.requests[index].requestSha256,
      styleBriefSha256: requestPack.requests[index].styleBriefSha256,
      generation: {
        provider: "codex-built-in-imagegen",
        executionId: item.executionId || null,
        generatedAt: item.generatedAt || null,
        attemptCount: Number(item.attemptCount || 1),
        repairRound: Number(item.repairRound || 0),
      },
      machine: {
        dimensions: {status: "PASS", width: metadata.width, height: metadata.height, format: metadata.format},
        ocr: {...item.machine.ocr, readableTextDetected},
        human: {...item.machine.human, humanCount, faceCount},
      },
      visualAssessment: item.visualAssessment,
    });
    const thumb = await sharp(bytes).resize(760, 428, {fit: "cover"}).png().toBuffer();
    proofComposites.push({input: thumb, left: 20 + index * 780, top: 52});
  }

  const readyCount = candidates.filter((candidate) => candidate.visualReviewStatus === "READY_FOR_USER_REVIEW").length;
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1580" height="500"><rect width="1580" height="500" fill="#0c1012"/><text x="20" y="30" fill="#dfff68" font-family="monospace" font-size="18">BACKGROUND CANARY 2/3 · MACHINE PASS · USER VISUAL APPROVAL PENDING</text>${candidates.map((candidate, index) => `<text x="${20 + index * 780}" y="495" fill="#d9dedd" font-family="monospace" font-size="14">${escapeXml(candidate.candidateId)} · ${escapeXml(candidate.visualReviewStatus)}</text>`).join("")}</svg>`);
  const reviewSheet = await sharp(labels).composite(proofComposites).png().toBuffer();
  const reviewSheetPath = "article-asset-background-lane-v1/background-canary-review-sheet-v1.png";
  binaryFiles[reviewSheetPath] = reviewSheet;

  const reviewBody = {
    contract: "A1BackgroundCandidateActualPixelReview/v1",
    status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW",
    requestPackSha256: requestPack.requestPackSha256,
    executionPolicySha256: executionPolicy.executionPolicySha256,
    candidateCount: 2,
    readyForReviewCount: readyCount,
    initialCanaryBatchOnly: true,
    laneNeedCount: 3,
    laneComplete: false,
    machinePassCannotApprove: true,
    userVisualApproval: "NOT_APPROVED",
    reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1580, height: 500},
    candidates,
    frozenBoundaries: {motion: true, resolve: true, finalRender: true, wholeFilmExpansion: true},
    createdAt: now,
  };
  const review = {...reviewBody, reviewSha256: sha256(reviewBody)};
  const authority = advanceArticleAssetProductionAuthority(currentAuthority, {status: "BACKGROUND_PIXELS_READY_FOR_USER_REVIEW", executionPolicy, candidateReview: review, now});
  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = authority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({
    workspace: current,
    action: "background-candidate-actual-pixels-ready",
    targetId: review.reviewSha256,
    payload: {candidateCount: 2, readyForReviewCount: readyCount, reviewSha256: review.reviewSha256, userVisualApproval: "NOT_APPROVED", laneComplete: false},
    now,
  });
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const receiptBody = {contract: "A1BackgroundCandidateExecutionReceipt/v1", status: "COMPLETE_PENDING_USER_VISUAL_REVIEW", requestPackSha256: requestPack.requestPackSha256, executionPolicySha256: executionPolicy.executionPolicySha256, reviewSha256: review.reviewSha256, outputSha256s: candidates.map((candidate) => candidate.sha256), repairRounds: candidates.map((candidate) => candidate.generation.repairRound), completedAt: now};
  const receipt = {...receiptBody, receiptSha256: sha256(receiptBody)};
  const persisted = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `background-candidate-finalize-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "article-asset-background-lane-v1/actual-pixel-review.json": review,
      "article-asset-background-lane-v1/execution-receipt.json": receipt,
    },
    binaryFiles,
  });
  return {authority, review, persisted};
});

console.log(JSON.stringify({
  status: result.authority.status,
  nextAction: result.authority.authorization.nextAction,
  requiresUser: result.authority.authorization.requiresUser,
  reviewSha256: result.review.reviewSha256,
  reviewSheet: result.review.reviewSheet.publicUrl,
  candidates: result.review.candidates.map((candidate) => ({candidateId: candidate.candidateId, sha256: candidate.sha256, machineStatus: candidate.machineStatus, visualReviewStatus: candidate.visualReviewStatus, publicUrl: candidate.publicUrl})),
  workspaceSha256: result.persisted.workspaceSha256,
  laneComplete: false,
  userVisualApproval: "NOT_APPROVED",
}, null, 2));
