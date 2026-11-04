#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";
import {rgbaLayer} from "../apps/studio-next/src/lib/a1-master-rgba-partition-v1.mjs";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("whole-film-layer-build-valid-workspace-sha-required");

const expansionShotIds = ["ED-07", "ED-09", "ED-10", "ED-12", "ED-13", "ED-17", "ED-19", "ED-33"];
const allPackageShotIds = ["ED-07", "ED-08", "ED-09", "ED-10", "ED-12", "ED-13", "ED-14", "ED-16", "ED-17", "ED-19", "ED-31", "ED-33", "ED-34"];
const layerOrder = ["BACKGROUND", "ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"];
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => path.join(publicRoot, String(url || "").replace(/^\//u, ""));
const inRect = (x, y, [left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom;

const selectors = {
  "ED-07": ({x, y, luminance, chroma}) => {
    if (inRect(x, y, [45, 220, 1080, 735]) && luminance < 150) return "TYPOGRAPHY";
    if (inRect(x, y, [1220, 185, 1672, 735]) && luminance < 180) return "ILLUSTRATION";
    if (inRect(x, y, [960, 90, 1325, 825]) && (luminance < 205 || chroma > 35)) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
  "ED-09": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 115 && b - Math.max(r, g) > 30;
    if (cobalt && (inRect(x, y, [95, 410, 910, 475]) || inRect(x, y, [90, 635, 1130, 865]))) return "ELEMENT_KIT";
    if (inRect(x, y, [90, 245, 900, 665]) && (luminance < 155 || cobalt)) return "TYPOGRAPHY";
    if (inRect(x, y, [95, 600, 1120, 865]) && (luminance < 225 || cobalt || chroma > 28)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-10": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 80 && b - Math.max(r, g) > 18;
    if (inRect(x, y, [260, 210, 1410, 720]) && cobalt) return "TYPOGRAPHY";
    if (cobalt || (inRect(x, y, [150, 30, 1520, 900]) && chroma > 42)) return "ELEMENT_KIT";
    if (x < 360 || x > 1260 || y < 250 || y > 690) {
      if (luminance < 225 || chroma > 25) return "ILLUSTRATION";
    }
    return "BACKGROUND";
  },
  "ED-12": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 105 && b - Math.max(r, g) > 24;
    const nodeRegions = [[445, 135, 520, 215], [730, 240, 805, 320], [805, 360, 880, 440], [860, 485, 935, 565], [910, 620, 985, 705], [615, 750, 705, 835]];
    if (cobalt && nodeRegions.some((rect) => inRect(x, y, rect))) return "ELEMENT_KIT";
    if (cobalt && ((x > 430 && y < 710) || (x > 610 && y >= 710))) return "ILLUSTRATION";
    if (inRect(x, y, [130, 95, 850, 835]) && (luminance < 160 || cobalt)) return "TYPOGRAPHY";
    if (inRect(x, y, [430, 120, 1010, 840]) && (chroma > 35 || luminance < 145)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-13": ({x, y, r, g, b, luminance, chroma}) => {
    if (inRect(x, y, [20, 145, 1080, 440]) || inRect(x, y, [0, 475, 1080, 820])) return "TYPOGRAPHY";
    if (inRect(x, y, [890, 110, 1672, 941]) && (luminance > 75 || chroma > 18)) return "ILLUSTRATION";
    const cobalt = b > 80 && b - Math.max(r, g) > 15;
    if (cobalt || inRect(x, y, [600, 335, 1180, 545]) || (x > 930 && y < 180)) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
  "ED-17": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 105 && b - Math.max(r, g) > 25;
    const actionRegions = [[470, 420, 620, 600], [900, 445, 1050, 625], [880, 585, 1510, 700]];
    if (cobalt && actionRegions.some((rect) => inRect(x, y, rect))) return "ELEMENT_KIT";
    if (inRect(x, y, [175, 365, 1440, 650]) && (luminance < 160 || cobalt)) return "TYPOGRAPHY";
    if ((x < 360 && y > 90 && y < 800) || (x > 1450 && y > 250 && y < 760) || inRect(x, y, [120, 290, 1500, 720])) {
      if (luminance < 220 || chroma > 20) return "ILLUSTRATION";
    }
    if (cobalt || chroma > 38) return "ELEMENT_KIT";
    return "BACKGROUND";
  },
  "ED-19": ({x, y, r, g, b, luminance, chroma}) => {
    const magenta = r > 145 && r - Math.max(g, b) > 35;
    const typeRegions = [[55, 335, 410, 630], [500, 335, 790, 630], [890, 335, 1230, 630], [1300, 320, 1605, 650]];
    const chevronRegions = [[410, 360, 490, 590], [800, 360, 885, 590], [1230, 360, 1310, 590], [1580, 320, 1655, 650]];
    if (chevronRegions.some((rect) => inRect(x, y, rect)) && (luminance > 120 || magenta || chroma > 30)) return "ELEMENT_KIT";
    if (typeRegions.some((rect) => inRect(x, y, rect)) && (luminance > 145 || magenta)) return "TYPOGRAPHY";
    if (inRect(x, y, [300, 210, 1470, 760]) && (luminance > 45 || chroma > 18)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
  "ED-33": ({x, y, r, g, b, luminance, chroma}) => {
    const cobalt = b > 90 && b - Math.max(r, g) > 18;
    if (inRect(x, y, [45, 300, 1050, 705]) && (luminance < 215 || cobalt)) return "TYPOGRAPHY";
    if (cobalt || (x > 1110 && y > 350 && y < 830 && luminance < 190)) return "ELEMENT_KIT";
    if ((x > 690 || y < 260 || y > 700) && (luminance < 235 || chroma > 22)) return "ILLUSTRATION";
    return "BACKGROUND";
  },
};

// Shared compiler; legacy execution guards remain unchanged.
function dilateMask(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
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

function boundsFromMask(mask, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixelCount = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    pixelCount += 1;
  }
  return {pixelCount, ratio: pixelCount / (width * height), bounds: pixelCount ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1} : null};
}

async function rawRgba(buffer, width, height) {
  return sharp(buffer).resize(width, height, {fit: "fill"}).ensureAlpha().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
}

function compareExact(left, right) {
  let exact = 0;
  let difference = 0;
  const pixels = left.length / 4;
  for (let offset = 0; offset < left.length; offset += 4) {
    if (left[offset] === right[offset] && left[offset + 1] === right[offset + 1] && left[offset + 2] === right[offset + 2]) exact += 1;
    difference += Math.abs(left[offset] - right[offset]) + Math.abs(left[offset + 1] - right[offset + 1]) + Math.abs(left[offset + 2] - right[offset + 2]);
  }
  return {exactPixelRatio: exact / pixels, meanAbsoluteRgbDifference: difference / (pixels * 3)};
}

async function opaqueBackground(masterBuffer, masterPixels, actorUnion, width, height) {
  const blurred = await sharp(masterBuffer).blur(28).ensureAlpha().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
  const output = Buffer.alloc(masterPixels.length);
  for (let pixel = 0; pixel < actorUnion.length; pixel += 1) {
    const offset = pixel * 4;
    const source = actorUnion[pixel] ? blurred : masterPixels;
    output[offset] = source[offset];
    output[offset + 1] = source[offset + 1];
    output[offset + 2] = source[offset + 2];
    output[offset + 3] = 255;
  }
  return sharp(output, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
}

async function contactSheet(tiles, width, height, columns = 3, tileWidth = 510) {
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
  return sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111318"}}).composite(inputs).jpeg({quality: 93}).toBuffer();
}

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`whole-film-layer-build-workspace-cas-failed:${current.workspaceSha256}`);
  if (current.production.generation.workerStatus !== "frozen" || current.production.generation.summary.running !== 0 || current.production.generation.automaticDispatchAllowed !== false) throw new Error("whole-film-layer-build-frozen-runtime-required");
  if (current.production.shotIntelligence.approvedMasterLayerCanaryAudit?.status !== "FAIL_METHOD_INVALID") throw new Error("whole-film-layer-build-failed-imagegen-canary-required");
  const representative = current.production.shotIntelligence.deterministicLayerReconstructionPilot;
  if (representative?.status !== "FULL_LOOK_MASTER_LAYER_ACTUAL_PIXEL_PASS" || representative.items?.length !== 5) throw new Error("whole-film-layer-build-representative-visual-pass-required");
  const ed13Restore = current.production.shotIntelligence.originalPresenterPixelRestorePlan?.items?.find((item) => item.shotId === "ED-13");
  if (ed13Restore?.status !== "ORIGINAL_PRESENTER_PIXEL_RESTORE_ACTUAL_VISUAL_PASS") throw new Error("whole-film-layer-build-ed13-original-presenter-restore-required");

  const binaryFiles = {};
  const items = [];
  const overviewTiles = [];
  for (const shotId of expansionShotIds) {
    const plan = current.production.shotIntelligence.packageAssetKitPlans.find((entry) => entry.shotId === shotId && entry.current === true && entry.authorityScope === "CURRENT");
    if (!plan?.selectedLookMasterBinding?.artifactPublicUrl || !selectors[shotId]) throw new Error(`whole-film-layer-build-plan-missing:${shotId}`);
    const masterFile = publicFile(plan.selectedLookMasterBinding.artifactPublicUrl);
    if (!fs.existsSync(masterFile) || fileSha256(masterFile) !== plan.selectedLookMasterBinding.artifactSha256) throw new Error(`whole-film-layer-build-master-sha-invalid:${shotId}`);
    const masterBuffer = fs.readFileSync(masterFile);
    const decoded = await sharp(masterBuffer).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    const {width, height} = decoded.info;
    if (width !== 1672 || height !== 941) throw new Error(`whole-film-layer-build-dimensions-invalid:${shotId}:${width}x${height}`);
    const activeKinds = plan.layers.filter((layer) => layer.route !== "NONE").map((layer) => layer.kind);
    const masks = Object.fromEntries(activeKinds.map((kind) => [kind, new Uint8Array(width * height)]));
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const offset = pixel * 4;
      const r = decoded.data[offset];
      const g = decoded.data[offset + 1];
      const b = decoded.data[offset + 2];
      const selected = selectors[shotId]({x: pixel % width, y: Math.floor(pixel / width), r, g, b, luminance: (r + g + b) / 3, chroma: Math.max(r, g, b) - Math.min(r, g, b)});
      masks[activeKinds.includes(selected) ? selected : "BACKGROUND"][pixel] = 255;
    }
    if (shotId === "ED-19") {
      const expandedTypography = dilateMask(masks.TYPOGRAPHY, width, height, 4);
      for (let pixel = 0; pixel < expandedTypography.length; pixel += 1) {
        if (!expandedTypography[pixel] || masks.ELEMENT_KIT[pixel]) continue;
        for (const kind of activeKinds) masks[kind][pixel] = 0;
        masks.TYPOGRAPHY[pixel] = 255;
      }
    }
    for (const kind of activeKinds) {
      const stats = boundsFromMask(masks[kind], width, height);
      const minimumRatio = kind === "TYPOGRAPHY" || kind === "BACKGROUND" ? 0.003 : 0.001;
      if (!stats.bounds || stats.ratio < minimumRatio) throw new Error(`whole-film-layer-build-actor-mask-too-small:${shotId}:${kind}:${stats.ratio}`);
    }
    const actorKinds = activeKinds.filter((kind) => kind !== "BACKGROUND");
    const actorUnion = new Uint8Array(width * height);
    for (const kind of actorKinds) for (let pixel = 0; pixel < actorUnion.length; pixel += 1) actorUnion[pixel] = Math.max(actorUnion[pixel], masks[kind][pixel]);
    const layerBuffers = {};
    for (const kind of actorKinds) layerBuffers[kind] = await sharp(rgbaLayer(decoded.data, masks[kind], width, height), {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
    layerBuffers.BACKGROUND = await opaqueBackground(masterBuffer, decoded.data, actorUnion, width, height);
    const recomposed = await sharp(layerBuffers.BACKGROUND).composite(layerOrder.filter((kind) => kind !== "BACKGROUND" && layerBuffers[kind]).map((kind) => ({input: layerBuffers[kind], left: 0, top: 0}))).png({compressionLevel: 9}).toBuffer();
    const parity = compareExact(await rawRgba(recomposed, width, height), decoded.data);
    if (parity.exactPixelRatio !== 1 || parity.meanAbsoluteRgbDifference !== 0) throw new Error(`whole-film-layer-build-parity-failed:${shotId}:${parity.exactPixelRatio}`);
    const prefix = `approved-master-layer-reconstruction-v1/whole-film/${shotId}`;
    const layerRecords = [];
    for (const kind of activeKinds) {
      const layerRelative = `${prefix}/${kind.toLowerCase()}.png`;
      const maskRelative = `${prefix}/${kind.toLowerCase()}-mask.png`;
      const maskBuffer = await sharp(masks[kind], {raw: {width, height, channels: 1}}).png({compressionLevel: 9}).toBuffer();
      binaryFiles[layerRelative] = layerBuffers[kind];
      binaryFiles[maskRelative] = maskBuffer;
      const motionOperationConstraint = shotId === "ED-13" && kind === "ILLUSTRATION" ? "MOTION_DISABLED_REPLACED_BY_ORIGINAL_PRESENTER_PIXEL_COMPOSITE" : "IN_PLACE_CLIP_REVEAL_SCALE_OR_OPACITY_ONLY";
      layerRecords.push({kind, status: "TECHNICAL_PIXEL_PARTITION_PASS", publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${layerRelative}`, sha256: sha256(layerBuffers[kind]), maskPublicUrl: `/generated/system-line/editorial-asset-workbench-v1/${maskRelative}`, maskSha256: sha256(maskBuffer), width, height, ...boundsFromMask(masks[kind], width, height), visiblePixelSource: "APPROVED_LOOK_MASTER_EXACT_RGB", extractionMethod: "DETERMINISTIC_DISJOINT_MASTER_PIXEL_MASK_PARTITION", motionOperationConstraint, visualApprovalStatus: "PENDING_ACTUAL_PIXEL_REVIEW"});
    }
    const recomposedRelative = `${prefix}/recomposed-master.png`;
    binaryFiles[recomposedRelative] = recomposed;
    let finalComposite = recomposed;
    let originalPresenterPixelRestore = {status: "NOT_APPLICABLE"};
    if (shotId === "ED-13") {
      const restoredFile = publicFile(ed13Restore.finalComposite.publicUrl);
      if (!fs.existsSync(restoredFile) || fileSha256(restoredFile) !== ed13Restore.finalComposite.sha256) throw new Error("whole-film-layer-build-ed13-final-composite-sha-invalid");
      finalComposite = fs.readFileSync(restoredFile);
      originalPresenterPixelRestore = {status: "PASS", finalCompositeSha256: ed13Restore.finalComposite.sha256, restorePlanSha256: current.production.shotIntelligence.originalPresenterPixelRestorePlan.planSha256, generatedPresenterLayerPolicy: "EXTRACTED_FOR_MASTER_PARITY_BUT_MOTION_DISABLED_AND_REPLACED_BY_ORIGINAL_PIXEL_COMPOSITE"};
    }
    const finalRelative = `${prefix}/final-composite.png`;
    binaryFiles[finalRelative] = finalComposite;
    const contact = await contactSheet([{label: `${shotId} APPROVED MASTER`, buffer: masterBuffer}, ...layerOrder.map((kind) => ({label: kind, buffer: layerBuffers[kind]})), {label: shotId === "ED-13" ? "FINAL + ORIGINAL PRESENTER" : "RECOMPOSED FINAL", buffer: finalComposite}], width, height);
    const contactRelative = `${prefix}/contact-sheet.jpg`;
    binaryFiles[contactRelative] = contact;
    overviewTiles.push({label: `${shotId} FINAL`, buffer: finalComposite});
    items.push({shotId, status: "TECHNICAL_LAYER_PARITY_PASS_PENDING_ACTUAL_PIXEL_VISUAL_REVIEW", selectedLookMaster: {publicUrl: plan.selectedLookMasterBinding.artifactPublicUrl, sha256: plan.selectedLookMasterBinding.artifactSha256}, method: "DETERMINISTIC_MASTER_PIXEL_MASK_PARTITION", layers: layerRecords, recomposedMaster: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${recomposedRelative}`, sha256: sha256(recomposed)}, finalComposite: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${finalRelative}`, sha256: sha256(finalComposite)}, contactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactRelative}`, sha256: sha256(contact)}, approvedMasterParity: {status: "PASS", ...parity}, originalPresenterPixelRestore, visualApprovalStatus: "PENDING_ACTUAL_PIXEL_REVIEW"});
  }
  const overview = await contactSheet(overviewTiles, 1672, 941, 2, 620);
  const overviewRelative = "approved-master-layer-reconstruction-v1/whole-film/expansion-overview-contact-sheet.jpg";
  binaryFiles[overviewRelative] = overview;
  const representativeItems = representative.items.map((item) => ({...structuredClone(item), source: "REPRESENTATIVE_ACTUAL_PIXEL_VISUAL_PASS"}));
  const combinedItems = allPackageShotIds.map((shotId) => items.find((item) => item.shotId === shotId) || representativeItems.find((item) => item.shotId === shotId));
  if (combinedItems.some((item) => !item)) throw new Error("whole-film-layer-build-combined-item-missing");
  const now = new Date().toISOString();
  const body = {contract: "A1WholeFilmDeterministicApprovedMasterLayerReconstruction/v1", status: "TECHNICAL_PARITY_PASS_PENDING_EXPANSION_ACTUAL_PIXEL_VISUAL_REVIEW", sourceBoardSha256: current.production.shotIntelligence.wholeFilmStaticBoard.sha256, approvalDecisionSha256: current.production.shotIntelligence.wholeFilmStaticBoardDecision.decisionSha256, canaryAuditSha256: current.production.shotIntelligence.approvedMasterLayerCanaryAudit.auditSha256, representativeManifestSha256: representative.manifestSha256, ed13OriginalPresenterRestoreProofSha256: current.production.shotIntelligence.ed13OriginalPresenterRestore.proofSha256, packageCount: combinedItems.length, representativePassCount: representativeItems.length, expansionPendingVisualReviewCount: items.length, itemCount: combinedItems.length, items: combinedItems, expansionOverviewContactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${overviewRelative}`, sha256: sha256(overview)}, replacementMethod: "DETERMINISTIC_MASTER_PIXEL_MASK_PARTITION_WITH_BOUND_ORIGINAL_PRESENTER_RESTORE", motionOperationConstraint: "IN_PLACE_CLIP_REVEAL_SCALE_OR_OPACITY_ONLY", imagegenRole: "FULL_LOOK_MASTER_ONLY_AND_EXPLICIT_MASK_BOUND_HOLE_REPAIR", generationCount: 0, workerStatus: "frozen", motionPlanCompilationAllowed: false, reviewRenderAllowed: false, generatedAt: now};
  const manifest = {...body, manifestSha256: sha256({...body, generatedAt: undefined})};
  let next = structuredClone(current);
  next.production.shotIntelligence.wholeFilmDeterministicLayerReconstruction = manifest;
  next.production.shotIntelligence.approvedMasterLayerPilot = {...next.production.shotIntelligence.approvedMasterLayerPilot, wholeFilmExpansionAllowed: true, wholeFilmExpansionStatus: "TECHNICAL_PARITY_PASS_PENDING_EXPANSION_ACTUAL_PIXEL_VISUAL_REVIEW", wholeFilmManifestSha256: manifest.manifestSha256};
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const event = createProductionEvent({workspace: current, action: "build-whole-film-deterministic-approved-master-layers", targetId: expansionShotIds.join(","), payload: {manifestSha256: manifest.manifestSha256, packageCount: manifest.packageCount, representativePassCount: manifest.representativePassCount, expansionPendingVisualReviewCount: manifest.expansionPendingVisualReviewCount, generationCount: 0, workerStatus: "frozen"}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId: `whole-film-deterministic-layer-build-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`, files: {"approved-master-layer-reconstruction-v1/whole-film/manifest.json": manifest}, binaryFiles});
  return {status: manifest.status, workspaceSha256Before: current.workspaceSha256, workspaceSha256After: committed.workspaceSha256, manifestSha256: manifest.manifestSha256, packageCount: manifest.packageCount, expansionShotIds, overviewContactSheet: manifest.expansionOverviewContactSheet, generationCount: 0, workerStatus: "frozen"};
});

console.log(JSON.stringify(result, null, 2));
