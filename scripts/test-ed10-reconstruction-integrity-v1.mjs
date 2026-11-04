#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {assertEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {deriveProductionAuthority} from "../apps/studio-next/src/lib/a1-editorial-production-authority-v1.mjs";
import {assertSelectedReconstructionBinding} from "../apps/studio-next/src/lib/a1-packaging-batch-ranked-controller-v1.mjs";

const workspace = assertEditorialAssetWorkbench(readProjectWorkspace(path.resolve("apps/studio-next")));
const runtime = workspace.production.shotIntelligence;
const derived = deriveProductionAuthority(workspace);
assert.equal(workspace.production.authority.currentStage, derived.currentStage, "persisted authority stage must equal deriveProductionAuthority");
assert.deepEqual(workspace.production.authority.nextAction, derived.nextAction, "persisted authority nextAction must equal deriveProductionAuthority");
assert.equal(workspace.status, `PACKAGING_LANE_${runtime.status}`, "root status must mirror the current packaging lane status");
assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);

const look = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
assert.ok(look && kit && recipe, "ED-10 reconstruction records are required");
assert.ok(["PASS", "REVISE", "BLOCK"].includes(recipe.finalAssemblyReview?.status), "parity must be a real server assessment");
const parityPassed = recipe.finalAssemblyReview.status === "PASS";
const expectedAssemblyStage = parityPassed ? "ASSEMBLY_REVIEW_REQUIRED" : "ASSEMBLY_PARITY_REVIEW_REQUIRED";
assert.equal(runtime.status, expectedAssemblyStage);
assert.equal(recipe.status, expectedAssemblyStage);
assertSelectedReconstructionBinding({plan: look, kitPlan: kit, recipe});

const selected = look.selectedLookMasterBinding;
const identity = {
  directionId: selected.directionId,
  masterSha256: selected.artifactSha256,
  comparativeReviewSha256: selected.comparativeReviewSha256,
};
assert.equal(kit.reconstructionSource.directionId, identity.directionId);
assert.equal(kit.reconstructionSource.selectedMasterSha256, identity.masterSha256);
assert.equal(kit.reconstructionSource.comparativeReviewSha256, identity.comparativeReviewSha256);
for (const layer of kit.layers) {
  for (const candidate of layer.candidates) {
    assert.equal(candidate.provenance?.deterministicBuild?.sourceMasterSha256, identity.masterSha256, `${layer.kind} source master drift`);
    assert.equal(candidate.provenance?.deterministicBuild?.buildKey, kit.reconstructionCompilation?.buildKey || candidate.provenance.deterministicBuild.buildKey);
  }
}
assert.equal(recipe.selectedLookMasterBinding.directionId, identity.directionId);
assert.equal(recipe.selectedLookMasterBinding.artifactSha256, identity.masterSha256);
assert.equal(recipe.selectedLookMasterBinding.comparativeReviewSha256, identity.comparativeReviewSha256);
assert.equal(recipe.reconstructionSource.directionId, identity.directionId);
assert.equal(recipe.reconstructionSource.selectedMasterSha256, identity.masterSha256);
assert.equal(recipe.reconstructionSource.comparativeReviewSha256, identity.comparativeReviewSha256);
for (const parity of [recipe.parityAudit, recipe.finalAssemblyReview]) {
  assert.equal(parity.selectedDirectionId, identity.directionId);
  assert.equal(parity.masterSha256 || parity.selectedLookMasterSha256 || parity.selectedMasterSha256, identity.masterSha256);
  assert.equal(parity.comparativeReviewSha256, identity.comparativeReviewSha256);
}

console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: workspace.workspaceSha256,
  authority: {stage: derived.currentStage, nextAction: derived.nextAction.id},
  rootStatus: workspace.status,
  selectedDirectionId: identity.directionId,
  selectedMasterSha256: identity.masterSha256,
  comparativeReviewSha256: identity.comparativeReviewSha256,
  layerKinds: kit.layers.filter((layer) => layer.candidates.length).map((layer) => layer.kind),
  parity: recipe.finalAssemblyReview.status,
}, null, 2));
