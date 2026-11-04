#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {resolveActiveWorkSelectionV1} from "../apps/studio-next/src/lib/a1-active-work-selection-v1.mjs";
import {readRegisteredResearchProgressV1} from "./lib/project-research-progress-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const progressRoot = path.join(root, ".codex-artifacts/system-progress-system-line");
const currentRoot = path.join(progressRoot, "current-storyboard-production-v1");
const startedAt = new Date().toISOString();
const start = process.hrtime.bigint();
const reads = [];
const readJson = (file) => {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  reads.push({file: path.relative(root, file), bytes: Buffer.byteLength(text)});
  return JSON.parse(text);
};
const phase = readJson(path.join(progressRoot, "current-phase.json"));
const audit = readJson(path.join(progressRoot, "system-line-current-authority-v2/audit-report.json"));
const lifecycle = readJson(path.join(progressRoot, "system-core-v1/current.json"));
const candidate = readJson(path.join(currentRoot, "packaging-paragraph-canary-current-candidate-reference.json"));
const review = readJson(path.join(currentRoot, "packaging-paragraph-canary-current-candidate-review.json"));
const sourceProof = readJson(path.join(progressRoot, "editorial-asset-workbench-v1/source-proof-lanes/ed02-real-writing-workbench/lane.json"));
const shotReview = readJson(path.join(progressRoot, "editorial-asset-workbench-v1/shot-motion-review-v1/current-summary.json"));
const parkRecord = readJson(path.join(root, "work/system-maturity-consolidation-park-a-line-20260928.json"));
const researchPhase = readJson(path.join(root, ".codex-artifacts/system-progress/current-phase.json"));
const activePlanPath = parkRecord?.activeLine?.planPath;
const activeRuntimePath = parkRecord?.activeLine?.runtimeStatePath;
const workSelection = resolveActiveWorkSelectionV1({parkRecord, researchPhase, formalPhase: phase,
  planExists: /^work\/[a-z0-9-]+\/shot-task-plan-v1\.json$/u.test(activePlanPath || "")
    && fs.existsSync(path.join(root, activePlanPath)),
  runtimeExists: /^work\/[a-z0-9-]+\/runtime\//u.test(activeRuntimePath || "")
    && !activeRuntimePath.split("/").some((part) => part === ".." || part === ".")
    && fs.existsSync(path.join(root, activeRuntimePath))});
let activeResearchProgress = null;
if (workSelection.status === "PASS") {
  try {
    activeResearchProgress = readRegisteredResearchProgressV1({root, taskId: workSelection.active.taskId, reads});
  } catch (error) {
    activeResearchProgress = {status: "RESEARCH_PROGRESS_UNAVAILABLE", error: error.message,
      taskId: workSelection.active.taskId, dispatchAuthorized: false};
  }
}
const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
const observability = {startedAt, finishedAt: new Date().toISOString(), elapsedMs: Number(elapsedMs.toFixed(3)), budgetMs: 1000, overBudget: elapsedMs > 1000, filesRead: reads.length, bytesRead: reads.reduce((total, item) => total + item.bytes, 0), recursiveScan: false, mediaScan: false, readMode: "EXACT_CURRENT_PATHS_ONLY"};
if (!phase || !audit) {
  console.log(JSON.stringify({status: "AUTHORITY_UNAVAILABLE", observability, reads}, null, 2));
  process.exitCode = 2;
} else {
  const effective = audit.effectiveReviewAuthority || {};
  const effectiveActionId = effective.nextAction?.id || null;
  const persistedActionId = phase.authority?.nextAction?.id || phase.next?.recommended?.id || null;
  const phaseWorkspaceSha256 = phase.authority?.workspaceSha256 || null;
  const auditWorkspaceSha256 = audit.authority?.workspaceSha256 || null;
  const auditWorkspaceCurrent = Boolean(
    phaseWorkspaceSha256
    && auditWorkspaceSha256
    && phaseWorkspaceSha256 === auditWorkspaceSha256,
  );
  const lifecycleWorkspaceCurrent = Boolean(
    lifecycle?.contract === "A1SystemLineLifecycleProjection/v1"
    && lifecycle?.source?.workspaceSha256
    && lifecycle.source.workspaceSha256 === phaseWorkspaceSha256
    && lifecycle.source.workspaceSha256 === auditWorkspaceSha256,
  );
  const warnings = [];
  const effectiveOverrideActive = effective.source?.mode && effective.source.mode !== "PERSISTED_BASE_ONLY";
  if (!auditWorkspaceCurrent) warnings.push("authority-audit-workspace-stale");
  if (!lifecycleWorkspaceCurrent) warnings.push("system-lifecycle-projection-missing-or-stale");
  if (workSelection.status !== "PASS") warnings.push("active-work-selection-blocked");
  if (activeResearchProgress?.status === "RESEARCH_PROGRESS_UNAVAILABLE") warnings.push("active-research-progress-unavailable");
  if (effective.status === "CURRENT_CANDIDATE_GENERATION_REQUIRED" && effectiveActionId !== "GENERATE_NEW_CURRENT_CANDIDATE") warnings.push("generation-status-action-mismatch");
  if (auditWorkspaceCurrent && !effectiveOverrideActive && effectiveActionId && persistedActionId && effectiveActionId !== persistedActionId) warnings.push("effective-action-differs-from-persisted-base");
  const consistencyStatus = !auditWorkspaceCurrent ? "STALE_AUDIT" : warnings.length ? "WARN" : effectiveOverrideActive && effectiveActionId !== persistedActionId ? "EFFECTIVE_OVERRIDE_ACTIVE" : "PASS";
  const legacyCurrentAction = auditWorkspaceCurrent && (effectiveOverrideActive || effectiveActionId === persistedActionId)
    ? effective.nextAction || phase.authority?.nextAction || phase.next?.recommended || null
    : phase.authority?.nextAction || phase.next?.recommended || null;
  const currentAction = lifecycleWorkspaceCurrent ? lifecycle.nextAction : legacyCurrentAction;
  const currentStatus = lifecycleWorkspaceCurrent ? lifecycle.status : auditWorkspaceCurrent ? effective.status || phase.status || null : phase.status || null;
  const currentStage = lifecycleWorkspaceCurrent ? lifecycle.stage?.id || null : auditWorkspaceCurrent ? effective.currentStage || phase.authority?.currentStage || null : phase.authority?.currentStage || null;
  const status = workSelection.status !== "PASS" ? "ACTIVE_WORK_SELECTION_BLOCKED"
    : auditWorkspaceCurrent && audit.status !== "PASS" ? "AUTHORITY_BLOCKED" : "PASS";
  console.log(JSON.stringify({status, readMode: "HOT_PATH_ONLY_NO_WORKSPACE_READ_NO_MEDIA_SCAN", observability, reads, consistency: {status: consistencyStatus, warnings, auditWorkspaceCurrent, lifecycleWorkspaceCurrent, phaseWorkspaceSha256, auditWorkspaceSha256, effectiveOverrideActive: auditWorkspaceCurrent && Boolean(effectiveOverrideActive), effectiveSourceMode: effective.source?.mode || "PERSISTED_BASE_ONLY", effectiveActionId: auditWorkspaceCurrent ? effectiveActionId : null, staleAuditActionId: auditWorkspaceCurrent ? null : effectiveActionId, persistedActionId}, lifecycle: lifecycleWorkspaceCurrent ? {status: lifecycle.status, stage: lifecycle.stage, nextAction: lifecycle.nextAction, readyUserGates: lifecycle.readyUserGates || [], availableActions: lifecycle.availableActions || [], lanes: lifecycle.lanes || null, blockers: lifecycle.blockers, gates: lifecycle.gates, diagnostics: lifecycle.diagnostics, projectionSha256: lifecycle.projectionSha256} : {status: "MISSING_OR_STALE"}, phase: {status: currentStatus, currentStage, workspaceSha256: phaseWorkspaceSha256, persistedStatus: phase.status || null, persistedStage: phase.authority?.currentStage || null}, authority: {auditStatus: auditWorkspaceCurrent ? audit.status || null : "STALE", generatedAt: audit.generatedAt || null, effectiveNextAction: currentAction, effectiveStatus: currentStatus, effectiveStage: currentStage, persistedBaseNextAction: phase.authority?.nextAction || phase.next?.recommended || null, failures: auditWorkspaceCurrent ? audit.failures || [] : ["authority-audit-workspace-stale"]}, workSelection, activeResearchProgress, currentWork: shotReview?.workspaceSha256 === phaseWorkspaceSha256 ? {counts: shotReview.counts, readyForReview: shotReview.readyForReview, requiresSource: shotReview.requiresSource, unifiedProduction: shotReview.unifiedProduction || null} : {status: "NO_CURRENT_SHOT_REVIEW_SUMMARY"}, currentCandidate: candidate ? {scope: "PACKAGING_PARAGRAPH_LANE_ONLY", status: candidate.status || null, referenceSha256: candidate.referenceSha256 || null, candidateRevision: candidate.candidateRevision?.revisionId || null, artifactCount: candidate.artifacts?.length || 0, reviewStatus: review?.status || null, reviewSha256: review?.reviewSha256 || null} : {scope: "PACKAGING_PARAGRAPH_LANE_ONLY", status: "NO_CURRENT_REFERENCE"}, sourceProof: sourceProof ? {status: sourceProof.status || null, laneId: sourceProof.laneId || null, shotId: sourceProof.shotId || null, laneSha256: sourceProof.laneSha256 || null} : {status: "NO_CURRENT_SOURCE_PROOF_LANE"}}, null, 2));
}
