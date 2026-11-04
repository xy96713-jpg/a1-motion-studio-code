import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = path.join(root, "apps", "studio-next");
const rendererDir = path.join(root, "remotion-renderer");
const remotionBin = path.join(rendererDir, "node_modules", ".bin", "remotion");
const rootUrl = process.env.A1_NEXT_WORKBENCH_URL || "http://localhost:4310";
const backendUrl = process.env.A1_BACKEND_URL || "http://localhost:4288";
const sourceUrl = process.env.A1_COMPILED_STRUCTURED_SOURCE_URL || `${backendUrl}/generated/source-page-jsonld-media-fixture.html`;
const outDir = path.join(root, "public", "generated", "compiled-structured-data-proof");
const nextPublicOutDir = path.join(appDir, "public", "generated", "compiled-structured-data-proof");
const propsPath = path.join(outDir, "compiled-structured-data-props.json");
const outputPath = path.join(outDir, "compiled-structured-data.mp4");
const stillPath = path.join(outDir, "compiled-structured-data-frame.png");
const reportPath = path.join(outDir, "report.json");
const nextPublicOutputPath = path.join(nextPublicOutDir, "compiled-structured-data.mp4");
const nextPublicStillPath = path.join(nextPublicOutDir, "compiled-structured-data-frame.png");
const nextPublicReportPath = path.join(nextPublicOutDir, "report.json");

const sourceText = [
  "今年上半年本地服务消费恢复更快。",
  "核心城市订单量增长 24%，但三线城市仍低于去年同期。",
  "报告最后建议用分城市模型持续监测。",
].join("");

function compact(value, max = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`${url} failed ${response.status}: ${compact(JSON.stringify(payload), 1200)}`);
  }
  return payload;
}

async function readJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`${url} failed ${response.status}: ${compact(JSON.stringify(payload), 1200)}`);
  }
  return payload;
}

const run = (cmd, args, options = {}) => new Promise((resolve) => {
  const child = spawn(cmd, args, {
    cwd: options.cwd || root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.on("close", (code) => resolve({ code, output }));
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function frameForShotMidpoint(props, shotId) {
  const fps = Number(props.fps || 30);
  let cursor = 0;
  for (const item of props.items || []) {
    const durationFrames = Math.max(1, Math.round(Number(item.durationSec || 1) * fps));
    if (item.id === shotId) return cursor + Math.floor(durationFrames / 2);
    cursor += durationFrames;
  }
  return Math.max(0, Math.floor(cursor / 2));
}

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(nextPublicOutDir, { recursive: true });

try {
  const compile = await postJson(`${rootUrl}/api/a1-compile-template-timeline`, {
    title: "结构化数据 MP4 证明",
    sourceUrl,
    sourceText,
  });
  let state = compile.state;
  assert(state?.contract === "A1NextLegacyBridgeState/v1", "compile API did not return a valid workbench state");
  assert(Array.isArray(state.shots) && state.shots.length === 3, `expected 3 compiled shots, got ${state?.shots?.length || 0}`);

  const dataShot = state.shots.find((shot) => /24|增长|数据|订单/u.test(`${shot.source} ${shot.visual} ${shot.screenTitle}`));
  assert(dataShot?.id, `could not locate structured data shot: ${JSON.stringify(state.shots)}`);

  const discovery = await postJson(`${rootUrl}/api/a1-actions/discover-compiled-assets`, {
    state,
    shotId: dataShot.id,
  });
  state = discovery.state;
  const candidate = Array.isArray(state.assets)
    ? state.assets.find((asset) => asset?.structuredDataEvidence?.contract === "A1StructuredDataEvidence/v1") || state.assets[0]
    : null;
  assert(candidate?.id, "structured source-page candidate was not discovered");
  assert(candidate?.structuredDataEvidence?.contract === "A1StructuredDataEvidence/v1", `candidate lacks structured evidence: ${JSON.stringify(candidate)}`);

  const review = await postJson(`${rootUrl}/api/a1-actions/review-compiled-asset`, {
    state,
    shotId: dataShot.id,
    assetId: candidate.id,
    cropMode: "contain-safe",
  });
  state = review.state;

  const save = await postJson(`${rootUrl}/api/a1-actions/save-compiled-project`, { state });
  const projectId = save.projectId || "";
  assert(projectId, `save did not return projectId: ${JSON.stringify(save)}`);

  const persisted = await readJson(`${backendUrl}/api/projects/${encodeURIComponent(projectId)}`);
  const props = persisted.payload?.compiledArticle?.templateTimelineProps;
  assert(props?.contract === "A1ArticleTemplateTimeline/v1", "persisted compiled project lacks template timeline props");
  assert(Array.isArray(props.items) && props.items.length === 3, `expected 3 timeline items, got ${props?.items?.length || 0}`);

  const persistedDataItem = props.items.find((item) => item.id === `shot-${dataShot.id}`) || props.items.find((item) => item.selectedSlug === "progress-bars");
  const structured = persistedDataItem?.templateProps?.structuredDataEvidence || {};
  const progressItems = Array.isArray(persistedDataItem?.templateProps?.items) ? persistedDataItem.templateProps.items : [];
  assert(structured.contract === "A1StructuredDataEvidence/v1", `render props data shot lacks structured evidence: ${JSON.stringify(persistedDataItem)}`);
  assert(progressItems.some((item) => item.raw === "24%") && progressItems.some((item) => item.raw === "-8%"), `render props lack structured metric rows: ${JSON.stringify(progressItems)}`);

  await fs.writeFile(propsPath, `${JSON.stringify(props, null, 2)}\n`);

  const sfx = await run(process.execPath, ["scripts/generate-template-timeline-sfx.mjs"]);
  if (sfx.code !== 0) {
    throw new Error(`generate-template-timeline-sfx failed: ${compact(sfx.output, 5000)}`);
  }

  const render = await run(remotionBin, [
    "render",
    "src/index.ts",
    "ArticleTemplateTimeline",
    path.relative(rendererDir, outputPath),
    "--props",
    path.relative(rendererDir, propsPath),
    "--overwrite",
    "--codec=h264",
    "--crf=28",
    "--scale=0.5",
    "--log=warn",
  ], { cwd: rendererDir });
  if (render.code !== 0) {
    throw new Error(`Remotion render failed: ${compact(render.output, 5000)}`);
  }

  const stillFrame = frameForShotMidpoint(props, persistedDataItem?.id || "shot-02");
  const still = await run(remotionBin, [
    "still",
    "src/index.ts",
    "ArticleTemplateTimeline",
    path.relative(rendererDir, stillPath),
    `--frame=${stillFrame}`,
    "--props",
    path.relative(rendererDir, propsPath),
    "--overwrite",
    "--scale=0.5",
    "--log=warn",
  ], { cwd: rendererDir });
  if (still.code !== 0) {
    throw new Error(`Remotion still failed: ${compact(still.output, 5000)}`);
  }

  await fs.copyFile(outputPath, nextPublicOutputPath);
  await fs.copyFile(stillPath, nextPublicStillPath);

  const totalDurationSec = props.items.reduce((sum, item) => sum + Number(item.durationSec || 0), 0);
  const report = {
    ok: true,
    contract: "A1CompiledStructuredDataMp4Proof/v1",
    rootUrl,
    backendUrl,
    projectId,
    sourceUrl,
    shotCount: props.items.length,
    dataShotId: persistedDataItem?.id || "",
    totalDurationSec,
    propsPath,
    outputPath,
    stillPath,
    nextPublicOutputPath,
    nextPublicStillPath,
    publicUrl: `${rootUrl.replace(/\/$/u, "")}/generated/compiled-structured-data-proof/compiled-structured-data.mp4`,
    stillUrl: `${rootUrl.replace(/\/$/u, "")}/generated/compiled-structured-data-proof/compiled-structured-data-frame.png`,
    reportPath,
    structuredData: {
      contract: structured.contract,
      extractionSource: structured.extractionSource || structured.source || "",
      metricCount: structured.metricCount || progressItems.length,
      metricRaws: progressItems.map((item) => item.raw || item.rawValue || item.value),
      progressMeasurementFrame: persistedDataItem?.templateProps?.measurementFrame || "",
    },
    bridge: {
      remotionComposition: "ArticleTemplateTimeline",
      rendererContract: "A1ArticleTemplateCompiler/v1->A1ArticleTemplateTimeline/v1->Remotion MP4",
      templateIds: props.items.map((item) => `rve-${item.selectedSlug}`),
    },
    sfx: {
      mode: "sfx-only-no-music-no-voice",
      manifestPath: path.join(root, "public", "generated", "studio-next-template-timeline", "sfx", "manifest.json"),
    },
  };

  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(nextPublicReportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = {
    ok: false,
    contract: "A1CompiledStructuredDataMp4Proof/v1",
    stage: "render-compiled-structured-data-proof",
    error: error instanceof Error ? error.message : String(error),
    reportPath,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
