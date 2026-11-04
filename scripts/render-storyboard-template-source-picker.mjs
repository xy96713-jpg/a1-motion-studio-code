import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rveRoot = path.join(root, "external", "rve-remotion-templates");
const rveTemplateRoot = path.join(rveRoot, "templates");
const rveReadmePath = path.join(rveRoot, "README.md");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "storyboard-template-source-picker", stamp);
const currentDir = path.join(root, ".codex-artifacts", "storyboard-template-source-picker", "current");
await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(currentDir, { recursive: true });

const officialCategoryOrder = [
  "All",
  "Charts & Data",
  "Text",
  "Content Animation",
  "Background",
  "Cinematic",
  "Transition",
  "Logo & Branding",
  "Intro & Outro",
  "Image & Media",
];

const articleRouteByCategory = {
  "Charts & Data": "data_metric_or_trend",
  Text: "claim_quote_keyword",
  "Content Animation": "process_list_or_ui_state",
  Background: "atmosphere_only_not_primary_sentence",
  Cinematic: "evidence_camera_or_scene_mood",
  Transition: "beat_to_beat_bridge",
  "Logo & Branding": "brand_source_or_channel_marker",
  "Intro & Outro": "opening_section_or_resolve",
  "Image & Media": "real_image_webpage_or_evidence",
};

const slotPolicyByCategory = {
  "Charts & Data": "需要把文章数字抽成 data props，不能保留假数值。",
  Text: "需要把标题、关键词、引用、字幕拆成可编辑 text slots。",
  "Content Animation": "需要把步骤、列表、状态、流程节点参数化。",
  Background: "只能作为底层气氛，不允许单独承载一句文章。",
  Cinematic: "需要绑定真实图片/截图/视频层或作为镜头运动叠加。",
  Transition: "只服务上下镜头关系，不能当作独立内容页。",
  "Logo & Branding": "只在来源、机构、品牌、片尾处使用，必须替换 logo/text。",
  "Intro & Outro": "适合开场/章节/结尾，必须接文章主题和视觉母题。",
  "Image & Media": "必须接真实图片、网页截图、AI bitmap 或用户素材。",
};

const titleToSlug = (file = "") => file.replace(/\.tsx$/u, "");

const parseRveReadme = (markdown) => {
  const rows = [];
  let category = "";
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = line.match(/^###\s+(.+?)\s+\((\d+)\)\s*$/u);
    if (heading) {
      category = heading[1];
      continue;
    }
    const row = line.match(/^\|\s*([^|`][^|]*?)\s*\|\s*`([^`]+\.tsx)`\s*\|\s*([^|]+?)\s*\|\s*$/u);
    if (!row || !category || row[1].trim() === "Template") continue;
    rows.push({
      category,
      title: row[1].trim(),
      file: row[2].trim(),
      description: row[3].trim(),
    });
  }
  return rows;
};

const sourceFacts = (source = "") => {
  const hooks = ["useCurrentFrame", "useVideoConfig", "interpolate", "spring"].filter((hook) => source.includes(hook));
  const uses = [];
  if (/<svg|<path|<circle|<polyline|<rect/u.test(source)) uses.push("svg");
  if (/clipPath|clip-path/u.test(source)) uses.push("mask/clip");
  if (/gradient|linear-gradient|radial-gradient/u.test(source)) uses.push("gradient-placeholders");
  if (/transform:/u.test(source)) uses.push("transform");
  if (/boxShadow|filter:|blur/u.test(source)) uses.push("polish-fx");
  const placeholderWords = ["Main Content", "Speaker", "Before", "After", "Logo", "Subscribe", "Item", "Feature", "Your"];
  const placeholders = placeholderWords.filter((word) => source.includes(word));
  return {
    hooks,
    uses,
    hasHardcodedPlaceholderText: placeholders.length > 0,
    placeholderText: placeholders,
    hasExternalMediaSlot: /Img|<img|src=/u.test(source),
  };
};

const sourceUrlFor = (slug) => `https://www.reactvideoeditor.com/remotion-templates/${slug}`;
const githubUrlFor = (file) => `https://github.com/reactvideoeditor/remotion-templates/blob/main/templates/${file}`;
const rawUrlFor = (file) => `https://raw.githubusercontent.com/reactvideoeditor/remotion-templates/main/templates/${file}`;

const readme = await fs.readFile(rveReadmePath, "utf8");
const parsedRows = parseRveReadme(readme);
const templateFiles = new Set((await fs.readdir(rveTemplateRoot)).filter((name) => name.endsWith(".tsx")));

const templates = await Promise.all(parsedRows.map(async (row, index) => {
  const sourcePath = path.join(rveTemplateRoot, row.file);
  const source = await fs.readFile(sourcePath, "utf8");
  const slug = titleToSlug(row.file);
  const facts = sourceFacts(source);
  return {
    id: `rve-${slug}`,
    slug,
    title: row.title,
    category: row.category,
    officialCategory: row.category,
    source: "React Video Editor Remotion Templates",
    sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
    url: sourceUrlFor(slug),
    githubUrl: githubUrlFor(row.file),
    rawUrl: rawUrlFor(row.file),
    localSourcePath: `external/rve-remotion-templates/templates/${row.file}`,
    sourcePath: `templates/${row.file}`,
    description: row.description,
    articleRoute: articleRouteByCategory[row.category] || "manual_review",
    slotPolicy: slotPolicyByCategory[row.category] || "需要人工确认可替换槽位。",
    sourceFacts: facts,
    integrationStatus: "source-indexed-not-adapted",
    adapterRequired: true,
    previewStatus: "external-demo-only",
    localRenderStatus: "not-rendered-in-a1-yet",
    visualTruth: "Official source indexed. Open original demo for live effect; do not treat A1 card as a rendered thumbnail.",
    priority: index + 1,
  };
}));

const missingInRepo = parsedRows.filter((row) => !templateFiles.has(row.file)).map((row) => row.file);
const uncatalogedFiles = [...templateFiles].filter((file) => !parsedRows.some((row) => row.file === file)).sort();

const categoryCounts = templates.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] || 0) + 1;
  return acc;
}, {});

const templateJson = JSON.stringify(templates).replace(/</gu, "\\u003c");
const categoryJson = JSON.stringify(officialCategoryOrder).replace(/</gu, "\\u003c");
const countJson = JSON.stringify(categoryCounts).replace(/</gu, "\\u003c");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 RVE Official Template Source Picker</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07101f;
      --bg2: #132b72;
      --ink: #f8fbff;
      --muted: rgba(248,251,255,.68);
      --soft: rgba(248,251,255,.48);
      --line: rgba(248,251,255,.14);
      --panel: rgba(9,17,36,.78);
      --panel2: rgba(13,26,59,.92);
      --accent: #dfff2f;
      --blue: #2468ff;
      --warn: #ffcc66;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px) 0 0 / 220px 220px,
        linear-gradient(180deg, rgba(255,255,255,.05) 1px, transparent 1px) 0 0 / 220px 220px,
        radial-gradient(circle at 88% 8%, rgba(71,118,255,.32), transparent 38rem),
        linear-gradient(120deg, var(--bg), var(--bg2));
      color: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
    }
    a { color: inherit; }
    main { width: min(1680px, 100vw); margin: 0 auto; padding: 56px 42px 32px; }
    .hero {
      display: grid;
      grid-template-columns: minmax(460px, 720px) minmax(420px, 1fr);
      gap: 44px;
      align-items: end;
      min-height: 310px;
    }
    h1 {
      margin: 0;
      font-size: clamp(54px, 7vw, 116px);
      line-height: .9;
      letter-spacing: 0;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      font-size: 20px;
      line-height: 1.5;
      max-width: 760px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 24px;
    }
    .metric {
      border: 1px solid var(--line);
      background: rgba(8,15,31,.58);
      padding: 16px;
    }
    .metric strong { display: block; font-size: 32px; line-height: 1; }
    .metric span { color: var(--soft); font: 800 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; }
    .tabs {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 40px 0 24px;
      padding: 12px;
      border: 1px solid var(--line);
      background: rgba(7,16,31,.88);
      backdrop-filter: blur(16px);
    }
    .tabs button {
      border: 1px solid rgba(248,251,255,.15);
      background: rgba(255,255,255,.055);
      color: var(--ink);
      padding: 13px 16px;
      font: 900 14px/1 "Avenir Next", Arial, sans-serif;
      cursor: pointer;
    }
    .tabs button.active {
      border-color: rgba(223,255,47,.7);
      background: var(--blue);
      color: #fff;
      box-shadow: 0 0 0 1px rgba(223,255,47,.38) inset;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 22px;
    }
    .card {
      display: grid;
      grid-template-rows: 220px 1fr auto;
      min-height: 530px;
      border: 1px solid rgba(248,251,255,.16);
      background: linear-gradient(180deg, rgba(9,17,36,.78), rgba(8,12,25,.96));
      overflow: hidden;
      cursor: pointer;
    }
    .card.selected {
      border-color: rgba(223,255,47,.84);
      box-shadow: 0 0 0 1px rgba(223,255,47,.34), 0 24px 80px rgba(0,0,0,.42);
    }
    .source-panel {
      position: relative;
      display: grid;
      align-content: end;
      padding: 18px;
      overflow: hidden;
      background:
        linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px) 0 0 / 96px 96px,
        linear-gradient(180deg, rgba(255,255,255,.05) 1px, transparent 1px) 0 0 / 96px 96px,
        linear-gradient(135deg, rgba(36,104,255,.34), rgba(7,16,31,.72));
    }
    .source-panel::after {
      content: "OFFICIAL SOURCE";
      position: absolute;
      top: 16px;
      left: 16px;
      color: rgba(248,251,255,.62);
      font: 900 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: 0;
    }
    .source-panel strong {
      position: relative;
      font-size: 38px;
      line-height: .95;
      letter-spacing: 0;
      max-width: 86%;
      text-shadow: 0 18px 38px rgba(0,0,0,.38);
    }
    .source-panel span {
      position: relative;
      margin-top: 10px;
      color: var(--accent);
      font: 950 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
    }
    .body { padding: 18px; display: grid; gap: 12px; align-content: start; }
    .kicker { color: var(--accent); font: 950 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; }
    h2 { margin: 0; font-size: 28px; line-height: 1.02; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.45; }
    .route {
      display: grid;
      gap: 8px;
      padding: 12px;
      border: 1px solid rgba(248,251,255,.11);
      background: rgba(255,255,255,.04);
      color: rgba(248,251,255,.72);
      font-size: 13px;
      line-height: 1.4;
    }
    .code {
      display: grid;
      gap: 6px;
      color: rgba(248,251,255,.52);
      font: 800 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }
    .badges { display: flex; gap: 6px; flex-wrap: wrap; }
    .badge {
      border: 1px solid rgba(248,251,255,.13);
      background: rgba(255,255,255,.045);
      padding: 6px 7px;
      color: rgba(248,251,255,.66);
      font: 850 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
    }
    .badge.warn { color: var(--warn); border-color: rgba(255,204,102,.24); }
    .actions {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 0 18px 18px;
    }
    .actions a, .actions button {
      display: grid;
      place-items: center;
      min-height: 40px;
      border: 1px solid rgba(248,251,255,.15);
      background: rgba(0,0,0,.24);
      color: var(--ink);
      text-decoration: none;
      font: 900 12px/1 "Avenir Next", Arial, sans-serif;
      cursor: pointer;
    }
    .actions button { color: var(--accent); }
    .selection {
      position: static;
      margin-top: 24px;
      border: 1px solid rgba(223,255,47,.36);
      background: rgba(5,10,20,.94);
      padding: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(420px, 560px);
      gap: 18px;
      align-items: start;
    }
    .selection h3 { margin: 0 0 8px; font-size: 22px; color: var(--accent); }
    textarea {
      width: 100%;
      min-height: 160px;
      border: 1px solid rgba(248,251,255,.14);
      background: rgba(0,0,0,.38);
      color: rgba(248,251,255,.76);
      padding: 12px;
      font: 750 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    @media (max-width: 1180px) {
      .hero, .selection { grid-template-columns: 1fr; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 760px) {
      main { padding: 28px 18px; }
      .grid { grid-template-columns: 1fr; }
      .actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  </style>
</head>
<body>
  <main data-source-picker-contract="A1SourceTemplatePicker/v2">
    <section class="hero">
      <div>
        <h1>RVE 官方模板全集成目录</h1>
        <div class="metrics">
          <div class="metric"><strong>${templates.length}</strong><span>templates indexed</span></div>
          <div class="metric"><strong>9</strong><span>official categories</span></div>
          <div class="metric"><strong>0</strong><span>fake thumbnails</span></div>
        </div>
      </div>
      <p>这里不是 A1 自己造的模板页。它从本地 clone 的 <strong>reactvideoeditor/remotion-templates</strong> 官方源码和 README 分类生成：每个模板都有原版 demo、GitHub 源码、raw source、本地文件路径和文章路由用途。未做 adapter 的模板不会伪装成已适配效果。</p>
    </section>
    <nav class="tabs" id="filters" aria-label="Template filters"></nav>
    <section class="grid" id="grid"></section>
    <section class="selection">
      <div>
        <h3 id="selectedTitle">未选择模板</h3>
        <p id="selectedSummary">先打开原版 demo 看真实效果；确认后点“选为 adapter 候选”。下一步只对选中的模板做源代码忠实适配。</p>
      </div>
      <textarea id="selectionJson" readonly></textarea>
    </section>
  </main>
  <script type="application/json" id="templateData">${templateJson}</script>
  <script type="application/json" id="categoryData">${categoryJson}</script>
  <script type="application/json" id="categoryCounts">${countJson}</script>
  <script>
    (() => {
      const templates = JSON.parse(document.getElementById("templateData").textContent);
      const categories = JSON.parse(document.getElementById("categoryData").textContent);
      const categoryCounts = JSON.parse(document.getElementById("categoryCounts").textContent);
      const grid = document.getElementById("grid");
      const filters = document.getElementById("filters");
      const selectedTitle = document.getElementById("selectedTitle");
      const selectedSummary = document.getElementById("selectedSummary");
      const selectionJson = document.getElementById("selectionJson");
      let activeCategory = "All";
      let selected = null;
      const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
      })[char]);
      const renderFilters = () => {
        filters.innerHTML = categories.map((category) => {
          const count = category === "All" ? templates.length : categoryCounts[category] || 0;
          return '<button type="button" data-category="' + escapeHtml(category) + '" class="' + (category === activeCategory ? "active" : "") + '">' + escapeHtml(category) + ' · ' + count + '</button>';
        }).join("");
        for (const button of filters.querySelectorAll("button")) {
          button.addEventListener("click", () => {
            activeCategory = button.dataset.category;
            renderFilters();
            renderGrid();
          });
        }
      };
      const selectionFor = (template) => ({
        contract: "A1TemplateSourceSelection/v2",
        selectedAt: new Date().toISOString(),
        status: "selected-for-source-faithful-adapter-build",
        templateId: template.id,
        title: template.title,
        officialCategory: template.officialCategory,
        articleRoute: template.articleRoute,
        slotPolicy: template.slotPolicy,
        sourceRepository: template.sourceRepository,
        originalDemoUrl: template.url,
        githubUrl: template.githubUrl,
        rawUrl: template.rawUrl,
        localSourcePath: template.localSourcePath,
        currentIntegrationStatus: template.integrationStatus,
        previewStatus: template.previewStatus,
        nextStep: "Copy/adapt this TSX into an A1 Pack with props, real assets, typography fitting, and render audit.",
      });
      const selectTemplate = (template) => {
        selected = selectionFor(template);
        selectedTitle.textContent = template.title;
        selectedSummary.textContent = template.slotPolicy;
        selectionJson.value = JSON.stringify(selected, null, 2);
        renderGrid();
      };
      const renderGrid = () => {
        const visible = templates.filter((item) => activeCategory === "All" || item.category === activeCategory);
        grid.innerHTML = visible.map((item) => {
          const isSelected = selected && selected.templateId === item.id;
          const hooks = item.sourceFacts.hooks.length ? item.sourceFacts.hooks.join(" / ") : "no hook detected";
          const uses = item.sourceFacts.uses.length ? item.sourceFacts.uses.join(" / ") : "basic layout";
          const placeholder = item.sourceFacts.hasHardcodedPlaceholderText ? '<span class="badge warn">placeholder text</span>' : '';
          return '<article class="card ' + (isSelected ? "selected" : "") + '" data-id="' + escapeHtml(item.id) + '">' +
            '<div class="source-panel"><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.officialCategory) + '</span></div>' +
            '<div class="body">' +
              '<div class="kicker">' + escapeHtml(item.integrationStatus) + '</div>' +
              '<h2>' + escapeHtml(item.title) + '</h2>' +
              '<p>' + escapeHtml(item.description) + '</p>' +
              '<div class="route"><strong>文章路由：</strong>' + escapeHtml(item.articleRoute) + '<br><strong>填槽规则：</strong>' + escapeHtml(item.slotPolicy) + '</div>' +
              '<div class="badges"><span class="badge">external demo only</span><span class="badge">adapter required</span>' + placeholder + '</div>' +
              '<div class="code"><span>' + escapeHtml(item.localSourcePath) + '</span><span>hooks: ' + escapeHtml(hooks) + '</span><span>uses: ' + escapeHtml(uses) + '</span></div>' +
            '</div>' +
            '<div class="actions"><a href="' + escapeHtml(item.url) + '" target="_blank" rel="noreferrer">原版 demo</a><a href="' + escapeHtml(item.githubUrl) + '" target="_blank" rel="noreferrer">GitHub</a><a href="' + escapeHtml(item.rawUrl) + '" target="_blank" rel="noreferrer">Raw</a><button type="button" data-select="' + escapeHtml(item.id) + '">选为候选</button></div>' +
          '</article>';
        }).join("");
        for (const button of grid.querySelectorAll("[data-select]")) {
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            selectTemplate(templates.find((item) => item.id === button.dataset.select));
          });
        }
        for (const card of grid.querySelectorAll(".card")) {
          card.addEventListener("click", () => {
            selectTemplate(templates.find((item) => item.id === card.dataset.id));
          });
        }
      };
      renderFilters();
      renderGrid();
      selectionJson.value = JSON.stringify({
        contract: "A1TemplateSourceSelection/v2",
        status: "none",
        instruction: "Open original demo first; choose a source template only after confirming its real effect.",
      }, null, 2);
    })();
  </script>
</body>
</html>`;

const publicHtmlPath = path.join(root, "public", "storyboard-template-source-picker.html");
const artifactHtmlPath = path.join(artifactDir, "storyboard-template-source-picker.html");
const currentHtmlPath = path.join(currentDir, "storyboard-template-source-picker.html");
const publicJsonPath = path.join(root, "public", "template-confirmations", "source-template-candidates.json");
const artifactJsonPath = path.join(artifactDir, "source-template-candidates.json");
const currentJsonPath = path.join(currentDir, "source-template-candidates.json");
await fs.mkdir(path.dirname(publicJsonPath), { recursive: true });
const manifest = {
  contract: "A1SourceTemplateCandidateList/v2",
  source: "Local clone of reactvideoeditor/remotion-templates",
  sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
  sourceDemoIndex: "https://www.reactvideoeditor.com/remotion-templates",
  checkedAt: "2026-07-07",
  selectionPolicy: "All 81 official RVE templates are source-indexed first. User confirms the original demo; A1 then builds one source-faithful adapter at a time.",
  integrationStatus: "source-indexed-not-adapted",
  previewTruth: "A1 cards are not rendered thumbnails. Original demos are linked; local render adapters are separate work.",
  officialCategoryOrder,
  categoryCounts,
  missingInRepo,
  uncatalogedFiles,
  templates,
};
await fs.writeFile(publicHtmlPath, html);
await fs.writeFile(artifactHtmlPath, html);
await fs.writeFile(currentHtmlPath, html);
await fs.writeFile(publicJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(artifactJsonPath, await fs.readFile(publicJsonPath, "utf8"));
await fs.writeFile(currentJsonPath, await fs.readFile(publicJsonPath, "utf8"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
await page.goto(`file://${publicHtmlPath}`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(artifactDir, "storyboard-template-source-picker.png"), fullPage: true });
await page.screenshot({ path: path.join(currentDir, "storyboard-template-source-picker.png"), fullPage: true });
await browser.close();

console.log(JSON.stringify({
  contract: "A1SourceTemplatePickerArtifact/v2",
  publicHtmlPath,
  publicJsonPath,
  screenshotPath: path.join(artifactDir, "storyboard-template-source-picker.png"),
  templateCount: templates.length,
  categoryCounts,
  missingInRepo,
  uncatalogedFiles,
}, null, 2));
