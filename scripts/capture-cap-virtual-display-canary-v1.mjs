#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";
const baseUrl = process.env.A1_WRITING_WORKBENCH_URL || "http://127.0.0.1:8766/v2/";
const runId = new Date().toISOString().replace(/[:.]/gu, "-");
const outputRoot = path.join(root, "work/cap-native-production-v2", `a1-cap-virtual-display-canary-${runId}`);
const projectPath = path.join(outputRoot, "recording.cap");
const reportPath = path.join(outputRoot, "report.json");
const executablePath = [1234, 1228, 1223]
  .map((build) => `/Users/a1/Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find((candidate) => fs.existsSync(candidate));
const ffprobe = process.env.A1_FFPROBE || path.join(root, ".tools/bin/ffprobe");
const ffmpeg = process.env.A1_FFMPEG || path.join(root, ".tools/bin/ffmpeg");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (!fs.existsSync(cap) || !fs.existsSync(ffprobe) || !fs.existsSync(ffmpeg)) throw new Error("cap-virtual-display-canary-tool-missing");
if (!executablePath) throw new Error("cap-virtual-display-canary-chromium-missing");
fs.mkdirSync(outputRoot, {recursive: true});
const targets = JSON.parse(execFileSync(cap, ["targets", "--json"], {encoding: "utf8"}));
const screen = targets.screens.find((item) => item.name === "A1 Capture");
if (!screen) throw new Error("cap-virtual-display-canary-screen-missing");
if (screen.primary || screen.logicalSize?.width !== 1920 || screen.logicalSize?.height !== 1080 || screen.refreshRate !== 60) throw new Error(`cap-virtual-display-canary-screen-invalid:${JSON.stringify(screen)}`);
const title = `A1 Capture Canary ${crypto.randomBytes(6).toString("hex")}`;
const profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "a1-cap-virtual-display-canary-"));
let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {executablePath, headless: false, ignoreDefaultArgs: ["--enable-automation"], args: ["--kiosk", "--window-position=1512,0", "--window-size=1920,1080", "--disable-blink-features=AutomationControlled"]});
  const page = context.pages()[0] || await context.newPage();
  await page.goto(baseUrl, {waitUntil: "networkidle", timeout: 60000});
  await page.waitForSelector("#editor", {state: "visible", timeout: 60000});
  await page.evaluate((nextTitle) => { document.title = nextTitle; }, title);
  const domIdentity = await page.evaluate(() => ({editor: Boolean(document.querySelector("#editor")), finalReview: Boolean(document.querySelector("#finalReviewButton")), presentation: Boolean(document.querySelector("#presentDraft")), viewport: {width: innerWidth, height: innerHeight}, outer: {width: outerWidth, height: outerHeight}}));
  if (!domIdentity.editor || !domIdentity.finalReview || !domIdentity.presentation) throw new Error(`cap-virtual-display-canary-dom-failed:${JSON.stringify(domIdentity)}`);
  console.log(`CAP_VIRTUAL_DISPLAY_START screen=${screen.id} name=${screen.name} size=${screen.logicalSize.width}x${screen.logicalSize.height}`);
  const output = execFileSync(cap, ["record", "start", "--screen", String(screen.id), "--fps", "60", "--duration", "5", "--path", projectPath, "--json"], {encoding: "utf8"});
  console.log(output.trim());
  const validation = JSON.parse(execFileSync(cap, ["project", "validate", projectPath, "--json"], {encoding: "utf8"}));
  if (!validation.valid || validation.missing?.length) throw new Error(`cap-virtual-display-canary-project-invalid:${JSON.stringify(validation)}`);
  const meta = JSON.parse(fs.readFileSync(path.join(projectPath, "recording-meta.json"), "utf8"));
  const displayRelative = meta.segments?.[0]?.display?.path || "content/segments/segment-0/display.mp4";
  const displayPath = path.join(projectPath, displayRelative);
  if (!fs.existsSync(displayPath)) throw new Error("cap-virtual-display-canary-display-track-missing");
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames:format=duration,size", "-of", "json", displayPath], {encoding: "utf8"}));
  const video = probe.streams.find((stream) => stream.codec_type === "video") || probe.streams[0];
  const duration = Number(probe.format.duration);
  const frames = Number(video.nb_read_frames || video.nb_frames);
  if (video.width !== 1920 || video.height !== 1080 || frames < Math.floor(duration * 20)) throw new Error(`cap-virtual-display-canary-video-invalid:${JSON.stringify({video, duration, frames})}`);
  const decode = execFileSync(ffmpeg, ["-v", "error", "-i", displayPath, "-f", "null", "-"], {encoding: "utf8"});
  const report = {contract: "A1CapVirtualDisplayScreenCaptureCanary/v1", status: "PASS", captureScope: "DEDICATED_NON_PRIMARY_DISPLAY", captureMethod: "CAP_SCREEN_TARGET_ON_BETTERDISPLAY_VIRTUAL_SCREEN", virtualDisplay: {name: screen.name, displayId: String(screen.id), logicalSize: screen.logicalSize, physicalSize: screen.physicalSize, refreshRate: screen.refreshRate, primary: screen.primary}, target: {url: baseUrl, titleSha256: crypto.createHash("sha256").update(title).digest("hex")}, domIdentity, capProject: {path: path.relative(root, projectPath), valid: validation.valid, displayTrack: path.relative(root, displayPath), projectValidation: validation}, source: {sha256: sha256(displayPath), width: video.width, height: video.height, rFrameRate: video.r_frame_rate, avgFrameRate: video.avg_frame_rate, frameCount: frames, durationSeconds: duration, fullDecodePass: true, rawOutput: decode}, productionAdmission: false, userVisualApproval: "NOT_APPROVED", generatedAt: new Date().toISOString()};
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
} finally {
  await context?.close().catch(() => {});
  await fsp.rm(profilePath, {recursive: true, force: true}).catch(() => {});
}
