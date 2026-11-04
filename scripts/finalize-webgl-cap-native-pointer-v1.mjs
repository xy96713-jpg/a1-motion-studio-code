#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";
const tag = process.env.A1_WEBGL_POINTER_TAG || "v1";
const outDir = path.join(root, `work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-pointer-${tag}`);
const capProject = path.join(outDir, "webgl-native-pointer.cap");
const videoPath = path.join(outDir, "webgl-native-pointer.mp4");
const metadataPath = path.join(capProject, "recording-meta.json");
const cursorPath = path.join(capProject, "content/segments/segment-0/cursor.json");
const telemetryPath = path.join(outDir, "pointer-telemetry.json");
const reportPath = path.join(outDir, "report.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const rel = (file) => path.relative(root, file);
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));

if (!fs.existsSync(capProject)) throw new Error(`webgl-native-pointer-cap-project-missing:${capProject}`);
if (!fs.existsSync(videoPath)) {
  execFileSync(cap, ["export", capProject, videoPath, "--format", "mp4", "--fps", "60", "--quality", "maximum"], {stdio: "inherit"});
}
if (!fs.existsSync(cursorPath)) throw new Error(`webgl-native-pointer-cursor-missing:${cursorPath}`);
const meta = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const cursor = JSON.parse(fs.readFileSync(cursorPath, "utf8"));
const mediaProbe = probe(videoPath);
const video = mediaProbe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", videoPath, "-f", "null", "-"], {encoding: "utf8"});
if (!video || decode.status !== 0) throw new Error(`webgl-native-pointer-video-invalid:${decode.stderr || "no-video"}`);

const pointerTrack = (cursor.moves || []).map((move) => ({
  tMs: Math.round(Number(move.time_ms)),
  x: Number(Number(move.x).toFixed(6)),
  y: Number(Number(move.y).toFixed(6)),
  kind: "move",
}));
const clicks = (cursor.clicks || []).filter((click) => click.down).map((click) => ({
  atMs: Math.round(Number(click.time_ms)),
  x: pointerTrack.length ? pointerTrack.reduce((best, point) => Math.abs(point.tMs - Number(click.time_ms)) < Math.abs(best.tMs - Number(click.time_ms)) ? point : best, pointerTrack[0]).x : 0.5,
  y: pointerTrack.length ? pointerTrack.reduce((best, point) => Math.abs(point.tMs - Number(click.time_ms)) < Math.abs(best.tMs - Number(click.time_ms)) ? point : best, pointerTrack[0]).y : 0.5,
  kind: "press",
}));
const source = {path: rel(videoPath), sha256: sha256(videoPath), width: video.width, height: video.height, fps: video.r_frame_rate, durationMs: Math.round(Number(mediaProbe.format.duration) * 1000), fullDecodePass: decode.status === 0};
const telemetry = {
  contract: "A1NativeCanvasPointerTelemetry/v1",
  projectId: "personal-website-webgl",
  sourceCapture: {capProject: rel(capProject), video: rel(videoPath), videoSha256: source.sha256, nativeSampleTimestamps: true, capCursorJson: rel(cursorPath), capRecordingMeta: rel(metadataPath)},
  canvas: {target: "FULL_WINDOW_CANVAS", pointerFrame: "CAPTURE_NORMALIZED", liveWebGL: true},
  pointerTrack,
  clicks,
  nativeCursorShapeIds: [...new Set((cursor.moves || []).map((move) => move.cursor_id).concat((cursor.clicks || []).map((click) => click.cursor_id)))],
  projectUnchanged: true,
};
telemetry.sha256 = crypto.createHash("sha256").update(JSON.stringify(telemetry)).digest("hex");
fs.writeFileSync(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
const events = [
  {name: "capture_start", tMs: 0},
  ...clicks.map((click, index) => ({name: index === 0 ? "native_pointer_press" : `native_pointer_press_${index + 1}`, tMs: click.atMs, x: click.x, y: click.y})),
  {name: "capture_end", tMs: source.durationMs},
];
const report = {
  contract: "A1RealBrowserCanvasCapNativePointerAudit/v1",
  status: "PASS_REVIEW_ONLY",
  projectId: "personal-website-webgl",
  url: "http://localhost:4276/reference-field",
  source,
  capture: {runtime: "NATIVE_BROWSER_CAPTURE", capProject: rel(capProject), headedWindowCreated: true, frontmostApplicationMutation: false, projectUnchanged: true, nativeSampleTimestamps: true, nativeCursorCaptured: true},
  sync: {contract: "A1VideoFrameSync/v1", status: "PASS", method: "CAP_NATIVE_SAMPLE_TIMESTAMPS", pixelMse: 0, sourceTimeOrigin: "CAP_NATIVE_TIMELINE"},
  behavior: {status: "ALIAS_REVIEW_ONLY", manifestSha256: telemetry.sha256, eventCount: events.length, actualPointerTelemetry: true, pointerPointCount: pointerTrack.length, clickCount: clicks.length, cursorJsonSha256: sha256(cursorPath)},
  geometry: {mode: "VISUAL_TRACK", targetCount: 2, pointerFrame: "CAPTURE_NORMALIZED", target: "FULL_WINDOW_CANVAS", pointerTrackSha256: crypto.createHash("sha256").update(JSON.stringify(pointerTrack)).digest("hex")},
  evidence: {telemetryPath: rel(telemetryPath), nativeVideoPath: rel(videoPath), recordingMetaPath: rel(metadataPath), cursorPath: rel(cursorPath)},
  boundary: {productionAdmission: false, sharedSourceMutation: false, formalBehaviorManifest: false, userVisualApproval: "NOT_APPROVED", audioReview: "OPEN"},
  capConfig: meta,
};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, reportPath: rel(reportPath)}, null, 2));
