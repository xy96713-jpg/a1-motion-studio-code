#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/all-sixteen-shot-v2/manifest.json");
const insertionManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/insertion-pack-v2/insertion-manifest.json");
const outputRoot = path.join(root, ".codex-artifacts/system-progress-system-line/continuous-screen-evidence-v2/browser-audit");
const screenshotPath = path.join(outputRoot, "review-page.png");
const reportPath = path.join(outputRoot, "report.json");
const baseUrl = (process.env.A1_SYSTEM_LINE_URL || "http://127.0.0.1:4311").replace(/\/$/u, "");
const sha256File = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
const workspaceBefore = sha256File(workspacePath);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const insertionManifest = JSON.parse(fs.readFileSync(insertionManifestPath, "utf8"));
const failures = [];
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

fs.mkdirSync(outputRoot, {recursive: true});
const browser = await chromium.launch({headless: true, args: ["--autoplay-policy=no-user-gesture-required"]});
let playback = null;
let insertionClipMetadata = null;
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || "failed"}`));
  const response = await page.goto(`${baseUrl}/system-line-visual-workbench`, {waitUntil: "networkidle", timeout: 60_000});
  assert(response?.status() === 200, `http-status:${response?.status()}`);
  const section = page.locator('[data-a1-current-screen-demo-lane="CONTINUOUS_REAL_SOURCE_1X_SEMANTIC_SLICES_V2"]');
  await section.waitFor({state: "visible", timeout: 30_000});
  assert(await section.getAttribute("data-a1-screen-demo-shot-count") === "16", "screen-shot-count");
  assert(await section.getAttribute("data-a1-screen-demo-action-ready-count") === "16", "screen-action-ready-count");
  assert(await section.getAttribute("data-a1-screen-demo-playable-proof") === "READY", "playable-proof-not-ready");
  assert(await section.getAttribute("data-a1-continuous-screen-user-approval") === "NOT_APPROVED", "user-approval-drift");
  assert(await section.getAttribute("data-a1-screen-insertion-pack") === "CANDIDATE_ONLY_READY_FOR_EDITOR_INSERT_REVIEW", "insertion-pack-not-ready");
  assert(await section.getAttribute("data-a1-screen-insertion-entry-count") === "16", "insertion-entry-count");
  assert(await page.locator('[data-a1-screen-insertion-ready="true"]').getAttribute("data-a1-screen-semantic-window-count") === "16", "semantic-window-count");
  assert(await page.locator('[data-a1-screen-insertion-ready="true"]').getAttribute("data-a1-screen-tail-hold-max-ms") === "980", "tail-hold-max");
  assert(await page.locator('[data-a1-screen-insertion-manifest-link="true"]').count() === 1, "insertion-manifest-link-missing");
  const video = page.locator('video[data-a1-screen-demo-video="ALL-16-SCREEN-EVIDENCE"]');
  await video.waitFor({state: "visible", timeout: 30_000});
  playback = await video.evaluate(async (node) => {
    const media = node;
    await new Promise((resolve, reject) => {
      if (media.readyState >= 1) return resolve();
      const timeout = setTimeout(() => reject(new Error("metadata-timeout")), 20_000);
      media.addEventListener("loadedmetadata", () => {
        clearTimeout(timeout);
        resolve();
      }, {once: true});
      media.load();
    });
    media.muted = true;
    media.playbackRate = 4;
    await media.play();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("playback-timeout")), 50_000);
      media.addEventListener("ended", () => {
        clearTimeout(timeout);
        resolve();
      }, {once: true});
    });
    return {duration: media.duration, currentTime: media.currentTime, ended: media.ended, readyState: media.readyState};
  });
  assert(Math.abs(playback.duration - manifest.output.durationSeconds) < 0.15, `duration-drift:${playback.duration}`);
  assert(playback.ended === true, "browser-playback-not-ended");
  assert(playback.currentTime >= playback.duration - 0.05, "browser-playback-incomplete");
  const firstInsertionEntry = insertionManifest.entries[0];
  insertionClipMetadata = await page.evaluate(async ({url}) => {
    const media = document.createElement("video");
    media.preload = "metadata";
    media.src = url;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("insertion-metadata-timeout")), 20_000);
      media.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timeout);
        resolve(true);
      }, {once: true});
      media.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("insertion-metadata-error"));
      }, {once: true});
    });
    return {duration: media.duration, width: media.videoWidth, height: media.videoHeight};
  }, {url: firstInsertionEntry.file.publicUrl});
  assert(insertionClipMetadata.width === 960 && insertionClipMetadata.height === 540, "insertion-clip-dimensions");
  assert(Math.abs(insertionClipMetadata.duration - firstInsertionEntry.timeline.frameCalibratedDurationSeconds) < 0.05, "insertion-clip-duration");
  await section.screenshot({path: screenshotPath});
} finally {
  await browser.close();
}

const workspaceAfter = sha256File(workspacePath);
assert(workspaceAfter === workspaceBefore, "browser-review-mutated-workspace");
assert(pageErrors.length === 0, `page-errors:${pageErrors.join("|")}`);
const expectedAbortedRequests = failedRequests.filter((request) => (
  request.includes("net::ERR_ABORTED")
  && (
    request.includes(manifest.output.publicUrl)
    || request.includes("/api/system-line/execution-status")
    || insertionManifest.entries.some((entry) => request.includes(entry.file.publicUrl))
  )
));
const relevantFailedRequests = failedRequests.filter((request) => !expectedAbortedRequests.includes(request));
assert(relevantFailedRequests.length === 0, `failed-requests:${relevantFailedRequests.join("|")}`);
const relevantConsoleErrors = consoleErrors.filter((message) => !message.includes("favicon"));
assert(relevantConsoleErrors.length === 0, `console-errors:${relevantConsoleErrors.join("|")}`);
const report = {
  contract: "A1ContinuousScreenEvidenceBrowserAudit/v2",
  status: failures.length === 0 ? "PASS" : "FAIL",
  pageUrl: `${baseUrl}/system-line-visual-workbench`,
  playback,
  checks: {
    http200: !failures.some((failure) => failure.startsWith("http-status")),
    currentLaneVisible: !failures.includes("playable-proof-not-ready"),
    fullBrowserPlaybackAt4x: playback?.ended === true,
    insertionPackReady: insertionManifest.entryCount === 16,
    insertionClipMetadata,
    workspaceMutation: workspaceBefore !== workspaceAfter,
    consoleErrorCount: relevantConsoleErrors.length,
    pageErrorCount: pageErrors.length,
    failedRequestCount: relevantFailedRequests.length,
    expectedAbortedRequestCount: expectedAbortedRequests.length,
  },
  evidence: {
    videoPublicUrl: manifest.output.publicUrl,
    videoSha256: manifest.output.sha256,
    screenshotPath: path.relative(root, screenshotPath),
    screenshotSha256: fs.existsSync(screenshotPath) ? sha256File(screenshotPath) : null,
    workspaceSha256Before: workspaceBefore,
    workspaceSha256After: workspaceAfter,
  },
  boundary: manifest.boundary,
  expectedAbortedRequests,
  relevantFailedRequests,
  failures,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
