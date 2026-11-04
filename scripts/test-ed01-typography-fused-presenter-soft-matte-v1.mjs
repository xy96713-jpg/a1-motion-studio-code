#!/usr/bin/env node
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const outputDir = path.join(root, "work/test-fixtures/ed01-fused-presenter-soft-matte-v1");
fs.rmSync(outputDir, {recursive: true, force: true});
const generated = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const maskRoot = path.join(generated, "presenter-depth-title-canary-v1/assets/ED-01");
const componentMaskRoot = path.join(root, "work/ed01-layered-matte-stack-v1/components");
const result = spawnSync(path.join(root, ".codex-artifacts/runtime/typography-vision-venv/bin/python"), [
  path.join(root, "scripts/a1_typography_fuse_presenter_soft_matte.py"),
  "--source", path.join(generated, "imported-film-media-v1/presenter-shot-frames/ED-01.jpg"),
  "--face-mask", path.join(maskRoot, "ed-01-face-mask.png"),
  "--hair-mask", path.join(maskRoot, "ed-01-hair-mask.png"),
  "--body-mask", path.join(maskRoot, "ed-01-body-mask.png"),
  "--microphone-mask", path.join(componentMaskRoot, "ed-01-microphone-mask.png"),
  "--boom-mask", path.join(componentMaskRoot, "ed-01-boom-mask.png"),
  "--birefnet-mask", path.join(root, "work/ed01-layered-matte-stack-v1/birefnet/ed-01-presenter-mask.png"),
  "--sam2-mask", path.join(root, "work/ed01-layered-matte-stack-v1/sam2/masks/00000.png"),
  "--mediapipe-mask", path.join(root, "work/ed01-layered-matte-stack-v1/mediapipe/pose-segmentation-mask.png"),
  "--output-dir", outputDir,
  "--shot-id", "ED-01",
], {encoding: "utf8"});
assert.equal(result.status, 0, result.stderr || result.stdout);
const report = JSON.parse(fs.readFileSync(path.join(outputDir, "report.json"), "utf8"));
assert.equal(report.contract, "A1TypographyFusedPresenterSoftMatte/v1");
assert.equal(report.status, "PASS");
assert.equal(report.shotId, "ED-01");
assert.equal(report.inputs.sam2.disposition, "CONSUMED_IDENTITY_GATE");
assert.equal(report.inputs.mediapipe.disposition, "CONSUMED_POSE_GATE");
assert.equal(report.inputs.birefnet.disposition, "CONSUMED_SOFT_BOUNDARY_ONLY");
assert.ok(report.metrics.modelContributionPixels > 1000);
assert.ok(report.metrics.intermediateAlphaPixels > 10000);
assert.ok(report.metrics.semanticCoreRetentionRatio >= 0.9999);
assert.ok(report.metrics.microphoneHighAlphaOverlapRatio < 0.01);
assert.ok(report.metrics.boomHighAlphaOverlapRatio < 0.01);
assert.ok(report.metrics.removedDisconnectedPixels > 0);
assert.equal(report.refinement.sourceGuided, true);
assert.equal(report.reviewOnly, true);
assert.equal(report.productionAdmission, false);
for (const file of [report.outputs.mask.file, report.outputs.cutout.file, report.outputs.contactSheet.file]) assert.ok(fs.existsSync(file), file);
const maskMetadata = await sharp(report.outputs.mask.file).metadata();
assert.deepEqual([maskMetadata.width, maskMetadata.height], [1920, 1080]);
assert.equal(maskMetadata.channels, 1);
console.log("A1 ED-01 fused presenter soft matte PASS");
