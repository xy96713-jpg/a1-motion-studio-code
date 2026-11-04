#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const criticPath = path.join(root, "scripts/run-shot-candidate-critic-v1.mjs");
const source = fs.readFileSync(criticPath, "utf8");

assert.ok(!source.includes("approveSceneGraphCandidate("), "visual critic must never approve a shot candidate");
assert.ok(source.includes('target.selectedCandidateId = null'), "visual critic must leave the user selection empty");
assert.ok(source.includes('stabilityMedian >= A1_STATIC_SHOT_ADMISSION_SCORE') && source.includes('!report.hardFailures.length'), "visual critic must require stable two-sample reference maturity before user review");
assert.ok(source.includes('&& !report.hardFailures.length'), "visual critic must block hard failures");
assert.ok(source.includes('&& !usedLocalPreflight'), "local preflight must never unlock user review");
assert.ok(source.includes('const userApprovalRequired = passed && workspace.production.automationPolicy?.automaticCandidateAdmission !== true'), "visual critic must only request intermediate approval when automatic candidate admission is disabled");
assert.ok(source.includes('status: "pending"'), "visual critic must leave review status pending");
assert.ok(source.includes("shot-candidate-visual-critic-cleared-for-user-review"), "visual critic must only clear candidates for review");

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ShotCandidateUserApprovalGate/v1",
  criticMayApprove: false,
  userApprovalRequiredOnlyAfterReferenceMaturity: true,
}, null, 2));
