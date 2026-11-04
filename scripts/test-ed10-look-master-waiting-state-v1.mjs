#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {packagingReviewBinding} from "../apps/studio-next/src/lib/a1-packaging-review-controller-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspaceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const reportFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/report.json");
const beforeBytes = fs.readFileSync(workspaceFile);
const beforeFileSha256 = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const workspace = JSON.parse(beforeBytes.toString("utf8"));
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const runtime = workspace.production.shotIntelligence;
const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const oldRecipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10" && item.current === false && item.authorityScope === "HISTORY_READ_ONLY");
const currentRecipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10" && item.status !== "HISTORY_READ_ONLY" && item.current !== false);
const lifecycle = workspace.production.packagingLifecycleProjection;
const canonicalPackageShotIds = workspace.production.canonicalCreatorPackagingSequence.decisions
  .filter((decision) => decision.packageDecision === "PACKAGE")
  .map((decision) => decision.shotId);

assert.equal(lifecycle.status, "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
assert.equal(workspace.production.packagingReview.authorityScope, "SHOT_LOCAL_HISTORY");
assert.equal(workspace.production.packagingReview.advisoryOnly, true);
assert.equal(workspace.production.packagingReview.attention?.attentionKind, "WHOLE_FILM_STATIC_ASSEMBLY");
assert.equal(workspace.production.packagingReview.attention?.requiresUser, false);
assert.equal(plan.status, "PLAN_READY");
assert.equal(workspace.production.authority.currentStage, "creator-packaging-candidate-decision-required");
assert.equal(workspace.production.authority.nextAction.id, "adopt-ed-19-c4-or-reject-and-hold");
assert.equal(workspace.production.authority.nextAction.requiresUser, true);
assert.deepEqual(workspace.production.authority.nextAction.targetShotIds, ["ED-19"]);
assert.deepEqual(runtime.wholeFilmBatchRecommendation.finalizedShotIds, canonicalPackageShotIds);
assert.equal(runtime.wholeFilmBatchRecommendation.assemblyCreationAllowed, false);
assert.equal(runtime.wholeFilmBatchRecommendation.layerReconstructionAllowed, false);
assert.ok(canonicalPackageShotIds.includes("ED-10"), "ED-10 must remain the bounded full-frame verdict beat");
assert.equal(runtime.wholeFilmBatchRecommendation.candidateAuthorityAudit.items.find((item) => item.shotId === "ED-10")?.status, "PASS");
assert.deepEqual(lifecycle.blockers, ["CURRENT_PACKAGE_CANDIDATE_ADOPTION_REQUIRED"]);
assert.notEqual(lifecycle.approvalAllowed, true);
assert.equal(lifecycle.reviewActionDisabled, false);
assert.equal(currentRecipe, undefined);
assert.equal(oldRecipe?.status, "HISTORY_READ_ONLY");
assert.equal(kit?.authorityScope, "HISTORY_READ_ONLY");
assert.equal(kit?.layers?.reduce((sum, layer) => sum + (layer.candidates?.length || 0), 0), 0);

const binding = packagingReviewBinding(workspace, "ED-10");
assert.equal(binding.currentAssembly.length, 0);

assert.equal(report.workspaceSha256, workspace.workspaceSha256);
assert.equal(report.status, "PACKAGING_LANE_CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
assert.equal(report.packagingLaneSummary?.status, "CREATOR_PACKAGING_PALETTE_BINDING_BLOCKED");
assert.equal(report.packagingLaneSummary?.currentAssemblyArtifactCount, 0);
assert.equal(report.summary?.lookMasterRecoveredCandidateRecords?.length, 0);

assert.equal(workspace.summary.queuedJobCount, 0);
assert.equal(workspace.summary.runningJobCount, 0);
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");

const afterFileSha256 = crypto.createHash("sha256").update(fs.readFileSync(workspaceFile)).digest("hex");
assert.equal(afterFileSha256, beforeFileSha256, "final-assembly waiting regression must not mutate current workspace authority");

console.log(JSON.stringify({
  status: "PASS",
  test: "current-minimal-whole-film-static-board-waiting-state-v1",
  workspaceSha256: workspace.workspaceSha256,
  workspaceFileSha256: beforeFileSha256,
  canonicalPackageShotIds,
  blockers: lifecycle.blockers,
  currentAssemblyCount: 0,
  oldRecipe: {status: oldRecipe.status, current: oldRecipe.current},
  layerCandidateCount: 0,
  queue: {queued: 0, running: 0, workerStatus: workspace.production.generation.workerStatus},
  workspaceAuthorityUnchanged: true,
}, null, 2));
