#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {derivePackagingLifecycleProjection} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {compileWholeFilmVisualArchitecture, deriveCoverageSemanticTimelineRevision} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const workspace = readProjectWorkspace("./apps/studio-next");
const currentPhase = JSON.parse(fs.readFileSync("./.codex-artifacts/system-progress-system-line/current-phase.json", "utf8"));
const architecture = compileWholeFilmVisualArchitecture(workspace, {now: "2026-08-06T00:00:00.000Z"});
const decisionSet = workspace.production.shotIntelligence.decisionSet;
const revision = deriveCoverageSemanticTimelineRevision(workspace);
const batch = workspace.production.shotIntelligence.wholeFilmBatchRecommendation;
const run = workspace.production.visualProductionRun;
const lifecycleProjection = derivePackagingLifecycleProjection(workspace);
const effectiveAuthorityOverride = currentPhase.authority?.nextAction?.id
  && currentPhase.authority.nextAction.id !== lifecycleProjection.nextActionId;
const canonicalCreatorSequence = workspace.production.canonicalCreatorPackagingSequence?.current === true
  ? workspace.production.canonicalCreatorPackagingSequence
  : null;
const coverage = architecture.coveragePlan;
const packageShots = coverage.shotPlans.filter((shot) => shot.packageDecision === "PACKAGE");
const eventIds = coverage.packagingEvents.map((event) => event.eventId);

assert.equal(workspace.workspaceSha256, currentPhase.authority.workspaceSha256);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.production.shotIntelligence.currentAssembly.length, 0);
const staticBoardUserApproved = workspace.production.shotIntelligence.wholeFilmStaticBoard?.decision?.decision === "approved"
  || workspace.production.shotIntelligence.wholeFilmStaticBoard?.decision?.status === "APPROVED"
  || batch.userApproval?.approved === true
  || run.userApproval === true;
const staticBoardReady = batch.exceptions.length === 0 && run.status === "WHOLE_FILM_STATIC_BOARD_READY";
assert.equal(batch.assemblyCreationAllowed, staticBoardReady && staticBoardUserApproved, "Assembly admission requires explicit whole-film static-board approval");
const lifecycleOwnsNextAction = Boolean(lifecycleProjection.authorityStage && lifecycleProjection.nextActionId && lifecycleProjection.nextUserGate);
const expectedNextUserGate = effectiveAuthorityOverride
  ? batch.nextUserGate
  : lifecycleOwnsNextAction
  ? lifecycleProjection.nextUserGate
  : batch.exceptions.length
    ? "LOOK_MASTER_EXCEPTION_REPAIR_REQUIRED"
    : "WHOLE_FILM_STATIC_BOARD";
assert.equal(batch.nextUserGate, expectedNextUserGate);
if (lifecycleOwnsNextAction && !effectiveAuthorityOverride) {
  assert.equal(workspace.production.authority.currentStage, lifecycleProjection.authorityStage);
  assert.equal(workspace.production.authority.nextAction.id, lifecycleProjection.nextActionId);
  const maturityAuthority = workspace.production.goldenFilmVisualSystemMaturity?.current === true
    && workspace.production.goldenFilmVisualSystemMaturity.nextAction === workspace.production.authority.nextAction.id
    ? workspace.production.goldenFilmVisualSystemMaturity
    : null;
  assert.deepEqual(workspace.production.authority.nextAction.targetShotIds || [], maturityAuthority?.targetShotIds || lifecycleProjection.targetShotIds || []);
}
assert.equal((batch.currentAssembly || []).length, 0);
assert.equal(batch.layerReconstructionAllowed, false);
assert.equal(batch.criticAllowed, false);
assert.equal(batch.motionAllowed, false);
assert.equal(revision.recompileRequired, false);
assert.equal(revision.authoritySource, "CURRENT_DECISION_SET_SEMANTIC_TIMELINE");
assert.equal(coverage.semanticTimeline.recompileRequired, false);
assert.equal(coverage.semanticTimeline.sourceRevisionHash, decisionSet.sourceRevisionHash);
const inconsistentWorkspace = structuredClone(workspace);
inconsistentWorkspace.production.shotIntelligence.decisionSet.semanticTimelineHash = "f".repeat(64);
const inconsistentRevision = deriveCoverageSemanticTimelineRevision(inconsistentWorkspace);
assert.equal(inconsistentRevision.recompileRequired, true);
assert.equal(inconsistentRevision.authoritySource, "NO_CURRENT_SEMANTIC_TIMELINE_AUTHORITY");
assert.equal(new Set(eventIds).size, eventIds.length);
assert.ok(coverage.packagingEvents.length <= packageShots.length);
if (canonicalCreatorSequence) {
  const canonicalPackageShots = canonicalCreatorSequence.decisions.filter((item) => item.packageDecision === "PACKAGE");
  assert.equal(canonicalPackageShots.length, batch.finalizedShotIds.length);
  for (const decision of canonicalPackageShots) {
    assert.ok(["OVERLAY", "EXPLAINER", "TYPOGRAPHY", "FULLSCREEN"].includes(decision.assemblyMode));
    assert.ok(typeof decision.presentationMode === "string" && decision.presentationMode.length > 0);
  }
} else {
  for (const shot of packageShots) {
    assert.equal(shot.eventGrouping?.role, "PACKAGE_EVENT");
    assert.equal(shot.eventGrouping?.mode, shot.assemblyMode);
  }
}

console.log(JSON.stringify({status: "PASS", workspaceSha256: workspace.workspaceSha256, packageCount: packageShots.length, packagingEventCount: coverage.packagingEvents.length, assemblyCount: workspace.production.shotIntelligence.currentAssembly.length, nextUserGate: batch.nextUserGate, queue: workspace.production.generation.summary, workerStatus: workspace.production.generation.workerStatus}, null, 2));
