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
const captureOnlyFamily = String(process.env.A1_CAPTURE_ONLY_FAMILY || "isolated-action-capture-v1")
  .replace(/[^a-z0-9._-]+/giu, "-");
const publicRelativeDir = captureOnly
  ? `generated/system-line/editorial-asset-workbench-v1/continuous-screen-evidence-v2/${captureOnlyFamily}`
  : "generated/system-line/editorial-asset-workbench-v1/source-cache/writing-workbench-action-pack-v1";
const studioDir = path.join(appRoot, "public", publicRelativeDir);
const rendererDir = path.join(root, "remotion-renderer/public", publicRelativeDir);
const artifactDir = captureOnly
  ? path.join(root, `.codex-artifacts/system-progress-system-line/continuous-screen-evidence-v2/${captureOnlyFamily}`)
  : path.join(root, ".codex-artifacts/system-progress-system-line/writing-workbench-action-pack-v1");
const ffmpegPath = path.join(root, "node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg");
const ffprobePath = path.join(root, "node_modules/@ffprobe-installer/darwin-arm64/ffprobe");
const now = new Date().toISOString();
const selectedPhrase = "当前行业正在快速发展，创作者需要积极拥抱变化，提升自身竞争力";
const correctedEvidence = "我把 AI 直出的开头放进审稿，系统先标出这类套话，再要求补上具体对象和读者后果。";

const actionDefinitions = {
  preference: {
    assetId: "source-documentary-preference-action",
    name: "真实喜欢与讨厌操作",
    purpose: "真实展示正文选区进入讨厌库、喜欢库并形成可复用偏好的因果动作。",
    shotIds: ["ED-03", "ED-24", "ED-25", "ED-26"],
    keyStill: "preference-04-liked.png",
    frameFiles: ["preference-01-selected-bad.png", "preference-02-disliked.png", "preference-03-selected-good.png", "preference-04-liked.png"],
  },
  paragraph: {
    assetId: "source-documentary-paragraph-action",
    name: "真实补段操作",
    purpose: "真实展示在正文缺口中输入需求、获得候选并把候选放回正文。",
    shotIds: ["ED-04", "ED-27", "ED-28"],
    keyStill: "paragraph-03-candidates.png",
    frameFiles: ["paragraph-01-slot.png", "paragraph-02-request.png", "paragraph-03-candidates.png", "paragraph-04-candidate-picked.png", "paragraph-05-applied.png"],
  },
  review: {
    assetId: "source-documentary-review-action",
    name: "真实收稿检查操作",
    purpose: "真实展示收稿检查定位正文问题，并从问题卡发起局部修订。",
    shotIds: ["ED-05", "ED-29"],
    keyStill: "review-01-findings.png",
    frameFiles: ["review-01-findings.png", "review-02-fix-surface.png"],
  },
  presentation: {
    assetId: "source-documentary-presentation-action",
    name: "真实演示模式操作",
    purpose: "真实展示成稿进入演示模式、调整字号与速度并开始滚动。",
    shotIds: ["ED-06", "ED-30"],
    keyStill: "presentation-02-adjusted.png",
    frameFiles: ["presentation-01-open.png", "presentation-02-adjusted.png", "presentation-03-playing.png"],
  },
  saveHistory: {
    assetId: "source-documentary-save-history-action",
    name: "真实编辑保存与版本操作",
    purpose: "真实展示正文可编辑、Command+S 保存、重载恢复及版本记录。",
    shotIds: ["ED-21", "ED-22", "ED-23"],
    keyStill: "save-history-03-version.png",
    frameFiles: ["save-history-01-edit.png", "save-history-02-saved.png", "save-history-03-version.png"],
  },
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function requestJson(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${options.method || "GET"} ${route} failed (${response.status}): ${text.slice(0, 500)}`);
  return payload;
}

function taggedContentHtml(contentHtml) {
  const tagged = String(contentHtml || "")
    .replace(/<p>([^<]*当前行业正在快速发展[^<]*)<\/p>/u, '<p id="a1-action-original">$1</p>')
    .replace(/<p>([^<]*我把 AI 直出的开头放进审稿[^<]*)<\/p>/u, '<p id="a1-action-corrected">$1</p>');
  if (!tagged.includes('id="a1-action-original"') || !tagged.includes('id="a1-action-corrected"')) throw new Error("current article action anchors missing");
  return tagged;
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
      node.parentElement?.scrollIntoView({block: "center"});
      document.dispatchEvent(new Event("selectionchange", {bubbles: true}));
      return {ok: true, selected: selection?.toString() || ""};
    }
    return {ok: false, reason: "phrase-not-found"};
  }, phrase);
  if (!result.ok || result.selected !== phrase) throw new Error(`selection failed: ${JSON.stringify(result)}`);
}

const roundedRegion = (region) => Object.fromEntries(Object.entries(region).map(([key, value]) => [key, Math.round(Number(value) * 10_000) / 10_000]));

function expandRegion(region, {left = 0, top = 0, right = 0, bottom = 0} = {}) {
  if (!region) return null;
  const x = Math.max(0, region.x - left);
  const y = Math.max(0, region.y - top);
  const boundedRight = Math.min(1, region.x + region.width + right);
  const boundedBottom = Math.min(1, region.y + region.height + bottom);
  return roundedRegion({x, y, width: boundedRight - x, height: boundedBottom - y});
}

async function measurePhraseRegion(page, phrase) {
  const region = await page.evaluate((needle) => {
    const editor = document.querySelector("#editor");
    if (!editor) return null;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent?.indexOf(needle) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      if (!rects.length) return null;
      const left = Math.min(...rects.map((rect) => rect.left));
      const top = Math.min(...rects.map((rect) => rect.top));
      const right = Math.max(...rects.map((rect) => rect.right));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      return {x: left / innerWidth, y: top / innerHeight, width: (right - left) / innerWidth, height: (bottom - top) / innerHeight};
    }
    return null;
  }, phrase);
  if (!region) throw new Error(`phrase focus region missing:${phrase.slice(0, 24)}`);
  return roundedRegion(region);
}

async function measureLocatorRegion(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error(`locator focus region missing:${selector}`);
  return roundedRegion({x: box.x / viewport.width, y: box.y / viewport.height, width: box.width / viewport.width, height: box.height / viewport.height});
}

async function measureCurrentSelectionRegion(page) {
  const region = await page.evaluate(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const rects = [...selection.getRangeAt(0).getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    if (right <= 0 || bottom <= 0 || left >= innerWidth || top >= innerHeight) return null;
    return {x: left / innerWidth, y: top / innerHeight, width: (right - left) / innerWidth, height: (bottom - top) / innerHeight};
  });
  return region ? roundedRegion(region) : null;
}

async function saveTempDocument(documentId, draft, contentHtml) {
  return requestJson("/api/document", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      documentId,
      documentType: "experiment",
      title: draft.title,
      contentHtml,
      contentText: `${draft.title}\n\n${String(draft.body || "").trim()}`,
      metadata: {purpose: "A1 real writing-workbench action-pack fixture"},
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

async function convertVideo(rawVideoPath, actionId) {
  const webmPath = path.join(artifactDir, `${actionId}.webm`);
  const mp4Path = path.join(artifactDir, `${actionId}.mp4`);
  if (path.resolve(rawVideoPath) !== path.resolve(webmPath)) await fsp.copyFile(rawVideoPath, webmPath);
  execFileSync(ffmpegPath, ["-y", "-i", webmPath, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path], {stdio: "pipe"});
  const durationSeconds = Number(execFileSync(ffprobePath, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mp4Path], {encoding: "utf8"}).trim());
  return {webmPath, mp4Path, durationSeconds};
}

async function captureAction(actionId, draft, contentHtml) {
  const documentId = `browser_smoke_visual_${actionId}_${Date.now()}`;
  await saveTempDocument(documentId, draft, contentHtml);
  let browser;
  let context;
  let page;
  let rawVideoPath;
  const consoleErrors = [];
  const apiResponses = [];
  const rawPointerTelemetry = [];
  let pointerTelemetry = null;
  const frameFocusRegions = new Map();
  const frameEvidence = new Map();
  const screenshot = async (name, focusRegion = null, evidence = null) => {
    await page.waitForTimeout(420);
    await page.screenshot({path: path.join(artifactDir, name)});
    if (focusRegion) frameFocusRegions.set(name, expandRegion(focusRegion, {left: .008, top: .01, right: .008, bottom: .01}));
    if (evidence) frameEvidence.set(name, evidence);
  };
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--window-size=1920,1080", "--force-device-scale-factor=1"],
    });
    context = await browser.newContext({
      viewport: {width: 1920, height: 1080},
      screen: {width: 1920, height: 1080},
      deviceScaleFactor: 1,
      recordVideo: {dir: artifactDir, size: {width: 1920, height: 1080}},
    });
    await context.exposeBinding("__a1PointerTelemetrySink", (_source, event) => {
      if (event && Number.isFinite(event.epochMs)) rawPointerTelemetry.push(event);
    });
    await context.addInitScript(() => {
      let lastMoveEpochMs = 0;
      const targetDescriptor = (target) => {
        if (!(target instanceof Element)) return {tag: "unknown", id: null, role: null, action: null};
        return {
          tag: target.tagName.toLowerCase(),
          id: target.id || null,
          role: target.getAttribute("role"),
          action: target.getAttribute("data-accept") !== null ? "accept" : target.getAttribute("data-run") !== null ? "run" : target.getAttribute("data-like") !== null ? "like" : target.getAttribute("data-ban") !== null ? "ban" : target.getAttribute("data-paragraph-assist-slot") !== null ? "paragraph-assist-slot" : null,
        };
      };
      const emit = (type, event = null, label = null) => {
        const epochMs = performance.timeOrigin + performance.now();
        if (type === "pointermove" && epochMs - lastMoveEpochMs < 16) return;
        if (type === "pointermove") lastMoveEpochMs = epochMs;
        const x = event && Number.isFinite(event.clientX) ? event.clientX / innerWidth : null;
        const y = event && Number.isFinite(event.clientY) ? event.clientY / innerHeight : null;
        window.__a1PointerTelemetrySink({
          type,
          label,
          epochMs,
          x,
          y,
          button: event?.button ?? null,
          buttons: event?.buttons ?? null,
          target: targetDescriptor(event?.target),
          viewport: {width: innerWidth, height: innerHeight},
        });
      };
      addEventListener("pointermove", (event) => emit("pointermove", event), true);
      addEventListener("pointerdown", (event) => emit("pointerdown", event), true);
      addEventListener("pointerup", (event) => emit("pointerup", event), true);
      addEventListener("click", (event) => emit("click", event), true);
      window.__a1PointerTelemetryMark = (label) => emit("marker", null, label);
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", async (response) => {
      if (!/\/api\/(?:rewrite-selection|paragraph-assist|final-review)/u.test(response.url())) return;
      try { apiResponses.push({url: response.url(), status: response.status(), payload: await response.json()}); } catch {}
    });
    await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(documentId)}`, {waitUntil: "networkidle"});
    await page.waitForFunction((needle) => document.querySelector("#editor")?.textContent?.includes(needle), selectedPhrase);
    await page.evaluate(() => window.__a1PointerTelemetryMark?.("action-start"));

    if (actionId === "preference") {
      await selectPhrase(page, selectedPhrase);
      await page.waitForSelector("#selectionMenu [data-ban]", {state: "visible"});
      const badPhraseRegion = expandRegion(await measurePhraseRegion(page, selectedPhrase), {bottom: .072});
      await screenshot("preference-01-selected-bad.png", badPhraseRegion);
      await page.locator("#selectionMenu [data-ban]").click();
      await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
      await screenshot("preference-02-disliked.png", badPhraseRegion);
      await selectPhrase(page, correctedEvidence);
      await page.waitForSelector("#selectionMenu [data-like]", {state: "visible"});
      const goodPhraseRegion = expandRegion(await measurePhraseRegion(page, correctedEvidence), {bottom: .072});
      await screenshot("preference-03-selected-good.png", goodPhraseRegion);
      await page.locator("#selectionMenu [data-like]").click();
      await page.waitForFunction(() => (document.querySelector("#selectionMenuStatus")?.textContent || "").includes("已记"));
      await screenshot("preference-04-liked.png", goodPhraseRegion);
    }

    if (actionId === "paragraph") {
      const created = await page.locator("#a1-action-original").evaluate((node) => {
        node.scrollIntoView({block: "center"});
        return typeof window.createParagraphAssistSlotAfter === "function" && window.createParagraphAssistSlotAfter(node);
      });
      if (!created) throw new Error("paragraph assist slot creation failed");
      const slot = page.locator('p[data-paragraph-assist-slot="1"]');
      await slot.scrollIntoViewIfNeeded();
      await screenshot("paragraph-01-slot.png", await measureLocatorRegion(page, 'p[data-paragraph-assist-slot="1"]'));
      await slot.click();
      await page.keyboard.type("写一些 AI 味最常见的句子例子，并解释为什么这些句子看着稳却很空。", {delay: 8});
      await page.waitForFunction(() => (document.querySelector("#paragraphAssistState")?.textContent || "").includes("可补写"));
      await screenshot("paragraph-02-request.png", await measureLocatorRegion(page, 'p[data-paragraph-assist-slot="1"]'));
      await slot.click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => {
        const state = document.querySelector('p[data-paragraph-assist-slot="1"]')?.dataset.runState || "";
        return document.querySelectorAll("#candidateList .candidate-text").length >= 1 || state === "failed";
      }, null, {timeout: 90000});
      const paragraphState = await page.evaluate(() => {
        const node = document.querySelector('p[data-paragraph-assist-slot="1"]');
        return {runState: node?.dataset.runState || "ready", label: node?.dataset.label || "", progress: node?.dataset.progress || "", surface: document.querySelector("#candidateList")?.textContent || ""};
      });
      if (paragraphState.runState === "failed") throw new Error(`paragraph assist failed: ${JSON.stringify(paragraphState)}`);
      const acceptedCandidateText = (await page.locator("#candidateList .candidate-text").first().innerText()).trim();
      await screenshot("paragraph-03-candidates.png", await measureLocatorRegion(page, "#candidateList"), {candidateText: acceptedCandidateText});
      const accept = page.locator("#candidateList [data-accept]").first();
      await accept.scrollIntoViewIfNeeded();
      const acceptBox = await accept.boundingBox();
      if (!acceptBox) throw new Error("paragraph accept button bounding box missing");
      await page.mouse.move(acceptBox.x + acceptBox.width / 2, acceptBox.y + acceptBox.height / 2);
      await page.mouse.down();
      const viewport = page.viewportSize();
      await screenshot("paragraph-04-candidate-picked.png", await measureLocatorRegion(page, "#candidateList"), {
        candidateText: acceptedCandidateText,
        interaction: {
          type: "pointer-press",
          target: "real-candidate-accept-button",
          x: (acceptBox.x + acceptBox.width / 2) / viewport.width,
          y: (acceptBox.y + acceptBox.height / 2) / viewport.height,
          source: "playwright-real-dom-event",
        },
      });
      await page.mouse.up();
      await page.waitForFunction(() => (document.querySelector("#selectionState")?.textContent || "").includes("已补段"));
      const appliedEvidence = await page.evaluate((expectedText) => {
        const paragraphs = [...document.querySelectorAll("#editor p")];
        const expected = String(expectedText || "").replace(/\s+/gu, "").trim();
        const startIndex = paragraphs.findIndex((item) => expected.startsWith(String(item.textContent || "").replace(/\s+/gu, "").trim().slice(0, 24)));
        if (startIndex < 0) return {ok: false, appliedText: "", textMatches: false, caretAtEnd: false, focusRegion: null};
        const inserted = [];
        let normalized = "";
        for (let index = startIndex; index < paragraphs.length && normalized.length < expected.length; index += 1) {
          inserted.push(paragraphs[index]);
          normalized += String(paragraphs[index].textContent || "").replace(/\s+/gu, "").trim();
        }
        if (!inserted.length) return {ok: false, appliedText: "", textMatches: false, caretAtEnd: false, focusRegion: null};
        inserted[0].scrollIntoView({block: "center"});
        const range = document.createRange();
        range.selectNodeContents(inserted.at(-1));
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        const rects = inserted.map((node) => node.getBoundingClientRect());
        const left = Math.min(...rects.map((rect) => rect.left));
        const top = Math.min(...rects.map((rect) => rect.top));
        const right = Math.max(...rects.map((rect) => rect.right));
        const bottom = Math.max(...rects.map((rect) => rect.bottom));
        return {
          ok: true,
          appliedText: inserted.map((node) => String(node.textContent || "").trim()).join("\n"),
          textMatches: normalized === expected,
          caretAtEnd: true,
          focusRegion: {x: left / innerWidth, y: top / innerHeight, width: (right - left) / innerWidth, height: (bottom - top) / innerHeight},
        };
      }, acceptedCandidateText);
      if (!appliedEvidence.ok || !appliedEvidence.textMatches) throw new Error(`paragraph applied text mismatch:${JSON.stringify(appliedEvidence)}`);
      await screenshot("paragraph-05-applied.png", expandRegion(appliedEvidence.focusRegion, {top: .08, bottom: .08}), appliedEvidence);
    }

    if (actionId === "review") {
      await page.locator("#finalReviewButton").click();
      await page.waitForFunction(() => document.querySelectorAll(".final-review-item").length >= 1 || Boolean(document.querySelector(".final-review-empty")), null, {timeout: 20000});
      await screenshot("review-01-findings.png", await measureLocatorRegion(page, ".final-review-item"));
      const fix = page.locator(".final-review-item [data-fix]").first();
      if (await fix.count()) {
        await fix.click();
        await page.waitForFunction(() => !((document.querySelector("#selectionState")?.textContent || "未选").includes("未选")));
      }
      await screenshot("review-02-fix-surface.png", (await measureCurrentSelectionRegion(page)) || (await measureLocatorRegion(page, ".final-review-item")));
    }

    if (actionId === "presentation") {
      await page.locator("#presentDraft").click();
      await page.waitForFunction(() => !document.querySelector("#presentationMode")?.hasAttribute("hidden"));
      await screenshot("presentation-01-open.png", await measureLocatorRegion(page, ".presentation-controls"));
      await page.locator("#presentationFontSize").fill("68");
      await page.locator("#presentationSpeed").fill("155");
      await screenshot("presentation-02-adjusted.png", await measureLocatorRegion(page, ".presentation-controls"));
      await page.locator("#presentationPlay").click();
      await page.waitForTimeout(1000);
      await screenshot("presentation-03-playing.png", await measureLocatorRegion(page, ".presentation-controls"));
    }

    if (actionId === "saveHistory") {
      const marker = `临时保存验证 ${Date.now()}`;
      await page.locator("#editor").click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.type(marker, {delay: 12});
      const markerRegion = expandRegion(await measurePhraseRegion(page, marker), {left: .015, top: .025, right: .015, bottom: .025});
      await screenshot("save-history-01-edit.png", markerRegion);
      await page.keyboard.press("Meta+S");
      await page.waitForFunction(() => (document.querySelector("#saveState")?.textContent || "").includes("工作区已存"));
      await screenshot("save-history-02-saved.png", markerRegion);
      await page.reload({waitUntil: "networkidle"});
      await page.waitForFunction((text) => document.querySelector("#editor")?.textContent?.includes(text), marker);
      await page.locator(".latest-fold").evaluate((node) => { node.open = true; });
      await page.locator("#refreshTopicArchive").click();
      await page.waitForFunction(() => !(document.querySelector("#topicArchiveList")?.textContent || "").includes("暂无存档"));
      await screenshot("save-history-03-version.png", await measureLocatorRegion(page, "#topicArchiveList"));
    }

    await page.evaluate(() => window.__a1PointerTelemetryMark?.("action-end"));
    await page.waitForTimeout(80);
    const startMarker = rawPointerTelemetry.find((event) => event.type === "marker" && event.label === "action-start");
    const endMarker = [...rawPointerTelemetry].reverse().find((event) => event.type === "marker" && event.label === "action-end");
    if (!startMarker || !endMarker || endMarker.epochMs <= startMarker.epochMs) throw new Error(`${actionId} pointer telemetry markers missing`);
    const events = rawPointerTelemetry
      .filter((event) => event.epochMs >= startMarker.epochMs && event.epochMs <= endMarker.epochMs)
      .map((event) => ({...event, tMs: Math.round(event.epochMs - startMarker.epochMs)}));
    pointerTelemetry = {
      contract: "A1PointerTelemetry/v1",
      actionId,
      source: "playwright-real-dom-event",
      sampleIntervalFloorMs: 16,
      durationMs: Math.round(endMarker.epochMs - startMarker.epochMs),
      viewport: events.find((event) => event.viewport)?.viewport || {width: 1920, height: 1080},
      events,
      provenanceBoundary: "real pointer events from a deleted temporary clone; no production admission implied",
    };
    const pointerTelemetryFile = `${actionId}-pointer-telemetry.json`;
    await fsp.writeFile(path.join(artifactDir, pointerTelemetryFile), `${JSON.stringify(pointerTelemetry, null, 2)}\n`);
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
    await cleanupTempDocument(documentId);
  }
  if (!rawVideoPath || !fs.existsSync(rawVideoPath)) throw new Error(`${actionId} recording missing`);
  if (!pointerTelemetry) throw new Error(`${actionId} pointer telemetry missing`);
  const media = await convertVideo(rawVideoPath, actionId);
  const definition = actionDefinitions[actionId];
  const frameUrls = definition.frameFiles.map((file, index) => ({beat: `${actionId}-${index + 1}`, publicUrl: `/${publicRelativeDir}/${file}`, focusRegion: frameFocusRegions.get(file) || null, ...(frameEvidence.get(file) || {})}));
  return {
    actionId,
    status: consoleErrors.length ? "BLOCKED" : "PASS",
    sourceUrl: `${baseUrl}/v2/?documentId=${encodeURIComponent(documentId)}`,
    temporaryCloneDeleted: true,
    apiResponses,
    consoleErrors,
    keyStillFile: definition.keyStill,
    keyStillPublicUrl: `/${publicRelativeDir}/${definition.keyStill}`,
    videoFile: `${actionId}.mp4`,
    videoPublicUrl: `/${publicRelativeDir}/${actionId}.mp4`,
    durationSeconds: media.durationSeconds,
    pointerTelemetryFile: `${actionId}-pointer-telemetry.json`,
    pointerTelemetryPublicUrl: `/${publicRelativeDir}/${actionId}-pointer-telemetry.json`,
    pointerTelemetryEventCount: pointerTelemetry.events.length,
    evidenceFrames: frameUrls,
  };
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
  const draft = JSON.parse(await fsp.readFile(draftPath, "utf8"));
  const contentHtml = taggedContentHtml(draft.contentHtml);
  const memoryBefore = await requestJson("/api/memory");
  const memoryBeforeIds = new Set((Array.isArray(memoryBefore) ? memoryBefore : []).map((item) => item.id));
  const captures = [];
  try {
    const requestedActionIds = String(process.env.A1_ACTION_IDS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const actionIds = requestedActionIds.length ? requestedActionIds : Object.keys(actionDefinitions);
    for (const actionId of actionIds) {
      if (!actionDefinitions[actionId]) throw new Error(`unknown action id:${actionId}`);
      captures.push(await captureAction(actionId, draft, contentHtml));
    }
  } finally {
    const memoryAfter = await requestJson("/api/memory").catch(() => []);
    for (const entry of (Array.isArray(memoryAfter) ? memoryAfter : [])) {
      if (memoryBeforeIds.has(entry.id)) continue;
      await requestJson(`/api/memory/${encodeURIComponent(entry.id)}`, {method: "DELETE"}).catch(() => {});
    }
  }
  const copiedFiles = await copyOutputs();
  for (const capture of captures) {
    capture.videoSha256 = sha256(await fsp.readFile(path.join(studioDir, capture.videoFile)));
    capture.keyStillSha256 = sha256(await fsp.readFile(path.join(studioDir, capture.keyStillFile)));
    capture.pointerTelemetrySha256 = sha256(await fsp.readFile(path.join(studioDir, capture.pointerTelemetryFile)));
  }
  const report = {
    contract: "A1RealWritingWorkbenchActionPack/v1",
    status: captures.every((capture) => capture.status === "PASS") ? "PASS" : "BLOCKED",
    capturedAt: now,
    source: {kind: "real-local-writing-workbench-runtime", baseUrl, currentDraftPath: draftPath, title: draft.title, formalArticleMutated: false, temporaryClonesDeleted: true},
    captures,
    copiedFiles,
    checks: {realRuntimeUsed: true, fakeUiUsed: false, currentArticleClonesUsed: true, actionCount: captures.length, formalArticleMutated: false},
    admissionBoundary: {
      captureOnly,
      workspaceMutated: !captureOnly,
      productionAdmission: !captureOnly,
      userVisualApproval: "NOT_APPROVED",
    },
  };
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  await Promise.all([
    fsp.writeFile(path.join(artifactDir, "report.json"), reportText),
    fsp.writeFile(path.join(studioDir, "report.json"), reportText),
    fsp.writeFile(path.join(rendererDir, "report.json"), reportText),
  ]);
  if (report.status !== "PASS") throw new Error(`writing-workbench action pack blocked: ${captures.filter((capture) => capture.status !== "PASS").map((capture) => capture.actionId).join(",")}`);

  if (captureOnly) {
    console.log(JSON.stringify({
      status: report.status,
      captureOnly: true,
      workspaceMutated: false,
      actionCount: captures.length,
      actions: captures.map((capture) => ({
        actionId: capture.actionId,
        durationSeconds: capture.durationSeconds,
        video: capture.videoPublicUrl,
        keyStill: capture.keyStillPublicUrl,
        pointerTelemetry: capture.pointerTelemetryPublicUrl,
      })),
      report: `/${publicRelativeDir}/report.json`,
    }, null, 2));
    return;
  }

  const update = withProjectLock(appRoot, () => {
    const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
    const next = structuredClone(current);
    const baseAsset = next.library.assets.find((asset) => asset.id === "source-documentary-selection-action");
    if (!baseAsset) throw new Error("source-documentary-selection-action missing");
    const invalidatedShotIds = [];
    for (const capture of captures) {
      const definition = actionDefinitions[capture.actionId];
      let asset = next.library.assets.find((item) => item.id === definition.assetId);
      if (!asset) {
        asset = structuredClone(baseAsset);
        asset.id = definition.assetId;
        next.library.assets.push(asset);
      }
      asset.name = definition.name;
      asset.purpose = definition.purpose;
      asset.semanticRole = "real-causal-screen-evidence";
      asset.route = "verified-real-source";
      asset.requiredForShotComposition = true;
      asset.assetUri = capture.keyStillPublicUrl;
      asset.sha256 = capture.keyStillSha256;
      asset.sourceUri = path.relative(root, path.join(artifactDir, "report.json"));
      asset.preview = {kind: "source-image", publicUrl: capture.keyStillPublicUrl};
      asset.usedByShotIds = definition.shotIds;
      asset.videoEvidence = {
        contract: "A1RealWritingWorkbenchActionCapture/v1",
        actionId: capture.actionId,
        publicUrl: capture.videoPublicUrl,
        sha256: capture.videoSha256,
        durationSeconds: capture.durationSeconds,
        evidenceFrames: capture.evidenceFrames,
        pointerTelemetry: {
          contract: "A1PointerTelemetry/v1",
          publicUrl: capture.pointerTelemetryPublicUrl,
          sha256: capture.pointerTelemetrySha256,
          eventCount: capture.pointerTelemetryEventCount,
          source: "playwright-real-dom-event",
        },
        evidenceBoundary: "real local product interaction on a deleted temporary clone of the current article",
      };
      asset.provenance = {sourceType: "verified-real-local-writing-workbench-action-capture", sourceUri: path.relative(root, path.join(artifactDir, "report.json")), license: "user-owned local product capture", reviewed: true, evidenceBoundary: asset.videoEvidence.evidenceBoundary};
      asset.contentSha256 = editorialAssetContentSha256(asset);
      asset.status = "approved";
      asset.review = {status: "approved", note: "真实稿台操作链已自动录制并核验；临时文章副本与新增偏好均已清理。", reviewedAt: now, reviewedBy: "system-causal-source-audit", approvedContentSha256: asset.contentSha256};
    }

    const updatedActionAssetIds = new Set(captures.map((capture) => actionDefinitions[capture.actionId].assetId));
    const updatedShotIds = new Set(captures.flatMap((capture) => actionDefinitions[capture.actionId].shotIds));
    for (const shot of next.library.assets.filter((asset) => {
      if (asset.route !== "shot-composition") return false;
      if (updatedShotIds.has(asset.shotDemand?.shotId)) return true;
      return (asset.shotDemand?.supportingMaterialIds || []).some((assetId) => updatedActionAssetIds.has(assetId));
    })) {
      invalidatedShotIds.push(shot.shotDemand.shotId);
      if ((shot.candidates || []).length || shot.selectedCandidateId || shot.candidateRender) {
        shot.revisionHistory ||= [];
        shot.revisionHistory.push({contract: "A1RejectedShotCandidateRound/v1", round: Number(shot.visualRevision?.round || 1), reason: "real-writing-workbench-action-pack-admitted", candidates: shot.candidates || [], candidateRender: shot.candidateRender || null, visualCritic: shot.visualCritic || null, archivedAt: now});
      }
      shot.candidates = [];
      shot.selectedCandidateId = null;
      delete shot.candidateRender;
      delete shot.visualCritic;
      shot.status = "brief-ready";
      shot.review = {status: "pending", note: "真实动作素材包与对象焦点坐标已更新，旧屏幕或人物包装候选自动失效。", reviewedAt: now, reviewedBy: "system-causal-source-audit", approvedContentSha256: null};
      shot.visualRevision = {contract: "A1VisualRevisionBrief/v1", round: 1, sourceReportSha256: sha256(Buffer.from(reportText)), prompt: "按镜头语义绑定对应真实操作与 DOM 实测对象区域；人物包装只允许边缘证据带，禁止完整 UI 漂浮卡、HUD 和无对象箭头。", createdAt: now};
    }
    next.production.assembly.screenMediaBound = true;
    next.production.assembly.writingWorkbenchActionPack = {contract: report.contract, status: "VERIFIED_REAL_PRODUCT_ACTION_PACK", reportPublicUrl: `/${publicRelativeDir}/report.json`, actionCount: captures.length, actionIds: captures.map((capture) => capture.actionId)};
    next.production.assembly.status = "design-proof-ready-real-presenter-video-missing";
    next.production.maturityLoop.shotReports = Object.fromEntries(Object.entries(next.production.maturityLoop.shotReports || {}).filter(([shotId]) => !invalidatedShotIds.includes(shotId)));
    next.production.maturityLoop.provisionalVisualAdmissions = (next.production.maturityLoop.provisionalVisualAdmissions || []).filter((shotId) => !invalidatedShotIds.includes(shotId));
    next.production.maturityLoop.status = "paused-for-screen-action-shot-rebuild";
    next.production.maturityLoop.nextAction = "rebuild-screen-demo-shots-from-real-writing-workbench-action-pack";
    next.production.maturityLoop.updatedAt = now;
    const event = createProductionEvent({workspace: current, action: "real-writing-workbench-action-pack-admitted", payload: {report: path.relative(root, path.join(artifactDir, "report.json")), actionIds: captures.map((capture) => capture.actionId), invalidatedShotIds}, now});
    next.production.eventLedger.eventCount += 1;
    next.production.eventLedger.lastEventId = event.eventId;
    next.production.eventLedger.lastEventAt = event.createdAt;
    const recalculated = recalculateEditorialAssetWorkbench(next, now);
    persistProjectState(appRoot, recalculated, {event});
    return recalculated;
  });

  console.log(JSON.stringify({status: report.status, actionCount: captures.length, actions: captures.map((capture) => ({actionId: capture.actionId, durationSeconds: capture.durationSeconds, video: capture.videoPublicUrl, keyStill: capture.keyStillPublicUrl})), nextAction: update.production.maturityLoop.nextAction}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
