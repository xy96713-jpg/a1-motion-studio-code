#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {approveSemanticPilotAndQueueWholeFilmGeneration, compileWholeFilmExplorationOutputDeduplication, compileWholeFilmGenerationReadiness, finalizeWholeFilmLookMasterBatch, queueWholeFilmLookMasterGenerationJobs} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {compileWholeFilmVisualArchitecture} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const liveWorkspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const liveRuntime = liveWorkspace.production.shotIntelligence;
if (liveRuntime.status === "SEMANTIC_PILOT_REVIEW_REQUIRED") {
  const semanticPilot = liveRuntime.semanticPilot;
  const pilotJobs = (semanticPilot.jobIds || []).map((jobId) => liveWorkspace.production.generation.jobs.find((job) => job.id === jobId));
  assert.equal(semanticPilot.status, "SEMANTIC_PILOT_REVIEW_REQUIRED");
  assert.deepEqual(semanticPilot.targetShotIds, ["ED-12", "ED-17", "ED-09"]);
  assert.equal(semanticPilot.candidates.length, 3);
  assert.equal(new Set(semanticPilot.candidates.map((candidate) => candidate.artifact.sha256)).size, 3);
  assert.deepEqual(semanticPilot.jobIds, semanticPilot.candidates.map((candidate) => candidate.generationJobId));
  assert.ok(semanticPilot.candidates.every((candidate) => {
    const job = liveWorkspace.production.generation.jobs.find((item) => item.id === candidate.generationJobId);
    return job?.status === "complete" && job.output?.sha256 === candidate.artifact.sha256;
  }));
  assert.ok(semanticPilot.candidates.every((candidate) => candidate.recommendationEligible === false && candidate.assemblyEligible === false));
  assert.ok(pilotJobs.every((job) => job?.status === "complete"));
  assert.equal(new Set(pilotJobs.map((job) => job.generationInputHash)).size, 3);
  assert.equal(liveWorkspace.production.generation.concurrency, 2);
  assert.equal(liveRuntime.queuePolicy.generationConcurrencyHardMax, 2);
  assert.equal(liveWorkspace.production.generation.summary.queued, 0);
  assert.equal(liveWorkspace.production.generation.summary.running, 0);
  assert.equal(liveWorkspace.production.generation.workerStatus, "frozen");
  assert.equal(semanticPilot.recommendation, null);
  assert.equal(semanticPilot.selected, null);
  assert.deepEqual(semanticPilot.currentAssembly, []);
  assert.equal(liveWorkspace.production.authority.currentStage, "semantic-pilot-review-required");
  assert.equal(liveWorkspace.production.authority.nextAction?.id, "semantic-pilot-review-required");
  assert.deepEqual(liveWorkspace.production.authority.nextAction?.targetShotIds, ["ED-12", "ED-17", "ED-09"]);
  assert.equal(liveWorkspace.production.packagingBeatPlan?.current, false, "legacy packaging beat plan must remain historical");
  assert.equal(liveRuntime.wholeFilmBatchRecommendation.status, "SEMANTIC_REVIEW_REQUIRED");
  assert.equal(liveRuntime.wholeFilmBatchRecommendation.autoRecommendationAllowed, false);
  assert.equal(liveRuntime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(liveRuntime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
  const liveWorkspaceShaBeforeApprovalDryRun = liveWorkspace.workspaceSha256;
  const approvedPilotDryRun = approveSemanticPilotAndQueueWholeFilmGeneration(structuredClone(liveWorkspace), {now: "2026-08-06T12:00:00.000Z"});
  const approvedRuntime = approvedPilotDryRun.workspace.production.shotIntelligence;
  assert.equal(approvedRuntime.semanticPilotDecision.decision, "APPROVE_DIRECTION_AND_EXPAND_FULL_FILM");
  assert.equal(approvedRuntime.status, "LOOK_MASTER_PLANS_READY");
  assert.equal(approvedRuntime.semanticPilot.status, "SEMANTIC_PILOT_APPROVED");
  assert.equal(approvedRuntime.semanticPilot.current, false);
  assert.equal(approvedRuntime.semanticPilotHistory.at(-1).status, "SEMANTIC_PILOT_APPROVED");
  assert.equal(approvedRuntime.wholeFilmBatchRecommendation.status, "FULL_FILM_GENERATION_AUTHORIZED");
  assert.equal(approvedRuntime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
  assert.equal(approvedRuntime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
  assert.ok(approvedPilotDryRun.jobs.length > 0);
  assert.equal(new Set(approvedPilotDryRun.shotIds).size, 12);
  assert.ok(approvedPilotDryRun.jobs.every((job) => job.generationMode !== "SEMANTIC_PILOT_SINGLE" && !String(job.semanticDisposition || "").startsWith("EXPLORATION_ONLY")));
  assert.equal(approvedPilotDryRun.readiness.counts.preparingInputCount, 0);
  assert.equal(approvedPilotDryRun.readiness.counts.queuedCount, 12);
  assert.equal(liveWorkspace.workspaceSha256, liveWorkspaceShaBeforeApprovalDryRun, "pilot approval dry-run must not mutate the live fixture");
  console.log(JSON.stringify({
    status: "PASS",
    dynamicShotCount: liveRuntime.semanticDesignBriefSet.shotCount,
    semanticPilotShotIds: semanticPilot.targetShotIds,
    uniqueGenerationInputHashes: 3,
    uniqueArtifactHashes: 3,
    hardMaximumConcurrency: 2,
    recommendationBlocked: true,
    assemblyBlocked: true,
    layerReconstructionBlocked: true,
    approvalDryRunQueuedJobs: approvedPilotDryRun.jobs.length,
    approvalDryRunQueuedShotCount: approvedPilotDryRun.shotIds.length,
    approvalDryRunOnlyCurrentProductionJobs: true,
    persistedWorkspaceUnchanged: true,
  }, null, 2));
  process.exit(0);
}
if (liveWorkspace.production.visualProductionRun?.status === "WHOLE_FILM_STATIC_BOARD_READY") {
  const recommendation = liveRuntime.wholeFilmBatchRecommendation;
  assert.equal(recommendation?.status, "WHOLE_FILM_STATIC_BOARD_READY");
  assert.equal(recommendation?.nextUserGate, "WHOLE_FILM_STATIC_BOARD");
  assert.equal(recommendation?.autoRecommendationAllowed, false);
  assert.equal(recommendation?.assemblyCreationAllowed, false);
  assert.equal(recommendation?.layerReconstructionAllowed, false);
  assert.equal(recommendation?.exceptions?.length || 0, 0);
  const historicalGenerationJobCount = recommendation?.outputDeduplication?.historicalGenerationJobCount ?? recommendation?.outputDeduplication?.actualJobCount;
  const currentFinalizedShotCount = recommendation?.outputDeduplication?.currentFinalizedShotCount ?? recommendation?.finalizedShotIds?.length;
  assert.equal(historicalGenerationJobCount, recommendation?.outputDeduplication?.actualJobCount);
  assert.equal(currentFinalizedShotCount, recommendation?.finalizedShotIds?.length);
  assert.ok(historicalGenerationJobCount >= currentFinalizedShotCount);
  assert.equal(recommendation?.outputDeduplication?.actualUniqueCandidateCount + recommendation?.outputDeduplication?.duplicateCandidateCount, recommendation?.outputDeduplication?.actualJobCount);
  assert.equal(new Set((recommendation?.staticBoard?.items || []).map((item) => item.artifactSha256)).size, currentFinalizedShotCount);
  assert.equal(liveWorkspace.production.shotIntelligence.currentAssembly?.length || 0, 0);
  assert.equal(liveWorkspace.production.generation.summary.queued, 0);
  assert.equal(liveWorkspace.production.generation.summary.running, 0);
  assert.equal(liveWorkspace.production.generation.workerStatus, "frozen");
  assert.equal(liveWorkspace.production.authority.currentStage, "whole-film-static-board-review");
  assert.equal(liveWorkspace.production.authority.nextAction.id, "review-whole-film-static-board");
  assert.equal(liveWorkspace.production.authority.nextAction.requiresUser, true);
  assert.deepEqual(liveWorkspace.production.packagingLifecycleProjection?.blockedShotIds, []);
  assert.equal(liveWorkspace.production.packagingLifecycleProjection?.approvalAllowed, true);
  console.log(JSON.stringify({
    status: "PASS",
    dynamicShotCount: liveWorkspace.production.shotVisualCoveragePlan.counts.shotCount,
    packageShotCount: liveWorkspace.production.shotVisualCoveragePlan.counts.lookMasterRequiredCount,
    wholeFilmBatchJobCount: recommendation.outputDeduplication.actualJobCount,
    uniqueCandidateCount: recommendation.outputDeduplication.actualUniqueCandidateCount,
    duplicateCandidateCount: recommendation.outputDeduplication.duplicateCandidateCount,
    hardMaximumConcurrency: 2,
    nextUserGate: recommendation.nextUserGate,
    assemblyBlockedUntilUserBoardDecision: true,
  }, null, 2));
  process.exit(0);
}
const coverage = liveWorkspace.production.shotVisualCoveragePlan;
const workspace = structuredClone(liveWorkspace);
const pendingPackageShotIds = new Set(coverage.shotPlans.filter((shot) => shot.route === "PACKAGE_LOOK_MASTER" && shot.actualVisualReady !== true).map((shot) => shot.shotId));
workspace.production.generation.jobs = workspace.production.generation.jobs.filter((job) => job.targetKind !== "package-look-master" || !pendingPackageShotIds.has(job.shotId));
workspace.production.shotIntelligence.lookMasterRawReferences = workspace.production.shotIntelligence.lookMasterRawReferences.filter((raw) => !pendingPackageShotIds.has(raw.shotId));
for (const plan of workspace.production.shotIntelligence.packageLookMasterPlans.filter((item) => pendingPackageShotIds.has(item.shotId))) {
  delete plan.wholeFilmBoardRecommendation;
  delete plan.provisionalWholeFilmBoardSelection;
}
for (const status of ["queued", "running", "complete", "failed", "stale", "cancelled"]) {
  workspace.production.generation.summary[status] = workspace.production.generation.jobs.filter((job) => job.status === status).length;
}
workspace.production.generation.summary.total = workspace.production.generation.jobs.length;
const runtime = workspace.production.shotIntelligence;
const beforeSha = liveWorkspace.workspaceSha256;
const packageIds = coverage.shotPlans.filter((shot) => shot.route === "PACKAGE_LOOK_MASTER").map((shot) => shot.shotId);
const decisionPackageIds = runtime.decisionSet.items.filter((item) => item.packageDecision === "PACKAGE").map((item) => item.shotId);
const planIds = runtime.packageLookMasterPlans.map((plan) => plan.shotId);
const contextIds = runtime.videoPackagingContexts.items.map((context) => context.shotId);
const styleIds = workspace.production.packagingStyleBriefs
  .flatMap((brief) => brief.sourceBeatIds || [])
  .filter((shotId) => packageIds.includes(shotId));
const sortedUnique = (items) => [...new Set(items)].sort();

assert.deepEqual(sortedUnique(decisionPackageIds), sortedUnique(packageIds));
assert.deepEqual(sortedUnique(planIds), sortedUnique(packageIds));
assert.deepEqual(sortedUnique(contextIds), sortedUnique(packageIds));
assert.deepEqual(sortedUnique(styleIds), sortedUnique(packageIds));
assert.equal(packageIds.length, coverage.counts.lookMasterRequiredCount);
assert.equal(runtime.decisionSet.summary.packageKitPlanCount, 0);
assert.ok(runtime.packageAssetKitPlans.every((kit) => kit.current === false && kit.authorityScope === "HISTORY_READ_ONLY"));
assert.equal(runtime.packageAssetKitPlans.flatMap((kit) => kit.layers || []).flatMap((layer) => layer.candidates || []).filter((candidate) => candidate.status === "READY").length, 0);
assert.equal(workspace.production.generation.summary.queued, 0);

assert.equal(workspace.production.generation.summary.running, 0);

const readiness = compileWholeFilmGenerationReadiness(workspace, coverage, {now: "2026-08-05T12:30:00.000Z"});
assert.equal(readiness.status, "GENERATION_EXECUTABLE");
assert.equal(readiness.counts.packageShotCount, packageIds.length);
assert.equal(readiness.counts.completeCount, coverage.counts.actualPackageReadyCount);
assert.equal(readiness.counts.preparingInputCount, 0);
assert.equal(readiness.counts.readyForGenerationCount, coverage.counts.pendingLookMasterCount);
const dryRun = queueWholeFilmLookMasterGenerationJobs(workspace, coverage, {now: "2026-08-05T12:31:00.000Z"});
const expectedJobs = runtime.packageLookMasterPlans
  .filter((plan) => readiness.items.find((item) => item.shotId === plan.shotId)?.state === "READY_FOR_GENERATION")
  .reduce((sum, plan) => sum + plan.candidateBudget, 0);
assert.equal(dryRun.shotIds.length, readiness.counts.readyForGenerationCount);
assert.equal(dryRun.jobs.length, expectedJobs);
assert.ok(dryRun.jobs.every((job) => job.targetKind === "package-look-master" && job.status === "queued"));
assert.equal(dryRun.workspace.production.generation.concurrency, 2);
assert.equal(workspace.workspaceSha256, beforeSha, "blocked queue compilation must not persist or mutate the workspace fixture");
console.log(JSON.stringify({
  status: "PASS",
  dynamicShotCount: coverage.counts.shotCount,
  packageShotCount: packageIds.length,
  generationReadiness: readiness.status,
  dryRunQueuedShotCount: dryRun.shotIds.length,
  dryRunQueuedJobCount: dryRun.jobs.length,
  authorProofShotId: "ED-12",
  readyForGenerationCount: readiness.counts.readyForGenerationCount,
  preparingInputCount: readiness.counts.preparingInputCount,
  nextUserGate: null,
  persistedWorkspaceUnchanged: true,
}, null, 2));
process.exit(0);

assert.equal(new Set(dryRun.jobs.map((job) => job.generationInputHash)).size, dryRun.jobs.length);
assert.ok(dryRun.jobs.every((job) => job.targetKind === "package-look-master" && ["queued", "running", "complete"].includes(job.status)));
assert.equal(dryRun.workspace.production.generation.concurrency, 2);
assert.equal(dryRun.workspace.production.shotIntelligence.queuePolicy.generationConcurrencyHardMax, 2);
assert.equal(workspace.workspaceSha256, beforeSha, "dry-run queue compilation must not persist or mutate the workspace fixture");
assert.equal(workspace.production.generation.summary.queued, 0);

const completedFixture = structuredClone(dryRun.workspace);
for (const job of dryRun.jobs) {
  const stored = completedFixture.production.generation.jobs.find((item) => item.id === job.id);
  stored.status = "complete";
  stored.output = {publicUrl: `/${job.outputRelativePath}`, sha256: job.generationInputHash, width: 1536, height: 864};
  const compositeSha256 = `composite-${job.generationInputHash}`;
  completedFixture.production.shotIntelligence.lookMasterRawReferences.push({
    contract: "A1PackageLookMasterRaw/v1",
    referenceId: `look-master-raw-${job.id}`,
    shotId: job.shotId,
    eventId: job.eventId,
    planSha256: job.lookMasterPlanSha256,
    styleBriefSha256: job.styleBriefSha256,
    candidateDirectionId: job.candidateDirection.directionId,
    directionFingerprint: job.candidateDirection.fingerprint,
    status: "EXPLORATION_CANDIDATE",
    artifact: stored.output,
    provenance: {generationJobContract: job.contract, generationJobId: job.id, generationInputHash: job.generationInputHash},
    pixelAudit: {status: "PASS", compositePreview: {publicUrl: `/generated/system-line/test/${job.id}-composite.png`, sha256: compositeSha256}, footageCompatibility: {status: "PASS"}},
    lightChecks: {decode: "PASS", dimensions: "PASS", baseFrameComposite: "PASS", ocrExact: "PASS"},
    createdAt: "2026-08-05T12:32:00.000Z",
  });
}
completedFixture.production.generation.summary = {
  ...completedFixture.production.generation.summary,
  queued: 0,
  complete: completedFixture.production.generation.summary.complete + dryRun.jobs.length,
};
const finalized = finalizeWholeFilmLookMasterBatch(completedFixture, coverage, {now: "2026-08-05T12:33:00.000Z"});
assert.equal(finalized.exceptions.length, 0);
assert.equal(finalized.finalizedShotIds.length, coverage.counts.pendingLookMasterCount);
assert.equal(finalized.workspace.production.shotIntelligence.packageAssetKitPlans.length, runtime.packageAssetKitPlans.length, "auto ranking must not create pre-approval reconstruction kits");
assert.equal(finalized.workspace.production.shotIntelligence.packageAssemblyRecipes.length, runtime.packageAssemblyRecipes.length, "auto ranking must not create pre-approval assemblies");
const finalArchitecture = compileWholeFilmVisualArchitecture(finalized.workspace, {now: "2026-08-05T12:34:00.000Z"});
assert.equal(finalArchitecture.coveragePlan.counts.actualPackageReadyCount, packageIds.length);
assert.equal(finalArchitecture.productionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
assert.equal(finalArchitecture.productionRun.userApprovalPolicy.perShotApprovalRequired, false);

const duplicateFixture = structuredClone(completedFixture);
const rawByShot = Map.groupBy(duplicateFixture.production.shotIntelligence.lookMasterRawReferences, (raw) => raw.shotId);
const duplicateShot = [...rawByShot.entries()].find(([shotId, raws]) => pendingPackageShotIds.has(shotId) && raws.length >= 2);
assert.ok(duplicateShot, "same-shot duplicate fixture requires at least two candidates");
duplicateShot[1][1].artifact.sha256 = duplicateShot[1][0].artifact.sha256;
const crossShotEntries = [...rawByShot.entries()].filter(([shotId, raws]) => pendingPackageShotIds.has(shotId) && shotId !== duplicateShot[0] && raws.length > 0).slice(0, 2);
assert.equal(crossShotEntries.length, 2, "cross-shot duplicate fixture requires two shots");
crossShotEntries[1][1][0].artifact.sha256 = crossShotEntries[0][1][0].artifact.sha256;
const sameShotJobs = duplicateFixture.production.generation.jobs.filter((job) => job.targetKind === "package-look-master" && job.shotId === duplicateShot[0]);
sameShotJobs[1].output.sha256 = sameShotJobs[0].output.sha256;
const firstCrossShotJob = duplicateFixture.production.generation.jobs.find((job) => job.targetKind === "package-look-master" && job.shotId === crossShotEntries[0][0]);
const secondCrossShotJob = duplicateFixture.production.generation.jobs.find((job) => job.targetKind === "package-look-master" && job.shotId === crossShotEntries[1][0]);
secondCrossShotJob.output.sha256 = firstCrossShotJob.output.sha256;
const outputDeduplication = compileWholeFilmExplorationOutputDeduplication(duplicateFixture, {shotIds: [...pendingPackageShotIds]});
assert.equal(outputDeduplication.duplicateCandidateCount, 2);
assert.ok(outputDeduplication.duplicates.some((item) => item.scope === "SAME_SHOT"));
assert.ok(outputDeduplication.duplicates.some((item) => item.scope === "CROSS_SHOT_ANOMALY"));
const deduplicated = finalizeWholeFilmLookMasterBatch(duplicateFixture, coverage, {now: "2026-08-05T12:33:30.000Z"});
assert.ok(deduplicated.exceptions.some((item) => item.shotId === duplicateShot[0] && item.code === "LOOK_MASTER_UNIQUE_CANDIDATE_SHORTAGE"));
assert.ok(deduplicated.exceptions.some((item) => item.shotId === crossShotEntries[1][0] && item.code === "LOOK_MASTER_UNIQUE_CANDIDATE_SHORTAGE"));
assert.ok(deduplicated.workspace.production.shotIntelligence.lookMasterRawReferences.some((raw) => raw.status === "OUTPUT_DUPLICATE_HISTORY_ONLY" && raw.selectionEligible === false));
assert.ok(deduplicated.workspace.production.shotIntelligence.lookMasterRawReferences.some((raw) => raw.status === "OUTPUT_DUPLICATE_CROSS_SHOT_ANOMALY" && raw.selectionEligible === false));
assert.ok(deduplicated.workspace.production.shotIntelligence.packageLookMasterPlans.find((plan) => plan.shotId === duplicateShot[0])?.provisionalWholeFilmBoardSelection, "candidate shortage must remain visible on the whole-film board without immediate regeneration");

const semanticReview = finalizeWholeFilmLookMasterBatch(duplicateFixture, coverage, {
  now: "2026-08-05T12:34:00.000Z",
  semanticReviewRequired: true,
  semanticReviewReason: "semantic-job-template-drift",
  semanticReviewFindings: [{shotId: duplicateShot[0], code: "SEMANTIC_JOB_MISMATCH"}],
});
assert.equal(semanticReview.workspace.production.shotIntelligence.wholeFilmBatchRecommendation.status, "SEMANTIC_REVIEW_REQUIRED");
assert.equal(semanticReview.workspace.production.shotIntelligence.wholeFilmBatchRecommendation.autoRecommendationAllowed, false);
assert.equal(semanticReview.workspace.production.shotIntelligence.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
assert.equal(semanticReview.workspace.production.shotIntelligence.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
assert.ok(semanticReview.workspace.production.shotIntelligence.packageLookMasterPlans.filter((plan) => pendingPackageShotIds.has(plan.shotId)).every((plan) => !plan.provisionalWholeFilmBoardSelection && plan.status === "SEMANTIC_REVIEW_REQUIRED"));
assert.ok(semanticReview.workspace.production.shotIntelligence.lookMasterRawReferences.some((raw) => raw.status === "EXPLORATION_ONLY_SEMANTIC_REVIEW_REQUIRED"));

console.log(JSON.stringify({
  status: "PASS",
  dynamicShotCount: coverage.counts.shotCount,
  packageShotCount: packageIds.length,
  actualPackageReadyCount: readiness.counts.completeCount,
  batchReadyShotCount: readiness.counts.readyForGenerationCount,
  dryRunJobCount: dryRun.jobs.length,
  uniqueGenerationInputHashes: new Set(dryRun.jobs.map((job) => job.generationInputHash)).size,
  hardMaximumConcurrency: 2,
  preApprovalNewKitCount: 0,
  autoRankedShotCount: finalized.finalizedShotIds.length,
  nextUserGate: "WHOLE_FILM_STATIC_BOARD",
  persistedWorkspaceUnchanged: true,
}, null, 2));
