#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import sharp from "sharp";
import {GENERIC_CAP_EXECUTABLE_TECHNIQUES, preflightCapRequest} from "./lib/cap-request-preflight.mjs";

const root = path.resolve(import.meta.dirname, "..");
const work = path.join(root, "work/screen-recording-maturity-test-v1");
const matrixPath = path.join(work, "effect-capability-matrix.json");
const capturePath = path.join(work, "blind-test-v1/capture/blind-nasa-ocean-v2/capture-report.json");
const outputPath = path.join(work, "blind-test-v1/render/blind-nasa-ocean-v2/execution-boundary-audit-v1.json");
const capReceiptPath = path.join(work, "blind-test-v1/render/blind-nasa-ocean-v2/cap-receipt.json");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const capture = JSON.parse(fs.readFileSync(capturePath, "utf8"));
const capReceipt = fs.existsSync(capReceiptPath) ? JSON.parse(fs.readFileSync(capReceiptPath, "utf8")) : null;
if (matrix.items.length !== 56 || capture.status !== "READY_FOR_CAP_REVIEW") throw new Error("execution-boundary-input-invalid");
if (capReceipt?.status !== "PASS") throw new Error("cap-camera-only-receipt-required");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const native = new Set(GENERIC_CAP_EXECUTABLE_TECHNIQUES);
const rows = matrix.items.map((item) => ({
  technique: item.id,
  diagnosticStatus: item.status,
  genericCapPreflightAcceptsTechnique: native.has(item.id),
  productionAdmission: false,
  boundary: native.has(item.id) ? "CAP_RECIPE_STILL_REQUIRES_EVENT_AND_PIXEL_PROOF" : "REVIEW_RENDER_ONLY_OR_OTHER_ADAPTER_UNPROVEN",
}));
const scenarioPreflight = preflightCapRequest(capture);
const pixelSamples = [];
for (const seconds of [2, 6, 11, 16]) {
  const folder = path.dirname(outputPath);
  const sourceFrame = path.join(folder, `source-at${seconds}.png`);
  const capFrame = path.join(folder, `cap-at${seconds}.png`);
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", String(seconds), "-i", path.join(root, capReceipt.sourceVideo.path), "-frames:v", "1", sourceFrame]);
  execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", String(seconds), "-i", path.join(root, capReceipt.reviewVideo.path), "-frames:v", "1", capFrame]);
  const source = await sharp(sourceFrame).resize(1280, 720).removeAlpha().raw().toBuffer();
  const cap = await sharp(capFrame).removeAlpha().raw().toBuffer();
  if (source.length !== cap.length) throw new Error(`cap-pixel-sample-size:${seconds}`);
  let absoluteDifference = 0;
  for (let index = 0; index < source.length; index += 1) absoluteDifference += Math.abs(source[index] - cap[index]);
  pixelSamples.push({seconds, sourceVsCapMae: absoluteDifference / source.length, sourceFrame: path.relative(root, sourceFrame), capFrame: path.relative(root, capFrame)});
}
const baselineMae = pixelSamples[0].sourceVsCapMae;
const capCameraPixelPass = pixelSamples.slice(1).every((row) => row.sourceVsCapMae > baselineMae + 8);
const audit = {
  contract: "A1ScreenRecordingExecutionBoundaryAudit/v1",
  status: scenarioPreflight.status === "BLOCKED" ? "GAP_CONFIRMED" : "UNEXPECTED_CAP_PREFLIGHT_RESULT",
  source: {matrix: path.relative(root, matrixPath), matrixSha256: sha(matrixPath), capture: path.relative(root, capturePath), captureSha256: sha(capturePath)},
  counts: {matrixEffects: rows.length, diagnosticPassReal: rows.filter((row) => row.diagnosticStatus === "PASS_REAL").length, genericCapPreflightAcceptedNames: rows.filter((row) => row.genericCapPreflightAcceptsTechnique).length, productionAdmitted: 0},
  scenarioPreflight: {status: scenarioPreflight.status, failures: scenarioPreflight.failures},
  capCameraOnlyProof: capReceipt?.status === "PASS" ? {receipt: path.relative(root, capReceiptPath), receiptSha256: sha(capReceiptPath), project: capReceipt.capProject.path, video: capReceipt.reviewVideo.path, videoSha256: capReceipt.reviewVideo.sha256, fullDecodePass: capReceipt.reviewVideo.fullDecodePass, semanticZoomCount: capReceipt.camera.semanticZoomCount, pixelSamples, capCameraPixelPass, annotationsExecuted: false, productionAdmission: false} : null,
  note: "A diagnostic PASS_REAL is encoded review evidence, not an editable Cap project or production admission. This audit covers this generic Cap entrypoint, not every possible Cap feature.",
  effects: rows,
};
fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({status: audit.status, counts: audit.counts, scenarioPreflight: audit.scenarioPreflight, output: path.relative(root, outputPath)}, null, 2));
if (audit.status !== "GAP_CONFIRMED" || !capCameraPixelPass || capReceipt?.camera.semanticZoomCount !== 3) process.exitCode = 1;
