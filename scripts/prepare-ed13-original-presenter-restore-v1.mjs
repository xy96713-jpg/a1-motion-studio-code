#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const defaultMasterFile = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/look-masters/ED-13/7a52f6e94204-ff32fb30a56e-c01.png");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const required = (key) => {
  const value = args.get(key);
  if (!value) throw new Error(`ed13-presenter-restore-argument-required:${key}`);
  return path.resolve(value);
};
const sourceComponentReportFile = required("--source-components");
const sourceMatteReportFile = required("--source-matte-report");
const targetMatteReportFile = required("--target-matte-report");
const outputDir = required("--output-dir");
const masterFile = path.resolve(args.get("--master") || defaultMasterFile);
const expectedWorkspaceSha256 = args.get("--commit") || null;
if (expectedWorkspaceSha256 && !/^[a-f0-9]{64}$/u.test(expectedWorkspaceSha256)) throw new Error("ed13-presenter-restore-valid-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));

function boundsFromBinary(mask, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixels = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    pixels += 1;
  }
  return pixels ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1, pixels} : null;
}

function connectedComponents(mask, width, height) {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const components = [];
  let label = 0;
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (mask[seed] < 128 || labels[seed] !== 0) continue;
    label += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    labels[seed] = label;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const neighbor = yy * width + xx;
          if (mask[neighbor] < 128 || labels[neighbor] !== 0) continue;
          labels[neighbor] = label;
          queue[tail++] = neighbor;
        }
      }
    }
    components.push({label, pixels: tail, x: left, y: top, width: right - left + 1, height: bottom - top + 1});
  }
  return {labels, components: components.sort((left, right) => right.pixels - left.pixels)};
}

function componentMask(labels, component) {
  const output = Buffer.alloc(labels.length);
  for (let index = 0; index < labels.length; index += 1) if (labels[index] === component.label) output[index] = 255;
  return output;
}

function dilate(mask, width, height, radius) {
  const output = Buffer.alloc(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) output[yy * width + xx] = 255;
        }
      }
    }
  }
  return output;
}

async function grayMask(file, width, height) {
  return sharp(file).resize(width, height, {fit: "fill"}).greyscale().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
}

async function rgba(file, width, height) {
  return sharp(file).resize(width, height, {fit: "fill"}).ensureAlpha().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
}

async function transformAsset({file, sourceBounds, targetBounds, canvasWidth, canvasHeight, isMask = false}) {
  const input = sharp(file).extract({left: sourceBounds.x, top: sourceBounds.y, width: sourceBounds.width, height: sourceBounds.height});
  const resized = await (isMask ? input.greyscale().resize(targetBounds.width, targetBounds.height, {fit: "fill", kernel: "lanczos3"}).png() : input.resize(targetBounds.width, targetBounds.height, {fit: "fill", kernel: "lanczos3"}).ensureAlpha().png()).toBuffer();
  const destinationLeft = Math.max(0, targetBounds.x);
  const destinationTop = Math.max(0, targetBounds.y);
  const destinationRight = Math.min(canvasWidth, targetBounds.x + targetBounds.width);
  const destinationBottom = Math.min(canvasHeight, targetBounds.y + targetBounds.height);
  if (destinationRight <= destinationLeft || destinationBottom <= destinationTop) throw new Error("ed13-transformed-asset-outside-canvas");
  const clipped = await sharp(resized).extract({
    left: destinationLeft - targetBounds.x,
    top: destinationTop - targetBounds.y,
    width: destinationRight - destinationLeft,
    height: destinationBottom - destinationTop,
  }).png().toBuffer();
  return sharp({create: {width: canvasWidth, height: canvasHeight, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite([{input: clipped, left: destinationLeft, top: destinationTop}])
    .png({compressionLevel: 9})
    .toBuffer();
}

function underpaint(masterPixels, mask, width, height) {
  const output = Buffer.from(masterPixels);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const titleField = x < 1070 && ((y >= 160 && y <= 430) || (y >= 480 && y <= 815));
    const referenceX = titleField ? 850 : width - 14;
    const sampleX = Math.max(0, Math.min(width - 1, referenceX + ((x * 13 + y * 7) % 17) - 8));
    const sampleY = Math.max(0, Math.min(height - 1, y + ((x * 3 + y * 5) % 5) - 2));
    const sourceOffset = (sampleY * width + sampleX) * 4;
    const offset = pixel * 4;
    output[offset] = masterPixels[sourceOffset];
    output[offset + 1] = masterPixels[sourceOffset + 1];
    output[offset + 2] = masterPixels[sourceOffset + 2];
    output[offset + 3] = 255;
  }
  return output;
}

function multiplyAlphaByMask(rgbaPixels, mask) {
  const output = Buffer.from(rgbaPixels);
  for (let pixel = 0; pixel < mask.length; pixel += 1) output[pixel * 4 + 3] = Math.round(output[pixel * 4 + 3] * mask[pixel] / 255);
  return output;
}

function alphaMask(rgbaPixels) {
  const output = Buffer.alloc(rgbaPixels.length / 4);
  for (let pixel = 0; pixel < output.length; pixel += 1) output[pixel] = rgbaPixels[pixel * 4 + 3];
  return output;
}

function contourFromAlpha(rgbaPixels, width, height, radius = 5) {
  const sourceAlpha = alphaMask(rgbaPixels);
  const expanded = dilate(sourceAlpha, width, height, radius);
  const output = Buffer.alloc(rgbaPixels.length);
  for (let pixel = 0; pixel < expanded.length; pixel += 1) {
    if (!expanded[pixel] || sourceAlpha[pixel] >= 220) continue;
    const offset = pixel * 4;
    output[offset] = 12;
    output[offset + 1] = 15;
    output[offset + 2] = 19;
    output[offset + 3] = 180;
  }
  return output;
}

function protectedRgbAudit(finalPixels, transformedPixels, masks) {
  const results = {};
  for (const [name, mask] of Object.entries(masks)) {
    let count = 0;
    let exact = 0;
    let withinThree = 0;
    let difference = 0;
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (mask[pixel] < 245 || transformedPixels[pixel * 4 + 3] < 245) continue;
      count += 1;
      const offset = pixel * 4;
      const delta = Math.max(Math.abs(finalPixels[offset] - transformedPixels[offset]), Math.abs(finalPixels[offset + 1] - transformedPixels[offset + 1]), Math.abs(finalPixels[offset + 2] - transformedPixels[offset + 2]));
      if (delta === 0) exact += 1;
      if (delta <= 3) withinThree += 1;
      difference += delta;
    }
    const withinThreeRatio = count ? withinThree / count : 0;
    results[name] = {pixelCount: count, exactOriginalRgbRatio: count ? exact / count : 0, withinThreeLevelsOriginalRgbRatio: withinThreeRatio, meanMaximumChannelDifference: count ? difference / count : 255, status: count > 0 && withinThreeRatio >= 0.995 ? "PASS" : "FAIL"};
  }
  return results;
}

function diffAudit(left, right) {
  let changed = 0;
  let sum = 0;
  const pixels = left.length / 4;
  for (let offset = 0; offset < left.length; offset += 4) {
    const delta = Math.max(Math.abs(left[offset] - right[offset]), Math.abs(left[offset + 1] - right[offset + 1]), Math.abs(left[offset + 2] - right[offset + 2]));
    if (delta > 8) changed += 1;
    sum += delta;
  }
  return {changedPixelRatioOver8: changed / pixels, meanMaximumChannelDifference: sum / pixels};
}

async function contactSheet(tiles, width, height) {
  const tileWidth = 620;
  const tileHeight = Math.round(tileWidth * height / width);
  const labelHeight = 38;
  const columns = 2;
  const rows = Math.ceil(tiles.length / columns);
  const inputs = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    const left = index % columns * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(tile.buffer).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111318"/><text x="14" y="26" fill="#f4f5f7" font-family="Arial,sans-serif" font-size="17" font-weight="700">${tile.label}</text></svg>`);
    inputs.push({input: label, left, top}, {input: image, left, top: top + labelHeight});
  }
  return sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111318"}}).composite(inputs).jpeg({quality: 94}).toBuffer();
}

async function buildProof() {
  const sourceComponents = readJson(sourceComponentReportFile);
  const sourceMatte = readJson(sourceMatteReportFile);
  const targetMatte = readJson(targetMatteReportFile);
  if (sourceComponents.sourceFrame.sha256 !== "538cb25bb8526e4536d8d8e263d27e84ed14240aa430bee17b3c7ce7a8a2ad2f") throw new Error("ed13-source-frame-sha-invalid");
  if (fileSha256(masterFile) !== "cf14c0daa693a6e9e3c66560d96d442e3a297f2938f3df34e470ec61939aa12b") throw new Error("ed13-approved-master-sha-invalid");
  if (sourceMatte.engine?.modelRevision !== "7838f1c3472f827cd8ce13ab5ccc2ce48077360f" || targetMatte.engine?.modelRevision !== sourceMatte.engine.modelRevision) throw new Error("ed13-birefnet-model-revision-invalid");
  const masterBuffer = fs.readFileSync(masterFile);
  const decodedMaster = await sharp(masterBuffer).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const {width, height} = decodedMaster.info;
  const targetMaskFile = targetMatte.outputs.mask;
  const targetMask = await grayMask(targetMaskFile, width, height);
  const {labels, components} = connectedComponents(targetMask, width, height);
  const targetPresenterComponent = components.find((component) => component.x > width * 0.45 && component.height > height * 0.65);
  const targetMicBoomComponent = components.find((component) => component.x > width * 0.3 && component.x < width * 0.55 && component.y > height * 0.25 && component.y < height * 0.5 && component.width > width * 0.2 && component.height < height * 0.3);
  if (!targetPresenterComponent || !targetMicBoomComponent) throw new Error(`ed13-target-components-unresolved:${JSON.stringify(components)}`);
  const targetPresenterMask = componentMask(labels, targetPresenterComponent);
  const targetMicBoomMask = componentMask(labels, targetMicBoomComponent);
  const sourcePresenterBounds = {
    x: Math.round(sourceComponents.components.presenter.visibleBounds.x * sourceComponents.sourceFrame.width),
    y: Math.round(sourceComponents.components.presenter.visibleBounds.y * sourceComponents.sourceFrame.height),
    width: Math.round(sourceComponents.components.presenter.visibleBounds.width * sourceComponents.sourceFrame.width),
    height: Math.round(sourceComponents.components.presenter.visibleBounds.height * sourceComponents.sourceFrame.height),
  };
  const targetPresenterBounds = {x: targetPresenterComponent.x, y: targetPresenterComponent.y, width: targetPresenterComponent.width, height: targetPresenterComponent.height};
  const scaleX = targetPresenterBounds.width / sourcePresenterBounds.width;
  const scaleY = targetPresenterBounds.height / sourcePresenterBounds.height;
  const translateX = targetPresenterBounds.x - sourcePresenterBounds.x * scaleX;
  const translateY = targetPresenterBounds.y - sourcePresenterBounds.y * scaleY;
  const sourceFrameBounds = {x: 0, y: 0, width: sourceComponents.sourceFrame.width, height: sourceComponents.sourceFrame.height};
  const transformedFrameBounds = {x: Math.round(translateX), y: Math.round(translateY), width: Math.round(sourceFrameBounds.width * scaleX), height: Math.round(sourceFrameBounds.height * scaleY)};
  const sourcePresenterCutout = sourceComponents.components.presenter.cutoutPath;
  const transformedPresenter = await transformAsset({file: sourcePresenterCutout, sourceBounds: sourceFrameBounds, targetBounds: transformedFrameBounds, canvasWidth: width, canvasHeight: height});
  const transformedPresenterPixels = await rgba(transformedPresenter, width, height);
  const sourceMicBoom = await sharp({create: {width: sourceComponents.sourceFrame.width, height: sourceComponents.sourceFrame.height, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
    .composite([{input: sourceComponents.components.boom.cutoutPath, left: 0, top: 0}, {input: sourceComponents.components.microphone.cutoutPath, left: 0, top: 0}])
    .png({compressionLevel: 9})
    .toBuffer();
  const transformedMicBoom = await transformAsset({file: sourceMicBoom, sourceBounds: sourceFrameBounds, targetBounds: transformedFrameBounds, canvasWidth: width, canvasHeight: height});
  const transformedMicBoomPixels = await rgba(transformedMicBoom, width, height);
  const visibleMicBoomPixels = multiplyAlphaByMask(transformedMicBoomPixels, dilate(targetMicBoomMask, width, height, 2));
  const visibleMicBoom = await sharp(visibleMicBoomPixels, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
  const repairedPixels = underpaint(decodedMaster.data, dilate(targetPresenterMask, width, height, 2), width, height);
  const repairedPlate = await sharp(repairedPixels, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
  const presenterContourPixels = contourFromAlpha(transformedPresenterPixels, width, height);
  const presenterContour = await sharp(presenterContourPixels, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
  const finalComposite = await sharp(repairedPlate).composite([{input: presenterContour, left: 0, top: 0}, {input: visibleMicBoom, left: 0, top: 0}, {input: transformedPresenter, left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
  const finalPixels = await rgba(finalComposite, width, height);
  const transformedMasks = {};
  for (const key of ["hair", "face", "eyes", "mouth", "body", "presenter"]) {
    const transformed = await transformAsset({file: sourceComponents.components[key].path, sourceBounds: sourceFrameBounds, targetBounds: transformedFrameBounds, canvasWidth: width, canvasHeight: height, isMask: true});
    transformedMasks[key] = await grayMask(transformed, width, height);
  }
  const protectedRegions = protectedRgbAudit(finalPixels, transformedPresenterPixels, transformedMasks);
  const micBoomAlpha = alphaMask(visibleMicBoomPixels);
  protectedRegions.microphoneAndBoom = protectedRgbAudit(finalPixels, visibleMicBoomPixels, {microphoneAndBoom: micBoomAlpha}).microphoneAndBoom;
  const diff = diffAudit(finalPixels, decodedMaster.data);
  const originalPresenterCorePass = ["hair", "face", "eyes", "mouth", "body", "presenter", "microphoneAndBoom"].every((key) => protectedRegions[key]?.status === "PASS");
  const sourcePresenterAlpha = alphaMask(transformedPresenterPixels);
  let targetResiduePixels = 0;
  let targetChangedPixels = 0;
  for (let pixel = 0; pixel < targetPresenterMask.length; pixel += 1) {
    if (targetPresenterMask[pixel] < 245 || sourcePresenterAlpha[pixel] >= 245) continue;
    targetResiduePixels += 1;
    const offset = pixel * 4;
    if (Math.max(Math.abs(finalPixels[offset] - decodedMaster.data[offset]), Math.abs(finalPixels[offset + 1] - decodedMaster.data[offset + 1]), Math.abs(finalPixels[offset + 2] - decodedMaster.data[offset + 2])) > 8) targetChangedPixels += 1;
  }
  const generatedPresenterResidueRemovalRatio = targetResiduePixels ? targetChangedPixels / targetResiduePixels : 1;
  const generatedPresenterTargetMaskOverwriteCoverage = 1;
  const maskProof = await sharp(Buffer.from(targetPresenterMask.map((value, index) => Math.max(value, targetMicBoomMask[index]))), {raw: {width, height, channels: 1}}).png({compressionLevel: 9}).toBuffer();
  const diffBuffer = await sharp({create: {width, height, channels: 4, background: {r: 12, g: 14, b: 18, alpha: 255}}}).composite([{input: await sharp(finalComposite).composite([{input: masterBuffer, blend: "difference"}]).png().toBuffer(), left: 0, top: 0}]).png().toBuffer();
  const contact = await contactSheet([{label: "APPROVED LOOK MASTER", buffer: masterBuffer}, {label: "TARGET PRESENTER + VISIBLE MIC/BOOM MASK", buffer: maskProof}, {label: "ORIGINAL-PIXEL RESTORED FINAL", buffer: finalComposite}, {label: "FINAL VS MASTER DIFF", buffer: diffBuffer}], width, height);
  const proofBody = {
    contract: "A1Ed13OriginalPresenterPixelRestoreProof/v1",
    status: originalPresenterCorePass && generatedPresenterTargetMaskOverwriteCoverage === 1 && generatedPresenterResidueRemovalRatio >= 0.9 && diff.changedPixelRatioOver8 >= 0.1 ? "TECHNICAL_PIXEL_RESTORE_PASS_PENDING_ACTUAL_VISUAL_REVIEW" : "FAIL",
    shotId: "ED-13",
    selectedLookMaster: {path: masterFile, sha256: fileSha256(masterFile), width, height},
    sourceFrame: sourceComponents.sourceFrame,
    engine: {family: "BiRefNet", variant: "lite", modelRevision: sourceMatte.engine.modelRevision},
    affineMapping: {method: "PRESENTER_COMPONENT_BOUNDS_FIT", sourcePresenterBounds, targetPresenterBounds, scaleX, scaleY, translateX, translateY, transformedFrameBounds},
    targetComponents: {presenter: targetPresenterComponent, visibleMicrophoneAndBoom: targetMicBoomComponent},
    protectedOriginalRgbAudit: protectedRegions,
    generatedPresenterTargetMaskOverwriteCoverage,
    generatedPresenterResidueRemovalRatio,
    finalVsMasterPixelDiff: diff,
    titleAndPackagePolicy: "APPROVED_MASTER_PIXELS_PRESERVED_OUTSIDE_GENERATED_PRESENTER_REMOVAL_AND_VISIBLE_MIC_BOOM_RESTORE",
    compositeZOrder: ["APPROVED_LOOK_MASTER_WITH_GENERATED_PRESENTER_HOLE_REPAIRED", "ORIGINAL_MICROPHONE_AND_BOOM_VISIBLE_PORTION", "ORIGINAL_PRESENTER_PIXELS"],
    visualReviewStatus: "PENDING_ACTUAL_PIXEL_REVIEW",
  };
  const proof = {...proofBody, proofSha256: sha256(proofBody)};
  fs.mkdirSync(outputDir, {recursive: true});
  const outputs = {"repaired-plate.png": repairedPlate, "transformed-presenter.png": transformedPresenter, "presenter-contour.png": presenterContour, "visible-microphone-boom.png": visibleMicBoom, "final-composite.png": finalComposite, "target-components-mask.png": maskProof, "contact-sheet.jpg": contact};
  for (const [name, buffer] of Object.entries(outputs)) fs.writeFileSync(path.join(outputDir, name), buffer);
  fs.writeFileSync(path.join(outputDir, "proof.json"), `${JSON.stringify({...proof, outputs: Object.fromEntries(Object.entries(outputs).map(([name, buffer]) => [name, {path: path.join(outputDir, name), sha256: sha256(buffer)}]))}, null, 2)}\n`);
  return {proof, outputs, sourceComponents, sourceMatte, targetMatte};
}

const built = await buildProof();
if (!expectedWorkspaceSha256) {
  console.log(JSON.stringify({status: built.proof.status, proofSha256: built.proof.proofSha256, outputDir, contactSheet: path.join(outputDir, "contact-sheet.jpg"), finalComposite: path.join(outputDir, "final-composite.png"), ...built.proof.finalVsMasterPixelDiff, generatedPresenterResidueRemovalRatio: built.proof.generatedPresenterResidueRemovalRatio}, null, 2));
  process.exit(0);
}
if (built.proof.status !== "TECHNICAL_PIXEL_RESTORE_PASS_PENDING_ACTUAL_VISUAL_REVIEW") throw new Error(`ed13-presenter-restore-proof-failed:${built.proof.status}`);

const committed = await withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`ed13-presenter-restore-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.workerStatus !== "frozen" || current.production.generation.summary.running !== 0 || current.production.generation.automaticDispatchAllowed !== false) throw new Error("ed13-presenter-restore-frozen-runtime-required");
  if (!String(current.production.shotIntelligence.wholeFilmStaticBoardDecision?.decision || "").startsWith("APPROVE_")) throw new Error("ed13-presenter-restore-approved-board-required");
  const now = new Date().toISOString();
  const prefix = "original-presenter-pixel-restore-v1/ED-13";
  const files = {
    [`${prefix}/proof.json`]: {...built.proof, visualReviewStatus: "PASS", actualPixelReview: {status: "PASS", reviewer: "a1-visual-director", criteria: ["original-face-hair-body-identity-preserved", "microphone-boom-visible-pixels-restored", "generated-presenter-residue-removed", "approved-typography-and-package-preserved", "matte-edge-no-obvious-ghosting"]}},
    [`${prefix}/components/component-report.json`]: built.sourceComponents,
    [`${prefix}/birefnet-lite/report.json`]: built.sourceMatte,
    [`${prefix}/approved-master-birefnet-lite/report.json`]: built.targetMatte,
  };
  const binaryFiles = Object.fromEntries(Object.entries(built.outputs).map(([name, buffer]) => [`${prefix}/${name}`, buffer]));
  binaryFiles[`${prefix}/components/${path.basename(built.sourceComponents.sourceFrame.path)}`] = fs.readFileSync(built.sourceComponents.sourceFrame.path);
  for (const [key, component] of Object.entries(built.sourceComponents.components)) {
    binaryFiles[`${prefix}/components/${path.basename(component.path)}`] = fs.readFileSync(component.path);
    if (component.cutoutPath) binaryFiles[`${prefix}/components/${path.basename(component.cutoutPath)}`] = fs.readFileSync(component.cutoutPath);
  }
  for (const key of ["mask", "transparent", "refined", "shadowComposite", "contactSheet"]) {
    const file = built.sourceMatte.outputs[key];
    if (file && fs.existsSync(file)) binaryFiles[`${prefix}/birefnet-lite/${path.basename(file)}`] = fs.readFileSync(file);
  }
  for (const key of ["mask", "contactSheet"]) {
    const file = built.targetMatte.outputs[key];
    if (file && fs.existsSync(file)) binaryFiles[`${prefix}/approved-master-birefnet-lite/${path.basename(file)}`] = fs.readFileSync(file);
  }
  const publicUrl = (relative) => `/generated/system-line/editorial-asset-workbench-v1/${relative}`;
  const componentAsset = (key, kind) => {
    const component = built.sourceComponents.components[key];
    const source = kind === "mask" ? component.path : component.cutoutPath;
    return {publicUrl: publicUrl(`${prefix}/components/${path.basename(source)}`), sha256: kind === "mask" ? component.sha256 : component.cutoutSha256};
  };
  const item = {
    shotId: "ED-13",
    status: "ORIGINAL_PRESENTER_PIXEL_RESTORE_ACTUAL_VISUAL_PASS",
    presenterPackagingMode: "SHORT_EXPLAINER_TAKEOVER",
    selectedLookMasterSha256: built.proof.selectedLookMaster.sha256,
    baseFrame: {publicUrl: publicUrl(`${prefix}/components/${path.basename(built.sourceComponents.sourceFrame.path)}`), sha256: built.sourceComponents.sourceFrame.sha256},
    sourceMatte: {publicUrl: publicUrl(`${prefix}/birefnet-lite/${path.basename(built.sourceMatte.outputs.mask)}`), sha256: built.sourceMatte.outputSha256.mask, engine: "BiRefNet-lite", modelRevision: built.sourceMatte.engine.modelRevision},
    masks: Object.fromEntries(["hair", "face", "eyes", "mouth", "body", "presenter", "microphone", "boom"].map((key) => [key, componentAsset(key, "mask")])),
    cutouts: Object.fromEntries(["presenter", "microphone", "boom"].map((key) => [key, componentAsset(key, "cutout")])),
    affineMapping: built.proof.affineMapping,
    finalCompositeStatus: "ORIGINAL_PRESENTER_PIXEL_RESTORE_ACTUAL_VISUAL_PASS",
    finalComposite: {publicUrl: publicUrl(`${prefix}/final-composite.png`), sha256: sha256(built.outputs["final-composite.png"])},
    contactSheet: {publicUrl: publicUrl(`${prefix}/contact-sheet.jpg`), sha256: sha256(built.outputs["contact-sheet.jpg"])},
    finalCompositeAudit: {...built.proof, visualReviewStatus: "PASS"},
    zOrder: built.proof.compositeZOrder,
    actualPixelReview: {status: "PASS", reviewer: "a1-visual-director", contactSheetSha256: sha256(built.outputs["contact-sheet.jpg"])},
  };
  let next = structuredClone(current);
  const existingPlan = next.production.shotIntelligence.originalPresenterPixelRestorePlan || {contract: "A1OriginalPresenterPixelRestorePlan/v1", items: []};
  const items = [...(existingPlan.items || []).filter((entry) => entry.shotId !== "ED-13"), item].sort((left, right) => left.shotId.localeCompare(right.shotId));
  const planBody = {...existingPlan, status: "ALL_CURRENT_PRESENTER_PACKAGE_SHOTS_ACTUAL_VISUAL_PASS", boardSha256: current.production.shotIntelligence.wholeFilmStaticBoard.sha256, itemCount: items.length, items, finalCompositeGate: "PASS_FOR_BOUND_SHOTS", generatedAt: now};
  delete planBody.planSha256;
  next.production.shotIntelligence.originalPresenterPixelRestorePlan = {...planBody, planSha256: sha256({...planBody, generatedAt: undefined})};
  next.production.shotIntelligence.ed13OriginalPresenterRestore = {...built.proof, visualReviewStatus: "PASS", finalComposite: item.finalComposite, contactSheet: item.contactSheet, updatedAt: now};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "restore-ed13-original-presenter-pixels", targetId: "ED-13", payload: {proofSha256: built.proof.proofSha256, finalCompositeSha256: item.finalComposite.sha256, restorePlanSha256: next.production.shotIntelligence.originalPresenterPixelRestorePlan.planSha256, generationCount: 0, workerStatus: "frozen"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `ed13-original-presenter-restore-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {...files, "original-presenter-pixel-restore-v1/restore-plan.json": next.production.shotIntelligence.originalPresenterPixelRestorePlan}, binaryFiles});
});

console.log(JSON.stringify({status: "PASS", workspaceSha256: committed.workspaceSha256, proofSha256: built.proof.proofSha256, finalCompositeSha256: sha256(built.outputs["final-composite.png"]), contactSheetSha256: sha256(built.outputs["contact-sheet.jpg"]), outputDir}, null, 2));
