#!/usr/bin/env node
/**
 * Stage 2 semantic rewrite drafts for the storyboard table.
 *
 * This is review-only. It does not mutate storyboard props. The purpose is to
 * turn row decisions or mechanically suspicious rows into concrete semantic
 * rewrite drafts that can later become safe patch operations.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stage2-semantic-rewrite-drafts-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const manualQueuePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-manual-review-rewrite-queue-v1/report.json");

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, value, "utf8");
}

function sha256File(filePath) {
  return fs.existsSync(filePath) ? crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : null;
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function compactText(value, max = 80) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function inferCognitiveRole(text, index, total) {
  if (index === 0 || /hi|你好|我用|做了一款/u.test(text)) return "opening-orientation";
  if (/[？?]|为什么|怎么|如何|要不要|是否/u.test(text)) return "question-or-doubt";
  if (hasAny(text, ["比如", "举个", "假设", "演示", "划一下", "点击", "输入", "打开"])) return "operation-or-example";
  if (hasAny(text, ["因为", "所以", "导致", "最后", "结果", "问题"])) return "cause-effect-judgement";
  if (hasAny(text, ["喜欢", "讨厌", "风格", "历史", "版本", "保存", "记住", "下次"])) return "memory-or-archive";
  if (hasAny(text, ["不是", "但", "但是", "反而", "区别", "对比"])) return "contrast-or-correction";
  if (index >= total - 2 || hasAny(text, ["总之", "最后", "这就是", "下一次"])) return "closing-synthesis";
  return "supporting-explanation";
}

function inferAssetRoute(text, role, currentRoute) {
  if (role === "opening-orientation") return "typography-only";
  if (role === "operation-or-example") return "deterministic-semantic-stage";
  if (role === "memory-or-archive") return "deterministic-semantic-stage";
  if (role === "question-or-doubt" || role === "cause-effect-judgement" || role === "contrast-or-correction") return "deterministic-semantic-stage";
  if (hasAny(text, ["废稿", "AI 味", "不像人话", "毛刺", "失控"])) return "gpt-editorial-artwork";
  return currentRoute || "typography-only";
}

function inferMotionJob(role, route) {
  if (role === "opening-orientation") return "keyword-scale-packaging";
  if (role === "question-or-doubt") return "tension-reveal-and-answer-hold";
  if (role === "operation-or-example") return "step-cards-connect-and-writeback";
  if (role === "memory-or-archive") return "archive-stack-accumulate-and-tag";
  if (role === "cause-effect-judgement") return "cause-chain-to-verdict";
  if (role === "contrast-or-correction") return "split-contrast-then-corrective-highlight";
  if (role === "closing-synthesis") return "converge-to-final-path";
  return route === "typography-only" ? "quiet-type-emphasis" : "semantic-stage-reveal";
}

function inferLayoutJob(role, route) {
  if (route === "typography-only") return "large-editable-chinese-keyword-with-clean-negative-space";
  if (route === "gpt-editorial-artwork") return "title-safe-editorial-artwork-left-or-background-with-editable-text-layer";
  if (role === "operation-or-example") return "three-step-stage-with-source-text-kept-outside-graphic";
  if (role === "memory-or-archive") return "folder-stack-or-timeline-stage-with-title-safe-margin";
  return "semantic-diagram-stage-plus-readable-title-zone";
}

function makeFocusPhrase(text, role) {
  const cleaned = compactText(text, 42);
  const quoted = cleaned.match(/“([^”]{2,16})”/u)?.[1];
  if (quoted) return quoted;
  if (role === "opening-orientation" && /智能写作工作台/u.test(text)) return "智能写作工作台";
  if (role === "question-or-doubt" && /问题/u.test(text)) return "问题在哪";
  if (role === "operation-or-example") return "操作怎么推进";
  if (role === "memory-or-archive") return "记住偏好";
  if (role === "contrast-or-correction") return "不是一键好稿";
  if (role === "closing-synthesis") return "形成自己的系统";
  return cleaned.length > 16 ? `${cleaned.slice(0, 14)}…` : cleaned;
}

function draftForScene(scene, index, scenes, source) {
  const text = scene.screenText || "";
  const previous = scenes[index - 1]?.screenText || "";
  const next = scenes[index + 1]?.screenText || "";
  const currentFill = scene.storyboard?.semanticFill || {};
  const role = inferCognitiveRole(text, index, scenes.length);
  const assetRoute = inferAssetRoute(text, role, currentFill.assetRoute);
  const motionJob = inferMotionJob(role, assetRoute);
  const layoutJob = inferLayoutJob(role, assetRoute);
  const focusPhrase = makeFocusPhrase(text, role);
  const why = {
    "opening-orientation": "This row orients the viewer; the strongest visual move is editable keyword packaging, not a generated metaphor.",
    "question-or-doubt": "This row asks or exposes a problem; the frame should create a readable tension before resolving.",
    "operation-or-example": "This row describes a workflow/action; deterministic process graphics are clearer than abstract artwork.",
    "cause-effect-judgement": "This row makes a judgement from cause to result; show the chain and verdict instead of a generic card.",
    "memory-or-archive": "This row is about preference/history/storage; archive structure should carry the meaning.",
    "contrast-or-correction": "This row corrects a misconception; use contrast and corrective emphasis.",
    "closing-synthesis": "This row closes or converges; show direction/style/system consolidation.",
    "supporting-explanation": "This row supports the argument; keep the frame quiet and readable.",
  }[role];

  return {
    id: `stage2-draft-${scene.beatId}`,
    beatId: scene.beatId,
    macroId: scene.macroId,
    source,
    context: {
      previous: compactText(previous, 72),
      current: compactText(text, 120),
      next: compactText(next, 72),
    },
    current: {
      visualFocusText: scene.storyboard?.visualFocusText || null,
      titleLines: scene.titleLines || [],
      semanticFill: currentFill,
      semanticStageKind: scene.storyboard?.semanticDecision?.semanticStageKind || null,
      family: scene.family || null,
      presentationState: scene.presentation?.state || null,
    },
    draft: {
      cognitiveRole: role,
      visualFocusText: focusPhrase,
      intent: `让观众在这一镜完成“${focusPhrase}”的理解，而不是只看到一张泛化装饰图。`,
      fillWhat: assetRoute === "typography-only"
        ? `用可编辑中文大字突出“${focusPhrase}”，背景只保留低干扰纸纹/结构痕迹。`
        : assetRoute === "gpt-editorial-artwork"
          ? `生成一张抽象符号化无字 H-series 语义插画，表达“${focusPhrase}”背后的概念关系；只用物件、档案、路径、机器、空洞、线框或几何隐喻，禁止人头、人脸、身体、手、肖像或角色化形象，并给中文标题留安全区。`
          : `用确定性结构图表达“${focusPhrase}”：关系、流程、归档或判断必须一眼可读。`,
      fillHow: `从当前字幕判断认知角色为 ${role}；采用 ${assetRoute}，动效执行 ${motionJob}，排版执行 ${layoutJob}。若走生图，默认必须是抽象符号化非具象图，不生成人头/人脸/身体/手/肖像。`,
      assetRoute,
      evidenceNeed: assetRoute === "deterministic-with-verified-entity" ? "bind verified source or fallback to typography" : "none",
      motionJob,
      layoutJob,
      reason: why,
      confidence: Number((role === "supporting-explanation" ? 0.68 : 0.82).toFixed(2)),
      alternatives: [
        assetRoute === "typography-only" ? "deterministic-semantic-stage" : "typography-only",
        assetRoute === "gpt-editorial-artwork" ? "deterministic-semantic-stage" : "gpt-editorial-artwork",
      ],
    },
    applyMode: "review-only-draft",
    applyAllowed: false,
  };
}

function needsSampleRewrite(scene) {
  const fill = scene.storyboard?.semanticFill || {};
  const text = scene.screenText || "";
  if (fill.assetRoute === "gpt-editorial-artwork") return true;
  if (fill.status === "needs-source-check-or-text-fallback") return true;
  if (/这一镜|编辑隐喻|概念表达|泛泛|未填写/u.test(`${fill.fillWhat || ""} ${fill.fillHow || ""}`)) return true;
  if (/Hi|智能写作工作台|AI 味|不像人话|废稿|硬伤/u.test(text)) return true;
  return false;
}

const props = readJsonIfExists(storyboardPropsPath);
const manualQueue = readJsonIfExists(manualQueuePath);
const blockers = [];
if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});

const scenes = props?.scenes || [];
const manualTaskBeatIds = new Set((manualQueue?.tasks || []).map((task) => task.beatId));
const manualDrafts = scenes
  .map((scene, index) => ({scene, index}))
  .filter(({scene}) => manualTaskBeatIds.has(scene.beatId))
  .map(({scene, index}) => draftForScene(scene, index, scenes, "manual-review-rewrite-queue"));

const sampleDrafts = manualDrafts.length
  ? []
  : scenes
    .map((scene, index) => ({scene, index}))
    .filter(({scene}) => needsSampleRewrite(scene))
    .slice(0, 12)
    .map(({scene, index}) => draftForScene(scene, index, scenes, "stage2-priority-sample"));

const drafts = [...manualDrafts, ...sampleDrafts];
const byRoute = drafts.reduce((acc, item) => {
  acc[item.draft.assetRoute] = (acc[item.draft.assetRoute] || 0) + 1;
  return acc;
}, {});
const byRole = drafts.reduce((acc, item) => {
  acc[item.draft.cognitiveRole] = (acc[item.draft.cognitiveRole] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardStage2SemanticRewriteDrafts/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : drafts.length ? "DRAFTS_READY" : "EMPTY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    manualQueuePath: rel(manualQueuePath),
    manualQueueStatus: manualQueue?.status || "missing",
    mode: manualDrafts.length ? "manual-queue" : "priority-sample",
  },
  summary: {
    sceneCount: scenes.length,
    manualTaskCount: manualTaskBeatIds.size,
    draftCount: drafts.length,
    blockerCount: blockers.length,
    byRoute,
    byRole,
  },
  blockers,
  drafts,
  nextAction: drafts.length
    ? "review-stage2-drafts-then-convert-accepted-drafts-to-safe-patches"
    : "record-row-decisions-or-run-full-stage2-generator",
};

const md = [
  "# Storyboard Stage 2 Semantic Rewrite Drafts v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- mode: ${report.source.mode}`,
  `- drafts: ${report.summary.draftCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  `- apply allowed: ${report.applyAllowed}`,
  "",
  "## Drafts",
  "",
  ...(drafts.length ? drafts.map((item, index) => [
    `### ${index + 1}. ${item.beatId}`,
    "",
    `- role: ${item.draft.cognitiveRole}`,
    `- focus: ${item.draft.visualFocusText}`,
    `- route: ${item.draft.assetRoute}`,
    `- motion: ${item.draft.motionJob}`,
    `- layout: ${item.draft.layoutJob}`,
    `- reason: ${item.draft.reason}`,
    "",
  ].join("\n")) : ["- no drafts"]),
  "## Blockers",
  "",
  ...(blockers.length ? blockers.map((item) => `- ${item.id}: ${item.detail}`) : ["- none"]),
  "",
].join("\n");

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);
writeText(path.join(artifactRoot, "report.md"), md);
writeText(path.join(publicRoot, "report.md"), md);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
