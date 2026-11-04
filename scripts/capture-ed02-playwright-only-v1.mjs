// ED-02 Playwright-only capture v1
// 不用 Cap native, 不用虚拟显示器, 不用 macOS 录屏权限
// 用 page.screenshot 每 16ms 截一帧 + ffmpeg 拼 webm
// 1920x1080 viewport 强制

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, statSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";

const WORK_ROOT = resolve(process.cwd(), "work/cap-native-ed02-v18-playwright");
mkdirSync(WORK_ROOT, { recursive: true });

const BASE_URL = "http://127.0.0.1:8766";
// 用 cap runner 同样的命名: cap_native_preference_${Date.now()}
const DOC_ID = `cap_native_preference_${Date.now()}`;
const VIDEO_PATH = `${WORK_ROOT}/ed-02-preference.webm`;
const FRAMES_DIR = `${WORK_ROOT}/frames`;
mkdirSync(FRAMES_DIR, { recursive: true });

// 0. 健康检查 + 创建 docId + seed 内容
console.log("8766 health:", await fetch(`${BASE_URL}/api/system-health`).then(() => "OK").catch(() => "FAIL"));

// 0a. 读 cap runner 用的 draft 文件, 提取 title + body
const DRAFT_PATH = "/Users/a1/Documents/Codex/写作项目/workbench_runtime/.cache/writing/latest_frontend_full_draft.json";
let SEED_TITLE = "改写偏好测试稿";
let SEED_BODY = "默认 body";
let SEED_CONTENT_HTML = null;
try {
  const draft = JSON.parse(readFileSync(DRAFT_PATH, "utf8"));
  SEED_TITLE = draft.title || SEED_TITLE;
  SEED_BODY = draft.body || SEED_BODY;
  SEED_CONTENT_HTML = draft.contentHtml || draft.content_html || null;
  console.log("loaded draft:", SEED_TITLE, "body len:", SEED_BODY.length, "html len:", SEED_CONTENT_HTML?.length);
} catch (e) {
  console.log("draft load failed:", e.message);
}

// 0b. POST /api/document 创建 document (跟 cap runner 同样 payload)
const createResp = await fetch(`${BASE_URL}/api/document`, {
  method: "POST",
  headers: {"content-type": "application/json"},
  body: JSON.stringify({
    documentId: DOC_ID,
    documentType: "experiment",
    title: SEED_TITLE,
    contentHtml: SEED_CONTENT_HTML,
    contentText: `${SEED_TITLE}\n\n${SEED_BODY.trim()}`,
    metadata: {purpose: "ED-02 playwright v18 capture"},
  }),
});
console.log("create doc:", createResp.status, await createResp.text().then(t => t.slice(0, 200)));

console.log("== ED-02 Playwright capture v1 ==");
console.log("workdir:", WORK_ROOT);

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--no-default-browser-check",
    "--no-first-run",
    "--disable-features=TranslateUI",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  ignoreDefaultArgs: ["--enable-automation"],
});
const page = await context.newPage();

// 1. 设置 cinema mode attribute
await page.addInitScript(() => {
  const ensureCinema = () => {
    if (document.body && !document.body.hasAttribute("data-cinema")) {
      document.body.setAttribute("data-cinema", "1");
    }
  };
  const startObs = () => {
    ensureCinema();
    if (!document.body) { setTimeout(startObs, 5); return; }
    const obs = new MutationObserver(() => ensureCinema());
    obs.observe(document.documentElement, {childList: true, subtree: true});
    const attrObs = new MutationObserver(() => ensureCinema());
    attrObs.observe(document.body, {attributes: true, attributeFilter: ["data-cinema"]});
  };
  startObs();
});

// 2. 打开稿台
console.log("goto", `${BASE_URL}/v2/?documentId=${DOC_ID}&cinema=1`);
await page.goto(`${BASE_URL}/v2/?documentId=${DOC_ID}&cinema=1`, {waitUntil: "networkidle", timeout: 60000});

// 3. 等稿台真正 ready (等"加载最新稿"标题消失, 正文出现)
//    v2 稿台有"正在载入"中间状态, 等它消失
console.log("waiting for editor ready...");
await page.waitForFunction(() => {
  const ed = document.getElementById("editor");
  if (!ed) return false;
  const t = ed.textContent || "";
  // 等"正在载入"消失 + 出现真实正文 (> 50 字)
  return !t.includes("正在载入") && t.length > 50;
}, {timeout: 30000});
console.log("editor ready");

// 3. 验证 layout
const layout = await page.evaluate(() => {
  const a = document.querySelector("article.paper");
  const e = document.getElementById("editor");
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    paper: a ? {w: Math.round(a.getBoundingClientRect().width), x: Math.round(a.getBoundingClientRect().x)} : null,
    editor: e ? {w: Math.round(e.getBoundingClientRect().width), x: Math.round(e.getBoundingClientRect().x)} : null,
    cinema_attr: document.body.getAttribute("data-cinema"),
  };
});
console.log("layout:", JSON.stringify(layout));

if (!layout.paper || layout.paper.w < 1500) {
  console.error("PAPER NOT FULL WIDTH — cinema failed");
  await browser.close();
  process.exit(1);
}

// 4. 真实 mouse 路径 + 同时录帧
//    录屏: page.screenshot 每 16ms (60fps) 截一帧
//    短片: 6.0s × 60fps = 360 frames
const FPS = 60;
const FRAME_INTERVAL_MS = 1000 / FPS;
const TOTAL_DURATION_MS = 6000;
const TOTAL_FRAMES = Math.ceil(TOTAL_DURATION_MS / FRAME_INTERVAL_MS);

console.log("== mouse flow + frame capture (60fps 6s) ==");
const t0 = Date.now();

// 异步录帧
let frameIdx = 0;
let recordingActive = true;
const recordPromise = (async () => {
  while (recordingActive && frameIdx < TOTAL_FRAMES) {
    const idx = frameIdx;
    const fstart = Date.now();
    try {
      const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1920, height: 1080 } });
      writeFileSync(join(FRAMES_DIR, `frame_${String(idx).padStart(4, "0")}.png`), buf);
    } catch (e) {
      console.error("frame", idx, "err:", e.message);
    }
    frameIdx++;
    const elapsed = Date.now() - fstart;
    const wait = Math.max(0, FRAME_INTERVAL_MS - elapsed);
    await new Promise(r => setTimeout(r, wait));
  }
})();

// 4a. 鼠标从屏幕外 (1900, 1000) 慢慢移到正文区 (200, 600) - 1.0s
console.log("move cursor 1900,1000 -> 200,600");
await page.mouse.move(1900, 1000);
await page.waitForTimeout(100);
await page.mouse.move(200, 600, { steps: 60 });
await page.waitForTimeout(200);

// 4b. 真实 mouse drag 选区 (按下→移动→松开) - 0.5s
//    找第一段文字的 bbox
const paraBox = await page.evaluate(() => {
  const ed = document.getElementById("editor");
  if (!ed) return null;
  // 找第一段可见文字
  const candidates = Array.from(ed.querySelectorAll("p, .paragraph, [data-paragraph], div"))
    .filter(el => el.children.length === 0 && (el.textContent || "").length > 20);
  if (candidates.length === 0) return null;
  const p = candidates[0];
  const r = p.getBoundingClientRect();
  return {
    text: p.textContent.slice(0, 30),
    x: Math.round(r.x + 10),
    y: Math.round(r.y + r.height / 2),
    x2: Math.round(r.x + r.width * 0.6),
    y2: Math.round(r.y + r.height / 2),
  };
});
console.log("paragraph:", JSON.stringify(paraBox));

if (paraBox) {
  console.log("drag selection");
  await page.mouse.move(paraBox.x - 5, paraBox.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.move(paraBox.x, paraBox.y, { steps: 10 });
  await page.mouse.move(paraBox.x2, paraBox.y2, { steps: 40 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(500);  // 等选区蓝底展开动画
}

// 4c. 找"改这句"按钮 - 8766 v2 真实 DOM 是 .selection-menu > button
const buttonInfo = await page.evaluate(() => {
  // 8766 v2: 改这句 button 在 .selection-menu 里
  const menu = document.querySelector(".selection-menu");
  if (menu) {
    const btns = Array.from(menu.querySelectorAll("button"));
    const target = btns.find(b => /改这句|改写|rewrite/i.test(b.textContent || ""))
                || btns[0];
    if (target) {
      const r = target.getBoundingClientRect();
      return {
        text: target.textContent.trim(),
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }
  }
  // fallback: 任意 button 文本匹配
  const buttons = Array.from(document.querySelectorAll("button"));
  const target = buttons.find(b => /改这句|改写|rewrite/i.test(b.textContent || ""));
  if (target) {
    const r = target.getBoundingClientRect();
    return {text: target.textContent.trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width)};
  }
  return null;
});
console.log("button:", JSON.stringify(buttonInfo));

if (buttonInfo && buttonInfo.x > 0 && buttonInfo.y > 0 && buttonInfo.w > 0) {
  // 4d. 鼠标慢慢移动到按钮 - 0.7s
  await page.mouse.move(paraBox?.x2 || 400, buttonInfo.y, { steps: 20 });
  await page.waitForTimeout(100);
  await page.mouse.move(buttonInfo.x - 40, buttonInfo.y, { steps: 15 });
  await page.waitForTimeout(200);
  await page.mouse.move(buttonInfo.x, buttonInfo.y, { steps: 12 });
  await page.waitForTimeout(300);  // hover
  // 4e. click
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  console.log("clicked button at", buttonInfo.x, buttonInfo.y);
}

// 4f. 等 AI 响应 - 8766 v2 真实 DOM: .candidate-list 内容变化
console.log("waiting for 3 candidates...");
let candidateCount = 0;
try {
  await page.waitForFunction(() => {
    const list = document.querySelector(".candidate-list");
    if (!list) return false;
    const text = (list.textContent || "").trim();
    if (text.includes("暂无候选") || text.length < 10) return false;
    // 找 candidate 元素
    const cands = list.querySelectorAll(".candidate, [class*='candidate'], li, article, .rewrite-candidate");
    return cands.length >= 1;
  }, {timeout: 30000});
  candidateCount = await page.evaluate(() => {
    const list = document.querySelector(".candidate-list");
    if (!list) return 0;
    return list.querySelectorAll(".candidate, [class*='candidate'], li, article, .rewrite-candidate").length;
  });
  console.log("candidates appeared:", candidateCount);
  // 录多 2s 看候选展开动画
  await page.waitForTimeout(2000);
} catch (e) {
  console.log("candidates timeout:", e.message);
  // dump 当前 .candidate-list 内容
  const txt = await page.evaluate(() => {
    const l = document.querySelector(".candidate-list");
    return l ? l.textContent.trim().slice(0, 200) : "(no .candidate-list)";
  });
  console.log("candidate-list current:", txt);
}

// 4g. 录完
recordingActive = false;
await recordPromise;

const totalElapsed = Date.now() - t0;
console.log("== total elapsed:", totalElapsed, "ms,", frameIdx, "frames, candidates:", candidateCount, "==");

// 5. ffmpeg 拼 webm
console.log("== ffmpeg encode ==");
const ffmpegCmd = `ffmpeg -y -framerate ${FPS} -i ${FRAMES_DIR}/frame_%04d.png -c:v libvpx-vp9 -b:v 2M -pix_fmt yuv420p ${VIDEO_PATH} 2>&1 | tail -3`;
try {
  execSync(ffmpegCmd, { stdio: "inherit" });
  console.log("video saved:", VIDEO_PATH);
} catch (e) {
  console.error("ffmpeg failed:", e.message);
}

await context.close();
await browser.close();
console.log("== DONE ==");
