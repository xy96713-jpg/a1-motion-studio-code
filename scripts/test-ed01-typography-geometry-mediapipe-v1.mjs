#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const python = path.join(root, ".codex-artifacts/runtime/typography-vision-venv/bin/python");
const script = path.join(root, "scripts/a1_typography_geometry_mediapipe.py");
const source = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-shot-frames/ED-01.jpg");
const outputDir = path.join(root, "work/test-fixtures/ed01-typography-geometry-v1");
fs.rmSync(outputDir, {recursive: true, force: true});
const execution = spawnSync(python, [script, "--input", source, "--output-dir", outputDir, "--shot-id", "ED-01"], {cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
assert.equal(execution.status, 0, String(execution.error || execution.stderr || execution.stdout || `status:${execution.status}`));
const reportFile = path.join(outputDir, "report.json");
assert.ok(fs.existsSync(reportFile));
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
assert.equal(report.contract, "A1TypographyGeometryAnalysis/v1");
assert.equal(report.status, "PASS");
assert.equal(report.shotId, "ED-01");
assert.equal(report.pose.landmarks.length, 33);
for (const role of ["LEFT_SHOULDER", "RIGHT_SHOULDER"]) {
  const landmark = report.pose.landmarks.find((item) => item.role === role);
  assert.ok(landmark);
  assert.ok(landmark.visibility > 0.5);
}
assert.ok(report.faceBounds.width > 0 && report.faceBounds.height > 0);
assert.ok(report.poseBounds.width > 0 && report.poseBounds.height > 0);
assert.ok(Number.isInteger(report.handsDetected));
assert.ok(fs.existsSync(report.segmentationMask.file));
assert.equal(report.segmentationMask.width, 1920);
assert.equal(report.segmentationMask.height, 1080);
assert.equal(report.productionAdmission, false);

console.log("A1 ED-01 MediaPipe typography geometry analyzer PASS");
