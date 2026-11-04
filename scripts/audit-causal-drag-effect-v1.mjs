#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, ".codex-artifacts/system-progress-system-line/causal-writing-workbench-v1/report.json");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const video = path.join(root, ".codex-artifacts/system-progress-system-line/causal-writing-workbench-v1/causal-writing-workbench-real.mp4");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", video], {encoding: "utf8"}));
const stream = probe.streams.find((row) => row.width);
const decode = execFileSync(ffmpeg, ["-v", "error", "-i", video, "-f", "null", "-"], {encoding: "utf8"});
const checks = {
  capturePass: report.status === "PASS",
  realWorkbench: report.checks?.realRuntimeUsed === true && report.checks?.fakeUiUsed === false,
  nativePointerDrag: report.checks?.nativePointerDragSelectionObserved === true,
  visiblePointer: report.checks?.visibleCapturePointerObserved === true,
  dragEvent: report.interaction?.replay?.events?.some((event) => event.eventType === "drag" && event.performance?.pointerVisible === true) === true,
  downstreamAction: report.checks?.productApplyObserved === true && report.checks?.contenteditableInputTypingObserved === true,
  sourceUnchanged: report.checks?.formalArticleMutated === false && report.checks?.temporaryCloneDeleted === true,
  media: stream?.width === 1920 && stream?.height === 1080 && ["25/1", "60/1"].includes(stream?.r_frame_rate) && decode === "",
};
const failures = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
const audit = {contract: "A1CausalDragEffectAudit/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY", effect: {id: "DRAG_PATH_FOLLOW", status: failures.length ? "BLOCKED" : "PASS_REAL", evidence: "real writing workbench native pointer drag selection with visible pointer and downstream product action"}, source: {report: ".codex-artifacts/system-progress-system-line/causal-writing-workbench-v1/report.json", reportSha256: sha(reportPath), video: ".codex-artifacts/system-progress-system-line/causal-writing-workbench-v1/causal-writing-workbench-real.mp4", videoSha256: sha(video), durationMs: Math.round(Number(probe.format.duration) * 1000), width: stream.width, height: stream.height, fps: stream.r_frame_rate, frameCount: Number(stream.nb_read_frames)}, checks, failures, boundary: {reviewOnly: true, productionAdmission: false, formal34ShotMutation: false}};
audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
const out = path.join(root, "work/screen-recording-maturity-test-v1/causal-drag-effect-audit.json"); fs.writeFileSync(out, `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify({status: audit.status, effect: audit.effect, failures, output: path.relative(root, out)}, null, 2));
if (failures.length) process.exitCode = 1;
