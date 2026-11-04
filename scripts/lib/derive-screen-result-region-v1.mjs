import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";

const require = createRequire(path.resolve(process.cwd(), "apps/studio-next/package.json"));
const sharp = require("sharp");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

export async function deriveScreenResultRegion({source, beforeMs, resultMs, durationMs, shotId, outputDir, ffmpeg}) {
  if (!fs.existsSync(source) || !Number.isFinite(beforeMs) || !Number.isFinite(resultMs) || !Number.isFinite(durationMs)) throw new Error(`screen-result-region-input:${shotId}`);
  fs.mkdirSync(outputDir, {recursive: true});
  const beforeFile = path.join(outputDir, `${shotId.toLowerCase()}-result-before.jpg`);
  const afterFile = path.join(outputDir, `${shotId.toLowerCase()}-result-after.jpg`);
  const beforeSeconds = Math.max(0, Math.min(resultMs - 300, beforeMs) / 1000);
  const afterSeconds = Math.min((durationMs - 100) / 1000, (resultMs + 650) / 1000);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(beforeSeconds), "-i", source, "-frames:v", "1", beforeFile]);
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(afterSeconds), "-i", source, "-frames:v", "1", afterFile]);
  const width = 320, height = 180;
  const [before, after] = await Promise.all([beforeFile, afterFile].map((file) => sharp(file).resize(width, height).removeAlpha().raw().toBuffer()));
  let minX = width, minY = height, maxX = -1, maxY = -1, changed = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 3;
    const delta = (Math.abs(before[index] - after[index]) + Math.abs(before[index + 1] - after[index + 1]) + Math.abs(before[index + 2] - after[index + 2])) / 3;
    if (delta < 14) continue;
    changed += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (changed < 24 || maxX < minX || maxY < minY) throw new Error(`screen-result-region-delta-missing:${shotId}`);
  const centerX = ((minX + maxX) / 2) / width, centerY = ((minY + maxY) / 2) / height;
  const regionWidth = Math.max(.24, (maxX - minX + 1) / width + .08), regionHeight = Math.max(.18, (maxY - minY + 1) / height + .08);
  const region = {x: Math.max(0, Math.min(1 - regionWidth, centerX - regionWidth / 2)), y: Math.max(0, Math.min(1 - regionHeight, centerY - regionHeight / 2)), width: Math.min(1, regionWidth), height: Math.min(1, regionHeight)};
  return {
    contract: "A1VerifiedScreenResultRegion/v1",
    status: "PASS",
    shotId,
    region: Object.fromEntries(Object.entries(region).map(([key, value]) => [key, Number(value.toFixed(6))])),
    changedPixelCount: changed,
    timing: {beforeMs: Math.round(beforeSeconds * 1000), afterMs: Math.round(afterSeconds * 1000), resultMs: Math.round(resultMs)},
    frames: {beforeFile, afterFile, beforeSha256: sha256(beforeFile), afterSha256: sha256(afterFile)},
  };
}
