#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cap = process.env.CAP_BIN || "/Applications/Cap.app/Contents/MacOS/cap-cli";
const ffmpeg = path.join(root, ".tools/bin/ffmpeg");
const ffprobe = path.join(root, ".tools/bin/ffprobe");
const baseUrl = process.env.A1_WRITING_WORKBENCH_URL || "http://127.0.0.1:8766/v2/";
const runId = new Date().toISOString().replace(/[:.]/gu, "-");
const outRoot = path.join(root, "work", "project-window-capture-canary-v1", runId);
const projectPath = path.join(outRoot, "writing-workbench-window.cap");
const sourcePath = path.join(projectPath, "content/segments/segment-0/display.mp4");
const cfrPath = path.join(outRoot, "writing-workbench-window-cfr60.mp4");
const pageIdentityPath = path.join(outRoot, "page-identity.png");
const presentationIdentityPath = path.join(outRoot, "presentation-identity.png");
const windowIdentityPath = path.join(outRoot, "window-identity.png");
const firstFramePath = path.join(outRoot, "first-frame.png");
const contactPath = path.join(outRoot, "contact-sheet.png");
const reportPath = path.join(outRoot, "report.json");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const executablePath = [1234, 1228, 1223]
  .map((build) => `/Users/a1/Library/Caches/ms-playwright/chromium-${build}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
  .find((candidate) => fs.existsSync(candidate));

if (!executablePath) throw new Error("project-window-canary-chromium-missing");
if (!fs.existsSync(cap)) throw new Error("project-window-canary-cap-cli-missing");
fs.mkdirSync(outRoot, {recursive: true});

const probe = (file) => JSON.parse(execFileSync(ffprobe, [
  "-v", "error", "-count_frames",
  "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames:format=duration,size",
  "-of", "json", file,
], {encoding: "utf8"}));

async function normalizedMae(pagePath, capturedPath, chromeTop = 0) {
  const pageMeta = await sharp(pagePath).metadata();
  const capturedMeta = await sharp(capturedPath).metadata();
  const scale = Number(capturedMeta.width) / Number(pageMeta.width);
  const cropTop = Math.max(0, Math.round(chromeTop * scale));
  const cropHeight = Math.min(Number(capturedMeta.height) - cropTop, Math.round(Number(pageMeta.height) * scale));
  if (!pageMeta.width || !pageMeta.height || !capturedMeta.width || cropHeight <= 0) return 1;
  const page = await sharp(pagePath).removeAlpha().raw().toBuffer();
  const captured = await sharp(capturedPath)
    .extract({left: 0, top: cropTop, width: Number(capturedMeta.width), height: cropHeight})
    .resize(Number(pageMeta.width), Number(pageMeta.height), {fit: "fill"})
    .removeAlpha().raw().toBuffer();
  if (page.length !== captured.length) return 1;
  let sum = 0;
  for (let index = 0; index < page.length; index += 1) sum += Math.abs(page[index] - captured[index]);
  return Number((sum / page.length / 255).toFixed(6));
}

let context;
let profilePath;
let stopped = false;
let captureTarget;
let domIdentity;
let chromeTop = 0;
const selectionTitle = `A1稿台窗口Canary-${crypto.randomBytes(8).toString("hex")}`;

try {
  profilePath = await fsp.mkdtemp(path.join(os.tmpdir(), "a1-project-window-canary-"));
  context = await chromium.launchPersistentContext(profilePath, {
    executablePath,
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      `--app=${baseUrl}`,
      "--window-size=1280,800",
      "--window-position=1650,100",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  await page.waitForLoadState("networkidle", {timeout: 60000});
  await page.waitForSelector("#editor", {state: "visible", timeout: 60000});
  await page.evaluate((title) => { document.title = title; }, selectionTitle);
  domIdentity = await page.evaluate(() => ({
    editor: Boolean(document.querySelector("#editor")),
    finalReview: Boolean(document.querySelector("#finalReviewButton")),
    presentation: Boolean(document.querySelector("#presentDraft")),
    candidates: Boolean(document.querySelector("#candidateList")),
    controls: [...document.querySelectorAll("button")].map((button) => button.textContent?.trim()).filter(Boolean),
  }));
  if (!domIdentity.editor || !domIdentity.finalReview || !domIdentity.presentation || !domIdentity.candidates
    || !["新主题", "保存", "导出", "演示", "收稿"].every((label) => domIdentity.controls.includes(label))) {
    throw new Error(`project-window-canary-dom-identity-failed:${JSON.stringify(domIdentity)}`);
  }
  const geometry = await page.evaluate(() => ({chromeTop: outerHeight - innerHeight, width: innerWidth, height: innerHeight}));
  chromeTop = geometry.chromeTop;
  await page.screenshot({path: pageIdentityPath});
  let matches = [];
  for (let attempt = 0; attempt < 12 && matches.length !== 1; attempt += 1) {
    const targets = JSON.parse(execFileSync(cap, ["targets", "--json"], {encoding: "utf8"}));
    matches = targets.windows.filter((item) => /Chrome for Testing/iu.test(item.ownerName || "") && (item.name || "").trim() === selectionTitle);
    if (matches.length !== 1) await sleep(250);
  }
  if (matches.length !== 1) throw new Error(`project-window-canary-target-count:${matches.length}`);
  captureTarget = matches[0];
  execFileSync(cap, ["screenshot", "--window", String(captureTarget.id), "--path", windowIdentityPath, "--json"], {encoding: "utf8"});
  const preflightMae = await normalizedMae(pageIdentityPath, windowIdentityPath, chromeTop);
  if (preflightMae > 0.14) throw new Error(`project-window-canary-preflight-pixel-identity:${preflightMae}`);

  execFileSync(cap, ["record", "start", "--detach", "--window", String(captureTarget.id), "--fps", "60", "--path", projectPath], {encoding: "utf8"});
  await sleep(900);
  await page.locator("#presentDraft").click({force: true});
  await page.waitForFunction(() => !document.querySelector("#presentationMode")?.hasAttribute("hidden"));
  await page.screenshot({path: presentationIdentityPath});
  await sleep(1000);
  const close = page.locator("#presentationClose, [data-presentation-close]").first();
  if (await close.count()) await close.click({force: true});
  else await page.keyboard.press("Escape");
  await sleep(1700);
  execFileSync(cap, ["record", "stop", "--path", projectPath], {encoding: "utf8"});
  stopped = true;
} finally {
  if (!stopped && fs.existsSync(projectPath)) {
    try { execFileSync(cap, ["record", "stop", "--path", projectPath], {encoding: "utf8"}); } catch {}
  }
  await context?.close().catch(() => {});
  if (profilePath) await fsp.rm(profilePath, {recursive: true, force: true}).catch(() => {});
}

if (!fs.existsSync(sourcePath)) throw new Error("project-window-canary-source-missing");
const sourceProbe = probe(sourcePath);
const sourceVideo = sourceProbe.streams.find((stream) => stream.codec_type === "video") || sourceProbe.streams[0];
const windowIdentityMeta = await sharp(windowIdentityPath).metadata();
const expectedWidth = Number(windowIdentityMeta.width || 0);
const expectedHeight = Number(windowIdentityMeta.height || 0);
if (!expectedWidth || !expectedHeight || Math.abs(Number(sourceVideo.width) - expectedWidth) > 4 || Math.abs(Number(sourceVideo.height) - expectedHeight) > 4) {
  throw new Error(`project-window-canary-display-fallback:${JSON.stringify({bounds:captureTarget?.bounds,actual:{width:sourceVideo.width,height:sourceVideo.height},expected:{width:expectedWidth,height:expectedHeight}})}`);
}

execFileSync(ffmpeg, ["-v", "error", "-y", "-ss", "0.15", "-i", sourcePath, "-frames:v", "1", firstFramePath]);
const firstFrameMae = await normalizedMae(pageIdentityPath, firstFramePath, chromeTop);
const presentationFrameMae = await normalizedMae(presentationIdentityPath, firstFramePath, chromeTop);
const recordedIdentityMae = Math.min(firstFrameMae, presentationFrameMae);
if (recordedIdentityMae > 0.18) throw new Error(`project-window-canary-recorded-pixel-identity:${JSON.stringify({editor:firstFrameMae,presentation:presentationFrameMae})}`);

execFileSync(ffmpeg, [
  "-v", "error", "-y", "-i", sourcePath,
  "-vf", "fps=60", "-an", "-c:v", "h264_videotoolbox", "-b:v", "18M", "-pix_fmt", "yuv420p", "-r", "60", "-vsync", "cfr", "-movflags", "+faststart", cfrPath,
]);
const cfrProbe = probe(cfrPath);
const cfrVideo = cfrProbe.streams.find((stream) => stream.codec_type === "video") || cfrProbe.streams[0];
const cfrDuration = Number(cfrProbe.format.duration);
const cfrFrameCount = Number(cfrVideo.nb_read_frames || cfrVideo.nb_frames);
if (cfrVideo.r_frame_rate !== "60/1" || cfrFrameCount < Math.floor(cfrDuration * 59.5)) {
  throw new Error(`project-window-canary-cfr60-failed:${JSON.stringify(cfrProbe)}`);
}
const decode = spawnSync(ffmpeg, ["-v", "error", "-i", cfrPath, "-f", "null", "-"], {encoding: "utf8"});
if (decode.status !== 0) throw new Error(`project-window-canary-decode-failed:${decode.stderr}`);
execFileSync(ffmpeg, ["-v", "error", "-y", "-i", cfrPath, "-vf", "fps=1,scale=480:-1,tile=4x1", "-frames:v", "1", contactPath]);

const report = {
  contract: "A1ProjectWindowCaptureCanary/v1",
  status: "PASS",
  captureScope: "PROJECT_WINDOW_ONLY",
  fullDisplayForbidden: true,
  target: {windowId: String(captureTarget.id), ownerName: captureTarget.ownerName, titleSha256: crypto.createHash("sha256").update(selectionTitle).digest("hex"), bounds: captureTarget.bounds},
  identity: {domIdentity, preflightNormalizedMae: await normalizedMae(pageIdentityPath, windowIdentityPath, chromeTop), recordedFirstFrameNormalizedMae: recordedIdentityMae, recordedStateComparisons:{editor:firstFrameMae,presentation:presentationFrameMae}, threshold: {preflight: 0.14, recorded: 0.18}},
  source: {path: path.relative(root, sourcePath), sha256: sha256(sourcePath), width: sourceVideo.width, height: sourceVideo.height, duration: Number(sourceProbe.format.duration), avgFrameRate: sourceVideo.avg_frame_rate},
  cfr60: {path: path.relative(root, cfrPath), sha256: sha256(cfrPath), width: cfrVideo.width, height: cfrVideo.height, duration: cfrDuration, rFrameRate: cfrVideo.r_frame_rate, frameCount: cfrFrameCount, fullDecodePass: true},
  capProject: {path: path.relative(root, projectPath), configExists: fs.existsSync(path.join(projectPath, "project-config.json")), recordingMetaExists: fs.existsSync(path.join(projectPath, "recording-meta.json"))},
  evidence: {pageIdentity: path.relative(root, pageIdentityPath), presentationIdentity:path.relative(root,presentationIdentityPath), windowIdentity: path.relative(root, windowIdentityPath), firstFrame: path.relative(root, firstFramePath), contactSheet: path.relative(root, contactPath)},
  boundary: {productionWorkspaceMutation: false, currentPhaseMutation: false, formalArticleMutated: false, productionAdmission: false, userVisualApproval: "NOT_APPROVED"},
  generatedAt: new Date().toISOString(),
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({...report, reportPath: path.relative(root, reportPath)}, null, 2));
