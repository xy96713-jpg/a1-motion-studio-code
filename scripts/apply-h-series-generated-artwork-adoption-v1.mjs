#!/usr/bin/env node
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const phaseId = "h-series-generated-artwork-adoption-applied-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");
const propsPath = path.join(root, "remotion-renderer/src/generated/microbeatLayeredFullProps.json");
const planPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-generated-artwork-adoption-plan-v1/report.json");
const candidatePropsPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-generated-artwork-adoption-plan-v1/candidate-microbeatLayeredFullProps.json");
const rendererPublic = path.join(root, "remotion-renderer/public");
const expected = {worktreeBasename: "a1-motion-studio-system-line", branch: "codex/system-maturity-line-20260722", visualMasterId: "july1-retro-print-archive-wireframe-v1"};

const stableJson = (value) => JSON.stringify(value, null, 2);
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const run = (command, args) => {
  try { return execFileSync(command, args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim(); }
  catch { return ""; }
};

fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
const failures = [];
for (const required of [propsPath, planPath, candidatePropsPath]) if (!fs.existsSync(required)) failures.push(`required-file-missing:${path.relative(root, required)}`);

const worktreeBasename = path.basename(root);
const branch = run("git", ["branch", "--show-current"]);
const topLevel = run("git", ["rev-parse", "--show-toplevel"]);
if (worktreeBasename !== expected.worktreeBasename) failures.push(`wrong-worktree:${worktreeBasename}`);
if (branch !== expected.branch) failures.push(`wrong-branch:${branch || "unknown"}`);
if (topLevel !== root) failures.push(`wrong-git-top-level:${topLevel || "unknown"}`);

let plan = {};
let candidateProps = {};
if (!failures.length) {
  plan = readJson(planPath);
  candidateProps = readJson(candidatePropsPath);
  if (plan.contract !== "A1HSeriesGeneratedArtworkAdoptionPlan/v1" || plan.status !== "READY_FOR_EXPLICIT_APPROVAL") failures.push("adoption-plan-not-ready");
  if (plan.visualMasterId !== expected.visualMasterId || plan.projectId !== "july1-writing-workbench") failures.push("adoption-plan-project-or-master-mismatch");
  if (plan.guards?.sourcePropsSha256MustEqual !== sha256File(propsPath)) failures.push("source-props-sha-guard-mismatch");
  if (plan.candidateProps?.sha256 !== sha256File(candidatePropsPath)) failures.push("candidate-props-sha-guard-mismatch");
  if (candidateProps.contract !== "A1MicrobeatLayeredFullPlan/v1" || candidateProps.projectId !== plan.projectId) failures.push("candidate-props-invalid");
}

const copiedAssets = [];
if (!failures.length) {
  for (const item of plan.adoptionItems || []) {
    const source = path.join(root, item.sourceAsset);
    const destination = path.join(rendererPublic, item.rendererAsset);
    if (!fs.existsSync(source) || sha256File(source) !== item.sourceSha256) {
      failures.push(`source-asset-sha-mismatch:${item.beatId}`);
      continue;
    }
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    fs.copyFileSync(source, destination);
    if (sha256File(destination) !== item.sourceSha256) failures.push(`renderer-asset-copy-mismatch:${item.beatId}`);
    copiedAssets.push({beatId: item.beatId, source: item.sourceAsset, destination: item.rendererAsset, sha256: item.sourceSha256});
  }
}

const beforePropsSha256 = fs.existsSync(propsPath) ? sha256File(propsPath) : null;
const backupPath = path.join(artifactRoot, `before-${beforePropsSha256 || "missing"}-microbeatLayeredFullProps.json`);
if (!failures.length) {
  fs.copyFileSync(propsPath, backupPath);
  fs.writeFileSync(propsPath, `${stableJson(candidateProps)}\n`);
}
const afterPropsSha256 = fs.existsSync(propsPath) ? sha256File(propsPath) : null;
if (!failures.length && afterPropsSha256 !== plan.candidateProps.sha256) failures.push("applied-props-do-not-match-candidate");

const status = failures.length ? "FAIL" : "APPLIED";
const report = {
  contract: "A1HSeriesGeneratedArtworkAdoptionApplied/v1",
  phaseId,
  status,
  generatedAt: new Date().toISOString(),
  projectId: plan.projectId || null,
  visualMasterId: plan.visualMasterId || null,
  userContinuationTreatedAsApproval: true,
  sourcePropsModified: status === "APPLIED",
  currentReviewMp4Modified: false,
  reviewMp4RefreshRequired: status === "APPLIED",
  finalRenderAllowed: false,
  resolveExportAllowed: false,
  sourcePropsPath: path.relative(root, propsPath),
  backupPath: fs.existsSync(backupPath) ? path.relative(root, backupPath) : null,
  summary: {
    adoptedAssetCount: plan.summary?.adoptedAssetCount || 0,
    deferredAssetCount: plan.summary?.deferredAssetCount || 0,
    copiedAssetCount: copiedAssets.length,
    beforePropsSha256,
    afterPropsSha256,
    afterPropsEqualsCandidate: afterPropsSha256 === plan.candidateProps?.sha256,
    everyGeneratedAssetHasDisposition: plan.policy?.everyGeneratedAssetHasDisposition === true,
  },
  copiedAssets,
  failures,
  nextAction: failures.length ? "repair-generated-artwork-adoption-apply" : "render-refreshed-540p-candidate-and-audit-visible-placement",
};
fs.writeFileSync(reportPath, `${stableJson(report)}\n`);
fs.writeFileSync(publicReportPath, `${stableJson(report)}\n`);
console.log(JSON.stringify({status, summary: report.summary, failures, nextAction: report.nextAction}, null, 2));
if (failures.length) process.exitCode = 2;
