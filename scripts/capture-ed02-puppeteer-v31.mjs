// ED-02 puppeteer-core 真成熟方案
// 用 chrome --headless 渲染 8766 v2 + 真 page.mouse 操作
// 输出: 60fps 真 chrome screencast, 含真 DOM 渲染

import puppeteer from "puppeteer-core";
import { spawn } from "child_process";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { setTimeout as sleep } from "node:timers/promises";

const WORK = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v31-puppeteer";
const CAP_DIR = join(WORK, "frames");
const OUT_MP4 = join(WORK, "ed-02-puppeteer.mp4");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(WORK, { recursive: true });
mkdirSync(CAP_DIR, { recursive: true });

// 1. 启 chrome headless + new headless
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  defaultViewport: { width: 1920, height: 1080 },
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--window-size=1920,1080",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

// 2. 创建文档
console.log("== create document ==");
const createRes = await fetch("http://127.0.0.1:8766/api/document", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: `ed02-puppeteer-${Date.now()}` }),
});
const createText = await createRes.text();
console.log("create response:", createText.slice(0, 300));
let createJson;
try {
  createJson = JSON.parse(createText);
} catch (e) {
  console.log("not JSON, treating as plain text docId");
  createJson = { documentId: createText.trim() };
}
const docId = createJson.documentId || createJson.id || createJson.document_id || createText.trim();
console.log("docId:", docId);

// 3. 访问 v2 cinema
const url = `http://127.0.0.1:8766/v2/?documentId=${encodeURIComponent(docId)}&cinema=1`;
console.log("== goto:", url);
await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
await sleep(3000);

// 4. 等 paper + 选区目标段落准备好
console.log("== wait for paper + paragraphs ==");
const layout = await page.evaluate(() => {
  const paper = document.querySelector(".paper, [data-paper], main, .editor, body");
  const paragraphs = document.querySelectorAll("p, [data-paragraph]");
  const first = paragraphs[0];
  const r = first ? first.getBoundingClientRect() : null;
  return {
    paperWidth: paper ? paper.getBoundingClientRect().width : 0,
    pCount: paragraphs.length,
    firstText: first ? first.textContent.slice(0, 50) : null,
    firstX: r ? r.x : 0,
    firstY: r ? r.y : 0,
    firstW: r ? r.width : 0,
    firstH: r ? r.height : 0,
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
});
console.log("layout:", layout);

// 5. 真实 page.mouse drag 在首段
console.log("== real mouse drag on first paragraph ==");
const fy = layout.firstY + layout.firstH / 2;
const dragStart = { x: layout.firstX + 5, y: fy };
const dragEnd = { x: layout.firstX + layout.firstW - 5, y: fy };
console.log("drag from", dragStart, "to", dragEnd);
await page.mouse.move(dragStart.x, dragStart.y);
await page.mouse.down();
for (let i = 1; i <= 20; i++) {
  const t = i / 20;
  await page.mouse.move(
    dragStart.x + (dragEnd.x - dragStart.x) * t,
    dragStart.y + (dragEnd.y - dragStart.y) * t
  );
  await sleep(20);
}
await page.mouse.up();
await sleep(500);

// 6. 找"改这句"按钮并 click
console.log("== click 改这句 ==");
const buttonClicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button"));
  for (const b of buttons) {
    if (b.textContent && b.textContent.trim() === "改这句") {
      const r = b.getBoundingClientRect();
      b.click();
      return { ok: true, x: r.x, y: r.y, w: r.width, h: r.height };
    }
  }
  return { ok: false };
});
console.log("button click:", buttonClicked);

// 7. 等候选 panel
console.log("== wait candidates ==");
const candidateAppeared = await page
  .waitForFunction(
    () => {
      const c = document.querySelector(".candidate-list");
      if (!c) return false;
      const style = window.getComputedStyle(c);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const t = c.textContent || "";
      return t.includes("更直接") || t.includes("更口语") || t.includes("更狠") || (c.children && c.children.length >= 3);
    },
    { timeout: 10000 }
  )
  .then(() => true)
  .catch(() => false);
console.log("candidates appeared:", candidateAppeared);

// 8. page.screenshot 60fps 60 帧 录 1s
console.log("== record 60 frames ==");
const TOTAL_FRAMES = 60;
const startTime = Date.now();
for (let i = 0; i < TOTAL_FRAMES; i++) {
  const path = join(CAP_DIR, `frame_${String(i).padStart(5, "0")}.png`);
  await page.screenshot({ path, type: "png" });
  if (i % 10 === 0) console.log(`  [${i}/${TOTAL_FRAMES}] t=${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  // 16ms = 60fps
  const target = startTime + (i + 1) * (1000 / 60);
  const wait = target - Date.now();
  if (wait > 0) await sleep(wait);
}

await browser.close();
console.log("== chrome closed ==");

// 9. ffmpeg 60fps
console.log("== ffmpeg encode ==");
const ff = spawn("ffmpeg", [
  "-y",
  "-framerate", "60",
  "-i", `${CAP_DIR}/frame_%05d.png`,
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-preset", "slow",
  "-crf", "17",
  "-movflags", "+faststart",
  OUT_MP4,
]);
ff.stdout.on("data", () => {});
ff.stderr.on("data", (d) => process.stderr.write(d));
ff.on("close", (code) => {
  console.log("ffmpeg exit:", code);
  if (code === 0) console.log("== DONE:", OUT_MP4);
});
