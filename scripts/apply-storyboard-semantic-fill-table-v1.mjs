#!/usr/bin/env node
/**
 * Fill the storyboard table from content semantics.
 *
 * This is not a renderer pass. It writes an explicit per-shot production row:
 * why this shot exists, what should be on screen, how it should be filled, and
 * what execution route owns the next action.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-semantic-fill-table-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const rendererPropsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const manifestPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-manifest.json");
const approvalPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-approval.json");

const gptEditorialBeats = new Set(["H03-B02", "H03-B03", "H05-B03", "H05-B04", "H10-B04", "H11-B02", "H11-B03"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rel(filePath) {
  return path.relative(root, filePath);
}

function compact(value = "", max = 24) {
  return Array.from(String(value || "").replace(/\s+/gu, " ").trim()).slice(0, max).join("");
}

function evidenceNeed(text) {
  if (/Kimi|DeepSeek|ChatGPT|OpenAI|Claude|Codex|模型/u.test(text)) return "verified-entity-card-if-visible";
  if (/前端|页面|工作台|演示/u.test(text)) return "recording-replaceable-no-fake-ui";
  return "none";
}

function semanticIntent(scene, stage, state) {
  const text = scene.screenText || "";
  if (scene.beatId === "H01-B01") return "先让观众知道产品是什么，不急着解释功能细节";
  if (stage === "operation-flow") return "把旁白里的操作关系拆成对象、动作、结果";
  if (stage === "archive-structure") return "把记忆、版本、偏好或历史表现为可回写的档案结构";
  if (stage === "argument-grammar" && state === "decision-branch") return "把选择方向表现为分叉后收束的判断";
  if (stage === "argument-grammar" && /问题|硬伤|废稿|泛泛|不说人话|不懂/u.test(text)) return "把问题和判断标准讲清楚，而不是只做情绪标题";
  if (stage === "argument-grammar") return "把观点关系表现为提问、反证、因果或结论";
  return "让这一句成为可读的大字包装，避免无意义配图";
}

function fillWhat(scene, stage, state, focus) {
  const text = scene.screenText || "";
  if (gptEditorialBeats.has(scene.beatId)) return `抽象符号化无字概念图：用物件、档案、路径、机器、空洞、线框或几何隐喻表达“${focus}”，保留中文字空间，不出现具象人物/人头/人脸`;
  if (stage === "operation-flow") {
    if (/划一下|选择|点选/u.test(text)) return "三段式操作卡：被选中的句子 -> 修改动作 -> 输出结果";
    if (/输入|打开/u.test(text)) return "输入/打开动作的低干扰流程卡，不画假界面";
    if (/检查|提醒|理由/u.test(text)) return "批注式判断卡：问题点、理由、处理结果";
    return "对象 -> 动作 -> 结果的流程图形";
  }
  if (stage === "archive-structure") return "档案夹、版本条、写回箭头和分组括号";
  if (stage === "argument-grammar" && state === "decision-branch") return "两到三条路径的分叉图，突出被选择的方向";
  if (stage === "argument-grammar" && /因为|所以|但是|不是|而是|如果/u.test(text)) return "因果链或对照结构，不做孤立标题";
  if (stage === "argument-grammar") return "问题/判断/结论的语法结构图";
  return `大字包装：${focus}`;
}

function fillHow(scene, stage, state) {
  if (gptEditorialBeats.has(scene.beatId)) return "GPT/ChatGPT 生成抽象符号化无字 16:9 PNG，导入后只作为背景或主体，中文仍由本地排版；默认禁止人头、人脸、身体、手、肖像或角色化形象";
  if (stage === "operation-flow") return "使用确定性语义组件 OperationFlowStage，本地可编辑文字压在安全区";
  if (stage === "archive-structure") return "使用确定性语义组件 ArchiveStructureStage，本地画档案结构，不需要截图";
  if (stage === "argument-grammar") return "使用确定性语义组件 ArgumentGrammarStage，根据 state 切换提问/因果/分叉";
  return "使用 typography packaging，大字、关键词强调和轻背景完成，不补无关图";
}

function assetRoute(scene, stage) {
  if (gptEditorialBeats.has(scene.beatId)) return "gpt-editorial-artwork";
  if (evidenceNeed(scene.screenText) === "verified-entity-card-if-visible") return "deterministic-with-verified-entity";
  if (stage === "typographic-packaging") return "typography-only";
  return "deterministic-semantic-stage";
}

function executionSteps(route) {
  if (route === "gpt-editorial-artwork") {
    return ["生成抽象符号化无字素材", "放入 WebGPT inbox", "按 beatId 导入", "人工确认不含文字/假证据/具象人物", "再决定是否回填"];
  }
  if (route === "deterministic-with-verified-entity") {
    return ["查实体证据", "若有本地官方卡则显示", "无证据时退回文字/结构图", "禁止假 logo"];
  }
  if (route === "deterministic-semantic-stage") {
    return ["选择语义组件", "填对象/动作/结果或论证节点", "保留标题安全区", "检查遮挡和重复"];
  }
  return ["提取短焦点词", "本地排版", "关键词动效", "检查读时和断词"];
}

function rowStatus(route) {
  if (route === "gpt-editorial-artwork") return "needs-artwork-generation";
  if (route === "deterministic-with-verified-entity") return "needs-source-check-or-text-fallback";
  return "filled-deterministic";
}

function semanticFillFor(scene, index) {
  const semantic = scene.storyboard?.semanticDecision || {};
  const stage = semantic.semanticStageKind || (scene.route === "typographic-packaging" ? "typographic-packaging" : "argument-grammar");
  const state = scene.presentation?.state || semantic.presentationState || "claim";
  const focus = scene.storyboard?.visualFocusText || scene.presentation?.primary || (scene.titleLines || []).join("") || compact(scene.screenText, 14);
  const route = assetRoute(scene, stage);
  return {
    contract: "A1StoryboardSemanticFill/v1",
    source: "apply-storyboard-semantic-fill-table-v1",
    order: index + 1,
    beatId: scene.beatId,
    macroId: scene.macroId,
    sourceText: scene.screenText,
    visibleText: focus,
    semanticStageKind: stage,
    presentationState: state,
    intent: semanticIntent(scene, stage, state),
    fillWhat: fillWhat(scene, stage, state, focus),
    fillHow: fillHow(scene, stage, state),
    assetRoute: route,
    evidenceNeed: evidenceNeed(scene.screenText),
    motionJob: scene.motionPlan?.primaryAction || scene.motionPlan?.motionStyle || scene.motionArchetype || "text-reveal",
    layoutJob: scene.layoutFamily || scene.layout?.layoutSignature || "editorial-safe-title-area",
    executionSteps: executionSteps(route),
    status: rowStatus(route),
    acceptance: [
      "中文必须是本地可编辑层",
      "不放假 UI / 假文件 / 假证据",
      "画面主体不得遮挡可读标题",
      "相邻镜头不能连续三次同一视觉语法",
    ],
  };
}

const generatedAt = new Date().toISOString();

function applyToProps(props) {
  if (!Array.isArray(props.scenes)) throw new Error("props.scenes missing");
  props.scenes.forEach((scene, index) => {
    const fill = semanticFillFor(scene, index);
    scene.storyboard = {
      ...(scene.storyboard || {}),
      semanticFill: fill,
      visualSource: fill.assetRoute === "gpt-editorial-artwork" ? "generate" : fill.assetRoute === "typography-only" ? "type" : "type",
      fillStatus: fill.status,
    };
  });
  props.storyboardTable = {
    contract: "A1StoryboardSemanticFillTable/v1",
    generatedAt,
    source: "content-semantics-not-cloned-shot-style",
    rowCount: props.scenes.length,
  };
  props.contentHash = crypto.createHash("sha256").update(JSON.stringify({
    scenes: props.scenes.map((scene) => [scene.beatId, scene.screenText, scene.storyboard?.semanticFill]),
  })).digest("hex");
}

const before = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};

const storyboardProps = readJson(storyboardPropsPath);
const rendererProps = readJson(rendererPropsPath);
applyToProps(storyboardProps);
applyToProps(rendererProps);
writeJson(storyboardPropsPath, storyboardProps);
writeJson(rendererPropsPath, rendererProps);

const after = {
  storyboardPropsSha256: sha256File(storyboardPropsPath),
  rendererPropsSha256: sha256File(rendererPropsPath),
};

if (fs.existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  manifest.current = {
    ...(manifest.current || {}),
    propsSha256: after.storyboardPropsSha256,
    propsPath: rel(storyboardPropsPath),
    semanticFillTable: `apps/studio-next/public/generated/system-line/${phaseId}/report.json`,
  };
  manifest.reviewState = {
    ...(manifest.reviewState || {}),
    approvalInvalidatedAt: generatedAt,
    approvalInvalidationReason: "semantic-fill-table-applied",
  };
  writeJson(manifestPath, manifest);
}

if (fs.existsSync(approvalPath)) {
  writeJson(approvalPath, {
    contract: "A1StoryboardApproval/v1",
    status: "INVALIDATED_BY_STORYBOARD_CHANGE",
    invalidatedAt: generatedAt,
    reason: "semantic-fill-table-applied",
    before,
    after,
    fullMp4RenderAllowed: false,
    finalRenderAllowed: false,
    resolveExportAllowed: false,
  });
}

const rows = storyboardProps.scenes.map((scene) => scene.storyboard.semanticFill);
const byStatus = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
const byRoute = rows.reduce((acc, row) => {
  acc[row.assetRoute] = (acc[row.assetRoute] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardSemanticFillTable/v1",
  phaseId,
  status: "FILLED_FOR_STORYBOARD_REVIEW",
  generatedAt,
  reviewOnly: true,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    rendererPropsPath: rel(rendererPropsPath),
  },
  before,
  after: {
    ...after,
    storyboardRendererHashMatch: after.storyboardPropsSha256 === after.rendererPropsSha256,
  },
  summary: {
    rowCount: rows.length,
    byStatus,
    byRoute,
  },
  rows,
  nextAction: "review-the-storyboard-table-and-fix-row-level-semantic-fill-before-any-new-review-render",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  before,
  after: report.after,
  reportPath: rel(path.join(artifactRoot, "report.json")),
  publicReportPath: rel(path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));
