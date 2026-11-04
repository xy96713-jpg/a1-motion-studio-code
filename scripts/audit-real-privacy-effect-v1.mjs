#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const auditPath = path.join(root, "work/screen-recording-maturity-test-v1/annotation-batch-v1/render/audit-report.json");
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const capturePath = path.join(root, audit.source.captureReport);
const capture = JSON.parse(fs.readFileSync(capturePath, "utf8"));
const video = path.join(root, audit.outputs.review.path);
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", video], {encoding: "utf8"}));
const stream = probe.streams.find((row) => row.width);
const decode = execFileSync(ffmpeg, ["-v", "error", "-i", video, "-f", "null", "-"], {encoding: "utf8"});
const privacyMae = Number(audit.actualPixelMae?.privacy || 0);
const privacyTarget = capture.geometryTruth?.targets?.find((target) => target.targetKey === "privacy-evidence");
const checks = {
  annotationRuntime: audit.contract === "A1AnnotationMaturityAudit/v1" && audit.status === "PASS_REVIEW_ONLY",
  sensitiveTargetBound: privacyTarget?.kind === "TEXT" && privacyTarget?.lineRects?.length > 0,
  sourceUnchanged: capture.project?.unchanged === true && audit.source.temporaryDocumentDeleted === true,
  blurPixelProof: privacyMae >= 0.015,
  output: stream?.width === 1280 && stream?.height === 720 && stream?.r_frame_rate === "60/1" && decode === "",
};
const failures = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
const report = {contract: "A1RealPrivacyEffectAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", effect: {id: "PRIVACY_BLUR", status: failures.length ? "BLOCKED" : "PASS_REAL", evidence: "source-bound test-account text range with nonzero encoded blur delta and unchanged source project"}, source: {captureReport: audit.source.captureReport, captureReportSha256: sha(capturePath), reviewVideo: audit.outputs.review.path, reviewVideoSha256: sha(video), privacyTarget, privacyMae}, checks, failures, boundary: {reviewOnly: true, productionAdmission: false, temporaryDocumentDeleted: true}};
report.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const out = path.join(root, "work/screen-recording-maturity-test-v1/real-privacy-effect-audit.json"); fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({status: report.status, effect: report.effect, privacyMae, failures, output: path.relative(root, out)}, null, 2));
if (failures.length) process.exitCode = 1;
