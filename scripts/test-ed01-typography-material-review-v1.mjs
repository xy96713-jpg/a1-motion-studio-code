#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {buildEd01IntelligentTypographyCanary} from "./lib/a1-typography-canary-renderer-v1.mjs";
import {buildEd01TypographyMaterialReview} from "./lib/a1-typography-material-renderer-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const generated = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const maskRoot = path.join(generated, "presenter-depth-title-canary-v1/assets/ED-01");
const structureOutputDir = path.join(root, "work/test-fixtures/ed01-intelligent-typography-canary-v1");
const outputDir = path.join(root, "work/test-fixtures/ed01-typography-material-review-v1");
const sourceFile = path.join(generated, "imported-film-media-v1/presenter-shot-frames/ED-01.jpg");
const maskFiles = {
  unified: path.join(maskRoot, "ed-01-unified-exclusion-mask.png"),
  face: path.join(maskRoot, "ed-01-face-mask.png"),
  hair: path.join(maskRoot, "ed-01-hair-mask.png"),
  eyes: path.join(maskRoot, "ed-01-eyes-mask.png"),
  mouth: path.join(maskRoot, "ed-01-mouth-mask.png"),
  microphone: path.join(maskRoot, "ed-01-microphone-mask.png"),
  body: path.join(maskRoot, "ed-01-body-mask.png"),
};
const geometry = {
  subjectBounds: {left: 634, top: 390, right: 1399, bottom: 1067},
  faceBounds: {left: 964, top: 409, right: 1283, bottom: 627},
};
const structure = await buildEd01IntelligentTypographyCanary({
  outputDir: structureOutputDir,
  sourceFile,
  fontFile: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf"),
  maskFiles,
  exactCopy: "智能写作工具台",
  semanticRuns: ["智能写作", "工具台"],
  geometry,
});
fs.rmSync(outputDir, {recursive: true, force: true});
const result = await buildEd01TypographyMaterialReview({
  outputDir,
  sourceFile,
  maskFiles,
  geometry,
  structureReport: structure.report,
  fontCatalog: {
    SOURCE_HAN_SERIF_HEAVY: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSerifCN-Heavy.otf"),
    SOURCE_HAN_SANS_HEAVY: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SourceHanSansCN-Heavy.otf"),
    SMILEY_SANS_OBLIQUE: path.join(root, "apps/studio-next/public/a1-editorial-fonts/SmileySans-Oblique.otf"),
    MA_SHAN_ZHENG: path.join(root, "apps/studio-next/public/a1-editorial-fonts/MaShanZheng-Regular.ttf"),
  },
});

assert.equal(result.report.contract, "A1Ed01TypographyMaterialReview/v1");
assert.equal(result.report.status, "READY_FOR_USER_MATERIAL_REVIEW");
assert.equal(result.report.productionAdmission, false);
assert.equal(result.report.rasterEngine, "resvg-js");
assert.equal(result.report.userVisualApproval, "NOT_APPROVED");
assert.equal(result.report.candidates.length, 18);
assert.equal(new Set(result.report.candidates.map((candidate) => candidate.output.sha256)).size, 18);
for (const topology of ["SUBJECT_CARVED_WALL", "ORBITAL_PHRASE_FIELD", "EDGE_CROP_TAKEOVER"]) {
  const group = result.report.candidates.filter((candidate) => candidate.topology === topology);
  assert.equal(group.length, 6);
  assert.ok(group.filter((candidate) => candidate.pixelAudit.status === "PASS").length >= 4, `${topology} needs four material survivors`);
}
for (const candidate of result.report.candidates) {
  assert.equal(candidate.exactCopy, "智能写作工具台");
  assert.deepEqual(candidate.visibleCopy, ["智能写作", "工具台"]);
  assert.equal(candidate.cjkRoleAudit.contract, "A1CjkRoleLayoutAudit/v1");
  assert.equal(candidate.cjkRoleAudit.standardsScope, "DISPLAY_GLYPH_ONLY");
  assert.equal(candidate.pixelBalanceAudit.contract, "A1TypographyPixelBalanceAudit/v1");
  assert.equal(candidate.pixelBalanceAudit.status, "MEASURED_REVIEW_REQUIRED");
  assert.equal("overallAestheticScore" in candidate.pixelBalanceAudit, false);
  assert.equal(candidate.pixelAudit.sourceProtection.changedPixels, 0);
  assert.equal(candidate.pixelAudit.sourceProtection.maskRole, "protectedPresenter");
  assert.equal(candidate.productionAdmission, false);
  if (candidate.pixelAudit.status === "PASS") assert.ok(candidate.pixelAudit.glyphVisibility.every((glyph) => glyph.canvasCoverageRatio >= 0.99));
  const metadata = await sharp(candidate.output.file).metadata();
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.height, 1080);
}
assert.ok(result.report.candidates.some((candidate) => candidate.pixelAudit.equipmentCoverage.microphone.titleOverlapPixels > 0 && candidate.pixelAudit.equipmentCoverage.microphone.changedPixels > 0));
const boardMetadata = await sharp(result.report.board.file).metadata();
assert.equal(boardMetadata.width, 1920);
assert.equal(boardMetadata.height, 960);
assert.ok(fs.existsSync(result.reportFile));

console.log("A1 ED-01 typography material review integration PASS");
