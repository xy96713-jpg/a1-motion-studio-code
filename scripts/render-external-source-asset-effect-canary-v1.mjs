#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {assertExternalSourceAssetEffectPlan, compileExternalSourceAssetEffectPlan} from "../apps/studio-next/src/lib/a1-external-source-asset-effect-v1.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "work/external-source-asset-effect-v1");
const assetsRoot = path.join(outputRoot, "assets");
const source = path.join(root, "work/external-source-tool-canaries-v1/outputs/official-profile-cutout.png");
const maskSource = path.join(root, "work/external-source-tool-canaries-v1/outputs/official-profile-mask.png");
const size = 720;
const subjectSize = 620;
const inset = 50;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const referenceFrames = [
  {id: "clean-pair", label: "人物只做抠像", path: "work/bv1xzmu6te1x-typography-study-20260915/motion-sequences/prop-and-legal-income/frame-003.jpg"},
  {id: "object-label", label: "文字贴道具", path: "work/bv1xzmu6te1x-typography-study-20260915/motion-sequences/prop-and-legal-income/frame-009.jpg"},
  {id: "evidence-person", label: "人物叠证据页", path: "work/bv1xzmu6te1x-typography-study-20260915/motion-sequences/foreground-conclusion-card/frame-006.jpg"},
  {id: "source-portrait", label: "肖像贴来源页", path: "work/bv1xzmu6te1x-typography-study-20260915/motion-sequences/evidence-highlight/frame-003.jpg"},
].map((item) => ({...item, absolutePath: path.join(root, item.path)}));

function checkerSvg(width, height, cell = 24) {
  const rects = [];
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      rects.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${(x / cell + y / cell) % 2 ? "#dedede" : "#f4f4f4"}"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects.join("")}</svg>`);
}

function textSvg(width, height, text, {x = 24, y = 36, size = 24, color = "#111", weight = 700, anchor = "start"} = {}) {
  const escaped = String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="${x}" y="${y}" font-family="Arial, 'PingFang SC', sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${escaped}</text></svg>`);
}

async function resizedCutout({grayscale = false, contrast = 1, brightness = 0} = {}) {
  let pipeline = sharp(source).resize(subjectSize, subjectSize, {fit: "contain"});
  if (grayscale) pipeline = pipeline.grayscale();
  if (contrast !== 1 || brightness !== 0) pipeline = pipeline.linear(contrast, brightness);
  return pipeline.png().toBuffer();
}

async function resizedMask() {
  return sharp(maskSource).resize(subjectSize, subjectSize, {fit: "contain"}).png().toBuffer();
}

async function colorThroughMask(mask, color) {
  const alpha = Number.isFinite(Number(color.alpha)) ? Number(color.alpha) : 1;
  const alphaMask = await sharp(mask).grayscale().linear(alpha).png().toBuffer();
  return sharp({create: {width: subjectSize, height: subjectSize, channels: 3, background: {r: color.r, g: color.g, b: color.b}}})
    .joinChannel(alphaMask)
    .png()
    .toBuffer();
}

async function expandedMask(mask, blur, threshold) {
  return sharp(mask).blur(blur).threshold(threshold).png().toBuffer();
}

async function halftone(input, {cell = 9, color = "#111111", opacity = 0.82} = {}) {
  const grid = Math.ceil(subjectSize / cell);
  const {data, info} = await sharp(input).resize(grid, grid, {fit: "contain", background: {r: 255, g: 255, b: 255, alpha: 0}}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const dots = [];
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const alpha = data[offset + 3] / 255;
      if (alpha < 0.08) continue;
      const luminance = (data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722) / 255;
      const radius = Math.max(0, (1 - luminance) * cell * 0.55 * alpha);
      if (radius >= 0.45) dots.push(`<circle cx="${(x + 0.5) * cell}" cy="${(y + 0.5) * cell}" r="${radius.toFixed(2)}"/>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${subjectSize}" height="${subjectSize}"><g fill="${color}" opacity="${opacity}">${dots.join("")}</g></svg>`);
}

async function transparentCanvas(composites) {
  return sharp({create: {width: size, height: size, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite(composites)
    .png()
    .toBuffer();
}

async function renderEffects() {
  const cutout = await resizedCutout();
  const mono = await resizedCutout({grayscale: true, contrast: 1.12, brightness: -8});
  const mask = await resizedMask();
  const lightStroke = await colorThroughMask(await expandedMask(mask, 4.2, 22), {r: 247, g: 244, b: 232, alpha: 1});
  const darkStroke = await colorThroughMask(await expandedMask(mask, 2.6, 30), {r: 20, g: 20, b: 18, alpha: 0.88});
  const paperEdge = await colorThroughMask(await expandedMask(mask, 7.5, 18), {r: 236, g: 226, b: 203, alpha: 1});
  const shadowMask = await sharp(mask).blur(9).png().toBuffer();
  const shadow = await colorThroughMask(shadowMask, {r: 0, g: 0, b: 0, alpha: 0.24});
  const dots = await halftone(cutout, {cell: 10, color: "#151515", opacity: 0.78});
  return [
    {id: "clean-cutout", label: "干净抠像", effects: ["CLEAN_CUTOUT"], buffer: await transparentCanvas([{input: cutout, left: inset, top: inset}])},
    {id: "light-contrast-stroke", label: "浅色细描边", effects: ["CLEAN_CUTOUT", "CONTRAST_STROKE"], buffer: await transparentCanvas([{input: lightStroke, left: inset, top: inset}, {input: cutout, left: inset, top: inset}])},
    {id: "dark-stroke-contact-shadow", label: "深描边＋接触影", effects: ["CLEAN_CUTOUT", "CONTRAST_STROKE", "CONTACT_SHADOW"], buffer: await transparentCanvas([{input: shadow, left: inset + 8, top: inset + 11}, {input: darkStroke, left: inset, top: inset}, {input: cutout, left: inset, top: inset}])},
    {id: "mono-print-cutout", label: "局部黑白印刷", effects: ["CLEAN_CUTOUT", "MONO_PRINT", "CONTRAST_STROKE"], buffer: await transparentCanvas([{input: lightStroke, left: inset, top: inset}, {input: mono, left: inset, top: inset}])},
    {id: "halftone-echo", label: "网点偏移副本", effects: ["CLEAN_CUTOUT", "HALFTONE_ECHO"], buffer: await transparentCanvas([{input: dots, left: inset + 28, top: inset + 12}, {input: cutout, left: inset - 16, top: inset}])},
    {id: "paper-edge-cutout", label: "局部纸边剪纸", effects: ["CLEAN_CUTOUT", "PAPER_EDGE"], buffer: await transparentCanvas([{input: paperEdge, left: inset, top: inset}, {input: mono, left: inset, top: inset}])},
  ];
}

async function writeEffectSheet(effects) {
  const tileWidth = 800;
  const tileHeight = 820;
  const sheet = sharp({create: {width: tileWidth * 3, height: tileHeight * 2, channels: 4, background: "#ece9e2"}});
  const composites = [];
  for (let index = 0; index < effects.length; index += 1) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const left = col * tileWidth;
    const top = row * tileHeight;
    composites.push({input: checkerSvg(size, size), left: left + 40, top: top + 28});
    composites.push({input: effects[index].buffer, left: left + 40, top: top + 28});
    composites.push({input: textSvg(tileWidth, 70, effects[index].label, {x: 400, y: 45, size: 25, anchor: "middle"}), left, top: top + 742});
  }
  const target = path.join(outputRoot, "transparent-effect-sheet.png");
  await sheet.composite(composites).png().toFile(target);
  return target;
}

async function writeComparisonBoard(effects) {
  const boardWidth = 1920;
  const boardHeight = 960;
  const colWidth = 480;
  const topImageHeight = 270;
  const previewSize = 420;
  const chosen = [effects[0], effects[2], effects[3], effects[4]];
  const composites = [];
  for (let index = 0; index < 4; index += 1) {
    const x = index * colWidth;
    const reference = await sharp(referenceFrames[index].absolutePath).resize(colWidth, topImageHeight, {fit: "cover"}).jpeg({quality: 88}).toBuffer();
    const effect = await sharp(chosen[index].buffer).resize(previewSize, previewSize, {fit: "contain"}).png().toBuffer();
    composites.push({input: textSvg(colWidth, 54, `参考：${referenceFrames[index].label}`, {x: 240, y: 36, size: 22, color: "#f2efe8", anchor: "middle"}), left: x, top: 0});
    composites.push({input: reference, left: x, top: 54});
    composites.push({input: textSvg(colWidth, 58, `A1 素材效果：${chosen[index].label}`, {x: 240, y: 39, size: 21, color: "#111", anchor: "middle"}), left: x, top: 324});
    composites.push({input: checkerSvg(previewSize, previewSize, 20), left: x + 30, top: 392});
    composites.push({input: effect, left: x + 30, top: 392});
  }
  const target = path.join(outputRoot, "reference-vs-asset-effect-review.jpg");
  await sharp({create: {width: boardWidth, height: boardHeight, channels: 3, background: "#ebe7de"}})
    .composite([
      {input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="54"><rect width="100%" height="54" fill="#161616"/></svg>`), left: 0, top: 0},
      ...composites,
    ])
    .jpeg({quality: 90})
    .toFile(target);
  return target;
}

async function alphaStats(file) {
  const metadata = await sharp(file).metadata();
  const stats = await sharp(file).stats();
  const alpha = stats.channels[3];
  return {width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha === true, alphaMin: alpha?.min ?? null, alphaMax: alpha?.max ?? null, alphaMean: alpha?.mean ?? null};
}

async function main() {
  fs.mkdirSync(assetsRoot, {recursive: true});
  assert(fs.existsSync(source) && fs.existsSync(maskSource), "verified-cutout-or-mask-missing");
  for (const item of referenceFrames) assert(fs.existsSync(item.absolutePath), `reference-frame-missing:${item.id}`);
  const plan = compileExternalSourceAssetEffectPlan({route: "SUBJECT_ISOLATION", mediaRole: "PERSON_SUBJECT", matteAvailable: true});
  assertExternalSourceAssetEffectPlan(plan);
  const initialAuthority = {
    workspace: fileSha256(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json")),
    phase: fileSha256(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json")),
  };
  const effects = await renderEffects();
  const rows = [];
  for (const effect of effects) {
    const file = path.join(assetsRoot, `${effect.id}.png`);
    await fs.promises.writeFile(file, effect.buffer);
    const stats = await alphaStats(file);
    assert(stats.hasAlpha && stats.alphaMin === 0 && stats.alphaMax === 255, `alpha-contract-failed:${effect.id}`);
    rows.push({id: effect.id, label: effect.label, effects: effect.effects, artifact: {path: path.relative(root, file), sha256: fileSha256(file), ...stats}, fullFrameBackground: false, visibleCopy: false});
  }
  const sheet = await writeEffectSheet(effects);
  const comparison = await writeComparisonBoard(effects);
  const finalAuthority = {
    workspace: fileSha256(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json")),
    phase: fileSha256(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json")),
  };
  assert(JSON.stringify(initialAuthority) === JSON.stringify(finalAuthority), "formal-authority-mutated");
  const result = {
    contract: "A1ExternalSourceAssetEffectCanary/v1",
    status: "READY_FOR_ACTUAL_PIXEL_REVIEW",
    assetEffectPlanSha256: plan.planSha256,
    source: {path: path.relative(root, source), sha256: fileSha256(source), maskPath: path.relative(root, maskSource), maskSha256: fileSha256(maskSource)},
    assets: rows,
    reviewArtifacts: {
      transparentEffectSheet: {path: path.relative(root, sheet), sha256: fileSha256(sheet)},
      referenceComparisonBoard: {path: path.relative(root, comparison), sha256: fileSha256(comparison)},
    },
    referenceBoundary: {framesAreReviewEvidenceOnly: true, productionAssetAllowed: false, sourceVideo: "https://www.bilibili.com/video/BV1xZMU6TE1X"},
    boundary: {reviewOnly: true, productionAdmission: false, storyboardMutationPerformed: false, authorityUnchanged: true, authoritySnapshot: finalAuthority},
  };
  fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({status: result.status, assets: rows.map((row) => ({id: row.id, alpha: {min: row.artifact.alphaMin, max: row.artifact.alphaMax}, sha256: row.artifact.sha256})), reviewArtifacts: result.reviewArtifacts, boundary: result.boundary}, null, 2));
}

await main();
