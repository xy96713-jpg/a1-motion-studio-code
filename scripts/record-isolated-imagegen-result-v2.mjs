#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertGenerationJobV2, createGenerationResultV2, fileSha256, sha256} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";
import {projectDirs} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const {artifactDir} = projectDirs(appRoot);
const isolatedRoot = path.join(artifactDir, "isolated-imagegen-v2");
const args = process.argv.slice(2);
const arg = (name) => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const jobPath = path.resolve(root, arg("--job") || "");
const inputPath = path.resolve(root, arg("--input") || "");
if (!fs.existsSync(jobPath) || !fs.existsSync(inputPath)) throw new Error("isolated-imagegen-result-job-and-input-required");
const job = assertGenerationJobV2(JSON.parse(fs.readFileSync(jobPath, "utf8")));
if (job.status !== "READY") throw new Error("isolated-imagegen-result-job-not-ready");
const metadata = await sharp(inputPath).metadata();
const artifactSha = fileSha256(inputPath);
const resultDir = path.join(isolatedRoot, "results", job.jobId);
const extension = metadata.format === "jpeg" ? ".jpg" : metadata.format === "webp" ? ".webp" : ".png";
const outputPath = path.join(resultDir, `raw-${artifactSha}${extension}`);
const receiptPath = path.join(resultDir, "provider-result.json");
const existing = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, "utf8")) : null;
if (existing) {
  if (existing.artifactSha !== artifactSha || existing.generationKey !== job.generationKey) throw new Error("isolated-imagegen-result-idempotency-conflict");
  console.log(JSON.stringify({status: "CACHED", cacheHit: true, receiptPath, result: existing}, null, 2));
  process.exit(0);
}
const duplicateReceipts = fs.existsSync(path.join(isolatedRoot, "results")) ? fs.readdirSync(path.join(isolatedRoot, "results"), {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && entry.name !== job.jobId)
  .map((entry) => path.join(isolatedRoot, "results", entry.name, "provider-result.json"))
  .filter(fs.existsSync)
  .map((file) => JSON.parse(fs.readFileSync(file, "utf8")))
  .filter((item) => item.artifactSha === artifactSha) : [];
fs.mkdirSync(resultDir, {recursive: true});
fs.copyFileSync(inputPath, outputPath);
if (fileSha256(outputPath) !== artifactSha) throw new Error("isolated-imagegen-result-copy-sha-mismatch");
const rejectionCodes = duplicateReceipts.length ? ["DUPLICATE_ARTIFACT_SHA"] : [];
const result = createGenerationResultV2({jobId: job.jobId, generatorLane: job.generatorLane, outputPath, pixelWidth: metadata.width, pixelHeight: metadata.height, artifactSha, promptHash: job.promptHash, referencesHash: job.referencesHash, generationKey: job.generationKey, gateVersion: job.gateVersion, attempt: job.attempt, status: rejectionCodes.length ? "AUDIT_FAIL" : "PROVIDER_RETURNED", rejectionCodes, createdAt: new Date().toISOString()});
const bytes = `${JSON.stringify(result, null, 2)}\n`;
const temporary = `${receiptPath}.tmp-${process.pid}-${Date.now()}`;
fs.writeFileSync(temporary, bytes, "utf8");
fs.renameSync(temporary, receiptPath);
console.log(JSON.stringify({status: result.status, cacheHit: false, receiptPath, receiptSha256: sha256(bytes), result}, null, 2));
