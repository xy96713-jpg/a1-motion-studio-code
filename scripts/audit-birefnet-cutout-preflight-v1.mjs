#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";

const root = process.cwd();
const phaseId = "birefnet-cutout-preflight-v1";
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicDir = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const source = path.join(root, "remotion-renderer/public/editorial-documentary-reset-v1/source/selection-action.png");
const worker = path.join(root, "scripts/a1_birefnet_cutout.py");
const outputDir = path.join(artifactDir, "asset");
const projectPython = path.join(root, ".codex-artifacts/runtime/birefnet-venv/bin/python");
const pythonExecutable = fs.existsSync(projectPython) ? projectPython : "python3";
const result = spawnSync(pythonExecutable, [worker, "--input", source, "--output-dir", outputDir, "--id", "editor-selection-preflight", "--variant", "lite"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  env: {...process.env, HF_HOME: process.env.HF_HOME || path.join(root, ".codex-artifacts/runtime/huggingface"), HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || "1"},
});
if (result.status !== 0) throw new Error(`birefnet-preflight-worker-failed:${result.stderr || result.stdout || result.status}`);
const workerReportPath = path.join(outputDir, "report.json");
if (!fs.existsSync(workerReportPath)) throw new Error("birefnet-preflight-report-missing");
const workerReport = JSON.parse(fs.readFileSync(workerReportPath, "utf8"));
const benchmarkReportPath = path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/report.json");
const fixtureManifestPath = path.join(root, ".codex-artifacts/system-progress-system-line/birefnet-mask-benchmark-v1/fixtures.json");
const benchmarkReport = fs.existsSync(benchmarkReportPath) ? JSON.parse(fs.readFileSync(benchmarkReportPath, "utf8")) : null;
const fixtureManifest = fs.existsSync(fixtureManifestPath) ? JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8")) : null;
const selectedVariant = benchmarkReport?.selectedVariant === "standard" ? "standard" : benchmarkReport?.selectedVariant === "lite" ? "lite" : "unavailable";
const selectedBenchmark = selectedVariant === "standard" ? benchmarkReport?.result?.standard : selectedVariant === "lite" ? benchmarkReport?.result?.lite : null;
const thirtySampleFixtureReady = fixtureManifest?.contract === "A1MaskBenchmarkFixtureManifest/v1" && fixtureManifest?.sampleCount === 30 && fixtureManifest?.samples?.length === 30;
const selectedBenchmarkComplete = benchmarkReport?.status === "COMPLETE" && selectedBenchmark?.generatedCount === 30 && selectedBenchmark?.reviewedCount === 30;
const outputs = Object.values(workerReport.outputs || {});
const generated = workerReport.status === "GENERATED_PENDING_REVIEW";
const unavailable = workerReport.status === "ENGINE_UNAVAILABLE";
const noFakeOutputs = unavailable && outputs.every((value) => value === null);
const generatedOutputsExist = generated && outputs.every((value) => typeof value === "string" && fs.existsSync(value));
const pass = workerReport.contract === "A1MaskAsset/v1"
  && workerReport.engine?.family === "BiRefNet"
  && workerReport.engine?.license === "MIT"
  && workerReport.reviewOnly === true
  && (noFakeOutputs || generatedOutputsExist);
const report = {
  contract: "A1BiRefNetCutoutPreflightAudit/v1",
  phaseId,
  status: pass ? "PASS" : "BLOCKED",
  engineStatus: workerReport.status,
  maturityBlocked: !selectedBenchmarkComplete,
  selectedVariant,
  standardBenchmarkComplete: benchmarkReport?.result?.standard?.generatedCount === 30 && benchmarkReport?.result?.standard?.reviewedCount === 30,
  liteBenchmarkComplete: benchmarkReport?.result?.lite?.generatedCount === 30 && benchmarkReport?.result?.lite?.reviewedCount === 30,
  thirtySampleFixtureReady,
  benchmarkComplete: selectedBenchmarkComplete,
  pythonExecutable,
  checks: {
    contractValid: workerReport.contract === "A1MaskAsset/v1",
    officialMitFamilySelected: workerReport.engine?.family === "BiRefNet" && workerReport.engine?.license === "MIT",
    noCommercialRmbgDefault: workerReport.engine?.modelId !== "briaai/RMBG-2.0",
    unavailableDoesNotFakeSuccess: unavailable ? noFakeOutputs : true,
    generatedOutputsRequireReview: generated ? workerReport.metrics?.edgeReviewStatus === "pending" && workerReport.status === "GENERATED_PENDING_REVIEW" : true,
  },
  workerReport,
  nextAction: unavailable ? "install-project-local-birefnet-dependencies-and-cache-official-model-before-30-sample-benchmark" : selectedBenchmarkComplete ? `use-${selectedVariant}-for-review-only-cutouts; preserve-revise-samples-as-original-crop-fallback` : "assemble-30-reviewed-stress-fixtures-and-complete-selected-variant-benchmark",
};
fs.mkdirSync(publicDir, {recursive: true});
fs.writeFileSync(path.join(artifactDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(publicDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, engineStatus: report.engineStatus, maturityBlocked: report.maturityBlocked, checks: report.checks, nextAction: report.nextAction}, null, 2));
if (!pass) process.exitCode = 1;
