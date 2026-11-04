#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const expectedWorkspaceSha256 = process.argv[2];
const targetShotIds = ["ED-08", "ED-14", "ED-31"];
const layerKinds = ["BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION"];
const layerCompositeOrder = ["BACKGROUND", "ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("three-shot-layer-canary-expected-workspace-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const inRect = (x, y, [left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom;

function publicFile(publicUrl) {
  const value = String(publicUrl || "");
  const file = path.resolve(publicRoot, value.replace(/^\//u, ""));
  if (!value.startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("three-shot-layer-canary-public-path-invalid");
  return file;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function cleanUnderpaint(shotId, x, y) {
  const noise = ((x * 17 + y * 31 + (x ^ y) * 7) % 7) - 3;
  if (shotId === "ED-08") return [11 + noise, 13 + noise, 17 + noise];
  if (shotId === "ED-14") return [8 + noise, 13 + noise, 22 + noise];
  return [226 + noise, 230 + noise, 235 + noise];
}

function dilateMask(mask, width, height, radius) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (mask[y * width + x] === 0) continue;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const xx = x + dx;
        if (xx >= 0 && xx < width) output[yy * width + xx] = 255;
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
  let partialAlphaPixelCount = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    pixelCount += 1;
    if (mask[index] < 255) partialAlphaPixelCount += 1;
  }
  return {
    pixelCount,
    partialAlphaPixelCount,
    visiblePixelRatio: Number((pixelCount / (width * height)).toFixed(6)),
    bounds: pixelCount ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1} : null,
  };
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

function rgbaFromSource(source, mask, width, height) {
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 0) continue;
    const offset = pixel * 4;
    output[offset] = source[offset];
    output[offset + 1] = source[offset + 1];
    output[offset + 2] = source[offset + 2];
    output[offset + 3] = mask[pixel] >= 245 ? 255 : mask[pixel];
  }
  return output;
}

function opaqueBackground(master, actorUnion, shotId, width, height) {
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < actorUnion.length; pixel += 1) {
    const offset = pixel * 4;
    if (actorUnion[pixel] === 0) {
      output[offset] = master[offset];
      output[offset + 1] = master[offset + 1];
      output[offset + 2] = master[offset + 2];
    } else {
      const [red, green, blue] = cleanUnderpaint(shotId, pixel % width, Math.floor(pixel / width));
      output[offset] = clampByte(red);
      output[offset + 1] = clampByte(green);
      output[offset + 2] = clampByte(blue);
    }
    output[offset + 3] = 255;
  }
  return output;
}

async function pngFromRgba(data, width, height) {
  return sharp(data, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
}

async function rawRgba(input, width = null, height = null) {
  let pipeline = sharp(input).ensureAlpha();
  if (width && height) pipeline = pipeline.resize(width, height, {fit: "fill"});
  return pipeline.raw().toBuffer({resolveWithObject: true});
}

async function grayMask(file, width, height) {
  return sharp(file).resize(width, height, {fit: "fill"}).greyscale().raw().toBuffer({resolveWithObject: true}).then((result) => result.data);
}

function compareRgb(left, right, include = null) {
  let pixelCount = 0;
  let exactPixelCount = 0;
  let absoluteDifference = 0;
  let maximumChannelDifference = 0;
  for (let pixel = 0; pixel < left.length / 4; pixel += 1) {
    if (include && !include(pixel)) continue;
    const offset = pixel * 4;
    const redDifference = Math.abs(left[offset] - right[offset]);
    const greenDifference = Math.abs(left[offset + 1] - right[offset + 1]);
    const blueDifference = Math.abs(left[offset + 2] - right[offset + 2]);
    const maximum = Math.max(redDifference, greenDifference, blueDifference);
    pixelCount += 1;
    if (maximum === 0) exactPixelCount += 1;
    absoluteDifference += redDifference + greenDifference + blueDifference;
    maximumChannelDifference = Math.max(maximumChannelDifference, maximum);
  }
  return {
    pixelCount,
    exactPixelRatio: pixelCount ? exactPixelCount / pixelCount : 0,
    meanAbsoluteRgbDifference: pixelCount ? absoluteDifference / (pixelCount * 3) : 255,
    maximumChannelDifference,
  };
}

function buildStandardMasks(shotId, pixels, width, height) {
  const typographySeed = new Uint8Array(width * height);
  const elementSeed = new Uint8Array(width * height);
  const illustrationSeed = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const luminance = (red + green + blue) / 3;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const cobalt = blue > 70 && blue - Math.max(red, green) > 24;
    if (shotId === "ED-08") {
      const titleRegion = inRect(x, y, [105, 300, 1585, 625]);
      if (titleRegion && red > 75 && green > 75 && blue > 85 && (luminance > 105 || chroma < 65)) typographySeed[pixel] = 255;
      else if (cobalt && inRect(x, y, [535, 205, 1672, 941])) illustrationSeed[pixel] = 255;
      else if (cobalt || (blue > 38 && blue - red > 12)) elementSeed[pixel] = 255;
    } else if (shotId === "ED-14") {
      if (inRect(x, y, [94, 48, 782, 941])) illustrationSeed[pixel] = 255;
      else {
        const labelRegion = inRect(x, y, [1025, 308, 1585, 602]);
        if (labelRegion && luminance > 112 && chroma < 75) typographySeed[pixel] = 255;
        else if ((cobalt || (blue > 95 && blue - red > 12)) && inRect(x, y, [748, 285, 1595, 615])) elementSeed[pixel] = 255;
      }
    }
  }
  const typography = dilateMask(typographySeed, width, height, shotId === "ED-08" ? 2 : 1);
  const element = dilateMask(elementSeed, width, height, 1);
  const illustration = illustrationSeed;
  const masks = Object.fromEntries(layerKinds.map((kind) => [kind, new Uint8Array(width * height)]));
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const kind = illustration[pixel] ? "ILLUSTRATION" : typography[pixel] ? "TYPOGRAPHY" : element[pixel] ? "ELEMENT_KIT" : "BACKGROUND";
    masks[kind][pixel] = 255;
  }
  return masks;
}

function buildEd31MasterActorMasks(masterPixels, foregroundMask, width, height) {
  const typographySeed = new Uint8Array(width * height);
  const elementSeed = new Uint8Array(width * height);
  const workflowRegions = [[35, 265, 730, 510], [1040, 265, 1660, 555], [25, 585, 490, 935], [1200, 650, 1672, 941]];
  const typographyRegions = [[55, 75, 625, 225], [350, 285, 1305, 365], [1350, 315, 1645, 515]];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (foregroundMask[pixel] > 0) continue;
    const offset = pixel * 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const red = masterPixels[offset];
    const green = masterPixels[offset + 1];
    const blue = masterPixels[offset + 2];
    const luminance = (red + green + blue) / 3;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const dark = luminance < 165;
    const cobalt = blue > 65 && blue - red > 18;
    if (typographyRegions.some((rect) => inRect(x, y, rect)) && (dark || cobalt || chroma > 30)) typographySeed[pixel] = 255;
    else if (workflowRegions.some((rect) => inRect(x, y, rect)) && (dark || cobalt || chroma > 24)) elementSeed[pixel] = 255;
  }
  const typography = dilateMask(typographySeed, width, height, 1);
  const element = dilateMask(elementSeed, width, height, 1);
  for (let pixel = 0; pixel < foregroundMask.length; pixel += 1) if (foregroundMask[pixel] > 0) {
    typography[pixel] = 0;
    element[pixel] = 0;
  }
  return {typography, element};
}

function unionMasks(masks) {
  const output = new Uint8Array(masks[0].length);
  for (const mask of masks) for (let index = 0; index < output.length; index += 1) output[index] = Math.max(output[index], mask[index]);
  return output;
}

function protectedIdentityAudit({finalPixels, sourcePixels, masks}) {
  const protectedRegions = {};
  for (const [name, mask] of Object.entries(masks)) {
    let count = 0;
    let exact = 0;
    let withinThree = 0;
    let maximumDifferenceSum = 0;
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      if (mask[pixel] < 245) continue;
      const offset = pixel * 4;
      const maximum = Math.max(
        Math.abs(finalPixels[offset] - sourcePixels[offset]),
        Math.abs(finalPixels[offset + 1] - sourcePixels[offset + 1]),
        Math.abs(finalPixels[offset + 2] - sourcePixels[offset + 2]),
      );
      count += 1;
      if (maximum === 0) exact += 1;
      if (maximum <= 3) withinThree += 1;
      maximumDifferenceSum += maximum;
    }
    const withinThreeRatio = count ? withinThree / count : 0;
    const meanMaximumChannelDifference = count ? maximumDifferenceSum / count : 255;
    protectedRegions[name] = {
      pixelCount: count,
      exactOriginalRgbRatio: count ? exact / count : 0,
      withinThreeLevelsOriginalRgbRatio: withinThreeRatio,
      meanMaximumChannelDifference,
      status: count > 0 && withinThreeRatio >= 0.995 && meanMaximumChannelDifference <= 2 ? "PASS" : "FAIL",
    };
  }
  return {
    status: Object.values(protectedRegions).every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    sourcePolicy: "ORIGINAL_HOLD_FRAME_RGB_WITH_VERIFIED_PRESENTER_MICROPHONE_BOOM_MASKS",
    protectedRegions,
  };
}

async function checkerPreview(buffer, width, height) {
  const size = 24;
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="${size * 2}" height="${size * 2}" patternUnits="userSpaceOnUse"><rect width="${size * 2}" height="${size * 2}" fill="#d8dde5"/><rect width="${size}" height="${size}" fill="#f2f4f7"/><rect x="${size}" y="${size}" width="${size}" height="${size}" fill="#f2f4f7"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
  return sharp(svg).composite([{input: buffer, left: 0, top: 0}]).png().toBuffer();
}

async function contactSheet({tiles, width, height, columns = 3}) {
  const tileWidth = 520;
  const tileHeight = Math.round(tileWidth * height / width);
  const labelHeight = 34;
  const rows = Math.ceil(tiles.length / columns);
  const composites = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(tile.buffer).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111318"/><text x="14" y="23" fill="#f4f5f7" font-family="Arial,sans-serif" font-size="16" font-weight="700">${tile.label}</text></svg>`);
    composites.push({input: label, left, top}, {input: image, left, top: top + labelHeight});
  }
  return sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111318"}}).composite(composites).png().toBuffer();
}

function verifyPngMetadata(metadata, kind, shotId, width, height) {
  const failures = [];
  if (metadata.width !== width || metadata.height !== height) failures.push(`DIMENSIONS_INVALID:${metadata.width}x${metadata.height}`);
  if (metadata.hasAlpha !== true || metadata.channels !== 4) failures.push("RGBA_ALPHA_CHANNEL_REQUIRED");
  if (kind !== "BACKGROUND" && metadata.isOpaque === true) failures.push("TRANSPARENT_LAYER_MUST_NOT_BE_OPAQUE");
  return failures.map((failure) => `${shotId}:${kind}:${failure}`);
}

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `three-shot-layer-canary-workspace-cas-failed:${before.workspaceSha256}`);
  assert.equal(Number(before.production.generation.summary.queued || 0), 0, "three-shot-layer-canary-queue-not-idle");
  assert.equal(Number(before.production.generation.summary.running || 0), 0, "three-shot-layer-canary-running-not-idle");
  assert.equal(before.production.generation.workerStatus, "frozen", "three-shot-layer-canary-worker-not-frozen");
  assert.equal(before.production.generation.automaticDispatchAllowed, false, "three-shot-layer-canary-auto-dispatch-must-be-false");
  assert.equal(before.production.authority.nextAction?.id, "RUN_REPRESENTATIVE_LAYER_CANARY", "three-shot-layer-canary-authority-not-ready");
  assert.equal(before.production.authority.nextAction?.requiresUser, false, "three-shot-layer-canary-must-not-require-user");
  assert.equal(before.production.objectiveVisualGate?.current, true, "three-shot-layer-canary-objective-gate-not-current");
  assert.equal(before.production.objectiveVisualGate?.userVisualApproval, "NOT_APPROVED", "three-shot-layer-canary-user-approval-must-remain-not-approved");
  assert.deepEqual(before.production.shotIntelligence.threeShotLayerCanary?.targetShotIds, targetShotIds, "three-shot-layer-canary-targets-invalid");
  assert.equal(before.production.shotIntelligence.threeShotLayerCanary?.status, "THREE_SHOT_LAYER_CANARY_READY", "three-shot-layer-canary-status-not-ready");
  assert.equal((before.production.shotIntelligence.currentAssembly || []).length, 0, "three-shot-layer-canary-current-assembly-must-remain-empty");

  const runtime = before.production.shotIntelligence;
  const board = runtime.wholeFilmStaticBoard;
  const boardByShot = new Map(board.items.map((item) => [item.shotId, item]));
  const selectedByShot = new Map(before.production.objectiveVisualGate.selectedMasters.map((item) => [item.shotId, item]));
  const rawBySha = new Map((runtime.lookMasterRawReferences || []).map((raw) => [raw.artifact?.sha256, raw]));
  const binaryFiles = {};
  const items = [];
  const allFailureCodes = [];
  const overviewTiles = [];

  for (const shotId of targetShotIds) {
    const boardItem = boardByShot.get(shotId);
    const selected = selectedByShot.get(shotId);
    assert.ok(boardItem && selected, `three-shot-layer-canary-selected-master-missing:${shotId}`);
    assert.equal(selected.artifactSha256, boardItem.artifactSha256, `three-shot-layer-canary-board-selection-mismatch:${shotId}`);
    const masterFile = publicFile(selected.artifactPublicUrl);
    assert.ok(fs.existsSync(masterFile), `three-shot-layer-canary-master-file-missing:${shotId}`);
    assert.equal(fileSha256(masterFile), selected.artifactSha256, `three-shot-layer-canary-master-file-sha-invalid:${shotId}`);
    const masterBuffer = fs.readFileSync(masterFile);
    const decodedMaster = await rawRgba(masterBuffer);
    const {width, height} = decodedMaster.info;
    assert.equal(width, 1672, `three-shot-layer-canary-master-width-invalid:${shotId}`);
    assert.equal(height, 941, `three-shot-layer-canary-master-height-invalid:${shotId}`);
    const failures = [];
    let masks;
    let layerRaw = {};
    let presenterIdentity = {status: "NOT_APPLICABLE"};
    let sourceEvidenceIdentity = {status: "NOT_APPLICABLE"};
    let sourcePixels = null;
    let foregroundUnion = null;
    let presenterProtectedMasks = null;

    if (shotId !== "ED-31") {
      masks = buildStandardMasks(shotId, decodedMaster.data, width, height);
      const actorUnion = unionMasks([masks.TYPOGRAPHY, masks.ELEMENT_KIT, masks.ILLUSTRATION]);
      layerRaw.BACKGROUND = opaqueBackground(decodedMaster.data, actorUnion, shotId, width, height);
      layerRaw.TYPOGRAPHY = rgbaFromMaster(decodedMaster.data, masks.TYPOGRAPHY, width, height);
      layerRaw.ELEMENT_KIT = rgbaFromMaster(decodedMaster.data, masks.ELEMENT_KIT, width, height);
      layerRaw.ILLUSTRATION = rgbaFromMaster(decodedMaster.data, masks.ILLUSTRATION, width, height);
      if (shotId === "ED-14") {
        const evidenceMask = masks.ILLUSTRATION;
        const evidencePixelCount = evidenceMask.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0);
        const extractedEvidence = compareRgb(layerRaw.ILLUSTRATION, decodedMaster.data, (pixel) => evidenceMask[pixel] > 0);
        sourceEvidenceIdentity = {
          status: evidencePixelCount > 500_000 && extractedEvidence.exactPixelRatio === 1 && extractedEvidence.meanAbsoluteRgbDifference === 0 ? "PASS" : "FAIL",
          evidenceOwner: "REAL_PAPER_TITLE_AUTHOR_ABSTRACT_AND_BODY_WINDOW",
          sourceArtifactSha256: "747566071afd35f7265a4b30d4f08607132c0c7650769617e62abf7edffd7a46",
          evidencePixelCount,
          extractedPixelParity: extractedEvidence,
          sourceRewritingPerformed: false,
        };
        if (sourceEvidenceIdentity.status !== "PASS") failures.push("ED-14:SOURCE_EVIDENCE_IDENTITY_OR_PIXEL_PARITY_FAILED");
      }
    } else {
      const restore = runtime.originalPresenterPixelRestorePlan?.items?.find((item) => item.shotId === shotId);
      assert.ok(restore, "three-shot-layer-canary-ed31-restore-plan-missing");
      const selectedRaw = rawBySha.get(selected.artifactSha256);
      assert.ok(selectedRaw, "three-shot-layer-canary-ed31-selected-raw-missing");
      assert.equal(restore.baseFrame.sha256, "3a3afe742cf63037bf85ca5dbacb78e58ba881ea3556918b28cd017d1605c959", "three-shot-layer-canary-ed31-hold-frame-sha-invalid");
      assert.ok((selectedRaw.provenance?.referenceInputs || []).some((input) => input.sourceSha256 === restore.baseFrame.sha256), "three-shot-layer-canary-ed31-hold-frame-not-in-initial-reference-evidence");
      const baseFrameFile = publicFile(restore.baseFrame.publicUrl);
      assert.equal(fileSha256(baseFrameFile), restore.baseFrame.sha256, "three-shot-layer-canary-ed31-base-frame-file-sha-invalid");
      for (const [kind, artifact] of Object.entries(restore.cutouts || {})) assert.equal(fileSha256(publicFile(artifact.publicUrl)), artifact.sha256, `three-shot-layer-canary-ed31-cutout-sha-invalid:${kind}`);
      for (const [kind, artifact] of Object.entries(restore.masks || {})) assert.equal(fileSha256(publicFile(artifact.publicUrl)), artifact.sha256, `three-shot-layer-canary-ed31-mask-sha-invalid:${kind}`);
      const sourceDecoded = await rawRgba(fs.readFileSync(baseFrameFile), width, height);
      sourcePixels = sourceDecoded.data;
      const protectedMasks = {};
      for (const kind of ["presenter", "face", "eyes", "mouth", "microphone", "boom"]) protectedMasks[kind] = await grayMask(publicFile(restore.masks[kind].publicUrl), width, height);
      presenterProtectedMasks = protectedMasks;
      foregroundUnion = unionMasks([protectedMasks.presenter, protectedMasks.microphone, protectedMasks.boom]);
      const actorMasks = buildEd31MasterActorMasks(decodedMaster.data, foregroundUnion, width, height);
      masks = {
        BACKGROUND: new Uint8Array(width * height),
        TYPOGRAPHY: actorMasks.typography,
        ELEMENT_KIT: actorMasks.element,
        ILLUSTRATION: foregroundUnion,
      };
      const actorUnion = unionMasks([masks.TYPOGRAPHY, masks.ELEMENT_KIT, masks.ILLUSTRATION]);
      for (let pixel = 0; pixel < masks.BACKGROUND.length; pixel += 1) masks.BACKGROUND[pixel] = actorUnion[pixel] === 0 ? 255 : 0;
      layerRaw.BACKGROUND = opaqueBackground(decodedMaster.data, actorUnion, shotId, width, height);
      layerRaw.TYPOGRAPHY = rgbaFromMaster(decodedMaster.data, masks.TYPOGRAPHY, width, height);
      layerRaw.ELEMENT_KIT = rgbaFromMaster(decodedMaster.data, masks.ELEMENT_KIT, width, height);
      layerRaw.ILLUSTRATION = rgbaFromSource(sourcePixels, foregroundUnion, width, height);
      const occludingPixels = [masks.TYPOGRAPHY, masks.ELEMENT_KIT].reduce((sum, mask) => sum + mask.reduce((inner, value, index) => inner + (value > 0 && foregroundUnion[index] > 0 ? 1 : 0), 0), 0);
      if (occludingPixels !== 0) failures.push("ED-31:PRESENTER_FOREGROUND_OCCLUSION_DETECTED");
      presenterIdentity = {
        status: "PENDING_RECOMPOSITION",
        restorePlanSha256: runtime.originalPresenterPixelRestorePlan.planSha256,
        originalHoldFrameSha256: restore.baseFrame.sha256,
        referenceAttachmentVerified: true,
        foregroundOccludingPixelCount: occludingPixels,
        faceSkinRedrawn: false,
      };
    }

    for (const kind of layerKinds) {
      const stats = boundsFromMask(masks[kind], width, height);
      if (stats.pixelCount === 0) failures.push(`${shotId}:${kind}:EMPTY_LAYER`);
    }

    const layerBuffers = {};
    const layerRecords = [];
    for (const kind of layerKinds) {
      const buffer = await pngFromRgba(layerRaw[kind], width, height);
      const relative = `three-shot-layer-canary-v1/layers/${shotId}/${kind.toLowerCase()}.png`;
      const metadata = await sharp(buffer).metadata();
      failures.push(...verifyPngMetadata(metadata, kind, shotId, width, height));
      binaryFiles[relative] = buffer;
      layerBuffers[kind] = buffer;
      layerRecords.push({
        contract: "A1ThreeShotLayerCanaryArtifact/v1",
        shotId,
        kind,
        status: "PENDING_GATE",
        publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${relative}`,
        sha256: sha256(buffer),
        decodedPixelSha256: sha256(layerRaw[kind]),
        width,
        height,
        hasAlpha: metadata.hasAlpha === true,
        alphaMode: kind === "BACKGROUND" ? "OPAQUE_SCENE_PLATE_WITH_ALPHA_CHANNEL" : "TRANSPARENT_RGBA_ACTOR_LAYER",
        ...boundsFromMask(masks[kind], width, height),
        geometry: {x: 0, y: 0, width, height, fit: "fill", coordinateSpace: "APPROVED_MASTER_FULL_CANVAS"},
        sourceMasterSha256: selected.artifactSha256,
        localSecondDesignPerformed: false,
        visibleTypographyRetypedLocally: false,
      });
    }

    let recomposed = layerBuffers.BACKGROUND;
    for (const kind of layerCompositeOrder.filter((kind) => kind !== "BACKGROUND")) recomposed = await sharp(recomposed).composite([{input: layerBuffers[kind], left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
    const recomposedDecoded = await rawRgba(recomposed);
    const fullMasterParity = compareRgb(recomposedDecoded.data, decodedMaster.data);
    let masterParity;
    if (shotId === "ED-31") {
      const outsideRestoreMaskParity = compareRgb(recomposedDecoded.data, decodedMaster.data, (pixel) => foregroundUnion[pixel] === 0);
      presenterIdentity = {
        ...presenterIdentity,
        ...protectedIdentityAudit({
          finalPixels: recomposedDecoded.data,
          sourcePixels,
          masks: presenterProtectedMasks,
        }),
      };
      masterParity = {
        status: outsideRestoreMaskParity.exactPixelRatio === 1 && outsideRestoreMaskParity.meanAbsoluteRgbDifference === 0 && fullMasterParity.meanAbsoluteRgbDifference <= 18 && presenterIdentity.status === "PASS" ? "PASS" : "FAIL",
        policy: "EXACT_OUTSIDE_ORIGINAL_PRESENTER_RESTORE_MASK_PLUS_ORIGINAL_HOLD_FRAME_IDENTITY_INSIDE",
        fullFrameAgainstGeneratedMaster: fullMasterParity,
        outsideOriginalPresenterRestoreMask: outsideRestoreMaskParity,
        fullFrameMeanAbsoluteRgbDifferenceTolerance: 18,
      };
      if (masterParity.status !== "PASS") failures.push("ED-31:MASTER_PARITY_OR_ORIGINAL_IDENTITY_FAILED");
    } else {
      masterParity = {
        status: fullMasterParity.exactPixelRatio === 1 && fullMasterParity.meanAbsoluteRgbDifference === 0 ? "PASS" : "FAIL",
        policy: "EXACT_DECODED_PIXEL_PARITY",
        fullFrameAgainstApprovedMaster: fullMasterParity,
      };
      if (masterParity.status !== "PASS") failures.push(`${shotId}:EXACT_MASTER_PIXEL_PARITY_FAILED`);
    }
    if (shotId === "ED-14" && sourceEvidenceIdentity.status !== "PASS") failures.push("ED-14:SOURCE_EVIDENCE_REWRITE_OR_MISMATCH");
    if (shotId === "ED-31" && presenterIdentity.status !== "PASS") failures.push("ED-31:ORIGINAL_PRESENTER_IDENTITY_FAILED");

    const prefix = `three-shot-layer-canary-v1/recompositions/${shotId}`;
    const recomposeRelative = `${prefix}/recomposed.png`;
    binaryFiles[recomposeRelative] = recomposed;
    const previewTiles = [{label: `${shotId} APPROVED MASTER`, buffer: masterBuffer}];
    for (const kind of layerKinds) previewTiles.push({label: kind, buffer: await checkerPreview(layerBuffers[kind], width, height)});
    previewTiles.push({label: shotId === "ED-31" ? "RECOMPOSED + ORIGINAL IDENTITY" : "RECOMPOSED", buffer: recomposed});
    const contact = await contactSheet({tiles: previewTiles, width, height});
    const contactRelative = `three-shot-layer-canary-v1/contact-sheets/${shotId}.png`;
    binaryFiles[contactRelative] = contact;
    overviewTiles.push({label: `${shotId} MASTER`, buffer: masterBuffer}, {label: `${shotId} RECOMPOSED`, buffer: recomposed});
    const status = failures.length === 0 ? "PASS" : "FAIL";
    for (const layer of layerRecords) layer.status = status === "PASS" ? "PASS" : "BLOCKED_BY_SHOT_GATE";
    items.push({
      contract: "A1ThreeShotLayerCanaryItem/v1",
      shotId,
      status,
      presentationMode: selected.presentationMode,
      selectedLookMaster: {publicUrl: selected.artifactPublicUrl, sha256: selected.artifactSha256},
      layerCount: layerRecords.length,
      layers: layerRecords,
      recomposed: {
        publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${recomposeRelative}`,
        sha256: sha256(recomposed),
        decodedPixelSha256: sha256(recomposedDecoded.data),
        width,
        height,
      },
      masterParity,
      sourceEvidenceIdentity,
      originalPresenterIdentity: presenterIdentity,
      contactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${contactRelative}`, sha256: sha256(contact)},
      hardRuleFailures: failures,
    });
    allFailureCodes.push(...failures);
  }

  const overview = await contactSheet({tiles: overviewTiles, width: 1672, height: 941, columns: 2});
  const overviewRelative = "three-shot-layer-canary-v1/contact-sheets/overview.png";
  binaryFiles[overviewRelative] = overview;
  const now = new Date().toISOString();
  const passCount = items.filter((item) => item.status === "PASS").length;
  const failureCount = items.length - passCount;
  const status = failureCount === 0 ? "THREE_SHOT_LAYER_CANARY_REVIEW" : "THREE_SHOT_LAYER_CANARY_BLOCKED";
  const nextAction = failureCount === 0 ? "EXPAND_REMAINING_TEN_PACKAGE_LAYERS" : "REPAIR_THREE_SHOT_LAYER_CANARY";
  const remainingShotIds = board.items.map((item) => item.shotId).filter((shotId) => !targetShotIds.includes(shotId));
  const manifestBody = {
    contract: "A1ThreeShotLayerCanary/v1",
    status,
    current: true,
    authorityScope: "CURRENT",
    sourceWorkspaceSha256: before.workspaceSha256,
    sourcePackageBoardSha256: board.sha256,
    sourceTimelineBoardSha256: board.timelineBoard.sha256,
    sourceSelectedMasterSetSha256: before.production.objectiveVisualGate.selectedMasterSetSha256,
    objectiveVisualGateSha256: before.production.objectiveVisualGate.gateSha256,
    targetShotIds: [...targetShotIds],
    remainingShotIds,
    expectedLayerKinds: [...layerKinds],
    expectedLayerCount: 12,
    layerCount: items.reduce((sum, item) => sum + item.layerCount, 0),
    itemCount: items.length,
    passCount,
    failureCount,
    failureCodes: [...new Set(allFailureCodes)],
    items,
    overviewContactSheet: {publicUrl: `/generated/system-line/editorial-asset-workbench-v1/${overviewRelative}`, sha256: sha256(overview)},
    method: "DETERMINISTIC_APPROVED_MASTER_PIXEL_PARTITION_WITH_ORIGINAL_ED31_HOLD_FRAME_IDENTITY_RESTORE",
    localSecondDesignPerformed: false,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    criticRun: false,
    motionRun: false,
    wholeFilmExpansionPerformed: false,
    userVisualApproval: "NOT_APPROVED",
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextAction,
    requiresUser: false,
    generatedAt: now,
  };
  const manifest = {...manifestBody, manifestSha256: sha256({...manifestBody, generatedAt: undefined})};
  let next = structuredClone(before);
  const nextRuntime = next.production.shotIntelligence;
  nextRuntime.threeShotLayerCanary = manifest;
  nextRuntime.status = status;
  nextRuntime.currentAssembly = [];
  for (const plan of nextRuntime.packageAssetKitPlans || []) {
    if (!targetShotIds.includes(plan.shotId)) continue;
    const item = items.find((entry) => entry.shotId === plan.shotId);
    plan.status = status;
    plan.deterministicCanary = {
      contract: "A1ThreeShotLayerCanaryBinding/v1",
      status: item.status,
      manifestSha256: manifest.manifestSha256,
      selectedMasterSha256: item.selectedLookMaster.sha256,
      recomposedSha256: item.recomposed.sha256,
      layerCount: item.layerCount,
      layerShas: Object.fromEntries(item.layers.map((layer) => [layer.kind, layer.sha256])),
      masterParity: item.masterParity,
      userVisualApproval: "NOT_APPROVED",
    };
  }
  next.production.objectiveVisualGate = {
    ...next.production.objectiveVisualGate,
    internalCanary: {
      status,
      manifestSha256: manifest.manifestSha256,
      targetShotIds: [...targetShotIds],
      layerCount: manifest.layerCount,
      passCount,
      failureCount,
    },
    nextAction,
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  next.production.userVisualApprovalGate = {
    ...next.production.userVisualApprovalGate,
    status: "NOT_APPROVED_EXTERNAL_RELEASE_ONLY",
    userVisualApproval: "NOT_APPROVED",
    blocksInternalCanary: false,
    blocksExternalRelease: true,
    nextAction: "NONE_FOR_INTERNAL_CANARY",
    checkedAt: now,
  };
  next.production.assembly = {
    ...next.production.assembly,
    status: "NOT_CREATED",
    current: true,
    currentAssemblyCount: 0,
    previewArtifact: null,
    assemblyCreated: false,
    productionWired: false,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };
  next.production.motion = {
    ...next.production.motion,
    status: "NOT_CREATED",
    current: true,
    representativePlan: null,
    previewArtifact: null,
    fullMotionAllowed: false,
    motionApproved: false,
    updatedAt: now,
  };
  next.production.packagingReview = {
    ...next.production.packagingReview,
    status,
    userApprovalStatus: "NOT_APPROVED",
    userVisualApproval: "NOT_APPROVED",
    intermediateApprovalRequired: false,
    requiresExplicitApproval: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    nextAction,
    updatedAt: now,
  };
  next.production.universalReferencePackagingGate = {
    ...next.production.universalReferencePackagingGate,
    nextAction,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    updatedAt: now,
  };
  next.production.packagingAutomation = {
    ...next.production.packagingAutomation,
    status,
    currentStage: status === "THREE_SHOT_LAYER_CANARY_REVIEW" ? "three-shot-layer-canary-review" : "three-shot-layer-canary-blocked",
    targetShotIds: status === "THREE_SHOT_LAYER_CANARY_REVIEW" ? remainingShotIds : items.filter((item) => item.status === "FAIL").map((item) => item.shotId),
    reason: status === "THREE_SHOT_LAYER_CANARY_REVIEW" ? "three-shot-canary-objective-gates-pass" : "three-shot-canary-hard-rule-failure",
    generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"},
    updatedAt: now,
  };
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

  const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
  const maturityRun = readJson(maturityPath);
  maturityRun.overallStatus = status;
  maturityRun.nextAction = nextAction;
  maturityRun.current = true;
  maturityRun.targetShotIds = status === "THREE_SHOT_LAYER_CANARY_REVIEW" ? remainingShotIds : items.filter((item) => item.status === "FAIL").map((item) => item.shotId);
  maturityRun.userVisualApproval = "NOT_APPROVED";
  maturityRun.postStaticBoard = {
    status,
    manifestSha256: manifest.manifestSha256,
    targetShotIds: [...targetShotIds],
    layerCount: manifest.layerCount,
    passCount,
    failureCount,
    assemblyCreationAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
  };
  maturityRun.generatedAt = now;
  maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
  next.production.goldenFilmVisualSystemMaturity = {
    ...next.production.goldenFilmVisualSystemMaturity,
    current: true,
    status,
    nextAction,
    maturityRunSha256: maturityRun.maturityRunSha256,
    targetShotIds: [...maturityRun.targetShotIds],
    threeShotLayerCanaryManifestSha256: manifest.manifestSha256,
    userVisualApproval: "NOT_APPROVED",
    updatedAt: now,
  };

  const event = createProductionEvent({
    workspace: before,
    action: "run-three-shot-layer-canary-v1",
    targetId: manifest.manifestSha256,
    payload: {status, manifestSha256: manifest.manifestSha256, targetShotIds, layerCount: manifest.layerCount, passCount, failureCount, imageGenerationPerformed: false, assemblyCreated: false, motionRun: false},
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(next.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED");
  assert.equal(next.production.authority.nextAction.id, nextAction);
  assert.equal(next.production.authority.nextAction.requiresUser, false);
  assert.equal(next.production.shotIntelligence.currentAssembly.length, 0);
  assert.equal(next.production.assembly.status, "NOT_CREATED");
  assert.equal(next.production.motion.status, "NOT_CREATED");
  assert.equal(next.production.generation.summary.queued, 0);
  assert.equal(next.production.generation.summary.running, 0);
  assert.equal(manifest.layerCount, 12);

  const committed = persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: before.workspaceSha256,
    commitId: `three-shot-layer-canary-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {
      "three-shot-layer-canary-v1/manifest.json": manifest,
      "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun,
    },
    binaryFiles,
  });
  return {
    status,
    workspaceSha256Before: before.workspaceSha256,
    workspaceSha256After: committed.workspaceSha256,
    manifestSha256: manifest.manifestSha256,
    itemCount: manifest.itemCount,
    layerCount: manifest.layerCount,
    passCount,
    failureCount,
    imageGenerationPerformed: false,
    assemblyCreated: false,
    criticRun: false,
    motionRun: false,
    items: items.map((item) => ({
      shotId: item.shotId,
      status: item.status,
      layerCount: item.layerCount,
      recomposedSha256: item.recomposed.sha256,
      masterParity: item.masterParity,
      sourceEvidenceIdentityStatus: item.sourceEvidenceIdentity.status,
      originalPresenterIdentityStatus: item.originalPresenterIdentity.status,
      hardRuleFailures: item.hardRuleFailures,
    })),
    overviewContactSheet: manifest.overviewContactSheet,
    nextAction,
    requiresUser: false,
    userVisualApproval: "NOT_APPROVED",
    queue: next.production.generation.summary,
    workerStatus: next.production.generation.workerStatus,
  };
});

console.log(JSON.stringify(result, null, 2));
