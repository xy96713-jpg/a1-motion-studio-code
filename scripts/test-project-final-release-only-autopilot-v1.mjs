#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const autopilot = fs.readFileSync(path.join(root, "scripts/run-editorial-project-autopilot-v1.mjs"), "utf8");
const importRoute = fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/import-project/route.ts"), "utf8");
const workbench = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/VisualAssetWorkbenchClient.tsx"), "utf8");
const packagingSurface = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"), "utf8");
const workspace = JSON.parse(fs.readFileSync(path.join(root, ".codex-artifacts/system-progress-system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
assert.match(autopilot, /auto-approved-for-visual-bible-compilation/u);
assert.match(autopilot, /project-autopilot-media-gate-blocked/u);
assert.match(autopilot, /project-autopilot-scene-and-motion-compiled/u);
assert.match(autopilot, /reviewedBy: "system"/u);
assert.match(autopilot, /compileProjectAcceptedShotIr/u);
assert.match(autopilot, /render-editorial-project-540p-v1\.mjs/u);
assert.match(autopilot, /相邻轮廓连续性/u);
assert.match(autopilot, /needsAudioRefresh/u);
assert.match(fs.readFileSync(path.join(root, "scripts/render-editorial-project-540p-v1.mjs"), "utf8"), /project-motion-and-540p-ready/u);
assert.match(autopilot, /\.autopilot-worker\.lock/u);
assert.match(importRoute, /run-editorial-project-autopilot-v1\.mjs/u);
assert.match(importRoute, /intermediateApprovalRequired: false/u);
assert.match(fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/import-source/route.ts"), "utf8"), /startProjectAutopilot/u);
assert.match(fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/import-source/route.ts"), "utf8"), /slotKind/u);
assert.match(fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8"), /automatic-final-release-only-project-route/u);
assert.match(fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8"), /request-project-final-release/u);
assert.match(fs.readFileSync(path.join(root, "apps/studio-next/src/app/api/system-line/editorial-asset-workbench/actions/route.ts"), "utf8"), /startProjectFinalRelease/u);
assert.match(workbench, /data-a1-project-autopilot="run-project-director"/u);
assert.match(fs.readFileSync(path.join(root, "scripts/render-editorial-project-540p-v1.mjs"), "utf8"), /A1ProjectVisualProofAudit\/v1/u);
assert.match(fs.readFileSync(path.join(root, "scripts/render-editorial-project-540p-v1.mjs"), "utf8"), /A1Project1080pReleaseArtifact\/v1/u);
assert.match(fs.readFileSync(path.join(root, "scripts/render-editorial-project-540p-v1.mjs"), "utf8"), /davinci-timeline\.fcpxml/u);
assert.match(workbench, /data-a1-project-final-release/u);
assert.ok(workbench.lastIndexOf("<PackagingWorkbenchSurface") < workbench.lastIndexOf("<CurrentArticleAssetProductionSurface"));
assert.match(packagingSurface, /data-a1-whole-film-static-board-review="true"/u);
assert.match(packagingSurface, /packagingLifecycle\.approvalAllowed === true/u);
if (workspace.production?.authority?.currentStage === "three-anchor-visual-repair-review") {
  assert.equal(workspace.production?.authority?.nextAction?.id, "review-three-anchor-visual-repair");
  assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
  assert.deepEqual(workspace.production?.authority?.nextAction?.targetShotIds, ["ED-01", "ED-17", "ED-34"]);
  assert.equal(workspace.production?.threeAnchorVisualRepairReview?.status, "READY_FOR_USER_VISUAL_REVIEW");
  assert.equal(workspace.production?.threeAnchorVisualRepairReview?.actualPixelReview?.userVisualApproval, "NOT_APPROVED");
  assert.equal(workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.approvalAllowed, false);
} else if (workspace.production?.authority?.currentStage === "ed10-look-master-replacement-review") {
  assert.equal(workspace.production?.authority?.nextAction?.id, "confirm-ed10-direction-c-before-eva-rebuild");
  assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
  assert.deepEqual(workspace.production?.authority?.nextAction?.targetShotIds, ["ED-10"]);
} else if (workspace.production?.authority?.currentStage === "motion-ready") {
  if (workspace.production?.authority?.nextAction?.id === "review-screen-storyboard-wave-15") {
    assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
    assert.equal(workspace.production?.authority?.nextAction?.reviewGate, "SCREEN_STORYBOARD_WAVE_15_REVIEW");
    assert.equal(workspace.production?.authority?.nextAction?.targetShotIds?.length, 15);
    assert.equal(workspace.production?.shotIntelligence?.currentStoryboardAuthority?.userVisualApproval, "NOT_APPROVED");
    assert.equal(workspace.production?.shotIntelligence?.currentStoryboardAuthority?.screenStoryboardWave?.status, "READY_FOR_USER_SHOT_BY_SHOT_REVIEW");
  } else if (workspace.production?.authority?.nextAction?.id === "rebuild-screen-storyboard-semantic-families") {
    assert.equal(workspace.production?.authority?.nextAction?.requiresUser, false);
    assert.equal(workspace.production?.authority?.nextAction?.targetShotIds?.length, 15);
    assert.equal(workspace.production?.shotIntelligence?.currentStoryboardAuthority?.screenStoryboardWave?.status, "USER_REJECTED_SYSTEM_GRAMMAR");
    assert.equal(workspace.production?.shotIntelligence?.currentStoryboardAuthority?.screenStoryboardWave?.userVisualApproval, "REJECTED");
    assert.equal(workspace.production?.motion?.fullMotionAllowed, false);
  } else if (workspace.production?.authority?.nextAction?.id === "review-semantic-screen-wave15") {
    assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
    assert.equal(workspace.production?.authority?.nextAction?.reviewGate, "SEMANTIC_SCREEN_WAVE15_REVIEW");
    assert.equal(workspace.production?.motion?.screenMotionMaturityMasters?.boundary?.userVisualApproval, "NOT_APPROVED");
    assert.equal(workspace.production?.motion?.screenMotionMaturityMasters?.boundary?.motionSpecAllowed, false);
    assert.equal(workspace.production?.motion?.fullMotionAllowed, false);
  } else {
    assert.equal(workspace.production?.authority?.nextAction?.id, "build-representative-motion-canary");
    assert.equal(workspace.production?.authority?.nextAction?.requiresUser, false);
  }
  // The effective authority may still override the persisted motion-ready base
  // to a bounded current-candidate repair; that boundary is verified by the
  // dedicated precedence test rather than by this legacy autopilot assertion.
} else if (workspace.production?.authority?.currentStage === "full-static-storyboard-rework-review") {
  assert.equal(workspace.production?.authority?.nextAction?.id, "review-full-static-storyboard-rework");
  assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
  assert.equal(workspace.production?.currentVisualDecisionLedger?.current, true);
  assert.equal(workspace.production?.currentVisualDecisionLedger?.targetShotCount, 34);
  assert.equal(workspace.production?.currentVisualDecisionLedger?.animationAllowed, false);
} else if (workspace.production?.authority?.currentStage === "whole-film-540p-review") {
  assert.equal(workspace.production?.authority?.nextAction?.id, "review-current-whole-film-540p");
  assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
  assert.equal(workspace.production?.release?.review540p?.status, "READY_FOR_USER_WHOLE_FILM_REVIEW");
  assert.equal(workspace.production?.release?.review540p?.approvedAt, null);
  assert.equal(workspace.production?.release?.final1080p?.status === "READY", false);
} else if (workspace.production?.authority?.currentStage === "whole-film-static-board-semantic-repair") {
  const lifecycle = workspace.production.packagingLifecycleProjection;
  assert.equal(lifecycle.status, "WHOLE_FILM_STATIC_BOARD_SEMANTIC_REPAIR_REQUIRED");
  assert.equal(lifecycle.approvalAllowed, false);
  assert.ok(lifecycle.blockedShotIds.length > 0);
  assert.equal(workspace.production.authority.nextAction.id, lifecycle.nextActionId);
  assert.equal(workspace.production.authority.nextAction.requiresUser, lifecycle.requiresExplicitApproval);
  assert.equal(workspace.gates.motionPrototypeAllowed, false);
  assert.equal(workspace.gates.finalRenderAllowed, false);
} else if (workspace.production?.authority?.currentStage === "whole-film-static-board-review") {
  assert.equal(workspace.production?.authority?.nextAction?.id, "review-whole-film-static-board");
  assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
  assert.equal(workspace.production?.shotIntelligence?.wholeFilmStaticBoard?.approvalAllowed, true);
  assert.equal(workspace.gates?.motionPrototypeAllowed, false);
  assert.equal(workspace.gates?.finalRenderAllowed, false);
} else if (workspace.production?.creatorPaletteShotBindingManifest?.status === "PASS") {
  assert.equal(workspace.production?.authority?.currentStage, "article-assets");
  assert.ok(["automatic-article-packaging-qa", "run-objective-qa-for-13-in-use-assets", "repair-or-rebind-current-in-use-assets-no-blind-regeneration", "rebuild-current-12-package-static-board"].includes(workspace.production?.authority?.nextAction?.id));
  assert.equal(workspace.production?.authority?.nextAction?.requiresUser, false);
  assert.equal(workspace.production?.creatorPackagingCandidateDecision?.candidateId, "ED-19-c4");
  assert.equal(workspace.production?.creatorPackagingCandidateDecision?.userVisualApproval, "APPROVED");
} else {
  assert.equal(workspace.production?.authority?.currentStage, "creator-packaging-candidate-decision-required");
  assert.equal(workspace.production?.authority?.nextAction?.id, "adopt-ed-19-c4-or-reject-and-hold");
  assert.equal(workspace.production?.authority?.nextAction?.requiresUser, true);
}
if (workspace.production?.packagingLifecycleProjection?.status === "WHOLE_FILM_STATIC_BOARD_READY") assert.equal(workspace.production?.packagingLifecycleProjection?.approvalAllowed, true);
else assert.notEqual(workspace.production?.packagingLifecycleProjection?.approvalAllowed, true);
if (workspace.production?.authority?.nextAction?.id === "review-current-shot-design-candidates" || ["three-anchor-visual-repair-review", "ed10-look-master-replacement-review", "motion-ready", "full-static-storyboard-rework-review", "whole-film-540p-review"].includes(workspace.production?.authority?.currentStage)
  || workspace.production?.packagingLifecycleProjection?.status === "WHOLE_FILM_STATIC_BOARD_READY") assert.notEqual(workspace.production?.packagingLifecycleProjection?.reviewActionDisabled, true);
else assert.equal(workspace.production?.packagingLifecycleProjection?.reviewActionDisabled, workspace.production?.creatorPaletteShotBindingManifest?.status === "PASS");
assert.equal(workspace.gates?.motionPrototypeAllowed, false);
assert.equal(workspace.gates?.finalRenderAllowed, false);
console.log(JSON.stringify({contract: "A1CurrentPackagingRepairBoundaryWithLegacyAutopilot/v1", status: "PASS", checks: {legacyAutopilotImplementationRetained: true, finalReleaseActionRetained: true, packagingWorkbenchPrecedesAssetFirstHistory: true, candidateDecisionReviewEnabled: true, motionAndFinalRenderLocked: true}}, null, 2));
