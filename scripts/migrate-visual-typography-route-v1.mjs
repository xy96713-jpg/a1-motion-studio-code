#!/usr/bin/env node

import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent, ensureProductionState} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const before = current.production.visualDirector?.shotBriefs?.filter((brief) => brief.generationDecision === "generated-type-treatment").length || 0;
  const next = ensureProductionState(current, now);
  const after = next.production.visualDirector?.shotBriefs?.filter((brief) => brief.generationDecision === "generated-type-treatment").length || 0;
  if (after < 2) throw new Error(`generated-typography-route-migration-incomplete:${after}`);
  const event = createProductionEvent({workspace: next, action: "visual-typography-generation-route-migrated", payload: {before, after, exactTextShotIds: next.production.visualDirector.shotBriefs.filter((brief) => brief.generationDecision === "generated-type-treatment").map((brief) => brief.shotId)}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculateEditorialAssetWorkbench(next, now), {event});
  console.log(JSON.stringify({status: "VISUAL_TYPOGRAPHY_ROUTE_MIGRATED", before, after, exactTextShotIds: next.production.visualDirector.shotBriefs.filter((brief) => brief.generationDecision === "generated-type-treatment").map((brief) => brief.shotId)}, null, 2));
});
