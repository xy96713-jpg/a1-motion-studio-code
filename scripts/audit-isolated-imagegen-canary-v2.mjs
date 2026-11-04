#!/usr/bin/env node

import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import {assertGenerationJobV2, assertGenerationResultV2, auditViewportSafety, deriveNonDestructiveViewport, sha256} from "../apps/studio-next/src/lib/a1-isolated-imagegen-generation-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const arg = (name) => args.find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || null;
const jobPath = path.resolve(root, arg("--job") || "");
const resultPath = path.resolve(root, arg("--result") || "");
if (!fs.existsSync(jobPath) || !fs.existsSync(resultPath)) throw new Error("isolated-imagegen-audit-job-and-result-required");
const job = assertGenerationJobV2(JSON.parse(fs.readFileSync(jobPath, "utf8")));
const result = assertGenerationResultV2(JSON.parse(fs.readFileSync(resultPath, "utf8")));
if (result.jobId !== job.jobId || result.generationKey !== job.generationKey) throw new Error("isolated-imagegen-audit-binding-mismatch");

const ocrSource = path.join(root, "scripts/run-local-vision-ocr-v1.swift");
const ocrBinary = path.join(root, ".codex-artifacts/system-progress-system-line/a1-vision-ocr-v1");
if (!fs.existsSync(ocrBinary) || fs.statSync(ocrBinary).mtimeMs < fs.statSync(ocrSource).mtimeMs) {
  fs.mkdirSync(path.dirname(ocrBinary), {recursive: true});
  execFileSync("swiftc", [ocrSource, "-o", ocrBinary], {encoding: "utf8", maxBuffer: 2_000_000});
}
let ocr;
try {
  ocr = JSON.parse(execFileSync(ocrBinary, [result.outputPath], {encoding: "utf8", maxBuffer: 2_000_000}).trim().split("\n").at(-1));
} catch (error) {
  ocr = {status: "FAILED", text: "", segmentDetails: [], error: error instanceof Error ? error.message : String(error)};
}
const textBoxes = (ocr.segmentDetails || []).map((item) => ({
  text: item.text,
  confidence: item.confidence ?? null,
  x: Number(item.boundingBox?.x || 0) * result.pixelWidth,
  y: (1 - Number(item.boundingBox?.y || 0) - Number(item.boundingBox?.height || 0)) * result.pixelHeight,
  width: Number(item.boundingBox?.width || 0) * result.pixelWidth,
  height: Number(item.boundingBox?.height || 0) * result.pixelHeight,
}));
const viewport = deriveNonDestructiveViewport({pixelWidth: result.pixelWidth, pixelHeight: result.pixelHeight, requiredViewport: job.requiredViewport});
viewport.typographySafeInset = job.requiredViewport.typographySafeInset;
viewport.semanticSafeInset = job.requiredViewport.semanticSafeInset;
const viewportAudit = auditViewportSafety({viewport, textBoxes, expectedText: job.exactText, ocrText: ocr.text, ocrSegments: ocr.segmentDetails || []});
const sampled = await sharp(result.outputPath).removeAlpha().resize(320, 180, {fit: "fill"}).raw().toBuffer({resolveWithObject: true});
let warm = 0;
let saturated = 0;
for (let index = 0; index < sampled.data.length; index += 3) {
  const red = sampled.data[index];
  const green = sampled.data[index + 1];
  const blue = sampled.data[index + 2];
  if (red > 145 && green > 110 && red - blue > 35 && green - blue > 20) warm += 1;
  if (Math.max(red, green, blue) - Math.min(red, green, blue) > 100) saturated += 1;
}
const pixels = sampled.info.width * sampled.info.height;
const deterministicFailures = [...new Set([...(result.rejectionCodes || []), ...(viewport.rejectionCodes || []), ...(viewportAudit.failures || []), warm / pixels >= 0.3 ? "WARM_CREAM_SEPIA_FIELD" : null, saturated / pixels >= 0.2 ? "SATURATED_FIELD_EXCESS" : null].filter(Boolean))];
const audit = {
  contract: "A1IsolatedImagegenCanaryDeterministicAudit/v2",
  status: deterministicFailures.length ? "FAIL" : "PASS",
  jobId: job.jobId,
  artifactSha: result.artifactSha,
  promptHash: result.promptHash,
  sourceCanvas: {pixelWidth: result.pixelWidth, pixelHeight: result.pixelHeight},
  viewport,
  viewportAudit,
  ocr: {status: ocr.status || "UNKNOWN", text: ocr.text || "", segmentDetails: ocr.segmentDetails || [], textBoxes, evidence: viewportAudit.ocrEvidence},
  pixelMetrics: {warmFraction: Number((warm / pixels).toFixed(4)), saturatedFraction: Number((saturated / pixels).toFixed(4))},
  failures: deterministicFailures,
  requiresVisualAssessment: true,
  createdAt: new Date().toISOString(),
};
audit.auditSha256 = sha256({...audit, auditSha256: undefined});
const output = path.join(path.dirname(resultPath), "deterministic-audit.json");
const bytes = `${JSON.stringify(audit, null, 2)}\n`;
const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
fs.writeFileSync(temporary, bytes, "utf8");
fs.renameSync(temporary, output);
console.log(JSON.stringify({status: audit.status, auditPath: output, audit}, null, 2));
