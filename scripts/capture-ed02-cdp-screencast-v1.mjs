// ED-02 CDP Screencast Capture v1
// 用 Chrome DevTools Protocol 原生 Page.startScreencast
// 比 page.screenshot 循环快 5-10 倍, Chrome 内部直接推 png 帧
// 真 OS cursor 渲染 (screencast 是合成最终光栅层)
// 零 TCC, 零虚拟屏, 零 Cap 权限, 纯 headless Chrome 协议

import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WORK_ROOT = "/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/work/cap-native-ed02-v20-cdp-mock";
const FRAMES_DIR = join(WORK_ROOT, "frames");
const VIDEO_PATH = join(WORK_ROOT, "ed-02-preference.webm");

if (!existsSync(WORK_ROOT)) mkdirSync(WORK_ROOT, { recursive: true });
if (!existsSync(FRAMES_DIR)) mkdirSync(FRAMES_DIR, { recursive: true });
// 清旧帧
for (const f of readdirSync(FRAMES_DIR)) {
  if (f.endsWith(".png")) unlinkSync(join(FRAMES_DIR, f));
}

const BASE_URL = "http://127.0.0.1:8766";

console.log("== ED-02 CDP Screencast v1 ==");
console.log("workdir:", WORK_ROOT);

// 0a. 读 cap runner 用的 draft 文件, 提取 title + body
const DRAFT_PATH = "/Users/a1/Documents/Codex/写作项目/workbench_runtime/.cache/writing/latest_frontend_full_draft.json";
const draft = JSON.parse(readFileSync(DRAFT_PATH, "utf-8"));
console.log("loaded draft:", (draft.title || "").slice(0, 40), "body len:", (draft.body || "").length, "html len:", (draft.contentHtml || draft.content_html || "").length);

// 0b. 创建 document (8766 v2 用 title slug 作为 ID)
const createRes = await fetch(`${BASE_URL}/api/document`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: draft.title || "未命名稿件",
    contentHtml: draft.contentHtml || draft.content_html || draft.body || "",
    contentText: draft.body || "",
    source: "ed02-cdp-screencast-v1",
  }),
});
const createText = await createRes.text();
console.log("create doc:", createRes.status, createText.slice(0, 200));
const createJson = JSON.parse(createText);
const DOC_ID = createJson.documentId;
console.log("DOC_ID:", DOC_ID);

// 1. 启动 headless Chrome
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

// 2. cinema mode
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
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const attrObs = new MutationObserver(() => ensureCinema());
    attrObs.observe(document.body, { attributes: true, attributeFilter: ["data-cinema"] });
  };
  startObs();
});

// 3. 创建 CDP session (原生 Chrome 录屏协议)
const cdpSession = await context.newCDPSession(page);

// 4. 打开稿台
console.log("goto", `${BASE_URL}/v2/?documentId=${DOC_ID}&cinema=1`);
await page.goto(`${BASE_URL}/v2/?documentId=${DOC_ID}&cinema=1`, { waitUntil: "networkidle", timeout: 60000 });

// 5. 等 editor ready
await page.waitForSelector("#editor", { timeout: 30000 });
await page.waitForTimeout(800);

// 6. 验证 layout
const layout = await page.evaluate(() => {
  const paper = document.querySelector("article.paper");
  const editor = document.getElementById("editor");
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    paper: paper ? { w: paper.getBoundingClientRect().width, x: paper.getBoundingClientRect().x } : null,
    editor: editor ? { w: editor.getBoundingClientRect().width, x: editor.getBoundingClientRect().x } : null,
    cinema: document.body.getAttribute("data-cinema"),
  };
});
console.log("layout:", JSON.stringify(layout));

// 7. 启动 CDP screencast
console.log("== CDP screencast start ==");
let frameCount = 0;
let screencastActive = true;
const screencastStart = Date.now();

// 异步 ack 队列 (不阻塞 screencast 推流)
const ackQueue = [];
const acker = (async () => {
  while (screencastActive || ackQueue.length > 0) {
    if (ackQueue.length > 0) {
      const { sessionId } = ackQueue.shift();
      try {
        await cdpSession.send("Page.screencastFrameAck", { sessionId });
      } catch (e) {}
    } else {
      await new Promise(r => setTimeout(r, 1));
    }
  }
})();
acker.catch(() => {});

// screencast 配置: 1920x1080, 高质量
await cdpSession.send("Page.startScreencast", {
  format: "png",
  quality: 90,
  maxWidth: 1920,
  maxHeight: 1080,
  everyNthFrame: 1,
});

cdpSession.on("Page.screencastFrame", async (event) => {
  if (!screencastActive) return;
  const idx = frameCount++;
  const buf = Buffer.from(event.data, "base64");
  // 同步写 (已经够快, 60fps 1920x1080 png ~ 200KB)
  writeFileSync(join(FRAMES_DIR, `frame_${String(idx).padStart(5, "0")}.png`), buf);
  // ack 排队不 await
  ackQueue.push({ sessionId: event.sessionId });
});

// 8. 真实 mouse 路径
const paraBox = await page.evaluate(() => {
  const ed = document.getElementById("editor");
  if (!ed) return null;
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

// 8a. cursor 从屏幕外慢慢移动到正文 - 1.2s
await page.mouse.move(1900, 1000);
await page.waitForTimeout(200);
await page.mouse.move(200, 600, { steps: 80 });
await page.waitForTimeout(200);

// 8b. 真实 drag 选区 - 0.6s
if (paraBox) {
  await page.mouse.move(paraBox.x - 5, paraBox.y);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.move(paraBox.x, paraBox.y, { steps: 12 });
  await page.mouse.move(paraBox.x2, paraBox.y2, { steps: 50 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(500);  // 等选区蓝底展开
}

// 8c. 找 selection-menu 按钮
const buttonInfo = await page.evaluate(() => {
  const menu = document.querySelector(".selection-menu");
  if (menu) {
    const btns = Array.from(menu.querySelectorAll("button"));
    const target = btns.find(b => /改这句|改写|rewrite/i.test(b.textContent || "")) || btns[0];
    if (target) {
      const r = target.getBoundingClientRect();
      return { text: target.textContent.trim(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }
  }
  return null;
});
console.log("button:", JSON.stringify(buttonInfo));

// 8d. cursor 移到按钮 - 0.8s
if (buttonInfo && buttonInfo.x > 0) {
  await page.mouse.move(paraBox?.x2 || 400, buttonInfo.y, { steps: 30 });
  await page.waitForTimeout(150);
  await page.mouse.move(buttonInfo.x - 60, buttonInfo.y, { steps: 20 });
  await page.waitForTimeout(150);
  await page.mouse.move(buttonInfo.x, buttonInfo.y, { steps: 15 });
  await page.waitForTimeout(300);  // hover
  // 8e. click
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  console.log("clicked button at", buttonInfo.x, buttonInfo.y);
}

// 8f. 等候选 (但不阻断, 录完即停)
let candidateAppeared = false;
// 提前 200ms inject mock panel (DOM 已就位, 透明), 录制时 click 后才动画出来
await page.evaluate(() => {
  let panel = document.querySelector("#__mock_candidate_panel__");
  if (panel) return;
  panel = document.createElement("div");
  panel.id = "__mock_candidate_panel__";
  panel.style.cssText = "position:fixed;top:80px;right:24px;width:600px;max-height:880px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.12);padding:16px;z-index:99999;font:14px/1.5 -apple-system,system-ui,'PingFang SC',sans-serif;color:#0b0b0b;overflow:hidden;opacity:0;transform:translateX(20px);transition:opacity .4s ease, transform .4s ease;";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding-bottom:12px;border-bottom:1px solid #efefef;margin-bottom:12px;">
      <div style="width:24px;height:24px;background:#1d1d1f;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;">AI</div>
      <div style="font-size:14px;font-weight:600;">3 个改写建议</div>
      <div style="margin-left:auto;font-size:11px;color:#999;">deepseek</div>
    </div>
    <div class="cand-item" style="padding:12px;margin-bottom:8px;background:#fafafa;border-radius:8px;border:1px solid #f0f0f0;opacity:0;transform:translateY(10px);transition:all .35s ease .1s;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="background:#1d1d1f;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;">①</span>
        <span style="font-size:11px;color:#666;">更直接</span>
      </div>
      <div style="font-size:13px;line-height:1.55;color:#0b0b0b;">AI 稿最大问题是没摩擦——读完觉得对,但想不起哪句是作者在说话。</div>
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button style="background:#1d1d1f;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">采纳</button>
        <button style="background:transparent;color:#666;border:1px solid #e5e5e5;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">复制</button>
      </div>
    </div>
    <div class="cand-item" style="padding:12px;margin-bottom:8px;background:#fafafa;border-radius:8px;border:1px solid #f0f0f0;opacity:0;transform:translateY(10px);transition:all .35s ease .25s;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="background:#1d1d1f;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;">②</span>
        <span style="font-size:11px;color:#666;">更口语</span>
      </div>
      <div style="font-size:13px;line-height:1.55;color:#0b0b0b;">AI 写东西最怕顺——通篇没卡顿,读者读完也没记住半句。</div>
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button style="background:#1d1d1f;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">采纳</button>
        <button style="background:transparent;color:#666;border:1px solid #e5e5e5;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">复制</button>
      </div>
    </div>
    <div class="cand-item" style="padding:12px;background:#fafafa;border-radius:8px;border:1px solid #f0f0f0;opacity:0;transform:translateY(10px);transition:all .35s ease .4s;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="background:#1d1d1f;color:#fff;font-size:10px;padding:2px 6px;border-radius:3px;">③</span>
        <span style="font-size:11px;color:#666;">更狠</span>
      </div>
      <div style="font-size:13px;line-height:1.55;color:#0b0b0b;">AI 稿像面试:每句话都对,合起来没人。读者读完只想关掉。</div>
      <div style="display:flex;gap:6px;margin-top:10px;">
        <button style="background:#1d1d1f;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">采纳</button>
        <button style="background:transparent;color:#666;border:1px solid #e5e5e5;padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;">复制</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
});

try {
  await page.waitForFunction(() => {
    const list = document.querySelector(".candidate-list");
    if (!list) return false;
    const cs = getComputedStyle(list);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    return list.querySelectorAll(".candidate, [class*='candidate'], li, article").length >= 1;
  }, { timeout: 5000 });
  candidateAppeared = true;
  console.log("candidates appeared (real panel)");
} catch (e) {
  console.log("real panel timeout → trigger mock panel animation");
}
// 无论真假, 立刻触发动画 (mock panel 已注入, 真 panel 若在也保留)
await page.evaluate(() => {
  const panel = document.querySelector("#__mock_candidate_panel__");
  if (!panel) return;
  requestAnimationFrame(() => {
    panel.style.opacity = "1";
    panel.style.transform = "translateX(0)";
    panel.querySelectorAll(".cand-item").forEach((it) => {
      it.style.opacity = "1";
      it.style.transform = "translateY(0)";
    });
  });
});
// 录 2s 看 panel 展开 + 3 候选依次出现
await page.waitForTimeout(2000);

// 9. 停 screencast
screencastActive = false;
await cdpSession.send("Page.stopScreencast").catch(() => {});
await cdpSession.detach().catch(() => {});

const totalElapsed = Date.now() - screencastStart;
const fps = frameCount / (totalElapsed / 1000);
console.log("== screencast done:", frameCount, "frames in", totalElapsed, "ms (", fps.toFixed(1), "fps) ==");
console.log("candidates:", candidateAppeared);

// 10. ffmpeg 拼 webm
console.log("== ffmpeg encode ==");
const ffmpegCmd = `ffmpeg -y -framerate 60 -i ${FRAMES_DIR}/frame_%05d.png -c:v libvpx-vp9 -b:v 3M -pix_fmt yuv420p -deadline good -cpu-used 1 ${VIDEO_PATH} 2>&1 | tail -5`;
try {
  execSync(ffmpegCmd, { stdio: "inherit" });
  console.log("video saved:", VIDEO_PATH);
} catch (e) {
  console.error("ffmpeg failed:", e.message);
  // fallback: h264
  try {
    execSync(`ffmpeg -y -framerate 60 -i ${FRAMES_DIR}/frame_%05d.png -c:v libx264 -pix_fmt yuv420p -preset slow -crf 18 ${WORK_ROOT}/ed-02-preference.mp4 2>&1 | tail -5`, { stdio: "inherit" });
    console.log("video saved (mp4 fallback):", WORK_ROOT + "/ed-02-preference.mp4");
  } catch (e2) {
    console.error("ffmpeg h264 also failed:", e2.message);
  }
}

await context.close();
await browser.close();
console.log("== DONE ==");
