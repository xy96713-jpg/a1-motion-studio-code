#!/usr/bin/env node
/**
 * Refresh all storyboard-table production state without rendering video.
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "storyboard-production-refresh-workflow-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);

const steps = [
  ["audit:storyboard-semantic-fill-rows", "semantic fill row audit"],
  ["audit:storyboard-layout-risk-before-render", "layout risk before render"],
  ["build:storyboard-story-arc-segmentation-contract", "story-arc segmentation contract"],
  ["build:storyboard-story-arc-regroup-plan", "story-arc regroup plan"],
  ["build:storyboard-story-arc-regroup-dry-run-props", "story-arc regroup dry-run props"],
  ["apply:storyboard-story-arc-regroup-decisions", "apply accepted story-arc regroup decisions"],
  ["audit:storyboard-semantic-fill-rows", "post-regroup semantic fill row audit"],
  ["audit:storyboard-layout-risk-before-render", "post-regroup layout risk before render"],
  ["workflow:storyboard-webgpt:prepare", "WebGPT artwork queue prepare"],
  ["sync:storyboard-artwork-pipeline-status", "artwork pipeline status sync"],
  ["build:storyboard-stage2-llm-contract", "Stage 2 LLM contract and queue"],
  ["produce:storyboard-stage2-llm-judgements", "Stage 2 local structured judgements"],
  ["import:storyboard-stage2-llm-judgements", "Stage 2 judgement import audit"],
  ["build:storyboard-stage2-draft-patch-plan", "Stage 2 draft patch plan"],
  ["apply:storyboard-typography-director", "semantic typography director apply"],
  ["audit:storyboard-typography-director", "semantic typography director audit"],
  ["audit:storyboard-typography-render-contract", "typography render contract audit"],
  ["generate:storyboard-type-art-plates", "editable SVG type-art plate generation"],
  ["audit:storyboard-hero-type-overlay", "transparent hero typography overlay audit"],
  ["audit:storyboard-large-typography-clean", "large typography clean overlay contract"],
  ["build:storyboard-motion-repeat-window-plan", "motion repeat-window plan"],
  ["build:storyboard-motion-patch-plan", "motion patch plan"],
  ["apply:storyboard-motion-patches", "apply accepted motion patches"],
  ["build:storyboard-intelligent-decision-trace", "intelligent per-shot decision trace"],
  ["build:storyboard-cross-project-srt-fixtures", "cross-project SRT fixtures"],
  ["audit:storyboard-cross-project-fixture-visual-quality", "cross-project fixture visual quality"],
  ["build:storyboard-production-dashboard-contract", "production dashboard contract"],
  ["audit:storyboard-ui-simplification-contract", "storyboard product-facing UI copy contract"],
  ["render:storyboard-representative-stills", "refresh representative storyboard card stills"],
  ["audit:storyboard-card-still-source-contract", "storyboard card still source contract"],
  ["audit:storyboard-visual-quality-sample", "storyboard visual quality sample"],
  ["audit:storyboard-motion-temporal-proof", "storyboard motion temporal proof"],
  ["audit:storyboard-aesthetic-v2-contract", "storyboard aesthetic v2 contract"],
  ["capture:storyboard-ui-visual-proof", "storyboard UI visual proof"],
  ["build:storyboard-production-dashboard-contract", "final production dashboard contract"],
  ["build:intelligent-storyboard-gap-plan", "intelligent storyboard gap plan"],
  ["audit:storyboard-objective-readiness", "objective-level storyboard readiness audit"],
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
  contract: "A1StoryboardProductionRefreshWorkflow/v1",
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
    ? "use-dashboard-primary-next-action-or-review-stage2-and-regroup-items"
    : "fix-failed-refresh-step-before-continuing",
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
