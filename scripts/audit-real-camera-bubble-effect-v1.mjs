#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const auditPath = path.join(root, "work/screen-recording-maturity-test-v1/camera-bubble-reflow-review-v1/audit-report.json");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const video = path.join(root, audit.output.path);
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", video], {encoding: "utf8"}));
const stream = probe.streams.find((row) => row.width);
const decode = execFileSync(ffmpeg, ["-v", "error", "-i", video, "-f", "null", "-"], {encoding: "utf8"});
const positions = audit.layout?.positions || [];
const checks = {
  realPresenterSource: audit.layout?.bubble?.realPresenterSource === true,
  sourceBound: audit.layout?.bubble?.sourceBound === true,
  multipleSafePositions: positions.length >= 3 && new Set(positions.map((position) => `${position.x},${position.y}`)).size >= 3,
  encodedPixelProof: audit.pixelProof?.nonZeroDelta === true && Number(audit.pixelProof?.mae) > 0,
  media: stream?.width === 1280 && stream?.height === 720 && stream?.r_frame_rate === "60/1" && decode === "",
};
const failures = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
const report = {contract: "A1RealCameraBubbleEffectAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", effect: {id: "CAMERA_BUBBLE_REFLOW", status: failures.length ? "BLOCKED" : "PASS_REAL", evidence: "real presenter source, source-bound overlay, three safe positions, and encoded pixel proof"}, source: {audit: "work/screen-recording-maturity-test-v1/camera-bubble-reflow-review-v1/audit-report.json", auditSha256: sha(auditPath), video: audit.output.path, videoSha256: sha(video)}, checks, positions, failures, boundary: {reviewOnly: true, productionAdmission: false, currentStoryboardMutation: false}};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const out = path.join(root, "work/screen-recording-maturity-test-v1/real-camera-bubble-effect-audit.json"); fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, effect: report.effect, failures, output: path.relative(root, out)}, null, 2));
if (failures.length) process.exitCode = 1;
