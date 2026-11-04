#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {canonicalTitleRepairCheckpoint} from "../apps/studio-next/src/lib/a1-packaging-lifecycle-projection-v1.mjs";
import {buildCreatorPaletteShotBindingManifest} from "../apps/studio-next/src/lib/a1-creator-packaging-authority-v1.mjs";
import {
  approveWholeFilmStaticBoardAndQueueLayerReconstruction,
  buildWholeFilmStaticBoardApprovalAuthority,
  buildWholeFilmStaticBoardApprovalSeed,
  hashWholeFilmStaticBoardApprovalSeed,
} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const live = readProjectWorkspace(path.join(root, "apps/studio-next"));
const now = "2026-08-06T00:00:00.000Z";

function strictFixture() {
  const fixture = structuredClone(live);
  const runtime = fixture.production.shotIntelligence;
  fixture.production.generation.jobs = fixture.production.generation.jobs.filter((job) => !(job.targetKind === "package-layer" && job.status === "queued"));
  fixture.production.generation.summary = {queued: 0, running: 0, complete: 0, failed: 0, stale: 0, cancelled: 0, total: fixture.production.generation.jobs.length};
  for (const job of fixture.production.generation.jobs) fixture.production.generation.summary[job.status] += 1;
  fixture.production.generation.workerStatus = "frozen";
  fixture.production.generation.automaticDispatchAllowed = false;
  const plans = new Map(runtime.packageLookMasterPlans.map((plan) => [plan.shotId, plan]));
  // This is a gate fixture, not a claim that every newly recalled beat
  // already has a current PNG. Keep only current selected candidates in the
  // fixture and make the remaining live package plans non-package locally.
  const selectedShotIds = new Set(runtime.packageLookMasterPlans
    .filter((plan) => plan.provisionalWholeFilmBoardSelection?.artifact?.sha256)
    .map((plan) => plan.shotId));
  fixture.production.shotVisualCoveragePlan = structuredClone(fixture.production.shotVisualCoveragePlan);
  fixture.production.shotVisualCoveragePlan.shotPlans = fixture.production.shotVisualCoveragePlan.shotPlans.map((shot) => selectedShotIds.has(shot.shotId)
    ? shot
    : {...shot, route: "PRESENTER_BASE", packageDecision: "NO_PACKAGE"});
  const packageShots = fixture.production.shotVisualCoveragePlan.shotPlans
    .filter((shot) => shot.route === "PACKAGE_LOOK_MASTER")
    .sort((left, right) => left.order - right.order);
  runtime.wholeFilmBatchRecommendation.status = "COMPLETE";
  runtime.wholeFilmBatchRecommendation.exceptions = [];
  runtime.wholeFilmBatchRecommendation.nextUserGate = "WHOLE_FILM_STATIC_BOARD";
  fixture.production.visualProductionRun.status = "WHOLE_FILM_STATIC_BOARD_READY";
  for (const shot of packageShots) {
    const plan = plans.get(shot.shotId);
    const selection = plan.provisionalWholeFilmBoardSelection;
    const raw = runtime.lookMasterRawReferences.find((item) => item.shotId === shot.shotId && item.planSha256 === plan.planSha256 && item.artifact?.sha256 === selection.artifact.sha256);
    assert.ok(raw, `fixture-selected-raw-required:${shot.shotId}`);
    raw.current = true;
    raw.recommendationEligible = true;
    raw.selectionEligible = true;
    raw.assemblyEligible = true;
    raw.status = "ACTUAL_PIXEL_SEMANTIC_PASS";
    raw.fullLookMasterStatus = "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS";
    raw.pixelAudit.status = "PASS";
    raw.pixelAudit.admissionAllowed = true;
    raw.pixelAudit.failures = [];
    raw.semanticPixelAudit.status = "PASS";
    raw.semanticPixelAudit.recommendationEligible = true;
    raw.semanticPixelAudit.findings = [];
    raw.semanticPixelAuditSha256 = raw.semanticPixelAudit.auditSha256;
    if (!raw.serverVisualAssessment) raw.serverVisualAssessment = {
      contract: "A1BoundServerVisualAssessment/v1",
      status: "PASS",
      assessmentMode: "ACTUAL_PIXEL_SEMANTIC_AUDIT_COMPATIBILITY_BINDING",
      artifactSha256: raw.artifact.sha256,
      sourceSemanticAuditSha256: raw.semanticPixelAudit.auditSha256,
      assessmentSha256: raw.pixelAudit.serverVisualAssessmentSha256,
    };
    raw.serverVisualAssessment.status = "PASS";
    raw.serverVisualAssessment.assessmentSha256 = raw.pixelAudit.serverVisualAssessmentSha256;
  }
  // The fixture changes only audit eligibility flags. Rebuild the in-memory
  // binding dependency so the canonical scope tests the candidate gate, not
  // an intentionally stale fixture pointer.
  fixture.production.creatorPaletteShotBindingManifest = buildCreatorPaletteShotBindingManifest(fixture, {now});
  const seed = buildWholeFilmStaticBoardApprovalSeed(fixture.production.shotVisualCoveragePlan, runtime.packageLookMasterPlans);
  const itemSeedSha256 = hashWholeFilmStaticBoardApprovalSeed(seed);
  const items = seed.map((item) => ({...item}));
  const board = {
    ...(runtime.wholeFilmStaticBoard || {}),
    contract: "A1WholeFilmStaticBoard/v1",
    status: "PENDING_USER_APPROVAL",
    sha256: "b".repeat(64),
    decision: null,
    itemCount: items.length,
    items,
    itemSeedSha256,
  };
  runtime.wholeFilmStaticBoard = board;
  runtime.wholeFilmBatchRecommendation.staticBoard = structuredClone(board);
  return {fixture, packageShots, itemSeedSha256};
}

function approvalArgs(fixture, itemSeedSha256) {
  return {
    now,
    expectedWorkspaceSha256: fixture.workspaceSha256,
    expectedBoardSha256: fixture.production.shotIntelligence.wholeFilmStaticBoard.sha256,
    expectedBoardItemSeedSha256: itemSeedSha256,
  };
}

function assertRejectedWithoutMutation(mutator, expectedError) {
  const prepared = strictFixture();
  const args = approvalArgs(prepared.fixture, prepared.itemSeedSha256);
  mutator(prepared);
  const before = JSON.stringify(prepared.fixture);
  assert.throws(
    () => approveWholeFilmStaticBoardAndQueueLayerReconstruction(prepared.fixture, args),
    expectedError,
  );
  assert.equal(JSON.stringify(prepared.fixture), before);
}

const prepared = strictFixture();
const result = approveWholeFilmStaticBoardAndQueueLayerReconstruction(prepared.fixture, approvalArgs(prepared.fixture, prepared.itemSeedSha256));
const approvedRuntime = result.workspace.production.shotIntelligence;
const currentKits = approvedRuntime.packageAssetKitPlans.filter((plan) => plan.current === true && plan.authorityScope === "CURRENT");
const currentRecipes = approvedRuntime.packageAssemblyRecipes.filter((recipe) => recipe.current === true && recipe.authorityScope === "CURRENT");
const extractionJobs = result.jobs.filter((job) => job.targetKind === "package-layer");
assert.equal(currentKits.length, prepared.packageShots.length);
assert.equal(currentRecipes.length, prepared.packageShots.length);
assert.equal(extractionJobs.length, 0);
assert.equal(approvedRuntime.wholeFilmStaticBoardDecision.decision, "APPROVE_WHOLE_FILM_STATIC_BOARD_AND_DIRECT_ASSEMBLY");
assert.equal(approvedRuntime.wholeFilmStaticBoard.status, "APPROVED");
assert.equal(approvedRuntime.wholeFilmBatchRecommendation.staticBoard.status, "APPROVED");
assert.equal(result.workspace.production.visualProductionRun.status, "MOTION_READY");
assert.equal(approvedRuntime.status, "MOTION_READY");
assert.equal(approvedRuntime.wholeFilmBatchRecommendation.replacementArchitecture, "APPROVED_MASTER_RASTER_SLICE_MOTION_WITH_HASH_BOUND_EDITABLE_TYPOGRAPHY_SHADOW");
assert.equal(result.workspace.production.goldenFilmVisualSystemMaturity.current, false);

{
  const matureBoard = strictFixture();
  matureBoard.fixture.production.shotIntelligence.wholeFilmBatchRecommendation.status = "WHOLE_FILM_STATIC_BOARD";
  const approved = approveWholeFilmStaticBoardAndQueueLayerReconstruction(matureBoard.fixture, approvalArgs(matureBoard.fixture, matureBoard.itemSeedSha256));
  assert.equal(approved.workspace.production.shotIntelligence.wholeFilmStaticBoard.status, "APPROVED");
}

{
  const preApproval = strictFixture();
  for (const shot of preApproval.packageShots) {
    const plan = preApproval.fixture.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shot.shotId);
    const raw = preApproval.fixture.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === shot.shotId && item.artifact?.sha256 === plan.provisionalWholeFilmBoardSelection.artifact.sha256);
    raw.assemblyEligible = false;
    raw.userVisualApproval = "NOT_APPROVED";
    raw.fullLookMasterStatus = "FULL_LOOK_MASTER_ACTUAL_PIXEL_PASS";
    raw.status = "ACTUAL_PIXEL_SEMANTIC_PASS";
  }
  const approved = approveWholeFilmStaticBoardAndQueueLayerReconstruction(preApproval.fixture, approvalArgs(preApproval.fixture, preApproval.itemSeedSha256));
  const selected = approved.workspace.production.shotIntelligence.lookMasterRawReferences.filter((item) => {
    const plan = approved.workspace.production.shotIntelligence.packageLookMasterPlans.find((candidatePlan) => candidatePlan.shotId === item.shotId);
    return preApproval.packageShots.some((shot) => shot.shotId === item.shotId)
      && item.artifact?.sha256 === plan?.provisionalWholeFilmBoardSelection?.artifact?.sha256
      && item.userVisualApproval === "APPROVED";
  });
  assert.equal(selected.length, preApproval.packageShots.length);
  assert.ok(selected.every((item) => item.assemblyEligible === true && /^[a-f0-9]{64}$/u.test(item.approvalAuthoritySha256)));
}

{
  const delegated = strictFixture();
  const board = delegated.fixture.production.shotIntelligence.wholeFilmStaticBoard;
  const authority = buildWholeFilmStaticBoardApprovalAuthority({
    mode: "USER_DELEGATED_VISUAL_DIRECTOR",
    userDirectiveSha256: "a".repeat(64),
    visualEvidence: {
      contract: "A1WholeFilmStaticBoardActualPixelVisualReview/v1",
      status: "PASS",
      reviewer: "a1-visual-director",
      boardSha256: board.sha256,
      itemCount: board.itemCount,
      criteria: [{id: "three-second-semantic", status: "PASS"}],
    },
    now,
  });
  const approved = approveWholeFilmStaticBoardAndQueueLayerReconstruction(delegated.fixture, {...approvalArgs(delegated.fixture, delegated.itemSeedSha256), approvalAuthority: authority});
  assert.equal(approved.workspace.production.shotIntelligence.wholeFilmStaticBoardDecision.decidedBy, "user-delegated-a1-visual-director");
  assert.equal(approved.workspace.production.shotIntelligence.wholeFilmStaticBoardDecision.approvalAuthority.authoritySha256, authority.authoritySha256);
  const projected = recalculateEditorialAssetWorkbench(approved.workspace, now);
  assert.equal(canonicalTitleRepairCheckpoint(projected), false);
  assert.notEqual(projected.production.authority.currentStage, "layer-reconstruction-in-progress");
  assert.notEqual(projected.production.authority.nextAction.id, "continue-integrated-presenter-package-extraction");
  assert.equal(projected.production.generation.workerStatus, "frozen");
  assert.equal(projected.production.generation.summary.running, 0);
  assert.equal(projected.production.generation.summary.queued, approved.jobs.length);
}

{
  const staleFixture = strictFixture();
  const board = staleFixture.fixture.production.shotIntelligence.wholeFilmStaticBoard;
  const stale = buildWholeFilmStaticBoardApprovalAuthority({
    mode: "USER_DELEGATED_VISUAL_DIRECTOR",
    userDirectiveSha256: "a".repeat(64),
    visualEvidence: {contract: "A1WholeFilmStaticBoardActualPixelVisualReview/v1", status: "PASS", reviewer: "a1-visual-director", boardSha256: "c".repeat(64), itemCount: board.itemCount, criteria: [{id: "three-second-semantic", status: "PASS"}]},
    now,
  });
  const before = JSON.stringify(staleFixture.fixture);
  assert.throws(
    () => approveWholeFilmStaticBoardAndQueueLayerReconstruction(staleFixture.fixture, {...approvalArgs(staleFixture.fixture, staleFixture.itemSeedSha256), approvalAuthority: stale}),
    /whole-film-static-board-delegated-visual-evidence-stale/u,
  );
  assert.equal(JSON.stringify(staleFixture.fixture), before);
}

assertRejectedWithoutMutation(({fixture}) => { delete fixture.production.shotIntelligence.wholeFilmStaticBoard; }, /whole-film-static-board-sha-cas-failed/u);
assertRejectedWithoutMutation(({fixture}) => { fixture.production.shotIntelligence.wholeFilmStaticBoard.sha256 = "0".repeat(64); }, /whole-film-static-board-sha-cas-failed/u);
assertRejectedWithoutMutation(({fixture}) => { fixture.production.shotIntelligence.wholeFilmStaticBoard.items[0].artifactSha256 = "1".repeat(64); }, /whole-film-static-board-canonical-scope-invalid/u);
assertRejectedWithoutMutation(({fixture, packageShots}) => {
  const shotId = packageShots.find((shot) => shot.shotId === "ED-08")?.shotId || packageShots[0].shotId;
  const plan = fixture.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
  const selection = plan.provisionalWholeFilmBoardSelection;
  const raw = fixture.production.shotIntelligence.lookMasterRawReferences.find((item) => item.shotId === shotId && item.planSha256 === plan.planSha256 && item.artifact?.sha256 === selection.artifact.sha256);
  raw.pixelAudit.admissionAllowed = false;
}, /whole-film-static-board-candidate-authority-invalid/u);

for (const [label, mutate] of [
  ["production-run", (fixture) => { fixture.production.visualProductionRun.status = "LOOK_MASTER_PLANS_READY"; }],
  ["next-user-gate", (fixture) => { fixture.production.shotIntelligence.wholeFilmBatchRecommendation.nextUserGate = "LAYER_RECONSTRUCTION"; }],
  ["board-status", (fixture) => { fixture.production.shotIntelligence.wholeFilmStaticBoard.status = "APPROVED"; }],
  ["board-decision", (fixture) => { fixture.production.shotIntelligence.wholeFilmStaticBoard.decision = "approved"; }],
]) assertRejectedWithoutMutation(({fixture}) => mutate(fixture), /whole-film-static-board-approval-stage-invalid/u, label);

{
  const stale = strictFixture();
  const before = JSON.stringify(stale.fixture);
  assert.throws(() => approveWholeFilmStaticBoardAndQueueLayerReconstruction(stale.fixture, {...approvalArgs(stale.fixture, stale.itemSeedSha256), expectedWorkspaceSha256: "f".repeat(64)}), /whole-film-static-board-workspace-cas-failed/u);
  assert.equal(JSON.stringify(stale.fixture), before);
}

assert.equal(live.workspaceSha256, readProjectWorkspace(path.join(root, "apps/studio-next")).workspaceSha256);
console.log(JSON.stringify({status: "PASS", packageShots: prepared.packageShots.length, extractionJobs: extractionJobs.length, negativeCases: 9, workspaceUnchanged: true}, null, 2));
