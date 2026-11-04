#!/usr/bin/env node
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {reviewArticlePackagingKit} from "../apps/studio-next/src/lib/a1-article-packaging-kit-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(repoRoot, "apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  let next = structuredClone(current);
  const movedTypographyMaterialIds = [];
  for (const asset of next.library.assets) {
    if (asset.stageId !== "source-materials" || asset.typographyMaterial?.contract !== "A1TypographyMaterialBinding/v1") continue;
    asset.stageId = "typography-board";
    asset.requiredForShotComposition = false;
    asset.outputPolicy = "creative-typography-material-only; editable-text-remains-authoritative; never-source-evidence";
    movedTypographyMaterialIds.push(asset.id);
  }

  next = recalculateEditorialAssetWorkbench(next, now);
  const bindings = next.production.articlePackagingKit?.bindingSummary;
  if (!bindings?.exactBindingComplete) throw new Error(`shot-layer-binding-migration-incomplete:${bindings?.exactBoundRequirementCount || 0}/${bindings?.requirementCount || 0}`);
  next = reviewArticlePackagingKit(
    next,
    "approved",
    "系统完成五层精确绑定迁移。此次只重构文字、背景、元素、配图与真实素材的生产合同，不改变已审核资产像素。",
    now,
    "system-visual-critic",
  );
  next = recalculateEditorialAssetWorkbench(next, now);
  const validated = assertEditorialAssetWorkbench(next);
  const event = createProductionEvent({
    workspace: current,
    action: "shot-layer-bindings-migrated",
    targetId: validated.production.articlePackagingKit.kitSha256,
    payload: {
      contract: "A1ShotAssetLayerPlan/v1",
      completeShotCount: validated.production.articlePackagingKit.bindingSummary.completeShotCount,
      exactBoundSlotCount: validated.production.articlePackagingKit.bindingSummary.exactBoundSlotCount,
      exactBoundRequirementCount: validated.production.articlePackagingKit.bindingSummary.exactBoundRequirementCount,
      movedTypographyMaterialIds,
      generatedNewImages: false,
    },
    now,
  });
  validated.production.eventLedger.eventCount += 1;
  validated.production.eventLedger.lastEventId = event.eventId;
  validated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, validated, {
    event,
    files: {
      "shot-layer-binding-migration-v1.json": {
        contract: "A1ShotLayerBindingMigration/v1",
        workspaceSha256: validated.workspaceSha256,
        packagingKitSha256: validated.production.articlePackagingKit.kitSha256,
        bindingSummary: validated.production.articlePackagingKit.bindingSummary,
        movedTypographyMaterialIds,
        migratedAt: now,
      },
    },
  });
  console.log(JSON.stringify({
    status: "PASS",
    workspaceSha256: validated.workspaceSha256,
    packagingKitSha256: validated.production.articlePackagingKit.kitSha256,
    bindingSummary: validated.production.articlePackagingKit.bindingSummary,
    movedTypographyMaterialIds,
  }, null, 2));
});
