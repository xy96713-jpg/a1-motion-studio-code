#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const auditPath = path.join(root, "work/screen-recording-maturity-test-v1/retry-montage-evidence-v1/audit-report.json");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const capturePath = path.join(root, audit.source.captureReport);
const capture = JSON.parse(fs.readFileSync(capturePath, "utf8"));
const video = path.join(root, audit.output.path);
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", video], {encoding: "utf8"}));
const stream = probe.streams.find((row) => row.width);
const decode = execFileSync(ffmpeg, ["-v", "error", "-i", video, "-f", "null", "-"], {encoding: "utf8"});
const failed = audit.retryIntervals.find((row) => row.status === "FAILED");
const succeeded = audit.retryIntervals.find((row) => row.status === "SUCCEEDED");
const checks = {
  realRuntime: capture.runtimeId === "GENERIC_BROWSER_CAPTURE_V1" && capture.captureBackend === "PLAYWRIGHT_HEADLESS_RECORD_VIDEO",
  sourceProjectScoped: capture.project?.verificationScope === "EXPLICIT_SOURCE_FILES_ONLY" || capture.project?.verificationScope === "TRACKED_GIT_STATUS",
  failedAttempt: Boolean(failed && failed.durationMs > 0 && failed.error),
  successfulAttempt: Boolean(succeeded && succeeded.durationMs > 0),
  orderedAttempts: Boolean(failed && succeeded && failed.endMs <= succeeded.startMs),
  persistedReadback: audit.persistedReadback === true,
  pointerTelemetry: (capture.cursorTelemetry?.moves?.length || 0) > 0,
  media: stream?.width === 1280 && stream?.height === 720 && stream?.r_frame_rate === "60/1" && decode === "",
};
const failures = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
const report = {contract: "A1RealRetryEffectAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", effect: {id: "RETRY_MONTAGE", status: failures.length ? "BLOCKED" : "PASS_REAL", evidence: "real writing workbench failed save followed by successful save and persisted readback"}, source: {captureReport: audit.source.captureReport, captureReportSha256: sha(capturePath), reviewVideo: audit.output.path, reviewVideoSha256: sha(video)}, intervals: audit.retryIntervals, checks, failures, boundary: {reviewOnly: true, productionAdmission: false, temporaryDocumentDeleted: audit.boundary?.temporaryDocumentDeleted === true}};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const out = path.join(root, "work/screen-recording-maturity-test-v1/real-retry-effect-audit.json"); fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, effect: report.effect, failures, output: path.relative(root, out)}, null, 2));
if (failures.length) process.exitCode = 1;
