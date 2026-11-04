import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);

const root = process.cwd();
const ffmpegPath = path.resolve(root, "../bin/ffmpeg");
const ffprobePath = path.resolve(root, "../bin/ffprobe");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = process.env.A1_SHADER_EFFECTS_URL || "http://127.0.0.1:4299/shader-effects/";
const sourcePath =
  process.env.A1_SHADER_EFFECTS_SOURCE ||
  path.join(
    root,
    "outputs/product-design-audit/shader-effects-standalone/video-smoke-source.mp4",
  );
const fontPath = "/System/Library/Fonts/Supplemental/Arial.ttf";
const effectConfigs = [
  { label: "LUT", slug: "lut" },
  { label: "Ghost", slug: "ghost" },
  { label: "Split", slug: "split" },
  { label: "Zoom", slug: "zoom" },
  { label: "Mosaic", slug: "mosaic" },
  { label: "Oil", slug: "oil" },
  { label: "Halftone", slug: "halftone" },
  { label: "ASCII", slug: "ascii" },
  { label: "Dither", slug: "dither" },
  { label: "VHS", slug: "vhs" },
];

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function log(message) {
  console.log(`[shader-demo] ${message}`);
}

async function ensureInput() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source video not found: ${sourcePath}`);
  }
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`ffmpeg not found: ${ffmpegPath}`);
  }
  if (!fs.existsSync(ffprobePath)) {
    throw new Error(`ffprobe not found: ${ffprobePath}`);
  }
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Google Chrome not found: ${chromePath}`);
  }
}

async function rmrf(target) {
  await fsp.rm(target, { recursive: true, force: true });
}

async function mkdir(target) {
  await fsp.mkdir(target, { recursive: true });
}

async function probeVideo(file) {
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size:stream=codec_name,width,height,avg_frame_rate,pix_fmt",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(stdout || "{}");
}

function drawtextEscape(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'")
    .replaceAll(",", "\\,")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");
}

async function waitForExportIdle(page) {
  const button = page.getByRole("button", { name: /^Export mp4$/ }).last();
  await button.waitFor({ state: "visible", timeout: 120000 });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (!(await button.isDisabled())) return button;
    await page.waitForTimeout(250);
  }
  throw new Error("Export button stayed disabled for too long");
}

async function renderRawClips(rawDir) {
  const browser = await chromium.launch({
    headless: false,
    executablePath: chromePath,
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (msg) => {
    const text = `[browser:${msg.type()}] ${msg.text()}`;
    consoleMessages.push(text);
    console.log(text);
  });
  page.on("pageerror", (error) => {
    const text = `[browser:pageerror] ${error.message}`;
    consoleMessages.push(text);
    console.log(text);
  });

  try {
    log(`Open ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('input[type="file"]').setInputFiles(sourcePath);
    await waitForExportIdle(page);
    await page.waitForTimeout(1500);

    const rendered = [];
    for (let index = 0; index < effectConfigs.length; index += 1) {
      const effect = effectConfigs[index];
      log(`Export ${index + 1}/${effectConfigs.length}: ${effect.label}`);
      await page.getByRole("button", { name: effect.label, exact: true }).click();
      await page.waitForTimeout(1200);
      const exportButton = await waitForExportIdle(page);
      const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
      await exportButton.click();
      const download = await downloadPromise;
      const clipName = `${String(index + 1).padStart(2, "0")}-${effect.slug}.mp4`;
      const targetPath = path.join(rawDir, clipName);
      await download.saveAs(targetPath);
      rendered.push({
        ...effect,
        clipName,
        rawPath: targetPath,
      });
      await page.waitForTimeout(2600);
    }

    await browser.close();
    return { rendered, consoleMessages };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function makeLabeledClip(inputPath, outputPath, label) {
  const safeLabel = drawtextEscape(label);
  const filter = [
    "drawbox=x=18:y=h-78:w=248:h=54:color=black@0.58:t=fill",
    `drawtext=fontfile=${fontPath}:text='${safeLabel}':fontcolor=white:fontsize=30:x=34:y=h-43`,
  ].join(",");
  await execFileAsync(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function createConcatList(clips, file) {
  const text = clips
    .map((clip) => `file '${clip.replaceAll("'", "'\\''")}'`)
    .join("\n");
  await fsp.writeFile(file, `${text}\n`, "utf8");
}

async function buildContactSheet(videoPath, outputPath) {
  await execFileAsync(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-vf",
    "fps=0.5,scale=320:-1,tile=5x2",
    "-frames:v",
    "1",
    "-update",
    "1",
    outputPath,
  ]);
}

async function main() {
  await ensureInput();

  const runId = stamp();
  const outputDir = path.join(
    root,
    "outputs/product-design-audit/shader-effects-standalone/demo-renders",
    runId,
  );
  const rawDir = path.join(outputDir, "raw-clips");
  const labeledDir = path.join(outputDir, "labeled-clips");
  const summaryPath = path.join(outputDir, "summary.json");
  const reelPath = path.join(outputDir, "shader-effects-demo-reel.mp4");
  const sheetPath = path.join(outputDir, "shader-effects-demo-reel-sheet.png");
  const concatListPath = path.join(outputDir, "concat.txt");

  await rmrf(outputDir);
  await mkdir(rawDir);
  await mkdir(labeledDir);

  const { rendered, consoleMessages } = await renderRawClips(rawDir);
  const clipSummaries = [];
  for (const clip of rendered) {
    const labeledPath = path.join(labeledDir, clip.clipName);
    await makeLabeledClip(clip.rawPath, labeledPath, clip.label);
    const probe = await probeVideo(labeledPath);
    clipSummaries.push({
      label: clip.label,
      slug: clip.slug,
      rawPath: clip.rawPath,
      labeledPath,
      probe,
    });
  }

  await createConcatList(
    clipSummaries.map((item) => item.labeledPath),
    concatListPath,
  );
  await execFileAsync(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    reelPath,
  ]);
  await buildContactSheet(reelPath, sheetPath);

  const reelProbe = await probeVideo(reelPath);
  const summary = {
    runId,
    baseUrl,
    sourcePath,
    reelPath,
    sheetPath,
    clips: clipSummaries,
    reelProbe,
    consoleMessages,
  };
  await fsp.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  log(`Done: ${reelPath}`);
  log(`Sheet: ${sheetPath}`);
  log(`Summary: ${summaryPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
