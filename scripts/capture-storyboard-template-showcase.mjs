import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStoryboardFrontendSession, selectStoryboardScene } from "./storyboard-frontend-actions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "storyboard-template-showcase", stamp);
await fs.mkdir(artifactDir, { recursive: true });

const sampleAsset = {
  id: "verified-city-material",
  type: "image",
  title: "Editorial city evidence image",
  sourceLabel: "Unsplash",
  sourceUrl: "https://images.unsplash.com/photo-1494526585095-c41746248156",
  url: "https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1800&q=85",
  renderAllowed: true,
  verifiedForRender: true,
  metadataOnly: false,
  x: 54,
  y: 42,
  zoom: 106,
};

const scenes = [
  {
    id: "magazine-lead",
    type: "cover",
    shotModule: "kinetic-text",
    shotTemplateId: "MagazineLead",
    headline: "一篇文章先变成一支片子",
    body: "开场模板要先建立主题、语气和观看节奏，而不是堆分镜卡片。",
    narrative: { storyRole: "opening" },
    duration: 4.8,
  },
  {
    id: "evidence-image",
    type: "image",
    shotModule: "image-evidence",
    shotTemplateId: "EvidenceImage",
    headline: "真实素材先承担视觉重量",
    body: "只要句子涉及人物、地点、产品、网页或证据，图片和来源必须先进入画面。",
    narrative: { storyRole: "evidence" },
    duration: 5.2,
    assets: [sampleAsset],
  },
  {
    id: "concept-poster",
    type: "point",
    shotModule: "editorial-image",
    shotTemplateId: "ConceptPoster",
    headline: "抽象句子需要一张主题海报",
    body: "当文章讨论信任、风险、身份或未来时，主视觉应该是主题化 bitmap/poster，而不是简单线框。",
    narrative: { storyRole: "turn" },
    visualTreatment: {
      contract: "A1ShotVisualTreatment/v1",
      primaryVisualForm: "editorial-image",
      rendererRoute: "EditorialImageShot+KineticTextShot",
      svgRole: "mask-and-annotation-only",
      evidencePolicy: "generated-graphics-allowed-no-fake-evidence",
      assetNeed: { role: "none", lookupPolicy: "none-required", generatedSubstituteAllowed: true },
    },
    duration: 5,
  },
  {
    id: "kinetic-claim",
    type: "quote",
    shotModule: "quote-claim",
    shotTemplateId: "KineticClaim",
    headline: "不是模板变多，而是选择变准",
    body: "观点句应该用大字、停顿、强调和留白完成一次判断。",
    quote: "真正的质量来自模板准入，而不是随机特效。",
    narrative: { storyRole: "quote" },
    duration: 4.6,
  },
  {
    id: "comparison-split",
    type: "point",
    shotModule: "vector-explainer",
    shotTemplateId: "ComparisonSplit",
    headline: "不是每句都画图，而是按语义选图",
    body: "左边是装饰性图形，右边是能解释句子关系的视觉结构。",
    narrative: { storyRole: "contrast" },
    duration: 5,
  },
  {
    id: "data-timeline",
    type: "data",
    shotModule: "data-map",
    shotTemplateId: "DataTimeline",
    headline: "三步生成可检查的影片",
    body: "理解全文，匹配模板，缓存素材，然后导出稳定的视频。",
    listItems: ["理解全文", "匹配模板", "缓存素材", "导出视频"],
    narrative: { storyRole: "method" },
    duration: 5,
  },
  {
    id: "resolve-end",
    type: "closing",
    shotModule: "resolve",
    shotTemplateId: "ResolveEnd",
    headline: "最后留下一个清楚判断",
    body: "结尾模板不应该再新增视觉概念，只收束全文的核心记忆点。",
    narrative: { storyRole: "closing" },
    duration: 4.2,
  },
];

const sourceText = scenes.map((scene) => `${scene.headline} ${scene.body || ""}`).join("\n");

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function relativeArtifact(targetPath) {
  return path.relative(artifactDir, targetPath).split(path.sep).join("/");
}

let session = null;
try {
  session = await createStoryboardFrontendSession({
    label: "storyboard-template-showcase",
    viewport: { width: 1440, height: 900 },
  });
  const { page, browser } = session;
  await page.evaluate(({ nextScenes, nextSourceText }) => {
    window.__A1_STORYBOARD_SET_TEST_SCENES__(nextScenes, {
      sourceText: nextSourceText,
      currentScene: 0,
    });
  }, { nextScenes: scenes, nextSourceText: sourceText });
  await page.waitForFunction(
    (count) => document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card").length === count,
    scenes.length,
    { timeout: 10000 }
  );

  const captures = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    await selectStoryboardScene(page, index);
    await page.waitForSelector("#storyboardV2Stage .storyboard-v2-film-shot.active", { timeout: 5000 });
    await page.waitForTimeout(450);
    if (scene.assets?.length) {
      await page.waitForFunction(() => {
        const img = document.querySelector("#storyboardV2Stage .storyboard-v2-film-shot.active img");
        return !img || img.complete;
      }, null, { timeout: 12000 });
    }
    const state = await page.evaluate(() => {
      const shot = document.querySelector("#storyboardV2Stage .storyboard-v2-film-shot.active");
      return {
        module: shot?.dataset.shotModule || "",
        templateId: shot?.dataset.shotTemplateId || "",
        templateFamily: shot?.dataset.shotTemplateFamily || "",
        primaryVisualForm: shot?.dataset.primaryVisualForm || "",
        text: shot?.textContent?.trim().replace(/\s+/g, " ").slice(0, 220) || "",
      };
    });
    const screenshot = path.join(artifactDir, `${String(index + 1).padStart(2, "0")}-${scene.id}.png`);
    await page.locator("#storyboardV2Stage").screenshot({ path: screenshot });
    captures.push({
      index,
      id: scene.id,
      headline: scene.headline,
      body: scene.body,
      requestedModule: scene.shotModule,
      requestedTemplateId: scene.shotTemplateId,
      screenshot,
      state,
    });
  }

  const galleryHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Storyboard Template Showcase</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070806;
      --panel: #10120f;
      --line: rgba(238, 243, 236, .14);
      --text: #f2f4eb;
      --muted: rgba(242, 244, 235, .68);
      --accent: #d7ff4d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;
    }
    main {
      width: 1600px;
      padding: 36px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.035), transparent 320px),
        var(--bg);
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 28px;
      margin-bottom: 28px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 22px;
    }
    h1 {
      margin: 0;
      max-width: 980px;
      font-size: 44px;
      line-height: .94;
      letter-spacing: 0;
    }
    header p {
      margin: 0;
      max-width: 520px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.45;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 22px;
    }
    article {
      background: var(--panel);
      border: 1px solid var(--line);
      overflow: hidden;
    }
    img {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      background: #020302;
    }
    .meta {
      min-height: 152px;
      padding: 18px 20px 20px;
      display: grid;
      gap: 10px;
    }
    .kicker {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--accent);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    h2 {
      margin: 0;
      font-size: 26px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.42;
    }
    code {
      color: rgba(242,244,235,.82);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>A1 Article Film Engine 模板样张评审板</h1>
      </div>
      <p>这不是最终质量承诺，而是把当前系统可用的主要模板全部摊开。下一步应该按这张板做保留、淘汰和重做优先级。</p>
    </header>
    <section class="grid">
      ${captures.map((capture) => `
        <article>
          <img src="${escapeHtml(pathToFileURL(capture.screenshot).href)}" alt="${escapeHtml(capture.requestedTemplateId)}" />
          <div class="meta">
            <div class="kicker">
              <span>${String(capture.index + 1).padStart(2, "0")} ${escapeHtml(capture.requestedTemplateId)}</span>
              <span>${escapeHtml(capture.state.module || capture.requestedModule)}</span>
            </div>
            <h2>${escapeHtml(capture.headline)}</h2>
            <p>${escapeHtml(capture.body || "")}</p>
            <code>rendered: ${escapeHtml(capture.state.templateId || "no-template-id")} / ${escapeHtml(capture.state.primaryVisualForm || "unknown-form")}</code>
          </div>
        </article>
      `).join("")}
    </section>
  </main>
</body>
</html>`;
  const galleryPath = path.join(artifactDir, "template-showcase.html");
  await fs.writeFile(galleryPath, galleryHtml);

  const galleryPage = await browser.newPage({ viewport: { width: 1600, height: 2200 }, deviceScaleFactor: 1 });
  await galleryPage.goto(pathToFileURL(galleryPath).href, { waitUntil: "load" });
  await galleryPage.waitForLoadState("networkidle").catch(() => {});
  const contactSheetPath = path.join(artifactDir, "template-showcase-contact-sheet.png");
  await galleryPage.locator("main").screenshot({ path: contactSheetPath });
  await galleryPage.close();

  const report = {
    contract: "A1StoryboardTemplateShowcase/v1",
    generatedAt: new Date().toISOString(),
    artifactDir,
    galleryPath,
    contactSheetPath,
    captures: captures.map((capture) => ({
      ...capture,
      screenshot: capture.screenshot,
      relativeScreenshot: relativeArtifact(capture.screenshot),
    })),
  };
  const reportPath = path.join(artifactDir, "report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log("Storyboard template showcase captured.");
  console.log(`Report: ${reportPath}`);
  console.log(`Gallery: ${galleryPath}`);
  console.log(`Contact sheet: ${contactSheetPath}`);
} finally {
  await session?.close?.();
}
