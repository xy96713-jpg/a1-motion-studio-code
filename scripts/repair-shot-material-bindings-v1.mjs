#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();
const bindings = {
  "ED-08": {
    requiredMaterialIds: ["source-presenter-continuous-video"],
    candidateAssetIds: ["source-presenter-continuous-video", "source-presenter-opening-frame"],
    note: "Rebound the missing shot-specific label to the approved continuous presenter source and its ED-08 frame; no synthetic presenter fallback is introduced.",
  },
  "ED-09": {
    requiredMaterialIds: ["source-documentary-document-surface", "bg-warm-paper-dot", "atlas-editor-marks", "atlas-print-fragments"],
    candidateAssetIds: ["source-documentary-document-surface", "bg-warm-paper-dot", "atlas-editor-marks", "atlas-print-fragments"],
    note: "Rebound stale manuscript/paper/mark labels to the approved document surface, paper field, editor marks and print fragments already assigned to ED-09.",
  },
  "ED-10": {
    requiredMaterialIds: ["type-pixel-correction", "article-element-pencil-circle"],
    candidateAssetIds: ["type-pixel-correction", "article-element-pencil-circle"],
    note: "Rebound stale typeface/correction-mark labels to the approved pixel font and pencil-circle actor; the generated master remains a reference with an editable shadow.",
  },
};

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const next = ensureProductionState(current, now);
  const updated = [];
  for (const [shotId, binding] of Object.entries(bindings)) {
    const shotAsset = next.library.assets.find((asset) => asset.route === "shot-composition" && asset.shotDemand?.shotId === shotId);
    if (!shotAsset) throw new Error(`shot-material-binding-shot-missing:${shotId}`);
    const missing = binding.requiredMaterialIds.filter((assetId) => {
      const asset = next.library.assets.find((candidate) => candidate.id === assetId);
      return !asset || asset.review?.status !== "approved" || !asset.assetUri;
    });
    if (missing.length) throw new Error(`shot-material-binding-assets-not-approved:${shotId}:${missing.join(",")}`);
    shotAsset.shotDemand.requiredMaterialIds = binding.requiredMaterialIds;
    shotAsset.shotDemand.materialGate = "READY";
    shotAsset.shotDemand.missingMaterialIds = [];
    shotAsset.shotDemand.materialBindingRepair = {
      contract: "A1ShotMaterialBindingRepair/v1",
      repairedAt: now,
      source: "approved-existing-asset-reconciliation",
      note: binding.note,
    };
    const graphDemand = next.assetRequirementGraph.shotDemands.find((demand) => demand.shotId === shotId);
    if (graphDemand) {
      graphDemand.requiredMaterialIds = binding.requiredMaterialIds;
      graphDemand.candidateAssetIds = binding.candidateAssetIds;
      graphDemand.materialGate = "READY";
      graphDemand.bindingRepair = shotAsset.shotDemand.materialBindingRepair;
    }
    updated.push({shotId, requiredMaterialIds: binding.requiredMaterialIds, candidateAssetIds: binding.candidateAssetIds});
  }
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const event = createProductionEvent({
    workspace: current,
    action: "shot-material-bindings-reconciled",
    targetId: "ED-08,ED-09,ED-10",
    payload: {updated},
    now,
  });
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    files: {
      "shot-material-binding-repair-v1.json": {
        contract: "A1ShotMaterialBindingRepair/v1",
        repairedAt: now,
        updated,
        workspaceSha256: recalculated.workspaceSha256,
      },
    },
  });
  console.log(JSON.stringify({status: "REPAIRED", repairedAt: now, updated, workspaceSha256: recalculated.workspaceSha256}, null, 2));
});
