#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line/typography-master-board-v5");
const manifestFile = path.join(artifactRoot, "manifest.json");
const auditFile = path.join(artifactRoot, "objective-audit.json");
const buildFile = path.join(root, "scripts/build-typography-master-board-v5.mjs");
const styleBriefAuditor = "/Users/a1/.codex/skills/a1-retro-pixel-editorial-style/scripts/audit-style-brief.mjs";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const absolute = (file) => path.join(root, file);
const checks = [];

function check(id, pass, evidence) { checks.push({id, pass: Boolean(pass), evidence}); }
function hexRgb(hex) { const value = hex.replace(/^#/u, ""); return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)); }
function relativeLuminance([r, g, b]) { const linear = [r, g, b].map((channel) => { const value = channel / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; }); return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]; }
function contrastRatio(a, b) { return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
function percentile(values, fraction) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))]; }

async function contrastForNode(baseFile, node) {
  const {data, info} = await sharp(baseFile).removeAlpha().raw().toBuffer({resolveWithObject: true});
  const left = Math.max(0, Math.floor(node.bounds.x));
  const top = Math.max(0, Math.floor(node.bounds.y));
  const right = Math.min(info.width, Math.ceil(node.bounds.x + node.bounds.width));
  const bottom = Math.min(info.height, Math.ceil(node.bounds.y + node.bounds.height));
  const foreground = relativeLuminance(hexRgb(node.color));
  const ratios = [];
  for (let y = top; y < bottom; y += 6) for (let x = left; x < right; x += 6) {
    const index = (y * info.width + x) * info.channels;
    ratios.push(contrastRatio(foreground, relativeLuminance([data[index], data[index + 1], data[index + 2]])));
  }
  return {p10: Number(percentile(ratios, 0.1).toFixed(2)), threshold: node.contrastClass === "body" ? 4.5 : 3, samples: ratios.length};
}

async function pixelDifferenceRatio(firstFile, secondFile) {
  const first = await sharp(firstFile).resize(1920, 1080).removeAlpha().raw().toBuffer();
  const second = await sharp(secondFile).resize(1920, 1080).removeAlpha().raw().toBuffer();
  let different = 0;
  for (let index = 0; index < first.length; index += 3) {
    const delta = Math.abs(first[index] - second[index]) + Math.abs(first[index + 1] - second[index + 1]) + Math.abs(first[index + 2] - second[index + 2]);
    if (delta >= 36) different += 1;
  }
  return Number((different / (first.length / 3)).toFixed(4));
}

async function main() {
  const manifestText = fs.readFileSync(manifestFile, "utf8");
  const manifest = JSON.parse(manifestText);
  const {manifestSha256, ...manifestBody} = manifest;
  check("manifest-contract", manifest.contract === "A1TypographyMasterBoard/v5", manifest.contract);
  check("manifest-self-hash", sha256(Buffer.from(JSON.stringify(manifestBody))) === manifestSha256, manifestSha256);
  check("review-only-boundary", manifest.currentAuthorityUntouched === true && manifest.productionAdmitted === false && manifest.userVisualApproval === "NOT_REVIEWED", {currentAuthorityUntouched: manifest.currentAuthorityUntouched, productionAdmitted: manifest.productionAdmitted, userVisualApproval: manifest.userVisualApproval});
  check("smart-storyboard-diagnosis", manifest.smartStoryboardStatus?.activatedForED12 === true && manifest.smartStoryboardStatus?.experimentalBoardV4UsedIt === false && manifest.smartStoryboardStatus?.v5ReboundToDecision === true, manifest.smartStoryboardStatus);
  check("four-distinct-frames", manifest.frames.length === 4 && new Set(manifest.frames.map((frame) => frame.primaryFamily)).size === 4 && new Set(manifest.frames.map((frame) => frame.boundaryMode)).size === 4, manifest.frames.map((frame) => ({id: frame.id, primaryFamily: frame.primaryFamily, boundaryMode: frame.boundaryMode})));

  const croppedFrames = manifest.frames.filter((frame) => frame.textNodes.some((node) => node.deliberateCrop));
  check("at-most-one-cropped-frame", croppedFrames.length === 1 && manifest.cropPolicy.actualDeliberateCropFrames === 1, croppedFrames.map((frame) => frame.id));
  check("only-source-frame-may-crop", croppedFrames[0]?.id === "03-source-cut-through", croppedFrames.map((frame) => frame.id));
  check("no-crop-as-default", manifest.frames.filter((frame) => frame.boundaryMode !== "ONE_PURPOSEFUL_CROP").every((frame) => frame.textNodes.every((node) => node.deliberateCrop === false)), manifest.frames.map((frame) => ({id: frame.id, crop: frame.textNodes.some((node) => node.deliberateCrop)})));

  const forbiddenPattern = /SourceHan|Source Han|思源|type-editorial-heavy|type-condensed-impact/u;
  const briefText = manifest.frames.map((frame) => fs.readFileSync(absolute(frame.brief.file), "utf8")).join("\n");
  check("forbidden-font-absent-from-build", !forbiddenPattern.test(`${manifestText}\n${briefText}\n${fs.readFileSync(buildFile, "utf8")}`), "manifest + v5 briefs + v5 build source");
  const expectedFonts = new Map([["type-pixel-correction", "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"], ["type-slanted-display", "93d1dac7c3752acce1b959d6e7460eb88c4acb325cc9e9f5f42e61c29216a758"]]);
  check("font-set-exact", manifest.fonts.length === 2 && manifest.fonts.every((font) => expectedFonts.get(font.assetId) === font.sha256), manifest.fonts);
  for (const font of manifest.fonts) check(`font-hash:${font.assetId}`, fs.existsSync(absolute(font.file)) && fileSha256(absolute(font.file)) === font.sha256, font);

  for (const frame of manifest.frames) {
    const frameFile = absolute(frame.frame.file);
    const baseFile = absolute(frame.base.file);
    const metadata = await sharp(frameFile).metadata();
    check(`frame-png:${frame.id}`, metadata.format === "png" && metadata.width === 1920 && metadata.height === 1080, metadata);
    check(`frame-hash:${frame.id}`, fileSha256(frameFile) === frame.frame.sha256, frame.frame.sha256);
    check(`base-hash:${frame.id}`, fileSha256(baseFile) === frame.base.sha256, frame.base.sha256);
    let briefAudit = "";
    let briefPass = true;
    try { briefAudit = execFileSync(process.execPath, [styleBriefAuditor, absolute(frame.brief.file)], {encoding: "utf8"}).trim(); } catch (error) { briefPass = false; briefAudit = `${error.stdout || ""}${error.stderr || ""}`.trim(); }
    check(`style-brief:${frame.id}`, briefPass && /PASS/u.test(briefAudit), briefAudit);
    check(`clean-formal-overlay:${frame.id}`, frame.formalOverlay.cssUsed === false && frame.formalOverlay.htmlUsed === false && frame.formalOverlay.decorativeGeometryCount === 0, frame.formalOverlay);
    check(`one-dominant-text-actor:${frame.id}`, frame.textNodes.filter((node) => node.dominant).length === 1, frame.textNodes.filter((node) => node.dominant).map((node) => node.id));
    check(`hierarchy:${frame.id}`, frame.hierarchy.concentration >= 0.4 && frame.hierarchy.concentration <= 0.95, frame.hierarchy);
    for (const source of frame.sourceBindings) check(`source-hash:${frame.id}:${source.assetId}`, fs.existsSync(absolute(source.file)) && fileSha256(absolute(source.file)) === source.sha256, source);
    for (const node of frame.textNodes) {
      check(`glyphs:${frame.id}:${node.id}`, node.glyphCount === [...node.text].length && node.glyphIds.every((glyphId) => glyphId > 0), {text: node.text, glyphCount: node.glyphCount});
      const safe = node.deliberateCrop || (node.bounds.x >= 50 && node.bounds.y >= 50 && node.bounds.x + node.bounds.width <= 1870 && node.bounds.y + node.bounds.height <= 1030);
      check(`safe:${frame.id}:${node.id}`, safe, node.bounds);
      if (node.renderMode !== "source-mask") { const contrast = await contrastForNode(baseFile, node); check(`contrast:${frame.id}:${node.id}`, contrast.p10 >= contrast.threshold, contrast); }
    }
  }

  const sourceFrame = manifest.frames.find((frame) => frame.id === "03-source-cut-through");
  const sourceDifference = await pixelDifferenceRatio(absolute(sourceFrame.base.file), absolute(manifest.backgrounds[0].file));
  check("source-cut-through-visible", sourceDifference >= 0.05 && sourceDifference <= 0.55 && sourceFrame.sourceBindings.some((source) => source.visible), {sourceDifference});

  const entityFrame = manifest.frames.find((frame) => frame.id === "04-official-entity-constellation");
  const expectedAssets = new Map([
    ["source-entity-openai", "84d4b7045808f20b6e26255f9cfe7f191fd623c56b5b036fd632bf72618f379c"],
    ["source-entity-claude", "9f8b9b2255698ce54168d596502d5787b8413afb85beac35d85555b6fe7df58a"],
    ["source-entity-kimi", "f443e0ca26b43e6d8e08854e45d80ce72599d9f1a96513cccfbfb36de8c62f7e"],
    ["source-entity-deepseek", "3c6c62a4fd73090c76c025f0ef5fbe17cd53d6999803c3f2519673febcbcc6a7"],
    ["source-network-zhipu-official-mark", "19e520d11f87dd46c6b1b828d1b109fe4b837dc0f1d07ec4c343e54567ba05d7"],
  ]);
  check("five-official-assets-visible", entityFrame.assetNodes.length === 5 && entityFrame.assetNodes.every((asset) => asset.visible === true && asset.generated === false && asset.provenanceReviewed === true && expectedAssets.get(asset.assetId) === asset.sha256), entityFrame.assetNodes);
  check("official-assets-safe", entityFrame.assetNodes.every((asset) => asset.geometry.x >= 50 && asset.geometry.y >= 50 && asset.geometry.x + asset.geometry.width <= 1870 && asset.geometry.y + asset.geometry.height <= 1030), entityFrame.assetNodes.map((asset) => ({id: asset.id, geometry: asset.geometry})));
  check("ed12-storyboard-binding", entityFrame.storyboardBinding?.shotId === "ED-12" && entityFrame.storyboardBinding?.decisionHash === "df496b3cc560861560bd9f22343664f970dec14a157e5d5b0872e67071f63ae6" && entityFrame.storyboardBinding?.packageDecision === "PACKAGE" && entityFrame.storyboardBinding?.assemblyMode === "FULLSCREEN" && JSON.stringify(entityFrame.storyboardBinding?.entities) === JSON.stringify(["GPT", "Claude", "Kimi", "DeepSeek", "智谱"]), entityFrame.storyboardBinding);
  check("no-invented-model-roles", !/整理材料与主线|完成中文初稿|只改选中的局部/u.test(entityFrame.semanticCopy + entityFrame.textNodes.map((node) => node.text).join("")), {semanticCopy: entityFrame.semanticCopy, text: entityFrame.textNodes.map((node) => node.text)});
  check("identity-source-plate-bound", entityFrame.sourceBindings.some((source) => source.assetId === "official-named-entity-source-plate-ed12" && source.visible === false && source.sha256 === "eddcc3e363f5568192b4897025845bd7b9bbe7b8bb06d32e83a1cdd20929aa74"), entityFrame.sourceBindings);

  const failed = checks.filter((item) => !item.pass);
  const audit = {contract: "A1TypographyMasterBoardObjectiveAudit/v3", status: failed.length === 0 ? "OBJECTIVE_PASS_READY_FOR_USER_ACTUAL_PIXEL_REVIEW" : "BLOCKED_BY_OBJECTIVE_AUDIT", auditedAt: new Date().toISOString(), manifest: {file: path.relative(root, manifestFile), sha256: fileSha256(manifestFile), selfHash: manifest.manifestSha256}, totals: {checks: checks.length, passed: checks.length - failed.length, failed: failed.length}, checks, failedCheckIds: failed.map((item) => item.id), boundary: "Auxiliary review artifact only; no production authority, public generated output, storyboard authority, or render state is modified."};
  fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({status: audit.status, totals: audit.totals, failedCheckIds: audit.failedCheckIds, audit: path.relative(root, auditFile)}, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

await main();
