#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";

import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {createProductionEvent} from "../apps/studio-next/src/lib/editorial-production/index.mjs";
import {persistProjectState, readProjectWorkspace, withProjectLock} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const expectedWorkspaceSha256 = process.argv[2];
if (!/^[a-f0-9]{64}$/u.test(String(expectedWorkspaceSha256 || ""))) throw new Error("light-check-reconcile-expected-workspace-sha-required");

const result = withProjectLock(appRoot, () => {
  const current = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
  if (current.workspaceSha256 !== expectedWorkspaceSha256) throw new Error(`light-check-reconcile-workspace-sha-precondition-failed:${current.workspaceSha256}`);
  if (current.production.generation.summary.queued !== 0 || current.production.generation.summary.running !== 0 || current.production.generation.workerStatus !== "frozen") throw new Error("light-check-reconcile-requires-frozen-idle-runtime");
  if ((current.production.shotIntelligence.currentAssembly || []).length) throw new Error("light-check-reconcile-assembly-already-created");
  const targetShotIds = current.production.authority.nextAction?.targetShotIds || [];
  if (!targetShotIds.length) throw new Error("light-check-reconcile-targets-missing");
  const now = new Date().toISOString();
  const next = structuredClone(current);
  const updates = [];
  for (const shotId of targetShotIds) {
    const plan = next.production.shotIntelligence.packageLookMasterPlans.find((item) => item.shotId === shotId);
    const raw = [...next.production.shotIntelligence.lookMasterRawReferences].reverse().find((item) => item.shotId === shotId && item.planSha256 === plan?.planSha256 && item.current === true && item.semanticPixelAudit?.status === "PASS" && item.recommendationEligible === true);
    if (!plan || !raw) throw new Error(`light-check-reconcile-current-pass-raw-missing:${shotId}`);
    const lightChecks = {
      ...(raw.lightChecks || {}),
      decode: raw.artifact?.width >= 640 && raw.artifact?.height >= 360 ? "PASS" : "FAIL",
      dimensions: raw.artifact?.width >= 640 && raw.artifact?.height >= 360 ? "PASS" : "FAIL",
      baseFrameComposite: raw.pixelAudit?.footageCompatibility?.status === "PASS" ? "PASS" : "FAIL",
      subjectOcclusion: raw.pixelAudit?.footageCompatibility?.subjectOcclusion?.status || "UNVERIFIED",
      ocrExact: raw.semanticPixelAudit?.checks?.ocrExactCopyAligned === true ? "PASS" : "FAIL",
      remoteCritic: "SKIPPED_BY_BOUNDED_REPAIR",
    };
    if (lightChecks.decode !== "PASS" || lightChecks.dimensions !== "PASS" || lightChecks.baseFrameComposite !== "PASS" || lightChecks.ocrExact !== "PASS") throw new Error(`light-check-reconcile-pass-invariant-failed:${shotId}`);
    raw.lightChecks = lightChecks;
    updates.push({shotId, referenceId: raw.referenceId, artifactSha256: raw.artifact.sha256, lightChecks});
  }
  next.production.generation.workerStatus = "frozen";
  next.production.generation.automaticDispatchAllowed = false;
  next.policy = {...next.policy, automaticDispatchAllowed: false, queuedJobCount: 0};
  const recalculated = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(next, now));
  assert.equal(recalculated.production.shotIntelligence.currentAssembly.length, 0);
  const commitId = `look-master-light-check-reconcile-${now.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
  const event = createProductionEvent({workspace: current, action: "reconcile-current-look-master-light-checks", targetId: targetShotIds.join(","), payload: {contract: "A1CurrentLookMasterLightCheckReconciliation/v1", updates, actualPixelAuditRerun: false, ocrRerun: false, visualReviewRerun: false, assemblyCreated: false}, now});
  recalculated.production.eventLedger.eventCount += 1;
  recalculated.production.eventLedger.lastEventId = event.eventId;
  recalculated.production.eventLedger.lastEventAt = event.createdAt;
  const report = {contract: "A1CurrentLookMasterLightCheckReconciliationReport/v1", status: "PASS", workspaceSha256Before: current.workspaceSha256, updates, actualPixelAuditRerun: false, ocrRerun: false, visualReviewRerun: false, queue: recalculated.production.generation.summary, workerStatus: recalculated.production.generation.workerStatus, assemblyCount: 0, generatedAt: now};
  const committed = persistProjectState(appRoot, recalculated, {event, expectedWorkspaceSha256: current.workspaceSha256, commitId, files: {"look-master-exception-repair-v2/light-check-reconciliation.json": report}});
  return {...report, workspaceSha256After: committed.workspaceSha256, commitId: committed.commitId, checkpointJournal: committed.journal?.status || "COMMITTED"};
});

console.log(JSON.stringify(result, null, 2));
