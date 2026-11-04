import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");

const argValue = (name, fallback = "") => {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const clean = (value = "", max = 500) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, max);

const decodeEntities = (value = "") => String(value || "")
  .replace(/&amp;/gu, "&")
  .replace(/&lt;/gu, "<")
  .replace(/&gt;/gu, ">")
  .replace(/&quot;/gu, "\"")
  .replace(/&#39;/gu, "'");

const escapeHtml = (value = "") => String(value || "")
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

const safeUrl = (value = "") => {
  const raw = decodeEntities(clean(value, 1200));
  if (!raw) return "";
  try {
    const url = new URL(/^www\./iu.test(raw) ? `https://${raw}` : raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
};

const slugify = (value = "") => clean(value, 160)
  .toLowerCase()
  .replace(/^https?:\/\//u, "")
  .replace(/[^a-z0-9]+/gu, "-")
  .replace(/^-+|-+$/gu, "")
  .slice(0, 72) || "multi-image-pack";

const contentTypeToExt = (contentType = "", url = "") => {
  const type = String(contentType).toLowerCase();
  if (type.includes("image/jpeg") || type.includes("image/jpg")) return "jpg";
  if (type.includes("image/png")) return "png";
  if (type.includes("image/webp")) return "webp";
  const urlExt = safeUrl(url) ? new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/iu)?.[1]?.toLowerCase() : "";
  return ["jpg", "jpeg", "png", "webp"].includes(urlExt) ? urlExt.replace("jpeg", "jpg") : "jpg";
};

const meaningfulTokens = (value = "") => {
  const stop = new Set(["the", "and", "for", "with", "from", "that", "this", "into", "about", "best", "news", "press", "release", "video", "videos"]);
  return [...String(value).toLowerCase().matchAll(/[a-z][a-z0-9-]{2,}/gu)]
    .map((match) => match[0].replace(/s$/u, ""))
    .filter((token) => !stop.has(token));
};

const textMatchScore = (needles = [], haystack = "") => {
  const lower = String(haystack || "").toLowerCase();
  return needles.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0);
};

const rankMediaCandidate = (candidate = {}, articleTitle = "", query = "") => {
  const queryTokens = meaningfulTokens(`${query} ${articleTitle}`).slice(0, 10);
  const ownText = [candidate.caption, candidate.alt, candidate.url].filter(Boolean).join(" ");
  const articleText = articleTitle || "";
  const ownMatches = textMatchScore(queryTokens, ownText);
  const articleMatches = textMatchScore(queryTokens, articleText);
  const roleBoost = {
    "rss-media": 52,
    "json-ld-image": 46,
    "og:image": 42,
    "twitter:image": 36,
    "figure-image": 22,
    "article-image": 8,
    "main-image": 6,
    "page-image": -18,
  }[candidate.role] ?? 0;
  const hasOwnLabel = Boolean(clean(`${candidate.caption || ""} ${candidate.alt || ""}`, 160));
  const likelyUnrelatedInline = ["article-image", "figure-image", "main-image", "page-image"].includes(candidate.role)
    && hasOwnLabel
    && ownMatches === 0
    && articleMatches > 0;
  const unrelatedPenalty = likelyUnrelatedInline ? 76 : 0;
  const urlNoisePenalty = /(keyboard|coupon|deal|sponsor|avatar|logo|author|press-release-button)/iu.test(candidate.url || "") ? 36 : 0;
  return Number(candidate.score || 0) + roleBoost + ownMatches * 34 + articleMatches * 8 - unrelatedPenalty - urlNoisePenalty;
};

const fetchText = async (url, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 A1MotionStudioEvidenceBot/1.0",
        accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8",
      },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
};

const extractRssItems = (xml = "", source = "") => {
  const items = [];
  for (const itemMatch of String(xml).matchAll(/<item\b[^>]*>[\s\S]*?<\/item>/giu)) {
    const item = itemMatch[0];
    const title = decodeEntities(item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/iu)?.[1]
      || item.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]
      || "");
    const rawLink = decodeEntities(item.match(/<link>([\s\S]*?)<\/link>/iu)?.[1] || "");
    let url = safeUrl(rawLink);
    if (/bing\.com\/news\/apiclick/iu.test(url)) {
      try {
        const parsed = new URL(url);
        url = safeUrl(parsed.searchParams.get("url") || "");
      } catch {
        url = "";
      }
    }
    const mediaUrl = safeUrl(item.match(/<media:content\b[^>]*url=["']([^"']+)["']/iu)?.[1]
      || item.match(/<enclosure\b[^>]*url=["']([^"']+)["']/iu)?.[1]
      || "");
    if (!url) continue;
    items.push({ source, title: clean(title, 220), url, mediaUrl });
  }
  return items;
};

const searchNews = async (query) => {
  const encoded = encodeURIComponent(query);
  const feeds = [
    { source: "bing-news-rss", url: `https://www.bing.com/news/search?q=${encoded}&format=rss` },
    { source: "google-news-rss", url: `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en` },
  ];
  const results = [];
  const errors = [];
  for (const feed of feeds) {
    try {
      const response = await fetchText(feed.url);
      if (!response.ok) {
        errors.push({ source: feed.source, status: response.status });
        continue;
      }
      results.push(...extractRssItems(response.text, feed.source));
    } catch (error) {
      errors.push({ source: feed.source, error: error.message });
    }
  }
  const seen = new Set();
  return {
    errors,
    candidates: results.filter((item) => {
      const key = item.url.replace(/#.*$/u, "");
      if (seen.has(key) || /news\.google\.com\/rss\/articles/iu.test(key)) return false;
      seen.add(key);
      return true;
    }),
  };
};

const extractMediaCandidates = async (page) => page.evaluate(() => {
  const cleanText = (value = "", max = 320) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  const absoluteUrl = (value = "") => {
    try {
      if (!value || /^data:|^blob:/iu.test(value)) return "";
      return new URL(value, document.baseURI).href;
    } catch {
      return "";
    }
  };
  const bestSrcsetUrl = (srcset = "") => {
    const entries = String(srcset || "").split(",").map((part) => {
      const [url, descriptor = ""] = part.trim().split(/\s+/u);
      return { url: absoluteUrl(url), score: Number(descriptor.replace(/[^\d.]/gu, "")) || 1 };
    }).filter((entry) => entry.url);
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
    if (width > 0 && height > 0 && (width < 240 || height < 120)) return;
    candidates.push({ ...candidate, url, caption: cleanText(candidate.caption || ""), alt: cleanText(candidate.alt || "") });
  };

  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')]) {
    try {
      const parsed = JSON.parse(script.textContent || "{}");
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [])];
      for (const node of nodes) {
        const image = node?.image;
        const imageUrls = Array.isArray(image) ? image : [image];
        for (const entry of imageUrls) {
          push({
            url: typeof entry === "string" ? entry : entry?.url,
            role: "json-ld-image",
            caption: node?.headline || document.title,
            score: 126,
          });
        }
      }
    } catch {
      // Ignore invalid structured data.
    }
  }
  push({ url: metaContent('meta[property="og:image"]') || metaContent('meta[property="og:image:url"]'), role: "og:image", caption: metaContent('meta[property="og:title"]') || document.title, score: 120 });
  push({ url: metaContent('meta[name="twitter:image"]') || metaContent('meta[property="twitter:image"]'), role: "twitter:image", caption: metaContent('meta[name="twitter:title"]') || document.title, score: 112 });

  for (const img of [...document.querySelectorAll("article figure img, main figure img, figure img, article img, main img, [itemprop='image'], img")]) {
    const figure = img.closest("figure");
    const caption = figure?.querySelector("figcaption")?.innerText || img.getAttribute("data-caption") || "";
    const role = figure ? "figure-image" : img.closest("article") ? "article-image" : img.closest("main") ? "main-image" : "page-image";
    const roleScore = role === "figure-image" ? 100 : role === "article-image" ? 92 : role === "main-image" ? 84 : 44;
    const areaScore = Math.min(42, ((img.naturalWidth || 0) * (img.naturalHeight || 0)) / 45000);
    push({
      url: img.currentSrc || bestSrcsetUrl(img.getAttribute("srcset")) || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original"),
      role,
      caption,
      alt: img.getAttribute("alt") || "",
      width: img.naturalWidth || Number(img.getAttribute("width")) || 0,
      height: img.naturalHeight || Number(img.getAttribute("height")) || 0,
      score: roleScore + areaScore + (caption ? 16 : 0),
    });
  }
  return candidates.sort((a, b) => b.score - a.score);
});

const downloadImage = async ({ context, candidate, referer, outputPath }) => {
  const response = await context.request.get(candidate.url, {
    timeout: 30000,
    headers: {
      referer,
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 A1MotionStudioMultiImage/1.0",
    },
  });
  const contentType = response.headers()["content-type"] || "";
  if (!response.ok() || !/^image\//iu.test(contentType) || /svg/iu.test(contentType)) return null;
  const buffer = await response.body();
  if (buffer.byteLength < 10000) return null;
  const ext = contentTypeToExt(contentType, candidate.url);
  const localPath = outputPath.replace(/\.image$/u, `.${ext}`);
  await fs.writeFile(localPath, buffer);
  return { ...candidate, contentType, bytes: buffer.byteLength, localPath, ext };
};

const runRemotion = (args) => new Promise((resolve) => {
  const child = spawn(remotionBin, args, { cwd: rendererDir, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => resolve({ code, output }));
});

const query = clean(argValue("query", "AI video generation"), 220);
const maxImages = Math.max(3, Math.min(8, Number(argValue("images", "6")) || 6));
const maxCandidates = Math.max(maxImages, Math.min(14, Number(argValue("max", "10")) || 10));
const packSlug = slugify(query);
const packDir = path.join(root, "public", "assets", "multi-image-news-packs", packSlug);
const outputDir = path.join(root, "public", "generated", "rve-multi-image-news-pack");
await fs.mkdir(packDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

const search = await searchNews(query);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });
const selectedImages = [];
const attempts = [];
const seenImageUrls = new Set();
const blockedPattern = /(failed to verify your browser|security checkpoint|checking your browser|captcha|verify you are human|access denied|just a moment)/iu;

for (const candidateArticle of search.candidates.slice(0, maxCandidates)) {
  if (selectedImages.length >= maxImages) break;
  const page = await context.newPage();
  try {
    await page.goto(candidateArticle.url, { waitUntil: "domcontentloaded", timeout: 18000 });
    await page.waitForTimeout(1200);
    const pageInfo = await page.evaluate(() => ({
      title: document.title || "",
      bodyText: document.body?.innerText?.slice(0, 900) || "",
      canonical: document.querySelector('link[rel="canonical"]')?.href || location.href,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    }));
    if (blockedPattern.test(`${pageInfo.title}\n${pageInfo.bodyText}`)) {
      attempts.push({ article: candidateArticle, ok: false, reason: "blocked" });
      await page.close();
      continue;
    }
    const mediaCandidates = await extractMediaCandidates(page);
    let selected = null;
    const rankedMediaCandidates = [
      candidateArticle.mediaUrl ? { url: candidateArticle.mediaUrl, role: "rss-media", caption: candidateArticle.title, score: 130 } : null,
      ...mediaCandidates,
    ]
      .filter(Boolean)
      .map((mediaCandidate) => ({
        ...mediaCandidate,
        relevanceScore: rankMediaCandidate(mediaCandidate, candidateArticle.title, query),
      }))
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    for (const mediaCandidate of rankedMediaCandidates) {
      if (seenImageUrls.has(mediaCandidate.url)) continue;
      const outputPath = path.join(packDir, `image-${String(selectedImages.length + 1).padStart(2, "0")}.image`);
      selected = await downloadImage({ context, candidate: mediaCandidate, referer: candidateArticle.url, outputPath }).catch(() => null);
      if (selected) {
        seenImageUrls.add(mediaCandidate.url);
        selectedImages.push({
          ...selected,
          articleTitle: candidateArticle.title || pageInfo.title,
          articleUrl: candidateArticle.url,
          canonicalUrl: pageInfo.canonical || candidateArticle.url,
          cachedImageUrl: `/assets/multi-image-news-packs/${packSlug}/${path.basename(selected.localPath)}`,
        });
        break;
      }
    }
    attempts.push({ article: candidateArticle, ok: Boolean(selected), mediaCandidateCount: mediaCandidates.length });
  } catch (error) {
    attempts.push({ article: candidateArticle, ok: false, reason: error.message });
  } finally {
    await page.close().catch(() => {});
  }
}
await browser.close();

if (selectedImages.length < 3) {
  throw new Error(`Only found ${selectedImages.length} related images for query "${query}". Need at least 3.`);
}

const imageDataUrls = await Promise.all(selectedImages.map(async (image) => {
  const buffer = await fs.readFile(image.localPath);
  return `data:${image.contentType};base64,${buffer.toString("base64")}`;
}));
const sourceHosts = [...new Set(selectedImages.map((image) => new URL(image.articleUrl).hostname.replace(/^www\./u, "")).slice(0, 4))].join(" / ");
const title = clean(query, 72);
const subtitle = clean(selectedImages[0]?.articleTitle || "", 120);

const variants = [
  { slug: "image-carousel", compositionId: "RVEImageCarousel", label: "Image Carousel", use: "多图轮播 / 多来源相关图" },
  { slug: "gallery-grid", compositionId: "RVEGalleryGrid", label: "Gallery Grid", use: "证据墙 / 多图并列" },
  { slug: "masonry-gallery", compositionId: "RVEMasonryGallery", label: "Masonry Gallery", use: "资料拼贴 / 视觉氛围" },
  { slug: "photo-stack", compositionId: "RVEPhotoStack", label: "Photo Stack", use: "资料堆叠 / 回顾段落" },
];

const results = [];
for (const variant of variants) {
  const props = { imageUrls: imageDataUrls, imageUrl: imageDataUrls[0], title, subtitle, source: sourceHosts };
  const outputRel = `../public/generated/rve-multi-image-news-pack/${variant.slug}.mp4`;
  const outputPath = path.join(outputDir, `${variant.slug}.mp4`);
  const posterRel = `generated/rve-multi-image-news-pack/${variant.slug}-poster.png`;
  const render = await runRemotion(["render", "src/index.ts", variant.compositionId, outputRel, "--props", JSON.stringify(props), "--overwrite", "--codec=h264", "--log=warn"]);
  if (render.code !== 0) {
    results.push({ ...variant, ok: false, error: render.output.slice(-1800) });
    continue;
  }
  const still = await runRemotion(["still", "src/index.ts", variant.compositionId, `../public/${posterRel}`, "--frame=58", "--props", JSON.stringify(props), "--overwrite", "--log=warn"]);
  if (still.code !== 0) {
    results.push({ ...variant, ok: false, error: still.output.slice(-1800) });
    continue;
  }
  const stat = await fs.stat(outputPath);
  results.push({ ...variant, ok: true, mp4: `generated/rve-multi-image-news-pack/${variant.slug}.mp4`, poster: posterRel, bytes: stat.size });
}

const report = {
  contract: "A1RveMultiImageNewsPack/v1",
  generatedAt: new Date().toISOString(),
  query,
  providerErrors: search.errors,
  selectedImageCount: selectedImages.length,
  selectedImages,
  attempts,
  variants: results,
};
const reportPath = path.join(root, "public", "template-confirmations", "rve-multi-image-news-pack.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const okResults = results.filter((result) => result.ok);
const cards = okResults.map((variant) => `
  <article class="card">
    <video src="${variant.mp4}" poster="${variant.poster}" autoplay muted loop playsinline controls></video>
    <div class="meta"><div><h2>${escapeHtml(variant.label)}</h2><p>${escapeHtml(variant.use)}</p></div><code>${escapeHtml(variant.compositionId)}</code></div>
  </article>
`).join("\n");
const sources = selectedImages.map((image, index) => `<li><strong>${index + 1}</strong> ${escapeHtml(image.articleTitle)}<br><span>${escapeHtml(image.cachedImageUrl)}</span></li>`).join("");
const previewPath = path.join(root, "public", "rve-multi-image-news-pack.html");
const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Multi Image News Pack</title>
  <style>
    :root { color-scheme: dark; --bg: #050605; --panel: #0f130c; --line: rgba(231,255,205,.18); --ink: #f6f5e8; --muted: rgba(246,245,232,.62); --accent: #d7ff2f; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif; }
    header { padding: 36px 44px 22px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: minmax(520px, 1fr) 560px; gap: 36px; align-items: end; }
    h1 { margin: 0; font-size: 68px; line-height: .9; letter-spacing: 0; }
    header p { margin: 0; color: var(--muted); font-size: 21px; line-height: 1.36; font-weight: 760; }
    .asset { margin-top: 14px; color: var(--accent); font: 900 13px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(420px, 1fr)); gap: 24px; padding: 30px 44px; }
    .card { border: 1px solid var(--line); background: var(--panel); }
    video { width: 100%; aspect-ratio: 16 / 9; display: block; background: #000; }
    .meta { border-top: 1px solid var(--line); padding: 16px; display: flex; justify-content: space-between; gap: 18px; align-items: start; }
    h2 { margin: 0; font-size: 24px; line-height: 1; }
    .meta p { margin: 8px 0 0; color: var(--muted); font-size: 15px; line-height: 1.35; font-weight: 780; }
    code { color: var(--accent); font: 900 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
    .sources { margin: 0 44px 44px; border-top: 1px solid var(--line); padding-top: 22px; color: var(--muted); }
    .sources h2 { color: var(--ink); margin-bottom: 12px; }
    .sources li { margin: 0 0 12px; line-height: 1.35; }
    .sources span { color: var(--accent); font: 800 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <div><h1>Multi Image News Pack</h1><div class="asset">${escapeHtml(query)}<br>${escapeHtml(sourceHosts)}</div></div>
    <p>先找相关新闻候选，再从多篇文章中抽取真实主图/配图，缓存成相关图片包，然后进入多图模板。不是网页截图，也不是自制图形。</p>
  </header>
  <main class="grid">${cards}</main>
  <section class="sources"><h2>Cached Related Images</h2><ol>${sources}</ol></section>
</body>
</html>`;
await fs.writeFile(previewPath, previewHtml);

if (results.some((result) => !result.ok)) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ...report, reportPath, previewPath }, null, 2));
