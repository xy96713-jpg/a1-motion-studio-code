#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {assertPackagingParagraphAutoReviewProjection, buildPackagingParagraphAutoReviewProjection} from "../apps/studio-next/src/lib/a1-packaging-paragraph-auto-review-v1.mjs";
import {packagingParagraphCanaryLifecyclePaths, readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(projectRoot, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const executorPath = path.join(projectRoot, "scripts/execute-packaging-paragraph-canary-v1.mjs");
const runnerPath = path.join(projectRoot, "scripts/run-packaging-paragraph-auto-review-v1.mjs");
const base = {
  contract: "A1PackagingParagraphCanaryLifecycle/v1",
  version: 1,
  lifecycleSha256: "a".repeat(64),
  source: {planSha256: "b".repeat(64), requestPackSha256: "c".repeat(64), implementationSha256: "d".repeat(64)},
  evidence: {},
  boundary: {reviewOnly: true, productionAdmitted: false, workspaceMutationAllowed: false, userVisualApproval: "NOT_APPROVED", motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
};
const project = (status) => assertPackagingParagraphAutoReviewProjection(buildPackagingParagraphAutoReviewProjection({...base, status}));

const objective = project("STATIC_REVIEW_BATCH_READY_AWAITING_OBJECTIVE_AUDIT");
assert.equal(objective.status, "AUTO_OBJECTIVE_PIXEL_AUDIT_READY");
assert.equal(objective.currentAction.requiresUser, false);
assert.equal(objective.orchestration.objectivePixelAuditAutomatic, true);

const director = project("OBJECTIVE_PIXEL_PASS_AWAITING_VISUAL_DIRECTOR");
assert.equal(director.status, "AUTO_VISUAL_DIRECTOR_REVIEW_READY");
assert.equal(director.currentAction.actor, "visual-director-agent");
assert.equal(director.orchestration.machineGeneratedTasteVerdictAllowed, false);
assert.equal(director.orchestration.userPromptRequiredBeforeVisualDirectorAgentReview, false);

for (const status of ["OBJECTIVE_PIXEL_REPAIR_REQUIRED", "VISUAL_REPAIR_REQUIRED"]) {
  const repair = project(status);
  assert.equal(repair.status, "AUTO_REPAIR_SCOPE_PREPARATION_READY");
  assert.equal(repair.repairPolicy.scope, "FAILED_SHOTS_OR_FAILED_HANDOFFS_ONLY");
  assert.equal(repair.repairPolicy.repairPlanCompilationAutomatic, true);
  assert.equal(repair.repairPolicy.repairMediaDispatchAutomatic, false);
  assert.equal(repair.repairPolicy.repairGenerationAllowedWithoutHashBoundAuthorization, false);
  assert.equal(repair.repairPolicy.passedShotRegenerationAllowed, false);
  assert.equal(repair.repairPolicy.newShotExpansionAllowed, false);
}

const userGate = project("AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW");
assert.equal(userGate.status, "AWAITING_USER_FINAL_ACTUAL_PIXEL_DECISION");
assert.equal(userGate.currentAction.requiresUser, true);
assert.equal(userGate.approvalBoundary.agentRecommendationIsNotUserVisualApproval, true);
assert.equal(userGate.approvalBoundary.agentVisualApprovedWriteAllowed, false);

const workspaceBefore = fs.readFileSync(workspacePath);
const currentLifecycle = readPackagingParagraphCanaryLifecycle(path.join(projectRoot, "apps/studio-next"), {refresh: true});
const execution = readExecutionStatus(path.join(projectRoot, "apps/studio-next"));
const current = currentLifecycle ? assertPackagingParagraphAutoReviewProjection(buildPackagingParagraphAutoReviewProjection(currentLifecycle)) : null;
if (current) {
  assert.equal(current.source.lifecycleStatus, currentLifecycle.status);
  assert.equal(current.currentAction.automaticContinuation, current.currentAction.requiresUser === false);
  assert.ok(["WAITING_FOR_AUTHORIZED_GENERATION", "WAITING_FOR_BOUND_IMAGEGEN_RESULT", "AUTO_COMPOSITE_READY", "AUTO_OBJECTIVE_PIXEL_AUDIT_READY", "AUTO_VISUAL_DIRECTOR_REVIEW_READY", "AUTO_REPAIR_SCOPE_PREPARATION_READY", "AWAITING_USER_FINAL_ACTUAL_PIXEL_DECISION", "AUTO_REVIEW_INTEGRITY_BLOCKED", "CURRENT_CANDIDATE_REFERENCE_STALE", "READY_FOR_CURRENT_ACTUAL_PIXEL_REVIEW", "CURRENT_CANDIDATE_VISUAL_REPAIR_REQUIRED", "CURRENT_CANDIDATE_GENERATION_REQUIRED"].includes(current.status));
  assert.equal(current.approvalBoundary.userVisualApproval, "NOT_APPROVED");
} else {
  const paths = packagingParagraphCanaryLifecyclePaths(path.join(projectRoot, "apps/studio-next"));
  assert.ok(!fs.existsSync(paths.pack) || !fs.existsSync(paths.phase), "null paragraph lifecycle requires missing inputs");
  assert.equal(execution.packagingParagraphAutoReview, null);
  assert.equal(execution.effectiveAuthority.source.mode, "PERSISTED_BASE_ONLY");
  const persisted = execution.effectiveAuthority.persistedBaseAuthority;
  assert.ok(persisted.status && persisted.nextAction?.id);
  assert.equal(execution.status, persisted.status);
  assert.deepEqual(execution.nextAction, persisted.nextAction);
}
assert.equal(Buffer.compare(workspaceBefore, fs.readFileSync(workspacePath)), 0);

const executorSource = fs.readFileSync(executorPath, "utf8");
const runnerSource = fs.readFileSync(runnerPath, "utf8");
assert.match(executorSource, /run-packaging-paragraph-auto-review-v1\.mjs/u);
assert.match(executorSource, /packaging-paragraph-canary-auto-review-failed/u);
assert.ok(executorSource.indexOf("fs.renameSync(stagingRoot, reviewRoot)") < executorSource.indexOf("run-packaging-paragraph-auto-review-v1.mjs"));
assert.match(runnerSource, /audit-packaging-paragraph-objective-pixels-v1\.mjs/u);
assert.match(runnerSource, /READY_FOR_AUTOMATIC_AGENT_CONTINUATION/u);
assert.match(runnerSource, /failedShotIds/u);

console.log(JSON.stringify({status: "PASS", contract: objective.contract, objectiveAuditAutomatic: true, visualDirectorAgentContinuationAutomatic: true, machineTasteVerdictForbidden: true, failedItemsOnlyRepairPlanAutomatic: true, repairGenerationStillRequiresHashBoundAuthorization: true, userApprovalPreserved: true, currentLifecycleStatus: current?.source.lifecycleStatus || "INACTIVE_SUPERSEDED_BY_LATEST_VISUAL_BOARD", currentProjectionStatus: current?.status || execution.status, workspaceMutationPerformed: false}, null, 2));
