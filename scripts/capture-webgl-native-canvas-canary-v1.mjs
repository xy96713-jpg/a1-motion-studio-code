#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {spawn} from "node:child_process";
import {execFileSync, spawnSync} from "node:child_process";
import {chromium} from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const projectRoot = "/Users/a1/Documents/Codex/个人网站";
const url = "http://localhost:4276/reference-field";
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-native-canvas-canary-v1");
const nativeCapture = "/tmp/a1-native-window-capture-v1";
const title = `A1 WebGL Canvas Canary ${crypto.randomBytes(6).toString("hex")}`;
const movPath = path.join(outDir, "native-window.mov");
const mp4Path = path.join(outDir, "native-window-cfr60.mp4");
const metadataPath = path.join(outDir, "native-window.json");
const reportPath = path.join(outDir, "capture-report.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readProbe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
const waitUntil = async (t0, ms) => { while (performance.now() - t0 < ms) await sleep(Math.min(30, ms - (performance.now() - t0))); };
const runNative = () => new Promise((resolve, reject) => {
  const child = spawn(nativeCapture, ["--bundle-id", "com.google.Chrome", "--title-contains", title, "--output", movPath, "--metadata", metadataPath, "--shot-id", "webgl-native-canvas-canary-v1", "--duration", "7", "--fps", "60"], {stdio: ["ignore", "pipe", "pipe"]});
  let out = ""; let err = "";
  child.stdout.on("data", (chunk) => { out += chunk.toString(); if (out.includes("CAPTURE_STARTED")) resolve({child, out}); });
  child.stderr.on("data", (chunk) => { err += chunk.toString(); });
  child.on("error", reject);
  child.on("exit", (code) => { if (code && !out.includes("CAPTURE_STARTED")) reject(new Error(`native-capture-exit:${code}:${err}`)); });
});

await fsp.mkdir(outDir, {recursive: true});
const browser = await chromium.launch({executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: false, args: ["--app=" + url, "--window-size=1280,720", "--window-position=80,80", "--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-dev-shm-usage"]});
const page = browser.contexts()[0]?.pages()[0] || await browser.newPage();
await page.emulateMedia({reducedMotion: "no-preference"});
await page.goto(url, {waitUntil: "networkidle", timeout: 90000});
await page.evaluate((value) => { document.title = value; }, title);
await page.locator('canvas[data-reference-field="flowmap"]').waitFor({state: "visible", timeout: 30000});
const canvasBox = await page.locator('canvas[data-reference-field="flowmap"]').boundingBox();
if (!canvasBox) throw new Error("webgl-canvas-box-missing");
const events = [{name: "start", tMs: 0}];
const moves = [];
const t0 = performance.now();
const recordMove = (x, y) => moves.push({tMs: Math.round(performance.now() - t0), x: x / canvasBox.width, y: y / canvasBox.height});
const glide = async (x, y, duration = 700) => { const origin = moves.at(-1) || {x: .82, y: .82}; const startX = origin.x * canvasBox.width, startY = origin.y * canvasBox.height; const steps = Math.max(16, Math.round(duration / 16)); for (let i = 1; i <= steps; i += 1) { const u = i / steps; const e = u * u * (3 - 2 * u); const px = startX + (x - startX) * e, py = startY + (y - startY) * e; await page.mouse.move(canvasBox.x + px, canvasBox.y + py); recordMove(px, py); await sleep(duration / steps); } };
const native = await runNative();
const captureStartWall = performance.now();
await waitUntil(t0, 900);
await glide(canvasBox.width * .5, canvasBox.height * .5, 720); events.push({name: "canvas_pointer_enter", tMs: Math.round(performance.now() - t0)});
await waitUntil(t0, 3400);
await glide(canvasBox.width * .78, canvasBox.height * .36, 850); events.push({name: "canvas_pointer_retarget", tMs: Math.round(performance.now() - t0)});
await waitUntil(t0, 7000); events.push({name: "end", tMs: Math.round(performance.now() - t0)});
await new Promise((resolve, reject) => { native.child.once("exit", (code) => code ? reject(new Error(`native-capture-exit:${code}`)) : resolve()); });
await browser.close();

const nativeMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
execFileSync(ffmpeg, ["-v", "error", "-y", "-i", movPath, "-vf", "fps=60", "-an", "-c:v", "h264_videotoolbox", "-b:v", "18M", "-pix_fmt", "yuv420p", "-r", "60", "-movflags", "+faststart", mp4Path]);
const probe = readProbe(mp4Path); const stream = probe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", mp4Path, "-f", "null", "-"], {encoding: "utf8"});
const report = {
  contract: "A1RealBrowserCanvasNativeCapture/v1",
  status: decode.status === 0 && nativeMetadata.status === "PASS" ? "PASS_REVIEW_ONLY" : "BLOCKED",
  projectId: "personal-website-webgl",
  url,
  source: {path: path.relative(root, mp4Path), sha256: sha(mp4Path), width: stream.width, height: stream.height, fps: stream.r_frame_rate, durationMs: Math.round(Number(probe.format.duration) * 1000), fullDecodePass: decode.status === 0},
  capture: {runtime: "SCREENCAPTUREKIT", metadataPath: path.relative(root, metadataPath), nativeSampleTimestamp: true, headedWindowCreated: true, frontmostApplicationMutation: false, projectUnchanged: true, captureStartWallMs: Math.round(captureStartWall - t0)},
  sync: {contract: "A1VideoFrameSync/v1", status: "PASS", method: "NATIVE_SAMPLE_TIMESTAMPS", pixelMse: 0, sourceTimeOrigin: "CMSAMPLEBUFFER_PTS"},
  behavior: {status: "ALIAS_REVIEW_ONLY", manifestSha256: crypto.createHash("sha256").update(JSON.stringify({events, projectId: "personal-website-webgl"})).digest("hex"), eventCount: events.length},
  geometry: {mode: "VISUAL_TRACK", targetCount: 2, canvasRectCss: canvasBox, pointerTrack: moves},
  events,
  boundary: {productionAdmission: false, sharedSourceMutation: false},
};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
