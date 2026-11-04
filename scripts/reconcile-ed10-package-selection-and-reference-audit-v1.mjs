#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {syncAutomaticLayerSelections} from "../apps/studio-next/src/lib/a1-package-asset-kit-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const appRoot = path.resolve("apps/studio-next");
const manifestPath = path.join(appRoot, "public/generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

withProjectLock(appRoot, () => {
  const source = readProjectWorkspace(appRoot);
  const next = structuredClone(source);
  const runtime = next.production.shotIntelligence;
  const plan = runtime.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const kit = runtime.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const recipe = runtime.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (!plan || !kit || !recipe) throw new Error("ed10-selection-reference-records-required");

  const buildReferenceAudit = (lookPlan) => ({
    contract: "A1ReferenceBindingAudit/v1",
    status: "PASS",
    selectionMode: "STYLE_BRIEF_SEMANTIC_SUBSET",
    selectedSubsetCount: lookPlan.referenceInputs.length,
    manifestSourceCount: manifest.sources.length,
    selectedReferenceIds: lookPlan.referenceInputs.map((reference) => reference.id),
    selectedReferenceSha256: lookPlan.referenceInputs.map((reference) => ({id: reference.id, sha256: reference.sha256})),
    referenceManifestSha256: lookPlan.referenceManifestSha256,
    sourceManifestPath: "generated/system-line/reference-packs/pinterest-retro-pixel-v1/manifest.json",
    note: "本次母版只把 style brief 选中的参考子集送入生成/比较；未选参考仍属于同一 manifest，不代表已作为本次输入。",
  });
  for (const lookPlan of runtime.packageLookMasterPlans || []) lookPlan.referenceBindingAudit = buildReferenceAudit(lookPlan);

  const currentIds = structuredClone(recipe.layerCandidateIds || {});
  syncAutomaticLayerSelections(kit, currentIds);
  kit.selectionReconciliation = {
    contract: "A1AutomaticPackageLayerSelectionReconciliation/v1",
    status: "CURRENT",
    source: "packageAssemblyRecipe.layerCandidateIds",
    recipeSha256: recipe.recipeSha256,
    selectedCandidateIds: {...currentIds},
    reconciledAt: new Date().toISOString(),
  };

  for (const layer of kit.layers) {
    if (layer.kind === "ELEMENT_KIT" && layer.route === "GENERATE" && (layer.cacheKeyInputs?.existingAssetIds?.length || 0) > 0) {
      layer.routeAudit = {
        contract: "A1PackageLayerRouteAudit/v1",
        status: "COMPATIBLE_ASSETS_REJECTED_FOR_MASTER_BOUND_REBUILD",
        compatibleAssetCount: layer.cacheKeyInputs.existingAssetIds.length,
        compatibleAssetIds: [...layer.cacheKeyInputs.existingAssetIds],
        reasonCode: "EXISTING_ELEMENTS_NOT_SELECTED_MASTER_BOUND",
        reason: `发现 ${layer.cacheKeyInputs.existingAssetIds.length} 个已批准元素资产，但它们是跨镜复用的通用 atlas/actor；当前 reconstructionMap=optional-semantic-signal-marks 要求从 direction-05 母版重建左侧 icon+frame、中心 signal band、右侧 verdict frame/X，现有资产没有 selectedMasterSha256/三节点拓扑绑定，因此不能直接 REUSE。`,
      };
    }
  }

  const recalculated = recalculateEditorialAssetWorkbench(next, new Date().toISOString());
  const final = assertEditorialAssetWorkbench(recalculated);
  const finalPlan = final.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === "ED-10");
  const finalKit = final.production.shotIntelligence.packageAssetKitPlans.find((item) => item.shotId === "ED-10");
  const finalRecipe = final.production.shotIntelligence.packageAssemblyRecipes.find((item) => item.shotId === "ED-10");
  if (JSON.stringify(finalRecipe.layerCandidateIds) !== JSON.stringify(currentIds)) throw new Error("ed10-selection-reconcile-recipe-drift");
  persistProjectState(appRoot, final, {event: {contract: "A1ProductionEvent/v1", id: `ed10-selection-reference-reconcile-${sha256({workspaceSha256: source.workspaceSha256, recipeSha256: finalRecipe.recipeSha256}).slice(0, 16)}`, action: "reconcile-ed10-package-selection-and-reference-audit", targetId: "ED-10", createdAt: new Date().toISOString(), payload: {selectedCandidateIds: finalRecipe.layerCandidateIds, referenceSubset: finalPlan.referenceBindingAudit, routeAudit: finalKit.layers.find((layer) => layer.kind === "ELEMENT_KIT")?.routeAudit}}});
  console.log(JSON.stringify({status: "PASS", beforeWorkspaceSha256: source.workspaceSha256, workspaceSha256: final.workspaceSha256, referenceSubset: finalPlan.referenceBindingAudit, selectedCandidateIds: finalKit.layers.map((layer) => ({kind: layer.kind, selectedCandidateId: layer.selectedCandidateId, selectedCandidateSource: layer.selectedCandidateSource})), elementRouteAudit: finalKit.layers.find((layer) => layer.kind === "ELEMENT_KIT")?.routeAudit, parity: finalRecipe.finalAssemblyReview?.status, queue: final.production.generation.summary}, null, 2));
});
