#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {chromium} from "playwright";
import {buildScreenGeometryFrame, compileScreenGeometryTruth} from "../apps/studio-next/src/lib/a1-screen-geometry-truth-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const outRoot = path.resolve(root, process.env.A1_LIVE_ARTICLE_OUTPUT_ROOT || "work/full-article-screen-animation-canary-v1/live-capture");
const videoDir = path.join(outRoot, "playwright-video");
const rawPath = path.join(outRoot, "raw.webm");
const cleanPath = path.join(outRoot, "noaa-live-article-scroll-60s-1280x720-60fps.mp4");
const reportPath = path.join(outRoot, "live-capture-report.json");
const syncFramePath = path.join(outRoot, "sync-frame.png");
const contactPath = path.join(outRoot, "contact-sheet.png");
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const url = process.env.A1_LIVE_ARTICLE_URL || "https://oceanexplorer.noaa.gov/expedition-feature/24attu-battlefield-features-wreck-ecology/";
const width = 1280;
const height = 720;
const fps = 60;
const durationMs = 60000;
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const probe = (file) => JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", file], {encoding: "utf8"}));

fs.mkdirSync(videoDir, {recursive: true});
const events = [];
const cursorTelemetry = {moves: [], clicks: []};
const geometryTargets = [];
const domTargets = [];
const targetFailures = [];
let page;
let browser;
let context;
let video;
let t0 = 0;
let plannedBeats = [];
let pageMetrics = {scrollHeight: null, viewportHeight: height};
let pointer = {x: width * .82, y: height * .82};
const elapsed = () => Math.round(performance.now() - t0);
const recordTarget = async (locator, eventName) => {
  let box = null;
  let selectedLocator = locator;
  try {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const candidateBox = await candidate.boundingBox({timeout: 750}).catch(() => null);
      if (!candidateBox || candidateBox.width < 8 || candidateBox.height < 8) continue;
      if (candidateBox.y + candidateBox.height <= 0 || candidateBox.y >= height) continue;
      box = candidateBox;
      selectedLocator = candidate;
      break;
    }
  } catch (error) {
    targetFailures.push({event: eventName, reason: error?.name || "LOCATOR_TIMEOUT"});
    return null;
  }
  if (!box) {
    targetFailures.push({event: eventName, reason: "TARGET_NOT_VISIBLE"});
    return null;
  }
  const left = Math.max(0, Math.min(width, box.x));
  const top = Math.max(0, Math.min(height, box.y));
  const right = Math.max(left, Math.min(width, box.x + box.width));
  const bottom = Math.max(top, Math.min(height, box.y + box.height));
  const row = {event: eventName, capturedAtMs: elapsed(), sourceRect: {x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height}};
  domTargets.push(row);
  geometryTargets.push({targetKey: eventName, kind: "UI", selector: selectedLocator.toString(), identity: {event: eventName}, confidence: 1, observedAtMs: row.capturedAtMs, rectCss: {x: left, y: top, width: right - left, height: bottom - top}});
  return {left, top, width: right - left, height: bottom - top};
};
const glide = async (target, duration = 260) => {
  const origin = {...pointer};
  const steps = Math.max(12, Math.round(duration / 16));
  for (let index = 1; index <= steps; index += 1) {
    const raw = index / steps;
    const eased = raw * raw * (3 - 2 * raw);
    pointer = {x: origin.x + (target.x - origin.x) * eased, y: origin.y + (target.y - origin.y) * eased};
    await page.mouse.move(pointer.x, pointer.y);
    cursorTelemetry.moves.push({tMs: elapsed(), x: pointer.x / width, y: pointer.y / height});
    await sleep(duration / steps);
  }
};

try {
  browser = await chromium.launch({executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, args: ["--disable-blink-features=AutomationControlled", "--no-first-run", "--disable-features=TranslateUI"]});
  context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, recordVideo: {dir: videoDir, size: {width, height}}});
  await context.addInitScript(() => { const style = document.createElement("style"); style.textContent = "html,body,body *{cursor:none!important}html{scroll-behavior:auto!important}"; document.documentElement.appendChild(style); });
  page = await context.newPage();
  video = page.video();
  await page.goto(url, {waitUntil: "networkidle", timeout: 90000});
  await page.locator("main.main-content").waitFor({state: "visible", timeout: 30000});
  await page.screenshot({path: syncFramePath, animations: "disabled"});
  const metrics = await page.evaluate(() => ({scrollHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight}));
  pageMetrics = metrics;
  const scrollMax = Math.max(0, metrics.scrollHeight - metrics.viewportHeight);
  t0 = performance.now();
  events.push({name: "start", tMs: 0, scrollY: 0});
  cursorTelemetry.moves.push({tMs: 0, x: pointer.x / width, y: pointer.y / height});
  const beats = [
    {at: 2500, ratio: 0.08, target: "main.main-content h1", name: "hero_hold"},
    {at: 8500, ratio: 0.18, target: "main.main-content h2", name: "section_one"},
    {at: 14500, ratio: 0.28, target: "main.main-content .content-formatted p", name: "paragraph_one"},
    {at: 20500, ratio: 0.38, target: "main.main-content figure", name: "image_evidence_one"},
    {at: 26500, ratio: 0.48, target: "main.main-content .content-formatted p", name: "paragraph_two"},
    {at: 32500, ratio: 0.58, target: "main.main-content figure", index: 1, name: "image_evidence_two"},
    {at: 38500, ratio: 0.68, target: "main.main-content .content-formatted p", name: "method_section"},
    {at: 44500, ratio: 0.78, target: "main.main-content .content-formatted p", name: "sonar_section"},
    {at: 50500, ratio: 0.9, target: "main.main-content .content-formatted p", name: "closing_section"},
  ];
  plannedBeats = beats;
  for (const beat of beats) {
    while (elapsed() < beat.at) await sleep(Math.min(40, beat.at - elapsed()));
    const targetY = Math.round(scrollMax * beat.ratio);
    const beforeY = await page.evaluate(() => scrollY);
    await page.evaluate((y) => scrollTo(0, y), targetY);
    await sleep(500);
    const locator = page.locator(beat.target);
    const targetLocator = Number.isInteger(beat.index) ? locator.nth(beat.index) : locator;
    const target = await recordTarget(targetLocator, beat.name);
    if (target) await glide({x: target.left + target.width / 2, y: target.top + Math.min(target.height / 2, height * .5)});
    events.push({name: "scroll_start", beat: beat.name, tMs: elapsed(), fromY: beforeY, toY: targetY, targetFound: Boolean(target)});
    await sleep(1400);
    events.push({name: "result_hold", beat: beat.name, tMs: elapsed(), scrollY: await page.evaluate(() => scrollY)});
  }
  while (elapsed() < durationMs) await sleep(Math.min(40, durationMs - elapsed()));
  events.push({name: "end", tMs: elapsed(), scrollY: await page.evaluate(() => scrollY)});
  await context.close();
  const recorded = await video.path();
  await fsPromises.copyFile(recorded, rawPath);
  await browser.close();
  browser = null;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

const rawProbe = probe(rawPath);
const rawDuration = Number(rawProbe.format.duration);
const rawSyncPath = rawPath;
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", rawSyncPath, "-t", String(durationMs / 1000), "-vf", `fps=${fps}`, "-an", "-c:v", "h264_videotoolbox", "-b:v", "18M", "-pix_fmt", "yuv420p", "-r", String(fps), "-vsync", "cfr", "-movflags", "+faststart", cleanPath]);
const cleanProbe = probe(cleanPath);
const videoStream = cleanProbe.streams.find((item) => item.codec_type === "video");
const decode = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", cleanPath, "-f", "null", "-"], {encoding: "utf8"});
const geometryFrame = buildScreenGeometryFrame({sourceWidth: videoStream.width, sourceHeight: videoStream.height, viewportCss: {x: 0, y: 0, width, height}, captureRectCss: {x: 0, y: 0, width, height}, devicePixelRatio: 1, pageZoom: 1, scroll: {x: 0, y: 0}, frameId: "noaa-live-article-frame-0"});
const geometryTruth = compileScreenGeometryTruth({sourceSha256: sha(cleanPath), source: {width: videoStream.width, height: videoStream.height}, frame: geometryFrame, targets: geometryTargets});
execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", cleanPath, "-vf", "fps=3/60,scale=480:270,tile=3x1", "-frames:v", "1", contactPath]);
const report = {contract: "A1LiveArticleScrollCapture/v1", status: decode.status === 0 && videoStream.width === width && videoStream.height === height && videoStream.r_frame_rate === `${fps}/1` && geometryTruth.status === "PASS_REVIEW_ONLY" ? "READY_FOR_CAP_REVIEW" : "FAIL", productId: "noaa-live-article", url, runtimeId: "GENERIC_BROWSER_CAPTURE_V1", captureBackend: "PLAYWRIGHT_HEADLESS_RECORD_VIDEO", captureScope: "LIVE_BROWSER_ARTICLE_SCROLL", project: {root: path.join(root, "work/full-article-screen-animation-canary-v1/source-capture"), unchanged: true}, directorPlan: {contract: "A1ScreenDirectorBrain/v1", sequence: "ARTICLE_ESTABLISH_SCROLL_FOLLOW_HOLD", beats: plannedBeats.map((beat) => ({id: beat.name, function: beat.name.includes("image") ? "evidence" : "scroll-follow", event: beat.name}))}, events, cursorTelemetry, domTargets, targetFailures, geometryTruth, source: {url, mode: "LIVE_BROWSER_PAGE", pageMetrics, sourceHtml: "work/full-article-screen-animation-canary-v1/source-capture/source.html"}, output: {path: path.relative(root, cleanPath), rawPath: path.relative(root, rawPath), rawDurationMs: Math.round(rawDuration * 1000), sha256: sha(cleanPath), width: videoStream.width, height: videoStream.height, fps: videoStream.r_frame_rate, frameCount: Number(videoStream.nb_read_frames), durationMs: Math.round(Number(cleanProbe.format.duration) * 1000), fullDecodePass: decode.status === 0}, evidence: {syncFrame: path.relative(root, syncFramePath), contactSheet: path.relative(root, contactPath)}, boundary: {reviewOnly: true, currentWorkspaceMutation: false, currentPhaseMutation: false, productionAdmission: false}, generatedAt: new Date().toISOString()};
report.reportSha256 = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
