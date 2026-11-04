import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import sharp from "sharp";
import { buildImageFocalPlanFromImageData, validateImageFocalPlan } from "../lib/storyboard-image-focal-plan.js";
import { buildWebCaptureAdapterManifest, validateWebCaptureAdapterManifest } from "../lib/storyboard-web-capture-adapters.js";
import { buildWebCaptureStrategy, validateWebCaptureStrategy } from "../lib/storyboard-web-capture-strategy.js";
import { buildWebCaptureRecipe, validateWebCaptureRecipe } from "../lib/storyboard-web-capture-recipes.js";
import { rankEvidenceCandidates, validateEvidenceCandidateQuality } from "../lib/storyboard-evidence-candidate-quality.js";
import { smartcropBuffer, smartcropWindowFromResult } from "../lib/smartcrop-sharp-adapter.js";
import { fetchPublicArticleHtmlV1 } from "../apps/studio-next/src/lib/a1-public-url-safety-v1.mjs";
import { assessArticleCaptureContent } from "../lib/article-capture-content-gate.mjs";

const root = process.cwd();
const ARTIFACT_CONTRACT = "A1ArticlePageCaptureJob/v1";
const localChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sourceOnlyCapture = process.env.A1_ARTICLE_SOURCE_CAPTURE_ONLY === "1";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function clean(value = "", max = 260) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(value = "article-page") {
  return clean(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/giu, "-")
    .replace(/^-+|-+$/gu, "") || "article-page";
}

function hash(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 20);
}

function uniqByUrl(items = []) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = clean(item.url || item.localPath || "", 900);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function uniqByUrlAndSourceKind(items = []) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = `${clean(item.url || item.localPath || "", 900)}::${clean(item.sourceKind || item.kind || "", 160)}`;
    if (!key.replace(/:+$/u, "") || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function extFor({ url = "", contentType = "" } = {}) {
  if (/svg/iu.test(contentType) || /\.svg(?:$|[?#])/iu.test(url)) return ".svg";
  if (/webp/iu.test(contentType) || /\.webp(?:$|[?#])/iu.test(url)) return ".webp";
  if (/png/iu.test(contentType) || /\.png(?:$|[?#])/iu.test(url)) return ".png";
  if (/gif/iu.test(contentType) || /\.gif(?:$|[?#])/iu.test(url)) return ".gif";
  if (/avif/iu.test(contentType) || /\.avif(?:$|[?#])/iu.test(url)) return ".avif";
  return ".jpg";
}

function resolveMaybeUrl(value = "", baseUrl = "") {
  const source = clean(value, 1600);
  if (!source || /^data:/iu.test(source)) return "";
  try {
    return new URL(source, baseUrl || "file:///").href;
  } catch {
    return "";
  }
}

function parseSrcset(value = "", baseUrl = "") {
  return String(value || "")
    .split(",")
    .map((part) => resolveMaybeUrl(part.trim().split(/\s+/u)[0] || "", baseUrl))
    .filter(Boolean);
}

function jsonLdImages(entries = [], baseUrl = "") {
  const output = [];
  const visit = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      const url = resolveMaybeUrl(value, baseUrl);
      if (url) output.push({ url, sourceKind: "json-ld-image", label: "JSON-LD image" });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object") {
      if (value.url) visit(value.url);
      if (value.contentUrl) visit(value.contentUrl);
      if (value.image) visit(value.image);
      if (value.thumbnailUrl) visit(value.thumbnailUrl);
      if (value["@graph"]) visit(value["@graph"]);
    }
  };
  entries.forEach(visit);
  return output;
}

async function readLocalFileUrl(url) {
  const filePath = fileURLToPath(url);
  const bytes = await fs.readFile(filePath);
  const contentType = /\.svg$/iu.test(filePath) ? "image/svg+xml"
    : /\.png$/iu.test(filePath) ? "image/png"
      : /\.webp$/iu.test(filePath) ? "image/webp"
        : /\.gif$/iu.test(filePath) ? "image/gif"
          : "image/jpeg";
  return { bytes, contentType };
}

async function fetchImageBytes(url, timeoutMs = 12000) {
  if (/^file:/iu.test(url)) return readLocalFileUrl(url);
  const response = await fetch(url, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/gif,*/*;q=0.1",
      "user-agent": "A1-Motion-Studio-ArticleCapture/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`image fetch failed ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/^image\//iu.test(contentType)) throw new Error(`non-image content-type ${contentType || "missing"}`);
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType };
}

async function imageFocalPlanForBuffer(buffer, input = {}) {
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await image.metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  const { data, info } = await image
    .clone()
    .resize({ width: 360, height: 360, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plan = buildImageFocalPlanFromImageData({ width: info.width, height: info.height, data }, {
    width,
    height,
    fit: input.fit || "cover",
    label: input.label || "",
    sceneText: input.sceneText || "",
  });
  const cropWindow = input.cropWindow && typeof input.cropWindow === "object"
    ? {
        x: Number(input.cropWindow.x ?? plan.cropWindow?.x ?? 0),
        y: Number(input.cropWindow.y ?? plan.cropWindow?.y ?? 0),
        width: Number(input.cropWindow.width ?? plan.cropWindow?.width ?? 100),
        height: Number(input.cropWindow.height ?? plan.cropWindow?.height ?? 100),
      }
    : plan.cropWindow;
  return {
    ...plan,
    source: clean(input.source || plan.source || "content-aware-saliency", 120),
    cropMode: clean(input.cropMode || plan.cropMode || "", 80),
    fit: input.fit || plan.fit,
    cropWindow,
    zoom: Number(input.zoom || plan.zoom || 100),
    rationale: clean(input.rationale || plan.rationale || "", 500),
    sourceDimensions: {
      width,
      height,
      aspect: height ? Number((width / height).toFixed(4)) : 0,
    },
  };
}

async function writeCropPreview(buffer, plan = {}, outputPath) {
  const image = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await image.metadata();
  const width = Math.max(1, Number(metadata.width || 1));
  const height = Math.max(1, Number(metadata.height || 1));
  if (plan.fit === "cover") {
    const window = plan.cropWindow || { x: 0, y: 0, width: 100, height: 100 };
    const left = Math.max(0, Math.min(width - 1, Math.round(width * Number(window.x || 0) / 100)));
    const top = Math.max(0, Math.min(height - 1, Math.round(height * Number(window.y || 0) / 100)));
    const cropWidth = Math.max(1, Math.min(width - left, Math.round(width * Number(window.width || 100) / 100)));
    const cropHeight = Math.max(1, Math.min(height - top, Math.round(height * Number(window.height || 100) / 100)));
    await image.extract({ left, top, width: cropWidth, height: cropHeight })
      .resize({ width: 1280, height: 720, fit: "cover", position: "attention" })
      .png()
      .toFile(outputPath);
    return;
  }
  await image.resize({
    width: 1280,
    height: 720,
    fit: "contain",
    background: { r: 8, g: 9, b: 8, alpha: 1 },
  }).png().toFile(outputPath);
}

async function cropAlternativeFor(buffer, input = {}) {
  const plan = await imageFocalPlanForBuffer(buffer, {
    fit: input.fit,
    cropMode: input.cropMode,
    cropWindow: input.cropWindow,
    zoom: input.zoom,
    source: input.source,
    rationale: input.rationale,
    label: input.label || "",
    sceneText: input.sceneText || "",
  });
  const validation = validateImageFocalPlan(plan);
  if (!validation.ok) throw new Error(`invalid crop alternative ${input.id || "unknown"}: ${validation.failures.join(", ")}`);
  await writeCropPreview(buffer, plan, input.outputPath);
  return {
    contract: "A1EvidenceCropAlternative/v1",
    id: clean(input.id || plan.cropMode || "crop-alternative", 120),
    cropMode: plan.cropMode,
    fit: plan.fit,
    cropPreviewPath: input.outputPath,
    imageFocalPlan: plan,
    recommendedFor: input.recommendedFor || [],
    source: clean(input.source || "sharp-plus-a1-saliency", 120),
    rejectIf: ["cropPreviewMissing", "imageFocalPlanInvalid", "candidateAssetRenderedWithoutPromotion"],
  };
}

function smartcropWindowFromPlan(plan = {}, candidate = {}) {
  const source = plan.cropWindow && typeof plan.cropWindow === "object"
    ? plan.cropWindow
    : { x: 18, y: 12, width: 64, height: 72 };
  const isScreenshotLike = /screenshot|webpage|locator|element|chart|canvas|svg|ui|interface/iu.test(candidate.sourceKind || "");
  if (isScreenshotLike) {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };
  }
  const width = Math.max(42, Math.min(84, Number(source.width || 68)));
  const height = Math.max(44, Math.min(84, Number(source.height || 72)));
  const centerX = Number(source.x || 0) + Number(source.width || 100) / 2;
  const centerY = Number(source.y || 0) + Number(source.height || 100) / 2;
  return {
    x: Number(Math.max(0, Math.min(100 - width, centerX - width / 2)).toFixed(2)),
    y: Number(Math.max(0, Math.min(100 - height, centerY - height / 2)).toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
  };
}

async function smartcropWindowForBuffer(buffer, candidate = {}) {
  const metadata = await sharp(buffer, { failOn: "none" }).rotate().metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return null;
  const isScreenshotLike = /screenshot|webpage|locator|element|chart|canvas|svg|ui|interface/iu.test(candidate.sourceKind || "");
  if (isScreenshotLike) {
    return {
      source: "contain-safe-screenshot-no-smartcrop",
      cropWindow: { x: 0, y: 0, width: 100, height: 100 },
      rationale: "Screenshots, charts, documents, and UI evidence preserve the full source with contain-safe instead of smartcrop cropping.",
    };
  }
  const result = await smartcropBuffer(buffer, {
    width: 1280,
    height: 720,
    minScale: 0.55,
  });
  return {
    source: "smartcrop-js-sharp-adapter",
    cropWindow: smartcropWindowFromResult(result, { width, height }),
    rationale: "smartcrop.js selected the content-aware crop; Sharp renders the local crop preview and A1 keeps it candidate-only until promotion.",
  };
}

async function buildCropAlternatives(buffer, candidate = {}, fileBase = "", jobDir = "") {
  const alternatives = [];
  const isScreenshotLike = /screenshot|webpage|locator|element/iu.test(candidate.sourceKind || "");
  const recipeCropPolicy = clean(candidate.captureRecipe?.primaryCropPolicy || candidate.cropPolicy || "", 80);
  const baseOutput = path.join(jobDir, "assets", fileBase);
  const common = {
    label: candidate.label || candidate.sourceKind || "",
    sceneText: `${candidate.label || ""} ${candidate.alt || ""} ${candidate.caption || ""} ${candidate.nearbyText || ""}`,
  };
  const contain = await cropAlternativeFor(buffer, {
    ...common,
    id: "contain-safe",
    fit: "contain",
    outputPath: `${baseOutput}-crop-contain.png`,
    recommendedFor: ["webpage-ui", "chart", "logo", "document", "audit-safe"],
  });
  alternatives.push(contain);
  const focal = await cropAlternativeFor(buffer, {
    ...common,
    id: "focal-cover",
    fit: "cover",
    outputPath: `${baseOutput}-crop-focal.png`,
    recommendedFor: ["cinematic-fill", "photo", "hero-image", "ken-burns"],
  });
  alternatives.push(focal);
  let smartcropContext = null;
  try {
    smartcropContext = await smartcropWindowForBuffer(buffer, candidate);
  } catch (error) {
    smartcropContext = {
      source: "a1-saliency-smartcrop-fallback",
      cropWindow: smartcropWindowFromPlan(focal.imageFocalPlan || {}, candidate),
      rationale: `smartcrop.js fallback: ${clean(error?.message || String(error), 180)}`,
    };
  }
  const smartcrop = await cropAlternativeFor(buffer, {
    ...common,
    id: "content-aware-focus",
    fit: isScreenshotLike ? "contain" : "cover",
    cropMode: isScreenshotLike ? "contain-safe" : "focal-cover",
    cropWindow: smartcropContext.cropWindow || smartcropWindowFromPlan(focal.imageFocalPlan || {}, candidate),
    zoom: isScreenshotLike ? 100 : 110,
    outputPath: `${baseOutput}-crop-content-aware.png`,
    recommendedFor: ["smartcrop-reference", "subject-aware-styleframe", "template-fit-review"],
    source: smartcropContext.source || "smartcrop-js-sharp-adapter",
    rationale: smartcropContext.rationale || "smartcrop.js candidate for reviewer comparison before professional template routing.",
  });
  alternatives.push(smartcrop);
  const primary = recipeCropPolicy === "focal-cover" && !isScreenshotLike ? focal
    : recipeCropPolicy === "contain-safe" ? contain
      : isScreenshotLike ? contain
        : focal;
  return {
    contract: "A1EvidenceCropReview/v1",
    source: "capture-storyboard-article-page",
    primaryCropAlternativeId: primary.id,
    primaryCropMode: primary.cropMode,
    primaryCropPreviewPath: primary.cropPreviewPath,
    alternativeCount: alternatives.length,
    alternatives,
    rejectIf: ["cropAlternativeMissing", "visualAuditMissingBeforeRender", "candidateAssetRenderedWithoutPromotion"],
  };
}

function contactSheetTileLabel(candidate = {}, alternative = {}, index = 0) {
  const sourceKind = clean(candidate.sourceKind || "candidate", 42);
  const cropId = clean(alternative.id || candidate.cropReview?.primaryCropAlternativeId || "primary", 28);
  const template = /screenshot|webpage|locator|element|chart|canvas|svg|ui|interface/iu.test(candidate.sourceKind || "")
    ? "browser-evidence"
    : "editorial-image";
  const quality = clean(candidate.evidenceQuality?.tier || candidate.qualityTier || "", 28);
  return [
    `#${index + 1} ${sourceKind}`,
    `${cropId} -> ${template}`,
    quality ? `quality: ${quality}` : "candidate only",
  ];
}

function escapeSvgText(value = "") {
  return clean(value, 120)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function contactSheetOverlaySvg({ width, height, lines = [], primary = false } = {}) {
  const safeLines = lines.map((line) => clean(line, 86));
  const lineMarkup = safeLines.map((line, index) => (
    `<text x="14" y="${height - 48 + index * 16}" fill="${index === 0 ? "#f7f6ec" : "#c9c8bf"}" font-size="${index === 0 ? 13 : 11}" font-weight="${index === 0 ? 850 : 720}" font-family="Inter, Arial, sans-serif">${escapeSvgText(line)}</text>`
  )).join("");
  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="${primary ? "#d7ff4d" : "rgba(247,246,236,.24)"}" stroke-width="${primary ? 4 : 2}"/>
      <rect x="0" y="${height - 64}" width="${width}" height="64" fill="rgba(4,5,5,.78)"/>
      ${primary ? `<rect x="10" y="10" width="84" height="24" fill="#d7ff4d"/><text x="18" y="27" fill="#050607" font-size="12" font-weight="900" font-family="Inter, Arial, sans-serif">PRIMARY</text>` : ""}
      ${lineMarkup}
    </svg>
  `);
}

function sourceLaneForContactSheet(candidate = {}) {
  const kind = clean(candidate.sourceKind || candidate.kind || "", 120);
  if (/selector-clip|locator|element|page-screenshot|webpage/iu.test(kind)) return "source-capture";
  if (/figure|picture|article-image|dom-image/iu.test(kind)) return "source-image";
  if (/preload|image-srcset|image_src|linked/iu.test(kind)) return "linked-image";
  if (/og|twitter|json-ld|metadata/iu.test(kind)) return "metadata-image";
  return kind || "candidate";
}

function hammingDistance(a = "", b = "") {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function candidatePerceptualHash(candidate = {}) {
  return clean(candidate.visualStats?.perceptualHash || candidate.visualStats?.averageHash || "", 80);
}

function candidateReviewSignature(candidate = {}) {
  const lane = sourceLaneForContactSheet(candidate);
  const rawKind = clean(candidate.sourceKind || "", 80).toLowerCase();
  const kind = /playwright-(selector-clip|locator|element)-screenshot/iu.test(rawKind)
    ? "playwright-region-screenshot"
    : rawKind;
  const semanticId = clean(candidate.id || "", 120)
    .toLowerCase()
    .replace(/-clip-\d+$/u, "")
    .replace(/-\d+$/u, "");
  const selector = clean(candidate.selector || candidate.captureRecipe?.selectorPlanId || "", 80).toLowerCase();
  const label = clean(candidate.label || candidate.canonicalName || candidate.nearbyText || "", 90)
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/giu, " ")
    .replace(/\b\d+\b/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 54);
  return semanticId
    ? `${lane}:${kind}:${semanticId}`
    : `${lane}:${kind}:${selector}:${label}`;
}

function isVisuallyTooSimilar(candidate = {}, selected = []) {
  const hashValue = candidatePerceptualHash(candidate);
  if (!hashValue) return false;
  return selected.some((item = {}) => {
    const existingHash = candidatePerceptualHash(item);
    if (!existingHash) return false;
    const sameLane = sourceLaneForContactSheet(item) === sourceLaneForContactSheet(candidate);
    const threshold = sameLane ? 8 : 5;
    return hammingDistance(hashValue, existingHash) <= threshold;
  });
}

function selectContactSheetCandidates(candidates = []) {
  const usable = candidates.filter((candidate = {}) => candidate.cropReview?.contract === "A1EvidenceCropReview/v1" || candidate.cropPreviewPath);
  const reviewGrade = usable.filter((candidate = {}) => {
    const tier = candidate.evidenceQuality?.tier || candidate.qualityTier || "";
    return !["weak", "reject"].includes(tier)
      && candidate.visualStats?.mostlyBlank !== true
      && candidate.visualStats?.lowDetail !== true;
  });
  const sourcePool = reviewGrade.length >= 3 ? reviewGrade : usable;
  const primary = sourcePool.filter((candidate = {}) => candidate.evidenceQuality?.recommendedUse === "primary-styleframe");
  const ranked = primary.length ? primary : sourcePool;
  const output = [];
  const seen = new Set();
  const seenReviewSignatures = new Set();
  const add = (candidate = {}) => {
    const key = candidate.id || `${candidate.sourceKind || ""}:${candidate.localPath || candidate.url || candidate.sourceUrl || candidate.label || ""}`;
    if (!key || seen.has(key)) return;
    const signature = candidateReviewSignature(candidate);
    if (signature && seenReviewSignatures.has(signature)) return;
    seen.add(key);
    if (signature) seenReviewSignatures.add(signature);
    output.push(candidate);
  };
  ranked.slice(0, 1).forEach(add);
  for (const lane of ["source-capture", "source-image", "linked-image", "metadata-image"]) {
    const candidate = sourcePool.find((item) => sourceLaneForContactSheet(item) === lane && !isVisuallyTooSimilar(item, output))
      || sourcePool.find((item) => sourceLaneForContactSheet(item) === lane);
    if (candidate) add(candidate);
  }
  for (const candidate of sourcePool) {
    if (output.length >= 6) break;
    if (isVisuallyTooSimilar(candidate, output)) continue;
    add(candidate);
  }
  for (const candidate of sourcePool) {
    if (output.length >= 6) break;
    if (isVisuallyTooSimilar(candidate, output)) continue;
    add(candidate);
  }
  return output.slice(0, 6);
}

async function writeContactSheet(candidates = [], outputPath) {
  const sourceCandidates = selectContactSheetCandidates(candidates);
  const rows = [];
  for (let candidateIndex = 0; candidateIndex < sourceCandidates.length; candidateIndex += 1) {
    const candidate = sourceCandidates[candidateIndex];
    const alternatives = Array.isArray(candidate.cropAlternatives) && candidate.cropAlternatives.length
      ? candidate.cropAlternatives
      : [{
          id: candidate.cropReview?.primaryCropAlternativeId || "primary",
          cropPreviewPath: candidate.cropPreviewPath,
          cropMode: candidate.imageFocalPlan?.cropMode || "",
        }];
    const visibleAlternatives = alternatives
      .filter((alternative = {}) => alternative.cropPreviewPath && fsSync.existsSync(alternative.cropPreviewPath))
      .slice(0, 3);
    if (!visibleAlternatives.length) continue;
    rows.push({
      candidate,
      candidateIndex,
      alternatives: visibleAlternatives,
      primaryCropAlternativeId: candidate.cropReview?.primaryCropAlternativeId || visibleAlternatives[0]?.id || "",
    });
  }
  if (!rows.length) return null;
  const thumbWidth = 320;
  const thumbHeight = 180;
  const labelWidth = 280;
  const gap = 14;
  const headerHeight = 58;
  const columns = 3;
  const width = labelWidth + thumbWidth * columns + gap * (columns + 2);
  const height = headerHeight + rows.length * (thumbHeight + gap) + gap;
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 8, g: 9, b: 8, alpha: 1 },
    },
  });
  const composites = [];
  const headerSvg = Buffer.from(`
    <svg width="${width}" height="${headerHeight}" viewBox="0 0 ${width} ${headerHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${headerHeight}" fill="#080908"/>
      <text x="${gap}" y="26" fill="#f7f6ec" font-size="20" font-weight="900" font-family="Inter, Arial, sans-serif">A1 visual source / crop review</text>
      <text x="${gap}" y="46" fill="#a7aaa0" font-size="12" font-weight="720" font-family="Inter, Arial, sans-serif">Rows are source candidates. Columns compare contain-safe, focal-cover, and content-aware crops before any render promotion.</text>
    </svg>
  `);
  composites.push({ input: headerSvg, left: 0, top: 0 });
  const manifestRows = [];
  for (const row of rows) {
    const top = headerHeight + gap + manifestRows.length * (thumbHeight + gap);
    const labelLines = [
      `#${row.candidateIndex + 1} ${clean(row.candidate.sourceKind || "candidate", 44)}`,
      clean(row.candidate.label || row.candidate.canonicalName || row.candidate.sourceUrl || row.candidate.url || "", 34),
      `quality: ${clean(row.candidate.evidenceQuality?.tier || row.candidate.qualityTier || "unscored", 24)}`,
      `render: ${row.candidate.renderAllowed ? "allowed" : "blocked until promotion"}`,
    ];
    const labelSvg = Buffer.from(`
      <svg width="${labelWidth}" height="${thumbHeight}" viewBox="0 0 ${labelWidth} ${thumbHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${labelWidth}" height="${thumbHeight}" fill="#0d0f0e" stroke="rgba(247,246,236,.16)"/>
        <text x="14" y="26" fill="#d7ff4d" font-size="13" font-weight="900" font-family="Inter, Arial, sans-serif">${escapeSvgText(labelLines[0])}</text>
        <text x="14" y="56" fill="#f7f6ec" font-size="16" font-weight="850" font-family="Inter, Arial, sans-serif">${escapeSvgText(labelLines[1])}</text>
        <text x="14" y="86" fill="#b8bbb2" font-size="12" font-weight="740" font-family="Inter, Arial, sans-serif">${escapeSvgText(labelLines[2])}</text>
        <text x="14" y="108" fill="#b8bbb2" font-size="12" font-weight="740" font-family="Inter, Arial, sans-serif">${escapeSvgText(labelLines[3])}</text>
        <text x="14" y="148" fill="#81867d" font-size="11" font-weight="700" font-family="Menlo, monospace">source lane + crop alternatives</text>
      </svg>
    `);
    composites.push({ input: labelSvg, left: gap, top });
    const manifestAlternatives = [];
    for (let altIndex = 0; altIndex < row.alternatives.length; altIndex += 1) {
      const alternative = row.alternatives[altIndex];
      const primary = alternative.id === row.primaryCropAlternativeId;
      const resized = await sharp(alternative.cropPreviewPath)
        .resize({ width: thumbWidth, height: thumbHeight, fit: "cover" })
        .png()
        .toBuffer();
      const overlay = contactSheetOverlaySvg({
        width: thumbWidth,
        height: thumbHeight,
        primary,
        lines: contactSheetTileLabel(row.candidate, alternative, row.candidateIndex),
      });
      const input = await sharp(resized)
        .composite([{ input: overlay, left: 0, top: 0 }])
      .png()
      .toBuffer();
      composites.push({
        input,
        left: gap + labelWidth + gap + altIndex * (thumbWidth + gap),
        top,
      });
      manifestAlternatives.push({
        id: alternative.id || "",
        cropMode: alternative.cropMode || "",
        fit: alternative.fit || "",
        primary,
        cropPreviewPath: alternative.cropPreviewPath || "",
        source: alternative.source || "",
      });
    }
    manifestRows.push({
      candidateId: row.candidate.id || "",
      sourceKind: row.candidate.sourceKind || "",
      sourceLane: sourceLaneForContactSheet(row.candidate),
      sourceUrl: row.candidate.sourceUrl || row.candidate.url || "",
      label: row.candidate.label || "",
      qualityTier: row.candidate.evidenceQuality?.tier || row.candidate.qualityTier || "",
      recommendedUse: row.candidate.evidenceQuality?.recommendedUse || "",
      reviewSignature: candidateReviewSignature(row.candidate),
      perceptualHash: candidatePerceptualHash(row.candidate),
      renderAllowed: row.candidate.renderAllowed === true,
      promotionRequired: row.candidate.promotionRequired === true,
      primaryCropAlternativeId: row.primaryCropAlternativeId,
      alternatives: manifestAlternatives,
      routeHint: /screenshot|webpage|locator|element|chart|canvas|svg|ui|interface/iu.test(row.candidate.sourceKind || "")
        ? "browser-evidence/product_browser_zoom_01"
        : "editorial-image/rve-ken-burns-evidence-plate",
    });
  }
  await canvas.composite(composites).png().toFile(outputPath);
  const manifestPath = outputPath.replace(/\.png$/iu, ".json");
  await fs.writeFile(manifestPath, `${JSON.stringify({
    contract: "A1EvidenceCandidateCropContactSheet/v1",
    source: "capture-storyboard-article-page",
    policy: "Review source candidates and crop alternatives before promotion to renderable styleframes.",
    contactSheetPath: outputPath,
    layout: {
      rows: manifestRows.length,
      columns,
      thumbWidth,
      thumbHeight,
      compares: ["contain-safe", "focal-cover", "content-aware-focus"],
    },
    rows: manifestRows,
    rejectIf: ["singleCropOnly", "sourceLaneMissing", "renderAllowedBeforePromotion", "cropAlternativeMissing"],
  }, null, 2)}\n`);
  return outputPath;
}

async function visualStatsForPreview(previewPath = "") {
  if (!previewPath || !fsSync.existsSync(previewPath)) return null;
  const { data, info } = await sharp(previewPath)
    .resize({ width: 96, height: 54, fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  if (!pixels) return null;
  const hashSample = await sharp(previewPath)
    .resize({ width: 8, height: 8, fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();
  let bright = 0;
  let dark = 0;
  let saturated = 0;
  let edge = 0;
  let graySum = 0;
  let graySq = 0;
  const gray = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 3;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const value = Math.round((r + g + b) / 3);
    gray[index] = value;
    graySum += value;
    graySq += value * value;
    if (value >= 244) bright += 1;
    if (value <= 18) dark += 1;
    if (max - min >= 45) saturated += 1;
  }
  for (let y = 1; y < info.height; y += 1) {
    for (let x = 1; x < info.width; x += 1) {
      const i = y * info.width + x;
      const delta = Math.abs(gray[i] - gray[i - 1]) + Math.abs(gray[i] - gray[i - info.width]);
      if (delta >= 34) edge += 1;
    }
  }
  const mean = graySum / pixels;
  const variance = Math.max(0, (graySq / pixels) - mean * mean);
  const hashMean = hashSample.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, hashSample.length);
  const perceptualHash = [...hashSample].map((value) => Number(value || 0) >= hashMean ? "1" : "0").join("");
  return {
    contract: "A1VisualCandidateStats/v1",
    source: "sharp-preview-analysis",
    width: info.width,
    height: info.height,
    brightRatio: Number((bright / pixels).toFixed(4)),
    darkRatio: Number((dark / pixels).toFixed(4)),
    saturationRatio: Number((saturated / pixels).toFixed(4)),
    edgeRatio: Number((edge / pixels).toFixed(4)),
    contrast: Number((Math.sqrt(variance) / 255).toFixed(4)),
    perceptualHash,
    perceptualHashAlgorithm: "average-hash-8x8-grayscale",
    mostlyBlank: bright / pixels > 0.82 || dark / pixels > 0.88,
    lowDetail: edge / pixels < 0.035 && Math.sqrt(variance) / 255 < 0.12,
    rejectIf: ["mostlyBlank", "lowDetail", "tinyFragment"],
  };
}

async function captureElementEvidenceScreenshots(page, jobDir, recipe = {}) {
  const elementDir = path.join(jobDir, "elements");
  await fs.mkdir(elementDir, { recursive: true });
  const selectorPlans = Array.isArray(recipe.selectorPlans) && recipe.selectorPlans.length
    ? recipe.selectorPlans
    : buildWebCaptureRecipe({ url: "" }).selectorPlans;
  const captures = [];
  for (const plan of selectorPlans) {
    const locator = page.locator(plan.selector);
    const count = Math.min(await locator.count().catch(() => 0), plan.max);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;
      const box = await item.boundingBox().catch(() => null);
      if (!box || box.width < Number(plan.minWidth || 80) || box.height < Number(plan.minHeight || 80)) continue;
      await item.scrollIntoViewIfNeeded().catch(() => {});
      const fileName = `${plan.role || plan.id}-${String(index + 1).padStart(2, "0")}.png`;
      const localPath = path.join(elementDir, fileName);
      await item.screenshot({ path: localPath }).catch(() => null);
      if (!fsSync.existsSync(localPath)) continue;
      const text = await item.evaluate((node) => node.textContent || "").catch(() => "");
      captures.push({
        id: `${plan.role || plan.id}-${index + 1}`,
        sourceKind: clean(plan.sourceKind || "playwright-element-screenshot-near-matched-sentence", 120),
        label: clean(`${plan.label}${text ? `: ${text}` : ""}`, 180),
        localPath,
        contentType: "image/png",
        selector: plan.selector,
        domRole: plan.role,
        cropPolicy: clean(plan.cropPolicy || recipe.primaryCropPolicy || "contain-safe", 80),
        captureRecipe: {
          contract: recipe.contract || "",
          recipeId: recipe.recipeId || "",
          targetClass: recipe.targetClass || "",
          primaryCropPolicy: recipe.primaryCropPolicy || "",
          selectorPlanId: plan.id || "",
        },
        nearbyText: clean(text, 500),
        width: Math.round(box.width),
        height: Math.round(box.height),
        score: 92 - index * 3,
      });
    }
  }
  return captures;
}

async function captureRecipeClipScreenshots(page, jobDir, recipe = {}) {
  const clipDir = path.join(jobDir, "clips");
  await fs.mkdir(clipDir, { recursive: true });
  const viewport = page.viewportSize() || { width: 1440, height: 960 };
  const selectorPlans = Array.isArray(recipe.selectorPlans) && recipe.selectorPlans.length
    ? recipe.selectorPlans
    : buildWebCaptureRecipe({ url: "" }).selectorPlans;
  const captures = [];
  for (const plan of selectorPlans.slice(0, 4)) {
    const locator = page.locator(plan.selector);
    const count = Math.min(await locator.count().catch(() => 0), 2);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (!(await item.isVisible().catch(() => false))) continue;
      await item.scrollIntoViewIfNeeded().catch(() => {});
      const box = await item.boundingBox().catch(() => null);
      if (!box || box.width < Number(plan.minWidth || 220) || box.height < Number(plan.minHeight || 120)) continue;
      const left = Math.max(0, Math.min(viewport.width - 1, Math.round(box.x)));
      const top = Math.max(0, Math.min(viewport.height - 1, Math.round(box.y)));
      const width = Math.max(1, Math.min(viewport.width - left, Math.round(Math.min(box.width, viewport.width - left))));
      const targetHeight = Math.round(width * 9 / 16);
      const height = Math.max(1, Math.min(viewport.height - top, Math.max(Math.round(Math.min(box.height, viewport.height - top)), targetHeight)));
      if (width < 360 || height < 200) continue;
      const localPath = path.join(clipDir, `${plan.role || plan.id}-clip-${String(index + 1).padStart(2, "0")}.png`);
      await page.screenshot({ path: localPath, fullPage: false, clip: { x: left, y: top, width, height } }).catch(() => null);
      if (!fsSync.existsSync(localPath)) continue;
      const text = await item.evaluate((node) => node.textContent || "").catch(() => "");
      captures.push({
        id: `${plan.role || plan.id}-clip-${index + 1}`,
        sourceKind: "playwright-selector-clip-screenshot",
        label: clean(`${plan.label || "Selector clip screenshot"}${text ? `: ${text}` : ""}`, 180),
        localPath,
        contentType: "image/png",
        selector: plan.selector,
        domRole: `${plan.role || plan.id}-clip`,
        cropPolicy: "contain-safe",
        captureRecipe: {
          contract: recipe.contract || "",
          recipeId: recipe.recipeId || "",
          targetClass: recipe.targetClass || "",
          primaryCropPolicy: recipe.primaryCropPolicy || "",
          selectorPlanId: plan.id || "",
          clipPolicy: "visible-viewport-16x9-source",
        },
        nearbyText: clean(text, 500),
        width,
        height,
        score: 98 - captures.length * 2,
      });
    }
  }
  return captures;
}

function htmlWithBaseHref(html, url) {
  const escaped = String(url).replace(/&/gu, "&amp;").replace(/"/gu, "&quot;").replace(/</gu, "&lt;");
  const base = `<base href="${escaped}">`;
  if (/<head\b[^>]*>/iu.test(html)) return html.replace(/<head\b[^>]*>/iu, (opening) => `${opening}${base}`);
  if (/<html\b[^>]*>/iu.test(html)) return html.replace(/<html\b[^>]*>/iu, (opening) => `${opening}<head>${base}</head>`);
  return `<!doctype html><html><head>${base}</head><body>${html}</body></html>`;
}

async function capturePage({ pageUrl, htmlFile, jobDir, recipe }) {
  if (sourceOnlyCapture && htmlFile) throw new Error("SOURCE_ONLY_CAPTURE_REQUIRES_PUBLIC_URL");
  const sourcePage = sourceOnlyCapture ? await fetchPublicArticleHtmlV1(pageUrl) : null;
  const browser = await chromium.launch({
    headless: true,
    ...(fsSync.existsSync(localChromePath) ? {executablePath: localChromePath} : {}),
  });
  const viewport = recipe?.browserCapture?.viewport || { width: 1440, height: 960, deviceScaleFactor: 1 };
  const page = await browser.newPage({
    viewport: { width: Number(viewport.width || 1440), height: Number(viewport.height || 960) },
    deviceScaleFactor: Number(viewport.deviceScaleFactor || 1),
    ...(sourceOnlyCapture ? {javaScriptEnabled: false} : {}),
  });
  page.setDefaultTimeout(12000);
  let targetUrl = htmlFile ? pathToFileURL(path.resolve(htmlFile)).href : pageUrl;
  if (sourceOnlyCapture) {
    targetUrl = sourcePage.finalUrl;
    await page.route("**/*", route => route.abort());
    await page.setContent(htmlWithBaseHref(sourcePage.html, targetUrl), {waitUntil: "domcontentloaded", timeout: 30000});
  } else await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  });
  try {
    await page.waitForLoadState("networkidle", { timeout: 6000 });
  } catch {
    // Many article pages keep analytics or media requests open; DOM content is enough for capture artifacts.
  }
  const html = await page.content();
  const screenshotPath = path.join(jobDir, "page-screenshot.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const elementScreenshotPath = path.join(jobDir, "element-screenshot.png");
  const locator = page.locator("article, main, [role='main'], body").first();
  await locator.screenshot({ path: elementScreenshotPath });
  const recipeClipScreenshots = await captureRecipeClipScreenshots(page, jobDir, recipe);
  const elementEvidenceScreenshots = await captureElementEvidenceScreenshots(page, jobDir, recipe);
  const metadata = await page.evaluate(() => {
    const meta = (name) => document.querySelector(`meta[property='${name}'],meta[name='${name}']`)?.getAttribute("content") || "";
    const jsonLd = [...document.querySelectorAll("script[type='application/ld+json']")]
      .map((node) => {
        try {
          return JSON.parse(node.textContent || "null");
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const images = [...document.images].map((image, index) => ({
      index,
      src: image.getAttribute("src") || "",
      currentSrc: image.currentSrc || "",
      srcset: image.getAttribute("srcset") || "",
      alt: image.getAttribute("alt") || "",
      title: image.getAttribute("title") || "",
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0,
      caption: image.closest("figure")?.querySelector("figcaption")?.textContent || "",
      inArticle: Boolean(image.closest("article, main, [role='main']")),
      inFigure: Boolean(image.closest("figure")),
      inPicture: Boolean(image.closest("picture")),
      domRole: image.closest("figure") ? "figure-image"
        : image.closest("picture") ? "picture-image"
          : image.closest("article, main, [role='main']") ? "article-image"
            : "page-image",
      nearbyText: image.closest("figure, p, section, article")?.textContent || "",
    }));
    const linkedImages = [...document.querySelectorAll("link[rel], meta[property], meta[name]")]
      .map((node, index) => {
        const tag = node.tagName.toLowerCase();
        const rel = node.getAttribute("rel") || "";
        const as = node.getAttribute("as") || "";
        const property = node.getAttribute("property") || "";
        const name = node.getAttribute("name") || "";
        const href = node.getAttribute("href") || node.getAttribute("content") || "";
        const imagesrcset = node.getAttribute("imagesrcset") || "";
        const media = node.getAttribute("media") || "";
        const kind = tag === "link" && /\bimage_src\b/iu.test(rel) ? "link-rel-image-src"
          : tag === "link" && /\bpreload\b/iu.test(rel) && /\bimage\b/iu.test(as) ? "link-rel-preload-image"
            : tag === "link" && /\bmodulepreload\b/iu.test(rel) ? ""
              : /^(og:image|twitter:image)$/iu.test(property || name) ? "social-meta-image"
                : "";
        return {
          index,
          kind,
          rel,
          as,
          property,
          name,
          href,
          imagesrcset,
          media,
        };
      })
      .filter((item) => item.kind && (item.href || item.imagesrcset));
    return {
      title: document.title || "",
      canonicalUrl: document.querySelector("link[rel='canonical']")?.href || location.href,
      description: meta("description") || meta("og:description") || "",
      ogTitle: meta("og:title"),
      ogImage: meta("og:image"),
      twitterImage: meta("twitter:image"),
      siteName: meta("og:site_name"),
      jsonLd,
      images,
      linkedImages,
    };
  });
  await browser.close();
  return { targetUrl, html, screenshotPath, elementScreenshotPath, recipeClipScreenshots, elementEvidenceScreenshots, metadata };
}

function readabilityFor(html = "", url = "") {
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  return article ? {
    title: clean(article.title, 300),
    byline: clean(article.byline, 200),
    excerpt: clean(article.excerpt, 600),
    siteName: clean(article.siteName, 160),
    length: Number(article.length || 0),
    textContent: clean(article.textContent || "", 20000),
    contentHtml: article.content || "",
  } : {
    title: "",
    byline: "",
    excerpt: "",
    siteName: "",
    length: 0,
    textContent: "",
    contentHtml: "",
  };
}

function candidateImages(metadata = {}, baseUrl = "") {
  const inline = (metadata.images || []).flatMap((image = {}) => {
    const urls = [
      resolveMaybeUrl(image.currentSrc || image.src || "", baseUrl),
      ...parseSrcset(image.srcset || "", baseUrl),
    ].filter(Boolean);
    return urls.map((url) => ({
      url,
      sourceKind: image.inFigure || image.inPicture ? "sentence-matched-figure-or-picture-element" : "article-inline-image",
      label: clean(image.alt || image.title || image.caption || "Article image", 180),
      alt: clean(image.alt || "", 240),
      caption: clean(image.caption || "", 300),
      domRole: clean(image.domRole || "", 80),
      nearbyText: clean(image.nearbyText || "", 500),
      width: Number(image.width || 0),
      height: Number(image.height || 0),
      inArticle: image.inArticle === true,
      inFigure: image.inFigure === true,
      inPicture: image.inPicture === true,
    }));
  });
  const jsonLd = jsonLdImages(metadata.jsonLd || [], baseUrl);
  const og = resolveMaybeUrl(metadata.ogImage || "", baseUrl)
    ? [{ url: resolveMaybeUrl(metadata.ogImage || "", baseUrl), sourceKind: "og-image", label: clean(metadata.ogTitle || metadata.title || "Open Graph image", 180) }]
    : [];
  const twitter = resolveMaybeUrl(metadata.twitterImage || "", baseUrl)
    ? [{ url: resolveMaybeUrl(metadata.twitterImage || "", baseUrl), sourceKind: "twitter-image", label: clean(metadata.title || "Twitter image", 180) }]
    : [];
  const linked = (metadata.linkedImages || []).flatMap((image = {}) => {
    const srcset = parseSrcset(image.imagesrcset || "", baseUrl);
    const direct = resolveMaybeUrl(image.href || "", baseUrl);
    return [direct, ...srcset].filter(Boolean).map((url) => ({
      url,
      sourceKind: image.kind === "link-rel-preload-image" ? "preload-image" : "link-rel-preload-or-image-srcset-largest",
      label: clean(image.media || metadata.title || "Linked/preloaded image", 180),
      domRole: clean(image.kind || "", 80),
      nearbyText: clean(`${image.rel || ""} ${image.as || ""} ${image.property || ""} ${image.name || ""}`, 260),
    }));
  });
  return uniqByUrlAndSourceKind([...inline, ...jsonLd, ...og, ...twitter, ...linked])
    .map((candidate, index) => ({
      ...candidate,
      id: `web-image-${index + 1}`,
      score: (candidate.sourceKind === "sentence-matched-figure-or-picture-element" ? 94
        : candidate.sourceKind === "article-inline-image" ? 80
          : candidate.sourceKind === "json-ld-image" ? 68
            : candidate.sourceKind === "link-rel-preload-or-image-srcset-largest" ? 62
              : candidate.sourceKind === "preload-image" ? 60
            : 58)
        + (candidate.inArticle ? 12 : 0)
        + (Number(candidate.width || 0) >= 800 ? 6 : 0),
    }))
    .sort((a, b) => b.score - a.score);
}

async function processImageCandidate(candidate = {}, jobDir = "", options = {}) {
  try {
    const { bytes, contentType } = candidate.localPath
      ? { bytes: await fs.readFile(candidate.localPath), contentType: candidate.contentType || "" }
      : await fetchImageBytes(candidate.url, Number(options.timeoutMs || 12000));
    if (!bytes.length) throw new Error("empty image body");
    if (bytes.length > Number(options.maxBytes || 12 * 1024 * 1024)) throw new Error(`image too large ${bytes.length}`);
    const ext = candidate.localPath ? path.extname(candidate.localPath) || ".png" : extFor({ url: candidate.url, contentType });
    const fileBase = `${candidate.id || "candidate"}-${hash(candidate.url || candidate.localPath || bytes.length)}`;
    const originalPath = path.join(jobDir, "assets", `${fileBase}${ext}`);
    await fs.writeFile(originalPath, bytes);
    const cropReview = await buildCropAlternatives(bytes, candidate, fileBase, jobDir);
    const primaryCrop = cropReview.alternatives.find((alternative) => alternative.id === cropReview.primaryCropAlternativeId)
      || cropReview.alternatives[0];
    const cropPreviewPath = primaryCrop.cropPreviewPath;
    const imageFocalPlan = primaryCrop.imageFocalPlan;
    const focalValidation = validateImageFocalPlan(imageFocalPlan);
    if (!focalValidation.ok) throw new Error(`invalid focal plan: ${focalValidation.failures.join(", ")}`);
    const visualStats = await visualStatsForPreview(cropPreviewPath);
    const processed = {
      contract: "A1WebImageCandidate/v1",
      id: candidate.id,
      sourceKind: candidate.sourceKind,
      label: clean(candidate.label || "", 180),
      url: candidate.url || "",
      sourceUrl: options.sourceUrl || "",
      provenance: {
        sourcePageUrl: options.sourceUrl || "",
        extractionSource: candidate.sourceKind,
        selector: candidate.selector || "",
        domRole: candidate.domRole || "",
        capturedAt: options.capturedAt || new Date().toISOString(),
      },
      selector: candidate.selector || "",
      domRole: candidate.domRole || "",
      nearbyText: clean(candidate.nearbyText || "", 500),
      width: imageFocalPlan.sourceDimensions.width,
      height: imageFocalPlan.sourceDimensions.height,
      score: Number(candidate.score || 0),
      localOriginalPath: originalPath,
      cropPreviewPath,
      visualAuditPath: cropPreviewPath,
      visualStats,
      imageFocalPlan,
      cropReview,
      cropAlternatives: cropReview.alternatives,
      primaryCropAlternativeId: cropReview.primaryCropAlternativeId,
      captureRecipe: candidate.captureRecipe || options.captureRecipe || null,
      cropPolicy: clean(candidate.cropPolicy || candidate.captureRecipe?.primaryCropPolicy || options.captureRecipe?.primaryCropPolicy || "", 80),
      renderAllowed: false,
      verifiedForRender: false,
      promotionRequired: true,
      requiredBeforeRender: ["source-url", "rights-or-policy-note", "cache-or-hotlink-policy", "visual-audit", "verified-manifest-promotion"],
      rejectIf: ["candidateAssetRenderedWithoutPromotion", "wrongImageForScene", "visualAuditMissing"],
    };
    const ranked = rankEvidenceCandidates([processed], { sourceUrl: options.sourceUrl || "" })[0];
    const qualityValidation = validateEvidenceCandidateQuality(ranked.evidenceQuality || {});
    if (!qualityValidation.ok) throw new Error(`invalid evidence quality: ${qualityValidation.failures.join(", ")}`);
    return ranked;
  } catch (error) {
    return rankEvidenceCandidates([{
      contract: "A1WebImageCandidate/v1",
      id: candidate.id,
      sourceKind: candidate.sourceKind,
      label: clean(candidate.label || "", 180),
      url: candidate.url || "",
      sourceUrl: options.sourceUrl || "",
      renderAllowed: false,
      verifiedForRender: false,
      promotionRequired: true,
      cacheStatus: "failed",
      failure: clean(error?.message || String(error), 300),
      rejectIf: ["candidateAssetRenderedWithoutPromotion", "imageFetchOrCropFailed"],
    }], { sourceUrl: options.sourceUrl || "" })[0];
  }
}

async function main() {
  const pageUrl = process.env.A1_ARTICLE_URL || argValue("url");
  const htmlFile = process.env.A1_ARTICLE_HTML_FILE || argValue("html-file");
  if (!pageUrl && !htmlFile) {
    console.error("A1_ARTICLE_URL or A1_ARTICLE_HTML_FILE is required.");
    process.exit(1);
  }
  if (sourceOnlyCapture && htmlFile) throw new Error("SOURCE_ONLY_CAPTURE_REQUIRES_PUBLIC_URL");
  const jobSeed = process.env.A1_ARTICLE_JOB_ID || argValue("job-id") || pageUrl || htmlFile;
  const jobId = slug(jobSeed).slice(0, 80);
  const jobDir = path.resolve(process.env.A1_ARTICLE_OUTPUT_DIR || argValue("output-dir") || path.join(root, ".codex-artifacts", "article-ingestion", jobId));
  await fs.mkdir(path.join(jobDir, "assets"), { recursive: true });

  const capturedAt = new Date().toISOString();
  const strategy = buildWebCaptureStrategy({ sourceUrl: pageUrl || pathToFileURL(path.resolve(htmlFile)).href }, {
    localDependencies: {
      playwright: "available-devDependency",
      readability: "installed",
      jsdom: "installed",
      sharp: "installed",
    },
  });
  const strategyValidation = validateWebCaptureStrategy(strategy);
  if (!strategyValidation.ok) {
    console.error(`Web capture strategy invalid:\n- ${strategyValidation.failures.join("\n- ")}`);
    process.exit(1);
  }
  const adapterManifest = buildWebCaptureAdapterManifest({ sourceUrl: pageUrl || pathToFileURL(path.resolve(htmlFile)).href });
  const adapterManifestValidation = validateWebCaptureAdapterManifest(adapterManifest);
  if (!adapterManifestValidation.ok) {
    console.error(`Web capture adapter manifest invalid:\n- ${adapterManifestValidation.failures.join("\n- ")}`);
    process.exit(1);
  }
  const captureRecipe = buildWebCaptureRecipe({ url: pageUrl || pathToFileURL(path.resolve(htmlFile)).href });
  const recipeValidation = validateWebCaptureRecipe(captureRecipe);
  if (!recipeValidation.ok) {
    console.error(`Web capture recipe invalid:\n- ${recipeValidation.failures.join("\n- ")}`);
    process.exit(1);
  }

  const capture = await capturePage({ pageUrl, htmlFile, jobDir, recipe: captureRecipe });
  const sourceUrl = pageUrl || capture.targetUrl;
  const article = readabilityFor(capture.html, sourceUrl);
  await fs.writeFile(path.join(jobDir, "source.html"), capture.html);
  await fs.writeFile(path.join(jobDir, "readability.json"), `${JSON.stringify(article, null, 2)}\n`);
  await fs.writeFile(path.join(jobDir, "readability-text.txt"), `${article.textContent}\n`);
  await fs.writeFile(path.join(jobDir, "page-metadata.json"), `${JSON.stringify(capture.metadata, null, 2)}\n`);
  const contentQualification = assessArticleCaptureContent({title: capture.metadata.title || article.title || '', textContent: article.textContent || '', html: capture.html});
  await fs.writeFile(path.join(jobDir, "content-qualification.json"), `${JSON.stringify(contentQualification, null, 2)}\n`);
  if (!contentQualification.articleContentAvailable) throw new Error(contentQualification.reason);

  const screenshotCandidates = [
    ...(capture.recipeClipScreenshots || []),
    ...(capture.elementEvidenceScreenshots || []),
    {
      id: "webpage-element-screenshot",
      sourceKind: "playwright-locator-screenshot",
      label: "Captured article/page element",
      localPath: capture.elementScreenshotPath,
      contentType: "image/png",
      cropPolicy: captureRecipe.primaryCropPolicy,
      captureRecipe: {
        contract: captureRecipe.contract,
        recipeId: captureRecipe.recipeId,
        targetClass: captureRecipe.targetClass,
        primaryCropPolicy: captureRecipe.primaryCropPolicy,
        selectorPlanId: "main-region-fallback",
      },
      score: 75,
    },
    {
      id: "webpage-viewport-screenshot",
      sourceKind: "playwright-page-screenshot-audit-only",
      label: "Captured viewport audit screenshot",
      localPath: capture.screenshotPath,
      contentType: "image/png",
      cropPolicy: "contain-safe",
      captureRecipe: {
        contract: captureRecipe.contract,
        recipeId: captureRecipe.recipeId,
        targetClass: captureRecipe.targetClass,
        primaryCropPolicy: "contain-safe",
        selectorPlanId: "viewport-audit",
      },
      score: 35,
    },
  ];
  const imageCandidates = (sourceOnlyCapture ? [] : candidateImages(capture.metadata, sourceUrl)
    .map((candidate) => ({
      ...candidate,
      cropPolicy: captureRecipe.primaryCropPolicy,
      captureRecipe: {
        contract: captureRecipe.contract,
        recipeId: captureRecipe.recipeId,
        targetClass: captureRecipe.targetClass,
        primaryCropPolicy: captureRecipe.primaryCropPolicy,
        selectorPlanId: "dom-image",
      },
    })))
    .slice(0, Math.max(0, Math.min(16, Number.isFinite(Number(process.env.A1_ARTICLE_MAX_IMAGE_CANDIDATES))
      ? Number(process.env.A1_ARTICLE_MAX_IMAGE_CANDIDATES) : 6)));
  const processed = [];
  for (const candidate of [...screenshotCandidates, ...imageCandidates]) {
    processed.push(await processImageCandidate(candidate, jobDir, {
      sourceUrl,
      capturedAt,
      timeoutMs: Number(process.env.A1_ARTICLE_IMAGE_TIMEOUT_MS || 12000),
      captureRecipe: {
        contract: captureRecipe.contract,
        recipeId: captureRecipe.recipeId,
        targetClass: captureRecipe.targetClass,
        primaryCropPolicy: captureRecipe.primaryCropPolicy,
      },
    }));
  }
  const rankedProcessed = rankEvidenceCandidates(processed, { sourceUrl });
  const contactSheetPath = await writeContactSheet(rankedProcessed, path.join(jobDir, "candidate-preview-contact-sheet.png"));
  const contactSheetManifestPath = contactSheetPath ? contactSheetPath.replace(/\.png$/iu, ".json") : "";
  const assetCandidates = {
    contract: "A1ArticleAssetCandidates/v1",
    sourceUrl,
    generatedAt: capturedAt,
    policy: {
      renderAllowedBeforePromotion: false,
      verifiedRenderGate: "A1VerifiedWebAssetManifest/v1",
      candidateOnly: true,
    },
    extractionPriority: strategy.imageCandidateExtraction.sourcesInPriorityOrder,
    webCaptureAdapterManifest: adapterManifest,
    captureRecipe,
    contactSheetPath,
    contactSheetManifestPath,
    candidates: rankedProcessed,
    verifiedForRender: [],
    rejectIf: ["candidateAssetRenderedWithoutPromotion", "visualAuditMissingBeforeRender"],
  };
  await fs.writeFile(path.join(jobDir, "asset-candidates.json"), `${JSON.stringify(assetCandidates, null, 2)}\n`);

  const source = {
    contract: "A1ArticlePageSource/v1",
    sourceUrl,
    targetUrl: capture.targetUrl,
    capturedAt,
    title: article.title || capture.metadata.title || "",
    byline: article.byline || "",
    excerpt: article.excerpt || capture.metadata.description || "",
    textLength: article.textContent.length,
    articleBodySha256: sha256(Buffer.from(article.textContent, "utf8")),
    capturePolicy: sourceOnlyCapture ? {mode: "PUBLIC_ARTICLE_SOURCE_ONLY", remoteMediaRequestsBlocked: true, mediaDownloaded: false} : null,
    screenshotPath: capture.screenshotPath,
    elementScreenshotPath: capture.elementScreenshotPath,
    elementEvidenceScreenshotPaths: [
      ...(capture.recipeClipScreenshots || []),
      ...(capture.elementEvidenceScreenshots || []),
    ]
      .map((candidate) => candidate.localPath)
      .filter(Boolean),
    articleExtraction: {
      primary: "mozilla-readability-jsdom",
      textPresent: article.textContent.length > 0,
    },
  };
  await fs.writeFile(path.join(jobDir, "source.json"), `${JSON.stringify(source, null, 2)}\n`);

  const job = {
    contract: ARTIFACT_CONTRACT,
    jobId,
    jobDir,
    sourceUrl,
    generatedAt: capturedAt,
    webCaptureStrategy: strategy,
    webCaptureAdapterManifest: adapterManifest,
    webCaptureRecipe: captureRecipe,
    artifacts: {
      source: path.join(jobDir, "source.json"),
      sourceHtml: path.join(jobDir, "source.html"),
      readability: path.join(jobDir, "readability.json"),
      readabilityText: path.join(jobDir, "readability-text.txt"),
      pageMetadata: path.join(jobDir, "page-metadata.json"),
      assetCandidates: path.join(jobDir, "asset-candidates.json"),
      pageScreenshot: capture.screenshotPath,
      elementScreenshot: capture.elementScreenshotPath,
      elementEvidenceScreenshots: [
        ...(capture.recipeClipScreenshots || []),
        ...(capture.elementEvidenceScreenshots || []),
      ]
        .map((candidate) => candidate.localPath)
        .filter(Boolean),
      contactSheet: contactSheetPath,
      contactSheetManifest: contactSheetManifestPath,
    },
    summary: {
      title: source.title,
      textLength: source.textLength,
      imageCandidateCount: rankedProcessed.length,
      elementEvidenceScreenshotCount: (capture.elementEvidenceScreenshots || []).length,
      recipeClipScreenshotCount: (capture.recipeClipScreenshots || []).length,
      cachedCandidateCount: rankedProcessed.filter((candidate) => candidate.localOriginalPath).length,
      failedCandidateCount: rankedProcessed.filter((candidate) => candidate.cacheStatus === "failed").length,
      renderAllowedCount: rankedProcessed.filter((candidate) => candidate.renderAllowed === true).length,
      topCandidateQualityScore: Number(rankedProcessed[0]?.qualityScore || 0),
      topCandidateQualityTier: clean(rankedProcessed[0]?.qualityTier || "", 40),
      sourceOnlyCapture,
      remoteMediaDownloaded: sourceOnlyCapture ? false : null,
    },
    rejectIf: ["candidateAssetRenderedWithoutPromotion", "articleUnderstandingSkipped", "cropPlanNotPersisted"],
  };
  await fs.writeFile(path.join(jobDir, "web-capture-job.json"), `${JSON.stringify(job, null, 2)}\n`);
  console.log(`Article page capture complete: ${jobDir}`);
  console.log(`Text length: ${job.summary.textLength}`);
  console.log(`Image candidates: ${job.summary.imageCandidateCount}`);
  console.log(`Cached candidates: ${job.summary.cachedCandidateCount}`);
  console.log(`Render allowed before promotion: ${job.summary.renderAllowedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
