#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const report = JSON.parse(fs.readFileSync(path.join(
  root,
  "work/ed20-workflow-explainer-v1/report.json",
), "utf8"));
const sha256 = (file) => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).digest("hex");
const source = path.join(root, report.source.path);
const output = path.join(root, report.output.path);

assert.equal(report.contract, "A1Ed20WorkflowExplainerCandidate/v1");
assert.equal(report.status, "READY_FOR_USER_ROUTE_DECISION");
assert.equal(report.shotId, "ED-20");
assert.equal(report.routeCandidate, "PACKAGE_LOOK_MASTER");
assert.equal(report.semanticAction,
  "整理材料 → 明确约束 → 继续编辑 → 收稿");
assert.equal(sha256(source), report.source.sha256);
assert.equal(sha256(output), report.output.sha256);
assert.equal(report.output.width, 960);
assert.equal(report.output.height, 540);
assert.equal(report.output.fps, "60/1");
assert.ok(report.output.durationMs >= 7900 && report.output.durationMs <= 8050);
assert.equal(report.motion.runtime, "REMOTION");
assert.equal(report.motion.continuousPan, false);
assert.equal(report.motion.motionBlur, false);
assert.equal(report.motion.stageCount, 4);
assert.deepEqual(report.boundaries, {
  currentAuthorityMutated: false,
  routeChanged: false,
  productionAdmission: false,
  userVisualApproval: "NOT_APPROVED",
});

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1Ed20WorkflowExplainerCandidateAudit/v1",
  shotId: report.shotId,
  outputSha256: report.output.sha256,
  durationMs: report.output.durationMs,
  boundary: report.boundaries,
}, null, 2));
