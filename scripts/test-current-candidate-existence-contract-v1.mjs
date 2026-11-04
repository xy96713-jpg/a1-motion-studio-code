#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import "./test-packaging-paragraph-lifecycle-presence-v1.mjs";
import {packagingParagraphCanaryLifecyclePaths, assertPackagingParagraphCanaryLifecycle, readPackagingParagraphCanaryLifecycle} from "../apps/studio-next/src/lib/a1-packaging-paragraph-canary-lifecycle-v1.mjs";
import {readExecutionStatus} from "../apps/studio-next/src/lib/a1-execution-status-v1.mjs";

const lifecycle = readPackagingParagraphCanaryLifecycle("./apps/studio-next", {refresh: true});
const execution = readExecutionStatus("./apps/studio-next");
if (lifecycle === null) {
  // Null means absent paragraph inputs, not a generated candidate or approval.
  // Compare the live authority contract rather than enumerate historical actions.
  const paths = packagingParagraphCanaryLifecyclePaths("./apps/studio-next");
  assert.ok(!fs.existsSync(paths.pack) || !fs.existsSync(paths.phase), "null lifecycle requires missing paragraph inputs");
  assert.equal(execution.packagingParagraphBaseLifecycle, null);
  assert.equal(execution.packagingParagraphLifecycle, null);
  assert.equal(execution.effectiveAuthority.source.mode, "PERSISTED_BASE_ONLY");
  const persisted = execution.effectiveAuthority.persistedBaseAuthority;
  assert.ok(persisted.status && persisted.nextAction?.id, "inactive paragraph lane still requires an authoritative action");
  assert.equal(execution.status, persisted.status);
  assert.deepEqual(execution.nextAction, persisted.nextAction);
  assert.notEqual(execution.nextAction.id, "GENERATE_NEW_CURRENT_CANDIDATE");
} else if (["auto-admit-representative-motion-canary","compile-full-film-motion-specs","build-dirty-full-film-motion-assets","render-current-whole-film-540p"].includes(execution.nextAction?.id)) {
  assert.equal(lifecycle, null);
  assert.equal(execution.status, "MOTION_READY");
  assert.equal(execution.nextAction.requiresExplicitApproval, false);
} else if (execution.nextAction?.id === "review-current-whole-film-540p") {
  assert.equal(lifecycle, null);
  assert.equal(execution.status, "WHOLE_FILM_540P_REVIEW_READY_FOR_USER_VISUAL_REVIEW");
  assert.equal(execution.nextAction.requiresExplicitApproval, true);
} else if (execution.status === "FULL_STATIC_STORYBOARD_REWORK_REVIEW_REQUIRED" || execution.nextAction?.id === "review-full-static-storyboard-rework") {
  assert.equal(lifecycle, null);
  assert.equal(execution.nextAction.id, "review-full-static-storyboard-rework");
  assert.equal(execution.nextAction.requiresExplicitApproval, true);
} else if (execution.latestVisualBoardReview) {
  assert.ok(["LATEST_WHOLE_FILM_VISUAL_BOARD_REVIEW_REQUIRED", "LATEST_WHOLE_FILM_VISUAL_BOARD_RECOMPILE_REQUIRED"].includes(execution.status));
  assert.ok(["REVIEW_LATEST_WHOLE_FILM_VISUAL_BOARD", "RECOMPILE_WHOLE_FILM_VISUAL_BOARD_FROM_CURRENT_SEMANTIC_TIMELINE"].includes(execution.nextAction.id));
  if (lifecycle) {
    assert.notEqual(lifecycle.nextAction.id, "GENERATE_NEW_CURRENT_CANDIDATE");
    assert.ok(["INTEGRITY_BLOCKED", "CURRENT_CANDIDATE_REFERENCE_STALE"].includes(lifecycle.status));
  }
} else {
  assert.equal(lifecycle.status, "CURRENT_CANDIDATE_GENERATION_REQUIRED");
  assert.equal(lifecycle.nextAction.id, "GENERATE_NEW_CURRENT_CANDIDATE");
  assert.equal(lifecycle.nextAction.requiresUser, true);
}
if (lifecycle) {
  assertPackagingParagraphCanaryLifecycle(lifecycle);
  assert.equal(lifecycle.boundary.productionAdmitted, false);
  assert.equal(lifecycle.boundary.motionAllowed, false);
}
console.log(JSON.stringify({status:"PASS",contract:"A1CurrentCandidateExistenceContractTest/v1",candidateExistence:lifecycle === null ? "PARAGRAPH_INPUTS_ABSENT_NOT_CANDIDATE_PASS" : lifecycle.evidence?.candidateExistence || "BLOCKED_BY_LATEST_VISUAL_BOARD_OR_INTEGRITY",paragraphLifecycleStatus:lifecycle?.status || "INACTIVE_MISSING_PARAGRAPH_INPUTS",effectiveNextAction:execution.nextAction,historyFallbackForbidden:true},null,2));
