#!/usr/bin/env node
import assert from "node:assert/strict";
import {buildCurrentStateRetentionPlan, rehydrateCurrentStateWorkspace} from "../apps/studio-next/src/lib/a1-current-state-store-v2.mjs";

const fixtureDefs = [
  {id: "store-research-a", projectId: "research"},
  {id: "store-tutorial-b", projectId: "tutorial"},
  {id: "store-opinion-c", projectId: "opinion"},
];
const results = fixtureDefs.map((fixture) => {
  const records = Array.from({length: 3}, (_, shot) => Array.from({length: 4}, (_, revision) => ({shotId: `${fixture.projectId}-${shot}`, revision, current: revision === 3, payload: `${fixture.id}-${revision}`}))).flat();
  const workspace = {workspaceSha256: "a".repeat(64), production: {project: {projectId: fixture.projectId}, shotIntelligence: {packageAssetKitPlans: records, packageAssemblyRecipes: structuredClone(records), packageLookMasterPlans: structuredClone(records)}}};
  const retention = buildCurrentStateRetentionPlan(workspace);
  assert.equal(retention.plan.archivedRecordCount, 27);
  assert.equal(retention.compactedWorkspace.production.shotIntelligence.packageAssetKitPlans.length, 3);
  assert.deepEqual(rehydrateCurrentStateWorkspace(retention.compactedWorkspace, retention.plan, retention.chunks), workspace);
  return {id: fixture.id, status: "PASS", sourceRecords: 36, hotRecords: 9, archivedRecords: 27, exactRoundTrip: true};
});
console.log(JSON.stringify({contract: "A1CurrentStateStoreTest/v2", status: "PASS", results}, null, 2));
