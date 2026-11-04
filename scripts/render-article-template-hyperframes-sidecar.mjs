import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.join(root, "public", "template-confirmations", "article-template-router-v1.json");
const outDir = path.join(root, "public", "generated", "article-template-router-v1", "hyperframes-sidecar");
const sidecarAssetDir = path.join(outDir, "assets");
const indexPath = path.join(outDir, "index.html");
const manifestPath = path.join(outDir, "manifest.json");

const escapeHtml = (value = "") => String(value ?? "")
  .replace(/&/gu, "&amp;")
  .replace(/</gu, "&lt;")
  .replace(/>/gu, "&gt;")
  .replace(/"/gu, "&quot;");

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const report = await readJson(reportPath);
const items = (report.playbackItems || []).filter((item) => item.output);

if (!items.length) {
  console.error("No playback items available for HyperFrames sidecar.");
  process.exit(1);
}

let cursor = 0;
const sidecarItems = items.map((item, index) => {
  const duration = Number(item.durationSec) || 3;
  const assetName = path.basename(item.output);
  const record = {
    ...item,
    sequenceIndex: index,
    startSec: Number(cursor.toFixed(2)),
    durationSec: duration,
    src: `assets/${assetName}`,
    sourceFile: path.join(root, "public", item.output),
    assetName,
  };
  cursor += duration;
  return record;
});

const tracks = sidecarItems.map((item) => `
    <video
      id="${escapeHtml(item.id)}"
      class="clip clip-${escapeHtml(item.type)}"
      data-start="${item.startSec}"
      data-duration="${item.durationSec}"
      data-track-index="0"
      data-template-slug="${escapeHtml(item.selectedSlug)}"
      data-route-group="${escapeHtml(item.routeGroup)}"
      src="${escapeHtml(item.src)}"
      muted
      playsinline
    ></video>`).join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>A1 Article Template HyperFrames Sidecar</title>
  <style>
    :root { color-scheme: dark; --bg:#050605; --ink:#f6f5e8; --muted:rgba(246,245,232,.64); --accent:#d7ff2f; }
    html, body { margin:0; width:100%; height:100%; background:var(--bg); color:var(--ink); font-family:"Avenir Next","Helvetica Neue",Arial,sans-serif; }
    #a1-rve-template-sidecar { position:relative; width:1920px; height:1080px; overflow:hidden; background:#000; }
    .clip { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; background:#000; }
    .meta { position:absolute; z-index:10; left:48px; bottom:42px; display:flex; gap:12px; align-items:center; color:var(--accent); font:900 18px/1 ui-monospace,SFMono-Regular,Menlo,monospace; text-transform:uppercase; pointer-events:none; }
    .meta span { background:rgba(5,6,5,.72); border:1px solid rgba(215,255,47,.32); padding:10px 12px; }
  </style>
</head>
<body>
  <div
    id="a1-rve-template-sidecar"
    data-composition-id="a1-rve-template-sidecar"
    data-start="0"
    data-duration="${Number(cursor.toFixed(2))}"
    data-width="1920"
    data-height="1080"
    data-engine-adapter="hyperframes"
    data-remotion-export="ArticleTemplateTimeline"
    data-contract="A1RemotionHyperFramesIntegratedRoute/v1"
  >
${tracks}
    <div class="meta">
      <span>HyperFrames sidecar</span>
      <span>${sidecarItems.length} clips</span>
      <span>${Number(cursor.toFixed(2))}s</span>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    const clips = ${JSON.stringify(sidecarItems.map((item) => ({
      id: item.id,
      type: item.type,
      startSec: item.startSec,
      durationSec: item.durationSec,
      selectedSlug: item.selectedSlug,
    }))).replace(/</gu, "\\u003c")};
    clips.forEach((clip) => {
      tl.set("#" + clip.id, { opacity: 0 }, 0);
      tl.set("#" + clip.id, { opacity: 1 }, clip.startSec);
      tl.to("#" + clip.id, { opacity: 1, duration: Math.max(0.05, clip.durationSec - 0.08), ease: "none" }, clip.startSec);
      tl.set("#" + clip.id, { opacity: 0 }, clip.startSec + clip.durationSec);
    });
    window.__timelines["a1-rve-template-sidecar"] = tl;
  </script>
</body>
</html>`;

const manifest = {
  contract: "A1RemotionHyperFramesIntegratedRoute/v1",
  generatedAt: new Date().toISOString(),
  sourceReport: path.relative(root, reportPath),
  html: path.relative(root, indexPath),
  remotionComposition: "ArticleTemplateTimeline",
  hyperframesCompositionId: "a1-rve-template-sidecar",
  itemCount: sidecarItems.length,
  totalDurationSec: Number(cursor.toFixed(2)),
  items: sidecarItems.map((item) => ({
    id: item.id,
    type: item.type,
    selectedSlug: item.selectedSlug,
    startSec: item.startSec,
    durationSec: item.durationSec,
    src: item.src,
  })),
  roles: {
    hyperframes: "Inspectable HTML/GSAP sidecar for frame-seekable preview and visual QA.",
    remotion: "Final deterministic renderer and MP4 export.",
  },
};

await fs.mkdir(sidecarAssetDir, { recursive: true });
await Promise.all(sidecarItems.map((item) => fs.copyFile(item.sourceFile, path.join(sidecarAssetDir, item.assetName))));
await fs.writeFile(indexPath, html);
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  contract: manifest.contract,
  itemCount: manifest.itemCount,
  totalDurationSec: manifest.totalDurationSec,
  indexPath,
  manifestPath,
  url: "http://127.0.0.1:4301/generated/article-template-router-v1/hyperframes-sidecar/index.html",
}, null, 2));
