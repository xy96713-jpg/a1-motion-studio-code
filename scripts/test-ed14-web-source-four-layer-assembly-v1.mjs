#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const publicRoot = path.join(root, "apps/studio-next/public");
const manifest = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/web-source-packaging-pilot-v1/manifest.json"), "utf8"));
const assembly = manifest.fourLayerAssembly;
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const localPath = (publicUrl) => path.join(publicRoot, publicUrl.replace(/^\//u, ""));

assert.equal(assembly?.contract, "A1WebSourceFourLayerAssembly/v1");
assert.equal(assembly.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(assembly.currentStateTruth, "ACTUAL_FOUR_LAYER_ASSEMBLY_READY_FOR_USER_REVIEW");
assert.equal(assembly.authorityMutation, "NONE_ED14_STANDALONE_PILOT");
assert.equal(assembly.motionRun, false);
assert.equal(assembly.criticRun, false);
assert.equal(assembly.sourceBinding.generatedSourcePixelsAuthoritative, false);
assert.equal(assembly.sourceBinding.exactSourceRebound, true);
assert.equal(assembly.sourceBinding.exactSourceSha256, manifest.sources.find((item) => item.id === assembly.sourceBinding.sourceId).titleCropSha256);
assert.deepEqual(assembly.layers.map((layer) => layer.kind), ["BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION"]);
assert.deepEqual(assembly.layers.map((layer) => layer.route), ["GENERATE", "REUSE", "GENERATE", "SOURCE"]);
assert.equal(new Set(assembly.layers.map((layer) => layer.sha256)).size, 4);

for (const item of [...assembly.layers, assembly.assembly, assembly.comparisonProof]) {
  const file = localPath(item.publicUrl);
  assert.ok(fs.existsSync(file), `artifact missing: ${item.publicUrl}`);
  assert.equal(sha256(file), item.sha256, `artifact hash mismatch: ${item.publicUrl}`);
}
for (const layer of assembly.layers.filter((item) => item.alphaVerified)) {
  const image = sharp(localPath(layer.publicUrl));
  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
  assert.equal(metadata.hasAlpha, true, `${layer.kind} must retain alpha`);
  assert.equal(stats.channels[3].min, 0, `${layer.kind} must contain transparent pixels`);
  assert.equal(stats.channels[3].max, 255, `${layer.kind} must contain opaque pixels`);
}
const typographySpec = JSON.parse(fs.readFileSync(localPath(assembly.typographyShadow.publicUrl), "utf8"));
assert.deepEqual(typographySpec.exactText, {mechanism: "常见 / 稳妥 / 可复用", verdict: "表达越来越像"});
assert.equal(typographySpec.systemFallbackForbidden, true);
assert.equal(typographySpec.localTypographyIsExactReconstructionShadow, true);
assert.equal(typographySpec.visibleTypographySource, "SELECTED_IMAGEGEN_MASTER_PIXELS");
assert.equal(typographySpec.geometryAuthority, "SELECTED_LOOK_MASTER_EXACT_COORDINATES");
assert.ok(typographySpec.fonts.every((font) => /^[a-f0-9]{64}$/u.test(font.sha256)));
assert.equal(assembly.geometryAuthority.localFreehandReflowForbidden, true);
assert.equal(assembly.geometryAuthority.visibleTypographyExtractedFromMaster, true);
assert.equal(assembly.sourceBinding.presentationMode, "VERIFIED_SOURCE_HEADER_PLUS_EXACT_LOCAL_TITLE_AND_AUTHOR");

console.log(JSON.stringify({
  status: "PASS",
  contract: assembly.contract,
  state: assembly.status,
  layerRoutes: Object.fromEntries(assembly.layers.map((layer) => [layer.kind, layer.route])),
  exactSourceRebound: true,
  exactTypography: typographySpec.exactText,
  assemblySha256: assembly.assembly.sha256,
  motionRun: assembly.motionRun,
  authorityMutation: assembly.authorityMutation,
}, null, 2));
