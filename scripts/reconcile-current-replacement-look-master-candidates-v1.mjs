#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("replacement-candidate-reconciliation-expected-sha-required");

const targetIds = new Set([
  "look-master-raw-look-master-ed-07-c01-7fa40281a091",
  "look-master-raw-look-master-ed-07-c02-be0749298658",
  "look-master-raw-look-master-ed-14-c01-aacd5fa8f70e",
  "look-master-raw-look-master-ed-14-c02-cbc5af769c4f",
]);

const result = await withProjectLock(appRoot, async () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`replacement-candidate-reconciliation-sha-precondition-failed:${current.workspaceSha256}`);
  const next = structuredClone(current);
  const rawRefs = next.production.shotIntelligence.lookMasterRawReferences || [];
  const targets = rawRefs.filter((item) => targetIds.has(item.referenceId));
  assert.equal(targets.length, targetIds.size, "replacement-candidate-reconciliation-target-count");
  for (const raw of targets) {
    raw.current = true;
    raw.status = "LOOK_MASTER_RAW";
    raw.reviewStatus = null;
    raw.reviewDeferredTo = "ACTUAL_PIXEL_SEMANTIC_AUDIT";
    raw.recommendationEligible = false;
    raw.selectionEligible = false;
    raw.assemblyEligible = false;
    delete raw.supersededAt;
    delete raw.supersededByArtifactSha256;
  }
  const now = new Date().toISOString();
  const event = createProductionEvent({
    workspace: current,
    action: "reconcile-current-replacement-look-master-candidates",
    targetId: [...targetIds].join(","),
    payload: {
      contract: "A1CurrentReplacementCandidateWaveReconciliation/v1",
      reason: "multi-candidate import must preserve all new candidates for independent gates",
      targetReferenceIds: [...targetIds],
      recommendationEligibleCount: 0,
      assemblyCreated: false,
      downstreamLocked: true,
    },
    now,
  });
  next.production.eventLedger.eventCount += 1;
  next.production.eventLedger.lastEventId = event.eventId;
  next.production.eventLedger.lastEventAt = event.createdAt;
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  for (const id of targetIds) {
    const raw = recalculated.production.shotIntelligence.lookMasterRawReferences.find((item) => item.referenceId === id);
    assert.equal(raw?.current, true, `replacement-candidate-reconciliation-current:${id}`);
    assert.equal(raw?.recommendationEligible, false, `replacement-candidate-reconciliation-eligible:${id}`);
  }
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  const report = {
    contract: "A1CurrentReplacementCandidateWaveReconciliationReport/v1",
    status: "PASS",
    workspaceSha256Before: current.workspaceSha256,
    restoredCurrentReferenceIds: [...targetIds],
    currentCandidateCounts: Object.fromEntries(["ED-07", "ED-14"].map((shotId) => [shotId, recalculated.production.shotIntelligence.lookMasterRawReferences.filter((item) => item.shotId === shotId && item.current === true).length])),
    recommendationEligibleCount: 0,
    queue: recalculated.production.generation.summary,
    workerStatus: recalculated.production.generation.workerStatus,
    assemblyCount: recalculated.production.shotIntelligence.currentAssembly.length,
    downstreamLocked: true,
    generatedAt: now,
  };
  const committed = persistProjectState(appRoot, recalculated, {
    event,
    expectedWorkspaceSha256: current.workspaceSha256,
    commitId: `replacement-candidate-wave-reconciliation-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`,
    files: {"look-master-candidate-wave-reconciliation-v1/latest.json": report},
  });
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, journal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
