#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const runner = path.join(root, "scripts/run-system-line-current-v1.mjs");
const run = (...args) => spawnSync(process.execPath, [runner, ...args], {cwd: root, encoding: "utf8", timeout: 5000, maxBuffer: 300000});
const statusStarted = process.hrtime.bigint();
const status = run("status");
const statusElapsedMs = Number(process.hrtime.bigint() - statusStarted) / 1e6;
assert.equal(status.status, 0, status.stderr);
const statusValue = JSON.parse(status.stdout);
assert.equal(statusValue.readMode, "HOT_PATH_ONLY_NO_WORKSPACE_READ_NO_MEDIA_SCAN");
assert.equal(statusValue.observability.overBudget, false);
assert.equal(statusValue.consistency.lifecycleWorkspaceCurrent, true);
assert.equal(statusValue.workSelection.status, "PASS");
assert.equal(statusValue.workSelection.active.scope, "RESEARCH_ONLY");
assert.equal(statusValue.workSelection.parkedProduction.status, "PARKED_PENDING_USER_APPROVAL");
assert.equal(statusValue.workSelection.active.productionAdmission, false);
assert.equal(statusValue.activeResearchProgress.taskId, statusValue.workSelection.active.taskId);
assert.equal(statusValue.activeResearchProgress.status, "REGISTERED_METADATA_ONLY");
assert.equal(statusValue.activeResearchProgress.evidenceBoundary.mediaBytesVerifiedNow, false);
assert.equal(statusValue.activeResearchProgress.evidenceBoundary.dispatchAuthorized, false);
assert.equal(statusValue.activeResearchProgress.counts.shots,
  statusValue.activeResearchProgress.counts.shotsWithLocalStaticPass + statusValue.activeResearchProgress.counts.shotsWithoutLocalStaticPass);
assert.equal(statusValue.observability.mediaScan, false);
assert.equal(statusValue.observability.recursiveScan, false);

const help = run("help");
assert.equal(help.status, 0, help.stderr);
const helpValue = JSON.parse(help.stdout);
assert.equal(helpValue.usage, "npm run system-line -- <command> [--apply]");
assert.equal(helpValue.current.nextAction.id, statusValue.lifecycle.nextAction.id);

const mutationWithoutApply = run("build-static");
assert.notEqual(mutationWithoutApply.status, 0);
assert.match(mutationWithoutApply.stderr, /requires-apply/u);
const mutationWrongLifecycle = run("build-static", "--apply");
assert.notEqual(mutationWrongLifecycle.status, 0);
assert.match(mutationWrongLifecycle.stderr, /lifecycle-blocked/u);
const parkedMutation = run("refresh-review-projections", "--apply");
assert.notEqual(parkedMutation.status, 0);
assert.match(parkedMutation.stderr, /formal-production-parked/u);

const unknown = run("unknown-command");
assert.notEqual(unknown.status, 0);
assert.match(unknown.stderr, /available=/u);

const results = [
  {id: "entry-status-a", status: "PASS", elapsedMs: Number(statusElapsedMs.toFixed(3)), workspaceRead: false, liveServerRequired: false},
  {id: "entry-verify-b", status: "PASS", currentAction: helpValue.current.nextAction.id, actionClassified: helpValue.lifecycleAction.mode},
  {id: "entry-mutation-c", status: "PASS", applyRequired: true, wrongLifecycleBlockedBeforeRuntimePreflight: true},
  {id: "entry-parked-d", status: "PASS", activeWork: statusValue.workSelection.active.taskId, parkedFormalWriteRejected: true},
];
console.log(JSON.stringify({contract: "A1SystemLineOperatorCliTest/v2", status: "PASS", results}, null, 2));
