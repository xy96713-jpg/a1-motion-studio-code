import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "public", "template-confirmations", "rve-official-effect-preview.json");
const selectionPath = path.join(root, "public", "template-confirmations", "rve-template-selection-current.json");
const outputPath = path.join(root, "public", "template-confirmations", "rve-template-selection-classified.json");
const htmlPath = path.join(root, "public", "rve-template-selection-classified.html");

const officialRegistry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const selection = JSON.parse(await fs.readFile(selectionPath, "utf8"));
const rejected = new Set(selection.rejected || []);
const officialTemplates = officialRegistry.templates || [];

const adaptedArticleTemplates = new Set([
  "image-zoom-reveal",
  "lower-third",
  "split-screen",
  "polaroid-frame",
  "photo-stack",
  "image-carousel",
  "gallery-grid",
  "masonry-gallery",
  "stat-counter",
  "comparison-chart",
  "progress-bars",
  "quote-card",
  "title-split",
  "cross-dissolve",
  "push-transition",
  "slide-wipe",
]);

const brokenPreviewTemplates = new Set([
  "ken-burns",
  "parallax-pan",
  "zoom-pulse",
  "typewriter-subtitle",
  "animated-list",
]);

const routingGroups = [
  {
    id: "primary-evidence-media",
    label: "主证据画面 / 真实图片",
    priority: 1,
    intent: "文章里出现人物、地点、产品、网页、新闻配图、报告图、现场图时优先走这里。",
    slugs: [
      "image-zoom-reveal",
      "ken-burns",
      "parallax-pan",
      "picture-in-picture",
      "polaroid-frame",
      "photo-stack",
      "split-screen",
      "image-comparison-slider",
      "camera-shake",
      "film-burn",
      "whip-pan",
      "zoom-pulse",
    ],
  },
  {
    id: "multi-image-evidence",
    label: "多图证据 / 图集",
    priority: 2,
    intent: "一段里能找到 3 张以上相关图片时，用多图模板建立信息密度，不再做单张推拉。",
    slugs: ["image-carousel", "gallery-grid", "masonry-gallery", "rotating-carousel"],
  },
  {
    id: "data-proof",
    label: "数据证明 / 指标变化",
    priority: 3,
    intent: "句子里有数字、百分比、排名、增长、对比、时间序列时使用。",
    slugs: [
      "stat-counter",
      "comparison-chart",
      "progress-bars",
      "chart-animation",
      "line-chart",
      "area-chart",
      "donut-chart",
      "pie-chart",
      "circular-progress",
    ],
  },
  {
    id: "claim-and-caption",
    label: "观点句 / 字幕强调",
    priority: 4,
    intent: "不适合找图的判断句、核心观点、引用和过渡旁白，用克制文字模板承载。",
    slugs: [
      "lower-third",
      "quote-card",
      "chapter-title",
      "title-split",
      "cinematic-title-intro",
      "bounce-text",
      "floating-bubble-text",
      "slide-text",
      "typewriter-subtitle",
      "text-highlight",
    ],
  },
  {
    id: "process-explainer",
    label: "流程解释 / 步骤关系",
    priority: 5,
    intent: "文章解释机制、步骤、因果链、清单、系统构成时使用。",
    slugs: ["progress-steps", "animated-list", "card-flip", "notification-pop", "countdown-timer"],
  },
  {
    id: "section-transition",
    label: "段落转场 / 章节切换",
    priority: 6,
    intent: "只用于段落之间，不能当正文镜头。保留简洁转场，避免炫技抢内容。",
    slugs: [
      "cross-dissolve",
      "fade-through-black",
      "push-transition",
      "slide-wipe",
      "zoom-through",
      "clock-wipe",
      "iris-transition",
      "morph-transition",
      "blinds-transition",
    ],
  },
  {
    id: "brand-or-entity",
    label: "品牌 / 实体标识",
    priority: 7,
    intent: "公司、产品、机构、项目名出现时，可绑定真实 logo 或实体图标。",
    slugs: [
      "logo-blur-reveal",
      "logo-bounce-drop",
      "logo-fade-reveal",
      "logo-glitch-reveal",
      "logo-scale-rotate",
      "logo-spin-reveal",
      "logo-split-reveal",
      "logo-stroke-draw",
      "logo-typewriter",
    ],
  },
  {
    id: "supporting-atmosphere",
    label: "弱背景 / 低优先级氛围",
    priority: 8,
    intent: "只能当辅助底层，不允许替代真实图片、数据或解释画面。",
    slugs: ["gradient-shift", "grid-pulse", "liquid-wave", "noise-grain"],
  },
  {
    id: "ending",
    label: "结尾收束",
    priority: 9,
    intent: "用于文章最后一句或全片总结，不做订阅号召。",
    slugs: ["end-card"],
  },
];

const templateBySlug = new Map(officialTemplates.map((template) => [template.slug, template]));
const assigned = new Set();

function toTemplateRecord(slug, groupId = "unassigned") {
  const template = templateBySlug.get(slug);
  if (!template) return null;
  const adapter = template.adapter || {};
  const status = adaptedArticleTemplates.has(slug) ? "adapted-now" : "candidate-needs-adapter";
  return {
    slug,
    title: template.title,
    category: template.category,
    compositionId: template.compositionId,
    status,
    routeGroup: groupId,
    originalDemo: template.originalDemo,
    previewVideo: template.mp4 || adapter.previewVideo,
    requiredSlots: adapter.requiredSlots || [],
    bestFor: adapter.bestFor || [],
    sourcePath: template.sourcePath,
  };
}

const groups = routingGroups.map((group) => {
  const templates = group.slugs
    .filter((slug) => templateBySlug.has(slug))
    .filter((slug) => !rejected.has(slug))
    .filter((slug) => !brokenPreviewTemplates.has(slug))
    .map((slug) => {
      assigned.add(slug);
      return toTemplateRecord(slug, group.id);
    })
    .filter(Boolean);
  return { ...group, count: templates.length, templates };
});

const rejectedTemplates = [...rejected]
  .map((slug) => toTemplateRecord(slug, "rejected-by-user"))
  .filter(Boolean);

const unassignedKept = officialTemplates
  .map((template) => template.slug)
  .filter((slug) => !rejected.has(slug) && !assigned.has(slug) && !brokenPreviewTemplates.has(slug))
  .map((slug) => toTemplateRecord(slug, "kept-unassigned"))
  .filter(Boolean);

const previewNeedsRepair = officialTemplates
  .map((template) => template.slug)
  .filter((slug) => !rejected.has(slug) && brokenPreviewTemplates.has(slug))
  .map((slug) => toTemplateRecord(slug, "preview-needs-repair"))
  .filter(Boolean);

const routePolicy = {
  firstPrinciple: "Article sentence routing must choose from user-kept official templates first. Rejected templates are hard-disabled.",
  noSelfMadeFallback: "Do not promote hand-made CSS/SVG placeholder visuals as final article shots. If no kept template fits, mark the shot as needs-template instead of inventing a low-quality visual.",
  routingOrder: groups.map((group) => group.id),
  currentAdapterGap: "Only adapted-now templates can render article props immediately; candidate-needs-adapter templates require a proper adapter before entering article film output.",
};

const payload = {
  contract: "A1RveTemplateSelectionClassified/v1",
  generatedAt: new Date().toISOString(),
  sourceSelectionPath: path.relative(root, selectionPath),
  total: officialTemplates.length,
  rejectedCount: rejectedTemplates.length,
  keptCount: officialTemplates.length - rejectedTemplates.length,
  selectableCount: officialTemplates.length - rejectedTemplates.length - previewNeedsRepair.length,
  adaptedNowCount: officialTemplates.filter((template) => !rejected.has(template.slug) && adaptedArticleTemplates.has(template.slug)).length,
  previewNeedsRepairCount: previewNeedsRepair.length,
  routePolicy,
  groups,
  unassignedKept,
  previewNeedsRepair,
  rejectedTemplates,
};

await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function templateCard(template) {
  const statusClass = template.status === "adapted-now" ? "ready" : "candidate";
  return `<article class="card ${statusClass}" data-slug="${escapeHtml(template.slug)}" data-status="${escapeHtml(template.status)}">
    <div class="media">
      <video src="${escapeHtml(template.previewVideo || "")}" muted loop playsinline controls autoplay preload="auto"></video>
      <button class="x" type="button" data-slug="${escapeHtml(template.slug)}" title="X 掉不用">×</button>
    </div>
    <div class="cardBody">
      <div class="status">${template.status === "adapted-now" ? "已可接文章" : "待做 adapter"}</div>
      <h3>${escapeHtml(template.title)}</h3>
      <p>${escapeHtml(template.category)} / ${escapeHtml(template.compositionId)}</p>
      <a href="${escapeHtml(template.originalDemo || "#")}" target="_blank" rel="noreferrer">Original demo</a>
    </div>
  </article>`;
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 RVE Template Routing Summary</title>
  <style>
    :root { color-scheme: dark; --bg:#050605; --panel:#11140e; --line:rgba(231,255,205,.18); --ink:#f6f5e8; --muted:rgba(246,245,232,.62); --accent:#d7ff2f; --warn:#ffcc66; --bad:#ff5c5c; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:"Avenir Next","Helvetica Neue",Arial,"PingFang SC",sans-serif; }
    header { padding:34px 36px 24px; border-bottom:1px solid var(--line); background:#080907; position:sticky; top:0; z-index:5; }
    h1 { margin:0; font-size:clamp(44px,5.6vw,88px); line-height:.88; letter-spacing:0; }
    .lead { max-width:980px; color:var(--muted); font-size:18px; font-weight:760; line-height:1.45; }
    .stats { display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; }
    .pill { border:1px solid var(--line); background:#11140e; padding:9px 12px; border-radius:999px; font:900 13px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .pill strong { color:var(--accent); }
    main { padding:26px 36px 48px; display:grid; gap:28px; }
    section { border-top:1px solid var(--line); padding-top:24px; }
    .sectionHead { display:grid; grid-template-columns:minmax(260px,420px) 1fr; gap:24px; align-items:start; margin-bottom:18px; }
    h2 { margin:0; font-size:34px; line-height:.98; letter-spacing:0; }
    .intent { margin:0; color:var(--muted); font-size:16px; line-height:1.45; font-weight:740; }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
    .card { border:1px solid var(--line); background:var(--panel); min-width:0; }
    .card.hidden { display:none; }
    .card.ready { border-color:rgba(215,255,47,.42); }
    .card.candidate { border-color:rgba(255,204,102,.25); }
    .media { position:relative; background:#000; border-bottom:1px solid var(--line); }
    video { display:block; width:100%; aspect-ratio:16/9; object-fit:cover; background:#000; border-bottom:1px solid var(--line); }
    .x { position:absolute; top:10px; right:10px; z-index:2; width:42px; height:42px; border:2px solid rgba(255,92,92,.88); border-radius:999px; background:rgba(0,0,0,.72); color:#fff; font-size:28px; line-height:1; font-weight:950; cursor:pointer; }
    .x:hover { background:var(--bad); }
    .cardBody { padding:13px 14px 15px; display:grid; gap:7px; }
    h3 { margin:0; font-size:20px; line-height:1.05; }
    p { margin:0; color:var(--muted); font-size:13px; font-weight:760; }
    a { color:var(--accent); font-weight:900; text-decoration:none; }
    .status { color:#050605; background:var(--accent); width:max-content; border-radius:999px; padding:5px 8px; font:950 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .candidate .status { background:var(--warn); }
    .empty { display:none; color:var(--muted); border:1px dashed var(--line); padding:18px; font-weight:800; }
    section.emptySection .empty { display:block; }
    @media (max-width:1100px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .sectionHead { grid-template-columns:1fr; } }
    @media (max-width:720px) { header, main { padding-left:16px; padding-right:16px; } .grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>RVE 模板<br />文章路由归类</h1>
    <p class="lead">按你刚才 X 掉的结果重排：后续文章拆句时，只能先从“保留模板”里路由；低级自造图形不能再冒充最终镜头。绿色是现在已经能接文章参数的模板，黄色是保留但还要做正式 adapter。黑屏预览已从候选区移出，避免误选。</p>
    <div class="stats">
      <div class="pill">总模板 <strong id="totalCount">${payload.total}</strong></div>
      <div class="pill">当前可选 <strong id="keepCount">${payload.selectableCount}</strong></div>
      <div class="pill">已 X 掉 <strong id="rejectCount">${payload.rejectedCount}</strong></div>
      <div class="pill">预览待修 <strong id="repairCount">${payload.previewNeedsRepairCount}</strong></div>
      <div class="pill">已可接文章 <strong id="adaptedCount">${payload.adaptedNowCount}</strong></div>
    </div>
  </header>
  <main>
    ${groups.map((group) => `<section data-group="${escapeHtml(group.id)}">
      <div class="sectionHead">
        <h2>${escapeHtml(group.label)} <span class="groupCount" style="color:var(--accent)">(${group.count})</span></h2>
        <p class="intent">${escapeHtml(group.intent)}</p>
      </div>
      <div class="grid">${group.templates.map(templateCard).join("")}</div>
      <div class="empty">这一组已经全部 X 掉。</div>
    </section>`).join("")}
    <section data-group="kept-unassigned">
      <div class="sectionHead">
        <h2>暂不入主路由 <span class="groupCount" style="color:var(--accent)">(${unassignedKept.length})</span></h2>
        <p class="intent">这些没有被你 X 掉，但文章自动生成里不该优先使用。后面只有在有非常明确语义时再单独接。</p>
      </div>
      <div class="grid">${unassignedKept.map(templateCard).join("")}</div>
      <div class="empty">这一组已经全部 X 掉。</div>
    </section>
    <section data-group="preview-needs-repair">
      <div class="sectionHead">
        <h2>预览待修复 <span style="color:var(--warn)">(${previewNeedsRepair.length})</span></h2>
        <p class="intent">这些不是你 X 掉的模板，而是当前 mp4 预览黑屏或接近黑屏，先不参与选择。要用它们，需要先用真实图片/文字重渲染可见预览。</p>
      </div>
      <div class="intent">${previewNeedsRepair.map((template) => `<a href="${escapeHtml(template.originalDemo || "#")}" target="_blank" rel="noreferrer">${escapeHtml(template.slug)}</a>`).join(" / ")}</div>
    </section>
  </main>
  <script>
    const storageKey = "a1:rve-template-selection:v1";
    function loadSelection() {
      try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }
    function saveSelection(selection) {
      localStorage.setItem(storageKey, JSON.stringify(selection));
    }
    function isRejected(selection, slug) {
      return selection[slug]?.decision === "reject";
    }
    function syncPage() {
      const selection = loadSelection();
      let keepCount = 0;
      let adaptedCount = 0;
      document.querySelectorAll(".card").forEach((card) => {
        const rejected = isRejected(selection, card.dataset.slug);
        card.classList.toggle("hidden", rejected);
        if (!rejected) {
          keepCount += 1;
          if (card.dataset.status === "adapted-now") adaptedCount += 1;
        }
      });
      document.querySelectorAll("section").forEach((section) => {
        const visibleCards = section.querySelectorAll(".card:not(.hidden)").length;
        section.classList.toggle("emptySection", visibleCards === 0);
        const count = section.querySelector(".groupCount");
        if (count) count.textContent = "(" + visibleCards + ")";
      });
      document.getElementById("keepCount").textContent = String(keepCount);
      const repairCount = Number(document.getElementById("repairCount").textContent);
      document.getElementById("rejectCount").textContent = String(Number(document.getElementById("totalCount").textContent) - keepCount - repairCount);
      document.getElementById("adaptedCount").textContent = String(adaptedCount);
      playVisibleVideos();
    }
    function playVisibleVideos() {
      const viewportPadding = 260;
      document.querySelectorAll("video").forEach((video) => {
        const card = video.closest(".card");
        if (!card || card.classList.contains("hidden")) {
          video.pause();
          return;
        }
        const rect = video.getBoundingClientRect();
        const inView = rect.bottom > -viewportPadding && rect.top < window.innerHeight + viewportPadding;
        if (!inView) {
          video.pause();
          return;
        }
        video.muted = true;
        video.play().catch(() => {});
      });
    }
    document.querySelectorAll(".x").forEach((button) => {
      button.addEventListener("click", () => {
        const selection = loadSelection();
        selection[button.dataset.slug] = {
          decision: "reject",
          updatedAt: new Date().toISOString(),
        };
        saveSelection(selection);
        syncPage();
      });
    });
    window.addEventListener("scroll", playVisibleVideos, { passive: true });
    window.addEventListener("resize", playVisibleVideos);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) document.querySelectorAll("video").forEach((video) => video.pause());
      else playVisibleVideos();
    });
    syncPage();
  </script>
</body>
</html>`;

await fs.writeFile(htmlPath, html);

console.log(JSON.stringify({
  contract: payload.contract,
  total: payload.total,
  keptCount: payload.keptCount,
  selectableCount: payload.selectableCount,
  rejectedCount: payload.rejectedCount,
  adaptedNowCount: payload.adaptedNowCount,
  previewNeedsRepairCount: payload.previewNeedsRepairCount,
  outputPath,
  htmlPath,
  url: "http://127.0.0.1:4301/rve-template-selection-classified.html",
}, null, 2));
