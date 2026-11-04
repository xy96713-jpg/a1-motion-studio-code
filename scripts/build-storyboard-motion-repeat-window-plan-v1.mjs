#!/usr/bin/env node
/**
 * Motion repeat-window planner.
 *
 * Detects mechanical runs of repeated semantic stage + motion signature and
 * proposes review-only alternatives. It never mutates renderer props.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-motion-repeat-window-plan-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const storyboardPropsPath = path.join(root, "apps/studio-next/public/generated/storyboard/current/storyboard-props.json");
const stage2ImportPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-llm-judgement-import-v1/report.json");

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

function motionSignature(scene, roleByBeatId) {
  const fill = scene.storyboard?.semanticFill || {};
  const semantic = scene.storyboard?.semanticDecision || {};
  const motionPlan = scene.motionPlan || {};
  const stage = semantic.semanticStageKind || fill.assetRoute || "missing-stage";
  const motion = fill.motionJob || motionPlan.motionStyle || scene.motionArchetype || "missing-motion";
  const role = roleByBeatId.get(scene.beatId) || scene.storyboard?.storyArcSegmentation?.cognitiveRole || "unknown-role";
  return {
    stage,
    motion,
    role,
    key: `${stage}::${motion}`,
    fullKey: `${stage}::${motion}::${role}`,
  };
}

function alternativeFor(item, indexInRun) {
  const role = item.signature.role;
  if (role === "operation-or-example") return indexInRun % 2 ? "step-cards-connect-and-writeback" : "cursor-select-then-result-lock";
  if (role === "memory-or-archive") return indexInRun % 2 ? "archive-stack-accumulate-and-tag" : "timeline-pin-and-folder-close";
  if (role === "cause-effect-judgement") return indexInRun % 2 ? "cause-chain-to-verdict" : "verdict-stamp-after-evidence-slide";
  if (role === "contrast-or-correction") return indexInRun % 2 ? "split-contrast-then-corrective-highlight" : "wrong-path-fade-to-correct-path";
  if (role === "supporting-explanation") return indexInRun % 2 ? "quiet-type-emphasis" : "soft-paragraph-reveal-with-keyword-lock";
  return indexInRun % 2 ? "semantic-stage-reveal" : "keyword-scale-packaging";
}

function runsFor(items, windowSize = 3) {
  const runs = [];
  let current = [];
  for (const item of items) {
    if (!current.length || current.at(-1).signature.key === item.signature.key) {
      current.push(item);
    } else {
      if (current.length >= windowSize) runs.push(current);
      current = [item];
    }
  }
  if (current.length >= windowSize) runs.push(current);
  return runs;
}

const props = readJsonIfExists(storyboardPropsPath);
const stage2Import = readJsonIfExists(stage2ImportPath);
const blockers = [];
if (!props || !Array.isArray(props.scenes)) blockers.push({id: "missing-storyboard-props", detail: `Missing storyboard props: ${rel(storyboardPropsPath)}`});

const roleByBeatId = new Map((stage2Import?.drafts || []).map((draft) => [draft.beatId, draft.draft?.cognitiveRole]));
const scenes = props?.scenes || [];
const items = scenes.map((scene, index) => ({
  index,
  beatId: scene.beatId,
  macroId: scene.macroId,
  screenText: scene.screenText || "",
  signature: motionSignature(scene, roleByBeatId),
}));
const runs = blockers.length ? [] : runsFor(items, 3);
const operations = runs.flatMap((run, runIndex) => run.map((item, indexInRun) => ({
  id: `motion-repeat-${String(runIndex + 1).padStart(2, "0")}-${item.beatId}`,
  beatId: item.beatId,
  macroId: item.macroId,
  runIndex,
  indexInRun,
  operationType: indexInRun === 0 ? "keep-anchor-motion" : "vary-repeated-motion",
  applyMode: "manual-review-required",
  applyAllowed: false,
  risk: "medium",
  current: item.signature,
  proposedMotionJob: indexInRun === 0 ? item.signature.motion : alternativeFor(item, indexInRun),
  reason: indexInRun === 0
    ? "Keep the first item in a repeat run as the motion anchor."
    : "Adjacent repeated motion signatures risk mechanical storyboard rhythm; vary semantic action while preserving meaning.",
})));

const bySignature = items.reduce((acc, item) => {
  acc[item.signature.key] = (acc[item.signature.key] || 0) + 1;
  return acc;
}, {});
const repeatedSignatures = Object.fromEntries(Object.entries(bySignature).filter(([, count]) => count >= 3));

const report = {
  contract: "A1StoryboardMotionRepeatWindowPlan/v1",
  phaseId,
  status: blockers.length ? "BLOCKED" : operations.length ? "REVIEW_RISKS" : "PASS",
  generatedAt: new Date().toISOString(),
  reviewOnly: true,
  applyAllowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  source: {
    storyboardPropsPath: rel(storyboardPropsPath),
    storyboardPropsSha256: sha256File(storyboardPropsPath),
    stage2ImportPath: rel(stage2ImportPath),
    stage2ImportStatus: stage2Import?.status || "missing",
  },
  summary: {
    sceneCount: scenes.length,
    repeatRunCount: runs.length,
    operationCount: operations.length,
    blockerCount: blockers.length,
    repeatedSignatures,
  },
  blockers,
  runs: runs.map((run, index) => ({
    runIndex: index,
    length: run.length,
    signature: run[0]?.signature || null,
    beatIds: run.map((item) => item.beatId),
  })),
  operations,
  nextAction: operations.length
    ? "review-motion-repeat-plan-before-renderer-source-adoption"
    : "motion-repeat-window-clear",
};

const md = [
  "# Storyboard Motion Repeat Window Plan v1",
  "",
  `Status: ${report.status}`,
  "",
  "## Summary",
  "",
  `- repeat runs: ${report.summary.repeatRunCount}`,
  `- operations: ${report.summary.operationCount}`,
  `- blockers: ${report.summary.blockerCount}`,
  "",
  "## Runs",
  "",
  ...(report.runs.length ? report.runs.map((run) => [
    `### run ${run.runIndex + 1}`,
    "",
    `- signature: ${run.signature?.key}`,
    `- beatIds: ${run.beatIds.join(", ")}`,
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
