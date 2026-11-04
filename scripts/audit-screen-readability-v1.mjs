#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {evaluateReadingWindows, inspectEvidenceBindings, isEvidencePass, shaFile, summarizeFindings, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const articleCapture = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/article-motion-batch-v1/noaa-article-motion-batch-v1/capture-report.json"), "utf8"));
const articleProps = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/props.json"), "utf8"));
const blindCapture = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/blind-test-v1/capture/blind-nasa-ocean-v2/capture-report.json"), "utf8"));
const blindReceipt = JSON.parse(fs.readFileSync(path.join(root, "work/screen-recording-maturity-test-v1/blind-test-v1/render/blind-nasa-ocean-v2/cap-receipt.json"), "utf8"));
const minLineHeight = (capture) => Math.min(...capture.geometryTruth.targets.flatMap((target) => (target.lineRects || []).map((rect) => rect.height * capture.output.height)).filter((value) => Number.isFinite(value) && value > 0));
const articleSourcePx = minLineHeight(articleCapture); const articleMaxScale = Math.max(...articleProps.scene.cameraTrack.map((keyframe) => keyframe.scale)); const blindSourcePx = minLineHeight(blindCapture); const blindMaxScale = Math.max(...blindReceipt.camera.segments.map((segment) => segment.amount), 1);
const rows = [{id: "article-motion", sourceLineHeightPx: articleSourcePx, maxCameraScale: articleMaxScale, projectedLineHeightPx: articleSourcePx * articleMaxScale}, {id: "blind-article", sourceLineHeightPx: blindSourcePx, maxCameraScale: blindMaxScale, projectedLineHeightPx: blindSourcePx * blindMaxScale}];
// These projections are diagnostics, never encoded readability acceptance.
const evidencePath = "work/screen-recording-maturity-test-v1/screen-reading-pixel-evidence.json";
const evidence = fs.existsSync(path.join(root, evidencePath)) ? JSON.parse(fs.readFileSync(path.join(root, evidencePath), "utf8")) : null;
const findings = [], bindingAudit = evidence ? inspectEvidenceBindings(root, evidence) : null;
if (!evidence || evidence.contract !== "A1ScreenReadingPixelEvidence/v1" || !evidence.outputs?.length) findings.push({id: "ENCODED_READING_EVIDENCE_MISSING", status: "INCOMPLETE"});
else {
  findings.push(...bindingAudit.failures.map((row) => ({...row, status: "FAIL"})));
  for (const output of evidence.outputs) {
    if (!output.video?.path || !output.video.sha256) findings.push({id: "READING_OUTPUT_SHA_MISSING", status: "INCOMPLETE"});
    findings.push(...evaluateReadingWindows(output));
  }
  // Both configured article outputs must have their own evidence; a new canary cannot close their gaps.
  for (const row of rows) if (!evidence.outputs.some((output) => output.id === row.id)) findings.push({id: `${row.id}:READING_EVIDENCE_MISSING`, status: "INCOMPLETE"});
}
const sources = [
  "work/screen-recording-maturity-test-v1/article-motion-batch-v1/noaa-article-motion-batch-v1/capture-report.json",
  "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/props.json",
  "work/screen-recording-maturity-test-v1/blind-test-v1/capture/blind-nasa-ocean-v2/capture-report.json",
  "work/screen-recording-maturity-test-v1/blind-test-v1/render/blind-nasa-ocean-v2/cap-receipt.json",
  ...(evidence ? [evidencePath] : []),
].map((file) => ({path: file, sha256: shaFile(path.join(root, file))}));
const report = writeAudit(root, "work/screen-recording-maturity-test-v1/screen-readability-audit.json", {
  contract: "A1ScreenReadabilityAudit/v1", ...summarizeFindings(findings),
  policy: {minimumEncodedTextHeightPx: 18, minimumReadingHoldMs: 800, maximumSampleGapMs: 500, geometryOnlyIsAcceptance: false},
  rows, findings, sources, bindingAudit,
  producer: {path: "scripts/audit-screen-readability-v1.mjs", sha256: shaFile(import.meta.filename)},
  boundary: {reviewOnly: true, productionAdmission: false},
}, sources);
console.log(JSON.stringify({status: report.status, findings, geometricDiagnostics: rows}, null, 2));
if (!isEvidencePass(report.status)) process.exitCode = 1;
