import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outputDir = path.join(root, "public", "generated", "standalone-previews");
const uploadsDir = path.join(root, "uploads", "assets");
const baseUrl = readArg("--base-url") || process.env.A1_MOTION_STUDIO_URL || "http://127.0.0.1:4288/";

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function stamp() {
  const now = new Date();
  return now.toISOString();
}

async function listSampleAssets(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSampleAssets(fullPath));
      continue;
    }
    if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files.sort();
}

async function ensureSampleAsset() {
  const files = await listSampleAssets(uploadsDir);
  const preferred = files.find((file) => /\.jpe?g$/i.test(file)) || files[0];
  if (!preferred) {
    throw new Error("没有找到可用于独立模块预览的示例图片。");
  }
  return preferred;
}

async function safeClick(page, matcher) {
  const button = page.locator("button").filter({ hasText: matcher }).first();
  if ((await button.count()) === 0) return false;
  await button.click().catch(() => {});
  return true;
}

async function captureTypeOverlays(page, sampleAsset, outputPath) {
  await page.goto(new URL("/type-overlays/", baseUrl).toString(), { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('input[type="file"]').setInputFiles(sampleAsset);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: outputPath });
}

async function captureShaderEffects(page, sampleAsset, outputPath) {
  await page.goto(new URL("/shader-effects/", baseUrl).toString(), { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('input[type="file"]').setInputFiles(sampleAsset);
  await page.waitForTimeout(2400);
  await safeClick(page, /ASCII/);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: outputPath });
}

async function capturePixelBento(page, sampleAsset, outputPath) {
  await page.goto(new URL("/pixel-bento/", baseUrl).toString(), { waitUntil: "networkidle", timeout: 60000 });
  await page.locator('input[type="file"]').setInputFiles(sampleAsset);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: outputPath });
}

async function main() {
  await fsp.mkdir(outputDir, { recursive: true });
  const sampleAsset = await ensureSampleAsset();
  const browser = await chromium.launch({ headless: true });
  const tasks = [
    {
      id: "type-overlays",
      filename: "type-overlays.png",
      objectPosition: "center top",
      run: captureTypeOverlays,
    },
    {
      id: "shader-effects",
      filename: "shader-effects.png",
      objectPosition: "center top",
      run: captureShaderEffects,
    },
    {
      id: "pixel-bento",
      filename: "pixel-bento.png",
      objectPosition: "center top",
      run: capturePixelBento,
    },
  ];
  const items = {};
  try {
    for (const task of tasks) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      try {
        const outputPath = path.join(outputDir, task.filename);
        await task.run(page, sampleAsset, outputPath);
        items[task.id] = {
          id: task.id,
          url: `/generated/standalone-previews/${task.filename}?v=${Date.now()}`,
          objectPosition: task.objectPosition,
          updatedAt: stamp(),
        };
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const manifest = {
    ok: true,
    updatedAt: stamp(),
    items,
  };
  await fsp.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  process.stdout.write(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
