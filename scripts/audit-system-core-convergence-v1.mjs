#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const progressRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1");
const phasePath = path.join(progressRoot, "current-phase.json");
const auditPath = path.join(progressRoot, "system-line-current-authority-v2/audit-report.json");
const summaryPath = path.join(progressRoot, "editorial-asset-workbench-v1/shot-motion-review-v1/current-summary.json");
const artifactPath = path.join(progressRoot, "system-core-v1/current.json");
const publicPath = path.join(publicRoot, "system-core-v1/current.json");
const handoffPath = path.join(root, "HANDOFF-CURRENT.md");
const lifecycleBadgePath = path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/SystemLifecycleBadge.tsx");
const resultPath = path.join(root, "work/system-core-convergence-v1/result.json");
const writeResult = process.argv.includes("--write");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const failures = [];
for (const [id, file] of [["phase", phasePath], ["authority", auditPath], ["shot-summary", summaryPath]]) {
  if (!fs.existsSync(file)) failures.push(`SOURCE_MISSING:${id}`);
}

let observed = null;
let persistedStageOverstatesMotionReadiness = false;
let persistedActionCountMismatch = false;
if (!failures.length) {
  const phase = read(phasePath);
  const audit = read(auditPath);
  const summary = read(summaryPath);
  const effective = audit.effectiveReviewAuthority || {};
  const motionAllowed = effective.boundary?.motionAllowed === true;
  observed = {
    workspaceSha256: phase.authority?.workspaceSha256 || null,
    persistedStage: phase.authority?.currentStage || null,
    persistedStatus: phase.status || null,
    persistedNextAction: phase.authority?.nextAction || phase.next?.recommended || null,
    motionAllowed,
    counts: summary.counts || {},
  };
  persistedStageOverstatesMotionReadiness = phase.status === "MOTION_READY" && !motionAllowed;
  const action = observed.persistedNextAction;
  persistedActionCountMismatch = /15/u.test(String(action?.label || "")) && (action?.targetShotIds || []).length !== 15;
}

let current = null;
let currentProjectionUsable = false;
if (!fs.existsSync(artifactPath) || !fs.existsSync(publicPath)) {
  failures.push("NORMALIZED_CURRENT_PROJECTION_MISSING");
} else {
  if (sha(artifactPath) !== sha(publicPath)) failures.push("CURRENT_PROJECTION_PUBLIC_ARTIFACT_MISMATCH");
  current = read(artifactPath);
  if (current.contract !== "A1SystemLineLifecycleProjection/v1" || current.status === "PASS" || !current.stage?.id || !current.nextAction?.id) failures.push("CURRENT_PROJECTION_INVALID");
  if (observed?.workspaceSha256 && current.source?.workspaceSha256 !== observed.workspaceSha256) failures.push("CURRENT_PROJECTION_STALE");
  if (current.stage?.id === "motion-review" && current.gates?.motionAllowed !== true) failures.push("NORMALIZED_STAGE_OVERSTATES_MOTION_READINESS");
  currentProjectionUsable = current.contract === "A1SystemLineLifecycleProjection/v1"
    && current.source?.workspaceSha256 === observed?.workspaceSha256;
  if (currentProjectionUsable && current.diagnostics?.persistedStageOverstatesMotionReadiness !== persistedStageOverstatesMotionReadiness) failures.push("PERSISTED_STAGE_DIAGNOSTIC_MISMATCH");
  if (currentProjectionUsable && current.diagnostics?.persistedActionCountMismatch !== persistedActionCountMismatch) failures.push("PERSISTED_ACTION_DIAGNOSTIC_MISMATCH");
}
if (!currentProjectionUsable && persistedStageOverstatesMotionReadiness) failures.push("PERSISTED_STATUS_OVERSTATES_MOTION_READINESS");
if (!currentProjectionUsable && persistedActionCountMismatch) failures.push("ACTION_LABEL_TARGET_COUNT_MISMATCH");

const fast = spawnSync(process.execPath, [path.join(root, "scripts/fast-current-authority-summary-v1.mjs")], {
  cwd: root,
  encoding: "utf8",
  timeout: 5000,
  maxBuffer: 200000,
});
if (fast.status !== 0) {
  failures.push("FAST_STATUS_COMMAND_FAILED");
} else {
  const fastStatus = JSON.parse(fast.stdout);
  if (currentProjectionUsable && fastStatus.lifecycle?.projectionSha256 !== current?.projectionSha256) failures.push("FAST_STATUS_IGNORES_CURRENT_LIFECYCLE");
  if (currentProjectionUsable && (fastStatus.phase?.status !== current?.status || fastStatus.phase?.currentStage !== current?.stage?.id)) failures.push("FAST_STATUS_EXPOSES_PERSISTED_STAGE");
}

const lifecycleTest = spawnSync(process.execPath, [path.join(root, "scripts/test-system-line-lifecycle-v1.mjs")], {
  cwd: root,
  encoding: "utf8",
  timeout: 5000,
  maxBuffer: 200000,
});
let results = [];
if (lifecycleTest.status !== 0) {
  failures.push("LIFECYCLE_FIXTURE_TEST_FAILED");
} else {
  results = JSON.parse(lifecycleTest.stdout).results || [];
}

const handoff = fs.existsSync(handoffPath) ? fs.readFileSync(handoffPath, "utf8") : "";
if (!handoff.includes("system-core-v1/current.json") || /ED-06\/29\/30|three timing holds/iu.test(handoff)) failures.push("HANDOFF_EMBEDS_STALE_DYNAMIC_STATE");
const lifecycleBadge = fs.existsSync(lifecycleBadgePath) ? fs.readFileSync(lifecycleBadgePath, "utf8") : "";
if (!lifecycleBadge.includes("A1SystemLineLifecycleProjection/v1") || !lifecycleBadge.includes("data-a1-system-lifecycle-stage")) failures.push("WORKBENCH_LIFECYCLE_PROJECTION_MISSING");

const report = {
  contract: "A1SystemCoreConvergenceAudit/v1",
  status: failures.length ? "FAIL" : "PASS",
  observed,
  results,
  userVisible: {
    route: "http://127.0.0.1:4311/system-line-visual-workbench",
    stageLabel: current?.stage?.label || null,
    nextActionLabel: current?.nextAction?.label || null,
  },
  failures,
  checkedAt: new Date().toISOString(),
};
if (writeResult) {
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
