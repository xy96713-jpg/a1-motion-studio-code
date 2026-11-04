#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {buildActivePackagingPolicy, derivePackagingAttentionDecision} from "../apps/studio-next/src/lib/a1-active-packaging-policy-v1.mjs";
import {applyAutomaticSafeLookMasterSelection, planIdentity} from "../apps/studio-next/src/lib/a1-package-look-master-v1.mjs";
import {buildVideoPackagingContext} from "../apps/studio-next/src/lib/a1-video-packaging-context-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspaceFile = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const beforeBytes = fs.readFileSync(workspaceFile);
const beforeSha256 = crypto.createHash("sha256").update(beforeBytes).digest("hex");
const workspace = JSON.parse(beforeBytes.toString("utf8"));

function pendingFixture() {
  const runtime = structuredClone(workspace.production.shotIntelligence);
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const sourceContext = runtime.videoPackagingContexts.items.find((item) => item.shotId === "ED-10");
  const currentDecision = runtime.decisionSet.items.find((item) => item.shotId === "ED-10");
  // ED-10 is intentionally a clean-presenter breathing beat in the current
  // film. Keep this unit fixture explicitly package-scoped so it tests the
  // attention policy without re-promoting ED-10 in live authority.
  const decision = {
    ...currentDecision,
    packageDecision: "PACKAGE",
    assemblyMode: plan.assemblyMode,
    presentationMode: plan.presentationMode,
  };
  const demand = workspace.library.assets.find((asset) => asset.shotDemand?.shotId === "ED-10")?.shotDemand;
  const fixtureContext = buildVideoPackagingContext({
    decision,
    demand,
    holdFrame: sourceContext.baseFrame,
    subjectBounds: {x: 0.58, y: 0.08, width: 0.34, height: 0.84, semanticRole: "test-presenter-face-and-body", status: "TEST_DECLARED"},
    safeZones: [{id: "test-caption-safe-zone", x: 0.04, y: 0.05, width: 0.3, height: 0.28, semanticRole: "editor-caption-safe-zone"}],
    visualAnchors: sourceContext.visualAnchors,
    createdAt: "2026-08-05T00:00:00.000Z",
  });
  plan.videoContext = fixtureContext;
  plan.planSha256 = crypto.createHash("sha256").update(JSON.stringify(planIdentity(plan))).digest("hex");
  const fixtureCandidates = [
    "direction-01",
    "direction-02",
    "direction-03",
    "direction-04",
  ].map((directionId) => {
    const artifactSha256 = crypto.createHash("sha256").update(`attention-policy-fixture:${directionId}`).digest("hex");
    const artifact = {
      publicUrl: `/generated/system-line/test-fixtures/${artifactSha256}.png`,
      sha256: artifactSha256,
      width: 960,
      height: 540,
      mimeType: "image/png",
      workspaceImported: true,
    };
    return {
      contract: "A1FastLookMasterExplorationCandidate/v1",
      candidateId: `fixture-ed-10-${directionId}`,
      shotId: "ED-10",
      directionId,
      artifact,
      provenance: {generationJobContract: "A1AssetGenerationJob/v2", generationJobId: `fixture-${directionId}`},
      candidateDirection: {directionId},
      compositePreview: {publicUrl: artifact.publicUrl, sha256: artifact.sha256},
      lightChecks: {
        decode: "PASS",
        dimensions: "PASS",
        baseFrameComposite: "PASS",
        subjectOcclusion: "UNVERIFIED_SUBJECT_BOUNDS",
        ocrExact: directionId === "direction-02" ? "PASS" : "FAIL",
        remoteCritic: "SKIPPED_BY_FAST_DISCOVERY",
      },
      userVisualDisposition: "USER_SCREENED_SHORTLIST",
    };
  });
  const activeIds = new Set(fixtureCandidates.map((candidate) => candidate.candidateId));
  runtime.status = "LOOK_MASTER_REVIEW_REQUIRED";
  runtime.packageAssemblyRecipes = runtime.packageAssemblyRecipes.filter((recipe) => recipe.shotId !== "ED-10" || recipe.status === "HISTORY_READ_ONLY" || recipe.current === false);
  plan.status = "LOOK_MASTER_REVIEW_REQUIRED";
  plan.recommendation = null;
  plan.reviewDecision = null;
  plan.selectedLookMasterId = null;
  plan.selectedLookMasterBinding = null;
  plan.currentCandidateSource = {...plan.currentCandidateSource, status: "RECOVERED_EXISTING_LOOK_MASTER_CANDIDATES", selectedCandidateId: null, selectedDirectionId: null};
  plan.explorationCandidates = fixtureCandidates;
  plan.activeCandidateSet = {status: "PENDING_USER_LOOK_MASTER_REVIEW", candidateIds: [...activeIds], directionIds: fixtureCandidates.map((candidate) => candidate.directionId), selectedCandidateId: null, selectedDirectionId: null, recommendationStatus: "USER_SCREENED_SHORTLIST_PENDING_FINAL_CONFIRMATION"};
  plan.fastCandidateDiscovery = {status: "LOOK_MASTER_REVIEW_REQUIRED", candidates: fixtureCandidates, recommendationStatus: "USER_SCREENED_SHORTLIST_PENDING_FINAL_CONFIRMATION", recommendedCandidateId: null, recommendedDirectionId: null};
  kit.status = "WAITING_FOR_LOOK_MASTER";
  kit.selectedLookMasterBinding = null;
  for (const layer of kit.layers) {
    layer.candidates = [];
    layer.selectedCandidateId = null;
  }
  return {runtime, plan};
}

const policy = buildActivePackagingPolicy({now: "2026-08-05T00:00:00.000Z"});
assert.equal(policy.userAttentionPolicy.mode, "EXCEPTION_ONLY");
assert.equal(policy.userAttentionPolicy.routinePerEventApprovalRequired, false);
assert.equal(policy.lookMasterIntermediateApprovalRequired, false);
assert.equal(policy.finalAssembly.userApprovalRequired, true);

const safeFixture = pendingFixture();
const safeAttention = derivePackagingAttentionDecision(safeFixture.runtime, safeFixture.plan);
assert.equal(safeAttention.status, "AUTO_CONTINUE");
assert.equal(safeAttention.requiresUser, false);
assert.equal(safeAttention.recommendedDirectionId, "direction-02");

const selected = applyAutomaticSafeLookMasterSelection(safeFixture.runtime, {shotId: "ED-10", now: "2026-08-05T00:01:00.000Z"});
const selectedPlan = selected.runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const selectedKit = selected.runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const selectedCandidate = selectedPlan.explorationCandidates.find((candidate) => candidate.candidateId === selectedPlan.activeCandidateSet.selectedCandidateId);
const activeRecipe = selected.runtime.packageAssemblyRecipes.find((recipe) => recipe.shotId === "ED-10" && recipe.status !== "HISTORY_READ_ONLY" && recipe.current !== false);
assert.equal(selectedPlan.activeCandidateSet.selectedDirectionId, "direction-02");
assert.equal(selectedPlan.selectedLookMasterBinding.selectedBy, "system");
assert.equal(activeRecipe.assemblyComposite.sha256, selectedCandidate.artifact.sha256);
assert.equal(activeRecipe.assemblySource.mode, "IMAGEGEN_APPROVED_LOOK_MASTER");
assert.equal(activeRecipe.assemblySource.localSecondDesignPerformed, false);
assert.equal(selectedKit.layers.reduce((count, layer) => count + layer.candidates.length, 0), 0);
const finalAssemblyAttention = derivePackagingAttentionDecision(selected.runtime, selectedPlan);
assert.equal(finalAssemblyAttention.requiresUser, true);
assert.equal(finalAssemblyAttention.attentionKind, "FINAL_ASSEMBLY");

const ambiguousFixture = pendingFixture();
const c04 = ambiguousFixture.plan.explorationCandidates.find((candidate) => candidate.directionId === "direction-04");
c04.lightChecks.ocrExact = "PASS";
const ambiguousAttention = derivePackagingAttentionDecision(ambiguousFixture.runtime, ambiguousFixture.plan);
assert.equal(ambiguousAttention.requiresUser, true);
assert.equal(ambiguousAttention.attentionKind, "AMBIGUOUS_SAFE_RECOMMENDATION");

const copyFixture = pendingFixture();
for (const candidate of copyFixture.plan.explorationCandidates.filter((candidate) => copyFixture.plan.activeCandidateSet.candidateIds.includes(candidate.candidateId))) candidate.lightChecks.ocrExact = "FAIL";
const copyAttention = derivePackagingAttentionDecision(copyFixture.runtime, copyFixture.plan);
assert.equal(copyAttention.requiresUser, true);
assert.equal(copyAttention.attentionKind, "EXACT_COPY_ANOMALY");

const releaseAttention = derivePackagingAttentionDecision(copyFixture.runtime, copyFixture.plan, {finalReleaseReviewRequired: true});
assert.equal(releaseAttention.requiresUser, true);
assert.equal(releaseAttention.attentionKind, "FINAL_RELEASE");

const afterSha256 = crypto.createHash("sha256").update(fs.readFileSync(workspaceFile)).digest("hex");
assert.equal(afterSha256, beforeSha256, "attention-policy regression must not mutate workspace state");

console.log(JSON.stringify({
  status: "PASS",
  test: "packaging-attention-policy-v1",
  normalRoute: "AUTO_CONTINUE_DIRECTION_02",
  interruptions: ["EXACT_COPY_ANOMALY", "AMBIGUOUS_SAFE_RECOMMENDATION", "FINAL_ASSEMBLY", "FINAL_RELEASE"],
  directMasterAssembly: true,
  localSecondDesignForbidden: true,
  layerCandidatesBeforeApproval: 0,
  workspaceAuthorityUnchanged: true,
}, null, 2));
