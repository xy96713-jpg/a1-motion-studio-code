#!/usr/bin/env node
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-text-motion-renderer-adoption-applied-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const planPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-renderer-adoption-plan-v1/report.json");
const patchOpsPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-renderer-adoption-plan-v1/renderer-source-adoption-patch-ops.json");
const candidatePropsPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-text-motion-renderer-adoption-plan-v1/candidate-microbeatLayeredFullProps.json");
const mainMp4Path = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/review-960x540-with-source-audio.mp4");
const mainManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-540p-review-mp4-v1/web-review-manifest.json");

const expected = {
  worktreeBasename: "a1-motion-studio-system-line",
  branch: "codex/system-maturity-line-20260722",
  visualMasterId: "july1-retro-print-archive-wireframe-v1",
};

const stableJson = (value) => JSON.stringify(value, null, 2);
const sha256String = (value) => createHash("sha256").update(value).digest("hex");
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function run(command, args) {
  try {
    return execFileSync(command, args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim();
  } catch {
    return "";
  }
}

function pointerGet(rootValue, pointer) {
  if (pointer === "") return rootValue;
  return pointer
    .split("/")
    .slice(1)
    .reduce((value, segment) => value?.[segment.replace(/~1/gu, "/").replace(/~0/gu, "~")], rootValue);
}

function pointerReplace(rootValue, pointer, nextValue) {
  const segments = pointer.split("/").slice(1).map((segment) => segment.replace(/~1/gu, "/").replace(/~0/gu, "~"));
  if (!segments.length) throw new Error("cannot-replace-root");
  const key = segments.pop();
  const parent = segments.reduce((value, segment) => value?.[segment], rootValue);
  if (!parent || key === undefined) throw new Error(`invalid-json-pointer:${pointer}`);
  parent[key] = nextValue;
}

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});

const failures = [];
for (const required of [propsPath, planPath, patchOpsPath, candidatePropsPath, mainMp4Path, mainManifestPath]) {
  if (!fs.existsSync(required)) failures.push(`required-file-missing:${path.relative(root, required)}`);
}

const worktreeBasename = path.basename(root);
const branch = run("git", ["branch", "--show-current"]);
const topLevel = run("git", ["rev-parse", "--show-toplevel"]);
if (worktreeBasename !== expected.worktreeBasename) failures.push(`wrong-worktree:${worktreeBasename}`);
if (branch !== expected.branch) failures.push(`wrong-branch:${branch || "unknown"}`);
if (topLevel !== root) failures.push(`wrong-git-top-level:${topLevel || "unknown"}`);

let plan = {};
let patchOps = {};
let sourceProps = {};
let candidateProps = {};
let mainManifest = {};
if (!failures.length) {
  plan = readJson(planPath);
  patchOps = readJson(patchOpsPath);
  sourceProps = readJson(propsPath);
  candidateProps = readJson(candidatePropsPath);
  mainManifest = readJson(mainManifestPath);

  if (plan.contract !== "A1HSeriesTextMotionRendererAdoptionPlan/v1" || plan.status !== "READY_FOR_EXPLICIT_APPROVAL") failures.push("adoption-plan-not-ready");
  if (plan.visualMasterId !== expected.visualMasterId) failures.push("visual-master-mismatch");
  if (plan.planOnly !== true || plan.applyAllowedBeforeExplicitApproval !== false) failures.push("adoption-plan-approval-lock-missing");
  if (patchOps.contract !== "A1HSeriesRendererSourceAdoptionPatchOps/v1") failures.push("patch-ops-contract-invalid");
  if (patchOps.locks?.applyAllowedBeforeExplicitApproval !== false || patchOps.locks?.finalRenderAllowed !== false || patchOps.locks?.resolveExportAllowed !== false) failures.push("patch-ops-locks-invalid");
}

const beforePropsSha256 = !failures.length ? sha256File(propsPath) : null;
const candidatePropsSha256 = !failures.length ? sha256File(candidatePropsPath) : null;
const beforeMainMp4Sha256 = fs.existsSync(mainMp4Path) ? sha256File(mainMp4Path) : null;

if (!failures.length) {
  if (beforePropsSha256 !== patchOps.sourcePropsSha256MustEqual) failures.push("source-props-sha-guard-mismatch");
  if (candidatePropsSha256 !== patchOps.candidatePropsSha256) failures.push("candidate-props-sha-guard-mismatch");
  if (beforeMainMp4Sha256 !== mainManifest.video?.sha256) failures.push("current-main-mp4-sha-mismatch-before-apply");
}

const appliedBeatIds = [];
let afterProps = !failures.length ? structuredClone(sourceProps) : {};
if (!failures.length) {
  for (const op of patchOps.operations || []) {
    if (op.op !== "replace") {
      failures.push(`unsupported-op:${op.op}`);
      continue;
    }
    if (op.currentMotionPlanSha256MustEqual) {
      const currentValue = pointerGet(afterProps, op.path);
      const currentValueSha256 = sha256String(stableJson(currentValue));
      if (currentValueSha256 !== op.currentMotionPlanSha256MustEqual) {
        failures.push(`motion-plan-guard-mismatch:${op.beatId}`);
        continue;
      }
      appliedBeatIds.push(op.beatId);
    }
    pointerReplace(afterProps, op.path, op.value);
  }
}

const afterJson = `${stableJson(afterProps)}\n`;
const candidateJson = !failures.length ? fs.readFileSync(candidatePropsPath, "utf8") : "";
if (!failures.length && afterJson !== candidateJson) failures.push("applied-props-do-not-match-candidate");

if (!failures.length) {
  fs.writeFileSync(propsPath, afterJson);
}

const afterPropsSha256 = fs.existsSync(propsPath) ? sha256File(propsPath) : null;
const afterMainMp4Sha256 = fs.existsSync(mainMp4Path) ? sha256File(mainMp4Path) : null;
const status = failures.length ? "FAIL" : "APPLIED";
const report = {
  contract: "A1HSeriesTextMotionRendererAdoptionApplied/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  visualMasterId: expected.visualMasterId,
  userContinuationTreatedAsApproval: true,
  sourcePropsModified: status === "APPLIED",
  sourcePropsPath: path.relative(root, propsPath),
  currentMainMp4Modified: false,
  refreshCurrent540pMp4Allowed: false,
  fullMp4RenderAllowed: false,
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  guards: {
    worktreeBasename: expected.worktreeBasename,
    branch: expected.branch,
    topLevel: root,
    beforePropsSha256MustEqual: patchOps.sourcePropsSha256MustEqual || null,
    candidatePropsSha256MustEqual: patchOps.candidatePropsSha256 || null,
  },
  source: {
    adoptionPlanPath: path.relative(root, planPath),
    adoptionPlanSha256: fs.existsSync(planPath) ? sha256File(planPath) : null,
    patchOpsPath: path.relative(root, patchOpsPath),
    patchOpsSha256: fs.existsSync(patchOpsPath) ? sha256File(patchOpsPath) : null,
    candidatePropsPath: path.relative(root, candidatePropsPath),
    candidatePropsSha256,
    currentMainMp4Path: path.relative(root, mainMp4Path),
    beforeMainMp4Sha256,
    afterMainMp4Sha256,
  },
  summary: {
    operationCount: Array.isArray(patchOps.operations) ? patchOps.operations.length : 0,
    appliedMotionPlanCount: appliedBeatIds.length,
    appliedBeatIds,
    beforePropsSha256,
    afterPropsSha256,
    afterPropsEqualsCandidate: afterPropsSha256 === candidatePropsSha256,
    currentMainMp4Unchanged: beforeMainMp4Sha256 === afterMainMp4Sha256,
    finalRenderStillLocked: true,
    resolveExportStillLocked: true,
  },
  failures,
  nextAction: failures.length ? "repair-renderer-source-adoption-apply-before-continuing" : "run-post-adoption-source-props-audit-before-refreshing-any-review-mp4",
};

fs.writeFileSync(reportPath, `${stableJson(report)}\n`);
fs.writeFileSync(publicReportPath, `${stableJson(report)}\n`);

console.log(JSON.stringify({
  status,
  summary: report.summary,
  reportPath: path.relative(root, reportPath),
  publicReportPath: path.relative(root, publicReportPath),
  failures,
  nextAction: report.nextAction,
}, null, 2));

if (status !== "APPLIED") process.exitCode = 2;
