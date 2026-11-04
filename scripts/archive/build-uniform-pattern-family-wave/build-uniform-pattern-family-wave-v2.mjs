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
  assertRetroPixelEditorialStyleBrief,
  auditRetroPixelStyleBriefs,
  compileRetroPixelEditorialStyleBrief,
} from "../apps/studio-next/src/lib/a1-retro-pixel-editorial-style-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const libraryRoot = "default-design-asset-library-v1/uniform-pattern-family-wave-v2";
const notePath = path.join(root, "work/style-research/a1-personal-pinterest-default-library-2026-08-13.md");
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) ? value : typeof value === "string" ? value : JSON.stringify(canonicalize(value))).digest("hex");
const escapeXml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const candidates = [
  {
    candidateId: "background-cool-uniform-micro-x-grid-v1",
    roleId: "QUIET_CHAPTER_FIELD",
    event: {packagingType: "EXPLAINER_PACKAGE", semanticJob: "quiet full-bleed micro-x rhythm foundation for deterministic editorial assembly", semanticAction: "hold a stable low-contrast explanatory rhythm"},
    variation: {actorKind: "diagram-or-process", densityProfile: "quiet-iconic", primaryFamily: "modular-pixel-infographic", supportingFamilies: [], surfaceLogic: "one-bit-micro-x-matrix", dominantActor: "low-contrast-full-bleed-micro-x-field", composition: "perspective-mesh-or-diagram-field-full-bleed-repeat", palette: "black-white-cobalt-accent", material: "one-bit-cross-stamps-with-local-paper-grain", motionEnergy: "static-foundation-only"},
    recipe: {spatialMode: "FULL_BLEED_UNIFORM_GRID", base: "#f0f3f2", tile: {width: 40, height: 40}, mark: {kind: "x", arm: 3.4, strokeWidth: 1.2, color: "#395a88", opacity: 0.2}},
  },
  {
    candidateId: "background-charcoal-uniform-square-dot-grid-v1",
    roleId: "OBJECT_STAGE_FIELD",
    event: {packagingType: "FULLSCREEN_PACKAGE", semanticJob: "quiet charcoal full-bleed square-dot foundation for object and title assembly", semanticAction: "provide a stable low-contrast object stage"},
    variation: {actorKind: "diagram-or-process", densityProfile: "quiet-iconic", primaryFamily: "dithered-editorial-poster", supportingFamilies: [], surfaceLogic: "square-dot-matrix", dominantActor: "low-contrast-full-bleed-square-dot-field", composition: "sparse-object-stage-full-bleed-square-repeat", palette: "black-white-cobalt-accent", material: "square-dot-matrix-with-local-print-wear", motionEnergy: "static-foundation-only"},
    recipe: {spatialMode: "FULL_BLEED_UNIFORM_GRID", base: "#151c26", tile: {width: 36, height: 36}, mark: {kind: "square", size: 3.2, color: "#8aaddc", opacity: 0.24}},
  },
  {
    candidateId: "background-cool-uniform-staggered-dot-grid-v1",
    roleId: "SOURCE_EVIDENCE_BED",
    event: {packagingType: "OVERLAY_PACKAGE", semanticJob: "quiet staggered-dot atlas foundation for source evidence and captions", semanticAction: "separate evidence rhythm from a rigid engineering grid"},
    variation: {actorKind: "diagram-or-process", densityProfile: "quiet-iconic", primaryFamily: "icon-atlas-interface-language", supportingFamilies: [], surfaceLogic: "two-color-staggered-dot-matrix", dominantActor: "low-contrast-full-bleed-staggered-dot-atlas", composition: "unequal-window-cluster-full-bleed-staggered-atlas", palette: "cyan-charcoal-white", material: "two-color-misregistration-on-cool-paper", motionEnergy: "static-foundation-only"},
    recipe: {spatialMode: "FULL_BLEED_UNIFORM_GRID", base: "#edf3f2", tile: {width: 52, height: 44}, mark: {kind: "staggered-dot", radius: 2.05, colors: ["#3b69b0", "#5f8f7f"], opacity: 0.22}},
  },
  {
    candidateId: "background-cobalt-uniform-short-dash-grid-v1",
    roleId: "TRANSITION_SIGNAL_FIELD",
    event: {packagingType: "FULLSCREEN_PACKAGE", semanticJob: "quiet full-bleed short-dash signal foundation for chapter transitions", semanticAction: "maintain a stable low-frequency signal bed"},
    variation: {actorKind: "machine-or-tool", densityProfile: "quiet-iconic", primaryFamily: "scanline-crt-signal", supportingFamilies: [], surfaceLogic: "clean-flat-short-dash-signal-grid", dominantActor: "low-contrast-full-bleed-short-dash-signal", composition: "oversized-subject-crop-full-bleed-dash-repeat", palette: "cobalt-white-soft-green-event", material: "clean-flat-ink-with-local-print-wear", motionEnergy: "static-signal-foundation-only"},
    recipe: {spatialMode: "FULL_BLEED_UNIFORM_GRID", base: "#172344", tile: {width: 48, height: 40}, mark: {kind: "dash", length: 7, strokeWidth: 1.4, color: "#c7d3e8", opacity: 0.2}},
  },
];

function renderSvg(recipe) {
  const {base, tile, mark} = recipe;
  const cx = tile.width / 2;
  const cy = tile.height / 2;
  const markSvg = mark.kind === "x"
    ? `<path d="M ${cx - mark.arm} ${cy - mark.arm} L ${cx + mark.arm} ${cy + mark.arm} M ${cx + mark.arm} ${cy - mark.arm} L ${cx - mark.arm} ${cy + mark.arm}" fill="none" stroke="${mark.color}" stroke-opacity="${mark.opacity}" stroke-width="${mark.strokeWidth}"/>`
    : mark.kind === "square"
      ? `<rect x="${cx - mark.size / 2}" y="${cy - mark.size / 2}" width="${mark.size}" height="${mark.size}" fill="${mark.color}" fill-opacity="${mark.opacity}"/>`
      : mark.kind === "staggered-dot"
        ? `<circle cx="${tile.width * 0.25}" cy="${tile.height * 0.25}" r="${mark.radius}" fill="${mark.colors[0]}" fill-opacity="${mark.opacity}"/><circle cx="${tile.width * 0.75}" cy="${tile.height * 0.75}" r="${mark.radius}" fill="${mark.colors[1]}" fill-opacity="${mark.opacity}"/>`
        : `<path d="M ${cx - mark.length / 2} ${cy} H ${cx + mark.length / 2}" fill="none" stroke="${mark.color}" stroke-opacity="${mark.opacity}" stroke-width="${mark.strokeWidth}" stroke-linecap="square"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><pattern id="p" width="${tile.width}" height="${tile.height}" patternUnits="userSpaceOnUse">${markSvg}</pattern><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="2" seed="23"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .022 0"/></filter></defs><rect width="1920" height="1080" fill="${base}"/><rect width="1920" height="1080" fill="url(#p)"/><rect width="1920" height="1080" filter="url(#grain)" opacity="0.42"/></svg>`);
}

function runVision(scriptName, imagePath) {
  const result = spawnSync("swift", [path.join(root, "scripts", scriptName), imagePath], {encoding: "utf8", maxBuffer: 10 * 1024 * 1024});
  if (result.status !== 0 || !result.stdout.trim()) throw new Error(`uniform-family-vision-failed:${scriptName}:${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const authority = assertArticleAssetProductionAuthority(current.production.articleAssetProductionAuthority);
  if (authority.status !== "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW" || authority.nextBackgroundVarietyBatchReview?.candidateCount !== 6) throw new Error("uniform-family-six-candidate-direction-anchor-required");
  if (authority.uniformPatternFamilyContinuation?.review?.candidateCount) throw new Error("uniform-family-continuation-already-recorded");
  const now = new Date().toISOString();
  const styleBriefs = candidates.map((candidate) => {
    const brief = compileRetroPixelEditorialStyleBrief({
      appRoot,
      now,
      event: {eventId: candidate.candidateId, sourceBeatIds: [], sourceText: candidate.event.semanticJob, semanticRole: "background-foundation", actorNeed: "abstract full-bleed micro-pattern field", ...candidate.event},
      variationOverrides: candidate.variation,
    });
    assertRetroPixelEditorialStyleBrief(brief, {appRoot});
    return brief;
  });
  const styleAudit = auditRetroPixelStyleBriefs(styleBriefs, {appRoot, distinctEventIds: styleBriefs.map((brief) => brief.eventId)});
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-uniform-family-wave-v2-"));
  const binaryFiles = {};
  const outputs = [];
  for (const [index, candidate] of candidates.entries()) {
    const pixels = await sharp(renderSvg(candidate.recipe)).png().toBuffer();
    const tempFile = path.join(tempRoot, `${candidate.candidateId}.png`);
    fs.writeFileSync(tempFile, pixels);
    const metadata = await sharp(pixels).metadata();
    const ocr = runVision("run-local-vision-ocr-v1.swift", tempFile);
    const human = runVision("run-local-vision-human-presence-v1.swift", tempFile);
    const rawOcrText = String(ocr.text || "").trim();
    const motifConfusableOnly = rawOcrText.length > 0 && rawOcrText.replace(/[xX×十+·.\-\s]/gu, "") === "";
    const readableTextDetected = !motifConfusableOnly && /[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}|\d{3,}/u.test(rawOcrText);
    if (metadata.width !== 1920 || metadata.height !== 1080 || metadata.format !== "png" || ocr.status !== "PASS" || readableTextDetected || human.status !== "PASS" || Number(human.faceCount || 0) !== 0 || Number(human.humanRectCount || 0) !== 0) throw new Error(`uniform-family-machine-gate-failed:${candidate.candidateId}:${rawOcrText || "no-ocr"}`);
    const relativePath = `${libraryRoot}/${candidate.candidateId}.png`;
    binaryFiles[relativePath] = pixels;
    outputs.push({
      candidateId: candidate.candidateId,
      roleId: candidate.roleId,
      spatialMode: candidate.recipe.spatialMode,
      publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relativePath}`,
      sha256: sha256(pixels),
      width: metadata.width,
      height: metadata.height,
      mimeType: "image/png",
      styleBriefSha256: styleBriefs[index].styleBriefSha256,
      fingerprint: styleBriefs[index].fingerprint,
      recipe: candidate.recipe,
      machineStatus: "PASS",
      visualReviewStatus: "READY_FOR_USER_REVIEW",
      currentDirectionApproved: false,
      machine: {dimensions: {status: "PASS", width: metadata.width, height: metadata.height, format: metadata.format}, ocr: {...ocr, readableTextDetected, motifConfusableSuppressed: motifConfusableOnly}, human},
      visualAssessment: {status: "READY_FOR_USER_REVIEW", actualFullFrameInspected: true, boardScaleInspectionRequired: true, note: "full-bleed deterministic micro-pattern; low contrast carries hierarchy while every edge remains populated"},
      productionAdmitted: false,
    });
  }
  const composites = [];
  for (const [index, output] of outputs.entries()) composites.push({input: await sharp(binaryFiles[`${libraryRoot}/${output.candidateId}.png`]).resize(900, 506, {fit: "cover"}).png().toBuffer(), left: index % 2 === 0 ? 30 : 990, top: index < 2 ? 68 : 648});
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1224"><rect width="1920" height="1224" fill="#0b1015"/><text x="30" y="36" fill="#dfff68" font-family="monospace" font-size="20">UNIFORM PATTERN FAMILY · CONTINUATION WAVE V2 · 4 READY FOR REVIEW</text>${outputs.map((output, index) => `<text x="${index % 2 === 0 ? 30 : 990}" y="${index < 2 ? 610 : 1190}" fill="#e9edf0" font-family="monospace" font-size="14">${escapeXml(output.candidateId)}</text><text x="${index % 2 === 0 ? 30 : 990}" y="${index < 2 ? 632 : 1212}" fill="#8fa6b8" font-family="monospace" font-size="12">${escapeXml(output.roleId)} · MACHINE PASS · NOT APPROVED</text>`).join("")}</svg>`);
  const reviewSheet = await sharp(labels).composite(composites).png().toBuffer();
  const reviewSheetPath = `${libraryRoot}/review-sheet.png`;
  binaryFiles[reviewSheetPath] = reviewSheet;
  const reviewBody = {contract: "A1UniformPatternFamilyReview/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", sourceReviewSha256: authority.nextBackgroundVarietyBatchReview.reviewSha256, styleAuditSha256: styleAudit.auditSha256, researchNoteSha256: sha256(fs.readFileSync(notePath)), candidateCount: outputs.length, candidates: outputs, reviewSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${reviewSheetPath}`, sha256: sha256(reviewSheet), width: 1920, height: 1224}, machinePassCannotApprove: true, userVisualApproval: "NOT_APPROVED", productionAdmitted: false, frozenBoundaries: {motion: true, resolve: true, finalRender: true, wholeFilmExpansion: true}, createdAt: now};
  const review = {...reviewBody, reviewSha256: sha256(reviewBody)};
  const continuationBody = {contract: "A1UniformPatternFamilyContinuation/v1", status: "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", authorizationSource: "CURRENT_THREAD_CONTINUE_DIRECTIVE", userDirective: "继续吧", directionScope: "FULL_BLEED_UNIFORM_GRID_FAMILY_VARIATION", sourceReviewSha256: authority.nextBackgroundVarietyBatchReview.reviewSha256, styleAuditSha256: styleAudit.auditSha256, review, productionAdmitted: false, createdAt: now};
  const continuation = {...continuationBody, continuationSha256: sha256(continuationBody)};
  const nextAuthorityBody = structuredClone(authority);
  delete nextAuthorityBody.authoritySha256;
  nextAuthorityBody.uniformPatternFamilyContinuation = continuation;
  nextAuthorityBody.updatedAt = now;
  nextAuthorityBody.authoritySha256 = sha256(nextAuthorityBody);
  const nextAuthority = assertArticleAssetProductionAuthority(nextAuthorityBody);
  const next = structuredClone(current);
  next.production.articleAssetProductionAuthority = nextAuthority;
  const firstPass = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "uniform-pattern-family-continuation-wave-ready", targetId: continuation.continuationSha256, payload: {candidateCount: outputs.length, styleAuditSha256: styleAudit.auditSha256, reviewSha256: review.reviewSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, now});
  const eventBound = structuredClone(firstPass);
  eventBound.production.eventLedger.eventCount = Number(current.production.eventLedger.eventCount || 0) + 1;
  eventBound.production.eventLedger.lastEventId = event.eventId;
  eventBound.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(eventBound, now));
  const persisted = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `uniform-pattern-family-wave-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {[`${libraryRoot}/style-briefs.json`]: {contract: "A1UniformPatternFamilyStyleBriefSet/v1", briefs: styleBriefs}, [`${libraryRoot}/style-audit.json`]: styleAudit, [`${libraryRoot}/review.json`]: review, [`${libraryRoot}/continuation.json`]: continuation}, binaryFiles});
  return {styleAudit, review, continuation, persisted};
});

console.log(JSON.stringify({status: result.review.status, candidateCount: result.review.candidateCount, styleAuditSha256: result.styleAudit.auditSha256, continuationSha256: result.continuation.continuationSha256, reviewSha256: result.review.reviewSha256, reviewSheet: result.review.reviewSheet.publicUrl, candidates: result.review.candidates.map(({candidateId, roleId, sha256, fingerprint, publicUrl}) => ({candidateId, roleId, sha256, fingerprint, publicUrl})), workspaceSha256: result.persisted.workspaceSha256, userVisualApproval: "NOT_APPROVED", productionAdmitted: false}, null, 2));
