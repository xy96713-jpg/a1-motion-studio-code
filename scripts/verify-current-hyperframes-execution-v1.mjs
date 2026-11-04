#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = path.join(root, "work/current-hyperframes-storyboard-execution-v1");
const manifestPath = path.join(projectRoot, "execution-manifest.json");
const currentVideoPath = path.join(projectRoot, "review-only-current-storyboard.mp4");
const archivedVideos = fs.existsSync(path.join(projectRoot, "revisions"))
  ? fs.readdirSync(path.join(projectRoot, "revisions")).filter((file) => file.endsWith(".mp4")).sort().map((file) => path.join(projectRoot, "revisions", file))
  : [];
const videoPath = fs.existsSync(currentVideoPath) ? currentVideoPath : archivedVideos.at(-1);
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (!videoPath) throw new Error("current-hyperframes-render-missing");
const declaredShotCount = Number(manifest.shotCount || manifest.source?.shotCount || manifest.shots?.length || 0);
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,r_frame_rate,nb_frames", "-of", "json", videoPath], {encoding: "utf8"}));
const stream = probe.streams?.[0] || {};
const durationSeconds = Number(probe.format?.duration || 0);
const expectedDurationSeconds = Number(manifest.hyperframes.durationMs) / 1000;
const failures = [];
const check = (id, condition, detail) => { if (!condition) failures.push({id, detail}); };
check("manifest-contract", manifest.contract === "A1HyperFramesStoryboardExecutionProject/v1", manifest.contract);
check("shot-count", declaredShotCount === 34 && manifest.shots.length === 34, declaredShotCount);
check("composition-count", fs.readdirSync(path.join(projectRoot, "compositions")).filter((file) => file.endsWith(".html")).length === 34, projectRoot);
check("root-timeline", fs.readFileSync(path.join(projectRoot, "index.html"), "utf8").includes('window.__timelines["a1-current-storyboard"]'), "index.html");
check("workspace-binding", /^[a-f0-9]{64}$/u.test(manifest.source.workspaceSha256), manifest.source.workspaceSha256);
check("review-only", manifest.renderPolicy.reviewOnly === true && manifest.renderPolicy.productionAdmission === false && manifest.renderPolicy.finalRenderAllowed === false, manifest.renderPolicy);
check("video-exists", fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0, videoPath);
check("video-resolution", stream.width === 1920 && stream.height === 1080, {width: stream.width, height: stream.height});
check("video-fps", stream.r_frame_rate === "30/1", stream.r_frame_rate);
check("video-duration", Math.abs(durationSeconds - expectedDurationSeconds) < 0.1, {durationSeconds, expectedDurationSeconds});
check("video-frames", Number(stream.nb_frames) === 6552, stream.nb_frames);
const report = {contract: "A1HyperFramesExecutionVerification/v1", status: failures.length ? "FAIL" : "PASS", projectRoot: path.relative(root, projectRoot), sourceWorkspaceSha256: manifest.source.workspaceSha256, shotCount: declaredShotCount, compositionCount: 34, timelineDurationMs: manifest.hyperframes.durationMs, output: {path: path.relative(root, videoPath), sha256: sha256File(videoPath), bytes: fs.statSync(videoPath).size, durationSeconds, width: stream.width, height: stream.height, fps: stream.r_frame_rate, frames: Number(stream.nb_frames)}, policy: manifest.renderPolicy, failures};
fs.writeFileSync(path.join(projectRoot, "execution-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
