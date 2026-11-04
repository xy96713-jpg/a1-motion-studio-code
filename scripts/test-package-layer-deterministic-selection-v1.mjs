#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  A1_PACKAGE_LAYER_SELECTION_EVIDENCE_CONTRACT,
  assertPackageAssemblyRecipe,
  buildDeterministicLayerSelectionEvidence,
} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const workspace = JSON.parse(fs.readFileSync(path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json"), "utf8"));
const runtime = workspace.production.shotIntelligence;
const plan = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
assert.ok(plan && recipe, "ED-10 historical plan/recipe fixture exists");
assert.equal(plan.current, false);
assert.equal(recipe.current, false);
assert.equal(recipe.status, "HISTORY_READ_ONLY");
const presenterFirst = recipe.assemblySource?.mode === "IMAGEGEN_INTEGRATED_PRESENTER_FRAME";
const selectionIds = presenterFirst ? recipe.prePresenterFirstLayerSelection?.layerCandidateIds : recipe.layerCandidateIds;

const evidence = buildDeterministicLayerSelectionEvidence(plan, {
  selectedCandidateIds: selectionIds,
  useSelectedAsRecommendation: true,
});
assert.equal(evidence.contract, A1_PACKAGE_LAYER_SELECTION_EVIDENCE_CONTRACT);
assert.equal(evidence.selectionMode, "DETERMINISTIC_HEURISTIC");
assert.equal(evidence.status, "RECOMMENDATION_HEURISTIC_ONLY");
assert.equal(evidence.recommendationStatus, "CURRENT_ASSEMBLY_RECOMMENDATION_WITH_ADVISORY_ALTERNATIVES");
assert.equal(evidence.reason.includes("critic"), true);
assert.deepEqual(evidence.selectedCandidateIds, selectionIds, "deterministic evidence preserves the explicitly supplied selection");
assert.equal(evidence.layers.length, 4);
assert.ok(evidence.layers.every((layer) => Array.isArray(layer.candidateScores)), "every slot has score evidence");
assert.equal(evidence.layers.find((layer) => layer.layerKind === "TYPOGRAPHY").selectedAlternatives.length, 0, "master-preservation plans must not expose second-design alternatives");
assert.equal(evidence.recommendedCandidateIds.TYPOGRAPHY, evidence.selectedCandidateIds.TYPOGRAPHY);
assert.equal(evidence.recommendedCandidateIds.ELEMENT_KIT, evidence.selectedCandidateIds.ELEMENT_KIT);
for (const layer of evidence.layers) {
  if (layer.route === "NONE") assert.equal(layer.recommendedCandidateId, null);
  for (const score of layer.candidateScores) {
    assert.equal(typeof score.safetyScore, "number");
    assert.equal(typeof score.tensionScore, "number");
    assert.ok(score.evidence?.exactOcr && score.evidence?.alphaVerified && score.evidence?.dimensionFit && score.evidence?.semanticTopology && score.evidence?.videoSafety && score.evidence?.styleBinding && score.evidence?.crossLayerConflict && score.evidence?.variantDiversity, `complete evidence for ${layer.layerKind}`);
  }
}
assertPackageAssemblyRecipe(plan, recipe);
if (presenterFirst) {
  assert.deepEqual(recipe.layerCandidateIds, {BACKGROUND: null, TYPOGRAPHY: null, ELEMENT_KIT: null, ILLUSTRATION: null});
  assert.equal(recipe.selectionEvidence, null);
  assert.equal(recipe.prePresenterFirstLayerSelection?.status, "HISTORY_READ_ONLY");
  assert.throws(() => assertPackageAssemblyRecipe(plan, {
    ...recipe,
    layerCandidateIds: {...recipe.layerCandidateIds, TYPOGRAPHY: "forged-typography-candidate"},
  }), /package-assembly-presenter-first-contract-invalid/);
  assert.equal(recipe.assemblyComposite?.relationship, "IMAGEGEN_COMPOSED_WITH_REAL_PRESENTER_FRAME");
} else {
  assertPackageAssemblyRecipe(plan, {...recipe, selectionEvidence: evidence, selectedAlternatives: evidence.selectedAlternatives, rejectedAlternatives: evidence.rejectedAlternatives});
  assert.throws(() => assertPackageAssemblyRecipe(plan, {
    ...recipe,
    layerCandidateIds: {...recipe.layerCandidateIds, TYPOGRAPHY: "forged-history-promotion"},
    selectionEvidence: evidence,
  }), /package-assembly-selection-current-binding-invalid/);
}
console.log(JSON.stringify({status: "PASS", presenterFirst, selectionMode: evidence.selectionMode, historicalSelected: evidence.selectedCandidateIds, recommended: evidence.recommendedCandidateIds, heuristicRecommended: evidence.heuristicRecommendedCandidateIds, alternativeCount: evidence.selectedAlternatives.length, currentAssemblyPreserved: true}, null, 2));
