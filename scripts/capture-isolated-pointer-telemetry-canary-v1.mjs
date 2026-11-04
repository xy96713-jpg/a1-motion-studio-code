#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writingRoot = "/Users/a1/Documents/Codex/写作项目/workbench_runtime";
const draftPath = path.join(writingRoot, ".cache/writing/latest_frontend_full_draft.json");
const baseUrl = "http://127.0.0.1:8766";
const outputDir = path.join(root, "work/cursor-telemetry-capture-v1");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const ffprobePath = path.join(root, "node_modules/@ffprobe-installer/darwin-arm64/ffprobe");
const requestText = "补一个具体例子，说明为什么这些句子看着顺却很空。";
const selectedPhrase = "当前行业正在快速发展，创作者需要积极拥抱变化，提升自身竞争力";

const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

async function requestJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${route} failed (${response.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function cleanupTemporaryClone(documentId) {
  await requestJson(`/api/document?documentId=${encodeURIComponent(documentId)}`, {method: "DELETE"}).catch(() => {});
  const cleanupRoots = [
    path.join(writingRoot, ".cache/writing/documents"),
    path.join(writingRoot, ".cache/writing/deleted_documents"),
    path.join(writingRoot, ".cache/writing/topic_archives"),
    path.join(writingRoot, ".cache/writing/deleted_topic_archives"),
  ];
  for (const directory of cleanupRoots) {
    if (!fs.existsSync(directory)) continue;
    for (const name of await fsp.readdir(directory)) {
      if (name.startsWith(documentId)) await fsp.unlink(path.join(directory, name));
    }
  }
}

const taggedContentHtml = (contentHtml) => {
  const tagged = String(contentHtml || "").replace(/<p>([^<]*当前行业正在快速发展[^<]*)<\/p>/u, '<p id="a1-telemetry-anchor">$1</p>');
  if (!tagged.includes('id="a1-telemetry-anchor"')) throw new Error("telemetry anchor missing from current draft clone");
  return tagged;
};

const smootherStep = (value) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

async function curvedMouseMove(page, from, to, durationMs, bend = 0.16) {
  const steps = Math.max(2, Math.round(durationMs / 16));
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const control = {
    x: (from.x + to.x) / 2 - (dy / distance) * distance * bend,
    y: (from.y + to.y) / 2 + (dx / distance) * distance * bend,
  };
  for (let index = 0; index <= steps; index += 1) {
    const progress = smootherStep(index / steps);
    const inverse = 1 - progress;
    const x = inverse * inverse * from.x + 2 * inverse * progress * control.x + progress * progress * to.x;
    const y = inverse * inverse * from.y + 2 * inverse * progress * control.y + progress * progress * to.y;
    await page.mouse.move(x, y);
    if (index < steps) await page.waitForTimeout(16);
  }
}

const compileCursorTrack = (telemetry) => {
  const points = telemetry.events.filter((event) => event.type === "pointermove" && Number.isFinite(event.x) && Number.isFinite(event.y));
  if (points.length < 2) throw new Error("pointer telemetry has fewer than two movement samples");
  const endMs = telemetry.durationMs;
  const resampled = [];
  for (let tMs = 0; tMs <= endMs; tMs += 1000 / 30) {
    let nextIndex = points.findIndex((point) => point.tMs >= tMs);
    if (nextIndex < 0) nextIndex = points.length - 1;
    const next = points[nextIndex];
    const previous = points[Math.max(0, nextIndex - 1)];
    const span = Math.max(1, next.tMs - previous.tMs);
    const progress = Math.min(1, Math.max(0, (tMs - previous.tMs) / span));
    resampled.push({tMs: Math.round(tMs), x: previous.x + (next.x - previous.x) * progress, y: previous.y + (next.y - previous.y) * progress});
  }
  let filtered = resampled;
  for (let pass = 0; pass < 2; pass += 1) {
    filtered = filtered.map((point, index, source) => {
      const indices = [-2, -1, 0, 1, 2].map((offset) => Math.min(source.length - 1, Math.max(0, index + offset)));
      const weights = [1, 2, 3, 2, 1];
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      return {
        tMs: point.tMs,
        x: indices.reduce((sum, sourceIndex, weightIndex) => sum + source[sourceIndex].x * weights[weightIndex], 0) / total,
        y: indices.reduce((sum, sourceIndex, weightIndex) => sum + source[sourceIndex].y * weights[weightIndex], 0) / total,
      };
    });
  }
  const waypoints = filtered.filter((point, index, source) => index === 0 || index === source.length - 1 || index % 4 === 0);
  const clicks = telemetry.events
    .filter((event) => event.type === "pointerdown" && Number.isFinite(event.x) && Number.isFinite(event.y))
    .map((event) => ({atMs: event.tMs, x: event.x, y: event.y, kind: "press"}));
  return {
    contract: "A1SmoothedCursorTrack/v1",
    sourceTelemetryContract: telemetry.contract,
    source: "CAPTURED_POINTER_EVENT",
    resampleFps: 30,
    smoothing: {method: "two-pass-five-tap-weighted-window", weights: [1, 2, 3, 2, 1]},
    waypoints,
    clicks,
  };
};

async function main() {
  await fsp.mkdir(outputDir, {recursive: true});
  const health = await requestJson("/api/health");
  if (!health.ok) throw new Error("writing workbench is not healthy");
  const draft = JSON.parse(await fsp.readFile(draftPath, "utf8"));
  const documentId = `a1_pointer_telemetry_${Date.now()}`;
  await requestJson("/api/document", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      documentId,
      documentType: "experiment",
      title: draft.title,
      contentHtml: taggedContentHtml(draft.contentHtml),
      contentText: `${draft.title}\n\n${String(draft.body || "").trim()}`,
      metadata: {purpose: "A1 isolated pointer telemetry canary; no model call"},
    }),
  });

  const events = [];
  const modelRouteRequests = [];
  let browser;
  let context;
  let page;
  let rawVideoPath;
  try {
    browser = await chromium.launch({headless: true});
    context = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1, recordVideo: {dir: outputDir, size: {width: 1920, height: 1080}}});
    await context.exposeBinding("__a1TelemetrySink", (_source, event) => events.push(event));
    await context.addInitScript(() => {
      let lastMoveEpochMs = 0;
      const emit = (type, event = null, label = null) => {
        const epochMs = performance.timeOrigin + performance.now();
        if (type === "pointermove" && epochMs - lastMoveEpochMs < 15) return;
        if (type === "pointermove") lastMoveEpochMs = epochMs;
        const target = event?.target instanceof Element ? event.target : null;
        window.__a1TelemetrySink({
          type,
          label,
          epochMs,
          x: event ? event.clientX / innerWidth : null,
          y: event ? event.clientY / innerHeight : null,
          button: event?.button ?? null,
          buttons: event?.buttons ?? null,
          target: {tag: target?.tagName?.toLowerCase() || null, id: target?.id || null, paragraphAssistSlot: target?.getAttribute?.("data-paragraph-assist-slot") || null},
        });
      };
      addEventListener("pointermove", (event) => emit("pointermove", event), true);
      addEventListener("pointerdown", (event) => emit("pointerdown", event), true);
      addEventListener("pointerup", (event) => emit("pointerup", event), true);
      addEventListener("click", (event) => emit("click", event), true);
      window.__a1TelemetryMark = (label) => emit("marker", null, label);
    });
    page = await context.newPage();
    page.on("request", (request) => {
      if (/\/api\/(?:rewrite-selection|paragraph-assist|final-review|full-draft)/u.test(request.url())) modelRouteRequests.push({method: request.method(), url: request.url()});
    });
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(documentId)}`, {waitUntil: "networkidle"});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), selectedPhrase);
    await page.addStyleTag({content: "*{cursor:none!important}"});
    const created = await page.locator("#a1-telemetry-anchor").evaluate((node) => {
      node.scrollIntoView({block: "center"});
      return typeof window.createParagraphAssistSlotAfter === "function" && window.createParagraphAssistSlotAfter(node);
    });
    if (!created) throw new Error("isolated paragraph slot creation failed");
    const slot = page.locator('p[data-paragraph-assist-slot="1"]');
    await slot.scrollIntoViewIfNeeded();
    const slotBox = await slot.boundingBox();
    if (!slotBox) throw new Error("isolated paragraph slot bounding box missing");
    const start = {x: 240, y: 220};
    const target = {x: slotBox.x + slotBox.width * 0.35, y: slotBox.y + slotBox.height * 0.55};
    await page.mouse.move(start.x, start.y);
    await page.evaluate(() => window.__a1TelemetryMark?.("action-start"));
    await curvedMouseMove(page, start, target, 920, 0.2);
    await page.mouse.down();
    await page.waitForTimeout(105);
    await page.mouse.up();
    await page.keyboard.type(requestText, {delay: 34});
    await page.waitForTimeout(480);
    await page.evaluate(() => window.__a1TelemetryMark?.("action-end"));
    await page.waitForTimeout(120);
    await page.screenshot({path: path.join(outputDir, "actual-pointer-target-state.png")});
    const video = page.video();
    await page.close();
    rawVideoPath = await video.path();
    await context.close();
    await browser.close();
    page = null;
    context = null;
    browser = null;
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await cleanupTemporaryClone(documentId);
  }

  const startMarker = events.find((event) => event.type === "marker" && event.label === "action-start");
  const endMarker = [...events].reverse().find((event) => event.type === "marker" && event.label === "action-end");
  if (!startMarker || !endMarker) throw new Error("isolated telemetry markers missing");
  const telemetry = {
    contract: "A1PointerTelemetry/v1",
    status: "PASS",
    actionId: "paragraph-request-entry-canary",
    source: "playwright-real-dom-event",
    durationMs: Math.round(endMarker.epochMs - startMarker.epochMs),
    viewport: {width: 1920, height: 1080},
    events: events
      .filter((event) => event.epochMs >= startMarker.epochMs && event.epochMs <= endMarker.epochMs)
      .map((event) => ({...event, tMs: Math.round(event.epochMs - startMarker.epochMs)})),
    observedModelRouteRequests: modelRouteRequests,
    boundary: {proofOnly: true, externalModelCalls: modelRouteRequests.length, productionWorkspaceMutation: false, currentPhaseMutation: false, temporaryCloneDeleted: true},
  };
  if (modelRouteRequests.length > 0) throw new Error(`isolated telemetry unexpectedly triggered model routes:${JSON.stringify(modelRouteRequests)}`);
  const cursorTrack = compileCursorTrack(telemetry);
  const telemetryPath = path.join(outputDir, "pointer-telemetry.json");
  const cursorTrackPath = path.join(outputDir, "smoothed-cursor-track.json");
  await fsp.writeFile(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
  await fsp.writeFile(cursorTrackPath, `${JSON.stringify(cursorTrack, null, 2)}\n`);

  if (!rawVideoPath || !fs.existsSync(rawVideoPath)) throw new Error("isolated telemetry video missing");
  const rawMp4 = path.join(outputDir, "actual-pointer-capture-full.mp4");
  execFileSync(ffmpegPath, ["-y", "-i", rawVideoPath, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", rawMp4], {stdio: "pipe"});
  const fullDuration = Number(execFileSync(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", rawMp4], {encoding: "utf8"}).trim());
  const trimSeconds = Math.min(fullDuration, telemetry.durationMs / 1000 + 0.75);
  const trimPath = path.join(outputDir, "actual-pointer-capture-trimmed.mp4");
  execFileSync(ffmpegPath, ["-y", "-sseof", `-${trimSeconds.toFixed(3)}`, "-i", rawMp4, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", trimPath], {stdio: "pipe"});

  const report = {
    contract: "A1IsolatedPointerTelemetryCanary/v1",
    status: "PASS",
    telemetry: {path: path.relative(root, telemetryPath), sha256: sha256(telemetryPath), eventCount: telemetry.events.length},
    cursorTrack: {path: path.relative(root, cursorTrackPath), sha256: sha256(cursorTrackPath), waypointCount: cursorTrack.waypoints.length, clickCount: cursorTrack.clicks.length},
    video: {path: path.relative(root, trimPath), sha256: sha256(trimPath), durationSeconds: trimSeconds},
    targetState: {path: "work/cursor-telemetry-capture-v1/actual-pointer-target-state.png", sha256: sha256(path.join(outputDir, "actual-pointer-target-state.png"))},
    boundary: telemetry.boundary,
  };
  const reportPath = path.join(outputDir, "report.json");
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({...report, reportSha256: sha256(reportPath)}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
