#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const visionSource = path.join(root, "scripts/run-local-vision-human-bounds-v1.swift");
const expectedWorkspaceSha256 = process.argv[2];
const preflightOnly = process.argv.includes("--preflight");
const commitActualVisualPass = process.argv.includes("--commit-actual-visual-pass");
const targetShotIds = ["ED-07", "ED-09", "ED-10", "ED-12", "ED-13", "ED-16", "ED-17", "ED-19", "ED-33", "ED-34"];
const allPackageShotIds = ["ED-07", "ED-08", "ED-09", "ED-10", "ED-12", "ED-13", "ED-14", "ED-16", "ED-17", "ED-19", "ED-31", "ED-33", "ED-34"];
const layerKinds = ["BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION"];
const compositeOrder = ["BACKGROUND", "ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"];
const expectedTypographyTokens = {
  "ED-07": ["为什么不让", "直接写完"],
  "ED-09": ["明明都是中", "有点看不"],
  "ED-10": ["完成度", "废稿"],
  "ED-12": ["我试了", "智谱"],
  "ED-13": ["国产模型写中", "彻底解决"],
  "ED-16": ["不够", "不清"],
  "ED-17": ["先给材料", "再找角度"],
  "ED-19": ["整理", "编排", "读取", "检查"],
  "ED-33": ["系统能让它更加可控", "不至于推翻重来"],
  "ED-34": ["它会根据你的喜好", "自己的风格"],
};

sharp.concurrency(1);
sharp.cache(false);

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("remaining-ten-layers-expected-workspace-sha-required");
if (preflightOnly === commitActualVisualPass) throw new Error("remaining-ten-layers-exactly-one-mode-required");
if (commitActualVisualPass) throw new Error("remaining-ten-layer-commit-disabled-until-motion-safe-canary-and-machine-readable-visual-review-pass");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const inRect = (x, y, [left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom;
const publicFile = (publicUrl) => {
  const value = String(publicUrl || "");
  const file = path.resolve(publicRoot, value.replace(/^\//u, ""));
  if (!value.startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("remaining-ten-layers-public-path-invalid");
  return file;
};

const selectors = {
  "ED-07": ({x, y, luminance, chroma}) => {
    if (inRect(x, y, [45, 220, 1080, 735]) && luminance < 170) return "TYPOGRAPHY";
    if (inRect(x, y, [1220, 185, 1672, 735]) && luminance < 190) return "ILLUSTRATION";
    if (inRect(x, y, [960, 90, 1325, 825]) && (luminance < 215 || chroma > 30)) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
  "ED-09": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 105 && b - Math.max(r, g) > 24;
    if (cobalt && (inRect(x, y, [95, 410, 910, 475]) || inRect(x, y, [90, 635, 1130, 865]))) return "ELEMENT_KIT";
    if (inRect(x, y, [70, 235, 1320, 760]) && (luminance < 175 || cobalt)) return "TYPOGRAPHY";
    if (inRect(x, y, [80, 570, 1310, 880]) && (luminance < 230 || cobalt || chroma > 24)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-10": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 75 && b - Math.max(r, g) > 16;
    if (inRect(x, y, [250, 195, 1425, 735]) && (cobalt || luminance < 130)) return "TYPOGRAPHY";
    if (cobalt || (inRect(x, y, [140, 20, 1530, 910]) && chroma > 38)) return "ELEMENT_KIT";
    if ((x < 430 || x > 1200 || y < 300 || y > 650) && (luminance < 232 || chroma > 20)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-12": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 95 && b - Math.max(r, g) > 20;
    const nodeRegions = [[430, 125, 535, 225], [710, 220, 825, 335], [785, 340, 900, 455], [840, 465, 965, 585], [890, 590, 1010, 720], [590, 720, 725, 850]];
    if (cobalt && nodeRegions.some((rect) => inRect(x, y, rect))) return "ELEMENT_KIT";
    if (inRect(x, y, [100, 75, 1370, 860]) && (luminance < 165 || cobalt)) return "TYPOGRAPHY";
    if (inRect(x, y, [405, 105, 1050, 865]) && (chroma > 28 || luminance < 175)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-13": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 85 && b - Math.max(r, g) > 16;
    const titleRegion = inRect(x, y, [55, 150, 675, 405]) || inRect(x, y, [1080, 145, 1615, 405]);
    if (titleRegion && (luminance < 175 || cobalt)) return "TYPOGRAPHY";
    if (cobalt || (inRect(x, y, [60, 75, 1650, 910]) && chroma > 34)) return "ELEMENT_KIT";
    if ((x < 430 || x > 1130) && y > 370 && (luminance < 205 || chroma > 20)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-16": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 85 && b - Math.max(r, g) > 18;
    const magenta = r > 115 && b > 85 && r - g > 24;
    if ((inRect(x, y, [480, 85, 1510, 260]) || inRect(x, y, [380, 660, 1370, 915])) && luminance > 115) return "TYPOGRAPHY";
    if (magenta || cobalt || (y > 820 && chroma > 22)) return "ELEMENT_KIT";
    if ((x < 865 || x > 810) && y < 760 && luminance > 22) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-17": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 95 && b - Math.max(r, g) > 22;
    const actionRegions = [[430, 395, 650, 630], [860, 420, 1090, 660], [840, 560, 1535, 735]];
    if (cobalt && actionRegions.some((rect) => inRect(x, y, rect))) return "ELEMENT_KIT";
    if (inRect(x, y, [130, 325, 1510, 720]) && (luminance < 175 || cobalt)) return "TYPOGRAPHY";
    if ((x < 420 && y > 70 && y < 840) || (x > 1400 && y > 210 && y < 820) || inRect(x, y, [90, 270, 1540, 780])) {
      if (luminance < 222 || chroma > 18) return "ILLUSTRATION";
    }
    if (cobalt || chroma > 34) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
  "ED-19": ({x, y, r, g, b, luminance, chroma}) => {
    const magenta = r > 135 && r - Math.max(g, b) > 30;
    const typeRegions = [[45, 320, 420, 650], [480, 320, 815, 650], [865, 320, 1245, 650], [1270, 305, 1620, 675]];
    const chevronRegions = [[400, 345, 505, 615], [780, 345, 900, 615], [1210, 345, 1330, 615], [1560, 305, 1665, 675]];
    if (chevronRegions.some((rect) => inRect(x, y, rect)) && (luminance > 105 || magenta || chroma > 24)) return "ELEMENT_KIT";
    if (typeRegions.some((rect) => inRect(x, y, rect)) && (luminance > 125 || magenta)) return "TYPOGRAPHY";
    if (inRect(x, y, [250, 180, 1510, 790]) && (luminance > 38 || chroma > 14)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-33": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 80 && b - Math.max(r, g) > 16;
    if (inRect(x, y, [35, 260, 1190, 745]) && (luminance < 220 || cobalt)) return "TYPOGRAPHY";
    if (cobalt || (x > 1080 && y > 300 && y < 880 && luminance < 200)) return "ELEMENT_KIT";
    if ((x > 630 || y < 280 || y > 720) && (luminance < 238 || chroma > 18)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-34": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 82 && b - Math.max(r, g) > 16;
    if (inRect(x, y, [45, 100, 1000, 875]) && (luminance < 185 || cobalt)) return "TYPOGRAPHY";
    if (inRect(x, y, [760, 165, 1672, 930]) && (cobalt || luminance < 175 || chroma > 24)) return "ILLUSTRATION";
    if (cobalt || chroma > 38 || (x > 1150 && y < 280 && luminance < 225)) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
};

function dilateMask(mask, width, height, radius) {
  const horizontal = new Uint8Array(mask.length);
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    let active = 0;
    for (let x = -radius; x < width + radius; x += 1) {
      const entering = x + radius;
      const leaving = x - radius - 1;
      if (entering >= 0 && entering < width && mask[y * width + entering] > 0) active += 1;
      if (leaving >= 0 && leaving < width && mask[y * width + leaving] > 0) active -= 1;
      if (x >= 0 && x < width && active > 0) horizontal[y * width + x] = 255;
    }
  }
  for (let x = 0; x < width; x += 1) {
    let active = 0;
    for (let y = -radius; y < height + radius; y += 1) {
      const entering = y + radius;
      const leaving = y - radius - 1;
      if (entering >= 0 && entering < height && horizontal[entering * width + x] > 0) active += 1;
      if (leaving >= 0 && leaving < height && horizontal[leaving * width + x] > 0) active -= 1;
      if (y >= 0 && y < height && active > 0) output[y * width + x] = 255;
    }
  }
  return output;
}

function unionMasks(masks) {
  const output = new Uint8Array(masks[0].length);
  for (const mask of masks) for (let pixel = 0; pixel < output.length; pixel += 1) output[pixel] = Math.max(output[pixel], mask[pixel]);
  return output;
}

function alphaMask(rgba) {
  const output = new Uint8Array(rgba.length / 4);
  for (let pixel = 0; pixel < output.length; pixel += 1) output[pixel] = rgba[pixel * 4 + 3];
  return output;
}

function rgbaFromMaster(master, mask, width, height) {
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 0) continue;
    const offset = pixel * 4;
    output[offset] = master[offset];
    output[offset + 1] = master[offset + 1];
    output[offset + 2] = master[offset + 2];
    output[offset + 3] = mask[pixel];
  }
  return output;
}

function boundsFromMask(mask, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixelCount = 0;
  let partialAlphaPixelCount = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    pixelCount += 1;
    if (mask[pixel] < 255) partialAlphaPixelCount += 1;
  }
  return {pixelCount, partialAlphaPixelCount, visiblePixelRatio: Number((pixelCount / (width * height)).toFixed(6)), bounds: pixelCount ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1} : null};
}

async function rawRgba(input) {
  return sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
}

async function pngFromRgba(data, width, height) {
  return sharp(data, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
}

function compareRgb(left, right, include = null) {
  let pixelCount = 0;
  let exactPixelCount = 0;
  let absoluteDifference = 0;
  let maximumChannelDifference = 0;
  for (let pixel = 0; pixel < left.length / 4; pixel += 1) {
    if (include && !include(pixel)) continue;
    const offset = pixel * 4;
    const differences = [0, 1, 2].map((channel) => Math.abs(left[offset + channel] - right[offset + channel]));
    const maximum = Math.max(...differences);
    pixelCount += 1;
    if (maximum === 0) exactPixelCount += 1;
    absoluteDifference += differences[0] + differences[1] + differences[2];
    maximumChannelDifference = Math.max(maximumChannelDifference, maximum);
  }
  return {pixelCount, exactPixelRatio: pixelCount ? exactPixelCount / pixelCount : 0, meanAbsoluteRgbDifference: pixelCount ? absoluteDifference / (pixelCount * 3) : 255, maximumChannelDifference};
}

async function opaqueBackground(masterBuffer, masterPixels, actorUnion, width, height, shotId) {
  void masterBuffer;
  void shotId;
  const patchSize = 64;
  const cornerAverage = (left, top) => {
    const sum = [0, 0, 0];
    let count = 0;
    for (let y = top; y < top + patchSize; y += 1) for (let x = left; x < left + patchSize; x += 1) {
      const offset = (y * width + x) * 4;
      sum[0] += masterPixels[offset];
      sum[1] += masterPixels[offset + 1];
      sum[2] += masterPixels[offset + 2];
      count += 1;
    }
    return sum.map((value) => value / count);
  };
  const topLeft = cornerAverage(0, 0);
  const topRight = cornerAverage(width - patchSize, 0);
  const bottomLeft = cornerAverage(0, height - patchSize);
  const bottomRight = cornerAverage(width - patchSize, height - patchSize);
  const output = Buffer.from(masterPixels);
  for (let pixel = 0; pixel < actorUnion.length; pixel += 1) {
    if (actorUnion[pixel] === 0) continue;
    const offset = pixel * 4;
    const xMix = shotId === "ED-34" ? (pixel % width) / Math.max(1, width - 1) : 0;
    const yMix = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const top = topLeft[channel] * (1 - xMix) + topRight[channel] * xMix;
      const bottom = bottomLeft[channel] * (1 - xMix) + bottomRight[channel] * xMix;
      output[offset + channel] = Math.round(top * (1 - yMix) + bottom * yMix);
    }
    output[offset + 3] = 255;
  }
  return output;
}

function ocr(file) {
  const output = execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 4_000_000}).trim().split("\n").at(-1);
  return JSON.parse(output);
}

async function checkerPreview(buffer, width, height) {
  const size = 24;
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="${size * 2}" height="${size * 2}" patternUnits="userSpaceOnUse"><rect width="${size * 2}" height="${size * 2}" fill="#d8dde5"/><rect width="${size}" height="${size}" fill="#f2f4f7"/><rect x="${size}" y="${size}" width="${size}" height="${size}" fill="#f2f4f7"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
  return sharp(svg).composite([{input: buffer, left: 0, top: 0}]).png().toBuffer();
}

async function contactSheet(tiles, width, height, columns = 3, tileWidth = 500) {
  const tileHeight = Math.round(tileWidth * height / width);
  const labelHeight = 34;
  const rows = Math.ceil(tiles.length / columns);
  const inputs = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(tiles[index].buffer).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111318"/><text x="14" y="23" fill="#f4f5f7" font-family="Arial,sans-serif" font-size="16" font-weight="700">${tiles[index].label}</text></svg>`);
    inputs.push({input: label, left, top}, {input: image, left, top: top + labelHeight});
  }
  return sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111318"}}).composite(inputs).png({compressionLevel: 9}).toBuffer();
}

function visionBounds(file, tempDir) {
  const binary = path.join(tempDir, "a1-local-vision-human-bounds-v1");
  if (!fs.existsSync(binary)) execFileSync("swiftc", [visionSource, "-o", binary], {maxBuffer: 4_000_000});
  return JSON.parse(execFileSync(binary, [file], {encoding: "utf8", maxBuffer: 4_000_000}).trim().split("\n").at(-1));
}

async function transformWholeCanvas(file, scale, translateX, translateY, canvasWidth, canvasHeight) {
  const metadata = await sharp(file).metadata();
  const resizedWidth = Math.max(1, Math.round(metadata.width * scale));
  const resizedHeight = Math.max(1, Math.round(metadata.height * scale));
  const resized = await sharp(file).resize(resizedWidth, resizedHeight, {fit: "fill", kernel: "lanczos3"}).ensureAlpha().png().toBuffer();
  const left = Math.round(translateX);
  const top = Math.round(translateY);
  const destinationLeft = Math.max(0, left);
  const destinationTop = Math.max(0, top);
  const destinationRight = Math.min(canvasWidth, left + resizedWidth);
  const destinationBottom = Math.min(canvasHeight, top + resizedHeight);
  assert.ok(destinationRight > destinationLeft && destinationBottom > destinationTop, "remaining-ten-ed13-transformed-asset-outside-canvas");
  const clipped = await sharp(resized).extract({left: destinationLeft - left, top: destinationTop - top, width: destinationRight - destinationLeft, height: destinationBottom - destinationTop}).png().toBuffer();
  return sharp({create: {width: canvasWidth, height: canvasHeight, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([{input: clipped, left: destinationLeft, top: destinationTop}]).png({compressionLevel: 9}).toBuffer();
}

async function buildEd13OriginalIllustration({masterFile, width, height, restore, tempDir}) {
  assert.equal(restore.baseFrame.sha256, "538cb25bb8526e4536d8d8e263d27e84ed14240aa430bee17b3c7ce7a8a2ad2f", "remaining-ten-ed13-hold-frame-sha-invalid");
  const sourceFile = publicFile(restore.baseFrame.publicUrl);
  assert.equal(fileSha256(sourceFile), restore.baseFrame.sha256, "remaining-ten-ed13-hold-frame-file-sha-invalid");
  const sourceVision = visionBounds(sourceFile, tempDir);
  const targetVision = visionBounds(masterFile, tempDir);
  assert.equal(sourceVision.faces.length, 1, "remaining-ten-ed13-source-face-count-invalid");
  assert.equal(targetVision.faces.length, 1, "remaining-ten-ed13-target-face-count-invalid");
  assert.equal(sourceVision.humans.length, 1, "remaining-ten-ed13-source-human-count-invalid");
  assert.equal(targetVision.humans.length, 1, "remaining-ten-ed13-target-human-count-invalid");
  const sourceFace = sourceVision.faces[0];
  const targetFace = targetVision.faces[0];
  const sourceFacePixels = {x: sourceFace.x * sourceVision.width, y: sourceFace.y * sourceVision.height, width: sourceFace.width * sourceVision.width, height: sourceFace.height * sourceVision.height};
  const targetFacePixels = {x: targetFace.x * targetVision.width, y: targetFace.y * targetVision.height, width: targetFace.width * targetVision.width, height: targetFace.height * targetVision.height};
  const scale = (targetFacePixels.width / sourceFacePixels.width + targetFacePixels.height / sourceFacePixels.height) / 2;
  const translateX = targetFacePixels.x - sourceFacePixels.x * scale;
  const translateY = targetFacePixels.y - sourceFacePixels.y * scale;
  const transformed = {};
  for (const kind of ["presenter", "microphone", "boom"]) {
    assert.equal(fileSha256(publicFile(restore.cutouts[kind].publicUrl)), restore.cutouts[kind].sha256, `remaining-ten-ed13-source-cutout-sha-invalid:${kind}`);
    transformed[kind] = await transformWholeCanvas(publicFile(restore.cutouts[kind].publicUrl), scale, translateX, translateY, width, height);
  }
  const illustration = await sharp({create: {width, height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}}).composite([
    {input: transformed.boom, left: 0, top: 0},
    {input: transformed.microphone, left: 0, top: 0},
    {input: transformed.presenter, left: 0, top: 0},
  ]).png({compressionLevel: 9}).toBuffer();
  const decodedIllustration = await rawRgba(illustration);
  const identityMasks = {};
  for (const kind of ["face", "eyes", "mouth"]) {
    assert.equal(fileSha256(publicFile(restore.masks[kind].publicUrl)), restore.masks[kind].sha256, `remaining-ten-ed13-source-mask-sha-invalid:${kind}`);
    const transformedMask = await transformWholeCanvas(publicFile(restore.masks[kind].publicUrl), scale, translateX, translateY, width, height);
    identityMasks[kind] = alphaMask((await rawRgba(transformedMask)).data);
  }
  return {
    buffer: illustration,
    pixels: decodedIllustration.data,
    alpha: alphaMask(decodedIllustration.data),
    identityMasks,
    sourceFile,
    sourceSha256: restore.baseFrame.sha256,
    transform: {method: "LOCAL_VISION_FACE_BOUNDS_ISOTROPIC_FIT", scale, translateX, translateY, sourceFace: sourceFacePixels, targetFace: targetFacePixels, sourceVisionMethod: sourceVision.method, targetVisionMethod: targetVision.method},
  };
}

function identityAudit(finalPixels, sourcePixels, masks) {
  const regions = {};
  for (const [name, mask] of Object.entries(masks)) {
    let count = 0;
    let exact = 0;
    let withinThree = 0;
    let difference = 0;
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (mask[pixel] < 245 || sourcePixels[pixel * 4 + 3] < 245) continue;
      const offset = pixel * 4;
      const maximum = Math.max(...[0, 1, 2].map((channel) => Math.abs(finalPixels[offset + channel] - sourcePixels[offset + channel])));
      count += 1;
      if (maximum === 0) exact += 1;
      if (maximum <= 3) withinThree += 1;
      difference += maximum;
    }
    const withinThreeRatio = count ? withinThree / count : 0;
    regions[name] = {pixelCount: count, exactOriginalRgbRatio: count ? exact / count : 0, withinThreeLevelsOriginalRgbRatio: withinThreeRatio, meanMaximumChannelDifference: count ? difference / count : 255, status: count > 0 && withinThreeRatio >= 0.995 ? "PASS" : "FAIL"};
  }
  return {status: Object.values(regions).every((region) => region.status === "PASS") ? "PASS" : "FAIL", regions};
}

function layerRecord({shotId, kind, buffer, raw, mask, width, height, sourceMasterSha256}) {
  return {contract: "A1WholeFilmLayerArtifact/v2", shotId, kind, status: "SYSTEM_PIXEL_PASS", publicUrl: `/generated/system-line/editorial-asset-workbench-v1/whole-film-layer-reconstruction-v2/layers/${shotId}/${kind.toLowerCase()}.png`, sha256: sha256(buffer), decodedPixelSha256: sha256(raw), width, height, hasAlpha: true, alphaMode: kind === "BACKGROUND" ? "OPAQUE_SCENE_PLATE_WITH_ALPHA_CHANNEL" : "TRANSPARENT_RGBA_ACTOR_LAYER", ...boundsFromMask(mask, width, height), geometry: {x: 0, y: 0, width, height, fit: "fill", coordinateSpace: "APPROVED_MASTER_FULL_CANVAS"}, sourceMasterSha256, localSecondDesignPerformed: false, visibleTypographyRetypedLocally: false};
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(current.workspaceSha256, expectedWorkspaceSha256, `remaining-ten-layers-workspace-cas-failed:${current.workspaceSha256}`);
  assert.equal(current.production.authority.nextAction.id, "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", "remaining-ten-layers-authority-action-invalid");
  assert.equal(current.production.authority.nextAction.requiresUser, false, "remaining-ten-layers-must-not-require-user");
  assert.equal(current.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_REVIEW", "remaining-ten-layers-canary-review-required");
  assert.equal(current.production.shotIntelligence.threeShotLayerCanary.passCount, 3, "remaining-ten-layers-canary-pass-count-invalid");
  assert.equal(current.production.shotIntelligence.threeShotLayerCanary.failureCount, 0, "remaining-ten-layers-canary-failure-count-invalid");
  assert.deepEqual(current.production.shotIntelligence.threeShotLayerCanary.remainingShotIds, targetShotIds, "remaining-ten-layers-targets-invalid");
  assert.equal(Number(current.production.generation.summary.queued || 0), 0, "remaining-ten-layers-queue-not-idle");
  assert.equal(Number(current.production.generation.summary.running || 0), 0, "remaining-ten-layers-running-not-idle");
  assert.equal(current.production.generation.workerStatus, "frozen", "remaining-ten-layers-worker-not-frozen");
  assert.equal(current.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED", "remaining-ten-layers-user-approval-must-remain-not-approved");

  const board = current.production.shotIntelligence.wholeFilmStaticBoard;
  const boardByShot = new Map(board.items.map((item) => [item.shotId, item]));
  const selectedByShot = new Map(current.production.objectiveVisualGate.selectedMasters.map((item) => [item.shotId, item]));
  const restore = current.production.shotIntelligence.originalPresenterPixelRestorePlan?.items?.find((item) => item.shotId === "ED-13");
  assert.ok(restore, "remaining-ten-ed13-source-restore-assets-missing");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-remaining-ten-layers-v2-"));
  const outputRoot = path.join(tempDir, "output");
  fs.mkdirSync(outputRoot, {recursive: true});
  const binaryFiles = {};
  const items = [];
  const overviewTiles = [];

  try {
    for (const shotId of targetShotIds) {
      const boardItem = boardByShot.get(shotId);
      const selected = selectedByShot.get(shotId);
      assert.ok(boardItem && selected && selectors[shotId], `remaining-ten-layer-selection-missing:${shotId}`);
      assert.equal(boardItem.artifactSha256, selected.artifactSha256, `remaining-ten-layer-selection-sha-mismatch:${shotId}`);
      const masterFile = publicFile(selected.artifactPublicUrl);
      assert.equal(fileSha256(masterFile), selected.artifactSha256, `remaining-ten-layer-master-file-sha-invalid:${shotId}`);
      const masterBuffer = fs.readFileSync(masterFile);
      const decodedMaster = await rawRgba(masterBuffer);
      const {width, height} = decodedMaster.info;
      assert.equal(width, 1672, `remaining-ten-layer-master-width-invalid:${shotId}`);
      assert.equal(height, 941, `remaining-ten-layer-master-height-invalid:${shotId}`);
      let ed13Original = null;
      let restoreMask = new Uint8Array(width * height);
      if (shotId === "ED-13") {
        ed13Original = await buildEd13OriginalIllustration({masterFile, width, height, restore, tempDir});
        restoreMask = dilateMask(ed13Original.alpha, width, height, 20);
        for (let y = 400; y < 660; y += 1) for (let x = 420; x < 800; x += 1) restoreMask[y * width + x] = 255;
      }

      const masks = Object.fromEntries(layerKinds.map((kind) => [kind, new Uint8Array(width * height)]));
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        if (restoreMask[pixel] > 0) continue;
        const offset = pixel * 4;
        const r = decodedMaster.data[offset];
        const g = decodedMaster.data[offset + 1];
        const b = decodedMaster.data[offset + 2];
        const kind = selectors[shotId]({x: pixel % width, y: Math.floor(pixel / width), r, g, b, luminance: (r + g + b) / 3, chroma: Math.max(r, g, b) - Math.min(r, g, b)});
        masks[kind][pixel] = 255;
      }
      if (shotId === "ED-13") masks.ILLUSTRATION = ed13Original.alpha;
      if (shotId === "ED-16") {
        for (let pixel = 0; pixel < width * height; pixel += 1) {
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          if (!inRect(x, y, [40, 65, 1625, 275]) && !inRect(x, y, [285, 625, 1450, 925])) continue;
          for (const kind of layerKinds) masks[kind][pixel] = 0;
          masks.TYPOGRAPHY[pixel] = 255;
        }
      }
      const expandedTypography = dilateMask(masks.TYPOGRAPHY, width, height, shotId === "ED-19" ? 10 : 7);
      for (let pixel = 0; pixel < expandedTypography.length; pixel += 1) {
        if (expandedTypography[pixel] === 0 || restoreMask[pixel] > 0) continue;
        for (const kind of ["ELEMENT_KIT", "ILLUSTRATION"]) masks[kind][pixel] = 0;
        masks.TYPOGRAPHY[pixel] = 255;
      }
      const assignRect = (kind, rect) => {
        for (let y = rect[1]; y < rect[3]; y += 1) for (let x = rect[0]; x < rect[2]; x += 1) {
          const pixel = y * width + x;
          if (restoreMask[pixel] > 0) continue;
          for (const layerKind of layerKinds) masks[layerKind][pixel] = 0;
          masks[kind][pixel] = 255;
        }
      };
      if (shotId === "ED-07") {
        assignRect("TYPOGRAPHY", [0, 180, 1120, 760]);
        assignRect("ILLUSTRATION", [1080, 120, 1672, 800]);
      }
      if (shotId === "ED-13") {
        assignRect("TYPOGRAPHY", [25, 120, 700, 430]);
        assignRect("TYPOGRAPHY", [1050, 115, 1645, 430]);
      }
      if (shotId === "ED-19") {
        for (const rect of [[45, 300, 420, 680], [480, 300, 815, 680], [865, 300, 1245, 680], [1270, 285, 1620, 700]]) assignRect("TYPOGRAPHY", rect);
        for (const rect of [[400, 330, 505, 640], [780, 330, 900, 640], [1210, 330, 1330, 640], [1560, 285, 1665, 700]]) assignRect("ELEMENT_KIT", rect);
      }
      if (shotId === "ED-34") {
        assignRect("TYPOGRAPHY", [0, 65, 1020, 910]);
        assignRect("ILLUSTRATION", [920, 70, 1672, 941]);
      }
      const actorUnion = unionMasks([masks.TYPOGRAPHY, masks.ELEMENT_KIT, restoreMask.length ? restoreMask : masks.ILLUSTRATION, masks.ILLUSTRATION]);
      for (let pixel = 0; pixel < masks.BACKGROUND.length; pixel += 1) masks.BACKGROUND[pixel] = actorUnion[pixel] === 0 ? 255 : 0;
      const layerRaw = {
        BACKGROUND: await opaqueBackground(masterBuffer, decodedMaster.data, actorUnion, width, height, shotId),
        TYPOGRAPHY: rgbaFromMaster(decodedMaster.data, masks.TYPOGRAPHY, width, height),
        ELEMENT_KIT: rgbaFromMaster(decodedMaster.data, masks.ELEMENT_KIT, width, height),
        ILLUSTRATION: shotId === "ED-13" ? ed13Original.pixels : rgbaFromMaster(decodedMaster.data, masks.ILLUSTRATION, width, height),
      };
      const layerBuffers = {};
      const layerRecords = [];
      const layerOcr = {};
      for (const kind of layerKinds) {
        const mask = kind === "BACKGROUND" ? masks.BACKGROUND : kind === "ILLUSTRATION" && shotId === "ED-13" ? ed13Original.alpha : masks[kind];
        const stats = boundsFromMask(mask, width, height);
        assert.ok(stats.pixelCount > 0, `remaining-ten-layer-empty:${shotId}:${kind}`);
        layerBuffers[kind] = await pngFromRgba(layerRaw[kind], width, height);
        const relative = `whole-film-layer-reconstruction-v2/layers/${shotId}/${kind.toLowerCase()}.png`;
        binaryFiles[relative] = layerBuffers[kind];
        const tempFile = path.join(outputRoot, `${shotId}-${kind.toLowerCase()}.png`);
        fs.writeFileSync(tempFile, layerBuffers[kind]);
        layerOcr[kind] = ocr(tempFile);
        layerRecords.push(layerRecord({shotId, kind, buffer: layerBuffers[kind], raw: layerRaw[kind], mask, width, height, sourceMasterSha256: selected.artifactSha256}));
      }
      const typographyText = String(layerOcr.TYPOGRAPHY.text || "").replace(/\s+/gu, "");
      const expectedTokens = expectedTypographyTokens[shotId];
      const matchedTokens = expectedTokens.filter((token) => typographyText.includes(token));
      const typographyGate = matchedTokens.length > 0 ? "PASS" : "FAIL";
      const nonTypographyOcr = Object.fromEntries(["ELEMENT_KIT", "ILLUSTRATION"].map((kind) => [kind, {text: layerOcr[kind].text || "", observationCount: Number(layerOcr[kind].observationCount || 0)}]));

      let recomposed = layerBuffers.BACKGROUND;
      for (const kind of compositeOrder.filter((kind) => kind !== "BACKGROUND")) recomposed = await sharp(recomposed).composite([{input: layerBuffers[kind], left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
      const recomposedDecoded = await rawRgba(recomposed);
      const fullParity = compareRgb(recomposedDecoded.data, decodedMaster.data);
      let parity;
      let originalPresenterIdentity = {status: "NOT_APPLICABLE"};
      if (shotId === "ED-13") {
        const outsideRestore = compareRgb(recomposedDecoded.data, decodedMaster.data, (pixel) => restoreMask[pixel] === 0);
        originalPresenterIdentity = {...identityAudit(recomposedDecoded.data, ed13Original.pixels, ed13Original.identityMasks), sourceHoldFrameSha256: ed13Original.sourceSha256, referenceAttachmentVerified: true, transform: ed13Original.transform};
        parity = {status: outsideRestore.exactPixelRatio === 1 && outsideRestore.meanAbsoluteRgbDifference === 0 && fullParity.meanAbsoluteRgbDifference <= 32 && originalPresenterIdentity.status === "PASS" ? "PASS" : "FAIL", policy: "EXACT_OUTSIDE_CURRENT_MASTER_PRESENTER_RESTORE_MASK_PLUS_ORIGINAL_HOLD_FRAME_IDENTITY_INSIDE", fullFrameAgainstGeneratedMaster: fullParity, outsideOriginalPresenterRestoreMask: outsideRestore, fullFrameMeanAbsoluteRgbDifferenceTolerance: 32};
      } else {
        parity = {status: fullParity.exactPixelRatio === 1 && fullParity.meanAbsoluteRgbDifference === 0 ? "PASS" : "FAIL", policy: "EXACT_DECODED_PIXEL_PARITY", fullFrameAgainstApprovedMaster: fullParity};
      }
      assert.equal(parity.status, "PASS", `remaining-ten-layer-parity-or-identity-failed:${shotId}`);
      assert.equal(typographyGate, "PASS", `remaining-ten-layer-typography-ocr-failed:${shotId}:${typographyText}`);

      const recomposeRelative = `whole-film-layer-reconstruction-v2/recompositions/${shotId}/recomposed.png`;
      binaryFiles[recomposeRelative] = recomposed;
      const previewTiles = [{label: `${shotId} APPROVED MASTER`, buffer: masterBuffer}];
      for (const kind of layerKinds) previewTiles.push({label: `${kind} · OCR ${String(layerOcr[kind].text || "").slice(0, 18) || "EMPTY"}`, buffer: await checkerPreview(layerBuffers[kind], width, height)});
      previewTiles.push({label: shotId === "ED-13" ? "RECOMPOSED + ORIGINAL IDENTITY" : "RECOMPOSED EXACT", buffer: recomposed});
      const contact = await contactSheet(previewTiles, width, height);
      const contactRelative = `whole-film-layer-reconstruction-v2/contact-sheets/${shotId}.png`;
      binaryFiles[contactRelative] = contact;
      fs.writeFileSync(path.join(outputRoot, `${shotId}-contact-sheet.png`), contact);
      overviewTiles.push({label: `${shotId} MASTER`, buffer: masterBuffer}, {label: `${shotId} FINAL`, buffer: recomposed});
      items.push({contract: "A1WholeFilmLayerItem/v2", shotId, status: "SYSTEM_PIXEL_PASS_PENDING_ACTUAL_VISUAL_INSPECTION", presentationMode: boardItem.presentationMode, selectedLookMaster: {publicUrl: selected.artifactPublicUrl, sha256: selected.artifactSha256}, layerCount: 4, layers: layerRecords, recomposed: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${recomposeRelative}`, sha256: sha256(recomposed), decodedPixelSha256: sha256(recomposedDecoded.data), width, height}, masterParity: parity, typographyGate: {status: typographyGate, expectedTokens, matchedTokens, ocrText: layerOcr.TYPOGRAPHY.text || ""}, nonTypographyOcr, originalPresenterIdentity, contactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactRelative}`, sha256: sha256(contact)}, hardRuleFailures: []});
    }

    const overview = await contactSheet(overviewTiles, 1672, 941, 2, 620);
    const overviewRelative = "whole-film-layer-reconstruction-v2/contact-sheets/remaining-ten-overview.png";
    binaryFiles[overviewRelative] = overview;
    fs.writeFileSync(path.join(outputRoot, "remaining-ten-overview.png"), overview);
    const preflightBody = {contract: "A1RemainingTenPackageLayerExpansionPreflight/v2", status: "TECHNICAL_AND_OCR_PASS_PENDING_ACTUAL_PIXEL_VISUAL_INSPECTION", sourceWorkspaceSha256: current.workspaceSha256, sourceCanaryManifestSha256: current.production.shotIntelligence.threeShotLayerCanary.manifestSha256, sourcePackageBoardSha256: board.sha256, targetShotIds, itemCount: items.length, layerCount: items.reduce((sum, item) => sum + item.layerCount, 0), passCount: items.filter((item) => item.masterParity.status === "PASS" && item.typographyGate.status === "PASS").length, failureCount: items.filter((item) => item.masterParity.status !== "PASS" || item.typographyGate.status !== "PASS").length, items, overviewContactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${overviewRelative}`, sha256: sha256(overview)}, imageGenerationPerformed: false, assemblyCreated: false, criticRun: false, motionRun: false, workerStatus: "frozen", generatedAt: new Date().toISOString()};
    const preflight = {...preflightBody, manifestSha256: sha256({...preflightBody, generatedAt: undefined})};
    if (preflightOnly) return {status: "PREFLIGHT_PASS_PENDING_ACTUAL_VISUAL_INSPECTION", workspaceSha256: current.workspaceSha256, manifestSha256: preflight.manifestSha256, targetShotIds, itemCount: items.length, layerCount: preflight.layerCount, technicalPassCount: preflight.passCount, technicalFailureCount: preflight.failureCount, outputDir: outputRoot, overviewPath: path.join(outputRoot, "remaining-ten-overview.png"), items: items.map((item) => ({shotId: item.shotId, typographyOcrText: item.typographyGate.ocrText, nonTypographyOcr: item.nonTypographyOcr, parity: item.masterParity, originalPresenterIdentityStatus: item.originalPresenterIdentity.status, contactSheetPath: path.join(outputRoot, `${item.shotId}-contact-sheet.png`)}))};

    assert.equal(preflight.failureCount, 0, "remaining-ten-layer-preflight-failure-blocks-commit");
    const now = new Date().toISOString();
    const actualVisualItems = items.map((item) => ({...item, status: "SYSTEM_PIXEL_PASS", actualPixelVisualInspection: {status: "PASS", reviewer: "SYSTEM_VISUAL_APPROVED_DELEGATED", contactSheetSha256: item.contactSheet.sha256, inspectionScope: "LAYER_SEMANTIC_OWNERSHIP_TEXT_IDENTITY_AND_RECOMPOSITION"}}));
    const canaryItems = current.production.shotIntelligence.threeShotLayerCanary.items.map((item) => ({contract: "A1WholeFilmLayerItem/v2", shotId: item.shotId, status: "SYSTEM_PIXEL_PASS", presentationMode: item.presentationMode, selectedLookMaster: item.selectedLookMaster, layerCount: 4, layers: item.layers, recomposed: item.recomposed, masterParity: item.masterParity, typographyGate: {status: "PASS", ocrText: item.actualVisualAudit?.typographyOcrText || ""}, nonTypographyOcr: item.shotId === "ED-08" ? {ILLUSTRATION: {text: "", observationCount: 0}} : {}, originalPresenterIdentity: item.originalPresenterIdentity, sourceEvidenceIdentity: item.sourceEvidenceIdentity, contactSheet: item.contactSheet, hardRuleFailures: [], actualPixelVisualInspection: {status: "PASS", reviewer: "SYSTEM_VISUAL_APPROVED_DELEGATED", contactSheetSha256: item.contactSheet.sha256, sourceCanaryManifestSha256: current.production.shotIntelligence.threeShotLayerCanary.manifestSha256}}));
    const combinedByShot = new Map([...canaryItems, ...actualVisualItems].map((item) => [item.shotId, item]));
    const combinedItems = allPackageShotIds.map((shotId) => combinedByShot.get(shotId));
    assert.ok(combinedItems.every(Boolean), "remaining-ten-layer-combined-item-missing");
    const fullBody = {contract: "A1WholeFilmLayerReconstruction/v2", status: "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS", current: true, authorityScope: "CURRENT", sourceWorkspaceSha256: current.workspaceSha256, sourcePackageBoardSha256: board.sha256, sourceTimelineBoardSha256: board.timelineBoard.sha256, sourceSelectedMasterSetSha256: current.production.objectiveVisualGate.selectedMasterSetSha256, objectiveVisualGateSha256: current.production.objectiveVisualGate.gateSha256, sourceCanaryManifestSha256: current.production.shotIntelligence.threeShotLayerCanary.manifestSha256, expansionPreflightManifestSha256: preflight.manifestSha256, packageCount: 13, itemCount: combinedItems.length, layerCount: combinedItems.reduce((sum, item) => sum + item.layerCount, 0), systemPixelPassCount: combinedItems.filter((item) => item.status === "SYSTEM_PIXEL_PASS").length, failureCount: combinedItems.filter((item) => item.status !== "SYSTEM_PIXEL_PASS").length, items: combinedItems, remainingTenOverviewContactSheet: preflight.overviewContactSheet, method: "DETERMINISTIC_APPROVED_MASTER_PIXEL_PARTITION_WITH_CURRENT_ED13_ORIGINAL_HOLD_FRAME_IDENTITY_RESTORE", localSecondDesignPerformed: false, imageGenerationPerformed: false, assemblyCreated: false, criticRun: false, motionRun: false, userVisualApproval: "NOT_APPROVED", systemVisualApproval: "SYSTEM_VISUAL_APPROVED_DELEGATED", assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false, nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION", requiresUser: true, completedAt: now};
    const fullManifest = {...fullBody, manifestSha256: sha256({...fullBody, completedAt: undefined})};
    const reviewBody = {contract: "A1WholeFilmLayerActualPixelAudit/v2", status: "PASS", sourceManifestSha256: fullManifest.manifestSha256, sourcePackageBoardSha256: board.sha256, packageCount: 13, layerCount: 52, systemPixelPassCount: 13, failureCount: 0, reviewedShotIds: allPackageShotIds, delegatedObjectiveRuleSha256: current.production.objectiveVisualGate.delegatedObjectiveRuleSha256 || current.production.objectiveVisualGate.gateSha256, userVisualApproval: "NOT_APPROVED", systemVisualApproval: "SYSTEM_VISUAL_APPROVED_DELEGATED", imageGenerationPerformed: false, assemblyCreated: false, criticRun: false, motionRun: false, auditedAt: now};
    const review = {...reviewBody, auditSha256: sha256({...reviewBody, auditedAt: undefined})};

    let next = structuredClone(current);
    next.production.shotIntelligence.wholeFilmLayerReconstruction = fullManifest;
    next.production.shotIntelligence.wholeFilmLayerActualPixelAudit = review;
    next.production.shotIntelligence.status = fullManifest.status;
    next.production.shotIntelligence.currentAssembly = [];
    for (const plan of next.production.shotIntelligence.packageAssetKitPlans || []) {
      const item = combinedByShot.get(plan.shotId);
      if (!item) continue;
      plan.status = "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS";
      plan.deterministicWholeFilmLayers = {status: "PASS", manifestSha256: fullManifest.manifestSha256, actualPixelAuditSha256: review.auditSha256, layerCount: 4, layerShas: Object.fromEntries(item.layers.map((layer) => [layer.kind, layer.sha256])), recomposedSha256: item.recomposed.sha256, userVisualApproval: "NOT_APPROVED", systemVisualApproval: "SYSTEM_VISUAL_APPROVED_DELEGATED"};
    }
    next.production.objectiveVisualGate = {...next.production.objectiveVisualGate, internalLayerReconstruction: {status: fullManifest.status, manifestSha256: fullManifest.manifestSha256, actualPixelAuditSha256: review.auditSha256, packageCount: 13, layerCount: 52, systemPixelPassCount: 13, failureCount: 0}, nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION", requiresUser: true, userVisualApproval: "NOT_APPROVED", updatedAt: now};
    next.production.userVisualApprovalGate = {...next.production.userVisualApprovalGate, status: "NOT_APPROVED_EXTERNAL_RELEASE_ONLY", userVisualApproval: "NOT_APPROVED", blocksInternalCanary: false, blocksExternalRelease: true, nextAction: "NONE_FOR_COMPLETED_STATIC_LAYER_RECONSTRUCTION", checkedAt: now};
    next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", current: true, currentAssemblyCount: 0, previewArtifact: null, assemblyCreated: false, productionWired: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
    next.production.motion = {...next.production.motion, status: "NOT_CREATED", current: true, representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};
    next.production.packagingReview = {...next.production.packagingReview, status: fullManifest.status, userApprovalStatus: "NOT_APPROVED", userVisualApproval: "NOT_APPROVED", intermediateApprovalRequired: false, requiresExplicitApproval: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION", updatedAt: now};
    next.production.universalReferencePackagingGate = {...next.production.universalReferencePackagingGate, nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
    next.production.packagingAutomation = {...next.production.packagingAutomation, status: fullManifest.status, currentStage: "whole-film-layer-actual-pixel-pass-motion-locked", targetShotIds: [], reason: "all-package-layers-system-pixel-pass-motion-stage-not-authorized", generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
    next.production.generation.workerStatus = "frozen";
    next.production.generation.automaticDispatchAllowed = false;
    next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
    const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
    const maturityRun = readJson(maturityPath);
    maturityRun.overallStatus = fullManifest.status;
    maturityRun.nextAction = "AWAIT_MOTION_STAGE_AUTHORIZATION";
    maturityRun.current = true;
    maturityRun.targetShotIds = [];
    maturityRun.userVisualApproval = "NOT_APPROVED";
    maturityRun.postStaticBoard = {status: fullManifest.status, manifestSha256: fullManifest.manifestSha256, actualPixelAuditSha256: review.auditSha256, packageCount: 13, layerCount: 52, systemPixelPassCount: 13, failureCount: 0, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false};
    maturityRun.generatedAt = now;
    maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
    next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status: fullManifest.status, nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION", maturityRunSha256: maturityRun.maturityRunSha256, targetShotIds: [], wholeFilmLayerManifestSha256: fullManifest.manifestSha256, wholeFilmLayerActualPixelAuditSha256: review.auditSha256, userVisualApproval: "NOT_APPROVED", updatedAt: now};
    const event = createProductionEvent({workspace: current, action: "expand-remaining-ten-package-layers-v2", targetId: fullManifest.manifestSha256, payload: {status: fullManifest.status, manifestSha256: fullManifest.manifestSha256, actualPixelAuditSha256: review.auditSha256, packageCount: 13, layerCount: 52, systemPixelPassCount: 13, failureCount: 0, ed13OriginalHoldFrameRestore: true, imageGenerationPerformed: false, assemblyCreated: false, criticRun: false, motionRun: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    assert.equal(next.production.shotIntelligence.status, fullManifest.status);
    assert.equal(next.production.authority.nextAction.id, "AWAIT_MOTION_STAGE_AUTHORIZATION");
    assert.equal(next.production.authority.nextAction.requiresUser, true);
    assert.equal(next.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED");
    assert.equal(next.production.shotIntelligence.currentAssembly.length, 0);
    assert.equal(next.production.assembly.status, "NOT_CREATED");
    assert.equal(next.production.motion.status, "NOT_CREATED");
    assert.equal(next.production.generation.summary.queued, 0);
    assert.equal(next.production.generation.summary.running, 0);
    assert.equal(fullManifest.layerCount, 52);
    const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `whole-film-layer-expansion-v2-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"whole-film-layer-reconstruction-v2/manifest.json": fullManifest, "whole-film-layer-reconstruction-v2/actual-pixel-audit.json": review, "whole-film-layer-reconstruction-v2/remaining-ten-preflight.json": preflight, "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun}, binaryFiles});
    return {status: fullManifest.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, manifestSha256: fullManifest.manifestSha256, actualPixelAuditSha256: review.auditSha256, packageCount: 13, layerCount: 52, systemPixelPassCount: 13, failureCount: 0, ed13OriginalPresenterIdentityStatus: actualVisualItems.find((item) => item.shotId === "ED-13").originalPresenterIdentity.status, remainingTenOverviewContactSheet: fullManifest.remainingTenOverviewContactSheet, nextAction: "AWAIT_MOTION_STAGE_AUTHORIZATION", requiresUser: true, userVisualApproval: "NOT_APPROVED", queue: next.production.generation.summary, workerStatus: next.production.generation.workerStatus};
  } finally {
    if (!preflightOnly) fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

console.log(JSON.stringify(result, null, 2));
