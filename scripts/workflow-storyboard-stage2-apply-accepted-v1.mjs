#!/usr/bin/env node
/**
 * Apply explicitly accepted Stage 2 drafts, then refresh non-rendering gates.
 * This workflow never accepts drafts by itself and never renders a full MP4.
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-stage2-apply-accepted-workflow-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

const steps = [
  ["build:storyboard-stage2-draft-patch-plan", "build accepted Stage 2 patch plan"],
  ["apply:storyboard-stage2-draft-patches", "apply accepted Stage 2 patches"],
  ["apply:storyboard-typography-director", "refresh typography director after semantic patch"],
  ["audit:storyboard-semantic-fill-rows", "semantic fill row audit"],
  ["audit:storyboard-layout-risk-before-render", "layout risk before render"],
  ["audit:storyboard-typography-director", "typography director audit"],
  ["audit:storyboard-typography-render-contract", "typography render contract audit"],
  ["sync:storyboard-artwork-pipeline-status", "artwork pipeline status sync"],
  ["build:storyboard-production-dashboard-contract", "production dashboard contract"],
  ["build:intelligent-storyboard-gap-plan", "intelligent storyboard gap plan"],
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonIfExists(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

const startedAt = new Date().toISOString();
const results = [];
let status = "PASS";

for (const [scriptName, label] of steps) {
  const stepStarted = Date.now();
  try {
    const output = execFileSync("npm", ["run", scriptName], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {...process.env},
    });
    results.push({
      scriptName,
      label,
      status: "PASS",
      durationMs: Date.now() - stepStarted,
      outputTail: output.trim().split("\n").slice(-8),
    });
  } catch (error) {
    status = "FAIL";
    results.push({
      scriptName,
      label,
      status: "FAIL",
      durationMs: Date.now() - stepStarted,
      error: error instanceof Error ? error.message : String(error),
      stdoutTail: String(error?.stdout || "").trim().split("\n").slice(-8),
      stderrTail: String(error?.stderr || "").trim().split("\n").slice(-8),
    });
    break;
  }
}

const applyReportPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patches-applied-v1/report.json");
const patchPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patch-plan-v1/report.json");
const dashboardPath = path.join(root, "apps/studio-next/public/generated/system-line/storyboard-production-dashboard-contract-v1/report.json");
const gapPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/intelligent-storyboard-gap-plan-v1/report.json");
const applyReport = readJsonIfExists(applyReportPath);
const patchPlan = readJsonIfExists(patchPlanPath);
const dashboard = readJsonIfExists(dashboardPath);
const gapPlan = readJsonIfExists(gapPlanPath);

const report = {
  contract: "A1StoryboardStage2ApplyAcceptedWorkflow/v1",
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
    candidateCount: patchPlan?.summary?.candidateCount || 0,
    acceptedCount: patchPlan?.summary?.acceptedCount || 0,
    rejectedCount: patchPlan?.summary?.rejectedCount || 0,
    pendingCount: patchPlan?.summary?.pendingCount || 0,
    appliedOperationCount: applyReport?.summary?.appliedOperationCount || 0,
    dashboardStatus: dashboard?.status || "missing",
    gapPlanStatus: gapPlan?.status || "missing",
  },
  reports: {
    patchPlanPath: "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patch-plan-v1/report.json",
    applyReportPath: "apps/studio-next/public/generated/system-line/storyboard-stage2-draft-patches-applied-v1/report.json",
    dashboardPath: "apps/studio-next/public/generated/system-line/storyboard-production-dashboard-contract-v1/report.json",
    gapPlanPath: "apps/studio-next/public/generated/system-line/intelligent-storyboard-gap-plan-v1/report.json",
  },
  results,
  nextAction: status === "PASS"
    ? (applyReport?.summary?.appliedOperationCount ? "review-refreshed-storyboard-after-stage2-application" : "accept-or-reject-stage2-candidates-in-storyboard-ui")
    : "fix-failed-stage2-apply-workflow-step",
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
