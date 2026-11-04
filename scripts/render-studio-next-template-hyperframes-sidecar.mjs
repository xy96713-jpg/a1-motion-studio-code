import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const propsPath = path.join(root, "public", "generated", "studio-next-template-timeline", "article-template-timeline-props.json");
const outDir = path.join(root, "public", "generated", "studio-next-template-timeline", "hyperframes-sidecar");
const nextPublicOutDir = path.join(root, "apps", "studio-next", "public", "generated", "studio-next-template-timeline", "hyperframes-sidecar");
const compositionsDir = path.join(outDir, "compositions");
const indexPath = path.join(outDir, "index.html");
const manifestPath = path.join(outDir, "manifest.json");
const designPath = path.join(outDir, "DESIGN.md");

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));

const escapeHtml = (value = "") => String(value ?? "")
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

const escapeAttrJson = (value) => escapeHtml(JSON.stringify(value ?? {}));

const props = await readJson(propsPath);
const items = Array.isArray(props.items) ? props.items : [];
const motionIrV2 = props.motionIrV2 || {};
const motionSceneById = new Map((motionIrV2.scenes || []).map((scene) => [scene.sceneId, scene]));

if (props.contract !== "A1ArticleTemplateTimeline/v1" || motionIrV2.contract !== "A1MotionIR/v2" || items.length < 1) {
  console.error(JSON.stringify({
    ok: false,
    message: "active studio-next template timeline props must contain at least one item",
    contract: props.contract,
    itemCount: items.length,
    motionIrV2Contract: motionIrV2.contract || "",
    propsPath,
  }, null, 2));
  process.exit(1);
}

function summarizeMotionPlan(motionPlan = {}) {
  return {
    contract: motionPlan.contract || "",
    semanticIntent: motionPlan.semanticIntent || "",
    entrance: motionPlan.entrance || "",
    emphasis: motionPlan.emphasis || "",
    transitionOut: motionPlan.transitionOut || "",
    easing: motionPlan.easing || "",
    durationFrames: motionPlan.durationFrames || 0,
    filmBridgeRef: motionPlan.filmBridgeRef || "",
    officialEvidenceRef: motionPlan.officialEvidenceRef || "",
  };
}

let cursor = 0;
const sidecarItems = items.map((item, index) => {
  const durationSec = Number(item.durationSec || 3);
  const startSec = Number(cursor.toFixed(2));
  cursor += durationSec;
  const motionPlan = summarizeMotionPlan(item.motionPlan || item.templateProps?.motionPlan || {});
  const motionIrScene = motionSceneById.get(item.id) || null;
  return {
    id: item.id,
    sequenceIndex: index,
    startSec,
    durationSec,
    selectedSlug: item.selectedSlug,
    assetSlotKind: item.assetSlotPlan?.slotKind || "",
    screenTitle: item.templateProps?.title || item.templateProps?.topText || item.id,
    source: item.templateProps?.source || "",
    motionPlan,
    motionIrScene,
    filmBridge: item.filmBridge || item.templateProps?.filmBridge || null,
    officialEvidence: item.templateProps?.officialEvidence || null,
  };
});

const totalDurationSec = Number(cursor.toFixed(2));

const sceneCss = `
    :root { color-scheme: dark; --bg:#050605; --ink:#f6f5e8; --muted:rgba(246,245,232,.68); --line:rgba(246,245,232,.16); --accent:#d7ff2f; }
    html, body { margin:0; width:100%; height:100%; background:var(--bg); color:var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    [data-composition-id] { position:relative; width:1920px; height:1080px; overflow:hidden; background:#050605; }
    .scene-content { width:100%; height:100%; box-sizing:border-box; padding:92px 118px; display:grid; grid-template-columns:minmax(0, 1fr) 620px; align-items:center; gap:76px; position:relative; }
    .scene-meta { position:absolute; top:48px; left:60px; display:flex; gap:10px; color:var(--accent); font:800 17px/1 ui-monospace, SFMono-Regular, Menlo, monospace; text-transform:uppercase; }
    .scene-meta span { border:1px solid rgba(215,255,47,.25); background:rgba(5,6,5,.68); padding:9px 11px; }
    .copy-block { position:relative; z-index:1; max-width:880px; }
    .source { margin:0 0 24px; color:var(--accent); font-size:24px; font-weight:900; text-transform:uppercase; letter-spacing:0; }
    h1 { margin:0; color:var(--ink); font-size:92px; line-height:1.04; letter-spacing:0; font-weight:950; max-width:820px; }
    .intent { margin:30px 0 0; color:var(--muted); font-size:28px; line-height:1.35; font-weight:650; max-width:820px; }
    .template-reference { position:relative; z-index:1; border-left:1px solid var(--line); padding-left:42px; min-height:360px; display:flex; flex-direction:column; justify-content:center; gap:22px; }
    .adapter-note { color:rgba(246,245,232,.76); font-size:30px; line-height:1.25; font-weight:850; }
    .layer-list { display:flex; flex-wrap:wrap; gap:10px; }
    .layer-list span { color:rgba(246,245,232,.8); border:1px solid rgba(246,245,232,.15); padding:9px 11px; font-size:18px; font-weight:750; }
`;

function sceneContent(item) {
  const motion = item.motionPlan || {};
  const bridge = item.filmBridge || {};
  const evidence = item.officialEvidence || {};
  return `
      <div
        class="scene"
        data-shot-id="${escapeHtml(item.id)}"
        data-template-slug="${escapeHtml(item.selectedSlug)}"
        data-asset-slot-kind="${escapeHtml(item.assetSlotKind)}"
        data-motion-plan-contract="${escapeHtml(motion.contract || "")}"
        data-motion-semantic-intent="${escapeHtml(motion.semanticIntent || "")}"
        data-motion-transition-out="${escapeHtml(motion.transitionOut || "quiet hold")}"
        data-film-bridge-contract="${escapeHtml(bridge.contract || "")}"
        data-film-arc-role="${escapeHtml(bridge.arcRole || "")}"
        data-official-evidence-contract="${escapeHtml(evidence.contract || "")}"
        data-official-evidence-kind="${escapeHtml(evidence.evidenceKind || "")}"
        data-motion-plan="${escapeAttrJson(motion)}"
        data-motion-ir-v2-contract="${escapeHtml(motionIrV2.contract || "")}" 
        data-motion-ir-scene-contract="${escapeHtml(item.motionIrScene?.contract || "")}" 
        data-motion-ir-scene="${escapeAttrJson(item.motionIrScene || {})}"
        data-promoted-render="false"
        data-template-only-sidecar="metadata-reference"
      >
        <div class="scene-content">
          <div class="scene-meta">
            <span>${String(item.sequenceIndex + 1).padStart(2, "0")}</span>
            <span>${escapeHtml(item.selectedSlug)}</span>
            <span>${escapeHtml(item.assetSlotKind || "text")}</span>
          </div>
          <div class="copy-block">
            <p class="source">${escapeHtml(item.source || evidence.sourceLabel || "USGS HVO")}</p>
            <h1>${escapeHtml(item.screenTitle)}</h1>
            <p class="intent">${escapeHtml(motion.semanticIntent || bridge.argumentFunction || "")}</p>
          </div>
          <div class="template-reference">
            <div class="adapter-note">HyperFrames sidecar is metadata-only until the selected template is adapted here.</div>
            <div class="layer-list">
              <span>${escapeHtml(item.selectedSlug)}</span>
              <span>${escapeHtml(item.assetSlotKind || "text")}</span>
              <span>${escapeHtml(motion.easing || "timing")}</span>
            </div>
          </div>
        </div>
      </div>`;
}

function compositionHtml(item) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
${sceneCss}
  </style>
</head>
<body>
  <template id="${escapeHtml(item.id)}-template">
    <div data-composition-id="${escapeHtml(item.id)}" data-width="1920" data-height="1080">
${sceneContent(item)}
      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
        window.__timelines = window.__timelines || {};
        const tl = gsap.timeline({ paused: true });
        const motionIrScene = ${JSON.stringify(item.motionIrScene || null)};
        const frameRate = ${Number(props.fps || 30)};
        const actor = (id) => motionIrScene?.actors?.find((item) => item.id === id);
        const titleActor = actor("action-title");
        const spineActor = actor("spine");
        if (titleActor) {
          tl.from(".copy-block", {
            x: Number(titleActor.from?.x || -54),
            opacity: Number(titleActor.from?.opacity ?? 0),
            duration: Math.max(0.05, (titleActor.endFrame - titleActor.startFrame) / frameRate),
            ease: "power3.out",
          }, titleActor.startFrame / frameRate);
        } else {
          tl.from(".copy-block", { y: 28, opacity: 0, duration: 0.52, ease: "power2.out" }, 0.18);
        }
        if (spineActor) {
          tl.from(".template-reference", {
            x: 28,
            opacity: 0,
            duration: Math.max(0.05, (spineActor.endFrame - spineActor.startFrame) / frameRate),
            ease: "power1.inOut",
          }, spineActor.startFrame / frameRate);
        } else {
          tl.from(".template-reference", { x: 28, opacity: 0, duration: 0.52, ease: "power2.out" }, 0.28);
        }
        window.__timelines["${escapeHtml(item.id)}"] = tl;
      </script>
    </div>
  </template>
</body>
</html>`;
}

const rootClips = sidecarItems.map((item) => `
    <div
      id="clip-${escapeHtml(item.id)}"
      class="clip"
      data-composition-id="${escapeHtml(item.id)}"
      data-composition-src="compositions/${escapeHtml(item.id)}.html"
      data-start="${item.startSec}"
      data-duration="${item.durationSec}"
      data-track-index="${item.sequenceIndex}"
      data-shot-id="${escapeHtml(item.id)}"
      data-motion-plan-contract="${escapeHtml(item.motionPlan?.contract || "")}"
    ></div>`).join("\n");

const serializedItems = JSON.stringify(sidecarItems).replace(/</gu, "\\u003c");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Studio Next Template HyperFrames Sidecar</title>
  <style>
    :root { color-scheme: dark; --bg:#050605; --ink:#f6f5e8; }
    html, body { margin:0; width:100%; height:100%; background:var(--bg); color:var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #a1-studio-next-template-sidecar { position:relative; width:1920px; height:1080px; overflow:hidden; background:#050605; }
    .clip { position:absolute; inset:0; width:100%; height:100%; }
  </style>
</head>
<body>
  <main
    id="a1-studio-next-template-sidecar"
    data-composition-id="a1-studio-next-template-sidecar"
    data-start="0"
    data-duration="${totalDurationSec}"
    data-width="1920"
    data-height="1080"
    data-engine-adapter="hyperframes"
    data-contract="A1StudioNextTemplateHyperFramesSidecar/v1"
    data-motion-ir-v2-contract="${escapeHtml(motionIrV2.contract || "")}" 
    data-source-props="${escapeHtml(path.relative(root, propsPath))}"
    data-item-count="${sidecarItems.length}"
  >
${rootClips}
  </main>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    window.__A1_STUDIO_NEXT_TEMPLATE_SIDECAR__ = ${serializedItems};
    const rootTl = gsap.timeline({ paused: true });
    window.__A1_STUDIO_NEXT_TEMPLATE_SIDECAR__.forEach((item, index) => {
      const selector = "#clip-" + item.id;
      rootTl.set(selector, { opacity: 0 }, 0);
      rootTl.set(selector, { opacity: 1 }, item.startSec);
      rootTl.to(selector, { opacity: 1, duration: Math.max(0.05, item.durationSec - 0.12), ease: "none" }, item.startSec);
      if (index < window.__A1_STUDIO_NEXT_TEMPLATE_SIDECAR__.length - 1) rootTl.set(selector, { opacity: 0 }, item.startSec + item.durationSec);
    });
    window.__timelines["a1-studio-next-template-sidecar"] = rootTl;
  </script>
</body>
</html>`;

const manifest = {
  contract: "A1StudioNextTemplateHyperFramesSidecar/v1",
  generatedAt: new Date().toISOString(),
  sourceProps: path.relative(root, propsPath),
  html: path.relative(root, indexPath),
  compositionsDir: path.relative(root, compositionsDir),
  remotionComposition: "ArticleTemplateTimeline",
  motionIrV2Contract: motionIrV2.contract || "",
  hyperframesCompositionId: "a1-studio-next-template-sidecar",
  promotedRender: false,
  templateOnlySidecarPolicy: "metadata-reference-no-promoted-visuals",
  itemCount: sidecarItems.length,
  totalDurationSec,
  items: sidecarItems.map((item) => ({
    id: item.id,
    sequenceIndex: item.sequenceIndex,
    startSec: item.startSec,
    durationSec: item.durationSec,
    selectedSlug: item.selectedSlug,
    assetSlotKind: item.assetSlotKind,
    motionPlanContract: item.motionPlan?.contract || "",
    motionIrSceneContract: item.motionIrScene?.contract || "",
    actorTimingSource: item.motionIrScene?.actors?.length ? "A1MotionIR/v2" : "none",
    transitionOut: item.motionPlan?.transitionOut || "",
    semanticIntent: item.motionPlan?.semanticIntent || "",
    compositionSrc: `compositions/${item.id}.html`,
  })),
  roles: {
    remotion: "final deterministic MP4 renderer",
    hyperframes: "same-props metadata sidecar for lint, inspect, and motion timing review until selected templates are adapted here",
  },
};

const design = `# A1 Studio Next Template Sidecar Design

## Style Prompt
Metadata-only HyperFrames sidecar. It may show shot identity, selected template slug, evidence text, and motion-plan timing notes. It must not invent visual motifs or act as the promoted film render.

## Colors
- Background: #050605
- Text: #f6f5e8
- Evidence accent: #d7ff2f

## Typography
Renderer-safe system sans stack only.

## What NOT To Do
No product shell, no editor chrome, no decorative light effects, no fake media, no unsourced imagery, no self-drawn monitoring graphics, no inline vector motif panel.
`;

await fs.rm(compositionsDir, { recursive: true, force: true });
await fs.mkdir(compositionsDir, { recursive: true });
await Promise.all(sidecarItems.map((item) => fs.writeFile(path.join(compositionsDir, `${item.id}.html`), compositionHtml(item))));
await fs.writeFile(indexPath, html);
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(designPath, design);
await fs.rm(nextPublicOutDir, { recursive: true, force: true });
await fs.cp(outDir, nextPublicOutDir, { recursive: true });

console.log(JSON.stringify({
  ok: true,
  contract: manifest.contract,
  itemCount: manifest.itemCount,
  totalDurationSec: manifest.totalDurationSec,
  indexPath,
  manifestPath,
  designPath,
  compositionsDir,
  nextPublicOutDir,
}, null, 2));
