import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { buildImageFocalPlanFromImageData, validateImageFocalPlan } from "../lib/storyboard-image-focal-plan.js";
import {
  buildVerifiedWebAssetManifest,
  promoteWebAssetCandidate,
  validateVerifiedWebAssetManifest,
} from "../lib/storyboard-web-asset-promotion.js";

const root = process.cwd();
const assetDir = path.join(root, "assets", "web-assets");
const cacheDir = path.join(assetDir, "cache");
const candidateManifestPath = path.join(assetDir, "manifest.json");
const verifiedManifestPath = path.join(assetDir, "verified-manifest.json");

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function findCandidate(manifest = {}, candidateId = "") {
  const candidates = [
    ...(manifest.discovered || []),
    ...(manifest.promotable || []),
  ];
  return candidates.find((candidate) => candidate.id === candidateId) || null;
}

function optionalNumber(value = "") {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function focalPointFromEnv() {
  const x = optionalNumber(process.env.A1_WEB_ASSET_FOCAL_X);
  const y = optionalNumber(process.env.A1_WEB_ASSET_FOCAL_Y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function defaultReviewFor(candidate = {}) {
  const promotionMode = process.env.A1_WEB_ASSET_PROMOTION_MODE
    || (candidate.kind === "repo-preview" ? "metadata-only" : ["reference-image", "webpage-preview"].includes(candidate.kind) ? "renderable-image" : "renderable-icon");
  return {
    promotionMode,
    approvedBy: process.env.A1_WEB_ASSET_APPROVED_BY || "",
    reviewedAt: process.env.A1_WEB_ASSET_REVIEWED_AT || "",
    visualAuditPath: process.env.A1_WEB_ASSET_VISUAL_AUDIT || "",
    brandMatchStatus: process.env.A1_WEB_ASSET_BRAND_MATCH || "",
    licenseReview: process.env.A1_WEB_ASSET_LICENSE_REVIEW || "",
    license: process.env.A1_WEB_ASSET_LICENSE || "",
    previewPolicy: process.env.A1_WEB_ASSET_PREVIEW_POLICY || "",
    cachedImageUrl: process.env.A1_WEB_ASSET_CACHED_IMAGE_URL || "",
    imageUrl: process.env.A1_WEB_ASSET_IMAGE_URL || "",
    attribution: process.env.A1_WEB_ASSET_ATTRIBUTION || "",
    focalPoint: focalPointFromEnv(),
    fit: process.env.A1_WEB_ASSET_FIT || "",
    zoom: optionalNumber(process.env.A1_WEB_ASSET_ZOOM),
    width: optionalNumber(process.env.A1_WEB_ASSET_WIDTH),
    height: optionalNumber(process.env.A1_WEB_ASSET_HEIGHT),
    notes: process.env.A1_WEB_ASSET_REVIEW_NOTES || "",
  };
}

function candidateImageUrl(candidate = {}, review = {}) {
  return String(review.cachedImageUrl || review.imageUrl || candidate.cachedImageUrl || candidate.imageUrl || candidate.fullImageUrl || candidate.originalRemoteUrl || candidate.previewImageUrl || "").trim();
}

function localImagePathForUrl(value = "") {
  const text = String(value || "").trim();
  if (/^\/uploads\/[^?#]+/u.test(text)) return path.join(root, text.replace(/^\//u, "").split(/[?#]/u)[0]);
  if (/^\/assets\/web-assets\/[^?#]+/u.test(text)) return path.join(root, text.replace(/^\//u, "").split(/[?#]/u)[0]);
  return "";
}

function extensionForImage({ url = "", contentType = "" } = {}) {
  const fromType = String(contentType || "").toLowerCase();
  if (fromType.includes("png")) return "png";
  if (fromType.includes("webp")) return "webp";
  if (fromType.includes("gif")) return "gif";
  if (fromType.includes("jpeg") || fromType.includes("jpg")) return "jpg";
  const pathname = (() => {
    try {
      return new URL(url).pathname;
    } catch {
      return String(url || "").split(/[?#]/u)[0];
    }
  })();
  const match = pathname.match(/\.([a-z0-9]{3,5})$/iu);
  const ext = match?.[1]?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return "jpg";
}

function isDownloadableRemoteImageUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

async function cacheRemoteImageForReview(candidate = {}, review = {}) {
  if (!["reference-image", "webpage-preview"].includes(candidate.kind)) return review;
  if (review.cachedImageUrl || process.env.A1_WEB_ASSET_CACHE_REMOTE_IMAGE === "0") return review;
  if (review.previewPolicy !== "cached-image") return review;
  const remoteUrl = String(review.imageUrl || candidate.cachedImageUrl || candidate.imageUrl || candidate.fullImageUrl || candidate.originalRemoteUrl || candidate.previewImageUrl || "").trim();
  if (!isDownloadableRemoteImageUrl(remoteUrl)) return review;
  const response = await fetch(remoteUrl, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.1",
      "user-agent": "A1-Motion-Studio-WebAssetPromotion/1.0",
    },
    signal: AbortSignal.timeout(Number(process.env.A1_WEB_ASSET_CACHE_TIMEOUT_MS || 12000)),
  });
  if (!response.ok) throw new Error(`remote image cache failed ${response.status} ${response.statusText}: ${remoteUrl}`);
  const contentType = response.headers.get("content-type") || candidate.contentType || "";
  if (!/^image\/(?:png|jpe?g|webp|gif|avif)/iu.test(contentType)) {
    throw new Error(`remote image cache rejected non-image content-type: ${contentType || "missing"}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`remote image cache received empty body: ${remoteUrl}`);
  const maxBytes = Number(process.env.A1_WEB_ASSET_CACHE_MAX_BYTES || 15 * 1024 * 1024);
  if (bytes.length > maxBytes) throw new Error(`remote image cache exceeded limit ${bytes.length} > ${maxBytes}: ${remoteUrl}`);
  const ext = extensionForImage({ url: remoteUrl, contentType });
  const hash = crypto.createHash("sha256").update(remoteUrl).update(bytes).digest("hex").slice(0, 20);
  const fileName = `${hash}.${ext}`;
  const outputPath = path.join(cacheDir, fileName);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return {
    ...review,
    cachedImageUrl: `/assets/web-assets/cache/${fileName}`,
    imageUrl: review.imageUrl || "",
    contentType: review.contentType || contentType,
    notes: [review.notes, `Cached remote image from ${remoteUrl}`].filter(Boolean).join(" "),
  };
}

async function localImageFocalPlan(candidate = {}, review = {}) {
  if (!["reference-image", "webpage-preview"].includes(candidate.kind)) return null;
  if (review.focalPoint) return null;
  const imageUrl = candidateImageUrl(candidate, review);
  const localPath = localImagePathForUrl(imageUrl);
  if (!localPath || !fsSync.existsSync(localPath)) return null;
  const image = await loadImage(localPath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const plan = buildImageFocalPlanFromImageData(ctx.getImageData(0, 0, image.width, image.height), {
    label: candidate.label || candidate.canonicalName || candidate.id || "",
    fit: review.fit || candidate.fit || "cover",
    zoom: review.zoom || candidate.zoom,
  });
  return validateImageFocalPlan(plan).ok ? {
    ...plan,
    sourceDimensions: {
      width: image.width,
      height: image.height,
      aspect: image.height ? Number((image.width / image.height).toFixed(4)) : 0,
    },
  } : null;
}

async function reviewWithLocalFocalPlan(candidate = {}) {
  const review = await cacheRemoteImageForReview(candidate, defaultReviewFor(candidate));
  const imageFocalPlan = await localImageFocalPlan(candidate, review);
  if (!imageFocalPlan) return review;
  return {
    ...review,
    imageFocalPlan,
    width: review.width || imageFocalPlan.sourceDimensions.width,
    height: review.height || imageFocalPlan.sourceDimensions.height,
  };
}

async function main() {
  const candidateId = process.env.A1_WEB_ASSET_CANDIDATE_ID;
  if (!candidateId) {
    console.error("A1_WEB_ASSET_CANDIDATE_ID is required. Promotion must name the exact candidate to avoid accidental render approval.");
    process.exit(1);
  }

  const manifest = await readJson(candidateManifestPath);
  if (!manifest || manifest.contract !== "A1WebAssetCandidateCache/v1") {
    console.error(`Candidate manifest not found or invalid: ${candidateManifestPath}`);
    process.exit(1);
  }

  const candidate = findCandidate(manifest, candidateId);
  if (!candidate) {
    console.error(`Candidate not found: ${candidateId}`);
    process.exit(1);
  }

  const promotion = promoteWebAssetCandidate(candidate, await reviewWithLocalFocalPlan(candidate));
  if (!promotion.ok) {
    console.error(`Web asset promotion rejected:\n${promotion.failures.map((failure) => `- ${failure}`).join("\n")}`);
    process.exit(1);
  }

  const existing = await readJson(verifiedManifestPath, { entries: [] });
  const entries = [
    ...(existing.entries || []).filter((entry) => entry.sourceCandidateId !== promotion.promoted.sourceCandidateId),
    promotion.promoted,
  ];
  const verifiedManifest = buildVerifiedWebAssetManifest(entries);
  const validation = validateVerifiedWebAssetManifest(verifiedManifest);
  if (!validation.ok) {
    console.error(`Verified manifest invalid:\n${validation.failures.map((failure) => `- ${failure}`).join("\n")}`);
    process.exit(1);
  }

  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(verifiedManifestPath, `${JSON.stringify(verifiedManifest, null, 2)}\n`);
  console.log(`Promoted web asset candidate: ${candidateId}`);
  console.log(`Verified manifest: ${verifiedManifestPath}`);
  console.log(`Render allowed: ${promotion.promoted.renderAllowed === true}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
