#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertBackgroundLibraryUserDecision,
  assertBackgroundSupplyPlan,
  assertBackgroundVarietyBatchPlan,
  assertEditorialVideoCompositionGrammar,
  deriveBackgroundCoverageFloor,
} from "../apps/studio-next/src/lib/a1-video-composition-background-supply-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const laneRoot = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/article-asset-background-lane-v1");
const read = (name) => JSON.parse(fs.readFileSync(path.join(laneRoot, name), "utf8"));
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const grammar = assertEditorialVideoCompositionGrammar(read("video-composition-grammar.json"));
const decision = assertBackgroundLibraryUserDecision(read("user-library-decision.json"));
const supply = assertBackgroundSupplyPlan(read("background-supply-plan.json"));
const batch = assertBackgroundVarietyBatchPlan(read("next-variety-batch-plan.json"));
const immutablePixelReview = read("actual-pixel-review.json");
const floor = deriveBackgroundCoverageFloor(workspace);
const backgroundAuthority = workspace.production.articleAssetProductionAuthority
  || workspace.production.articleAssetProductionAuthorityHistory?.sourceAuthority;

assert.equal(grammar.referenceBoundary.purpose, "VIDEO_CONSTRUCTION_AND_PACKAGING_SCHEDULING_ONLY");
assert.equal(grammar.referenceBoundary.aestheticReferenceAllowed, false);
assert.equal(grammar.referenceBoundary.currentStyleAuthority, "pinterest-retro-pixel-v1");
assert.equal(grammar.currentFilm.shotSchedule.length, workspace.article.shotCount);
assert.deepEqual(grammar.currentFilm.facelessRerouteShotIds, [], "verified presenter footage must not be treated as faceless reroute debt");
assert.deepEqual(grammar.currentFilm.verifiedPresenterShotIds, ["ED-01", "ED-07", "ED-08", "ED-11", "ED-13", "ED-15", "ED-18", "ED-19", "ED-31", "ED-32", "ED-33"]);
assert.equal(grammar.currentFilm.shotSchedule.find((item) => item.shotId === "ED-31").structuralCarrier, "PRESENTER_INTEGRATED_PACKAGE");
assert.equal(grammar.currentFilm.shotSchedule.find((item) => item.shotId === "ED-32").structuralCarrier, "PRESENTER_CLEAN");
assert.equal(grammar.currentFilm.shotSchedule.filter((item) => item.structuralCarrier === "PRESENTER_CLEAN").length, 6);
assert.equal(grammar.referenceBoundary.generatedSpecificPersonDefaultAllowed, false);
assert.equal(grammar.referenceBoundary.verifiedPresenterSourceAllowed, true);
assert.ok(Object.keys(grammar.currentFilm.sceneCarrierCounts).length >= 4, "whole-film construction must rotate multiple semantic carriers");
assert.ok(grammar.currentFilm.shotSchedule.every((item) => item.aestheticAuthority === "pinterest-retro-pixel-v1"));
assert.equal(decision.decisions.length, 2);
assert.ok(decision.decisions.every((item) => item.currentDirectionApproved === true && item.assignedToShot === false));
assert.equal(supply.countPolicy.minimumCoverageFloor, floor.minimumCoverageFloor);
assert.equal(supply.countPolicy.maximumCount, null);
assert.equal(supply.countPolicy.floorIsCompletionTarget, false);
assert.equal(supply.countPolicy.deriveFromDensityProfileCount, false);
assert.equal(supply.countPolicy.anchorSampleLimitIsAssetCount, false);
assert.equal(supply.coverage.laneComplete, false);
assert.equal(supply.reusePolicy.sameAssetAdjacentPackageEventsAllowed, false);
assert.equal(batch.batch.requiresAnotherUserAuthorization, false);
assert.equal(batch.batch.imageGenerationPerformed, false);
assert.equal(batch.structureReferenceUse, "STRUCTURE_ONLY_NOT_AESTHETICS");
assert.ok(batch.requests.every((item) => item.textFree === true && item.peopleFree === true));
assert.equal(backgroundAuthority.status, "BACKGROUND_LIBRARY_WAVE_READY_FOR_USER_REVIEW");
assert.equal(backgroundAuthority.authorization.nextAction, "REVIEW_DEFAULT_LIBRARY_BACKGROUND_WAVE");
assert.equal(backgroundAuthority.authorization.requiresUser, true);
assert.equal(backgroundAuthority.nextBackgroundVarietyBatchReview.candidateCount, supply.countPolicy.minimumCoverageFloor);
assert.equal(backgroundAuthority.nextBackgroundVarietyBatchReview.readyForReviewCount, supply.countPolicy.minimumCoverageFloor);
assert.equal(backgroundAuthority.candidateReview.candidates.filter((item) => item.currentDirectionApproved === false).length, 2, "immutable machine review must remain unchanged");
assert.deepEqual(backgroundAuthority.candidateReview, immutablePixelReview, "background authority must reference the immutable actual-pixel review without rewriting it");
assert.equal(backgroundAuthority.backgroundLibraryUserDecision.decisions.filter((item) => item.currentDirectionApproved === true).length, 2);

console.log(JSON.stringify({status: "PASS", contract: supply.contract, approvedUsableCount: supply.coverage.approvedDistinctCount, coverageFloor: supply.countPolicy.minimumCoverageFloor, maximumCount: supply.countPolicy.maximumCount, nextBatchRoleIds: batch.requests.map((item) => item.roleId), structureReferenceUse: batch.structureReferenceUse}, null, 2));
