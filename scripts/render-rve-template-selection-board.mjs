import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "public", "template-confirmations", "rve-official-effect-preview.json");
const outputPath = path.join(root, "public", "rve-template-selection-board.html");
const selectionSeedPath = path.join(root, "public", "template-confirmations", "rve-template-selection-seed.json");

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const templates = registry.templates.map((template) => ({
  slug: template.slug,
  title: template.title,
  category: template.category,
  description: template.description,
  compositionId: template.compositionId,
  sourcePath: template.sourcePath,
  originalDemo: template.originalDemo,
  mp4: template.mp4,
  a1CategoryIds: template.adapter?.a1CategoryIds || [],
  requiredSlots: template.adapter?.requiredSlots || [],
  bestFor: template.adapter?.bestFor || [],
  adapterStatus: template.adapter ? "candidate" : "missing-adapter",
}));

const data = JSON.stringify(templates).replace(/</gu, "\\u003c");
const categories = ["All", ...new Set(templates.map((template) => template.category))];
const categoryData = JSON.stringify(categories).replace(/</gu, "\\u003c");
const seed = {
  contract: "A1RveTemplateSelectionSeed/v1",
  generatedAt: new Date().toISOString(),
  storageKey: "a1:rve-template-selection:v1",
  templateCount: templates.length,
  instruction: "Use the browser selection board. Click X to reject templates. Export JSON after review.",
  templates: templates.map((template) => ({
    slug: template.slug,
    title: template.title,
    category: template.category,
    compositionId: template.compositionId,
    decision: "unreviewed",
  })),
};
await fs.writeFile(selectionSeedPath, `${JSON.stringify(seed, null, 2)}\n`);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 RVE Template Selection Board</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050605;
      --panel: #10140d;
      --panel2: #171d12;
      --ink: #f6f5e8;
      --muted: rgba(246,245,232,.62);
      --line: rgba(231,255,205,.18);
      --accent: #d7ff2f;
      --danger: #ff4d4d;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif; }
    header {
      position: sticky;
      top: 0;
      z-index: 10;
      border-bottom: 1px solid var(--line);
      background: rgba(5,6,5,.92);
      backdrop-filter: blur(18px);
      padding: 24px 32px 18px;
    }
    .top { display: grid; grid-template-columns: minmax(520px, 1fr) auto; gap: 28px; align-items: end; }
    h1 { margin: 0; font-size: clamp(42px, 5vw, 76px); line-height: .9; letter-spacing: 0; }
    .hint { margin: 12px 0 0; max-width: 860px; color: var(--muted); font-size: 18px; line-height: 1.38; font-weight: 760; }
    .stats { display: flex; gap: 10px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
    .pill { border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 999px; padding: 9px 12px; font: 900 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .pill strong { color: var(--accent); }
    .filters { display: flex; gap: 8px; overflow-x: auto; padding-top: 18px; }
    button { font-family: inherit; cursor: pointer; }
    .filter {
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: #080a07;
      color: rgba(246,245,232,.74);
      padding: 0 14px;
      font-weight: 900;
      white-space: nowrap;
    }
    .filter.active { color: #0b0d08; background: var(--accent); border-color: var(--accent); }
    .toolbar { display: flex; gap: 8px; padding-top: 14px; flex-wrap: wrap; }
    .tool {
      min-height: 36px;
      border: 1px solid rgba(215,255,47,.34);
      background: rgba(215,255,47,.08);
      color: var(--accent);
      border-radius: 6px;
      padding: 0 12px;
      font-weight: 900;
    }
    main { padding: 28px 32px 42px; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
    article {
      position: relative;
      border: 1px solid var(--line);
      background: var(--panel);
      min-height: 386px;
      display: grid;
      grid-template-rows: auto 1fr;
      overflow: hidden;
    }
    article.rejected { opacity: .42; filter: grayscale(.9); }
    article.rejected::after {
      content: "不用";
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: rgba(255,77,77,.92);
      font-size: 96px;
      font-weight: 950;
      background: rgba(0,0,0,.36);
      pointer-events: none;
    }
    .videoWrap { position: relative; aspect-ratio: 16 / 9; background: #000; border-bottom: 1px solid var(--line); }
    video { width: 100%; height: 100%; display: block; object-fit: cover; background: #000; }
    .x {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 3;
      width: 48px;
      height: 48px;
      border: 2px solid rgba(255,77,77,.8);
      background: rgba(0,0,0,.78);
      color: #fff;
      border-radius: 999px;
      font-size: 30px;
      line-height: 1;
      font-weight: 950;
    }
    .x:hover { background: var(--danger); color: #fff; }
    .body { padding: 16px 18px 18px; display: grid; gap: 9px; background: var(--panel2); }
    h2 { margin: 0; font-size: 24px; line-height: 1.02; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.38; font-weight: 720; }
    .meta { color: var(--accent); font: 900 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chips span { border: 1px solid var(--line); border-radius: 999px; color: rgba(246,245,232,.7); padding: 4px 7px; font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .drawer {
      position: fixed;
      right: 18px;
      bottom: 18px;
      width: min(620px, calc(100vw - 36px));
      max-height: 45vh;
      border: 1px solid var(--line);
      background: rgba(9,11,8,.96);
      box-shadow: 0 22px 80px rgba(0,0,0,.44);
      display: none;
      z-index: 20;
    }
    .drawer.open { display: block; }
    textarea {
      width: 100%;
      min-height: 260px;
      resize: vertical;
      border: 0;
      border-top: 1px solid var(--line);
      background: #030403;
      color: #d7ff2f;
      padding: 14px;
      font: 800 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .drawerHead { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; }
    .drawerHead h2 { font-size: 18px; }
    @media (max-width: 1100px) {
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .top { grid-template-columns: 1fr; }
      .stats { justify-content: flex-start; }
    }
    @media (max-width: 720px) {
      header, main { padding-left: 16px; padding-right: 16px; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <div class="top">
      <div>
        <h1>Template Selection Board</h1>
        <p class="hint">你来挑。点每张卡右上角的 X，X 掉的模板后续就不进文章路由。选择保存在本浏览器 LocalStorage，可导出 JSON 给路由器使用。</p>
      </div>
      <div class="stats">
        <div class="pill">总数 <strong id="totalCount">0</strong></div>
        <div class="pill">保留 <strong id="keepCount">0</strong></div>
        <div class="pill">不用 <strong id="rejectCount">0</strong></div>
      </div>
    </div>
    <div class="filters" id="filters"></div>
    <div class="toolbar">
      <button class="tool" id="showAll">显示全部</button>
      <button class="tool" id="showRejected">只看 X 掉</button>
      <button class="tool" id="exportJson">导出选择 JSON</button>
      <button class="tool" id="resetAll">清空选择</button>
    </div>
  </header>
  <main><section class="grid" id="grid"></section></main>
  <aside class="drawer" id="drawer">
    <div class="drawerHead"><h2>Selection JSON</h2><button class="tool" id="closeDrawer">关闭</button></div>
    <textarea id="jsonOut" spellcheck="false"></textarea>
  </aside>
  <script>
    const templates = ${data};
    const categories = ${categoryData};
    const storageKey = "a1:rve-template-selection:v1";
    const grid = document.getElementById("grid");
    const filters = document.getElementById("filters");
    const drawer = document.getElementById("drawer");
    const jsonOut = document.getElementById("jsonOut");
    let currentCategory = "All";
    let mode = "all";
    let selection = loadSelection();

    function loadSelection() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }
    function saveSelection() {
      localStorage.setItem(storageKey, JSON.stringify(selection));
    }
    function decision(slug) {
      return selection[slug]?.decision || "keep";
    }
    function selectionPayload() {
      const rejected = templates.filter((template) => decision(template.slug) === "reject").map((template) => template.slug);
      const keep = templates.filter((template) => decision(template.slug) !== "reject").map((template) => template.slug);
      return {
        contract: "A1RveTemplateSelection/v1",
        exportedAt: new Date().toISOString(),
        storageKey,
        total: templates.length,
        keepCount: keep.length,
        rejectCount: rejected.length,
        keep,
        rejected,
        decisions: Object.fromEntries(templates.map((template) => [template.slug, {
          decision: decision(template.slug),
          title: template.title,
          category: template.category,
          compositionId: template.compositionId,
        }])),
      };
    }
    function renderFilters() {
      filters.innerHTML = categories.map((category) => '<button class="filter ' + (category === currentCategory ? 'active' : '') + '" data-category="' + category + '">' + category + '</button>').join("");
      filters.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          currentCategory = button.dataset.category;
          render();
        });
      });
    }
    function visibleTemplates() {
      return templates.filter((template) => {
        if (currentCategory !== "All" && template.category !== currentCategory) return false;
        if (mode === "rejected" && decision(template.slug) !== "reject") return false;
        return true;
      });
    }
    function renderStats() {
      const payload = selectionPayload();
      document.getElementById("totalCount").textContent = String(payload.total);
      document.getElementById("keepCount").textContent = String(payload.keepCount);
      document.getElementById("rejectCount").textContent = String(payload.rejectCount);
    }
    function renderGrid() {
      grid.innerHTML = visibleTemplates().map((template) => {
        const rejected = decision(template.slug) === "reject";
        const slots = [...template.requiredSlots, ...template.bestFor].slice(0, 7).map((slot) => '<span>' + slot + '</span>').join("");
        return '<article class="' + (rejected ? 'rejected' : '') + '" data-slug="' + template.slug + '">'
          + '<div class="videoWrap">'
          + '<video src="' + template.mp4 + '" muted loop playsinline controls preload="metadata"></video>'
          + '<button class="x" title="X 掉不用" data-slug="' + template.slug + '">' + (rejected ? '↺' : '×') + '</button>'
          + '</div>'
          + '<div class="body">'
          + '<h2>' + template.title + '</h2>'
          + '<p>' + template.description + '</p>'
          + '<div class="meta">' + template.category + ' / ' + template.compositionId + '</div>'
          + '<div class="chips">' + slots + '</div>'
          + '</div>'
          + '</article>';
      }).join("");
      grid.querySelectorAll(".x").forEach((button) => {
        button.addEventListener("click", () => {
          const slug = button.dataset.slug;
          const rejected = decision(slug) === "reject";
          selection[slug] = {
            decision: rejected ? "keep" : "reject",
            updatedAt: new Date().toISOString(),
          };
          saveSelection();
          render();
        });
      });
    }
    function render() {
      renderFilters();
      renderStats();
      renderGrid();
    }
    document.getElementById("showAll").addEventListener("click", () => { mode = "all"; render(); });
    document.getElementById("showRejected").addEventListener("click", () => { mode = "rejected"; render(); });
    document.getElementById("exportJson").addEventListener("click", () => {
      jsonOut.value = JSON.stringify(selectionPayload(), null, 2);
      drawer.classList.add("open");
      jsonOut.focus();
      jsonOut.select();
    });
    document.getElementById("closeDrawer").addEventListener("click", () => drawer.classList.remove("open"));
    document.getElementById("resetAll").addEventListener("click", () => {
      if (!confirm("清空所有 X 掉记录？")) return;
      selection = {};
      saveSelection();
      render();
    });
    render();
  </script>
</body>
</html>`;

await fs.writeFile(outputPath, html);

console.log(JSON.stringify({
  contract: "A1RveTemplateSelectionBoard/v1",
  templateCount: templates.length,
  outputPath,
  selectionSeedPath,
  url: "http://127.0.0.1:4301/rve-template-selection-board.html",
}, null, 2));
