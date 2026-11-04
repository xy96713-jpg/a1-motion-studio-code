#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(root, "apps/studio-next");
const canonicalScope = ["ED-07", "ED-08", "ED-13", "ED-19"];
let targetIds = [];
const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const runtime = current.production.shotIntelligence;
  const authority = runtime.canonicalDirectorAuthority;
  const manifest = runtime.canonicalDirectorTargetRepairManifest;
  targetIds = [...(manifest?.generationEligibleShotIds || [])];
  if (authority?.status !== "PASS" || manifest?.authoritySha256 !== authority.authoritySha256 || !targetIds.length || targetIds.some((shotId) => !canonicalScope.includes(shotId))) throw new Error("canonical-title-repair-dispatch-gate-invalid");
  if (current.production.generation.summary.queued || current.production.generation.summary.running) throw new Error("canonical-title-repair-dispatch-queue-not-idle");
  const next = structuredClone(current);
  next.production.generation.automaticDispatchAllowed = true;
  next.production.generation.workerStatus = "frozen";
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next));
  const event = createProductionEvent({workspace: current, action: "canonical-title-repair-dispatch-enabled", targetId: targetIds.join(","), payload: {authoritySha256: authority.authoritySha256, manifestSha256: manifest.manifestSha256, targetShotIds: targetIds, queueEmpty: true}});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    files: {
      "semantic-authority-convergence-v1/dispatch-preflight.json": {
        contract: "A1CanonicalTitleRepairDispatchPreflight/v1",
        status: "PASS",
        authoritySha256: authority.authoritySha256,
        manifestSha256: manifest.manifestSha256,
        sourceRevisionHash: manifest.sourceRevisionHash,
        targetShotIds: targetIds,
        generationAllowed: true,
        queue: {queued: 0, running: 0},
        workerStatus: "frozen",
      },
    },
  });
  return recalculated;
});
console.log(JSON.stringify({
  status: "PASS",
  checkpoint: "CANONICAL_TITLE_REPAIR_PENDING",
  workspaceSha256: result.workspaceSha256,
  targetShotIds: targetIds,
  generationAutomaticDispatchAllowed: result.production.generation.automaticDispatchAllowed,
  queue: result.production.generation.summary,
  workerStatus: result.production.generation.workerStatus,
  assemblyCount: result.production.shotIntelligence.currentAssembly?.length || 0,
  assemblyCreationAllowed: false,
}, null, 2));
