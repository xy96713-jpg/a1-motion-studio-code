#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {evaluateScreenRecordingDuration} from "../apps/studio-next/src/lib/a1-screen-recording-production-policy-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = new Date().toISOString().replace(/[:.]/gu, "-");
const batchRoot = path.join(root, "work/background-cap-production-v1/runs", runId);
const cap = "/Applications/Cap.app/Contents/MacOS/cap-cli";
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const shots = (process.env.A1_BACKGROUND_SHOTS || "ED-02,ED-03,ED-04").split(",").map((shot) => shot.trim()).filter(Boolean);
fs.mkdirSync(batchRoot, {recursive: true});

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd: root, env: {...process.env, ...(options.env || {})}, stdio: ["ignore", "pipe", "pipe"]});
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve({stdout, stderr}) : reject(new Error(`${path.basename(command)} exit=${code}:${stderr || stdout}`)));
});

async function captureShot(shotId) {
  const capture = await run(process.execPath, ["scripts/capture-headless-writing-workbench-shot-v1.mjs"], {env: {A1_HEADLESS_SHOT_ID: shotId}});
  const report = JSON.parse(capture.stdout);
  if (report.shotId !== shotId || report.headedWindowCreated !== false || report.frontmostApplicationMutation !== false || report.storyboardBinding?.shotId !== shotId) throw new Error(`background-isolation-or-storyboard-binding-failed:${shotId}`);
  return report;
}

const reports = [];
for (let index = 0; index < shots.length; index += 2) reports.push(...await Promise.all(shots.slice(index, index + 2).map(captureShot)));

const results = [];
for (const report of reports) {
  const shotSlug = report.shotId.toLowerCase();
  const projectPath = path.join(batchRoot, `${shotSlug}.cap`);
  const build = await run(process.execPath, ["scripts/build-cap-project-from-background-capture-v1.mjs", report.reportPath, projectPath]);
  const projectReceipt = JSON.parse(build.stdout);
  if (projectReceipt.status !== "READY_FOR_CAP_EXPORT") throw new Error(projectReceipt.durationPolicy?.failure || `cap-project-not-exportable:${report.shotId}`);
  const rawExport = path.join(batchRoot, `${shotSlug}-background-cap-960x540.mp4`);
  const reviewExport = path.join(batchRoot, `${shotSlug}-background-cap-review-960x540.mp4`);
  await run(cap, ["export", projectPath, "--output", rawExport, "--fps", "60", "--resolution", "960x540", "--quality", "maximum", "--json"]);
  await run(ffmpeg, ["-v", "error", "-y", "-i", rawExport, "-map", "0:v:0", "-c:v", "copy", "-an", reviewExport]);
  const probe = JSON.parse((await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration,size", "-of", "json", reviewExport])).stdout);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const durationMs = Math.round(Number(probe.format.duration) * 1000);
  const durationDecision = evaluateScreenRecordingDuration(durationMs,{beatDurationsMs:projectReceipt.durationPolicy?.beatDurationsMs||[],informationBearing:true});
  const failures = [];
  if (probe.streams.length !== 1 || video?.width !== 960 || video?.height !== 540 || video?.r_frame_rate !== "60/1") failures.push("REVIEW_OUTPUT_CONTRACT");
  if (durationDecision.status !== "PASS") failures.push(durationDecision.failure);
  if (!report.cursorTelemetry?.moves?.length || !report.cursorTelemetry?.clicks?.length) failures.push("CURSOR_TELEMETRY_MISSING");
  await run(process.execPath, ["scripts/finalize-background-cap-receipt-v1.mjs", projectPath, reviewExport]);
  results.push({id: report.shotId, status: failures.length ? "FAIL" : "PASS", headedWindowCreated: report.headedWindowCreated, frontmostApplicationMutation: report.frontmostApplicationMutation, captureBackend: report.captureBackend, storyboardBinding: report.storyboardBinding, reportPath: report.reportPath, capProject: path.relative(root, projectPath), productionRoute:"CAP_EXPORT", durationDecision, reviewVideo: {path: path.relative(root, reviewExport), sha256: crypto.createHash("sha256").update(fs.readFileSync(reviewExport)).digest("hex"), width: video?.width, height: video?.height, fps: video?.r_frame_rate, frameCount: Number(video?.nb_read_frames), durationMs}, cursorTelemetry: {moveCount: report.cursorTelemetry.moves.length, clickCount: report.cursorTelemetry.clicks.length}, failures});
}

const batch = {contract: "A1BackgroundCapStoryboardBatch/v1", status: results.every((item) => item.status === "PASS") ? "PASS" : "FAIL", mode: "HEADLESS_NO_FOREGROUND_INPUT_STORYBOARD_BOUND", concurrency: 2, fixtures: results, productionAdmission: false, userVisualApproval: "NOT_APPROVED", generatedAt: new Date().toISOString()};
const batchPath = path.join(batchRoot, "batch-report.json");
fs.writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`);
console.log(JSON.stringify({...batch, batchPath: path.relative(root, batchPath)}, null, 2));
if (batch.status !== "PASS") process.exitCode = 1;
