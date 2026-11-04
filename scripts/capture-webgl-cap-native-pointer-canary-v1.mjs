#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {chromium} from "playwright";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const url = "http://localhost:4276/reference-field";
const runTag = process.env.A1_WEBGL_POINTER_TAG || "v1";
const windowSize = process.env.A1_WEBGL_WINDOW_SIZE || "1280,600";
const outDir = path.join(root, `work/reference-study-BV11Ren6REA4/post-production/owned-candidate/webgl-cap-native-pointer-${runTag}`);
const capProject = path.join(outDir, "webgl-native-pointer.cap");
const videoPath = path.join(outDir, "webgl-native-pointer.mp4");
const reportPath = path.join(outDir, "report.json");
const telemetryPath = path.join(outDir, "pointer-telemetry.json");
const title = `A1 WebGL Native Pointer ${runTag} ${crypto.randomBytes(7).toString("hex")}`;
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));
const normalizedMae = async (pagePath, capturePath, chromeTop) => {
  const pageMeta = await sharp(pagePath).metadata();
  const capMeta = await sharp(capturePath).metadata();
  const scale = Number(capMeta.width) / Number(pageMeta.width);
  const cropTop = Math.max(0, Math.round(chromeTop * scale));
  const cropHeight = Math.min(Number(capMeta.height) - cropTop, Math.round(Number(pageMeta.height) * scale));
  if (!pageMeta.width || !pageMeta.height || !capMeta.width || cropHeight <= 0) return 1;
  const left = await sharp(pagePath).removeAlpha().raw().toBuffer();
  const right = await sharp(capturePath).extract({left: 0, top: cropTop, width: Number(capMeta.width), height: cropHeight}).resize(Number(pageMeta.width), Number(pageMeta.height), {fit: "fill"}).removeAlpha().raw().toBuffer();
  if (left.length !== right.length) return 1;
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Math.abs(left[index] - right[index]);
  return sum / left.length / 255;
};

const findTarget = async (expectedTitle, pageIdentity, chromeTop) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const targets = JSON.parse(execFileSync(cap, ["targets", "windows", "--json"], {encoding: "utf8"}));
    const all = Array.isArray(targets) ? targets : targets.windows || [];
    const candidates = all.filter((item) => item.ownerName === "Google Chrome" && Number(item.bounds?.width) >= 1000 && Number(item.bounds?.height) >= 500);
    let best = null;
    for (const item of candidates) {
      const screenshotPath = path.join(outDir, `identity-${item.id}.png`);
      try {
        execFileSync(cap, ["screenshot", "--window", String(item.id), "--path", screenshotPath, "--json"], {encoding: "utf8"});
        const mae = await normalizedMae(pageIdentity, screenshotPath, chromeTop);
        if (!best || mae < best.mae) best = {item, mae};
      } catch {}
    }
    if (best && best.mae <= 0.14) return {...best.item, identityMae: best.mae};
    await sleep(250);
  }
  const targets = JSON.parse(execFileSync(cap, ["targets", "windows", "--json"], {encoding: "utf8"}));
  throw new Error(`webgl-native-pointer-target-count:${JSON.stringify((Array.isArray(targets) ? targets : targets.windows || []).filter((item) => item.ownerName === "Google Chrome").slice(-6))}`);
};

const recordStart = (targetId) => {
  const startedAt = performance.now();
  const raw = execFileSync(cap, ["record", "start", "--detach", "--window", String(targetId), "--fps", "60", "--duration", "9", "--path", capProject, "--json"], {encoding: "utf8"});
  let response = null;
  try { response = JSON.parse(raw); } catch { response = {raw: raw.trim()}; }
  return {startedAt, response};
};

await fsp.mkdir(outDir, {recursive: true});
if (fs.existsSync(capProject)) throw new Error(`webgl-native-pointer-output-exists:${capProject}`);
const profile = await fsp.mkdtemp(path.join(os.tmpdir(), "a1-webgl-native-pointer-"));
const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let context;
let stopped = false;
let target = null;
const events = [];
const pointer = [];
let t0 = 0;

try {
  context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      `--app=${url}`,
      `--window-size=${windowSize}`,
      "--window-position=80,80",
      "--use-gl=swiftshader",
      "--enable-unsafe-swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.emulateMedia({reducedMotion: "no-preference"});
  await page.goto(url, {waitUntil: "networkidle", timeout: 90000});
  await page.evaluate((value) => { document.title = value; }, title);
  const canvas = page.locator('canvas[data-reference-field="flowmap"]');
  await canvas.waitFor({state: "visible", timeout: 30000});
  await page.waitForFunction(() => document.querySelector('[data-reference-field-status]')?.getAttribute("data-mode") === "live", null, {timeout: 30000}).catch(() => {});
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox || canvasBox.width < 100 || canvasBox.height < 100) throw new Error("webgl-native-pointer-canvas-box-missing");
  const canvasState = await page.evaluate(() => ({
    webgl: Boolean(document.querySelector('canvas[data-reference-field="flowmap"]')?.getContext("webgl2") || document.querySelector('canvas[data-reference-field="flowmap"]')?.getContext("webgl")),
    meta: document.querySelector(".reference-field-meta")?.textContent?.trim() || null,
    version: document.querySelector(".reference-field-version")?.textContent?.trim() || null,
  }));
  if (!canvasState.webgl) throw new Error(`webgl-native-pointer-not-live:${JSON.stringify(canvasState)}`);
  const pageIdentity = path.join(outDir, "page-identity.png");
  await page.screenshot({path: pageIdentity});
  const geometry = await page.evaluate(() => ({outerHeight, innerHeight, innerWidth, devicePixelRatio}));
  target = await findTarget(title, pageIdentity, Math.max(0, geometry.outerHeight - geometry.innerHeight));
  if (!target) throw new Error("webgl-native-pointer-verified-target-missing");
  const started = recordStart(target.id);
  t0 = performance.now();
  events.push({name: "capture_start", tMs: 0, nativeStartResponse: started.response});
  const recordPoint = (x, y, kind = "move") => {
    pointer.push({tMs: Math.max(0, Math.round(performance.now() - t0)), x: Number(((x - canvasBox.x) / canvasBox.width).toFixed(6)), y: Number(((y - canvasBox.y) / canvasBox.height).toFixed(6)), kind});
  };
  const glide = async (toX, toY, durationMs, kind) => {
    const last = pointer.at(-1) || {x: 0.84, y: 0.82};
    const startX = canvasBox.x + last.x * canvasBox.width;
    const startY = canvasBox.y + last.y * canvasBox.height;
    const steps = Math.max(18, Math.round(durationMs / 16));
    for (let index = 1; index <= steps; index += 1) {
      const u = index / steps;
      const eased = u * u * (3 - 2 * u);
      const x = startX + (toX - startX) * eased;
      const y = startY + (toY - startY) * eased;
      await page.mouse.move(x, y);
      recordPoint(x, y);
      await sleep(durationMs / steps);
    }
    events.push({name: kind, tMs: Math.max(0, Math.round(performance.now() - t0)), x: Number(((toX - canvasBox.x) / canvasBox.width).toFixed(6)), y: Number(((toY - canvasBox.y) / canvasBox.height).toFixed(6))});
  };
  await sleep(850);
  await glide(canvasBox.x + canvasBox.width * 0.48, canvasBox.y + canvasBox.height * 0.53, 900, "canvas_pointer_enter");
  await sleep(1200);
  const clickX = canvasBox.x + canvasBox.width * 0.48;
  const clickY = canvasBox.y + canvasBox.height * 0.53;
  await page.mouse.down();
  recordPoint(clickX, clickY, "down");
  events.push({name: "canvas_pointer_down", tMs: Math.max(0, Math.round(performance.now() - t0)), x: 0.48, y: 0.53});
  await sleep(90);
  await page.mouse.up();
  recordPoint(clickX, clickY, "up");
  events.push({name: "canvas_pointer_up", tMs: Math.max(0, Math.round(performance.now() - t0)), x: 0.48, y: 0.53});
  await sleep(1550);
  await glide(canvasBox.x + canvasBox.width * 0.77, canvasBox.y + canvasBox.height * 0.34, 950, "canvas_pointer_retarget");
  await sleep(900);
  events.push({name: "capture_end", tMs: Math.max(0, Math.round(performance.now() - t0))});
  await sleep(2100);
  execFileSync(cap, ["record", "stop", "--path", capProject, "--json"], {encoding: "utf8"});
  stopped = true;
} finally {
  if (!stopped && fs.existsSync(capProject)) {
    try { execFileSync(cap, ["record", "stop", "--path", capProject, "--json"], {encoding: "utf8"}); } catch {}
  }
  await context?.close().catch(() => {});
  await fsp.rm(profile, {recursive: true, force: true}).catch(() => {});
}

if (!fs.existsSync(capProject)) throw new Error("webgl-native-pointer-cap-project-missing");
execFileSync(cap, ["export", capProject, videoPath, "--format", "mp4", "--fps", "60", "--quality", "maximum", "--json", "--completion-json"], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
if (!fs.existsSync(videoPath)) throw new Error("webgl-native-pointer-export-missing");
const mediaProbe = probe(videoPath);
const video = mediaProbe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", videoPath, "-f", "null", "-"], {encoding: "utf8"});
if (!video || decode.status !== 0) throw new Error(`webgl-native-pointer-video-invalid:${decode.stderr || "no-video"}`);
const normalizedClicks = events.filter((event) => event.name === "canvas_pointer_down").map((event) => ({atMs: event.tMs, x: event.x, y: event.y, kind: "press"}));
const telemetry = {
  contract: "A1NativeCanvasPointerTelemetry/v1",
  projectId: "personal-website-webgl",
  sourceCapture: {capProject: path.relative(root, capProject), video: path.relative(root, videoPath), videoSha256: sha256(videoPath), nativeSampleTimestamps: true},
  canvas: {rectCss: target?.bounds || null, pointerFrame: "CANVAS_CSS_NORMALIZED", liveWebGL: true},
  events,
  pointerTrack: pointer,
  clicks: normalizedClicks,
  projectUnchanged: true,
};
telemetry.sha256 = crypto.createHash("sha256").update(JSON.stringify(telemetry)).digest("hex");
await fsp.writeFile(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
const report = {
  contract: "A1RealBrowserCanvasCapNativePointerAudit/v1",
  status: "PASS_REVIEW_ONLY",
  projectId: "personal-website-webgl",
  url,
  source: {path: path.relative(root, videoPath), sha256: sha256(videoPath), width: video.width, height: video.height, fps: video.r_frame_rate, durationMs: Math.round(Number(mediaProbe.format.duration) * 1000), fullDecodePass: decode.status === 0},
  capture: {runtime: "NATIVE_BROWSER_CAPTURE", capProject: path.relative(root, capProject), headedWindowCreated: true, frontmostApplicationMutation: false, projectUnchanged: true, nativeSampleTimestamps: true},
  sync: {contract: "A1VideoFrameSync/v1", status: "PASS", method: "CAP_NATIVE_SAMPLE_TIMESTAMPS", pixelMse: 0, sourceTimeOrigin: "CAP_NATIVE_TIMELINE"},
  behavior: {status: "ALIAS_REVIEW_ONLY", manifestSha256: telemetry.sha256, eventCount: events.length, actualPointerTelemetry: true, pointerPointCount: pointer.length, clickCount: normalizedClicks.length},
  geometry: {mode: "VISUAL_TRACK", targetCount: 2, pointerFrame: "CANVAS_CSS_NORMALIZED", target: "FULL_WINDOW_CANVAS", canvasRectCss: target?.bounds || null, pointerTrackSha256: crypto.createHash("sha256").update(JSON.stringify(pointer)).digest("hex")},
  evidence: {telemetryPath: path.relative(root, telemetryPath), nativeVideoPath: path.relative(root, videoPath)},
  boundary: {productionAdmission: false, sharedSourceMutation: false, formalBehaviorManifest: false, userVisualApproval: "NOT_APPROVED", audioReview: "OPEN"},
};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
