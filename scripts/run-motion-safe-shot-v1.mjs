#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "../apps/studio-next/node_modules/sharp/lib/index.js";

import {
  A1_SHOT_LAYER_CANDIDATE_CONTRACT,
  BACKGROUND_EDIT_SHOT_IDS,
  MOTION_SAFE_LAYER_KINDS,
  MOTION_SAFE_SHOT_IDS,
  assertCandidateShape,
  candidateFingerprint,
  fileSha256,
  hashJson,
  sha256,
  stableJson,
} from "../apps/studio-next/src/lib/a1-motion-safe-shot-candidate-v4.mjs";
import {projectDirs, readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {publicDir, artifactDir} = projectDirs(appRoot);
const relativeRoot = "remaining-ten-motion-safe-v4";
const publicRoot = path.join(publicDir, relativeRoot);
const artifactRoot = path.join(artifactDir, relativeRoot);
const defaultPreflight = "/private/tmp/a1-remaining-ten-motion-safe-v13/preflight.json";
const allShotIds = [...MOTION_SAFE_SHOT_IDS];
const defaultSeedShotIds = allShotIds.filter((shotId) => shotId !== "ED-07");

const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const valueOf = (name, fallback = null) => {
  const prefix = `${name}=`;
  const inline = args.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
};
const listOf = (name, fallback = []) => String(valueOf(name, "") || "").split(",").map((item) => item.trim()).filter(Boolean).length
  ? String(valueOf(name, "") || "").split(",").map((item) => item.trim()).filter(Boolean)
  : fallback;
const selectedShotIds = () => {
  const one = valueOf("--shot-id");
  const many = listOf("--shot-ids");
  const values = one ? [one] : many.length ? many : allShotIds;
  for (const shotId of values) if (!allShotIds.includes(shotId)) throw new Error(`motion-safe-shot-id-invalid:${shotId}`);
  return [...new Set(values)];
};

const writeAtomic = (file, bytes) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, file);
};
const writeJsonAtomic = (file, value) => writeAtomic(file, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
const publicUrl = (relative) => `/generated/system-line/editorial-asset-workbench-v1/${relative.split(path.sep).join("/")}`;
const mirrorBytes = (relative, bytes) => {
  const normalized = relative.split(path.sep).join("/");
  writeAtomic(path.join(publicDir, normalized), bytes);
  writeAtomic(path.join(artifactDir, normalized), bytes);
};
const mirrorJson = (relative, value) => mirrorBytes(relative, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sourcePath = (value) => path.resolve(String(value));
const ensureFile = (file, label) => {
  if (!fs.existsSync(file)) throw new Error(`${label}-missing:${file}`);
  return file;
};
const rgba = async (fileOrBytes) => sharp(fileOrBytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const pngFromRaw = (data, width, height) => sharp(data, {raw: {width, height, channels: 4}}).png({compressionLevel: 9}).toBuffer();

function byteDifferenceMask(left, right, width, height) {
  const mask = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const offset = pixel * 4;
    if (Math.max(Math.abs(left[offset] - right[offset]), Math.abs(left[offset + 1] - right[offset + 1]), Math.abs(left[offset + 2] - right[offset + 2])) > 0) mask[pixel] = 255;
  }
  return mask;
}

function maskStats(mask, width, height) {
  let pixels = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 0) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    pixels += 1;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {pixelCount: pixels, ratio: Number((pixels / mask.length).toFixed(6)), bounds: pixels ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1} : null};
}

function connectedComponents(mask, width, height, minimumPixels = 3) {
  const seen = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    let pixels = 0;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    while (queue.length) {
      const pixel = queue.pop();
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      pixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] > 0 && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (pixels >= minimumPixels) components.push({pixelCount: pixels, bounds: {x: left, y: top, width: right - left + 1, height: bottom - top + 1}});
  }
  return components.sort((a, b) => b.pixelCount - a.pixelCount);
}

function ed07RepairMasks(width, height) {
  const repair = Buffer.alloc(width * height);
  const change = Buffer.alloc(width * height);
  const rects = [
    {x0: 1577, y0: 88, x1: 1672, y1: 112},
    {x0: 970, y0: 827, x1: 1014, y1: 852},
  ];
  const featherRadius = 6;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let alpha = 0;
    let core = false;
    for (const rect of rects) {
      if (x >= rect.x0 && x < rect.x1 && y >= rect.y0 && y < rect.y1) core = true;
      const dx = Math.max(rect.x0 - x, 0, x - rect.x1 + 1);
      const dy = Math.max(rect.y0 - y, 0, y - rect.y1 + 1);
      const distance = Math.hypot(dx, dy);
      if (distance <= featherRadius) alpha = Math.max(alpha, Math.round(255 * Math.max(0, 1 - distance / (featherRadius + 1))));
    }
    const pixel = y * width + x;
    repair[pixel] = core ? 255 : 0;
    change[pixel] = alpha;
  }
  return {repair, change, rects, featherRadius};
}

function shiftedRaw(data, width, height, dx, dy) {
  const output = Buffer.alloc(data.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const targetX = x + dx;
    const targetY = y + dy;
    if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
    const source = (y * width + x) * 4;
    const target = (targetY * width + targetX) * 4;
    data.copy(output, target, source, source + 4);
  }
  return output;
}

async function motionExposureSheet(backgroundBytes, layerBytes, width, height, shotId) {
  const offsets = [[0, 0, "HOLD"], [-80, 0, "X -80"], [80, 0, "X +80"], [0, -80, "Y -80"], [0, 80, "Y +80"]];
  const tiles = [];
  for (const [dx, dy, label] of offsets) {
    let frame = Buffer.from(backgroundBytes);
    if (dx || dy) for (const kind of ["ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"]) {
      const shifted = await pngFromRaw(shiftedRaw(layerBytes[kind].data, width, height, dx, dy), width, height);
      frame = await sharp(frame).composite([{input: shifted, left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
    }
    const tile = await sharp(frame).resize(420, Math.round(420 * height / width), {fit: "fill"}).png().toBuffer();
    const labelSvg = Buffer.from(`<svg width="420" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="420" height="34" fill="#111318"/><text x="12" y="23" fill="#fff" font-family="Arial" font-size="16" font-weight="700">${shotId} ${label}</text></svg>`);
    tiles.push({tile, labelSvg});
  }
  const tileHeight = Math.round(420 * height / width);
  const inputs = [];
  for (let index = 0; index < tiles.length; index += 1) {
    const left = index * 420;
    inputs.push({input: tiles[index].labelSvg, left, top: 0}, {input: tiles[index].tile, left, top: 34});
  }
  return sharp({create: {width: 420 * tiles.length, height: tileHeight + 34, channels: 3, background: "#111318"}}).composite(inputs).png({compressionLevel: 9}).toBuffer();
}

async function regionEvidence(beforeBytes, afterBytes, width, regions, shotId) {
  const records = [];
  for (let index = 0; index < regions.length; index += 1) {
    const {bounds} = regions[index];
    const crop = {left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height};
    const before = await sharp(beforeBytes).extract(crop).png({compressionLevel: 9}).toBuffer();
    const after = await sharp(afterBytes).extract(crop).png({compressionLevel: 9}).toBuffer();
    const beforeRelative = `${relativeRoot}/candidates/${shotId}/review/change-regions/region-${String(index + 1).padStart(2, "0")}-before.png`;
    const afterRelative = `${relativeRoot}/candidates/${shotId}/review/change-regions/region-${String(index + 1).padStart(2, "0")}-after.png`;
    mirrorBytes(beforeRelative, before);
    mirrorBytes(afterRelative, after);
    records.push({regionId: `region-${String(index + 1).padStart(2, "0")}`, bounds, before: {publicUrl: publicUrl(beforeRelative), sha256: sha256(before)}, after: {publicUrl: publicUrl(afterRelative), sha256: sha256(after)}});
  }
  return records;
}

function layerPathFor(item, kind) {
  return sourcePath(item.layers[kind].path);
}

function layerRecord({shotId, kind, bytes, raw, relative, masterSha256}) {
  const info = raw.info;
  const alpha = raw.data;
  let pixels = 0;
  let partialAlphaPixels = 0;
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const value = alpha[pixel * 4 + 3];
    if (value === 0) continue;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    pixels += 1;
    if (value < 255) partialAlphaPixels += 1;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {contract: "A1ShotLayerArtifact/v4", shotId, kind, status: "TECHNICAL_PASS", path: publicUrl(relative), publicUrl: publicUrl(relative), sha256: sha256(bytes), decodedPixelSha256: sha256(raw.data), width: info.width, height: info.height, hasAlpha: true, alphaMode: kind === "BACKGROUND" ? "OPAQUE_SCENE_PLATE_WITH_ALPHA_CHANNEL" : "TRANSPARENT_RGBA_SEMANTIC_ACTOR_LAYER", pixelCount: pixels, partialAlphaPixelCount: partialAlphaPixels, visiblePixelRatio: Number((pixels / (info.width * info.height)).toFixed(6)), bounds: pixels ? {x: left, y: top, width: right - left + 1, height: bottom - top + 1} : null, geometry: {x: 0, y: 0, width: info.width, height: info.height, fit: "fill", coordinateSpace: "APPROVED_MASTER_FULL_CANVAS"}, sourceMasterSha256: masterSha256, localSecondDesignPerformed: false, visibleTypographyRetypedLocally: false};
}

function readReuseIndex(file) {
  return fs.existsSync(file) ? readJson(file) : {contract: "A1MotionSafeShotReuseIndex/v1", entries: {}, updatedAt: null};
}

function candidatePaths(shotId) {
  const base = `${relativeRoot}/candidates/${shotId}`;
  return {base, manifest: `${base}/candidate.json`, layer: (kind) => `${base}/layers/${kind.toLowerCase()}.png`, actorUnion: `${base}/masks/actor-union.png`, vacancyRepairMask: `${base}/masks/vacancy-repair-mask.png`, cleanPlateChangeMask: `${base}/masks/clean-plate-change-mask.png`, motionExposureEnvelope: `${base}/masks/motion-exposure-envelope.png`, recomposed: `${base}/recomposed.png`, cleanSource: `${base}/sources/clean-source.png`, reviewEvidence: `${base}/review/evidence.json`, exposure: `${base}/review/motion-exposure-80px.png`};
}

function localFileFor(relative) {
  return path.join(publicDir, relative);
}

function existingCandidateIsValid(entry, expectedFingerprint, shotId) {
  if (!entry || entry.fingerprint !== expectedFingerprint || !entry.candidateManifestRelativePath) return false;
  const manifestFile = localFileFor(entry.candidateManifestRelativePath);
  if (!fs.existsSync(manifestFile)) return false;
  try {
    const candidate = readJson(manifestFile);
    assertCandidateShape(candidate);
    if (candidate.shotId !== shotId || candidate.fingerprint !== expectedFingerprint) return false;
    for (const file of [candidate.recomposed.path, candidate.actorUnion.path, candidate.vacancyRepairMask.path, candidate.cleanPlateChangeMask.path, candidate.motionExposureEnvelope.path, ...candidate.layers.map((layer) => layer.path || layer.publicUrl)]) {
      const resolved = localFileFor(file.replace(/^\/generated\/system-line\/editorial-asset-workbench-v1\//u, ""));
      if (!fs.existsSync(resolved)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function buildCandidate({item, workspace, preflightSha256, shotId, seedOnly = false}) {
  const paths = candidatePaths(shotId);
  const master = ensureFile(sourcePath(item.sourceSelectedMaster.path), `${shotId}-master`);
  const clean = ensureFile(sourcePath(item.cleanSource.path), `${shotId}-clean-source`);
  const masterBytes = fs.readFileSync(master);
  const cleanBytes = fs.readFileSync(clean);
  const masterSha256 = fileSha256(master);
  const cleanSha256 = fileSha256(clean);
  assert.equal(masterSha256, item.sourceSelectedMaster.sha256, `${shotId}-master-sha-mismatch`);
  assert.equal(cleanSha256, item.cleanSource.sha256, `${shotId}-clean-sha-mismatch`);
  const actorEdit = item.actorEditSource?.path ? ensureFile(sourcePath(item.actorEditSource.path), `${shotId}-actor-edit`) : null;
  const actorEditSha256 = actorEdit ? fileSha256(actorEdit) : null;
  const actorUnion = ensureFile(sourcePath(item.actorUnion.path), `${shotId}-actor-union`);
  const actorUnionBytes = fs.readFileSync(actorUnion);
  const actorUnionSha256 = fileSha256(actorUnion);
  assert.equal(actorUnionSha256, item.actorUnion.sha256, `${shotId}-actor-union-sha-mismatch`);
  const method = {contract: "A1MotionSafeShotRecipe/v4", shotId, sourcePreflightContract: "A1RemainingTenMotionSafePreflight/v3", basePrimitive: item.primitive, repairMode: shotId === "ED-07" ? "TARGETED_TWO_REGION_CLEAN_PLATE_REPAIR" : "IMMUTABLE_V13_BASELINE", outputEncoding: "PNG_LEVEL_9_DETERMINISTIC_SINGLE_WRITE", compositeOrder: ["BACKGROUND", "ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"], maxDisplacementPx: 80};
  const detector = {contract: "A1MotionSafeShotDetector/v4", decodedPixelIdentity: "SHA256_DECODED_RGBA", cleanPlateChangeMask: "ACTUAL_BACKGROUND_PIXEL_CHANGE_VS_SOURCE_MASTER_OR_BASELINE", vacancyRepairMask: "EXPLICIT_REPAIR_REGION_MASK", motionExposureEnvelope: "V13_ACTOR_UNION_80PX_ENVELOPE_INPUT", backgroundOcr: "SINGLE_SHOT_ONLY", visualPassMapping: "FORBIDDEN"};
  const methodSha256 = hashJson(method);
  const detectorSha256 = hashJson(detector);
  const visualMasterRef = {id: "selected-master-set", hash: workspace.production.objectiveVisualGate.selectedMasterSetSha256};
  const recipeKey = hashJson({contract: A1_SHOT_LAYER_CANDIDATE_CONTRACT, shotId, masterSha256, cleanSha256, actorUnionSha256, actorEditSha256, methodSha256, detectorSha256});
  const fingerprint = candidateFingerprint({workspaceSha256: workspace.workspaceSha256, sourceSelectedMasterSetSha256: workspace.production.objectiveVisualGate.selectedMasterSetSha256, visualMasterRef, shotId, recipeKey, masterSha256, cleanSha256, actorUnionSha256, actorEditSha256, methodSha256, detectorSha256});
  const oldBackground = ensureFile(layerPathFor(item, "BACKGROUND"), `${shotId}-background`);
  const oldBackgroundBytes = fs.readFileSync(oldBackground);
  const oldBackgroundRaw = await rgba(oldBackgroundBytes);
  const masterRaw = await rgba(masterBytes);
  const cleanRaw = await rgba(cleanBytes);
  assert.equal(oldBackgroundRaw.info.width, 1672, `${shotId}-width`);
  assert.equal(oldBackgroundRaw.info.height, 941, `${shotId}-height`);
  const width = oldBackgroundRaw.info.width;
  const height = oldBackgroundRaw.info.height;
  let backgroundBytes = oldBackgroundBytes;
  let vacancyRepairMask = Buffer.alloc(width * height);
  let cleanPlateChangeMask = byteDifferenceMask(masterRaw.data, oldBackgroundRaw.data, width, height);
  let repairMeta = {mode: "NONE", rects: [], featherRadius: 0};
  if (!seedOnly && shotId === "ED-07") {
    const masks = ed07RepairMasks(width, height);
    // Bind the full feathered vacancy repair envelope, not only its opaque
    // core rectangles.  The core remains in repairMeta for review geometry.
    vacancyRepairMask = masks.change;
    repairMeta = {mode: "TARGETED_TWO_REGION_CLEAN_PLATE_REPAIR", rects: masks.rects, featherRadius: masks.featherRadius};
    const output = Buffer.from(oldBackgroundRaw.data);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      const alpha = masks.change[pixel] / 255;
      if (alpha === 0) continue;
      const offset = pixel * 4;
      for (const channel of [0, 1, 2]) output[offset + channel] = Math.round(oldBackgroundRaw.data[offset + channel] * (1 - alpha) + cleanRaw.data[offset + channel] * alpha);
      output[offset + 3] = 255;
    }
    backgroundBytes = await pngFromRaw(output, width, height);
    const repairedRaw = await rgba(backgroundBytes);
    cleanPlateChangeMask = byteDifferenceMask(oldBackgroundRaw.data, repairedRaw.data, width, height);
  }

  const copied = new Map();
  const copy = (relative, bytes) => {
    mirrorBytes(relative, bytes);
    copied.set(relative, bytes);
  };
  copy(paths.cleanSource, cleanBytes);
  copy(paths.layer("BACKGROUND"), backgroundBytes);
  for (const kind of MOTION_SAFE_LAYER_KINDS.slice(1)) copy(paths.layer(kind), fs.readFileSync(layerPathFor(item, kind)));
  copy(paths.actorUnion, actorUnionBytes);
  copy(paths.vacancyRepairMask, vacancyRepairMask);
  copy(paths.cleanPlateChangeMask, cleanPlateChangeMask);
  copy(paths.motionExposureEnvelope, fs.readFileSync(sourcePath(item.motionExposureEnvelope.path)));

  const layerBytes = {};
  const layerRaw = {};
  const layers = [];
  for (const kind of MOTION_SAFE_LAYER_KINDS) {
    layerBytes[kind] = copied.get(paths.layer(kind));
    layerRaw[kind] = await rgba(layerBytes[kind]);
    layers.push(layerRecord({shotId, kind, bytes: layerBytes[kind], raw: layerRaw[kind], relative: paths.layer(kind), masterSha256}));
  }
  let recomposed = layerBytes.BACKGROUND;
  for (const kind of ["ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"]) recomposed = await sharp(recomposed).composite([{input: layerBytes[kind], left: 0, top: 0}]).png({compressionLevel: 9}).toBuffer();
  const recomposedRaw = await rgba(recomposed);
  copy(paths.recomposed, recomposed);
  const actorMaskStats = maskStats(Buffer.from((await rgba(actorUnionBytes)).data.filter((_, index) => index % 4 === 3)), width, height);
  const vacancyStats = maskStats(vacancyRepairMask, width, height);
  const cleanChangeStats = maskStats(cleanPlateChangeMask, width, height);
  const candidateBackgroundRaw = await rgba(backgroundBytes);
  let outsideExact = 1;
  let outsideMax = 0;
  if (shotId === "ED-07" && !seedOnly) {
    let count = 0;
    let exact = 0;
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      if (vacancyRepairMask[pixel] > 0) continue;
      const offset = pixel * 4;
      const delta = Math.max(Math.abs(oldBackgroundRaw.data[offset] - candidateBackgroundRaw.data[offset]), Math.abs(oldBackgroundRaw.data[offset + 1] - candidateBackgroundRaw.data[offset + 1]), Math.abs(oldBackgroundRaw.data[offset + 2] - candidateBackgroundRaw.data[offset + 2]));
      count += 1;
      if (delta === 0) exact += 1;
      outsideMax = Math.max(outsideMax, delta);
    }
    outsideExact = count ? exact / count : 1;
  }

  let backgroundAudit = item.backgroundAudit || {ocrObservationCount: 0, ocrText: "", faceCount: 0, humanRectCount: 0};
  if (!seedOnly && shotId === "ED-07") {
    const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
    if (!fs.existsSync(ocrBinary)) throw new Error("motion-safe-ed07-ocr-binary-missing");
    const backgroundFile = localFileFor(paths.layer("BACKGROUND"));
    const output = execFileSync(ocrBinary, [backgroundFile], {encoding: "utf8", maxBuffer: 4_000_000}).trim().split("\n").at(-1);
    const ocr = JSON.parse(output);
    backgroundAudit = {ocrObservationCount: Number(ocr.observationCount || 0), ocrText: String(ocr.text || ""), faceCount: 0, humanRectCount: 0};
  }
  const technicalFailures = [];
  if (layers.length !== 4) technicalFailures.push("LAYER_COUNT");
  if (layers.some((layer) => layer.width !== width || layer.height !== height)) technicalFailures.push("LAYER_DIMENSIONS");
  if (backgroundAudit.ocrObservationCount !== 0) technicalFailures.push("BACKGROUND_OCR");
  if (shotId === "ED-07" && !seedOnly && (outsideExact !== 1 || outsideMax !== 0)) technicalFailures.push("REPAIR_OUTSIDE_PIXELS_CHANGED");
  const candidate = {
    contract: A1_SHOT_LAYER_CANDIDATE_CONTRACT,
    version: 4,
    candidateId: `motion-safe-${shotId.toLowerCase()}-${fingerprint.slice(0, 16)}`,
    shotId,
    recipeKey,
    fingerprint,
    source: {workspaceSha256: workspace.workspaceSha256, sourcePreflightSha256: preflightSha256, sourceSelectedMasterSetSha256: workspace.production.objectiveVisualGate.selectedMasterSetSha256, visualMasterRef, sourceContract: "A1RemainingTenMotionSafePreflight/v3"},
    masterSha256,
    cleanSha256,
    actorUnionSha256,
    actorEditSha256,
    method,
    methodSha256,
    detector,
    detectorSha256,
    repair: repairMeta,
    presenterIdentity: {
      status: item.presenterIdentity?.status || "NOT_APPLICABLE",
      sourceMatteSha256: item.presenterIdentity?.sourceMatteSha256 || null,
      identityGate: shotId === "ED-13" ? "REVIEW_REQUIRED" : "NOT_APPLICABLE",
    },
    layers,
    actorUnion: {path: publicUrl(paths.actorUnion), sha256: sha256(actorUnionBytes), decodedPixelSha256: sha256((await rgba(actorUnionBytes)).data), pixelCount: actorMaskStats.pixelCount, bounds: actorMaskStats.bounds},
    vacancyRepairMask: {path: publicUrl(paths.vacancyRepairMask), sha256: sha256(vacancyRepairMask), pixelCount: vacancyStats.pixelCount, ratio: vacancyStats.ratio, bounds: vacancyStats.bounds},
    cleanPlateChangeMask: {path: publicUrl(paths.cleanPlateChangeMask), sha256: sha256(cleanPlateChangeMask), pixelCount: cleanChangeStats.pixelCount, ratio: cleanChangeStats.ratio, bounds: cleanChangeStats.bounds, method: "DECODED_RGB_DIFF_MASK"},
    motionExposureEnvelope: {path: publicUrl(paths.motionExposureEnvelope), sha256: fileSha256(localFileFor(paths.motionExposureEnvelope)), sourceSha256: item.motionExposureEnvelope.sha256, maximumDisplacementPx: 80, pixelCount: item.motionExposureEnvelope.pixelCount},
    recomposed: {path: publicUrl(paths.recomposed), sha256: sha256(recomposed), decodedPixelSha256: sha256(recomposedRaw.data), width, height},
    backgroundAudit,
    technicalChecks: {layerCount: layers.length === 4, dimensions: layers.every((layer) => layer.width === width && layer.height === height), backgroundOcrZero: backgroundAudit.ocrObservationCount === 0, repairOutsideExact: outsideExact === 1 && outsideMax === 0, recompositionWritten: true},
    technicalStatus: technicalFailures.length ? "TECHNICAL_FAIL" : "TECHNICAL_PASS",
    technicalFailures,
    visualStatus: "REVIEW_REQUIRED",
    automaticVisualPassMappingForbidden: true,
    productionStateWritten: false,
    cacheStatus: seedOnly ? "SEEDED_BASELINE" : "MISS",
    generatedAt: new Date().toISOString(),
  };
  assertCandidateShape({...candidate, technicalStatus: candidate.technicalStatus === "TECHNICAL_FAIL" ? "TECHNICAL_PASS" : candidate.technicalStatus});

  if (!seedOnly && shotId === "ED-07") {
    const regionRecords = await regionEvidence(oldBackgroundBytes, backgroundBytes, width, connectedComponents(vacancyRepairMask, width, height), shotId);
    const exposureBytes = await motionExposureSheet(backgroundBytes, layerRaw, width, height, shotId);
    copy(paths.exposure, exposureBytes);
    const reviewEvidence = {contract: "A1ShotLayerReviewEvidence/v1", shotId, cacheMiss: true, fullBackgroundOverview: {publicUrl: publicUrl(paths.layer("BACKGROUND")), sha256: sha256(backgroundBytes)}, changedConnectedRegions: regionRecords, exposure80px: {publicUrl: publicUrl(paths.exposure), sha256: sha256(exposureBytes), offsets: [[0, 0], [-80, 0], [80, 0], [0, -80], [0, 80]]}, generatedAt: new Date().toISOString()};
    mirrorJson(paths.reviewEvidence, reviewEvidence);
    candidate.reviewEvidence = reviewEvidence;
  } else {
    const sourceContact = item.contactSheet?.path ? ensureFile(sourcePath(item.contactSheet.path), `${shotId}-contact-sheet`) : null;
    const sourceExposure = item.motionExposureContactSheet?.path ? ensureFile(sourcePath(item.motionExposureContactSheet.path), `${shotId}-motion-exposure-contact-sheet`) : null;
    const contactRelative = `${paths.base}/review/v13-contact-sheet.png`;
    const exposureRelative = `${paths.base}/review/v13-motion-exposure-contact-sheet.png`;
    if (sourceContact) mirrorBytes(contactRelative, fs.readFileSync(sourceContact));
    if (sourceExposure) mirrorBytes(exposureRelative, fs.readFileSync(sourceExposure));
    candidate.reviewEvidence = {contract: "A1ShotLayerReviewEvidence/v1", shotId, cacheMiss: false, reusedFrom: "A1RemainingTenMotionSafePreflight/v3", fullBackgroundOverview: sourceContact ? {publicUrl: publicUrl(contactRelative), sha256: fileSha256(sourceContact)} : null, changedConnectedRegions: [], exposure80px: sourceExposure ? {publicUrl: publicUrl(exposureRelative), sha256: fileSha256(sourceExposure), offsets: [[0, 0], [-80, 0], [80, 0], [0, -80], [0, 80]]} : null, generatedAt: new Date().toISOString()};
    mirrorJson(paths.reviewEvidence, candidate.reviewEvidence);
  }
  mirrorJson(paths.manifest, candidate);
  return candidate;
}

async function main() {
  const started = performance.now();
  const seedOnly = has("--seed-cache");
  const shotIds = seedOnly && !valueOf("--shot-id") && !valueOf("--shot-ids") ? defaultSeedShotIds : selectedShotIds();
  const preflightPath = ensureFile(sourcePath(valueOf("--source-preflight", defaultPreflight)), "motion-safe-preflight");
  const preflight = readJson(preflightPath);
  if (preflight.contract !== "A1RemainingTenMotionSafePreflight/v3") throw new Error("motion-safe-preflight-contract-invalid");
  if (preflight.productionStateWritten !== false || preflight.automaticPassMappingForbidden !== true) throw new Error("motion-safe-preflight-production-boundary-invalid");
  const workspace = readProjectWorkspace(appRoot);
  if (workspace.workspaceSha256 !== preflight.sourceWorkspaceSha256) throw new Error(`motion-safe-preflight-workspace-cas-failed:${workspace.workspaceSha256}`);
  const preflightSha256 = fileSha256(preflightPath);
  const items = new Map(preflight.items.map((item) => [item.shotId, item]));
  const reuseIndexFile = sourcePath(valueOf("--reuse-index", path.join(artifactRoot, relativeRoot, "reuse-index.json")));
  const reuseIndex = readReuseIndex(reuseIndexFile);
  const results = [];
  const failures = [];
  for (const shotId of shotIds) {
    const item = items.get(shotId);
    if (!item) throw new Error(`motion-safe-preflight-shot-missing:${shotId}`);
    const startedShot = performance.now();
    try {
      const masterSha256 = item.sourceSelectedMaster.sha256;
      const cleanSha256 = item.cleanSource.sha256;
      const actorUnionSha256 = item.actorUnion.sha256;
      const methodSha256 = hashJson({contract: "A1MotionSafeShotRecipe/v4", shotId, sourcePreflightContract: "A1RemainingTenMotionSafePreflight/v3", basePrimitive: item.primitive, repairMode: shotId === "ED-07" ? "TARGETED_TWO_REGION_CLEAN_PLATE_REPAIR" : "IMMUTABLE_V13_BASELINE", outputEncoding: "PNG_LEVEL_9_DETERMINISTIC_SINGLE_WRITE", compositeOrder: ["BACKGROUND", "ILLUSTRATION", "ELEMENT_KIT", "TYPOGRAPHY"], maxDisplacementPx: 80});
      const detectorSha256 = hashJson({contract: "A1MotionSafeShotDetector/v4", decodedPixelIdentity: "SHA256_DECODED_RGBA", cleanPlateChangeMask: "ACTUAL_BACKGROUND_PIXEL_CHANGE_VS_SOURCE_MASTER_OR_BASELINE", vacancyRepairMask: "EXPLICIT_REPAIR_REGION_MASK", motionExposureEnvelope: "V13_ACTOR_UNION_80PX_ENVELOPE_INPUT", backgroundOcr: "SINGLE_SHOT_ONLY", visualPassMapping: "FORBIDDEN"});
      const visualMasterRef = {id: "selected-master-set", hash: workspace.production.objectiveVisualGate.selectedMasterSetSha256};
      const recipeKey = hashJson({contract: A1_SHOT_LAYER_CANDIDATE_CONTRACT, shotId, masterSha256, cleanSha256, actorUnionSha256, actorEditSha256: item.actorEditSource?.sha256 || null, methodSha256, detectorSha256});
      const fingerprint = candidateFingerprint({workspaceSha256: workspace.workspaceSha256, sourceSelectedMasterSetSha256: workspace.production.objectiveVisualGate.selectedMasterSetSha256, visualMasterRef, shotId, recipeKey, masterSha256, cleanSha256, actorUnionSha256, actorEditSha256: item.actorEditSource?.sha256 || null, methodSha256, detectorSha256});
      const existing = !seedOnly && existingCandidateIsValid(reuseIndex.entries[shotId], fingerprint, shotId);
      if (existing) {
        const candidate = readJson(localFileFor(reuseIndex.entries[shotId].candidateManifestRelativePath));
        results.push({shotId, status: "CACHE_HIT", cacheStatus: "HIT", candidateId: candidate.candidateId, fingerprint, durationMs: Math.round(performance.now() - startedShot), technicalStatus: candidate.technicalStatus, visualStatus: candidate.visualStatus});
        continue;
      }
      const candidate = await buildCandidate({item, workspace, preflightSha256, shotId, seedOnly});
      if (candidate.technicalStatus !== "TECHNICAL_PASS") throw new Error(`motion-safe-technical-fail:${shotId}:${candidate.technicalFailures.join(",")}`);
      const durationMs = Math.round(performance.now() - startedShot);
      candidate.durationMs = durationMs;
      candidate.cacheStatus = seedOnly ? "SEEDED_BASELINE" : "MISS";
      mirrorJson(candidatePaths(shotId).manifest, candidate);
      reuseIndex.entries[shotId] = {shotId, fingerprint, recipeKey: candidate.recipeKey, candidateId: candidate.candidateId, candidateManifestRelativePath: candidatePaths(shotId).manifest, candidateManifestSha256: sha256(Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, "utf8")), cacheable: true, sourceWorkspaceSha256: workspace.workspaceSha256, sourcePreflightSha256: preflightSha256, updatedAt: candidate.generatedAt};
      results.push({shotId, status: seedOnly ? "SEEDED_BASELINE" : "CACHE_MISS", cacheStatus: seedOnly ? "SEEDED_BASELINE" : "MISS", candidateId: candidate.candidateId, fingerprint, durationMs, technicalStatus: candidate.technicalStatus, visualStatus: candidate.visualStatus});
    } catch (error) {
      failures.push({shotId, error: error instanceof Error ? error.message : String(error), durationMs: Math.round(performance.now() - startedShot)});
      results.push({shotId, status: "FAILED", cacheStatus: "MISS", durationMs: Math.round(performance.now() - startedShot), error: error instanceof Error ? error.message : String(error)});
    }
  }
  const completedAt = new Date().toISOString();
  const report = {contract: "A1MotionSafeShotRunner/v1", sourceContract: A1_SHOT_LAYER_CANDIDATE_CONTRACT, sourceWorkspaceSha256: workspace.workspaceSha256, sourcePreflightSha256: preflightSha256, targetShotIds: shotIds, concurrency: 1, startedAt: new Date(Date.now() - Math.round(performance.now() - started)).toISOString(), completedAt, wallClockMs: Math.round(performance.now() - started), cacheHitCount: results.filter((item) => item.cacheStatus === "HIT").length, cacheMissCount: results.filter((item) => item.cacheStatus === "MISS").length, seedCount: results.filter((item) => item.cacheStatus === "SEEDED_BASELINE").length, failedShotIds: failures.map((item) => item.shotId), results, failures, productionStateWritten: false, assemblyCreated: false, motionCreated: false};
  reuseIndex.contract = "A1MotionSafeShotReuseIndex/v1";
  reuseIndex.sourceWorkspaceSha256 = workspace.workspaceSha256;
  reuseIndex.sourcePreflightSha256 = preflightSha256;
  reuseIndex.updatedAt = completedAt;
  writeJsonAtomic(reuseIndexFile, reuseIndex);
  const reuseRelative = path.relative(artifactDir, reuseIndexFile).split(path.sep).join("/");
  mirrorJson(reuseRelative, reuseIndex);
  mirrorJson(`${relativeRoot}/latest-run.json`, report);
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

await main();
