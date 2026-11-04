#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "work/event-settle-screen-motion-proof-v1");
const plan = JSON.parse(fs.readFileSync(path.join(outputRoot, "plan.json"), "utf8"));
const newVideo = path.join(outputRoot, "event-settle-ed02-ed03-ed27-960x540.mp4");
const currentVideos = plan.items.map((item) => path.join(root, item.sourceCurrentWaveOutput));
const currentConcat = path.join(outputRoot, "current-hard-cut-ed02-ed03-ed27-960x540.mp4");
const comparison = path.join(outputRoot, "current-hard-cut-vs-event-settle-1920x540.mp4");
const contactSheet = path.join(outputRoot, "current-hard-cut-vs-event-settle-contact-sheet.jpg");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (args, label) => {
  const child = spawnSync(ffmpeg, args, {encoding: "utf8", maxBuffer: 16 * 1024 * 1024});
  if (child.status !== 0) throw new Error(`${label}:${child.stderr || child.stdout}`);
  return `${child.stdout || ""}${child.stderr || ""}`;
};
const probe = (file) => {
  const child = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames", "-of", "json", file], {encoding: "utf8"});
  if (child.status !== 0) throw new Error(`probe:${file}:${child.stderr}`);
  return JSON.parse(child.stdout);
};
const motionScore = (file) => {
  const output = run(["-hide_banner", "-i", file, "-vf", "vmafmotion", "-an", "-f", "null", "-"], `vmafmotion:${file}`);
  const match = output.match(/VMAF Motion avg: ([0-9.]+)/u);
  return match ? Number(match[1]) : null;
};

if (plan.status !== "READY") throw new Error("event-settle-plan-not-ready");
if (!fs.existsSync(newVideo) || currentVideos.some((file) => !fs.existsSync(file))) throw new Error("event-settle-proof-video-missing");

run([
  "-y",
  ...currentVideos.flatMap((file) => ["-i", file]),
  "-filter_complex", "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]",
  "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-c:a", "aac", "-movflags", "+faststart", currentConcat,
], "current-concat");

run([
  "-y", "-i", currentConcat, "-i", newVideo,
  "-filter_complex", "[0:v]scale=960:540,drawbox=x=0:y=0:w=960:h=38:color=black@0.72:t=fill,drawtext=fontfile=/System/Library/Fonts/SFNS.ttf:text='CURRENT  HARD CUT':x=16:y=9:fontsize=18:fontcolor=white[left];[1:v]scale=960:540,drawbox=x=0:y=0:w=960:h=38:color=black@0.72:t=fill,drawtext=fontfile=/System/Library/Fonts/SFNS.ttf:text='EVENT  SETTLE':x=16:y=9:fontsize=18:fontcolor=white[right];[left][right]hstack=inputs=2:shortest=1[v]",
  "-map", "[v]", "-map", "1:a?", "-c:v", "libx264", "-crf", "17", "-preset", "medium", "-c:a", "aac", "-movflags", "+faststart", comparison,
], "comparison");

run([
  "-y", "-i", comparison,
  "-vf", "fps=1/2.6,scale=960:270,tile=2x4",
  "-frames:v", "1", contactSheet,
], "contact-sheet");

const motionWindows = plan.items.flatMap((item) => item.motion.motionWindows.map((window) => ({shotId: item.shotId, ...window})));
const failures = [];
if (motionWindows.some((window) => window.durationMs < 280 || window.durationMs > 440)) failures.push("MOVE_DURATION_OUT_OF_RANGE");
if (motionWindows.some((window) => window.path !== "STRAIGHT_LINE" || window.overshoot !== 0)) failures.push("PATH_OR_OVERSHOOT_INVALID");
if (motionWindows.some((window) => !["cinematic-in", "glide"].includes(window.easing))) failures.push("EASING_INVALID");
if (plan.items.some((item) => item.motion.resultHoldMs < 800)) failures.push("RESULT_HOLD_TOO_SHORT");
if (plan.items.some((item) => item.motion.motionDutyCycle > .22)) failures.push("MOTION_DUTY_CYCLE_TOO_HIGH");
if (plan.items.some((item) => item.motion.policy.automaticWideRestore !== false)) failures.push("AUTOMATIC_WIDE_RESTORE_PRESENT");
if (plan.items.some((item) => item.motion.eventAlignment.some((entry) => entry.settleLagMs > 160))) failures.push("EVENT_SETTLE_LAG_TOO_HIGH");

const newProbe = probe(newVideo), currentProbe = probe(currentConcat), comparisonProbe = probe(comparison);
const currentMotionScore = motionScore(currentConcat), eventSettleMotionScore = motionScore(newVideo);
if (!(eventSettleMotionScore > currentMotionScore)) failures.push("EVENT_SETTLE_MOTION_NOT_ABOVE_CURRENT_HARD_CUT");
if (!(eventSettleMotionScore < 1.25)) failures.push("EVENT_SETTLE_MOTION_EXCESSIVE");

const body = {
  contract: "A1EventSettleScreenMotionProofAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  sourceProofPlanSha256: plan.proofPlanSha256,
  shotIds: plan.shotIds,
  metrics: {
    moveCount: motionWindows.length,
    moveDurationRangeMs: [Math.min(...motionWindows.map((item) => item.durationMs)), Math.max(...motionWindows.map((item) => item.durationMs))],
    motionDutyCycles: Object.fromEntries(plan.items.map((item) => [item.shotId, item.motion.motionDutyCycle])),
    resultHoldMs: Object.fromEntries(plan.items.map((item) => [item.shotId, item.motion.resultHoldMs])),
    currentHardCutInterpolatedMoveCount: 0,
    currentMotionScore,
    eventSettleMotionScore,
  },
  outputs: {
    current: {path: path.relative(root, currentConcat), sha256: sha256(currentConcat), probe: currentProbe},
    eventSettle: {path: path.relative(root, newVideo), sha256: sha256(newVideo), probe: newProbe},
    comparison: {path: path.relative(root, comparison), sha256: sha256(comparison), probe: comparisonProbe},
    contactSheet: {path: path.relative(root, contactSheet), sha256: sha256(contactSheet)},
  },
  boundaries: {proofOnly: true, currentAuthorityMutated: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
  failures,
};
body.auditSha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
fs.writeFileSync(path.join(outputRoot, "audit-report.json"), `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify(body, null, 2));
if (failures.length) process.exitCode = 1;
