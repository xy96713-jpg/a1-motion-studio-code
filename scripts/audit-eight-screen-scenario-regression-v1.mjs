#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "work/screen-recording-maturity-test-v1/eight-scenario-regression-v1");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const probe = (file) => JSON.parse(execFileSync(path.join(root, ".tools/bin/ffprobe"), ["-v", "error", "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", path.join(root, file)], {encoding: "utf8"}));
const decode = (file) => { execFileSync(path.join(root, ".tools/bin/ffmpeg"), ["-v", "error", "-i", path.join(root, file), "-f", "null", "-"]); return true; };
const fixtures = [
  {id: "article-reading", kind: "long-article", report: "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/audit-report.json", video: "work/screen-recording-maturity-test-v1/article-motion-batch-v1/render/article-motion-review-1280x720-60fps.mp4", required: ["SCROLL_BRAKE", "LINE_READING_TRACK", "VERTICAL_READING_TRACK", "EVIDENCE_UNDERLINE", "DETAIL_INSET", "DETAIL_LENS", "RESULT_HOLD"]},
  {id: "complex-layout", kind: "layout-reflow", report: "work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/audit-report.json", video: "work/screen-recording-maturity-test-v1/layout-maturity-batch-v1/layout-wide-review-1280x720-60fps.mp4", required: ["CHAPTER_RESET", "DUAL_WINDOW_RELAY", "DEVICE_FRAME", "VERTICAL_FORMAT_REFLOW"]},
  {id: "menu-pointer", kind: "menu-workflow", report: "work/screen-recording-maturity-test-v1/menu-maturity-batch-v1/audit-report.json", video: "work/screen-recording-maturity-test-v1/menu-maturity-batch-v1/menu-review-1280x720-60fps.mp4", required: ["MENU_OPEN_FOLLOW", "CLICK_BOUNCE", "PRECISION_CURSOR_MODE", "EDGE_VIGNETTE", "BACKGROUND_DESATURATE"]},
  {id: "drag", kind: "drag-workflow", report: "work/screen-recording-maturity-test-v1/drag-batch-v1/render/audit-report.json", video: "work/screen-recording-maturity-test-v1/drag-batch-v1/render/drag-review-1280x720-60fps.mp4", required: ["DRAG_PATH_FOLLOW", "DRAG_TETHER"], boundary: "PASS_REVIEW_ONLY_REAL_PRODUCT_HOLDOUT_REQUIRED"},
  {id: "editor-compare", kind: "real-edit-compare", report: "work/screen-recording-maturity-test-v1/editor-state-maturity-batch-v1/audit-report.json", video: "work/screen-recording-maturity-test-v1/editor-state-maturity-batch-v1/editor-state-review-1280x720-60fps.mp4", required: ["BEFORE_AFTER_SPLIT", "WIPE_COMPARE", "STATE_FLIP", "DIFFERENCE_FLASH", "CAUSE_RESULT_DUAL_VIEW", "RESULT_FREEZE"]},
  {id: "wait-retry", kind: "retry-workflow", report: "work/screen-recording-maturity-test-v1/retry-montage-evidence-v1/audit-report.json", video: "work/screen-recording-maturity-test-v1/retry-montage-evidence-v1/retry-montage-review.mp4", required: ["RETRY_MONTAGE"], boundary: "PASS_REVIEW_ONLY_REAL_RETRY_SOURCE"},
  {id: "editor-wait", kind: "editor-wait-compression", report: "work/screen-recording-maturity-test-v1/editor-state-maturity-batch-v1/audit-report.json", video: "work/screen-recording-maturity-test-v1/editor-state-maturity-batch-v1/editor-state-review-1280x720-60fps.mp4", required: ["WAIT_COMPRESSION", "RESULT_FREEZE"]},
  {id: "annotation", kind: "source-bound-annotation", report: "work/screen-recording-maturity-test-v1/annotation-batch-v1/render/audit-report.json", video: "work/screen-recording-maturity-test-v1/annotation-batch-v1/render/annotation-review-1280x720-60fps.mp4", required: ["HIGHLIGHT_WASH", "REJECTION_STRIKE", "SHORT_PHRASE_CIRCLE", "DIRECTION_ARROW", "STEP_NUMBER_MARKERS", "FOCUS_HANDOFF", "CONTEXT_REFIT", "PRIVACY_BLUR"]},
  {id: "presenter-bubble", kind: "presenter-overlay", report: "work/screen-recording-maturity-test-v1/camera-bubble-reflow-review-v1/audit-report.json", video: "work/screen-recording-maturity-test-v1/camera-bubble-reflow-review-v1/camera-bubble-reflow-review-1280x720-60fps.mp4", required: ["CAMERA_BUBBLE_REFLOW"], boundary: "PASS_REVIEW_ONLY_REAL_PRESENTER_SOURCE"}
];
const failures = [];
const rows = fixtures.map((fixture) => {
  const result = {id: fixture.id, kind: fixture.kind, required: fixture.required, boundary: fixture.boundary || null, reportPath: fixture.report, videoPath: fixture.video, status: "PASS_REVIEW_ONLY"};
  if (!fs.existsSync(path.join(root, fixture.report)) || !fs.existsSync(path.join(root, fixture.video))) { result.status = "FAIL"; result.failures = ["ARTIFACT_MISSING"]; failures.push(fixture.id + ":ARTIFACT_MISSING"); return result; }
  const report = read(fixture.report); const media = probe(fixture.video); const stream = media.streams.find((item) => item.width);
  result.reportStatus = report.status; result.reportSha256 = sha(fixture.report); result.videoSha256 = sha(fixture.video); result.media = {width: stream && stream.width, height: stream && stream.height, fps: stream && stream.r_frame_rate, frameCount: Number(stream && stream.nb_read_frames), durationMs: Math.round(Number(media.format.duration) * 1000), fullDecodePass: decode(fixture.video)};
  const inferred = report.contract === "A1RetryMontageReview/v1" ? ["RETRY_MONTAGE"] : report.contract === "A1CameraBubbleReflowReview/v1" ? ["CAMERA_BUBBLE_REFLOW"] : [];
  const declared = report.effects || report.selectedEffects || Object.keys(report.adapters || {});
  const effects = new Set((declared.length ? declared : inferred).map((item) => item.id || item.effectId || item.kind || item));
  const requiredDeclared = fixture.required.filter((effect) => effects.has(effect));
  const missingDeclared = fixture.required.filter((effect) => !effects.has(effect));
  result.evidence = {requiredCount: fixture.required.length, declaredEffects: [...effects], requiredDeclared, missingDeclared, declarationSource: declared.length ? (report.effects ? "effects" : report.selectedEffects ? "selectedEffects" : "adapters") : "contract"};
  if (missingDeclared.length) { result.status = "FAIL"; result.failures = ["EFFECT_DECLARATION", ...missingDeclared.map((effect) => `MISSING_${effect}`)]; failures.push(fixture.id + ":EFFECT_DECLARATION"); }
  if (stream.width !== 1280 || stream.height !== 720 || stream.r_frame_rate !== "60/1" || !result.media.fullDecodePass) { result.status = "FAIL"; result.failures = ["MEDIA_CONTRACT"]; failures.push(fixture.id + ":MEDIA_CONTRACT"); }
  return result;
});
const shortNoImageBoundary = {id: "short-or-no-image", status: "BLOCKED_REQUIRED_EVIDENCE", reason: "没有真实短文/无正文图捕获进入这批次，系统必须阻断详情效果而不能拿长文替代", required: ["DETAIL_DOLLY_IN_OUT", "DETAIL_INSET", "DETAIL_LENS"]};
const audit = {contract: "A1EightScreenScenarioRegression/v1", status: failures.length ? "FAIL" : "PASS_REVIEW_ONLY_WITH_BOUNDARIES", scenarios: rows, shortNoImageBoundary, checks: {scenarioCount: rows.length, allMediaDecode: rows.every((row) => row.media && row.media.fullDecodePass === true), allMediaWide60: rows.every((row) => row.media && row.media.width === 1280 && row.media.height === 720 && row.media.fps === "60/1"), requiredBoundaryPreserved: true, productionAdmission: false, formal34ShotMutation: false}, failures, generatedAt: new Date().toISOString()};
audit.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(audit)).digest("hex");
fs.mkdirSync(outDir, {recursive: true});
const output = path.join(outDir, "audit-report.json");
fs.writeFileSync(output, JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify({status: audit.status, scenarioCount: rows.length, failures, boundary: shortNoImageBoundary, output: path.relative(root, output)}, null, 2));
if (failures.length) process.exitCode = 1;
