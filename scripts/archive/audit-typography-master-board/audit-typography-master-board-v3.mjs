#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v3");
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

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
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

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const {manifestSha256, ...manifestBody} = manifest;
  check("manifest-contract", manifest.contract === "A1TypographyMasterBoard/v3", manifest.contract);
  check("manifest-self-hash", sha256(Buffer.from(JSON.stringify(manifestBody))) === manifestSha256, manifestSha256);
  check("review-boundary", manifest.productionAdmitted === false && manifest.userVisualApproval === "NOT_APPROVED" && manifest.currentAuthorityUntouched === true, {
    productionAdmitted: manifest.productionAdmitted,
    userVisualApproval: manifest.userVisualApproval,
    currentAuthorityUntouched: manifest.currentAuthorityUntouched,
  });
  check("four-master-set", manifest.frames.length === 4, manifest.frames.map((frame) => frame.id));
  check("distinct-primary-families", new Set(manifest.frames.map((frame) => frame.primaryFamily)).size === 4, manifest.frames.map((frame) => frame.primaryFamily));
  check("distinct-style-fingerprints", new Set(manifest.frames.map((frame) => frame.brief.fingerprint)).size === 4, manifest.frames.map((frame) => frame.brief.fingerprint));
  check("distinct-semantic-copy", new Set(manifest.frames.map((frame) => frame.semanticCopy)).size === 4, manifest.frames.map((frame) => frame.semanticCopy));

  for (const font of manifest.fonts) {
    const file = absolute(font.file);
    check(`font-bound:${font.assetId}`, fs.existsSync(file) && fileSha256(file) === font.sha256, {file: font.file, sha256: font.sha256});
  }
  for (const background of manifest.backgrounds) {
    const file = absolute(background.file);
    check(`background-bound:${background.assetId}`, fs.existsSync(file) && fileSha256(file) === background.sha256, {file: background.file, sha256: background.sha256});
  }

  for (const frame of manifest.frames) {
    const frameFile = absolute(frame.frame.file);
    const baseFile = absolute(frame.base.file);
    const briefFile = absolute(frame.brief.file);
    const frameMetadata = await sharp(frameFile).metadata();
    check(`frame-png:${frame.id}`, frameMetadata.format === "png" && frameMetadata.width === 1920 && frameMetadata.height === 1080, frameMetadata);
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
    check(`frame-review-only:${frame.id}`, frame.productionAdmitted === false && frame.status === "READY_FOR_USER_ACTUAL_PIXEL_REVIEW", {status: frame.status, productionAdmitted: frame.productionAdmitted});
    for (const source of frame.sourceBindings) {
      const sourceFile = absolute(source.file);
      check(`source-bound:${frame.id}:${source.assetId}`, fs.existsSync(sourceFile) && fileSha256(sourceFile) === source.sha256, {file: source.file, sha256: source.sha256, evidenceBoundary: source.evidenceBoundary});
    }
    for (const node of frame.textNodes) {
      const codepoints = [...node.text].length;
      check(`glyph-coverage:${frame.id}:${node.id}`, node.glyphCount === codepoints && node.glyphIds.every((glyphId) => glyphId > 0), {codepoints, glyphCount: node.glyphCount});
      const safe = node.deliberateCrop || (node.bounds.x >= 60 && node.bounds.y >= 60 && node.bounds.x + node.bounds.width <= 1865 && node.bounds.y + node.bounds.height <= 1020);
      check(`safe-bounds:${frame.id}:${node.id}`, safe, node.bounds);
      const contrast = await contrastForNode(baseFile, node);
      check(`contrast:${frame.id}:${node.id}`, contrast.p10 >= contrast.threshold, contrast);
    }
  }

  const frameHashes = manifest.frames.map((frame) => frame.frame.sha256);
  check("distinct-rendered-pixels", new Set(frameHashes).size === frameHashes.length, frameHashes);

  const chineseOnly = manifest.frames.find((frame) => frame.languageMode === "CHINESE_ONLY");
  check("chinese-only-is-actually-chinese-only", chineseOnly && chineseOnly.textNodes.every((node) => !/[A-Za-z]/u.test(node.text)), chineseOnly?.textNodes.map((node) => node.text));

  const bilingual = manifest.frames.find((frame) => frame.languageMode === "BILINGUAL_PARITY");
  const roles = new Set(bilingual?.textNodes.map((node) => node.role));
  check("bilingual-has-two-equal-title-roles", roles?.has("equal-title-zh") && roles?.has("equal-title-en"), [...(roles || [])]);
  check("bilingual-optical-parity", bilingual?.parity?.translationReviewed === true && bilingual.parity.opticalAreaRatio >= 0.75 && bilingual.parity.opticalAreaRatio <= 1.35, bilingual?.parity);

  const sourceLed = manifest.frames.find((frame) => frame.languageMode === "CHINESE_PRIMARY_SOURCE_LANGUAGE");
  check("source-led-overlay-remains-chinese", sourceLed && sourceLed.sourceBindings.length === 1 && sourceLed.textNodes.every((node) => !/[A-Za-z]/u.test(node.text)), {texts: sourceLed?.textNodes.map((node) => node.text), sourceCount: sourceLed?.sourceBindings.length});

  const codeSwitch = manifest.frames.find((frame) => frame.languageMode === "SEMANTIC_CODE_SWITCH");
  const actualLatin = codeSwitch?.textNodes.flatMap((node) => node.text.match(/[A-Za-z]+/gu) || []) || [];
  check("semantic-code-switch-latin-is-functional", JSON.stringify(actualLatin) === JSON.stringify(codeSwitch?.allowedLatinTokens), {actualLatin, allowedLatinTokens: codeSwitch?.allowedLatinTokens});

  const failed = checks.filter((item) => !item.pass);
  const audit = {
    contract: "A1TypographyMasterBoardObjectiveAudit/v1",
    status: failed.length === 0 ? "OBJECTIVE_PASS_READY_FOR_USER_ACTUAL_PIXEL_REVIEW" : "BLOCKED_BY_OBJECTIVE_AUDIT",
    auditedAt: new Date().toISOString(),
    manifest: {file: path.relative(root, manifestFile), sha256: fileSha256(manifestFile), selfHash: manifest.manifestSha256},
    totals: {checks: checks.length, passed: checks.length - failed.length, failed: failed.length},
    checks,
    failedCheckIds: failed.map((item) => item.id),
    boundary: "Objective checks do not grant visual approval or production admission.",
  };
  fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: audit.status, totals: audit.totals, failedCheckIds: audit.failedCheckIds, audit: path.relative(root, auditFile)}, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

await main();
