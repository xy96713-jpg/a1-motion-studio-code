#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const python = path.join(root, ".codex-artifacts/runtime/sam2-venv/bin/python");
const script = path.join(root, "scripts/a1_typography_sam2_video_canary.py");
const checkpoint = path.join(root, ".codex-artifacts/runtime/sam2-models/sam2.1_hiera_tiny.pt");
const video = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-video-093bc1315163.mov");
const initialMask = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/presenter-depth-title-canary-v1/assets/ED-01/ed-01-presenter-matte.png");
const outputDir = path.join(root, "work/test-fixtures/ed01-sam2-video-canary-v1");
const framesDir = path.join(outputDir, "frames");
fs.rmSync(outputDir, {recursive: true, force: true});
fs.mkdirSync(framesDir, {recursive: true});
const extraction = spawnSync("ffmpeg", ["-v", "error", "-ss", "1.677", "-i", video, "-vf", "fps=3,scale=960:540", "-frames:v", "6", path.join(framesDir, "%05d.jpg")], {cwd: root, encoding: "utf8"});
assert.equal(extraction.status, 0, extraction.stderr || extraction.stdout);
assert.equal(fs.readdirSync(framesDir).filter((file) => file.endsWith(".jpg")).length, 6);
const execution = spawnSync(python, [script, "--frames-dir", framesDir, "--initial-mask", initialMask, "--checkpoint", checkpoint, "--output-dir", outputDir, "--shot-id", "ED-01", "--source-disposition", "CURRENT_IMPORTED_SOURCE_RESEARCH_ONLY"], {cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024});
assert.equal(execution.status, 0, String(execution.error || execution.stderr || execution.stdout || `status:${execution.status}`));
const report = JSON.parse(fs.readFileSync(path.join(outputDir, "report.json"), "utf8"));
assert.equal(report.contract, "A1TypographySam2VideoCanary/v1");
assert.equal(report.status, "PASS");
assert.equal(report.sourceDisposition, "CURRENT_IMPORTED_SOURCE_RESEARCH_ONLY");
assert.equal(report.frameCount, 6);
assert.equal(report.outputs.length, 6);
assert.ok(report.temporal.minimumConsecutiveIou >= 0.75);
assert.equal(report.productionAdmission, false);
assert.equal(report.motionStarted, false);
for (const output of report.outputs) {
  assert.ok(fs.existsSync(output.file));
  assert.ok(output.nonzeroPixels > 0);
  const metadata = await sharp(output.file).metadata();
  assert.deepEqual([metadata.width, metadata.height], [960, 540]);
}

console.log("A1 ED-01 SAM 2 video mask canary PASS");
