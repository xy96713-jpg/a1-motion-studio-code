#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = process.env.A1_WRITING_WORKBENCH_URL || "http://127.0.0.1:8766/v2/";
const ffmpeg = process.env.A1_FFMPEG || path.join(root, ".tools/bin/ffmpeg");
const ffprobe = process.env.A1_FFPROBE || path.join(root, ".tools/bin/ffprobe");
const outputRoot = path.join(root, "work/cap-native-production-v2", `a1-virtual-display-cfr60-${new Date().toISOString().replace(/[:.]/gu, "-")}`);
const outputVideo = path.join(outputRoot, "project-window-cfr60.mp4");
const reportPath = path.join(outputRoot, "report.json");
const executablePath = [1234, 1228, 1223]
  .map((build) => `/Users/a1/Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find((candidate) => fs.existsSync(candidate));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fail = (message) => { throw new Error(message); };
if (!executablePath) fail("virtual-display-cfr60-chromium-missing");
if (!fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) fail("virtual-display-cfr60-ffmpeg-tools-missing");
fs.mkdirSync(outputRoot, {recursive: true});
const listedDevices = spawnSync(ffmpeg, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], {encoding: "utf8"});
const deviceOutput = `${listedDevices.stdout || ""}\n${listedDevices.stderr || ""}`;
const screenMatch = deviceOutput.match(/\[(\d+)\]\s+Capture screen 1/u);
if (!screenMatch) fail("virtual-display-cfr60-screen-1-not-enumerated");
const screenDeviceIndex = Number(screenMatch[1]);
const title = `A1 稿台 · CFR60 Canary · ${crypto.randomBytes(6).toString("hex")}`;
const profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "a1-virtual-display-cfr60-"));
let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [`--app=${baseUrl}`, "--window-size=1920,1080", "--window-position=1600,0", "--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.waitForLoadState("networkidle", {timeout: 60000});
  await page.waitForSelector("#editor", {state: "visible", timeout: 60000});
  await page.evaluate((nextTitle) => { document.title = nextTitle; }, title);
  const domIdentity = await page.evaluate(() => ({editor: Boolean(document.querySelector("#editor")), finalReview: Boolean(document.querySelector("#finalReviewButton")), presentation: Boolean(document.querySelector("#presentDraft")), viewport: {width: innerWidth, height: innerHeight}}));
  if (!domIdentity.editor || !domIdentity.finalReview || !domIdentity.presentation) fail(`virtual-display-cfr60-dom-identity-failed:${JSON.stringify(domIdentity)}`);
  const command = ["-hide_banner", "-loglevel", "warning", "-y", "-f", "avfoundation", "-framerate", "60", "-video_size", "1920x1080", "-capture_cursor", "0", "-capture_mouse_clicks", "0", "-drop_late_frames", "0", "-i", `${screenDeviceIndex}:none`, "-t", "5", "-an", "-c:v", "h264_videotoolbox", "-b:v", "24M", "-pix_fmt", "yuv420p", "-r", "60", "-vsync", "cfr", "-movflags", "+faststart", outputVideo];
  console.log(`CAPTURE_START method=AVFOUNDATION_VIRTUAL_DISPLAY_CFR60 screen=Capture screen 1 index=${screenDeviceIndex}`);
  const result = spawnSync(ffmpeg, command, {encoding: "utf8", stdio: ["ignore", "inherit", "inherit"]});
  if (result.status !== 0) fail(`virtual-display-cfr60-ffmpeg-failed:${result.status}`);
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames:format=duration,size", "-of", "json", outputVideo], {encoding: "utf8"}));
  const video = probe.streams.find((stream) => stream.codec_type === "video") || probe.streams[0];
  const duration = Number(probe.format.duration);
  const frameCount = Number(video.nb_read_frames || video.nb_frames);
  if (video.width !== 1920 || video.height !== 1080 || video.r_frame_rate !== "60/1" || frameCount < Math.floor(duration * 59.5)) fail(`virtual-display-cfr60-probe-failed:${JSON.stringify({video, duration, frameCount})}`);
  const decode = spawnSync(ffmpeg, ["-v", "error", "-i", outputVideo, "-f", "null", "-"], {encoding: "utf8"});
  if (decode.status !== 0) fail(`virtual-display-cfr60-decode-failed:${decode.stderr}`);
  const report = {contract: "A1VirtualDisplayCfr60CaptureCanary/v1", status: "PASS", captureScope: "DEDICATED_NON_PRIMARY_DISPLAY", captureMethod: "AVFOUNDATION_VIRTUAL_DISPLAY_CFR60", virtualDisplay: {name: "A1 Capture", avfoundationDevice: `Capture screen 1`, screenDeviceIndex, resolution: "1920x1080", refreshRate: 60}, target: {url: baseUrl, titleSha256: crypto.createHash("sha256").update(title).digest("hex")}, domIdentity, source: {path: path.relative(root, outputVideo), sha256: sha256(outputVideo), width: video.width, height: video.height, rFrameRate: video.r_frame_rate, avgFrameRate: video.avg_frame_rate, frameCount, durationSeconds: duration, fullDecodePass: true}, capBridge: {available: fs.existsSync(path.join(root, "work/cap-native-production-v2/a1-cfr-cap-adapter-canary.cap")), method: "CAP_SHELL_PROJECT_PLUS_VERIFIED_CFR_DISPLAY_TRACK"}, productionAdmission: false, userVisualApproval: "NOT_APPROVED", generatedAt: new Date().toISOString()};
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
} finally {
  await context?.close().catch(() => {});
  await fsp.rm(profilePath, {recursive: true, force: true}).catch(() => {});
}
