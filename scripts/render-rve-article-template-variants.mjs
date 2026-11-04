import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");
const defaultCaptureSlug = "www-msn-com-en-us-news-technology-bytedances-new-ai-video-model-can-make-30-seco";

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

const compactTitle = (value = "") => {
  const firstClause = clean(value, 160).split(/\s[-:|–—]\s|[,;：，；]/u)[0]?.trim() || clean(value, 72);
  return firstClause.length <= 48 ? firstClause : firstClause.slice(0, 49).replace(/\s+\S*$/u, "").trim();
};

const run = (args) => new Promise((resolve) => {
  const child = spawn(remotionBin, args, {
    cwd: rendererDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => resolve({ code, output }));
});

const captureSlug = clean(argValue("capture-slug", defaultCaptureSlug), 160);
const captureDir = path.join(root, "public", "assets", "web-evidence-captures", captureSlug);
const manifestPath = path.join(captureDir, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (manifest.contract !== "A1LiveArticleMediaCapture/v1" || manifest.mainVisualMode !== "article-image") {
  throw new Error(`Capture manifest is not article-media ready: ${manifestPath}`);
}

const localImagePath = manifest.localPath || path.join(captureDir, "article-image.jpg");
const imageBuffer = await fs.readFile(localImagePath);
const contentType = manifest.selectedMedia?.contentType || "image/jpeg";
const imageUrl = `data:${contentType};base64,${imageBuffer.toString("base64")}`;
const title = compactTitle(manifest.selectedMedia?.caption || manifest.pageTitle || "Article evidence");
const subtitle = clean(
  manifest.selectedMedia?.caption && manifest.selectedMedia.caption !== title
    ? manifest.selectedMedia.caption
    : manifest.description,
  128,
);
const sourceHost = new URL(manifest.sourceUrl).hostname.replace(/^www\./u, "");
const canonicalHost = manifest.canonicalUrl ? new URL(manifest.canonicalUrl).hostname.replace(/^www\./u, "") : "";
const source = clean([sourceHost, canonicalHost && canonicalHost !== sourceHost ? canonicalHost : ""].filter(Boolean).join(" / "), 72);

const variants = [
  {
    slug: "image-zoom-reveal",
    compositionId: "RVEImageZoomReveal",
    label: "Image Zoom Reveal",
    use: "主图证据 / 新闻主视觉 / 强开场",
  },
  {
    slug: "lower-third",
    compositionId: "RVELowerThird",
    label: "Lower Third Evidence",
    use: "保留图片全屏，同时强调一句配文",
  },
  {
    slug: "split-screen",
    compositionId: "RVESplitScreen",
    label: "Split Screen",
    use: "左文右图，适合解释型句子",
  },
  {
    slug: "polaroid-frame",
    compositionId: "RVEPolaroidFrame",
    label: "Polaroid Frame",
    use: "人物、现场、引用图、故事感",
  },
  {
    slug: "photo-stack",
    compositionId: "RVEPhotoStack",
    label: "Photo Stack",
    use: "多证据感 / 资料堆叠 / 回顾段落",
  },
];

const outputDir = path.join(root, "public", "generated", "rve-article-template-variants");
await fs.mkdir(outputDir, { recursive: true });

const results = [];
for (const variant of variants) {
  const outputRel = `../public/generated/rve-article-template-variants/${variant.slug}.mp4`;
  const outputPath = path.join(outputDir, `${variant.slug}.mp4`);
  const posterRel = `generated/rve-article-template-variants/${variant.slug}-poster.png`;
  const posterOutputRel = `../public/${posterRel}`;
  const posterPath = path.join(root, "public", posterRel);
  const props = {
    imageUrl,
    title,
    subtitle,
    source,
    duration: 5.2,
    scale: 1.12,
    translateX: 0,
    translateY: 0,
  };
  const result = await run([
    "render",
    "src/index.ts",
    variant.compositionId,
    outputRel,
    "--props",
    JSON.stringify(props),
    "--overwrite",
    "--codec=h264",
    "--log=warn",
  ]);
  if (result.code !== 0) {
    results.push({
      ...variant,
      ok: false,
      error: result.output.slice(-1800),
    });
    continue;
  }
  const posterResult = await run([
    "still",
    "src/index.ts",
    variant.compositionId,
    posterOutputRel,
    "--frame=58",
    "--props",
    JSON.stringify(props),
    "--overwrite",
    "--log=warn",
  ]);
  if (posterResult.code !== 0) {
    results.push({
      ...variant,
      ok: false,
      error: posterResult.output.slice(-1800),
    });
    continue;
  }
  const stat = await fs.stat(outputPath);
  const posterStat = await fs.stat(posterPath);
  results.push({
    ...variant,
    ok: true,
    mp4: `generated/rve-article-template-variants/${variant.slug}.mp4`,
    poster: posterRel,
    outputPath,
    posterPath,
    bytes: stat.size,
    posterBytes: posterStat.size,
  });
}

const okResults = results.filter((result) => result.ok);
const report = {
  contract: "A1RveArticleTemplateVariantRender/v1",
  generatedAt: new Date().toISOString(),
  captureManifest: manifestPath,
  articleImage: manifest.cachedImageUrl,
  title,
  subtitle,
  source,
  variants: results,
};
const reportPath = path.join(root, "public", "template-confirmations", "rve-article-template-variants.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const previewPath = path.join(root, "public", "rve-article-template-variants.html");
const cards = okResults.map((variant) => `
  <article class="card">
    <video src="${variant.mp4}" poster="${variant.poster}" autoplay muted loop playsinline controls></video>
    <div class="meta">
      <div>
        <h2>${escapeHtml(variant.label)}</h2>
        <p>${escapeHtml(variant.use)}</p>
      </div>
      <code>${escapeHtml(variant.compositionId)}</code>
    </div>
  </article>
`).join("\n");
const failures = results.filter((result) => !result.ok).map((variant) => `<li>${escapeHtml(variant.label)}: ${escapeHtml(variant.error || "render failed")}</li>`).join("");
const previewHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 RVE Article Template Variants</title>
  <style>
    :root { color-scheme: dark; --bg: #050605; --panel: #0f130c; --line: rgba(231,255,205,.18); --ink: #f6f5e8; --muted: rgba(246,245,232,.62); --accent: #d7ff2f; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif; }
    header { padding: 38px 44px 22px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: minmax(420px, 1fr) 440px; gap: 38px; align-items: end; }
    h1 { margin: 0; font-size: 72px; line-height: .88; letter-spacing: 0; max-width: 920px; }
    header p { margin: 0; color: var(--muted); font-size: 22px; line-height: 1.35; font-weight: 760; }
    .asset { margin-top: 16px; color: var(--accent); font: 900 13px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(420px, 1fr)); gap: 24px; padding: 30px 44px 44px; }
    .card { border: 1px solid var(--line); background: var(--panel); }
    video { width: 100%; aspect-ratio: 16 / 9; display: block; background: #000; }
    .meta { border-top: 1px solid var(--line); padding: 16px 16px 18px; display: flex; justify-content: space-between; gap: 18px; align-items: start; }
    h2 { margin: 0; font-size: 24px; line-height: 1; }
    .meta p { margin: 8px 0 0; color: var(--muted); font-size: 15px; line-height: 1.35; font-weight: 780; }
    code { color: var(--accent); font: 900 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; }
    .failures { margin: 0 44px 44px; color: #ffb4a8; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Article Template Variants</h1>
      <div class="asset">${escapeHtml(title)}<br>${escapeHtml(source)}</div>
    </div>
    <p>同一篇文章配图进入多个 RVE 官方模板 adapter。这里看的是模板候选，不是自制占位舞台。</p>
  </header>
  <main class="grid">${cards}</main>
  ${failures ? `<ul class="failures">${failures}</ul>` : ""}
</body>
</html>`;
await fs.writeFile(previewPath, previewHtml);

if (results.some((result) => !result.ok)) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ...report,
  reportPath,
  previewPath,
}, null, 2));
