#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = readProjectWorkspace(path.join(root, "apps/studio-next"));
const production = workspace.production;
const actualShotCount = workspace.library.assets.filter((asset) => asset.route === "shot-composition").length;
const canonicalPackageShotIds = production.canonicalCreatorPackagingSequence.decisions
  .filter((decision) => decision.packageDecision === "PACKAGE")
  .map((decision) => decision.shotId);
const compilerSource = fs.readFileSync(path.join(root, "apps/studio-next/src/lib/a1-whole-film-packaging-direction-v1.mjs"), "utf8");
const surfaceSource = fs.readFileSync(path.join(root, "apps/studio-next/src/app/system-line-visual-workbench/PackagingWorkbenchSurface.tsx"), "utf8");

assert.equal(production.filmArtDirection?.contract, "A1FilmArtDirection/v1");
assert.equal(production.shotVisualCoveragePlan?.contract, "A1ShotVisualCoveragePlan/v1");
assert.equal(production.visualProductionRun?.contract, "A1VisualProductionRun/v1");
assert.equal(production.wholeFilmPackagingDirection?.authorityMode, "DERIVED_COMPATIBILITY_VIEW");
assert.equal(production.shotVisualCoveragePlan?.shotPlans.length, actualShotCount);
assert.equal(production.visualProductionRun?.tasks.length, actualShotCount);
assert.equal(production.shotVisualCoveragePlan?.counts.shotCount, actualShotCount);
assert.ok(["HISTORY_READ_ONLY", "DERIVED_FROM_SHOT_VISUAL_COVERAGE_PLAN"].includes(production.packagingBeatPlan?.authorityScope));
assert.equal(production.packagingBeatPlan?.current, false);
assert.equal(production.packagingReview?.current, false);
assert.equal(production.visualProductionRun?.counts.runningCount, 0);
assert.equal(workspace.summary.queuedJobCount, 0);
assert.equal(workspace.summary.runningJobCount, 0);
assert.equal(production.generation.workerStatus, "frozen");
assert.equal(production.visualProductionRun?.queuePolicy.hardMaximumConcurrency, 2);
assert.equal(production.visualProductionRun?.status, "WHOLE_FILM_STATIC_BOARD_READY");
assert.equal(production.visualProductionRun?.counts.preparingInputCount, 0);
assert.equal(production.visualProductionRun?.counts.candidatesReadyCount, 0);
assert.equal(production.visualProductionRun?.counts.completeCount, actualShotCount);
assert.equal(production.visualProductionRun?.counts.coverageOnlyCount, 0);
assert.equal(production.visualProductionRun?.counts.packageTaskCount, canonicalPackageShotIds.length);
assert.equal(production.shotIntelligence?.wholeFilmBatchRecommendation?.assemblyCreationAllowed, false);
assert.equal(production.shotIntelligence?.wholeFilmBatchRecommendation?.layerReconstructionAllowed, false);
assert.deepEqual(production.packagingLifecycleProjection?.blockedShotIds, []);
assert.equal(production.packagingLifecycleProjection?.approvalAllowed, true);
assert.equal(production.visualProductionRun?.userApprovalPolicy.perShotApprovalRequired, false);
assert.equal(production.visualProductionRun?.userApprovalPolicy.wholeFilmStaticBoardApprovalRequired, true);
assert.doesNotMatch(compilerSource, /expectedShotCount\s*=\s*34/u);
assert.match(surfaceSource, /按字幕语义自动填满每一镜/u);
assert.match(surfaceSource, /全片画面已齐 · 统一看一次/u);
assert.match(surfaceSource, /data-a1-whole-film-static-board-review="true"/u);
assert.match(surfaceSource, /wholeFilmStaticBoard\.timelineBoard/u);
const ed23 = production.shotVisualCoveragePlan?.shotPlans.find((shot) => shot.shotId === "ED-23");
assert.equal(ed23?.route, "SCREEN_EVIDENCE");
assert.equal(ed23?.packageDecision, "NO_PACKAGE");
assert.equal(ed23?.packageDecisionBasis, "canonical-creator-packaging-sequence");
// Current verified screen evidence is allowed to present its bound source
// frame directly; SOURCE_COLLAGE remains the static-review route when a
// multi-source board is explicitly compiled.
assert.ok(["SOURCE_COLLAGE_STATIC_REVIEW", "VERIFIED_SCREEN_SOURCE"].includes(ed23?.preview?.kind));
if (ed23?.preview?.kind === "SOURCE_COLLAGE_STATIC_REVIEW") assert.equal(ed23?.preview?.presentationRoute, "SOURCE_COLLAGE");
if (ed23?.preview?.kind === "SOURCE_COLLAGE_STATIC_REVIEW") {
  assert.equal(ed23?.preview?.productionAdmission, false);
  assert.equal(ed23?.sourcePreview?.kind, "VERIFIED_SCREEN_SOURCE");
}
const ed01 = production.shotVisualCoveragePlan?.shotPlans.find((shot) => shot.shotId === "ED-01");
assert.equal(ed01?.route, "PACKAGE_LOOK_MASTER");
assert.equal(ed01?.contentTreatment, "HERO_TYPOGRAPHY");
assert.deepEqual(ed01?.protectedPhrases, ["智能写作工作台"]);

console.log(JSON.stringify({
  status: "PASS",
  articleDrivenShotCount: actualShotCount,
  contracts: [production.filmArtDirection.contract, production.shotVisualCoveragePlan.contract, production.visualProductionRun.contract],
  packagingEventPlan: "DERIVED_PRODUCTION_INPUT",
  canonicalCounts: {shots: actualShotCount, package: canonicalPackageShotIds.length, noPackage: actualShotCount - canonicalPackageShotIds.length},
  blockedShotIds: production.packagingLifecycleProjection.blockedShotIds,
  generationQueue: {queued: workspace.summary.queuedJobCount, running: workspace.summary.runningJobCount, worker: production.generation.workerStatus},
  perShotApprovalRequired: false,
}, null, 2));
