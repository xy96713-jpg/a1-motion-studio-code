import { chromium } from "playwright";
import { startIsolatedAuditServer } from "./audit-server.mjs";

const draft = `Hi，我做了一个 AI 辅助写作工作台。
现在让 AI 写文章、论文、报告，已经不是什么新鲜事了。但真正用下来，问题也很明显：中文稿子经常有 AI 味，说话不自然，段落看起来完整，重点却抓不住。
我相信很多对内容有要求的人，应该都有类似感觉。AI 给出的版本不是不能看，但很难直接用。你要一轮一轮追问、修改、重写，最后花掉的时间，可能并没有少多少。
我一开始也以为是模型问题。同一个主题，丢给 GPT、Claude，读起来总有一点怪；换到 Kimi、DeepSeek，中文会顺一些，奇怪的句子少一点。但问题没有消失。
它还是很容易给你一篇“完成度很高的废稿”。
标题有，段落有，总结也有，可整篇看下来，找不到几句能直接留下。
后来我去查了一些 AI 写作相关的研究和工具，发现问题不只是模型中文好不好。模型生成文字时，会优先选择常见、稳妥、可复用的表达。它不知道你讨厌什么句式，也不知道这篇稿子到底要把读者带到哪里。
所以更靠谱的写法，是把工作往前移。
先找材料，先定方向，先想读者会卡在哪里，最后才让模型动笔。写完之后，还要有人负责挑错、退稿、修句子。
为了把这套流程固定下来，我用 vibe coding 做了一个写作工作台。
它背后主要用三套模型分工。Codex 负责后台编排：准备材料、整理主线、读取我的写作风格库，最后检查和拦稿。Kimi 负责写完整稿，因为它写中文长文相对自然。DeepSeek 负责局部修改，比如改一句话、补一小段、换一种更顺的表达。
前端我刻意做得很简单。最上方是标题，下面就是正文。你可以像普通文档一样直接写、删、改，也可以按 Command + S 保存。
真正常用的动作，其实就几个。当我选中正文里一段文字时，旁边会出现“改这句”“喜欢”“讨厌”。点“改这句”，DeepSeek 会只处理这一句，不接管全文。
如果我觉得这句话很空，就点“讨厌”。如果我看到一句写得顺、具体、有判断，也可以点“喜欢”。
段落之间也可以补写。比如正文中间缺一段，我就在段落之间新开一行，双击，写一句需求。
写完以后，我还加了演示模式。可以调字号和滚动速度，直接当口播稿用。
所以这个工作台的逻辑不是“一键生成好稿”。它更像一条比较稳的写作流程：正式生成、审稿、细修、记录偏好，再影响下一次生成。`;

const auditServer = await startIsolatedAuditServer("storyboard-quality-snapshot");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

try {
  await page.goto(new URL("/?view=storyboard", auditServer.rootUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.shellView === "storyboard", null, { timeout: 10000 });
  await page.fill("#storyboardV2Input", draft);
  await page.click("#storyboardV2GenerateBtn");
  await page.waitForFunction(() => document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card").length >= 8, null, { timeout: 10000 });
  await page.screenshot({ path: "/tmp/a1-storyboard-quality-after-fix.png", fullPage: true });
  const report = await page.evaluate(() => ({
    count: document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card").length,
    headlines: [...document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card strong")].map((node) => node.textContent.trim().replace(/\s+/g, " ")),
    types: [...document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card")].map((card) => card.dataset.type || ""),
    templates: [...document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card")].map((card) => card.dataset.template || ""),
    tones: [...document.querySelectorAll("#storyboardV2SceneList .storyboard-v2-card")].map((card) => card.dataset.tone || ""),
    stage: document.querySelector("#storyboardV2Stage")?.textContent.trim().replace(/\s+/g, " ") || "",
  }));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await auditServer.stop();
}
