#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const receiptPath = path.join(
  root,
  "work/video-shotcraft-current-review-plan-v1/rejection-receipt.json",
);
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));

assert.equal(receipt.contract, "A1VideoShotcraftRepresentativeRejection/v1");
assert.equal(receipt.status, "REJECTED_SOURCE_BEHAVIOR_FIDELITY");
assert.equal(receipt.boundary.productionAdmission, false);
assert.equal(receipt.boundary.currentStoryboardMutationPerformed, false);
assert.equal(receipt.sourceCanary.auditSha256.length, 64);
assert.ok(receipt.fidelity.failures.includes("FINAL_FRAME_RESEQUENCING_FORBIDDEN"));
assert.ok(receipt.fidelity.failures.includes("SYNTHETIC_PRODUCT_STATE_FORBIDDEN"));
assert.ok(receipt.fidelity.failures.includes("NATIVE_STATE_APPEARANCE_CHANGED"));

console.log(JSON.stringify({
  status: "PASS",
  contract: "A1ShotcraftSourceBehaviorRejectionTest/v1",
  rejection: receipt.status,
  productionAdmission: receipt.boundary.productionAdmission,
}, null, 2));
