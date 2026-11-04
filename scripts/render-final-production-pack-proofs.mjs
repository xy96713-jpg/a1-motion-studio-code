import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const rendererDir = path.join(root, "remotion-renderer");
const remotion = path.join(rendererDir, "node_modules", ".bin", "remotion");
const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://127.0.0.1:4310";
const outDir = path.join(root, ".codex-artifacts", "a1-production-packs-20260714");

async function compile(body) {
  const response = await fetch(`${rootUrl}/api/a1-compile-template-timeline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(`compile failed: ${JSON.stringify(payload)}`);
  return payload.props;
}

function singleItemProps(props, slug) {
  const item = props.items.find((entry) => entry.selectedSlug === slug);
  if (!item) throw new Error(`${slug} item missing: ${props.items.map((entry) => entry.selectedSlug).join(", ")}`);
  const scene = props.motionIrV2.scenes.find((entry) => entry.sceneId === item.id);
  return {
    ...props,
    title: `${slug} real-article proof`,
    items: [item],
    motionIrV2: { ...props.motionIrV2, scenes: scene ? [{ ...scene, timing: { ...scene.timing, frameStart: 0 } }] : [] },
  };
}

function runStill(propsPath, outputPath, frame) {
  return new Promise((resolve, reject) => {
    const child = spawn(remotion, [
      "still", "src/index.ts", "ArticleTemplateTimeline", path.relative(rendererDir, outputPath),
      `--frame=${frame}`, "--props", path.relative(rendererDir, propsPath), "--overwrite", "--log=warn",
    ], { cwd: rendererDir, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(output.slice(-4000))));
  });
}

await fs.mkdir(outDir, { recursive: true });
const roles = await compile({
  title: "一套可复用的写作流程",
  sourceText: "很多人以为中文稿有 AI 味，只是提示词写得不够好。真正用下来，问题往往出在写作之前没有建立判断。模型拿到的只有主题，没有材料，也不知道读者会卡在哪里。结果就是每句话都正确，但整篇文章没有推进。更可靠的做法，是先明确文章要解决的矛盾。接着整理事实、案例和反例。然后把这些材料分配给开场、问题、方法和证据段落。Codex 负责后台编排，Kimi 负责把语言写顺，DeepSeek 负责检查细节。模型开始动笔之后，还要检查每一段是否承接上一段。发现断裂时，应当回到论点链，而不是继续添加修辞。最后留下来的不应该是一篇临时拼接的稿子。它应该是一套可以反复复用的写作流程。",
});
const comparisonSource = "https://www.nationalparkstraveler.org/2026/01/volcano-watch-what-do-small-earthquakes-beneath-kilauea-summit-mean-ongoing-eruption";
const carousel = await compile({
  title: "火山活动前后变化",
  sourceUrl: comparisonSource,
  sourceText: "火山活动不能只看一个瞬间。喷发前后的火山口、地震分布和喷发柱呈现出明显变化。最后，判断必须回到持续监测。",
  assets: [
    { id: "scene-02-before", parentId: "scene-02", adopted: true, source: "cached-source-reference", sourceUrl: comparisonSource, imageUrl: "http://localhost:4288/assets/web-assets/cache/2f8b2d731adae6da041e.jpg" },
    { id: "scene-02-during", parentId: "scene-02", adopted: true, source: "cached-source-reference", sourceUrl: "https://bigislandnow.com/2026/01/23/volcano-watch-what-do-small-earthquakes-beneath-kilauea-summit-mean-for-the-ongoing-eruption/", imageUrl: "http://localhost:4288/assets/web-assets/cache/5eb0b6e0afb0ba8bc5f4.jpg" },
    { id: "scene-02-after", parentId: "scene-02", adopted: true, source: "cached-source-reference", sourceUrl: "https://www.bigislandvideonews.com/2024/05/04/volcano-watch-whats-shaking-at-kilauea-summit/", imageUrl: "http://localhost:4288/assets/web-assets/cache/6c2998f22701b22fd9ab.jpg" },
  ],
});

const jobs = [
  { slug: "cinematic-title-intro", props: singleItemProps(roles, "cinematic-title-intro") },
  { slug: "animated-list", props: singleItemProps(roles, "animated-list") },
  { slug: "image-carousel", props: singleItemProps(carousel, "image-carousel") },
];

function assertProductionProof(job) {
  const item = job.props.items[0];
  if (item.templatePack?.contract !== "A1ProductionTemplatePack/v1") {
    throw new Error(`${job.slug} is not bound to the production pack contract`);
  }
  if (item.templatePack.slug !== job.slug) {
    throw new Error(`${job.slug} production pack slug mismatch`);
  }
  if (job.slug === "animated-list") {
    const rows = item.templateProps?.roleRows || [];
    if (rows.length < 3 || rows.some((row) => row.iconStatus !== "verified-local" || !row.name || !row.task)) {
      throw new Error("animated-list proof requires at least three complete rows with verified local icons");
    }
  }
  if (job.slug === "image-carousel") {
    const urls = item.templateProps?.images?.map((entry) => entry.imageUrl).filter(Boolean)
      || item.templateProps?.imageUrls?.filter(Boolean)
      || [];
    if (urls.length < 3 || new Set(urls).size < 3) {
      throw new Error("image-carousel proof requires at least three distinct source images");
    }
    if (!item.templateProps?.sourceUrl && !item.article?.sourceUrl) {
      throw new Error("image-carousel proof requires source provenance");
    }
  }
}

const outputs = [];
for (const job of jobs) {
  assertProductionProof(job);
  const propsPath = path.join(outDir, `${job.slug}-props.json`);
  const outputPath = path.join(outDir, `${job.slug}.png`);
  await fs.writeFile(propsPath, `${JSON.stringify(job.props, null, 2)}\n`);
  const frame = Math.max(1, Math.floor(job.props.items[0].durationSec * job.props.fps * 0.68));
  await runStill(propsPath, outputPath, frame);
  outputs.push({ slug: job.slug, frame, propsPath, outputPath });
}

const report = { ok: true, contract: "A1FinalProductionPackProof/v1", outputs };
await fs.writeFile(path.join(outDir, "final-pack-proof-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
