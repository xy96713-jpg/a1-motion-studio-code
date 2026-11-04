#!/usr/bin/env node
import assert from "node:assert/strict";
import {assertSystemLineLifecycle, deriveSystemLineLifecycle} from "../apps/studio-next/src/lib/a1-system-line-lifecycle-v1.mjs";

const workspaceSha256 = "a".repeat(64);
const phase = {status: "MOTION_READY", authority: {workspaceSha256, currentStage: "motion-ready", nextAction: {id: "old-review", label: "审看15镜", targetShotIds: ["a"]}}};
const audit = {authority: {workspaceSha256}, effectiveReviewAuthority: {boundary: {userVisualApproval: "NOT_APPROVED", fullFilmVisualApproval: false, productionAdmitted: false, motionAllowed: false, resolveAllowed: false, finalRenderAllowed: false}}};
const summary = (items) => ({workspaceSha256, items});
const fixtures = [
  {
    id: "lifecycle-evidence-a",
    input: summary([{shotId: "evidence-2", status: "NARRATION_REPAIR_REQUIRED"}, {shotId: "evidence-1", status: "READY_FOR_USER_REVIEW"}]),
    expected: ["current-film-narration-repair", "complete-current-narration-repairs", ["evidence-2"]],
  },
  {
    id: "lifecycle-tutorial-b",
    input: summary([{shotId: "step-result", status: "VIEWING_REPAIR_REQUIRED"}, {shotId: "step-entry", status: "REUSE_REVIEW_REQUIRED"}]),
    expected: ["current-film-review-repair", "complete-current-review-repairs", ["step-result", "step-entry"]],
  },
  {
    id: "lifecycle-opinion-c",
    input: summary([{shotId: "opener", status: "READY_FOR_USER_REVIEW"}, {shotId: "speaker", status: "NO_PACKAGE"}]),
    expected: ["whole-film-static-review", "review-current-whole-film-static-board", ["opener"]],
  },
];

const results = fixtures.map((fixture) => {
  const result = assertSystemLineLifecycle(deriveSystemLineLifecycle({phase, audit, shotReview: fixture.input}));
  assert.equal(result.stage.id, fixture.expected[0]);
  assert.equal(result.nextAction.id, fixture.expected[1]);
  assert.deepEqual(result.nextAction.targetShotIds, fixture.expected[2]);
  assert.equal(result.gates.motionAllowed, false);
  assert.equal(result.diagnostics.persistedStageOverstatesMotionReadiness, true);
  return {id: fixture.id, status: "PASS", stage: result.stage.id, nextAction: result.nextAction.id};
});

assert.throws(() => deriveSystemLineLifecycle({phase, audit: {...audit, authority: {workspaceSha256: "b".repeat(64)}}, shotReview: summary([])}), /SOURCE_STALE/);
const motionAudit = {authority: {workspaceSha256}, effectiveReviewAuthority: {boundary: {userVisualApproval: "APPROVED", fullFilmVisualApproval: true, productionAdmitted: true, motionAllowed: true, finalRenderAllowed: false, resolveAllowed: false}}};
const motion = assertSystemLineLifecycle(deriveSystemLineLifecycle({phase: {...phase, status: "STATIC_APPROVED"}, audit: motionAudit, shotReview: summary([{shotId: "speaker", status: "NO_PACKAGE"}])}));
assert.equal(motion.stage.id, "motion-review");
console.log(JSON.stringify({contract: "A1SystemLineLifecycleTest/v1", status: "PASS", results}, null, 2));
