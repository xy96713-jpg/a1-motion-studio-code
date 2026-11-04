#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appRoot = path.join(root, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const componentPath = path.join(root, "remotion-renderer/src/Ed01TypographyCalibrationV1.tsx");
const manifestPath = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/ed01-typography-calibration-v1/manifest.json");
const shaFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const failures = [];
const check = (condition, code) => { if (!condition) failures.push(code); };

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const workspace = readProjectWorkspace(appRoot);
const state = workspace.production?.shotStyleCalibrations?.["ED-01"];
const componentSource = fs.readFileSync(componentPath, "utf8");
check(manifest.contract === "A1ShotStyleCalibrationSet/v1" && manifest.shotId === "ED-01", "contract-or-shot-invalid");
check(manifest.candidates?.length === 3, "three-candidates-required");
check(manifest.exactSpokenLine === "Hi，我用 vibe coding 做了一款智能写作工作台。", "spoken-line-mismatch");
check(manifest.typography?.cjk === "A1 Fusion Pixel" && manifest.typography.generatedTextUsedInFinal === false, "editable-pixel-type-required");
check(manifest.previewPolicy?.contract === "A1ReviewPreviewPolicy/v1" && manifest.previewPolicy.typographyVisibility === "fully-visible-front-layer" && manifest.previewPolicy.clippingAllowed === false && manifest.previewPolicy.occlusionSimulationAllowed === false, "unmasked-preview-policy-required");
check(manifest.previewPolicy?.mixedCjkLatinLayout === "paired-bilingual-cluster" && manifest.bilingualPairs?.length === 2, "paired-bilingual-layout-required");
check(!componentSource.includes("ForegroundOcclusion") && !componentSource.includes("clipPath") && componentSource.includes('data-a1-preview-typography-visibility="fully-visible-front-layer"') && componentSource.includes('data-a1-preview-occlusion="forbidden"'), "preview-must-not-mask-or-clip-type");
check(manifest.reviewOnly === true && manifest.candidateAdoptionAllowed === false && manifest.finalRenderAllowed === false, "review-gates-opened");
for (const candidate of manifest.candidates || []) {
  const file = path.join(publicRoot, candidate.publicUrl.slice(1));
  check(fs.existsSync(file) && shaFile(file) === candidate.sha256, `candidate-hash-mismatch:${candidate.candidateId}`);
  if (fs.existsSync(file)) {
    const metadata = await sharp(file).metadata();
    check(metadata.width === 960 && metadata.height === 540, `candidate-dimensions-invalid:${candidate.candidateId}`);
  }
}
check(state?.manifest?.sha256 === shaFile(manifestPath), "workspace-manifest-binding-invalid");
check(state?.userApproval === "pending" && state?.selectedCandidateId === null, "user-approval-inferred");
check(workspace.production?.maturityLoop?.nextAction === "review-ed01-typography-calibration", "next-action-not-calibration-review");

console.log(JSON.stringify({contract: "A1ShotStyleCalibrationAudit/v1", status: failures.length ? "BLOCK" : "PASS", failures, candidateCount: manifest.candidates?.length || 0, nextAction: workspace.production?.maturityLoop?.nextAction}, null, 2));
if (failures.length) process.exitCode = 1;
