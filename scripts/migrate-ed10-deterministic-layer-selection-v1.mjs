#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildDeterministicLayerSelectionEvidence, assertPackageAssemblyRecipe} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");

const result = withProjectLock(appRoot, () => {
  // Read the raw current workspace first. The migration must be able to
  // introduce evidence before the normal assertion sees the legacy c1-only
  // recipe; it never changes the selected layer IDs or the Assembly artifact.
  const current = readProjectWorkspace(appRoot);
  const runtime = current.production?.shotIntelligence;
  const plan = runtime?.packageAssetKitPlans?.find((item) => item.shotId === "ED-10");
  const recipe = runtime?.packageAssemblyRecipes?.find((item) => item.shotId === "ED-10");
  if (!plan || !recipe) throw new Error("ed10-selection-evidence-current-binding-missing");
  const selectionEvidence = buildDeterministicLayerSelectionEvidence(plan, {
    selectedCandidateIds: recipe.layerCandidateIds || {},
    // Keep the already reviewable c1 Assembly as the current recommendation.
    // The heuristic winner remains visible, but is only advisory until a
    // deliberate local recomposite is requested.
    useSelectedAsRecommendation: true,
  });
  const next = structuredClone(current);
  const nextRecipe = next.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  nextRecipe.selectionEvidence = selectionEvidence;
  nextRecipe.selectedAlternatives = selectionEvidence.selectedAlternatives;
  nextRecipe.rejectedAlternatives = selectionEvidence.rejectedAlternatives;
  const recalculated = recalculateEditorialAssetWorkbench(next);
  const persistedRecipe = recalculated.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (JSON.stringify(persistedRecipe.layerCandidateIds) !== JSON.stringify(recipe.layerCandidateIds)) throw new Error("ed10-selection-migration-changed-current-assembly-selection");
  if (persistedRecipe.assemblyComposite?.sha256 !== recipe.assemblyComposite?.sha256) throw new Error("ed10-selection-migration-changed-assembly-artifact");
  assertPackageAssemblyRecipe(recalculated.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10"), persistedRecipe);
  assertEditorialAssetWorkbench(recalculated);
  const event = createProductionEvent({
    workspace: recalculated,
    action: "record-deterministic-layer-selection-evidence",
    targetId: "ED-10",
    payload: {
      contract: "A1DeterministicLayerSelectionEvidence/v1",
      selectionMode: selectionEvidence.selectionMode,
      status: selectionEvidence.status,
      selectedCandidateIds: selectionEvidence.selectedCandidateIds,
      recommendedCandidateIds: selectionEvidence.recommendedCandidateIds,
      evidenceSha256: selectionEvidence.evidenceSha256,
      assemblyPreserved: true,
      criticRun: false,
    },
  });
  persistProjectState(appRoot, recalculated, {event});
  return {
    status: "PASS",
    workspaceSha256: recalculated.workspaceSha256,
    recipeSha256: persistedRecipe.recipeSha256,
    assemblySha256: persistedRecipe.assemblyComposite?.sha256 || null,
    selectedCandidateIds: selectionEvidence.selectedCandidateIds,
    recommendedCandidateIds: selectionEvidence.recommendedCandidateIds,
    selectedAlternatives: selectionEvidence.selectedAlternatives.map((item) => ({layerKind: item.layerKind, candidateId: item.candidateId, score: item.score, safetyScore: item.safetyScore, tensionScore: item.tensionScore})),
    selectionEvidenceSha256: selectionEvidence.evidenceSha256,
  };
});

console.log(JSON.stringify(result, null, 2));
