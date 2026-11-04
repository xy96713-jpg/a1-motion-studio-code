#!/usr/bin/env node

import assert from "node:assert/strict";

const baseUrl = process.argv[2] || "http://127.0.0.1:4311";
const response = await fetch(`${baseUrl}/api/system-line/editorial-asset-workbench`, {
  headers: {accept: "application/json"},
});
assert.equal(response.ok, true, `editorial-workbench-api-http-${response.status}`);

const payload = await response.json();
assert.equal(payload.ok, true);

const workspace = payload.workspace;
const report = payload.report;
const canary = workspace.production.shotIntelligence.threeShotLayerCanary;
const workspaceAction = workspace.production.authority.nextAction;
const reportAction = report.nextAction;
const expectedActionId = "MOTION_SAFE_CANARY_BLOCKED_METHOD_BUDGET_EXHAUSTED";

assert.equal(workspace.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
assert.equal(canary.status, "THREE_SHOT_LAYER_CANARY_BLOCKED");
assert.equal(canary.passCount, 0);
assert.equal(canary.failureCount, 3);
assert.ok(canary.failureCodes.includes("MOTION_EXPOSURE_GHOST_CONTAMINATION"));
assert.ok(canary.failureCodes.includes("MASKED_EDIT_CLEAN_PLATE_COMPOSITE_BOUNDARY_FAILURE"));

for (const action of [workspaceAction, reportAction]) {
  assert.equal(action.id, expectedActionId);
  assert.equal(action.requiresUser, true);
  assert.equal(action.reviewGate, "DELEGATED_OBJECTIVE_VISUAL_GATE");
  assert.deepEqual(action.targetShotIds, ["ED-08", "ED-14", "ED-31"]);
}

assert.equal(workspace.production.generation.summary.queued, 0);
assert.equal(workspace.production.generation.summary.running, 0);
assert.equal(workspace.production.generation.workerStatus, "frozen");
assert.equal(workspace.gates.motionPrototypeAllowed, false);

console.log(JSON.stringify({
  status: "PASS",
  workspaceSha256: workspace.workspaceSha256,
  canaryStatus: canary.status,
  nextAction: workspaceAction,
  queue: {
    queued: workspace.production.generation.summary.queued,
    running: workspace.production.generation.summary.running,
    workerStatus: workspace.production.generation.workerStatus,
  },
  motionPrototypeAllowed: workspace.gates.motionPrototypeAllowed,
}, null, 2));
