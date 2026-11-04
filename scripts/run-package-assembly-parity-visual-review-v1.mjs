#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {assertPackageAssemblyParityServerAssessment} from "../apps/studio-next/src/lib/a1-package-look-master-assessment-contract-v1.mjs";
import {readPackageVisualReviewProcessInput} from "../apps/studio-next/src/lib/a1-package-visual-review-process-contract-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(projectRoot, "apps/studio-next");
const publicRoot = path.join(appRoot, "public");
const cacheRoot = path.join(projectRoot, ".codex-artifacts", "system-progress-system-line", "package-assembly-parity-review-cache-v1");

function resolvePublicFile(publicUrl, code) {
  if (!String(publicUrl || "").startsWith("/generated/system-line/")) throw new Error(`${code}-public-url-invalid`);
  const file = path.resolve(publicRoot, String(publicUrl).replace(/^\//u, ""));
  const relative = path.relative(publicRoot, file);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${code}-public-url-escape`);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`${code}-file-missing`);
  const realRoot = fs.realpathSync(publicRoot);
  const realFile = fs.realpathSync(file);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error(`${code}-realpath-escape`);
  return realFile;
}

const input = await readPackageVisualReviewProcessInput(process.stdin);
const plan = input.plan;
const recipe = input.recipe;
const preliminaryAudit = input.preliminaryAudit;
const masterImage = resolvePublicFile(plan.selectedLookMasterBinding.artifactPublicUrl, "package-assembly-parity-master");
const assemblyImage = resolvePublicFile(preliminaryAudit.assemblyPreview.publicUrl, "package-assembly-parity-assembly");
const fileSha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (fileSha256(masterImage) !== plan.selectedLookMasterBinding.artifactSha256) throw new Error("package-assembly-parity-master-sha-invalid");
if (fileSha256(assemblyImage) !== preliminaryAudit.assemblyPreview.sha256) throw new Error("package-assembly-parity-assembly-sha-invalid");
// Load Sharp and the reviewer subprocess machinery only after the cheap
// contract, size, owned-file and content-hash checks pass. Invalid requests
// stay fast and cannot create reviewer cache state.
process.env.A1_PACKAGE_VISUAL_REVIEW_PARENT_PROCESS_GROUP = "1";
const {runPackageAssemblyParityVisualReview} = await import("../apps/studio-next/src/lib/a1-package-look-master-reviewer-v1.mjs");

const assessment = await runPackageAssemblyParityVisualReview({
  plan,
  recipe,
  preliminaryAudit,
  masterImage,
  assemblyImage,
  cacheDir: cacheRoot,
  now: input.now || new Date().toISOString(),
});
console.log(JSON.stringify(assertPackageAssemblyParityServerAssessment(assessment)));
