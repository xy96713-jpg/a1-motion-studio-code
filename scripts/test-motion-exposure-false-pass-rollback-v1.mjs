#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const phase = "editorial-asset-workbench-v1";
const publicDir = path.join(appRoot, "public/generated/system-line", phase);
const artifactDir = path.join(root, ".codex-artifacts/system-progress-system-line", phase);
const expectedWorkspaceSha256 = process.argv[2];
const failureCode = "MOTION_EXPOSURE_GHOST_CONTAMINATION";
const targetShotIds = ["ED-08", "ED-14", "ED-31"];

if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-exposure-rollback-test-workspace-sha-required");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const publicWorkspaceFile = path.join(publicDir, "workspace.json");
const artifactWorkspaceFile = path.join(artifactDir, "workspace.json");
const workspace = readJson(publicWorkspaceFile);
const artifactWorkspace = readJson(artifactWorkspaceFile);
assert.equal(workspace.workspaceSha256, expectedWorkspaceSha256);
assert.equal(artifactWorkspace.workspaceSha256, expectedWorkspaceSha256);
assert.equal(sha256(fs.readFileSync(publicWorkspaceFile)), sha256(fs.readFileSync(artifactWorkspaceFile)), "workspace-byte-parity-failed");

const canary = workspace.production.shotIntelligence.threeShotLayerCanary;
assert.equal(workspace.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
assert.equal(canary.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
assert.equal(canary.passCount, 0);
assert.equal(canary.failureCount, 3);
assert.deepEqual(canary.targetShotIds, targetShotIds);
assert.ok(canary.failureCodes.includes(failureCode));
assert.ok(canary.items.every((item) => item.status === "FAIL"));
assert.ok(canary.items.every((item) => item.hardRuleFailures.includes(failureCode)));
assert.ok(canary.items.every((item) => item.actualVisualAudit.cleanPlateStatus === "FAIL"));
assert.ok(canary.items.every((item) => item.actualVisualAudit.motionExposureEnvelopeStatus === "FAIL"));

const review = readJson(path.join(publicDir, "three-shot-layer-canary-v1/motion-exposure-visual-review.json"));
assert.equal(review.reviewSha256, canary.motionExposureVisualReviewSha256);
assert.equal(review.status, "FAIL");
assert.equal(review.passCount, 0);
assert.equal(review.failureCount, 3);
assert.equal(review.gatePolicy.ocrOnlyApprovalForbidden, true);
assert.equal(review.gatePolicy.automaticPassMappingForbidden, true);
assert.ok(review.findings.every((finding) => finding.recompositionParityIsNecessaryButNotSufficient === true));
assert.ok(review.findings.every((finding) => finding.cleanPlateStatus === "FAIL"));

const methodBudgetExhausted = canary.failureCodes.includes("MASKED_EDIT_CLEAN_PLATE_COMPOSITE_BOUNDARY_FAILURE");
assert.equal(workspace.production.authority.nextAction.id, methodBudgetExhausted ? "MOTION_SAFE_CANARY_BLOCKED_METHOD_BUDGET_EXHAUSTED" : "REPAIR_THREE_SHOT_LAYER_CANARY");
assert.equal(workspace.production.authority.nextAction.requiresUser, methodBudgetExhausted);
assert.notEqual(workspace.production.authority.nextAction.id, "EXPAND_REMAINING_TEN_PACKAGE_LAYERS");
assert.equal(workspace.gates.packagingDeliveryGates.layerReconstructionAllowed, false);
assert.equal(workspace.production.assembly.status, "NOT_CREATED");
assert.equal(workspace.production.motion.status, "NOT_CREATED");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
assert.equal(workspace.production.objectiveVisualGate.userVisualApproval, "NOT_APPROVED");
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");

console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, canaryStatus: canary.status, failureCode, falsePassClosed: true, remainingTenExpansionAllowed: false}, null, 2));
