#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const publicRoot = path.join(root, "apps/studio-next/public");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const workspace = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/report.json"), "utf8"));
const outputRoot = path.join(root, "work/mature-creator-long-screen-run-v1");
fs.mkdirSync(outputRoot, {recursive: true});
const presenter = path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/imported-film-media-v1/presenter-video-093bc1315163.mov");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (sha(presenter) !== "093bc13151633d34f0bdc1176de77f1b71eeda7c7ccbb4d3ff2507cbc45babc5") throw new Error("long-run-presenter-sha-drift");

const shotIds = ["ED-21", "ED-22", "ED-23", "ED-24", "ED-25", "ED-26", "ED-27", "ED-28", "ED-29", "ED-30"];
const resetAtShot = new Map([["ED-24", 900], ["ED-27", 900], ["ED-29", 900]]);
const authority = workspace.production.shotIntelligence.currentStoryboardAuthority;
const shots = shotIds.map((shotId) => {
  const shot = authority.shots.find((item) => item.shotId === shotId);
  const review = report.shots.find((item) => item.shotId === shotId);
  if (!shot?.timeRange || !review?.video?.publicUrl) throw new Error(`long-run-shot-missing:${shotId}`);
  const file = path.join(publicRoot, review.video.publicUrl.replace(/^\//u, ""));
  if (!fs.existsSync(file) || sha(file) !== review.video.sha256) throw new Error(`long-run-video-drift:${shotId}`);
  return {shotId, startMs: shot.timeRange.startMs, endMs: shot.timeRange.endMs, durationMs: shot.timeRange.durationMs, file, videoSha256: review.video.sha256};
});
const sequenceStartMs = shots[0].startMs, sequenceEndMs = shots.at(-1).endMs, expectedDurationMs = sequenceEndMs - sequenceStartMs;
const inputArgs = ["-i", presenter, ...shots.flatMap((item) => ["-i", item.file])];
const presenterTreatment = "scale=960:540,eq=brightness=0.035:contrast=1.03:saturation=1.02,colorbalance=rs=.015:gs=.005:bs=-.01,fps=60";
const filters = [];
const visualLabels = [];
const schedule = [];
let cursorMs = sequenceStartMs;
let labelIndex = 0;
const addPresenter = (startMs, endMs, role) => {
  if (endMs <= startMs) return;
  const label = `v${labelIndex++}`;
  filters.push(`[0:v]trim=start=${(startMs / 1000).toFixed(3)}:end=${(endMs / 1000).toFixed(3)},setpts=PTS-STARTPTS,${presenterTreatment}[${label}]`);
  visualLabels.push(`[${label}]`);
  schedule.push({startMs: startMs - sequenceStartMs, endMs: endMs - sequenceStartMs, carrier: "VERIFIED_REAL_PRESENTER_RESET", role});
};
const addScreenHold = (inputIndex, sourceDurationMs, startMs, endMs, shotId) => {
  if (endMs <= startMs) return;
  const label = `v${labelIndex++}`;
  const holdSeconds = (endMs - startMs) / 1000;
  const sourceStart = Math.max(0, sourceDurationMs / 1000 - .05);
  filters.push(`[${inputIndex}:v]trim=start=${sourceStart.toFixed(3)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${holdSeconds.toFixed(3)},trim=duration=${holdSeconds.toFixed(3)},fps=60[${label}]`);
  visualLabels.push(`[${label}]`);
  schedule.push({startMs: startMs - sequenceStartMs, endMs: endMs - sequenceStartMs, carrier: "CLEAN_SCREEN_RESULT_HOLD", shotIds: [shotId], role: "SHORT_TIMELINE_GAP_NO_PRESENTER_FLASH"});
};
shots.forEach((shot, index) => {
  const gapMs = shot.startMs - cursorMs;
  if (gapMs >= 600) addPresenter(cursorMs, shot.startMs, "TIMELINE_GAP_BREATH");
  else if (gapMs > 0 && index > 0) addScreenHold(index, shots[index - 1].durationMs, cursorMs, shot.startMs, shots[index - 1].shotId);
  const resetMs = Math.min(resetAtShot.get(shot.shotId) || 0, shot.durationMs - 800);
  if (resetMs) addPresenter(shot.startMs, shot.startMs + resetMs, `DENSITY_RESET_BEFORE_${shot.shotId}`);
  const label = `v${labelIndex++}`;
  const sourceStart = resetMs / 1000;
  const sourceEnd = shot.durationMs / 1000;
  filters.push(`[${index + 1}:v]trim=start=${sourceStart.toFixed(3)}:end=${sourceEnd.toFixed(3)},setpts=PTS-STARTPTS,fps=60[${label}]`);
  visualLabels.push(`[${label}]`);
  schedule.push({startMs: shot.startMs + resetMs - sequenceStartMs, endMs: shot.endMs - sequenceStartMs, carrier: "CLEAN_SCREEN_EVIDENCE", shotIds: [shot.shotId]});
  cursorMs = shot.endMs;
});
filters.push(`${visualLabels.join("")}concat=n=${visualLabels.length}:v=1:a=0[v]`);
filters.push(`[0:a]atrim=start=${(sequenceStartMs / 1000).toFixed(3)}:end=${(sequenceEndMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000[a]`);
const output = path.join(outputRoot, "mature-creator-ed21-ed30-review-960x540.mp4");
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...inputArgs, "-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-t", (expectedDurationMs / 1000).toFixed(3), "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output], {stdio: "inherit"});
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration,nb_frames:format=duration,size", "-of", "json", output], {encoding: "utf8"}));
const video = probe.streams.find((item) => item.codec_type === "video"), audio = probe.streams.find((item) => item.codec_type === "audio");
const outputDurationMs = Math.round(Number(probe.format.duration) * 1000);
const failures = [];
if (video?.width !== 960 || video?.height !== 540 || video?.r_frame_rate !== "60/1" || !audio) failures.push("OUTPUT_CONTRACT");
if (Math.abs(outputDurationMs - expectedDurationMs) > 20) failures.push(`DURATION_DRIFT:${outputDurationMs - expectedDurationMs}`);
if (schedule.filter((item) => item.role?.startsWith("DENSITY_RESET")).length !== 3) failures.push("THREE_DENSITY_RESETS_REQUIRED");
const body = {
  contract: "A1MatureCreatorLongScreenRun/v1",
  status: failures.length ? "FAIL" : "READY_FOR_ACTUAL_PIXEL_REVIEW",
  sourceWorkspaceSha256: workspace.workspaceSha256,
  sourceWaveSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(publicRoot, "generated/system-line/editorial-asset-workbench-v1/screen-storyboard-wave-15-v1/report.json"))).digest("hex"),
  sourcePresenterSha256: sha(presenter),
  shotIds,
  schedule,
  policy: {maximumConsecutiveScreenBeats: 3, densityResetCount: 3, densityResetDurationMs: 900, minimumPresenterResetMs: 600, shortGapPolicy: "HOLD_PREVIOUS_RESULT_NO_PRESENTER_FLASH", decorativeFrames: 0, clickRings: 0, cursorInFinal: false, originalPresenterAudioPreserved: true, hardCutsDefault: true},
  output: {path: path.relative(root, output), sha256: sha(output), durationMs: outputDurationMs, width: video?.width, height: video?.height, fps: video?.r_frame_rate, audioDurationMs: Math.round(Number(audio?.duration) * 1000)},
  failures,
  boundaries: {reviewOnly: true, userVisualApproval: "NOT_APPROVED", productionAdmission: false, workspaceMutationPerformed: false, motionSpecAllowed: false, resolveAllowed: false},
  generatedAt: new Date().toISOString(),
};
body.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
fs.writeFileSync(path.join(outputRoot, "report.json"), `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify(body, null, 2));
if (failures.length) process.exitCode = 1;
