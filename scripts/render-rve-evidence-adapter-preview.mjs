import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildRveEvidenceAdapterForScene } from "../lib/storyboard-rve-evidence-adapter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const artifactDir = path.join(root, ".codex-artifacts", "rve-evidence-adapter-preview", stamp);
const currentDir = path.join(root, ".codex-artifacts", "rve-evidence-adapter-preview", "current");
await fs.mkdir(artifactDir, { recursive: true });
await fs.mkdir(currentDir, { recursive: true });

const scene = {
  id: "rve-evidence-fixture",
  type: "image",
  headline: "真实来源先进入模板",
  body: "文章句子提到网页、论文、产品页或证据时，只允许绑定到真实模板 slot；不允许 A1 自己画替代舞台。",
  duration: 5.2,
  assets: [{
    id: "verified:webpage:jitter-templates",
    kind: "webpage-preview",
    url: "/assets/web-assets/fixtures/jitter-templates-page.png",
    sourceUrl: "https://jitter.video/templates/",
    attribution: "https://jitter.video/templates/",
    license: "reviewed-reference-screenshot",
    renderAllowed: true,
    verifiedForRender: true,
    imageFocalPlan: {
      objectPosition: { x: 52, y: 46 },
      zoom: 116,
    },
  }],
};

const match = {
  sceneId: scene.id,
  detectedSkill: "real-media-proof",
  assetNeeds: ["webpage-preview"],
  rveOfficialAdapterCandidates: [
    {
      id: "rve-official:ken-burns",
      slug: "ken-burns",
      compositionId: "RVEKenBurns",
      sourceRepository: "https://github.com/reactvideoeditor/remotion-templates",
      sourcePath: "external/rve-remotion-templates/templates/ken-burns.tsx",
      originalDemo: "https://www.reactvideoeditor.com/remotion-templates/ken-burns",
      previewVideo: "generated/rve-official-effect-preview/ken-burns.mp4",
    },
  ],
};

const adapter = buildRveEvidenceAdapterForScene(scene, match);
const boundRenderVideo = "generated/rve-template-bound/ken-burns-fixture.mp4";
const boundRenderPath = path.join(root, "public", boundRenderVideo);
const hasBoundRender = await fs.access(boundRenderPath).then(() => true, () => false);
const previewVideo = hasBoundRender ? boundRenderVideo : adapter.previewVideo;
const previewStatus = hasBoundRender ? "template-bound-render-ready" : "source-template-preview-only";
const previewAdapter = {
  ...adapter,
  adapterStatus: previewStatus,
  boundRenderVideo: hasBoundRender ? boundRenderVideo : "",
  fallbackPreviewVideo: adapter.previewVideo,
};
const adapterJson = JSON.stringify(previewAdapter).replace(/</gu, "\\u003c");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 RVE Template Binding Preview</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #050706;
      --panel: #10150d;
      --line: rgba(236,255,218,.18);
      --ink: #f6f5e8;
      --muted: rgba(246,245,232,.62);
      --accent: #c8ff26;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--ink);
      font-family: "Avenir Next", "Helvetica Neue", Arial, "PingFang SC", sans-serif;
    }
    main {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(720px, 1fr) 430px;
      gap: 0;
    }
    .templatePreview {
      display: grid;
      align-content: center;
      padding: 32px;
    }
    .sourceFrame {
      width: min(100%, 1280px);
      margin: 0 auto;
      border: 1px solid rgba(236,255,218,.18);
      background: #020302;
    }
    video {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: #000;
    }
    .sourceMeta {
      display: flex;
      gap: 14px;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-top: 1px solid rgba(236,255,218,.16);
      color: rgba(246,245,232,.68);
      font: 800 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }
    .sourceMeta strong { color: var(--accent); }
    aside {
      border-left: 1px solid var(--line);
      background: var(--panel);
      padding: 28px 24px;
      overflow: auto;
    }
    h1 { margin: 0 0 8px; font-size: 25px; line-height: 1; }
    .note { margin: 0 0 22px; color: var(--muted); line-height: 1.45; font-weight: 750; }
    .status {
      border: 1px solid rgba(200,255,38,.32);
      background: rgba(200,255,38,.06);
      color: rgba(246,245,232,.8);
      padding: 13px 14px;
      margin-bottom: 18px;
      font: 850 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .field { margin: 0 0 14px; }
    .label {
      margin-bottom: 7px;
      color: rgba(246,245,232,.58);
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
    }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .value {
      border: 1px solid rgba(236,255,218,.18);
      background: #060904;
      color: rgba(246,245,232,.86);
      padding: 10px 11px;
      font: 800 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
      overflow-wrap: anywhere;
    }
    pre {
      margin: 18px 0 0;
      border: 1px solid rgba(236,255,218,.18);
      background: #060904;
      color: rgba(246,245,232,.78);
      padding: 13px;
      font-size: 11px;
      line-height: 1.45;
      overflow: auto;
      max-height: 360px;
    }
  </style>
</head>
<body>
  <main data-rve-evidence-adapter-contract="A1RveEvidenceTemplateBindingPreview/v1">
    <section class="templatePreview" aria-label="source template preview">
      <div class="sourceFrame">
        <video id="sourceTemplateVideo" src="${previewVideo}" autoplay muted loop playsinline controls></video>
        <div class="sourceMeta">
          <span><strong>${previewAdapter.sourceCompositionId}</strong> / ${previewAdapter.sourceSlug}</span>
          <span>${adapter.sourcePath}</span>
        </div>
      </div>
    </section>
    <aside>
      <h1>Template Binding Only</h1>
      <p class="note">这里展示的是 RVE 官方模板渲染视频和 A1 slot/props 绑定。A1 不再自绘标题层、遮罩层、来源条来冒充模板效果。</p>
      <div class="status" id="status"></div>
      <div class="field">
        <div class="label">Template Source</div>
        <div class="value">${adapter.originalDemo}</div>
      </div>
      <div class="field">
        <div class="label">Visual Slots Used By This Template</div>
        <div class="value">${adapter.editableParams.join(", ")}</div>
      </div>
      <div class="field">
        <div class="label">Metadata Kept Outside Visual Layer</div>
        <div class="value">${adapter.nonVisualMetadataParams.join(", ")}</div>
      </div>
      <pre id="contract"></pre>
    </aside>
  </main>
  <script type="application/json" id="adapterData">${adapterJson}</script>
  <script>
    (() => {
      const adapter = JSON.parse(document.getElementById("adapterData").textContent);
      document.getElementById("status").textContent = JSON.stringify({
        adapterStatus: adapter.adapterStatus,
        renderMode: adapter.renderMode,
        customVisualLayerAllowed: adapter.customVisualLayerAllowed,
        a1SubstituteVisualAllowed: adapter.a1SubstituteVisualAllowed,
      }, null, 2);
      document.getElementById("contract").textContent = JSON.stringify({
        contract: adapter.contract,
        sourceCompositionId: adapter.sourceCompositionId,
        sourceSlug: adapter.sourceSlug,
        previewVideo: adapter.boundRenderVideo || adapter.previewVideo,
        fallbackPreviewVideo: adapter.fallbackPreviewVideo,
        params: adapter.params,
        metadata: adapter.metadata,
        requiredSlots: adapter.requiredSlots,
        metadataSlots: adapter.metadataSlots,
        qualityGate: adapter.qualityGate,
      }, null, 2);
      window.__A1_RVE_EVIDENCE_ADAPTER_STATE__ = adapter;
    })();
  </script>
</body>
</html>`;

const publicHtmlPath = path.join(root, "public", "rve-evidence-adapter-preview.html");
const manifestPath = path.join(root, "public", "template-confirmations", "rve-evidence-adapter-preview.json");
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(publicHtmlPath, html);
await fs.writeFile(manifestPath, `${JSON.stringify({ contract: "A1RveEvidenceAdapterPreviewManifest/v1", generatedAt: "2026-07-07", adapter: previewAdapter }, null, 2)}\n`);
await fs.copyFile(publicHtmlPath, path.join(artifactDir, "rve-evidence-adapter-preview.html"));
await fs.copyFile(manifestPath, path.join(artifactDir, "rve-evidence-adapter-preview.json"));
await fs.copyFile(publicHtmlPath, path.join(currentDir, "rve-evidence-adapter-preview.html"));
await fs.copyFile(manifestPath, path.join(currentDir, "rve-evidence-adapter-preview.json"));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1 });
await page.goto(`file://${publicHtmlPath}`, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(artifactDir, "rve-evidence-adapter-preview.png"), fullPage: true });
await page.screenshot({ path: path.join(currentDir, "rve-evidence-adapter-preview.png"), fullPage: true });
const state = await page.evaluate(() => ({
  contract: document.querySelector("[data-rve-evidence-adapter-contract]")?.getAttribute("data-rve-evidence-adapter-contract"),
  videoSrc: document.getElementById("sourceTemplateVideo")?.getAttribute("src"),
  statusText: document.getElementById("status")?.textContent || "",
}));
await browser.close();

console.log(JSON.stringify({
  contract: "A1RveEvidenceAdapterPreviewArtifact/v1",
  publicHtmlPath,
  manifestPath,
  screenshotPath: path.join(artifactDir, "rve-evidence-adapter-preview.png"),
  state,
}, null, 2));
