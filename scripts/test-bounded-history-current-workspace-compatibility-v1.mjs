#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {assertEditorialAssetWorkbench, recalculateEditorialAssetWorkbench} from "../apps/studio-next/src/lib/a1-editorial-asset-workbench-v1.mjs";
import {buildBoundedHistoryRetentionPlan, rehydrateBoundedHistoryWorkspace} from "../apps/studio-next/src/lib/a1-bounded-history-retention-v1.mjs";
import {readProjectWorkspace} from "../apps/studio-next/src/lib/a1-editorial-project-store-v2.mjs";

const root = path.resolve(import.meta.dirname, "..");
const appRoot = path.join(root, "apps/studio-next");
const source = assertEditorialAssetWorkbench(readProjectWorkspace(appRoot));
const retention = buildBoundedHistoryRetentionPlan(source, {keepRecentFingerprints: 3, maxRecordsPerChunk: 100});
const rehydrated = rehydrateBoundedHistoryWorkspace(retention.compactedWorkspace, retention.plan, retention.chunks);
assert.deepEqual(rehydrated, source);
const candidate = structuredClone(retention.compactedWorkspace);
candidate.workspaceSha256 = null;
candidate.reviewLedger.workspaceSha256 = null;
const recalculatedCandidate = assertEditorialAssetWorkbench(recalculateEditorialAssetWorkbench(candidate, source.updatedAt));
assert.equal(recalculatedCandidate.production.historyArchivePointer.contract, "A1HistoryArchivePointer/v1");
assert.equal(recalculatedCandidate.production.historyArchivePointer.defaultReadAllowed, false);
assert.equal(recalculatedCandidate.production.generation.summary.total, recalculatedCandidate.production.generation.jobs.length);
assert.equal(recalculatedCandidate.production.historyArchivePointer.hotGenerationJobCount, recalculatedCandidate.production.generation.jobs.length);
assert.equal(recalculatedCandidate.production.historyArchivePointer.allTimeGenerationJobCount, source.production.generation.jobs.length);
assert.ok(recalculatedCandidate.production.historyArchivePointer.archivedGenerationJobCount > 0);
assert.equal(
  recalculatedCandidate.production.historyArchivePointer.hotGenerationJobCount + recalculatedCandidate.production.historyArchivePointer.archivedGenerationJobCount,
  recalculatedCandidate.production.historyArchivePointer.allTimeGenerationJobCount,
);
assert.equal(recalculatedCandidate.production.storyboardProductionProjection.storyboardRevisionSha256, source.production.storyboardProductionProjection.storyboardRevisionSha256);
assert.equal(recalculatedCandidate.production.storyboardProductionProjection.counts.tasteBound, 13);
assert.equal(recalculatedCandidate.production.storyboardProductionProjection.counts.temporalPlanPass, 13);
assert.equal(recalculatedCandidate.production.storyboardProductionProjection.gate.userVisualApproval, "NOT_APPROVED");
assert.equal(recalculatedCandidate.production.generation.automaticDispatchAllowed, false);
assert.equal(recalculatedCandidate.production.generation.workerStatus, "frozen");
assert.equal(recalculatedCandidate.gates.motionPrototypeAllowed, false);
assert.equal(recalculatedCandidate.gates.finalRenderAllowed, false);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1BoundedHistoryCurrentWorkspaceCompatibility/v1",
  sourceWorkspaceSha256: source.workspaceSha256,
  candidateWorkspaceSha256: recalculatedCandidate.workspaceSha256,
  sourcePersistedBytes: retention.plan.totals.sourceWorkspacePersistedBytes,
  projectedPersistedBytes: retention.plan.totals.projectedCompactedWorkspacePersistedBytes,
  projectedReductionRatio: retention.plan.totals.projectedWorkspaceReductionRatio,
  hotJobs: recalculatedCandidate.production.generation.summary.total,
  archivedJobs: recalculatedCandidate.production.historyArchivePointer.archivedGenerationJobCount,
  allTimeJobs: recalculatedCandidate.production.historyArchivePointer.allTimeGenerationJobCount,
  storyboardRevisionPreserved: true,
  tasteBound: 13,
  temporalPlanPass: 13,
  userVisualApproval: recalculatedCandidate.production.storyboardProductionProjection.gate.userVisualApproval,
  filesWritten: 0,
}, null, 2));
