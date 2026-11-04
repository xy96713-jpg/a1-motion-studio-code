#!/usr/bin/env node
/**
 * Produce structured Stage 2 judgement JSON files for the current queue.
 *
 * This producer uses the current Codex/local structured judgement path. It is
 * intentionally labeled as local judgement, not as an external model call. The
 * output contract matches the LLM inbox contract, so a future ChatGPT/Codex
 * model worker can replace this producer without changing downstream import,
 * acceptance, patch, or apply gates.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stage2-llm-judgement-producer-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const queuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-contract-v1/queue.json");
const inboxPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-contract-v1/inbox");

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function textOf(job) {
  return `${job?.input?.context?.current?.screenText || ""} ${job?.input?.context?.previous?.map((item) => item.screenText).join(" ") || ""} ${job?.input?.context?.next?.map((item) => item.screenText).join(" ") || ""}`;
}

function currentText(job) {
  return String(job?.input?.context?.current?.screenText || "").replace(/\s+/gu, " ").trim();
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function roleFor(job) {
  const text = textOf(job);
  const current = currentText(job);
  if (/hi|你好|我用|做了一款/u.test(current)) return "opening-orientation";
  if (/[？?]|为什么|怎么|如何|要不要|是否/u.test(current)) return "question-or-doubt";
  if (hasAny(current, ["划一下", "点击", "点一下", "输入", "打开", "检查", "收稿", "标喜欢", "丢进", "保存"])) return "operation-or-example";
  if (hasAny(text, ["喜欢库", "讨厌库", "风格库", "历史", "版本", "保存", "保留", "记住", "下次"])) return "memory-or-archive";
  if (hasAny(current, ["不是", "但", "但是", "反而", "区别", "AI 味", "不像人话"])) return "contrast-or-correction";
  if (hasAny(current, ["因为", "所以", "导致", "最后", "结果", "问题", "废稿", "硬伤"])) return "cause-effect-judgement";
  if (hasAny(current, ["总之", "形成", "自己的系统", "下一次"])) return "closing-synthesis";
  return "supporting-explanation";
}

function focusFor(job, role) {
  const current = currentText(job);
  const quoted = current.match(/“([^”]{2,18})”/u)?.[1];
  if (quoted) return quoted;
  if (/智能写作工作台/u.test(current)) return "智能写作工作台";
  if (/完成度很高|废稿/u.test(current)) return "完成度高的废稿";
  if (/硬伤/u.test(current)) return "检查硬伤";
  if (/AI 味|不像人话/u.test(current)) return "去掉 AI 味";
  if (/喜欢库|讨厌库/u.test(current)) return "偏好会沉淀";
  if (/风格库/u.test(current)) return "写成自己的风格";
  if (role === "operation-or-example") return "操作推进";
  if (role === "question-or-doubt") return "问题在哪";
  if (role === "closing-synthesis") return "形成自己的系统";
  return current.length > 14 ? `${current.slice(0, 12)}…` : current;
}

function routeFor(job, role) {
  const current = currentText(job);
  const existing = job?.input?.currentStoryboardRow?.semanticFill?.assetRoute;
  if (role === "opening-orientation") return "typography-only";
  if (role === "operation-or-example" || role === "memory-or-archive" || role === "question-or-doubt") return "deterministic-semantic-stage";
  if (/废稿|AI 味|不像人话|毛刺/u.test(current)) return "gpt-editorial-artwork";
  if (role === "cause-effect-judgement" || role === "contrast-or-correction" || role === "closing-synthesis") return "deterministic-semantic-stage";
  return existing && ["typography-only", "deterministic-semantic-stage", "deterministic-with-verified-entity", "gpt-editorial-artwork"].includes(existing) ? existing : "typography-only";
}

function motionFor(role, route) {
  if (role === "opening-orientation") return "keyword-scale-packaging";
  if (role === "question-or-doubt") return "question-mark-tension-to-answer-hold";
  if (role === "operation-or-example") return "step-cards-connect-and-writeback";
  if (role === "memory-or-archive") return "archive-stack-accumulate-and-tag";
  if (role === "cause-effect-judgement") return "cause-chain-to-verdict";
  if (role === "contrast-or-correction") return "split-contrast-then-corrective-highlight";
  if (role === "closing-synthesis") return "converge-to-final-path";
  return route === "typography-only" ? "quiet-type-emphasis" : "semantic-stage-reveal";
}

function layoutFor(role, route) {
  if (route === "typography-only") return "large-editable-chinese-keyword-with-clean-negative-space";
  if (route === "gpt-editorial-artwork") return "title-safe-text-free-editorial-artwork-with-editable-chinese-layer";
  if (role === "operation-or-example") return "three-step-process-stage-with-clear-source-title-zone";
  if (role === "memory-or-archive") return "archive-stack-or-timeline-stage-with-visible-grouping";
  if (role === "contrast-or-correction") return "split-contrast-stage-with-corrective-highlight";
  return "semantic-diagram-stage-plus-readable-title-zone";
}

function judgementFor(job) {
  const role = roleFor(job);
  const focus = focusFor(job, role);
  const route = routeFor(job, role);
  const motion = motionFor(role, route);
  const layout = layoutFor(role, route);
  const current = currentText(job);
  const reasonByRole = {
    "opening-orientation": "当前句承担开场定位任务，观众首先需要记住产品/主题关键词，而不是看抽象素材。",
    "question-or-doubt": "当前句在提出问题或疑问，需要让观众先看到张力，再看到判断方向。",
    "operation-or-example": "当前句描述具体动作或工作流，确定性流程结构比抽象插画更清楚。",
    "cause-effect-judgement": "当前句从原因推向结果或结论，画面应表达因果链和判断，而不是泛泛装饰。",
    "memory-or-archive": "当前句涉及偏好、历史、保存或风格沉淀，归档/时间线结构最贴近语义。",
    "contrast-or-correction": "当前句在纠正误解或指出反差，应使用对比和修正强调。",
    "closing-synthesis": "当前句承担收束任务，应把前面的偏好、判断和流程汇入一个稳定系统。",
    "supporting-explanation": "当前句是支持性解释，应保持轻量可读，不抢主线。",
  };
  const fillWhat = route === "typography-only"
    ? `用可编辑中文大字突出“${focus}”，背景只保留低干扰纸纹和少量结构痕迹。`
    : route === "gpt-editorial-artwork"
      ? `生成一张抽象符号化无字 H-series 编辑插画，表达“${focus}”的概念隐喻；只用物件、档案、路径、机器、空洞、线框或几何隐喻，禁止人头、人脸、身体、手、肖像或角色化形象；右侧或上方保留安全留白供渲染器叠加本地层。`
      : `用确定性语义结构图表达“${focus}”：把字幕里的关系、流程、归档或判断做成一眼可读的分镜图形。`;
  return {
    contract: "A1StoryboardStage2LLMJudgement/v1",
    beatId: job.beatId,
    cognitiveRole: role,
    visualFocusText: focus,
    intent: `让观众在这一镜完成“${focus}”的理解，并知道它和上下文的关系。`,
    fillWhat,
    fillHow: `基于当前字幕“${current}”和前后文判断认知角色为 ${role}；采用 ${route}，动效为 ${motion}，排版为 ${layout}。若走生图，默认必须是抽象符号化非具象图，不生成人头/人脸/身体/手/肖像。`,
    assetRoute: route,
    evidenceNeed: route === "deterministic-with-verified-entity" ? "verified-source-required" : "none",
    motionJob: motion,
    layoutJob: layout,
    reason: reasonByRole[role],
    confidence: role === "supporting-explanation" ? 0.72 : 0.86,
    alternatives: [
      route === "typography-only" ? "deterministic-semantic-stage" : "typography-only",
      route === "gpt-editorial-artwork" ? "deterministic-semantic-stage" : "gpt-editorial-artwork",
    ],
    rejectIf: ["generic visual", "unreadable screen text", "fake evidence", "route not grounded in subtitle context"],
    producer: {
      contract: "A1StoryboardStage2LocalJudgementProducer/v1",
      phaseId,
      mode: "codex-local-structured-judgement",
      promptSha256: job.promptSha256,
    },
  };
}

const queue = readJsonIfExists(queuePath);
const blockers = [];
if (!queue || queue.contract !== "A1StoryboardStage2LLMQueue/v1") blockers.push({id: "missing-stage2-llm-queue", detail: `Missing queue: ${rel(queuePath)}`});

const produced = [];
if (!blockers.length) {
  fs.mkdirSync(inboxPath, {recursive: true});
  for (const job of queue.jobs || []) {
    const judgement = judgementFor(job);
    const filePath = path.join(inboxPath, `${job.beatId}.json`);
    writeJson(filePath, judgement);
    produced.push({
      beatId: job.beatId,
      filePath: rel(filePath),
      sha256: sha256File(filePath),
      assetRoute: judgement.assetRoute,
      cognitiveRole: judgement.cognitiveRole,
      confidence: judgement.confidence,
    });
  }
}

const report = {
  contract: "A1StoryboardStage2LLMJudgementProducer/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : produced.length ? "PRODUCED" : "EMPTY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  paidApiUsed: false,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    queuePath: rel(queuePath),
    queueSha256: sha256File(queuePath),
    inboxPath: rel(inboxPath),
  },
  summary: {
    queueJobCount: queue?.jobs?.length || 0,
    producedCount: produced.length,
    blockerCount: blockers.length,
    byRoute: produced.reduce((acc, item) => {
      acc[item.assetRoute] = (acc[item.assetRoute] || 0) + 1;
      return acc;
    }, {}),
    byRole: produced.reduce((acc, item) => {
      acc[item.cognitiveRole] = (acc[item.cognitiveRole] || 0) + 1;
      return acc;
    }, {}),
  },
  blockers,
  produced,
  nextAction: produced.length ? "import-and-audit-produced-stage2-judgements" : "build-stage2-llm-contract",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
