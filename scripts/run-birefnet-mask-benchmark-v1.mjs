#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";

const root = process.cwd();
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1");
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line/birefnet-mask-benchmark-v1");
const worker = path.join(root, "scripts/a1_birefnet_cutout.py");
const projectPython = path.join(root, ".codex-artifacts/runtime/birefnet-venv/bin/python");
const categories = ["portrait-hair", "multi-person", "device-product", "paper-document", "transparent-reflective", "mixed-hard-edge"];

function parseArgs(argv) {
  const value = {manifest: path.join(artifactDir, "fixtures.json"), variant: "both", allowDownload: false, inputSize: 2048};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--manifest") value.manifest = argv[++index];
    else if (token === "--variant") value.variant = argv[++index];
    else if (token === "--input-size") value.inputSize = Number(argv[++index]);
    else if (token === "--allow-download") value.allowDownload = true;
    else throw new Error(`unknown-argument:${token}`);
  }
  if (!["standard", "lite", "both"].includes(value.variant)) throw new Error(`invalid-variant:${value.variant}`);
  if (!Number.isInteger(value.inputSize) || value.inputSize < 512 || value.inputSize > 4096) throw new Error(`invalid-input-size:${value.inputSize}`);
  return value;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function validateFixtureManifest(manifest) {
  const failures = [];
  if (manifest?.contract !== "A1MaskBenchmarkFixtureManifest/v1") failures.push("invalid-contract");
  if (manifest?.sampleCount !== 30 || !Array.isArray(manifest?.samples) || manifest.samples.length !== 30) failures.push("exactly-30-samples-required");
  const ids = new Set();
  for (const [index, sample] of (manifest?.samples || []).entries()) {
    if (!sample?.id || ids.has(sample.id)) failures.push(`invalid-or-duplicate-id:${sample?.id || index}`);
    ids.add(sample?.id);
    if (!categories.includes(sample?.category)) failures.push(`invalid-category:${sample?.id || index}`);
    const sourcePath = path.resolve(root, sample?.sourcePath || "");
    if (!fs.existsSync(sourcePath)) failures.push(`source-missing:${sample?.id || index}:${sourcePath}`);
    else if (sha256File(sourcePath) !== sample.sourceSha256) failures.push(`source-hash-mismatch:${sample?.id || index}`);
    if (!sample?.rightsNote) failures.push(`rights-note-required:${sample?.id || index}`);
    for (const variant of ["standard", "lite"]) {
      if (!["pending", "pass", "revise"].includes(sample?.[variant]?.edgeReviewStatus)) failures.push(`invalid-edge-review:${sample?.id || index}:${variant}`);
    }
  }
  for (const category of categories) {
    const count = (manifest?.samples || []).filter((sample) => sample.category === category).length;
    if (count < 5) failures.push(`category-needs-five:${category}:${count}`);
  }
  if (failures.length) throw new Error(`invalid-mask-fixtures:\n${failures.join("\n")}`);
}

function reusableReport(reportPath, sourceSha256, variant) {
  if (!fs.existsSync(reportPath)) return null;
  try {
    const report = readJson(reportPath);
    const valid = report.contract === "A1MaskAsset/v1"
      && report.source?.sha256 === sourceSha256
      && report.engine?.variant === variant
      && ["GENERATED_PENDING_REVIEW", "APPROVED"].includes(report.status)
      && Object.values(report.outputs || {}).every((output) => typeof output === "string" && fs.existsSync(output));
    return valid ? report : null;
  } catch {
    return null;
  }
}

function percentile95(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)];
}

function aggregate(samples, variant) {
  const rows = samples.map((sample) => sample.results[variant]).filter(Boolean);
  const generated = rows.filter((row) => row.engineStatus === "GENERATED_PENDING_REVIEW" || row.engineStatus === "APPROVED");
  const reviewed = rows.filter((row) => row.edgeReviewStatus !== "pending");
  const passed = rows.filter((row) => row.edgeReviewStatus === "pass");
  return {
    edgePassFraction: Number((passed.length / 30).toFixed(4)),
    p95DurationMs: percentile95(generated.map((row) => Number(row.durationMs || 0))),
    peakMemoryMb: Math.max(0, ...generated.map((row) => Number(row.peakMemoryMb || 0))),
    loadSucceeded: generated.length === 30,
    generatedCount: generated.length,
    reviewedCount: reviewed.length,
    passCount: passed.length,
  };
}

function selectVariant(result) {
  const standardPass = result.standard.loadSucceeded
    && result.standard.reviewedCount === 30
    && result.standard.edgePassFraction >= .9
    && result.standard.p95DurationMs <= 6000
    && result.standard.peakMemoryMb <= 6144;
  if (standardPass) return "standard";
  const liteReady = result.lite.loadSucceeded && result.lite.reviewedCount === 30;
  return liteReady ? "lite" : "unavailable";
}

const args = parseArgs(process.argv.slice(2));
const manifestPath = path.resolve(root, args.manifest);
if (!fs.existsSync(manifestPath)) throw new Error(`mask-fixture-manifest-missing:${manifestPath}`);
if (!fs.existsSync(projectPython)) throw new Error(`project-birefnet-python-missing:${projectPython}`);
const fixtureManifest = readJson(manifestPath);
validateFixtureManifest(fixtureManifest);
const variants = args.variant === "both" ? ["standard", "lite"] : [args.variant];
const samples = [];

for (const sample of fixtureManifest.samples) {
  const row = {...sample, results: {}};
  for (const variant of ["standard", "lite"]) {
    if (!variants.includes(variant)) {
      row.results[variant] = {engineStatus: "NOT_RUN", edgeReviewStatus: sample[variant].edgeReviewStatus, reportPath: sample[variant].reportPath || null};
      continue;
    }
    const outputDir = path.join(artifactDir, "assets", variant, sample.id);
    const reportPath = path.join(outputDir, "report.json");
    let report = reusableReport(reportPath, sample.sourceSha256, variant);
    let cacheHit = Boolean(report);
    if (!report) {
      const command = [worker, "--input", path.resolve(root, sample.sourcePath), "--output-dir", outputDir, "--id", sample.id, "--variant", variant, "--input-size", String(args.inputSize), "--require-engine"];
      if (args.allowDownload) command.push("--allow-download");
      const execution = spawnSync(projectPython, command, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        env: {...process.env, HF_HOME: process.env.HF_HOME || path.join(root, ".codex-artifacts/runtime/huggingface"), HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || "1"},
      });
      if (!fs.existsSync(reportPath)) throw new Error(`mask-worker-report-missing:${sample.id}:${variant}:${execution.stderr || execution.stdout}`);
      report = readJson(reportPath);
      if (execution.status !== 0) throw new Error(`mask-worker-failed:${sample.id}:${variant}:${report.fallbackReason || execution.status}`);
      cacheHit = false;
    }
    row.results[variant] = {
      engineStatus: report.status,
      reportPath,
      cacheHit,
      durationMs: report.metrics?.durationMs || 0,
      peakMemoryMb: report.metrics?.peakMemoryMb || 0,
      edgeReviewStatus: sample[variant].edgeReviewStatus,
    };
  }
  samples.push(row);
  writeJsonAtomic(path.join(artifactDir, "progress.json"), {contract: "A1MaskBenchmarkProgress/v1", inputSize: args.inputSize, samples});
}

const result = {
  contract: "A1MaskBenchmarkResult/v1",
  sampleCount: 30,
  inputSize: args.inputSize,
  standard: aggregate(samples, "standard"),
  lite: aggregate(samples, "lite"),
};
const selectedVariant = selectVariant(result);
// Completion is about the variant that will actually be routed into production.
// Standard is intentionally allowed to be unavailable (for example when the
// model is not cached and the network is blocked); in that case the reviewed
// Lite path is the honest fallback. We still keep the standard metrics visible
// instead of pretending that it passed.
const selectedResult = selectedVariant === "standard" ? result.standard : selectedVariant === "lite" ? result.lite : null;
const complete = Boolean(selectedResult && selectedResult.generatedCount === 30 && selectedResult.reviewedCount === 30);
const report = {
  contract: "A1MaskBenchmarkRun/v1",
  status: complete ? "COMPLETE" : "WAITING_GENERATION_OR_EDGE_REVIEW",
  fixtureManifestPath: manifestPath,
  fixtureManifestSha256: sha256File(manifestPath),
  variantsRequested: variants,
  result,
  selectedVariant,
  selectionRule: "standard requires >=90% reviewed edge pass, P95 <=6000ms, peak <=6144MB; otherwise use reviewed Lite; otherwise unavailable",
  samples,
  nextAction: complete ? `use-${selectedVariant}-for-review-only-cutouts` : "finish-generation-and-human-edge-review-for-selected-variant",
};
writeJsonAtomic(path.join(artifactDir, "report.json"), report);
writeJsonAtomic(path.join(publicDir, "report.json"), report);
console.log(JSON.stringify({status: report.status, selectedVariant, result, nextAction: report.nextAction}, null, 2));
