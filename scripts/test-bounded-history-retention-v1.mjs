#!/usr/bin/env node
import assert from "node:assert/strict";
import {buildBoundedHistoryRetentionPlan, queryBoundedHistoryCollection, rehydrateBoundedHistoryWorkspace} from "../apps/studio-next/src/lib/a1-bounded-history-retention-v1.mjs";

const job = (id, status, createdAt, extra = {}) => ({
  contract: "A1AssetGenerationJob/v2",
  id: `${id}-${status}-${createdAt}`,
  generationInputHash: id.repeat(64).slice(0, 64),
  assetId: `asset-${id}`,
  status,
  createdAt,
  ...extra,
});
const revision = (id, status, archivedAt, extra = {}) => ({
  contract: "A1RejectedShotCandidateRound/v1",
  shotId: "ED-01",
  status,
  reportSha256: id.repeat(64).slice(0, 64),
  archivedAt,
  ...extra,
});

const fixture = {
  contract: "A1EditorialAssetWorkbench/v2",
  workspaceSha256: "f".repeat(64),
  production: {
    generation: {
      jobs: [
        job("a", "complete", "2026-01-01T00:00:00.000Z", {output: {sha256: "1".repeat(64)}}),
        job("a", "cancelled", "2026-01-02T00:00:00.000Z"),
        job("b", "failed", "2026-01-01T00:00:00.000Z"),
        job("b", "queued", "2026-01-03T00:00:00.000Z"),
      ],
    },
    packagingStyleBriefHistory: [],
    shotIntelligence: {
      lookMasterRawReferences: [],
      packageLookMasterPlanHistory: [],
      packageAssetKitPlanHistory: [],
      packageAssemblyRecipeHistory: [],
      researchPacketHistory: [],
      videoPackagingContextHistory: [],
      wholeFilmStaticBoardHistory: [],
      wholeFilmStaticBoardDecisionHistory: [],
    },
  },
  library: {
    assets: [{
      id: "composition-ED-01",
      revisionHistory: [
        revision("1", "HISTORY_READ_ONLY", "2026-01-01T00:00:00.000Z"),
        revision("2", "VISUAL_REJECTED", "2026-01-02T00:00:00.000Z"),
        revision("3", "HISTORY_READ_ONLY", "2026-01-03T00:00:00.000Z"),
        revision("4", "USER_VISUAL_APPROVED", "2026-01-04T00:00:00.000Z", {userVisualApproval: "APPROVED"}),
        revision("5", "HISTORY_READ_ONLY", "2026-01-05T00:00:00.000Z"),
        revision("6", "VISUAL_REJECTED", "2026-01-06T00:00:00.000Z"),
        revision("7", "HISTORY_READ_ONLY", "2026-01-07T00:00:00.000Z"),
      ],
    }],
  },
};

const result = buildBoundedHistoryRetentionPlan(fixture, {keepRecentFingerprints: 3, maxRecordsPerChunk: 2});
assert.equal(result.plan.contract, "A1BoundedHistoryRetentionPlan/v1");
assert.equal(result.plan.status, "DRY_RUN_PASS_NO_MUTATION");
assert.equal(result.verification.exactJsonRoundTrip, true);
assert.equal(result.verification.allCollectionsResolvable, true);
assert.equal(result.plan.mutations.workspaceWritten, false);
assert.equal(result.plan.mutations.filesDeleted, 0);
assert.ok(result.plan.totals.coldRecordCount > 0);
assert.ok(result.plan.totals.projectedWorkspaceByteReduction > 0);
const jobPlan = result.plan.collections.find((collection) => collection.id === "production/generation/jobs");
assert.ok(jobPlan);
assert.deepEqual(jobPlan.hotSourceIndexes, [0, 1, 2, 3], "latest terminal, latest successful and active job must remain hot");
const revisionPlan = result.plan.collections.find((collection) => collection.assetId === "composition-ED-01");
assert.ok(revisionPlan);
assert.ok(revisionPlan.hotSourceIndexes.includes(3), "last user-approved evidence must remain hot");
assert.ok(revisionPlan.hotSourceIndexes.includes(5), "last rejected evidence must remain hot");
assert.deepEqual(revisionPlan.hotSourceIndexes.slice(-3), [4, 5, 6], "three most recent distinct fingerprints must remain hot");
assert.equal(result.compactedWorkspace.production.historyArchivePointer.defaultReadAllowed, false);
assert.equal(result.compactedWorkspace.production.historyArchivePointer.explicitHistoryQueryRequired, true);
assert.equal(
  result.compactedWorkspace.production.historyArchivePointer.hotGenerationJobCount + result.compactedWorkspace.production.historyArchivePointer.archivedGenerationJobCount,
  result.compactedWorkspace.production.historyArchivePointer.allTimeGenerationJobCount,
);
const hotOnly = queryBoundedHistoryCollection({
  compactedWorkspace: result.compactedWorkspace,
  plan: result.plan,
  chunks: [],
  collectionId: revisionPlan.id,
});
assert.equal(hotOnly.scope, "HOT_ONLY");
assert.equal(hotOnly.archiveRead, false);
assert.equal(hotOnly.records.length, revisionPlan.hotCount);
assert.throws(() => queryBoundedHistoryCollection({
  compactedWorkspace: result.compactedWorkspace,
  plan: result.plan,
  chunks: [],
  collectionId: revisionPlan.id,
  includeHistory: true,
}), /bounded-history-chunk-invalid/u);
const fullHistory = queryBoundedHistoryCollection({
  compactedWorkspace: result.compactedWorkspace,
  plan: result.plan,
  chunks: result.chunks,
  collectionId: revisionPlan.id,
  includeHistory: true,
});
assert.equal(fullHistory.scope, "HOT_PLUS_HISTORY");
assert.equal(fullHistory.archiveRead, true);
assert.deepEqual(fullHistory.records, fixture.library.assets[0].revisionHistory);
assert.deepEqual(rehydrateBoundedHistoryWorkspace(result.compactedWorkspace, result.plan, result.chunks), fixture);

console.log(JSON.stringify({
  status: "PASS",
  contract: result.plan.contract,
  sourceRecordCount: result.plan.totals.sourceRecordCount,
  hotRecordCount: result.plan.totals.hotRecordCount,
  coldRecordCount: result.plan.totals.coldRecordCount,
  chunkCount: result.chunks.length,
  exactJsonRoundTrip: result.verification.exactJsonRoundTrip,
  defaultArchiveRead: hotOnly.archiveRead,
  explicitHistoryRecordCount: fullHistory.records.length,
  filesDeleted: result.plan.mutations.filesDeleted,
}, null, 2));
