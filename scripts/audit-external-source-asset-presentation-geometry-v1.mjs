#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "work/external-source-asset-presentation-geometry-v1");
const render = JSON.parse(fs.readFileSync(path.join(outputRoot, "render-result.json"), "utf8"));
const failures = [];
const expectedRatios = {"1:1": 1, "4:5": 4 / 5, "3:4": 3 / 4, "4:3": 4 / 3, "3:2": 3 / 2, "16:9": 16 / 9};
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (render.fixtureCount !== 6 || render.fixtures?.length !== 6) failures.push("SIX_FIXTURES_REQUIRED");
if (new Set(render.genres || []).size < 3) failures.push("THREE_GENRES_REQUIRED");
const ratios = new Set();
for (const fixture of render.fixtures || []) {
  if (fixture.variants?.length !== 3 || new Set(fixture.reviewRatios || []).size !== 3) failures.push(`THREE_DISTINCT_RATIOS_REQUIRED:${fixture.id}`);
  if (fixture.primaryRatio === "1:1" && fixture.presentationFamily !== "OBJECT_CARD") failures.push(`PRIMARY_RATIO_UNNECESSARILY_SQUARE:${fixture.id}`);
  for (const variant of fixture.variants || []) {
    ratios.add(variant.ratio);
    const expected = expectedRatios[variant.ratio];
    const actual = variant.artifact.width / Math.max(1, variant.artifact.height);
    if (!expected || Math.abs(actual - expected) > .004) failures.push(`EXACT_RATIO_FAILED:${fixture.id}:${variant.ratio}:${actual}`);
    if (!fs.existsSync(path.join(root, variant.artifact.path)) || shaFile(path.join(root, variant.artifact.path)) !== variant.artifact.sha256) failures.push(`ARTIFACT_SHA_FAILED:${fixture.id}:${variant.ratio}`);
  }
  if (["EVIDENCE_RECT", "PHOTO_CARD"].includes(fixture.presentationFamily)) {
    if (fixture.cropMode !== "SOURCE_PRESERVE_GRADIENT_PAD") failures.push(`SOURCE_PRESERVE_MODE_REQUIRED:${fixture.id}`);
    if (fixture.variants.some((variant) => variant.cropWindow !== null || !variant.gradient)) failures.push(`SOURCE_PRESERVE_GEOMETRY_FAILED:${fixture.id}`);
  }
  if (fixture.presentationFamily === "EDITORIAL_CROP") {
    if (fixture.variants.some((variant) => !variant.cropWindow)) failures.push(`SMARTCROP_WINDOW_REQUIRED:${fixture.id}`);
  }
  if (fixture.presentationFamily === "CUTOUT_ASSET") {
    if (fixture.variants.some((variant) => variant.artifact.alphaMin !== 0 || variant.artifact.alphaMax !== 255)) failures.push(`CUTOUT_ALPHA_FAILED:${fixture.id}`);
    if (fixture.variants.some((variant) => Number(variant.subjectCoverage || 0) < .78)) failures.push(`CUTOUT_VISUAL_SCALE_FAILED:${fixture.id}`);
  }
  if (fixture.fullFrameBackground !== false || fixture.visibleCopy !== false || fixture.productionAdmission !== false) failures.push(`ASSET_BOUNDARY_FAILED:${fixture.id}`);
}
if (ratios.size < 5) failures.push(`RATIO_DIVERSITY_BELOW_5:${ratios.size}`);
for (const artifact of Object.values(render.visibleArtifacts || {})) {
  const file = path.join(root, artifact.path || "");
  if (!fs.existsSync(file) || shaFile(file) !== artifact.sha256) failures.push(`VISIBLE_ARTIFACT_FAILED:${artifact.path || "missing"}`);
  else {
    const metadata = await sharp(file).metadata();
    if (Number(metadata.width || 0) !== artifact.width || Number(metadata.height || 0) !== artifact.height) failures.push(`VISIBLE_ARTIFACT_DIMENSIONS_FAILED:${artifact.path}`);
  }
}
if (render.boundary?.authorityUnchanged !== true || render.boundary?.storyboardMutationPerformed !== false || render.boundary?.productionAdmission !== false) failures.push("FORMAL_AUTHORITY_BOUNDARY_FAILED");

const result = {
  contract: "A1AssetPresentationGeometryQualification/v1",
  status: failures.length ? "FAIL" : "PASS",
  fixtures: render.fixtures,
  coverage: {
    fixtureCount: render.fixtureCount,
    genres: render.genres,
    distinctRatios: [...ratios],
    distinctRatioCount: ratios.size,
    presentationFamilies: [...new Set(render.fixtures.map((fixture) => fixture.presentationFamily))],
    threeRatiosPerFixture: render.fixtures.every((fixture) => fixture.variants.length === 3),
    nonSquarePrimaryCount: render.fixtures.filter((fixture) => fixture.primaryRatio !== "1:1").length,
    gradientPadFixtureCount: render.fixtures.filter((fixture) => fixture.cropMode === "SOURCE_PRESERVE_GRADIENT_PAD").length,
    smartcropFixtureCount: render.fixtures.filter((fixture) => fixture.cropMode === "SUBJECT_SAFE_COVER").length,
    transparentCutoutFixtureCount: render.fixtures.filter((fixture) => fixture.cropMode === "CONTAIN_TRANSPARENT").length,
  },
  visibleArtifacts: render.visibleArtifacts,
  boundary: render.boundary,
  failures,
};
fs.writeFileSync(path.join(outputRoot, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({status: result.status, coverage: result.coverage, visibleArtifacts: result.visibleArtifacts, boundary: result.boundary, failures}, null, 2));
if (failures.length) process.exitCode = 1;
