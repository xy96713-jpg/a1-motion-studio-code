import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "external-template-effect-preview", stamp);
const currentDir = path.join(root, ".codex-artifacts", "external-template-effect-preview", "current");
await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(currentDir, { recursive: true });

const benchmarkSources = [
  {
    tier: "VISUAL BENCHMARK",
    name: "AE / Envato / Motion Array",
    role: "professional styleframes, pack structure, kinetic typography, explainer density",
    policy: "reference or licensed asset only",
    strength: 94,
  },
  {
    tier: "VISUAL BENCHMARK",
    name: "Jitter Templates",
    role: "modern browser-native social/editorial motion reference",
    policy: "reference first, recreate through A1 slots",
    strength: 86,
  },
  {
    tier: "VISUAL ASSET",
    name: "Lottie / dotLottie",
    role: "designer-authored vector loops, icons, micro explainers",
    policy: "runtime asset module, not article engine",
    strength: 80,
  },
  {
    tier: "VISUAL ASSET",
    name: "Rive",
    role: "stateful vector actors and reusable controlled motion",
    policy: "flatten to deterministic timeline before export",
    strength: 78,
  },
  {
    tier: "MAIN MATERIAL",
    name: "Real web assets + generated bitmaps",
    role: "photos, screenshots, diagrams, product pages, concept posters",
    policy: "cache, provenance, rights note, generated label when AI-made",
    strength: 92,
  },
  {
    tier: "EXECUTION",
    name: "HTML + SVG + GSAP + Remotion",
    role: "layer runtime, masks, text split, deterministic render/export",
    policy: "implementation layer, not taste proof by itself",
    strength: 82,
  },
];

const packs = [
  {
    id: "lead",
    title: "LeadEditorialPack",
    sentence: "文章第一句话先建立整支片子的语气",
    visual: "large editorial crop, layered type, subtle motion motif",
    tech: "AE/Jitter benchmark -> GSAP text + Remotion export",
    gate: "must feel like opening shot, not title card",
  },
  {
    id: "evidence",
    title: "EvidenceImagePack",
    sentence: "具体名词必须尽量给真实材料",
    visual: "source image fills frame, crop/focal plan, proof annotation",
    tech: "web asset cache -> HTML image plate -> Remotion",
    gate: "no fake screenshot, no placeholder image",
  },
  {
    id: "concept",
    title: "ConceptPosterPack",
    sentence: "抽象句子要生成主题化海报主视觉",
    visual: "bitmap poster, symbolic object, restrained vector mask",
    tech: "AI/generated bitmap + SVG mask + GSAP camera",
    gate: "SVG line art cannot be the main visual fallback",
  },
  {
    id: "diagram",
    title: "ExplainerDiagramPack",
    sentence: "机制和因果需要可读图解",
    visual: "clear nodes, path reveal, labeled relationship motion",
    tech: "SVG for explanation, not decoration",
    gate: "diagram must explain a sentence role",
  },
  {
    id: "data",
    title: "DataMapPack",
    sentence: "年份、数字、位置要变成结构化镜头",
    visual: "timeline, map, metric comparison, motion path",
    tech: "SVG/Canvas/WebGL only when data justifies it",
    gate: "no random chart if article has no data",
  },
  {
    id: "resolve",
    title: "ResolvePack",
    sentence: "结尾回收前面的视觉动机",
    visual: "quiet hold, motif return, one memorable final frame",
    tech: "GSAP/Remotion timing + recurring actors",
    gate: "not a big title freeze",
  },
];

const sourceJson = JSON.stringify(benchmarkSources).replace(/</g, "\\u003c");
const packJson = JSON.stringify(packs).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Visual Benchmark Strategy Preview</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050604;
      --ink: #f8f4e8;
      --muted: rgba(248,244,232,.68);
      --faint: rgba(248,244,232,.38);
      --line: rgba(248,244,232,.14);
      --panel: rgba(18,19,15,.78);
      --accent: #d9ff4a;
      --cyan: #89d7ff;
      --rose: #ff7a9e;
      --gold: #f6c85a;
      --violet: #a98cff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 22% 12%, rgba(217,255,74,.12), transparent 28rem),
        radial-gradient(circle at 88% 24%, rgba(137,215,255,.11), transparent 32rem),
        linear-gradient(180deg, rgba(255,255,255,.04), transparent 42rem),
        var(--bg);
      color: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
    }
    main { width: min(1720px, 100vw); margin: 0 auto; padding: 30px; }
    .top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 420px;
      gap: 48px;
      align-items: end;
      min-height: 250px;
      padding: 18px 0 28px;
      border-bottom: 1px solid var(--line);
    }
    h1 {
      margin: 0;
      max-width: 1080px;
      font-size: clamp(52px, 6vw, 106px);
      line-height: .9;
      letter-spacing: 0;
    }
    .top p {
      margin: 0;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.55;
    }
    .ticker {
      margin-top: 18px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .ticker span {
      border: 1px solid var(--line);
      background: rgba(255,255,255,.045);
      padding: 8px 10px;
      color: rgba(248,244,232,.76);
      font: 800 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .grid {
      display: grid;
      grid-template-columns: 440px minmax(0, 1fr);
      gap: 22px;
      padding-top: 22px;
    }
    .rail, .panel {
      border: 1px solid var(--line);
      background: var(--panel);
      backdrop-filter: blur(18px);
    }
    .rail { padding: 18px; display: grid; gap: 10px; align-content: start; }
    .rail h2, .panel h2 {
      margin: 0 0 8px;
      font-size: 14px;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .source {
      display: grid;
      gap: 8px;
      padding: 14px;
      border: 1px solid rgba(248,244,232,.1);
      background: rgba(0,0,0,.18);
    }
    .source strong { font-size: 18px; }
    .source p { margin: 0; color: var(--muted); line-height: 1.38; font-size: 13px; }
    .bar { height: 5px; background: rgba(248,244,232,.12); overflow: hidden; }
    .bar i {
      display: block;
      height: 100%;
      width: calc(var(--strength) * 1%);
      background: linear-gradient(90deg, var(--accent), var(--cyan));
      animation: load 2.6s cubic-bezier(.16,1,.3,1) both;
    }
    .stage {
      position: relative;
      aspect-ratio: 16 / 9;
      min-height: 560px;
      overflow: hidden;
      background: #050505;
      box-shadow: 0 44px 160px rgba(0,0,0,.58);
      isolation: isolate;
    }
    .stage::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(90deg, rgba(0,0,0,.66), transparent 36%, rgba(0,0,0,.28));
      z-index: 20;
    }
    .poster {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(110deg, rgba(255,122,158,.24), transparent 34%),
        radial-gradient(circle at 72% 46%, rgba(137,215,255,.28), transparent 23rem),
        linear-gradient(135deg, #0e1116, #060604 54%, #1b160e);
    }
    .poster::before {
      content: "";
      position: absolute;
      right: 8%;
      top: 12%;
      width: 34%;
      aspect-ratio: 1;
      border-radius: 42% 58% 48% 52%;
      background:
        radial-gradient(circle at 38% 34%, rgba(255,255,255,.86), transparent 8%),
        linear-gradient(135deg, rgba(217,255,74,.8), rgba(137,215,255,.36), rgba(255,122,158,.54));
      filter: contrast(1.08) saturate(1.1);
      animation: objectFloat 7s ease-in-out infinite alternate;
      box-shadow: 0 40px 120px rgba(137,215,255,.18);
    }
    .poster::after {
      content: "";
      position: absolute;
      inset: 8% 6%;
      border: 1px solid rgba(248,244,232,.16);
      clip-path: polygon(0 0, 74% 0, 74% 26%, 100% 26%, 100% 100%, 0 100%);
      opacity: .75;
      animation: maskSweep 4.8s cubic-bezier(.16,1,.3,1) infinite;
    }
    .caption {
      position: absolute;
      z-index: 24;
      left: clamp(38px, 6vw, 92px);
      bottom: clamp(42px, 7vw, 98px);
      max-width: min(760px, 62%);
      display: grid;
      gap: 14px;
    }
    .eyebrow {
      color: var(--accent);
      font: 900 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .caption strong {
      font-size: clamp(38px, 5.8vw, 88px);
      line-height: .94;
      letter-spacing: 0;
    }
    .caption p {
      margin: 0;
      color: rgba(248,244,232,.76);
      font-size: clamp(16px, 1.45vw, 24px);
      line-height: 1.42;
      max-width: 680px;
    }
    .packs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .pack {
      min-height: 168px;
      border: 1px solid var(--line);
      background: rgba(0,0,0,.22);
      padding: 14px;
      display: grid;
      gap: 10px;
      align-content: start;
      position: relative;
      overflow: hidden;
    }
    .pack::before {
      content: "";
      position: absolute;
      inset: auto 0 0;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--cyan), var(--rose));
      transform: scaleX(.22);
      transform-origin: left;
      animation: packLine 4.2s ease-in-out infinite;
    }
    .pack strong { font-size: 18px; }
    .pack p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.38; }
    .decision {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .decision article {
      min-height: 146px;
      border: 1px solid var(--line);
      background: rgba(18,19,15,.62);
      padding: 16px;
    }
    .decision h3 {
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 13px;
      text-transform: uppercase;
    }
    .decision p {
      margin: 0;
      color: var(--muted);
      line-height: 1.45;
      font-size: 14px;
    }
    @keyframes load { from { width: 0; } }
    @keyframes objectFloat {
      from { transform: translate3d(-4%, 3%, 0) rotate(-8deg) scale(.96); }
      to { transform: translate3d(5%, -5%, 0) rotate(6deg) scale(1.04); }
    }
    @keyframes maskSweep {
      0%, 18% { opacity: .16; transform: translateX(-3%); }
      46%, 78% { opacity: .78; transform: translateX(0); }
      100% { opacity: .26; transform: translateX(2%); }
    }
    @keyframes packLine {
      0%, 100% { transform: scaleX(.16); opacity: .45; }
      50% { transform: scaleX(1); opacity: 1; }
    }
    @media (max-width: 1050px) {
      main { padding: 18px; }
      .top, .grid, .packs, .decision { grid-template-columns: 1fr; }
      .stage { min-height: 420px; }
      .caption { max-width: 78%; }
    }
  </style>
</head>
<body>
  <main>
    <section class="top">
      <div>
        <h1>先定视觉基准，再写动画代码。</h1>
        <div class="ticker">
          <span>AE/Jitter = quality bar</span>
          <span>Remotion/GSAP = execution</span>
          <span>Real/Generated assets = main visual</span>
          <span>SVG = diagram/mask/path, not universal fallback</span>
        </div>
      </div>
      <p>这不是旧的模板联系表。这个预览把来源分层：专业模板生态负责审美基准，代码库负责可执行适配，真实/生成素材负责每篇文章的主题画面。后续每个模板包都必须通过文章 slot、素材 provenance、动效 proof 和 live storyboard 截图。</p>
    </section>
    <section class="grid">
      <aside class="rail">
        <h2>Current Source Tiers</h2>
        <div id="sources"></div>
      </aside>
      <section>
        <div class="stage">
          <div class="poster"></div>
          <div class="caption">
            <span class="eyebrow">A1 CONCEPT POSTER TARGET</span>
            <strong>任意文章不能靠简陋线条撑主视觉</strong>
            <p>抽象句子先生成或检索主题化 bitmap/editorial material，再用 SVG 做遮罩、路径、标注和解释层。Remotion 最后负责稳定导出。</p>
          </div>
        </div>
        <div class="packs" id="packs"></div>
        <div class="decision">
          <article>
            <h3>What Changed</h3>
            <p>GitHub/Remotion 模板降级为执行参考；专业 AE/Jitter/Lottie/Rive/AI 视觉资产成为基准层。</p>
          </article>
          <article>
            <h3>Next Build</h3>
            <p>先做少量 A1-owned template packs，每个包 3-5 个强 styleframes，再接动画和导出。</p>
          </article>
          <article>
            <h3>Reject Gate</h3>
            <p>若出现 debug 线、假媒体、泛用 SVG、文字卡片、无来源图片，不能进入主 storyboard。</p>
          </article>
        </div>
      </section>
    </section>
  </main>
  <script>
    const sources = ${sourceJson};
    const packs = ${packJson};
    document.getElementById("sources").innerHTML = sources.map((source) => (
      '<article class="source">' +
      '<span class="eyebrow">' + source.tier + '</span>' +
      '<strong>' + source.name + '</strong>' +
      '<p>' + source.role + '</p>' +
      '<p>' + source.policy + '</p>' +
      '<div class="bar" style="--strength:' + source.strength + '"><i></i></div>' +
      '</article>'
    )).join("");
    document.getElementById("packs").innerHTML = packs.map((pack) => (
      '<article class="pack" data-pack="' + pack.id + '">' +
      '<strong>' + pack.title + '</strong>' +
      '<p>' + pack.sentence + '</p>' +
      '<p>' + pack.visual + '</p>' +
      '<p><span class="eyebrow">' + pack.gate + '</span></p>' +
      '</article>'
    )).join("");
  </script>
</body>
</html>`;

const htmlPath = path.join(artifactDir, "external-template-effect-preview.html");
const currentHtmlPath = path.join(currentDir, "external-template-effect-preview.html");
await fs.writeFile(htmlPath, html);
await fs.writeFile(currentHtmlPath, html);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1180 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const pngPath = path.join(artifactDir, "external-template-effect-preview.png");
await page.locator("main").screenshot({ path: pngPath });
await browser.close();

const report = {
  contract: "A1ExternalTemplateEffectPreview/v3",
  generatedAt: new Date().toISOString(),
  mode: "visual-benchmark-strategy-preview",
  htmlPath,
  currentHtmlPath,
  pngPath,
  benchmarkSources,
  packs,
  guardrails: [
    "visual-benchmark-layer-is-separate-from-executable-adapter-layer",
    "github-remotion-snippets-are-not-quality-proof-by-themselves",
    "svg-is-diagram-mask-path-layer-not-universal-main-visual",
    "real-or-generated-main-material-required-for-concrete-or-abstract-rich-shots",
    "template-pack-promotion-requires-styleframe-animation-live-stage-proof",
  ],
};
const reportPath = path.join(artifactDir, "report.json");
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log("External template effect preview rendered.");
console.log(`HTML: ${htmlPath}`);
console.log(`Current HTML: ${currentHtmlPath}`);
console.log(`PNG: ${pngPath}`);
console.log(`Report: ${reportPath}`);
