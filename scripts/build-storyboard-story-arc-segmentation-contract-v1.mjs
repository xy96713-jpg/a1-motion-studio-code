#!/usr/bin/env node
/**
 * Story-arc segmentation contract for intelligent storyboard generation.
 *
 * This audits whether shots behave like cognitive/story units, not just SRT
 * punctuation/time chunks. It is review-only and does not mutate props.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-story-arc-segmentation-contract-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const stage2LlmImportPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-judgement-import-v1/report.json");

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

function clean(value, max = 220) {
  return String(value || "").replace(/\s+/gu, " ").trim().slice(0, max);
}

function hasAny(text, words) {
  return words.some((word) => text.includes(word));
}

function fallbackRole(text, index, total) {
  if (index === 0 || /hi|你好|我用|做了一款/u.test(text)) return "opening-orientation";
  if (/[？?]|为什么|怎么|如何|是否|要不要/u.test(text)) return "question-or-doubt";
  if (hasAny(text, ["划一下", "点击", "输入", "打开", "检查", "保存", "标喜欢", "收稿"])) return "operation-or-example";
  if (hasAny(text, ["喜欢库", "讨厌库", "风格库", "历史", "版本", "记住", "下次"])) return "memory-or-archive";
  if (hasAny(text, ["不是", "但", "但是", "反而", "区别", "对比", "AI 味"])) return "contrast-or-correction";
  if (hasAny(text, ["因为", "所以", "导致", "最后", "结果", "问题", "废稿", "硬伤"])) return "cause-effect-judgement";
  if (index >= total - 2 || hasAny(text, ["总之", "形成", "自己的系统"])) return "closing-synthesis";
  return "supporting-explanation";
}

function transitionType(prevRole, role) {
  if (!prevRole) return "start";
  if (prevRole === role) return "continuation";
  if (role === "question-or-doubt") return "new-question";
  if (role === "operation-or-example") return "example-or-demo";
  if (role === "contrast-or-correction") return "correction";
  if (role === "cause-effect-judgement") return "judgement";
  if (role === "memory-or-archive") return "state-accumulation";
  if (role === "closing-synthesis") return "closing";
  return "support";
}

function actionFor(scene, role, prevRole, nextRole, durationMs) {
  const text = scene.screenText || "";
  const weakPunctuation = /^[，。,.、\s]+$/u.test(text) || text.length < 4;
  if (weakPunctuation) {
    return {
      action: "merge-candidate",
      issue: "weak-fragment",
      reason: "Shot text is too weak to carry an independent cognitive unit.",
    };
  }
  if (durationMs < 1300 && role === prevRole) {
    return {
      action: "merge-candidate",
      issue: "short-same-role",
      reason: "Very short shot repeats the previous cognitive role.",
    };
  }
  if (durationMs > 7600 && /但是|但|比如|最后|所以|然后|接着|同时/u.test(text)) {
    return {
      action: "split-candidate",
      issue: "long-multi-connector",
      reason: "Long row contains connector words that may represent two cognition steps.",
    };
  }
  if (role === "supporting-explanation" && prevRole === "supporting-explanation" && nextRole === "supporting-explanation") {
    return {
      action: "merge-or-soften-candidate",
      issue: "support-run",
      reason: "Three adjacent support rows risk feeling mechanical unless motion/layout differentiates them.",
    };
  }
  return {
    action: "keep",
    issue: null,
    reason: "Shot is acceptable as an independent story/cognition unit.",
  };
}

const props = readJsonIfExists(storyboardPropsPath);
const stage2Import = readJsonIfExists(stage2LlmImportPath);
const blockers = [];
if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});

const llmRoleByBeatId = new Map((stage2Import?.drafts || []).map((draft) => [draft.beatId, draft.draft?.cognitiveRole]));
const scenes = props?.scenes || [];
const rows = scenes.map((scene, index) => {
  const role = llmRoleByBeatId.get(scene.beatId) || fallbackRole(scene.screenText || "", index, scenes.length);
  const prevRole = index > 0 ? (llmRoleByBeatId.get(scenes[index - 1].beatId) || fallbackRole(scenes[index - 1].screenText || "", index - 1, scenes.length)) : null;
  const nextRole = index < scenes.length - 1 ? (llmRoleByBeatId.get(scenes[index + 1].beatId) || fallbackRole(scenes[index + 1].screenText || "", index + 1, scenes.length)) : null;
  const durationMs = Math.max(0, Number(scene.sourceEndMs || 0) - Number(scene.sourceStartMs || 0));
  const decision = actionFor(scene, role, prevRole, nextRole, durationMs);
  return {
    beatId: scene.beatId,
    macroId: scene.macroId,
    timeRangeMs: [scene.sourceStartMs, scene.sourceEndMs],
    durationMs,
    sourceText: clean(scene.screenText, 260),
    cognitiveRole: role,
    roleSource: llmRoleByBeatId.has(scene.beatId) ? "stage2-llm-import" : "fallback-rule",
    transitionFromPrevious: transitionType(prevRole, role),
    recommendedSegmentationAction: decision.action,
    issue: decision.issue,
    reason: decision.reason,
    neighbors: {
      previousRole: prevRole,
      nextRole,
    },
  };
});

const byAction = rows.reduce((acc, row) => {
  acc[row.recommendedSegmentationAction] = (acc[row.recommendedSegmentationAction] || 0) + 1;
  return acc;
}, {});
const byRole = rows.reduce((acc, row) => {
  acc[row.cognitiveRole] = (acc[row.cognitiveRole] || 0) + 1;
  return acc;
}, {});
const issueRows = rows.filter((row) => row.recommendedSegmentationAction !== "keep");

const report = {
  contract: "A1StoryboardStoryArcSegmentationContract/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : issueRows.length ? "REVIEW_RISKS" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    stage2LlmImportPath: rel(stage2LlmImportPath),
    stage2LlmImportStatus: stage2Import?.status || "missing",
  },
  summary: {
    sceneCount: rows.length,
    issueRowCount: issueRows.length,
    blockerCount: blockers.length,
    byAction,
    byRole,
  },
  blockers,
  rows,
  issueRows,
  nextAction: issueRows.length
    ? "review-story-arc-split-merge-candidates-before-regenerating-storyboard"
    : "segmentation-contract-ready-for-cross-project-fixtures",
};

const md = [
  "# Storyboard Story-Arc Segmentation Contract v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- scenes: ${report.summary.sceneCount}`,
  `- issue rows: ${report.summary.issueRowCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  "",
  "## Issue rows",
  "",
  ...(issueRows.length ? issueRows.map((row) => [
    `### ${row.beatId}`,
    "",
    `- action: ${row.recommendedSegmentationAction}`,
    `- role: ${row.cognitiveRole}`,
    `- issue: ${row.issue}`,
    `- reason: ${row.reason}`,
    `- text: ${row.sourceText}`,
    "",
  ].join("\n")) : ["- none"]),
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
