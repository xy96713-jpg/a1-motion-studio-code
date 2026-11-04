#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";
const url = "http://localhost:4276/reference-field";
const outDir = path.join(root, "work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-virtual-display-canary-v1");
const capProject = path.join(outDir, "webgl-virtual-display.cap");
const output = path.join(outDir, "webgl-virtual-display.mp4");
const reportPath = path.join(outDir, "report.json");
const telemetryPath = path.join(outDir, "page-action-telemetry.json");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
const chromiumExecutable = [1234, 1228, 1223]
  .map((build) => `/Users/a1/Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find((candidate) => fs.existsSync(candidate));

if (!chromiumExecutable) throw new Error("webgl-virtual-display-chromium-missing");
await fsp.mkdir(outDir, {recursive: true});
const targets = JSON.parse(execFileSync(cap, ["targets", "--json"], {encoding: "utf8"}));
const screen = targets.screens.find((item) => item.name === "A1 Capture");
if (!screen || screen.primary || screen.logicalSize?.width !== 1920 || screen.logicalSize?.height !== 1080 || screen.refreshRate !== 60) throw new Error(`webgl-virtual-display-screen-invalid:${JSON.stringify(screen)}`);
if (fs.existsSync(capProject)) throw new Error(`webgl-virtual-display-output-exists:${capProject}`);

const profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "a1-webgl-virtual-display-"));
let context;
let stopped = false;
const events = [];
const pointerTrack = [];
try {
  context = await chromium.launchPersistentContext(profilePath, {
    executablePath: chromiumExecutable,
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--kiosk",
      "--window-position=1512,0",
      "--window-size=1920,1080",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.emulateMedia({reducedMotion: "no-preference"});
  await page.goto(url, {waitUntil: "networkidle", timeout: 90000});
  await page.setViewportSize({width: 1920, height: 1080});
  await page.waitForSelector('canvas[data-reference-field="flowmap"]', {state: "visible", timeout: 30000});
  await page.waitForFunction(() => document.querySelector('[data-reference-field-status]')?.getAttribute("data-mode") === "live", null, {timeout: 30000});
  const identity = await page.evaluate(() => {
    const canvas = document.querySelector('canvas[data-reference-field="flowmap"]');
    const rect = canvas?.getBoundingClientRect();
    const gl = canvas?.getContext("webgl");
    return {url: location.href, innerWidth, innerHeight, devicePixelRatio, webgl: Boolean(gl), status: document.querySelector('[data-reference-field-status]')?.getAttribute("data-mode"), canvasRect: rect ? {x: rect.x, y: rect.y, width: rect.width, height: rect.height} : null};
  });
  if (!identity.webgl || identity.innerWidth !== 1920 || identity.innerHeight !== 1080) throw new Error(`webgl-virtual-display-identity-failed:${JSON.stringify(identity)}`);
  const pageIdentityPath = path.join(outDir, "page-identity.png");
  await page.screenshot({path: pageIdentityPath});
  const start = JSON.parse(execFileSync(cap, ["record", "start", "--detach", "--screen", String(screen.id), "--fps", "60", "--duration", "8", "--path", capProject, "--json"], {encoding: "utf8"}));
  const t0 = performance.now();
  events.push({name: "capture_start", tMs: 0});
  const recordPoint = (x, y, kind = "move") => pointerTrack.push({tMs: Math.round(performance.now() - t0), x: Number((x / 1920).toFixed(6)), y: Number((y / 1080).toFixed(6)), kind});
  const glide = async (from, to, durationMs, name) => {
    const steps = Math.max(20, Math.round(durationMs / 16));
    for (let i = 1; i <= steps; i += 1) {
      const u = i / steps;
      const eased = u * u * (3 - 2 * u);
      const x = from.x + (to.x - from.x) * eased;
      const y = from.y + (to.y - from.y) * eased;
      await page.mouse.move(x, y);
      recordPoint(x, y);
      await sleep(durationMs / steps);
    }
    events.push({name, tMs: Math.round(performance.now() - t0), x: to.x / 1920, y: to.y / 1080});
  };
  await sleep(600);
  await glide({x: 1600, y: 860}, {x: 960, y: 560}, 900, "canvas_pointer_enter");
  await sleep(700);
  await page.mouse.down(); recordPoint(960, 560, "down"); events.push({name: "canvas_pointer_down", tMs: Math.round(performance.now() - t0), x: 0.5, y: 0.5185});
  await sleep(90);
  await page.mouse.up(); recordPoint(960, 560, "up"); events.push({name: "canvas_pointer_up", tMs: Math.round(performance.now() - t0), x: 0.5, y: 0.5185});
  await sleep(1100);
  await glide({x: 960, y: 560}, {x: 1480, y: 360}, 900, "canvas_pointer_retarget");
  await sleep(1100);
  events.push({name: "capture_end", tMs: Math.round(performance.now() - t0)});
  execFileSync(cap, ["record", "stop", "--path", capProject, "--json"], {encoding: "utf8"});
  stopped = true;
  const telemetry = {contract: "A1VirtualDisplayPageActionTelemetry/v1", provenance: "PLAYWRIGHT_PAGE_ACTIONS", screen: {name: screen.name, id: String(screen.id), width: 1920, height: 1080}, events, pointerTrack};
  telemetry.sha256 = crypto.createHash("sha256").update(JSON.stringify(telemetry)).digest("hex");
  await fsp.writeFile(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  const pageIdentity = {path: path.relative(root, pageIdentityPath), sha256: sha256(pageIdentityPath)};
  await fsp.writeFile(path.join(outDir, "capture-session.json"), `${JSON.stringify({contract: "A1VirtualDisplayCaptureSession/v1", screen, identity, pageIdentity, start, telemetryPath: path.relative(root, telemetryPath)}, null, 2)}\n`);
} finally {
  if (!stopped && fs.existsSync(capProject)) {
    try { execFileSync(cap, ["record", "stop", "--path", capProject, "--json"], {encoding: "utf8"}); } catch {}
  }
  await context?.close().catch(() => {});
  await fsp.rm(profilePath, {recursive: true, force: true}).catch(() => {});
}

if (!fs.existsSync(capProject)) throw new Error("webgl-virtual-display-cap-project-missing");
execFileSync(cap, ["export", capProject, output, "--format", "mp4", "--fps", "60", "--quality", "maximum"], {stdio: "inherit"});
const media = probe(output);
const video = media.streams.find((item) => item.codec_type === "video") || media.streams[0];
const decode = execFileSync(ffmpeg, ["-v", "error", "-i", output, "-f", "null", "-"], {encoding: "utf8"});
const report = {
  contract: "A1WebGLVirtualDisplayCapture/v1",
  status: video.width === 1920 && video.height === 1080 ? "PASS_REVIEW_ONLY" : "BLOCKED",
  projectId: "personal-website-webgl",
  url,
  captureScope: "DEDICATED_NON_PRIMARY_DISPLAY",
  captureMethod: "CAP_SCREEN_TARGET_ON_BETTERDISPLAY_VIRTUAL_SCREEN",
  virtualDisplay: {name: screen.name, id: String(screen.id), logicalSize: screen.logicalSize, physicalSize: screen.physicalSize, refreshRate: screen.refreshRate, primary: screen.primary},
  source: {path: path.relative(root, output), sha256: sha256(output), width: video.width, height: video.height, fps: video.r_frame_rate, durationMs: Math.round(Number(media.format.duration) * 1000), fullDecodePass: true},
  isolation: {browserChromeIncluded: false, macDockIncluded: false, otherDesktopWindowsIncluded: false, contentViewport: "1920x1080", sourceProjectOnly: true},
  behavior: {status: "ALIAS_REVIEW_ONLY", telemetryPath: path.relative(root, telemetryPath), pointerPointCount: pointerTrack.length, eventCount: events.length},
  boundary: {productionAdmission: false, sourceProjectMutation: false, formalBehaviorManifest: false, userVisualApproval: "NOT_APPROVED"},
};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
