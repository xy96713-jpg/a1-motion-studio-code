#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
const root = path.resolve(import.meta.dirname, ".."),
  baseUrl = (
    process.env.A1_WRITING_WORKBENCH_URL || "http://127.0.0.1:8766"
  ).replace(/\/$/u, ""),
  writingRoot =
    process.env.A1_WRITING_WORKBENCH_ROOT ||
    "/Users/a1/Documents/Codex/写作项目/workbench_runtime",
  draft = JSON.parse(
    fs.readFileSync(
      path.join(writingRoot, ".cache/writing/latest_frontend_full_draft.json"),
      "utf8",
    ),
  ),
  phrase = "当前行业正在快速发展，创作者需要积极拥抱变化，提升自身竞争力",
  id = `screen_geometry_${Date.now()}`,
  tagged = String(draft.content_html || draft.contentHtml).replace(
    /<p>([^<]*当前行业正在快速发展[^<]*)<\/p>/u,
    '<p id="a1-action-original">$1</p>',
  ),
  request = async (route, options = {}) => {
    const response = await fetch(`${baseUrl}${route}`, options),
      text = await response.text();
    if (!response.ok) throw new Error(`${route}:${response.status}:${text}`);
    return text ? JSON.parse(text) : {};
  },
  save = () =>
    request("/api/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: id,
        documentType: "experiment",
        title: draft.title,
        contentHtml: tagged,
        contentText: `${draft.title}\n${draft.body || ""}`,
        metadata: { purpose: "screen-emphasis-geometry-probe" },
      }),
    }),
  targets = {},
  viewport = { width: 1280, height: 720 };
for (let version = 0; version < 5; version += 1) await save();
let browser, profile, runtimeMetrics = null;
const normalize = (box) => ({
  x: box.x / viewport.width,
  y: box.y / viewport.height,
  width: box.width / viewport.width,
  height: box.height / viewport.height,
});
try {
  profile = await fsp.mkdtemp(path.join(os.tmpdir(), "a1-screen-geometry-"));
  browser = await chromium.launch({
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const context = await browser.newContext({ viewport }),
    page = await context.newPage();
  await page.goto(`${baseUrl}/v2/?documentId=${encodeURIComponent(id)}`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  runtimeMetrics = await page.evaluate(() => ({
    viewportCss: {x: 0, y: 0, width: innerWidth, height: innerHeight},
    devicePixelRatio: window.devicePixelRatio,
    pageZoom: window.visualViewport?.zoom || 1,
    visualViewport: window.visualViewport ? {offsetX: window.visualViewport.offsetLeft, offsetY: window.visualViewport.offsetTop, scale: window.visualViewport.scale, zoom: window.visualViewport.zoom || 1, width: window.visualViewport.width, height: window.visualViewport.height} : null,
    scroll: {x: window.scrollX, y: window.scrollY},
  }));
  await page.waitForFunction(
    () => document.querySelector("#editor")?.innerText?.length > 500,
  );
  const selection = await page.evaluate((needle) => {
    const editor = document.querySelector("#editor"),
      walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode,
        index = node.textContent?.indexOf(needle) ?? -1;
      if (index < 0) continue;
      node.parentElement.scrollIntoView({ block: "center" });
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const rects = [...range.getClientRects()],
        left = Math.min(...rects.map((r) => r.left)),
        top = Math.min(...rects.map((r) => r.top)),
        right = Math.max(...rects.map((r) => r.right)),
        bottom = Math.max(...rects.map((r) => r.bottom));
      return { x: left, y: top, width: right - left, height: bottom - top, lineRects: rects.map((rect) => ({x: rect.left, y: rect.top, width: rect.width, height: rect.height})) };
    }
    return null;
  }, phrase);
  if (!selection) throw new Error("geometry-selection-missing");
  targets["selection-range"] = {
    source: "DOM_RANGE",
    shape: "ROUNDED_RECTANGLE",
    sourceRect: normalize(selection),
    lineRects: selection.lineRects.map(normalize),
    validUntil: "selection-change-or-scroll",
  };
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() =>
    document.querySelector("#a1-action-original"),
  );
  const anchor = page.locator("#a1-action-original");
  await anchor.evaluate((node) => window.createParagraphAssistSlotAfter(node));
  const slot = page.locator('p[data-paragraph-assist-slot="1"]');
  await slot.waitFor({ state: "visible" });
  await slot.scrollIntoViewIfNeeded();
  const slotBox = await slot.boundingBox();
  targets["paragraph-input-slot"] = {
    source: "DOM_LOCATOR",
    selector: 'p[data-paragraph-assist-slot="1"]',
    shape: "ROUNDED_RECTANGLE",
    sourceRect: normalize(slotBox),
    validUntil: "slot-remove-or-scroll",
  };
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("details.latest-fold > summary").click();
  await page.locator("#topicArchiveList details").waitFor({ state: "visible" });
  await page.locator("#topicArchiveList details > summary").click();
  const panelBox = await page
    .locator("#topicArchiveList details")
    .boundingBox();
  targets["history-panel"] = {
    source: "DOM_LOCATOR",
    selector: "#topicArchiveList details",
    shape: "ROUNDED_RECTANGLE",
    sourceRect: normalize(panelBox),
    validUntil: "panel-close-or-scroll",
  };
} finally {
  if (browser) await browser.close();
  await request(`/api/document?documentId=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
}
const body = {
  contract: "A1ScreenDomGeometryProbe/v1",
  status: "PASS",
  viewport,
  targets,
  policy: {
    safeManualDefaultAllowed: false,
    missingGeometryFallback: "NONE",
    scrollInvalidatesFixedRect: true,
  },
  coordinateFrame: runtimeMetrics,
  generatedAt: new Date().toISOString(),
};
body.probeSha256 = crypto
  .createHash("sha256")
  .update(JSON.stringify(body))
  .digest("hex");
for (const dir of [
  path.join(
    root,
    "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/screen-emphasis-geometry-v1",
  ),
  path.join(
    root,
    ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/screen-emphasis-geometry-v1",
  ),
]) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "report.json"),
    `${JSON.stringify(body, null, 2)}\n`,
  );
}
console.log(
  JSON.stringify(
    {
      status: body.status,
      targetCount: Object.keys(targets).length,
      targets,
      probeSha256: body.probeSha256,
    },
    null,
    2,
  ),
);
