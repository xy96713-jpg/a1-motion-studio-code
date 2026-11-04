import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const artifactDir = path.join(root, ".codex-artifacts", "output-validation");
const assetDir = path.join(artifactDir, "assets");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

const baseUrl = process.env.A1_BASE_URL || "http://127.0.0.1:4288";
const ffprobe = path.resolve(root, "../bin/ffprobe");
const ffmpeg = path.resolve(root, "../bin/ffmpeg");
const caseMode = process.env.A1_VALIDATE_CASE || "all";
const failures = [];

const imageNames = [
  ["08", "Final Cue", "#d6f14a", "#08c22c"],
  ["07", "Blue Static", "#f06f50", "#bedb18"],
  ["06", "Night Drive", "#e052ad", "#d56b1f"],
  ["05", "Soft Reset", "#8e42da", "#c01861"],
  ["04", "After Hours", "#6698ef", "#bb1bd1"],
  ["03", "Neon Memory", "#52d0bf", "#1f2bc9"],
  ["02", "Low Light", "#4ad264", "#159fc3"],
  ["01", "First Signal", "#cef04b", "#33d44b"],
];

const reportText = `2026 AI 工具复盘
Codex、Kimi、DeepSeek 这三个工具正在分工，而不是互相替代。

Codex 更适合把想法落成可运行系统，能处理文件、页面、测试和导出链路。
Kimi 更适合长文档阅读、会议资料整理和中文语境下的材料压缩。
DeepSeek 更适合低成本推理、结构化拆解和快速生成多个方案。

真正的效率不是哪个模型最强，而是把它们放进同一个工作流。
我的结论：前端负责可视化和微调，后端负责稳定渲染，AI 只做建议和生成。`;

await fs.mkdir(assetDir, { recursive: true });

function svg({ number, title, colorA, colorB }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${colorA}"/>
      <stop offset="1" stop-color="${colorB}"/>
    </linearGradient>
  </defs>
  <rect width="900" height="900" rx="74" fill="url(#g)"/>
  <circle cx="730" cy="150" r="98" fill="#ffffff" opacity=".2"/>
  <path d="M94 620 C 190 572 268 678 382 612 S 606 512 806 636" fill="none" stroke="#111827" stroke-width="34" stroke-linecap="round" opacity=".45"/>
  <text x="76" y="150" font-family="Arial Black, Arial, sans-serif" font-size="92" font-weight="900" fill="#111827">${number}</text>
  <text x="76" y="792" font-family="Arial Black, Arial, sans-serif" font-size="56" font-weight="900" fill="#111827">${title.toUpperCase()}</text>
</svg>`;
}

for (const [number, title, colorA, colorB] of imageNames) {
  const file = `${number} ${title}.svg`;
  await fs.writeFile(path.join(assetDir, file), svg({ number, title, colorA, colorB }));
}

async function existingRasterAssets() {
  const dirs = [
    path.join(root, "uploads", "standalone-media"),
    path.join(root, "uploads", "assets"),
  ];
  const files = [];
  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        if (/\.(png|jpe?g|webp)$/i.test(entry)) files.push(path.join(dir, entry));
      }
    } catch {
      // Optional source directory.
    }
  }
  return files.sort();
}

async function preparedImageAssetPaths() {
  const rasters = await existingRasterAssets();
  if (rasters.length >= imageNames.length) {
    const prepared = [];
    for (let index = 0; index < imageNames.length; index += 1) {
      const [number, title] = imageNames[index];
      const extension = path.extname(rasters[index]).toLowerCase() || ".png";
      const destination = path.join(assetDir, `${number} ${title}${extension}`);
      await fs.copyFile(rasters[index], destination);
      prepared.push(destination);
    }
    return prepared;
  }
  return imageNames.map(([number, title]) => path.join(assetDir, `${number} ${title}.svg`));
}

async function renderPayload(payload, outputFormat, label) {
  const response = await fetch(`${baseUrl}/api/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, outputFormat }),
  });
  const result = await response.json();
  if (!result.ok) {
    throw new Error(`${label} render failed: ${result.error || response.status}`);
  }
  return result;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function probeMedia(file) {
  return run(ffprobe, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,pix_fmt,width,height,avg_frame_rate,duration",
    "-of",
    "json",
    file,
  ]);
}

function alphaStats(file, label) {
  const framePath = path.join(artifactDir, `${stamp}-${label}-alpha-frame.png`);
  const extract = run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "0.8",
    "-i",
    file,
    "-frames:v",
    "1",
    framePath,
  ]);
  const stats = run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "info",
    "-ss",
    "0.8",
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "alphaextract,signalstats,metadata=print:file=-",
    "-f",
    "null",
    "-",
  ]);
  return { framePath, extract, stats };
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function parseProbe(probe) {
  try {
    const parsed = JSON.parse(probe?.stdout || "{}");
    return parsed.streams?.[0] || {};
  } catch {
    return {};
  }
}

function assertImageFrontend(frontend = {}) {
  const expectedNames = imageNames.map(([, title]) => title);
  const actualNames = frontend.trackNames || [];
  assert(frontend.assetCount === 8, `image case expected 8 assets, got ${frontend.assetCount}`);
  assert(frontend.projectKind === "playlist", `image case projectKind should be playlist, got ${frontend.projectKind}`);
  assert(frontend.outputFormat === "mov-alpha", `image case output should default to mov-alpha, got ${frontend.outputFormat}`);
  assert(frontend.assetGrid?.order === "desc", `image case should keep descending source order, got ${frontend.assetGrid?.order}`);
  assert(frontend.assetGrid?.mode === "playlist", `image case should use playlist layout, got ${frontend.assetGrid?.mode}`);
  assert(expectedNames.every((name, index) => actualNames[index] === name), `image case track order mismatch: ${actualNames.join(" | ")}`);
  assert((frontend.orderedAssets || [])[0]?.name?.startsWith("08 "), `image case first source should be 08, got ${(frontend.orderedAssets || [])[0]?.name || ""}`);
  assert((frontend.orderedAssets || [])[0]?.displayIndex === 1, `image case first visible number should be 01, got ${(frontend.orderedAssets || [])[0]?.displayIndex}`);
}

function assertRenderResult(result = {}, label = "render") {
  assert(result.ok === true, `${label} API result was not ok`);
  assert(Boolean(result.finalPath), `${label} finalPath missing`);
  assert(result.mediaCheck?.ok === true, `${label} mediaCheck failed: ${result.mediaCheck?.summary || "missing"}`);
}

function assertMovAlpha(reportCase = {}) {
  const stream = parseProbe(reportCase.probe);
  const samples = reportCase.render?.mediaCheck?.alpha?.samples || [];
  assert(stream.codec_name === "qtrle", `alpha MOV codec should be qtrle, got ${stream.codec_name}`);
  assert(stream.pix_fmt === "argb", `alpha MOV pix_fmt should be argb, got ${stream.pix_fmt}`);
  assert(stream.width === 1920 && stream.height === 1080, `alpha MOV size should be 1920x1080, got ${stream.width}x${stream.height}`);
  assert(stream.avg_frame_rate === "30/1", `alpha MOV FPS should be 30/1, got ${stream.avg_frame_rate}`);
  assert(samples.some((sample) => Number(sample.min) === 0), "alpha MOV should include transparent pixels");
  assert(samples.some((sample) => Number(sample.max) >= 250), "alpha MOV should include opaque content");
  assert(reportCase.alpha?.extract?.status === 0, "alpha frame extraction failed");
}

function assertTextFrontend(frontend = {}) {
  assert(frontend.projectKind === "document", `text case projectKind should be document, got ${frontend.projectKind}`);
  assert(frontend.sceneCount >= 5, `text case should generate at least 5 pages, got ${frontend.sceneCount}`);
  assert(frontend.textLayoutPreset === "brief-left", `text case should use brief-left preset, got ${frontend.textLayoutPreset}`);
}

function assertMp4(reportCase = {}) {
  const stream = parseProbe(reportCase.probe);
  assert(stream.codec_name === "h264", `text MP4 codec should be h264, got ${stream.codec_name}`);
  assert(stream.pix_fmt === "yuv420p", `text MP4 pix_fmt should be yuv420p, got ${stream.pix_fmt}`);
  assert(stream.width === 1920 && stream.height === 1080, `text MP4 size should be 1920x1080, got ${stream.width}x${stream.height}`);
  assert(stream.avg_frame_rate === "30/1", `text MP4 FPS should be 30/1, got ${stream.avg_frame_rate}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(120000);

const report = {
  baseUrl,
  artifactDir,
  imageCase: {},
  textCase: {},
};

try {
  if (caseMode === "all" || caseMode === "image") {
    const uploadPaths = await preparedImageAssetPaths();
    await page.goto(`${baseUrl}/?view=workspace&v=e2e-${stamp}`, { waitUntil: "networkidle" });
    await page.locator("#assetInput").setInputFiles(uploadPaths);
    await page.waitForFunction(() => projectPayload().assets.length === 8, null, { timeout: 120000 });
    await page.screenshot({ path: path.join(artifactDir, `${stamp}-image-layout.png`), fullPage: true });
    const imagePayload = await page.evaluate(() => projectPayload());
    report.imageCase.frontend = {
      title: imagePayload.title,
      projectKind: imagePayload.projectKind,
      outputFormat: imagePayload.outputFormat,
      fps: imagePayload.fps,
      assetGrid: imagePayload.assetGrid,
      assetCount: imagePayload.assets.length,
      uploadedFiles: uploadPaths.map((file) => path.basename(file)),
      orderedAssets: imagePayload.assets.map((asset) => ({
        name: asset.name,
        title: asset.title,
        displayIndex: asset.displayIndex,
      })),
      trackNames: imagePayload.trackNames,
      scenes: imagePayload.scenes.length,
      screenshot: path.join(artifactDir, `${stamp}-image-layout.png`),
    };
    assertImageFrontend(report.imageCase.frontend);

    const alphaResult = await renderPayload(imagePayload, "mov-alpha", "image alpha");
    report.imageCase.render = alphaResult;
    assertRenderResult(alphaResult, "image alpha");
    if (alphaResult.finalPath) {
      report.imageCase.probe = probeMedia(alphaResult.finalPath);
      report.imageCase.alpha = alphaStats(alphaResult.finalPath, "image");
      assertMovAlpha(report.imageCase);
    }
  }

  if (caseMode === "all" || caseMode === "text") {
    await page.goto(`${baseUrl}/?view=hub&v=e2e-text-${stamp}`, { waitUntil: "domcontentloaded" });
    await page.getByText("文稿分镜动效", { exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.shellView === "storyboard", null, { timeout: 120000 });
    await page.locator("#storyboardV2Input").fill(reportText);
    await page.locator("#storyboardV2GenerateBtn").click();
    await page.waitForFunction(() => projectPayload().projectKind === "document" && projectPayload().scenes.length >= 5, null, { timeout: 120000 });
    await page.screenshot({ path: path.join(artifactDir, `${stamp}-text-layout.png`), fullPage: true });
    const textPayload = await page.evaluate(() => {
      const payload = projectPayload();
      return {
        ...payload,
        fps: 30,
        durationPerScene: Math.min(Number(payload.durationPerScene || 4.2), 3.2),
      };
    });
    report.textCase.frontend = {
      title: textPayload.title,
      projectKind: textPayload.projectKind,
      outputFormat: textPayload.outputFormat,
      fps: textPayload.fps,
      textLayoutPreset: textPayload.textLayoutPreset,
      sceneCount: textPayload.scenes.length,
      sceneSummaries: textPayload.scenes.map((scene) => ({
        title: scene.title,
        blocks: scene.blocks?.map((block) => ({ role: block.role, text: block.text, fontSize: block.fontSize })),
      })),
      screenshot: path.join(artifactDir, `${stamp}-text-layout.png`),
    };
    assertTextFrontend(report.textCase.frontend);

    const mp4Result = await renderPayload(textPayload, "mp4", "text mp4");
    report.textCase.render = mp4Result;
    assertRenderResult(mp4Result, "text mp4");
    if (mp4Result.finalPath) {
      report.textCase.probe = probeMedia(mp4Result.finalPath);
      assertMp4(report.textCase);
    }
  }
} finally {
  await browser.close();
}

const reportPath = path.join(artifactDir, `${stamp}-report.json`);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(JSON.stringify({ ok: false, reportPath, failures, report }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, reportPath, report }, null, 2));
