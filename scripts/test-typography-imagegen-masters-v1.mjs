#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "apps/studio-next/public/generated/system-line/typography-imagegen-masters-v1");
const manifestPath = path.join(dir, "manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error("typography-imagegen-master-manifest-missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8"));
const failures = [];
if (manifest.contract !== "A1TypographyImagegenMasterSet/v1") failures.push("contract");
if (manifest.status !== "READY_FOR_GLYPH_CANDIDATE_INTAKE") failures.push("status");
if (!Array.isArray(manifest.masters) || manifest.masters.length !== 2) failures.push("master-count");
if (manifest.rendererContract?.route !== "generated-glyph") failures.push("route");
if (manifest.rendererContract?.editableShadowLayer !== "required") failures.push("editable-shadow");
if (manifest.rendererContract?.cssDrawnDecorationAllowed !== false || manifest.rendererContract?.svgDrawnDecorationAllowed !== false) failures.push("drawn-decoration-policy");
for (const master of manifest.masters || []) {
  const file = path.join(dir, path.basename(master.assetUri));
  if (!fs.existsSync(file)) failures.push(`${master.id}:file`);
  const metadata = fs.existsSync(file) ? await sharp(file).metadata() : {};
  if (!metadata.width || !metadata.height) failures.push(`${master.id}:dimensions`);
  if (master.textVerification?.status !== "operator-inspected") failures.push(`${master.id}:text-verification`);
}
const binding = workspace.production?.typographyImagegenMasterBinding;
if (binding?.contract !== "A1TypographyImagegenMasterBinding/v1") failures.push("workspace-binding-contract");
if (binding?.rasterReferenceFinal !== false) failures.push("workspace-raster-reference-final");
for (const item of binding?.bindings || []) {
  const asset = workspace.library?.assets?.find((entry) => entry.id === item.assetId);
  const candidate = asset?.typographySpec?.generatedCandidates?.find((entry) => (entry.candidateId || entry.id) === item.candidateId);
  const job = workspace.production?.generation?.jobs?.find((entry) => entry.candidateId === item.candidateId);
  if (!asset) failures.push(`${item.candidateId}:asset`);
  if (!candidate) failures.push(`${item.candidateId}:candidate`);
  if (!candidate?.referenceOnly || candidate?.rasterReferenceFinal !== false || candidate?.editableTextShadowRequired !== true) {
    failures.push(`${item.candidateId}:reference-policy`);
  }
  if (candidate?.textVerification?.status !== "verified") failures.push(`${item.candidateId}:text-verification`);
  if (job?.contract !== "A1AssetGenerationJob/v2" || job?.status !== "complete") failures.push(`${item.candidateId}:generation-job`);
  if (job?.output?.sha256) {
    const outputPath = path.join(root, "apps/studio-next/public", job.output.publicUrl.replace(/^\//, ""));
    if (!fs.existsSync(outputPath)) failures.push(`${item.candidateId}:output-file`);
    else if (crypto.createHash("sha256").update(fs.readFileSync(outputPath)).digest("hex") !== job.output.sha256) failures.push(`${item.candidateId}:output-sha`);
  }
}
const eventsPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/events.json");
const events = fs.existsSync(eventsPath) ? JSON.parse(fs.readFileSync(eventsPath, "utf8")) : {};
if (!(events.events || []).some((event) => event.action === "typography-imagegen-masters-imported")) failures.push("import-event");
const contactSheet = path.join(dir, path.basename(manifest.contactSheet?.assetUri || ""));
if (!fs.existsSync(contactSheet)) failures.push("contact-sheet-file");
if (failures.length) throw new Error(`typography-imagegen-master-test-failed:${failures.join(",")}`);
console.log(JSON.stringify({status: "PASS", contract: manifest.contract, masterCount: manifest.masters.length, contactSheet: manifest.contactSheet.assetUri}, null, 2));
