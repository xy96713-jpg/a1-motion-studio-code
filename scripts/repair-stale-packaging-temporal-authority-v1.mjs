#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {buildPackagingTemporalReadabilityAuthority} from "../apps/studio-next/src/lib/a1-packaging-temporal-readability-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const now = new Date().toISOString();

const rawBefore = readProjectWorkspace(appRoot);
if (!rawBefore?.workspaceSha256) throw new Error("stale-temporal-repair-workspace-missing");
if (rawBefore.production?.generation?.workerStatus !== "frozen"
  || rawBefore.production?.generation?.summary?.queued !== 0
  || rawBefore.production?.generation?.summary?.running !== 0) throw new Error("stale-temporal-repair-requires-frozen-idle-runtime");
if ((rawBefore.production?.shotIntelligence?.currentAssembly || []).length !== 0) throw new Error("stale-temporal-repair-requires-empty-assembly");

const result = withProjectLock(appRoot, () => {
  const current = readProjectWorkspace(appRoot);
  if (current.workspaceSha256 !== rawBefore.workspaceSha256) throw new Error("stale-temporal-repair-workspace-cas-mismatch");
  const next = structuredClone(current);
  next.production.packagingTemporalReadabilityAuthority = buildPackagingTemporalReadabilityAuthority(next, {now});
  next.production.generation.automaticDispatchAllowed = false;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.summary.queued = 0;
  next.production.generation.summary.running = 0;
  const event = createProductionEvent({
    workspace: next,
    action: "repair-stale-packaging-temporal-authority",
    targetId: next.production.packagingTemporalReadabilityAuthority.authoritySha256,
    payload: {
      canonicalSequenceSha256: next.production.canonicalCreatorPackagingSequence.sequenceSha256,
      authoritySha256: next.production.packagingTemporalReadabilityAuthority.authoritySha256,
      generationPerformed: false,
      assemblyCreated: false,
      userVisualApproval: "NOT_APPROVED",
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "current-storyboard-production-v1/packaging-temporal-readability-authority.json": recalculated.production.packagingTemporalReadabilityAuthority,
    },
  });
  return recalculated;
});

console.log(JSON.stringify({
  status: "STALE_PACKAGING_TEMPORAL_AUTHORITY_REPAIRED",
  workspaceSha256Before: rawBefore.workspaceSha256,
  workspaceSha256After: result.workspaceSha256,
  canonicalSequenceSha256: result.production.canonicalCreatorPackagingSequence.sequenceSha256,
  authoritySha256: result.production.packagingTemporalReadabilityAuthority.authoritySha256,
  bindingStatus: result.production.creatorPaletteShotBindingManifest.status,
  userVisualApproval: "NOT_APPROVED",
  assemblyCount: result.production.shotIntelligence.currentAssembly.length,
}, null, 2));
