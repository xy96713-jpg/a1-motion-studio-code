#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {isEvidencePass, summarizeFindings, validateCapScreenProvenance, writeAudit} from "./lib/screen-validation-evidence-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const files = [
  "work/screen-recording-maturity-test-v1/effect-maturity-regression-v2/effect-maturity-regression-review-1280x720-60fps.mp4",
  "work/screen-recording-maturity-test-v1/effect-maturity-clean-regression-v1/effect-maturity-clean-review-1280x720-60fps.mp4",
  "work/screen-recording-maturity-test-v1/full-regression-v1/full-screen-recording-capability-review-1280x720-60fps.mp4",
  "work/screen-recording-maturity-test-v1/annotation-decision-proof-v1/render/annotation-decision-review-1280x720-60fps.mp4",
  "work/screen-recording-maturity-test-v1/real-file-drop-v1/render/real-file-drop-tether-review-1280x720-60fps.mp4",
  "work/screen-recording-maturity-test-v1/englishflow-fresh-director-maturity-v1/review-v8/review.mp4",
  "work/screen-recording-maturity-test-v1/lab-vault-fresh-navigation-maturity-v1/review-v8/review.mp4",
  "work/screen-recording-maturity-test-v1/lab-vault-fresh-menu-maturity-v1/review-v8/review.mp4",
];
const rows = files.map((relative) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return {path: relative, status: "INCOMPLETE", findings: [{id: "VIDEO_MISSING", status: "INCOMPLETE"}]};
  const probe = JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", file], {encoding: "utf8"}));
  const streams = probe.streams || [];
  const findings = [];
  if (streams.some((stream) => stream.codec_type === "audio")) findings.push({id: "AUDIO_PRESENT", status: "FAIL"});
  if (!streams.some((stream) => stream.codec_type === "video")) findings.push({id: "VIDEO_STREAM_MISSING", status: "FAIL"});
  const receiptPath = path.join(path.dirname(file), "cap-receipt.json");
  let provenance = null;
  if (fs.existsSync(receiptPath)) {
    provenance = validateCapScreenProvenance(root, JSON.parse(fs.readFileSync(receiptPath, "utf8")), relative);
    findings.push(...provenance.findings);
  } else {
    findings.push({id: "REAL_SCREEN_PROVENANCE_MISSING", status: "INCOMPLETE", reason: "No audio does not prove real screen capture; a source/output receipt is required."});
    const manifestPath = path.join(path.dirname(file), "audit-report.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.clips?.some((clip) => /presenter|camera-bubble/iu.test(clip.id || "") || clip.effects?.includes("CAMERA_BUBBLE_REFLOW"))) findings.push({id: "SCREEN_TASK_SCOPE_EXPANSION", status: "FAIL", reason: "Presenter footage is outside the requested screen-only deliverable."});
    }
  }
  const decision = summarizeFindings(findings);
  return {path: relative, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), status: decision.status, audioStatus: streams.some((stream) => stream.codec_type === "audio") ? "FAIL" : "PASS", findings, provenance, streams: streams.map((stream) => ({codecType: stream.codec_type, width: stream.width || null, height: stream.height || null, fps: stream.r_frame_rate || null}))};
});
const findings = rows.flatMap((row) => row.findings.map((finding) => ({...finding, path: row.path})));
const report = writeAudit(root, "work/screen-recording-maturity-test-v1/screen-only-output-audit.json", {
  contract: "A1ScreenOnlyOutputAudit/v1", ...summarizeFindings(findings), rows, failures: findings,
  policy: {scope: "REAL_SCREEN_CAPTURE_AND_SOURCE_BOUND_POST", narrationAllowed: false, presenterAllowed: false, audioStreamsForbidden: true, noAudioIsSourceProof: false},
  producer: {path: "scripts/audit-screen-only-output-v1.mjs", sha256: crypto.createHash("sha256").update(fs.readFileSync(import.meta.filename)).digest("hex")},
});
console.log(JSON.stringify({status: report.status, rows: rows.map((row) => ({path: row.path, status: row.status, findings: row.findings.map((finding) => finding.id)}))}, null, 2));
if (!isEvidencePass(report.status)) process.exitCode = 1;
