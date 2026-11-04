import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererDir = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");
const reportPath = path.join(root, "public", "template-confirmations", "article-template-router-v1.json");
const propsPath = path.join(root, "public", "template-confirmations", "article-template-timeline-props.json");
const articleManifestPath = path.join(root, "public", "assets", "web-evidence-captures", "www-msn-com-en-us-news-technology-bytedances-new-ai-video-model-can-make-30-seco", "manifest.json");
const multiImageManifestPath = path.join(root, "public", "template-confirmations", "rve-multi-image-news-pack.json");
const outputPath = path.join(root, "public", "generated", "article-template-router-v1", "article-template-timeline-export.mp4");
const proofPath = path.join(root, "public", "generated", "article-template-router-v1", "article-template-timeline-export-frame.png");
const publicBaseUrl = process.env.A1_PUBLIC_BASE_URL || "http://127.0.0.1:4301";

const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, "utf8"));
const readJsonOptional = async (filePath, fallback = null) => {
  try {
    return await readJson(filePath);
  } catch {
    return fallback;
  }
};

const imageToDataUrl = async (filePath = "", contentType = "image/jpeg") => {
  if (!filePath) return "";
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(root, "public", filePath.replace(/^\/+/u, ""));
  const bytes = await fs.readFile(absolutePath);
  return `data:${contentType || "image/jpeg"};base64,${bytes.toString("base64")}`;
};

const replaceTemplateImagePlaceholders = (value, imageUrls) => {
  if (Array.isArray(value)) return value.map((item) => replaceTemplateImagePlaceholders(item, imageUrls));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTemplateImagePlaceholders(item, imageUrls)]));
  }
  if (typeof value !== "string") return value;
  if (value === "<article-image-data-url>") return imageUrls[0] || "";
  const match = value.match(/^<image-(\d+)-data-url>$/u);
  if (match) return imageUrls[Math.max(0, Number(match[1]) - 1)] || imageUrls[0] || "";
  return value;
};

const runRemotion = (args) => new Promise((resolve) => {
  const child = spawn(remotionBin, args, { cwd: rendererDir, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => resolve({ code, output }));
});

const report = await readJson(reportPath);
const articleManifest = await readJsonOptional(articleManifestPath, null);
const multiImageManifest = await readJsonOptional(multiImageManifestPath, { selectedImages: [] });
const imageUrls = [];
if (articleManifest?.localPath) {
  imageUrls.push(await imageToDataUrl(articleManifest.localPath, articleManifest.selectedMedia?.contentType || "image/jpeg"));
}
for (const image of (multiImageManifest?.selectedImages || []).slice(0, 6)) {
  if (image?.localPath) imageUrls.push(await imageToDataUrl(image.localPath, image.contentType || "image/jpeg"));
}
const playbackItems = Array.isArray(report.playbackItems) ? report.playbackItems : [];
const renderableItems = playbackItems.filter((item) => (
  item.type === "shot" &&
  item.output &&
  item.renderStatus === "renderable-adapter-ready"
));

if (!renderableItems.length) {
  console.error("No renderable article template timeline items found.");
  process.exit(1);
}

const props = {
  contract: "A1ArticleTemplateTimeline/v1",
  title: report.sourceArticle?.title || "A1 Article Template Timeline",
  fps: 30,
  items: renderableItems.map((item) => ({
    id: item.id,
    type: item.type,
    selectedSlug: item.selectedSlug,
    routeGroup: item.routeGroup,
    src: `${publicBaseUrl.replace(/\/$/u, "")}/${String(item.output).replace(/^\/+/u, "")}`,
    durationSec: Number(item.durationSec) || 3,
    playbackRate: Number(item.playbackRate) || 1,
    templateProps: replaceTemplateImagePlaceholders(item.props || {}, imageUrls),
  })),
};

await fs.mkdir(path.dirname(propsPath), { recursive: true });
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(propsPath, `${JSON.stringify(props, null, 2)}\n`);

const render = await runRemotion([
  "render",
  "src/index.ts",
  "ArticleTemplateTimeline",
  path.relative(rendererDir, outputPath),
  "--props",
  path.relative(rendererDir, propsPath),
  "--overwrite",
  "--codec=h264",
  "--log=warn",
]);

if (render.code !== 0) {
  console.error(render.output.slice(-5000));
  process.exit(render.code || 1);
}

const still = await runRemotion([
  "still",
  "src/index.ts",
  "ArticleTemplateTimeline",
  path.relative(rendererDir, proofPath),
  "--frame=90",
  "--props",
  path.relative(rendererDir, propsPath),
  "--overwrite",
  "--log=warn",
]);

if (still.code !== 0) {
  console.error(still.output.slice(-5000));
  process.exit(still.code || 1);
}

const totalDurationSec = props.items.reduce((sum, item) => sum + item.durationSec, 0);
console.log(JSON.stringify({
  contract: "A1ArticleTemplateTimelineExport/v1",
  itemCount: props.items.length,
  totalDurationSec: Number(totalDurationSec.toFixed(2)),
  propsPath,
  outputPath,
  proofPath,
  url: `${publicBaseUrl.replace(/\/$/u, "")}/generated/article-template-router-v1/article-template-timeline-export.mp4`,
}, null, 2));
