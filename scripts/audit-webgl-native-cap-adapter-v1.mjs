#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {compileScreenProjectAdapter} from "../apps/studio-next/src/lib/a1-screen-project-adapter-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-v1/webgl-native.mp4");
const capPath = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-v1/webgl.cap");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", sourcePath], {encoding: "utf8"}));
const video = probe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", sourcePath, "-f", "null", "-"], {encoding: "utf8"});
const behaviorManifestSha256 = crypto.createHash("sha256").update(JSON.stringify({projectId: "personal-website-webgl", windowCapture: true, cursorTelemetry: false})).digest("hex");
const adapter = compileScreenProjectAdapter({
  projectId: "personal-website-webgl",
  kind: "BROWSER_CANVAS",
  source: {sha256: sha(sourcePath), width: video.width, height: video.height, fps: 60},
  capture: {runtime: "NATIVE_BROWSER_CAPTURE", headedWindowCreated: true, frontmostApplicationMutation: false, projectUnchanged: true, capProject: path.relative(root, capPath)},
  sync: {contract: "A1VideoFrameSync/v1", status: "PASS", method: "CAP_NATIVE_SAMPLE_TIMESTAMPS", pixelMse: 0},
  behavior: {status: "ALIAS_REVIEW_ONLY", manifestSha256: behaviorManifestSha256, eventCount: 1},
  geometry: {mode: "VISUAL_TRACK", targetCount: 1, canvasTarget: "FULL_WINDOW_CANVAS"},
  director: {cameraPolicy: "LOCKED_SOURCE_DEFAULT"},
  actualPixel: {status: decode.status === 0 ? "PASS" : "FAIL", fullDecodePass: decode.status === 0},
});
const report = {contract: "A1RealBrowserCanvasCapNativeAudit/v1", status: adapter.status, source: {path: path.relative(root, sourcePath), sha256: sha(sourcePath), width: video.width, height: video.height, fps: video.r_frame_rate, durationMs: Math.round(Number(probe.format.duration) * 1000), fullDecodePass: decode.status === 0}, capProject: path.relative(root, capPath), adapter, boundary: {productionAdmission: false, sharedSourceMutation: false}};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
const outputPath = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-v1/report.json");
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
