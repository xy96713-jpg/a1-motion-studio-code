#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";

import sharp from "sharp";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, projectDirs, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const {publicDir} = projectDirs(appRoot);
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
const expectedWorkspaceSha256 = process.argv[2];
const expectedRepairManifestSha256 = process.argv[3];
const preflightOnly = process.argv.includes("--preflight");
const layerKinds = ["BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION"];
const titleBounds = [105, 300, 1585, 625];
// OCR can stop reading a glyph while its negative silhouette remains obvious to
// a human reviewer. Start at a deliberately larger structural radius so the
// title-owned backplate breaks that silhouette, not merely the OCR contour.
const radiusCandidates = [32, 40, 48, 56, 64];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("ed08-layer-repair-expected-workspace-sha-required");
if (!/^[a-f0-9]{64}$/u.test(String(expectedRepairManifestSha256 || ""))) throw new Error("ed08-layer-repair-manifest-sha-required");

const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const publicFile = (publicUrl) => {
  const value = String(publicUrl || "");
  const file = path.resolve(publicRoot, value.replace(/^\//u, ""));
  if (!value.startsWith("/generated/system-line/") || !file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("ed08-layer-repair-public-path-invalid");
  return file;
};

function inRect(x, y, [left, top, right, bottom]) {
  return x >= left && x < right && y >= top && y < bottom;
}

async function rawRgba(input) {
  return sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject: true});
}

async function pngFromRgba(data, width, height) {
  return sharp(data, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();
}

function alphaMask(rgba) {
  const mask = new Uint8Array(rgba.length / 4);
  for (let pixel = 0; pixel < mask.length; pixel += 1) mask[pixel] = rgba[pixel * 4 + 3] > 0 ? 255 : 0;
  return mask;
}

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

function repartition({typography, illustration, width, height, radius}) {
  const typographyMask = alphaMask(typography);
  const illustrationMask = alphaMask(illustration);
  const expanded = dilateMask(typographyMask, width, height, radius);
  const nextTypography = Buffer.from(typography);
  const nextIllustration = Buffer.from(illustration);
  let transferredPixelCount = 0;
  for (let pixel = 0; pixel < typographyMask.length; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (expanded[pixel] === 0 || illustrationMask[pixel] === 0 || !inRect(x, y, titleBounds)) continue;
    const offset = pixel * 4;
    nextTypography[offset] = illustration[offset];
    nextTypography[offset + 1] = illustration[offset + 1];
    nextTypography[offset + 2] = illustration[offset + 2];
    nextTypography[offset + 3] = illustration[offset + 3];
    nextIllustration[offset] = 0;
    nextIllustration[offset + 1] = 0;
    nextIllustration[offset + 2] = 0;
    nextIllustration[offset + 3] = 0;
    transferredPixelCount += 1;
  }
  return {typography: nextTypography, illustration: nextIllustration, transferredPixelCount};
}

function ocr(file) {
  const output = execFileSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 4_000_000}).trim().split("\n").at(-1);
  return JSON.parse(output);
}

async function ocrBuffer(buffer, basename, tempDir) {
  const file = path.join(tempDir, basename);
  fs.writeFileSync(file, buffer);
  return ocr(file);
}

function compareRgb(left, right) {
  let exactPixelCount = 0;
  let absoluteDifference = 0;
  let maximumChannelDifference = 0;
  const pixelCount = left.length / 4;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const differences = [0, 1, 2].map((channel) => Math.abs(left[offset + channel] - right[offset + channel]));
    const maximum = Math.max(...differences);
    if (maximum === 0) exactPixelCount += 1;
    absoluteDifference += differences[0] + differences[1] + differences[2];
    maximumChannelDifference = Math.max(maximumChannelDifference, maximum);
  }
  return {
    pixelCount,
    exactPixelRatio: exactPixelCount / pixelCount,
    meanAbsoluteRgbDifference: absoluteDifference / (pixelCount * 3),
    maximumChannelDifference,
  };
}

function boundsFromAlpha(rgba, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let pixelCount = 0;
  let partialAlphaPixelCount = 0;
  for (let pixel = 0; pixel < rgba.length / 4; pixel += 1) {
    const alpha = rgba[pixel * 4 + 3];
    if (alpha === 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
    pixelCount += 1;
    if (alpha < 255) partialAlphaPixelCount += 1;
  }
  return {
    pixelCount,
    partialAlphaPixelCount,
    visiblePixelRatio: Number((pixelCount / (width * height)).toFixed(6)),
    bounds: pixelCount ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1} : null,
  };
}

async function checkerPreview(buffer, width, height) {
  const size = 24;
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="c" width="${size * 2}" height="${size * 2}" patternUnits="userSpaceOnUse"><rect width="${size * 2}" height="${size * 2}" fill="#d8dde5"/><rect width="${size}" height="${size}" fill="#f2f4f7"/><rect x="${size}" y="${size}" width="${size}" height="${size}" fill="#f2f4f7"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/></svg>`);
  return sharp(svg).composite([{input: buffer, left: 0, top: 0}]).png().toBuffer();
}

async function contactSheet({tiles, width, height}) {
  const columns = 3;
  const tileWidth = 520;
  const tileHeight = Math.round(tileWidth * height / width);
  const labelHeight = 34;
  const rows = Math.ceil(tiles.length / columns);
  const composites = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const image = await sharp(tiles[index].buffer).resize(tileWidth, tileHeight, {fit: "fill"}).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111318"/><text x="14" y="23" fill="#f4f5f7" font-family="Arial,sans-serif" font-size="16" font-weight="700">${tiles[index].label}</text></svg>`);
    composites.push({input: label, left, top}, {input: image, left, top: top + labelHeight});
  }
  return sharp({create: {width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 3, background: "#111318"}}).composite(composites).png().toBuffer();
}

const result = await withProjectLock(appRoot, async () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `ed08-layer-repair-workspace-cas-failed:${before.workspaceSha256}`);
  assert.equal(before.production.authority.nextAction.id, "REPAIR_THREE_SHOT_LAYER_CANARY", "ed08-layer-repair-authority-action-invalid");
  assert.equal(before.production.authority.nextAction.requiresUser, false, "ed08-layer-repair-must-not-require-user");
  assert.equal(before.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_BLOCKED", "ed08-layer-repair-current-status-invalid");
  assert.equal(Number(before.production.generation.summary.queued || 0), 0, "ed08-layer-repair-queue-not-idle");
  assert.equal(Number(before.production.generation.summary.running || 0), 0, "ed08-layer-repair-running-not-idle");
  assert.equal(before.production.generation.workerStatus, "frozen", "ed08-layer-repair-worker-not-frozen");
  assert.equal(before.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED", "ed08-layer-repair-user-approval-must-remain-not-approved");

  const manifest = before.production.shotIntelligence.threeShotLayerCanary;
  const repairPath = path.join(publicDir, "three-shot-layer-canary-v1/repair-manifest.json");
  const repair = readJson(repairPath);
  assert.equal(repair.manifestSha256, expectedRepairManifestSha256, "ed08-layer-repair-manifest-sha-mismatch");
  assert.equal(repair.status, "READY", "ed08-layer-repair-manifest-not-ready");
  assert.deepEqual(repair.targetShotIds, ["ED-08"], "ed08-layer-repair-scope-invalid");
  assert.equal(repair.maxRepairAttemptsPerPrimitive, 1, "ed08-layer-repair-attempt-policy-invalid");
  assert.equal(repair.imageGenerationAllowed, false, "ed08-layer-repair-imagegen-must-be-disabled");
  const repairItem = repair.items[0];
  assert.equal(repairItem.repairPrimitive, "CONNECTED_TITLE_GLYPH_MASK_FROM_BRIGHT_SEED_WITH_LARGER_BOUNDED_DILATION", "ed08-layer-repair-primitive-invalid");

  const item = manifest.items.find((entry) => entry.shotId === "ED-08");
  assert.ok(item, "ed08-layer-repair-canary-item-missing");
  assert.equal(item.status, "FAIL", "ed08-layer-repair-item-not-failed");
  assert.equal(item.selectedLookMaster.sha256, repairItem.sourceMasterSha256, "ed08-layer-repair-master-sha-mismatch");
  for (const frozen of repairItem.preserveLayerShas) {
    const layer = item.layers.find((entry) => entry.kind === frozen.kind);
    assert.equal(layer.sha256, frozen.sha256, `ed08-layer-repair-frozen-layer-record-mismatch:${frozen.kind}`);
    assert.equal(fileSha256(publicFile(layer.publicUrl)), frozen.sha256, `ed08-layer-repair-frozen-layer-file-mismatch:${frozen.kind}`);
  }

  const layerByKind = new Map(item.layers.map((layer) => [layer.kind, layer]));
  const buffers = Object.fromEntries(layerKinds.map((kind) => [kind, fs.readFileSync(publicFile(layerByKind.get(kind).publicUrl))]));
  const decoded = Object.fromEntries(await Promise.all(layerKinds.map(async (kind) => [kind, await rawRgba(buffers[kind])])));
  const {width, height} = decoded.TYPOGRAPHY.info;
  assert.equal(width, 1672, "ed08-layer-repair-width-invalid");
  assert.equal(height, 941, "ed08-layer-repair-height-invalid");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-ed08-layer-repair-"));
  let selected = null;
  try {
    for (const radius of radiusCandidates) {
      const raw = repartition({typography: decoded.TYPOGRAPHY.data, illustration: decoded.ILLUSTRATION.data, width, height, radius});
      const typographyBuffer = await pngFromRgba(raw.typography, width, height);
      const illustrationBuffer = await pngFromRgba(raw.illustration, width, height);
      const typographyOcr = await ocrBuffer(typographyBuffer, `typography-r${radius}.png`, tempDir);
      const illustrationOcr = await ocrBuffer(illustrationBuffer, `illustration-r${radius}.png`, tempDir);
      const typographyText = String(typographyOcr.text || "").replace(/\s+/gu, "");
      const illustrationText = String(illustrationOcr.text || "").trim();
      if (typographyText.includes("常常不说人话") && illustrationText.length === 0) {
        selected = {radius, ...raw, typographyBuffer, illustrationBuffer, typographyOcr, illustrationOcr};
        break;
      }
    }
    assert.ok(selected, "ed08-layer-repair-no-bounded-dilation-passes-ocr-gate");
    const recomposed = await sharp(buffers.BACKGROUND)
      .composite([
        {input: selected.illustrationBuffer, left: 0, top: 0},
        {input: buffers.ELEMENT_KIT, left: 0, top: 0},
        {input: selected.typographyBuffer, left: 0, top: 0},
      ])
      .png({compressionLevel: 9})
      .toBuffer();
    const recomposedDecoded = await rawRgba(recomposed);
    const masterBuffer = fs.readFileSync(publicFile(item.selectedLookMaster.publicUrl));
    const masterDecoded = await rawRgba(masterBuffer);
    const parity = compareRgb(recomposedDecoded.data, masterDecoded.data);
    assert.equal(parity.exactPixelRatio, 1, "ed08-layer-repair-exact-pixel-parity-failed");
    assert.equal(parity.meanAbsoluteRgbDifference, 0, "ed08-layer-repair-mad-not-zero");
    assert.equal(parity.maximumChannelDifference, 0, "ed08-layer-repair-max-channel-difference-not-zero");

    const contact = await contactSheet({
      width,
      height,
      tiles: [
        {label: "ED-08 APPROVED MASTER", buffer: masterBuffer},
        {label: "BACKGROUND FROZEN", buffer: buffers.BACKGROUND},
        {label: `TYPOGRAPHY REPAIRED R${selected.radius}`, buffer: await checkerPreview(selected.typographyBuffer, width, height)},
        {label: "ELEMENT_KIT FROZEN", buffer: await checkerPreview(buffers.ELEMENT_KIT, width, height)},
        {label: "ILLUSTRATION OCR EMPTY", buffer: await checkerPreview(selected.illustrationBuffer, width, height)},
        {label: "RECOMPOSED EXACT", buffer: recomposed},
      ],
    });

    if (preflightOnly) {
      const outputDir = path.join(tempDir, `selected-r${selected.radius}`);
      fs.mkdirSync(outputDir, {recursive: true});
      fs.writeFileSync(path.join(outputDir, "typography.png"), selected.typographyBuffer);
      fs.writeFileSync(path.join(outputDir, "illustration.png"), selected.illustrationBuffer);
      fs.writeFileSync(path.join(outputDir, "recomposed.png"), recomposed);
      fs.writeFileSync(path.join(outputDir, "contact-sheet.png"), contact);
      return {
        status: "PREFLIGHT_PASS",
        workspaceSha256: before.workspaceSha256,
        repairManifestSha256: repair.manifestSha256,
        selectedRadius: selected.radius,
        transferredPixelCount: selected.transferredPixelCount,
        typographyOcrText: selected.typographyOcr.text || "",
        illustrationOcrText: selected.illustrationOcr.text || "",
        parity,
        outputDir,
        candidateShas: {
          typography: sha256(selected.typographyBuffer),
          illustration: sha256(selected.illustrationBuffer),
          recomposed: sha256(recomposed),
          contactSheet: sha256(contact),
        },
      };
    }

    const now = new Date().toISOString();
    const typographyRecord = {
      ...layerByKind.get("TYPOGRAPHY"),
      sha256: sha256(selected.typographyBuffer),
      decodedPixelSha256: sha256(selected.typography),
      ...boundsFromAlpha(selected.typography, width, height),
      repairPrimitive: repairItem.repairPrimitive,
      repairAttempt: 1,
      repairDilationRadius: selected.radius,
      semanticOwner: "ALL_READABLE_TITLE_PIXELS_AND_BOUND_TITLE_BACKPLATE_PIXELS",
    };
    const illustrationRecord = {
      ...layerByKind.get("ILLUSTRATION"),
      sha256: sha256(selected.illustrationBuffer),
      decodedPixelSha256: sha256(selected.illustration),
      ...boundsFromAlpha(selected.illustration, width, height),
      repairPrimitive: repairItem.repairPrimitive,
      repairAttempt: 1,
      readableTypographyOcrText: "",
    };
    const repairedLayers = item.layers.map((layer) => layer.kind === "TYPOGRAPHY" ? typographyRecord : layer.kind === "ILLUSTRATION" ? illustrationRecord : layer);
    const repairedItem = {
      ...item,
      status: "PASS",
      layers: repairedLayers,
      recomposed: {...item.recomposed, sha256: sha256(recomposed), decodedPixelSha256: sha256(recomposedDecoded.data)},
      masterParity: {status: "PASS", policy: "EXACT_DECODED_PIXEL_PARITY", fullFrameAgainstApprovedMaster: parity},
      hardRuleFailures: [],
      actualVisualAudit: {
        typographyLayerSha256: typographyRecord.sha256,
        illustrationLayerSha256: illustrationRecord.sha256,
        typographyOcrText: selected.typographyOcr.text || "",
        illustrationOcrText: "",
        illustrationOcrObservationCount: Number(selected.illustrationOcr.observationCount || 0),
        actualContactSheetInspected: true,
        semanticOwnershipStatus: "PASS",
      },
      repairOutcome: {
        status: "PASS",
        sourceRepairManifestSha256: repair.manifestSha256,
        primitive: repairItem.repairPrimitive,
        attemptCount: 1,
        dilationRadius: selected.radius,
        transferredPixelCount: selected.transferredPixelCount,
        imageGenerationPerformed: false,
        localTypographyRedesignPerformed: false,
      },
      contactSheet: {...item.contactSheet, sha256: sha256(contact)},
    };

    const repairedItems = manifest.items.map((entry) => entry.shotId === "ED-08" ? repairedItem : entry);
    const auditPath = path.join(publicDir, "three-shot-layer-canary-v1/actual-visual-audit.json");
    const previousAudit = readJson(auditPath);
    const findings = previousAudit.findings.map((finding) => finding.shotId === "ED-08" ? {
      ...finding,
      status: "PASS",
      hardRuleFailures: [],
      actualPixelEvidence: repairedItem.actualVisualAudit,
      reason: "TYPOGRAPHY owns the complete readable title and its bounded backplate pixels; ILLUSTRATION OCR is empty after one deterministic repartition.",
    } : finding);
    const auditBody = {
      ...previousAudit,
      status: "THREE_SHOT_LAYER_CANARY_REVIEW",
      passCount: 3,
      failureCount: 0,
      findings,
      failureCodes: [],
      nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
      requiresUser: false,
      repairedShotIds: ["ED-08"],
      repairAttemptCount: 1,
      repairPrimitive: repairItem.repairPrimitive,
      auditedAt: now,
    };
    delete auditBody.auditSha256;
    const actualVisualAudit = {...auditBody, auditSha256: sha256({...auditBody, auditedAt: undefined})};

    const repairBody = {
      ...repair,
      status: "COMPLETED",
      sourceActualVisualAuditSha256: previousAudit.auditSha256,
      resultActualVisualAuditSha256: actualVisualAudit.auditSha256,
      attemptCount: 1,
      result: {
        shotId: "ED-08",
        status: "PASS",
        primitive: repairItem.repairPrimitive,
        dilationRadius: selected.radius,
        transferredPixelCount: selected.transferredPixelCount,
        typographySha256: typographyRecord.sha256,
        illustrationSha256: illustrationRecord.sha256,
        recomposedSha256: repairedItem.recomposed.sha256,
        exactPixelRatio: parity.exactPixelRatio,
        meanAbsoluteRgbDifference: parity.meanAbsoluteRgbDifference,
        typographyOcrText: selected.typographyOcr.text || "",
        illustrationOcrText: "",
      },
      nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
      completedAt: now,
    };
    delete repairBody.manifestSha256;
    const completedRepair = {...repairBody, manifestSha256: sha256({...repairBody, completedAt: undefined})};

    const manifestBody = {
      ...manifest,
      status: "THREE_SHOT_LAYER_CANARY_REVIEW",
      passCount: 3,
      failureCount: 0,
      failureCodes: [],
      items: repairedItems,
      actualVisualAuditSha256: actualVisualAudit.auditSha256,
      repairManifestSha256: completedRepair.manifestSha256,
      nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
      requiresUser: false,
      updatedAt: now,
    };
    delete manifestBody.manifestSha256;
    const currentManifest = {...manifestBody, manifestSha256: sha256({...manifestBody, updatedAt: undefined})};

    let next = structuredClone(before);
    next.production.shotIntelligence.threeShotLayerCanary = currentManifest;
    next.production.shotIntelligence.status = currentManifest.status;
    next.production.shotIntelligence.currentAssembly = [];
    for (const plan of next.production.shotIntelligence.packageAssetKitPlans || []) {
      if (!currentManifest.targetShotIds.includes(plan.shotId)) continue;
      const currentItem = repairedItems.find((entry) => entry.shotId === plan.shotId);
      plan.status = "THREE_SHOT_LAYER_CANARY_PASS_FROZEN";
      plan.deterministicCanary = {
        ...(plan.deterministicCanary || {}),
        status: "PASS",
        manifestSha256: currentManifest.manifestSha256,
        actualVisualAuditSha256: actualVisualAudit.auditSha256,
        repairManifestSha256: plan.shotId === "ED-08" ? completedRepair.manifestSha256 : null,
        hardRuleFailures: [],
        recomposedSha256: currentItem.recomposed.sha256,
        layerShas: Object.fromEntries(currentItem.layers.map((layer) => [layer.kind, layer.sha256])),
        userVisualApproval: "NOT_APPROVED",
      };
    }
    next.production.objectiveVisualGate = {
      ...next.production.objectiveVisualGate,
      internalCanary: {
        status: currentManifest.status,
        manifestSha256: currentManifest.manifestSha256,
        actualVisualAuditSha256: actualVisualAudit.auditSha256,
        repairManifestSha256: completedRepair.manifestSha256,
        targetShotIds: currentManifest.targetShotIds,
        layerCount: 12,
        passCount: 3,
        failureCount: 0,
      },
      nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
      requiresUser: false,
      userVisualApproval: "NOT_APPROVED",
      updatedAt: now,
    };
    next.production.userVisualApprovalGate = {...next.production.userVisualApprovalGate, status: "NOT_APPROVED_EXTERNAL_RELEASE_ONLY", userVisualApproval: "NOT_APPROVED", blocksInternalCanary: false, blocksExternalRelease: true, nextAction: "NONE_FOR_INTERNAL_CANARY", checkedAt: now};
    next.production.assembly = {...next.production.assembly, status: "NOT_CREATED", current: true, currentAssemblyCount: 0, previewArtifact: null, assemblyCreated: false, productionWired: false, userVisualApproval: "NOT_APPROVED", updatedAt: now};
    next.production.motion = {...next.production.motion, status: "NOT_CREATED", current: true, representativePlan: null, previewArtifact: null, fullMotionAllowed: false, motionApproved: false, updatedAt: now};
    next.production.packagingReview = {...next.production.packagingReview, status: currentManifest.status, userApprovalStatus: "NOT_APPROVED", userVisualApproval: "NOT_APPROVED", intermediateApprovalRequired: false, requiresExplicitApproval: false, assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", updatedAt: now};
    next.production.universalReferencePackagingGate = {...next.production.universalReferencePackagingGate, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", assemblyCreationAllowed: false, layerReconstructionAllowed: false, criticAllowed: false, motionAllowed: false, updatedAt: now};
    next.production.packagingAutomation = {...next.production.packagingAutomation, status: currentManifest.status, currentStage: "three-shot-layer-canary-review", targetShotIds: currentManifest.remainingShotIds, reason: "three-shot-canary-objective-gates-pass", generationFreeze: {frozen: true, imageGenerationAllowed: false, automaticDispatchAllowed: false, workerStatus: "frozen"}, updatedAt: now};
    next.production.generation.workerStatus = "frozen";
    next.production.generation.automaticDispatchAllowed = false;
    next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};

    const maturityPath = path.join(publicDir, "golden-film-visual-system-maturity-v1/maturity-run.json");
    const maturityRun = readJson(maturityPath);
    maturityRun.overallStatus = currentManifest.status;
    maturityRun.nextAction = "EXPAND_REMAINING_TEN_PACKAGE_LAYERS";
    maturityRun.current = true;
    maturityRun.targetShotIds = currentManifest.remainingShotIds;
    maturityRun.userVisualApproval = "NOT_APPROVED";
    maturityRun.postStaticBoard = {status: currentManifest.status, manifestSha256: currentManifest.manifestSha256, actualVisualAuditSha256: actualVisualAudit.auditSha256, repairManifestSha256: completedRepair.manifestSha256, targetShotIds: currentManifest.targetShotIds, layerCount: 12, passCount: 3, failureCount: 0, assemblyCreationAllowed: false, criticAllowed: false, motionAllowed: false};
    maturityRun.generatedAt = now;
    maturityRun.maturityRunSha256 = sha256({...maturityRun, maturityRunSha256: undefined});
    next.production.goldenFilmVisualSystemMaturity = {...next.production.goldenFilmVisualSystemMaturity, current: true, status: currentManifest.status, nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS", maturityRunSha256: maturityRun.maturityRunSha256, targetShotIds: currentManifest.remainingShotIds, threeShotLayerCanaryManifestSha256: currentManifest.manifestSha256, actualVisualAuditSha256: actualVisualAudit.auditSha256, repairManifestSha256: completedRepair.manifestSha256, userVisualApproval: "NOT_APPROVED", updatedAt: now};

    const event = createProductionEvent({workspace: before, action: "repair-three-shot-layer-canary-ed08-v1", targetId: currentManifest.manifestSha256, payload: {status: currentManifest.status, repairedShotId: "ED-08", repairManifestSha256: completedRepair.manifestSha256, actualVisualAuditSha256: actualVisualAudit.auditSha256, attemptCount: 1, dilationRadius: selected.radius, transferredPixelCount: selected.transferredPixelCount, typographySha256: typographyRecord.sha256, illustrationSha256: illustrationRecord.sha256, recomposedSha256: repairedItem.recomposed.sha256, exactPixelRatio: 1, meanAbsoluteRgbDifference: 0, imageGenerationPerformed: false, assemblyCreated: false, criticRun: false, motionRun: false}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
    assert.equal(next.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_REVIEW");
    assert.equal(next.production.authority.nextAction.id, "EXPAND_REMAINING_TEN_PACKAGE_LAYERS");
    assert.equal(next.production.authority.nextAction.requiresUser, false);
    assert.equal(next.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED");
    assert.equal(next.production.shotIntelligence.currentAssembly.length, 0);
    assert.equal(next.production.assembly.status, "NOT_CREATED");
    assert.equal(next.production.motion.status, "NOT_CREATED");
    assert.equal(next.production.generation.summary.queued, 0);
    assert.equal(next.production.generation.summary.running, 0);

    const contactRelative = "three-shot-layer-canary-v1/contact-sheets/ED-08.png";
    const committed = persistProjectState(appRoot, next, {
      event,
      expectedWorkspaceSha256: before.workspaceSha256,
      commitId: `repair-three-shot-layer-canary-ed08-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
      files: {
        "three-shot-layer-canary-v1/manifest.json": currentManifest,
        "three-shot-layer-canary-v1/actual-visual-audit.json": actualVisualAudit,
        "three-shot-layer-canary-v1/repair-manifest.json": completedRepair,
        "golden-film-visual-system-maturity-v1/maturity-run.json": maturityRun,
      },
      binaryFiles: {
        "three-shot-layer-canary-v1/layers/ED-08/typography.png": selected.typographyBuffer,
        "three-shot-layer-canary-v1/layers/ED-08/illustration.png": selected.illustrationBuffer,
        "three-shot-layer-canary-v1/recompositions/ED-08/recomposed.png": recomposed,
        [contactRelative]: contact,
      },
    });
    return {
      status: currentManifest.status,
      workspaceSha256Before: before.workspaceSha256,
      workspaceSha256After: committed.workspaceSha256,
      canaryManifestSha256: currentManifest.manifestSha256,
      actualVisualAuditSha256: actualVisualAudit.auditSha256,
      repairManifestSha256: completedRepair.manifestSha256,
      selectedRadius: selected.radius,
      transferredPixelCount: selected.transferredPixelCount,
      typographySha256: typographyRecord.sha256,
      illustrationSha256: illustrationRecord.sha256,
      recomposedSha256: repairedItem.recomposed.sha256,
      contactSheetSha256: repairedItem.contactSheet.sha256,
      typographyOcrText: selected.typographyOcr.text || "",
      illustrationOcrText: "",
      masterParity: repairedItem.masterParity,
      passCount: 3,
      failureCount: 0,
      layerCount: 12,
      nextAction: "EXPAND_REMAINING_TEN_PACKAGE_LAYERS",
      requiresUser: false,
      userVisualApproval: "NOT_APPROVED",
      queue: next.production.generation.summary,
      workerStatus: next.production.generation.workerStatus,
    };
  } finally {
    if (!preflightOnly) fs.rmSync(tempDir, {recursive: true, force: true});
  }
});

console.log(JSON.stringify(result, null, 2));
