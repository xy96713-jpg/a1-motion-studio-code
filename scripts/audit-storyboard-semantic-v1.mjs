#!/usr/bin/env node
/**
 * Audit the isolated current storyboard semantic decisions.
 *
 * This reads only apps/studio-next/public/generated/storyboard/current and writes
 * a review report under generated/system-line. It does not mutate renderer props.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const args = process.argv.slice(2);

function argValue(name, fallback) {
  const idx = args.indexOf(name);
  return idx === -1 ? fallback : args[idx + 1];
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function visualFocus(scene) {
  return scene.storyboard?.visualFocusText || (Array.isArray(scene.titleLines) ? scene.titleLines.join(" ") : "") || scene.screenText || "";
}

function semanticIssues(scene) {
  const issues = [];
  const text = scene.screenText || "";
  const focus = visualFocus(scene);
  const stage = scene.storyboard?.semanticDecision?.semanticStageKind || null;
  const state = scene.presentation?.state || null;
  const family = scene.family || null;
  const motion = scene.motionPlan?.motionStyle || null;

  const operationText = /划一下|点击|点一下|点选|输入|打开|调节|保存|双击|收稿|标喜欢|丢进|生成|检查|提醒|选择|回填|修改/u.test(text);
  const archiveText = /喜欢库|讨厌库|风格库|历史|归档|保存|保留|版本|近五次|下次|记住|记录/u.test(text);
  const questionText = /[？?]|为什么|怎么|如何|是否|要不要|能不能|会不会/u.test(text);
  const argumentText = questionText || /因为|所以|但是|而是|不是|如果|只要|问题|缺|不够|泛泛|废稿|不说人话|没动作|枯燥/u.test(text);

  if (!stage) issues.push("missing-semantic-stage");
  if (!state) issues.push("missing-presentation-state");
  if (!family) issues.push("missing-family");
  if (!motion) issues.push("missing-motion-style");
  if (focus === text && text.length > 22) issues.push("focus-too-long");
  if (focus.length > 18) issues.push("focus-may-be-too-long-for-card");
  if (stage === "operation-flow" && !operationText) issues.push("operation-stage-without-action-verb");
  if (operationText && stage !== "operation-flow" && !archiveText) issues.push("action-text-not-operation-stage");
  if (stage === "archive-structure" && !archiveText) issues.push("archive-stage-without-archive-token");
  if (archiveText && stage !== "archive-structure" && !operationText) issues.push("archive-text-not-archive-stage");
  if (questionText && state !== "question" && state !== "decision-branch" && stage !== "archive-structure" && stage !== "operation-flow") issues.push("question-text-not-question-state");
  if (argumentText && stage === "typographic-packaging") issues.push("argument-text-left-as-typography");
  if (stage === "archive-structure" && scene.backgroundState !== "archive-density") issues.push("archive-without-archive-density");
  if (stage === "operation-flow" && scene.backgroundState !== "wireframe-space") issues.push("operation-without-wireframe-space");

  return issues;
}

const propsPath = path.resolve(root, argValue("--props", "apps/studio-next/public/generated/storyboard/current/storyboard-props.json"));
const outPath = path.resolve(root, argValue("--out", "apps/studio-next/public/generated/system-line/storyboard-semantic-audit-v1/report.json"));
if (!fs.existsSync(propsPath)) throw new Error(`props not found: ${propsPath}`);

const props = JSON.parse(fs.readFileSync(propsPath, "utf8"));
const scenes = Array.isArray(props.scenes) ? props.scenes : [];
const rows = scenes.map((scene) => ({
  beatId: scene.beatId,
  macroId: scene.macroId,
  startMs: scene.sourceStartMs,
  endMs: scene.sourceEndMs,
  screenText: scene.screenText,
  visualFocusText: visualFocus(scene),
  semanticStageKind: scene.storyboard?.semanticDecision?.semanticStageKind || null,
  presentationState: scene.presentation?.state || null,
  family: scene.family || null,
  motionStyle: scene.motionPlan?.motionStyle || null,
  backgroundState: scene.backgroundState || null,
  issues: semanticIssues(scene),
}));

const issueRows = rows.filter((row) => row.issues.length > 0);
const countsByStage = {};
const countsByIssue = {};
for (const row of rows) {
  countsByStage[row.semanticStageKind || "missing"] = (countsByStage[row.semanticStageKind || "missing"] || 0) + 1;
  for (const issue of row.issues) countsByIssue[issue] = (countsByIssue[issue] || 0) + 1;
}

const report = {
  contract: "A1StoryboardSemanticAudit/v1",
  status: issueRows.length ? "REVIEW" : "PASS",
  generatedAt: new Date().toISOString(),
  source: {
    propsPath: path.relative(root, propsPath),
    propsSha256: sha256File(propsPath),
    sceneCount: scenes.length,
  },
  summary: {
    sceneCount: scenes.length,
    issueSceneCount: issueRows.length,
    countsByStage,
    countsByIssue,
  },
  issueRows,
  rows,
};

fs.mkdirSync(path.dirname(outPath), {recursive: true});
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  status: report.status,
  sceneCount: scenes.length,
  issueSceneCount: issueRows.length,
  countsByStage,
  countsByIssue,
  reportPath: path.relative(root, outPath),
}, null, 2));
