import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "a1-system-line-performance-test-"));
const artifactRoot = path.join(tempRoot, ".codex-artifacts", "system-progress-system-line");
const workspaceDir = path.join(artifactRoot, "editorial-asset-workbench-v1");
const criticDir = path.join(workspaceDir, "generated-visual-composite-critic-cache-v2");
fs.mkdirSync(criticDir, {recursive: true});
fs.mkdirSync(path.join(artifactRoot, "system-line-current-authority-v2"), {recursive: true});
fs.writeFileSync(path.join(workspaceDir, "workspace.json"), JSON.stringify({
  updatedAt: "2026-08-03T00:00:00.000Z",
  summary: {assetCount: 10, approvedCount: 8, shotSlotCount: 2, queuedJobCount: 0, runningJobCount: 0},
  gates: {shotCompositionAllowed: false},
  production: {
    eventLedger: {eventCount: 21},
    nextAction: "多数方向两轮后仍未达到 22/24：停止生图，先重写 treatment compositor",
    generation: {workerStatus: "idle", automaticDispatchAllowed: false, jobs: [
      {status: "complete", durationMs: 70000},
      {status: "complete", durationMs: 120000},
      {status: "failed", durationMs: null},
    ]},
    automationPolicy: {automaticCandidateAdmission: true, intermediateUserApprovalRequired: true, calibrationUserApprovalRequired: true},
    autopilot: {critic: {automaticApprovalAllowed: false}},
    authority: {visualTreatmentAudit: {compositorRewriteRequired: true, averageScore: 14.5}},
  },
}, null, 2));
fs.writeFileSync(path.join(artifactRoot, "system-line-current-authority-v2", "report.json"), JSON.stringify({
  generatedAt: "2026-08-03T00:00:00.000Z",
  nextAction: {id: "visual-treatment-compositor-rewrite-required", label: "rewrite compositor"},
}, null, 2));
const result = spawnSync(process.execPath, [path.join(root, "scripts", "audit-system-line-performance-v1.mjs"), tempRoot], {encoding: "utf8"});
assert.equal(result.status, 0, result.stderr || result.stdout);
const report = JSON.parse(fs.readFileSync(path.join(artifactRoot, "performance-audit-v1", "report.json"), "utf8"));
assert.equal(report.contract, "A1SystemLinePerformanceAudit/v1");
assert.equal(report.status, "BLOCK");
assert.ok(report.findings.some((finding) => finding.code === "automatic-admission-contradiction"));
assert.ok(report.findings.some((finding) => finding.code === "compositor-is-bottleneck"));
assert.equal(report.observed.generation.completedJobs, 2);
assert.equal(report.observed.automation.candidateAdmissionIsNotVisualApproval, true);
assert.equal("automaticApprovalAllowed" in report.observed.automation, false);
fs.rmSync(tempRoot, {recursive: true, force: true});
console.log("A1 system-line performance audit PASS");
