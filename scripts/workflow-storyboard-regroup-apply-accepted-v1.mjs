#!/usr/bin/env node
/**
 * Apply accepted story-arc regroup items and refresh the compact storyboard state.
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-regroup-apply-accepted-workflow-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

const steps = [
  ["build:storyboard-story-arc-regroup-plan", "story-arc regroup plan"],
  ["build:storyboard-story-arc-regroup-dry-run-props", "story-arc regroup dry-run props"],
  ["apply:storyboard-story-arc-regroup-decisions", "apply accepted story-arc regroup decisions"],
  ["audit:storyboard-semantic-fill-rows", "semantic fill row audit"],
  ["audit:storyboard-layout-risk-before-render", "layout risk before render"],
  ["build:storyboard-production-dashboard-contract", "production dashboard contract"],
  ["build:intelligent-storyboard-gap-plan", "intelligent storyboard gap plan"],
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

const report = {
  contract: "A1StoryboardRegroupApplyAcceptedWorkflow/v1",
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
  },
  results,
  nextAction: status === "PASS"
    ? "review-dashboard-and-remaining-stage2-or-visual-items"
    : "fix-failed-regroup-workflow-step-before-continuing",
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
