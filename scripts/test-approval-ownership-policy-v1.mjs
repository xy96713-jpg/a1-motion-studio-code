#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {approvalOwnershipPolicyMatrix, assertApprovalOwnershipDecision, classifyApprovalOwnership} from "../apps/studio-next/src/lib/a1-approval-ownership-policy-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const artifactFile = path.join(root, ".codex-artifacts/system-progress-system-line/delegated-internal-execution-authority-v1/current.json");
const publicFile = path.join(root, "apps/studio-next/public/generated/system-line/delegated-internal-execution-authority-v1/current.json");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sha256Value = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const matrix = approvalOwnershipPolicyMatrix();
for (const action of matrix.agentInternalActions) {
  const context = action === "SELECT_STRICTLY_BETTER_REVIEW_CANDIDATE"
    ? {incumbentComparisonPass: true, actualPixelReviewPass: true}
    : action === "ADMIT_STATIC_BOARD_TO_BOUNDED_MOTION_PROOF"
      ? {staticBoardActualPixelReviewPass: true, isolatedOutput: true}
      : ["RENDER_ISOLATED_REPRESENTATIVE_MOTION", "RENDER_REVIEW_ONLY_540P"].includes(action)
        ? {reviewOnly: true, canonicalOverwrite: false, resolveWrite: false, externalPublication: false}
        : {};
  const decision = assertApprovalOwnershipDecision(classifyApprovalOwnership(action, context));
  assert(decision.owner === "AGENT_INTERNAL" && decision.semantics.userVisualApproval === "NOT_APPROVED", `approval-ownership-agent-action-invalid:${action}`);
}
for (const action of matrix.userRequiredActions) assert(assertApprovalOwnershipDecision(classifyApprovalOwnership(action)).owner === "USER_REQUIRED", `approval-ownership-user-action-invalid:${action}`);
assert(assertApprovalOwnershipDecision(classifyApprovalOwnership("UNSEEN_MATERIAL_ACTION")).owner === "USER_REQUIRED", "approval-ownership-unknown-action-not-fail-closed");
assert(assertApprovalOwnershipDecision(classifyApprovalOwnership("SELECT_STRICTLY_BETTER_REVIEW_CANDIDATE", {incumbentComparisonPass: false, actualPixelReviewPass: true})).owner === "BLOCKED", "approval-ownership-weak-candidate-not-blocked");
assert(assertApprovalOwnershipDecision(classifyApprovalOwnership("RENDER_REVIEW_ONLY_540P", {reviewOnly: true, canonicalOverwrite: true})).owner === "BLOCKED", "approval-ownership-canonical-overwrite-not-blocked");

const authority = JSON.parse(fs.readFileSync(artifactFile, "utf8"));
const {authoritySha256, ...body} = authority;
assert(authority.contract === "A1DelegatedInternalExecutionAuthority/v1" && authority.status === "INTERNAL_MOTION_PROOF_PASSED_AUTONOMOUS_CONTINUATION_ALLOWED", "delegated-authority-contract-invalid");
assert(authoritySha256 === sha256Value(body), "delegated-authority-sha-invalid");
assert(authority.lanes.internalReviewLane.nextAction.requiresUser === false && authority.lanes.canonicalProductionLane.userVisualApproval === "NOT_APPROVED", "delegated-authority-lane-separation-invalid");
assert(authority.compatibility.workspaceMutationPerformed === false && authority.compatibility.currentPhaseMutationPerformed === false, "delegated-authority-mutated-canonical-state");
assert(sha256File(artifactFile) === sha256File(publicFile), "delegated-authority-mirror-invalid");
process.stdout.write(`${JSON.stringify({status: "PASS", agentInternalActionCount: matrix.agentInternalActions.length, userRequiredActionCount: matrix.userRequiredActions.length, unknownActionOwner: matrix.unknownActionOwner, nextAction: authority.lanes.internalReviewLane.nextAction, userVisualApproval: authority.lanes.canonicalProductionLane.userVisualApproval}, null, 2)}\n`);
