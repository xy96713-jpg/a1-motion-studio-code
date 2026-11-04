#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {buildEd01IntelligentTypographyCanary} from "./lib/a1-typography-canary-renderer-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const generated = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const maskRoot = path.join(generated, "presenter-depth-title-canary-v1/assets/ED-01");
const outputDir = path.join(root, "work/test-fixtures/ed01-intelligent-typography-canary-v1");
fs.rmSync(outputDir, {recursive: true, force: true});

const result = await buildEd01IntelligentTypographyCanary({
  outputDir,
  sourceFile: path.join(generated, "imported-film-media-v1/presenter-shot-frames/ED-01.jpg"),
  fontFile: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf"),
  maskFiles: {
    unified: path.join(maskRoot, "ed-01-unified-exclusion-mask.png"),
    face: path.join(maskRoot, "ed-01-face-mask.png"),
    hair: path.join(maskRoot, "ed-01-hair-mask.png"),
    eyes: path.join(maskRoot, "ed-01-eyes-mask.png"),
    mouth: path.join(maskRoot, "ed-01-mouth-mask.png"),
    microphone: path.join(maskRoot, "ed-01-microphone-mask.png"),
    body: path.join(maskRoot, "ed-01-body-mask.png"),
  },
  exactCopy: "智能写作工具台",
  semanticRuns: ["智能写作", "工具台"],
  geometry: {
    subjectBounds: {left: 634, top: 390, right: 1399, bottom: 1067},
    faceBounds: {left: 964, top: 409, right: 1283, bottom: 627},
  },
});

assert.equal(result.report.contract, "A1Ed01IntelligentTypographyCanary/v1");
assert.equal(result.report.status, "READY_FOR_USER_STRUCTURE_REVIEW");
assert.equal(result.report.productionAdmission, false);
assert.equal(result.report.rasterEngine, "resvg-js");
assert.equal(result.report.userVisualApproval, "NOT_APPROVED");
assert.equal(result.report.candidates.length, 12);
assert.equal(new Set(result.report.candidates.map((item) => item.output.sha256)).size, 12);
for (const topology of ["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"]) {
  const group = result.report.candidates.filter((item) => item.topology === topology);
  assert.equal(group.length, 4);
  assert.ok(group.some((item) => item.pixelAudit.status === "PASS"), `${topology} needs a hard-gate survivor`);
}
for (const candidate of result.report.candidates) {
  assert.equal(candidate.exactCopy, "智能写作工具台");
  assert.equal(candidate.runs.length, 2);
  assert.equal(candidate.cjkRoleAudit.contract, "A1CjkRoleLayoutAudit/v1");
  assert.equal(candidate.cjkRoleAudit.standardsScope, "DISPLAY_GLYPH_ONLY");
  assert.equal(candidate.pixelBalanceAudit.contract, "A1TypographyPixelBalanceAudit/v1");
  assert.equal(candidate.pixelBalanceAudit.status, "MEASURED_REVIEW_REQUIRED");
  assert.equal("overallAestheticScore" in candidate.pixelBalanceAudit, false);
  assert.equal(candidate.pixelAudit.sourceProtection.changedPixels, 0);
  assert.equal(candidate.pixelAudit.sourceProtection.maskRole, "protectedPresenter");
  const metadata = await sharp(candidate.output.file).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
}
assert.ok(result.report.candidates.some((candidate) => candidate.pixelAudit.equipmentCoverage.microphone.titleOverlapPixels > 0 && candidate.pixelAudit.equipmentCoverage.microphone.changedPixels > 0));
const boardMetadata = await sharp(result.report.board.file).metadata();
assert.equal(boardMetadata.width, 1920);
assert.equal(boardMetadata.height, 960);
assert.equal(fs.existsSync(result.reportFile), true);

console.log("A1 ED-01 intelligent typography canary integration PASS");
