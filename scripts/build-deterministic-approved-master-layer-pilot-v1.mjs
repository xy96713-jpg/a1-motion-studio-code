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
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("deterministic-layer-pilot-expected-workspace-sha-required");
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const targetShotIds = ["ED-08", "ED-14", "ED-16", "ED-31", "ED-34"];
const layerOrder = ["BACKGROUND", "ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"];
const selectorCanvas = {width: 1672, height: 941};
const inRect = (x, y, [left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom;
const selectorPoint = (x, y, width, height) => ({x: x * selectorCanvas.width / width, y: y * selectorCanvas.height / height});

const selectors = {
  "ED-08": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 90 && b - Math.max(r, g) > 18;
    if (inRect(x, y, [70, 60, 1040, 390]) && (luminance > 145 || cobalt || chroma > 55)) return "TYPOGRAPHY";
    return "ELEMENT_KIT";
  },
  "ED-14": ({x, y, r, g, b, luminance, chroma}) => {
    if (inRect(x, y, [102, 112, 818, 830])) return "ILLUSTRATION";
    const labelRegions = [[1080, 205, 1350, 275], [1080, 475, 1350, 545], [1020, 710, 1600, 790]];
    if (labelRegions.some((rect) => inRect(x, y, rect)) && luminance < 175) return "TYPOGRAPHY";
    const mechanismRegions = [[1015, 265, 1565, 455], [1015, 525, 1565, 715], [795, 405, 1055, 575]];
    if (mechanismRegions.some((rect) => inRect(x, y, rect))) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
  "ED-16": ({x, y, r, g, b, luminance, chroma}) => {
    const typeRegions = [[170, 120, 790, 330], [960, 120, 1575, 330], [90, 650, 1580, 930]];
    if (typeRegions.some((rect) => inRect(x, y, rect)) && (luminance > 132 || chroma > 35)) return "TYPOGRAPHY";
    if (y < 650 && (luminance > 78 || b - Math.max(r, g) > 8)) return "ILLUSTRATION";
    if (y >= 560 && (luminance > 65 || (r > 90 && b > 60 && g < 90))) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
  "ED-31": ({x, y, r, g, b, luminance, chroma}) => {
    const lime = g > 105 && g - Math.max(r, b) > 25;
    if (inRect(x, y, [55, 135, 720, 370]) && (luminance > 135 || lime || chroma > 50)) return "TYPOGRAPHY";
    return "ELEMENT_KIT";
  },
  "ED-34": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 80 && b - Math.max(r, g) > 14;
    if (inRect(x, y, [50, 95, 1030, 745]) && (luminance < 175 || cobalt || chroma > 35)) return "TYPOGRAPHY";
    if (cobalt) return "ILLUSTRATION";
    if ((x > 900 || y > 735 || y < 220) && luminance < 190) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
};

function dilateMask(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] === 0) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          output[yy * width + xx] = 255;
        }
      }
    }
  }
  return output;
}

function boundsFromMask(mask, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixelCount = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    pixelCount += 1;
  }
  return {pixelCount, ratio: pixelCount / (width * height), bounds: pixelCount ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1} : null};
}

function rgbaLayer(master, mask, width, height) {
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 0) continue;
    const offset = pixel * 4;
    output[offset] = master[offset];
    output[offset + 1] = master[offset + 1];
    output[offset + 2] = master[offset + 2];
    output[offset + 3] = 255;
  }
  return output;
}

function cleanUnderpaint(shotId, x, y) {
  const noise = ((x * 17 + y * 31 + (x ^ y) * 7) % 9) - 4;
  if (shotId === "ED-08") return [14 + noise, 17 + noise, 21 + noise];
  if (shotId === "ED-31") return [17 + noise, 19 + noise, 22 + noise];
  if (shotId === "ED-14") return [247 + Math.round(noise * 0.45), 247 + Math.round(noise * 0.45), 245 + Math.round(noise * 0.45)];
  if (shotId === "ED-16") return [13 + noise, 18 + noise, 23 + noise];
  if (shotId === "ED-34") {
    if (y > 735) return [24 + noise, 34 + noise, 47 + noise];
    if (x < 1010) return [239 + Math.round(noise * 0.5), 241 + Math.round(noise * 0.5), 242 + Math.round(noise * 0.5)];
    return [17 + noise, 27 + noise, 39 + noise];
  }
  return [20 + noise, 22 + noise, 26 + noise];
}

async function makeOpaqueBackground({shotId, masterPixels, actorUnion, width, height}) {
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < actorUnion.length; pixel += 1) {
    const offset = pixel * 4;
    if (actorUnion[pixel] === 0) {
      output[offset] = masterPixels[offset];
      output[offset + 1] = masterPixels[offset + 1];
      output[offset + 2] = masterPixels[offset + 2];
    } else {
      const [red, green, blue] = cleanUnderpaint(shotId, pixel % width, Math.floor(pixel / width));
      output[offset] = Math.max(0, Math.min(255, red));
      output[offset + 1] = Math.max(0, Math.min(255, green));
      output[offset + 2] = Math.max(0, Math.min(255, blue));
    }
    output[offset + 3] = 255;
  }
  return sharp(output, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
}

async function rawRgba(buffer, width, height) {
  return sharp(buffer).resize(width, height, {fit: "fill"}).ensureAlpha().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
}

function compareExact(left, right) {
  if (left.length !== right.length) return {exactPixelRatio: 0, meanAbsoluteRgbDifference: 255};
  let exact = 0;
  let difference = 0;
  const pixels = left.length / 4;
  for (let offset = 0; offset < left.length; offset += 4) {
    const same = left[offset] === right[offset] && left[offset + 1] === right[offset + 1] && left[offset + 2] === right[offset + 2];
    if (same) exact += 1;
    difference += Math.abs(left[offset] - right[offset]) + Math.abs(left[offset + 1] - right[offset + 1]) + Math.abs(left[offset + 2] - right[offset + 2]);
  }
  return {exactPixelRatio: exact / pixels, meanAbsoluteRgbDifference: difference / (pixels * 3)};
}

async function loadGrayMask(file, width, height) {
  return sharp(file).resize(width, height, {fit: "fill"}).greyscale().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
}

function protectedPixelAudit({finalPixels, basePixels, presenterMask, faceMask, eyesMask, mouthMask, microphoneMask, boomMask}) {
  const audits = {};
  for (const [name, mask] of Object.entries({presenter: presenterMask, face: faceMask, eyes: eyesMask, mouth: mouthMask, microphone: microphoneMask, boom: boomMask})) {
    let count = 0;
    let exact = 0;
    let withinThree = 0;
    let maximumChannelDifferenceSum = 0;
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (mask[pixel] < 245) continue;
      count += 1;
      const offset = pixel * 4;
      if (finalPixels[offset] === basePixels[offset] && finalPixels[offset + 1] === basePixels[offset + 1] && finalPixels[offset + 2] === basePixels[offset + 2]) exact += 1;
      const maximumChannelDifference = Math.max(Math.abs(finalPixels[offset] - basePixels[offset]), Math.abs(finalPixels[offset + 1] - basePixels[offset + 1]), Math.abs(finalPixels[offset + 2] - basePixels[offset + 2]));
      if (maximumChannelDifference <= 3) withinThree += 1;
      maximumChannelDifferenceSum += maximumChannelDifference;
    }
    const withinThreeRatio = count ? withinThree / count : 0;
    const meanMaximumChannelDifference = count ? maximumChannelDifferenceSum / count : 255;
    audits[name] = {pixelCount: count, exactOriginalRgbRatio: count ? exact / count : 0, withinThreeLevelsOriginalRgbRatio: withinThreeRatio, meanMaximumChannelDifference, resamplingPolicy: "SOURCE_HOLD_FRAME_RESIZED_TO_APPROVED_MASTER_CANVAS_WITH_NO_GENERATIVE_REPAINT", status: count > 0 && withinThreeRatio >= 0.995 && meanMaximumChannelDifference <= 2 ? "PASS" : "FAIL"};
  }
  const foreground = presenterMask.map((value, index) => Math.max(value, microphoneMask[index], boomMask[index]));
  let outside = 0;
  let changed = 0;
  for (let pixel = 0; pixel < foreground.length; pixel += 1) {
    if (foreground[pixel] > 24) continue;
    outside += 1;
    const offset = pixel * 4;
    if (Math.max(Math.abs(finalPixels[offset] - basePixels[offset]), Math.abs(finalPixels[offset + 1] - basePixels[offset + 1]), Math.abs(finalPixels[offset + 2] - basePixels[offset + 2])) > 12) changed += 1;
  }
  const packageVisibleAreaRatioOutsideForeground = outside ? changed / outside : 0;
  const status = Object.values(audits).every((audit) => audit.status === "PASS") && packageVisibleAreaRatioOutsideForeground >= 0.15 ? "PASS" : "FAIL";
  return {status, protectedRegions: audits, packageVisibleAreaRatioOutsideForeground};
}

async function contactSheet({tiles, width, height}) {
  const tileWidth = 520;
  const tileHeight = Math.round(tileWidth * height / width);
  const columns = 3;
  const rows = Math.ceil(tiles.length / columns);
  const labelHeight = 34;
  const composites = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(tile.buffer).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111318"/><text x="14" y="23" fill="#f4f5f7" font-family="Arial,sans-serif" font-size="16" font-weight="700">${tile.label}</text></svg>`);
    composites.push({input: image, left, top: top + labelHeight}, {input: label, left, top});
  }
  return sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111318"}}).composite(composites).jpeg({quality: 92}).toBuffer();
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`deterministic-layer-pilot-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen" || current.production.generation.automaticDispatchAllowed !== false) throw new Error("deterministic-layer-pilot-frozen-runtime-required");
  if (current.production.shotIntelligence.approvedMasterLayerCanaryAudit?.status !== "FAIL_METHOD_INVALID") throw new Error("deterministic-layer-pilot-failed-canary-authority-required");
  const restorePlan = current.production.shotIntelligence.originalPresenterPixelRestorePlan;
  const files = {};
  const items = [];
  for (const shotId of targetShotIds) {
    const plan = current.production.shotIntelligence.packageAssetKitPlans.find((entry) => entry.shotId === shotId && entry.current === true && entry.authorityScope === "CURRENT");
    if (!plan?.selectedLookMasterBinding?.artifactPublicUrl || !selectors[shotId]) throw new Error(`deterministic-layer-pilot-plan-missing:${shotId}`);
    const masterFile = publicFile(plan.selectedLookMasterBinding.artifactPublicUrl);
    if (!fs.existsSync(masterFile) || fileSha256(masterFile) !== plan.selectedLookMasterBinding.artifactSha256) throw new Error(`deterministic-layer-pilot-master-sha-invalid:${shotId}`);
    const masterBuffer = fs.readFileSync(masterFile);
    const decoded = await sharp(masterBuffer).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const {width, height} = decoded.info;
    if (width <= 0 || height <= 0) throw new Error(`deterministic-layer-pilot-master-dimensions-invalid:${shotId}:${width}x${height}`);
    const activeKinds = plan.layers.filter((layer) => layer.route !== "NONE").map((layer) => layer.kind);
    let masks = Object.fromEntries(activeKinds.map((kind) => [kind, new Uint8Array(width * height)]));
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const r = decoded.data[offset];
      const g = decoded.data[offset + 1];
      const b = decoded.data[offset + 2];
      const actualX = pixel % width;
      const actualY = Math.floor(pixel / width);
      const point = selectorPoint(actualX, actualY, width, height);
      const selected = selectors[shotId]({...point, r, g, b, luminance: (r + g + b) / 3, chroma: Math.max(r, g, b) - Math.min(r, g, b)});
      const kind = masks[selected] ? selected : activeKinds.includes("BACKGROUND") ? "BACKGROUND" : activeKinds.find((entry) => entry !== "TYPOGRAPHY") || activeKinds[0];
      masks[kind][pixel] = 255;
    }
    const priority = ["TYPOGRAPHY", "ILLUSTRATION", "ELEMENT_KIT"].filter((kind) => activeKinds.includes(kind));
    const maskScale = Math.max(width / selectorCanvas.width, height / selectorCanvas.height);
    const dilated = Object.fromEntries(priority.map((kind) => [kind, dilateMask(masks[kind], width, height, Math.max(1, Math.round((kind === "TYPOGRAPHY" ? 3 : 2) * maskScale)))]));
    const repartitioned = Object.fromEntries(activeKinds.map((kind) => [kind, new Uint8Array(width * height)]));
    const scenePlateKind = activeKinds.includes("BACKGROUND") ? "BACKGROUND" : activeKinds.find((kind) => kind !== "TYPOGRAPHY") || activeKinds[0];
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const selected = priority.find((kind) => dilated[kind][pixel] > 0) || scenePlateKind;
      repartitioned[selected][pixel] = 255;
    }
    masks = repartitioned;
    const actorKinds = activeKinds.filter((kind) => kind !== "BACKGROUND");
    const actorUnion = new Uint8Array(width * height);
    for (const kind of actorKinds) for (let pixel = 0; pixel < actorUnion.length; pixel += 1) actorUnion[pixel] = Math.max(actorUnion[pixel], masks[kind][pixel]);
    const layerBuffers = {};
    for (const kind of actorKinds) layerBuffers[kind] = await sharp(rgbaLayer(decoded.data, masks[kind], width, height), {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
    if (activeKinds.includes("BACKGROUND")) layerBuffers.BACKGROUND = await makeOpaqueBackground({shotId, masterPixels: decoded.data, actorUnion, width, height});
    else {
      const presenterScenePlateKind = activeKinds.find((kind) => kind !== "TYPOGRAPHY");
      layerBuffers[presenterScenePlateKind] = await makeOpaqueBackground({shotId, masterPixels: decoded.data, actorUnion: masks.TYPOGRAPHY || new Uint8Array(width * height), width, height});
    }
    const compositeInputs = layerOrder.filter((kind) => layerBuffers[kind] && kind !== "BACKGROUND").map((kind) => ({input: layerBuffers[kind], left: 0, top: 0}));
    const baseLayer = layerBuffers.BACKGROUND || layerBuffers[activeKinds.find((kind) => kind !== "TYPOGRAPHY")];
    const recomposed = await sharp(baseLayer).composite(compositeInputs.filter((entry) => entry.input !== baseLayer)).png({compressionLevel: 9}).toBuffer();
    const recomposedPixels = await rawRgba(recomposed, width, height);
    const parity = compareExact(recomposedPixels, decoded.data);
    if (parity.exactPixelRatio !== 1 || parity.meanAbsoluteRgbDifference !== 0) throw new Error(`deterministic-layer-pilot-master-parity-failed:${shotId}:${parity.exactPixelRatio}`);
    let finalComposite = recomposed;
    let presenterAudit = null;
    const restore = restorePlan?.items?.find((entry) => entry.shotId === shotId);
    if (restore) {
      const cutoutOrder = ["presenter", "microphone", "boom"];
      const cutoutFiles = cutoutOrder.map((kind) => publicFile(restore.cutouts[kind].publicUrl));
      for (let index = 0; index < cutoutFiles.length; index += 1) if (!fs.existsSync(cutoutFiles[index]) || fileSha256(cutoutFiles[index]) !== restore.cutouts[cutoutOrder[index]].sha256) throw new Error(`deterministic-layer-pilot-cutout-sha-invalid:${shotId}:${cutoutOrder[index]}`);
      const cutoutBuffers = await Promise.all(cutoutFiles.map((file) => sharp(file).resize(width, height, {fit: "fill"}).png({compressionLevel: 9}).toBuffer()));
      finalComposite = await sharp(recomposed).composite(cutoutBuffers.map((input) => ({input, left: 0, top: 0}))).png({compressionLevel: 9}).toBuffer();
      const [finalPixels, basePixels, presenterMask, faceMask, eyesMask, mouthMask, microphoneMask, boomMask] = await Promise.all([
        rawRgba(finalComposite, width, height),
        rawRgba(fs.readFileSync(publicFile(restore.baseFrame.publicUrl)), width, height),
        loadGrayMask(publicFile(restore.masks.presenter.publicUrl), width, height),
        loadGrayMask(publicFile(restore.masks.face.publicUrl), width, height),
        loadGrayMask(publicFile(restore.masks.eyes.publicUrl), width, height),
        loadGrayMask(publicFile(restore.masks.mouth.publicUrl), width, height),
        loadGrayMask(publicFile(restore.masks.microphone.publicUrl), width, height),
        loadGrayMask(publicFile(restore.masks.boom.publicUrl), width, height),
      ]);
      presenterAudit = protectedPixelAudit({finalPixels, basePixels, presenterMask, faceMask, eyesMask, mouthMask, microphoneMask, boomMask});
      if (presenterAudit.status !== "PASS") throw new Error(`deterministic-layer-pilot-presenter-restore-failed:${shotId}:${JSON.stringify(presenterAudit)}`);
    }
    const prefix = `approved-master-layer-reconstruction-v1/deterministic-pilot/${shotId}`;
    const layerRecords = [];
    for (const kind of activeKinds) {
      const buffer = layerBuffers[kind];
      const relative = `${prefix}/${kind.toLowerCase()}.png`;
      const maskBuffer = await sharp(masks[kind], {raw: {width, height, channels: 1}}).png({compressionLevel: 9}).toBuffer();
      const maskRelative = `${prefix}/${kind.toLowerCase()}-mask.png`;
      files[relative] = buffer;
      files[maskRelative] = maskBuffer;
      const stats = boundsFromMask(masks[kind], width, height);
      layerRecords.push({kind, status: "TECHNICAL_PIXEL_PARTITION_PASS", publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relative}`, sha256: sha256(buffer), maskPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${maskRelative}`, maskSha256: sha256(maskBuffer), width, height, ...stats, visiblePixelSource: "APPROVED_LOOK_MASTER_EXACT_RGB", extractionMethod: "DETERMINISTIC_DISJOINT_MASTER_PIXEL_MASK_PARTITION", visualApprovalStatus: "PENDING_ACTUAL_PIXEL_REVIEW"});
    }
    const recomposeRelative = `${prefix}/recomposed-master.png`;
    const finalRelative = `${prefix}/final-composite.png`;
    files[recomposeRelative] = recomposed;
    files[finalRelative] = finalComposite;
    const contact = await contactSheet({tiles: [
      {label: "APPROVED MASTER", buffer: masterBuffer},
      ...layerOrder.filter((kind) => layerBuffers[kind]).map((kind) => ({label: kind, buffer: layerBuffers[kind]})),
      {label: "RECOMPOSED / FINAL", buffer: finalComposite},
    ], width, height});
    const contactRelative = `${prefix}/contact-sheet.jpg`;
    files[contactRelative] = contact;
    items.push({
      shotId,
      status: "TECHNICAL_LAYER_PARITY_PASS_PENDING_VISUAL_REVIEW",
      selectedLookMaster: {publicUrl: plan.selectedLookMasterBinding.artifactPublicUrl, sha256: plan.selectedLookMasterBinding.artifactSha256},
      method: "DETERMINISTIC_MASTER_PIXEL_MASK_PARTITION",
      layers: layerRecords,
      recomposedMaster: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${recomposeRelative}`, sha256: sha256(recomposed)},
      finalComposite: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${finalRelative}`, sha256: sha256(finalComposite)},
      contactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactRelative}`, sha256: sha256(contact)},
      holdFrameParity: {status: "PASS", ...parity},
      originalPresenterPixelRestore: restore ? {...presenterAudit, restorePlanSha256: restorePlan.planSha256} : {status: "NOT_APPLICABLE"},
      visualApprovalStatus: "PENDING_ACTUAL_PIXEL_REVIEW",
    });
  }
  const now = new Date().toISOString();
  const body = {
    contract: "A1DeterministicApprovedMasterLayerPilot/v1",
    status: "TECHNICAL_LAYER_PARITY_PASS_PENDING_VISUAL_REVIEW",
    sourceBoardSha256: current.production.shotIntelligence.wholeFilmStaticBoard.sha256,
    canaryAuditSha256: current.production.shotIntelligence.approvedMasterLayerCanaryAudit.auditSha256,
    replacementMethod: "DETERMINISTIC_MASTER_PIXEL_MASK_PARTITION_WITH_ORIGINAL_PRESENTER_RESTORE",
    imagegenRole: "FULL_LOOK_MASTER_ONLY_AND_EXPLICIT_MASK_BOUND_HOLE_REPAIR",
    itemCount: items.length,
    passCount: items.filter((item) => item.holdFrameParity.status === "PASS" && item.originalPresenterPixelRestore.status !== "FAIL").length,
    items,
    visualReviewRequired: true,
    motionExpansionAllowed: false,
    wholeFilmExpansionAllowed: false,
    generationCount: 0,
    workerStatus: "frozen",
    generatedAt: now,
  };
  const manifest = {...body, manifestSha256: sha256({...body, generatedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.deterministicLayerReconstructionPilot = manifest;
  next.production.shotIntelligence.approvedMasterLayerPilot = {...next.production.shotIntelligence.approvedMasterLayerPilot, status: "DETERMINISTIC_LAYER_PARITY_BUILT_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW", deterministicPilotManifestSha256: manifest.manifestSha256, wholeFilmExpansionAllowed: false, replacementMethod: manifest.replacementMethod};
  for (const restore of next.production.shotIntelligence.originalPresenterPixelRestorePlan?.items || []) {
    const item = items.find((entry) => entry.shotId === restore.shotId);
    if (!item) continue;
    restore.finalCompositeStatus = item.originalPresenterPixelRestore.status === "PASS" ? "ORIGINAL_PRESENTER_PIXEL_RESTORE_PASS_PENDING_VISUAL_REVIEW" : "BLOCKED";
    restore.finalComposite = structuredClone(item.finalComposite);
    restore.finalCompositeAudit = structuredClone(item.originalPresenterPixelRestore);
  }
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "build-deterministic-approved-master-layer-pilot", targetId: targetShotIds.join(","), payload: {manifestSha256: manifest.manifestSha256, itemCount: items.length, generationCount: 0, workerStatus: "frozen"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `deterministic-layer-pilot-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/deterministic-pilot/manifest.json": manifest}, binaryFiles: files});
  return {status: manifest.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, manifestSha256: manifest.manifestSha256, itemCount: items.length, shotIds: items.map((item) => item.shotId), holdFrameParity: Object.fromEntries(items.map((item) => [item.shotId, item.holdFrameParity])), presenterRestore: Object.fromEntries(items.map((item) => [item.shotId, item.originalPresenterPixelRestore.status])), workerStatus: next.production.generation.workerStatus, generationCount: 0};
});

console.log(JSON.stringify(result, null, 2));
