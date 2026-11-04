// ED-02 cap native record v1 (真 Cap 录屏, 非 playwright 模拟)
// 流程: cap record 同步 + page.mouse 操作 + 8766 v2 稿台
// 输出: 真原生 60fps 1920x1080 mp4 (Cap ScreenCaptureKit 录 chrome 窗口)

import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const WORK_ROOT = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v24-real-cap";
const FRAMES_DIR = join(WORK_ROOT, "frames");
const CAP_PATH = join(WORK_ROOT, "ed-02-real.cap");
const VIDEO_PATH = join(WORK_ROOT, "ed-02-real.mp4");
const BASE_URL = "http://127.0.0.1:8766";

if (!existsSync(WORK_ROOT)) mkdirSync(WORK_ROOT, { recursive: true });
if (!existsSync(FRAMES_DIR)) mkdirSync(FRAMES_DIR, { recursive: true });

console.log("== ED-02 v24 真 Cap 录屏 ==");

// 0a. 读 cap runner 用的 draft
const DRAFT_PATH = "/Users/a1/Documents/Codex/写作项目/workbench_runtime/.cache/writing/latest_frontend_full_draft.json";
const draft = JSON.parse(readFileSync(DRAFT_PATH, "utf-8"));
console.log("loaded draft:", (draft.title || "").slice(0, 40));

// 0b. 创建 document
const createRes = await fetch(`${BASE_URL}/api/document`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: draft.title || "未命名稿件",
    contentHtml: draft.contentHtml || draft.content_html || draft.body || "",
    contentText: draft.body || "",
    source: "ed02-v24-real-cap",
  }),
});
const createText = await createRes.text();
const createJson = JSON.parse(createText);
const DOC_ID = createJson.documentId;
console.log("DOC_ID:", DOC_ID);

// 1. 启动 chrome (有头, 真窗口)
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: false,  // 真窗口
  args: [
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=TranslateUI",
    "--use-gl=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1920,1080",
    "--window-position=0,0",
  ],
});

const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  ignoreDefaultArgs: ["--enable-automation"],
});
const page = await context.newPage();

// 2. cinema mode init
await page.addInitScript(() => {
  const ensureCinema = () => {
    if (document.body && !document.body.hasAttribute("data-cinema")) {
      document.body.setAttribute("data-cinema", "1");
    }
  };
  const startObs = () => {
    ensureCinema();
    if (!document.body) { setTimeout(startObs, 5); return; }
    new MutationObserver(ensureCinema).observe(document.documentElement, { childList: true, subtree: true });
  };
  startObs();
});

// 3. 打开稿台
console.log("opening 8766 v2...");
await page.goto(`${BASE_URL}/v2/?documentId=${DOC_ID}&cinema=1`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector("#editor", { timeout: 30000 });
await page.waitForTimeout(1500);  // 等渲染完

console.log("chrome is open. ready to cap record.");

// 4. 找 chrome 窗口 id (找稿台窗口)
const targetsJson = execSync("cap targets windows --json", { encoding: "utf-8" });
const targets = JSON.parse(targetsJson);
const chrome = targets.find(w => w.ownerName === "Google Chrome" && w.name && w.name.includes("完整稿"));
const chromeWin = chrome || targets.find(w => w.ownerName === "Google Chrome");
console.log("chrome window:", JSON.stringify(chromeWin));

if (!chromeWin) {
  console.error("no chrome window found!");
  process.exit(1);
}

// 4b. 把 chrome 移到 A1 Capture 虚拟屏 (id=6) + maximize, 用 AppleScript
console.log("== moving chrome to A1 Capture virtual display ==");
try {
  // A1 Capture 在 (0, 0) 到 (1920, 1080)
  const moveScript = `
    osascript -e 'tell application "Google Chrome" to activate'
    sleep 0.2
    osascript <<'EOF'
    tell application "System Events"
      tell process "Google Chrome"
        set position of window 1 to {0, 0}
        set size of window 1 to {1920, 1080}
        set bounds of window 1 to {0, 0, 1920, 1080}
      end tell
    end tell
    EOF
  `;
  execSync(moveScript, { stdio: "pipe", shell: "/bin/bash" });
  console.log("chrome moved to A1 Capture");
} catch (e) {
  console.log("could not move chrome (may already be there):", e.message.slice(0, 100));
}
await page.waitForTimeout(500);

// 5. 启动 cap record (后台)
console.log("== start cap record ==");
const capArgs = [
  "record", "start",
  "--window", String(chromeWin.id),
  "--fps", "60",
  "--duration", "5",
  "--path", CAP_PATH,
  "--format", "json",
];
console.log("cap", capArgs.join(" "));
const cap = spawn("cap", capArgs, { stdio: ["ignore", "pipe", "pipe"] });
let capOutput = "";
cap.stdout.on("data", (d) => { capOutput += d.toString(); });
cap.stderr.on("data", (d) => { capOutput += d.toString(); });

// 6. 立刻 page.mouse 操作 (0.5s 内启动)
await page.waitForTimeout(500);

// 6a. 找第一段
const paraBox = await page.evaluate(() => {
  const ed = document.getElementById("editor");
  const ps = Array.from(ed.querySelectorAll("p, .paragraph, [data-paragraph], div"))
    .filter(el => el.children.length === 0 && (el.textContent || "").length > 20);
  if (ps.length === 0) return null;
  const p = ps[0];
  const r = p.getBoundingClientRect();
  return {
    text: p.textContent.slice(0, 30),
    x: Math.round(r.x + 10),
    y: Math.round(r.y + r.height / 2),
    x2: Math.round(r.x + r.width * 0.6),
    y2: Math.round(r.y + r.height / 2),
  };
});
console.log("para:", JSON.stringify(paraBox));

// 6b. cursor 慢慢移到正文
await page.mouse.move(1900, 1000);
await page.waitForTimeout(100);
await page.mouse.move(200, 600, { steps: 30 });
await page.waitForTimeout(200);

// 6c. drag 选区
if (paraBox) {
  await page.mouse.move(paraBox.x - 5, paraBox.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.move(paraBox.x, paraBox.y, { steps: 8 });
  await page.mouse.move(paraBox.x2, paraBox.y2, { steps: 25 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

// 6d. click 改这句
const buttonInfo = await page.evaluate(() => {
  const menu = document.querySelector(".selection-menu");
  if (menu) {
    const btns = Array.from(menu.querySelectorAll("button"));
    const target = btns.find(b => /改这句|改写|rewrite/i.test(b.textContent || "")) || btns[0];
    if (target) {
      const r = target.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
  }
  return null;
});
if (buttonInfo) {
  await page.mouse.move(buttonInfo.x - 50, buttonInfo.y, { steps: 10 });
  await page.waitForTimeout(100);
  await page.mouse.move(buttonInfo.x, buttonInfo.y, { steps: 8 });
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  console.log("clicked 改这句 at", buttonInfo.x, buttonInfo.y);
}

// 6e. 等候选 + 一些时间
await page.waitForTimeout(2000);

// 7. 等 cap record 结束 (5s 自动)
console.log("== waiting cap record to finish ==");
await new Promise((resolve) => {
  cap.on("close", resolve);
  setTimeout(resolve, 8000);  // 兜底
});
console.log("cap output:", capOutput.slice(0, 500));

// 8. 验证 cap 文件
if (existsSync(CAP_PATH)) {
  const stat = execSync(`ls -la ${CAP_PATH}`).toString();
  console.log("cap file:", stat);
} else {
  console.error("cap file not found!");
  await browser.close();
  process.exit(1);
}

// 9. 导出 mp4 (cap export 用 positional args)
console.log("== export cap → mp4 ==");
const DISPLAY_MP4 = join(WORK_ROOT, "ed-02-real.cap/content/segments/segment-0/display.mp4");
if (existsSync(DISPLAY_MP4)) {
  console.log("display.mp4 found, transcoding to 1920x1080 60fps");
  try {
    execSync(`ffmpeg -y -i "${DISPLAY_MP4}" -vf "scale=1920:1080,fps=60" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart "${VIDEO_PATH}" 2>&1 | tail -3`, { stdio: "inherit" });
    console.log("mp4 saved:", VIDEO_PATH);
  } catch (e) {
    console.error("ffmpeg transcode failed:", e.message);
  }
} else {
  console.error("display.mp4 not found in cap");
}
const stat2 = execSync(`ls -la "${VIDEO_PATH}" 2>&1`).toString();
console.log("final mp4:", stat2);

await context.close();
await browser.close();
console.log("== DONE ==");
