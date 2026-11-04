#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {compileWholeFilmExplorationOutputDeduplication, finalizeWholeFilmLookMasterBatch} from "../apps/studio-next/src/lib/a1-whole-film-look-master-production-v1.mjs";
import {compileWholeFilmPackagingDirection, compileWholeFilmVisualArchitecture} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const singleWriterTaskId = "019fd0b8-634f-7581-8ea2-5f3c6de29679";
const semanticReviewReason = "用户审阅联系表后确认本批画面未充分依据文章；当前计划存在 semanticJob 模板串用，并且多数镜头缺少文章特定来源输入。";
const semanticReviewFindings = [
  {shotId: "ED-17", code: "SEMANTIC_JOB_MISMATCH", detail: "exactCopy 是先给材料、再找角度、最后让 AI 动笔；semanticJob 却仍描述完成度很高到废稿。"},
  {shotId: "ED-09", code: "SHARED_TEMPLATE_SEMANTIC_JOB", relatedShotIds: ["ED-12", "ED-19"], detail: "三个不同段落共用决定方向与保留作者风格的语义模板。"},
  {shotId: "ED-14", code: "SHARED_TEMPLATE_SEMANTIC_JOB", relatedShotIds: ["ED-15", "ED-23"], detail: "三个不同段落共用候选、偏好与默认结果的语义模板。"},
  {shotId: "ED-16", code: "SHARED_TEMPLATE_SEMANTIC_JOB", relatedShotIds: ["ED-20"], detail: "两个不同段落共用常见、稳妥、可复用收敛模板。"},
  {shotId: null, code: "ARTICLE_SPECIFIC_SOURCE_INPUTS_MISSING", detail: "除 ED-14 外，本批包装计划没有文章特定人物、网页、产品或事实素材输入。"},
];

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0) throw new Error("semantic-review-marking-requires-idle-generation-queue");
  const staged = structuredClone(current);
  const runtime = staged.production.shotIntelligence;
  const protectedAssemblyShotIds = new Set((runtime.packageAssemblyRecipes || [])
    .filter((recipe) => recipe.status !== "WAITING_FOR_LOOK_MASTER" && recipe.status !== "HISTORY_READ_ONLY" && recipe.status !== "VISUAL_REJECTED" && recipe.assemblyComposite?.publicUrl && recipe.assemblyComposite?.sha256)
    .map((recipe) => recipe.shotId));
  const explorationShotIds = new Set(runtime.packageLookMasterPlans.map((plan) => plan.shotId).filter((shotId) => !protectedAssemblyShotIds.has(shotId)));
  for (const plan of runtime.packageLookMasterPlans.filter((item) => explorationShotIds.has(item.shotId))) {
    delete plan.wholeFilmBoardRecommendation;
    delete plan.provisionalWholeFilmBoardSelection;
    delete plan.wholeFilmExplorationReview;
  }
  for (const raw of (runtime.lookMasterRawReferences || []).filter((item) => explorationShotIds.has(item.shotId))) {
    delete raw.outputDuplicate;
    raw.selectionEligible = true;
    raw.status = "EXPLORATION_CANDIDATE";
  }
  const stagedArchitecture = compileWholeFilmVisualArchitecture(staged, {now});
  const finalized = finalizeWholeFilmLookMasterBatch(staged, stagedArchitecture.coveragePlan, {
    now,
    semanticReviewRequired: true,
    semanticReviewReason,
    semanticReviewFindings,
  });
  let next = finalized.workspace;
  const outputDeduplication = compileWholeFilmExplorationOutputDeduplication(next, {shotIds: [...explorationShotIds]});
  for (const plan of next.production.shotIntelligence.packageLookMasterPlans.filter((item) => explorationShotIds.has(item.shotId))) {
    const shotDeduplication = outputDeduplication.byShot.find((item) => item.shotId === plan.shotId);
    if (!plan.wholeFilmExplorationReview || !shotDeduplication) continue;
    plan.wholeFilmExplorationReview.candidates = shotDeduplication.uniqueCandidates.map((candidate) => ({
      candidateId: `exploration-${candidate.jobId}`,
      directionId: candidate.directionId,
      directionFingerprint: candidate.directionFingerprint,
      artifact: candidate.artifact,
      generationJobId: candidate.jobId,
      explorationOnly: true,
    }));
    plan.wholeFilmExplorationReview.duplicates = shotDeduplication.duplicates;
    plan.wholeFilmExplorationReview.actualUniqueCandidateCount = shotDeduplication.uniqueCandidates.length;
    plan.wholeFilmExplorationReview.duplicateCandidateCount = shotDeduplication.duplicates.length;
  }
  for (const duplicate of outputDeduplication.duplicates) {
    const job = next.production.generation.jobs.find((item) => item.id === duplicate.jobId);
    if (job) {
      job.outputDuplicate = duplicate;
      job.selectionEligible = false;
      job.reviewStatus = duplicate.scope === "SAME_SHOT" ? "OUTPUT_DUPLICATE_HISTORY_ONLY" : "OUTPUT_DUPLICATE_CROSS_SHOT_ANOMALY";
    }
  }
  next.production.shotIntelligence.wholeFilmBatchRecommendation.outputDeduplication = {
    contract: outputDeduplication.contract,
    actualJobCount: outputDeduplication.actualJobCount,
    actualUniqueCandidateCount: outputDeduplication.actualUniqueCandidateCount,
    duplicateCandidateCount: outputDeduplication.duplicateCandidateCount,
    duplicates: outputDeduplication.duplicates,
    shortageByShot: outputDeduplication.byShot
      .filter((item) => item.uniqueCandidates.length < item.requiredCandidateCount)
      .map((item) => ({shotId: item.shotId, actualUniqueCandidateCount: item.uniqueCandidates.length, requiredCandidateCount: item.requiredCandidateCount, duplicateCandidateCount: item.duplicates.length})),
  };
  next.production.shotIntelligence.wholeFilmBatchRecommendation.exceptions.push(...outputDeduplication.duplicates.map((duplicate) => ({
    shotId: duplicate.shotId,
    code: duplicate.scope === "SAME_SHOT" ? "LOOK_MASTER_OUTPUT_DUPLICATE_SAME_SHOT" : "LOOK_MASTER_OUTPUT_DUPLICATE_CROSS_SHOT_ANOMALY",
    artifactSha256: duplicate.artifactSha256,
    duplicateOfShotId: duplicate.duplicateOfShotId,
    duplicateOfDirectionId: duplicate.duplicateOfDirectionId,
    explorationOnly: true,
    immediateRegenerationAllowed: false,
  })));
  const architecture = compileWholeFilmVisualArchitecture(next, {now});
  next.production.filmArtDirection = architecture.artDirection;
  next.production.shotVisualCoveragePlan = architecture.coveragePlan;
  next.production.wholeFilmGenerationReadiness = architecture.generationReadiness;
  next.production.visualProductionRun = architecture.productionRun;
  next.production.wholeFilmPackagingDirection = compileWholeFilmPackagingDirection(next, {now, singleWriterTaskId, architecture});
  const event = createProductionEvent({
    workspace: current,
    action: "whole-film-look-master-semantic-review-required",
    targetId: runtime.sha256,
    payload: {
      generatedCandidateJobCount: current.production.generation.jobs.filter((job) => job.targetKind === "package-look-master" && job.completedAt >= "2026-08-05T12:03:00.000Z").length,
      semanticReviewReason,
      semanticReviewFindings,
      explorationOnly: true,
      autoRecommendationAllowed: false,
      assemblyCreationAllowed: false,
      layerReconstructionAllowed: false,
      criticAllowed: false,
      motionAllowed: false,
      singleWriterTaskId,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  const explorationReviews = next.production.shotIntelligence.packageLookMasterPlans
    .filter((plan) => explorationShotIds.has(plan.shotId))
    .map((plan) => plan.wholeFilmExplorationReview)
    .filter(Boolean);
  const report = {
    contract: "A1WholeFilmLookMasterSemanticReviewRequired/v1",
    status: "SEMANTIC_REVIEW_REQUIRED",
    explorationOnly: true,
    generatedCandidateJobCount: current.production.generation.jobs.filter((job) => job.targetKind === "package-look-master" && job.completedAt >= "2026-08-05T12:03:00.000Z").length,
    actualUniqueCandidateCount: outputDeduplication.actualUniqueCandidateCount,
    duplicateCandidateCount: outputDeduplication.duplicateCandidateCount,
    uniqueCountsByShot: explorationReviews.map((review) => ({shotId: review.shotId, actualUniqueCandidateCount: review.actualUniqueCandidateCount, requiredCandidateCount: review.requiredCandidateCount, duplicateCandidateCount: review.duplicateCandidateCount})),
    duplicateFindings: outputDeduplication.duplicates,
    semanticReviewReason,
    semanticReviewFindings,
    autoRecommendationAllowed: false,
    assemblyCreationAllowed: false,
    layerReconstructionAllowed: false,
    criticAllowed: false,
    motionAllowed: false,
    queue: next.production.generation.summary,
    workspaceSha256Before: current.workspaceSha256,
    workspaceSha256After: next.workspaceSha256,
    singleWriterTaskId,
    appliedAt: now,
  };
  persistProjectState(appRoot, next, {event, files: {"whole-film-look-master-semantic-review-required-v1.json": report}});
  return {workspace: next, report};
});

console.log(JSON.stringify({
  status: result.report.status,
  generatedCandidateJobCount: result.report.generatedCandidateJobCount,
  actualUniqueCandidateCount: result.report.actualUniqueCandidateCount,
  duplicateCandidateCount: result.report.duplicateCandidateCount,
  queue: result.report.queue,
  currentStage: result.workspace.production.authority?.currentStage,
  nextAction: result.workspace.production.authority?.nextAction,
  workspaceSha256: result.workspace.workspaceSha256,
  singleWriterTaskId,
}, null, 2));
