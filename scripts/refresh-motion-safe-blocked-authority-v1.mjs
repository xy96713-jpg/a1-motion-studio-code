#!/usr/bin/env node

import assert from "node:assert/strict";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = new URL("..", import.meta.url).pathname;
const appRoot = `${root}apps/studio-next`;
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("motion-safe-blocked-authority-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const before = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  assert.equal(before.workspaceSha256, expectedWorkspaceSha256, `motion-safe-blocked-authority-cas-failed:${before.workspaceSha256}`);
  assert.equal(before.production.shotIntelligence.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
  assert.ok(before.production.shotIntelligence.threeShotLayerCanary.failureCodes.includes("MASKED_EDIT_CLEAN_PLATE_COMPOSITE_BOUNDARY_FAILURE"));
  const now = new Date().toISOString();
  let next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(before), now));
  assert.equal(next.production.authority.nextAction.id, "MOTION_SAFE_CANARY_BLOCKED_METHOD_BUDGET_EXHAUSTED");
  assert.equal(next.production.authority.nextAction.requiresUser, true);
  assert.equal(next.gates.packagingDeliveryGates.layerReconstructionAllowed, false);
  assert.equal(next.production.assembly.status, "NOT_CREATED");
  assert.equal(next.production.motion.status, "NOT_CREATED");
  const event = createProductionEvent({workspace: before, action: "refresh-motion-safe-blocked-authority-v1", targetId: next.production.shotIntelligence.threeShotLayerCanary.manifestSha256, payload: {status: next.production.shotIntelligence.status, nextAction: next.production.authority.nextAction.id, requiresUser: true, layerReconstructionAllowed: false, assemblyCreated: false, motionRun: false}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: before.workspaceSha256, commitId: `refresh-motion-safe-blocked-authority-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`});
  return {workspaceSha256Before: before.workspaceSha256, workspaceSha256After: committed.workspaceSha256, status: next.production.shotIntelligence.status, nextAction: next.production.authority.nextAction, layerReconstructionAllowed: next.gates.packagingDeliveryGates.layerReconstructionAllowed, assemblyStatus: next.production.assembly.status, motionStatus: next.production.motion.status};
});

console.log(JSON.stringify(result, null, 2));
