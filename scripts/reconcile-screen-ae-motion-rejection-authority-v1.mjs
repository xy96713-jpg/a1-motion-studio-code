#!/usr/bin/env node
import path from "node:path";
import {
  assertEditorialAssetWorkbench,
  recalculateEditorialAssetWorkbench,
} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import { createProductionEvent } from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {
  persistProjectState,
  readProjectWorkspace,
  withProjectLock,
} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  appRoot = path.join(root, "apps/studio-next"),
  expected = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expected || "")))
  throw new Error("ae-motion-authority-reconcile-cas-required");
const saved = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expected)
    throw new Error(
      `ae-motion-authority-reconcile-cas:${current.workspaceSha256}`,
    );
  if (
    current.production.shotIntelligence.currentStoryboardAuthority
      .screenStoryboardWave.status !== "USER_REJECTED_AE_MOTION_MATURITY"
  )
    throw new Error("ae-motion-rejection-status-required");
  const now = new Date().toISOString(),
    next = assertEditorialAssetWorkbench(
      recalculateEditorialAssetWorkbench(structuredClone(current), now),
    );
  if (
    next.production.authority.nextAction.id !==
    "rebuild-screen-ae-motion-kernel-v2"
  )
    throw new Error(
      `ae-motion-rejection-authority-not-projected:${next.production.authority.nextAction.id}`,
    );
  const event = createProductionEvent({
    workspace: current,
    action: "reconcile-screen-ae-motion-rejection-authority-v1",
    targetId: next.production.motion.aeMotionRejection.decisionSha256,
    payload: {
      nextAction: next.production.authority.nextAction.id,
      fullMotionAllowed: false,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  return persistProjectState(appRoot, next, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
  });
});
console.log(
  JSON.stringify(
    {
      status: "PASS",
      workspaceSha256After: saved.workspaceSha256,
      nextAction: "rebuild-screen-ae-motion-kernel-v2",
    },
    null,
    2,
  ),
);
