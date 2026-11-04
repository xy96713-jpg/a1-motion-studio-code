#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {assertPresenterStoryboardActionContract, compilePresenterStoryboardActionContract} from "../apps/studio-next/src/lib/a1-presenter-storyboard-action-contract-v1.mjs";

const appRoot = path.resolve(import.meta.dirname, "../apps/studio-next");
const contract = assertPresenterStoryboardActionContract(compilePresenterStoryboardActionContract({appRoot}));
assert.equal(contract.status, "CANDIDATE_PENDING_USER_APPROVAL");
assert.equal(contract.generationBoundary.legacyFingerprintRoutingAllowed, false);
assert.equal(contract.generationBoundary.legacyProjectionMayDriveGeneration, false);
assert.deepEqual(contract.missingActionShotIds, ["ED-09", "ED-10", "ED-12", "ED-14", "ED-16", "ED-17", "ED-34"]);
assert.equal(contract.generationBoundary.actionContractComplete, false);
for (const shot of contract.shots.filter((item) => item.status !== "ACTION_SPEC_MISSING")) {
  assert(shot.semanticJob);
  assert.equal(shot.actionIsBoundToNarrativeTurn, true);
  assert.deepEqual(Object.keys(shot.states).sort(), ["after", "before", "hold"]);
  assert.equal(shot.persistentPanelAllowed, false);
}
console.log(JSON.stringify({status: "PASS", contract: contract.contract, contractSha256: contract.contractSha256, statusBoundary: contract.status, shotCount: contract.shotCount, legacyFingerprintRoutingAllowed: contract.generationBoundary.legacyFingerprintRoutingAllowed, legacyProjectionMayDriveGeneration: contract.generationBoundary.legacyProjectionMayDriveGeneration}, null, 2));
