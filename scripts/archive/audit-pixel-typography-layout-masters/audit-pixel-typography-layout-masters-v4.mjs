#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const dualFontV5 = process.argv.includes("--dual-font-v5");
const dualFontV6 = process.argv.includes("--dual-font-v6");
const dualFont = dualFontV5 || dualFontV6;
const artifactRoot = path.join(root, dualFontV6 ? ".codex-artifacts/system-progress-system-line/dual-font-typography-layout-masters-v6" : dualFontV5 ? ".codex-artifacts/system-progress-system-line/dual-font-typography-layout-masters-v5" : ".codex-artifacts/system-progress-system-line/pixel-typography-layout-masters-v4");
const manifestFile = path.join(artifactRoot, "manifest.json");
const auditFile = path.join(artifactRoot, "objective-audit.json");
const styleBriefAuditor = "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const absolute = (file) => path.join(root, file);
const checks = [];

function check(id, pass, evidence) {
  checks.push({id, pass: Boolean(pass), evidence});
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const {manifestSha256, ...manifestBody} = manifest;
  check("manifest-contract", manifest.contract === (dualFontV6 ? "A1DualFontTypographyLayoutMasters/v6" : dualFontV5 ? "A1DualFontTypographyLayoutMasters/v5" : "A1PixelTypographyLayoutMasters/v4"), manifest.contract);
  check("manifest-self-hash", sha256(Buffer.from(JSON.stringify(manifestBody))) === manifestSha256, manifestSha256);
  check("three-video-constructions", manifest.frames.length === 3 && new Set(manifest.frames.map((frame) => frame.layoutType)).size === 3, manifest.frames.map((frame) => frame.layoutType));
  check("formal-copy-renderer-bound", manifest.exactFormalTextRendererBound === true && manifest.formalTextGeneratedByImageModel === false, {exactFormalTextRendererBound: manifest.exactFormalTextRendererBound, formalTextGeneratedByImageModel: manifest.formalTextGeneratedByImageModel});
  check("frozen-downstream", manifest.imageGenUsed === false && manifest.motionUsed === false && manifest.resolveUsed === false && manifest.finalRenderUsed === false, {imageGenUsed: manifest.imageGenUsed, motionUsed: manifest.motionUsed, resolveUsed: manifest.resolveUsed, finalRenderUsed: manifest.finalRenderUsed});
  check("review-only-boundary", manifest.currentAuthorityUntouched === true && manifest.defaultFontChanged === false && manifest.productionAdmitted === false && manifest.userVisualApproval === "NOT_APPROVED", {currentAuthorityUntouched: manifest.currentAuthorityUntouched, defaultFontChanged: manifest.defaultFontChanged, productionAdmitted: manifest.productionAdmitted, userVisualApproval: manifest.userVisualApproval});
  check("no-vertical-bars", manifest.verticalBars === 0 && manifest.frames.every((frame) => frame.formalOverlay.verticalBars === 0), manifest.frames.map((frame) => ({id: frame.id, verticalBars: frame.formalOverlay.verticalBars})));

  if (dualFont) {
    const fontIds = manifest.fonts.map((font) => font.assetId).sort();
    const textNodes = manifest.frames.flatMap((frame) => frame.textNodes);
    const pixelNodes = textNodes.filter((node) => node.fontAssetId === "type-boutique-9x9-bold-review");
    const editorialNodes = textNodes.filter((node) => node.fontAssetId === "type-frex-sans-gb-bold-review");
    check("dual-font-only", JSON.stringify(fontIds) === JSON.stringify(["type-boutique-9x9-bold-review", "type-frex-sans-gb-bold-review"]), fontIds);
    check("frex-editorial-primary", editorialNodes.length > 0 && editorialNodes.length + pixelNodes.length === textNodes.length, textNodes.map((node) => ({id: node.id, fontAssetId: node.fontAssetId})));
    check("pixel-keywords-short", pixelNodes.length === 3 && pixelNodes.every((node) => [...node.text].length <= 4), pixelNodes.map((node) => ({id: node.id, text: node.text, characters: [...node.text].length})));
    check("pixel-tracking-nonnegative", pixelNodes.every((node) => node.geometry.tracking >= 0), pixelNodes.map((node) => ({id: node.id, tracking: node.geometry.tracking})));
    check("source-han-excluded", !manifest.fonts.some((font) => /source.?han/iu.test(`${font.assetId} ${font.family} ${font.file}`)), manifest.fonts);
    check("dual-font-hierarchy-contract", manifest.typographyHierarchy?.editorialPrimary === "type-frex-sans-gb-bold-review" && manifest.typographyHierarchy?.pixelSignature === "type-boutique-9x9-bold-review" && ["NONNEGATIVE", "WORD_SPECIFIC_NONNEGATIVE"].includes(manifest.typographyHierarchy?.pixelTrackingPolicy), manifest.typographyHierarchy);
    if (dualFontV6) {
      const presenter = manifest.frames.find((frame) => frame.layoutType === "PRESENTER_HEADLINE");
      const fullscreen = manifest.frames.find((frame) => frame.layoutType === "FULLSCREEN_TYPOGRAPHY");
      const depth = manifest.frames.find((frame) => frame.layoutType === "PRESENTER_DEPTH_MASK");
      check("v6-no-heavy-shadow", textNodes.every((node) => node.shadow === null), textNodes.map((node) => ({id: node.id, shadow: node.shadow})));
      check("v6-acid-excluded", textNodes.every((node) => node.fill !== "#dfff68"), textNodes.map((node) => ({id: node.id, fill: node.fill})));
      check("v6-word-specific-pixel-tracking", JSON.stringify(pixelNodes.map((node) => node.geometry.tracking)) === JSON.stringify([18, 28, 14]), pixelNodes.map((node) => ({id: node.id, tracking: node.geometry.tracking})));
      check("v6-presenter-lockup", presenter?.textNodes.find((node) => node.id === "presenter-editorial-tail")?.geometry.x < 200 && presenter?.textNodes.find((node) => node.id === "presenter-editorial-tail")?.geometry.y > presenter?.textNodes.find((node) => node.id === "presenter-pixel-keyword")?.geometry.y, presenter?.textNodes.map((node) => ({id: node.id, geometry: node.geometry})));
      check("v6-restrained-treatment", manifest.treatmentRefinement?.sharedLockupEdges === true && manifest.treatmentRefinement?.heavyDropShadowRemoved === true && manifest.treatmentRefinement?.acidExcluded === true, manifest.treatmentRefinement);
      check("v6-fullscreen-not-game-logo-shadow", fullscreen?.textNodes.every((node) => node.shadow === null) && depth?.textNodes.find((node) => node.id === "depth-editorial-tail")?.fill === "#8faeff", {fullscreen: fullscreen?.textNodes, depthTail: depth?.textNodes.find((node) => node.id === "depth-editorial-tail")});
    }
  }

  for (const font of manifest.fonts) {
    const file = absolute(font.file);
    check(`font-bound:${font.assetId}`, fs.existsSync(file) && fileSha256(file) === font.sha256 && font.license === "OFL-1.1", font);
  }
  for (const [id, source] of Object.entries(manifest.sources)) {
    const file = absolute(source.file);
    check(`source-bound:${id}`, fs.existsSync(file) && fileSha256(file) === source.sha256, source);
  }

  for (const frame of manifest.frames) {
    const frameFile = absolute(frame.frame.file);
    const overlayFile = absolute(frame.overlay.file);
    const briefFile = absolute(frame.brief.file);
    const frameMetadata = await sharp(frameFile).metadata();
    const overlayMetadata = await sharp(overlayFile).metadata();
    check(`frame-pixels:${frame.id}`, frameMetadata.format === "png" && frameMetadata.width === 1920 && frameMetadata.height === 1080 && fileSha256(frameFile) === frame.frame.sha256, {metadata: frameMetadata, sha256: frame.frame.sha256});
    check(`overlay-pixels:${frame.id}`, overlayMetadata.format === "png" && overlayMetadata.width === 1920 && overlayMetadata.height === 1080 && overlayMetadata.hasAlpha === true && fileSha256(overlayFile) === frame.overlay.sha256, {metadata: overlayMetadata, sha256: frame.overlay.sha256});
    check(`brief-bound:${frame.id}`, fs.existsSync(briefFile) && fileSha256(briefFile) === frame.brief.sha256, frame.brief);
    let briefAudit = "";
    let briefPass = true;
    try {
      briefAudit = execFileSync(process.execPath, [styleBriefAuditor, briefFile], {encoding: "utf8"}).trim();
    } catch (error) {
      briefPass = false;
      briefAudit = `${error.stdout || ""}${error.stderr || ""}`.trim();
    }
    check(`brief-audit:${frame.id}`, briefPass && /"status": "PASS"/u.test(briefAudit), briefAudit);
    check(`vector-formal-overlay:${frame.id}`, frame.formalOverlay.cssUsed === false && frame.formalOverlay.htmlUsed === false && frame.formalOverlay.generatedFormalText === false && frame.formalOverlay.decorativeGeometryCount === 0 && JSON.stringify(frame.formalOverlay.allowedSvgElements) === JSON.stringify(["svg", "g", "path"]), frame.formalOverlay);
    check(`editable-glyphs:${frame.id}`, frame.editableText === true && frame.textNodes.every((node) => node.editable === true && node.generated === false && node.glyphIds.length === [...node.text].length && node.glyphIds.every((glyphId) => glyphId > 0)), frame.textNodes.map((node) => ({id: node.id, text: node.text, glyphs: node.glyphIds.length})));
    const renderedCopy = frame.textNodes.map((node) => node.text).join("");
    check(`exact-copy:${frame.id}`, renderedCopy === frame.exactCopy.join(""), {renderedCopy, exactCopy: frame.exactCopy.join("")});
    check(`frame-review-only:${frame.id}`, frame.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW" && frame.productionAdmitted === false, {status: frame.status, productionAdmitted: frame.productionAdmitted});
  }

  const presenter = manifest.frames.find((frame) => frame.layoutType === "PRESENTER_HEADLINE");
  check("presenter-negative-space-protects-subject", presenter?.presenterOverlap?.overlayOverlapRatio <= 0.01 && presenter?.faceOverlap?.overlapPixels === 0, {presenterOverlap: presenter?.presenterOverlap, faceOverlap: presenter?.faceOverlap});
  const fullscreen = manifest.frames.find((frame) => frame.layoutType === "FULLSCREEN_TYPOGRAPHY");
  check("fullscreen-has-no-presenter-contract", fullscreen?.presenterMode === "NONE" && fullscreen?.presenterOverlap === null && fullscreen?.faceOverlap === null, {presenterMode: fullscreen?.presenterMode});
  const depth = manifest.frames.find((frame) => frame.layoutType === "PRESENTER_DEPTH_MASK");
  check("depth-mask-is-material", depth?.presenterOverlap?.overlayOverlapRatio >= 0.08 && depth?.presenterOverlap?.overlayOverlapRatio <= 0.3 && depth?.faceOverlap?.overlapPixels === 0 && JSON.stringify(depth?.zOrder) === JSON.stringify(["darkened-presenter-background", "renderer-bound-typography", "original-presenter-microphone-boom-foreground"]), {presenterOverlap: depth?.presenterOverlap, faceOverlap: depth?.faceOverlap, zOrder: depth?.zOrder});

  const frameHashes = manifest.frames.map((frame) => frame.frame.sha256);
  check("distinct-rendered-pixels", new Set(frameHashes).size === 3, frameHashes);
  const reviewFile = absolute(manifest.reviewSheet.file);
  const reviewMetadata = await sharp(reviewFile).metadata();
  check("review-sheet-bound", reviewMetadata.width === manifest.reviewSheet.width && reviewMetadata.height === manifest.reviewSheet.height && fileSha256(reviewFile) === manifest.reviewSheet.sha256, {metadata: reviewMetadata, reviewSheet: manifest.reviewSheet});

  const failed = checks.filter((item) => !item.pass);
  const audit = {
    contract: dualFontV6 ? "A1DualFontTypographyLayoutMastersObjectiveAudit/v2" : dualFontV5 ? "A1DualFontTypographyLayoutMastersObjectiveAudit/v1" : "A1PixelTypographyLayoutMastersObjectiveAudit/v1",
    status: failed.length === 0 ? "OBJECTIVE_PASS_READY_FOR_USER_ACTUAL_PIXEL_REVIEW" : "BLOCKED_BY_OBJECTIVE_AUDIT",
    auditedAt: new Date().toISOString(),
    manifest: {file: path.relative(root, manifestFile), sha256: fileSha256(manifestFile), selfHash: manifest.manifestSha256},
    totals: {checks: checks.length, passed: checks.length - failed.length, failed: failed.length},
    checks,
    failedCheckIds: failed.map((item) => item.id),
    boundary: "Objective checks do not grant visual approval, default-font replacement, production admission, motion, Resolve, or final render authority.",
  };
  fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: audit.status, totals: audit.totals, failedCheckIds: audit.failedCheckIds, audit: path.relative(root, auditFile)}, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

await main();
