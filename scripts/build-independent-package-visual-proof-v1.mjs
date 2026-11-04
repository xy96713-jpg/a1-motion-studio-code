#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import sharp from "sharp";
import {validateOutputReferenceBindings, validateOutputTextRendererBindings} from "../apps/studio-next/src/lib/a1-independent-package-visual-proof-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const referenceRegistry = JSON.parse(fs.readFileSync(path.join(publicRoot, "style-guides/pinterest-retro-pixel-v1/manifest.json"), "utf8"));
const fontRegistry = {
  "a1-fusion-pixel": {publicUrl: "/a1-editorial-fonts/fusion-pixel.ttf", sha256: "d358eb41c1df2bc8bb517cad8e7cec8216ee0ec6939a742e046899f56f2b0a32"},
  "source-han-sans-cn-heavy": {publicUrl: "/a1-editorial-fonts/SourceHanSansCN-Heavy.otf", sha256: "f178cae1188a31e7f5bdb268da9253b32c893aec56e0977118371aaf4cfc90f6"},
};
const defaultPackageDir = path.join(
  publicRoot,
  "generated/system-line/editorial-asset-workbench-v1/static-package-review-v7",
);

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function publicPathToFile(publicPath) {
  return path.join(publicRoot, publicPath.replace(/^\/+/, ""));
}

function groupBy(items, keyForItem) {
  const groups = new Map();
  for (const item of items) {
    const key = keyForItem(item);
    if (!key) continue;
    const existing = groups.get(key) || [];
    existing.push(item);
    groups.set(key, existing);
  }
  return [...groups.entries()].map(([key, members]) => ({key, members}));
}

function duplicateGroups(items, keyForItem) {
  return groupBy(items, keyForItem)
    .filter(({members}) => members.length > 1)
    .map(({key, members}) => ({
      key,
      count: members.length,
      shotIds: members.map(({shotId}) => shotId),
    }));
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function labelSvg(label, width, height) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#ff4d36" stroke-width="6"/>
      <rect x="18" y="18" width="210" height="54" rx="4" fill="#111111" fill-opacity="0.88"/>
      <text x="34" y="56" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="700">${xmlEscape(label)}</text>
    </svg>
  `);
}

function largestBounds(items = []) {
  return [...items].sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
}

function detectPresenterGeometry(holdFramePath) {
  const detectorPath = path.join(root, "scripts/run-local-vision-human-bounds-v1.swift");
  const result = spawnSync("swift", [detectorPath, holdFramePath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      status: "UNVERIFIED",
      reason: result.stderr.trim() || result.stdout.trim() || "local-vision-failed",
      faceBounds: null,
      subjectBounds: null,
    };
  }
  const payload = JSON.parse(result.stdout);
  return {
    status: payload.status,
    method: payload.method,
    faceBounds: largestBounds(payload.faces),
    subjectBounds: largestBounds(payload.humans),
  };
}

async function alphaCoverageInBounds(imagePath, bounds, width, height) {
  if (!bounds) return null;
  const {data, info} = await sharp(imagePath)
    .resize(width, height, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}})
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true});
  const left = Math.max(0, Math.min(info.width - 1, Math.floor(bounds.x * info.width)));
  const top = Math.max(0, Math.min(info.height - 1, Math.floor(bounds.y * info.height)));
  const right = Math.max(left + 1, Math.min(info.width, Math.ceil((bounds.x + bounds.width) * info.width)));
  const bottom = Math.max(top + 1, Math.min(info.height, Math.ceil((bounds.y + bounds.height) * info.height)));
  let alphaSum = 0;
  let occupiedPixelCount = 0;
  let pixelCount = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      pixelCount += 1;
      alphaSum += alpha;
      if (alpha >= 16) occupiedPixelCount += 1;
    }
  }
  return {
    bounds,
    pixelCount,
    occupiedPixelCount,
    alphaCoverage: Number((alphaSum / Math.max(1, pixelCount) / 255).toFixed(4)),
  };
}

async function buildOverlayComposite({output, packageDir, compositeDir}) {
  const overlayPath = publicPathToFile(output.outputPath);
  const holdFramePath = path.join(
    publicRoot,
    "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames",
    `${output.shotId}.jpg`,
  );
  if (!fs.existsSync(overlayPath)) throw new Error(`overlay-missing:${output.shotId}:${overlayPath}`);
  if (!fs.existsSync(holdFramePath)) {
    return {
      shotId: output.shotId,
      status: "MISSING_HOLD_FRAME",
      packageDir: path.relative(root, packageDir),
      overlayPath: path.relative(root, overlayPath),
      overlaySha256: output.sha256,
      expectedHoldFramePath: path.relative(root, holdFramePath),
      compositePath: null,
      compositeSha256: null,
    };
  }

  const overlayMetadata = await sharp(overlayPath).metadata();
  const width = overlayMetadata.width || 1920;
  const height = overlayMetadata.height || 1080;
  const presenterGeometry = detectPresenterGeometry(holdFramePath);
  const faceOverlap = await alphaCoverageInBounds(
    overlayPath,
    presenterGeometry.faceBounds,
    width,
    height,
  );
  const faceClear = Boolean(
    faceOverlap && faceOverlap.alphaCoverage <= 0.01 && faceOverlap.occupiedPixelCount === 0,
  );
  const compositePath = path.join(compositeDir, `${output.shotId}-hold-frame-composite.png`);
  await sharp(holdFramePath)
    .resize(width, height, {fit: "cover", position: "centre"})
    .composite([{input: overlayPath, blend: "over"}])
    .png()
    .toFile(compositePath);

  const bytes = fs.readFileSync(compositePath);
  return {
    shotId: output.shotId,
    status: "PASS",
    packageDir: path.relative(root, packageDir),
    overlayPath: path.relative(root, overlayPath),
    overlaySha256: output.sha256,
    holdFramePath: path.relative(root, holdFramePath),
    holdFrameSha256: sha256(fs.readFileSync(holdFramePath)),
    compositePath: path.relative(root, compositePath),
    compositeSha256: sha256(bytes),
    width,
    height,
    presenterGeometry,
    faceOverlap: faceOverlap
      ? {...faceOverlap, status: faceClear ? "PASS" : "FAIL", threshold: 0.01}
      : {status: "UNVERIFIED", threshold: 0.01},
  };
}

async function buildContactSheet(composites, outputPath) {
  if (composites.length === 0) return null;
  const cellWidth = 960;
  const cellHeight = 540;
  const columns = 2;
  const rows = Math.ceil(composites.length / columns);
  const canvas = sharp({
    create: {
      width: cellWidth * columns,
      height: cellHeight * rows,
      channels: 3,
      background: "#171717",
    },
  });
  const layers = [];
  for (const [index, composite] of composites.entries()) {
    const inputPath = path.join(root, composite.compositePath);
    const image = await sharp(inputPath)
      .resize(cellWidth, cellHeight, {fit: "cover"})
      .png()
      .toBuffer();
    layers.push({
      input: image,
      left: (index % columns) * cellWidth,
      top: Math.floor(index / columns) * cellHeight,
    });
    layers.push({
      input: labelSvg(`${composite.shotId} · HOLD FRAME PROOF`, cellWidth, cellHeight),
      left: (index % columns) * cellWidth,
      top: Math.floor(index / columns) * cellHeight,
    });
  }
  await canvas.composite(layers).png().toFile(outputPath);
  const bytes = fs.readFileSync(outputPath);
  return {
    path: path.relative(root, outputPath),
    sha256: sha256(bytes),
    bytes: bytes.length,
    columns,
    rows,
  };
}

const packageDir = resolveFromRoot(readArg("--package-dir", defaultPackageDir));
const packageId = path.basename(packageDir);
const outputDir = resolveFromRoot(
  readArg(
    "--output-dir",
    path.join(
      root,
      ".codex-artifacts/system-progress-system-line/independent-package-visual-proof-v1",
      packageId,
    ),
  ),
);
const manifestPath = path.join(packageDir, "manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error(`manifest-missing:${manifestPath}`);

const manifestBytes = fs.readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (!Array.isArray(manifest.outputs) || manifest.outputs.length === 0) {
  throw new Error("manifest-outputs-required");
}

fs.mkdirSync(outputDir, {recursive: true});
const compositeDir = path.join(outputDir, "hold-frame-composites");
fs.mkdirSync(compositeDir, {recursive: true});

const overlays = manifest.outputs.filter(({route}) => route === "OVERLAY_ALPHA");
const fullscreens = manifest.outputs.filter(({route}) => route === "FULLSCREEN_PACKAGE");
const overlayComposites = [];
for (const output of overlays) {
  overlayComposites.push(await buildOverlayComposite({output, packageDir, compositeDir}));
}

const contactSheet = await buildContactSheet(
  overlayComposites.filter(({status}) => status === "PASS"),
  path.join(outputDir, "overlay-hold-frame-contact-sheet.png"),
);
const overlayBitmapDuplicates = duplicateGroups(overlays, ({bitmapSha256}) => bitmapSha256);
const fullscreenBitmapDuplicates = duplicateGroups(fullscreens, ({bitmapSha256}) => bitmapSha256);
const fontAssetIds = [
  ...new Set(
    manifest.outputs.flatMap(({visibleTextNodes = []}) =>
      visibleTextNodes.map(({fontAssetId}) => fontAssetId).filter(Boolean),
    ),
  ),
];
const visibleTextNodeCount = manifest.outputs.reduce(
  (total, {visibleTextNodes = []}) => total + visibleTextNodes.length,
  0,
);
const referenceBindingAudits = manifest.outputs.map((output) => ({shotId: output.shotId, ...validateOutputReferenceBindings(output, {publicRoot, referenceRegistry})}));
const referenceProofCount = referenceBindingAudits.filter(({status}) => status === "PASS").length;
const textRendererBindingAudits = manifest.outputs.map((output) => ({shotId: output.shotId, ...validateOutputTextRendererBindings(output, {publicRoot, fontRegistry})}));
const imageGenProvenanceCount = manifest.outputs.filter((output) => {
  const value = JSON.stringify({
    generationMethod: output.generationMethod,
    provenance: output.provenance,
    assetProvenance: output.assetProvenance,
  }).toLowerCase();
  return value.includes("imagegen") || value.includes("image_gen");
}).length;

const hardGates = [
  {
    id: "overlay-real-hold-frame-proof",
    status: overlayComposites.every(({status}) => status === "PASS") ? "PASS" : "FAIL",
    detail: {
      overlayCount: overlays.length,
      compositeCount: overlayComposites.filter(({status}) => status === "PASS").length,
      missingHoldFrameShotIds: overlayComposites
        .filter(({status}) => status !== "PASS")
        .map(({shotId}) => shotId),
    },
  },
  {
    id: "overlay-semantic-bitmap-diversity",
    status: overlayBitmapDuplicates.length === 0 ? "PASS" : "FAIL",
    detail: {duplicateGroups: overlayBitmapDuplicates},
  },
  {
    id: "overlay-face-occlusion",
    status: overlayComposites.every(({faceOverlap}) => faceOverlap?.status === "PASS")
      ? "PASS"
      : "FAIL",
    detail: {
      failedShotIds: overlayComposites
        .filter(({faceOverlap}) => faceOverlap?.status === "FAIL")
        .map(({shotId}) => shotId),
      unverifiedShotIds: overlayComposites
        .filter(({faceOverlap}) => !faceOverlap || faceOverlap.status === "UNVERIFIED")
        .map(({shotId}) => shotId),
    },
  },
  {
    id: "fullscreen-bitmap-fingerprint-diversity",
    status: fullscreenBitmapDuplicates.length === 0 ? "PASS" : "FAIL",
    detail: {duplicateGroups: fullscreenBitmapDuplicates},
  },
  {
    id: "batch-typography-role-diversity",
    status: visibleTextNodeCount < 8 || fontAssetIds.length >= 2 ? "PASS" : "FAIL",
    detail: {visibleTextNodeCount, fontAssetIds},
  },
  {
    id: "per-node-font-renderer-binding",
    status: textRendererBindingAudits.every(({status}) => status === "PASS") ? "PASS" : "FAIL",
    detail: {failedOutputs: textRendererBindingAudits.filter(({status}) => status !== "PASS")},
  },
  {
    id: "per-output-reference-trait-proof",
    status: referenceProofCount === manifest.outputs.length ? "PASS" : "UNVERIFIED",
    detail: {provedOutputCount: referenceProofCount, outputCount: manifest.outputs.length, audits: referenceBindingAudits},
  },
  {
    id: "per-output-imagegen-provenance",
    status: imageGenProvenanceCount === manifest.outputs.length ? "PASS" : "UNVERIFIED",
    detail: {provedOutputCount: imageGenProvenanceCount, outputCount: manifest.outputs.length},
  },
];
const failedGateIds = hardGates.filter(({status}) => status === "FAIL").map(({id}) => id);
const unverifiedGateIds = hardGates.filter(({status}) => status === "UNVERIFIED").map(({id}) => id);
const body = {
  contract: "A1IndependentPackageVisualProof/v1",
  packageId,
  manifestPath: path.relative(root, manifestPath),
  manifestSha256: sha256(manifestBytes),
  generatedAt: new Date().toISOString(),
  authorityMutationPerformed: false,
  productionArtifact: false,
  resolveMutationPerformed: false,
  finalFilmRendered: false,
  reportScope: "INDEPENDENT_REVIEW_ONLY",
  routeSummary: {overlayCount: overlays.length, fullscreenCount: fullscreens.length},
  overlayComposites,
  contactSheet,
  hardGates,
  automatedHardGateStatus: failedGateIds.length === 0 && unverifiedGateIds.length === 0 ? "PASS" : "FAIL",
  failedGateIds,
  unverifiedGateIds,
  actualPixelProfessionalReviewRequired: true,
  objectiveVisualPassAllowed: false,
  verdict: failedGateIds.length > 0 ? "VISUAL_REJECTED" : "READY_FOR_ACTUAL_PIXEL_REVIEW",
  note: "Technical integrity and generated composites never substitute for professional actual-pixel visual review.",
};
const report = {...body, reportSha256: sha256(Buffer.from(JSON.stringify(body)))};
const reportPath = path.join(outputDir, "report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      status: report.verdict,
      packageId,
      reportPath: path.relative(root, reportPath),
      reportSha256: report.reportSha256,
      contactSheetPath: contactSheet?.path || null,
      failedGateIds,
      unverifiedGateIds,
      authorityMutationPerformed: false,
    },
    null,
    2,
  ),
);
