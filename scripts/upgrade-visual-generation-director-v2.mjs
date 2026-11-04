#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {assertVisualGenerationDirector, ensureVisualGenerationDirector} from "../apps/studio-next/src/lib/a1-visual-generation-director-v2.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const now = new Date().toISOString();
  const next = structuredClone(current);
  ensureVisualGenerationDirector(next, now);
  const director = assertVisualGenerationDirector(next.production.visualDirector, next);
  const event = createProductionEvent({
    workspace: current,
    action: "upgrade-visual-generation-director-v2",
    targetId: director.projectId,
    payload: {
      contract: director.contract,
      treatmentPackCount: director.treatmentLibrary.length,
      shotBriefCount: director.shotBriefs.length,
      creativeReviewCount: director.creativeReviews.reviewCount,
      destructiveMigration: false,
    },
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = recalculateEditorialAssetWorkbench(next, now);
  const report = {
    contract: "A1VisualGenerationDirectorUpgradeReport/v1",
    status: "PASS",
    workspaceContract: recalculated.contract,
    directorContract: director.contract,
    treatmentPackCount: director.treatmentLibrary.length,
    rankedTreatmentCount: director.rankedTreatmentIds.length,
    treatmentAnchorBriefCount: director.treatmentDirections.flatMap((direction) => direction.anchorBriefs).length,
    shotBriefCount: director.shotBriefs.length,
    creativeReviewCount: director.creativeReviews.reviewCount,
    provider: director.providers.automatic.id,
    legacyWorkspaceCompatible: true,
    destructiveMigration: false,
    upgradedAt: now,
  };
  persistProjectState(appRoot, recalculated, {event, files: {"visual-generation-director-v2/upgrade-report.json": report}});
  return {...report, workspaceSha256: recalculated.workspaceSha256};
});

console.log(JSON.stringify(result, null, 2));
