#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {
  A1_FILM_ART_DIRECTION_CONTRACT,
  A1_SHOT_VISUAL_COVERAGE_PLAN_CONTRACT,
  A1_VISUAL_PRODUCTION_RUN_CONTRACT,
  A1_WHOLE_FILM_PACKAGING_DIRECTION_CONTRACT,
  assertFilmArtDirection,
  assertShotVisualCoveragePlan,
  assertVisualProductionRun,
  assertWholeFilmPackagingDirection,
  claimVisualProductionTasks,
  compileWholeFilmPackagingDirection,
  compileWholeFilmVisualArchitecture,
} from "../apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const now = "2026-08-05T04:00:00.000Z";
const currentShotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
const canonicalPackageShotIds = workspace.production.canonicalCreatorPackagingSequence.decisions
  .filter((decision) => decision.packageDecision === "PACKAGE")
  .map((decision) => decision.shotId);
const architecture = compileWholeFilmVisualArchitecture(workspace, {now});
const artDirection = assertFilmArtDirection(architecture.artDirection);
const coveragePlan = assertShotVisualCoveragePlan(architecture.coveragePlan, {expectedShotCount: currentShotCount});
const productionRun = assertVisualProductionRun(architecture.productionRun);
const direction = assertWholeFilmPackagingDirection(compileWholeFilmPackagingDirection(workspace, {now, singleWriterTaskId: "fixture", architecture}), {expectedShotCount: currentShotCount});

assert.equal(artDirection.contract, A1_FILM_ART_DIRECTION_CONTRACT);
assert.equal(coveragePlan.contract, A1_SHOT_VISUAL_COVERAGE_PLAN_CONTRACT);
assert.equal(productionRun.contract, A1_VISUAL_PRODUCTION_RUN_CONTRACT);
assert.equal(direction.contract, A1_WHOLE_FILM_PACKAGING_DIRECTION_CONTRACT);
assert.equal(direction.authorityMode, "DERIVED_COMPATIBILITY_VIEW");
assert.equal(coveragePlan.counts.shotCount, currentShotCount);
assert.equal(coveragePlan.counts.plannedShotCount, currentShotCount);
assert.equal(coveragePlan.counts.screenEvidenceCount + coveragePlan.counts.presenterBaseCount + coveragePlan.counts.lookMasterRequiredCount, currentShotCount);
assert.equal(coveragePlan.counts.lookMasterRequiredCount, canonicalPackageShotIds.length);
assert.equal(coveragePlan.counts.actualPackageReadyCount, canonicalPackageShotIds.length);
assert.equal(coveragePlan.counts.pendingLookMasterCount, 0);
assert.equal(coveragePlan.rhythmPhases.flatMap((phase) => phase.shotIds).length, currentShotCount);
assert.equal(new Set(coveragePlan.rhythmPhases.flatMap((phase) => phase.shotIds)).size, currentShotCount);
assert.equal(artDirection.artDirection.referencePack.id, "pinterest-retro-pixel-v1");
assert.equal(artDirection.artDirection.referencePack.selectedReferences.length, 8);
assert.equal(artDirection.artDirection.referencePack.applicationRole, "AESTHETIC_TRAIT_LIBRARY");
assert.equal(artDirection.artDirection.referencePack.fixedOutputStyle, false);
assert.equal(artDirection.artDirection.referencePack.semanticFamilyRoutingRequired, true);
assert.equal(artDirection.artDirection.aestheticSystem.sameAppearanceAcrossShotsForbidden, true);
assert.equal(artDirection.artDirection.aestheticSystem.fixedPaletteForbidden, true);
assert.equal(direction.reviewPolicy.perShotUserApprovalRequired, false);
assert.equal(direction.reviewPolicy.wholeFilmStaticAssemblyReviewRequired, true);
assert.equal(direction.reviewPolicy.layerExtractionBeforeWholeFilmAssemblyApproval, false);
assert.deepEqual(direction.reviewPolicy.userReviewMoments, ["WHOLE_FILM_STATIC_ASSEMBLY", "FINAL_RELEASE"]);
assert.equal(direction.productionPolicy.fixedShotCountForbidden, true);
assert.equal(productionRun.counts.taskCount, currentShotCount);
assert.equal(productionRun.queuePolicy.concurrency, 2);
assert.equal(productionRun.queuePolicy.hardMaximumConcurrency, 2);
assert.equal(productionRun.userApprovalPolicy.perShotApprovalRequired, false);
assert.equal(productionRun.status, "WHOLE_FILM_STATIC_BOARD_READY");
assert.equal(architecture.generationReadiness.counts.preparingInputCount, 0);
assert.equal(architecture.generationReadiness.counts.candidatesReadyCount, 0);
assert.equal(architecture.generationReadiness.counts.readyForGenerationCount, 0);

const ed10 = coveragePlan.shotPlans.find((shot) => shot.shotId === "ED-10");
assert.equal(ed10?.productionStatus, "ACTUAL_PACKAGE_READY");
assert.equal(ed10?.preview?.kind, "RECOMMENDED_LOOK_MASTER_PENDING_WHOLE_FILM_CONFIRMATION");
assert.equal(ed10?.route, "PACKAGE_LOOK_MASTER");
assert.equal(ed10?.packageDecision, "PACKAGE");
assert.equal(ed10?.packageDecisionBasis, "canonical-creator-packaging-sequence");
assert.equal(ed10?.layerReconstructionStarted, false);
for (const shotId of ["ED-08", "ED-33"]) {
  const breathingBeat = coveragePlan.shotPlans.find((shot) => shot.shotId === shotId);
  assert.equal(breathingBeat?.route, "PRESENTER_BASE");
  assert.equal(breathingBeat?.packageDecision, "NO_PACKAGE");
  assert.equal(breathingBeat?.actualVisualReady, true);
  assert.equal(breathingBeat?.preview?.kind, "VERIFIED_PRESENTER_SOURCE");
}
const ed17 = coveragePlan.shotPlans.find((shot) => shot.shotId === "ED-17");
assert.equal(ed17?.productionStatus, "ACTUAL_PACKAGE_READY");
assert.equal(ed17?.route, "PACKAGE_LOOK_MASTER");
assert.equal(ed17?.packageDecision, "PACKAGE");
assert.equal(ed17?.layerReconstructionStarted, false);
const ed01 = coveragePlan.shotPlans.find((shot) => shot.shotId === "ED-01");
const currentBoardEd01 = workspace.production.shotIntelligence.wholeFilmStaticBoard.items.find((shot) => shot.shotId === "ED-01");
assert.equal(ed01?.route, "PACKAGE_LOOK_MASTER");
assert.equal(ed01?.contentTreatment, "HERO_TYPOGRAPHY");
assert.equal(ed01?.presentationMode, "PRESENTER_NEGATIVE_SPACE_OVERLAY");
assert.deepEqual(ed01?.protectedPhrases, ["智能写作工作台"]);
assert.equal(ed01?.preview?.sha256, currentBoardEd01?.artifactSha256);
assert.equal(currentBoardEd01?.styleLineage?.compositeVisualAudit?.status, "PASS");
assert.equal(currentBoardEd01?.styleLineage?.compositeVisualAudit?.actualPixelsViewed, true);
assert.ok(currentBoardEd01?.textNodes?.length > 0);
assert.ok(currentBoardEd01.textNodes.every((node) => node.editable === true && node.generated === false && /^[a-f0-9]{64}$/u.test(node.fontSha256)));
assert.match(currentBoardEd01.textNodes.map((node) => node.text).join(""), /智能写作.*工作台/u);
assert.deepEqual(
  coveragePlan.shotPlans.filter((item) => item.route === "PACKAGE_LOOK_MASTER").map((item) => item.shotId),
  canonicalPackageShotIds,
);
assert.equal(coveragePlan.shotPlans.find((item) => item.shotId === "ED-15")?.route, "PRESENTER_BASE");
assert.equal(coveragePlan.shotPlans.find((item) => item.shotId === "ED-20")?.route, "SCREEN_EVIDENCE");
const ed23 = coveragePlan.shotPlans.find((item) => item.shotId === "ED-23");
assert.equal(ed23?.route, "SCREEN_EVIDENCE");
assert.equal(ed23?.packageDecision, "NO_PACKAGE");
assert.equal(ed23?.packageDecisionBasis, "canonical-creator-packaging-sequence");
assert.equal(ed23?.productionStatus, "SOURCE_CONTEXT_READY");
assert.equal(ed23?.preview?.kind, "VERIFIED_SCREEN_SOURCE");

const claimed = claimVisualProductionTasks(productionRun, {limit: 99, now: "2026-08-05T04:01:00.000Z"});
assert.equal(claimed.claimedTaskIds.length, Math.min(2, productionRun.counts.readyCount));
assert.equal(claimed.run.counts.runningCount, Math.min(2, productionRun.counts.readyCount));
assert.equal(productionRun.counts.runningCount, 0, "claiming must not mutate the persisted fixture");

function articleVariant(shotCount, suffix) {
  const cloned = structuredClone(workspace);
  let seen = 0;
  cloned.library.assets = cloned.library.assets.filter((asset) => {
    if (asset.route !== "shot-composition") return true;
    seen += 1;
    return seen <= shotCount;
  });
  cloned.article.title = `动态文章 ${suffix}`;
  cloned.article.shotCount = shotCount;
  cloned.article.sourceTextSha256 = crypto.createHash("sha256").update(cloned.article.title).digest("hex");
  cloned.visualBible.recurringMotif = `${suffix} 的文章专属视觉母题`;
  delete cloned.production.filmArtDirection;
  delete cloned.production.shotVisualCoveragePlan;
  delete cloned.production.visualProductionRun;
  delete cloned.production.wholeFilmPackagingDirection;
  return cloned;
}

for (const count of [5, 11]) {
  const variant = compileWholeFilmVisualArchitecture(articleVariant(count, `${count}-shots`), {now});
  assert.equal(variant.coveragePlan.counts.shotCount, count);
  assert.equal(variant.coveragePlan.shotPlans.length, count);
  assert.equal(variant.productionRun.tasks.length, count);
  assert.equal(variant.coveragePlan.rhythmPhases.flatMap((phase) => phase.shotIds).length, count);
  assert.match(variant.artDirection.directionName, new RegExp(`${count}-shots`));
}

console.log(JSON.stringify({
  status: "PASS",
  contracts: [artDirection.contract, coveragePlan.contract, productionRun.contract],
  currentArticleShotCount: currentShotCount,
  currentArticlePackageCount: coveragePlan.counts.lookMasterRequiredCount,
  dynamicArticleShotCounts: [5, 11],
  claimedConcurrency: claimed.run.counts.runningCount,
  perShotUserApprovalRequired: false,
  nextUserGate: null,
  aestheticReferenceRole: "AESTHETIC_TRAIT_LIBRARY",
  fixedOutputStyle: false,
}, null, 2));
