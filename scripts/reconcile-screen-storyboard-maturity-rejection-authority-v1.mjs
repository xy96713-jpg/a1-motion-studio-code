#!/usr/bin/env node

import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || ""))) throw new Error("screen-wave-rejection-reconcile-cas-required");
const saved = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expected) throw new Error(`screen-wave-rejection-reconcile-cas:${current.workspaceSha256}`);
  const wave = current.production?.shotIntelligence?.currentStoryboardAuthority?.screenStoryboardWave;
  if (wave?.status !== "USER_REJECTED_SYSTEM_GRAMMAR" || wave?.maturityRejection?.status !== "USER_REJECTED_SYSTEM_GRAMMAR") throw new Error("screen-wave-maturity-rejection-required");
  const now = new Date().toISOString();
  let next = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(structuredClone(current), now));
  if (next.production.authority?.nextAction?.id !== "rebuild-screen-storyboard-semantic-families") throw new Error(`screen-wave-rejection-next-action-invalid:${next.production.authority?.nextAction?.id}`);
  const event = createProductionEvent({workspace: current, action: "reconcile-screen-storyboard-maturity-rejection-authority", targetId: wave.maturityRejection.decisionSha256, payload: {nextAction: next.production.authority.nextAction}, now});
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  const committed = persistProjectState(appRoot, next, {event, expectedWorkspaceSha256: current.workspaceSha256});
  return {workspaceSha256: committed.workspaceSha256, nextAction: next.production.authority.nextAction};
});
console.log(JSON.stringify({status: "PASS", nextAction: saved.nextAction, workspaceSha256After: saved.workspaceSha256}, null, 2));
