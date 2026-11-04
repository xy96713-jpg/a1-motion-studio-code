import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildRveEvidenceAdapterForScene } from "../lib/storyboard-rve-evidence-adapter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");

const argValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const clean = (value = "", max = 260) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

const escapeHtml = (value = "") => String(value || "")
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

const compactScreenTitle = (value = "", fallback = "Article evidence") => {
  const normalized = clean(value || fallback, 140);
  const firstClause = normalized.split(/\s[-:|–—]\s|[,;：，；]/u)[0]?.trim() || normalized;
  if (firstClause.length <= 48) return firstClause;
  const clipped = firstClause.slice(0, 49).replace(/\s+\S*$/u, "").trim();
  return clipped || firstClause.slice(0, 48).trim();
};

const slugify = (value = "") => clean(value, 120)
  .toLowerCase()
  .replace(/^https?:\/\//u, "")
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/^-+|-+$/gu, "")
  .slice(0, 80) || "article-evidence";

const safeUrl = (value = "") => {
  const raw = clean(value, 900);
  if (!raw) return "";
  try {
    const url = new URL(/^www\./iu.test(raw) ? `https://${raw}` : raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
};

const contentTypeToExt = (contentType = "", url = "") => {
  const type = String(contentType).toLowerCase();
  if (type.includes("image/jpeg") || type.includes("image/jpg")) return "jpg";
  if (type.includes("image/png")) return "png";
  if (type.includes("image/webp")) return "webp";
  if (type.includes("image/gif")) return "gif";
  const urlExt = safeUrl(url) ? new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/iu)?.[1]?.toLowerCase() : "";
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(urlExt) ? urlExt.replace("jpeg", "jpg") : "jpg";
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    }
  });
});

const extractArticleMediaCandidates = async (page) => page.evaluate(() => {
  const cleanText = (value = "", max = 320) => String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  const absoluteUrl = (value = "") => {
    try {
      if (!value || /^data:|^blob:/iu.test(value)) return "";
      return new URL(value, document.baseURI).href;
    } catch {
      return "";
    }
  };
  const bestSrcsetUrl = (srcset = "") => {
    const entries = String(srcset || "")
      .split(",")
      .map((part) => {
        const [url, descriptor = ""] = part.trim().split(/\s+/u);
        const score = Number(descriptor.replace(/[^\d.]/gu, "")) || 1;
        return { url: absoluteUrl(url), score };
      })
      .filter((entry) => entry.url);
    return entries.sort((a, b) => b.score - a.score)[0]?.url || "";
  };
  const metaContent = (selector) => document.querySelector(selector)?.getAttribute("content") || "";
  const badUrlPattern = /(sprite|logo|icon|favicon|avatar|author|tracking|pixel|spacer|blank|transparent|badge|adservice|doubleclick|analytics)/iu;
  const candidates = [];
  const seen = new Set();
  const push = (candidate) => {
    const url = absoluteUrl(candidate.url);
    if (!url || seen.has(url) || badUrlPattern.test(url)) return;
    seen.add(url);
    const width = Number(candidate.width) || 0;
    const height = Number(candidate.height) || 0;
    const smallKnownImage = width > 0 && height > 0 && (width < 240 || height < 120);
    if (smallKnownImage) return;
    candidates.push({
      url,
      role: candidate.role || "image",
      selector: candidate.selector || "",
      caption: cleanText(candidate.caption || ""),
      alt: cleanText(candidate.alt || ""),
      title: cleanText(candidate.title || ""),
      width,
      height,
      score: Number(candidate.score) || 0,
    });
  };

  push({
    url: metaContent('meta[property="og:image"]') || metaContent('meta[property="og:image:url"]'),
    role: "og:image",
    selector: 'meta[property="og:image"]',
    caption: metaContent('meta[property="og:title"]') || document.title,
    width: Number(metaContent('meta[property="og:image:width"]')) || 0,
    height: Number(metaContent('meta[property="og:image:height"]')) || 0,
    score: 120,
  });
  push({
    url: metaContent('meta[name="twitter:image"]') || metaContent('meta[property="twitter:image"]'),
    role: "twitter:image",
    selector: 'meta[name="twitter:image"]',
    caption: metaContent('meta[name="twitter:title"]') || document.title,
    score: 112,
  });

  const imageRows = [
    ...document.querySelectorAll("article figure img, main figure img, figure img, article img, main img, [itemprop='image'], img"),
  ];
  for (const img of imageRows) {
    const figure = img.closest("figure");
    const caption = figure?.querySelector("figcaption")?.innerText
      || img.closest("[aria-label]")?.getAttribute("aria-label")
      || img.getAttribute("data-caption")
      || "";
    const role = figure ? "figure-image" : img.closest("article") ? "article-image" : img.closest("main") ? "main-image" : "page-image";
    const roleScore = role === "figure-image" ? 100 : role === "article-image" ? 92 : role === "main-image" ? 84 : 44;
    const areaScore = Math.min(42, ((img.naturalWidth || 0) * (img.naturalHeight || 0)) / 45000);
    const captionScore = caption ? 16 : 0;
    push({
      url: img.currentSrc || bestSrcsetUrl(img.getAttribute("srcset")) || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original"),
      role,
      selector: role,
      caption,
      alt: img.getAttribute("alt") || "",
      title: img.getAttribute("title") || "",
      width: img.naturalWidth || Number(img.getAttribute("width")) || 0,
      height: img.naturalHeight || Number(img.getAttribute("height")) || 0,
      score: roleScore + areaScore + captionScore,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
});

const downloadBestArticleImage = async ({ context, candidates, sourceUrl, captureDir }) => {
  const errors = [];
  for (const candidate of candidates) {
    try {
      const response = await context.request.get(candidate.url, {
        timeout: 30000,
        headers: {
          referer: sourceUrl,
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "user-agent": "Mozilla/5.0 A1MotionStudioArticleMedia/1.0",
        },
      });
      const contentType = response.headers()["content-type"] || "";
      if (!response.ok() || !/^image\//iu.test(contentType) || /svg/iu.test(contentType)) {
        errors.push({ url: candidate.url, status: response.status(), contentType });
        continue;
      }
      const buffer = await response.body();
      if (buffer.byteLength < 8000) {
        errors.push({ url: candidate.url, status: response.status(), contentType, bytes: buffer.byteLength });
        continue;
      }
      const ext = contentTypeToExt(contentType, candidate.url);
      const fileName = `article-image.${ext}`;
      const localPath = path.join(captureDir, fileName);
      await fs.writeFile(localPath, buffer);
      return {
        candidate: {
          ...candidate,
          contentType,
          bytes: buffer.byteLength,
        },
        fileName,
        localPath,
        ext,
      };
    } catch (error) {
      errors.push({ url: candidate.url, error: error.message });
    }
  }
  const message = errors.slice(0, 5).map((error) => `${error.status || "ERR"} ${error.contentType || ""} ${error.url || ""} ${error.error || ""}`).join(" | ");
  throw new Error(`No usable article image could be downloaded. ${message}`);
};

const sourceUrl = safeUrl(argValue("url", "https://www.remotion.dev/"));
if (!sourceUrl) {
  throw new Error("Missing valid --url=https://...");
}

const titleArg = clean(argValue("title", "文章配图证据模板镜头"), 90);
const allowScreenshotFallback = argValue("allow-screenshot-fallback", "false") === "true";
const captureSlug = slugify(sourceUrl);
const captureDir = path.join(root, "public", "assets", "web-evidence-captures", captureSlug);
const manifestPath = path.join(captureDir, "manifest.json");
const debugScreenshotPath = path.join(captureDir, "page-viewport-debug.png");
const outputRel = `../public/generated/rve-template-bound/live-evidence-${captureSlug}.mp4`;
const outputPath = path.join(root, "public", "generated", "rve-template-bound", `live-evidence-${captureSlug}.mp4`);
const propsPath = path.join(root, "public", "template-confirmations", `rve-live-evidence-${captureSlug}-props.json`);
const previewPath = path.join(root, "public", "rve-live-evidence-preview.html");

await fs.mkdir(captureDir, { recursive: true });
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(propsPath), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 810 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.goto(sourceUrl, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(900);
const pageInfo = await page.evaluate(() => ({
  title: document.title || "",
  bodyText: document.body?.innerText?.slice(0, 1200) || "",
  canonical: document.querySelector('link[rel="canonical"]')?.href || location.href,
  ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "",
  twitterImage: document.querySelector('meta[name="twitter:image"]')?.getAttribute("content") || "",
  description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
}));
const blockedPagePattern = /(failed to verify your browser|security checkpoint|checking your browser|captcha|verify you are human|access denied|just a moment)/iu;
if (blockedPagePattern.test(`${pageInfo.title}\n${pageInfo.bodyText}`)) {
  await browser.close();
  throw new Error(`Captured page appears blocked by bot/security checkpoint: ${sourceUrl}`);
}

const mediaCandidates = await extractArticleMediaCandidates(page);
let downloaded = null;
let mainVisualMode = "article-image";
try {
  downloaded = await downloadBestArticleImage({ context, candidates: mediaCandidates, sourceUrl, captureDir });
} catch (error) {
  if (!allowScreenshotFallback) {
    await browser.close();
    throw new Error(`${error.message} Screenshot fallback is disabled because article visuals must come from in-page media.`);
  }
  await page.screenshot({ path: debugScreenshotPath, fullPage: false });
  downloaded = {
    candidate: {
      url: sourceUrl,
      role: "webpage-screenshot-fallback",
      caption: "Debug fallback screenshot. Not valid as promoted article evidence.",
      alt: "",
      title: pageInfo.title,
      width: 1440,
      height: 810,
      contentType: "image/png",
      bytes: (await fs.stat(debugScreenshotPath)).size,
    },
    fileName: "page-viewport-debug.png",
    localPath: debugScreenshotPath,
    ext: "png",
  };
  mainVisualMode = "webpage-screenshot-fallback";
}
await browser.close();

const publicImageUrl = `/assets/web-evidence-captures/${captureSlug}/${downloaded.fileName}`;
const stat = await fs.stat(downloaded.localPath);
const manifest = {
  contract: "A1LiveArticleMediaCapture/v1",
  capturedAt: new Date().toISOString(),
  sourceUrl,
  canonicalUrl: pageInfo.canonical || sourceUrl,
  pageTitle: pageInfo.title,
  description: pageInfo.description,
  ogImage: pageInfo.ogImage,
  twitterImage: pageInfo.twitterImage,
  blockedPageChecked: true,
  mainVisualMode,
  mediaCandidateCount: mediaCandidates.length,
  mediaCandidates: mediaCandidates.slice(0, 12),
  selectedMedia: downloaded.candidate,
  cachedImageUrl: publicImageUrl,
  localPath: downloaded.localPath,
  bytes: stat.size,
  renderAllowed: mainVisualMode === "article-image",
  verifiedForRender: mainVisualMode === "article-image",
  license: "article-image-for-local-review",
  rejectIf: ["webpageScreenshotPromoted", "fakeWebsiteScreenshot", "uncachedRemoteImage", "missingArticleImage", "missingSourceUrl", "botCheckpointCaptured"],
};
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (mainVisualMode !== "article-image") {
  throw new Error(`Article image extraction failed and only screenshot fallback exists: ${sourceUrl}`);
}

const caption = clean(downloaded.candidate.caption || downloaded.candidate.alt || downloaded.candidate.title || pageInfo.title, 150);
const templateTitle = compactScreenTitle(caption || titleArg, titleArg);
const scene = {
  id: `live-evidence-${captureSlug}`,
  type: "image",
  headline: templateTitle,
  body: caption && caption !== templateTitle ? caption : `文章内配图已抓取并缓存：${sourceUrl}`,
  duration: 5.2,
  assets: [{
    id: `verified:article-image:${captureSlug}`,
    kind: "article-image",
    url: publicImageUrl,
    sourceUrl,
    attribution: sourceUrl,
    caption,
    license: manifest.license,
    renderAllowed: true,
    verifiedForRender: true,
    imageFocalPlan: {
      objectPosition: { x: 50, y: 48 },
      zoom: 112,
    },
  }],
};

const adapter = buildRveEvidenceAdapterForScene(scene, {
  sceneId: scene.id,
  detectedSkill: "real-article-media-proof",
  assetNeeds: ["article-image"],
  rveOfficialAdapterCandidates: [{
    id: "rve-official:image-zoom-reveal",
    slug: "image-zoom-reveal",
    compositionId: "RVEImageZoomReveal",
    sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
    sourcePath: "external/rve-remotion-templates/templates/image-zoom-reveal.tsx",
    originalDemo: "https://www.reactvideoeditor.com/remotion-templates/image-zoom-reveal",
    previewVideo: "generated/rve-official-effect-preview/image-zoom-reveal.mp4",
  }],
});

const sourceImage = await fs.readFile(downloaded.localPath);
const props = {
  ...adapter.params,
  imageUrl: `data:${downloaded.candidate.contentType};base64,${sourceImage.toString("base64")}`,
};
await fs.writeFile(propsPath, `${JSON.stringify({
  contract: "A1RveLiveArticleMediaTemplateBoundProps/v1",
  generatedAt: new Date().toISOString(),
  sourceCompositionId: adapter.sourceCompositionId,
  sourceSlug: adapter.sourceSlug,
  sourcePath: adapter.sourcePath,
  captureManifest: `/assets/web-evidence-captures/${captureSlug}/manifest.json`,
  output: `generated/rve-template-bound/live-evidence-${captureSlug}.mp4`,
  props: {
    ...props,
    imageUrl: `data:${downloaded.candidate.contentType};base64,<captured-article-image>`,
  },
  metadata: adapter.metadata,
}, null, 2)}\n`);

await run("npm", [
  "exec",
  "--",
  "remotion",
  "render",
  "src/index.ts",
  adapter.sourceCompositionId,
  outputRel,
  "--props",
  JSON.stringify(props),
  "--overwrite",
], { cwd: rendererDir });

const outputStat = await fs.stat(outputPath);
const outputUrl = `generated/rve-template-bound/live-evidence-${captureSlug}.mp4`;
const safeManifest = JSON.stringify(manifest, null, 2).replace(/</gu, "\\u003c");
const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Article Media Template Render</title>
  <style>
    :root { color-scheme: dark; --bg: #050706; --panel: #10150d; --line: rgba(236,255,218,.18); --ink: #f6f5e8; --muted: rgba(246,245,232,.62); --accent: #c8ff26; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif; }
    main { min-height: 100vh; display: grid; grid-template-columns: minmax(720px, 1fr) 430px; }
    .preview { display: grid; align-content: center; gap: 18px; padding: 32px; }
    .frame { border: 1px solid var(--line); background: #020302; }
    video, img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; background: #000; }
    .meta { display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; border-top: 1px solid var(--line); color: rgba(246,245,232,.68); font: 800 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .meta strong { color: var(--accent); }
    aside { border-left: 1px solid var(--line); background: var(--panel); padding: 28px 24px; overflow: auto; }
    h1 { margin: 0 0 8px; font-size: 25px; line-height: 1; }
    p { margin: 0 0 20px; color: var(--muted); line-height: 1.45; font-weight: 750; }
    .field { margin-bottom: 14px; }
    .label { margin-bottom: 7px; color: rgba(246,245,232,.58); font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .value, pre { border: 1px solid rgba(236,255,218,.18); background: #060904; color: rgba(246,245,232,.84); padding: 10px 11px; font: 800 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    pre { margin: 0; max-height: 360px; overflow: auto; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main data-live-evidence-template-render="A1LiveArticleMediaToRveTemplateRender/v1">
    <section class="preview">
      <div class="frame">
        <video id="renderedVideo" src="${outputUrl}" autoplay muted loop playsinline controls></video>
        <div class="meta"><strong>${escapeHtml(adapter.sourceCompositionId)}</strong><span>${outputUrl}</span></div>
      </div>
      <div class="frame">
        <img src="${publicImageUrl}" alt="${escapeHtml(caption || "Captured article media")}" />
        <div class="meta"><strong>Article media</strong><span>${escapeHtml(caption || sourceUrl)}</span></div>
      </div>
    </section>
    <aside>
      <h1>Article Media Render</h1>
      <p>已从文章内部提取主图/配图并缓存，再交给 RVE 官方模板渲染；网页截图只允许作为调试，不再进入正式镜头。</p>
      <div class="field"><div class="label">Source URL</div><div class="value">${escapeHtml(sourceUrl)}</div></div>
      <div class="field"><div class="label">Selected Media</div><div class="value">${escapeHtml(downloaded.candidate.url)}</div></div>
      <div class="field"><div class="label">Caption / Alt</div><div class="value">${escapeHtml(caption || "(none)")}</div></div>
      <div class="field"><div class="label">Cached Image</div><div class="value">${escapeHtml(publicImageUrl)}</div></div>
      <div class="field"><div class="label">Output Video</div><div class="value">${escapeHtml(outputUrl)}</div></div>
      <div class="field"><div class="label">Capture Manifest</div><pre>${safeManifest}</pre></div>
    </aside>
  </main>
</body>
</html>`;
await fs.writeFile(previewPath, previewHtml);

console.log(JSON.stringify({
  contract: "A1LiveArticleMediaToRveTemplateRender/v1",
  sourceUrl,
  selectedMediaUrl: downloaded.candidate.url,
  selectedMediaCaption: caption,
  captureManifest: manifestPath,
  cachedImagePath: downloaded.localPath,
  cachedImageUrl: publicImageUrl,
  outputPath,
  outputUrl,
  previewPath,
  propsPath,
  sourceCompositionId: adapter.sourceCompositionId,
  bytes: outputStat.size,
}, null, 2));
