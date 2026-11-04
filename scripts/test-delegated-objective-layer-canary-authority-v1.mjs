#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phaseId = "editorial-asset-workbench-v1";
const publicPhase = path.join(appRoot, "public/generated/system-line", phaseId);
const artifactPhase = path.join(root, ".codex-artifacts/system-progress-system-line", phaseId);
const expectedWorkspaceSha256 = process.argv[2];
const expectedCanaryStatus = process.argv[3] || "THREE_SHOT_LAYER_CANARY_BLOCKED";
const expectedNextAction = expectedCanaryStatus === "THREE_SHOT_LAYER_CANARY_REVIEW" ? "EXPAND_REMAINING_TEN_PACKAGE_LAYERS" : "REPAIR_THREE_SHOT_LAYER_CANARY";

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("delegated-layer-canary-test-expected-workspace-sha-required");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const publicFile = (publicUrl) => path.join(appRoot, "public", String(publicUrl || "").replace(/^\//u, ""));

const publicWorkspaceFile = path.join(publicPhase, "workspace.json");
const artifactWorkspaceFile = path.join(artifactPhase, "workspace.json");
const publicWorkspace = readJson(publicWorkspaceFile);
const artifactWorkspace = readJson(artifactWorkspaceFile);
assert.equal(publicWorkspace.workspaceSha256, expectedWorkspaceSha256, "public-workspace-cas-mismatch");
assert.equal(artifactWorkspace.workspaceSha256, expectedWorkspaceSha256, "artifact-workspace-cas-mismatch");
assert.equal(fileSha256(publicWorkspaceFile), fileSha256(artifactWorkspaceFile), "workspace-public-artifact-byte-parity-failed");
assert.deepEqual(publicWorkspace, artifactWorkspace, "workspace-public-artifact-json-parity-failed");

const workspace = publicWorkspace;
const objective = workspace.production.objectiveVisualGate;
const board = workspace.production.shotIntelligence.wholeFilmStaticBoard;
const canary = workspace.production.shotIntelligence.threeShotLayerCanary;
const userGate = workspace.production.userVisualApprovalGate;
assert.equal(objective.contract, "A1DelegatedObjectiveVisualGate/v1");
assert.equal(objective.current, true);
assert.equal(objective.status, "SYSTEM_VISUAL_APPROVED_DELEGATED");
assert.equal(objective.hardRuleDisagreement, false);
assert.equal(objective.userVisualApproval, "NOT_APPROVED");
assert.equal(objective.packageBoardSha256, board.sha256);
assert.equal(objective.timelineBoardSha256, board.timelineBoard.sha256);
assert.equal(objective.selectedMasters.length, 13);
assert.equal(objective.selectedMasterSetSha256, sha256(objective.selectedMasters));
assert.equal(new Set(objective.selectedMasters.map((item) => item.shotId)).size, 13);
for (const item of board.items) {
  const selected = objective.selectedMasters.find((entry) => entry.shotId === item.shotId);
  assert.ok(selected, `objective-selected-master-missing:${item.shotId}`);
  assert.equal(selected.artifactSha256, item.artifactSha256, `objective-selected-master-sha-mismatch:${item.shotId}`);
  assert.equal(selected.artifactPublicUrl, item.artifactPublicUrl, `objective-selected-master-url-mismatch:${item.shotId}`);
  assert.equal(fileSha256(publicFile(item.artifactPublicUrl)), item.artifactSha256, `selected-master-file-sha-mismatch:${item.shotId}`);
}
assert.equal(fileSha256(publicFile(board.publicUrl)), board.sha256, "package-board-file-sha-mismatch");
assert.equal(fileSha256(publicFile(board.timelineBoard.publicUrl)), board.timelineBoard.sha256, "timeline-board-file-sha-mismatch");

assert.equal(userGate.legalApprovalFound, false);
assert.equal(userGate.userVisualApproval, "NOT_APPROVED");
assert.notEqual(userGate.status, "APPROVED");
assert.equal(userGate.blocksExternalRelease, true);
assert.equal(userGate.nextAction, "NONE_FOR_INTERNAL_CANARY");
assert.equal(workspace.production.authority.nextAction.id, expectedNextAction);
assert.equal(workspace.production.authority.nextAction.requiresUser, false);
assert.notEqual(workspace.production.authority.nextAction.id, "CONFIRM_WHOLE_FILM_STATIC_BOARD");
assert.notEqual(workspace.production.universalReferencePackagingGate.nextAction, "REBUILD_WHOLE_FILM_STATIC_BOARD");
assert.equal(workspace.production.universalReferencePackagingGate.nextAction, expectedNextAction);

assert.equal(workspace.production.shotIntelligence.status, expectedCanaryStatus);
assert.equal(canary.status, expectedCanaryStatus);
assert.equal(canary.layerCount, 12);
assert.equal(canary.itemCount, 3);
assert.equal(canary.items.length, 3);
assert.equal(canary.items.reduce((sum, item) => sum + item.layers.length, 0), 12);
assert.equal(canary.userVisualApproval, "NOT_APPROVED");
for (const item of canary.items) {
  assert.equal(item.layers.length, 4, `canary-four-layer-count-invalid:${item.shotId}`);
  assert.deepEqual(new Set(item.layers.map((layer) => layer.kind)), new Set(["BACKGROUND", "TYPOGRAPHY", "ELEMENT_KIT", "ILLUSTRATION"]), `canary-layer-kind-set-invalid:${item.shotId}`);
  for (const layer of item.layers) assert.equal(fileSha256(publicFile(layer.publicUrl)), layer.sha256, `canary-layer-file-sha-mismatch:${item.shotId}:${layer.kind}`);
  assert.equal(fileSha256(publicFile(item.recomposed.publicUrl)), item.recomposed.sha256, `canary-recompose-file-sha-mismatch:${item.shotId}`);
}
if (expectedCanaryStatus === "THREE_SHOT_LAYER_CANARY_BLOCKED") {
  assert.equal(canary.passCount, 2);
  assert.equal(canary.failureCount, 1);
  assert.deepEqual(canary.items.filter((item) => item.status === "FAIL").map((item) => item.shotId), ["ED-08"]);
  assert.ok(canary.failureCodes.includes("TYPOGRAPHY_PIXELS_LEAKED_INTO_ILLUSTRATION_LAYER"));
  assert.equal(canary.items.find((item) => item.shotId === "ED-14").sourceEvidenceIdentity.status, "PASS");
  assert.equal(canary.items.find((item) => item.shotId === "ED-31").originalPresenterIdentity.status, "PASS");
} else if (expectedCanaryStatus === "THREE_SHOT_LAYER_CANARY_REVIEW") {
  assert.equal(canary.passCount, 3);
  assert.equal(canary.failureCount, 0);
  assert.deepEqual(canary.failureCodes, []);
  assert.ok(canary.items.every((item) => item.status === "PASS"));
  const ed08 = canary.items.find((item) => item.shotId === "ED-08");
  const currentActualAudit = readJson(path.join(publicPhase, "three-shot-layer-canary-v1/actual-visual-audit.json"));
  const currentVisualReview = readJson(path.join(publicPhase, "three-shot-layer-canary-v1/visual-review-manifest.json"));
  assert.equal(currentActualAudit.contract, "A1MotionSafeThreeShotActualVisualAudit/v1");
  assert.equal(currentActualAudit.status, "PASS");
  assert.equal(currentActualAudit.authorityScope, "CURRENT");
  assert.equal(currentActualAudit.auditSha256, canary.actualVisualAuditSha256);
  assert.notEqual(currentActualAudit.sourceCanaryManifestSha256, canary.manifestSha256);
  assert.ok(fs.existsSync(path.join(publicPhase, `three-shot-layer-canary-v1/history/manifest-${currentActualAudit.sourceCanaryManifestSha256}.json`)), "actual-audit-source-canary-history-missing");
  assert.equal(currentActualAudit.sourceVisualReviewSha256, canary.visualReviewSha256);
  assert.equal(currentActualAudit.passCount, 3);
  assert.equal(currentActualAudit.failureCount, 0);
  assert.deepEqual(currentActualAudit.failureCodes, []);
  assert.equal(currentVisualReview.status, "PASS");
  assert.equal(currentVisualReview.reviewSha256, canary.visualReviewSha256);
  assert.ok(currentActualAudit.items.every((item) => item.actualPixelVisualInspection === "PASS" && item.semanticOwnershipStatus === "PASS" && item.cleanPlateStatus === "PASS" && item.motionExposureEnvelopeStatus === "PASS"));
  assert.equal(ed08.actualVisualAudit.semanticOwnershipStatus, "PASS");
  assert.equal(ed08.actualVisualAudit.cleanPlateStatus, "PASS");
  assert.equal(ed08.actualVisualAudit.motionExposureEnvelopeStatus, "PASS");
  assert.equal(ed08.actualVisualAudit.backgroundOcrObservationCount, 0);
  assert.equal(ed08.repairOutcome.status, "PASS");
  assert.equal(ed08.repairOutcome.attemptCount, 1);
  assert.equal(ed08.repairOutcome.imageGenerationPerformed, false);
  assert.ok(ed08.masterParity.fullFrameAgainstApprovedMaster.maximumChannelDifference <= 1);
  assert.ok(ed08.masterParity.fullFrameAgainstApprovedMaster.meanAbsoluteRgbDifference <= 0.1);
  assert.equal(canary.items.find((item) => item.shotId === "ED-14").sourceEvidenceIdentity.status, "PASS");
  assert.equal(canary.items.find((item) => item.shotId === "ED-31").originalPresenterIdentity.status, "PASS");
}

assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
assert.equal(workspace.production.shotIntelligence.packageAssemblyRecipes.filter((recipe) => recipe.current !== false && recipe.status !== "HISTORY_READ_ONLY" && recipe.authorityScope !== "HISTORY_READ_ONLY").length, 0);
assert.notEqual(workspace.production.assembly.status, "ASSEMBLY_REVIEW_REQUIRED");
assert.equal(workspace.production.assembly.status, "NOT_CREATED");
assert.equal(workspace.production.assembly.currentAssemblyCount, 0);
assert.equal(workspace.production.motion.status, "NOT_CREATED");
assert.equal(workspace.production.motion.representativePlan, null);
assert.equal(workspace.production.motion.previewArtifact, null);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.generation.automaticDispatchAllowed, false);

for (const relative of [
  "delegated-objective-layer-canary-authority-v1/migration.json",
  "three-shot-layer-canary-v1/manifest.json",
  "three-shot-layer-canary-v1/actual-visual-audit.json",
  "three-shot-layer-canary-v1/repair-manifest.json",
  "golden-film-visual-system-maturity-v1/maturity-run.json",
  "whole-film-static-board-v1/report.json",
]) {
  const publicFilePath = path.join(publicPhase, relative);
  const artifactFilePath = path.join(artifactPhase, relative);
  assert.ok(fs.existsSync(publicFilePath), `public-authority-file-missing:${relative}`);
  assert.ok(fs.existsSync(artifactFilePath), `artifact-authority-file-missing:${relative}`);
  assert.equal(fileSha256(publicFilePath), fileSha256(artifactFilePath), `authority-file-public-artifact-parity-failed:${relative}`);
}

const currentPhase = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json"));
const currentAuthority = readJson(path.join(root, ".codex-artifacts/system-progress-system-line/system-line-current-authority-v2/report.json"));
for (const current of [currentPhase, currentAuthority]) {
  assert.equal(current.status, expectedCanaryStatus, "current-authority-status-mismatch");
  assert.equal(current.reviewDecision.requiresExplicitApproval, false, "current-authority-requires-user-conflict");
  assert.equal(current.reviewDecision.userVisualApproval, "NOT_APPROVED", "current-authority-user-approval-fabricated");
  assert.equal(current.reviewDecision.maturityNextAction, expectedNextAction, "current-authority-next-action-mismatch");
}
assert.equal(currentPhase.next.recommended.id, expectedNextAction);
assert.equal(currentPhase.next.recommended.requiresExplicitApproval, false);
assert.equal(currentPhase.boardReview.status, "SYSTEM_VISUAL_APPROVED_DELEGATED");
assert.equal(currentPhase.boardReview.userVisualApproval, "NOT_APPROVED");
assert.equal(currentPhase.boardReview.packageBoardSha256, board.sha256);
assert.equal(currentPhase.boardReview.timelineBoardSha256, board.timelineBoard.sha256);

const response = await fetch("http://127.0.0.1:4311/api/system-line/editorial-asset-workbench");
assert.equal(response.status, 200, "live-api-http-status-invalid");
const api = await response.json();
assert.equal(api.workspace.workspaceSha256, expectedWorkspaceSha256, "live-api-workspace-sha-mismatch");
assert.equal(api.workspace.production.authority.nextAction.id, expectedNextAction, "live-api-next-action-mismatch");
assert.equal(api.workspace.production.authority.nextAction.requiresUser, false, "live-api-requires-user-conflict");
assert.equal(api.workspace.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED", "live-api-user-approval-fabricated");
assert.equal(api.workspace.production.shotIntelligence.currentAssembly.length, 0, "live-api-current-assembly-not-zero");
assert.equal(api.workspace.production.assembly.status, "NOT_CREATED", "live-api-assembly-status-invalid");
assert.equal(api.report.status, expectedCanaryStatus, "live-api-report-status-mismatch");
assert.equal(api.report.nextAction.id, expectedNextAction, "live-api-report-next-action-mismatch");
assert.equal(api.report.nextAction.requiresUser, false, "live-api-report-requires-user-conflict");
assert.equal(api.report.summary.actualLayerCandidateCount, 12, "live-api-layer-count-mismatch");
assert.equal(api.report.summary.currentAssemblyStatus, "NOT_CREATED", "live-api-current-assembly-status-invalid");
assert.equal(api.report.summary.threeShotLayerCanaryStatus, expectedCanaryStatus, "live-api-canary-status-mismatch");

console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: expectedWorkspaceSha256,
  objectiveVisualGateStatus: objective.status,
  userVisualApproval: objective.userVisualApproval,
  packageBoardSha256: board.sha256,
  timelineBoardSha256: board.timelineBoard.sha256,
  selectedMasterCount: objective.selectedMasters.length,
  canaryStatus: canary.status,
  canaryLayerCount: canary.layerCount,
  canaryPassCount: canary.passCount,
  canaryFailureCount: canary.failureCount,
  currentAssemblyCount: workspace.production.shotIntelligence.currentAssembly.length,
  currentAssemblyStatus: workspace.production.assembly.status,
  nextAction: expectedNextAction,
  requiresUser: false,
  queue: workspace.production.generation.summary,
  workerStatus: workspace.production.generation.workerStatus,
  liveApiParity: "PASS",
  publicArtifactParity: "PASS",
  staleConflictCount: 0,
}, null, 2));
