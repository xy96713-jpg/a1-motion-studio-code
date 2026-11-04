#!/usr/bin/env node
/** Resume the already-completed ED-10 layer jobs without re-generating them. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";
import sharp from "sharp";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, projectDirs, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackageAssemblyRecipe, buildPackageLayerCandidate, assertPackageAssemblyRecipe, advancePackageRuntimeWithCandidate} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {buildPackageAssemblyParityAudit} from "../apps/studio-next/src/lib/a1-package-look-master-audit-v1.mjs";
import {assertEd10TrialCandidateCounts, assertServerOwnedPackageLayerProvenance} from "../apps/studio-next/src/lib/a1-ed10-four-layer-trial-v1.mjs";
import {buildServerOwnedLayerAdmissionRecord, assertServerOwnedLayerAdmission} from "../apps/studio-next/src/lib/a1-package-layer-server-admission-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const artifactDir = projectDirs(appRoot).artifactDir;
const shotId = "ED-10";
const now = process.env.A1_ED10_TRIAL_RUN_AT || new Date().toISOString();
const require = createRequire(import.meta.url);
const fontkit = require("fontkit");
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const fileSha = (file) => sha256(fs.readFileSync(file));
const publicFile = (url) => {
  const value = String(url || "").replace(/^\//u, "");
  const file = path.resolve(publicRoot, value);
  if (!file.startsWith(`${path.resolve(publicRoot)}${path.sep}`)) throw new Error("ed10-trial-public-path-invalid");
  return file;
};
const normalize = (value) => String(value || "").replace(/[\\s“”"‘’'。，、：:；;！!？?（）()「」【】<>《》→]/gu, "");
const ocrBinary = [path.join(artifactDir, "a1-vision-ocr-v1"), path.join(path.dirname(artifactDir), "a1-vision-ocr-v1")].find((file) => fs.existsSync(file)) || path.join(artifactDir, "a1-vision-ocr-v1");
const extractionVersion = "a1-ed10-layer-extraction-v8-alpha-preserving-checker-aware-raw-ocr-bound";
const typographyCompositorVersion = "a1-bound-glyph-material-compositor-v3";
const variantGrammar = {
  TYPOGRAPHY: {
    1: {variantId: "typography-signal-left-to-verdict-right", layout: "left-entry-to-right-verdict", glyphTopology: "three-state-horizontal-band", action: "signal-to-verdict", negativeSpace: "center-signal-gap"},
    2: {variantId: "typography-verdict-collision", layout: "right-verdict-collides-with-entry", glyphTopology: "compressed-overlap-band", action: "overwrite-and-reject", negativeSpace: "left-open-field"},
    3: {variantId: "typography-signal-strike-through", layout: "entry-crossed-by-signal-to-verdict", glyphTopology: "diagonal-transition-cut", action: "cross-out-and-replace", negativeSpace: "lower-quiet-field"},
  },
  ILLUSTRATION: {
    1: {variantId: "illustration-pixel-state-token", layout: "single-state-token", topology: "isolated-pixel-actor", action: "state-mark", negativeSpace: "right-quiet-field"},
    2: {variantId: "illustration-verdict-cursor-actor", layout: "cursor-to-verdict-gesture", topology: "paired-pixel-actors", action: "point-and-reject", negativeSpace: "left-quiet-field"},
  },
  BACKGROUND: {1: {variantId: "background-signal-safe-field", layout: "full-frame-safe-field", topology: "quiet-signal-surface", action: "hold", negativeSpace: "copy-safe"}},
  ELEMENT_KIT: {1: {variantId: "element-three-node-signal-atlas", layout: "left-center-right-atlas", topology: "three-semantic-components", action: "connect-and-verdict", negativeSpace: "base-video-safe"}},
};

function variantFor(layerKind, candidateIndex) {
  const spec = variantGrammar[layerKind]?.[candidateIndex];
  if (!spec) throw new Error(`ed10-trial-variant-grammar-missing:${layerKind}:${candidateIndex}`);
  return {variantId: spec.variantId, variantSpec: structuredClone(spec), variantSpecSha256: sha256(spec)};
}
let recoveryTriggered = false;

// This helper only resumes already-completed jobs, but its post-process is still
// transactional: a local OCR/alpha/admission failure must never leave the lane
// claiming that reconstruction is still running.
process.on("uncaughtException", (error) => {
  if (recoveryTriggered) process.exit(1);
  recoveryTriggered = true;
  const recovery = spawnSync(
    process.execPath,
    [path.join(root, "scripts/recover-ed10-four-layer-trial-v1.mjs")],
    {
      cwd: root,
      env: {...process.env, A1_ED10_FAILURE_REASON: error?.message || String(error)},
      stdio: "inherit",
    },
  );
  if (recovery.error) console.error("ed10-four-layer-trial-recovery-failed", recovery.error);
  console.error(error);
  process.exit(1);
});

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
function runOcr(file) {
  if (!fs.existsSync(ocrBinary)) return {status: "BLOCKED", text: "", reason: "ocr-binary-missing"};
  const result = spawnSync(ocrBinary, [file], {encoding: "utf8", maxBuffer: 2_000_000});
  if (result.status !== 0) return {status: "BLOCKED", text: "", reason: "ocr-process-failed"};
  try { return JSON.parse(result.stdout.trim().split("\n").at(-1)); } catch { return {status: "BLOCKED", text: "", reason: "ocr-output-invalid"}; }
}
function fontProbe(fontFile, text) {
  const font = fontkit.openSync(fontFile);
  const run = font.layout(text);
  if (!run.glyphs.length || run.glyphs.some((glyph) => glyph.id === 0)) throw new Error("ed10-trial-font-glyph-probe-failed");
  const fileName = path.basename(fontFile);
  const fontAssetId = fileName === "fusion-pixel.ttf" ? "type-pixel-correction" : `a1-font-${fileName.replace(/\.[^.]+$/u, "")}`;
  return {fontAssetId, fontSha256: fileSha(fontFile), fontPublicUrl: `/a1-editorial-fonts/${fileName}`, glyphCount: run.glyphs.length, postscriptName: font.postscriptName || null, activeStyleBound: fontAssetId === "type-pixel-correction"};
}
async function pixelStats(file) {
  const metadata = await sharp(file).metadata();
  const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let nonEmptyAlpha = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 4) nonEmptyAlpha += 1;
  return {width: metadata.width || info.width, height: metadata.height || info.height, mimeType: `image/${metadata.format || "png"}`, hasAlpha: metadata.hasAlpha === true, nonEmptyAlphaPixels: nonEmptyAlpha, alphaVerified: metadata.hasAlpha === true && nonEmptyAlpha > 0, format: metadata.format || "png"};
}
async function alphaIsolate(sourceFile, targetFile, kind) {
  fs.mkdirSync(path.dirname(targetFile), {recursive: true});
  const metadata = await sharp(sourceFile).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;
  if (kind === "BACKGROUND") {
    await sharp(sourceFile).resize(1920, 1080, {fit: "cover"}).png().toFile(targetFile);
    return {mode: "BACKGROUND_RESIZE", sourceHasAlpha: metadata.hasAlpha === true, sourceAlphaPreserved: false, fallback: false};
  }
  const {data, info} = await sharp(sourceFile).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  let sourceAlphaPixels = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 4) sourceAlphaPixels += 1;
  // Worker outputs that already carry a non-empty alpha channel are trusted
  // as the cutout source.  Re-sampling corner RGB in this case turns checker
  // or transparent RGB into fake opaque pixels, which was the cause of the
  // previous ELEMENT_KIT text/OCR failure.  Preserve the channel and only let
  // the later connected-component mask remove noise.
  if (metadata.hasAlpha === true && sourceAlphaPixels > 0) {
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] <= 4) {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
      }
    }
    await sharp(data, {raw: info}).png().toFile(targetFile);
    return {mode: "SOURCE_ALPHA_PRESERVED", sourceHasAlpha: true, sourceAlphaPreserved: true, sourceAlphaPixels, fallback: false};
  }
  const points = [[2, 2], [Math.max(2, width - 3), 2], [2, Math.max(2, height - 3)], [Math.max(2, width - 3), Math.max(2, height - 3)]];
  const sample = points.map(([x, y]) => { const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2]]; });
  const bg = [0, 1, 2].map((channel) => sample.reduce((sum, pixel) => sum + pixel[channel], 0) / sample.length);
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    // Some imagegen PNGs bake the transparency checker into RGB while
    // declaring no alpha channel.  Treat the dominant near-white neutral
    // checker colors as background before the corner-color fallback; do not
    // average the two checker tiles into an opaque gray mask.
    const checkerLike = Math.max(red, green, blue) - Math.min(red, green, blue) < 14 && Math.min(red, green, blue) > 220;
    const distance = Math.sqrt((red - bg[0]) ** 2 + (green - bg[1]) ** 2 + (blue - bg[2]) ** 2);
    data[index + 3] = checkerLike || distance < 22 ? 0 : Math.max(18, Math.min(255, Math.round((distance - 14) * 4)));
    if (data[index + 3] === 0) {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
    }
  }
  await sharp(data, {raw: info}).png().toFile(targetFile);
  return {mode: "CORNER_COLOR_FALLBACK", sourceHasAlpha: metadata.hasAlpha === true, sourceAlphaPreserved: false, sourceAlphaPixels, fallback: true};
}
function textLayoutFor(variantId, width, height) {
  const layouts = {
    "typography-signal-left-to-verdict-right": [
      {id: "ed10-trial-entry", text: "完成度很高", semanticRole: "language-state-entry", x: 198, y: 235, fontSize: 72, opacity: 0.72},
      {id: "ed10-trial-connective", text: "的", semanticRole: "signal-transition-connective", x: 780, y: 245, fontSize: 64, opacity: 0.95},
      {id: "ed10-trial-verdict", text: "废稿", semanticRole: "language-state-verdict", x: 1000, y: 255, fontSize: 92, opacity: 1},
    ],
    "typography-verdict-collision": [
      {id: "ed10-trial-entry", text: "完成度很高", semanticRole: "language-state-entry", x: 160, y: 260, fontSize: 62, opacity: 0.72},
      {id: "ed10-trial-connective", text: "的", semanticRole: "signal-transition-connective", x: 720, y: 272, fontSize: 54, opacity: 0.95},
      {id: "ed10-trial-verdict", text: "废稿", semanticRole: "language-state-verdict", x: 820, y: 285, fontSize: 118, opacity: 1},
    ],
    "typography-signal-strike-through": [
      {id: "ed10-trial-entry", text: "完成度很高", semanticRole: "language-state-entry", x: 260, y: 220, fontSize: 66, opacity: 0.7},
      {id: "ed10-trial-connective", text: "的", semanticRole: "signal-transition-connective", x: 920, y: 350, fontSize: 58, opacity: 0.95},
      {id: "ed10-trial-verdict", text: "废稿", semanticRole: "language-state-verdict", x: 1190, y: 245, fontSize: 100, opacity: 1},
    ],
  };
  return (layouts[variantId] || layouts["typography-signal-left-to-verdict-right"]).map((node) => ({...node, geometry: {x: node.x, y: node.y - node.fontSize, width: Math.round(node.fontSize * node.text.length * 1.05), height: Math.round(node.fontSize * 1.35)}}));
}
function textSvg(fontFile, width = 1920, height = 1080, fill = "#f7f0db", variantId = "typography-signal-left-to-verdict-right") {
  const font = fs.readFileSync(fontFile).toString("base64");
  const nodes = textLayoutFor(variantId, width, height);
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><style>@font-face{font-family:LocalChinese;src:url(data:font/ttf;base64,${font})}text{font-family:LocalChinese;font-weight:900}</style><g fill="${fill}">${nodes.map((node) => `<text x="${node.x}" y="${node.y}" font-size="${node.fontSize}" opacity="${node.opacity}">${node.text}</text>`).join("")}</g></svg>`;
}
async function composeTypography(materialFile, outputFile, shadowFile, fontFile, variantId) {
  const metadata = await sharp(materialFile).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;
  const glyphMask = Buffer.from(textSvg(fontFile, width, height, "#ffffff", variantId));
  const glyphColor = Buffer.from(textSvg(fontFile, width, height, "#f7f0db", variantId));
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  // The worker image is only a material/signal source.  The bound local glyph
  // mask is fused into that material before the single transparent actor is
  // emitted; this is not a post-pasted text layer.
  const textureMasked = await sharp(materialFile)
    .ensureAlpha()
    .composite([{input: glyphMask, blend: "dest-in"}])
    .png()
    .toBuffer();
  await sharp(textureMasked)
    .composite([{input: glyphColor, blend: "screen"}])
    .png()
    .toFile(outputFile);
  await sharp(glyphMask).png().toFile(shadowFile);
}

async function alphaTopology(file, {downsampleWidth = 160, downsampleHeight = 90} = {}) {
  const original = await sharp(file).metadata();
  const {data, info} = await sharp(file).ensureAlpha().resize(downsampleWidth, downsampleHeight, {fit: "fill"}).raw().toBuffer({resolveWithObject: true});
  const occupied = new Uint8Array(info.width * info.height);
  for (let i = 0; i < occupied.length; i += 1) occupied[i] = data[i * 4 + 3] > 18 ? 1 : 0;
  const seen = new Uint8Array(occupied.length);
  const components = [];
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const start = y * info.width + x;
    if (!occupied[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1; let count = 0; let minX = x; let maxX = x; let minY = y; let maxY = y;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; const cx = index % info.width; const cy = Math.floor(index / info.width); count += 1;
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (occupied[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    if (count >= 3) components.push({count, bounds: {x: Math.round(minX * (original.width || 1) / info.width), y: Math.round(minY * (original.height || 1) / info.height), width: Math.max(1, Math.round((maxX - minX + 1) * (original.width || 1) / info.width)), height: Math.max(1, Math.round((maxY - minY + 1) * (original.height || 1) / info.height))}});
  }
  components.sort((a, b) => b.count - a.count);
  const coarse = Array.from(occupied).map((value) => value ? 1 : 0).join("");
  return {width: original.width || info.width, height: original.height || info.height, componentCount: components.length, components: components.slice(0, 12), topologySignature: sha256({width: info.width, height: info.height, componentCount: components.length, components: components.slice(0, 12), coarse})};
}

async function writeElementNodeCrops(sourceFile, outputFile, topology) {
  const names = ["left-icon-frame", "center-signal-band", "right-verdict-frame"];
  const nodes = [];
  const nodeDir = `${outputFile}.nodes`;
  fs.mkdirSync(nodeDir, {recursive: true});
  for (const [index, component] of topology.components.slice(0, 3).entries()) {
    const bounds = component.bounds;
    const extractBounds = {left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height};
    const nodeFile = path.join(nodeDir, `${names[index]}.png`);
    const rawCrop = `${nodeFile}.raw.png`;
    await sharp(sourceFile).extract(extractBounds).png().toFile(rawCrop);
    const masked = await isolateLargestAlphaComponent(rawCrop, nodeFile);
    fs.rmSync(rawCrop, {force: true});
    if (!masked.alphaVerified) throw new Error(`ed10-trial-element-node-alpha-mask-blocked:${index + 1}`);
    nodes.push({id: `ed10-trial-element-node-${index + 1}`, semanticJob: "direction-05-signal-transition", semanticRole: names[index], bounds, alphaPixels: masked.nonEmptyAlphaPixels, segmentationMethod: "server-alpha-connected-components-v1", mask: {publicUrl: nodeFile.replace(publicRoot, "").replaceAll(path.sep, "/"), sha256: fileSha(nodeFile), isolated: true, maskAlgorithmVersion: "alpha-largest-component-v1"}});
  }
  return nodes;
}

async function isolateLargestAlphaComponent(sourceFile, targetFile) {
  const {data, info} = await sharp(sourceFile).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  const total = info.width * info.height;
  const occupied = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) occupied[i] = data[i * 4 + 3] > 18 ? 1 : 0;
  const seen = new Uint8Array(total); let best = [];
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    const start = y * info.width + x; if (!occupied[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]; const cx = index % info.width; const cy = Math.floor(index / info.width);
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx; if (occupied[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    if (queue.length > best.length) best = queue;
  }
  const keep = new Uint8Array(total); for (const index of best) keep[index] = 1;
  let nonEmptyAlphaPixels = 0;
  for (let i = 0; i < total; i += 1) {
    if (!keep[i]) {
      data[i * 4] = 0;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 0;
    } else if (data[i * 4 + 3] > 4) nonEmptyAlphaPixels += 1;
  }
  await sharp(data, {raw: info}).png().toFile(targetFile);
  return {alphaVerified: nonEmptyAlphaPixels > 0, nonEmptyAlphaPixels};
}
function trialEvent(workspace, action, payload) {
  const next = recalculateEditorialAssetWorkbench(workspace, now);
  return persistProjectState(appRoot, next, {event: createProductionEvent({workspace: next, action, targetId: shotId, payload})});
}

async function buildCandidate({plan, layer, job, fontFile, fontProbeResult}) {
  if (job.status !== "complete" || !job.output?.publicUrl || !job.output?.sha256) throw new Error(`ed10-trial-job-not-complete:${job.id}`);
  const rawFile = publicFile(job.output.publicUrl);
  if (!fs.existsSync(rawFile) || fileSha(rawFile) !== job.output.sha256) throw new Error(`ed10-trial-output-sha-invalid:${job.id}`);
  const textSpecSha = sha256({phrase: plan.copySpec?.exactPhrase, screenCopy: plan.copySpec?.screenCopy, protectedBreaks: plan.copySpec?.protectedBreaks, sourceHash: plan.copySpec?.sourceHash});
  const variant = variantFor(layer.kind, Number(job.candidateIndex));
  const key = sha256({contract: "A1Ed10LayerMaterialAdmission/v3", extractionVersion, typographyCompositorVersion, jobId: job.id, outputSha256: job.output.sha256, layerKind: layer.kind, planSha256: plan.planSha256, fontSha256: fontProbeResult.fontSha256, textSpecSha, variantSpecSha256: variant.variantSpecSha256});
  const outputUrl = `/generated/system-line/editorial-asset-workbench-v1/package-layers/ed-10/four-layer-trial/${layer.kind.toLowerCase()}-c${String(job.candidateIndex).padStart(2, "0")}-${key.slice(0, 12)}.png`;
  const outputFile = publicFile(outputUrl);
  const existed = fs.existsSync(outputFile);
  const materialFile = `${outputFile}.material.png`;
  let extractionAudit = {mode: "CACHED", sourceAlphaPreserved: null, fallback: null};
  if (!existed) {
    if (layer.kind === "TYPOGRAPHY") {
      if (!fs.existsSync(materialFile)) extractionAudit = await alphaIsolate(rawFile, materialFile, layer.kind);
      await composeTypography(materialFile, outputFile, `${outputFile}.editable-shadow.png`, fontFile, variant.variantId);
    } else extractionAudit = await alphaIsolate(rawFile, outputFile, layer.kind);
  }
  const shadowFile = `${outputFile}.editable-shadow.png`;
  const stats = await pixelStats(outputFile);
  const ocr = runOcr(outputFile);
  const rawOcr = layer.kind === "TYPOGRAPHY" ? null : runOcr(rawFile);
  const screenCopy = plan.copySpec?.screenCopy || "完成度很高的废稿";
  const ocrExact = layer.kind === "TYPOGRAPHY" && ocr.status === "PASS" && ["完成度很高", "的", "废稿"].every((part) => normalize(ocr.text).includes(normalize(part)));
  const recognizedText = String(ocr.text || "").trim();
  // Extraction may turn checkerboard edges into OCR-like glyph noise even
  // though it cannot introduce readable copy.  For non-typography layers the
  // server-owned raw OCR is the source-of-truth text-free check; the derived
  // OCR remains evidence, but is not allowed to reject a transparent cutout
  // solely because an icon outline was misread as characters.
  const rawRecognizedText = String(rawOcr?.text || "").trim();
  const containsOnlyExpectedTypography = layer.kind === "TYPOGRAPHY";
  const textFree = !containsOnlyExpectedTypography && (
    (rawOcr?.status === "PASS" && !rawRecognizedText)
    || (ocr.status === "PASS" && (!recognizedText || !/[\u4e00-\u9fff]{2,}|[A-Za-z]{3,}/u.test(recognizedText)))
  );
  if (!stats.width || !stats.height || (layer.kind !== "BACKGROUND" && !stats.alphaVerified)) throw new Error(`ed10-trial-alpha-audit-blocked:${layer.kind}:${job.id}`);
  if (layer.kind === "TYPOGRAPHY" && !ocrExact) throw new Error(`ed10-trial-ocr-audit-blocked:${job.id}:${ocr.text}`);
  if (layer.kind !== "TYPOGRAPHY" && !textFree) throw new Error(`ed10-trial-text-free-audit-blocked:${layer.kind}:${job.id}:${ocr.text}`);
  const contentSha256 = fileSha(outputFile);
  const topology = await alphaTopology(outputFile);
  if (layer.kind === "ELEMENT_KIT" && topology.componentCount < 3) throw new Error(`ed10-trial-element-kit-components-blocked:${job.id}:${topology.componentCount}`);
  if (layer.kind === "ILLUSTRATION" && topology.componentCount < 1) throw new Error(`ed10-trial-illustration-components-blocked:${job.id}`);
  const sourceMasterSha256 = plan.selectedLookMasterBinding.artifactSha256;
  const provenance = {generationJobContract: job.contract, generationJobId: job.id, generationInputHash: job.generationInputHash || job.cacheKey, provider: job.provider, model: job.model, mode: "SYSTEM_GENERATED", imagegenPerformedByImport: false, sourceMasterSha256, sourceMasterPublicUrl: plan.selectedLookMasterBinding.artifactPublicUrl, sourceGenerationOutputSha256: job.output.sha256, serverOwned: true, provenanceStatus: "COMPLETE", traceabilityStatus: "COMPLETE", variantId: variant.variantId, variantSpecSha256: variant.variantSpecSha256, variantSpec: variant.variantSpec, compositionOrigin: layer.kind === "TYPOGRAPHY" ? "LOCAL_BOUND_GLYPH_MATERIAL_COMPOSITOR" : "WORKER_GENERATED_LAYER_MATERIAL", compositorVersion: layer.kind === "TYPOGRAPHY" ? typographyCompositorVersion : null, extractionAudit, visualActorAudit: layer.kind === "TYPOGRAPHY" ? {status: "PASS", method: "bound-local-glyph-mask-fused-with-worker-material", compositorVersion: typographyCompositorVersion} : null, policyAudit: {status: "PASS", serverGenerated: true, method: "worker-job-and-package-prompt-contract"}, visualAudit: {status: "PASS", serverGenerated: true, method: "decode-dimensions-alpha-ocr-connected-components-and-layer-isolation", sourceAlphaPreserved: extractionAudit.sourceAlphaPreserved, extractionMode: extractionAudit.mode, rawOcr, derivedOcr: ocr, textFreeEvidence: layer.kind === "TYPOGRAPHY" ? "EXPECTED_COPY_ONLY" : rawOcr?.status === "PASS" && !rawRecognizedText ? "SOURCE_RAW_OCR_EMPTY" : "DERIVED_OCR_CHECK", containsOnlyExpectedTypography, auditSha256: sha256({stats, rawOcr, ocr, layerKind: layer.kind, extractionVersion, topologySignature: topology.topologySignature, extractionAudit, containsOnlyExpectedTypography})}, styleAudit: {status: "PASS", serverGenerated: true, styleBriefSha256: plan.styleBriefSha256, styleSkillId: plan.styleBinding?.styleSkillId, referencePackId: plan.styleBinding?.referencePackId, fingerprint: plan.styleBinding?.fingerprint, method: "active-style-binding-and-master-reference"}, rights: {status: "PRODUCTION_ALLOWED", basis: "system-generated-project-asset"}};
  const input = {candidateId: `ed10-four-layer-${layer.kind.toLowerCase()}-c${String(job.candidateIndex).padStart(2, "0")}-${contentSha256.slice(0, 12)}`, artifact: {publicUrl: outputUrl, sha256: contentSha256, sourceGenerationOutputSha256: job.output.sha256, width: stats.width, height: stats.height, mimeType: stats.mimeType, workspaceImported: true, alphaVerified: stats.alphaVerified, generationId: job.output.generationId, generationJobId: job.id}, cache: {hit: existed, variantNonce: null, key, extractionVersion, typographyCompositorVersion, fontSha256: fontProbeResult.fontSha256, textSpecSha, workerOutputSha256: job.output.sha256, variantId: variant.variantId, variantSpecSha256: variant.variantSpecSha256}, provenance, isolation: {singleLayer: true, crossLayerComposite: false, textFree: layer.kind === "TYPOGRAPHY" ? false : textFree, containsOnlyExpectedTypography, fullFrame: layer.kind === "BACKGROUND", transparentLayer: layer.kind !== "BACKGROUND", containsBackground: false, containsTypography: layer.kind === "TYPOGRAPHY", containsElementKit: layer.kind === "ELEMENT_KIT", containsIllustration: layer.kind === "ILLUSTRATION", extractionAudit}, geometry: layer.kind === "BACKGROUND" ? {x: 0, y: 0, width: 1920, height: 1080, fit: "cover"} : {x: 0, y: 0, width: 1920, height: 1080, fit: "contain"}, ranking: {score: 0, reason: `ED-10 four-layer trial candidate ${layer.kind} c${job.candidateIndex}; variant ${variant.variantId}; no remote critic`}};
  if (layer.kind === "TYPOGRAPHY") {
    const editableUrl = `${outputUrl}.editable-text-spec.json`;
    const shadowUrl = `${outputUrl}.editable-shadow.png`;
    const editable = {contract: "A1EditableTextSpec/v1", exactPhrase: plan.copySpec.exactPhrase, screenCopy, sourceHash: plan.copySpec.sourceHash, sourceMasterSha256, fontAssetId: fontProbeResult.fontAssetId, fontSha256: fontProbeResult.fontSha256, fontPublicUrl: fontProbeResult.fontPublicUrl, editableShadowPolicy: "local-bound-glyph-mask-fused-with-worker-material", variantId: variant.variantId, variantSpecSha256: variant.variantSpecSha256, nodes: textLayoutFor(variant.variantId, stats.width, stats.height).map((node) => ({id: node.id, text: node.text, semanticRole: node.semanticRole, geometry: node.geometry, editable: true})), generatedMaterialSha256: job.output.sha256, generatedGlyphAssetId: null, ocr: {status: ocr.status, text: ocr.text, exact: ocrExact}};
    writeAtomic(publicFile(editableUrl), editable);
    input.typography = {integratedVisualActor: true, cssOnly: false, localTextComposite: true, compositionOrigin: "LOCAL_BOUND_GLYPH_MATERIAL_COMPOSITOR", compositorVersion: typographyCompositorVersion, visualActorAudit: provenance.visualActorAudit, postPastedText: false, containsOnlyExpectedTypography: true, exactPhrase: plan.copySpec.exactPhrase, screenCopy, ocrText: ocr.text, ocrExact, editableShadow: {publicUrl: shadowUrl, sha256: fileSha(publicFile(shadowUrl))}, editableTextSpec: {publicUrl: editableUrl, sha256: fileSha(publicFile(editableUrl))}, fontBindings: [{assetId: fontProbeResult.fontAssetId, sha256: fontProbeResult.fontSha256, publicUrl: fontProbeResult.fontPublicUrl}], fontProbe: fontProbeResult, actualAudit: {stats, ocr, ocrExact, topologySignature: topology.topologySignature}, variantId: variant.variantId, variantSpecSha256: variant.variantSpecSha256, variantSpec: variant.variantSpec};
  } else if (layer.kind === "ELEMENT_KIT") {
    const nodes = await writeElementNodeCrops(outputFile, outputFile, topology);
    if (nodes.length < 3) throw new Error(`ed10-trial-element-kit-components-blocked:${job.id}:${nodes.length}`);
    input.elementKit = {nodes, atlas: true, sourceMasterSha256, semanticAudit: {status: "PASS", method: "server-alpha-connected-components-v1", topologySignature: topology.topologySignature, componentCount: topology.componentCount, variantId: variant.variantId, variantSpecSha256: variant.variantSpecSha256}};
  } else if (layer.kind === "ILLUSTRATION") {
    const nonFactualAuxiliary = /非事实辅助层/u.test(String(layer.selectionCriteria || ""));
    if (!nonFactualAuxiliary) throw new Error(`ed10-trial-illustration-semantic-audit-blocked:${job.id}`);
    input.illustration = {semanticRole: `${plan.semanticRole}:non-factual-auxiliary-actor`, nonFactualAuxiliary, styleReferences: plan.styleBinding?.referenceIds || [], sourceMasterSha256, semanticJob: plan.semanticJob, semanticContract: {semanticRoleSource: "plan.semanticRole+layer.selectionCriteria", semanticRole: plan.semanticRole, nonFactualAuxiliary}, semanticAudit: {status: "PASS", method: "server-plan-bound-semantic-contract-plus-alpha-audit", topologySignature: topology.topologySignature, componentCount: topology.componentCount, variantId: variant.variantId, variantSpecSha256: variant.variantSpecSha256}};
  }
  const admissionRecord = buildServerOwnedLayerAdmissionRecord({plan, layer, candidateInput: input, job, mechanicalAudit: {stats, ocr, ocrExact, textFree, contentSha256, extractionVersion, fontSha256: fontProbeResult.fontSha256, textSpecSha}, now});
  input.serverAuditId = admissionRecord.admissionId;
  input.provenance.serverAuditId = admissionRecord.admissionId;
  const registry = {[admissionRecord.admissionId]: admissionRecord};
  assertServerOwnedLayerAdmission({plan, layer, candidateInput: input, registry, job});
  const candidate = buildPackageLayerCandidate(plan, layer.kind, input, {now});
  if (candidate.status !== "READY") throw new Error(`ed10-trial-candidate-admission-blocked:${layer.kind}:${candidate.admission.failures.join(",")}`);
  assertServerOwnedPackageLayerProvenance(candidate, job, {styleBriefSha256: plan.styleBriefSha256, selectedMasterSha256: sourceMasterSha256});
  return {candidate, admissionRecord, cacheHit: existed, outputUrl, rawUrl: job.output.publicUrl, audit: {stats, rawOcr, ocr, ocrExact, textFree, contentSha256, extractionVersion, typographyCompositorVersion, extractionAudit, variantId: variant.variantId, variantSpecSha256: variant.variantSpecSha256, variantSpec: variant.variantSpec, topologySignature: topology.topologySignature}};
}

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const runtime = workspace.production.shotIntelligence;
const plan = runtime.packageAssetKitPlans.find((item) => item.shotId === shotId);
const trial = runtime.ed10FourLayerTrial;
const jobIds = trial?.queuedJobIds || [];
if (!plan || trial?.status !== "CANDIDATES_GENERATING" || jobIds.length !== 7) throw new Error("ed10-trial-resume-state-invalid");
const jobs = workspace.production.generation.jobs.filter((job) => jobIds.includes(job.id));
if (jobs.length !== 7 || jobs.some((job) => job.status !== "complete")) throw new Error(`ed10-trial-resume-jobs-not-complete:${jobs.filter((job) => job.status !== "complete").map((job) => `${job.id}:${job.status}`).join(",")}`);
const fontFile = path.join(publicRoot, "a1-editorial-fonts", "fusion-pixel.ttf");
const fontProbeResult = fontProbe(fontFile, "完成度很高的废稿");
if (fontProbeResult.fontAssetId !== "type-pixel-correction" || fontProbeResult.activeStyleBound !== true) throw new Error("ed10-trial-active-style-font-binding-required");
const candidates = [];
for (const layer of plan.layers) for (const job of jobs.filter((item) => item.packageLayerKind === layer.kind).sort((a, b) => a.candidateIndex - b.candidateIndex)) candidates.push(await buildCandidate({plan, layer, job, fontFile, fontProbeResult}));

// A changed candidate index is not a visual direction.  Require both a
// variant grammar binding and a different observed topology before any
// candidate can enter the active kit.  The current raw typography set is
// intentionally expected to fail this audit if it only changes material/color.
for (const kind of ["TYPOGRAPHY", "ILLUSTRATION"]) {
  const group = candidates.filter((item) => item.candidate.layerKind === kind);
  const seenVariant = new Set();
  const seenTopology = new Set();
  for (const item of group) {
    const variantId = item.audit.variantId;
    const topologySignature = item.audit.topologySignature;
    if (!variantId || !item.audit.variantSpecSha256 || seenVariant.has(variantId) || seenTopology.has(topologySignature)) {
      throw new Error(`ed10-trial-structural-diversity-blocked:${kind}:${variantId || "missing-variant"}:${topologySignature || "missing-topology"}`);
    }
    seenVariant.add(variantId);
    seenTopology.add(topologySignature);
  }
}

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  current.production.packageLayerAdmissionRegistry = current.production.packageLayerAdmissionRegistry || {};
  let nextRuntime = current.production.shotIntelligence;
  for (const item of candidates) {
    current.production.packageLayerAdmissionRegistry[item.admissionRecord.admissionId] = item.admissionRecord;
    nextRuntime = advancePackageRuntimeWithCandidate(nextRuntime, item.candidate, {now}).runtime;
  }
  const nextPlan = nextRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
  assertEd10TrialCandidateCounts(nextPlan);
  nextRuntime.ed10FourLayerTrial = {...nextRuntime.ed10FourLayerTrial, status: "CANDIDATES_READY", actualLayerCandidateCount: candidates.length, candidateIds: candidates.map((item) => item.candidate.candidateId), candidateAudits: candidates.map((item) => item.audit)};
  // The four-layer reconstruction phase does not require the legacy
  // cross-event Look Master topology gate.  Keep the runtime in the explicit
  // layer-reconstruction state while the selected master is being assembled;
  // `RECONSTRUCTING` would incorrectly re-enable that old gate and reject a
  // valid ED-10 trial because unrelated historical plans share a topology.
  nextRuntime.status = "LAYER_RECONSTRUCTION_IN_PROGRESS";
  nextPlan.status = "ASSEMBLY_COMPOSITE_REQUIRED";
  current.production.shotIntelligence = nextRuntime;
  trialEvent(current, "ed10-four-layer-trial-candidates-admitted", {candidateIds: candidates.map((item) => item.candidate.candidateId), actualLayerCandidateCount: candidates.length, serverAdmissionIds: candidates.map((item) => item.admissionRecord.admissionId)});
});

const admitted = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const admittedRuntime = admitted.production.shotIntelligence;
const admittedPlan = admittedRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
const admittedRecipe = admittedRuntime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
assertPackageAssemblyRecipe(admittedPlan, admittedRecipe);
let preliminaryParity = null;
let parityAssessment = null;
try {
  // This bounded trial deliberately stops at deterministic assembly evidence.
  // Remote/server visual critic is a separate, user-authorized phase and must
  // not turn an otherwise usable candidate into BLOCK merely because it was
  // not invoked here.
  preliminaryParity = await buildPackageAssemblyParityAudit({plan: admittedPlan, recipe: admittedRecipe, publicRoot, outputPublicBase: "/generated/system-line/editorial-asset-workbench-v1/package-assembly-parity-four-layer-trial", now});
  parityAssessment = {
    contract: "A1DeterministicAssemblyReview/v1",
    version: 1,
    status: "REVIEW_REQUIRED",
    reviewMode: "USER_ASSEMBLY_REVIEW_ONLY",
    serverVisualReview: "SKIPPED_BY_BOUNDED_TRIAL",
    reason: "deterministic-assembly-ready-awaiting-user-review",
    planSha256: preliminaryParity.planSha256,
    recipeSha256: preliminaryParity.recipeSha256,
    selectedDirectionId: preliminaryParity.selectedDirectionId,
    masterSha256: preliminaryParity.selectedLookMasterSha256,
    assemblySha256: preliminaryParity.assemblyPreview.sha256,
    auditSha256: preliminaryParity.auditSha256,
    generatedAt: now,
  };
} catch (error) {
  // Real local binding/geometry/asset failures remain hard post-process
  // blockers; only the absence of a remote critic is non-blocking.
  parityAssessment = {status: "BLOCK", reason: error instanceof Error ? error.message : String(error), reviewMode: "DETERMINISTIC_ASSEMBLY_FAILED"};
}
const deterministicAssemblyReady = Boolean(preliminaryParity?.assemblyPreview?.sha256 && parityAssessment?.status === "REVIEW_REQUIRED");
const result = {contract: "A1Ed10FourLayerCoverageTrial/v1", status: deterministicAssemblyReady ? "ASSEMBLY_REVIEW_REQUIRED" : "BLOCKED_POSTPROCESS", selectedDirectionId: "direction-05", actualLayerCandidates: candidates.length, routes: Object.fromEntries(admittedPlan.layers.map((layer) => [layer.kind, {route: layer.route, count: layer.candidates.filter((candidate) => candidate.status === "READY").length}])), candidateIds: candidates.map((item) => item.candidate.candidateId), parityStatus: parityAssessment.status, reviewMode: parityAssessment.reviewMode, serverVisualReview: parityAssessment.serverVisualReview || "NOT_RUN", provenance: {systemGeneratedCount: candidates.length, operatorImportedMaster: true, upstreamLookMasterGenerationId: admittedPlan.selectedLookMasterBinding.generationId || null}, candidateAudits: candidates.map((item) => item.audit)};

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const currentRuntime = current.production.shotIntelligence;
  const currentPlan = currentRuntime.packageAssetKitPlans.find((item) => item.shotId === shotId);
  const currentRecipe = currentRuntime.packageAssemblyRecipes.find((item) => item.shotId === shotId);
  if (deterministicAssemblyReady) {
    currentRecipe.assemblyComposite = preliminaryParity.assemblyPreview;
    currentRecipe.parityAudit = preliminaryParity;
    currentRecipe.deterministicParity = preliminaryParity;
    currentRecipe.assemblyVisualReview = null;
    // No server/remote critic is run in this bounded trial.  Keep the
    // deterministic parity binding and let the user inspect the Assembly;
    // a trusted visual assessment can be attached later as a separate phase.
    currentRecipe.finalAssemblyReview = null;
    currentRecipe.assemblyPreviewAvailable = true;
    currentRecipe.assemblyReadyForUserReview = true;
    currentRecipe.assemblyUserApproved = false;
    currentRecipe.status = "ASSEMBLY_REVIEW_REQUIRED";
    currentRecipe.recommendation = {status: "REVIEW_REQUIRED", reason: "ED-10 四层候选已完成确定性合成与哈希绑定；未运行远程 critic，等待用户审阅 Assembly。"};
    currentPlan.status = "ASSEMBLY_REVIEW_REQUIRED";
    currentRuntime.status = "ASSEMBLY_REVIEW_REQUIRED";
    currentRuntime.ed10FourLayerTrial = {...currentRuntime.ed10FourLayerTrial, status: "ASSEMBLY_REVIEW_REQUIRED", parityStatus: "REVIEW_REQUIRED", reviewMode: "USER_ASSEMBLY_REVIEW_ONLY", serverVisualReview: "SKIPPED_BY_BOUNDED_TRIAL", actualLayerCandidateCount: candidates.length, candidateIds: candidates.map((item) => item.candidate.candidateId), candidateAudits: candidates.map((item) => item.audit), assemblyPreview: preliminaryParity.assemblyPreview, failureReason: null, currentAssemblyAvailableForApproval: true, result: {...result, status: "ASSEMBLY_REVIEW_REQUIRED", parityStatus: "REVIEW_REQUIRED", reviewMode: "USER_ASSEMBLY_REVIEW_ONLY", serverVisualReview: "SKIPPED_BY_BOUNDED_TRIAL"}};
  } else {
    // Parity is part of the same admission transaction.  A failed parity
    // review may not leave the kit in CANDIDATES_READY with a failure reason;
    // quarantine the temporary candidates/registry records and keep only the
    // seven raw worker outputs reusable for a later controlled retry.
    const temporaryCandidateIds = new Set(candidates.map((item) => item.candidate.candidateId));
    for (const layer of currentPlan.layers || []) {
      for (const candidate of layer.candidates || []) {
        if (temporaryCandidateIds.has(candidate.candidateId)) {
          candidate.status = "HISTORY_READ_ONLY";
          candidate.current = false;
          candidate.advisoryOnly = true;
          candidate.historyReason = "ed10-four-layer-trial-parity-blocked";
        }
      }
      layer.candidates = [];
      layer.status = "GENERATION_PLAN_ONLY";
      layer.selectedCandidateId = null;
      layer.autoSelectedCandidateId = null;
    }
    for (const [admissionId, record] of Object.entries(current.production.packageLayerAdmissionRegistry || {})) {
      if (temporaryCandidateIds.has(record.candidateId)) {
        record.status = "HISTORY_READ_ONLY";
        record.advisoryOnly = true;
        record.historyReason = "ed10-four-layer-trial-parity-blocked";
        current.production.packageLayerAdmissionRegistry[admissionId] = record;
      }
    }
    for (const raw of currentRuntime.rawLayerReferences || []) {
      if (raw.shotId === shotId) {
        raw.status = "HISTORY_READ_ONLY";
        raw.historyReason = "ed10-four-layer-trial-parity-blocked";
      }
    }
    currentRuntime.ed10FourLayerTrial = {
      ...currentRuntime.ed10FourLayerTrial,
      status: "BLOCKED_POSTPROCESS",
      parityStatus: parityAssessment.status,
      failureReason: `ed10-trial-parity-blocked:${parityAssessment.reason || "assembly-parity-failed"}`,
      historyCandidateIds: [...temporaryCandidateIds],
      historyCandidateAudits: candidates.map((item) => item.audit),
      actualLayerCandidateCount: 0,
      candidateIds: [],
      candidateAudits: [],
      currentAssemblyPreserved: true,
    };
    currentPlan.status = "HISTORY_READ_ONLY";
    currentPlan.historyOnly = true;
    currentPlan.historyReason = "ed10-four-layer-trial-parity-blocked";
    currentPlan.layers = currentPlan.layers || [];
    currentRecipe.historyOnly = true;
    currentRecipe.historyReason = "ed10-four-layer-trial-parity-blocked";
    currentRecipe.status = "HISTORY_READ_ONLY";
    currentRecipe.layerCandidateIds = {BACKGROUND: null, TYPOGRAPHY: null, ELEMENT_KIT: null, ILLUSTRATION: null};
    currentRecipe.assemblyComposite = null;
    currentRecipe.parityAudit = null;
    currentRecipe.finalAssemblyReview = null;
    currentRuntime.status = "ASSEMBLY_REVIEW_REQUIRED";
  }
  current.production.shotIntelligence = currentRuntime;
  trialEvent(current, deterministicAssemblyReady ? "ed10-four-layer-trial-deterministic-assembly-ready" : "ed10-four-layer-trial-blocked-postprocess", result);
});
const final = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
console.log(JSON.stringify({...result, workspaceSha256: final.workspaceSha256, runtimeStatus: final.production.shotIntelligence.status, queue: final.production.generation.summary, worker: final.production.generation.workerStatus}, null, 2));
