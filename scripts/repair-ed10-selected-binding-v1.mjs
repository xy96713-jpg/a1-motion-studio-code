#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = process.cwd();
const appRoot = path.join(root, "apps/studio-next");
const now = process.env.A1_ED10_RUN_AT || new Date().toISOString();
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

withProjectLock(appRoot, () => {
  const workspace = readProjectWorkspace(appRoot);
  const runtime = workspace.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-selected-binding-records-required");
  const binding = plan.selectedLookMasterBinding;
  const raw = runtime.lookMasterRawReferences.find((item) => item.shotId === "ED-10"
    && item.candidateDirectionId === binding.directionId
    && item.artifact?.sha256 === binding.artifactSha256
    && item.status !== "SUPERSEDED_BY_STRUCTURAL_REVISION");
  if (!binding || !raw) throw new Error("ed10-selected-binding-raw-reference-missing");
  const source = {
    contract: "A1SelectedLookMasterReconstructionSource/v1",
    directionId: binding.directionId,
    rawReferenceId: raw.referenceId,
    artifactSha256: binding.artifactSha256,
    artifactPublicUrl: binding.artifactPublicUrl,
    comparativeReviewSha256: binding.comparativeReviewSha256,
    selectedMasterSha256: binding.artifactSha256,
    status: "CURRENT",
    boundAt: now,
  };
  const historical = kit.historicalReconstructionAttempts || [];
  const oldAttempt = {
    attemptContract: "A1Ed10BatchRankedAttempt/v1",
    buildKey: "c5a4f707d511",
    selectedDirectionId: "direction-05",
    status: "HISTORY_READ_ONLY",
    reason: "旧重建把 direction-05 横向透明母版错误做成黑底居中卡片；不得复用。",
    supersededAt: now,
  };
  kit.historicalReconstructionAttempts = [...historical.filter((item) => item.buildKey !== oldAttempt.buildKey), oldAttempt];
  kit.selectedLookMasterBinding = structuredClone(binding);
  kit.reconstructionSource = source;
  kit.reconstructionCompilation = {
    contract: "A1SelectedLookMasterReconstructionPlan/v1",
    selectedDirectionId: binding.directionId,
    selectedMasterSha256: binding.artifactSha256,
    comparativeReviewSha256: binding.comparativeReviewSha256,
    map: raw.packagingIntent?.reconstructionMap || {},
    compiledAt: now,
  };
  recipe.selectedLookMasterBinding = structuredClone(binding);
  recipe.reconstructionSource = source;
  recipe.buildKey = sha256({contract: "A1DeterministicPackageAssembly/v1", shotId: "ED-10", planSha256: recipe.planSha256, selectedMasterSha256: binding.artifactSha256, source, layerCandidateIds: recipe.layerCandidateIds});
  recipe.recipeSha256 = sha256({...recipe, recipeSha256: undefined});
  runtime.updatedAt = now;
  workspace.production.shotIntelligence = runtime;
  const recalculated = recalculateEditorialAssetWorkbench(workspace, now);
  persistProjectState(appRoot, recalculated, {event: {
    contract: "A1ProductionEvent/v1",
    id: `repair-ed10-selected-binding-${sha256({now, binding}).slice(0, 16)}`,
    action: "repair-ed10-selected-master-provenance-binding",
    targetId: "ED-10",
    createdAt: now,
    payload: {directionId: binding.directionId, artifactSha256: binding.artifactSha256, comparativeReviewSha256: binding.comparativeReviewSha256, supersededBuildKey: oldAttempt.buildKey},
  }});
  console.log(JSON.stringify({status: "PASS", workspaceSha256: recalculated.workspaceSha256, authority: recalculated.production.authority.nextAction, rootStatus: recalculated.status, directionId: binding.directionId, artifactSha256: binding.artifactSha256, reviewSha256: binding.comparativeReviewSha256, recipeSha256: recipe.recipeSha256}, null, 2));
});
