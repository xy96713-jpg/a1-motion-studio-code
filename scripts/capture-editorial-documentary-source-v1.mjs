import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {chromium} from "playwright";

const root = process.cwd();
const baseUrl = process.env.A1_WRITING_WORKBENCH_URL || "http://127.0.0.1:8766";
const documentId = "first_video_concise_strengthened_20260617";
const sourceUrl = `${baseUrl}/v2/?documentId=${encodeURIComponent(documentId)}`;
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line/editorial-documentary-reset-v1/source");
const rendererDir = path.join(root, "remotion-renderer/public/editorial-documentary-reset-v1/source");
const studioDir = path.join(root, "apps/studio-next/public/generated/system-line/editorial-documentary-reset-v1/source");

const sha256 = async (filePath) => crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");

async function copyCapture(name, sourcePath) {
  const targets = [path.join(rendererDir, name), path.join(studioDir, name)];
  await Promise.all(targets.map(async (target) => {
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.copyFile(sourcePath, target);
  }));
  return {
    id: name.replace(/\.png$/u, ""),
    file: name,
    sha256: await sha256(sourcePath),
    rendererPath: path.relative(root, targets[0]),
    publicUrl: `/${path.relative(path.join(root, "apps/studio-next/public"), targets[1])}`,
  };
}

async function selectPhrase(page, phrase, {showMenu = false} = {}) {
  const result = await page.evaluate(({targetPhrase, keepMenu}) => {
    const editor = document.querySelector("#editor");
    if (!editor) return {ok: false, reason: "editor-missing"};
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const index = node.textContent?.indexOf(targetPhrase) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + targetPhrase.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange", {bubbles: true}));
      window.setTimeout(() => {
        const menu = document.querySelector("#selectionMenu");
        if (menu && !keepMenu) menu.hidden = true;
      }, 130);
      range.startContainer.parentElement?.scrollIntoView({block: "center"});
      return {ok: true, text: selection?.toString() || ""};
    }
    return {ok: false, reason: "phrase-not-found"};
  }, {targetPhrase: phrase, keepMenu: showMenu});
  if (!result.ok) throw new Error(`Cannot select phrase: ${phrase} (${result.reason})`);
  await page.waitForTimeout(260);
}

async function main() {
  await Promise.all([artifactDir, rendererDir, studioDir].map((dir) => fs.mkdir(dir, {recursive: true})));
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/document**", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    return route.abort("blockedbyclient");
  });
  await page.goto(sourceUrl, {waitUntil: "networkidle"});
  await page.waitForFunction(() => document.querySelector("#editor")?.textContent?.includes("AI 辅助写作工作台"));
  await page.waitForTimeout(600);

  const staged = [];
  const capture = async (name, action) => {
    if (action) await action();
    const filePath = path.join(artifactDir, name);
    await page.screenshot({path: filePath});
    staged.push(await copyCapture(name, filePath));
  };

  await capture("workbench-overview.png");

  const documentSurfacePath = path.join(artifactDir, "document-surface.png");
  await page.locator("#editor").screenshot({path: documentSurfacePath});
  staged.push(await copyCapture("document-surface.png", documentSurfacePath));

  await capture("selection-action.png", async () => {
    await selectPhrase(page, "写到任何句子，划选一下就能让它改", {showMenu: true});
  });

  await page.reload({waitUntil: "networkidle"});
  await page.waitForFunction(() => document.querySelector("#editor")?.textContent?.includes("AI 辅助写作工作台"));
  await capture("paragraph-assist.png", async () => {
    const created = await page.evaluate(() => {
      const paragraph = document.querySelectorAll("#editor p")[1];
      const createSlot = window.createParagraphAssistSlotAfter;
      return typeof createSlot === "function" && paragraph ? createSlot(paragraph) : false;
    });
    if (!created) throw new Error("Cannot create a non-persistent paragraph assist state");
    await page.waitForTimeout(420);
  });

  await page.reload({waitUntil: "networkidle"});
  await page.waitForFunction(() => document.querySelector("#editor")?.textContent?.includes("AI 辅助写作工作台"));
  await capture("presentation-mode.png", async () => {
    await page.click("#presentDraft");
    await page.waitForFunction(() => !document.querySelector("#presentationMode")?.hasAttribute("hidden"));
    await page.waitForTimeout(300);
  });

  await page.click("#presentationClose");
  await capture("question-highlight.png", async () => {
    await selectPhrase(page, "既然都用 AI 了，为什么不直接让它写完整篇", {showMenu: false});
  });
  await capture("ai-taste-highlight.png", async () => {
    await selectPhrase(page, "就是不说人话，重点也抓不住", {showMenu: false});
  });
  await capture("problem-remains-highlight.png", async () => {
    await selectPhrase(page, "问题没有消失", {showMenu: false});
  });

  const report = {
    contract: "A1EditorialDocumentarySourceCapture/v1",
    status: staged.length === 8 && consoleErrors.length === 0 ? "PASS" : "BLOCKED",
    capturedAt: new Date().toISOString(),
    source: {
      kind: "real-local-writing-workbench",
      baseUrl,
      sourceUrl,
      documentId,
      title: await page.locator("#documentTitle").inputValue(),
      mutationPolicy: "all non-GET document requests blocked during capture",
    },
    captures: staged,
    checks: {
      captureCount: staged.length,
      realRuntimeUsed: true,
      generatedArtworkUsed: false,
      documentMutationAllowed: false,
      consoleErrors,
    },
  };

  await browser.close();
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  await Promise.all([
    fs.writeFile(path.join(artifactDir, "report.json"), reportText),
    fs.writeFile(path.join(studioDir, "report.json"), reportText),
    fs.writeFile(path.join(rendererDir, "report.json"), reportText),
  ]);
  console.log(JSON.stringify({status: report.status, sourceUrl, captureCount: staged.length, artifactDir, consoleErrors}, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
