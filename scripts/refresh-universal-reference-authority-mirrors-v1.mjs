#!/usr/bin/env node

import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
import {deriveUniversalReferencePackagingGate} from "../apps/studio-next/src/lib/a1-universal-reference-authority-v1.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const now = process.env.A1_UNIVERSAL_REFERENCE_REFRESH_AT || new Date().toISOString();

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  const gate = deriveUniversalReferencePackagingGate(current);
  const queued = Number(current.production?.generation?.summary?.queued || 0);
  const running = Number(current.production?.generation?.summary?.running || 0);
  const workerStatus = current.production?.generation?.workerStatus;
  if (gate.status !== "BLOCKED") throw new Error(`universal-reference-gate-not-blocked:${gate.status}`);
  if (queued !== 0 || running !== 0 || workerStatus !== "frozen") throw new Error(`generation-not-frozen:${queued}/${running}/${workerStatus}`);

  const next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  const committed = persistProjectState(appRoot, next, {
    expectedWorkspaceSha256: current.workspaceSha256,
    event: {
      contract: "A1ProductionEvent/v1",
      action: "refresh-universal-reference-authority-mirrors",
      targetId: "UNIVERSAL_REFERENCE_PACKAGING_AUTHORITY",
      createdAt: now,
      payload: {
        contract: "A1UniversalReferencePackagingAuthority/v1",
        status: gate.status,
        generationPerformed: false,
        downstreamStarted: false,
      },
    },
  });
  return {beforeWorkspaceSha256: current.workspaceSha256, afterWorkspaceSha256: committed.workspaceSha256};
});

console.log(JSON.stringify({status: "REFRESHED", ...result}, null, 2));
