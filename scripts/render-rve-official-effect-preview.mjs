import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { rveOfficialAdapterCatalog } from "../lib/storyboard-rve-official-adapter-catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "rve-official-effect-preview", stamp);
const currentDir = path.join(root, ".codex-artifacts", "rve-official-effect-preview", "current");
await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(currentDir, { recursive: true });

const registryPath = path.join(root, "public", "template-confirmations", "rve-official-template-registry.json");
const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const templates = registry.templates.map((template) => ({
  ...template,
  adapter: rveOfficialAdapterCatalog.candidatesBySlug[template.slug] || null,
  job: template.category,
  read: template.description,
}));

const missing = [];
for (const template of templates) {
  try {
    const stat = await fs.stat(path.join(root, "public", template.mp4));
    if (!stat.isFile() || stat.size < 1000) missing.push(template.mp4);
  } catch {
    missing.push(template.mp4);
  }
}
if (missing.length) {
  throw new Error(`Missing rendered RVE preview videos:\n${missing.join("\n")}`);
}

const categories = ["All", ...registry.categories];
const useFilters = [
  { id: "all", label: "All Use" },
  { id: "image-media", label: "Image / Evidence" },
  { id: "metric-chart", label: "Charts / Data" },
  { id: "kinetic-title", label: "Text / Claim" },
  { id: "process-flow", label: "Process" },
  { id: "comparison-explainer", label: "Comparison" },
  { id: "transition-grammar", label: "Transition" },
  { id: "logo-brand", label: "Logo / Brand" },
  { id: "closing-outro", label: "Intro / Outro" },
];
const data = JSON.stringify(templates).replace(/</gu, "\\u003c");
const categoryData = JSON.stringify(categories).replace(/</gu, "\\u003c");
const useFilterData = JSON.stringify(useFilters).replace(/</gu, "\\u003c");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 RVE Official Effect Preview</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #081325;
      --bg2: #173a8a;
      --ink: #f8fbff;
      --muted: rgba(248,251,255,.68);
      --soft: rgba(248,251,255,.48);
      --line: rgba(248,251,255,.13);
      --panel: rgba(9,18,36,.88);
      --panel2: rgba(14,25,49,.98);
      --accent: #ffdf1f;
      --blue: #1e64ff;
      --link: #55a0ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px) 0 0 / 240px 240px,
        linear-gradient(180deg, rgba(255,255,255,.045) 1px, transparent 1px) 0 0 / 240px 240px,
        radial-gradient(circle at 88% 8%, rgba(43,103,255,.34), transparent 38rem),
        linear-gradient(115deg, var(--bg), var(--bg2));
      color: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
    }
    main { width: min(1500px, 100vw); margin: 0 auto; padding: 64px 34px 46px; }
    .hero {
      display: grid;
      grid-template-columns: minmax(560px, 720px) minmax(460px, 1fr);
      gap: 46px;
      align-items: center;
      min-height: 430px;
    }
    h1 {
      margin: 0;
      font-size: clamp(52px, 5.4vw, 88px);
      line-height: .98;
      letter-spacing: 0;
    }
    .eyebrow {
      margin: 0 0 26px;
      color: var(--accent);
      font: 900 15px/1 "Avenir Next", Arial, sans-serif;
      text-transform: uppercase;
    }
    .hero p { margin: 22px 0 0; color: var(--muted); font-size: 19px; line-height: 1.52; max-width: 720px; }
    .tabs {
      position: sticky;
      top: 0;
      z-index: 4;
      display: flex;
      gap: 0;
      align-items: center;
      overflow-x: auto;
      border: 1px solid rgba(248,251,255,.15);
      border-radius: 8px;
      background: rgba(12,24,48,.78);
      backdrop-filter: blur(16px);
      margin: 14px 0 40px;
      padding: 6px;
    }
    .useTabs {
      position: sticky;
      top: 58px;
      z-index: 3;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      margin: -28px 0 38px;
      padding: 0 0 6px;
    }
    .tabs button {
      min-height: 44px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: rgba(248,251,255,.78);
      padding: 0 19px;
      font: 900 16px/1 "Avenir Next", Arial, sans-serif;
      white-space: nowrap;
      cursor: pointer;
    }
    .tabs button.active { background: var(--blue); color: #fff; }
    .useTabs button {
      min-height: 34px;
      border: 1px solid rgba(248,251,255,.16);
      border-radius: 999px;
      background: rgba(9,18,36,.74);
      color: rgba(248,251,255,.72);
      padding: 0 14px;
      font: 800 12px/1 "Avenir Next", Arial, sans-serif;
      white-space: nowrap;
      cursor: pointer;
    }
    .useTabs button.active {
      border-color: rgba(255,223,31,.75);
      color: #ffdf1f;
      background: rgba(255,223,31,.08);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 32px;
    }
    article {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--panel);
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
      min-height: 430px;
      box-shadow: 0 24px 80px rgba(0,0,0,.18);
    }
    .videoWrap {
      position: relative;
      background: #111827;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border-bottom: 1px solid rgba(248,251,255,.08);
    }
    video {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #111827;
    }
    .badge {
      position: absolute;
      top: 18px;
      left: 18px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #ffe01f;
      font: 800 14px/1 "Avenir Next", Arial, sans-serif;
    }
    .badge::before {
      content: "";
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: #e4ce22;
      box-shadow: 0 0 20px rgba(228,206,34,.55);
    }
    .copy {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 0;
      background: rgba(10,13,22,.78);
      color: rgba(255,255,255,.72);
      font: 900 22px/1 "Avenir Next", Arial, sans-serif;
    }
    .body {
      position: relative;
      padding: 21px 24px 24px;
      background: var(--panel2);
      display: grid;
      gap: 10px;
    }
    .kicker {
      display: none;
    }
    h2 { margin: 0; font-size: 22px; line-height: 1.04; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); font-size: 15px; line-height: 1.45; }
    .meta {
      display: none;
    }
    .status {
      color: var(--soft);
      font: 800 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }
    .slots {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 24px;
    }
    .slots span {
      border: 1px solid rgba(248,251,255,.13);
      border-radius: 999px;
      color: rgba(248,251,255,.7);
      background: rgba(255,255,255,.04);
      padding: 5px 8px;
      font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .adapter {
      color: rgba(255,223,31,.9);
      font: 900 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
    }
    .actions a {
      border: 0;
      background: transparent;
      color: var(--link);
      text-decoration: none;
      padding: 0;
      font: 900 15px/1 "Avenir Next", Arial, sans-serif;
    }
    .empty {
      display: none;
      border: 1px solid var(--line);
      border-radius: 12px;
      min-height: 260px;
      padding: 28px;
      background: rgba(9,18,36,.72);
      color: var(--muted);
      font-size: 18px;
      line-height: 1.5;
    }
    @media (max-width: 1180px) {
      .hero, .grid { grid-template-columns: 1fr 1fr; }
      .hero { min-height: 320px; }
    }
    @media (max-width: 760px) {
      .hero, .grid { grid-template-columns: 1fr; }
      main { padding: 28px 18px; }
    }
  </style>
</head>
<body>
  <main data-rve-effect-preview-contract="A1RveOfficialEffectPreview/v1">
    <section class="hero">
      <div>
        <p class="eyebrow">REMOTION TEMPLATES</p>
        <h1>Free Remotion<br>Templates and Examples</h1>
        <p>Browse 81 locally rendered RVE source templates, preview the motion, and choose which components should become A1 article-film adapters.</p>
      </div>
    </section>
    <nav class="tabs" id="tabs" aria-label="Template categories"></nav>
    <nav class="useTabs" id="useTabs" aria-label="A1 article use filters"></nav>
    <section class="grid" id="grid"></section>
    <section class="empty" id="empty">这个分类暂无可播放模板。</section>
  </main>
  <script type="application/json" id="templateData">${data}</script>
  <script type="application/json" id="categoryData">${categoryData}</script>
  <script type="application/json" id="useFilterData">${useFilterData}</script>
  <script>
    (() => {
      const templates = JSON.parse(document.getElementById("templateData").textContent);
      const categories = JSON.parse(document.getElementById("categoryData").textContent);
      const useFilters = JSON.parse(document.getElementById("useFilterData").textContent);
      const grid = document.getElementById("grid");
      const tabs = document.getElementById("tabs");
      const useTabs = document.getElementById("useTabs");
      const empty = document.getElementById("empty");
      let active = "All";
      let activeUse = "all";
      const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
      })[char]);
      const renderTabs = () => {
        tabs.innerHTML = categories.map((category) => '<button type="button" class="' + (category === active ? "active" : "") + '" data-category="' + escapeHtml(category) + '">' + escapeHtml(category) + '</button>').join("");
        for (const button of tabs.querySelectorAll("button")) {
          button.addEventListener("click", () => {
            active = button.dataset.category;
            renderTabs();
            renderGrid();
          });
        }
      };
      const renderUseTabs = () => {
        useTabs.innerHTML = useFilters.map((item) => '<button type="button" class="' + (item.id === activeUse ? "active" : "") + '" data-use="' + escapeHtml(item.id) + '">' + escapeHtml(item.label) + '</button>').join("");
        for (const button of useTabs.querySelectorAll("button")) {
          button.addEventListener("click", () => {
            activeUse = button.dataset.use;
            renderUseTabs();
            renderGrid();
          });
        }
      };
      const renderGrid = () => {
        const visible = templates.filter((item) => {
          const categoryOk = active === "All" || item.category === active;
          const useOk = activeUse === "all" || item.adapter?.a1CategoryIds?.includes(activeUse);
          return categoryOk && useOk;
        });
        empty.style.display = visible.length ? "none" : "block";
        grid.style.display = visible.length ? "grid" : "none";
        grid.innerHTML = visible.map((item) => (
          '<article>' +
            '<div class="videoWrap">' +
              '<video src="' + escapeHtml(item.mp4) + '" autoplay muted loop playsinline controls preload="metadata"></video>' +
              '<span class="badge">New</span>' +
              '<button class="copy" type="button" aria-label="Copy template source">▣</button>' +
            '</div>' +
            '<div class="body">' +
              '<div class="kicker">' + escapeHtml(item.job) + '</div>' +
              '<h2>' + escapeHtml(item.title) + '</h2>' +
              '<p>' + escapeHtml(item.read) + '</p>' +
              '<div class="adapter">' + escapeHtml(item.adapter?.status || "adapter-candidate") + '</div>' +
              '<div class="slots">' + (item.adapter?.requiredSlots || []).map((slot) => '<span>' + escapeHtml(slot) + '</span>').join("") + '</div>' +
              '<div class="status">' + escapeHtml(item.compositionId) + ' · ' + escapeHtml(item.sourcePath) + '</div>' +
              '<div class="actions"><a href="' + escapeHtml(item.mp4) + '" target="_blank">View →</a><a href="' + escapeHtml(item.originalDemo) + '" target="_blank" rel="noreferrer">Original</a></div>' +
            '</div>' +
          '</article>'
        )).join("");
      };
      renderTabs();
      renderUseTabs();
      renderGrid();
    })();
  </script>
</body>
</html>`;

const publicHtmlPath = path.join(root, "public", "rve-official-effect-preview.html");
const manifestPath = path.join(root, "public", "template-confirmations", "rve-official-effect-preview.json");
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(publicHtmlPath, html);
await fs.writeFile(manifestPath, `${JSON.stringify({
  contract: "A1RveOfficialEffectPreviewManifest/v1",
  generatedAt: "2026-07-07",
  sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
  previewTruth: "Rendered MP4 previews from official RVE source templates. Not adapted to real article assets yet.",
  categories: registry.categories,
  rveOfficialAdapterCatalog: {
    contract: rveOfficialAdapterCatalog.contract,
    candidateCount: rveOfficialAdapterCatalog.candidateCount,
    directArticleRenderAllowed: rveOfficialAdapterCatalog.directArticleRenderAllowed,
    adapterRequiredBeforeArticleRender: rveOfficialAdapterCatalog.adapterRequiredBeforeArticleRender,
  },
  templates,
}, null, 2)}\n`);
await fs.copyFile(publicHtmlPath, path.join(artifactDir, "rve-official-effect-preview.html"));
await fs.copyFile(manifestPath, path.join(artifactDir, "rve-official-effect-preview.json"));
await fs.copyFile(publicHtmlPath, path.join(currentDir, "rve-official-effect-preview.html"));
await fs.copyFile(manifestPath, path.join(currentDir, "rve-official-effect-preview.json"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
await page.goto(`file://${publicHtmlPath}`, { waitUntil: "networkidle" });
const state = await page.evaluate(() => ({
  contract: document.querySelector("[data-rve-effect-preview-contract]")?.getAttribute("data-rve-effect-preview-contract"),
  cards: document.querySelectorAll("article").length,
  videos: [...document.querySelectorAll("video")].map((video) => ({
    src: video.getAttribute("src"),
    readyState: video.readyState,
    width: video.videoWidth,
    height: video.videoHeight,
  })),
}));
await page.screenshot({ path: path.join(artifactDir, "rve-official-effect-preview.png"), fullPage: true });
await page.screenshot({ path: path.join(currentDir, "rve-official-effect-preview.png"), fullPage: true });
await browser.close();

console.log(JSON.stringify({
  contract: "A1RveOfficialEffectPreviewArtifact/v1",
  publicHtmlPath,
  manifestPath,
  screenshotPath: path.join(artifactDir, "rve-official-effect-preview.png"),
  state,
}, null, 2));
