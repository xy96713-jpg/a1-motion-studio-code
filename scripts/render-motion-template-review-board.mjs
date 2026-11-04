import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildMotionTemplateRuntime } from "../lib/storyboard-motion-template-runtime.js";
import { buildMotionTemplateAssetBindingPlan } from "../lib/storyboard-motion-template-asset-bindings.js";
import {assertEditorialShotDirector, compileEditorialShotDirector} from "../apps/studio-next/src/lib/a1-editorial-shot-director-v1.mjs";
import {assertCreativeCoreRoutePlan, compileCreativeCoreRoutePlan} from "../apps/studio-next/src/lib/a1-creative-core-route-plan-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "motion-template-review-board", stamp);
const currentDir = path.join(root, ".codex-artifacts", "motion-template-review-board", "current");
const creativeCoreDir = path.join(root, ".codex-artifacts", "system-progress-system-line", "creative-core-convergence-v1");
await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(currentDir, { recursive: true });
await fs.mkdir(creativeCoreDir, { recursive: true });

const sampleScenes = [
  { id: "lead", headline: "开场先定调", body: "文章开头要像真正短片片头。", sourceStoryRole: "opening", shotTemplateId: "MagazineLead", duration: 3.2 },
  { id: "quote", headline: "观点必须被看见", body: "核心判断需要有金句级表达。", sourceStoryRole: "quote", shotTemplateId: "KineticClaim", duration: 4.2 },
  { id: "concept", headline: "抽象概念先做海报", body: "机制和关系先变成主视觉。", sourceStoryRole: "concept", shotTemplateId: "ConceptPoster", professionalStyleframeSourceLane: "ai-generated-bitmap", duration: 5.2 },
  { id: "flow", headline: "流程按步骤展开", body: "语义理解、模板选择、参数生成。", sourceStoryRole: "method", duration: 5.6 },
  { id: "contrast", headline: "不是自造而是接入", body: "左边随机，右边受控模板。", sourceStoryRole: "contrast", shotTemplateId: "ComparisonSplit", duration: 4.8 },
  { id: "data", headline: "数字驱动节奏", body: "数据和时间线需要结构化动画。", sourceStoryRole: "data", shotTemplateId: "DataTimeline", duration: 5.2 },
  { id: "browser", headline: "真实页面就是证据", body: "网页、产品、案例截图先占满画面。", sourceStoryRole: "evidence", shotTemplateId: "EvidenceImage", professionalStyleframeSourceLane: "real-web-evidence", duration: 4.6 },
  { id: "warning", headline: "乱生成会失控", body: "风险和警告要受控，而不是噪声。", sourceStoryRole: "warning", duration: 3.4 },
];

const runtime = buildMotionTemplateRuntime({ scenes: sampleScenes, width: 1920, height: 1080 });
const bindingPlan = buildMotionTemplateAssetBindingPlan({ runtime });
const blindFixtureConfig = JSON.parse(await fs.readFile(path.join(root, "configs", "creative-core-blind-fixtures-v1.json"), "utf8"));
const creativeCorePlans = blindFixtureConfig.fixtures.map((fixture) => {
  const director = assertEditorialShotDirector(compileEditorialShotDirector(fixture.workspace, {programMode: fixture.mode, generatedAt: "2026-08-20T07:00:00.000Z"}));
  const plan = assertCreativeCoreRoutePlan(compileCreativeCoreRoutePlan(director, {generatedAt: "2026-08-20T07:01:00.000Z"}));
  return {fixture, plan};
});

const publicFileUrl = (publicPath = "") => {
  if (!publicPath) return "";
  const cleaned = publicPath.replace(/^\/+/, "");
  return pathToFileURL(path.join(root, "public", cleaned)).href;
};

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[character]);

const cards = bindingPlan.bindings.map((binding = {}, index) => {
  const plan = runtime.plans.find((item = {}) => item.recommendedMotion === binding.templateId) || runtime.plans[index] || {};
  return {
    ...binding,
    index,
    sampleTitle: plan.params?.title || binding.templateName,
    sampleSubtitle: plan.params?.subtitle || "",
    previewUrl: publicFileUrl(binding.previewAsset),
    previewKind: /\.json$/u.test(binding.previewAsset || "") ? "lottie" : "image",
    candidateIds: (plan.route?.candidates || []).map((candidate = {}) => candidate.templateId),
  };
});

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Motion Template Review Board</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050505;
      --ink: #f7f3e7;
      --muted: rgba(247,243,231,.68);
      --faint: rgba(247,243,231,.44);
      --line: rgba(247,243,231,.13);
      --panel: rgba(18,18,15,.92);
      --panel2: rgba(29,30,24,.82);
      --accent: #dbff4d;
      --cyan: #8ed8ff;
      --rose: #ff7d9d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
    }
    main { width: 1900px; min-height: 1200px; padding: 42px; margin: 0 auto; background: linear-gradient(180deg, rgba(255,255,255,.045), transparent 420px), #050505; }
    header {
      display: grid;
      grid-template-columns: 1fr 620px;
      gap: 42px;
      align-items: end;
      padding-bottom: 28px;
      border-bottom: 1px solid var(--line);
    }
    h1 { margin: 0; max-width: 1050px; font-size: 76px; line-height: .92; letter-spacing: 0; }
    header p { margin: 0; color: var(--muted); font-size: 20px; line-height: 1.45; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      padding-top: 22px;
    }
    article {
      min-height: 475px;
      border: 1px solid var(--line);
      background: var(--panel);
      overflow: hidden;
      display: grid;
      grid-template-rows: 202px 1fr;
      animation: cardIn .8s cubic-bezier(.16,1,.3,1) both;
      animation-delay: calc(var(--i) * 70ms);
    }
    .preview {
      position: relative;
      overflow: hidden;
      background: #0d0d0b;
      border-bottom: 1px solid var(--line);
    }
    .preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transform: scale(1.04);
      animation: slowPush 7s ease-in-out infinite alternate;
    }
    .lottie-preview {
      position: relative;
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      background: radial-gradient(circle at 50% 45%, rgba(142,216,255,.18), transparent 220px), #10110e;
    }
    .lottie-preview svg {
      width: 76% !important;
      height: 76% !important;
      opacity: .86;
      filter: drop-shadow(0 14px 40px rgba(142,216,255,.2));
    }
    .lottie-preview span {
      position: absolute;
      left: 16px;
      bottom: 14px;
      z-index: 2;
      max-width: calc(100% - 32px);
      color: rgba(247,243,231,.76);
      font: 900 12px/1.25 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
      overflow-wrap: anywhere;
    }
    .preview::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(180deg, transparent 45%, rgba(0,0,0,.54));
    }
    .body { padding: 16px; display: grid; gap: 12px; align-content: start; }
    .kicker {
      color: var(--accent);
      font: 900 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
      overflow-wrap: anywhere;
    }
    h2 { margin: 0; font-size: 26px; line-height: 1.02; letter-spacing: 0; }
    .sample { color: var(--muted); font-size: 14px; line-height: 1.35; min-height: 38px; }
    .meta { display: grid; grid-template-columns: 116px 1fr; gap: 6px 10px; font-size: 12px; line-height: 1.25; }
    .meta span:nth-child(odd) { color: var(--faint); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .meta span:nth-child(even) { color: rgba(247,243,231,.82); overflow-wrap: anywhere; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chips span { border: 1px solid rgba(219,255,77,.25); color: rgba(219,255,77,.9); padding: 4px 7px; font: 800 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .warn { color: var(--rose); }
    .route-matrix { margin-top: 28px; border-top: 1px solid var(--line); padding-top: 24px; }
    .route-matrix h2 { font-size: 40px; margin-bottom: 8px; }
    .route-matrix > p { color: var(--muted); margin: 0 0 18px; }
    .genre-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .genre { border: 1px solid var(--line); background: var(--panel2); padding: 18px; }
    .genre h3 { margin: 0 0 4px; font-size: 24px; }
    .genre .sha { color: var(--faint); font: 10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .route-row { display: grid; grid-template-columns: 52px 1fr; gap: 10px; padding: 12px 0; border-top: 1px solid var(--line); }
    .route-row:first-of-type { margin-top: 14px; }
    .route-row .shot { color: var(--accent); font: 900 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .route-row strong { display: block; font-size: 15px; line-height: 1.25; }
    .route-row span { display: block; margin-top: 5px; color: var(--muted); font: 10px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    footer { margin-top: 18px; color: var(--faint); font-size: 13px; line-height: 1.4; }
    @keyframes cardIn { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slowPush { from { transform: scale(1.02) translate3d(-1%, 0, 0); } to { transform: scale(1.12) translate3d(1.5%, -1%, 0); } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <div class="kicker">A1 Motion Template Review Board / Source-Bound</div>
        <h1>8 个模板不再空喊专业，必须绑定成熟来源</h1>
      </div>
      <p>这不是最终样片，而是模板资产审查板。每个 MotionTemplate 都必须指向真实图片/网页截图、AI bitmap、Lottie/Remotion/GSAP/Motion Canvas 等成熟来源蓝图；弱 SVG 线条不能再作为万能主视觉。</p>
    </header>
    <section class="grid">
      ${cards.map((card) => `
        <article style="--i:${card.index}" data-template-id="${escapeHtml(card.templateId)}" data-binding-contract="${escapeHtml(card.contract)}">
          <div class="preview">
            ${card.previewKind === "lottie"
              ? `<div class="lottie-preview" data-lottie-path="${escapeHtml(card.previewUrl)}"><span>AUTHORIZED LOTTIE ASSET · ${escapeHtml(path.basename(card.previewAsset || ""))}</span></div>`
              : `<img src="${escapeHtml(card.previewUrl)}" alt="${escapeHtml(card.templateName)} preview asset" />`}
          </div>
          <div class="body">
            <div class="kicker">${escapeHtml(card.templateId)}</div>
            <h2>${escapeHtml(card.templateName)}</h2>
            <div class="sample">${escapeHtml(card.sampleTitle)}${card.sampleSubtitle ? ` / ${escapeHtml(card.sampleSubtitle)}` : ""}</div>
            <div class="meta">
              <span>visualTask</span><span>${escapeHtml(card.visualTask)}</span>
              <span>surface</span><span>${escapeHtml(card.primarySurface)}</span>
              <span>strategy</span><span>${escapeHtml(card.sourceStrategy)}</span>
              <span>adapter</span><span>${escapeHtml(card.requiredAdapter)}</span>
              <span>blueprints</span><span>${escapeHtml((card.blueprints || []).map((blueprint) => blueprint.id).join(", "))}</span>
              <span>status</span><span class="warn">${escapeHtml(card.adapterStatus)}</span>
            </div>
            <div class="chips">${(card.professionalSourceLanes || []).map((lane) => `<span>${escapeHtml(lane)}</span>`).join("")}</div>
          </div>
        </article>
      `).join("")}
    </section>
    <section class="route-matrix" data-a1-creative-core-route-matrix="A1CreativeCoreRoutePlan/v1">
      <div class="kicker">CURRENT DIRECTOR → EXECUTION OWNER → STRICT PROPS</div>
      <h2>三体裁创作主干盲测</h2>
      <p>人物基底、真实录屏和模板动画各归唯一 owner；这里只证明路由与参数，不执行当前影片 motion render。</p>
      <div class="genre-grid">
        ${creativeCorePlans.map(({fixture, plan}) => `
          <div class="genre" data-fixture-id="${escapeHtml(fixture.id)}" data-plan-sha="${escapeHtml(plan.planSha256)}">
            <h3>${escapeHtml(fixture.genre)}</h3>
            <div class="sha">${escapeHtml(plan.programMode)} · ${escapeHtml(plan.planSha256)}</div>
            ${plan.items.map((item) => `
              <div class="route-row">
                <div class="shot">${escapeHtml(item.shotId)}</div>
                <div>
                  <strong>${escapeHtml(item.exactCopy)}</strong>
                  <span>${escapeHtml(item.route)} → ${escapeHtml(item.executionOwner)}${item.templateId ? ` → ${escapeHtml(item.templateId)}` : ""}</span>
                </div>
              </div>
            `).join("")}
          </div>
        `).join("")}
      </div>
    </section>
    <footer>Rule: AI outputs MotionPlan JSON only. Templates own animation. External source code/assets need adapter, license/source review, and screenshot promotion gate before becoming production visuals.</footer>
  </main>
</body>
</html>`;

const htmlPath = path.join(artifactDir, "motion-template-review-board.html");
const currentHtmlPath = path.join(currentDir, "motion-template-review-board.html");
const creativeCoreHtmlPath = path.join(creativeCoreDir, "creative-core-route-matrix.html");
const reportPath = path.join(artifactDir, "report.json");
await fs.writeFile(htmlPath, html);
await fs.copyFile(htmlPath, currentHtmlPath);
await fs.copyFile(htmlPath, creativeCoreHtmlPath);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: 1 });
try {
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.waitForTimeout(1600);
  const screenshotPath = path.join(artifactDir, "motion-template-review-board.png");
  const currentScreenshotPath = path.join(currentDir, "motion-template-review-board.png");
  const creativeCoreScreenshotPath = path.join(creativeCoreDir, "creative-core-route-matrix.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await fs.copyFile(screenshotPath, currentScreenshotPath);
  await fs.copyFile(screenshotPath, creativeCoreScreenshotPath);
  const report = {
    contract: "A1MotionTemplateReviewBoard/v1",
    status: "PASS",
    htmlPath,
    currentHtmlPath,
    screenshotPath,
    currentScreenshotPath,
    cards: cards.map((card) => ({
      templateId: card.templateId,
      visualTask: card.visualTask,
      sourceStrategy: card.sourceStrategy,
      primarySurface: card.primarySurface,
      lanes: card.professionalSourceLanes,
      blueprints: (card.blueprints || []).map((blueprint) => `${blueprint.id}@${blueprint.sourceId}`),
      previewAsset: card.previewAsset,
    })),
    creativeCore: {
      contract: "A1CreativeCoreRouteMatrix/v1",
      status: "PASS",
      fixtureCount: creativeCorePlans.length,
      htmlPath: creativeCoreHtmlPath,
      screenshotPath: creativeCoreScreenshotPath,
      workspaceMutationPerformed: false,
      currentPhaseMutationPerformed: false,
      motionRenderPerformed: false,
      fixtures: creativeCorePlans.map(({fixture, plan}) => ({
        id: fixture.id,
        genre: fixture.genre,
        programMode: plan.programMode,
        planSha256: plan.planSha256,
        itemCount: plan.itemCount,
        executionOwnerCounts: plan.executionOwnerCounts,
      })),
    },
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(creativeCoreDir, "result.json"), `${JSON.stringify(report.creativeCore, null, 2)}\n`);
  console.log("Motion template review board rendered.");
  console.log(`HTML: ${htmlPath}`);
  console.log(`Current HTML: ${currentHtmlPath}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
