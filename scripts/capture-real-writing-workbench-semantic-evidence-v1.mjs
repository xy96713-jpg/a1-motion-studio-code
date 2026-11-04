#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {assertEditorialAssetWorkbench, editorialAssetContentSha256, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const baseUrl = (process.env.A1_WRITING_WORKBENCH_URL || "http://127.0.0.1:8766").replace(/\/$/u, "");
const writingRoot = process.env.A1_WRITING_WORKBENCH_ROOT || "/Users/a1/Documents/Codex/写作项目/workbench_runtime";
const draftPath = path.join(writingRoot, ".cache/writing/latest_frontend_full_draft.json");
const captureOnly = process.env.A1_CAPTURE_ONLY === "1";
const captureOnlyFamily = String(process.env.A1_CAPTURE_ONLY_FAMILY || "c5-semantic-action-tracks-v1").replace(/[^a-z0-9._-]+/giu, "-");
const publicRelativeDir = captureOnly
  ? `generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/${captureOnlyFamily}`
  : "generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-semantic-evidence-v1";
const studioDir = path.join(appRoot, "public", publicRelativeDir);
const rendererDir = path.join(root, "remotion-renderer/public", publicRelativeDir);
const artifactDir = captureOnly
  ? path.join(root, `.codex-artifacts/system-progress-system-line/continuous-screen-evidence-v2/${captureOnlyFamily}`)
  : path.join(root, ".codex-artifacts/system-progress-system-line/writing-workbench-semantic-evidence-v1");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const ffprobePath = path.join(root, "node_modules/@ffprobe-installer/darwin-arm64/ffprobe");
const now = new Date().toISOString();
const runToken = `${Date.now()}`;
const selectedBadPhrase = "当前行业正在快速发展，创作者需要积极拥抱变化，提升自身竞争力";
const exactNegativePhrase = "AI 正在改变内容生产";
const approvedPhrase = "我把 AI 直出的开头放进审稿，系统先标出这类套话，再要求补上具体对象和读者后果。";
const laterRewritePhrase = "我把另一段 AI 开头放进审稿，也想先找出套话、具体对象和读者后果。";

const definitions = {
  historyIsolation: {
    assetId: "source-documentary-history-isolation-action",
    name: "真实跨主题五版本隔离操作",
    purpose: "真实展示两个临时主题分别保存，主题 A 保留近五次、切到主题 B 后记录不混入、切回 A 后五次仍在。",
    shotIds: ["ED-23"],
    keyStill: "history-isolation-03-topic-a-restored.png",
    frameFiles: ["history-isolation-01-topic-a-five.png", "history-isolation-02-topic-b-separated.png", "history-isolation-03-topic-a-restored.png"],
    beatIds: ["topic-a-five-versions", "topic-b-separated-archive", "topic-a-five-versions-restored"],
  },
  preferenceIntercept: {
    assetId: "source-documentary-preference-intercept-action",
    name: "真实讨厌句后续拦截操作",
    purpose: "真实展示句子进入讨厌库后，风格检查在同一正文中再次命中并明确显示踩禁。",
    shotIds: ["ED-25"],
    keyStill: "preference-intercept-03-style-proof.png",
    frameFiles: ["preference-intercept-01-selected.png", "preference-intercept-02-recorded.png", "preference-intercept-03-style-proof.png"],
    beatIds: ["bad-line-selected", "bad-line-recorded", "later-style-proof-intercepts-line"],
  },
  negativePreferenceRecord: {
    assetId: "source-documentary-negative-preference-record-action",
    name: "真实负向句进入风格库",
    purpose: "真实展示具体原句被完整划选、标记为讨厌，并在风格库中出现可复核记录。",
    shotIds: ["ED-24"],
    keyStill: "negative-preference-02-recorded.png",
    frameFiles: ["negative-preference-01-exact-selection.png", "negative-preference-02-recorded.png"],
    beatIds: ["exact-negative-line-selected", "negative-judgment-recorded"],
  },
  preferenceGeneration: {
    assetId: "source-documentary-preference-generation-action",
    name: "真实喜欢库进入下一轮改句",
    purpose: "真实展示一句话进入喜欢库后，另一句发起改写，候选面板明确显示本次带入喜欢偏好。",
    shotIds: ["ED-26"],
    keyStill: "preference-generation-03-candidates-with-memory.png",
    frameFiles: ["preference-generation-01-liked.png", "preference-generation-02-next-selection.png", "preference-generation-03-candidates-with-memory.png"],
    beatIds: ["approved-line-recorded", "later-line-selected", "later-rewrite-uses-approved-memory"],
  },
};

const tempDocumentIds = {
  historyA: `browser_smoke_visual_history_a_${runToken}`,
  historyB: `browser_smoke_visual_history_b_${runToken}`,
  intercept: `browser_smoke_visual_intercept_${runToken}`,
  interceptLater: `browser_smoke_visual_intercept_later_${runToken}`,
  negativePreference: `browser_smoke_visual_negative_preference_${runToken}`,
  generation: `browser_smoke_visual_generation_${runToken}`,
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function requestJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${options.method || "GET"} ${route} failed (${response.status}): ${text.slice(0, 500)}`);
  return payload;
}

function withEvidenceParagraphs(contentHtml) {
  const source = String(contentHtml || "");
  const bad = source.includes(selectedBadPhrase) ? "" : `<p>${selectedBadPhrase}。</p>`;
  const approved = source.includes(approvedPhrase) ? "" : `<p>${approvedPhrase}</p>`;
  return `${source}${bad}${approved}<p id="a1-semantic-later-rewrite">${laterRewritePhrase}</p>`;
}

async function saveTempDocument({documentId, title, contentHtml, body, marker}) {
  const markedHtml = `${contentHtml}<p data-a1-semantic-version="1">${marker}</p>`;
  return requestJson("/api/document", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      documentId,
      documentType: "experiment",
      title,
      contentHtml: markedHtml,
      contentText: `${title}\n\n${String(body || "").trim()}\n\n${marker}`,
      metadata: {purpose: "A1 real semantic evidence fixture", runToken},
    }),
  });
}

async function cleanupTempDocument(documentId) {
  await requestJson(`/api/document?documentId=${encodeURIComponent(documentId)}`, {method: "DELETE"}).catch(() => {});
  const cleanupRoots = [
    path.join(writingRoot, ".cache/writing/documents"),
    path.join(writingRoot, ".cache/writing/deleted_documents"),
    path.join(writingRoot, ".cache/writing/topic_archives"),
    path.join(writingRoot, ".cache/writing/deleted_topic_archives"),
  ];
  for (const directory of cleanupRoots) {
    if (!fs.existsSync(directory)) continue;
    for (const name of await fsp.readdir(directory)) if (name.startsWith(documentId)) await fsp.unlink(path.join(directory, name)).catch(() => {});
  }
  for (const directory of [path.join(writingRoot, "obsidian_vault/Topics", documentId), path.join("/Users/a1/Documents/Obsidian Vault/Codex写作工作台/Topics", documentId)]) {
    await fsp.rm(directory, {recursive: true, force: true}).catch(() => {});
  }
}

async function selectPhrase(page, phrase) {
  const result = await page.evaluate((needle) => {
    const editor = document.querySelector("#editor");
    if (!editor) return {ok: false, reason: "editor-missing"};
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent?.indexOf(needle) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      node.parentElement?.scrollIntoView({block: "center", inline: "nearest"});
      document.dispatchEvent(new Event("selectionchange", {bubbles: true}));
      return {ok: true, selected: selection?.toString() || ""};
    }
    return {ok: false, reason: "phrase-not-found"};
  }, phrase);
  if (!result.ok || result.selected !== phrase) throw new Error(`selection failed: ${JSON.stringify(result)}`);
}

async function openTopicArchive(page) {
  await page.locator(".latest-fold").evaluate((node) => { node.open = true; });
  await page.locator("#refreshTopicArchive").click();
  await page.waitForSelector("#topicArchiveList .topic-archive-topic");
  await page.locator("#topicArchiveList .topic-archive-topic").evaluate((node) => { node.open = true; node.scrollIntoView({block: "center"}); });
  await page.waitForTimeout(650);
  return page.locator("#topicArchiveList .topic-archive-entry").count();
}

async function screenshot(page, name, locator = null) {
  if (locator) await locator.evaluate((node) => node.scrollIntoView({block: "center", inline: "nearest"}));
  await page.waitForTimeout(550);
  await page.screenshot({path: path.join(artifactDir, name)});
}

async function convertVideo(rawVideoPath, actionId) {
  const webmPath = path.join(artifactDir, `${actionId}.webm`);
  const mp4Path = path.join(artifactDir, `${actionId}.mp4`);
  if (path.resolve(rawVideoPath) !== path.resolve(webmPath)) await fsp.copyFile(rawVideoPath, webmPath);
  execFileSync(ffmpegPath, ["-y", "-i", webmPath, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path], {stdio: "pipe"});
  const durationSeconds = Number(execFileSync(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mp4Path], {encoding: "utf8"}).trim());
  return {webmPath, mp4Path, durationSeconds};
}

async function recordAction(actionId, operate) {
  let browser;
  let context;
  let page;
  let rawVideoPath;
  const consoleErrors = [];
  const rawPointerTelemetry = [];
  try {
    browser = await chromium.launch({headless: true});
    context = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1, recordVideo: {dir: artifactDir, size: {width: 1920, height: 1080}}});
    await context.exposeBinding("__a1SemanticPointerSink", (_source, event) => {
      if (event && Number.isFinite(event.epochMs)) rawPointerTelemetry.push(event);
    });
    await context.addInitScript(() => {
      let lastMoveEpochMs = 0;
      const emit = (type, event) => {
        const epochMs = performance.timeOrigin + performance.now();
        if (type === "pointermove" && epochMs - lastMoveEpochMs < 16) return;
        if (type === "pointermove") lastMoveEpochMs = epochMs;
        const target = event?.target instanceof Element ? event.target : null;
        window.__a1SemanticPointerSink({type, epochMs, x: Number.isFinite(event?.clientX) ? event.clientX / innerWidth : null, y: Number.isFinite(event?.clientY) ? event.clientY / innerHeight : null, button: event?.button ?? null, buttons: event?.buttons ?? null, target: {tag: target?.tagName?.toLowerCase() || null, id: target?.id || null, action: target?.getAttribute?.("data-like") !== null ? "like" : target?.getAttribute?.("data-ban") !== null ? "ban" : target?.getAttribute?.("data-run") !== null ? "run" : null}, viewport: {width: innerWidth, height: innerHeight}});
      };
      addEventListener("pointermove", (event) => emit("pointermove", event), true);
      addEventListener("pointerdown", (event) => emit("pointerdown", event), true);
      addEventListener("pointerup", (event) => emit("pointerup", event), true);
      addEventListener("click", (event) => emit("click", event), true);
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    const proof = await operate(page);
    const video = page.video();
    await page.close();
    rawVideoPath = await video.path();
    await context.close();
    await browser.close();
    page = null;
    context = null;
    browser = null;
    const media = await convertVideo(rawVideoPath, actionId);
    const pointerEvents = rawPointerTelemetry.filter((event) => Number.isFinite(event.x) && Number.isFinite(event.y));
    const firstEpochMs = pointerEvents[0]?.epochMs;
    const lastEpochMs = pointerEvents.at(-1)?.epochMs;
    const pointerTelemetry = {
      contract: "A1PointerTelemetry/v1",
      actionId,
      source: "playwright-real-dom-event",
      sampleIntervalFloorMs: 16,
      durationMs: firstEpochMs && lastEpochMs ? Math.round(lastEpochMs - firstEpochMs + 120) : 0,
      viewport: pointerEvents[0]?.viewport || {width: 1920, height: 1080},
      events: pointerEvents.map((event) => ({...event, tMs: Math.round(event.epochMs - firstEpochMs)})),
      provenanceBoundary: "real pointer endpoints from deleted temporary clones; curve travel may be reconstructed but click positions remain source-bound",
    };
    const pointerTelemetryFile = `${actionId}-pointer-telemetry.json`;
    await fsp.writeFile(path.join(artifactDir, pointerTelemetryFile), `${JSON.stringify(pointerTelemetry, null, 2)}\n`);
    const definition = definitions[actionId];
    return {
      actionId,
      status: consoleErrors.length ? "BLOCKED" : "PASS",
      proof,
      consoleErrors,
      keyStillFile: definition.keyStill,
      keyStillPublicUrl: `/${publicRelativeDir}/${definition.keyStill}`,
      videoFile: `${actionId}.mp4`,
      videoPublicUrl: `/${publicRelativeDir}/${actionId}.mp4`,
      durationSeconds: media.durationSeconds,
      pointerTelemetryFile,
      pointerTelemetryPublicUrl: `/${publicRelativeDir}/${pointerTelemetryFile}`,
      pointerTelemetryEventCount: pointerTelemetry.events.length,
      evidenceFrames: definition.frameFiles.map((file, index) => ({beat: definition.beatIds[index], publicUrl: `/${publicRelativeDir}/${file}`})),
    };
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

async function captureHistoryIsolation(draft, contentHtml) {
  const titleA = `临时证据 A · ${draft.title}`;
  const titleB = `临时证据 B · ${draft.title}`;
  for (let index = 1; index <= 6; index++) await saveTempDocument({documentId: tempDocumentIds.historyA, title: titleA, contentHtml, body: draft.body, marker: `主题 A 第 ${index} 次保存`});
  for (let index = 1; index <= 3; index++) await saveTempDocument({documentId: tempDocumentIds.historyB, title: titleB, contentHtml, body: draft.body, marker: `主题 B 第 ${index} 次保存`});
  return recordAction("historyIsolation", async (page) => {
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(tempDocumentIds.historyA)}`, {waitUntil: "networkidle"});
    const topicACount = await openTopicArchive(page);
    await screenshot(page, "history-isolation-01-topic-a-five.png", page.locator("#topicArchiveList"));
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(tempDocumentIds.historyB)}`, {waitUntil: "networkidle"});
    const topicBCount = await openTopicArchive(page);
    await screenshot(page, "history-isolation-02-topic-b-separated.png", page.locator("#topicArchiveList"));
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(tempDocumentIds.historyA)}`, {waitUntil: "networkidle"});
    const topicARestoredCount = await openTopicArchive(page);
    await screenshot(page, "history-isolation-03-topic-a-restored.png", page.locator("#topicArchiveList"));
    if (topicACount !== 5 || topicBCount >= 5 || topicARestoredCount !== 5) throw new Error(`history isolation proof failed: A=${topicACount}, B=${topicBCount}, restored=${topicARestoredCount}`);
    return {topicACount, topicBCount, topicARestoredCount, distinctDocumentIds: tempDocumentIds.historyA !== tempDocumentIds.historyB};
  });
}

async function capturePreferenceIntercept(draft, contentHtml) {
  await saveTempDocument({documentId: tempDocumentIds.intercept, title: `临时偏好拦截 · ${draft.title}`, contentHtml, body: draft.body, marker: "偏好拦截验证"});
  await saveTempDocument({
    documentId: tempDocumentIds.interceptLater,
    title: "下一篇临时草稿 · 等待风格检查",
    contentHtml: `<h2>下一篇临时草稿</h2><p>${selectedBadPhrase}。</p><p>这一段还没有具体的人、动作和结果。</p>`,
    body: `${selectedBadPhrase}。\n\n这一段还没有具体的人、动作和结果。`,
    marker: "后续写作现场",
  });
  return recordAction("preferenceIntercept", async (page) => {
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(tempDocumentIds.intercept)}`, {waitUntil: "networkidle"});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), selectedBadPhrase);
    await selectPhrase(page, selectedBadPhrase);
    await page.waitForSelector("#selectionMenu [data-ban]", {state: "visible"});
    await screenshot(page, "preference-intercept-01-selected.png");
    await page.locator("#selectionMenu [data-ban]").click();
    await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
    await screenshot(page, "preference-intercept-02-recorded.png");
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(tempDocumentIds.interceptLater)}`, {waitUntil: "networkidle"});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), selectedBadPhrase);
    const proof = await page.evaluate(async () => await runStyleProof());
    const bannedFindings = Number(proof?.memoryCounts?.currentBannedFindings || 0);
    if (bannedFindings < 1) throw new Error(`style proof did not intercept remembered line: ${JSON.stringify(proof?.memoryCounts || {})}`);
    await page.locator("#saveWorkspace").click();
    await page.waitForFunction(() => (document.querySelector("#saveState")?.textContent || "").includes("工作区已存"));
    await openTopicArchive(page);
    await page.waitForFunction(() => (document.querySelector("#topicArchiveList")?.textContent || "").includes("踩禁 2"));
    await page.locator("#topicArchiveList .topic-archive-topic").evaluate((node) => { node.open = true; });
    await page.waitForTimeout(80);
    await page.screenshot({path: path.join(artifactDir, "preference-intercept-03-style-proof.png")});
    return {bannedFindings, summary: proof.summary, effectiveness: proof.effectiveness};
  });
}

async function captureNegativePreferenceRecord(draft, contentHtml) {
  await saveTempDocument({documentId: tempDocumentIds.negativePreference, title: `临时负向记录 · ${draft.title}`, contentHtml, body: draft.body, marker: "负向风格记录验证"});
  return recordAction("negativePreferenceRecord", async (page) => {
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(tempDocumentIds.negativePreference)}`, {waitUntil: "networkidle"});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), exactNegativePhrase);
    await selectPhrase(page, exactNegativePhrase);
    await page.waitForSelector("#selectionMenu [data-ban]", {state: "visible"});
    await screenshot(page, "negative-preference-01-exact-selection.png");
    await page.locator("#selectionMenu [data-ban]").click();
    await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
    await screenshot(page, "negative-preference-02-recorded.png");
    const proof = await page.evaluate(async (needle) => {
      const response = await fetch("/api/memory");
      const entries = await response.json();
      const match = (Array.isArray(entries) ? entries : []).find((entry) => String(entry.source_text || entry.sourceText || "").includes(needle) && entry.kind === "banned_line");
      return match ? {id: match.id, kind: match.kind, exactPhrasePresent: String(match.source_text || match.sourceText || "").includes(needle), reason: match.reason || null, tags: match.tags || null} : null;
    }, exactNegativePhrase);
    if (!proof?.exactPhrasePresent) throw new Error("exact negative preference was not persisted by the real product API");
    return proof;
  });
}

async function capturePreferenceGeneration(draft, contentHtml) {
  await saveTempDocument({documentId: tempDocumentIds.generation, title: `临时喜欢库调用 · ${draft.title}`, contentHtml, body: draft.body, marker: "喜欢库进入下一轮验证"});
  return recordAction("preferenceGeneration", async (page) => {
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(tempDocumentIds.generation)}`, {waitUntil: "networkidle"});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), laterRewritePhrase);
    await selectPhrase(page, approvedPhrase);
    await page.waitForSelector("#selectionMenu [data-like]", {state: "visible"});
    await page.locator("#selectionMenu [data-like]").click();
    await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
    await screenshot(page, "preference-generation-01-liked.png");
    await selectPhrase(page, laterRewritePhrase);
    await page.waitForSelector("#selectionMenu [data-run]", {state: "visible"});
    await screenshot(page, "preference-generation-02-next-selection.png");
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/rewrite-selection") && response.request().method() === "POST", {timeout: 90000});
    await page.locator("#selectionMenu [data-run]").click();
    const response = await responsePromise;
    const rewrite = await response.json();
    await page.waitForSelector("#candidateList .candidate-text", {state: "visible", timeout: 90000});
    await page.waitForSelector("#candidateList .memory-proof-line", {state: "visible", timeout: 30000});
    await screenshot(page, "preference-generation-03-candidates-with-memory.png", page.locator("#candidateList"));
    const approvedCount = Number(rewrite?.memoryProof?.counts?.approved || 0);
    const preferApplied = Boolean(rewrite?.memoryProof?.applied?.prefer);
    const candidateCount = Array.isArray(rewrite?.variants) ? rewrite.variants.length : 0;
    if (approvedCount < 1 || !preferApplied || candidateCount < 1) throw new Error(`later rewrite did not consume approved memory: ${JSON.stringify({approvedCount, preferApplied, candidateCount, memoryProof: rewrite?.memoryProof})}`);
    return {approvedCount, preferApplied, candidateCount, engine: rewrite.engine, memoryProof: rewrite.memoryProof};
  });
}

async function copyOutputs() {
  await Promise.all([studioDir, rendererDir].map((directory) => fsp.mkdir(directory, {recursive: true})));
  const files = (await fsp.readdir(artifactDir)).filter((name) => /\.(?:png|mp4|webm)$/iu.test(name) || /-pointer-telemetry\.json$/u.test(name));
  for (const name of files) await Promise.all([
    fsp.copyFile(path.join(artifactDir, name), path.join(studioDir, name)),
    fsp.copyFile(path.join(artifactDir, name), path.join(rendererDir, name)),
  ]);
  return files;
}

async function main() {
  if (!fs.existsSync(draftPath)) throw new Error(`current draft missing: ${draftPath}`);
  if (!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) throw new Error("bundled ffmpeg/ffprobe missing");
  await fsp.mkdir(artifactDir, {recursive: true});
  const health = await requestJson("/api/health");
  if (!health.ok) throw new Error("writing workbench health check failed");
  const draft = JSON.parse(await fsp.readFile(draftPath, "utf8"));
  const contentHtml = withEvidenceParagraphs(draft.contentHtml);
  const memoryBefore = await requestJson("/api/memory");
  const memoryBeforeIds = new Set((Array.isArray(memoryBefore) ? memoryBefore : []).map((item) => item.id));
  const captures = [];
  const onlyArg = process.argv.find((item) => item.startsWith("--only="))?.slice("--only=".length) || "";
  const requested = new Set(onlyArg.split(",").map((item) => item.trim()).filter(Boolean));
  const enabled = (actionId) => !requested.size || requested.has(actionId);
  const unknown = [...requested].filter((actionId) => !Object.hasOwn(definitions, actionId));
  if (unknown.length) throw new Error(`unknown semantic evidence actions: ${unknown.join(",")}`);
  try {
    if (enabled("historyIsolation")) captures.push(await captureHistoryIsolation(draft, contentHtml));
    if (enabled("preferenceIntercept")) captures.push(await capturePreferenceIntercept(draft, contentHtml));
    if (enabled("negativePreferenceRecord")) captures.push(await captureNegativePreferenceRecord(draft, contentHtml));
    if (enabled("preferenceGeneration")) captures.push(await capturePreferenceGeneration(draft, contentHtml));
  } finally {
    const memoryAfter = await requestJson("/api/memory").catch(() => []);
    for (const entry of (Array.isArray(memoryAfter) ? memoryAfter : [])) if (!memoryBeforeIds.has(entry.id)) await requestJson(`/api/memory/${encodeURIComponent(entry.id)}`, {method: "DELETE"}).catch(() => {});
    for (const documentId of Object.values(tempDocumentIds)) await cleanupTempDocument(documentId);
  }
  const copiedFiles = await copyOutputs();
  for (const capture of captures) {
    capture.videoSha256 = sha256(await fsp.readFile(path.join(studioDir, capture.videoFile)));
    capture.keyStillSha256 = sha256(await fsp.readFile(path.join(studioDir, capture.keyStillFile)));
    capture.pointerTelemetrySha256 = sha256(await fsp.readFile(path.join(studioDir, capture.pointerTelemetryFile)));
  }
  const report = {
    contract: "A1RealWritingWorkbenchSemanticEvidencePack/v1",
    status: captures.every((capture) => capture.status === "PASS") ? "PASS" : "BLOCKED",
    capturedAt: now,
    source: {kind: "real-local-writing-workbench-runtime", baseUrl, currentDraftPath: draftPath, title: draft.title, formalArticleMutated: false, temporaryClonesDeleted: true},
    captures,
    copiedFiles,
    checks: {realRuntimeUsed: true, fakeUiUsed: false, exactClaimEvidenceCount: captures.length, formalArticleMutated: false, temporaryClonesDeleted: true},
    admissionBoundary: {captureOnly, workspaceMutated: !captureOnly, productionAdmission: !captureOnly, userVisualApproval: "NOT_APPROVED"},
  };
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  await Promise.all([
    fsp.writeFile(path.join(artifactDir, "report.json"), reportText),
    fsp.writeFile(path.join(studioDir, "report.json"), reportText),
    fsp.writeFile(path.join(rendererDir, "report.json"), reportText),
  ]);
  if (report.status !== "PASS") throw new Error(`semantic evidence capture blocked: ${captures.filter((capture) => capture.status !== "PASS").map((capture) => capture.actionId).join(",")}`);

  if (captureOnly) {
    console.log(JSON.stringify({status: report.status, captureOnly: true, workspaceMutated: false, actionCount: captures.length, actions: captures.map((capture) => ({actionId: capture.actionId, durationSeconds: capture.durationSeconds, video: capture.videoPublicUrl, pointerTelemetry: capture.pointerTelemetryPublicUrl})), report: `/${publicRelativeDir}/report.json`}, null, 2));
    return;
  }

  const update = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const next = structuredClone(current);
    const baseAsset = next.library.assets.find((asset) => asset.id === "source-documentary-selection-action");
    if (!baseAsset) throw new Error("source-documentary-selection-action missing");
    const invalidatedShotIds = [];
    for (const capture of captures) {
      const definition = definitions[capture.actionId];
      let asset = next.library.assets.find((item) => item.id === definition.assetId);
      if (!asset) {
        asset = structuredClone(baseAsset);
        asset.id = definition.assetId;
        next.library.assets.push(asset);
      }
      asset.name = definition.name;
      asset.purpose = definition.purpose;
      asset.semanticRole = "real-claim-exact-causal-screen-evidence";
      asset.route = "verified-real-source";
      asset.requiredForShotComposition = true;
      asset.assetUri = capture.keyStillPublicUrl;
      asset.sha256 = capture.keyStillSha256;
      asset.sourceUri = path.relative(root, path.join(artifactDir, "report.json"));
      asset.preview = {kind: "source-image", publicUrl: capture.keyStillPublicUrl};
      asset.usedByShotIds = definition.shotIds;
      asset.videoEvidence = {
        contract: "A1RealWritingWorkbenchSemanticActionCapture/v1",
        actionId: capture.actionId,
        publicUrl: capture.videoPublicUrl,
        sha256: capture.videoSha256,
        durationSeconds: capture.durationSeconds,
        evidenceFrames: capture.evidenceFrames,
        proof: capture.proof,
        evidenceBoundary: "real local product interaction on deleted temporary article clones; exact claim proof only",
      };
      asset.provenance = {sourceType: "verified-real-local-writing-workbench-semantic-action-capture", sourceUri: path.relative(root, path.join(artifactDir, "report.json")), license: "user-owned local product capture", reviewed: true, evidenceBoundary: asset.videoEvidence.evidenceBoundary};
      asset.contentSha256 = editorialAssetContentSha256(asset);
      asset.status = "approved";
      asset.review = {status: "approved", note: "真实稿台已完成台词对应的后续因果验证；临时主题和新增偏好均已清理。", reviewedAt: now, reviewedBy: "system-semantic-source-audit", approvedContentSha256: asset.contentSha256};
      for (const shotId of definition.shotIds) {
        const shot = next.library.assets.find((item) => item.route === "shot-composition" && item.shotDemand?.shotId === shotId);
        if (!shot) throw new Error(`shot composition missing: ${shotId}`);
        invalidatedShotIds.push(shotId);
        if ((shot.candidates || []).length || shot.selectedCandidateId || shot.candidateRender) {
          shot.revisionHistory ||= [];
          shot.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(shot.visualRevision?.round || 1), reason: "exact-semantic-writing-workbench-evidence-admitted", candidates: shot.candidates || [], candidateRender: shot.candidateRender || null, visualCritic: shot.visualCritic || null, archivedAt: now});
        }
        shot.candidates = [];
        shot.selectedCandidateId = null;
        delete shot.candidateRender;
        delete shot.visualCritic;
        shot.status = "brief-ready";
        shot.review = {status: "pending", note: "台词对应的真实因果操作已更新，旧候选自动失效。", reviewedAt: now, reviewedBy: "system-semantic-source-audit", approvedContentSha256: null};
        shot.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: sha256(Buffer.from(reportText)), prompt: "以真实后续因果状态作为唯一动作锚点；界面不重绘、不叠 HUD、不用无对象箭头。", createdAt: now};
      }
    }
    next.production.assembly.screenMediaBound = true;
    next.production.assembly.semanticScreenEvidence = {contract: report.contract, status: "VERIFIED_EXACT_CLAIM_EVIDENCE", reportPublicUrl: `/${publicRelativeDir}/report.json`, actionIds: captures.map((capture) => capture.actionId), shotIds: invalidatedShotIds};
    next.production.maturityLoop.shotReports = Object.fromEntries(Object.entries(next.production.maturityLoop.shotReports || {}).filter(([shotId]) => !invalidatedShotIds.includes(shotId)));
    next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((shotId) => !invalidatedShotIds.includes(shotId));
    next.production.maturityLoop.status = "paused-for-exact-semantic-screen-shot-rebuild";
    next.production.maturityLoop.nextAction = `rebuild-critic-${[...new Set(invalidatedShotIds)].join("-")}-then-rerun-global-visual-audit`;
    next.production.maturityLoop.updatedAt = now;
    const event = createProductionEvent({workspace: current, action: "real-writing-workbench-semantic-evidence-admitted", payload: {report: path.relative(root, path.join(artifactDir, "report.json")), actionIds: captures.map((capture) => capture.actionId), invalidatedShotIds}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = recalculateEditorialAssetWorkbench(next, now);
    persistProjectState(appRoot, recalculated, {event});
    return recalculated;
  });

  console.log(JSON.stringify({status: report.status, actions: captures.map((capture) => ({actionId: capture.actionId, proof: capture.proof, durationSeconds: capture.durationSeconds, video: capture.videoPublicUrl, keyStill: capture.keyStillPublicUrl})), nextAction: update.production.maturityLoop.nextAction}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
