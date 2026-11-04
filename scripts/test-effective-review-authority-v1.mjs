#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertEffectiveReviewAuthority, createEffectiveReviewAuthority} from "../apps/studio-next/src/lib/a1-effective-review-authority-v1.mjs";

const persistedNextAction = {id: "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY", label: "authorize", requiresExplicitApproval: true, targetShotIds: ["ED-12", "ED-13", "ED-14"]};
const lifecycle = {
  status: "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW",
  lifecycleSha256: "a".repeat(64),
  nextAction: {id: "USER_FINAL_ACTUAL_PIXEL_DECISION", requiresUser: true},
  boundary: {productionAdmitted: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false},
};
const effective = createEffectiveReviewAuthority({persistedStatus: "VISUAL_REPAIR_REQUIRED", persistedCurrentStage: "visual-repair-required", persistedNextAction, lifecycle, userVisualApproval: "NOT_APPROVED"});
assert.equal(effective.status, "AGENT_RECOMMENDS_USER_ACTUAL_PIXEL_REVIEW");
assert.equal(effective.nextAction.id, "USER_FINAL_ACTUAL_PIXEL_DECISION");
assert.equal(effective.persistedBaseAuthority.status, "VISUAL_REPAIR_REQUIRED");
assert.equal(effective.persistedBaseAuthority.nextAction.id, "AUTHORIZE_PACKAGING_PARAGRAPH_CANARY");
assert.equal(effective.persistedBaseAuthority.retainedAsHistoricalDecision, true);
assert.equal(effective.workspaceMutationPerformed, false);
assertEffectiveReviewAuthority(effective);
assert.throws(() => assertEffectiveReviewAuthority({...effective, status: "VISUAL_APPROVED"}), /sha-invalid/u);

const baseOnly = createEffectiveReviewAuthority({persistedStatus: "RUNNING", persistedCurrentStage: "shot-review", persistedNextAction: {id: "wait-review", label: "wait-review", targetShotIds: []}});
assert.equal(baseOnly.status, "RUNNING");
assert.equal(baseOnly.nextAction.id, "wait-review");
assert.equal(baseOnly.source.mode, "PERSISTED_BASE_ONLY");
assert.equal(baseOnly.persistedBaseAuthority.retainedAsHistoricalDecision, false);

console.log(JSON.stringify({status: "PASS", contract: effective.contract, effectiveStatus: effective.status, effectiveNextAction: effective.nextAction.id, persistedBaseStatus: effective.persistedBaseAuthority.status, persistedBaseNextAction: effective.persistedBaseAuthority.nextAction.id, tamperRejected: true, workspaceMutationPerformed: false, userVisualApproval: effective.boundary.userVisualApproval}, null, 2));
