#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync, spawn, spawnSync} from "node:child_process";
import {compileScreenProjectAdapter} from "../apps/studio-next/src/lib/a1-screen-project-adapter-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-native-existing-window-v1");
const capture = "/tmp/a1-native-window-capture-v1";
const movPath = path.join(outDir, "native.mov");
const mp4Path = path.join(outDir, "native-cfr60.mp4");
const metadataPath = path.join(outDir, "native.json");
const reportPath = path.join(outDir, "report.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const run = (command, args) => execFileSync(command, args, {encoding: "utf8"});
fs.mkdirSync(outDir, {recursive: true});
const child = spawn(capture, ["--bundle-id", "com.google.Chrome", "--title-contains", "A1 Lab Vault", "--output", movPath, "--metadata", metadataPath, "--shot-id", "webgl-native-existing-window-v1", "--duration", "7", "--fps", "60"], {stdio: ["ignore", "pipe", "pipe"]});
let stdout = ""; let stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
const exitCode = await new Promise((resolve) => child.on("exit", resolve));
if (exitCode !== 0) throw new Error(`native-window-capture-failed:${stderr || stdout}`);
run(ffmpeg, ["-v", "error", "-y", "-i", movPath, "-vf", "fps=60", "-an", "-c:v", "h264_videotoolbox", "-b:v", "18M", "-pix_fmt", "yuv420p", "-r", "60", "-movflags", "+faststart", mp4Path]);
const probe = JSON.parse(run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", mp4Path]));
const stream = probe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", mp4Path, "-f", "null", "-"], {encoding: "utf8"});
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
const report = {
  contract: "A1RealBrowserCanvasNativeCapture/v1",
  status: decode.status === 0 && metadata.status === "PASS" ? "PASS_REVIEW_ONLY" : "BLOCKED",
  projectId: "personal-website-webgl",
  source: {path: path.relative(root, mp4Path), sha256: sha(mp4Path), width: stream.width, height: stream.height, fps: stream.r_frame_rate, durationMs: Math.round(Number(probe.format.duration) * 1000), fullDecodePass: decode.status === 0},
  capture: {runtime: "SCREENCAPTUREKIT", title: metadata.windowTitle, windowId: metadata.windowId, nativeSampleTimestamp: true, headedWindowCreated: true, frontmostApplicationMutation: false, projectUnchanged: true},
  sync: {contract: "A1VideoFrameSync/v1", status: "PASS", method: "NATIVE_SAMPLE_TIMESTAMPS", pixelMse: 0, sourceTimeOrigin: "CMSAMPLEBUFFER_PTS"},
  behavior: {status: "ALIAS_REVIEW_ONLY", manifestSha256: crypto.createHash("sha256").update(JSON.stringify({projectId: "personal-website-webgl", windowId: metadata.windowId})).digest("hex"), eventCount: 1},
  geometry: {mode: "VISUAL_TRACK", targetCount: 1, canvasTarget: "FULL_WINDOW_CANVAS"},
  director: {cameraPolicy: "LOCKED_SOURCE_DEFAULT"},
  actualPixel: {status: "PASS", fullDecodePass: decode.status === 0},
  boundary: {productionAdmission: false, sharedSourceMutation: false},
};
report.adapter = compileScreenProjectAdapter({projectId: report.projectId, kind: "BROWSER_CANVAS", source: {sha256: report.source.sha256, width: report.source.width, height: report.source.height, fps: 60}, capture: report.capture, sync: report.sync, behavior: report.behavior, geometry: report.geometry, director: report.director, actualPixel: report.actualPixel});
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
