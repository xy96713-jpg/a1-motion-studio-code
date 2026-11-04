#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const workspacePath = path.join(root, "apps/studio-next/public/generated/system-line/editorial-asset-workbench-v1/workspace.json");
const phasePath = path.join(root, ".codex-artifacts/system-progress-system-line/current-phase.json");
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const before = {workspace: hash(workspacePath), phase: hash(phasePath)};
const run = spawnSync(process.execPath, [path.join(root, "scripts/build-event-settle-screen-wave15-v1.mjs")], {cwd: root, encoding: "utf8"});
assert.equal(run.status, 0, run.stderr || run.stdout);
assert.deepEqual({workspace: hash(workspacePath), phase: hash(phasePath)}, before, "proof builder must not mutate authority");

const plan = JSON.parse(fs.readFileSync(path.join(root, "work/event-settle-screen-wave15-v1/plan.json"), "utf8"));
const props = JSON.parse(fs.readFileSync(path.join(root, plan.propsDraftPath), "utf8"));
const byPolicy = (policy) => plan.items.filter((item) => item.targetPolicy === policy).map((item) => item.shotId);
assert.equal(plan.contract, "A1EventSettleScreenWave15Plan/v1");
assert.equal(plan.status, "READY");
assert.equal(plan.shotCount, 15);
assert.equal(plan.readyCount, 15);
assert.equal(plan.blockedCount, 0);
assert.deepEqual(plan.blockedShotIds, []);
assert.deepEqual(byPolicy("DOM"), ["ED-02", "ED-04", "ED-05", "ED-21", "ED-25", "ED-27", "ED-29"]);
assert.deepEqual(byPolicy("MANUAL"), ["ED-03", "ED-26", "ED-28"]);
assert.deepEqual(byPolicy("FULL_STATE"), ["ED-06", "ED-22", "ED-23", "ED-24", "ED-30"]);
assert.ok(plan.items.filter((item) => item.targetPolicy === "DOM").every((item) => item.status === "READY" && item.resultTargetAdmission.status === "PASS"));
assert.equal(plan.items.find((item) => item.shotId === "ED-02").resultBeat, null);
assert.equal(plan.items.find((item) => item.shotId === "ED-02").resultTargetEvidence.resultMoveOmittedReason, "SHORT_SHOT_PRESERVE_ACTION_COMPOSITION");
assert.ok(plan.items.filter((item) => item.targetPolicy === "MANUAL").every((item) => item.status === "READY" && item.resultTargetAdmission.status === "PASS" && item.resultBeat?.role === "RESULT"));
assert.ok(plan.items.filter((item) => item.targetPolicy === "FULL_STATE").every((item) => item.status === "READY" && item.resultTargetAdmission.status === "NOT_REQUIRED" && item.resultBeat === null && item.propsDraft.finalCompositionRole === "ACTION_HOLD"));
assert.ok(plan.items.filter((item) => item.actionBeat).every((item) => item.actionEvidence.status === "PASS" && ["CAPTURE_EVENT", "CLICK_TELEMETRY", "FULL_STATE_INITIALIZATION"].includes(item.actionEvidence.timingSource)));
assert.equal(plan.items.find((item) => item.shotId === "ED-21").actionEvidence.timingSource, "FULL_STATE_INITIALIZATION");
assert.deepEqual(plan.items.flatMap((item) => item.blockers), []);
assert.equal(JSON.stringify(plan).includes("VERIFIED_PIXEL_DELTA"), false, "pixel delta fallback must stay absent");
assert.deepEqual(plan.boundary, {
  proofOnly: true,
  sourceWaveDisposition: "USER_REJECTED_SYSTEM_GRAMMAR",
  currentAuthorityMutated: false,
  workspaceMutationPerformed: false,
  currentPhaseMutationPerformed: false,
  rendererAdoptionAllowed: false,
  renderAllowed: false,
  renderPerformed: false,
  fullMotionSpecAllowed: false,
  productionAdmission: false,
  userVisualApproval: "NOT_APPROVED",
  pixelDeltaFallbackAllowed: false,
});
assert.equal(props.status, "READY");
assert.equal(props.scenes.length, 15);
assert.equal(props.boundary.proofOnly, true);
assert.equal(props.boundary.renderAllowed, false);
assert.equal(props.boundary.renderPerformed, false);
assert.equal(props.boundary.workspaceMutationPerformed, false);

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1EventSettleScreenWave15Test/v1",
  planStatus: plan.status,
  readyCount: plan.readyCount,
  blockedCount: plan.blockedCount,
  blockedShotIds: plan.blockedShotIds,
  targetPolicyCounts: plan.targetPolicyCounts,
  authorityShaUnchanged: before,
  planSha256: plan.planSha256,
}, null, 2));
