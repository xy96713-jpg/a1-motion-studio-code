#!/usr/bin/env node
import {createHash} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  buildA1HSeriesGeneratedArtworkRepairAdoptionPlan,
  auditA1HSeriesGeneratedArtworkRepairAdoptionPlan,
} from "../apps/studio-next/src/lib/a1-h-series-generated-artwork-repair-adoption.mjs";

const root = process.cwd();
const phaseId = "h-series-generated-artwork-repair-adoption-v1";
const artifactRoot = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const publicRoot = path.join(root, "apps/studio-next/public/generated/system-line", phaseId);
const candidatePropsPath = path.join(root, ".codex-artifacts/system-progress-system-line/h-series-preproduction-motion-candidate-v1/candidate-props.json");
const resultManifestPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-artwork-repair-result-v1/report.json");
const resultReviewPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-artwork-repair-result-v1/review-decisions.json");
const executionPlanPath = path.join(root, "apps/studio-next/public/generated/system-line/h-series-generated-editorial-artwork-execution-plan-v1/report.json");
const reportPath = path.join(artifactRoot, "report.json");
const publicReportPath = path.join(publicRoot, "report.json");

const readJson = (file) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
const sha256File = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const candidateProps = readJson(candidatePropsPath);
const resultManifest = readJson(resultManifestPath);
const reviewLedger = readJson(resultReviewPath);
const executionPlan = readJson(executionPlanPath);
const plan = buildA1HSeriesGeneratedArtworkRepairAdoptionPlan({
  candidateProps,
  candidatePropsSha256: fs.existsSync(candidatePropsPath) ? sha256File(candidatePropsPath) : null,
  resultManifest,
  resultManifestSha256: fs.existsSync(resultManifestPath) ? sha256File(resultManifestPath) : null,
  reviewLedger,
  executionPlan,
});
const audit = auditA1HSeriesGeneratedArtworkRepairAdoptionPlan(plan);
if (audit.status !== "PASS") plan.failures = [...(plan.failures || []), ...audit.failures];
if (plan.status === "READY_FOR_EXPLICIT_APPROVAL" && plan.candidateProps) {
  const candidatePath = path.join(artifactRoot, "candidate-microbeatLayeredFullProps.json");
  fs.mkdirSync(path.dirname(candidatePath), {recursive: true});
  fs.writeFileSync(candidatePath, `${JSON.stringify(plan.candidateProps, null, 2)}\n`, "utf8");
  plan.candidatePropsPath = path.relative(root, candidatePath);
  plan.candidatePropsPublicUrl = `/generated/system-line/${phaseId}/candidate-microbeatLayeredFullProps.json`;
  plan.candidatePropsSha256 = sha256File(candidatePath);
  fs.mkdirSync(publicRoot, {recursive: true});
  fs.copyFileSync(candidatePath, path.join(publicRoot, "candidate-microbeatLayeredFullProps.json"));
}
fs.mkdirSync(artifactRoot, {recursive: true});
fs.mkdirSync(publicRoot, {recursive: true});
const json = `${JSON.stringify(plan, null, 2)}\n`;
fs.writeFileSync(reportPath, json, "utf8");
fs.writeFileSync(publicReportPath, json, "utf8");
console.log(JSON.stringify({status: plan.status, summary: plan.summary, failures: plan.failures, nextAction: plan.nextAction}, null, 2));
if (["FAIL", "BLOCKED_CANDIDATE_PROPS_MISSING", "BLOCKED_RESULT_MANIFEST_POLICY"].includes(plan.status)) process.exitCode = 2;
