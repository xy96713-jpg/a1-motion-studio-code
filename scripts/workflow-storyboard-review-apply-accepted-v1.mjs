#!/usr/bin/env node
/**
 * Apply every accepted storyboard review item in one safe pass.
 *
 * Important: this workflow builds the current accepted plans first, then applies
 * Stage 2, story-arc regroup, and motion patches without rebuilding between
 * them. Rebuilding after the first props mutation would make the other
 * acceptance files look stale and could silently skip accepted work.
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-review-apply-accepted-workflow-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

const steps = [
  ["build:storyboard-stage2-draft-patch-plan", "freeze Stage 2 accepted patch plan"],
  ["build:storyboard-story-arc-regroup-plan", "freeze story-arc accepted regroup plan"],
  ["build:storyboard-motion-patch-plan", "freeze accepted motion patch plan"],
  ["apply:storyboard-stage2-draft-patches", "apply accepted Stage 2 patches"],
  ["apply:storyboard-story-arc-regroup-decisions", "apply accepted story-arc regroup decisions"],
  ["apply:storyboard-motion-patches", "apply accepted motion patches"],
  ["audit:storyboard-semantic-fill-rows", "semantic fill row audit"],
  ["audit:storyboard-layout-risk-before-render", "layout risk before render"],
  ["apply:storyboard-typography-director", "semantic typography director apply"],
  ["audit:storyboard-typography-director", "semantic typography director audit"],
  ["audit:storyboard-typography-render-contract", "typography render contract audit"],
  ["sync:storyboard-artwork-pipeline-status", "artwork pipeline status sync"],
  ["build:storyboard-motion-repeat-window-plan", "motion repeat-window plan"],
  ["build:storyboard-motion-patch-plan", "refresh motion patch plan after apply"],
  ["build:storyboard-production-dashboard-contract", "production dashboard contract"],
  ["build:intelligent-storyboard-gap-plan", "intelligent storyboard gap plan"],
];

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runStep(scriptName, label) {
  const started = Date.now();
  const output = execFileSync("npm", ["run", scriptName], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {...process.env},
  });
  return {
    scriptName,
    label,
    status: "PASS",
    durationMs: Date.now() - started,
    outputTail: output.trim().split("\n").slice(-8),
  };
}

function readSummaries() {
  const base = path.join(root, "apps/studio-next/public/generated/system-line");
  const stage2Plan = readJsonIfExists(path.join(base, "storyboard-stage2-draft-patch-plan-v1/report.json"));
  const regroupPlan = readJsonIfExists(path.join(base, "storyboard-story-arc-regroup-plan-v1/report.json"));
  const motionPlan = readJsonIfExists(path.join(base, "storyboard-motion-patch-plan-v1/report.json"));
  const stage2Applied = readJsonIfExists(path.join(base, "storyboard-stage2-draft-patches-applied-v1/report.json"));
  const regroupApplied = readJsonIfExists(path.join(base, "storyboard-story-arc-regroup-decisions-v1/report.json"));
  const motionApplied = readJsonIfExists(path.join(base, "storyboard-motion-patches-applied-v1/report.json"));
  const dashboard = readJsonIfExists(path.join(base, "storyboard-production-dashboard-contract-v1/report.json"));
  return {
    acceptedBeforeApply: {
      stage2: stage2Plan?.summary?.acceptedCount || 0,
      storyArc: regroupPlan?.summary?.acceptedCount || 0,
      motion: motionPlan?.summary?.acceptedCount || 0,
    },
    appliedAfterApply: {
      stage2: stage2Applied?.summary?.appliedOperationCount || 0,
      storyArc: regroupApplied?.summary?.appliedCount || 0,
      motion: motionApplied?.summary?.appliedCount || 0,
    },
    remainingReview: {
      total: dashboard?.summary?.reviewTaskCount || 0,
      buckets: dashboard?.summary?.reviewBuckets || {},
    },
    dashboardStatus: dashboard?.status || "missing",
  };
}

const startedAt = new Date().toISOString();
const results = [];
let status = "PASS";
let failure = null;

for (const [scriptName, label] of steps) {
  try {
    results.push(runStep(scriptName, label));
  } catch (error) {
    status = "FAIL";
    failure = {
      scriptName,
      label,
      status: "FAIL",
      error: error instanceof Error ? error.message : String(error),
      stdoutTail: String(error?.stdout || "").trim().split("\n").slice(-8),
      stderrTail: String(error?.stderr || "").trim().split("\n").slice(-8),
    };
    results.push(failure);
    break;
  }
}

const summaries = readSummaries();
const report = {
  contract: "A1StoryboardReviewApplyAcceptedWorkflow/v1",
  phaseId,
  status,
  startedAt,
  finishedAt: new Date().toISOString(),
  reviewOnly: true,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  summary: {
    stepCount: steps.length,
    completedStepCount: results.filter((item) => item.status === "PASS").length,
    failedStepCount: results.filter((item) => item.status === "FAIL").length,
    ...summaries,
  },
  results,
  failure,
  nextAction: status === "PASS"
    ? "review-remaining-storyboard-items-or-continue-webgpt-and-rendered-proof"
    : "fix-failed-review-apply-step-before-continuing",
};

writeJson(path.join(artifactRoot, "report.json"), report);
writeJson(path.join(publicRoot, "report.json"), report);

console.log(JSON.stringify({
  status: report.status,
  summary: report.summary,
  reportPath: path.relative(root, path.join(artifactRoot, "report.json")),
  publicReportPath: path.relative(root, path.join(publicRoot, "report.json")),
  nextAction: report.nextAction,
}, null, 2));

if (status !== "PASS") process.exit(1);
