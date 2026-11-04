#!/usr/bin/env node
/**
 * Build manual rewrite tasks from row-decision patch plan.
 *
 * This catches operations that cannot be safely applied automatically:
 * rewrite visual, reroute asset, change motion, and source/evidence repair.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-manual-review-rewrite-queue-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const patchPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-row-decision-patch-plan-v1/report.json");

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

function taskTypeFor(operation) {
  if (operation.action === "rewrite-visual") return "visual-copy-rewrite";
  if (operation.action === "reroute-asset") return "asset-route-redesign";
  if (operation.action === "change-motion") return "motion-grammar-replan";
  if (operation.action === "needs-source") return "source-evidence-or-type-fallback";
  return "manual-review";
}

function fieldsFor(operation) {
  if (operation.action === "rewrite-visual") return ["semanticFill.fillWhat", "semanticFill.fillHow", "visualFocusText"];
  if (operation.action === "reroute-asset") return ["semanticFill.assetRoute", "semanticFill.status", "semanticDecision.semanticStageKind"];
  if (operation.action === "change-motion") return ["semanticFill.motionJob", "motionPlan.motionStyle", "motionPlan.kineticText.mode"];
  if (operation.action === "needs-source") return ["semanticFill.assetRoute", "semanticFill.evidenceNeed", "sourceUrl", "entityEvidence"];
  return ["storyboard"];
}

function instructionFor(operation) {
  if (operation.action === "rewrite-visual") {
    return "Rewrite the row's visual description from the source sentence. Keep it specific, non-generic, and directly usable by layout or image generation.";
  }
  if (operation.action === "reroute-asset") {
    return "Re-decide the asset route from meaning: typography-only, deterministic semantic stage, verified source/evidence, or GPT editorial artwork.";
  }
  if (operation.action === "change-motion") {
    return "Replan motion by semantic action, not template availability. Avoid repeated adjacent motion signatures.";
  }
  if (operation.action === "needs-source") {
    return "Either bind verified evidence/source material or explicitly downgrade to typography-only fallback; do not synthesize fake evidence.";
  }
  return "Manual review required before props mutation.";
}

const props = readJsonIfExists(storyboardPropsPath);
const patchPlan = readJsonIfExists(patchPlanPath);
const blockers = [];

if (!props || !Array.isArray(props.scenes)) {
  blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});
}
if (!patchPlan || patchPlan.contract !== "A1StoryboardRowDecisionPatchPlan/v1") {
  blockers.push({id: "missing-row-decision-patch-plan", detail: `Missing patch plan: ${rel(patchPlanPath)}`});
}

const manualOperations = blockers.length
  ? []
  : (patchPlan.operations || []).filter((operation) => operation.applyMode === "manual-review-required");

const tasks = manualOperations.map((operation, index) => ({
  id: `manual-rewrite-${String(index + 1).padStart(3, "0")}-${operation.beatId}`,
  beatId: operation.beatId,
  macroId: operation.macroId,
  taskType: taskTypeFor(operation),
  sourceAction: operation.action,
  title: operation.title,
  sourceText: operation.sourceText,
  current: operation.current,
  fieldsToRewrite: fieldsFor(operation),
  instruction: instructionFor(operation),
  proposedPatchPreview: operation.proposedPatch || [],
  status: "needs-manual-rewrite",
  applyBlockedUntil: "rewrite-task-reviewed-and-converted-to-safe-patch",
}));

const byTaskType = tasks.reduce((acc, task) => {
  acc[task.taskType] = (acc[task.taskType] || 0) + 1;
  return acc;
}, {});

const report = {
  contract: "A1StoryboardManualReviewRewriteQueue/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : tasks.length ? "READY" : "EMPTY",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    patchPlanPath: rel(patchPlanPath),
    patchPlanStatus: patchPlan?.status || "missing",
  },
  summary: {
    taskCount: tasks.length,
    blockerCount: blockers.length,
    byTaskType,
  },
  blockers,
  tasks,
  nextAction: tasks.length
    ? "rewrite-manual-tasks-then-convert-to-safe-patch-plan"
    : "record-manual-row-decisions-in-storyboard-table",
};

const md = [
  "# Storyboard Manual Review Rewrite Queue v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- tasks: ${report.summary.taskCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  `- apply allowed: ${report.applyAllowed}`,
  "",
  "## Tasks",
  "",
  ...(tasks.length ? tasks.map((task, index) => [
    `### ${index + 1}. ${task.beatId} - ${task.taskType}`,
    "",
    `- source action: ${task.sourceAction}`,
    `- title: ${task.title}`,
    `- fields: ${task.fieldsToRewrite.join(", ")}`,
    `- instruction: ${task.instruction}`,
    "",
  ].join("\n")) : ["- no manual rewrite tasks"]),
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
