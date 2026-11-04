#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v4");
const manifestFile = path.join(artifactRoot, "manifest.json");
const auditFile = path.join(artifactRoot, "objective-audit.json");
const buildFile = path.join(root, "scripts/build-typography-master-board-v4.mjs");
const styleBriefAuditor = "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const absolute = (file) => path.join(root, file);
const checks = [];

function check(id, pass, evidence) {
  checks.push({id, pass: Boolean(pass), evidence});
}

function hexRgb(hex) {
  const value = hex.replace(/^#/u, "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function relativeLuminance([r, g, b]) {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a, b) {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return (high + 0.05) / (low + 0.05);
}

function colorContrast(a, b) {
  return contrastRatio(relativeLuminance(hexRgb(a)), relativeLuminance(hexRgb(b)));
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
}

function boundsArea(bounds) {
  return Math.max(0, bounds.width) * Math.max(0, bounds.height);
}

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

async function contrastForNode(baseFile, node) {
  const {data, info} = await sharp(baseFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const left = Math.max(0, Math.floor(node.bounds.x));
  const top = Math.max(0, Math.floor(node.bounds.y));
  const right = Math.min(info.width, Math.ceil(node.bounds.x + node.bounds.width));
  const bottom = Math.min(info.height, Math.ceil(node.bounds.y + node.bounds.height));
  const foreground = relativeLuminance(hexRgb(node.color));
  const ratios = [];
  for (let y = top; y < bottom; y += 6) {
    for (let x = left; x < right; x += 6) {
      const index = (y * info.width + x) * info.channels;
      ratios.push(contrastRatio(foreground, relativeLuminance([data[index], data[index + 1], data[index + 2]])));
    }
  }
  return {
    minimum: Number(Math.min(...ratios).toFixed(2)),
    p10: Number(percentile(ratios, 0.1).toFixed(2)),
    median: Number(percentile(ratios, 0.5).toFixed(2)),
    threshold: node.contrastClass === "body" ? 4.5 : 3,
    samples: ratios.length,
  };
}

async function pixelDifferenceRatio(firstFile, secondFile) {
  const first = await sharp(firstFile).resize(1920, 1080).removeAlpha().raw().toBuffer();
  const second = await sharp(secondFile).resize(1920, 1080).removeAlpha().raw().toBuffer();
  let different = 0;
  const pixels = first.length / 3;
  for (let index = 0; index < first.length; index += 3) {
    const delta = Math.abs(first[index] - second[index]) + Math.abs(first[index + 1] - second[index + 1]) + Math.abs(first[index + 2] - second[index + 2]);
    if (delta >= 36) different += 1;
  }
  return Number((different / pixels).toFixed(4));
}

async function main() {
  const manifestText = fs.readFileSync(manifestFile, "utf8");
  const manifest = JSON.parse(manifestText);
  const {manifestSha256, ...manifestBody} = manifest;
  check("manifest-contract", manifest.contract === "A1TypographyMasterBoard/v4", manifest.contract);
  check("manifest-self-hash", sha256(Buffer.from(JSON.stringify(manifestBody))) === manifestSha256, manifestSha256);
  check("review-boundary", manifest.productionAdmitted === false && manifest.userVisualApproval === "NOT_REVIEWED" && manifest.currentAuthorityUntouched === true, {
    productionAdmitted: manifest.productionAdmitted,
    userVisualApproval: manifest.userVisualApproval,
    currentAuthorityUntouched: manifest.currentAuthorityUntouched,
  });
  check("rejected-v3-not-promoted", manifest.supersedesRejectedBoard?.includes("typography-master-board-v3"), manifest.supersedesRejectedBoard);
  check("four-master-set", manifest.frames.length === 4, manifest.frames.map((frame) => frame.id));
  check("distinct-primary-families", new Set(manifest.frames.map((frame) => frame.primaryFamily)).size === 4, manifest.frames.map((frame) => frame.primaryFamily));
  check("distinct-style-fingerprints", new Set(manifest.frames.map((frame) => frame.brief.fingerprint)).size === 4, manifest.frames.map((frame) => frame.brief.fingerprint));
  check("distinct-compositions", new Set(manifest.frames.map((frame) => frame.composition)).size === 4, manifest.frames.map((frame) => frame.composition));
  check("distinct-interactions", new Set(manifest.frames.map((frame) => frame.interaction.kind)).size === 4, manifest.frames.map((frame) => frame.interaction.kind));

  const forbiddenPattern = /SourceHan|Source Han|思源|type-editorial-heavy|type-condensed-impact/u;
  const briefText = manifest.frames.map((frame) => fs.readFileSync(absolute(frame.brief.file), "utf8")).join("\n");
  const buildText = fs.readFileSync(buildFile, "utf8");
  check("source-han-forbidden-everywhere", !forbiddenPattern.test(`${manifestText}\n${briefText}\n${buildText}`), "manifest + v4 briefs + v4 build script contain no forbidden Source Han token or asset ID");

  const expectedFonts = new Map([
    ["type-pixel-correction", "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"],
    ["type-slanted-display", "93d1dac7c3752acce1b959d6e7460eb88c4acb325cc9e9f5f42e61c29216a758"],
  ]);
  check("font-set-is-two-ofl-families", manifest.fonts.length === 2 && manifest.fonts.every((font) => expectedFonts.get(font.assetId) === font.sha256), manifest.fonts);
  for (const font of manifest.fonts) {
    const file = absolute(font.file);
    check(`font-bound:${font.assetId}`, fs.existsSync(file) && fileSha256(file) === font.sha256, {file: font.file, sha256: font.sha256});
  }
  const licenseFile = absolute(manifest.fontLicenseEvidence.file);
  check("font-license-evidence-bound", fs.existsSync(licenseFile) && fileSha256(licenseFile) === manifest.fontLicenseEvidence.sha256, manifest.fontLicenseEvidence);

  for (const frame of manifest.frames) {
    const frameFile = absolute(frame.frame.file);
    const baseFile = absolute(frame.base.file);
    const briefFile = absolute(frame.brief.file);
    const metadata = await sharp(frameFile).metadata();
    check(`frame-png:${frame.id}`, metadata.format === "png" && metadata.width === 1920 && metadata.height === 1080, metadata);
    check(`frame-hash:${frame.id}`, fileSha256(frameFile) === frame.frame.sha256, frame.frame.sha256);
    check(`base-hash:${frame.id}`, fileSha256(baseFile) === frame.base.sha256, frame.base.sha256);
    check(`brief-hash:${frame.id}`, fileSha256(briefFile) === frame.brief.sha256, frame.brief);
    let briefAudit = "";
    let briefPass = true;
    try {
      briefAudit = execFileSync(process.execPath, [styleBriefAuditor, briefFile], {encoding: "utf8"}).trim();
    } catch (error) {
      briefPass = false;
      briefAudit = `${error.stdout || ""}${error.stderr || ""}`.trim();
    }
    check(`style-brief-audit:${frame.id}`, briefPass && /PASS/u.test(briefAudit), briefAudit);
    check(`vector-only-formal-overlay:${frame.id}`, frame.formalOverlay.cssUsed === false && frame.formalOverlay.htmlUsed === false && frame.formalOverlay.decorativeGeometryCount === 0 && JSON.stringify(frame.formalOverlay.allowedSvgElements) === JSON.stringify(["svg", "g", "path"]), frame.formalOverlay);
    check(`editable-non-generated-type:${frame.id}`, frame.editableText === true && frame.generatedFormalText === false && frame.textNodes.every((node) => node.editable === true && node.generated === false), {editableText: frame.editableText, generatedFormalText: frame.generatedFormalText});
    check(`frame-review-only:${frame.id}`, frame.productionAdmitted === false && frame.status === "READY_FOR_OBJECTIVE_AUDIT", {status: frame.status, productionAdmitted: frame.productionAdmitted});
    check(`one-dominant-actor:${frame.id}`, frame.textNodes.filter((node) => node.dominant).length === 1, frame.textNodes.filter((node) => node.dominant).map((node) => node.id));
    check(`hierarchy-concentration:${frame.id}`, frame.hierarchy.concentration >= 0.55 && frame.hierarchy.concentration <= 0.97, frame.hierarchy);
    check(`interaction-is-necessary:${frame.id}`, frame.interaction.necessary === true && frame.interaction.target, frame.interaction);
    for (const source of frame.sourceBindings) {
      const sourceFile = absolute(source.file);
      check(`source-bound:${frame.id}:${source.assetId}`, fs.existsSync(sourceFile) && fileSha256(sourceFile) === source.sha256, {file: source.file, sha256: source.sha256, visible: source.visible, evidenceBoundary: source.evidenceBoundary});
    }
    for (const node of frame.textNodes) {
      const codepoints = [...node.text].length;
      check(`glyph-coverage:${frame.id}:${node.id}`, node.glyphCount === codepoints && node.glyphIds.every((glyphId) => glyphId > 0), {codepoints, glyphCount: node.glyphCount});
      check(`allowed-font:${frame.id}:${node.id}`, expectedFonts.has(node.fontAssetId) && expectedFonts.get(node.fontAssetId) === node.fontSha256, {fontAssetId: node.fontAssetId, fontFamily: node.fontFamily, fontSha256: node.fontSha256});
      const safe = node.deliberateCrop || (node.bounds.x >= 50 && node.bounds.y >= 50 && node.bounds.x + node.bounds.width <= 1870 && node.bounds.y + node.bounds.height <= 1030);
      check(`safe-bounds:${frame.id}:${node.id}`, safe, node.bounds);
      if (node.renderMode !== "source-mask") {
        const contrast = await contrastForNode(baseFile, node);
        check(`contrast:${frame.id}:${node.id}`, contrast.p10 >= contrast.threshold, contrast);
      }
    }
    const dominant = frame.textNodes.find((node) => node.dominant && node.renderMode === "solid");
    if (dominant) {
      for (const node of frame.textNodes.filter((item) => item !== dominant && item.renderMode === "solid")) {
        const overlap = intersectionArea(dominant.bounds, node.bounds);
        if (overlap === 0) continue;
        const overlapRatio = overlap / boundsArea(node.bounds);
        const ratio = colorContrast(dominant.color, node.color);
        check(`dominant-overlap-legibility:${frame.id}:${node.id}`, ratio >= 3 || overlapRatio <= 0.15, {overlapRatio: Number(overlapRatio.toFixed(4)), colorContrast: Number(ratio.toFixed(2)), dominant: dominant.id});
      }
    }
  }

  const frameHashes = manifest.frames.map((frame) => frame.frame.sha256);
  check("distinct-rendered-pixels", new Set(frameHashes).size === frameHashes.length, frameHashes);
  check("three-or-more-purposeful-crops-or-interactions", manifest.frames.filter((frame) => frame.interaction.necessary === true && (frame.textNodes.some((node) => node.deliberateCrop) || frame.interaction.kind !== "deliberate-edge-crop")).length >= 3, manifest.frames.map((frame) => ({id: frame.id, kind: frame.interaction.kind, crop: frame.textNodes.some((node) => node.deliberateCrop)})));

  const frame01 = manifest.frames.find((frame) => frame.id === "01-glyph-monument");
  check("glyph-monument-copy", JSON.stringify(frame01?.textNodes.map((node) => node.text)) === JSON.stringify(["完成度很高的", "废稿"]), frame01?.textNodes.map((node) => node.text));

  const frame02 = manifest.frames.find((frame) => frame.id === "02-semantic-fracture");
  check("semantic-fracture-copy", JSON.stringify(frame02?.textNodes.map((node) => node.text)) === JSON.stringify(["换了", "模型", "问题", "没有消失"]), frame02?.textNodes.map((node) => node.text));

  const frame03 = manifest.frames.find((frame) => frame.id === "03-source-cut-through");
  const darkBackground = manifest.backgrounds.find((background) => background.assetId === "background-charcoal-contour-quiet-field-v1");
  const sourceDifference = await pixelDifferenceRatio(absolute(frame03.base.file), absolute(darkBackground.file));
  check("source-cut-through-is-visible", frame03.sourceBindings.length === 1 && frame03.sourceBindings[0].visible === true && frame03.textNodes.some((node) => node.renderMode === "source-mask") && sourceDifference >= 0.05 && sourceDifference <= 0.55, {sourceDifference, sourceBindings: frame03.sourceBindings, renderModes: frame03.textNodes.map((node) => node.renderMode)});

  const frame04 = manifest.frames.find((frame) => frame.id === "04-script-collision");
  const actualLatin = frame04?.textNodes.flatMap((node) => node.text.match(/[A-Za-z]+/gu) || []) || [];
  check("semantic-latin-only", JSON.stringify(actualLatin) === JSON.stringify(frame04?.allowedLatinTokens), {actualLatin, allowedLatinTokens: frame04?.allowedLatinTokens});
  check("three-model-roles-are-source-bound", frame04?.sourceBindings.length === 1 && frame04.sourceBindings[0].visible === false && frame04.sourceBindings[0].supportsTextNodeIds.length === 3, frame04?.sourceBindings);

  const failed = checks.filter((item) => !item.pass);
  const audit = {
    contract: "A1TypographyMasterBoardObjectiveAudit/v2",
    status: failed.length === 0 ? "OBJECTIVE_PASS_READY_FOR_USER_ACTUAL_PIXEL_REVIEW" : "BLOCKED_BY_OBJECTIVE_AUDIT",
    auditedAt: new Date().toISOString(),
    manifest: {file: path.relative(root, manifestFile), sha256: fileSha256(manifestFile), selfHash: manifest.manifestSha256},
    totals: {checks: checks.length, passed: checks.length - failed.length, failed: failed.length},
    checks,
    failedCheckIds: failed.map((item) => item.id),
    boundary: "Objective checks and license evidence do not constitute legal advice, visual approval, or production admission.",
  };
  fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: audit.status, totals: audit.totals, failedCheckIds: audit.failedCheckIds, audit: path.relative(root, auditFile)}, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

await main();
