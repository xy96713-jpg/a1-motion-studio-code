#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const url = "http://localhost:4276/reference-field";
const runTag = process.env.A1_VIEWPORT_TAG || "v1";
const outDir = path.join(root, `work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-viewport-screencast-${runTag}`);
const frameDir = path.join(outDir, "frames");
const output = path.join(outDir, "webgl-viewport-only.mp4");
const reportPath = path.join(outDir, "report.json");
const telemetryPath = path.join(outDir, "page-action-telemetry.json");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const chromiumExecutable = [1234, 1228, 1223]
  .map((build) => `/Users/a1/Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find((candidate) => fs.existsSync(candidate));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (!chromiumExecutable) throw new Error("webgl-viewport-screencast-chromium-missing");
await fsp.mkdir(frameDir, {recursive: true});

const context = await chromium.launchPersistentContext(await fsp.mkdtemp(path.join(os.tmpdir(), "a1-webgl-viewport-only-")), {
  executablePath: chromiumExecutable,
  headless: false,
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--kiosk", "--window-position=1512,0", "--window-size=1920,1080", "--disable-blink-features=AutomationControlled", "--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check"],
});
const page = context.pages()[0] || await context.newPage();
const events = [];
const pointerTrack = [];
const frames = [];
const packets = [];
let frameIndex = 0;
let cdp;
try {
  await page.emulateMedia({reducedMotion: "no-preference"});
  await page.goto(url, {waitUntil: "networkidle", timeout: 90000});
  await page.setViewportSize({width: 1920, height: 1080});
  await page.waitForSelector('canvas[data-reference-field="flowmap"]', {state: "visible", timeout: 30000});
  await page.waitForFunction(() => document.querySelector('[data-reference-field-status]')?.getAttribute("data-mode") === "live", null, {timeout: 30000});
  const identity = await page.evaluate(() => ({innerWidth, innerHeight, devicePixelRatio, url: location.href, status: document.querySelector('[data-reference-field-status]')?.getAttribute("data-mode"), webgl: Boolean(document.querySelector('canvas[data-reference-field="flowmap"]')?.getContext("webgl"))}));
  if (!identity.webgl || identity.innerWidth !== 1920 || identity.innerHeight !== 1080) throw new Error(`webgl-viewport-only-identity-failed:${JSON.stringify(identity)}`);
  const pageIdentityPath = path.join(outDir, "page-identity.png");
  await page.screenshot({path: pageIdentityPath});
  cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({data, metadata, sessionId}) => {
    frameIndex += 1;
    packets.push({data, timestamp: metadata?.timestamp ?? null});
    void cdp.send("Page.screencastFrameAck", {sessionId});
  });
  await cdp.send("Page.startScreencast", {format: "jpeg", quality: 96, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1});
  const t0 = performance.now();
  events.push({name: "capture_start", tMs: 0});
  const recordPoint = (x, y, kind = "move") => pointerTrack.push({tMs: Math.round(performance.now() - t0), x: Number((x / 1920).toFixed(6)), y: Number((y / 1080).toFixed(6)), kind});
  const glide = async (from, to, durationMs, name) => {
    const steps = Math.max(5, Math.round(durationMs / 120));
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
  await sleep(250);
  await glide({x: 1600, y: 860}, {x: 960, y: 560}, 600, "canvas_pointer_enter");
  await sleep(250);
  await page.mouse.down(); recordPoint(960, 560, "down"); events.push({name: "canvas_pointer_down", tMs: Math.round(performance.now() - t0), x: 0.5, y: 0.5185});
  await sleep(90);
  await page.mouse.up(); recordPoint(960, 560, "up"); events.push({name: "canvas_pointer_up", tMs: Math.round(performance.now() - t0), x: 0.5, y: 0.5185});
  await sleep(500);
  await glide({x: 960, y: 560}, {x: 1480, y: 360}, 600, "canvas_pointer_retarget");
  await sleep(1200);
  events.push({name: "capture_end", tMs: Math.round(performance.now() - t0)});
  await sleep(250);
  await cdp.send("Page.stopScreencast");
  for (const [index, packet] of packets.entries()) {
    const file = path.join(frameDir, `frame-${String(index).padStart(6, "0")}.jpg`);
    await fsp.writeFile(file, Buffer.from(packet.data, "base64"));
    frames.push({file, timestamp: packet.timestamp});
  }
  const telemetry = {contract: "A1ViewportPageActionTelemetry/v1", provenance: "PLAYWRIGHT_PAGE_ACTIONS", viewport: {width: 1920, height: 1080}, events, pointerTrack};
  telemetry.sha256 = crypto.createHash("sha256").update(JSON.stringify(telemetry)).digest("hex");
  await fsp.writeFile(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  await fsp.writeFile(path.join(outDir, "capture-session.json"), `${JSON.stringify({contract: "A1ViewportScreencastSession/v1", identity, frameCount: frames.length, firstFrame: frames[0], lastFrame: frames.at(-1), pageIdentity: {path: path.relative(root, pageIdentityPath), sha256: sha256(pageIdentityPath)}}, null, 2)}\n`);
} finally {
  await cdp?.detach().catch(() => {});
  await context.close().catch(() => {});
}

if (frames.length < 30) throw new Error(`webgl-viewport-only-frame-count-low:${frames.length}`);
execFileSync(ffmpeg, ["-v", "error", "-y", "-framerate", "60", "-i", path.join(frameDir, "frame-%06d.jpg"), "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "60", "-movflags", "+faststart", output], {stdio: "inherit"});
const media = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", output], {encoding: "utf8"}));
const video = media.streams.find((item) => item.codec_type === "video") || media.streams[0];
const decode = execFileSync(ffmpeg, ["-v", "error", "-i", output, "-f", "null", "-"], {encoding: "utf8"});
const report = {contract: "A1WebGLViewportOnlyScreencast/v1", status: video.width === 1920 && video.height === 1080 ? "PASS_REVIEW_ONLY" : "BLOCKED", projectId: "personal-website-webgl", url, captureScope: "BROWSER_VIEWPORT_ONLY", captureMethod: "CHROME_CDP_PAGE_SCREENCAST", source: {path: path.relative(root, output), sha256: sha256(output), width: video.width, height: video.height, fps: video.r_frame_rate, durationMs: Math.round(Number(media.format.duration) * 1000), frameCount: Number(video.nb_read_frames), fullDecodePass: decode === ""}, isolation: {browserChromeIncluded: false, macDockIncluded: false, otherDesktopWindowsIncluded: false, sourceProjectOnly: true, viewport: "1920x1080"}, behavior: {status: "ALIAS_REVIEW_ONLY", telemetryPath: path.relative(root, telemetryPath), pointerPointCount: pointerTrack.length, eventCount: events.length, nativeCursor: false}, boundary: {productionAdmission: false, sourceProjectMutation: false, formalBehaviorManifest: false, userVisualApproval: "NOT_APPROVED"}};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
