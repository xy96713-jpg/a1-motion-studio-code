#!/usr/bin/env node
/**
 * Audit every semantic-fill storyboard row.
 *
 * The goal is to catch rows that look filled but are still mechanical:
 * generic wording, wrong route, missing execution specificity, or evidence /
 * generated-artwork status mismatches.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-semantic-fill-row-audit-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const propsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const fillTablePath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-semantic-fill-table-v1/report.json");

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

function compactText(value = "") {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

function focusTokens(scene) {
  const focus = compactText(scene.storyboard?.visualFocusText || scene.presentation?.primary || "");
  const source = focus || compactText(scene.screenText || "");
  const normalized = source.replace(/[，。、“”‘’！？；：,.!?;:\s]/gu, "");
  const stop = new Set(["这个", "可以", "直接", "最后", "之后", "以及", "如果", "就是", "什么", "一个", "不是", "没有", "还是", "时候", "一下"]);
  const tokens = new Set();
  if (normalized.length >= 3) tokens.add(normalized.slice(0, Math.min(10, normalized.length)));
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      const token = normalized.slice(index, index + size);
      if (!stop.has(token)) tokens.add(token);
    }
  }
  return [...tokens].filter((token) => token.length >= 2).slice(0, 18);
}

function hasSubtitleAnchor(scene, fill) {
  const target = compactText(`${fill.intent || ""} ${fill.fillWhat || ""} ${fill.fillHow || ""} ${fill.visibleText || ""}`);
  const tokens = focusTokens(scene);
  if (!tokens.length) return true;
  return tokens.some((token) => target.includes(token));
}

function hasSpecificObject(value = "") {
  const text = compactText(value);
  return /句子|段落|文章|读者|方向|工作流|风格库|历史|版本|问题|理由|标准|结果|路径|档案|分叉|流程|证据|模型|界面|标题|全文|补段|硬伤|稿纸|稿件|机器|空洞|骨架|气泡|文本|节点|链|轨道|线团|正文|空位|候选|卡|标签|章|批注|箭头|滑杆|阅读区|材料|主线|库|高亮|人手|笔|来源|词组|对照|动机/u.test(text);
}

function isTooGeneric(value = "") {
  const text = compactText(value);
  if (!text) return true;
  const generic = [
    "大字包装",
    "问题/判断/结论的语法结构图",
    "对象 -> 动作 -> 结果的流程图形",
    "使用 typography packaging",
    "使用确定性语义组件",
    "不做孤立标题",
  ];
  return generic.some((item) => text === item || text.includes(item) && text.length < item.length + 8);
}

function isComponentOnlyExecution(value = "") {
  const text = compactText(value);
  if (!/使用确定性语义组件|使用 typography packaging|OperationFlowStage|ArchiveStructureStage|ArgumentGrammarStage/u.test(text)) return false;
  const hasConcreteVerb = /先|再|随后|逐个|压|拉|汇入|回填|高亮|框选|盖章|合拢|分叉|写回|拦截|露出|钉进|进入|放回|检查|调节/u.test(text);
  return text.length < 58 || !hasConcreteVerb;
}

function hasFigurativeGeneratedArtworkRisk(value = "") {
  const text = compactText(value).replace(/(?:禁止|不得|不要|不生成|避免|不能出现|do not|avoid)[^。；;,.，]*/giu, "");
  return /人头|人脸|头像|头部|脸部|身体|人体|人物|肖像|画像|手部|人手|mannequin|portrait|face|head|skull|body|human|person|character/u.test(text);
}

function expectedRoute(scene, fill) {
  const text = compactText(scene.screenText);
  const stage = fill.semanticStageKind;
  if (/官方|来源|证据|真实截图|网页|论文|报告/u.test(text)) return "deterministic-with-verified-entity";
  if (/Kimi|DeepSeek|ChatGPT|OpenAI|Claude|Codex|模型/u.test(text) && fill.assetRoute === "deterministic-with-verified-entity") return "deterministic-with-verified-entity";
  if (stage === "typographic-packaging") return "typography-only";
  if (["operation-flow", "archive-structure"].includes(stage)) return "deterministic-semantic-stage";
  if (stage === "argument-grammar" && fill.assetRoute !== "gpt-editorial-artwork") return "deterministic-semantic-stage";
  if (fill.assetRoute === "gpt-editorial-artwork") return "gpt-editorial-artwork";
  return fill.assetRoute;
}

function auditRow(scene) {
  const fill = scene.storyboard?.semanticFill || null;
  const issues = [];
  const add = (severity, id, detail) => issues.push({severity, id, detail});

  if (!fill) {
    return {
      beatId: scene.beatId,
      macroId: scene.macroId,
      status: "NEEDS_REWRITE",
      issues: [{severity: "blocker", id: "semantic-fill-missing", detail: "row has no storyboard.semanticFill"}],
      recommendation: "Regenerate semantic fill for this row from source text.",
    };
  }

  for (const key of ["intent", "fillWhat", "fillHow", "assetRoute", "status"]) {
    if (!compactText(fill[key])) add("blocker", `missing-${key}`, `${key} is empty`);
  }

  if (compactText(fill.intent).length < 12) add("review", "intent-too-thin", "intent does not explain the viewer cognition task");
  if (isTooGeneric(fill.fillWhat) || !hasSpecificObject(fill.fillWhat)) add("review", "fill-what-too-generic", "fillWhat lacks a concrete visual object or relationship");
  if (isTooGeneric(fill.fillHow)) add("review", "fill-how-too-generic", "fillHow names a component but not the concrete execution");
  if (isComponentOnlyExecution(fill.fillHow)) add("review", "component-only-execution", "fillHow exposes the component name but not the actual shot execution");
  if (!hasSubtitleAnchor(scene, fill)) add("review", "not-anchored-to-subtitle-focus", "fillWhat/fillHow do not visibly anchor to the subtitle focus phrase");

  const expected = expectedRoute(scene, fill);
  if (expected && fill.assetRoute !== expected) {
    add("blocker", "wrong-asset-route", `expected ${expected}, got ${fill.assetRoute}`);
  }

  if (fill.assetRoute === "gpt-editorial-artwork") {
    if (fill.status !== "needs-artwork-generation") add("blocker", "generated-artwork-status-mismatch", "generated artwork route must stay needs-artwork-generation before import/review");
    if (!/无字|概念|隐喻|PNG|生图/u.test(`${fill.fillWhat} ${fill.fillHow}`)) add("review", "generated-artwork-not-specific", "generated artwork row should say what conceptual image to generate");
    if (!/抽象|符号|物件|档案|路径|机器|空洞|线框|几何/u.test(`${fill.fillWhat} ${fill.fillHow}`)) add("review", "generated-artwork-abstraction-missing", "generated artwork must explicitly default to abstract symbolic non-figurative imagery");
    if (hasFigurativeGeneratedArtworkRisk(`${fill.fillWhat} ${fill.fillHow}`)) add("blocker", "generated-artwork-figurative-risk", "generated artwork row must not request human heads/faces/bodies/portraits/hands by default");
  }

  if (fill.assetRoute === "deterministic-with-verified-entity") {
    if (!/证据|官方|来源|假 logo|回退|实体/u.test(`${fill.fillWhat} ${fill.fillHow} ${fill.evidenceNeed}`)) add("blocker", "source-policy-missing", "entity row must explicitly mention verified source or fallback");
  }

  if (fill.assetRoute === "typography-only") {
    if (!/文字|大字|关键词|排版|屏幕/u.test(`${fill.fillWhat} ${fill.fillHow}`)) add("review", "typography-plan-not-explicit", "typography route should state the visible text treatment");
  }

  if (!Array.isArray(fill.executionSteps) || fill.executionSteps.length < 3) add("review", "execution-steps-too-thin", "executionSteps should have at least 3 concrete steps");
  if (!Array.isArray(fill.acceptance) || fill.acceptance.length < 3) add("review", "acceptance-too-thin", "acceptance checks are missing or too thin");

  const blockerCount = issues.filter((item) => item.severity === "blocker").length;
  const status = blockerCount ? "WRONG_ROUTE" : issues.length ? "NEEDS_REWRITE" : "PASS";
  return {
    beatId: scene.beatId,
    macroId: scene.macroId,
    sourceText: scene.screenText,
    visibleText: fill.visibleText,
    assetRoute: fill.assetRoute,
    fillStatus: fill.status,
    status,
    issues,
    recommendation: status === "PASS"
      ? "No row-level semantic-fill change required."
      : blockerCount
        ? "Fix route/status first, then rewrite fillWhat/fillHow with concrete visual objects."
        : "Rewrite fillWhat/fillHow so the row is specific enough for production.",
  };
}

if (!fs.existsSync(propsPath)) throw new Error(`props missing: ${rel(propsPath)}`);
if (!fs.existsSync(fillTablePath)) throw new Error(`semantic fill table missing: ${rel(fillTablePath)}`);

const props = readJson(propsPath);
const fillTable = readJson(fillTablePath);
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const rows = scenes.map(auditRow);
const fillSignatures = new Map();
for (const scene of scenes) {
  const fill = scene.storyboard?.semanticFill || {};
  const signature = compactText(`${fill.assetRoute || ""}|${fill.fillWhat || ""}|${fill.fillHow || ""}`);
  if (!signature) continue;
  fillSignatures.set(signature, [...(fillSignatures.get(signature) || []), scene.beatId]);
}
const rowByBeatId = new Map(rows.map((row) => [row.beatId, row]));
for (const [signature, beatIds] of fillSignatures.entries()) {
  if (beatIds.length < 2) continue;
  for (const beatId of beatIds) {
    const row = rowByBeatId.get(beatId);
    if (!row) continue;
    row.issues.push({severity: "review", id: "reused-fill-signature", detail: `same semanticFill wording reused by ${beatIds.join(", ")}`});
  }
}
for (const row of rows) {
  const blockerCount = row.issues.filter((item) => item.severity === "blocker").length;
  row.status = blockerCount ? "WRONG_ROUTE" : row.issues.length ? "NEEDS_REWRITE" : "PASS";
  row.recommendation = row.status === "PASS"
    ? "No row-level semantic-fill change required."
    : blockerCount
      ? "Fix route/status first, then rewrite fillWhat/fillHow with concrete visual objects."
      : "Rewrite fillWhat/fillHow so the row is specific enough for production.";
}
const byStatus = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});
const byIssue = rows.flatMap((row) => row.issues.map((issue) => issue.id)).reduce((acc, id) => {
  acc[id] = (acc[id] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardSemanticFillRowAudit/v1",
  phaseId,
  status: rows.some((row) => row.status === "WRONG_ROUTE") ? "FAIL_WRONG_ROUTE" : rows.some((row) => row.status === "NEEDS_REWRITE") ? "PASS_WITH_REWRITE_ITEMS" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  rendererPatchAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    propsPath: rel(propsPath),
    propsSha256: sha256File(propsPath),
    fillTablePath: rel(fillTablePath),
    fillTableSha256: sha256File(fillTablePath),
    fillTableStatus: fillTable.status || null,
  },
  summary: {
    rowCount: rows.length,
    byStatus,
    byIssue,
  },
  rows,
  nextAction: rows.some((row) => row.status !== "PASS")
    ? "rewrite-flagged-semantic-fill-rows-before-artwork-generation-or-render-approval"
    : "semantic-fill-rows-ready-for-artwork-and-layout-execution",
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

if (report.status === "FAIL_WRONG_ROUTE") process.exitCode = 2;
